import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LANGUAGES, LANGUAGE_OPTIONS, getLanguage, normalizeLanguageCode } from './index.js';

test('every word language has its own complete profile', () => {
  assert.deepEqual(LANGUAGES.map((l) => l.code), ['en', 'id', 'ja', 'es', 'de', 'fr', 'it', 'nl', 'pt', 'pl']);
  assert.equal(new Set(LANGUAGES.map((l) => l.tatoeba)).size, LANGUAGES.length);

  for (const language of LANGUAGES) {
    assert.ok(language.label && language.tatoeba.length === 3 && language.speech.startsWith(language.code), language.code);
    assert.equal(language.inputProps.lang, language.code);
  }
  assert.equal(LANGUAGE_OPTIONS.length, LANGUAGES.length);
});

test('only Japanese uses the romaji input method; accented languages get a character palette', () => {
  assert.deepEqual(LANGUAGES.filter((l) => l.ime).map((l) => l.code), ['ja']);
  assert.ok(getLanguage('es').chars.includes('ñ'));
  assert.ok(getLanguage('de').chars.includes('ß'));
  assert.ok(getLanguage('pl').chars.includes('ł'));
  assert.deepEqual(getLanguage('en').chars, []);
});

test('Japanese keeps kanji and katakana and turns leftover romaji into hiragana', () => {
  const { normalizeTerm } = getLanguage('ja');
  assert.equal(normalizeTerm('日本'), '日本');
  assert.equal(normalizeTerm('コーヒー'), 'コーヒー');
  assert.equal(normalizeTerm('nihongo'), 'にほんご');
  assert.equal(normalizeTerm('日本go'), '日本ご');
  assert.equal(normalizeTerm('CD'), 'CD');
});

test('Latin languages compose accents so "café" is one spelling', () => {
  assert.equal(getLanguage('fr').normalizeTerm('café'), 'café');
});

test('language codes accept names and unknown codes fall back to English behaviour', () => {
  assert.equal(normalizeLanguageCode('Japanese'), 'ja');
  assert.equal(normalizeLanguageCode(''), 'en');
  assert.equal(getLanguage('sv').code, 'sv');
  assert.equal(getLanguage('sv').ime, false);
  assert.equal(getLanguage('sv').inputProps.lang, 'sv');
});
