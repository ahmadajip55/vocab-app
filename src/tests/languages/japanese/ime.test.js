import { describe, expect, test } from '@jest/globals';
import {
  applyCandidate,
  buildCandidates,
  commitRomaji,
  createCandidateService,
  fetchGoogleCandidates,
  getComposition,
  parseGoogleCandidates,
  previewKana,
  toKanaIfComplete,
} from '../../../languages/japanese/ime.js';
import { lookupKanjiFallback } from '../../../languages/japanese/fallbackDictionary.js';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

describe('getComposition', () => {
  test.each([
    ['nihon', { start: 0, romaji: 'nihon' }],
    ['日本go', { start: 2, romaji: 'go' }],
    ['ko-hi-', { start: 0, romaji: 'ko-hi-' }],
    ['日本', null],
    ['', null],
  ])('the composition of %p is the trailing romaji run', (text, expected) => {
    const composition = getComposition(text);

    expect(composition).toEqual(expected);
  });
});

describe('romaji to kana', () => {
  test.each([
    ['nihon', 'にほn'],
    ['nihonn', 'にほん'],
  ])('previewKana(%p) is %p while typing', (romaji, expected) => {
    const kana = previewKana(romaji);

    expect(kana).toBe(expected);
  });

  test.each([
    ['nihon', 'にほん'],
    ['kyou', 'きょう'],
    ['ko-hi-', 'こーひー'],
    ['xyz', ''],
  ])('toKanaIfComplete(%p) is %p', (romaji, expected) => {
    const kana = toKanaIfComplete(romaji);

    expect(kana).toBe(expected);
  });

  test('commitRomaji converts only the romaji', () => {
    const text = '日本go';

    const committed = commitRomaji(text);

    expect(committed).toBe('日本ご');
  });

  test('choosing a candidate replaces only the romaji run', () => {
    const text = '日本go';
    const composition = getComposition(text);

    const result = applyCandidate(text, composition, '語');

    expect(result).toBe('日本語');
  });
});

describe('offline candidates', () => {
  test('give kanji first, then hiragana and katakana, and predict longer words', () => {
    const romaji = 'nihon';

    const list = buildCandidates(romaji);

    expect(list[0]).toBe('日本');
    expect(list).toEqual(expect.arrayContaining(['にほん', 'ニホン', '日本語']));
    expect(list.length).toBeLessThanOrEqual(9);
  });

  test('offer nothing for an unfinished syllable', () => {
    const romaji = 'nih';

    const list = buildCandidates(romaji);

    expect(list).toEqual([]);
  });

  test('the built-in dictionary knows common words', () => {
    const reading = 'たべる';

    const kanji = lookupKanjiFallback(reading);

    expect(kanji).toEqual(['食べる']);
  });
});

describe('Google Input Tools', () => {
  test.each([
    [['SUCCESS', [['nihon', ['日本', 'ニホン', '二本'], [], { candidate_type: [0, 0, 0] }]]], ['日本', 'ニホン', '二本']],
    [['FAILED_TO_PARSE_REQUEST_BODY'], []],
    [null, []],
  ])('parseGoogleCandidates reads %j', (payload, expected) => {
    const candidates = parseGoogleCandidates(payload);

    expect(candidates).toEqual(expected);
  });

  test('online candidates come first and are merged with kana without repeats', () => {
    const remote = ['日本', 'ニホン', '二本'];

    const merged = buildCandidates('nihon', remote);

    expect(merged.slice(0, 3)).toEqual(remote);
    expect(merged).toContain('にほん');
    expect(new Set(merged).size).toBe(merged.length);
  });

  test('the request uses the keyless endpoint with the typed text', async () => {
    let url;
    const fetchImpl = async (requested) => {
      url = new URL(requested);
      return json(['SUCCESS', [['nihon', ['日本']]]]);
    };

    const result = await fetchGoogleCandidates('nihon', { fetchImpl });

    expect(result).toEqual(['日本']);
    expect(url.origin + url.pathname).toBe('https://inputtools.google.com/request');
    expect(url.searchParams.get('text')).toBe('nihon');
    expect(url.searchParams.get('itc')).toBe('ja-t-ja-hira-i0-und');
    expect([...url.searchParams.keys()].some((key) => /key|token/i.test(key))).toBe(false);
  });
});

describe('createCandidateService', () => {
  test('caches online results', async () => {
    let calls = 0;
    const service = createCandidateService({
      fetchImpl: async () => {
        calls += 1;
        return json(['SUCCESS', [['nihon', ['日本', '二本']]]]);
      },
    });

    const first = await service.get('nihon');
    const second = await service.get('nihon');

    expect(first.source).toBe('google');
    expect(second.source).toBe('google');
    expect(calls).toBe(1);
  });

  test('falls back to offline candidates when the network fails', async () => {
    const service = createCandidateService({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    const result = await service.get('nihon');

    expect(result.source).toBe('local');
    expect(result.candidates[0]).toBe('日本');
  });

  test('falls back to offline candidates when the request is refused', async () => {
    const service = createCandidateService({ fetchImpl: async () => json({}, 403) });

    const result = await service.get('kyou');

    expect(result.source).toBe('local');
  });
});
