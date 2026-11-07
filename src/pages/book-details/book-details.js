import html from './book-details.html?raw';
import './book-details.css';

export const title = 'Book details';

export function mount(container, ctx) {
  // The fragment is a static, trusted template. User content is only ever set via textContent.
  container.innerHTML = html;
  container.querySelector('[data-book-id]').textContent = ctx.params.id;

  return function unmount() {
    // Nothing to clean up yet. Add listeners with { signal: ctx.signal } and they are removed automatically.
  };
}
