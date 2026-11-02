import { describe, expect, test } from '@jest/globals';
import { LANGUAGES, LANGUAGE_OPTIONS, getLanguage, normalizeLanguageCode } from '../../languages/index.js';

describe('language profiles', () => {
  test('every word language is listed once, in the approved order', () => {
    const expected = ['en', 'id', 'ja', 'es', 'de', 'fr', 'it', 'nl', 'pt', 'pl'];

    const codes = LANGUAGES.map((language) => language.code);

    expect(codes).toEqual(expected);
    expect(LANGUAGE_OPTIONS).toHaveLength(LANGUAGES.length);
  });

  test.each(LANGUAGES.map((language) => [language.code, language]))('%s has a complete profile', (code, language) => {
    const { label, tatoeba, speech, inputProps } = language;

    expect(label).toBeTruthy();
    expect(tatoeba).toHaveLength(3);
    expect(speech.startsWith(code)).toBe(true);
    expect(inputProps.lang).toBe(code);
  });

  test('every language has its own Tatoeba code', () => {
    const codes = LANGUAGES.map((language) => language.tatoeba);

    const unique = new Set(codes);

    expect(unique.size).toBe(LANGUAGES.length);
  });
});

describe('input helpers', () => {
  test('only Japanese uses the romaji input method', () => {
    const languages = LANGUAGES;

    const withIme = languages.filter((language) => language.ime).map((language) => language.code);

    expect(withIme).toEqual(['ja']);
  });

  test.each([
    ['es', 'ñ'],
    ['de', 'ß'],
    ['pl', 'ł'],
  ])('%s offers the special character %s', (code, char) => {
    const { chars } = getLanguage(code);

    expect(chars).toContain(char);
  });

  test.each([
    ['ja', { lang: 'ja', inputMode: 'text', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }],
    ['en', { lang: 'en', inputMode: 'text', autoCapitalize: 'sentences', autoCorrect: 'on', spellCheck: true }],
  ])('mobile keyboard hints follow the word language: %s', (code, expected) => {
    const { inputProps } = getLanguage(code);

    expect(inputProps).toEqual(expected);
  });

  test('English needs no special characters', () => {
    const code = 'en';

    const { chars } = getLanguage(code);

    expect(chars).toEqual([]);
  });
});

describe('normalizeTerm', () => {
  test.each([
    ['日本', '日本'],
    ['コーヒー', 'コーヒー'],
    ['nihongo', 'にほんご'],
    ['日本go', '日本ご'],
    ['CD', 'CD'],
  ])('Japanese keeps kanji and katakana and turns leftover romaji into hiragana: %p -> %p', (input, expected) => {
    const { normalizeTerm } = getLanguage('ja');

    const result = normalizeTerm(input);

    expect(result).toBe(expected);
  });

  test('Latin languages compose accents so "café" is one spelling', () => {
    const decomposed = 'café';

    const result = getLanguage('fr').normalizeTerm(decomposed);

    expect(result).toBe('café');
  });
});

describe('language codes', () => {
  test.each([
    ['Japanese', 'ja'],
    ['', 'en'],
  ])('normalizeLanguageCode(%p) is %p', (input, expected) => {
    const code = normalizeLanguageCode(input);

    expect(code).toBe(expected);
  });

  test('an unknown code behaves like English but keeps its own code', () => {
    const code = 'sv';

    const language = getLanguage(code);

    expect(language.code).toBe('sv');
    expect(language.ime).toBe(false);
    expect(language.inputProps.lang).toBe('sv');
  });
});
