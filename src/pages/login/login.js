import Tab from 'bootstrap/js/dist/tab.js';
import html from './login.html?raw';
import './login.css';
import { getSession, signIn, signUp } from '../../services/auth-service.js';
import { toAuthMessage } from '../../utils/auth-errors.js';
import { safeInternalPath } from '../../utils/safe-redirect.js';
import { showSuccess } from '../../utils/toast.js';
import {
  validateDisplayName,
  validateEmail,
  validateLoginPassword,
  validateNewPassword,
  validatePasswordConfirmation,
} from '../../utils/validation.js';

export const title = 'Log in';

const DEFAULT_DESTINATION = '/books';
const LEAVING = Symbol('leaving'); // returned by a submit handler that navigates away on success

// Replaces the content of a live region with one alert. Inserting into an existing live region gets it announced.
function setAlert(region, type, message) {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} mb-3`;
  alert.textContent = message; // plain text only
  region.replaceChildren(alert);
}

function clearAlert(region) {
  region.replaceChildren();
}

function setFieldError(form, name, message) {
  const input = form.elements[name];
  input.classList.toggle('is-invalid', Boolean(message));
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  form.querySelector(`[data-error-for="${name}"]`).textContent = message;
}

function setSaving(form, saving, savingLabel) {
  const button = form.querySelector('[data-submit]');
  const label = button.querySelector('[data-label]');
  if (saving) button.dataset.label = label.textContent;
  button.disabled = saving;
  button.querySelector('.spinner-border').hidden = !saving;
  label.textContent = saving ? savingLabel : (button.dataset.label ?? label.textContent);
  form.setAttribute('aria-busy', String(saving));
}

/**
 * Wires one form: validation next to each input (on blur, live once touched, and on submit),
 * a disabled submit button while saving, and inputs kept as typed when the request fails.
 */
function setupForm(form, ctx, { rules, savingLabel, submit }) {
  const alertRegion = form.querySelector('[data-alert-region]');
  const touched = new Set();
  let saving = false;

  const values = () => Object.fromEntries(new FormData(form).entries());
  const validateField = (name) => {
    const message = rules[name](values());
    setFieldError(form, name, message);
    return message;
  };

  for (const name of Object.keys(rules)) {
    const input = form.elements[name];
    input.addEventListener('blur', () => {
      touched.add(name);
      validateField(name);
    }, { signal: ctx.signal });

    input.addEventListener('input', () => {
      if (touched.has(name) || input.classList.contains('is-invalid')) validateField(name);
      // The confirmation depends on the password, so keep it in sync.
      if (name === 'password' && form.elements.confirm?.value) validateField('confirm');
    }, { signal: ctx.signal });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); // never let the browser submit (and expose) the form natively
    if (saving) return;
    clearAlert(alertRegion);

    let firstInvalid = null;
    for (const name of Object.keys(rules)) {
      touched.add(name);
      if (validateField(name) && !firstInvalid) firstInvalid = name;
    }
    if (firstInvalid) {
      form.elements[firstInvalid].focus();
      return;
    }

    saving = true;
    setSaving(form, true, savingLabel);
    let leaving = false;
    try {
      leaving = (await submit(values())) === LEAVING;
    } catch (error) {
      if (ctx.signal.aborted) return; // the user left the page meanwhile
      console.error('Authentication request failed', error?.code ?? error?.name);
      setAlert(alertRegion, 'danger', toAuthMessage(error));
    } finally {
      saving = false;
      // Keep the button disabled when we are already navigating away.
      if (!ctx.signal.aborted && !leaving) setSaving(form, false);
    }
  }, { signal: ctx.signal });

  return { alertRegion };
}

export function mount(container, ctx) {
  container.innerHTML = html; // static, trusted fragment

  const next = safeInternalPath(ctx.query.get('next'));
  const destination = next ?? DEFAULT_DESTINATION;

  const loginForm = container.querySelector('#login-form');
  const registerForm = container.querySelector('#register-form');

  const finish = () => {
    ctx.navigate(destination, { replace: true });
    return LEAVING;
  };

  const login = setupForm(loginForm, ctx, {
    savingLabel: 'Logging in…',
    rules: {
      email: (v) => validateEmail(v.email),
      password: (v) => validateLoginPassword(v.password),
    },
    async submit({ email, password }) {
      await signIn(email.trim(), password);
      if (ctx.signal.aborted) return;
      loginForm.elements.password.value = '';
      showSuccess('Signed in.');
      return finish();
    },
  });

  setupForm(registerForm, ctx, {
    savingLabel: 'Creating account…',
    rules: {
      displayName: (v) => validateDisplayName(v.displayName),
      email: (v) => validateEmail(v.email),
      password: (v) => validateNewPassword(v.password),
      confirm: (v) => validatePasswordConfirmation(v.password, v.confirm),
    },
    async submit({ displayName, email, password }) {
      const { session } = await signUp(email.trim(), password, displayName.trim());
      if (ctx.signal.aborted) return;

      registerForm.elements.password.value = '';
      registerForm.elements.confirm.value = '';

      if (session) {
        showSuccess('Account created. Welcome to Bookshop!');
        return finish();
      }

      // No session: the project requires email confirmation first.
      const infoRegion = registerForm.querySelector('[data-info-region]');
      setAlert(
        infoRegion,
        'info',
        `Account created. Please verify your email: we sent a confirmation link to ${email.trim()}. Open it to activate your account, then log in.`,
      );
      // Stay on the Register tab so the message stays visible; prefill the login form for later.
      loginForm.elements.email.value = email.trim();
      infoRegion.scrollIntoView?.({ block: 'nearest' });
    },
  });

  // Starting a new attempt clears messages from the previous one.
  registerForm.addEventListener('input', () => clearAlert(registerForm.querySelector('[data-info-region]')), { signal: ctx.signal });

  if (ctx.query.get('mode') === 'register') {
    Tab.getOrCreateInstance(container.querySelector('#tab-register')).show();
  }
  if (next) setAlert(login.alertRegion, 'info', 'Please log in to continue.');

  // Already signed in? Nothing to do here.
  getSession()
    .then((session) => {
      if (session && !ctx.signal.aborted) finish();
    })
    .catch((error) => console.error('Could not read the session', error));

  return function unmount() {
    // Listeners are removed through ctx.signal. Drop anything typed so passwords do not linger in the DOM.
    for (const input of container.querySelectorAll('input')) input.value = '';
  };
}
