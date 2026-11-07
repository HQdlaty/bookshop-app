import html from './books.html?raw';
import './books.css';
import { createCover } from '../../components/book-cover/book-cover.js';
import { createPagination } from '../../components/pagination/pagination.js';
import { listBooks } from '../../services/books-service.js';
import { listCategories } from '../../services/categories-service.js';
import { toDbMessage } from '../../utils/db-errors.js';
import { formatPrice, UUID_PATTERN } from '../../utils/format.js';

export const title = 'Books';

function parseState(query) {
  const page = Number.parseInt(query.get('page') ?? '', 10);
  const category = query.get('category') ?? '';
  return {
    search: (query.get('search') ?? '').slice(0, 100),
    category: UUID_PATTERN.test(category) ? category : '',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

function stateToParams({ search, category, page }) {
  const params = {};
  if (search.trim()) params.search = search.trim();
  if (category) params.category = category;
  if (page > 1) params.page = String(page);
  return params;
}

function bookCard(book) {
  const column = document.createElement('div');
  column.className = 'col';
  const card = document.createElement('article');
  card.className = 'card h-100 book-card position-relative';

  card.append(createCover(book.cover_path, { decorative: true }));

  const body = document.createElement('div');
  body.className = 'card-body d-flex flex-column';

  const heading = document.createElement('h2');
  heading.className = 'h6 card-title mb-1';
  const link = document.createElement('a');
  link.className = 'stretched-link text-decoration-none';
  link.href = `/books/${encodeURIComponent(book.id)}`;
  link.textContent = book.title; // user content: textContent only
  heading.append(link);

  const author = document.createElement('p');
  author.className = 'card-subtitle text-body-secondary small mb-3';
  author.textContent = book.author;

  const footer = document.createElement('div');
  footer.className = 'mt-auto d-flex flex-wrap align-items-center justify-content-between gap-2';
  if (book.category?.name) {
    const badge = document.createElement('span');
    badge.className = 'badge text-bg-secondary text-wrap text-start';
    badge.textContent = book.category.name;
    footer.append(badge);
  }
  const price = formatPrice(book.price);
  if (price) {
    const priceEl = document.createElement('span');
    priceEl.className = 'fw-semibold ms-auto';
    priceEl.textContent = price;
    footer.append(priceEl);
  }

  body.append(heading, author, footer);
  card.append(body);
  column.append(card);
  return column;
}

function skeletonGrid() {
  const row = document.createElement('div');
  row.className = 'row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xl-4 g-4';
  row.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 8; i += 1) {
    const column = document.createElement('div');
    column.className = 'col';
    const card = document.createElement('div');
    card.className = 'card h-100 placeholder-glow';
    const cover = document.createElement('div');
    cover.className = 'book-cover ratio placeholder';
    const body = document.createElement('div');
    body.className = 'card-body';
    for (const width of ['col-9', 'col-6']) {
      const line = document.createElement('span');
      line.className = `placeholder ${width} d-block mb-2`;
      body.append(line);
    }
    card.append(cover, body);
    column.append(card);
    row.append(column);
  }
  return row;
}

export function mount(container, ctx) {
  container.innerHTML = html; // static, trusted fragment

  const form = container.querySelector('[data-filter-form]');
  const searchInput = form.elements.search;
  const categorySelect = form.elements.category;
  const summary = container.querySelector('[data-summary]');
  const results = container.querySelector('[data-results]');
  const paginationEl = container.querySelector('[data-pagination]');

  let state = parseState(ctx.query);
  let requestId = 0;

  searchInput.value = state.search;

  const hrefFor = (page) => {
    const search = new URLSearchParams(stateToParams({ ...state, page })).toString();
    return `/books${search ? `?${search}` : ''}`;
  };

  function showMessage({ icon, text, action }) {
    summary.textContent = '';
    paginationEl.replaceChildren();
    const box = document.createElement('div');
    box.className = 'text-center text-body-secondary py-5';
    const iconEl = document.createElement('i');
    iconEl.className = `bi ${icon} display-5 d-block mb-3`;
    iconEl.setAttribute('aria-hidden', 'true');
    const message = document.createElement('p');
    message.className = 'mb-3';
    message.textContent = text;
    box.append(iconEl, message);
    if (action) box.append(action);
    results.replaceChildren(box);
  }

  function actionButton(label, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn ${className}`;
    button.textContent = label;
    button.addEventListener('click', onClick, { signal: ctx.signal });
    return button;
  }

  function showError(error) {
    summary.textContent = '';
    paginationEl.replaceChildren();
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger d-flex flex-wrap align-items-center gap-2';
    alert.setAttribute('role', 'alert');
    const text = document.createElement('span');
    text.textContent = toDbMessage(error);
    alert.append(text, actionButton('Retry', 'btn-sm btn-outline-danger ms-auto', () => load()));
    results.replaceChildren(alert);
  }

  function clearFilters() {
    state = { search: '', category: '', page: 1 };
    searchInput.value = '';
    categorySelect.value = '';
    ctx.setQuery(stateToParams(state));
    load();
  }

  async function load() {
    const current = ++requestId;
    results.setAttribute('aria-busy', 'true');
    summary.textContent = 'Loading books…';
    paginationEl.replaceChildren();
    results.replaceChildren(skeletonGrid());

    try {
      const result = await listBooks({ search: state.search, categoryId: state.category, page: state.page });
      if (ctx.signal.aborted || current !== requestId) return;

      // Asked for a page past the end (e.g. an old link): show the last page instead.
      if (result.total > 0 && state.page > result.totalPages) {
        state.page = result.totalPages;
        ctx.setQuery(stateToParams(state), { replace: true });
        load();
        return;
      }

      results.removeAttribute('aria-busy');
      if (result.total === 0) {
        const filtered = Boolean(state.search.trim() || state.category);
        showMessage({
          icon: filtered ? 'bi-search' : 'bi-journal-x',
          text: filtered ? 'No books match your search.' : 'There are no books in the catalog yet. Please check back soon.',
          action: filtered ? actionButton('Clear search and filters', 'btn-outline-primary', clearFilters) : null,
        });
        return;
      }

      const first = (result.page - 1) * result.pageSize + 1;
      const last = first + result.books.length - 1;
      summary.textContent = `Showing ${first}–${last} of ${result.total} ${result.total === 1 ? 'book' : 'books'}`;

      const grid = document.createElement('div');
      grid.className = 'row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xl-4 g-4';
      grid.append(...result.books.map(bookCard));
      results.replaceChildren(grid);

      const pagination = createPagination({ page: result.page, totalPages: result.totalPages, hrefFor });
      paginationEl.replaceChildren(...(pagination ? [pagination] : []));
    } catch (error) {
      if (ctx.signal.aborted || current !== requestId) return;
      console.error('Could not load books', error?.code ?? error?.name);
      results.removeAttribute('aria-busy');
      showError(error);
    }
  }

  async function loadCategories() {
    try {
      const categories = await listCategories();
      if (ctx.signal.aborted) return;
      for (const category of categories) {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name; // user content: textContent only
        categorySelect.append(option);
      }
      categorySelect.value = state.category;
    } catch (error) {
      // The filter is a convenience: the catalog still works without it.
      console.error('Could not load categories', error?.code ?? error?.name);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state = { search: searchInput.value, category: categorySelect.value, page: 1 };
    ctx.setQuery(stateToParams(state));
    load();
  }, { signal: ctx.signal });

  categorySelect.addEventListener('change', () => form.requestSubmit(), { signal: ctx.signal });

  // Page links are real links; handle them here so the grid reloads without re-mounting the whole page.
  paginationEl.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[data-page]') : null;
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    state.page = Number(link.dataset.page);
    ctx.setQuery(stateToParams(state));
    load();
    container.querySelector('h1').scrollIntoView({ block: 'start' });
  }, { signal: ctx.signal });

  loadCategories();
  load();

  return function unmount() {
    // Listeners are removed through ctx.signal; in-flight requests are ignored once it is aborted.
  };
}
