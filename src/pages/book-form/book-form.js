import html from './book-form.html?raw';
import './book-form.css';
import { createCover } from '../../components/book-cover/book-cover.js';
import { createBook, getBook, updateBook } from '../../services/books-service.js';
import { getSession } from '../../services/auth-service.js';
import { listCategories } from '../../services/categories-service.js';
import { removeCover, uploadCover } from '../../services/storage-service.js';
import { confirmDialog } from '../../utils/confirm-dialog.js';
import { toDbMessage, toStorageMessage } from '../../utils/db-errors.js';
import { inspectCoverFile } from '../../utils/image-file.js';
import { showError, showSuccess } from '../../utils/toast.js';
import {
  normalizeIsbn,
  parsePrice,
  validateBookAuthor,
  validateBookTitle,
  validateDescription,
  validateIsbn,
  validatePrice,
  validatePublishedYear,
} from '../../utils/validation.js';

export function title(ctx) {
  return ctx.params.id ? 'Edit book' : 'Add book';
}

const RULES = {
  title: (v) => validateBookTitle(v.title),
  author: (v) => validateBookAuthor(v.author),
  description: (v) => validateDescription(v.description),
  isbn: (v) => validateIsbn(v.isbn),
  price: (v) => validatePrice(v.price),
  year: (v) => validatePublishedYear(v.year),
};

export function mount(container, ctx) {
  container.innerHTML = html; // static, trusted fragment

  const editingId = ctx.params.id ?? null;
  // A new book gets its id up front, so its cover can be stored under <book-id>/ before the row exists.
  const newBookId = editingId ? null : crypto.randomUUID();

  const form = container.querySelector('[data-form]');
  const stateEl = container.querySelector('[data-state]');
  const alertRegion = container.querySelector('[data-alert-region]');
  const previewEl = container.querySelector('[data-preview]');
  const captionEl = container.querySelector('[data-preview-caption]');
  const fileInput = form.elements.cover;
  const removeBox = form.elements.removeCover;
  const removeWrap = container.querySelector('[data-remove-wrap]');
  const clearFileButton = container.querySelector('[data-clear-file]');
  const submitButton = container.querySelector('[data-submit]');

  container.querySelector('[data-heading]').textContent = editingId ? 'Edit book' : 'Add book';
  container.querySelector('[data-subheading]').textContent = editingId
    ? 'Change the details of this book.'
    : 'Create a new book in the catalog.';

  let book = null; // the book being edited (null when adding)
  let initial = null; // form values when it was shown, to detect unsaved changes
  let coverFile = null; // a valid image picked by the admin, not uploaded yet
  let coverType = null;
  let previewUrl = null;
  let saving = false;
  let saved = false;

  // ----- small helpers -----
  const values = () => ({
    title: form.elements.title.value,
    author: form.elements.author.value,
    description: form.elements.description.value,
    isbn: form.elements.isbn.value,
    price: form.elements.price.value,
    year: form.elements.year.value,
    category: form.elements.category.value,
  });

  const isDirty = () =>
    !saved && Boolean(initial) && (JSON.stringify(values()) !== JSON.stringify(initial) || coverFile !== null || removeBox.checked);

  function setFieldError(name, message) {
    const input = form.elements[name];
    input.classList.toggle('is-invalid', Boolean(message));
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    form.querySelector(`[data-error-for="${name}"]`).textContent = message;
  }

  function setSaving(isSaving, label = 'Save book') {
    saving = isSaving;
    submitButton.disabled = isSaving;
    submitButton.querySelector('.spinner-border').hidden = !isSaving;
    submitButton.querySelector('[data-label]').textContent = label;
    fileInput.disabled = isSaving;
    form.setAttribute('aria-busy', String(isSaving));
  }

  function showState(kind, message, onRetry) {
    form.hidden = true;
    stateEl.replaceChildren();
    if (kind === 'loading') {
      const spinner = document.createElement('div');
      spinner.className = 'd-flex justify-content-center py-5';
      spinner.setAttribute('role', 'status');
      const circle = document.createElement('div');
      circle.className = 'spinner-border text-primary';
      const label = document.createElement('span');
      label.className = 'visually-hidden';
      label.textContent = 'Loading…';
      circle.append(label);
      spinner.append(circle);
      stateEl.append(spinner);
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
      stateEl.append(alert);
    } else if (kind === 'not-found') {
      ctx.setTitle('Book not found');
      const box = document.createElement('div');
      box.className = 'text-center py-5';
      const heading = document.createElement('h2');
      heading.className = 'h3 mb-2';
      heading.textContent = 'Book not found';
      const text = document.createElement('p');
      text.className = 'text-body-secondary mb-3';
      text.textContent = 'This book does not exist or has been deleted.';
      const link = document.createElement('a');
      link.className = 'btn btn-primary';
      link.href = '/admin/books';
      link.textContent = 'Back to books';
      box.append(heading, text, link);
      stateEl.append(box);
    }
  }

  // ----- cover preview -----
  function renderPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;

    let frame;
    let caption;
    if (coverFile) {
      previewUrl = URL.createObjectURL(coverFile);
      frame = createCover(null, { url: previewUrl, alt: 'Preview of the selected cover' });
      caption = 'New cover. It is uploaded when you save.';
    } else if (removeBox.checked) {
      frame = createCover(null);
      caption = 'The current cover will be removed when you save.';
    } else if (book?.cover_path) {
      frame = createCover(book.cover_path, { alt: `Current cover of ${book.title}` });
      caption = 'Current cover.';
    } else {
      frame = createCover(null);
      caption = 'No cover yet.';
    }
    previewEl.replaceChildren(frame);
    captionEl.textContent = caption;

    clearFileButton.hidden = !coverFile;
    // "Remove current cover" only makes sense when there is one and no replacement was picked.
    removeWrap.hidden = !book?.cover_path;
    removeBox.disabled = Boolean(coverFile);
  }

  function clearSelectedFile() {
    coverFile = null;
    coverType = null;
    fileInput.value = '';
    renderPreview();
  }

  fileInput.addEventListener('change', async () => {
    setFieldError('cover', '');
    const file = fileInput.files[0];
    if (!file) {
      clearSelectedFile();
      return;
    }
    const result = await inspectCoverFile(file);
    if (ctx.signal.aborted) return;
    if (!result.ok) {
      clearSelectedFile();
      setFieldError('cover', result.message);
      return;
    }
    coverFile = file;
    coverType = result.type;
    removeBox.checked = false;
    renderPreview();
  }, { signal: ctx.signal });

  clearFileButton.addEventListener('click', () => {
    setFieldError('cover', '');
    clearSelectedFile();
    fileInput.focus();
  }, { signal: ctx.signal });

  removeBox.addEventListener('change', renderPreview, { signal: ctx.signal });

  // ----- validation next to each input -----
  const touched = new Set();
  for (const name of Object.keys(RULES)) {
    const input = form.elements[name];
    input.addEventListener('blur', () => {
      touched.add(name);
      setFieldError(name, RULES[name](values()));
    }, { signal: ctx.signal });
    input.addEventListener('input', () => {
      if (touched.has(name) || input.classList.contains('is-invalid')) setFieldError(name, RULES[name](values()));
    }, { signal: ctx.signal });
  }
  form.elements.category.addEventListener('change', () => setFieldError('category', ''), { signal: ctx.signal });

  // ----- saving -----
  async function discardUpload(path) {
    try {
      await removeCover(path);
    } catch (error) {
      console.error('Could not clean up the uploaded cover', error?.code ?? error?.name);
      showError('The uploaded image could not be cleaned up and may remain in storage.');
    }
  }

  // Returns true when the error was shown next to a field.
  function showFieldError(error) {
    const text = `${error?.message ?? ''} ${error?.details ?? ''}`;
    if (error?.code === '23505' && /isbn/i.test(text)) {
      setFieldError('isbn', 'A book with this ISBN already exists.');
      form.elements.isbn.focus();
      return true;
    }
    if (error?.code === '23503') {
      setFieldError('category', 'This category no longer exists. Choose another one.');
      form.elements.category.focus();
      return true;
    }
    return false;
  }

  async function save() {
    if (saving) return;
    alertRegion.replaceChildren();

    const current = values();
    let firstInvalid = null;
    for (const [name, rule] of Object.entries(RULES)) {
      touched.add(name);
      const message = rule(current);
      setFieldError(name, message);
      if (message && !firstInvalid) firstInvalid = name;
    }
    if (firstInvalid) {
      form.elements[firstInvalid].focus();
      return;
    }

    const fields = {
      title: current.title.trim(),
      author: current.author.trim(),
      description: current.description.trim() || null,
      isbn: normalizeIsbn(current.isbn), // blank -> null
      price: parsePrice(current.price),
      published_year: current.year.trim() ? Number(current.year.trim()) : null,
      category_id: current.category || null,
    };

    setSaving(true, 'Saving…');
    let uploadedPath = null;
    let stage = 'save';
    try {
      // 1. Upload first (if a cover was picked).
      if (coverFile) {
        stage = 'upload';
        setSaving(true, 'Uploading cover…');
        uploadedPath = await uploadCover(editingId ?? newBookId, coverFile, coverType);
        if (ctx.signal.aborted) {
          // The admin left the page while the upload was running: nothing will save this file, so remove it.
          await discardUpload(uploadedPath);
          return;
        }
        stage = 'save';
        setSaving(true, 'Saving…');
      }

      // 2. Then save the book with the new cover_path. If this fails, remove the file we just uploaded.
      try {
        if (editingId) {
          const changes = { ...fields };
          if (uploadedPath) changes.cover_path = uploadedPath;
          else if (removeBox.checked) changes.cover_path = null;
          await updateBook(editingId, changes);
        } else {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) throw Object.assign(new Error('No session'), { code: 'PGRST301' });
          await createBook({ id: newBookId, ...fields, cover_path: uploadedPath, created_by: userId });
        }
      } catch (error) {
        if (uploadedPath) {
          await discardUpload(uploadedPath);
          uploadedPath = null;
        }
        throw error;
      }

      // 3. The book is saved. A replaced or removed cover is deleted last, so a failure can never lose the new data.
      const oldPath = book?.cover_path;
      if (editingId && oldPath && (uploadedPath || removeBox.checked)) {
        try {
          await removeCover(oldPath);
        } catch (error) {
          console.error('Could not remove the previous cover', error?.code ?? error?.name);
          showError('The book was saved, but its previous cover image could not be removed from storage.');
        }
      }

      saved = true;
      showSuccess(editingId ? 'Book saved.' : 'Book created.');
      if (!ctx.signal.aborted) ctx.navigate('/admin/books', { force: true });
    } catch (error) {
      if (ctx.signal.aborted) return;
      console.error('Saving the book failed', stage, error?.code ?? error?.name);
      // The form stays as it was: everything the admin typed (and the picked file) is kept for another try.
      if (!showFieldError(error)) showError(stage === 'upload' ? toStorageMessage(error) : toDbMessage(error));
    } finally {
      if (!ctx.signal.aborted && !saved) setSaving(false);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault(); // never let the browser submit the form natively
    save();
  }, { signal: ctx.signal });

  // ----- unsaved changes -----
  ctx.setLeaveGuard(async () => {
    if (!isDirty()) return true;
    return confirmDialog({
      title: 'Discard changes?',
      message: 'You have unsaved changes. If you leave this page, they will be lost.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
      danger: true,
      signal: ctx.signal,
    });
  });
  window.addEventListener('beforeunload', (event) => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = ''; // makes the browser show its own "leave site?" prompt on reload / tab close
  }, { signal: ctx.signal });

  // ----- loading -----
  function fill(categories) {
    for (const category of categories) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name; // user content: textContent only
      form.elements.category.append(option);
    }
    if (book) {
      form.elements.title.value = book.title;
      form.elements.author.value = book.author;
      form.elements.description.value = book.description ?? '';
      form.elements.isbn.value = book.isbn ?? '';
      form.elements.price.value = book.price === null || book.price === undefined ? '' : Number(book.price).toFixed(2);
      form.elements.year.value = book.published_year ?? '';
      form.elements.category.value = book.category_id ?? '';
      container.querySelector('[data-subheading]').textContent = `Changing “${book.title}”.`;
      ctx.setTitle(`Edit ${book.title}`);
    }
    initial = values();
    renderPreview();
    stateEl.replaceChildren();
    form.hidden = false;
  }

  async function init() {
    showState('loading');
    try {
      const [categories, loaded] = await Promise.all([listCategories(), editingId ? getBook(editingId) : null]);
      if (ctx.signal.aborted) return;
      if (editingId && !loaded) {
        showState('not-found');
        return;
      }
      book = loaded;
      fill(categories);
    } catch (error) {
      if (ctx.signal.aborted) return;
      console.error('Could not load the form', error?.code ?? error?.name);
      showState('error', toDbMessage(error), init);
    }
  }

  init();

  return function unmount() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  };
}
