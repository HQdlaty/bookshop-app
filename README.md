# Bookshop

| | |
|---|---|
| **Author** | HQdlaty |
| **Email** | demo@bookshop.demo |
| **GitHub Repo** | https://github.com/HQdlaty/bookshop-app |
| **Live Project URL** | https://bookshop-app.marwineli.workers.dev/ |
| **Sample credentials** | `admin@bookshop.demo` / `demo1234` (admin) |
| | `user@bookshop.demo` / `demo1234` (regular user) |

## Description

Bookshop is a book catalog web app. Visitors browse and search books and read reviews. Registered users have a profile with a display name and an avatar, and can write one review per book. Admins manage books (with cover upload), categories, reviews and user roles. There is no cart and no payment flow.

It is a single-page app written in vanilla JavaScript (ES modules). Supabase provides the database, authentication and file storage. The authorization boundary is Row Level Security (RLS) in the database: the UI hides controls a user cannot use, but the database is what refuses the request.

## Roles

| | Visitor (not signed in) | User | Admin |
|---|---|---|---|
| Browse, search and filter books; open a book | yes | yes | yes |
| Read reviews and reviewer names/avatars | yes | yes | yes |
| Register and log in | yes | n/a | n/a |
| Edit own display name and avatar | no | yes | yes |
| Write a review (one per book), edit or delete own review | no | yes | yes |
| See "My reviews" | no | yes | yes |
| Delete other users' reviews (moderation) | no | no | yes |
| Add, edit and delete books, upload and remove covers | no | no | yes |
| Add, rename and delete categories | no | no | yes |
| Admin dashboard | no | no | yes |
| List users with their email, change another user's role | no | no | yes |

How this is enforced:

- **Everyone** (including visitors) can read `books`, `categories`, `reviews` and `profiles`. Profiles hold no email.
- **Users** can insert a review only as themselves, and edit or delete only their own reviews. They can change only their own profile row, and write only inside their own folder of the `avatars` bucket. A user can read only their own row in `user_roles`.
- **Admins** are identified by the `is_admin()` database function. Only admins can write `books`, `categories` and `user_roles`, and write to the `book-covers` bucket.
- A new account always gets the role `user`. The role is never taken from the signup form.
- An admin cannot change their own role (checked in the database function, and the control is disabled in the UI).
- The admin menu and the `/admin/*` pages are hidden or guarded in the browser for convenience. A signed-in non-admin who opens an admin URL sees a "Not authorized" page, and the database would refuse their requests anyway.
- Database policies are slightly broader than the UI: they also let an admin edit any review or profile row and delete profile rows. The app only exposes admin deletion of other users' reviews.

See [docs/security-checks.md](docs/security-checks.md) for the permission checks that were run against the database.

## Features

Pages (routes):

| Route | Access | What it does |
|---|---|---|
| `/` | public | Home page with an introduction and links to the catalog and registration |
| `/books` | public | Paginated book grid (12 per page); search by title or author; filter by category; filters and page are kept in the URL |
| `/books/:id` | public | Book details (cover, author, category, price, year, ISBN, description) with the rating summary and a paginated list of reviews (10 per page, newest first); signed-in users can write, edit or delete their review here; admins can delete any review |
| `/login` | public | Log in and register (two tabs); returns you to the page you were trying to open |
| `/profile` | signed in | Change display name, upload or remove an avatar, see your email |
| `/reviews` | signed in | "My reviews": your own reviews across books, with edit and delete |
| `/admin` | admin | Dashboard with the number of books and categories and links to the admin pages |
| `/admin/books` | admin | Paginated book table with edit and delete (deleting a book also removes its reviews and its cover file) |
| `/admin/books/add` | admin | Add a book form: title, author, description, ISBN, price, published year, category, cover image |
| `/admin/books/:id/edit` | admin | Edit a book, replace or remove its cover; warns before leaving with unsaved changes |
| `/admin/categories` | admin | Add, rename and delete categories (names are unique, ignoring case); books in a deleted category are kept without a category |
| `/admin/users` | admin | Paginated user list with search by email or name, and a role selector per user |

Other behaviour:

- Unknown paths show a "Page not found" page; admin pages show "Not authorized" to signed-in non-admins and redirect visitors to `/login`.
- Images (covers up to 2 MB, avatars up to 1 MB) must be JPEG, PNG or WebP; the browser checks the file's real type before uploading.
- Toast notifications for significant actions, validation messages next to inputs, and confirmation dialogs for destructive actions.
- User-provided text is always rendered as plain text, never as HTML.

## Technologies

- Vanilla JavaScript (ES modules), no framework or TypeScript
- [Vite](https://vite.dev/) for development and the production build
- [Bootstrap 5](https://getbootstrap.com/) and Bootstrap Icons for the UI
- [Supabase](https://supabase.com/): PostgreSQL database with Row Level Security, Auth (email and password), Storage (two public buckets)
- Cloudflare Workers static assets for hosting (see `wrangler.jsonc`)

## Documentation

- [Architecture](docs/architecture.md): client and server split, router, services, auth and roles, storage uploads, admin functions, deployment
- [Database](docs/database.md): tables and relationships (ER diagram), RLS policies, storage buckets, functions and triggers, migrations
- [Security checks](docs/security-checks.md): the permission checks run against the database
