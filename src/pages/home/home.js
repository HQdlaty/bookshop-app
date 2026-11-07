import html from './home.html?raw';
import './home.css';

export const title = 'Home';

// Static content only: this page never queries the database.
export function mount(container) {
  container.innerHTML = html; // static, trusted fragment
  return function unmount() {
    // Nothing to clean up.
  };
}
