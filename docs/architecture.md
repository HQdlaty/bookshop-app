# Architecture

Bookshop is a static single-page app that talks directly to Supabase. There is no application server of our own: the browser calls the Supabase APIs, and the database decides what is allowed.

```
Browser (Vite build: HTML + JS + CSS)          Supabase project
┌───────────────────────────────────┐          ┌────────────────────────────┐
│ index.html shell                  │          │ Auth (email + password)    │
│  ├─ header / footer components    │  HTTPS   │ PostgreSQL + RLS policies  │
│  ├─ router.js  → lazy pages       │ ───────▶ │  tables, functions, triggers│
│  └─ services/  → supabase-js      │          │ Storage (2 public buckets) │
└───────────────────────────────────┘          └────────────────────────────┘
      served as static files by Cloudflare Workers static assets
```

## Client and server split

- **Client:** everything under `src/`. It is built by Vite into static files in `dist/`.
- **Server:** only Supabase. The client uses the project URL and the *publishable* key (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`), which are meant to be public. No service-role key is used by the app.
- **Where the rules live:** in the database (Row Level Security policies and `SECURITY DEFINER` functions, see [database.md](database.md)). Hiding a button in the UI is a convenience, never the protection.

## Shell, router and pages

`index.html` is one shell with three regions: `#site-header`, `#app` and `#site-footer`. `src/main.js` starts the toasts, mounts the header and footer, loads the auth modules, and starts the router.

`src/router.js` is a small client-side router built on the History API:

- A list of routes, each with a path pattern (for example `/books/:id`) and a lazy `load: () => import(...)`, so a page's JavaScript and CSS are fetched only when it is first visited.
- Clicks on same-origin links are intercepted and turned into `navigate()` calls. Modified clicks (new tab), external links and `mailto:` links are left to the browser. Back and Forward re-render from the URL.
- Each route has an access level: public (default), `private` (needs a session) or `admin` (needs a session and the admin role). Visitors who open a private or admin route are sent to `/login?next=<the page they wanted>`. A signed-in non-admin who opens an admin route sees the "Not authorized" page. Unknown paths load the "Page not found" page.
- `enforceAccess()` re-runs the access check when the signed-in user changes (for example the session ends in another tab), without re-mounting the page.
- A page with unsaved changes can register a *leave guard* through `ctx.setLeaveGuard`; the router asks it before navigating away (the book form uses this).

Every page lives in `src/pages/<name>/` as three files: `<name>.html` (a fragment without `html`/`head`/`body`, imported with Vite's `?raw`), `<name>.css` and `<name>.js`. A page module exports a `title` and a `mount(container, ctx)` function that may return an `unmount` function. `ctx` provides:

| Field | Purpose |
|---|---|
| `ctx.params`, `ctx.query`, `ctx.path` | Route parameters, the query string and the path |
| `ctx.signal` | An `AbortSignal` that is aborted when the page is left. Listeners are registered with it, and async code checks `ctx.signal.aborted` before touching the page |
| `ctx.navigate(to, options)` | Navigate to another route |
| `ctx.setQuery(params, options)` | Update the URL's query string without re-mounting (filters and pages) |
| `ctx.setLeaveGuard(fn)` | Ask the user before leaving with unsaved changes |
| `ctx.setTitle(text)` | Set the document title after data has loaded |

Shared UI pieces are in `src/components/` (header, footer, pagination, book cover, avatar, review item, review form and star rating). Larger pages have a sub-module, for example `pages/book-details/reviews-section.js`.

User-provided text (book titles, review text, display names, category names) is always inserted with `textContent`. The only `innerHTML` use is for the static, trusted HTML fragments of the project itself.

## Services layer

All Supabase calls are in `src/services/`; pages never import the Supabase client directly.

| Module | Responsibility |
|---|---|
| `supabase-client.js` | Creates the single Supabase client from the two `VITE_` variables, and throws a clear error if one is missing |
| `auth-service.js` | Sign up, sign in, sign out, current session |
| `roles-service.js` | `isAdmin()`: asks the database through the `is_admin()` RPC, caches the answer per signed-in user, treats any failure as "not an admin" |
| `session-store.js` | In-memory view of the signed-in user (display name, avatar) for the header; listeners are notified on sign-in, sign-out and profile changes |
| `books-service.js` | List (search, category filter, pagination), get, create, update, delete books |
| `categories-service.js` | List, count, create, rename, delete categories |
| `reviews-service.js` | List a book's reviews, list all reviews, list my reviews, review statistics, create, update, delete |
| `profile-service.js` | Own profile, display name and avatar upload/removal |
| `storage-service.js` | Book cover upload and removal |
| `admin-users-service.js` | `admin_list_users` and `admin_set_user_role` RPC calls |
| `service-errors.js` | `requireAffected`: an update or delete that matched no rows is reported as an error |

`src/utils/` holds helpers: validation rules, formatting, search-pattern escaping, image-file checks, the confirmation dialog, toasts, and mapping of database errors to friendly messages (`db-errors.js`, so raw error text is not shown to users).

Update and delete requests use `.select()` to get the affected rows back. PostgREST does not report "zero rows" as an error, and RLS silently filters rows a user may not touch, so the service raises an error when nothing was affected.

## Authentication and roles in the UI

1. At startup `initSession()` restores the session and subscribes to Supabase auth events. The first page render waits for it, so access decisions are made after the session is known.
2. `session-store.js` loads the user's profile (display name and avatar path) and notifies subscribers. `main.js` uses this to switch the header between "Log in" and the user menu, and to call `refreshAdminMenu`.
3. The Admin menu is shown only if `isAdmin()` returns true. `isAdmin()` calls the `is_admin()` database function, so the UI reads the role from the same place the policies do.
4. On registration, the display name is sent as signup metadata only as a label. The database trigger `handle_new_user` creates the profile and a `user` role. The role is never read from the metadata.
5. After login the user is sent to the `next` path when it is a safe same-origin path (`safe-redirect.js` rejects other origins, `//`, backslashes and `/login`), otherwise to `/books`.

Depending on the Supabase project settings, signup may require email confirmation: the app handles both cases (a session is returned immediately, or a "verify your email" notice is shown).

## RLS is the authorization boundary

Every table has Row Level Security enabled. Policies are written for the `anon` and `authenticated` roles and call `is_admin()` and `auth.uid()`:

- Reads of books, categories, reviews and profiles are public.
- Writes to books and categories need an admin. Reviews can be created, edited and deleted by their author; admins can also modify and delete any review.
- A user can update only their own profile; only admins can write `user_roles`.
- A trigger, `freeze_review_keys`, stops anyone (including admins) from moving a review to another book or user, because RLS cannot compare the old and new row.

The full list is in [database.md](database.md). The checks that were run to confirm it are in [security-checks.md](security-checks.md).

## Storage uploads

Two public buckets are used (definitions in the `storage_buckets` migration):

| Bucket | Limit | Allowed types | Who can write | Path |
|---|---|---|---|---|
| `book-covers` | 2 MB | JPEG, PNG, WebP | admins | `<book-id>/<random-uuid>.<ext>` |
| `avatars` | 1 MB | JPEG, PNG, WebP | the owner, inside their own folder | `<user-id>/<random-uuid>.<ext>` |

- The browser checks size and the file's real type (by its first bytes) before uploading; the bucket enforces the same limits on the server.
- The file name chosen by the user is never used. The path contains a random UUID and uploads never overwrite (`upsert: false`), so long cache lifetimes are safe.
- Files are served by their public URL, built locally from the stored path with `getPublicUrl`. Rows store only the path (`books.cover_path`, `profiles.avatar_path`).
- The app removes files only through the Storage API, never by deleting from `storage.objects`.

Order of operations, so a failure never leaves a row pointing at a missing file:

- **Save a book with a cover:** a new book gets its id in the browser first so the cover path can use it; upload the file, then save the row with the new `cover_path`; if saving fails, remove the file just uploaded; only after the row is saved is the old cover removed. If removing the old cover fails, the admin is told.
- **Delete a book:** the row is deleted first (its reviews go with it), then the cover file. If the file cannot be removed, an orphan file is left in storage and the admin sees a message.
- **Change an avatar:** upload, save `avatar_path`, then remove the previous file. If saving fails, the new file is removed again. If removing the previous file fails, the avatar is still changed.
- **Remove an avatar:** `avatar_path` is cleared first, then the file is removed.

## Admin user functions

Emails live in `auth.users`, which the API does not expose, so listing users and changing roles are done by two `SECURITY DEFINER` functions in the `admin_user_functions` migration. Both call `is_admin()` first and raise error `42501` ("not authorized") for anyone else. Anonymous callers have no execute permission at all.

- `admin_list_users(p_search, p_limit, p_offset)`: returns a page of users (id, email, display name, role, joined date) plus the total match count. The limit is clamped to 1–50, `%`, `_` and `\` in the search text are matched literally, and only those columns are returned (no tokens, password hashes or raw metadata).
- `admin_set_user_role(p_user_id, p_role)`: sets another user's role. It refuses to change the caller's own role (`22023`) and unknown users (`P0002`).

`admin-users-service.js` calls them with `supabase.rpc(...)`, and `toAdminUserMessage` turns the error codes into messages. The same `is_admin()` function is also what `roles-service.js` calls for the UI.

Both functions use `set search_path = ''`, so every object they use is schema-qualified.

## Build and deployment

- `npm run build` runs `vite build` and writes the static site to `dist/`. The two `VITE_` variables are read at build time and compiled into the JavaScript, so they must be present in the environment that runs the build.
- `wrangler.jsonc` configures Cloudflare Workers static assets: it serves the `./dist` directory and sets `not_found_handling` to `single-page-application`, so a request for a path such as `/books/123` that is not a file returns `index.html` and the client router takes over.
- Database changes are SQL migrations in `supabase/migrations/`, applied to the Supabase project separately from the front-end deployment.
