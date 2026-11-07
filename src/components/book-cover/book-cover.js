import './book-cover.css';
import { getCoverUrl } from '../../services/storage-service.js';

function createPlaceholder(decorative) {
  const placeholder = document.createElement('div');
  placeholder.className = 'cover-placeholder';
  if (decorative) {
    placeholder.setAttribute('aria-hidden', 'true');
  } else {
    placeholder.setAttribute('role', 'img');
    placeholder.setAttribute('aria-label', 'No cover available');
  }
  const icon = document.createElement('i');
  icon.className = 'bi bi-book';
  icon.setAttribute('aria-hidden', 'true');
  placeholder.append(icon);
  return placeholder;
}

/**
 * A cover frame for a book: the cover image when it has one (and it loads), otherwise a placeholder icon.
 * - `decorative`: use when the title is shown next to it, so screen readers do not repeat it.
 */
export function createCover(coverPath, { alt = '', decorative = false } = {}) {
  const frame = document.createElement('div');
  frame.className = 'book-cover ratio';

  const url = getCoverUrl(coverPath);
  if (!url) {
    frame.append(createPlaceholder(decorative));
    return frame;
  }

  const image = document.createElement('img');
  image.src = url;
  image.alt = decorative ? '' : alt;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => image.replaceWith(createPlaceholder(decorative)), { once: true });
  frame.append(image);
  return frame;
}
