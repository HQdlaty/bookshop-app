import './reviews.css';
import { createStarInput } from './stars.js';
import { REVIEW_BODY_MAX, validateRating, validateReviewBody } from '../../utils/validation.js';
import { toReviewMessage } from '../../utils/db-errors.js';

let formCount = 0;

/**
 * A review form (stars, text with a character counter) used for both writing and editing.
 * - `initial`: { rating, body } when editing.
 * - `onSubmit({ rating, body })`: async. Throw to show an error inside the form (the input is kept);
 *   return normally when done (the caller then replaces the form).
 * - `onCancel`: shows a Cancel button when given.
 * Returns { element, focus }.
 */
export function createReviewForm({ initial = null, submitLabel = 'Post review', onSubmit, onCancel, signal } = {}) {
  formCount += 1;
  const id = `review-form-${formCount}`;

  const form = document.createElement('form');
  form.className = 'review-form border rounded p-3';
  form.noValidate = true;
  form.method = 'post';

  const alertRegion = document.createElement('div');
  alertRegion.setAttribute('role', 'alert');

  const stars = createStarInput({
    label: 'Your rating',
    value: initial?.rating ?? 0,
    onChange: () => stars.setError(''),
    signal,
  });

  const group = document.createElement('div');
  group.className = 'mt-3 mb-3';
  const label = document.createElement('label');
  label.htmlFor = `${id}-body`;
  label.className = 'form-label';
  label.textContent = 'Your review';
  const textarea = document.createElement('textarea');
  textarea.id = `${id}-body`;
  textarea.name = 'body';
  textarea.className = 'form-control';
  textarea.rows = 5;
  textarea.setAttribute('aria-describedby', `${id}-counter ${id}-error`);
  textarea.value = initial?.body ?? ''; // user content: a value, never markup
  const counter = document.createElement('div');
  counter.id = `${id}-counter`;
  counter.className = 'form-text text-end';
  const error = document.createElement('div');
  error.id = `${id}-error`;
  error.className = 'invalid-feedback';
  group.append(label, textarea, error, counter);

  const actions = document.createElement('div');
  actions.className = 'd-flex flex-wrap gap-2';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary';
  const spinner = document.createElement('span');
  spinner.className = 'spinner-border spinner-border-sm me-2';
  spinner.setAttribute('aria-hidden', 'true');
  spinner.hidden = true;
  const submitText = document.createElement('span');
  submitText.textContent = submitLabel;
  submit.append(spinner, submitText);
  actions.append(submit);

  let cancel = null;
  if (onCancel) {
    cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-outline-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => onCancel(), { signal });
    actions.append(cancel);
  }

  form.append(alertRegion, stars.element, group, actions);

  // ----- behaviour -----
  const length = () => Array.from(textarea.value.trim()).length;

  function updateCounter() {
    const used = length();
    counter.textContent = `${used} / ${REVIEW_BODY_MAX}`;
    counter.classList.toggle('text-danger', used > REVIEW_BODY_MAX);
  }

  function setBodyError(message) {
    textarea.classList.toggle('is-invalid', Boolean(message));
    if (message) textarea.setAttribute('aria-invalid', 'true');
    else textarea.removeAttribute('aria-invalid');
    error.textContent = message;
  }

  function setBusy(busy) {
    submit.disabled = busy;
    spinner.hidden = !busy;
    textarea.disabled = busy;
    stars.setDisabled(busy);
    if (cancel) cancel.disabled = busy;
    form.setAttribute('aria-busy', String(busy));
  }

  let touched = false;
  textarea.addEventListener('input', () => {
    updateCounter();
    if (touched || textarea.classList.contains('is-invalid')) setBodyError(validateReviewBody(textarea.value));
  }, { signal });
  textarea.addEventListener('blur', () => {
    touched = true;
    setBodyError(validateReviewBody(textarea.value));
  }, { signal });

  let sending = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); // never let the browser submit the form natively
    if (sending) return;
    alertRegion.replaceChildren();

    const ratingError = validateRating(stars.getValue());
    const bodyError = validateReviewBody(textarea.value);
    touched = true;
    stars.setError(ratingError);
    setBodyError(bodyError);
    if (ratingError) {
      stars.focus();
      return;
    }
    if (bodyError) {
      textarea.focus();
      return;
    }

    sending = true;
    setBusy(true);
    try {
      await onSubmit({ rating: stars.getValue(), body: textarea.value.trim() });
    } catch (caught) {
      if (signal?.aborted) return;
      console.error('Saving the review failed', caught?.code ?? caught?.name);
      const alert = document.createElement('div');
      alert.className = 'alert alert-danger';
      alert.textContent = toReviewMessage(caught); // plain text; the form keeps what was typed
      alertRegion.replaceChildren(alert);
    } finally {
      sending = false;
      if (!signal?.aborted && form.isConnected) setBusy(false);
    }
  }, { signal });

  updateCounter();

  return {
    element: form,
    focus: () => stars.focus(),
  };
}
