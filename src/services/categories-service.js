import { supabase } from './supabase-client.js';

/** Exact number of categories. Uses a HEAD request, so no rows are transferred. */
export async function countCategories() {
  const { count, error } = await supabase.from('categories').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}
