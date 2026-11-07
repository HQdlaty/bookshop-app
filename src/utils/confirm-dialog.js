import Modal from 'bootstrap/js/dist/modal.js';

/**
 * Shows a Bootstrap confirmation modal and resolves true (confirmed) or false (cancelled, dismissed, or `signal` aborted).
 * All text is set with textContent, so it is safe to include user content in `message`.
 */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, signal } = {}) {
  return new Promise((resolve) => {
    const titleId = `confirm-title-${Math.random().toString(36).slice(2)}`;

    const modalEl = document.createElement('div');
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-labelledby', titleId);
    modalEl.setAttribute('aria-hidden', 'true');

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog modal-dialog-centered';
    const content = document.createElement('div');
    content.className = 'modal-content';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const heading = document.createElement('h2');
    heading.className = 'modal-title h5';
    heading.id = titleId;
    heading.textContent = title;
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn-close';
    closeButton.setAttribute('data-bs-dismiss', 'modal');
    closeButton.setAttribute('aria-label', 'Close');
    header.append(heading, closeButton);

    const body = document.createElement('div');
    body.className = 'modal-body';
    const text = document.createElement('p');
    text.className = 'mb-0';
    text.textContent = message;
    body.append(text);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn-outline-secondary';
    cancelButton.setAttribute('data-bs-dismiss', 'modal');
    cancelButton.textContent = cancelLabel;
    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    confirmButton.textContent = confirmLabel;
    footer.append(cancelButton, confirmButton);

    content.append(header, body, footer);
    dialog.append(content);
    modalEl.append(dialog);
    document.body.append(modalEl);

    const modal = new Modal(modalEl);
    let result = false;
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', onAbort);
      modal.dispose();
      modalEl.remove();
      resolve(result);
    }

    // The page was left while the dialog was open: drop it immediately, including Bootstrap's page lock.
    function onAbort() {
      result = false;
      document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.remove());
      document.body.classList.remove('modal-open');
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('padding-right');
      finish();
    }

    confirmButton.addEventListener('click', () => {
      result = true;
      modal.hide();
    });
    modalEl.addEventListener('shown.bs.modal', () => cancelButton.focus()); // safe default for destructive actions
    modalEl.addEventListener('hidden.bs.modal', finish);

    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    modal.show();
  });
}
