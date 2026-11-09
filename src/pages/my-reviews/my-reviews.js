import html from './my-reviews.html?raw';
import './my-reviews.css';
import { createPagination } from '../../components/pagination/pagination.js';
import { createReviewForm } from '../../components/reviews/review-form.js';
import { createReviewItem } from '../../components/reviews/review-item.js';
import { deleteReview, listMyReviews, updateReview } from '../../services/reviews-service.js';
import { confirmDialog } from '../../utils/confirm-dialog.js';
import { toDbMessage } from '../../utils/db-errors.js';
import { showError, showSuccess } from '../../utils/toast.js';

export const title = 'My reviews';

function parsePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function mount(container, ctx) {
  container.innerHTML = html; // static, trusted fragment

  const summary = container.querySelector('[data-summary]');
  const status = container.querySelector('[data-status]');
  const list = container.querySelector('[data-list]');
  const paginationEl = container.querySelector('[data-pagination]');

  let page = parsePage(ctx.query.get('page'));
  let loadId = 0; // guards against out-of-order responses

  function showLoading() {
    summary.textContent = '';
    list.replaceChildren();
    paginationEl.replaceChildren();
    const wrapper = document.createElement('div');
    wrapper.className = 'd-flex justify-content-center py-5';
    wrapper.setAttribute('role', 'status');
    const circle = document.createElement('div');
    circle.className = 'spinner-border text-primary';
    const label = document.createElement('span');
    label.className = 'visually-hidden';
    label.textContent = 'Loading your reviews…';
    circle.append(label);
    wrapper.append(circle);
    status.replaceChildren(wrapper);
  }

  function showLoadError(error) {
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
    status.replaceChildren(alert);
  }

  function showEmpty() {
    const box = document.createElement('div');
    box.className = 'text-center py-5';
    const icon = document.createElement('i');
    icon.className = 'bi bi-chat-square-text display-4 text-body-secondary d-block mb-3';
    icon.setAttribute('aria-hidden', 'true');
    const heading = document.createElement('h2');
    heading.className = 'h4 mb-2';
    heading.textContent = 'You have not written any reviews yet';
    const text = document.createElement('p');
    text.className = 'text-body-secondary mb-4';
    text.textContent = 'Find a book you have read and tell others what you thought.';
    const link = document.createElement('a');
    link.className = 'btn btn-primary';
    link.href = '/books';
    link.textContent = 'Browse books';
    box.append(icon, heading, text, link);
    status.replaceChildren(box);
  }

  // ----- one row: the review card, or its edit form -----
  function renderRow(row, review) {
    row.replaceChildren(
      createReviewItem(review, {
        book: review.book,
        signal: ctx.signal,
        actions: [
          {
            label: 'Edit',
            icon: 'bi-pencil',
            ariaLabel: `Edit your review of ${review.book?.title ?? 'this book'}`,
            onClick: () => renderEditor(row, review),
          },
          {
            label: 'Delete',
            icon: 'bi-trash',
            danger: true,
            ariaLabel: `Delete your review of ${review.book?.title ?? 'this book'}`,
            onClick: (button) => remove(review, button),
          },
        ],
      }),
    );
  }

  function renderEditor(row, review) {
    const heading = document.createElement('h2');
    heading.className = 'h6 review-edit-title mb-2';
    heading.textContent = `Edit your review of ${review.book?.title ?? 'this book'}`; // user content: textContent
    const form = createReviewForm({
      initial: review,
      submitLabel: 'Save changes',
      signal: ctx.signal,
      onCancel: () => renderRow(row, review),
      async onSubmit({ rating, body }) {
        const updated = await updateReview(review.id, { rating, body }); // throws: the form shows the error
        if (ctx.signal.aborted) return;
        showSuccess('Your review was updated.');
        renderRow(row, { ...updated, book: review.book });
      },
    });
    row.replaceChildren(heading, form.element);
    form.focus();
  }

  async function remove(review, button) {
    const confirmed = await confirmDialog({
      title: 'Delete your review?',
      message: `Your review of “${review.book?.title ?? 'this book'}” will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete review',
      danger: true,
      signal: ctx.signal,
    });
    if (!confirmed || ctx.signal.aborted) return;
    button.disabled = true;
    try {
      await deleteReview(review.id);
      if (ctx.signal.aborted) return;
      showSuccess('Your review was deleted.');
      await load(); // reload the current page (steps back when its last review was removed)
    } catch (error) {
      if (ctx.signal.aborted) return;
      console.error('Deleting the review failed', error?.code ?? error?.name);
      showError(toDbMessage(error));
      button.disabled = false;
    }
  }

  // ----- loading -----
  async function load() {
    const id = ++loadId;
    showLoading();
    try {
      let result = await listMyReviews(page);
      if (id !== loadId || ctx.signal.aborted) return;
      if (result.total > 0 && result.reviews.length === 0 && result.page > result.totalPages) {
        result = await listMyReviews(result.totalPages);
        if (id !== loadId || ctx.signal.aborted) return;
      }
      page = result.page;

      status.replaceChildren();
      if (result.total === 0) {
        showEmpty();
        return;
      }
      summary.textContent = result.total === 1 ? '1 review' : `${result.total} reviews`;
      for (const review of result.reviews) {
        const row = document.createElement('li');
        renderRow(row, review);
        list.append(row);
      }
      const pagination = createPagination({
        page: result.page,
        totalPages: result.totalPages,
        hrefFor: (n) => (n > 1 ? `/profile/reviews?page=${n}` : '/profile/reviews'),
      });
      if (pagination) paginationEl.append(pagination);
    } catch (error) {
      if (id !== loadId || ctx.signal.aborted) return;
      console.error('Could not load your reviews', error?.code ?? error?.name);
      showLoadError(error);
    }
  }

  load();

  return function unmount() {
    // Listeners are removed through ctx.signal.
  };
}
