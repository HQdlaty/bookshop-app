# RLS permission checks

Checked on 2026-11-08 against the hosted Supabase project, through the SQL API.
Each check ran inside one transaction that ended in a forced exception, so nothing was written.
Roles were simulated with `set local role authenticated` (or `anon`) and `request.jwt.claims`, using real user ids:
**A** and **B** are two different non-admin users, **admin** is the admin account.
After the run the row counts were unchanged (reviews 2, users 3, books 3).

| # | Statement | Expected | Actual |
|---|-----------|----------|--------|
| 1 | A: `INSERT INTO reviews (book_id, user_id, rating, body)` with `user_id = A` | allowed | allowed |
| 2 | A: `INSERT INTO reviews (...)` with `user_id = B` | blocked | blocked: new row violates row-level security policy for table "reviews" |
| 3 | A: `UPDATE reviews SET body = ... WHERE id = <B's review>` | 0 rows or blocked | 0 rows affected |
| 4 | A: `UPDATE reviews SET book_id = <other book> WHERE id = <A's review>` | blocked by `freeze_review_keys` | blocked: reviews.book_id and reviews.user_id cannot be changed |
| 5 | A: `UPDATE profiles SET display_name = ... WHERE id = B` | 0 rows or blocked | 0 rows affected |
| 6 | A: `DELETE FROM reviews WHERE id = <B's review>` | 0 rows or blocked | 0 rows affected |
| 7 | admin: `DELETE FROM reviews WHERE id = <B's review>` | allowed | 1 row affected (rolled back) |
| 8 | anon: `INSERT INTO reviews (...)` | blocked | blocked: new row violates row-level security policy for table "reviews" |

After steps 3, 5 and 6, B still had both reviews and an unchanged display name.

Earlier checks (non-admin user, same method): inserts into `categories`, `books` and `user_roles` were blocked; updates and deletes of
`categories` and `books` affected 0 rows; self-promotion through `user_roles` affected 0 rows; an upload to the `book-covers` bucket was blocked.
