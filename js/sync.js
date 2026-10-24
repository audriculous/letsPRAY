// Sync between devices through one private GitHub Gist.
// Each device keeps a full copy; a sync pulls the gist, merges record by
// record (latest edit wins), saves locally and pushes back if anything changed.
import { merge, fingerprint, normalise } from './model.js';
import { getData, getPrefs, replaceData, setPrefs, subscribe } from './store.js';

const API = 'https://api.github.com';
const FILE = 'letspray-data.json';
const DESCRIPTION = 'LetsPray sync data (private)';

let status = { state: 'off', message: '', at: 0 };
const statusListeners = new Set();
let running = null;
let again = false;
let pushTimer = null;

export const getStatus = () => status;
export function onStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
function setStatus(state, message = '') {
  status = { state, message, at: Date.now() };
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
  if (!res.ok) {
    const hint = res.status === 401 ? 'Token not accepted' : res.status === 404 ? 'Sync gist not found' : `GitHub error ${res.status}`;
    throw new Error(hint);
  }
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

async function findOrCreateGist(token) {
  for (let page = 1; page <= 5; page += 1) {
    const list = await gh(`/gists?per_page=100&page=${page}`, { token });
    const hit = list.find((g) => g.files && g.files[FILE]);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  const created = await gh('/gists', {
    token,
    method: 'POST',
    body: { description: DESCRIPTION, public: false, files: { [FILE]: { content: JSON.stringify(getData()) } } },
  });
  return created.id;
}

export async function connect(token) {
  token = token.trim();
  setStatus('syncing', 'Connecting…');
  try {
    const gistId = await findOrCreateGist(token);
    setPrefs({ sync: { token, gistId } });
    await syncNow();
  } catch (err) {
    setStatus('error', err.message);
    throw err;
  }
}

export function disconnect() {
  setPrefs({ sync: null });
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

async function doSync() {
  const cfg = getPrefs().sync;
  if (!cfg) return setStatus('off');
  if (!navigator.onLine) return setStatus('offline', 'Offline, will sync later');
  setStatus('syncing', 'Syncing…');
  try {
    const remoteRaw = await readGist(cfg.token, cfg.gistId);
    const remote = normalise(remoteRaw);
    const local = getData();
    const merged = merge(local, remote);
    const mergedFp = fingerprint(merged);
    if (mergedFp !== fingerprint(local)) replaceData(merged, { silent: true });
    if (!remoteRaw || mergedFp !== fingerprint(remote)) {
      await gh(`/gists/${cfg.gistId}`, {
        token: cfg.token,
        method: 'PATCH',
        body: { files: { [FILE]: { content: JSON.stringify(merged) } } },
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
