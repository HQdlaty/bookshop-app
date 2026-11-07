import html from './admin.html?raw';
import './admin.css';
import { countBooks } from '../../services/books-service.js';
import { countCategories } from '../../services/categories-service.js';
import { toDbMessage } from '../../utils/db-errors.js';

export const title = 'Admin dashboard';

export function mount(container, ctx) {
  container.innerHTML = html; // static, trusted fragment

  const alertRegion = container.querySelector('[data-alert-region]');
  const counters = {
    books: container.querySelector('[data-count="books"]'),
    categories: container.querySelector('[data-count="categories"]'),
  };

  function showLoadError(error) {
    console.error('Could not load the dashboard counts', error?.code ?? error?.name);
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger d-flex flex-wrap align-items-center gap-2 mb-4';

    const text = document.createElement('span');
    text.textContent = toDbMessage(error); // plain text only
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-sm btn-outline-danger ms-auto';
    retry.textContent = 'Retry';
    retry.addEventListener('click', load, { signal: ctx.signal });

    alert.append(text, retry);
    alertRegion.replaceChildren(alert);
  }

  async function load() {
    alertRegion.replaceChildren();
    counters.books.textContent = '…';
    counters.categories.textContent = '…';

    // Independent requests: one failing must not hide the other's number.
    const [books, categories] = await Promise.allSettled([countBooks(), countCategories()]);
    if (ctx.signal.aborted) return;

    const failure = [books, categories].find((result) => result.status === 'rejected');
    counters.books.textContent = books.status === 'fulfilled' ? String(books.value) : '—';
    counters.categories.textContent = categories.status === 'fulfilled' ? String(categories.value) : '—';
    if (failure) showLoadError(failure.reason);
  }

  load();

  return function unmount() {
    // Listeners are removed through ctx.signal.
  };
}
