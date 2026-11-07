// Friendly, safe messages for Supabase (PostgREST / Storage) errors. Raw error text is never shown to users.
export function toDbMessage(error) {
  const code = error?.code;
  const message = String(error?.message ?? '');

  if (code === '42501') return 'You do not have permission to do that.';
  if (code === 'PGRST301' || code === 'PGRST303' || /\bjwt\b/i.test(message)) {
    return 'Your session has expired. Please log in again.';
  }
  if (error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}
