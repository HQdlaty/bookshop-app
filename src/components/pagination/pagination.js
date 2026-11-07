function pageItem({ label, page, href, current = false, disabled = false, ariaLabel }) {
  const item = document.createElement('li');
  item.className = `page-item${current ? ' active' : ''}${disabled ? ' disabled' : ''}`;

  if (disabled) {
    const span = document.createElement('span');
    span.className = 'page-link';
    span.setAttribute('aria-disabled', 'true');
    span.textContent = label;
    if (ariaLabel) span.setAttribute('aria-label', ariaLabel);
    item.append(span);
    return item;
  }

  const link = document.createElement('a');
  link.className = 'page-link';
  link.href = href;
  link.dataset.page = String(page);
  link.textContent = label;
  if (ariaLabel) link.setAttribute('aria-label', ariaLabel);
  if (current) link.setAttribute('aria-current', 'page');
  item.append(link);
  return item;
}

// 1 … 4 5 [6] 7 8 … 20
function pageNumbers(page, totalPages) {
  const wanted = new Set([1, totalPages]);
  for (let n = page - 2; n <= page + 2; n += 1) if (n >= 1 && n <= totalPages) wanted.add(n);
  const sorted = [...wanted].sort((a, b) => a - b);
  const result = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) result.push('gap');
    result.push(n);
  });
  return result;
}

/**
 * Bootstrap pagination. Page links are real links (`hrefFor(page)`) carrying data-page, so a page can
 * intercept clicks and still work without scripting. Returns null when there is only one page.
 */
export function createPagination({ page, totalPages, hrefFor }) {
  if (totalPages <= 1) return null;

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Pagination');
  const list = document.createElement('ul');
  list.className = 'pagination justify-content-center flex-wrap mb-0';

  list.append(
    pageItem({ label: '‹', ariaLabel: 'Previous page', page: page - 1, href: hrefFor(page - 1), disabled: page <= 1 }),
  );
  for (const entry of pageNumbers(page, totalPages)) {
    if (entry === 'gap') {
      list.append(pageItem({ label: '…', disabled: true }));
    } else {
      list.append(pageItem({ label: String(entry), page: entry, href: hrefFor(entry), current: entry === page, ariaLabel: `Page ${entry}` }));
    }
  }
  list.append(
    pageItem({ label: '›', ariaLabel: 'Next page', page: page + 1, href: hrefFor(page + 1), disabled: page >= totalPages }),
  );

  nav.append(list);
  return nav;
}
