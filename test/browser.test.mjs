import { chromium } from 'playwright';
import fs from 'node:fs';

const HERE = new URL('.', import.meta.url).pathname;
const SHOTS = process.env.SHOT_DIR || HERE;
const PAGE = process.env.PAGE_URL || 'http://localhost:8000/index.html';
const MOCK = fs.readFileSync(`${HERE}/yt-mock.js`, 'utf8');
const FONTS = fs.existsSync(`${HERE}/fonts.css`) ? fs.readFileSync(`${HERE}/fonts.css`, 'utf8') : '';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  pass  ' : '  FAIL  ') + m); if (!c) fail++; };
const head = (t) => console.log(`\n== ${t} ==`);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

async function makePage(w = 1280, h = 720) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.route('**/iframe_api*', (r) => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: FONTS }));
  await page.route('**/fonts.gstatic.com/**', (r) => r.abort());
  await page.route('**/youtube-nocookie.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#111">' }));
  await page.route('**/www.youtube.com/embed/**', (r) => r.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#111">' }));
  return page;
}

const page = await makePage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

head('boot');
await page.goto(PAGE, { waitUntil: 'networkidle' });
ok(/100 VIDEOS · READY/.test(await page.textContent('#boot-status')),
   `playlist loads and validates: "${await page.textContent('#boot-status')}"`);
ok(await page.isVisible('#power-on'), 'splash blocks autoplay until the viewer opts in');
await page.screenshot({ path: `${SHOTS}/shot-1-splash.png` });

head('power on');
await page.click('#power-on');
await page.waitForFunction(() => document.body.dataset.power === 'on', null, { timeout: 30000 });
ok(true, 'channel reaches the ON state');

head('youtube ui suppression');
const cfg = await page.evaluate(() => window.__mock.cfg.playerVars);
ok(cfg.controls === 0, 'controls=0 — no scrub bar or buttons');
ok(cfg.rel === 0, 'rel=0 — no end-of-video grid from other channels');
ok(cfg.disablekb === 1, 'disablekb=1 — the remote owns the keyboard');
ok(cfg.iv_load_policy === 3, 'iv_load_policy=3 — no annotations');
ok(cfg.playsinline === 1, 'playsinline=1 — iOS cannot take over with its native player');
ok(cfg.fs === 0, 'fs=0 — no YouTube fullscreen button');
ok(await page.evaluate(() => window.__mock.embedHost.includes('nocookie')), 'served from the nocookie host');

const hits = await page.evaluate(() => {
  const st = document.getElementById('stage').getBoundingClientRect();
  const pts = [[0.5,0.5],[0.06,0.06],[0.94,0.06],[0.5,0.03],[0.94,0.96],[0.5,0.98],[0.02,0.5],[0.98,0.5]];
  return pts.map(([x, y]) => {
    const el = document.elementFromPoint(st.left + st.width * x, st.top + st.height * y);
    return el ? (el.id || el.className || el.tagName) : 'none';
  });
});
ok(!hits.some((h) => String(h).toUpperCase().includes('IFRAME')),
   `the pointer never reaches the iframe anywhere on screen (${[...new Set(hits)].join(', ')})`);

for (const [x, y] of [[640,20],[640,360],[1240,40],[40,700],[640,715],[1270,715]]) {
  await page.mouse.move(x, y); await page.waitForTimeout(120);
}
ok(!(await page.evaluate(() => {
  const st = document.getElementById('stage').getBoundingClientRect();
  const el = document.elementFromPoint(st.left + st.width / 2, st.top + 8);
  return el && el.tagName === 'IFRAME';
})), 'hovering the top edge (where YouTube draws its title bar) still hits our shield');

const geo = await page.evaluate(() => {
  const st = document.getElementById('stage').getBoundingClientRect();
  const fr = document.querySelector('#player-wrap iframe').getBoundingClientRect();
  return { top: st.top - fr.top, bottom: fr.bottom - st.bottom, left: st.left - fr.left,
           overflow: getComputedStyle(document.getElementById('stage')).overflow };
});
ok(geo.top > 5 && geo.bottom > 5 && geo.left > 5,
   `iframe is overscanned past every stage edge (top ${geo.top.toFixed(0)}px, bottom ${geo.bottom.toFixed(0)}px, left ${geo.left.toFixed(0)}px)`);
ok(geo.overflow === 'hidden', 'the stage clips that overscan away');

head('linear scheduling');
const onAir = await page.evaluate(() => window.__mock.calls.filter((c) => c[0] === 'load').at(-1));
ok(onAir && onAir[2] >= 0, `joined a video already in progress: ${onAir[1]} at ${Math.round(onAir[2])}s`);

const page2 = await makePage(900, 506);
await page2.goto(PAGE, { waitUntil: 'networkidle' });
const sync = await Promise.all([page, page2].map((p) => p.evaluate(async () => {
  const { createSchedule } = await import('./js/schedule.js');
  const { loadPlaylist } = await import('./js/playlist.js');
  const s = createSchedule((await loadPlaylist()).items);
  const slot = s.slotAt();
  return { id: slot.item.id, off: Math.round(slot.offset), who: `${slot.item.artist} — ${slot.item.title}` };
})));
ok(sync[0].id === sync[1].id && Math.abs(sync[0].off - sync[1].off) <= 2,
   `two viewers land on the same video at the same second (${sync[0].who} @${sync[0].off}s / @${sync[1].off}s)`);
await page2.close();

head('graphics');
ok(await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('bug')).opacity) > .5),
   'screen bug is on air');
const strapText = await page.waitForFunction(
  () => document.getElementById('lower').dataset.state === 'shown' && document.getElementById('lower-text').textContent,
  null, { timeout: 30000 }).then((h) => h.jsonValue()).catch(() => null);
ok(!!strapText, `NOW strap comes in naming the track: "${strapText}"`);
await page.screenshot({ path: `${SHOTS}/shot-2-lowerthird.png` });
ok(await page.waitForFunction(() => document.getElementById('lower').dataset.state === 'hidden',
   null, { timeout: 30000 }).then(() => true).catch(() => false),
   'NOW strap retreats on its own rather than sitting there permanently');
await page.screenshot({ path: `${SHOTS}/shot-3-onair.png` });

head('remote');
await page.mouse.move(640, 500); await page.waitForTimeout(400);
ok(await page.getAttribute('#remote', 'data-visible') === 'true', 'remote appears on movement');
await page.screenshot({ path: `${SHOTS}/shot-4-remote.png` });
await page.waitForTimeout(4200);
ok(await page.getAttribute('#remote', 'data-visible') === 'false', 'remote hides itself after inactivity');

await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200);
const vol = await page.evaluate(() => window.__mock.vol);
ok(vol === 85, `volume responds to the keyboard (now ${vol})`);
await page.keyboard.press('m'); await page.waitForTimeout(200);
ok(await page.evaluate(() => window.__mock.muted), 'M mutes');
ok(await page.textContent('#vol-num') === 'MUTE', 'the remote reads MUTE');
await page.keyboard.press('m'); await page.waitForTimeout(200);
ok(!(await page.evaluate(() => window.__mock.muted)), 'M unmutes');

head('programme guide');
await page.keyboard.press('g'); await page.waitForTimeout(500);
ok(await page.isVisible('#epg'), 'guide opens on G');
const nowArtist = await page.textContent('#epg-now .a');
const nextN = await page.locator('#epg-next li').count();
const prevN = await page.locator('#epg-prev li').count();
ok(!!nowArtist && nextN === 5 && prevN === 3,
   `guide lists 3 previous, ON AIR (${nowArtist}) and ${nextN} coming up`);
await page.screenshot({ path: `${SHOTS}/shot-5-guide.png` });
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
ok(await page.isHidden('#epg'), 'guide closes on Escape');

head('pause never exposes YouTube');
await page.keyboard.press(' '); await page.waitForTimeout(700);
ok(await page.isVisible('#paused'), 'our own PAUSED card covers the whole stage');
ok(await page.evaluate(() => {
  const st = document.getElementById('stage').getBoundingClientRect();
  const el = document.elementFromPoint(st.left + st.width / 2, st.top + st.height / 2);
  return el.closest('#paused') !== null;
}), 'the card, not the video, is what is on screen while paused');
await page.screenshot({ path: `${SHOTS}/shot-6-paused.png` });
await page.keyboard.press(' '); await page.waitForTimeout(1200);
ok(await page.isHidden('#paused'), 'unpausing rejoins the live grid and clears the card');

head('resilience');
const beforeSkip = await page.evaluate(() => window.__mock.vid);
await page.keyboard.press('ArrowRight'); await page.waitForTimeout(3200);
const afterSkip = await page.evaluate(() => window.__mock.vid);
ok(beforeSkip !== afterSkip, `skip moves the channel on (${beforeSkip} → ${afterSkip})`);

const dead = await page.evaluate(() => window.__mock.vid);
await page.evaluate(() => window.__mock.err(150));   // embedding disabled
await page.waitForTimeout(3200);
const recovered = await page.evaluate(() => window.__mock.vid);
ok(recovered && recovered !== dead, `an unplayable video is dropped and the channel keeps going (${dead} → ${recovered})`);

await page.evaluate(() => window.__mock.err(150));
await page.waitForTimeout(3200);
await page.evaluate(() => window.__mock.err(150));
await page.waitForTimeout(3200);
ok(await page.evaluate(() => window.__mock.state === 1), 'repeated failures still leave the channel playing');
ok(await page.isVisible('#bug'), 'the channel never falls back to a dead black screen');

await page.evaluate(() => window.__mock.endNow());
await page.waitForTimeout(1500);
ok(await page.evaluate(() => window.__mock.vid) !== null, 'a video ending hands over to the next one');

head('power off');
await page.mouse.move(640, 500); await page.waitForTimeout(300);
await page.click('.rbtn[data-action="power"]'); await page.waitForTimeout(900);
ok(await page.evaluate(() => document.body.dataset.power) === 'off', 'power button returns to the splash');
ok(await page.isVisible('#power-on'), 'the TURN ON button is offered again');

head('responsive');
for (const [w, h, label] of [[390, 844, 'phone portrait'], [844, 390, 'phone landscape'], [2560, 1440, 'desktop 1440p']]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const s = document.getElementById('stage').getBoundingClientRect();
    return { ar: s.width / s.height, w: s.width, h: s.height,
             scrollX: document.documentElement.scrollWidth > window.innerWidth };
  });
  ok(Math.abs(r.ar - 16 / 9) < 0.02 && !r.scrollX,
     `${label}: stage stays 16:9 (${Math.round(r.w)}×${Math.round(r.h)}) with no horizontal scroll`);
}

console.log('\nconsole errors:', errors.length ? errors.slice(0, 6) : 'none');
console.log(fail ? `\n${fail} FAILURES` : '\nALL BROWSER TESTS PASSED');
await browser.close();
process.exit(fail ? 1 : 0);
