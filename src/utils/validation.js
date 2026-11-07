export const DISPLAY_NAME_MAX = 100;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt (used by Supabase Auth) ignores everything past 72 bytes
export const EMAIL_MAX = 254;
export const CATEGORY_NAME_MAX = 100;

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

export function validateCategoryName(value) {
  const name = value.trim();
  if (!name) return 'Category name is required.';
  if (Array.from(name).length > CATEGORY_NAME_MAX) {
    return `Category name must be at most ${CATEGORY_NAME_MAX} characters.`;
  }
  return '';
}

// ----- books -----
export const BOOK_TITLE_MAX = 200;
export const BOOK_AUTHOR_MAX = 200;
export const BOOK_DESCRIPTION_MAX = 5000;
export const YEAR_MIN = 1000;
export const YEAR_MAX = 2100;

const ISBN_PATTERN = /^\d[\d\- ]{8,15}[\dXx]$/; // 10 to 17 characters: ISBN-10 or ISBN-13, with optional hyphens/spaces
const PRICE_PATTERN = /^\d{1,8}(\.\d{1,2})?$/; // numeric(10,2)

export function validateBookTitle(value) {
  const title = value.trim();
  if (!title) return 'Title is required.';
  if (Array.from(title).length > BOOK_TITLE_MAX) return `Title must be at most ${BOOK_TITLE_MAX} characters.`;
  return '';
}

export function validateBookAuthor(value) {
  const author = value.trim();
  if (!author) return 'Author is required.';
  if (Array.from(author).length > BOOK_AUTHOR_MAX) return `Author must be at most ${BOOK_AUTHOR_MAX} characters.`;
  return '';
}

export function validateDescription(value) {
  return Array.from(value.trim()).length > BOOK_DESCRIPTION_MAX
    ? `Description must be at most ${BOOK_DESCRIPTION_MAX} characters.`
    : '';
}

/** Hyphens and spaces are dropped and an "x" check digit is upper-cased, so the same ISBN is always stored the same way. */
export function normalizeIsbn(value) {
  const compact = value.replace(/[\s-]/g, '').toUpperCase();
  return compact === '' ? null : compact;
}

export function validateIsbn(value) {
  const isbn = value.trim();
  if (!isbn) return '';
  if (!ISBN_PATTERN.test(isbn)) return 'Enter a valid ISBN: 10 or 13 digits, hyphens allowed.';
  const digits = normalizeIsbn(isbn);
  return digits.length === 10 || digits.length === 13 ? '' : 'Enter a valid ISBN: 10 or 13 digits, hyphens allowed.';
}

/** A price typed by the admin ("12", "12.5", "12,50") as a number, or null when blank. Call validatePrice first. */
export function parsePrice(value) {
  const text = value.trim().replace(',', '.');
  return text === '' ? null : Number(text);
}

export function validatePrice(value) {
  const text = value.trim().replace(',', '.');
  if (!text) return '';
  if (text.startsWith('-')) return 'Price cannot be negative.';
  if (!PRICE_PATTERN.test(text)) return 'Enter a price like 12.99 (up to 2 decimals).';
  return '';
}

export function validatePublishedYear(value) {
  const text = value.trim();
  if (!text) return '';
  if (!/^\d{1,4}$/.test(text)) return `Enter a year between ${YEAR_MIN} and ${YEAR_MAX}.`;
  const year = Number(text);
  return year >= YEAR_MIN && year <= YEAR_MAX ? '' : `Enter a year between ${YEAR_MIN} and ${YEAR_MAX}.`;
}
