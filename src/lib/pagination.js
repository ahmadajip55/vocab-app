/** Number of pages for `total` items, at least 1. */
export function pageCount(total, pageSize) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Keeps a page number inside 1..pages (e.g. after the last word on a page is deleted). */
export function clampPage(page, pages) {
  return Math.min(Math.max(1, Math.floor(page) || 1), pages);
}

/**
 * Page buttons to show: the first and last page, and the pages around the
 * current one, with '…' for the gaps. pageItems(6, 20) -> [1, '…', 5, 6, 7, '…', 20]
 */
export function pageItems(current, pages, around = 1) {
  const items = [];
  for (let page = 1; page <= pages; page++) {
    const near = Math.abs(page - current) <= around;
    if (page === 1 || page === pages || near) {
      items.push(page);
    } else if (items[items.length - 1] !== '…') {
      items.push('…');
    }
  }
  // A gap hiding a single page is pointless: show that page instead.
  return items.map((item, index) =>
    item === '…' && items[index + 1] - items[index - 1] === 2 ? items[index - 1] + 1 : item,
  );
}
