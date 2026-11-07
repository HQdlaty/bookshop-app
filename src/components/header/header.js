import Collapse from 'bootstrap/js/dist/collapse.js';
import 'bootstrap/js/dist/dropdown.js';
import html from './header.html?raw';
import './header.css';

function isActive(link, pathname) {
  const href = link.getAttribute('href');
  if (href === '/' || link.dataset.match === 'exact') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function mountHeader(container) {
  container.innerHTML = html; // static, trusted fragment

  const links = [...container.querySelectorAll('a.nav-link, a.dropdown-item')];
  const adminToggle = container.querySelector('[data-admin-toggle]');
  const menu = container.querySelector('#main-nav');

  // Collapse the mobile menu after picking a link.
  container.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a[href]') && menu.classList.contains('show')) {
      Collapse.getOrCreateInstance(menu, { toggle: false }).hide();
    }
  });

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
    },
  };
}
