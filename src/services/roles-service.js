import { supabase } from './supabase-client.js';

// Whether the current user is an admin, asked of the database through the is_admin() RPC.
// This only drives the UI (guard page, menu). RLS is what actually protects the data.
//
// The answer is cached per signed-in user and cleared on logout and on every auth state change.
let cached = null; // { userId, promise }

export function clearRoleCache() {
  cached = null;
}

async function fetchIsAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) throw error;
  return data === true;
}

/** Resolves true only when the database says so. Any failure counts as "not an admin" (fail closed). */
export async function isAdmin() {
  let userId = null;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user?.id ?? null;
  } catch (error) {
    console.error('Could not read the session', error);
  }
  if (!userId) return false;

  if (cached?.userId === userId) return cached.promise;

  const promise = fetchIsAdmin().catch((error) => {
    console.error('Could not check the admin role', error?.code ?? error?.name);
    if (cached?.promise === promise) cached = null; // do not cache failures; the next call retries
    return false;
  });
  cached = { userId, promise };
  return promise;
}
