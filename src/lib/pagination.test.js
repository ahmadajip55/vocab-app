import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampPage, pageCount, pageItems } from './pagination.js';

test('pageCount and clampPage', () => {
  assert.equal(pageCount(0, 10), 1);
  assert.equal(pageCount(10, 10), 1);
  assert.equal(pageCount(11, 10), 2);
  assert.equal(pageCount(1000, 10), 100);
  assert.equal(clampPage(0, 5), 1);
  assert.equal(clampPage(7, 5), 5);
  assert.equal(clampPage(Number.NaN, 5), 1);
  assert.equal(clampPage(3, 5), 3);
});

test('pageItems shows the ends, the neighbours of the current page, and gaps', () => {
  assert.deepEqual(pageItems(1, 1), [1]);
  assert.deepEqual(pageItems(1, 5), [1, 2, '…', 5]);
  assert.deepEqual(pageItems(3, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageItems(6, 20), [1, '…', 5, 6, 7, '…', 20]);
  assert.deepEqual(pageItems(20, 20), [1, '…', 19, 20]);
  assert.deepEqual(pageItems(4, 100), [1, 2, 3, 4, 5, '…', 100]);
});
