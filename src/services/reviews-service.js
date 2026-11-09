import { supabase } from './supabase-client.js';
import { requireUserId, getSession } from './auth-service.js';
import { requireAffected } from './service-errors.js';
import { UUID_PATTERN } from '../utils/format.js';

export const REVIEWS_PAGE_SIZE = 10;

// The author's public profile is joined in (profiles is publicly readable and holds no email).
const COLUMNS = 'id, book_id, user_id, rating, body, created_at, updated_at, author:profiles(display_name, avatar_path)';
const LIST_COLUMNS = `${COLUMNS}, book:books(id, title)`;

function buildResult(reviews, total, page) {
  return {
    reviews,
    total,
    page,
    pageSize: REVIEWS_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / REVIEWS_PAGE_SIZE)),
  };
}

// Newest first; id breaks ties so the order is deterministic across pages.
async function pageOf(buildQuery, columns, page) {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const from = (safePage - 1) * REVIEWS_PAGE_SIZE;

  const { data, count, error } = await buildQuery(supabase.from('reviews').select(columns, { count: 'exact' }))
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + REVIEWS_PAGE_SIZE - 1);

  if (error?.code === 'PGRST103') {
    // Past the last page (e.g. the last review of a page was just deleted): report the total so the caller can step back.
    const head = await buildQuery(supabase.from('reviews').select('*', { count: 'exact', head: true }));
    if (head.error) throw head.error;
    return buildResult([], head.count ?? 0, safePage);
  }
  if (error) throw error;
  return buildResult(data, count ?? 0, safePage);
}

/** One page of a book's reviews (10 per page, newest first) with the exact total. */
export async function listReviews(bookId, page = 1) {
  if (!UUID_PATTERN.test(String(bookId))) return buildResult([], 0, 1);
  return pageOf((query) => query.eq('book_id', bookId), COLUMNS, page);
}

/** One page of every review on every book (10 per page, newest first), each with its book's id and title. Public. */
export async function listAllReviews(page = 1) {
  return pageOf((query) => query, LIST_COLUMNS, page);
}

/** One page of the signed-in user's own reviews, each with its book's id and title. */
export async function listMyReviews(page = 1) {
  const userId = await requireUserId();
  return pageOf((query) => query.eq('user_id', userId), LIST_COLUMNS, page);
}

/**
 * Review count and average rating for a book, from exact database counts (one HEAD request per star value),
 * so it covers every review and not just the page being shown. `distribution[0]` is the number of 1-star reviews.
 */
export async function getReviewStats(bookId) {
  if (!UUID_PATTERN.test(String(bookId))) return { count: 0, average: null, distribution: [0, 0, 0, 0, 0] };
  const distribution = await Promise.all(
    [1, 2, 3, 4, 5].map(async (rating) => {
      const { count, error } = await supabase
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('book_id', bookId)
        .eq('rating', rating);
      if (error) throw error;
      return count ?? 0;
    }),
  );
  const count = distribution.reduce((sum, n) => sum + n, 0);
  const points = distribution.reduce((sum, n, i) => sum + n * (i + 1), 0);
  return { count, average: count ? points / count : null, distribution };
}

/** The signed-in user's review of a book, or null (also null when signed out). */
export async function getMyReview(bookId) {
  if (!UUID_PATTERN.test(String(bookId))) return null;
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from('reviews')
    .select(COLUMNS)
    .eq('book_id', bookId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** One review per user per book is enforced by the database: a second one fails with code 23505. */
export async function createReview({ bookId, rating, body }) {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('reviews')
    .insert({ book_id: bookId, user_id: userId, rating, body })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/** Only rating and body are ever sent: book_id and user_id cannot change (the database blocks it too). */
export async function updateReview(id, { rating, body }) {
  const { data, error } = await supabase.from('reviews').update({ rating, body }).eq('id', id).select(COLUMNS);
  if (error) throw error;
  return requireAffected(data)[0];
}

/** Authors can delete their own review and admins any review; RLS decides, and "no rows" means it was refused or gone. */
export async function deleteReview(id) {
  const { data, error } = await supabase.from('reviews').delete().eq('id', id).select('id');
  if (error) throw error;
  requireAffected(data);
}
