import { getSession, onAuthStateChange } from './auth-service.js';
import { getAvatarUrl, getProfileSummary } from './profile-service.js';
import { clearRoleCache } from './roles-service.js';

// In-memory view of the signed-in user for the UI (header, guards). Nothing here is persisted:
// the Supabase client keeps the session itself, and logging out clears everything below.

const FALLBACK_NAME = 'Account';
// Auth events that should make the UI re-check things like the admin role. (Token refreshes change nothing visible.)
const NOTIFYING_EVENTS = new Set(['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED']);

let session = null;
let displayName = null;
let avatarPath = null;
let readyPromise = null;
const listeners = new Set();

function metadataName(current) {
  const name = current?.user?.user_metadata?.display_name;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 100) : null;
}

function snapshot() {
  return { session, user: session?.user ?? null, displayName, avatarPath, avatarUrl: getAvatarUrl(avatarPath) };
}

function notify() {
  for (const listener of listeners) {
    try {
      listener(snapshot());
    } catch (error) {
      console.error('Session listener failed', error);
    }
  }
}

async function loadProfile(userId) {
  try {
    const profile = await getProfileSummary(userId);
    if (session?.user?.id !== userId || !profile) return; // signed out or switched meanwhile
    updateProfile({ displayName: profile.display_name, avatarPath: profile.avatar_path });
  } catch (error) {
    console.error('Could not load the profile', error);
  }
}

/** Tells the UI (header) about a profile change made on the profile page. Only given fields change. */
export function updateProfile({ displayName: name, avatarPath: path } = {}) {
  if (!session) return;
  let changed = false;
  if (name !== undefined && name && name !== displayName) {
    displayName = name;
    changed = true;
  }
  if (path !== undefined && (path ?? null) !== avatarPath) {
    avatarPath = path ?? null;
    changed = true;
  }
  if (changed) notify();
}

function applySession(next, event) {
  const previousId = session?.user?.id ?? null;
  session = next;
  const id = next?.user?.id ?? null;

  if (id === previousId) {
    // Same user: only tell listeners about events that can change what they show (e.g. role checks).
    if (event && NOTIFYING_EVENTS.has(event)) notify();
    return;
  }

  // Show something immediately (signup metadata), then replace it with the profile's name.
  displayName = id ? (metadataName(next) ?? FALLBACK_NAME) : null;
  avatarPath = null;
  notify();
  if (id) loadProfile(id);
}

/**
 * Restores the session once and starts listening for changes.
 * The returned promise always resolves (a failed restore counts as signed out), so the router can wait on it.
 */
export function initSession() {
  readyPromise ??= (async () => {
    onAuthStateChange((event, next) => {
      clearRoleCache(); // any auth state change invalidates the cached admin answer
      // Supabase can deadlock if its own methods are awaited inside this callback, so defer the work.
      setTimeout(() => applySession(next, event), 0);
    });
    try {
      applySession(await getSession());
    } catch (error) {
      console.error('Could not restore the session', error);
      applySession(null);
    }
  })();
  return readyPromise;
}

/** Calls `listener({ session, user, displayName, avatarPath, avatarUrl })` whenever the signed-in user changes. Returns an unsubscribe function. */
export function subscribeSession(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
