export const DISPLAY_NAME_MAX = 100;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt (used by Supabase Auth) ignores everything past 72 bytes
export const EMAIL_MAX = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Every validator returns an error message, or '' when the value is valid.

export function validateDisplayName(value) {
  const name = value.trim();
  if (!name) return 'Display name is required.';
  if (Array.from(name).length > DISPLAY_NAME_MAX) {
    return `Display name must be at most ${DISPLAY_NAME_MAX} characters.`;
  }
  return '';
}

export function validateEmail(value) {
  const email = value.trim();
  if (!email) return 'Email is required.';
  if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
  return '';
}

/** Strength rules for choosing a password (registration). */
export function validateNewPassword(value) {
  if (!value) return 'Password is required.';
  if (value.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (value.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters.`;
  return '';
}

/** Logging in only needs a value; the server decides whether it is correct. */
export function validateLoginPassword(value) {
  return value ? '' : 'Password is required.';
}

export function validatePasswordConfirmation(password, confirmation) {
  if (!confirmation) return 'Please confirm your password.';
  if (password !== confirmation) return 'Passwords do not match.';
  return '';
}
