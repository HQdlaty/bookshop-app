/**
 * Returns `value` as a safe same-origin path (pathname + search + hash), or `fallback`.
 * Used for the post-login "return to" URL, so it must never allow an open redirect:
 * - must start with a single "/" (rejects "https://evil.com", "javascript:...", "//evil.com", "/\evil.com")
 * - no backslashes or control characters (browsers treat "\" like "/" and strip tabs/newlines)
 * - must resolve to the current origin
 * - never points back at /login (would loop)
 */
export function safeInternalPath(value, fallback = null) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2000) return fallback;
  if (value[0] !== '/' || value[1] === '/' || value[1] === '\\') return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;

  const origin = globalThis.location?.origin ?? 'http://localhost';
  let url;
  try {
    url = new URL(value, origin);
  } catch {
    return fallback;
  }
  if (url.origin !== origin) return fallback;
  if (url.pathname === '/login' || url.pathname.startsWith('/login/')) return fallback;

  return url.pathname + url.search + url.hash;
}
