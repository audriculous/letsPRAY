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

// Prayers per day. Older data stored `true`, which counts as one. Taking the
// higher count means the same day prayed on two devices is not double counted.
const dayCount = (v) => (v === true ? 1 : Number(v) || 0);
function mergeDays(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = Math.max(dayCount(a[k]), dayCount(b[k]));
  return out;
}

export function merge(local, remote) {
  const a = normalise(local);
  const b = normalise(remote);
  return {
    version: SCHEMA_VERSION,
    categories: mergeRecords(a.categories, b.categories),
    items: mergeRecords(a.items, b.items),
    days: mergeDays(a.days, b.days),
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
    sortObj(data.days),
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
// recently prayed points, so everything comes round in turn. Points with a
// date coming up go first and always make it in.
// scale shortens or lengthens a session (e.g. 0.5 or 2) without changing
// each list's usual count; a list set to 0 stays at 0.
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const lastPrayedIn = (data, catId) =>
  Math.max(0, ...Object.values(data.items).filter((i) => live(i) && i.categoryId === catId).map((i) => i.lastPrayedAt || 0));

// The most recent date (today included) that falls on a given weekday.
function lastWeekday(today, weekday) {
  const d = new Date(today);
  d.setDate(d.getDate() - ((d.getDay() - weekday + 7) % 7));
  return startOfDay(d.getTime());
}

// How often a list comes up: every session (the default), or once a week on
// a chosen day. A weekly list stays due from that day until some of it has
// been prayed, so a missed Sunday carries over to Monday.
export function listDue(data, cat, now = Date.now()) {
  if (cat.frequency !== 'weekly') return true;
  return lastPrayedIn(data, cat.id) < lastWeekday(startOfDay(now), cat.weekday ?? 0);
}

// When a weekly list will next come up (today if it is due now).
export function nextDue(data, cat, now = Date.now()) {
  const today = startOfDay(now);
  if (listDue(data, cat, now)) return today;
  const d = new Date(lastWeekday(today, cat.weekday ?? 0));
  d.setDate(d.getDate() + 7);
  return startOfDay(d.getTime());
}

export function buildSession(data, scale = 1, now = Date.now()) {
  const cards = [];
  for (const cat of activeCategories(data)) {
    const pool = itemsIn(data, cat.id).sort(
      (x, y) => (x.lastPrayedAt || 0) - (y.lastPrayedAt || 0) || (x.createdAt || 0) - (y.createdAt || 0),
    );
    const usual = Math.max(0, cat.perSession ?? 2);
    const take = usual && listDue(data, cat, now) ? Math.max(1, Math.round(usual * scale)) : 0;
    const soon = pool.filter((i) => isSoon(i, now)).sort((x, y) => x.eventAt - y.eventAt);
    const rest = pool.filter((i) => !isSoon(i, now)).slice(0, Math.max(0, take - soon.length));
    [...soon, ...rest].forEach((item) => cards.push({ itemId: item.id, categoryId: cat.id }));
  }
  return cards;
}

// Local midnight, so dates line up with the calendar on the device.
export function startOfDay(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// A dated point (surgery on Friday, exams next week) is "soon" from two days
// before its date until the day after, so it comes up first in a session.
export function isSoon(item, now = Date.now()) {
  if (!item.eventAt) return false;
  const today = startOfDay(now);
  const diff = Math.round((startOfDay(item.eventAt) - today) / 86400000);
  return diff >= -1 && diff <= 2;
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

// Totals for the seven days ending today.
export function weekStats(data, now = Date.now()) {
  const DAY = 86400000;
  let daysPrayed = 0;
  let prayers = 0;
  for (let i = 0; i < 7; i += 1) {
    const n = dayCount(data.days[dayKey(now - i * DAY)]);
    if (n) daysPrayed += 1;
    prayers += n;
  }
  const since = startOfDay(now - 6 * DAY);
  const answered = Object.values(data.items).filter((i) => live(i) && i.answeredAt >= since).length;
  return { daysPrayed, prayers, answered, from: now - 6 * DAY, to: now };
}
