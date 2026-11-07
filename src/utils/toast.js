import Toast from 'bootstrap/js/dist/toast.js';
import { toSafeMessage } from './safe-message.js';

// Bootstrap toasts rendered into two live regions that exist before any toast is added,
// so screen readers announce new toasts reliably:
// - errors go to an assertive region (role="alert"), everything else to a polite one (role="status").
const VARIANTS = {
  success: { toastClass: 'text-bg-success', closeClass: 'btn-close-white', icon: 'bi-check-circle-fill', delay: 4000 },
  info: { toastClass: 'text-bg-info', closeClass: '', icon: 'bi-info-circle-fill', delay: 6000 },
  error: { toastClass: 'text-bg-danger', closeClass: 'btn-close-white', icon: 'bi-exclamation-triangle-fill', delay: 10000 },
};

const DEDUPE_WINDOW_MS = 3000;
const MAX_VISIBLE = 4;

let regions = null;
const lastShown = new Map(); // dedupe key -> timestamp of the last time it was shown
const visible = new Map(); // dedupe key -> toast element currently on screen
const retiring = new Set(); // toast elements already told to hide because of the cap

function createRegion(role, live) {
  const region = document.createElement('div');
  region.className = 'd-flex flex-column gap-2';
  region.setAttribute('role', role);
  region.setAttribute('aria-live', live);
  region.setAttribute('aria-atomic', 'false');
  return region;
}

/** Creates the toast live regions. Call once at startup; it is also called lazily on first use. */
export function initToasts() {
  if (regions?.wrapper.isConnected) return regions;

  const wrapper = document.createElement('div');
  wrapper.className = 'toast-container toast-regions position-fixed end-0 p-3';
  const assertive = createRegion('alert', 'assertive');
  const polite = createRegion('status', 'polite');
  wrapper.append(assertive, polite);
  document.body.append(wrapper);

  regions = { wrapper, assertive, polite };
  return regions;
}

function buildToast(variant, text) {
  const el = document.createElement('div');
  el.className = `toast align-items-center border-0 ${variant.toastClass}`;
  el.setAttribute('aria-atomic', 'true');

  const row = document.createElement('div');
  row.className = 'd-flex';

  const body = document.createElement('div');
  body.className = 'toast-body';
  const icon = document.createElement('i');
  icon.className = `bi ${variant.icon} me-2`;
  icon.setAttribute('aria-hidden', 'true');
  const message = document.createElement('span');
  message.textContent = text; // never innerHTML: messages are plain text
  body.append(icon, message);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = `btn-close ${variant.closeClass} me-2 m-auto`.replace(/\s+/g, ' ');
  close.setAttribute('data-bs-dismiss', 'toast');
  close.setAttribute('aria-label', 'Close');

  row.append(body, close);
  el.append(row);
  return el;
}

function show(type, message) {
  const variant = VARIANTS[type];
  const text = toSafeMessage(message);
  const key = `${type}:${text}`;
  const now = Date.now();

  for (const [k, time] of lastShown) {
    if (now - time >= DEDUPE_WINDOW_MS) lastShown.delete(k);
  }
  // Drop an identical message that is already on screen or was shown a moment ago.
  if (visible.has(key) || lastShown.has(key)) return;
  lastShown.set(key, now);

  const { assertive, polite } = initToasts();
  const el = buildToast(variant, text);
  (type === 'error' ? assertive : polite).append(el);
  visible.set(key, el);

  const toast = Toast.getOrCreateInstance(el, { autohide: true, delay: variant.delay });
  el.addEventListener(
    'hidden.bs.toast',
    () => {
      el.remove();
      visible.delete(key);
      retiring.delete(el);
      // Dispose after the current event: Bootstrap can still run a second queued "hide complete"
      // callback (e.g. a double-clicked close button) and would throw on a disposed instance.
      setTimeout(() => toast.dispose(), 0);
    },
    { once: true },
  );
  toast.show();

  // Keep the screen from filling up: retire the oldest toasts when there are too many.
  for (const oldest of visible.values()) {
    if (visible.size - retiring.size <= MAX_VISIBLE) break;
    if (retiring.has(oldest)) continue;
    retiring.add(oldest);
    Toast.getInstance(oldest)?.hide();
  }
}

export const showSuccess = (message) => show('success', message);
export const showInfo = (message) => show('info', message);
/** Errors stay longer and are announced assertively. */
export const showError = (message) => show('error', message);
