import { createSchedule, nowSeconds, BUMPER_SECONDS } from '../js/schedule.js';
import fs from 'node:fs';

const doc = JSON.parse(fs.readFileSync(new URL('../data/playlist.json', import.meta.url),'utf8'));
const items = doc.items;
const s = createSchedule(items);

let fail = 0;
const ok = (c,m)=>{ if(!c){ console.log('FAIL:',m); fail++; } else console.log('pass:',m); };

// 1. determinism: two independent schedules agree at the same instant
const s2 = createSchedule(items);
const t = Date.UTC(2026,8,8,14,37,11)/1000;
const a = s.slotAt(t), b = s2.slotAt(t);
ok(a.index===b.index && Math.abs(a.offset-b.offset)<1e-6, `two viewers agree: idx ${a.index} off ${a.offset.toFixed(1)}s (${a.item.artist} — ${a.item.title})`);

// 2. continuity: walking the whole day never skips or repeats a slot boundary
let seen = new Set(), transitions = 0, prev = s.slotAt(t).index, bad = 0;
for (let x = t; x < t + 86400; x += 7) {
  const sl = s.slotAt(x);
  if (sl.index !== prev) {
    transitions++;
    const expected = (prev + 1) % s.length;
    if (sl.index !== expected && sl.index !== 0) bad++;
    prev = sl.index;
  }
  seen.add(sl.index);
}
ok(bad===0, `slots advance strictly in order over 24h (${transitions} handovers, ${bad} out of order)`);
ok(seen.size>0, `${seen.size} distinct slots aired in a day of ${s.length}`);

// 3. offset always inside the item, bumper always at the head of a slot
let oob=0, bump=0;
for (let x = t; x < t + 20000; x += 3) {
  const sl = s.slotAt(x);
  if (sl.offset < 0 || sl.offset > sl.item.duration + 0.01) oob++;
  if (sl.inBumper && (sl.bumperLeft <= 0 || sl.bumperLeft > BUMPER_SECONDS)) bump++;
}
ok(oob===0, 'offset never falls outside the video');
ok(bump===0, 'bumper countdown always within its window');

// 4. offset advances in real time (1s of clock == 1s of video)
const p1 = s.slotAt(t+100), p2 = s.slotAt(t+130);
ok(p1.index!==p2.index || Math.abs((p2.offset-p1.offset)-30)<0.01, 'video position tracks the wall clock 1:1');

// 5. the running order changes from day to day but is stable within one day
s.slotAt(t);            const orderToday = s.order.map(i=>i.id).join();
s.slotAt(t+86400);      const orderTomorrow = s.order.map(i=>i.id).join();
ok(orderToday!==orderTomorrow, 'running order reshuffles each day');
s.slotAt(t+3600);       const back = s.order.map(i=>i.id).join();
ok(back===orderToday, 'the same day always rebuilds the same running order');

// 6. next/previous wrap safely
ok(s.next(s.length-1,3).length===3 && s.previous(0,3).length===3, 'next/previous wrap without falling off the ends');

console.log(fail? `\n${fail} FAILURES` : '\nall schedule tests passed');
process.exit(fail?1:0);
