/**
 * The on-screen graphics package: screen bug, the NOW lower third, bumpers
 * and analogue noise. Everything here is presentation only — main.js decides
 * what is on air, this module decides how it looks and when it shows.
 */

const $ = (id) => document.getElementById(id);

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

const rand = (min, max) => min + Math.random() * (max - min);

export function createGraphics() {
  const els = {
    bug: $('bug'),
    lower: $('lower'),
    lowerFrame: $('lower-frame'),
    lowerText: $('lower-text'),
    announce: $('announce'),
    bumper: $('bumper'),
    bumperKicker: $('bumper-kicker'),
    bumperTitle: $('bumper-title'),
    paused: $('paused'),
    static: $('static'),
  };

  let timers = [];
  let noiseRaf = 0;

  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };

  // ---------------------------------------------------------------- lower third
  // NOW and NEXT are two separate pieces of channel artwork; the label lives
  // inside the file, so switching strap means switching the file.
  const STRAPS = {
    NOW: './assets/lowerthird-now.svg',
    NEXT: './assets/lowerthird-next.svg',
  };

  function showLower(label, text, holdMs) {
    const src = STRAPS[label] || STRAPS.NOW;
    if (!els.lowerFrame.getAttribute('src').endsWith(src.slice(1))) {
      els.lowerFrame.setAttribute('src', src);
    }
    els.lowerText.textContent = text;
    els.lower.dataset.state = 'shown';
    els.announce.textContent = `${label}: ${text}`;
    if (holdMs) later(hideLower, holdMs);
  }

  function hideLower() {
    els.lower.dataset.state = 'hidden';
  }

  /**
   * Variable rhythm, as asked: the strap comes in when the video starts, goes
   * away, drops back in at irregular gaps, and returns once more near the end
   * to trail what is coming next.
   */
  function startTrack({ item, next, remaining }) {
    clearTimers();
    hideLower();

    const line = `${item.artist} — ${item.title}`;
    const remainMs = Math.max(0, remaining) * 1000;

    // opening ident, but only if we did not join right at the death
    if (remainMs > 20000) {
      later(() => showLower('NOW', line, 12000), 1400);
    }

    // irregular re-entries through the body of the track
    let at = rand(46000, 78000);
    while (at < remainMs - 32000) {
      const when = at;
      later(() => showLower('NOW', line, rand(7000, 10000)), when);
      at += rand(52000, 96000);
    }

    // trail the next video before handing over
    if (next && remainMs > 40000) {
      later(() => showLower('NEXT', `${next.artist} — ${next.title}`, 9000), remainMs - 26000);
    }
  }

  // ---------------------------------------------------------------- bumper
  let bumperToken = 0;

  function showBumper({ kicker = 'COMING UP', title = '', ms = 6000 } = {}) {
    const token = ++bumperToken;
    hideLower();
    els.bumper.dataset.variant = title ? 'strap' : 'ident';
    els.bumperKicker.textContent = kicker;
    els.bumperTitle.textContent = title;
    els.bumper.hidden = false;
    // restart the entry animation
    els.bumper.querySelectorAll('.bumper__flash, .bumper__inner').forEach((n) => {
      n.style.animation = 'none';
      void n.offsetWidth;
      n.style.animation = '';
    });
    return new Promise((resolve) => {
      setTimeout(() => {
        if (token === bumperToken) els.bumper.hidden = true;
        resolve();
      }, ms);
    });
  }

  function hideBumper() { bumperToken++; els.bumper.hidden = true; }

  // ---------------------------------------------------------------- noise
  function paintNoise() {
    const c = els.static;
    const ctx = c.getContext('2d', { alpha: true });
    const w = (c.width = Math.max(160, Math.floor(c.clientWidth / 3)));
    const h = (c.height = Math.max(90, Math.floor(c.clientHeight / 3)));
    const img = ctx.createImageData(w, h);
    const draw = () => {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 150;
      }
      ctx.putImageData(img, 0, 0);
      noiseRaf = requestAnimationFrame(draw);
    };
    draw();
  }

  function noise(on, ms = 0) {
    if (REDUCED.matches) return Promise.resolve();
    els.static.dataset.on = String(on);
    if (on && !noiseRaf) paintNoise();
    if (!on) { cancelAnimationFrame(noiseRaf); noiseRaf = 0; }
    if (!ms) return Promise.resolve();
    return new Promise((r) => setTimeout(() => { noise(false); r(); }, ms));
  }

  // ---------------------------------------------------------------- paused
  const setPaused = (on) => {
    els.paused.hidden = !on;
    document.body.dataset.paused = String(on);
  };

  return {
    startTrack,
    showLower,
    hideLower,
    showBumper,
    hideBumper,
    noise,
    setPaused,
    clearTimers,
  };
}
