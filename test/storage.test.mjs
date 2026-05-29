import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_DAYS, DEFAULT_RETRIEVALS, MAX_DAYS, MAX_RETRIEVALS, MAX_SECRET_CHARS, assertRequiredConfiguration, parsePositiveInteger, validateSecretInput, ValidationError } from '../dist/storage.js';
import { dictionary, LANGUAGES, normalizeLanguage } from '../dist/i18n.js';
import { resolveRevealLanguage } from '../dist/index.js';
import { createPage, revealPage } from '../dist/html.js';
import { decryptText, encryptText, PBKDF2_ITERATIONS } from '../dist/crypto.js';

test('uses defaults and normalizes language', () => {
  assert.deepEqual(validateSecretInput({ secret: 'hello' }), {
    secret: 'hello',
    days: DEFAULT_DAYS,
    retrievals: DEFAULT_RETRIEVALS,
    language: 'en'
  });
});

test('caps days and retrieval limits', () => {
  assert.deepEqual(validateSecretInput({ secret: 'hello', days: 99, retrievals: 999, language: 'fr' }), {
    secret: 'hello',
    days: MAX_DAYS,
    retrievals: MAX_RETRIEVALS,
    language: 'fr'
  });
});

test('rejects empty or oversized secrets', () => {
  assert.throws(() => validateSecretInput({ secret: '' }), ValidationError);
  assert.throws(() => validateSecretInput({ secret: 'x'.repeat(MAX_SECRET_CHARS + 1) }), ValidationError);
});

test('parses positive integers with fallback', () => {
  assert.equal(parsePositiveInteger('7', 3, 10), 7);
  assert.equal(parsePositiveInteger('not-a-number', 3, 10), 3);
  assert.equal(parsePositiveInteger('-2', 3, 10), 1);
  assert.equal(parsePositiveInteger('100', 3, 10), 10);
});


test('supports all configured interface languages', () => {
  const codes = LANGUAGES.map((language) => language.code);
  assert.deepEqual(codes, ['en', 'gr', 'pl', 'is', 'cn', 'fr', 'es', 'de', 'he', 'sv', 'sr']);
  for (const code of codes) {
    assert.ok(dictionary[code], `missing dictionary for ${code}`);
    assert.equal(normalizeLanguage(code.toUpperCase()), code);
  }
});


test('reveal pages respect explicit language query over stored secret language', () => {
  assert.equal(resolveRevealLanguage(new URL('https://example.com/s/secret-id?lang=de'), 'fr'), 'de');
  assert.equal(resolveRevealLanguage(new URL('https://example.com/s/secret-id'), 'fr'), 'fr');
  assert.equal(resolveRevealLanguage(new URL('https://example.com/s/secret-id?lang=he'), undefined), 'he');
});


test('rendered inline scripts are valid JavaScript', () => {
  for (const html of [createPage('en', 'site-key'), revealPage('he', null)]) {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    assert.ok(scripts.length > 0);
    for (const script of scripts) new Function(script);
  }
});


test('reports actionable configuration errors for missing Cloudflare setup', () => {
  assert.throws(
    () => assertRequiredConfiguration({ ENCRYPTION_KEY: 'long-enough-secret' }),
    /Cloudflare KV binding SECRETS is not configured/
  );

  assert.throws(
    () => assertRequiredConfiguration({ SECRETS: { get() {}, put() {}, delete() {} }, ENCRYPTION_KEY: '' }),
    /Worker secret ENCRYPTION_KEY is not configured/
  );
});

test('worker responses expose actionable create-secret failure details', async () => {
  const worker = (await import('../dist/index.js')).default;
  const request = new Request('https://example.com/api/secrets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: 'hello' })
  });

  const missingConfigResponse = await worker.fetch(request.clone(), {});
  assert.equal(missingConfigResponse.status, 500);
  assert.match((await missingConfigResponse.json()).error, /Cloudflare KV binding SECRETS/);

  const kvFailureResponse = await worker.fetch(request.clone(), {
    ENCRYPTION_KEY: 'this-is-at-least-sixteen-characters',
    SECRETS: {
      async get() { return null; },
      async put() { throw new Error('simulated KV write failure'); },
      async delete() {}
    }
  });
  assert.equal(kvFailureResponse.status, 500);
  const body = await kvFailureResponse.json();
  assert.equal(body.error, 'Server error while processing the request.');
  assert.match(body.details, /simulated KV write failure/);
});

test('health reports missing configuration details', async () => {
  const worker = (await import('../dist/index.js')).default;
  const response = await worker.fetch(new Request('https://example.com/health'), {});
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.match(body.error, /Cloudflare KV binding SECRETS/);
});


test('PBKDF2 settings stay within Cloudflare Workers runtime limits', async () => {
  assert.equal(PBKDF2_ITERATIONS, 100_000);
  const encrypted = await encryptText('cloudflare-compatible secret', 'this-is-at-least-sixteen-characters');
  assert.equal(await decryptText(encrypted.ciphertext, encrypted.iv, encrypted.salt, 'this-is-at-least-sixteen-characters'), 'cloudflare-compatible secret');
});
