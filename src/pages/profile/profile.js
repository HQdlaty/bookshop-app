import html from './profile.html?raw';
import './profile.css';
import { createAvatar } from '../../components/avatar/avatar.js';
import { getSession } from '../../services/auth-service.js';
import {
  getAvatarUrl,
  getMyProfile,
  removeAvatar,
  updateDisplayName,
  uploadAvatar,
} from '../../services/profile-service.js';
import { updateProfile } from '../../services/session-store.js';
import { confirmDialog } from '../../utils/confirm-dialog.js';
import { toDbMessage, toStorageMessage } from '../../utils/db-errors.js';
import { inspectAvatarFile } from '../../utils/image-file.js';
import { showError, showSuccess } from '../../utils/toast.js';
import { validateDisplayName } from '../../utils/validation.js';

export const title = 'Profile';

export function mount(container, ctx) {
  container.innerHTML = html; // static, trusted fragment

  const stateEl = container.querySelector('[data-state]');
  const content = container.querySelector('[data-content]');
  const form = container.querySelector('[data-form]');
  const nameInput = form.elements.displayName;
  const submitButton = container.querySelector('[data-submit]');
  const avatarSlot = container.querySelector('[data-avatar]');
  const captionEl = container.querySelector('[data-avatar-caption]');
  const fileInput = container.querySelector('#profile-avatar');
  const avatarError = container.querySelector('[data-avatar-error]');
  const uploadButton = container.querySelector('[data-upload]');
  const clearButton = container.querySelector('[data-clear-file]');
  const removeButton = container.querySelector('[data-remove]');

  let profile = null; // { id, display_name, avatar_path } as last saved
  let avatarFile = null; // a valid image picked but not uploaded yet
  let avatarType = null;
  let previewUrl = null;
  let busy = false; // a request is running

  const nameChanged = () => Boolean(profile) && nameInput.value.trim() !== profile.display_name;
  const isDirty = () => nameChanged() || avatarFile !== null;

  // ----- states -----
  function showLoading() {
    content.hidden = true;
    const spinner = document.createElement('div');
    spinner.className = 'd-flex justify-content-center py-5';
    spinner.setAttribute('role', 'status');
    const circle = document.createElement('div');
    circle.className = 'spinner-border text-primary';
    const label = document.createElement('span');
    label.className = 'visually-hidden';
    label.textContent = 'Loading profile…';
    circle.append(label);
    spinner.append(circle);
    stateEl.replaceChildren(spinner);
  }

  function showLoadError(message) {
    content.hidden = true;
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger d-flex flex-wrap align-items-center gap-2';
    alert.setAttribute('role', 'alert');
    const text = document.createElement('span');
    text.textContent = message;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-sm btn-outline-danger ms-auto';
    retry.textContent = 'Retry';
    retry.addEventListener('click', load, { signal: ctx.signal });
    alert.append(text, retry);
    stateEl.replaceChildren(alert);
  }

  // ----- busy state -----
  function setBusy(isBusy, { name = false, upload = false } = {}) {
    busy = isBusy;
    submitButton.disabled = isBusy;
    submitButton.querySelector('.spinner-border').hidden = !(isBusy && name);
    submitButton.querySelector('[data-label]').textContent = isBusy && name ? 'Saving…' : 'Save name';
    uploadButton.disabled = isBusy;
    uploadButton.querySelector('.spinner-border').hidden = !(isBusy && upload);
    uploadButton.querySelector('[data-upload-label]').textContent = isBusy && upload ? 'Uploading…' : 'Upload avatar';
    clearButton.disabled = isBusy;
    removeButton.disabled = isBusy;
    fileInput.disabled = isBusy;
    form.setAttribute('aria-busy', String(isBusy));
  }

  // ----- name -----
  function setNameError(message) {
    nameInput.classList.toggle('is-invalid', Boolean(message));
    if (message) nameInput.setAttribute('aria-invalid', 'true');
    else nameInput.removeAttribute('aria-invalid');
    form.querySelector('[data-error-for="displayName"]').textContent = message;
  }

  let nameTouched = false;
  nameInput.addEventListener('blur', () => {
    nameTouched = true;
    setNameError(validateDisplayName(nameInput.value));
  }, { signal: ctx.signal });
  nameInput.addEventListener('input', () => {
    if (nameTouched || nameInput.classList.contains('is-invalid')) setNameError(validateDisplayName(nameInput.value));
  }, { signal: ctx.signal });

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); // never let the browser submit the form natively
    if (busy) return;
    nameTouched = true;
    const message = validateDisplayName(nameInput.value);
    setNameError(message);
    if (message) {
      nameInput.focus();
      return;
    }
    if (!nameChanged()) return;

    setBusy(true, { name: true });
    try {
      const saved = await updateDisplayName(nameInput.value.trim());
      updateProfile({ displayName: saved.display_name }); // the header shows the new name, even if we left the page
      if (ctx.signal.aborted) return;
      profile = saved;
      nameInput.value = saved.display_name;
      showSuccess('Display name saved.');
    } catch (error) {
      if (ctx.signal.aborted) return;
      console.error('Saving the display name failed', error?.code ?? error?.name);
      // The input keeps what was typed so it can be corrected and saved again.
      if (error?.code === '23514') setNameError('Use a name with at least one visible character, up to 100 characters.');
      else showError(toDbMessage(error));
    } finally {
      if (!ctx.signal.aborted) setBusy(false);
    }
  }, { signal: ctx.signal });

  // ----- avatar -----
  function renderAvatar() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;

    let url;
    if (avatarFile) {
      previewUrl = URL.createObjectURL(avatarFile);
      url = previewUrl;
      captionEl.textContent = 'New avatar. It is saved when you upload it.';
    } else {
      url = getAvatarUrl(profile.avatar_path);
      captionEl.textContent = profile.avatar_path ? 'Your current avatar.' : 'You have no avatar yet.';
    }
    const avatar = createAvatar(url, { size: '8rem' });
    avatarSlot.replaceChildren(avatar);

    uploadButton.hidden = !avatarFile;
    clearButton.hidden = !avatarFile;
    removeButton.hidden = Boolean(avatarFile) || !profile.avatar_path;
  }

  function setAvatarError(message) {
    fileInput.classList.toggle('is-invalid', Boolean(message));
    if (message) fileInput.setAttribute('aria-invalid', 'true');
    else fileInput.removeAttribute('aria-invalid');
    avatarError.textContent = message;
  }

  function clearSelectedFile() {
    avatarFile = null;
    avatarType = null;
    fileInput.value = '';
    renderAvatar();
  }

  fileInput.addEventListener('change', async () => {
    setAvatarError('');
    const file = fileInput.files[0];
    if (!file) {
      clearSelectedFile();
      return;
    }
    const result = await inspectAvatarFile(file);
    if (ctx.signal.aborted) return;
    if (!result.ok) {
      clearSelectedFile();
      setAvatarError(result.message);
      return;
    }
    avatarFile = file;
    avatarType = result.type;
    renderAvatar();
  }, { signal: ctx.signal });

  clearButton.addEventListener('click', () => {
    setAvatarError('');
    clearSelectedFile();
    fileInput.focus();
  }, { signal: ctx.signal });

  uploadButton.addEventListener('click', async () => {
    if (busy || !avatarFile) return;
    setBusy(true, { upload: true });
    try {
      const result = await uploadAvatar(avatarFile, avatarType, profile.avatar_path);
      updateProfile({ avatarPath: result.profile.avatar_path });
      if (ctx.signal.aborted) return;
      profile = result.profile;
      clearSelectedFile();
      showSuccess('Avatar updated.');
      if (result.cleanupFailed) showError('Your avatar was changed, but the previous image could not be removed from storage.');
    } catch (error) {
      if (ctx.signal.aborted) return;
      console.error('Uploading the avatar failed', error?.code ?? error?.name);
      // The picked file stays selected so the user can try again.
      showError(toStorageMessage(error, '1 MB'));
      if (error?.orphaned) showError('The uploaded image could not be cleaned up and may remain in storage.');
    } finally {
      if (!ctx.signal.aborted) setBusy(false);
    }
  }, { signal: ctx.signal });

  removeButton.addEventListener('click', async () => {
    if (busy || !profile?.avatar_path) return;
    const confirmed = await confirmDialog({
      title: 'Remove avatar?',
      message: 'Your avatar will be deleted and replaced with a placeholder.',
      confirmLabel: 'Remove avatar',
      danger: true,
      signal: ctx.signal,
    });
    if (!confirmed || ctx.signal.aborted) return;

    setBusy(true);
    try {
      const result = await removeAvatar(profile.avatar_path);
      updateProfile({ avatarPath: null });
      if (ctx.signal.aborted) return;
      profile = result.profile;
      renderAvatar();
      showSuccess('Avatar removed.');
      if (result.cleanupFailed) showError('Your avatar was removed, but its file could not be deleted from storage.');
    } catch (error) {
      if (ctx.signal.aborted) return;
      console.error('Removing the avatar failed', error?.code ?? error?.name);
      showError(toDbMessage(error));
    } finally {
      if (!ctx.signal.aborted) setBusy(false);
    }
  }, { signal: ctx.signal });

  // ----- unsaved changes -----
  ctx.setLeaveGuard(async () => {
    if (!isDirty()) return true;
    return confirmDialog({
      title: 'Discard changes?',
      message: 'You have unsaved changes. If you leave this page, they will be lost.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
      danger: true,
      signal: ctx.signal,
    });
  });
  window.addEventListener('beforeunload', (event) => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = ''; // makes the browser show its own "leave site?" prompt on reload / tab close
  }, { signal: ctx.signal });

  // ----- loading -----
  async function load() {
    showLoading();
    try {
      const [loaded, session] = await Promise.all([getMyProfile(), getSession()]);
      if (ctx.signal.aborted) return;
      if (!loaded) {
        showLoadError('Your profile could not be found. Please try again later.');
        return;
      }
      profile = loaded;
      nameInput.value = loaded.display_name; // user content: set as a value, never as markup
      container.querySelector('[data-email]').textContent = session?.user?.email ?? '';
      renderAvatar();
      stateEl.replaceChildren();
      content.hidden = false;
    } catch (error) {
      if (ctx.signal.aborted) return;
      console.error('Could not load the profile', error?.code ?? error?.name);
      showLoadError(toDbMessage(error));
    }
  }

  load();

  return function unmount() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    // Listeners are removed through ctx.signal.
  };
}
