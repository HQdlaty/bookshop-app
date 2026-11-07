import html from './admin-users.html?raw';
import './admin-users.css';

export const title = 'Manage users';

export function mount(container, ctx) {
  // The fragment is a static, trusted template. User content is only ever set via textContent.
  container.innerHTML = html;

  return function unmount() {
    // Nothing to clean up yet. Add listeners with { signal: ctx.signal } and they are removed automatically.
  };
}
