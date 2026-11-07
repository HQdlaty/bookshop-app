# Bookshop

A book catalog web app. Visitors browse and search books. Registered users have a profile (with avatar) and can write reviews. Admins manage books (with cover upload), categories, reviews and user roles. There is no cart or payment flow.

Built with vanilla JavaScript (ES modules), Vite and Bootstrap, with Supabase (database, auth, storage) as the backend.

## Run it

Requires Node.js and npm.

```bash
npm install
cp .env.example .env   # then fill in the Supabase values
npm run dev            # start the dev server
```

Other scripts:

```bash
npm run build          # production build into dist/
npm run preview        # serve the production build locally
```

## Environment

The client reads only these variables from `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never commit `.env`. See `.github/copilot-instructions.md` for the project rules.
