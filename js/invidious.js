/**
 * Ad-free video source: an Invidious instance, embedded as an iframe.
 *
 * Invidious proxies YouTube and serves no advertising, which is the only way
 * to get an ad-free picture while still sourcing from YouTube — the official
 * embed gives no way to suppress ads, and its iframe is cross-origin so the
 * page cannot reach inside it.
 *
 * The trade-off is that this player has no postMessage API. There are no
 * ENDED or error events, and nothing can be changed after load. So:
 *
 *  - the end of a video is driven from the schedule clock, which the channel
 *    already computes, rather than from an event;
 *  - a volume or mute change means reloading the frame, which is why the
 *    reload always carries the position the clock says we should be at;
 *  - a failed instance cannot be detected from here, because a cross-origin
 *    error page is indistinguishable from a working one. Recovery is the
 *    viewer pressing the source key, not an automatic fallback.
 */

// The only public instance found serving embeds: the others are down, have
// embedding disabled, or answer 403/500. Ordered so a future addition is
// tried in turn at boot.
export const INSTANCES = [
  'https://invidious.tiekoetter.com',
];

const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;

export function createInvidiousPlayer(elementId, handlers = {}) {
  const host = document.getElementById(elementId);
  const frame = document.createElement('iframe');
  frame.id = elementId;
  frame.setAttribute('allow', 'autoplay; encrypted-media');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
  host.parentNode.replaceChild(frame, host);

  const base = INSTANCES[0];
  let current = null;      // { id, startedAt, offset, duration }
  let volume = 100;
  let muted = false;
  let endTimer = 0;
  let paused = false;

  const clearEnd = () => { clearTimeout(endTimer); endTimer = 0; };

  /** Where the current video should be right now, by the wall clock. */
  function position() {
    if (!current) return 0;
    if (paused) return current.offset;
    return current.offset + (Date.now() - current.startedAt) / 1000;
  }

  function load(startSeconds) {
    if (!current) return;
    const params = new URLSearchParams({
      autoplay: '1',
      controls: '0',
      subtitles: '',                 // no captions burned over the channel graphics
      quality: 'dash',
      volume: String(muted ? 0 : volume),
      start: String(Math.max(0, Math.floor(startSeconds))),
    });
    frame.src = `${base}/embed/${current.id}?${params}`;

    current.offset = startSeconds;
    current.startedAt = Date.now();

    // no ENDED event exists, so the schedule's own duration ends the slot
    clearEnd();
    const left = Math.max(0, current.duration - startSeconds);
    if (left > 0 && Number.isFinite(left)) {
      endTimer = setTimeout(() => handlers.onStateChange?.(ENDED), left * 1000);
    }
    // nothing reports playback, so report it ourselves once the frame is up
    frame.onload = () => handlers.onStateChange?.(PLAYING);
  }

  return {
    raw: frame,
    isAdFree: true,

    play(id, startSeconds, duration) {
      paused = false;
      current = { id, offset: 0, startedAt: Date.now(), duration: duration || Infinity };
      load(Math.max(0, startSeconds || 0));
    },

    // volume only applies at load time, so changing it reloads at the position
    // the clock says we are at — a beat of buffering, but never a jump
    setVolume(v) {
      const next = Math.max(0, Math.min(100, Math.round(v)));
      if (next === volume) return;
      volume = next;
      if (current && !paused) load(position());
    },
    mute() { if (!muted) { muted = true; if (current && !paused) load(position()); } },
    unMute() { if (muted) { muted = false; if (current && !paused) load(position()); } },

    pause() {
      if (!current || paused) return;
      current.offset = position();
      paused = true;
      clearEnd();
      frame.src = 'about:blank';     // the only way to stop it without an API
      handlers.onStateChange?.(PAUSED);
    },
    resume() { if (current && paused) { paused = false; load(current.offset); } },
    stop() { clearEnd(); current = null; frame.src = 'about:blank'; },

    seek(s) { if (current) load(Math.max(0, s)); },
    killCaptions() { /* the subtitles parameter already handles it at load */ },

    getTime: () => position(),
    getDuration: () => (current ? current.duration : 0),
    getState: () => (!current ? -1 : paused ? PAUSED : PLAYING),
  };
}
