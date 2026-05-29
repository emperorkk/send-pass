import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_DAYS, DEFAULT_RETRIEVALS, MAX_DAYS, MAX_RETRIEVALS, MAX_SECRET_CHARS, parsePositiveInteger, validateSecretInput, ValidationError } from '../dist/storage.js';

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
