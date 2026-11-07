import { supabase } from './supabase-client.js';

/** Exact number of books. Uses a HEAD request, so no rows are transferred. */
export async function countBooks() {
  const { count, error } = await supabase.from('books').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}
