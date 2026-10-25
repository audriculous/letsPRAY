import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveKey, seal, unseal, envelopeKey, isEnvelope, newSalt, normalisePassphrase, ITERATIONS } from '../js/crypto.js';

const secret = { items: { a: { title: 'Mum’s surgery', notes: 'Biopsy results' } } };
const PASS = 'kettle orbit tulip bramble';

test('round trip with the same passphrase', async () => {
  const salt = newSalt();
  const key = await deriveKey(PASS, salt);
  const env = await seal(secret, { key, salt, iterations: ITERATIONS });
  assert.ok(isEnvelope(env));
  assert.deepEqual(await unseal(env, await envelopeKey(env, PASS)), secret);
});

test('the envelope contains nothing readable', async () => {
  const salt = newSalt();
  const env = await seal(secret, { key: await deriveKey(PASS, salt), salt, iterations: ITERATIONS });
  const text = JSON.stringify(env);
  for (const word of ['Mum', 'surgery', 'Biopsy', 'items', 'title']) assert.ok(!text.includes(word), word);
  assert.equal(env.kdf.iterations, 600000);
});

test('each upload uses a fresh IV', async () => {
  const salt = newSalt();
  const record = { key: await deriveKey(PASS, salt), salt, iterations: ITERATIONS };
  const a = await seal(secret, record);
  const b = await seal(secret, record);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.data, b.data);
});

test('wrong passphrase fails', async () => {
  const salt = newSalt();
  const env = await seal(secret, { key: await deriveKey(PASS, salt), salt, iterations: ITERATIONS });
  await assert.rejects(unseal(env, await envelopeKey(env, 'kettle orbit tulip brambles')));
});

test('tampered data fails', async () => {
  const salt = newSalt();
  const key = await deriveKey(PASS, salt);
  const env = await seal(secret, { key, salt, iterations: ITERATIONS });
  const bytes = Buffer.from(env.data, 'base64');
  bytes[5] ^= 1;
  await assert.rejects(unseal({ ...env, data: bytes.toString('base64') }, key));
});

test('weakened settings in an envelope are refused', async () => {
  const salt = newSalt();
  const env = await seal(secret, { key: await deriveKey(PASS, salt), salt, iterations: ITERATIONS });
  await assert.rejects(envelopeKey({ ...env, kdf: { ...env.kdf, iterations: 1000 } }, PASS));
  await assert.rejects(envelopeKey({ ...env, kdf: { ...env.kdf, hash: 'SHA-1' } }, PASS));
});

test('iPhone smart punctuation gives the same key as a Mac keyboard', async () => {
  assert.equal(normalisePassphrase('  God’s   “grace” — enough '), normalisePassphrase('God\'s "grace" - enough'));
  const salt = newSalt();
  const env = await seal(secret, { key: await deriveKey('God’s grace—always', salt), salt, iterations: ITERATIONS });
  assert.deepEqual(await unseal(env, await envelopeKey(env, "God's grace-always")), secret);
});
