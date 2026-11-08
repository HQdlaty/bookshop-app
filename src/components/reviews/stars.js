import './reviews.css';

function icon(name) {
  const element = document.createElement('i');
  element.className = `bi ${name}`;
  element.setAttribute('aria-hidden', 'true');
  return element;
}

/**
 * Read-only stars for a rating from 0 to 5. Fractions round to the nearest half star.
 * The element has a text alternative ("Rated 4 out of 5 stars"), so the icons are hidden from screen readers.
 */
export function createStars(rating, { label } = {}) {
  const value = Math.max(0, Math.min(5, Math.round(Number(rating) * 2) / 2 || 0));
  const element = document.createElement('span');
  element.className = 'stars';
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', label ?? `Rated ${Number.isInteger(value) ? value : value.toFixed(1)} out of 5 stars`);
  for (let i = 1; i <= 5; i += 1) {
    if (value >= i) element.append(icon('bi-star-fill'));
    else if (value >= i - 0.5) element.append(icon('bi-star-half'));
    else element.append(icon('bi-star'));
  }
  return element;
}

let inputCount = 0;

/**
 * A 1 to 5 star input built from native radio buttons, so it works with the keyboard out of the box:
 * Tab moves into the group, the arrow keys change the rating. Returns { element, getValue, setValue, setError, setDisabled }.
 */
export function createStarInput({ label = 'Rating', value = 0, onChange, signal } = {}) {
  inputCount += 1;
  const name = `star-input-${inputCount}`;

  const fieldset = document.createElement('fieldset');
  fieldset.className = 'star-input';

  const legend = document.createElement('legend');
  legend.className = 'form-label fs-6 float-none';
  legend.textContent = label;

  const options = document.createElement('div');
  options.className = 'star-options';

  const errorId = `${name}-error`;
  const error = document.createElement('div');
  error.className = 'invalid-feedback is-shown';
  error.id = errorId;
  error.hidden = true;

  const radios = [];
  const icons = [];
  for (let n = 1; n <= 5; n += 1) {
    const id = `${name}-${n}`;
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.className = 'visually-hidden';
    radio.name = name;
    radio.id = id;
    radio.value = String(n);
    radio.setAttribute('aria-describedby', errorId);

    const optionLabel = document.createElement('label');
    optionLabel.htmlFor = id;
    const star = icon('bi-star');
    const text = document.createElement('span');
    text.className = 'visually-hidden';
    text.textContent = n === 1 ? '1 star' : `${n} stars`;
    optionLabel.append(star, text);

    radios.push(radio);
    icons.push(star);
    options.append(radio, optionLabel);
  }

  function paint() {
    const current = getValue();
    icons.forEach((star, i) => {
      star.className = `bi ${i < current ? 'bi-star-fill' : 'bi-star'}`;
    });
  }

  function getValue() {
    const checked = radios.find((radio) => radio.checked);
    return checked ? Number(checked.value) : 0;
  }

  function setValue(next) {
    radios.forEach((radio) => {
      radio.checked = Number(radio.value) === next;
    });
    paint();
  }

  function setError(message) {
    error.textContent = message;
    error.hidden = !message;
    radios.forEach((radio) => {
      if (message) radio.setAttribute('aria-invalid', 'true');
      else radio.removeAttribute('aria-invalid');
    });
  }

  for (const radio of radios) {
    radio.addEventListener('change', () => {
      paint();
      onChange?.(getValue());
    }, { signal });
  }

  fieldset.append(legend, options, error);
  setValue(value);

  return {
    element: fieldset,
    getValue,
    setValue,
    setError,
    setDisabled(disabled) {
      fieldset.disabled = disabled;
    },
    focus() {
      (radios.find((radio) => radio.checked) ?? radios[0]).focus();
    },
  };
}
