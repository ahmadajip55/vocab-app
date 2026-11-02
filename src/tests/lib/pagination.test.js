import { describe, expect, test } from '@jest/globals';
import { clampPage, pageCount, pageItems } from '../../lib/pagination.js';

describe('pageCount', () => {
  test.each([
    [0, 10, 1],
    [10, 10, 1],
    [11, 10, 2],
    [1000, 10, 100],
  ])('%p items, %p per page -> %p pages', (total, pageSize, expected) => {
    const pages = pageCount(total, pageSize);

    expect(pages).toBe(expected);
  });
});

describe('clampPage', () => {
  test.each([
    [0, 5, 1],
    [7, 5, 5],
    [Number.NaN, 5, 1],
    [3, 5, 3],
  ])('page %p of %p pages -> %p', (page, pages, expected) => {
    const result = clampPage(page, pages);

    expect(result).toBe(expected);
  });
});

describe('pageItems', () => {
  test.each([
    [1, 1, [1]],
    [1, 5, [1, 2, '…', 5]],
    [3, 5, [1, 2, 3, 4, 5]],
    [6, 20, [1, '…', 5, 6, 7, '…', 20]],
    [20, 20, [1, '…', 19, 20]],
    [4, 100, [1, 2, 3, 4, 5, '…', 100]],
  ])('page %p of %p shows the ends, the neighbours and gaps', (current, pages, expected) => {
    const items = pageItems(current, pages);

    expect(items).toEqual(expected);
  });
});
