import { supabase } from './supabase-client.js';

export const USERS_PAGE_SIZE = 20;
export const ROLES = ['user', 'admin'];

function buildResult(users, total, page) {
  return { users, total, page, pageSize: USERS_PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / USERS_PAGE_SIZE)) };
}

async function fetchPage(search, offset) {
  const { data, error } = await supabase.rpc('admin_list_users', {
    p_search: search || null,
    p_limit: USERS_PAGE_SIZE,
    p_offset: offset,
  });
  if (error) throw error;
  return data ?? [];
}

/**
 * One page of users (email, display name, role, joined date) and the exact number of matches.
 * Only admins get an answer: the database function raises 42501 for everyone else.
 * When the page is past the end, `users` is empty and `total` is still correct, so the caller can step back.
 */
export async function listUsers({ search = '', page = 1 } = {}) {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const term = String(search ?? '').trim().slice(0, 100);
  const rows = await fetchPage(term, (safePage - 1) * USERS_PAGE_SIZE);

  if (rows.length === 0 && safePage > 1) {
    // No rows means no total_count either: ask for the first page to learn the total.
    const first = await fetchPage(term, 0);
    return buildResult([], Number(first[0]?.total_count ?? 0), safePage);
  }
  return buildResult(rows, Number(rows[0]?.total_count ?? 0), safePage);
}

/** Changes another user's role. The database refuses non-admins, changing your own role and unknown users. */
export async function setUserRole(userId, role) {
  if (!ROLES.includes(role)) throw new Error('Unknown role');
  const { error } = await supabase.rpc('admin_set_user_role', { p_user_id: userId, p_role: role });
  if (error) throw error;
}
