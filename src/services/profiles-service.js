import { supabase } from './supabase-client.js';

/** The display name stored in the user's profile row, or null if there is none. */
export async function getProfileDisplayName(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.display_name ?? null;
}
