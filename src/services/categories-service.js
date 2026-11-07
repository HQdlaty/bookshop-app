import { supabase } from './supabase-client.js';
import { requireAffected } from './service-errors.js';

const COLUMNS = 'id, name, created_at';

/** All categories, ordered by name. */
export async function listCategories() {
  const { data, error } = await supabase.from('categories').select(COLUMNS).order('name', { ascending: true });
  if (error) throw error;
  return data;
}

/** Exact number of categories. Uses a HEAD request, so no rows are transferred. */
export async function countCategories() {
  const { count, error } = await supabase.from('categories').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

// Names are unique case-insensitively (unique index on lower(name)). A duplicate surfaces as error code 23505.
// Deliberately plain insert/update: never upsert on name.
export async function createCategory(name) {
  const { data, error } = await supabase.from('categories').insert({ name }).select(COLUMNS).single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id, name) {
  const { data, error } = await supabase.from('categories').update({ name }).eq('id', id).select(COLUMNS);
  if (error) throw error;
  return requireAffected(data)[0];
}

/** Books in the category are kept; their category_id becomes null (ON DELETE SET NULL). */
export async function deleteCategory(id) {
  const { data, error } = await supabase.from('categories').delete().eq('id', id).select('id');
  if (error) throw error;
  requireAffected(data);
}
