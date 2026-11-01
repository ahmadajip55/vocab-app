import { test } from 'node:test';
import assert from 'node:assert/strict';

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
} from './ime.js';
import { lookupKanjiFallback } from './fallbackDictionary.js';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('the composition is the trailing romaji run', () => {
  assert.deepEqual(getComposition('nihon'), { start: 0, romaji: 'nihon' });
  assert.deepEqual(getComposition('日本go'), { start: 2, romaji: 'go' });
  assert.deepEqual(getComposition('ko-hi-'), { start: 0, romaji: 'ko-hi-' });
  assert.equal(getComposition('日本'), null);
  assert.equal(getComposition(''), null);
});

test('romaji becomes kana while typing and on commit', () => {
  assert.equal(previewKana('nihon'), 'にほn');
  assert.equal(previewKana('nihonn'), 'にほん');
  assert.equal(toKanaIfComplete('nihon'), 'にほん');
  assert.equal(toKanaIfComplete('kyou'), 'きょう');
  assert.equal(toKanaIfComplete('ko-hi-'), 'こーひー');
  assert.equal(toKanaIfComplete('xyz'), '');
  assert.equal(commitRomaji('日本go'), '日本ご');
});

test('choosing a candidate replaces only the romaji run', () => {
  assert.equal(applyCandidate('日本go', getComposition('日本go'), '語'), '日本語');
});

test('offline candidates give kanji, hiragana and katakana', () => {
  const list = buildCandidates('nihon');
  assert.equal(list[0], '日本');
  assert.ok(list.includes('にほん') && list.includes('ニホン'));
  assert.ok(list.includes('日本語'), 'predicts longer words');
  assert.ok(list.length <= 9);
  assert.deepEqual(buildCandidates('nih'), [], 'nothing to offer for an unfinished syllable');
  assert.deepEqual(lookupKanjiFallback('たべる'), ['食べる']);
});

test('Google Input Tools responses are parsed and merged with kana candidates', () => {
  const payload = ['SUCCESS', [['nihon', ['日本', 'ニホン', '二本'], [], { candidate_type: [0, 0, 0] }]]];
  assert.deepEqual(parseGoogleCandidates(payload), ['日本', 'ニホン', '二本']);
  assert.deepEqual(parseGoogleCandidates(['FAILED_TO_PARSE_REQUEST_BODY']), []);
  assert.deepEqual(parseGoogleCandidates(null), []);

  const merged = buildCandidates('nihon', ['日本', 'ニホン', '二本']);
  assert.deepEqual(merged.slice(0, 3), ['日本', 'ニホン', '二本']);
  assert.ok(merged.includes('にほん'));
  assert.equal(new Set(merged).size, merged.length);
});

test('the request uses the keyless Google endpoint with the typed romaji', async () => {
  let url;
  const result = await fetchGoogleCandidates('nihon', {
    fetchImpl: async (u) => {
      url = new URL(u);
      return json(['SUCCESS', [['nihon', ['日本']]]]);
    },
  });
  assert.deepEqual(result, ['日本']);
  assert.equal(url.origin + url.pathname, 'https://inputtools.google.com/request');
  assert.equal(url.searchParams.get('text'), 'nihon');
  assert.equal(url.searchParams.get('itc'), 'ja-t-ja-hira-i0-und');
  assert.ok(![...url.searchParams.keys()].some((key) => /key|token/i.test(key)));
});

test('the candidate service caches results and falls back offline when the network fails', async () => {
  let calls = 0;
  const online = createCandidateService({
    fetchImpl: async () => {
      calls += 1;
      return json(['SUCCESS', [['nihon', ['日本', '二本']]]]);
    },
  });
  assert.equal((await online.get('nihon')).source, 'google');
  assert.equal((await online.get('nihon')).source, 'google');
  assert.equal(calls, 1);

  const offline = createCandidateService({
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  const result = await offline.get('nihon');
  assert.equal(result.source, 'local');
  assert.equal(result.candidates[0], '日本');

  const blocked = createCandidateService({ fetchImpl: async () => json({}, 403) });
  assert.equal((await blocked.get('kyou')).source, 'local');
});
