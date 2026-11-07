import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles.css';
import { mountHeader } from './components/header/header.js';
import { mountFooter } from './components/footer/footer.js';
import { enforceAccess, navigate, startRouter } from './router.js';
import { initToasts, showError, showSuccess } from './utils/toast.js';

initToasts();

// Set while logging out so the access check below does not bounce the user to /login
// before we send them to the home page.
let loggingOut = false;
// { initSession, subscribeSession, getSession, signOut }, or null when Supabase is not configured.
let auth = null;

async function handleLogout() {
  if (!auth) return;
  loggingOut = true;
  try {
    await auth.signOut();
    showSuccess('You have been signed out.');
    navigate('/');
  } catch (error) {
    console.error('Sign out failed', error);
    showError('Could not sign out. Please try again.');
  } finally {
    loggingOut = false;
  }
}

const header = mountHeader(document.getElementById('site-header'), { onLogout: handleLogout });
mountFooter(document.getElementById('site-footer'));

// Loaded dynamically so a missing Supabase configuration shows a clear error instead of a blank page.
async function loadAuth() {
  const [store, service] = await Promise.all([
    import('./services/session-store.js'),
    import('./services/auth-service.js'),
  ]);
  return {
    initSession: store.initSession,
    subscribeSession: store.subscribeSession,
    getSession: service.getSession,
    signOut: service.signOut,
  };
}

async function start() {
  try {
    auth = await loadAuth();
  } catch (error) {
    console.error(error);
    showError('Sign-in is unavailable because the app is not configured correctly.');
  }

  if (auth) {
    // Signing out (or an expired session) clears the user from the header and from any private page.
    auth.subscribeSession(({ user, displayName }) => {
      header.setUser(user ? { displayName } : null);
      if (!loggingOut) enforceAccess();
    });
  }

  startRouter({
    outlet: document.getElementById('app'),
    onNavigate: (pathname) => header.setActive(pathname),
    ready: auth ? auth.initSession() : Promise.resolve(),
    getSession: auth ? auth.getSession : async () => null,
  });
}

start();
