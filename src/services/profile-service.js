import { supabase } from './supabase-client.js';
import { getSession } from './auth-service.js';
import { requireAffected } from './service-errors.js';

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const COLUMNS = 'id, display_name, avatar_path';

/** Public URL of an avatar file, or null when there is none. (Built locally; no request is made.) */
export function getAvatarUrl(path) {
  if (!path) return null;
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function requireUserId() {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw Object.assign(new Error('No session'), { code: 'PGRST301' });
  return userId;
}

/** { id, display_name, avatar_path } for any user id, or null if there is no such profile. Used by the session store. */
export async function getProfileSummary(userId) {
  const { data, error } = await supabase.from('profiles').select(COLUMNS).eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** The signed-in user's own profile, or null. */
export async function getMyProfile() {
  return getProfileSummary(await requireUserId());
}

/** Changes the display name of the signed-in user. Only display_name is sent. */
export async function updateDisplayName(displayName) {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId)
    .select(COLUMNS);
  if (error) throw error;
  return requireAffected(data)[0];
}

async function setAvatarPath(userId, path) {
  const { data, error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId).select(COLUMNS);
  if (error) throw error;
  return requireAffected(data)[0];
}

async function removeAvatarFile(path) {
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) throw error;
  requireAffected(data);
}

// Only ever delete files inside the user's own folder, whatever path the caller passes.
const isOwnFile = (userId, path) => typeof path === 'string' && path.startsWith(`${userId}/`);

/**
 * Uploads a new avatar and makes it the profile's avatar.
 * Order: upload (path <user-id>/<random-uuid>.<ext>, never upsert) -> save avatar_path -> remove the previous file.
 * If saving the profile fails, the new file is removed again and the error is thrown (with `orphaned: true` when
 * even that cleanup failed). A failed removal of the previous file does not fail the call; see `cleanupFailed`.
 * `contentType` must come from inspectAvatarFile. Resolves { profile, cleanupFailed }.
 */
export async function uploadAvatar(file, contentType, previousPath = null) {
  const extension = AVATAR_EXTENSIONS[contentType];
  if (!extension) throw new Error('Unsupported image type');

  const userId = await requireUserId();
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    upsert: false,
    contentType,
    cacheControl: '31536000', // the path is unique and never reused, so long caching is safe
  });
  if (uploadError) throw uploadError;

  let profile;
  try {
    profile = await setAvatarPath(userId, path);
  } catch (error) {
    try {
      await removeAvatarFile(path);
    } catch (cleanupError) {
      console.error('Could not remove the new avatar after a failed save', cleanupError?.code ?? cleanupError?.name);
      error.orphaned = true;
    }
    throw error;
  }

  let cleanupFailed = false;
  if (previousPath && previousPath !== path && isOwnFile(userId, previousPath)) {
    try {
      await removeAvatarFile(previousPath);
    } catch (error) {
      console.error('Could not remove the previous avatar', error?.code ?? error?.name);
      cleanupFailed = true;
    }
  }
  return { profile, cleanupFailed };
}

/**
 * Removes the avatar: clears avatar_path first, then deletes the file, so the profile never points at a missing file.
 * Resolves { profile, cleanupFailed }.
 */
export async function removeAvatar(currentPath) {
  const userId = await requireUserId();
  const profile = await setAvatarPath(userId, null);

  let cleanupFailed = false;
  if (currentPath && isOwnFile(userId, currentPath)) {
    try {
      await removeAvatarFile(currentPath);
    } catch (error) {
      console.error('Could not remove the avatar file', error?.code ?? error?.name);
      cleanupFailed = true;
    }
  }
  return { profile, cleanupFailed };
}
