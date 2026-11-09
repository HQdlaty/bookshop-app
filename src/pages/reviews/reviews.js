import html from './reviews.html?raw';
import './reviews.css';
import { createPagination } from '../../components/pagination/pagination.js';
import { createReviewItem } from '../../components/reviews/review-item.js';
import { getSession } from '../../services/auth-service.js';
import { deleteReview, listAllReviews } from '../../services/reviews-service.js';
import { isAdmin } from '../../services/roles-service.js';
import { subscribeSession } from '../../services/session-store.js';
import { confirmDialog } from '../../utils/confirm-dialog.js';
import { toDbMessage } from '../../utils/db-errors.js';
import { showError, showSuccess } from '../../utils/toast.js';

export const title = 'Reviews';

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
  let userId = null; // signed-in user id, or null
  let admin = false;
  let knownUser; // undefined until the first identity check has finished

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
    label.textContent = 'Loading reviews…';
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
    retry.addEventListener('click', () => load(), { signal: ctx.signal });
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
    heading.textContent = 'No reviews yet';
    const text = document.createElement('p');
    text.className = 'text-body-secondary mb-4';
    text.textContent = 'Be the first: open a book and share what you thought.';
    const link = document.createElement('a');
    link.className = 'btn btn-primary';
    link.href = '/books';
    link.textContent = 'Browse books';
    box.append(icon, heading, text, link);
    status.replaceChildren(box);
  }

  // Admins can delete other people's reviews (moderation). RLS decides; this only decides what to show.
  async function moderate(review, button) {
    const name = review.author?.display_name ?? 'this reader';
    const confirmed = await confirmDialog({
      title: 'Delete this review?',
      message: `The review by ${name} of “${review.book?.title ?? 'this book'}” will be permanently deleted. This cannot be undone.`, // user content in plain text
      confirmLabel: 'Delete review',
      danger: true,
      signal: ctx.signal,
    });
    if (!confirmed || ctx.signal.aborted) return;
    button.disabled = true;
    try {
      await deleteReview(review.id);
      if (ctx.signal.aborted) return;
      showSuccess('The review was deleted.');
      await load(); // reload the current page (steps back when its last review was removed)
    } catch (error) {
      if (ctx.signal.aborted) return;
      console.error('Moderating the review failed', error?.code ?? error?.name);
      showError(toDbMessage(error));
      button.disabled = false;
    }
  }

  function setUrlPage(n) {
    ctx.setQuery(n > 1 ? { page: String(n) } : {}, { replace: true });
  }

  async function load() {
    const id = ++loadId;
    showLoading();
    try {
      let result = await listAllReviews(page);
      if (id !== loadId || ctx.signal.aborted) return;
      if (result.total > 0 && result.reviews.length === 0 && result.page > result.totalPages) {
        result = await listAllReviews(result.totalPages);
        if (id !== loadId || ctx.signal.aborted) return;
        setUrlPage(result.page);
      }
      page = result.page;

      status.replaceChildren();
      if (result.total === 0) {
        showEmpty();
        return;
      }
      summary.textContent = result.total === 1 ? '1 review' : `${result.total} reviews`;
      for (const review of result.reviews) {
        const isMine = Boolean(userId) && review.user_id === userId;
        const actions = [];
        if (admin && !isMine) {
          const name = review.author?.display_name ?? 'reader';
          actions.push({
            label: 'Delete',
            icon: 'bi-shield-x',
            danger: true,
            ariaLabel: `Delete review by ${name} (moderation)`,
            onClick: (button) => moderate(review, button),
          });
        }
        const row = document.createElement('li');
        row.append(createReviewItem(review, { book: review.book, badge: isMine ? 'Your review' : '', actions, signal: ctx.signal }));
        list.append(row);
      }
      const pagination = createPagination({
        page: result.page,
        totalPages: result.totalPages,
        hrefFor: (n) => (n > 1 ? `/reviews?page=${n}` : '/reviews'),
      });
      if (pagination) paginationEl.append(pagination);
    } catch (error) {
      if (id !== loadId || ctx.signal.aborted) return;
      console.error('Could not load the reviews', error?.code ?? error?.name);
      showLoadError(error);
    }
  }

  async function loadIdentity() {
    try {
      userId = (await getSession())?.user?.id ?? null;
    } catch (error) {
      console.error('Could not read the session', error);
      userId = null;
    }
    admin = false;
    if (userId) {
      try {
        admin = await isAdmin();
      } catch {
        admin = false; // fail closed
      }
    }
  }

  // Page links are real links; handle them here so only the list reloads.
  paginationEl.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[data-page]') : null;
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    page = Number(link.dataset.page);
    ctx.setQuery(page > 1 ? { page: String(page) } : {});
    load();
    container.querySelector('h1').scrollIntoView?.({ block: 'start' });
  }, { signal: ctx.signal });

  // Logging in or out while the page is open: show the right controls for the new user.
  const unsubscribe = subscribeSession(async ({ user }) => {
    const id = user?.id ?? null;
    if (knownUser === undefined || id === knownUser) return;
    knownUser = id;
    await loadIdentity();
    if (ctx.signal.aborted) return;
    load();
  });
  ctx.signal.addEventListener('abort', unsubscribe, { once: true });

  (async () => {
    await loadIdentity();
    if (ctx.signal.aborted) return;
    knownUser = userId;
    load();
  })();

  return function unmount() {
    // Listeners are removed through ctx.signal.
  };
}
