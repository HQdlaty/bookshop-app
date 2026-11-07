import { supabase } from './supabase-client.js';
import { UUID_PATTERN } from '../utils/format.js';
import { buildSearchPattern, quoteFilterValue } from '../utils/search.js';

export const PAGE_SIZE = 12;

const LIST_COLUMNS = 'id, title, author, price, cover_path, category_id, category:categories(id, name)';
const DETAIL_COLUMNS =
  'id, title, author, description, isbn, price, published_year, cover_path, category_id, created_at, category:categories(id, name)';

/** Exact number of books. Uses a HEAD request, so no rows are transferred. */
export async function countBooks() {
  const { count, error } = await supabase.from('books').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

function applyFilters(query, { search, categoryId }) {
  const pattern = buildSearchPattern(search);
  if (pattern) {
    // The pattern is quoted so user input cannot add or change filters.
    const value = quoteFilterValue(pattern);
    query = query.or(`title.ilike.${value},author.ilike.${value}`);
  }
  if (categoryId && UUID_PATTERN.test(categoryId)) query = query.eq('category_id', categoryId);
  return query;
}

/**
 * One page of books, newest first (created_at desc, then id desc, so the order is deterministic),
 * plus the exact total number of matching books for the page controls.
 */
export async function listBooks({ search = '', categoryId = '', page = 1 } = {}) {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const from = (safePage - 1) * PAGE_SIZE;

  const query = applyFilters(
    supabase.from('books').select(LIST_COLUMNS, { count: 'exact' }),
    { search, categoryId },
  )
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const { data, count, error } = await query;

  if (error?.code === 'PGRST103') {
    // The page is past the end of the results. Ask for the total only, so the caller can move to the last page.
    const head = await applyFilters(
      supabase.from('books').select('*', { count: 'exact', head: true }),
      { search, categoryId },
    );
    if (head.error) throw head.error;
    return buildResult([], head.count ?? 0, safePage);
  }
  if (error) throw error;
  return buildResult(data, count ?? 0, safePage);
}

function buildResult(books, total, page) {
  return { books, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** A single book with its category, or null when the id is malformed or no such book exists. */
export async function getBook(id) {
  if (!UUID_PATTERN.test(String(id))) return null;
  const { data, error } = await supabase.from('books').select(DETAIL_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}
