// App state: one data blob in localStorage plus device-only prefs.
import { normalise, uid, dayKey, activeCategories } from './model.js';

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

// ---- Categories ----

export function saveCategory(fields) {
  const id = fields.id || uid('cat');
  const prev = data.categories[id];
  const order = prev ? prev.order : activeCategories(data).length;
  data.categories[id] = { perSession: 2, ...prev, ...fields, id, order, updatedAt: now() };
  commit();
  return id;
}

export function deleteCategory(id) {
  // Points in the category go with it, as tombstones.
  for (const item of Object.values(data.items)) {
    if (item.categoryId === id && !item.deleted) data.items[item.id] = { id: item.id, deleted: true, updatedAt: now() };
  }
  data.categories[id] = { id, deleted: true, updatedAt: now() };
  commit();
}

export function reorderCategories(ids) {
  ids.forEach((id, order) => {
    const cat = data.categories[id];
    if (cat && cat.order !== order) data.categories[id] = { ...cat, order, updatedAt: now() };
  });
  commit();
}

// ---- Prayer points ----

export function saveItem(fields) {
  const id = fields.id || uid('pt');
  const prev = data.items[id];
  data.items[id] = {
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
  commit();
  return id;
}

export function deleteItem(id) {
  data.items[id] = { id, deleted: true, updatedAt: now() };
  commit();
}

export function markPrayed(id) {
  const item = data.items[id];
  if (!item) return;
  const t = now();
  data.items[id] = { ...item, lastPrayedAt: t, prayedCount: (item.prayedCount || 0) + 1, updatedAt: t };
  data.days[dayKey(t)] = true;
  commit();
}

export function markAnswered(id, answerNote = '') {
  const item = data.items[id];
  if (!item) return;
  data.items[id] = { ...item, answeredAt: now(), answerNote, updatedAt: now() };
  commit();
}

export function unmarkAnswered(id) {
  const item = data.items[id];
  if (!item) return;
  data.items[id] = { ...item, answeredAt: 0, answerNote: '', updatedAt: now() };
  commit();
}
