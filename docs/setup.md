# Setup guide

## Prerequisites

- [Node.js](https://nodejs.org/) 22 or newer (the deployed build uses 22) and npm.
- Git
- A [Supabase](https://supabase.com/) account (a free project is enough)

## Run it locally

```bash
git clone https://github.com/HQdlaty/bookshop-app.git
cd bookshop-app
npm install
cp .env.example .env
```

Open `.env` and fill in the two values (the client reads only these):

```
VITE_SUPABASE_URL=<your project URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<your publishable key>
```

Both are in the Supabase dashboard, in the project's API settings. Use the *publishable* key only; never put a service-role key in a `VITE_` variable. `.env` is git-ignored: never commit it.

```bash
npm run dev       # start the dev server
npm run build     # production build into dist/
npm run preview   # serve the production build locally
```

If a variable is missing, the app shows a "Sign-in is unavailable because the app is not configured correctly" message and the console explains which one is missing.

## Create a Supabase project and apply the migrations

1. Create a new project in the Supabase dashboard.
2. Apply the SQL files in `supabase/migrations/` **in filename order**, for example by pasting each one into the dashboard's SQL Editor and running it:
   1. `20261107185726_initial_schema.sql`: enum, tables, functions, triggers, RLS policies
   2. `20261107185744_storage_buckets.sql`: the `book-covers` and `avatars` buckets and their policies
   3. `20261107190515_revoke_rls_auto_enable_api_access.sql`: revokes execute on `public.rls_auto_enable()`
   4. `20261108124819_admin_user_functions.sql`: `admin_list_users` and `admin_set_user_role`
3. Set the Supabase Auth settings (next section).
4. Put the project URL and publishable key in `.env` (above).

### Supabase Auth settings

Both settings are in the Supabase dashboard, under Authentication:

- **Confirm email: turn it off** (Providers, Email). With it on, an account cannot sign in until its email is confirmed, so the demo accounts cannot sign in. The app itself handles both settings: with it on, it shows a "verify your email" notice after registering.
- **Site URL and Redirect URLs** (URL Configuration): set the Site URL to the deployed address, `https://bookshop-app.marwineli.workers.dev`, and add that address and the local dev address, `http://localhost:5173` (Vite's default dev port), to the Redirect URLs. Use your own addresses if you deploy somewhere else.

Notes:

- The third migration revokes privileges on `public.rls_auto_enable()`, a function that these files do not create (see [database.md](database.md)). PostgreSQL reports an error when revoking on a function that does not exist, so if your project has no such function that one file will fail; it only tightens a permission and the other migrations do not depend on it.
- Email confirmation is a Supabase Auth setting of the project; see "Supabase Auth settings" above for the value this guide uses.

## Create the first admin

Admins are never created automatically: not by a migration, and not by "the first user to sign up". A new account always gets the role `user`.

1. Start the app, open `/login`, choose Register and create the account that should become the admin (confirm the email if your project requires it).
2. In the Supabase SQL Editor, run a one-off update that names the account by its **exact email**:

   ```sql
   update public.user_roles
   set role = 'admin'
   where user_id = (select id from auth.users where email = 'you@example.com')
   returning user_id, role;
   ```

   It should return exactly one row. If it returns none, the email does not match an account.
3. Log out and back in (or reload). The Admin menu appears.

Do not save this statement as a migration. After that, an admin can promote or demote other users in the app, at `/admin/users`.

## Optional: demo cover images

`scripts/seed-covers.mjs` draws simple text covers and uploads them for books created by a given admin account that have no cover. It signs in through the normal API, so RLS and Storage rules apply, and it needs no service-role key:

```bash
DEMO_ADMIN_EMAIL=... DEMO_ADMIN_PASSWORD=... node --env-file=.env scripts/seed-covers.mjs
```

It does not create books. Add the books first, in the app.

`scripts/seed-demo-content.mjs` adds demo categories, books and reviews through the same API (books as the demo admin, each review as its own user). It reads the admin and demo-user credentials from environment variables and extra reviewers from repeated `DEMO_USER2_EMAIL` / `DEMO_USER2_PASSWORD` lines in `.env`; see the comment at the top of the file. It can be run again safely: books and reviews that already exist are skipped. Run `seed-covers.mjs` afterwards to give the new books covers.

## Project structure

```
.
├── index.html                  Single HTML shell (header, main outlet, footer)
├── package.json                Scripts and dependencies (Vite, Bootstrap, Bootstrap Icons, supabase-js)
├── wrangler.jsonc              Cloudflare Workers static assets: serves dist/ with SPA fallback
├── netlify.toml                Equivalent build and rewrite settings for Netlify
├── .env.example                The two client variables, empty
├── CLAUDE.md                   Instructions for the AI assistant used on this project
├── .github/
│   └── copilot-instructions.md Project rules and architecture notes
├── docs/
│   ├── architecture.md         How the app is put together
│   ├── database.md             Tables, RLS policies, storage, functions, migrations
│   ├── security-checks.md      Permission checks run against the database
│   └── setup.md                This file
├── scripts/
│   └── seed-covers.mjs         Demo cover uploader (run with node)
├── supabase/
│   └── migrations/             SQL migrations, applied in filename order
└── src/
    ├── main.js                 Starts toasts, header, footer, auth and the router
    ├── router.js               History API router with lazy pages and access guards
    ├── styles.css              Global styles
    ├── components/             Shared UI: header, footer, pagination, book-cover, avatar, reviews (item, form, stars)
    ├── pages/                  One folder per page, each with .html, .css and .js
    │   ├── home/               /
    │   ├── books/              /books
    │   ├── book-details/       /books/:id (with reviews-section.js)
    │   ├── login/              /login (log in and register)
    │   ├── profile/            /profile
    │   ├── reviews/            /reviews (all reviews)
    │   ├── my-reviews/         /profile/reviews (my reviews)
    │   ├── admin/              /admin (dashboard)
    │   ├── admin-books/        /admin/books
    │   ├── book-form/          /admin/books/add and /admin/books/:id/edit
    │   ├── admin-categories/   /admin/categories
    │   ├── admin-users/        /admin/users
    │   ├── not-authorized/     shown to signed-in non-admins on admin routes
    │   └── not-found/          shown for unknown paths
    ├── services/               All Supabase calls (auth, roles, books, categories, reviews, profile, storage, admin users)
    └── utils/                  Validation, formatting, search escaping, image checks, toasts, confirm dialog, error messages
```

`dist/` (the build output) and `node_modules/` are generated and git-ignored.

## Known limitations

- **No user deletion.** The app has no way to delete a user. Deleting an account in the Supabase dashboard removes the profile, role and reviews (database cascades) but leaves the user's avatar files in the `avatars` bucket.
- **Public bucket files are served by URL.** Book covers and avatars are in public buckets: anyone who has a file's URL can open it. Paths contain random UUIDs, but they are not secret. Do not upload anything private.
- **Accepted security advisor warnings.** Supabase's advisor reports `authenticated_security_definer_function_executable` for `is_admin`, `admin_list_users` and `admin_set_user_role`. This is accepted: signed-in users must be able to call them, the two admin functions raise `42501` unless the caller is an admin, and `anon` has no access. Details are in [security-checks.md](security-checks.md).
- **Leaked-password protection is off on purpose.** It is a Supabase Auth dashboard setting (not part of this code). It is left disabled so the published demo passwords work. Enable it before real users sign up.
- **The demo admin must be promoted manually.** Registering gives the role `user`, so an admin account (including a demo admin) has to be promoted by hand, as described above.
- **No cart or payments.** Books have a price for display only.
- **No automated test suite.** `package.json` has no test script. The database permission checks are documented in [security-checks.md](security-checks.md).
