// Friendly, safe messages for Supabase (PostgREST / Storage) errors. Raw error text is never shown to users.
export function toDbMessage(error) {
  const code = error?.code;
  const message = String(error?.message ?? '');

  if (code === '42501') return 'You do not have permission to do that.';
  if (code === 'NO_ROWS_AFFECTED') return 'That item no longer exists, or you do not have permission to change it.';
  if (code === 'PGRST301' || code === 'PGRST303' || /\bjwt\b/i.test(message)) {
    return 'Your session has expired. Please log in again.';
  }
  if (error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}

/** Like toDbMessage, with extra cases for Storage (upload / remove) errors. */
export function toStorageMessage(error, limit = '2 MB') {
  const status = String(error?.statusCode ?? error?.status ?? '');
  const message = String(error?.message ?? '');
  if (status === '413' || /too large|exceeded the maximum/i.test(message)) return `The image is too large. The limit is ${limit}.`;
  if (status === '415' || /mime|not supported/i.test(message)) return 'This image type is not allowed. Use JPEG, PNG or WebP.';
  if (status === '401' || status === '403' || /row-level security|unauthorized/i.test(message)) {
    return 'You do not have permission to upload images.';
  }
  return toDbMessage(error);
}

/** Like toDbMessage, with the review-specific database errors. */
export function toReviewMessage(error) {
  if (error?.code === '23505') return 'You have already reviewed this book.';
  if (error?.code === '23503') return 'This book no longer exists.';
  if (error?.code === '23514') return 'Your review could not be saved. Check the rating and text.';
  return toDbMessage(error);
}
