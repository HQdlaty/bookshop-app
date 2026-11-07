import html from './admin-books.html?raw';
import './admin-books.css';
import { createPagination } from '../../components/pagination/pagination.js';
import { deleteBook, listBooks } from '../../services/books-service.js';
import { removeCover } from '../../services/storage-service.js';
import { confirmDialog } from '../../utils/confirm-dialog.js';
import { toDbMessage } from '../../utils/db-errors.js';
import { formatPrice } from '../../utils/format.js';
import { showError, showSuccess } from '../../utils/toast.js';

export const title = 'Manage books';

function icon(name) {
  const el = document.createElement('i');
  el.className = `bi ${name} me-1`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export function mount(container, ctx) {
  container.innerHTML = html; // static, trusted fragment

  const summary = container.querySelector('[data-summary]');
  const status = container.querySelector('[data-status]');
  const tableWrap = container.querySelector('[data-table-wrap]');
  const rowsEl = container.querySelector('[data-rows]');
  const paginationEl = container.querySelector('[data-pagination]');

  const requestedPage = Number.parseInt(ctx.query.get('page') ?? '', 10);
  let page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  let requestId = 0;
  let busy = false;

  const hrefFor = (n) => (n > 1 ? `/admin/books?page=${n}` : '/admin/books');
  const setPage = (n, options) => ctx.setQuery(n > 1 ? { page: String(n) } : {}, options);

  function showStatus(kind, message, onRetry) {
    tableWrap.hidden = true;
    summary.textContent = '';
    paginationEl.replaceChildren();
    if (kind === 'loading') {
      const spinner = document.createElement('div');
      spinner.className = 'd-flex justify-content-center py-5';
      spinner.setAttribute('role', 'status');
      const circle = document.createElement('div');
      circle.className = 'spinner-border text-primary';
      const label = document.createElement('span');
      label.className = 'visually-hidden';
      label.textContent = 'Loading books…';
      circle.append(label);
      spinner.append(circle);
      status.replaceChildren(spinner);
    } else if (kind === 'error') {
      const alert = document.createElement('div');
      alert.className = 'alert alert-danger d-flex flex-wrap align-items-center gap-2';
      alert.setAttribute('role', 'alert');
      const text = document.createElement('span');
      text.textContent = message;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-sm btn-outline-danger ms-auto';
      retry.textContent = 'Retry';
      retry.addEventListener('click', onRetry, { signal: ctx.signal });
      alert.append(text, retry);
      status.replaceChildren(alert);
    } else {
      const empty = document.createElement('p');
      empty.className = 'text-body-secondary text-center py-5 mb-0';
      empty.textContent = 'There are no books yet. Use “Add book” to create the first one.';
      status.replaceChildren(empty);
    }
  }

  function cell(text, className) {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text; // user content: textContent only
    return td;
  }

  function row(book) {
    const tr = document.createElement('tr');
    tr.dataset.id = book.id;

    const titleCell = document.createElement('td');
    titleCell.className = 'title-cell';
    const link = document.createElement('a');
    link.href = `/books/${encodeURIComponent(book.id)}`;
    link.textContent = book.title;
    titleCell.append(link);

    const actions = document.createElement('td');
    actions.className = 'text-end actions';
    const edit = document.createElement('a');
    edit.className = 'btn btn-sm btn-outline-secondary me-2';
    edit.href = `/admin/books/${encodeURIComponent(book.id)}/edit`;
    edit.setAttribute('aria-label', `Edit ${book.title}`);
    edit.append(icon('bi-pencil'), document.createTextNode('Edit'));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-sm btn-outline-danger';
    remove.dataset.action = 'delete';
    remove.setAttribute('aria-label', `Delete ${book.title}`);
    remove.append(icon('bi-trash'), document.createTextNode('Delete'));
    actions.append(edit, remove);

    tr.append(titleCell, cell(book.author), cell(book.category?.name ?? '—'), cell(formatPrice(book.price) || '—', 'text-end'), actions);
    return tr;
  }

  async function load() {
    const current = ++requestId;
    showStatus('loading');
    try {
      const result = await listBooks({ page });
      if (ctx.signal.aborted || current !== requestId) return;

      if (result.total > 0 && page > result.totalPages) {
        page = result.totalPages; // e.g. the last book on the last page was deleted
        setPage(page, { replace: true });
        load();
        return;
      }
      if (result.total === 0) {
        showStatus('empty');
        return;
      }

      status.replaceChildren();
      tableWrap.hidden = false;
      rowsEl.replaceChildren(...result.books.map(row));

      const first = (result.page - 1) * result.pageSize + 1;
      summary.textContent = `Showing ${first}–${first + result.books.length - 1} of ${result.total} ${result.total === 1 ? 'book' : 'books'}`;
      const pagination = createPagination({ page: result.page, totalPages: result.totalPages, hrefFor });
      paginationEl.replaceChildren(...(pagination ? [pagination] : []));
    } catch (error) {
      if (ctx.signal.aborted || current !== requestId) return;
      console.error('Could not load books', error?.code ?? error?.name);
      showStatus('error', toDbMessage(error), () => load());
    }
  }

  async function removeBook(tr) {
    if (busy) return;
    const titleText = tr.querySelector('.title-cell a').textContent;
    const id = tr.dataset.id;

    const confirmed = await confirmDialog({
      title: 'Delete book?',
      message: `Delete “${titleText}”? This permanently removes the book, its cover image and all reviews written for it. This cannot be undone.`,
      confirmLabel: 'Delete book',
      danger: true,
      signal: ctx.signal,
    });
    if (!confirmed || ctx.signal.aborted) return;

    busy = true;
    const button = tr.querySelector('[data-action="delete"]');
    button.disabled = true;
    try {
      const deleted = await deleteBook(id);
      if (ctx.signal.aborted) return;

      // The book is gone; now remove its cover file. A failure here leaves an orphan file, which we report.
      let coverRemoved = true;
      if (deleted.cover_path) {
        try {
          await removeCover(deleted.cover_path);
        } catch (error) {
          console.error('Could not remove the cover file', error?.code ?? error?.name);
          coverRemoved = false;
        }
      }
      if (ctx.signal.aborted) return;
      showSuccess('Book deleted.');
      if (!coverRemoved) showError('The book was deleted, but its cover image could not be removed from storage.');
      await load();
    } catch (error) {
      if (ctx.signal.aborted) return;
      button.disabled = false;
      showError(toDbMessage(error));
    } finally {
      busy = false;
    }
  }

  rowsEl.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button[data-action="delete"]') : null;
    if (button && !button.disabled) removeBook(button.closest('tr'));
  }, { signal: ctx.signal });

  // Page links are real links; handle them here so the table reloads without re-mounting the page.
  paginationEl.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[data-page]') : null;
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    page = Number(link.dataset.page);
    setPage(page);
    load();
  }, { signal: ctx.signal });

  load();

  return function unmount() {
    // Listeners and any open confirmation dialog are cleaned up through ctx.signal.
  };
}
