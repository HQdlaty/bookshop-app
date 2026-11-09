Project: Bookshop, a book catalog web app. Visitors browse and search books. Registered users have a profile (with avatar) and can write reviews. Admins manage books (with cover upload), categories, reviews and user roles. No cart or payments.

Architecture:
- Vanilla JavaScript ES modules, Vite, Bootstrap. No TypeScript, no React/Vue.
- One index.html shell with one client-side router using the History API.
- Each page in src/pages/<name>/ with its own HTML fragment (imported via Vite ?raw), CSS and JS. Fragments contain no html/head/body elements.
- Shared header and footer in src/components/.
- All Supabase calls live in src/services/. Utilities (validation, dates, safe rendering) in src/utils/.
- Clean up event listeners when a page unmounts.
- Supabase (DB, Auth, Storage) is the backend. RLS is the authorization boundary; never rely on UI checks alone.
- All schema changes are SQL migrations saved in supabase/migrations/.
- Never commit secrets. Client env is only VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Any service-role key lives only in a gitignored local .env used by scripts/.
- Render user content safely (textContent, never raw innerHTML).

Canonical routes: /  /books  /books/:id  /login  /profile  /profile/reviews  /reviews  /admin  /admin/books  /admin/books/add  /admin/books/:id/edit  /admin/categories  /admin/users

Planned tables: profiles, categories, books, reviews, user_roles.
Roles: user and admin via user_roles + an is_admin() helper that avoids recursive RLS. Role assignment must never come from signup metadata.

UI: responsive Bootstrap, icons, toasts for significant actions only, validation next to inputs.
