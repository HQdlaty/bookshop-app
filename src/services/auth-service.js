import { supabase } from './supabase-client.js';
import { clearRoleCache } from './roles-service.js';

// Thin wrappers over Supabase Auth. Passwords are only passed through to Supabase:
// they are never stored, logged or put in a URL by this app.

/**
 * Registers a user. `displayName` goes in the signup metadata only as a label;
 * the database trigger decides the profile and the role (always 'user').
 * Returns { user, session }. `session` is null when email confirmation is required.
 */
export async function signUp(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

export async function signOut() {
  clearRoleCache();
  const { error } = await supabase.auth.signOut();
  clearRoleCache();
  if (error) throw error;
}

/** The stored session, or null. Used for routing decisions only; RLS enforces real access. */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/** Subscribes to auth changes. Returns an unsubscribe function. */
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session));
  return () => data.subscription.unsubscribe();
}
