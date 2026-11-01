import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWord } from './model.js';
import { fillMissingMeanings } from './fillMeanings.js';

const word = (term, meaning = '') => createWord({ term, meaning, wordLanguage: 'en', meaningLanguage: 'id' });

test('missing meanings are filled with one batched request and reported for saving', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    urls.push(parsed);
    return { ok: true, json: async () => parsed.searchParams.getAll('q').map((q) => (q === 'Zzz' ? '' : `arti ${q}`)) };
  };
  const words = [word('cat'), word('dog', 'anjing'), word('bird'), word('zzz')];
  const saved = [];
  const filled = await fillMissingMeanings(words, (id, meaning) => saved.push([id, meaning]), { fetchImpl });

  // One request for every blank word; only the word with no answer is retried on its own.
  assert.deepEqual(urls[0].searchParams.getAll('q'), ['Cat', 'Bird', 'Zzz']);
  assert.ok(urls.slice(1).every((url) => url.searchParams.get('q') === 'Zzz'));
  assert.deepEqual(filled.map((w) => w.meaning), ['Arti Cat', 'Anjing', 'Arti Bird', '']);
  assert.deepEqual(saved, [
    [words[0].id, 'Arti Cat'],
    [words[2].id, 'Arti Bird'],
  ]);
});

test('nothing is requested when every word already has a meaning', async () => {
  const fetchImpl = async () => assert.fail('no request expected');
  const words = [word('cat', 'kucing')];
  assert.equal(await fillMissingMeanings(words, undefined, { fetchImpl }), words);
});
