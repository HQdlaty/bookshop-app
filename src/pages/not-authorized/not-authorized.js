import html from './not-authorized.html?raw';
import './not-authorized.css';

export const title = 'Not authorized';

export function mount(container) {
  container.innerHTML = html; // static, trusted fragment
  return function unmount() {};
}
