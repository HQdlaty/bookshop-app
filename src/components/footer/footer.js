import html from './footer.html?raw';
import './footer.css';

export function mountFooter(container) {
  container.innerHTML = html; // static, trusted fragment
  container.querySelector('[data-year]').textContent = new Date().getFullYear();
}
