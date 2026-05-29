import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_DAYS, DEFAULT_RETRIEVALS, MAX_DAYS, MAX_RETRIEVALS, MAX_SECRET_CHARS, parsePositiveInteger, validateSecretInput, ValidationError } from '../dist/storage.js';
import { dictionary, LANGUAGES, normalizeLanguage } from '../dist/i18n.js';
import { resolveRevealLanguage } from '../dist/index.js';
import { createPage, revealPage } from '../dist/html.js';

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
