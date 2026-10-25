// Keeps the sync key on this device in IndexedDB. The key is a non-extractable
// CryptoKey, so it can be used to encrypt and decrypt but not read or copied
// out, and the passphrase itself is never stored.
const DB = 'letspray';
const STORE = 'keys';
const ID = 'sync';

let cached; // { key, salt, iterations } once loaded

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadKey() {
  if (cached !== undefined) return cached;
  try {
    cached = (await run('readonly', (s) => s.get(ID))) || null;
  } catch {
    cached = null;
  }
  return cached;
}

export async function saveKey(record) {
  cached = record;
  try {
    await run('readwrite', (s) => s.put(record, ID));
  } catch {
    // Private browsing can block IndexedDB; the key then lasts for this visit.
  }
}

export async function clearKey() {
  cached = null;
  try {
    await run('readwrite', (s) => s.delete(ID));
  } catch {
    // nothing stored
  }
}
