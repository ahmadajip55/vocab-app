import { describe, expect, it } from '@jest/globals';
import { LANGUAGES, LANGUAGE_OPTIONS, getLanguage, normalizeLanguageCode } from '../../languages/index.js';

describe('language profiles', () => {
  it('should list every word language once, in the approved order, when languages are listed', () => {
    const expected = ['en', 'id', 'ja', 'es', 'de', 'fr', 'it', 'nl', 'pt', 'pl'];

    const codes = LANGUAGES.map((language) => language.code);

    expect(codes).toEqual(expected);
    expect(LANGUAGE_OPTIONS).toHaveLength(LANGUAGES.length);
  });

  it.each(LANGUAGES.map((language) => [language.code, language]))('should describe %s fully when its profile is read', (code, language) => {
    const { label, tatoeba, speech, inputProps } = language;

    expect(label).toBeTruthy();
    expect(tatoeba).toHaveLength(3);
    expect(speech.startsWith(code)).toBe(true);
    expect(inputProps.lang).toBe(code);
  });

  it('should give every language its own Tatoeba code when profiles are read', () => {
    const codes = LANGUAGES.map((language) => language.tatoeba);

    const unique = new Set(codes);

    expect(unique.size).toBe(LANGUAGES.length);
  });
});

describe('input helpers', () => {
  it('should use the romaji input method only when the language is Japanese', () => {
    const languages = LANGUAGES;

    const withIme = languages.filter((language) => language.ime).map((language) => language.code);

    expect(withIme).toEqual(['ja']);
  });

  it.each([
    ['es', 'ñ'],
    ['de', 'ß'],
    ['pl', 'ł'],
  ])('should give %s the special character %s when characters are offered', (code, char) => {
    const { chars } = getLanguage(code);

    expect(chars).toContain(char);
  });

  it.each([
    ['ja', { lang: 'ja', inputMode: 'text', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }],
    ['en', { lang: 'en', inputMode: 'text', autoCapitalize: 'sentences', autoCorrect: 'on', spellCheck: true }],
  ])('should give mobile keyboard hints when the word language is %s', (code, expected) => {
    const { inputProps } = getLanguage(code);

    expect(inputProps).toEqual(expected);
  });

  it('should offer no special characters when the language is English', () => {
    const code = 'en';

    const { chars } = getLanguage(code);

    expect(chars).toEqual([]);
  });
});

describe('normalizeTerm', () => {
  it.each([
    ['日本', '日本'],
    ['コーヒー', 'コーヒー'],
    ['nihongo', 'にほんご'],
    ['日本go', '日本ご'],
    ['CD', 'CD'],
  ])('should turn %p into %p when a Japanese term is normalized', (input, expected) => {
    const { normalizeTerm } = getLanguage('ja');

    const result = normalizeTerm(input);

    expect(result).toBe(expected);
  });

  it('should compose accents into one spelling when the language is Latin-based', () => {
    const decomposed = 'café';

    const result = getLanguage('fr').normalizeTerm(decomposed);

    expect(result).toBe('café');
  });
});

describe('language codes', () => {
  it.each([
    ['Japanese', 'ja'],
    ['', 'en'],
  ])('should turn %p into %p when the language code is normalized', (input, expected) => {
    const code = normalizeLanguageCode(input);

    expect(code).toBe(expected);
  });

  it('should behave like English but keep its own code when the code is unknown', () => {
    const code = 'sv';

    const language = getLanguage(code);

    expect(language.code).toBe('sv');
    expect(language.ime).toBe(false);
    expect(language.inputProps.lang).toBe('sv');
  });
});
