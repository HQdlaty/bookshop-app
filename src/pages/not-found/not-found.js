import html from './not-found.html?raw';
import './not-found.css';

export const title = 'Page not found';

export function mount(container, ctx) {
  // The fragment is a static, trusted template. User content is only ever set via textContent.
  container.innerHTML = html;
  container.querySelector('[data-path]').textContent = ctx.path;

  return function unmount() {
    // Nothing to clean up yet. Add listeners with { signal: ctx.signal } and they are removed automatically.
  };
}
