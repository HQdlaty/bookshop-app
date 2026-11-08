import { createPagination } from '../../components/pagination/pagination.js';
import { createReviewForm } from '../../components/reviews/review-form.js';
import { createReviewItem } from '../../components/reviews/review-item.js';
import { createStars } from '../../components/reviews/stars.js';
import { getSession } from '../../services/auth-service.js';
import { isAdmin } from '../../services/roles-service.js';
import {
  createReview,
  deleteReview,
  getMyReview,
  getReviewStats,
  listReviews,
  updateReview,
} from '../../services/reviews-service.js';
import { subscribeSession } from '../../services/session-store.js';
import { confirmDialog } from '../../utils/confirm-dialog.js';
import { toDbMessage } from '../../utils/db-errors.js';
import { formatAverage } from '../../utils/format.js';
import { showError, showSuccess } from '../../utils/toast.js';

function spinner(text) {
  const wrapper = document.createElement('div');
  wrapper.className = 'd-flex justify-content-center py-4';
  wrapper.setAttribute('role', 'status');
  const circle = document.createElement('div');
  circle.className = 'spinner-border text-primary';
  const label = document.createElement('span');
  label.className = 'visually-hidden';
  label.textContent = text;
  circle.append(label);
  wrapper.append(circle);
  return wrapper;
}

function errorBox(message, onRetry, signal) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-danger d-flex flex-wrap align-items-center gap-2';
  alert.setAttribute('role', 'alert');
  const text = document.createElement('span');
  text.textContent = message;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn btn-sm btn-outline-danger ms-auto';
  retry.textContent = 'Retry';
  retry.addEventListener('click', onRetry, { signal });
  alert.append(text, retry);
  return alert;
}

const plural = (n) => (n === 1 ? '1 review' : `${n} reviews`);

/**
 * Reviews of one book: rating summary, paginated list, the write/edit form and moderation.
 * `els`: { rating, count, composer, status, list, pagination } (elements of the page fragment).
 * The UI only decides what to show: RLS in the database decides what is allowed.
 */
export function mountReviews({ bookId, signal, els, initialPage = 1 }) {
  let userId = null; // signed-in user id, or null
  let admin = false;
  let mine = null; // the signed-in user's review of this book
  let mineError = null; // message when the check for "mine" failed
  let editing = false;
  let page = Number.isInteger(initialPage) && initialPage > 0 ? initialPage : 1;
  let listLoad = 0; // guards against out-of-order list responses

  // ----- summary -----
  function renderSummary(stats) {
    els.count.textContent = plural(stats.count);
    if (!stats.count) {
      els.rating.textContent = 'No reviews yet';
      return;
    }
    const summary = document.createElement('span');
    summary.className = 'd-inline-flex flex-wrap align-items-center gap-2';
    const average = document.createElement('strong');
    average.textContent = formatAverage(stats.average);
    const text = document.createElement('span');
    text.className = 'text-body-secondary';
    text.textContent = `average from ${plural(stats.count)}`;
    summary.append(createStars(stats.average, { label: `Average rating ${formatAverage(stats.average)} out of 5 stars` }), average, text);
    els.rating.replaceChildren(summary);
  }

  async function loadStats() {
    try {
      renderSummary(await getReviewStats(bookId));
    } catch (error) {
      if (signal.aborted) return;
      console.error('Could not load the review summary', error?.code ?? error?.name);
      els.rating.textContent = '';
      els.count.textContent = '';
    }
  }

  // ----- composer: log-in prompt, write form, or the user's own review -----
  function afterMutation() {
    return Promise.all([loadStats(), loadList(page)]);
  }

  async function removeOwn() {
    const confirmed = await confirmDialog({
      title: 'Delete your review?',
      message: 'Your review will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Delete review',
      danger: true,
      signal,
    });
    if (!confirmed || signal.aborted) return;
    try {
      await deleteReview(mine.id);
      if (signal.aborted) return;
      mine = null;
      editing = false;
      showSuccess('Your review was deleted.');
      renderComposer();
      await afterMutation();
    } catch (error) {
      if (signal.aborted) return;
      console.error('Deleting the review failed', error?.code ?? error?.name);
      showError(toDbMessage(error));
    }
  }

  async function submitNew({ rating, body }) {
    let created;
    try {
      created = await createReview({ bookId, rating, body });
    } catch (error) {
      if (error?.code === '23505') {
        // The database allows one review per book per user: they already have one (another tab, or an earlier visit).
        showError('You have already reviewed this book. Your review is shown below.');
        await loadMine();
        renderComposer();
        await afterMutation();
        return;
      }
      throw error; // the form shows it and keeps the input
    }
    if (signal.aborted) return;
    mine = created;
    page = 1; // newest first: the new review is on the first page
    showSuccess('Thank you! Your review was posted.');
    renderComposer();
    await afterMutation();
  }

  async function submitEdit({ rating, body }) {
    const updated = await updateReview(mine.id, { rating, body });
    if (signal.aborted) return;
    mine = updated;
    editing = false;
    showSuccess('Your review was updated.');
    renderComposer();
    await afterMutation();
  }

  function renderComposer() {
    els.composer.replaceChildren();

    if (!userId) {
      const box = document.createElement('div');
      box.className = 'border rounded p-3 d-flex flex-wrap align-items-center gap-3';
      const text = document.createElement('span');
      text.className = 'text-body-secondary';
      text.textContent = 'Share what you thought of this book.';
      const link = document.createElement('a');
      link.className = 'btn btn-primary btn-sm ms-auto';
      link.href = `/login?next=${encodeURIComponent(location.pathname)}`;
      link.textContent = 'Log in to write a review';
      box.append(text, link);
      els.composer.append(box);
      return;
    }

    if (mineError) {
      els.composer.append(errorBox(mineError, retryMine, signal));
      return;
    }

    const heading = document.createElement('h3');
    heading.className = 'h5 mb-3';

    if (!mine) {
      heading.textContent = 'Write a review';
      const form = createReviewForm({ submitLabel: 'Post review', onSubmit: submitNew, signal });
      els.composer.append(heading, form.element);
      return;
    }

    if (editing) {
      heading.textContent = 'Edit your review';
      const form = createReviewForm({
        initial: mine,
        submitLabel: 'Save changes',
        onSubmit: submitEdit,
        onCancel: () => {
          editing = false;
          renderComposer();
        },
        signal,
      });
      els.composer.append(heading, form.element);
      form.focus();
      return;
    }

    heading.textContent = 'Your review';
    els.composer.append(
      heading,
      createReviewItem(mine, {
        signal,
        actions: [
          {
            label: 'Edit',
            icon: 'bi-pencil',
            ariaLabel: 'Edit your review',
            onClick: () => {
              editing = true;
              renderComposer();
            },
          },
          { label: 'Delete', icon: 'bi-trash', danger: true, ariaLabel: 'Delete your review', onClick: removeOwn },
        ],
      }),
    );
  }

  async function loadMine() {
    mineError = null;
    try {
      mine = userId ? await getMyReview(bookId) : null;
    } catch (error) {
      if (signal.aborted) return;
      console.error('Could not check for your review', error?.code ?? error?.name);
      mine = null;
      mineError = 'Could not check whether you already reviewed this book.';
    }
  }

  async function retryMine() {
    await loadMine();
    if (signal.aborted) return;
    renderComposer();
  }

  // ----- list -----
  async function moderate(review, button) {
    const name = review.author?.display_name ?? 'this reader';
    const confirmed = await confirmDialog({
      title: 'Delete this review?',
      message: `The review by ${name} will be permanently deleted. This cannot be undone.`, // user content in plain text
      confirmLabel: 'Delete review',
      danger: true,
      signal,
    });
    if (!confirmed || signal.aborted) return;
    button.disabled = true;
    try {
      await deleteReview(review.id);
      if (signal.aborted) return;
      showSuccess('The review was deleted.');
      await afterMutation();
    } catch (error) {
      if (signal.aborted) return;
      console.error('Moderating the review failed', error?.code ?? error?.name);
      showError(toDbMessage(error));
      button.disabled = false;
    }
  }

  function renderList(result) {
    els.status.replaceChildren();
    els.list.replaceChildren();
    els.pagination.replaceChildren();

    if (result.total === 0) {
      const empty = document.createElement('div');
      empty.className = 'border rounded text-center text-body-secondary p-4';
      empty.textContent = 'No reviews yet. Be the first to share your thoughts.';
      els.status.append(empty);
      return;
    }

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
      row.append(createReviewItem(review, { badge: isMine ? 'Your review' : '', actions, signal }));
      els.list.append(row);
    }

    const pagination = createPagination({
      page: result.page,
      totalPages: result.totalPages,
      hrefFor: (n) => `${location.pathname}?reviews=${n}`,
    });
    if (pagination) els.pagination.append(pagination);
  }

  async function loadList(wanted) {
    const id = ++listLoad;
    els.list.replaceChildren();
    els.pagination.replaceChildren();
    els.status.replaceChildren(spinner('Loading reviews…'));
    els.list.setAttribute('aria-busy', 'true');
    try {
      let result = await listReviews(bookId, wanted);
      if (id !== listLoad || signal.aborted) return;
      if (result.total > 0 && result.reviews.length === 0 && result.page > result.totalPages) {
        // The page no longer exists (the last review of it was deleted): show the new last page.
        result = await listReviews(bookId, result.totalPages);
        if (id !== listLoad || signal.aborted) return;
      }
      page = result.page;
      renderList(result);
    } catch (error) {
      if (id !== listLoad || signal.aborted) return;
      console.error('Could not load the reviews', error?.code ?? error?.name);
      els.status.replaceChildren(errorBox(toDbMessage(error), () => loadList(wanted), signal));
    } finally {
      if (id === listLoad) els.list.removeAttribute('aria-busy');
    }
  }

  els.pagination.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[data-page]') : null;
    if (!link) return;
    event.preventDefault(); // stay on the book: only the review list changes
    loadList(Number(link.dataset.page));
    els.count.closest('section')?.scrollIntoView?.({ block: 'start' });
  }, { signal });

  // ----- identity -----
  async function loadIdentity() {
    try {
      const session = await getSession();
      userId = session?.user?.id ?? null;
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

  async function init() {
    els.composer.replaceChildren(spinner('Loading…'));
    await loadIdentity();
    if (signal.aborted) return;
    knownUser = userId;
    await Promise.all([loadStats(), loadMine(), loadList(page)]);
    if (signal.aborted) return;
    renderComposer();
  }

  // Logging in or out while the page is open: show the right controls for the new user.
  let knownUser; // undefined until the first identity check has finished
  const unsubscribe = subscribeSession(async ({ user }) => {
    const id = user?.id ?? null;
    if (knownUser === undefined || id === knownUser) return; // still starting, or the same user
    knownUser = id;
    editing = false;
    await loadIdentity();
    if (signal.aborted) return;
    await loadMine();
    if (signal.aborted) return;
    renderComposer();
    loadList(page);
  });
  signal.addEventListener('abort', unsubscribe, { once: true });

  init();
}
