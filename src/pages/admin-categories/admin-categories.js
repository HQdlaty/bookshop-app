import html from './admin-categories.html?raw';
import './admin-categories.css';
import { createCategory, deleteCategory, listCategories, updateCategory } from '../../services/categories-service.js';
import { confirmDialog } from '../../utils/confirm-dialog.js';
import { toDbMessage } from '../../utils/db-errors.js';
import { showError, showSuccess } from '../../utils/toast.js';
import { validateCategoryName } from '../../utils/validation.js';

export const title = 'Manage categories';

const DUPLICATE_MESSAGE = 'A category with this name already exists.';

function button(className, iconClass, label, action, ariaLabel) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `btn btn-sm ${className}`;
  el.dataset.action = action;
  if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
  const icon = document.createElement('i');
  icon.className = `bi ${iconClass} me-1`;
  icon.setAttribute('aria-hidden', 'true');
  el.append(icon, document.createTextNode(label));
  return el;
}

export function mount(container, ctx) {
  container.innerHTML = html; // static, trusted fragment

  const addForm = container.querySelector('[data-add-form]');
  const addInput = addForm.elements.name;
  const addError = container.querySelector('[data-add-error]');
  const addButton = container.querySelector('[data-add-button]');
  const status = container.querySelector('[data-status]');
  const tableWrap = container.querySelector('[data-table-wrap]');
  const rowsEl = container.querySelector('[data-rows]');

  let categories = [];
  let editingId = null;
  let busy = false; // one change at a time
  let loadToken = 0;

  const names = (exceptId) => categories.filter((c) => c.id !== exceptId).map((c) => c.name.trim().toLowerCase());
  const isDuplicate = (name, exceptId) => names(exceptId).includes(name.trim().toLowerCase());

  function setAddError(message) {
    addInput.classList.toggle('is-invalid', Boolean(message));
    if (message) addInput.setAttribute('aria-invalid', 'true');
    else addInput.removeAttribute('aria-invalid');
    addError.textContent = message;
  }

  function setAddBusy(isBusy) {
    addButton.disabled = isBusy;
    addButton.querySelector('.spinner-border').hidden = !isBusy;
    addButton.querySelector('[data-icon]').hidden = isBusy;
  }

  // ----- rendering -----
  function showStatus(kind, message, onRetry) {
    tableWrap.hidden = true;
    if (kind === 'loading') {
      const spinner = document.createElement('div');
      spinner.className = 'd-flex justify-content-center py-5';
      spinner.setAttribute('role', 'status');
      const circle = document.createElement('div');
      circle.className = 'spinner-border text-primary';
      const label = document.createElement('span');
      label.className = 'visually-hidden';
      label.textContent = 'Loading categories…';
      circle.append(label);
      spinner.append(circle);
      status.replaceChildren(spinner);
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
      status.replaceChildren(alert);
    } else if (kind === 'empty') {
      const empty = document.createElement('p');
      empty.className = 'text-body-secondary text-center py-5 mb-0';
      empty.textContent = 'No categories yet. Add the first one above.';
      status.replaceChildren(empty);
    } else {
      status.replaceChildren();
      tableWrap.hidden = false;
    }
  }

  function viewRow(category) {
    const tr = document.createElement('tr');
    tr.dataset.id = category.id;
    const nameCell = document.createElement('td');
    nameCell.dataset.nameCell = '';
    nameCell.textContent = category.name; // user content: textContent only
    const actions = document.createElement('td');
    actions.className = 'text-end actions';
    actions.append(
      button('btn-outline-secondary me-2', 'bi-pencil', 'Edit', 'edit', `Edit category ${category.name}`),
      button('btn-outline-danger', 'bi-trash', 'Delete', 'delete', `Delete category ${category.name}`),
    );
    tr.append(nameCell, actions);
    return tr;
  }

  function editRow(category) {
    const tr = document.createElement('tr');
    tr.dataset.id = category.id;
    const nameCell = document.createElement('td');
    nameCell.dataset.nameCell = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control';
    input.value = category.name;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', `Name for category ${category.name}`);
    input.dataset.editInput = '';
    const error = document.createElement('div');
    error.className = 'invalid-feedback';
    error.dataset.editError = '';
    nameCell.append(input, error);
    const actions = document.createElement('td');
    actions.className = 'text-end actions';
    actions.append(
      button('btn-primary me-2', 'bi-check-lg', 'Save', 'save'),
      button('btn-outline-secondary', 'bi-x-lg', 'Cancel', 'cancel'),
    );
    tr.append(nameCell, actions);
    return tr;
  }

  function render() {
    if (categories.length === 0) {
      showStatus('empty');
      return;
    }
    showStatus('table');
    rowsEl.replaceChildren(...categories.map((c) => (c.id === editingId ? editRow(c) : viewRow(c))));
    if (editingId) {
      const input = rowsEl.querySelector('[data-edit-input]');
      input.focus();
      input.select();
    }
  }

  async function load({ keepStatus = false } = {}) {
    const token = ++loadToken;
    if (!keepStatus) showStatus('loading');
    try {
      const result = await listCategories();
      if (ctx.signal.aborted || token !== loadToken) return;
      categories = result;
      render();
    } catch (error) {
      if (ctx.signal.aborted || token !== loadToken) return;
      console.error('Could not load categories', error?.code ?? error?.name);
      showStatus('error', toDbMessage(error), () => load());
    }
  }

  // ----- actions -----
  async function runExclusive(task) {
    if (busy) return;
    busy = true;
    try {
      await task();
    } finally {
      busy = false;
    }
  }

  addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runExclusive(async () => {
      const name = addInput.value.trim();
      const problem = validateCategoryName(name) || (isDuplicate(name) ? DUPLICATE_MESSAGE : '');
      setAddError(problem);
      if (problem) {
        addInput.focus();
        return;
      }

      setAddBusy(true);
      try {
        await createCategory(name);
        if (ctx.signal.aborted) return;
        addInput.value = '';
        showSuccess('Category created.');
        await load({ keepStatus: true });
        addInput.focus();
      } catch (error) {
        if (ctx.signal.aborted) return;
        if (error?.code === '23505') setAddError(DUPLICATE_MESSAGE); // lost a race with another admin
        else showError(toDbMessage(error));
        addInput.focus();
      } finally {
        if (!ctx.signal.aborted) setAddBusy(false);
      }
    });
  }, { signal: ctx.signal });

  addInput.addEventListener('input', () => {
    if (addInput.classList.contains('is-invalid')) setAddError('');
  }, { signal: ctx.signal });

  function setRowError(tr, message) {
    const input = tr.querySelector('[data-edit-input]');
    input.classList.toggle('is-invalid', Boolean(message));
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    tr.querySelector('[data-edit-error]').textContent = message;
  }

  function saveEdit(tr) {
    return runExclusive(async () => {
      const id = tr.dataset.id;
      const input = tr.querySelector('[data-edit-input]');
      const name = input.value.trim();
      const problem = validateCategoryName(name) || (isDuplicate(name, id) ? DUPLICATE_MESSAGE : '');
      setRowError(tr, problem);
      if (problem) {
        input.focus();
        return;
      }

      const saveButton = tr.querySelector('[data-action="save"]');
      saveButton.disabled = true;
      try {
        await updateCategory(id, name);
        if (ctx.signal.aborted) return;
        editingId = null;
        showSuccess('Category updated.');
        await load({ keepStatus: true });
        rowsEl.querySelector(`tr[data-id="${CSS.escape(id)}"] [data-action="edit"]`)?.focus();
      } catch (error) {
        if (ctx.signal.aborted) return;
        if (error?.code === '23505') setRowError(tr, DUPLICATE_MESSAGE);
        else showError(toDbMessage(error));
        saveButton.disabled = false;
        input.focus();
      }
    });
  }

  async function removeCategory(tr) {
    const category = categories.find((c) => c.id === tr.dataset.id);
    if (!category || busy) return;

    const confirmed = await confirmDialog({
      title: 'Delete category?',
      message: `Delete the category “${category.name}”? The books in it will not be deleted: they will keep existing but will no longer have a category.`,
      confirmLabel: 'Delete category',
      danger: true,
      signal: ctx.signal,
    });
    if (!confirmed || ctx.signal.aborted) return;

    runExclusive(async () => {
      try {
        await deleteCategory(category.id);
        if (ctx.signal.aborted) return;
        if (editingId === category.id) editingId = null;
        showSuccess('Category deleted.');
        await load({ keepStatus: true });
        addInput.focus();
      } catch (error) {
        if (ctx.signal.aborted) return;
        showError(toDbMessage(error));
      }
    });
  }

  rowsEl.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
    if (!target || target.disabled) return;
    const tr = target.closest('tr');
    switch (target.dataset.action) {
      case 'edit':
        editingId = tr.dataset.id; // starting a new edit abandons any other open one
        render();
        break;
      case 'cancel': {
        const id = tr.dataset.id;
        editingId = null;
        render();
        rowsEl.querySelector(`tr[data-id="${CSS.escape(id)}"] [data-action="edit"]`)?.focus();
        break;
      }
      case 'save':
        saveEdit(tr);
        break;
      case 'delete':
        removeCategory(tr);
        break;
    }
  }, { signal: ctx.signal });

  rowsEl.addEventListener('keydown', (event) => {
    if (!(event.target instanceof HTMLInputElement) || !event.target.matches('[data-edit-input]')) return;
    const tr = event.target.closest('tr');
    if (event.key === 'Enter') {
      event.preventDefault();
      saveEdit(tr);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      tr.querySelector('[data-action="cancel"]').click();
    }
  }, { signal: ctx.signal });

  rowsEl.addEventListener('input', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.classList.contains('is-invalid')) {
      setRowError(event.target.closest('tr'), '');
    }
  }, { signal: ctx.signal });

  load();

  return function unmount() {
    // Listeners and any open confirmation dialog are cleaned up through ctx.signal.
  };
}
