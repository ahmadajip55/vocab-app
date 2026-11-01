import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findExamples, pickTatoebaExamples, primaryTerm } from './examples.js';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const sentence = (text, lang, translation) => ({
  text,
  lang,
  translations: translation ? [[{ text: translation, lang: 'ind' }], []] : [[], []],
});

test('primaryTerm uses the first word of a list', () => {
  assert.equal(primaryTerm('reluctant, hesitant'), 'reluctant');
  assert.equal(primaryTerm('飲む（のむ）'), '飲む');
});

test('pickTatoebaExamples prefers sentences that contain the word and have a translation', () => {
  const payload = {
    results: [
      sentence('Aku suka kopi.', 'ind'),
      sentence('毎日コーヒーを飲みます。', 'jpn'),
      sentence('私は日本に住んでいます。', 'jpn', 'Saya tinggal di Jepang.'),
      sentence('日本', 'jpn'),
    ],
  };
  assert.deepEqual(pickTatoebaExamples(payload, '日本', { from: 'jpn', to: 'ind' })[0], {
    sentence: '私は日本に住んでいます。',
    translation: 'Saya tinggal di Jepang.',
  });
  assert.deepEqual(pickTatoebaExamples({ results: [] }, 'x'), []);
  assert.deepEqual(pickTatoebaExamples(null, 'x'), []);
});

test('Latin words must match as whole words', () => {
  const payload = { results: [sentence('The catalog is large and very old.', 'eng'), sentence('The cat sleeps on the sofa.', 'eng')] };
  assert.equal(pickTatoebaExamples(payload, 'cat', { from: 'eng' })[0].sentence, 'The cat sleeps on the sofa.');
});

test('a Japanese word gets Japanese sentences, fetched from Tatoeba with the right language codes', async () => {
  let url;
  const [found] = await findExamples('日本', {
    sourceLanguage: 'ja',
    targetLanguage: 'id',
    limit: 1,
    fetchImpl: async (u) => {
      url ??= new URL(u);
      return json({ results: [sentence('私は日本に住んでいます。', 'jpn', 'Saya tinggal di Jepang.')] });
    },
  });
  assert.deepEqual(found, { sentence: '私は日本に住んでいます。', translation: 'Saya tinggal di Jepang.', source: 'tatoeba' });
  assert.equal(url.searchParams.get('from'), 'jpn');
  assert.equal(url.searchParams.get('to'), 'ind');
  assert.equal(url.searchParams.get('query'), '日本');
});

test('every language searches Tatoeba in its own language', async () => {
  const seen = {};
  for (const code of ['en', 'id', 'es', 'de', 'fr', 'it', 'nl', 'pt', 'pl']) {
    await findExamples('palabra', {
      sourceLanguage: code,
      targetLanguage: 'ja',
      fetchImpl: async (u) => {
        const params = new URL(u).searchParams;
        if (String(u).includes('tatoeba') && params.has('to')) seen[code] = [params.get('from'), params.get('to')];
        return json({ results: [] });
      },
    });
  }
  assert.deepEqual(seen, {
    en: ['eng', 'jpn'],
    id: ['ind', 'jpn'],
    es: ['spa', 'jpn'],
    de: ['deu', 'jpn'],
    fr: ['fra', 'jpn'],
    it: ['ita', 'jpn'],
    nl: ['nld', 'jpn'],
    pt: ['por', 'jpn'],
    pl: ['pol', 'jpn'],
  });
});

test('English falls back to the free dictionary when Tatoeba has nothing', async () => {
  const found = await findExamples('persuade', {
    sourceLanguage: 'en',
    targetLanguage: 'id',
    fetchImpl: async (u) =>
      String(u).includes('dictionaryapi')
        ? json([{ meanings: [{ definitions: [{ definition: 'x' }, { example: 'She persuaded him to stay.' }] }] }])
        : json({ results: [] }),
  });
  assert.deepEqual(found, [{ sentence: 'She persuaded him to stay.', translation: '', source: 'dictionary' }]);
});

test('network errors are reported as such, not as "no example"', async () => {
  const down = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(findExamples('猫', { sourceLanguage: 'ja', fetchImpl: down }), /koneksi/);
});

test('pickTatoebaExamples returns up to three distinct sentences that use the word', () => {
  const payload = {
    results: [
      sentence('Makanan ini enak sekali.', 'ind', 'This food is delicious.'),
      sentence('Saya makan nasi setiap hari.', 'ind', 'Saya makan nasi.'),
      sentence('Kami makan bersama di rumah.', 'ind'),
      sentence('Saya makan nasi setiap hari.', 'ind', 'dup'),
      sentence('Mereka sudah makan siang tadi.', 'ind', 'They had lunch.'),
      sentence('Dia makan apel merah di taman.', 'ind', 'She eats an apple.'),
    ],
  };
  const picked = pickTatoebaExamples(payload, 'makan', { from: 'ind', to: 'ind' });
  assert.equal(picked.length, 3);
  assert.ok(picked.every((item) => /\bmakan\b/i.test(item.sentence)), 'not "makanan"');
  assert.equal(new Set(picked.map((item) => item.sentence)).size, 3);
  assert.ok(picked.slice(0, 2).every((item) => item.translation), 'translated ones first');
  assert.equal(pickTatoebaExamples(payload, 'makan', { from: 'ind', limit: 1 }).length, 1);
});

test('findExamples tops up with untranslated sentences and reports only total failure', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    if (parsed.searchParams.has('to')) {
      return json({ results: [sentence('I was reluctant to go.', 'eng', 'Saya enggan pergi.')] });
    }
    return json({
      results: [sentence('I was reluctant to go.', 'eng'), sentence('She is reluctant to speak.', 'eng'), sentence('He seemed reluctant at first.', 'eng')],
    });
  };
  const found = await findExamples('reluctant', { sourceLanguage: 'en', targetLanguage: 'id', fetchImpl });
  // The translated sentence comes first; the rest are added untranslated, best length first.
  assert.deepEqual(found[0], { sentence: 'I was reluctant to go.', translation: 'Saya enggan pergi.', source: 'tatoeba' });
  assert.deepEqual(found.slice(1).map((item) => item.sentence).sort(), ['He seemed reluctant at first.', 'She is reluctant to speak.']);
  assert.ok(found.slice(1).every((item) => item.translation === ''));
  assert.equal(calls[0].searchParams.get('to'), 'ind');
  assert.equal(calls[1].searchParams.has('to'), false);
  assert.equal(calls.length, 2, 'enough sentences, the dictionary is not asked');

  assert.deepEqual(await findExamples('猫', { sourceLanguage: 'ja', fetchImpl: async () => json({ results: [] }) }), []);
  await assert.rejects(findExamples('猫', { sourceLanguage: 'ja', fetchImpl: async () => json({}, 503) }), /koneksi/);
  assert.deepEqual(await findExamples(' '), []);
});
