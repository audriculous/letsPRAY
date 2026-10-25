// Sync between devices through one secret GitHub Gist, end-to-end encrypted.
// Each device keeps a full copy; a sync pulls the gist, decrypts it, merges
// record by record (latest edit wins), saves locally and pushes back an
// encrypted copy if anything changed. Nothing readable is ever uploaded.
//
// GitHub keeps every revision of a gist, so whenever the encryption changes
// (first passphrase, new passphrase, or moving off an old unencrypted gist)
// the data goes into a brand new gist and the old ones are deleted, history
// and all.
import { merge, fingerprint, normalise } from './model.js';
import { getData, getPrefs, replaceData, setPrefs, subscribe } from './store.js';
import { ITERATIONS, isEnvelope, newSalt, deriveKey, envelopeKey, seal, unseal } from './crypto.js';
import { loadKey, saveKey, clearKey } from './keystore.js';

const API = 'https://api.github.com';
const FILE = 'letspray-data.json';
const DESCRIPTION = 'Let’s Pray sync (end-to-end encrypted)';

let status = { state: 'off', message: '', at: 0 };
const statusListeners = new Set();
let running = null;
let again = false;
let pushTimer = null;

class SyncError extends Error {
  constructor(message, code = '') {
    super(message);
    this.code = code;
  }
}

export const getStatus = () => status;
export function onStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
function setStatus(state, message = '', extra = {}) {
  status = { state, message, at: Date.now(), ...extra };
  for (const fn of statusListeners) fn(status);
}

async function gh(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 401) throw new SyncError('GitHub didn’t accept the token', 'auth');
  if (res.status === 404) throw new SyncError('Sync data not found on GitHub', 'missing');
  if (!res.ok) throw new SyncError(`GitHub error ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function readGist(token, id) {
  const gist = await gh(`/gists/${id}`, { token });
  const file = gist.files?.[FILE];
  if (!file) return null;
  let text = file.content;
  if (file.truncated) text = await (await fetch(file.raw_url, { cache: 'no-store' })).text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function ourGists(token) {
  const ids = [];
  for (let page = 1; page <= 5; page += 1) {
    const list = await gh(`/gists?per_page=100&page=${page}`, { token });
    ids.push(...list.filter((g) => g.files && g.files[FILE]).map((g) => g.id));
    if (list.length < 100) break;
  }
  return ids;
}

// Puts `data` in a new encrypted gist and deletes every other copy.
async function replaceGist(token, record, data) {
  const old = await ourGists(token);
  const created = await gh('/gists', {
    token,
    method: 'POST',
    body: { description: DESCRIPTION, public: false, files: { [FILE]: { content: JSON.stringify(await seal(data, record)) } } },
  });
  for (const id of old) {
    if (id === created.id) continue;
    await gh(`/gists/${id}`, { token, method: 'DELETE' }).catch((err) => {
      if (err.code !== 'missing') throw err;
    });
  }
  await saveKey(record);
  setPrefs({ sync: { token, gistId: created.id } });
}

async function freshRecord(passphrase) {
  const salt = newSalt();
  return { key: await deriveKey(passphrase, salt, ITERATIONS), salt, iterations: ITERATIONS };
}

// First connection on a device, or unlocking one that needs the passphrase.
export async function connect(token, passphrase) {
  token = token.trim();
  setStatus('syncing', 'Connecting…');
  try {
    const [id] = await ourGists(token);
    const raw = id ? await readGist(token, id) : null;
    if (isEnvelope(raw)) {
      setStatus('syncing', 'Checking passphrase…');
      const key = await envelopeKey(raw, passphrase);
      setPrefs({ sync: { token, gistId: id } });
      try {
        await unseal(raw, key);
      } catch {
        await clearKey();
        throw new SyncError('That passphrase doesn’t match the one your other devices use.', 'mismatch');
      }
      await saveKey({ key, salt: raw.kdf.salt, iterations: raw.kdf.iterations });
    } else {
      // Nothing yet, or an unencrypted gist from before: encrypt everything
      // into a new gist and delete the old one.
      setStatus('syncing', 'Encrypting…');
      const data = raw ? merge(getData(), normalise(raw)) : getData();
      if (raw) replaceData(data, { silent: true });
      await replaceGist(token, await freshRecord(passphrase), data);
    }
    await syncNow();
  } catch (err) {
    setStatus(err.code === 'mismatch' ? 'locked' : 'error', err.message || 'Could not connect');
    throw err;
  }
}

export const unlock = (passphrase) => connect(getPrefs().sync.token, passphrase);

// A new passphrase, chosen on purpose or because the old one was forgotten.
// This device's prayers become the sync copy; other devices ask for the new
// passphrase and merge their own copies back in, so nothing is lost.
export async function changePassphrase(passphrase) {
  const cfg = getPrefs().sync;
  if (status.state !== 'locked') await syncNow();
  setStatus('syncing', 'Encrypting with your new passphrase…');
  try {
    await replaceGist(cfg.token, await freshRecord(passphrase), getData());
    await syncNow();
  } catch (err) {
    setStatus('error', err.message || 'Could not change passphrase');
    throw err;
  }
}

export async function disconnect() {
  setPrefs({ sync: null });
  await clearKey();
  setStatus('off');
}

export function syncNow() {
  if (running) {
    // Edits made mid-sync still need pushing, so go round once more.
    again = true;
    return running;
  }
  running = doSync().finally(() => {
    running = null;
    if (again) {
      again = false;
      syncNow();
    }
  });
  return running;
}

async function doSync(retried = false) {
  const cfg = getPrefs().sync;
  if (!cfg) return setStatus('off');
  const record = await loadKey();
  if (!record) {
    // Synced before encryption existed? Then this is a new passphrase to choose.
    const raw = navigator.onLine ? await readGist(cfg.token, cfg.gistId).catch(() => undefined) : undefined;
    if (raw !== undefined && !isEnvelope(raw)) return setStatus('locked', 'Sync now encrypts everything. Choose a passphrase to turn it back on.', { setup: true });
    return setStatus('locked', 'Enter your sync passphrase to keep syncing.');
  }
  if (!navigator.onLine) return setStatus('offline', 'Offline, will sync later');
  setStatus('syncing', 'Syncing…');
  try {
    let raw;
    try {
      raw = await readGist(cfg.token, cfg.gistId);
    } catch (err) {
      // Another device moved the data to a new gist: follow it.
      if (err.code !== 'missing' || retried) throw err;
      const [id] = await ourGists(cfg.token);
      if (!id) throw new SyncError('Sync data not found on GitHub. Disconnect, then connect again.');
      setPrefs({ sync: { ...cfg, gistId: id } });
      return doSync(true);
    }

    let remote = null;
    if (isEnvelope(raw)) {
      if (raw.kdf?.salt !== record.salt) {
        await clearKey();
        return setStatus('locked', 'Your sync passphrase was changed on another device. Enter the new one.');
      }
      try {
        remote = await unseal(raw, record.key);
      } catch {
        await clearKey();
        return setStatus('locked', 'This device can no longer open your sync data. Enter your passphrase again.');
      }
    } else if (raw) {
      // Unencrypted data written by an older version: take it in, then
      // replace it with an encrypted copy and remove its readable history.
      const merged = merge(getData(), normalise(raw));
      replaceData(merged, { silent: true });
      await replaceGist(cfg.token, record, merged);
      return setStatus('ok', 'Up to date');
    }

    const remoteData = normalise(remote);
    const local = getData();
    const merged = merge(local, remoteData);
    const mergedFp = fingerprint(merged);
    if (mergedFp !== fingerprint(local)) replaceData(merged, { silent: true });
    if (!remote || mergedFp !== fingerprint(remoteData)) {
      await gh(`/gists/${cfg.gistId}`, {
        token: cfg.token,
        method: 'PATCH',
        body: { description: DESCRIPTION, files: { [FILE]: { content: JSON.stringify(await seal(merged, record)) } } },
      });
    }
    setStatus('ok', 'Up to date');
  } catch (err) {
    setStatus('error', err.message || 'Sync failed');
  }
}

export function initSync() {
  // Push local edits a few seconds after they stop.
  subscribe((kind) => {
    if (kind !== 'local' || !getPrefs().sync) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, 2500);
  });
  // Pull when the app returns to the foreground; flush pending edits when it
  // is hidden, because iOS may suspend it soon after.
  document.addEventListener('visibilitychange', () => {
    if (!getPrefs().sync) return;
    const hidden = document.visibilityState === 'hidden';
    if (hidden && !pushTimer) return;
    clearTimeout(pushTimer);
    pushTimer = null;
    syncNow();
  });
  window.addEventListener('online', () => getPrefs().sync && syncNow());
  if (getPrefs().sync) syncNow();
}
