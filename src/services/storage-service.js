import { supabase } from './supabase-client.js';

export const COVER_BUCKET = 'book-covers';

/** Public URL of a cover file, or null when the book has no cover. (Built locally; no request is made.) */
export function getCoverUrl(path) {
  if (!path) return null;
  return supabase.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
}
