/**
 * Loads and validates data/playlist.json.
 * Malformed entries are dropped rather than allowed to break the channel.
 */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

function clean(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!ID_RE.test(id)) return null;

  const artist = String(raw.artist ?? '').trim();
  const title = String(raw.title ?? '').trim();
  if (!artist || !title) return null;

  const duration = Number(raw.duration);
  const year = Number(raw.year);

  return {
    id,
    artist,
    title,
    year: Number.isFinite(year) ? Math.trunc(year) : null,
    // a sane fallback keeps the schedule maths intact if a duration is missing
    duration: Number.isFinite(duration) && duration > 30 && duration < 900
      ? Math.round(duration)
      : 240,
    key: `${id}:${index}`,
  };
}

export async function loadPlaylist(url = './data/playlist.json') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`playlist ${res.status}`);

  const doc = await res.json();
  const raw = Array.isArray(doc) ? doc : doc.items;
  if (!Array.isArray(raw)) throw new Error('playlist has no items array');

  const seen = new Set();
  const items = [];
  for (const entry of raw) {
    const item = clean(entry, items.length);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  if (!items.length) throw new Error('playlist is empty after validation');

  return { channel: doc.channel || 'MTV 00s', items };
}
