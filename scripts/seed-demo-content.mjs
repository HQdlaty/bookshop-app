// Adds more demo books (as the demo admin) and reviews (as several users), through the normal API so RLS applies.
//
//   DEMO_ADMIN_EMAIL=... DEMO_ADMIN_PASSWORD=... DEMO_USER_EMAIL=... DEMO_USER_PASSWORD=... \
//     node --env-file=.env scripts/seed-demo-content.mjs
//
// Uses VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from the environment. No service-role key.
// Extra reviewers are read from .env: every DEMO_USER2_EMAIL / DEMO_USER2_PASSWORD pair, in file order
// (the line may be repeated for several accounts; the first pair is reviewer 1, the next reviewer 2, ...).
// Nothing from .env is printed. Safe to run again: books and reviews that already exist are skipped.
// Covers are added afterwards with scripts/seed-covers.mjs.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = process.env;
const { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD, DEMO_USER_EMAIL, DEMO_USER_PASSWORD } = process.env;
if (!url || !key || !DEMO_ADMIN_EMAIL || !DEMO_ADMIN_PASSWORD || !DEMO_USER_EMAIL || !DEMO_USER_PASSWORD) {
  console.error('Missing VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, DEMO_ADMIN_* or DEMO_USER_*.');
  process.exit(1);
}

// ---------- extra reviewers from .env (repeated keys are allowed, so read the file in order) ----------
function readPairs() {
  const text = readFileSync('.env', 'utf8');
  const all = (name) => [...text.matchAll(new RegExp(`^${name}=(.*)$`, 'gm'))].map((m) => m[1].trim().replace(/^"(.*)"$/, '$1'));
  const emails = all('DEMO_USER2_EMAIL');
  const passwords = all('DEMO_USER2_PASSWORD');
  if (emails.length !== passwords.length) throw new Error('DEMO_USER2_EMAIL and DEMO_USER2_PASSWORD lines do not pair up.');
  return emails.map((email, i) => ({ email, password: passwords[i] }));
}

// Reviewer 0 = the demo admin, 1 = the demo user, 2.. = the DEMO_USER2_* pairs from .env, in order.
const reviewers = [
  { email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD },
  { email: DEMO_USER_EMAIL, password: DEMO_USER_PASSWORD },
  ...readPairs(),
];

// ---------- content ----------
const NEW_CATEGORIES = ['Fantasy', 'Mystery'];

const NEW_BOOKS = [
  { title: 'The Hobbit', author: 'J.R.R. Tolkien', category: 'Fantasy', year: 1937, price: 12.99, description: 'Bilbo Baggins, a comfortable homebody, is swept into a quest to win back a mountain kingdom from a dragon.' },
  { title: 'A Wizard of Earthsea', author: 'Ursula K. Le Guin', category: 'Fantasy', year: 1968, price: 10.5, description: 'A young mage learns that power has a price after he releases a shadow he cannot control.' },
  { title: 'Dracula', author: 'Bram Stoker', category: 'Horror', year: 1897, price: 9.99, description: 'Told through letters and diary entries, the story of a count who travels from Transylvania to England.' },
  { title: 'The Hound of the Baskervilles', author: 'Arthur Conan Doyle', category: 'Mystery', year: 1902, price: 8.99, description: 'Sherlock Holmes investigates a family curse and a spectral hound on the moors of Devon.' },
  { title: 'Murder on the Orient Express', author: 'Agatha Christie', category: 'Mystery', year: 1934, price: 11.49, description: 'A snowbound train, a murdered passenger and twelve suspects: Hercule Poirot has a night to find the truth.' },
  { title: 'The Selfish Gene', author: 'Richard Dawkins', category: 'Science', year: 1976, price: 14, description: 'A popular account of evolution seen from the point of view of the gene.' },
  { title: 'Refactoring', author: 'Martin Fowler', category: 'Technology', year: 1999, price: 39.99, description: 'A catalog of small, safe changes that improve the design of existing code without changing what it does.' },
  { title: '1984', author: 'George Orwell', category: 'Classic Fiction', year: 1949, price: 9.49, description: 'A clerk in a surveillance state begins to question the Party and the truth it keeps rewriting.' },
  { title: 'Silent Spring', author: 'Rachel Carson', category: 'Nature', year: 1962, price: 13.25, description: 'The book that exposed the damage pesticides do to birds, insects and the food chain.' },
];

// [reviewer index, book title, rating, text]
const REVIEWS = [
  // reviewer 2 (first .env account)
  [2, 'The Hobbit', 5, 'Cozy, funny and full of adventure. I read it in two evenings and wanted to start again straight away.'],
  [2, 'Pride and Prejudice', 4, 'Sharp dialogue and a lot of quiet humor. The middle drags a little, but the ending is worth it.'],
  [2, 'Murder on the Orient Express', 5, 'I did not guess the solution, and when it came it was brilliant. A perfect short mystery for a weekend.'],
  [2, 'Silent Spring', 3, 'Important and well researched, but heavy going. I admired it more than I enjoyed it.'],
  [2, 'Frankenstein', 4, 'Much sadder and more thoughtful than the films. The creature is the real heart of the book.'],
  [2, '1984', 5, 'Still unsettling. I keep thinking about the way the language itself is taken apart.'],
  // reviewer 3
  [3, 'Refactoring', 5, 'The best book I know about improving code in small, safe steps. I keep it open next to my editor.'],
  [3, 'Clean Code', 3, 'Some chapters are excellent, others feel dated or too strict. Read it critically and take what helps.'],
  [3, 'The Pragmatic Programmer', 5, 'Practical advice that has aged well. Short chapters, easy to read in small sessions, and I come back to it every year or so.'],
  [3, 'Dune', 4, 'Huge world-building and a slow, rewarding build-up. It asks for patience at the start.'],
  [3, 'The Selfish Gene', 4, 'Changed how I think about evolution. The later chapters are a little dated, but the core idea holds up.'],
  [3, 'Cosmos', 5, 'Sagan writes about the universe the way a poet would. Inspiring from the first page.'],
  [3, 'Neuromancer', 2, 'Influential, but I found it hard to follow and the style did not work for me.'],
  // reviewer 4
  [4, 'Dracula', 4, 'The letters and diary entries build the dread slowly. Some parts are old-fashioned, but the atmosphere is great.'],
  [4, 'The Hound of the Baskervilles', 5, 'Fog, a moor and a legend: everything I want from a Holmes story. I finished it in one sitting.'],
  [4, 'A Wizard of Earthsea', 4, 'A short book with a lot of wisdom in it. The sea journeys are my favorite part.'],
  [4, 'The Great Gatsby', 1, 'I know it is a classic, but I could not connect with any of the characters and finished it only to be able to say I had.'],
  [4, '1984', 4, 'Bleak but gripping. I would not call it enjoyable, but it is worth reading.'],
  [4, 'The Left Hand of Darkness', 5, 'A thoughtful, beautifully written novel about identity and trust. One of the best science fiction books I have read, and the long trek across the ice is unforgettable. I will read more by this author. Highly recommended to anyone who thinks science fiction is only about spaceships and gadgets, because this one is about people first.'],
  [4, 'A Brief History of Time', 2, 'Interesting ideas, but too difficult for me without a physics background. I gave up halfway.'],
  // demo user
  [1, 'The Hobbit', 4, 'A warm, easy read. Good for a rainy afternoon.'],
  [1, 'Dracula', 5, 'Scarier than I expected for a book this old.'],
  [1, 'Silent Spring', 4, 'Eye-opening. It still reads as relevant today.'],
  [1, 'Murder on the Orient Express', 4, 'Clever plot, and short enough to finish in a day.'],
  // demo admin
  [0, '1984', 5, 'A book everyone should read at least once.'],
  [0, 'The Selfish Gene', 4, 'Clear and provocative, and written for a general reader.'],
  [0, 'Frankenstein', 3, 'Powerful ideas, though the narration through several voices slows it down.'],
];

// ---------- helpers ----------
const newClient = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function signIn(account, label) {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error) throw new Error(`Sign-in failed for ${label}: ${error.message}`);
  return { client, userId: data.user.id };
}

// ---------- 1. categories and books, as the demo admin ----------
const admin = await signIn(reviewers[0], 'the demo admin');
const { data: isAdmin } = await admin.client.rpc('is_admin');
if (isAdmin !== true) throw new Error('The demo admin account is not an admin.');

const { data: categories, error: catError } = await admin.client.from('categories').select('id, name');
if (catError) throw catError;
const categoryId = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

for (const name of NEW_CATEGORIES) {
  if (categoryId.has(name.toLowerCase())) continue;
  const { data, error } = await admin.client.from('categories').insert({ name }).select('id').single();
  if (error) throw error;
  categoryId.set(name.toLowerCase(), data.id);
  console.log(`Category added: ${name}`);
}

const { data: existing, error: booksError } = await admin.client.from('books').select('id, title, author');
if (booksError) throw booksError;
const key_ = (b) => `${b.title.toLowerCase()}|${b.author.toLowerCase()}`;
const known = new Set(existing.map(key_));

let booksAdded = 0;
for (const book of NEW_BOOKS) {
  if (known.has(key_(book))) continue;
  const { error } = await admin.client.from('books').insert({
    id: randomUUID(),
    title: book.title,
    author: book.author,
    description: book.description,
    price: book.price,
    published_year: book.year,
    category_id: categoryId.get(book.category.toLowerCase()),
    created_by: admin.userId,
  });
  if (error) throw new Error(`Could not add "${book.title}": ${error.message}`);
  booksAdded += 1;
  console.log(`Book added: ${book.title}`);
}

const { data: allBooks, error: allError } = await admin.client.from('books').select('id, title');
if (allError) throw allError;
const bookId = new Map(allBooks.map((b) => [b.title, b.id]));
await admin.client.auth.signOut();

// ---------- 2. reviews, each as its own user ----------
let reviewsAdded = 0;
let reviewsSkipped = 0;
for (let index = 0; index < reviewers.length; index += 1) {
  const mine = REVIEWS.filter(([who]) => who === index);
  if (mine.length === 0) continue;

  let session;
  try {
    session = await signIn(reviewers[index], `reviewer ${index}`);
  } catch (error) {
    console.error(`  ${error.message}. Skipping its ${mine.length} reviews.`);
    reviewsSkipped += mine.length;
    continue;
  }
  const { client, userId } = session;
  let added = 0;
  for (const [, title, rating, body] of mine) {
    const id = bookId.get(title);
    if (!id) {
      console.error(`  skipped: no book called "${title}"`);
      reviewsSkipped += 1;
      continue;
    }
    const { error } = await client.from('reviews').insert({ book_id: id, user_id: userId, rating, body });
    if (error?.code === '23505') {
      reviewsSkipped += 1; // this user already reviewed this book
      continue;
    }
    if (error) throw new Error(`Could not add a review of "${title}": ${error.message}`);
    reviewsAdded += 1;
    added += 1;
  }
  const { data: profile } = await client.from('profiles').select('display_name').eq('id', userId).single();
  console.log(`Reviews added as "${profile?.display_name}": ${added} of ${mine.length}`);
  await client.auth.signOut();
}

console.log(`Done: ${booksAdded} books added, ${reviewsAdded} reviews added, ${reviewsSkipped} skipped (already there).`);
