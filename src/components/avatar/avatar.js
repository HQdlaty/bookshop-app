import './avatar.css';

function placeholder() {
  const icon = document.createElement('i');
  icon.className = 'bi bi-person-fill';
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

/**
 * A round avatar: the image at `url` when there is one (and it loads), otherwise a person icon.
 * It is decorative (hidden from screen readers) because the person's name is always shown next to it.
 * `size` is a CSS length, e.g. '1.5rem'.
 */
export function createAvatar(url, { size = '2.5rem' } = {}) {
  const frame = document.createElement('span');
  frame.className = 'avatar';
  frame.style.setProperty('--avatar-size', size);
  frame.setAttribute('aria-hidden', 'true');

  if (!url) {
    frame.append(placeholder());
    return frame;
  }

  const image = document.createElement('img');
  image.src = url;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => image.replaceWith(placeholder()), { once: true });
  frame.append(image);
  return frame;
}
