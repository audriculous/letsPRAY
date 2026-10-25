// App state: one data blob in localStorage plus device-only prefs.
import { normalise, uid, dayKey, activeCategories, SHARED_ITEM_FIELDS, SHARED_LIST_FIELDS } from './model.js';

const DATA_KEY = 'letspray:data';
const PREFS_KEY = 'letspray:prefs';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('Could not save', err);
  }
}

const listeners = new Set();
let data = normalise(read(DATA_KEY, null));
let prefs = { theme: 'auto', sync: null, ...read(PREFS_KEY, {}) };

export const getData = () => data;
export const getPrefs = () => prefs;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(kind) {
  for (const fn of listeners) fn(kind);
}

// Replace the whole blob, e.g. after a sync merge or an import.
export function replaceData(next, { silent = false } = {}) {
  data = normalise(next);
  write(DATA_KEY, data);
  emit(silent ? 'remote' : 'local');
}

export function setPrefs(patch) {
  prefs = { ...prefs, ...patch };
  write(PREFS_KEY, prefs);
  emit('prefs');
}

function commit() {
  write(DATA_KEY, data);
  emit('local');
}

const now = () => Date.now();

// sharedAt marks the last change to what other people see in a shared list
// (title, notes, updates, answered and so on). Personal changes such as
// praying, pins and follow-ups leave it alone, so they are never shared.
const sharedChanged = (prev, next, keys) => !prev || prev.deleted || keys.some((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]));

// ---- Undo ----
// The last change can be reversed. Before a change touches a record we keep
// its previous version; undo puts those back with a fresh timestamp, so the
// restored version also wins on every synced device.

let change = null; // the change being recorded
let lastChange = null; // the change that undo would reverse
let depth = 0;

const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function remember(kind, id) {
  if (change && !(id in change[kind])) change[kind][id] = copy(data[kind][id]);
}

// Groups everything `fn` does into one undoable change.
export function batch(label, fn, meta = {}) {
  const outer = depth === 0;
  if (outer) change = { label, meta, items: {}, categories: {}, days: {}, plans: {}, journal: {} };
  depth += 1;
  try {
    return fn();
  } finally {
    depth -= 1;
    if (outer) {
      const touched = ['items', 'categories', 'plans', 'journal'].reduce((n, k) => n + Object.keys(change[k]).length, 0);
      if (touched) lastChange = change;
      change = null;
    }
  }
}

export const lastUndo = () => lastChange;

export function undo() {
  const c = lastChange;
  if (!c) return null;
  lastChange = null;
  const t = now();
  for (const kind of ['categories', 'items']) {
    for (const [id, prev] of Object.entries(c[kind])) {
      const was = data[kind][id];
      data[kind][id] = prev === undefined ? { id, deleted: true, categoryId: was?.categoryId, updatedAt: t, sharedAt: t } : { ...prev, updatedAt: t, sharedAt: t };
    }
  }
  for (const kind of ['plans', 'journal']) {
    for (const [id, prev] of Object.entries(c[kind])) {
      // A restored plan's ticks are re-stamped too, so they win when merged.
      const ticks = prev?.ticks && Object.fromEntries(Object.entries(prev.ticks).map(([k, v]) => [k, { ...v, at: t }]));
      data[kind][id] = prev === undefined ? { id, deleted: true, updatedAt: t } : { ...prev, ...(ticks ? { ticks } : {}), updatedAt: t };
    }
  }
  for (const [key, prev] of Object.entries(c.days)) {
    if (prev === undefined) delete data.days[key];
    else data.days[key] = prev;
  }
  commit();
  return c;
}

// Bring in a backup: merges record by record (latest edit wins) and can be
// undone like any other change.
export function mergeIn(incoming, mergeFn) {
  return batch('Backup imported', () => {
    const merged = mergeFn(data, incoming);
    for (const kind of ['categories', 'items', 'plans', 'journal']) {
      for (const [id, rec] of Object.entries(merged[kind])) {
        if (JSON.stringify(rec) !== JSON.stringify(data[kind][id])) {
          remember(kind, id);
          data[kind][id] = rec;
        }
      }
    }
    for (const [key, n] of Object.entries(merged.days)) {
      if (change && !(key in change.days)) change.days[key] = data.days[key];
      data.days[key] = n;
    }
    commit();
  });
}

// ---- Categories ----

export function saveCategory(fields) {
  return batch('List saved', () => {
    const id = fields.id || uid('cat');
    const prev = data.categories[id];
    remember('categories', id);
    const order = prev && !prev.deleted ? prev.order : activeCategories(data).length;
    const next = { perSession: 2, ...prev, ...fields, id, order, updatedAt: now() };
    if (sharedChanged(prev, next, SHARED_LIST_FIELDS)) next.sharedAt = now();
    data.categories[id] = next;
    commit();
    return id;
  });
}

export function deleteCategory(id) {
  return batch('List deleted', () => {
    // Points in the category go with it, as tombstones.
    for (const item of Object.values(data.items)) {
      if (item.categoryId === id && !item.deleted) {
        remember('items', item.id);
        data.items[item.id] = { id: item.id, deleted: true, categoryId: id, updatedAt: now(), sharedAt: now() };
      }
    }
    remember('categories', id);
    data.categories[id] = { id, deleted: true, updatedAt: now(), sharedAt: now() };
    commit();
  });
}

export function reorderCategories(ids) {
  return batch('Lists reordered', () => {
    ids.forEach((id, order) => {
      const cat = data.categories[id];
      if (cat && cat.order !== order) {
        remember('categories', id);
        data.categories[id] = { ...cat, order, updatedAt: now() };
      }
    });
    commit();
  });
}

// ---- Prayer points ----

export function saveItem(fields) {
  return batch(fields.id ? 'Saved' : 'Added', () => {
    const id = fields.id || uid('pt');
    const prev = data.items[id];
    remember('items', id);
    const next = {
      tags: [],
      notes: '',
      createdAt: now(),
      lastPrayedAt: 0,
      prayedCount: 0,
      answeredAt: 0,
      answerNote: '',
      archived: false,
      ...prev,
      ...fields,
      id,
      updatedAt: now(),
    };
    if (sharedChanged(prev, next, [...SHARED_ITEM_FIELDS, 'categoryId'])) next.sharedAt = now();
    data.items[id] = next;
    commit();
    return id;
  });
}

export function deleteItem(id) {
  return batch('Deleted', () => {
    remember('items', id);
    data.items[id] = { id, deleted: true, categoryId: data.items[id]?.categoryId, updatedAt: now(), sharedAt: now() };
    commit();
  });
}

export function markPrayed(id) {
  return batch('Prayed', () => {
    const item = data.items[id];
    if (!item) return;
    const t = now();
    const key = dayKey(t);
    remember('items', id);
    if (change && !(key in change.days)) change.days[key] = data.days[key];
    data.items[id] = { ...item, lastPrayedAt: t, prayedCount: (item.prayedCount || 0) + 1, updatedAt: t };
    data.days[key] = (data.days[key] === true ? 1 : Number(data.days[key]) || 0) + 1;
    commit();
  }, { itemId: id });
}

// ---- Updates, pins and follow-ups ----

export function addUpdate(id, text) {
  return batch('Update added', () => {
    const item = data.items[id];
    if (!item || !text.trim()) return;
    remember('items', id);
    const t = now();
    const update = { id: uid('up'), at: t, text: text.trim() };
    // Adding an update after the date has passed counts as following up.
    data.items[id] = { ...item, updates: [...(item.updates || []), update], followedUpAt: t, updatedAt: t, sharedAt: t };
    commit();
    return update.id;
  });
}

export function deleteUpdate(id, updateId) {
  return batch('Update deleted', () => {
    const item = data.items[id];
    if (!item) return;
    remember('items', id);
    data.items[id] = { ...item, updates: (item.updates || []).filter((u) => u.id !== updateId), updatedAt: now(), sharedAt: now() };
    commit();
  });
}

export function setPin(id, pinUntil) {
  return batch(pinUntil ? 'Pinned' : 'Unpinned', () => {
    const item = data.items[id];
    if (!item) return;
    remember('items', id);
    data.items[id] = { ...item, pinUntil: pinUntil || 0, updatedAt: now() };
    commit();
  });
}

export function followedUp(id) {
  return batch('Followed up', () => {
    const item = data.items[id];
    if (!item) return;
    remember('items', id);
    data.items[id] = { ...item, followedUpAt: now(), updatedAt: now() };
    commit();
  });
}

export function followUpLater(id, until) {
  return batch('Follow-up moved', () => {
    const item = data.items[id];
    if (!item) return;
    remember('items', id);
    data.items[id] = { ...item, followUpAfter: until, updatedAt: now() };
    commit();
  });
}

export function markAnswered(id, answerNote = '') {
  return batch('Marked answered', () => {
    const item = data.items[id];
    if (!item) return;
    remember('items', id);
    data.items[id] = { ...item, answeredAt: now(), answerNote, updatedAt: now(), sharedAt: now() };
    commit();
  });
}

export function unmarkAnswered(id) {
  return batch('Moved back to praying', () => {
    const item = data.items[id];
    if (!item) return;
    remember('items', id);
    data.items[id] = { ...item, answeredAt: 0, answerNote: '', updatedAt: now(), sharedAt: now() };
    commit();
  });
}

// ---- Shared lists (iCloud) ----

// Changes that arrive from other people. Like a sync merge, they are not
// undoable; `fn` edits the data and returns whether anything changed.
export function applyRemote(fn) {
  if (fn(data)) {
    write(DATA_KEY, data);
    emit('remote');
  }
}

// ---- Devotion: reading plans and the journal ----

export function addPlan(fields) {
  return batch('Plan added', () => {
    const id = uid('plan');
    remember('plans', id);
    data.plans[id] = { ...fields, id, ticks: {}, createdAt: now(), updatedAt: now() };
    commit();
    return id;
  });
}

export function removePlan(id) {
  return batch('Plan removed', () => {
    remember('plans', id);
    data.plans[id] = { id, deleted: true, updatedAt: now() };
    commit();
  });
}

// Starting again is a fresh plan, so old ticks on another device can't
// come back through the merge.
export function restartPlan(id, start) {
  return batch('Plan restarted', () => {
    const { kind, books, perDay, pace } = data.plans[id];
    remember('plans', id);
    data.plans[id] = { id, deleted: true, updatedAt: now() };
    const next = uid('plan');
    remember('plans', next);
    data.plans[next] = { kind, books, perDay, pace, start, id: next, ticks: {}, createdAt: now(), updatedAt: now() };
    commit();
    return next;
  });
}

export function setPlan(id, patch) {
  return batch('Plan saved', () => {
    remember('plans', id);
    data.plans[id] = { ...data.plans[id], ...patch, updatedAt: now() };
    commit();
  });
}

// Ticks are quick to change back, so they are not part of undo.
export function tick(id, keys, on) {
  const plan = data.plans[id];
  if (!plan || plan.deleted) return;
  const t = now();
  const ticks = { ...plan.ticks };
  for (const k of keys) ticks[k] = { on, at: t };
  data.plans[id] = { ...plan, ticks, updatedAt: t };
  commit();
}

// One journal page per day, keyed by its date ("2026-10-25"). Typing saves
// as you go, so it is not undoable either.
export function saveJournal(day, patch) {
  const prev = data.journal[day];
  data.journal[day] = { text: '', photos: [], ...(prev && !prev.deleted ? prev : {}), ...patch, id: day, updatedAt: now() };
  commit();
}
