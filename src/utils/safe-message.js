const MAX_LENGTH = 200;
const DEFAULT_FALLBACK = 'Something went wrong. Please try again.';

// Order matters: the specific patterns run before the generic "long opaque string" one.
const REDACTIONS = [
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted]'], // JWTs (access / refresh tokens)
  [/\bBearer\s+[\w.~+/=-]+/gi, 'Bearer [redacted]'],
  [/\bsb_(?:publishable|secret)_[\w-]+/g, '[redacted]'], // Supabase API keys
  [/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted]'], // any other long opaque token (UUIDs are 36 chars and survive)
];

const STACK_LINE = /^\s*at\s|\(?[^\s()]+:\d+:\d+\)?\s*$/;

/**
 * Turns anything (string, Error, unknown) into a short single-line message that is safe to show to a user:
 * no stack traces, no tokens or keys, bounded length. Falls back to a generic message when nothing usable is left.
 * The result is plain text: always render it with textContent.
 */
export function toSafeMessage(input, fallback = DEFAULT_FALLBACK) {
  let text = '';
  if (typeof input === 'string') text = input;
  else if (input instanceof Error && typeof input.message === 'string') text = input.message;

  // Keep only the first line, which drops stack traces ("    at fn (file.js:1:2)").
  text = text.split(/\r?\n/, 1)[0] ?? '';
  if (STACK_LINE.test(text)) return fallback;

  for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement);

  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text;
}
