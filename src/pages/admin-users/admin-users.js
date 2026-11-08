import Tooltip from 'bootstrap/js/dist/tooltip.js';
import html from './admin-users.html?raw';
import './admin-users.css';
import { createPagination } from '../../components/pagination/pagination.js';
import { getSession } from '../../services/auth-service.js';
import { listUsers, ROLES, setUserRole } from '../../services/admin-users-service.js';
import { confirmDialog } from '../../utils/confirm-dialog.js';
import { toAdminUserMessage } from '../../utils/db-errors.js';
import { formatDate } from '../../utils/format.js';
import { showError, showSuccess } from '../../utils/toast.js';

export const title = 'Manage users';

const DEBOUNCE_MS = 300;
const ROLE_LABELS = { user: 'User', admin: 'Admin' };

export function mount(container, ctx) {
  container.innerHTML = html; // static, trusted fragment

  const form = container.querySelector('[data-search-form]');
  const searchInput = form.elements.search;
  const summary = container.querySelector('[data-summary]');
  const status = container.querySelector('[data-status]');
  const tableWrap = container.querySelector('[data-table-wrap]');
  const rowsEl = container.querySelector('[data-rows]');
  const paginationEl = container.querySelector('[data-pagination]');

  const requestedPage = Number.parseInt(ctx.query.get('page') ?? '', 10);
  let page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  let search = (ctx.query.get('q') ?? '').trim().slice(0, 100);
  let myId = null; // the signed-in admin: their own row cannot be changed
  let requestId = 0; // guards against out-of-order responses
  let busy = false; // a role change is running
  let timer = null;
  let tooltips = [];

  searchInput.value = search;

  const stateToParams = () => {
    const params = {};
    if (search) params.q = search;
    if (page > 1) params.page = String(page);
    return params;
  };
  const hrefFor = (n) => {
    const params = new URLSearchParams(stateToParams());
    if (n > 1) params.set('page', String(n));
    else params.delete('page');
    const query = params.toString();
    return query ? `/admin/users?${query}` : '/admin/users';
  };

  function disposeTooltips() {
    for (const tooltip of tooltips) tooltip.dispose();
    tooltips = [];
  }

  // ----- states -----
  function showStatus(kind, message, onRetry) {
    disposeTooltips();
    tableWrap.hidden = true;
    rowsEl.replaceChildren();
    summary.textContent = '';
    paginationEl.replaceChildren();
    if (kind === 'loading') {
      const spinner = document.createElement('div');
      spinner.className = 'd-flex justify-content-center py-5';
      spinner.setAttribute('role', 'status');
      const circle = document.createElement('div');
      circle.className = 'spinner-border text-primary';
      const label = document.createElement('span');
      label.className = 'visually-hidden';
      label.textContent = 'Loading users…';
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
    } else {
      const empty = document.createElement('p');
      empty.className = 'text-body-secondary text-center py-5 mb-0';
      empty.textContent = search ? `No users match “${search}”.` : 'There are no users yet.'; // user input: textContent
      status.replaceChildren(empty);
    }
  }

  // ----- rows -----
  function cell(text, className) {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text; // user content: textContent only
    return td;
  }

  function roleBadge(role) {
    const badge = document.createElement('span');
    badge.className = `badge ${role === 'admin' ? 'text-bg-primary' : 'text-bg-secondary'}`;
    badge.textContent = ROLE_LABELS[role] ?? role;
    return badge;
  }

  async function changeRole(user, select) {
    const role = select.value;
    if (role === user.role || busy) {
      select.value = user.role;
      return;
    }
    const name = user.display_name || 'this user';
    const confirmed = await confirmDialog({
      title: role === 'admin' ? 'Make this user an admin?' : 'Remove admin rights?',
      message:
        role === 'admin'
          ? `${name} (${user.email}) will become an admin and be able to manage books, categories, reviews and user roles.`
          : `${name} (${user.email}) will become a regular user and lose access to the admin area.`,
      confirmLabel: role === 'admin' ? 'Make admin' : 'Make regular user',
      danger: role !== 'admin',
      signal: ctx.signal,
    });
    if (ctx.signal.aborted) return;
    if (!confirmed) {
      select.value = user.role; // cancelled: put the select back
      return;
    }

    busy = true;
    select.disabled = true;
    try {
      await setUserRole(user.id, role);
      if (ctx.signal.aborted) return;
      showSuccess(`${name} is now ${role === 'admin' ? 'an admin' : 'a regular user'}.`);
      await load({ focusUser: user.id }); // show what the server has now, not what we assume
    } catch (error) {
      if (ctx.signal.aborted) return;
      console.error('Changing the role failed', error?.code ?? error?.name);
      showError(toAdminUserMessage(error));
      select.value = user.role;
      select.disabled = false;
    } finally {
      busy = false;
    }
  }

  function roleControl(user) {
    const label = `Role of ${user.display_name || user.email}`;
    const select = document.createElement('select');
    select.className = 'form-select form-select-sm role-select';
    select.setAttribute('aria-label', label);
    for (const role of ROLES) {
      const option = document.createElement('option');
      option.value = role;
      option.textContent = ROLE_LABELS[role];
      select.append(option);
    }
    select.value = user.role;
    select.dataset.userId = user.id;

    if (user.id !== myId) {
      select.addEventListener('change', () => changeRole(user, select), { signal: ctx.signal });
      return select;
    }

    // Your own row: disabled, with a reason. A disabled control gets no hover or focus events,
    // so the tooltip lives on a focusable wrapper.
    select.disabled = true;
    const wrapper = document.createElement('span');
    wrapper.className = 'd-inline-block';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('data-bs-toggle', 'tooltip');
    wrapper.setAttribute('data-bs-title', 'You cannot change your own role.');
    wrapper.append(select);
    tooltips.push(Tooltip.getOrCreateInstance(wrapper));
    return wrapper;
  }

  function renderRow(user) {
    const tr = document.createElement('tr');

    const name = cell(user.display_name || '(no name)', 'name');
    if (!user.display_name) name.classList.add('text-body-secondary');
    if (user.id === myId) {
      const you = document.createElement('span');
      you.className = 'badge text-bg-light border ms-2 fw-normal';
      you.textContent = 'You';
      name.append(you);
    }
    const role = document.createElement('td');
    role.append(roleBadge(user.role));
    const control = document.createElement('td');
    control.append(roleControl(user));

    tr.append(name, cell(user.email ?? '', 'email'), role, cell(formatDate(user.created_at), 'text-nowrap'), control);
    return tr;
  }

  function render(result) {
    disposeTooltips();
    status.replaceChildren();
    tableWrap.hidden = false;
    rowsEl.replaceChildren(...result.users.map(renderRow));

    const from = (result.page - 1) * result.pageSize + 1;
    const to = from + result.users.length - 1;
    summary.textContent = `Showing ${from}–${to} of ${result.total} ${result.total === 1 ? 'user' : 'users'}`;

    paginationEl.replaceChildren();
    const pagination = createPagination({ page: result.page, totalPages: result.totalPages, hrefFor });
    if (pagination) paginationEl.append(pagination);
  }

  // ----- loading -----
  async function load({ focusUser = null } = {}) {
    const id = ++requestId;
    if (!focusUser) showStatus('loading');
    try {
      const result = await listUsers({ search, page });
      if (id !== requestId || ctx.signal.aborted) return;

      if (result.users.length === 0 && result.total > 0) {
        // Past the last page (e.g. the list shrank): show the last one.
        page = result.totalPages;
        ctx.setQuery(stateToParams(), { replace: true });
        return load({ focusUser });
      }
      if (result.total === 0) {
        showStatus('empty');
        return;
      }
      render(result);
      if (focusUser) rowsEl.querySelector(`select[data-user-id="${CSS.escape(focusUser)}"]`)?.focus();
    } catch (error) {
      if (id !== requestId || ctx.signal.aborted) return;
      console.error('Could not load the users', error?.code ?? error?.name);
      showStatus('error', toAdminUserMessage(error), () => load());
    }
  }

  // ----- search (debounced) and paging -----
  function applySearch(value, { replace }) {
    const next = value.trim().slice(0, 100);
    if (next === search) return;
    search = next;
    page = 1;
    ctx.setQuery(stateToParams(), { replace });
    load();
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => applySearch(searchInput.value, { replace: true }), DEBOUNCE_MS);
  }, { signal: ctx.signal });

  form.addEventListener('submit', (event) => {
    event.preventDefault(); // Enter searches right away
    clearTimeout(timer);
    applySearch(searchInput.value, { replace: false });
  }, { signal: ctx.signal });

  paginationEl.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[data-page]') : null;
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    page = Number(link.dataset.page);
    ctx.setQuery(stateToParams());
    window.scrollTo(0, 0);
    load();
  }, { signal: ctx.signal });

  async function init() {
    try {
      myId = (await getSession())?.user?.id ?? null;
    } catch (error) {
      console.error('Could not read the session', error);
    }
    if (ctx.signal.aborted) return;
    load();
  }

  init();

  return function unmount() {
    clearTimeout(timer);
    disposeTooltips();
    // Listeners are removed through ctx.signal.
  };
}
