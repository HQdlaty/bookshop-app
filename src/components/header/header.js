import Collapse from 'bootstrap/js/dist/collapse.js';
import 'bootstrap/js/dist/dropdown.js';
import html from './header.html?raw';
import './header.css';

function isActive(link, pathname) {
  const href = link.getAttribute('href');
  if (href === '/' || link.dataset.match === 'exact') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Mounts the navbar. Returns:
 * - setActive(pathname): highlights the current page.
 * - setUser({ displayName } | null): switches between the guest ("Log in") and signed-in (name + "Log out") views.
 * `onLogout` is called when the user picks "Log out".
 */
export function mountHeader(container, { onLogout } = {}) {
  container.innerHTML = html; // static, trusted fragment

  const links = [...container.querySelectorAll('a.nav-link, a.dropdown-item')];
  const adminToggle = container.querySelector('[data-admin-toggle]');
  const userToggle = container.querySelector('[data-user-toggle]');
  const nameElement = container.querySelector('[data-user-name]');
  const guestItems = container.querySelectorAll('[data-auth="guest"]');
  const userItems = container.querySelectorAll('[data-auth="user"]');
  const menu = container.querySelector('#main-nav');

  // Collapse the mobile menu after picking a link or logging out.
  container.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('a[href], [data-logout]') && menu.classList.contains('show')) {
      Collapse.getOrCreateInstance(menu, { toggle: false }).hide();
    }
  });

  container.querySelector('[data-logout]').addEventListener('click', () => onLogout?.());

  return {
    setActive(pathname) {
      const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
      for (const link of links) {
        const active = isActive(link, path);
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      adminToggle.classList.toggle('active', path === '/admin' || path.startsWith('/admin/'));
      userToggle.classList.toggle('active', path === '/profile');
    },

    setUser(user) {
      const signedIn = Boolean(user);
      guestItems.forEach((item) => (item.hidden = signedIn));
      userItems.forEach((item) => (item.hidden = !signedIn));
      nameElement.textContent = signedIn ? user.displayName : ''; // user content: textContent only
    },
  };
}
