// End-to-end encryption for sync, using the browser's Web Crypto.
// The passphrase never leaves the device. It is stretched into a 256-bit
// AES-GCM key with PBKDF2 (SHA-256, 600,000 rounds, random salt), and every
// upload gets a fresh random IV. GitHub only ever stores the sealed envelope.

export const ITERATIONS = 600000;
export const MIN_PASSPHRASE = 10;
const MIN_ITERATIONS = 100000; // refuse weaker settings from a tampered envelope
const AAD = new TextEncoder().encode('letspray:v1');

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// iPhone keyboards turn ' into ’ and -- into —, a Mac may not, and accented
// letters can be stored two ways. Normalise so the same passphrase typed on
// either device gives the same key.
export function normalisePassphrase(p) {
  return String(p)
    .normalize('NFKC')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export const isEnvelope = (x) => !!x && x.letspray === 'encrypted' && x.v === 1 && typeof x.data === 'string';

export const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

export async function deriveKey(passphrase, salt, iterations = ITERATIONS) {
  if (!(iterations >= MIN_ITERATIONS)) throw new Error('Unsafe encryption settings');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalisePassphrase(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable: the raw key can never be read back out
    ['encrypt', 'decrypt'],
  );
}

export async function seal(value, { key, salt, iterations }) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { letspray: 'encrypted', v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt }, cipher: 'AES-GCM', iv: b64(iv), data: b64(data) };
}

// Throws if the key is wrong or the envelope was altered (GCM checks both).
export async function unseal(envelope, key) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv), additionalData: AAD }, key, unb64(envelope.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

// The key for an envelope, checking its settings are ones we would write.
export async function envelopeKey(envelope, passphrase) {
  const { kdf } = envelope;
  if (!kdf || kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256') throw new Error('Unsafe encryption settings');
  return deriveKey(passphrase, kdf.salt, kdf.iterations);
}
