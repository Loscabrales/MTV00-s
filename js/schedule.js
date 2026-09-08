/**
 * Deterministic linear schedule.
 *
 * The running order is derived from the wall clock alone, so every viewer who
 * opens the site at the same moment lands on the same video at the same second
 * — and lands in the middle of it, the way switching on a television works.
 *
 * The order is reshuffled once per UTC day from a seed everyone shares.
 */

export const BUMPER_SECONDS = 6;

const EPOCH = Date.UTC(2000, 0, 1) / 1000; // 2000-01-01, because of course
const DAY = 86400;

/** mulberry32 — small, fast, and identical in every browser */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, seed) {
  const out = items.slice();
  const rand = makeRng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function nowSeconds() {
  return Date.now() / 1000;
}

export function createSchedule(items) {
  let dayIndex = null;
  let order = [];
  let starts = [];
  let cycle = 0;

  /** Each slot is [bumper][video], so a video is always introduced. */
  function build(atSec) {
    const day = Math.floor((atSec - EPOCH) / DAY);
    if (day === dayIndex) return;
    dayIndex = day;
    order = shuffled(items, day * 2654435761);
    starts = [];
    let acc = 0;
    for (const item of order) {
      starts.push(acc);
      acc += BUMPER_SECONDS + item.duration;
    }
    cycle = acc;
  }

  function dayStart() {
    return EPOCH + dayIndex * DAY;
  }

  function slotAt(atSec = nowSeconds()) {
    build(atSec);
    const elapsed = ((atSec - dayStart()) % cycle + cycle) % cycle;

    // linear scan is fine at playlist scale and avoids index bookkeeping
    let index = order.length - 1;
    for (let i = 0; i < starts.length; i++) {
      if (elapsed < starts[i] + BUMPER_SECONDS + order[i].duration) {
        index = i;
        break;
      }
    }

    const into = elapsed - starts[index];
    const inBumper = into < BUMPER_SECONDS;
    const offset = Math.max(0, into - BUMPER_SECONDS);

    return {
      index,
      item: order[index],
      inBumper,
      bumperLeft: inBumper ? BUMPER_SECONDS - into : 0,
      offset,
      remaining: Math.max(0, order[index].duration - offset),
    };
  }

  const at = (i) => order[((i % order.length) + order.length) % order.length];

  return {
    slotAt,
    itemAt: at,
    next: (index, count = 1) =>
      Array.from({ length: count }, (_, k) => at(index + k + 1)),
    previous: (index, count = 1) =>
      Array.from({ length: count }, (_, k) => at(index - count + k)),
    get length() { return order.length; },
    get order() { return order; },
  };
}
