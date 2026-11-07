import html from './book-form.html?raw';
import './book-form.css';

export function title(ctx) {
  return ctx.params.id ? 'Edit book' : 'Add book';
}

export function mount(container, ctx) {
  // The fragment is a static, trusted template. User content is only ever set via textContent.
  container.innerHTML = html;
  container.querySelector('[data-mode]').textContent = ctx.params.id ? `Edit book #${ctx.params.id}` : 'Add book';

  return function unmount() {
    // Nothing to clean up yet. Add listeners with { signal: ctx.signal } and they are removed automatically.
  };
}
