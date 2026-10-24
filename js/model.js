// Pure data helpers: no DOM, no storage. Shared by the app and the tests.

export const SCHEMA_VERSION = 1;

// Muted category colours; the actual values live in css/app.css (--cat-*).
export const COLOURS = ['sage', 'slate', 'clay', 'plum', 'sand', 'teal', 'rose', 'olive'];

// Fixed ids so that two devices starting fresh do not create duplicate
// default categories once they sync. updatedAt 0 means any real edit wins.
export const DEFAULT_CATEGORIES = [
  { id: 'cat-people', name: 'People', icon: 'person', color: 'slate' },
  { id: 'cat-family', name: 'Family', icon: 'home', color: 'clay' },
  { id: 'cat-church', name: 'Church', icon: 'church', color: 'sage' },
  { id: 'cat-mission', name: 'Mission', icon: 'globe', color: 'plum' },
];

export function uid(prefix = 'id') {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${rand}`;
}

export function emptyData() {
  const categories = {};
  DEFAULT_CATEGORIES.forEach((c, i) => {
    categories[c.id] = { ...c, order: i, perSession: 2, updatedAt: 0 };
  });
  return { version: SCHEMA_VERSION, categories, items: {}, days: {} };
}

// Bring any loaded or remote blob up to the current shape.
export function normalise(data) {
  const base = emptyData();
  if (!data || typeof data !== 'object') return base;
  return {
    version: SCHEMA_VERSION,
    categories: { ...base.categories, ...(data.categories || {}) },
    items: { ...(data.items || {}) },
    days: { ...(data.days || {}) },
  };
}

// Last-write-wins per record. Deleted records stay as tombstones
// ({ deleted: true, updatedAt }) so deletes propagate between devices.
function mergeRecords(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, rec] of Object.entries(b)) {
    const mine = out[id];
    if (!mine || (rec.updatedAt || 0) > (mine.updatedAt || 0)) out[id] = rec;
  }
  return out;
}

export function merge(local, remote) {
  const a = normalise(local);
  const b = normalise(remote);
  return {
    version: SCHEMA_VERSION,
    categories: mergeRecords(a.categories, b.categories),
    items: mergeRecords(a.items, b.items),
    // Days prayed only ever accumulate.
    days: { ...a.days, ...b.days },
  };
}

// Stable string for change detection, independent of key order.
export function fingerprint(data) {
  const sortObj = (o) =>
    Object.keys(o)
      .sort()
      .map((k) => [k, o[k]]);
  return JSON.stringify([
    sortObj(data.categories),
    sortObj(data.items),
    Object.keys(data.days).sort(),
  ]);
}

export const live = (rec) => rec && !rec.deleted;

export function activeCategories(data) {
  return Object.values(data.categories)
    .filter(live)
    .sort((x, y) => x.order - y.order || x.name.localeCompare(y.name));
}

export function itemsIn(data, categoryId) {
  return Object.values(data.items)
    .filter((i) => live(i) && i.categoryId === categoryId && !i.answeredAt && !i.archived)
    .sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
}

export function answeredItems(data) {
  return Object.values(data.items)
    .filter((i) => live(i) && i.answeredAt)
    .sort((x, y) => y.answeredAt - x.answeredAt);
}

// Prayer Mate style rotation: each category offers its `perSession` least
// recently prayed points, so everything comes round in turn.
export function buildSession(data) {
  const cards = [];
  for (const cat of activeCategories(data)) {
    const pool = itemsIn(data, cat.id).sort(
      (x, y) => (x.lastPrayedAt || 0) - (y.lastPrayedAt || 0) || (x.createdAt || 0) - (y.createdAt || 0),
    );
    const take = Math.max(0, cat.perSession ?? 2);
    pool.slice(0, take).forEach((item) => cards.push({ itemId: item.id, categoryId: cat.id }));
  }
  return cards;
}

export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Consecutive days prayed, counting today or (if not yet today) yesterday.
export function streak(data, now = Date.now()) {
  const DAY = 86400000;
  let t = now;
  if (!data.days[dayKey(t)]) t -= DAY;
  let n = 0;
  while (data.days[dayKey(t)]) {
    n += 1;
    t -= DAY;
  }
  return n;
}

export function allTags(data) {
  const counts = new Map();
  for (const item of Object.values(data.items)) {
    if (!live(item)) continue;
    for (const tag of item.tags || []) {
      const key = tag.toLowerCase();
      const entry = counts.get(key) || { tag, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
