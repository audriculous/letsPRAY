// Journal photos. They stay on the device that took them (in IndexedDB),
// shrunk to a sensible size; the journal entry only lists them, with any
// text read from them, so that text syncs while the pictures do not.
import { run } from './db.js';

const MAX = 1600; // longest side, plenty to read a page
const QUALITY = 0.82;

// Draws the picked file onto a canvas: it comes out upright (browsers apply
// the camera's rotation) and much smaller than the original.
export async function shrink(file) {
  const img = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      URL.revokeObjectURL(url);
      resolve(el);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That photo could not be opened'));
    };
    el.src = url;
  });
  const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('That photo could not be saved');
  return { blob, w, h };
}

export const savePhoto = (id, blob) => run('photos', 'readwrite', (s) => s.put(blob, id));
export const removePhoto = (id) => run('photos', 'readwrite', (s) => s.delete(id)).catch(() => {});

export async function getPhoto(id) {
  try {
    return (await run('photos', 'readonly', (s) => s.get(id))) || null;
  } catch {
    return null;
  }
}

// Object URLs for showing photos, made once per photo.
const urls = new Map();
export async function photoURL(id) {
  if (urls.has(id)) return urls.get(id);
  const blob = await getPhoto(id);
  const url = blob ? URL.createObjectURL(blob) : '';
  if (url) urls.set(id, url);
  return url;
}

export const toDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export const fromDataURL = async (url) => (await fetch(url)).blob();

// ---------- Reading the text (OCR) ----------
// In the App Store app, Apple's Vision reads it on the device, handwriting
// included. On the web, Tesseract.js does it in the browser: good with print,
// patchier with handwriting. It downloads once (about 10 MB) the first time.

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const native = () => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.LetsPrayOCR : undefined);
export const ocrIsNative = () => !!native();

let worker;
let progressFn;
let failCurrent;
const TIMEOUT = 120000;
async function tesseract(onProgress) {
  if (!window.Tesseract) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESSERACT;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the text reader. Check you are online and try again.'));
      document.head.appendChild(s);
    });
  }
  progressFn = onProgress;
  worker ||= window.Tesseract.createWorker('eng', 1, {
    logger: (m) => m.status === 'recognizing text' && progressFn?.(m.progress),
    // A failed download inside the reader would otherwise leave it waiting forever.
    errorHandler: (err) => failCurrent?.(err),
  }).catch((err) => {
    worker = null;
    throw err;
  });
  return worker;
}

// Tidies what comes back: joins lines broken mid-sentence, keeps paragraphs.
export function tidyText(raw = '') {
  return raw
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export async function readText(blob, onProgress) {
  const plugin = native();
  if (plugin) {
    const { text } = await plugin.recognize({ image: await toDataURL(blob) });
    return tidyText(text);
  }
  let timer;
  const stop = new Promise((_, reject) => {
    failCurrent = () => reject(new Error('Could not load the text reader. Check you are online and try again.'));
    timer = setTimeout(() => reject(new Error('Reading took too long. Try again, or a closer photo.')), TIMEOUT);
  });
  try {
    const w = await Promise.race([tesseract(onProgress), stop]);
    const { data } = await Promise.race([w.recognize(blob), stop]);
    return tidyText(data.text);
  } catch (err) {
    // Start the reader afresh next time.
    worker?.then?.((w) => w.terminate()).catch(() => {});
    worker = null;
    throw err;
  } finally {
    clearTimeout(timer);
    failCurrent = null;
  }
}
