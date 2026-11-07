const APP_NAME = 'Bookshop';

// Canonical routes. Pages are loaded lazily so each page's CSS and JS is fetched on demand.
// access: 'private' routes need a session; 'admin' routes need a session AND the admin role; anything else is public.
// The guard is a UX layer: RLS in the database is what actually protects the data.
const routes = [
  { path: '/', load: () => import('./pages/home/home.js') },
  { path: '/books', load: () => import('./pages/books/books.js') },
  { path: '/books/:id', load: () => import('./pages/book-details/book-details.js') },
  { path: '/login', load: () => import('./pages/login/login.js') },
  { path: '/profile', access: 'private', load: () => import('./pages/profile/profile.js') },
  { path: '/reviews', access: 'private', load: () => import('./pages/reviews/reviews.js') },
  { path: '/admin', access: 'admin', load: () => import('./pages/admin/admin.js') },
  { path: '/admin/books', access: 'admin', load: () => import('./pages/admin-books/admin-books.js') },
  { path: '/admin/books/add', access: 'admin', load: () => import('./pages/book-form/book-form.js') },
  { path: '/admin/books/:id/edit', access: 'admin', load: () => import('./pages/book-form/book-form.js') },
  { path: '/admin/categories', access: 'admin', load: () => import('./pages/admin-categories/admin-categories.js') },
  { path: '/admin/users', access: 'admin', load: () => import('./pages/admin-users/admin-users.js') },
].map((route) => ({ ...route, ...compile(route.path) }));

const loadNotFound = () => import('./pages/not-found/not-found.js');
const loadNotAuthorized = () => import('./pages/not-authorized/not-authorized.js');

function compile(path) {
  const keys = [];
  const source = path.replace(/:([A-Za-z]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${source}/?$`), keys };
}

function match(pathname) {
  for (const route of routes) {
    const result = route.regex.exec(pathname);
    if (!result) continue;
    try {
      const params = {};
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(result[i + 1]);
      });
      return { route, params };
    } catch {
      return null; // malformed percent-encoding
    }
  }
  return null;
}

let outlet = null;
let onNavigate = () => {};
let ready = Promise.resolve(); // resolves once the session has been restored
let getSession = async () => null;
let checkAdmin = async () => false;
let current = null; // { unmount, controller } of the mounted page
let renderId = 0; // guards against out-of-order async page loads
let activeAccess = 'public'; // 'public' | 'private' | 'admin': access level of the route being shown (or loading)

function teardown() {
  if (!current) return;
  current.controller.abort(); // removes every listener registered with ctx.signal
  try {
    current.unmount?.();
  } catch (error) {
    console.error('Page unmount failed', error);
  }
  current = null;
}

function showError(message) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-danger container my-5';
  alert.setAttribute('role', 'alert');
  alert.textContent = message;
  outlet.replaceChildren(alert);
}

function showLoading() {
  const wrapper = document.createElement('div');
  wrapper.className = 'd-flex justify-content-center py-5';
  const spinner = document.createElement('div');
  spinner.className = 'spinner-border text-primary';
  spinner.setAttribute('role', 'status');
  const label = document.createElement('span');
  label.className = 'visually-hidden';
  label.textContent = 'Loading…';
  spinner.append(label);
  wrapper.append(spinner);
  outlet.replaceChildren(wrapper);
}

async function hasSession() {
  try {
    return Boolean(await getSession());
  } catch (error) {
    console.error('Could not read the session', error);
    return false;
  }
}

async function hasAdminRole() {
  try {
    return Boolean(await checkAdmin());
  } catch (error) {
    console.error('Could not check the admin role', error);
    return false; // fail closed
  }
}

// Sends the visitor to the login page and remembers where they were going.
function redirectToLogin() {
  const returnTo = location.pathname + location.search;
  navigate(`/login?next=${encodeURIComponent(returnTo)}`, { replace: true });
}

async function render(pathname) {
  const id = ++renderId;
  const matched = match(pathname);
  activeAccess = matched?.route.access ?? 'public';

  // Wait for the session to be restored before deciding anything about access.
  await ready;
  if (id !== renderId) return;

  let loader = matched ? matched.route.load : loadNotFound;
  let params = matched ? matched.params : {};

  if (activeAccess !== 'public') {
    const signedIn = await hasSession();
    if (id !== renderId) return;
    if (!signedIn) {
      redirectToLogin();
      return;
    }
    if (activeAccess === 'admin') {
      const admin = await hasAdminRole();
      if (id !== renderId) return;
      if (!admin) {
        // Signed in but not an admin: say so clearly instead of redirecting silently.
        loader = loadNotAuthorized;
        params = {};
      }
    }
  }

  let page;
  try {
    page = await loader();
  } catch (error) {
    if (id !== renderId) return;
    console.error('Failed to load page', error);
    teardown();
    document.title = APP_NAME;
    showError('This page could not be loaded. Check your connection and try again.');
    return;
  }
  if (id !== renderId) return; // a newer navigation superseded this one

  teardown();
  outlet.replaceChildren();

  const controller = new AbortController();
  const ctx = {
    path: pathname,
    params,
    query: new URLSearchParams(location.search),
    signal: controller.signal,
    navigate,
  };

  try {
    const unmount = page.mount(outlet, ctx);
    current = { unmount: typeof unmount === 'function' ? unmount : null, controller };
  } catch (error) {
    controller.abort();
    console.error('Page mount failed', error);
    showError('Something went wrong while showing this page.');
  }

  const pageTitle = typeof page.title === 'function' ? page.title(ctx) : page.title;
  document.title = pageTitle ? `${pageTitle} | ${APP_NAME}` : APP_NAME;
  onNavigate(pathname);
}

export function navigate(to, { replace = false } = {}) {
  const url = new URL(to, location.href);
  if (url.origin !== location.origin) {
    location.assign(url);
    return;
  }
  const target = url.pathname + url.search + url.hash;
  if (target === location.pathname + location.search + location.hash) return;

  history[replace ? 'replaceState' : 'pushState'](null, '', target);
  window.scrollTo(0, 0);
  render(url.pathname);
}

/**
 * Re-checks access for the page being shown, without re-mounting it.
 * Call it when the signed-in user changes (e.g. the session expired or was ended in another tab).
 */
export async function enforceAccess() {
  if (activeAccess === 'public') return;
  const signedIn = await hasSession();
  if (activeAccess === 'public') return; // the user navigated away while we were checking
  if (!signedIn) {
    redirectToLogin();
    return;
  }
  if (activeAccess !== 'admin') return;
  const admin = await hasAdminRole();
  if (!admin && activeAccess === 'admin') render(location.pathname); // shows the "Not authorized" page
}

function onClick(event) {
  // Leave modified clicks (new tab/window, download) and non-primary buttons to the browser.
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!link) return;
  if (link.target && link.target !== '_self') return;
  if (link.hasAttribute('download')) return;
  if (link.getAttribute('rel')?.split(/\s+/).includes('external')) return;

  const url = new URL(link.getAttribute('href'), location.href);
  if (url.origin !== location.origin) return; // external links, mailto:, tel:, etc.

  // In-page anchor on the current URL: let the browser scroll.
  if (url.hash && url.pathname === location.pathname && url.search === location.search) return;

  event.preventDefault();
  navigate(url.pathname + url.search + url.hash);
}

/**
 * options:
 * - outlet: element pages are mounted into
 * - onNavigate(pathname): called after each page is shown
 * - ready: promise that resolves when the session has been restored (the first render waits for it)
 * - getSession(): async, returns the current session or null (used by the private-route guard)
 * - isAdmin(): async, true when the current user is an admin (used by the admin-route guard)
 */
export function startRouter(options) {
  outlet = options.outlet;
  onNavigate = options.onNavigate ?? onNavigate;
  ready = options.ready ?? ready;
  getSession = options.getSession ?? getSession;
  checkAdmin = options.isAdmin ?? checkAdmin;

  document.addEventListener('click', onClick);
  window.addEventListener('popstate', () => render(location.pathname));

  showLoading();
  render(location.pathname);
}
