import { supabase } from './supabase-client.js';
import { requireAffected } from './service-errors.js';

export const COVER_BUCKET = 'book-covers';

/** Public URL of a cover file, or null when the book has no cover. (Built locally; no request is made.) */
export function getCoverUrl(path) {
  if (!path) return null;
  return supabase.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
}

export const COVER_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Uploads a cover through the Storage API and returns its path: <book-id>/<random-uuid>.<ext>.
 * The path is generated here: the original file name is never used, and nothing is ever overwritten (no upsert).
 * `contentType` must be one of COVER_EXTENSIONS (validate the file first with inspectCoverFile).
 */
export async function uploadCover(bookId, file, contentType) {
  const extension = COVER_EXTENSIONS[contentType];
  if (!extension) throw new Error('Unsupported image type');

  const path = `${bookId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(COVER_BUCKET).upload(path, file, {
    upsert: false,
    contentType,
    cacheControl: '31536000', // the path is unique and never reused, so long caching is safe
  });
  if (error) throw error;
  return path;
}

/** Removes a cover file through the Storage API. Throws if nothing was removed (missing file, or not allowed). */
export async function removeCover(path) {
  const { data, error } = await supabase.storage.from(COVER_BUCKET).remove([path]);
  if (error) throw error;
  requireAffected(data);
}
