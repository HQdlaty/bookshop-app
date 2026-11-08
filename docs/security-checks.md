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

## Admin user functions

Checked on 2026-11-08, same method (one transaction per run, ended by a forced exception so nothing was written, `set local role` plus
`request.jwt.claims` with real user ids). **A** and **B** are two different non-admin users, **admin** is the admin account.
No emails were printed. After the run the roles were unchanged (1 admin, 3 users).

| # | Statement | Expected | Actual |
|---|-----------|----------|--------|
| a | non-admin: `SELECT * FROM admin_list_users()` | blocked (42501) | blocked [42501] not authorized |
| b | non-admin: `admin_set_user_role(<B>, 'admin')` | blocked | blocked [42501] not authorized |
| b2 | non-admin: `admin_set_user_role(<self>, 'admin')` | blocked | blocked [42501] not authorized |
| c | admin: `admin_list_users()` | rows, `total_count` equals the number of users | rows = 4, total_count = 4 (auth.users has 4) |
| c2 | admin: `admin_list_users(null, 1, 0)` | 1 row, total is the full count | rows = 1, total_count = 4 |
| c3 | admin: `admin_list_users(null, 1, 2)` | 1 row, total is the full count | rows = 1, total_count = 4 |
| c4 | admin: `admin_list_users(null, 1, 99)` | no rows past the end | rows = 0 (past the end) |
| c5 | admin: `admin_list_users(null, 1000, -5)` | clamped, no error | rows = 4 (clamped, no error) |
| c6 | admin: `admin_list_users('%')` | `%` matched literally | rows = 0 (literal %) |
| c7 | admin: `admin_list_users('_')` | `_` matched literally | rows = 0 (literal _) |
| c8 | admin: `admin_list_users(backslash)` | backslash matched literally | rows = 0 (literal backslash) |
| c9 | admin: `admin_list_users('@')` | every email matches | rows = 4, total_count = 4 (every email has one) |
| d | admin: `admin_set_user_role(<B>, 'admin')` | allowed | ALLOWED; B's role now = admin (rolled back) |
| e | admin: `admin_set_user_role(<self>, 'user')` | blocked | blocked [22023] admins cannot change their own role |
| e2 | admin: `admin_set_user_role(<unknown id>, 'admin')` | blocked | blocked [P0002] user not found |
| f | anon: `admin_list_users()` | permission denied | blocked [42501] permission denied for function admin_list_users |
| f2 | anon: `admin_set_user_role(<B>, 'admin')` | permission denied | blocked [42501] permission denied for function admin_set_user_role |

The declared result of `admin_list_users` is `TABLE(id uuid, email text, display_name text, role app_role, created_at timestamp with time zone, total_count bigint)`:
no tokens, password hashes or raw metadata are returned.

## Accepted advisor warnings

Security advisor output after the admin function migration (4 warnings):

- `authenticated_security_definer_function_executable` for `public.admin_list_users`: accepted, signed-in users must be able to call it and it raises 42501 unless `is_admin()` is true; `anon` has no access.
- `authenticated_security_definer_function_executable` for `public.admin_set_user_role`: accepted, same reason (admin check first, cannot change your own role, `anon` has no access).
- `authenticated_security_definer_function_executable` for `public.is_admin()`: accepted, the app and the RLS policies need it, and it only reports whether the caller is an admin.
- `auth_leaked_password_protection` (leaked password protection disabled): accepted for now, it is a dashboard-only Auth setting that is not part of this code; enable it under Authentication, Providers, Email before real users sign up.
