import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const missing = [
  !url && 'VITE_SUPABASE_URL',
  !publishableKey && 'VITE_SUPABASE_PUBLISHABLE_KEY',
].filter(Boolean);

if (missing.length > 0) {
  throw new Error(
    `Supabase configuration error: missing ${missing.join(' and ')}. ` +
      'Copy .env.example to .env, fill in the values and restart the dev server.',
  );
}

// The single Supabase client for the whole app. Only services in src/services/ import this.
export const supabase = createClient(url, publishableKey);
