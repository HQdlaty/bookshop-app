import { getSession, onAuthStateChange } from './auth-service.js';
import { getProfileDisplayName } from './profiles-service.js';

// In-memory view of the signed-in user for the UI (header, guards). Nothing here is persisted:
// the Supabase client keeps the session itself, and logging out clears everything below.

const FALLBACK_NAME = 'Account';

let session = null;
let displayName = null;
let readyPromise = null;
const listeners = new Set();

function metadataName(current) {
  const name = current?.user?.user_metadata?.display_name;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 100) : null;
}

function snapshot() {
  return { session, user: session?.user ?? null, displayName };
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

async function loadProfileName(userId) {
  try {
    const name = await getProfileDisplayName(userId);
    if (session?.user?.id !== userId || !name || name === displayName) return; // signed out or switched meanwhile
    displayName = name;
    notify();
  } catch (error) {
    console.error('Could not load the profile', error);
  }
}

function applySession(next) {
  const previousId = session?.user?.id ?? null;
  session = next;
  const id = next?.user?.id ?? null;
  if (id === previousId) return; // e.g. a token refresh: nothing visible changes

  // Show something immediately (signup metadata), then replace it with the profile's name.
  displayName = id ? (metadataName(next) ?? FALLBACK_NAME) : null;
  notify();
  if (id) loadProfileName(id);
}

/**
 * Restores the session once and starts listening for changes.
 * The returned promise always resolves (a failed restore counts as signed out), so the router can wait on it.
 */
export function initSession() {
  readyPromise ??= (async () => {
    onAuthStateChange((_event, next) => {
      // Supabase can deadlock if its own methods are awaited inside this callback, so defer the work.
      setTimeout(() => applySession(next), 0);
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

/** Calls `listener({ session, user, displayName })` whenever the signed-in user changes. Returns an unsubscribe function. */
export function subscribeSession(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
