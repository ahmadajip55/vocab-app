import { describe, expect, it } from '@jest/globals';
import { clampPage, pageCount, pageItems } from '../../lib/pagination.js';

describe('pageCount', () => {
  it.each([
    [0, 10, 1],
    [10, 10, 1],
    [11, 10, 2],
    [1000, 10, 100],
  ])('should split %p items at %p per page into %p pages when pages are counted', (total, pageSize, expected) => {
    const pages = pageCount(total, pageSize);

    expect(pages).toBe(expected);
  });
});

describe('clampPage', () => {
  it.each([
    [0, 5, 1],
    [7, 5, 5],
    [Number.NaN, 5, 1],
    [3, 5, 3],
  ])('should turn page %p of %p pages into %p when the page is clamped', (page, pages, expected) => {
    const result = clampPage(page, pages);

    expect(result).toBe(expected);
  });
});

describe('pageItems', () => {
  it.each([
    [1, 1, [1]],
    [1, 5, [1, 2, '…', 5]],
    [3, 5, [1, 2, 3, 4, 5]],
    [6, 20, [1, '…', 5, 6, 7, '…', 20]],
    [20, 20, [1, '…', 19, 20]],
    [4, 100, [1, 2, 3, 4, 5, '…', 100]],
  ])('should show the ends, the neighbours and gaps when page %p of %p is shown', (current, pages, expected) => {
    const items = pageItems(current, pages);

    expect(items).toEqual(expected);
  });
});
