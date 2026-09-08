/**
 * MTV 00s — channel controller.
 *
 * The wall clock is the master: what is on air is derived from the time of day,
 * not from where this browser happens to be in a list. Skips and unplayable
 * videos are allowed to drift off the grid, and the channel snaps back to live
 * the moment the current video ends.
 */

import { loadPlaylist } from './playlist.js';
import { createSchedule, nowSeconds } from './schedule.js';
import { createPlayer, PlayerState } from './player.js';
import { createInvidiousPlayer } from './invidious.js';
import { createGraphics } from './graphics.js';
import { createRemote } from './remote.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const STORE = { volume: 'mtv00s.volume', muted: 'mtv00s.muted', source: 'mtv00s.source' };
const WATCHDOG_MS = 9000;
const DRIFT_TOLERANCE = 5; // seconds

const read = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
};

async function boot() {
  const graphics = createGraphics();
  const status = $('boot-status');

  let playlist;
  try {
    playlist = await loadPlaylist();
  } catch (err) {
    status.textContent = 'NO SIGNAL — PLAYLIST UNAVAILABLE';
    console.error(err);
    return;
  }

  const schedule = createSchedule(playlist.items);
  status.textContent = `${playlist.items.length} VIDEOS · READY`;

  // ---------------------------------------------------------------- state
  let player = null;
  // 'adfree' plays through Invidious, which serves no advertising; 'youtube'
  // is the official embed, which carries ads but has a real API and does not
  // depend on a volunteer-run instance.
  //
  // YouTube is the default because the ad-free path is not dependable: the
  // only public instance still serving embeds fails roughly half its requests
  // with "Companion is starting, please wait until a valid potoken is found"
  // — YouTube now demands a proof-of-origin token the instance has to keep
  // minting. Ad-free is therefore opt-in, and ?source= or the S key switches.
  const forced = new URLSearchParams(location.search).get('source');
  let source = forced === 'youtube' || forced === 'adfree'
    ? forced
    : (read(STORE.source, 'youtube') === 'adfree' ? 'adfree' : 'youtube');
  let volume = Math.max(0, Math.min(100, Number(read(STORE.volume, 80)) || 80));
  let muted = Boolean(read(STORE.muted, false));
  let currentIndex = 0;
  let drifting = false;      // true after a skip or a dead video
  let airToken = 0;          // cancels in-flight bumper sequences
  let watchdog = 0;
  let sawPlaying = false;
  let paused = false;
  const dead = new Set();    // ids that errored — never tried again this session

  const remote = createRemote({ schedule, actions: {
    power: powerOff,
    toggleMute,
    togglePause,
    skip,
    setVolume,
    nudgeVolume: (d) => setVolume(volume + d),
    switchSource,
  }});

  remote.paintVolume(volume, muted);
  remote.paintSource(source);

  /**
   * Swapping the video source swaps the whole player, so the cleanest change
   * is a reload: the schedule is derived from the clock, so the channel comes
   * back on the same video at the same second.
   */
  function switchSource() {
    source = adFree() ? 'youtube' : 'adfree';
    write(STORE.source, source);
    remote.paintSource(source);
    location.reload();
  }

  // ---------------------------------------------------------------- audio
  function applyAudio() {
    if (!player) return;
    player.setVolume(volume);
    if (muted) player.mute(); else player.unMute();
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(100, Math.round(v)));
    if (volume > 0 && muted) muted = false;
    write(STORE.volume, volume);
    write(STORE.muted, muted);
    remote.paintVolume(volume, muted);
    applyAudio();
  }

  function toggleMute() {
    muted = !muted;
    write(STORE.muted, muted);
    remote.paintVolume(volume, muted);
    applyAudio();
  }

  // ---------------------------------------------------------------- airing
  function livingIndexFrom(index) {
    for (let step = 1; step <= schedule.length; step++) {
      const candidate = index + step;
      if (!dead.has(schedule.itemAt(candidate).id)) return candidate;
    }
    return index + 1; // everything is dead; let the watchdog keep cycling
  }

  function armWatchdog() {
    clearTimeout(watchdog);
    sawPlaying = false;
    watchdog = setTimeout(() => {
      if (sawPlaying || paused) return;
      const item = schedule.itemAt(currentIndex);
      console.warn('watchdog: no playback, dropping', item.id, item.artist, item.title);
      dead.add(item.id);
      airIndex(livingIndexFrom(currentIndex));
    }, WATCHDOG_MS);
  }

  const adFree = () => source === 'adfree';

  function startVideo(item, offset) {
    player.play(item.id, offset, item.duration);
  }

  function trackGraphics(slot) {
    graphics.startTrack({
      item: slot.item,
      next: schedule.next(slot.index, 1)[0],
      remaining: slot.remaining,
    });
  }

  /** Put on whatever the clock says is on air right now. */
  async function airLive() {
    const slot = schedule.slotAt();

    if (dead.has(slot.item.id)) {
      airIndex(livingIndexFrom(slot.index));
      return;
    }

    const token = ++airToken;
    drifting = false;
    currentIndex = slot.index;

    if (slot.inBumper) {
      // The video loads behind the bumper card, silently, so that it is warm
      // and buffered by the time the card lifts.
      graphics.showBumper({
        kicker: 'COMING UP',
        title: `${slot.item.artist} — ${slot.item.title}`,
        ms: slot.bumperLeft * 1000,
      });
      // The YouTube player can buffer silently behind the card. Invidious
      // cannot be muted after load, so there it simply starts when the card
      // lifts rather than playing its opening bars underneath.
      if (!adFree()) {
        player.mute();
        startVideo(slot.item, 0);
        armWatchdog();
      }
      await wait(slot.bumperLeft * 1000);
      if (token !== airToken) return;
      if (adFree()) { startVideo(slot.item, 0); armWatchdog(); }
      else player.seek(0);
      graphics.hideBumper();
      applyAudio();
      trackGraphics({ ...slot, remaining: slot.item.duration });
    } else {
      graphics.hideBumper();
      startVideo(slot.item, slot.offset);
      applyAudio();
      armWatchdog();
      trackGraphics(slot);
    }
  }

  /** Leave the grid and play one specific slot from the top. */
  async function airIndex(index) {
    const token = ++airToken;
    const item = schedule.itemAt(index);
    currentIndex = ((index % schedule.length) + schedule.length) % schedule.length;
    drifting = true;

    graphics.showBumper({ kicker: 'COMING UP', title: `${item.artist} — ${item.title}`, ms: 2200 });
    if (!adFree()) { player.mute(); startVideo(item, 0); armWatchdog(); }
    await wait(2200);
    if (token !== airToken) return;
    if (adFree()) { startVideo(item, 0); armWatchdog(); }
    else player.seek(0);
    graphics.hideBumper();
    applyAudio();
    graphics.startTrack({
      item,
      next: schedule.next(currentIndex, 1)[0],
      remaining: item.duration,
    });
  }

  function skip() {
    if (!player || paused) return;
    airIndex(livingIndexFrom(currentIndex));
  }

  function togglePause() {
    if (!player) return;
    if (paused) {
      paused = false;
      graphics.setPaused(false);
      airLive(); // rejoin live rather than resuming a stale frame
    } else {
      paused = true;
      airToken++;             // cancel any pending bumper hand-off
      clearTimeout(watchdog);
      graphics.clearTimers();
      graphics.hideLower();
      player.pause();
      graphics.setPaused(true);
    }
  }

  // ---------------------------------------------------------------- drift
  setInterval(() => {
    if (!player || paused || drifting || document.hidden) return;
    if (adFree()) return;   // a seek here means reloading the frame — not worth it
    if (player.getState() !== PlayerState.PLAYING) return;
    if (!graphics) return;

    const slot = schedule.slotAt();
    if (slot.index !== currentIndex || slot.inBumper) return;
    const delta = Math.abs(player.getTime() - slot.offset);
    if (delta > DRIFT_TOLERANCE) player.seek(slot.offset);
  }, 15000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || paused || drifting || !player) return;
    if (document.body.dataset.power === 'on') airLive();
  });

  // ---------------------------------------------------------------- power
  let booting = false;
  async function powerOn() {
    if (booting || player) return;
    booting = true;
    document.body.dataset.power = 'tuning';
    status.textContent = 'TUNING…';
    graphics.noise(true);

    try {
      const make = adFree() ? createInvidiousPlayer : createPlayer;
      player = await make('player', {
        onStateChange: (state) => {
          if (state === PlayerState.PLAYING) {
            sawPlaying = true;
            clearTimeout(watchdog);
            // the caption module comes back with each new video
            player?.killCaptions();
          }
          if (state === PlayerState.ENDED) {
            // always snap back to the live grid at a natural boundary
            airLive();
          }
        },
        onError: (code, fatal) => {
          const item = schedule.itemAt(currentIndex);
          console.warn('player error', code, item.id, item.artist, item.title);
          if (!fatal) return;
          dead.add(item.id);
          clearTimeout(watchdog);
          airIndex(livingIndexFrom(currentIndex));
        },
      });
    } catch (err) {
      console.error(err);
      graphics.noise(false);
      document.body.dataset.power = 'off';
      booting = false;
      status.textContent = 'NO SIGNAL — COULD NOT REACH YOUTUBE';
      return;
    }

    applyAudio();
    await airLive();
    await wait(500);
    graphics.noise(false);
    document.body.dataset.power = 'on';
    booting = false;
    remote.show();
  }

  function powerOff() {
    airToken++;
    clearTimeout(watchdog);
    graphics.clearTimers();
    graphics.hideLower();
    graphics.hideBumper();
    graphics.setPaused(false);
    paused = false;
    drifting = false;
    player?.stop();
    graphics.noise(true, 420);
    document.body.dataset.power = 'off';
    status.textContent = `${playlist.items.length} VIDEOS · READY`;
    $('power-on').focus();
  }

  $('power-on').addEventListener('click', powerOn);
}

boot();
