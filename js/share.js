// Shared lists through iCloud (in the App Store app). Each shared list is a
// CloudKit zone: the owner's lives in their private database, and everyone
// they invite sees it in their shared database. The native side
// (CloudSharePlugin.swift) moves records; this file decides what to send and
// how to fold in what arrives. Latest edit wins, record by record, using
// sharedAt, so only the shared fields travel and personal ones stay put.
import { live, uid, SHARED_ITEM_FIELDS, SHARED_LIST_FIELDS } from './model.js';

const CS = () => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.CloudShare : undefined);
export const canShare = () => !!CS();

export const sharedAtOf = (rec) => rec?.sharedAt || rec?.updatedAt || 0;
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const parse = (json, keys) => {
  try {
    return pick(JSON.parse(json || '{}'), keys);
  } catch {
    return {};
  }
};

export const newZone = () => uid('list');
export const zoneOf = (cat) => cat?.share?.zone;

// Records to send for one shared list: its details and any prayer points
// changed since `since`, plus removals for points that have left the list.
export function outgoing(data, cat, { since = 0, sentIds = [] } = {}, now = Date.now()) {
  const out = [];
  if (sharedAtOf(cat) > since) {
    out.push({ id: 'list', type: 'List', json: JSON.stringify({ ...pick(cat, SHARED_LIST_FIELDS), catId: cat.id }), sharedAt: sharedAtOf(cat), deleted: false });
  }
  const here = new Set();
  for (const item of Object.values(data.items)) {
    if (item.categoryId !== cat.id) continue;
    here.add(item.id);
    if (sharedAtOf(item) <= since) continue;
    out.push({
      id: item.id,
      type: 'Prayer',
      json: item.deleted ? '{}' : JSON.stringify(pick(item, SHARED_ITEM_FIELDS)),
      sharedAt: sharedAtOf(item),
      deleted: !!item.deleted,
    });
  }
  // Moved to another list since last time: gone for everyone else.
  for (const id of sentIds) if (!here.has(id)) out.push({ id, type: 'Prayer', json: '{}', sharedAt: now, deleted: true });
  return out;
}

// Folds one list's incoming records into `data`. Returns how many changed.
export function applyIncoming(data, catId, records, now = Date.now()) {
  let changed = 0;
  for (const r of records) {
    if (r.type === 'List') {
      const cat = data.categories[catId];
      if (cat && r.sharedAt > sharedAtOf(cat)) {
        data.categories[catId] = { ...cat, ...parse(r.json, SHARED_LIST_FIELDS), sharedAt: r.sharedAt, updatedAt: now };
        changed += 1;
      }
      continue;
    }
    const local = data.items[r.id];
    if (local && r.sharedAt <= sharedAtOf(local)) continue;
    // Moved into one of my own lists: it is no longer part of this one.
    if (local && !local.deleted && local.categoryId !== catId) continue;
    if (r.deleted) {
      if (local && !local.deleted) {
        data.items[r.id] = { id: r.id, deleted: true, categoryId: catId, sharedAt: r.sharedAt, updatedAt: now };
        changed += 1;
      }
      continue;
    }
    const personal = local && !local.deleted ? local : { lastPrayedAt: 0, prayedCount: 0, createdAt: now };
    data.items[r.id] = {
      tags: [],
      notes: '',
      answeredAt: 0,
      answerNote: '',
      ...personal,
      ...parse(r.json, SHARED_ITEM_FIELDS),
      id: r.id,
      categoryId: catId,
      sharedAt: r.sharedAt,
      updatedAt: now,
    };
    changed += 1;
  }
  return changed;
}

// The local list for a zone, creating it the first time a zone arrives
// (someone shared a list with me, or I shared it from another device).
export function listForZone(data, zone, now = Date.now()) {
  const found = Object.values(data.categories).find((c) => live(c) && c.share?.zone === zone.zone);
  if (found) return { id: found.id, created: false };
  const meta = zone.records.find((r) => r.type === 'List');
  const details = meta ? parse(meta.json, [...SHARED_LIST_FIELDS, 'catId']) : {};
  const mine = zone.scope === 'private';
  // My own list keeps its id across my devices; someone else's gets one tied
  // to the zone, so it can never collide with a list of mine.
  const id = mine && details.catId ? details.catId : `sh-${zone.zone}`;
  const order = Object.values(data.categories).filter(live).length;
  data.categories[id] = {
    ...(data.categories[id] && live(data.categories[id]) ? data.categories[id] : { perSession: 2 }),
    name: details.name || zone.title || 'Shared list',
    icon: details.icon || 'people',
    color: details.color || 'teal',
    order,
    id,
    share: { zone: zone.zone, scope: zone.scope, ownerName: zone.ownerName, owner: zone.ownerDisplay || '', role: mine ? 'owner' : 'member' },
    sharedAt: meta?.sharedAt || 0,
    updatedAt: now,
  };
  return { id, created: true };
}

// ---------- The sync cycle ----------
// `store` is the app's store module; `state` is this device's record of
// what it has already sent ({ [zone]: { since, ids } }), kept in prefs.

export async function syncShared(store) {
  const plugin = CS();
  if (!plugin) return { joined: [], gone: [] };
  const data = store.getData();
  const shared = Object.values(data.categories).filter((c) => live(c) && c.share && !c.share.gone);
  const known = shared.map((c) => ({ zone: c.share.zone, scope: c.share.scope, ownerName: c.share.ownerName }));
  const result = await plugin.pull({ zones: known });

  const joined = [];
  const gone = [];
  store.applyRemote((d) => {
    let changed = 0;
    for (const zone of result.zones || []) {
      if (!zone.records.length && !zone.isNew) continue;
      const { id, created } = listForZone(d, zone);
      if (created) {
        changed += 1;
        if (zone.scope === 'shared') joined.push({ id, name: d.categories[id].name, owner: d.categories[id].share.owner });
      }
      changed += applyIncoming(d, id, zone.records);
    }
    for (const z of result.gone || []) {
      const cat = Object.values(d.categories).find((c) => live(c) && c.share?.zone === z);
      if (cat) {
        // Keep the prayers; the list just stops being shared.
        d.categories[cat.id] = { ...cat, share: { ...cat.share, gone: true }, updatedAt: Date.now() };
        gone.push({ id: cat.id, name: cat.name, owner: cat.share.owner, role: cat.share.role });
        changed += 1;
      }
    }
    return changed;
  });

  // Send what changed here since last time.
  const state = { ...(store.getPrefs().shareState || {}) };
  for (const cat of Object.values(store.getData().categories)) {
    if (!live(cat) || !cat.share || cat.share.gone) continue;
    const zone = cat.share.zone;
    const mark = state[zone] || { since: 0, ids: [] };
    const records = outgoing(store.getData(), cat, { since: mark.since, sentIds: mark.ids });
    if (records.length) await plugin.push({ zone, scope: cat.share.scope, ownerName: cat.share.ownerName, records });
    const ids = Object.values(store.getData().items).filter((i) => i.categoryId === cat.id && live(i)).map((i) => i.id);
    state[zone] = { since: Math.max(mark.since, ...records.map((r) => r.sharedAt)), ids };
  }
  store.setPrefs({ shareState: state });
  return { joined, gone };
}

// Share one of my lists: give it a zone, send everything, then show the
// iOS sharing sheet (Messages, Mail, copy link; add or remove people).
export async function shareList(store, catId) {
  const cat = store.getData().categories[catId];
  const zone = cat.share?.zone || newZone();
  store.applyRemote((d) => {
    d.categories[catId] = { ...d.categories[catId], share: { zone, scope: 'private', ownerName: '', owner: '', role: 'owner' }, sharedAt: Date.now(), updatedAt: Date.now() };
    return true;
  });
  const records = outgoing(store.getData(), store.getData().categories[catId]);
  await CS().share({ zone, title: cat.name, records });
  const ids = records.filter((r) => r.type === 'Prayer' && !r.deleted).map((r) => r.id);
  store.setPrefs({ shareState: { ...(store.getPrefs().shareState || {}), [zone]: { since: Math.max(0, ...records.map((r) => r.sharedAt)), ids } } });
}

export const manageSharing = (cat) => CS().manage({ zone: cat.share.zone, scope: cat.share.scope, ownerName: cat.share.ownerName });

// Owner stops sharing (or deletes the list): everyone else keeps a copy.
export async function stopSharing(store, cat) {
  try {
    await CS().stopSharing({ zone: cat.share.zone });
  } finally {
    forget(store, cat);
  }
}

// Someone else's list: leave it and remove it from my lists.
export async function leaveList(store, cat) {
  try {
    await CS().leave({ zone: cat.share.zone, scope: 'shared', ownerName: cat.share.ownerName });
  } catch {
    // Already gone from iCloud (removed from the sheet, or the owner stopped).
  }
  forget(store, cat);
}

export function forget(store, cat) {
  store.applyRemote((d) => {
    const c = d.categories[cat.id];
    if (c) d.categories[cat.id] = { ...c, share: null, updatedAt: Date.now() };
    return true;
  });
  const state = { ...(store.getPrefs().shareState || {}) };
  delete state[cat.share.zone];
  store.setPrefs({ shareState: state });
}

export const onShareEvents = (handlers) => {
  const plugin = CS();
  if (!plugin) return;
  for (const [name, fn] of Object.entries(handlers)) plugin.addListener(name, fn);
};

export const iCloudStatus = async () => {
  try {
    return (await CS().status()).status;
  } catch {
    return 'unknown';
  }
};
