import './reviews.css';
import { createAvatar } from '../avatar/avatar.js';
import { createStars } from './stars.js';
import { getAvatarUrl } from '../../services/profile-service.js';
import { formatDate } from '../../utils/format.js';

function actionButton({ label, icon, danger, ariaLabel, onClick }, signal) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn btn-sm ${danger ? 'btn-outline-danger' : 'btn-outline-secondary'}`;
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
  const glyph = document.createElement('i');
  glyph.className = `bi ${icon} me-1`;
  glyph.setAttribute('aria-hidden', 'true');
  button.append(glyph, document.createTextNode(label));
  button.addEventListener('click', () => onClick(button), { signal });
  return button;
}

/**
 * One review as a card. Every piece of user content is set with textContent.
 * - `book`: { id, title } to show a link to the book above the review (the "my reviews" page).
 * - `badge`: small label next to the name, e.g. "You".
 * - `actions`: [{ label, icon, danger, ariaLabel, onClick(button) }]
 */
export function createReviewItem(review, { book = null, badge = '', actions = [], signal } = {}) {
  const item = document.createElement('article');
  item.className = 'review border rounded p-3';
  item.dataset.reviewId = review.id;

  if (book) {
    const heading = document.createElement('h3');
    heading.className = 'h6 mb-2';
    const link = document.createElement('a');
    link.href = `/books/${encodeURIComponent(book.id)}`;
    link.textContent = book.title;
    heading.append(link);
    item.append(heading);
  }

  const header = document.createElement('div');
  header.className = 'd-flex align-items-center gap-2 mb-2';
  header.append(createAvatar(getAvatarUrl(review.author?.avatar_path), { size: '2.25rem' }));

  const who = document.createElement('div');
  who.className = 'review-name';
  const nameRow = document.createElement('div');
  nameRow.className = 'd-flex flex-wrap align-items-center gap-2';
  const name = document.createElement('strong');
  name.textContent = review.author?.display_name ?? 'Reader';
  nameRow.append(name);
  if (badge) {
    const tag = document.createElement('span');
    tag.className = 'badge text-bg-secondary fw-normal';
    tag.textContent = badge;
    nameRow.append(tag);
  }

  const meta = document.createElement('div');
  meta.className = 'small text-body-secondary';
  const time = document.createElement('time');
  time.dateTime = review.created_at;
  time.textContent = formatDate(review.created_at);
  meta.append(time);
  if (new Date(review.updated_at) - new Date(review.created_at) > 1000) {
    meta.append(document.createTextNode(' · edited'));
  }
  who.append(nameRow, meta);
  header.append(who);

  const rating = document.createElement('div');
  rating.className = 'mb-2';
  rating.append(createStars(review.rating));

  const body = document.createElement('p');
  body.className = 'review-body';
  body.textContent = review.body;

  item.append(header, rating, body);

  if (actions.length) {
    const bar = document.createElement('div');
    bar.className = 'd-flex flex-wrap gap-2 mt-3';
    for (const action of actions) bar.append(actionButton(action, signal));
    item.append(bar);
  }
  return item;
}
