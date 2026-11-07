export const SEARCH_MAX_LENGTH = 100;

/**
 * Builds a LIKE pattern ("%term%") from free text typed by a user, treating the text literally:
 * - "%" and "_" (LIKE wildcards) and "\" (the LIKE escape character) are escaped with a backslash
 * - "*" is dropped: PostgREST treats it as a wildcard inside like/ilike filters and it cannot be escaped
 * Returns '' when nothing searchable is left.
 */
export function buildSearchPattern(term) {
  const cleaned = String(term ?? '').replace(/\*/g, '').trim().slice(0, SEARCH_MAX_LENGTH).trim();
  if (!cleaned) return '';
  return `%${cleaned.replace(/[\\%_]/g, '\\$&')}%`;
}

/**
 * Quotes a value for use inside a PostgREST filter string such as or=(a.ilike.<value>,b.ilike.<value>),
 * so commas, parentheses, dots and spaces in user input cannot change the filter structure.
 * Inside double quotes only "\" and '"' are special, and both are escaped with a backslash.
 */
export function quoteFilterValue(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
