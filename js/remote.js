/**
 * The hidden remote: nothing is on screen until the viewer moves, touches or
 * types, and it fades out again on its own. Also owns the programme guide.
 */

const $ = (id) => document.getElementById(id);
const IDLE_MS = 3200;

export function createRemote({ actions, schedule }) {
  const els = {
    remote: $('remote'),
    vol: $('vol'),
    volNum: $('vol-num'),
    epg: $('epg'),
    srcBtn: $('src-btn'),
    epgPrev: $('epg-prev'),
    epgNext: $('epg-next'),
    epgNow: $('epg-now'),
    stage: $('stage'),
  };

  let idleTimer = 0;
  let guideOpen = false;
  let guideTicker = 0;

  // ------------------------------------------------------------- visibility
  function show() {
    els.remote.dataset.visible = 'true';
    document.body.dataset.ui = 'on';
    clearTimeout(idleTimer);
    idleTimer = setTimeout(hide, IDLE_MS);
  }

  function hide() {
    if (guideOpen || els.remote.contains(document.activeElement)) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(hide, IDLE_MS);
      return;
    }
    els.remote.dataset.visible = 'false';
    document.body.dataset.ui = 'off';
  }

  ['pointermove', 'pointerdown', 'wheel', 'touchstart'].forEach((type) => {
    window.addEventListener(type, show, { passive: true });
  });

  // ------------------------------------------------------------- volume
  function paintVolume(value, muted) {
    els.vol.value = String(value);
    els.vol.style.setProperty('--fill', `${muted ? 0 : value}%`);
    els.volNum.textContent = muted ? 'MUTE' : String(Math.round(value));
    document.body.dataset.muted = String(muted);
  }

  els.vol.addEventListener('input', () => {
    actions.setVolume(Number(els.vol.value));
    show();
  });

  // ------------------------------------------------------------- buttons
  els.remote.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) run(btn.dataset.action);
  });
  els.epg.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) run(btn.dataset.action);
  });

  function run(action) {
    show();
    switch (action) {
      case 'power': actions.power(); break;
      case 'mute': actions.toggleMute(); break;
      case 'pause': actions.togglePause(); break;
      case 'skip': actions.skip(); break;
      case 'source': actions.switchSource(); break;
      case 'guide': toggleGuide(); break;
      case 'fullscreen': toggleFullscreen(); break;
      default: break;
    }
  }

  function toggleFullscreen() {
    const root = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else (root.requestFullscreen?.() || Promise.resolve()).catch(() => {});
  }

  // ------------------------------------------------------------- guide
  function row(item) {
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.className = 'a';
    a.textContent = item.artist;
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = item.year ? `${item.title} · ${item.year}` : item.title;
    li.append(a, t);
    return li;
  }

  function renderGuide() {
    const slot = schedule.slotAt();

    els.epgPrev.replaceChildren(...schedule.previous(slot.index, 3).map(row));
    els.epgNext.replaceChildren(...schedule.next(slot.index, 5).map(row));

    const { item } = slot;
    const played = item.duration - slot.remaining;
    const pct = Math.max(0, Math.min(100, (played / item.duration) * 100));

    els.epgNow.innerHTML = '';
    const a = document.createElement('div');
    a.className = 'a';
    a.textContent = item.artist;
    const t = document.createElement('div');
    t.className = 't';
    t.textContent = item.title;
    const y = document.createElement('div');
    y.className = 'y';
    y.textContent = item.year ? `${item.year} · ${fmt(slot.remaining)} LEFT` : fmt(slot.remaining);
    const bar = document.createElement('div');
    bar.className = 'epg__bar';
    const fill = document.createElement('i');
    fill.style.width = `${pct}%`;
    bar.append(fill);
    els.epgNow.append(a, t, y, bar);
  }

  const fmt = (s) => {
    const m = Math.floor(Math.max(0, s) / 60);
    const r = Math.floor(Math.max(0, s) % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  function toggleGuide(force) {
    guideOpen = force ?? !guideOpen;
    els.epg.hidden = !guideOpen;
    clearInterval(guideTicker);
    if (guideOpen) {
      renderGuide();
      guideTicker = setInterval(renderGuide, 1000);
      els.epg.querySelector('.epg__close')?.focus();
    } else {
      show();
    }
  }

  // ------------------------------------------------------------- keyboard
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    const handled = {
      arrowup: () => actions.nudgeVolume(+5),
      arrowdown: () => actions.nudgeVolume(-5),
      arrowright: () => actions.skip(),
      m: () => actions.toggleMute(),
      f: () => toggleFullscreen(),
      g: () => toggleGuide(),
      s: () => actions.switchSource(),
      ' ': () => actions.togglePause(),
      escape: () => (guideOpen ? toggleGuide(false) : null),
    }[key];

    if (!handled) { show(); return; }
    e.preventDefault();
    show();
    handled();
  });

  const paintSource = (source) => {
    els.srcBtn.textContent = source === 'adfree' ? 'AD-FREE' : 'YOUTUBE';
    els.srcBtn.title = source === 'adfree'
      ? 'Playing through Invidious — no adverts. Press S for YouTube.'
      : 'Playing through YouTube — adverts may run. Press S for the ad-free source.';
  };

  return { show, hide, paintVolume, paintSource, toggleGuide, renderGuide };
}
