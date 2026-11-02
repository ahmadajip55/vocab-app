import { describe, expect, it } from '@jest/globals';
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
  it.each([
    ['nihon', { start: 0, romaji: 'nihon' }],
    ['日本go', { start: 2, romaji: 'go' }],
    ['ko-hi-', { start: 0, romaji: 'ko-hi-' }],
    ['日本', null],
    ['', null],
  ])('should be the trailing romaji run when the text is %p', (text, expected) => {
    const composition = getComposition(text);

    expect(composition).toEqual(expected);
  });
});

describe('romaji to kana', () => {
  it.each([
    ['nihon', 'にほn'],
    ['nihonn', 'にほん'],
  ])('should show %p as %p when romaji is being typed', (romaji, expected) => {
    const kana = previewKana(romaji);

    expect(kana).toBe(expected);
  });

  it.each([
    ['nihon', 'にほん'],
    ['kyou', 'きょう'],
    ['ko-hi-', 'こーひー'],
    ['xyz', ''],
  ])('should turn %p into %p when the romaji is complete', (romaji, expected) => {
    const kana = toKanaIfComplete(romaji);

    expect(kana).toBe(expected);
  });

  it('should convert only the romaji when it is committed', () => {
    const text = '日本go';

    const committed = commitRomaji(text);

    expect(committed).toBe('日本ご');
  });

  it('should replace only the romaji run when a candidate is chosen', () => {
    const text = '日本go';
    const composition = getComposition(text);

    const result = applyCandidate(text, composition, '語');

    expect(result).toBe('日本語');
  });
});

describe('offline candidates', () => {
  it('should give kanji first, then kana, and predict longer words when offline', () => {
    const romaji = 'nihon';

    const list = buildCandidates(romaji);

    expect(list[0]).toBe('日本');
    expect(list).toEqual(expect.arrayContaining(['にほん', 'ニホン', '日本語']));
    expect(list.length).toBeLessThanOrEqual(9);
  });

  it('should offer nothing when the syllable is unfinished', () => {
    const romaji = 'nih';

    const list = buildCandidates(romaji);

    expect(list).toEqual([]);
  });

  it('should know common words when the built-in dictionary is used', () => {
    const reading = 'たべる';

    const kanji = lookupKanjiFallback(reading);

    expect(kanji).toEqual(['食べる']);
  });
});

describe('Google Input Tools', () => {
  it.each([
    [['SUCCESS', [['nihon', ['日本', 'ニホン', '二本'], [], { candidate_type: [0, 0, 0] }]]], ['日本', 'ニホン', '二本']],
    [['FAILED_TO_PARSE_REQUEST_BODY'], []],
    [null, []],
  ])('should read the candidates when Google returns %j', (payload, expected) => {
    const candidates = parseGoogleCandidates(payload);

    expect(candidates).toEqual(expected);
  });

  it('should put online candidates first, without repeats, when they are merged with kana', () => {
    const remote = ['日本', 'ニホン', '二本'];

    const merged = buildCandidates('nihon', remote);

    expect(merged.slice(0, 3)).toEqual(remote);
    expect(merged).toContain('にほん');
    expect(new Set(merged).size).toBe(merged.length);
  });

  it('should use the keyless endpoint with the typed text when candidates are requested', async () => {
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
  it('should cache the results when the same text is asked again', async () => {
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

  it('should use offline candidates when the network fails', async () => {
    const service = createCandidateService({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    const result = await service.get('nihon');

    expect(result.source).toBe('local');
    expect(result.candidates[0]).toBe('日本');
  });

  it('should use offline candidates when the request is refused', async () => {
    const service = createCandidateService({ fetchImpl: async () => json({}, 403) });

    const result = await service.get('kyou');

    expect(result.source).toBe('local');
  });
});
