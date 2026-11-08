import html from './book-details.html?raw';
import './book-details.css';
import { createCover } from '../../components/book-cover/book-cover.js';
import { getBook } from '../../services/books-service.js';
import { mountReviews } from './reviews-section.js';
import { toDbMessage } from '../../utils/db-errors.js';
import { formatPrice } from '../../utils/format.js';

export const title = 'Book details';

export function mount(container, ctx) {
  container.innerHTML = html; // static, trusted fragment

  const state = container.querySelector('[data-state]');
  const article = container.querySelector('[data-book]');
  const field = (name) => container.querySelector(`[data-${name}]`);

  function showLoading() {
    article.hidden = true;
    const spinner = document.createElement('div');
    spinner.className = 'd-flex justify-content-center py-5';
    spinner.setAttribute('role', 'status');
    const circle = document.createElement('div');
    circle.className = 'spinner-border text-primary';
    const label = document.createElement('span');
    label.className = 'visually-hidden';
    label.textContent = 'Loading book…';
    circle.append(label);
    spinner.append(circle);
    state.replaceChildren(spinner);
  }

  function showNotFound() {
    article.hidden = true;
    ctx.setTitle('Book not found');
    const box = document.createElement('div');
    box.className = 'text-center py-5';
    const icon = document.createElement('i');
    icon.className = 'bi bi-journal-x display-4 text-body-secondary d-block mb-3';
    icon.setAttribute('aria-hidden', 'true');
    const heading = document.createElement('h1');
    heading.className = 'h2 mb-2';
    heading.textContent = 'Book not found';
    const text = document.createElement('p');
    text.className = 'text-body-secondary mb-4';
    text.textContent = 'This book does not exist or may have been removed.';
    const link = document.createElement('a');
    link.className = 'btn btn-primary';
    link.href = '/books';
    link.textContent = 'Browse all books';
    box.append(icon, heading, text, link);
    state.replaceChildren(box);
  }

  function showError(error) {
    article.hidden = true;
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger d-flex flex-wrap align-items-center gap-2';
    alert.setAttribute('role', 'alert');
    const text = document.createElement('span');
    text.textContent = toDbMessage(error);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-sm btn-outline-danger ms-auto';
    retry.textContent = 'Retry';
    retry.addEventListener('click', load, { signal: ctx.signal });
    alert.append(text, retry);
    state.replaceChildren(alert);
  }

  function showBook(book) {
    state.replaceChildren();
    field('title').textContent = book.title; // user content: textContent only
    field('author').textContent = `by ${book.author}`;

    field('cover').replaceChildren(createCover(book.cover_path, { alt: `Cover of ${book.title}` }));

    field('category-wrap').hidden = !book.category?.name;
    field('category').textContent = book.category?.name ?? '';

    // Rows without a value are hidden together with their label.
    const rows = {
      price: formatPrice(book.price),
      year: book.published_year ? String(book.published_year) : '',
      isbn: book.isbn ?? '',
    };
    for (const [name, value] of Object.entries(rows)) {
      field(name).textContent = value;
      field(name).hidden = !value;
      container.querySelector(`[data-row="${name}"]`).hidden = !value;
    }

    field('description-wrap').hidden = !book.description;
    field('description').textContent = book.description ?? '';

    ctx.setTitle(book.title);
    article.hidden = false;

    mountReviews({
      bookId: book.id,
      signal: ctx.signal,
      initialPage: Number(ctx.query.get('reviews')) || 1,
      els: {
        rating: field('rating-summary'),
        count: field('review-count'),
        composer: field('review-composer'),
        status: field('review-status'),
        list: field('review-list'),
        pagination: field('review-pagination'),
      },
    });
  }

  async function load() {
    showLoading();
    try {
      const book = await getBook(ctx.params.id);
      if (ctx.signal.aborted) return;
      if (!book) showNotFound();
      else showBook(book);
    } catch (error) {
      if (ctx.signal.aborted) return;
      console.error('Could not load the book', error?.code ?? error?.name);
      showError(error);
    }
  }

  load();

  return function unmount() {
    // Listeners are removed through ctx.signal.
  };
}
