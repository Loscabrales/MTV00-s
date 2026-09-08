/**
 * Thin wrapper over the YouTube IFrame API.
 *
 * Hiding YouTube's own interface takes four things working together:
 *  1. the player vars below,
 *  2. the .shield element, which stops the pointer ever reaching the iframe
 *     (the title bar and "Watch on YouTube" button only appear on hover),
 *  3. the CSS overscan, which pushes any residual chrome outside the stage,
 *  4. never leaving the video paused or ended on screen — main.js always
 *     covers those states with our own card.
 */

const API_SRC = 'https://www.youtube.com/iframe_api';

let apiPromise = null;

function loadApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous();
      resolve(window.YT);
    };

    const tag = document.createElement('script');
    tag.src = API_SRC;
    tag.async = true;
    tag.onerror = () => reject(new Error('YouTube IFrame API failed to load'));
    document.head.appendChild(tag);
  });
  return apiPromise;
}

export const PlayerState = {
  UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5,
};

/** Errors that mean "this video will never play here" — skip it for good. */
const FATAL_ERRORS = new Set([2, 5, 100, 101, 150]);

export async function createPlayer(elementId, handlers = {}) {
  const YT = await loadApi();

  const player = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('player never became ready')), 20000);
    const instance = new YT.Player(elementId, {
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: 1,
        controls: 0,        // no scrub bar, no buttons
        disablekb: 1,       // our remote owns the keyboard
        rel: 0,             // no end-of-video grid from other channels
        playsinline: 1,     // iOS must not take over with its native player
        iv_load_policy: 3,  // no annotations
        cc_load_policy: 0,  // do not force captions on; see killCaptions below
        cc_lang_pref: 'none',
        fs: 0,
        modestbranding: 1,  // deprecated, kept as belt-and-braces
        origin: window.location.origin,
      },
      events: {
        onReady: () => { clearTimeout(timer); resolve(instance); },
        onStateChange: (e) => handlers.onStateChange?.(e.data),
        onError: (e) => handlers.onError?.(e.data, FATAL_ERRORS.has(e.data)),
      },
    });
  });

  const safe = (fn) => (...args) => {
    try { return fn(...args); } catch { return undefined; }
  };

  /**
   * cc_load_policy: 0 only means "do not force captions on" — a viewer whose
   * YouTube preference is captions-on still gets them burned over the video,
   * which fights the channel's own lower third. Unloading the caption module
   * is what actually takes them off. The module is named 'captions' on the
   * older player and 'cc' on the newer one, so both are tried, and it is
   * re-applied on every load because a new video reloads the module.
   */
  const killCaptions = () => {
    for (const mod of ['captions', 'cc']) {
      try { player.unloadModule(mod); } catch { /* module not present */ }
    }
    try { player.setOption('captions', 'track', {}); } catch { /* ditto */ }
  };

  return {
    raw: player,
    play: safe((id, startSeconds) => {
      player.loadVideoById({ videoId: id, startSeconds: Math.max(0, Math.floor(startSeconds || 0)) });
      killCaptions();
    }),
    killCaptions,
    resume: safe(() => player.playVideo()),
    seek: safe((s) => player.seekTo(Math.max(0, s), true)),
    pause: safe(() => player.pauseVideo()),
    stop: safe(() => player.stopVideo()),
    setVolume: safe((v) => player.setVolume(Math.max(0, Math.min(100, v)))),
    mute: safe(() => player.mute()),
    unMute: safe(() => player.unMute()),
    getTime: safe(() => player.getCurrentTime() || 0),
    getDuration: safe(() => player.getDuration() || 0),
    getState: safe(() => player.getPlayerState()),
  };
}
