// Draws simple text covers and uploads them as the demo admin, through the normal Storage API (so RLS applies).
//
//   DEMO_ADMIN_EMAIL=... DEMO_ADMIN_PASSWORD=... node --env-file=.env scripts/seed-covers.mjs
//
// Uses only VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from .env. No service-role key, nothing is printed from .env.
// Only books created by that admin that have no cover yet are touched, and the last two are left without a cover on purpose
// (to show the placeholder). Order per book: upload -> save cover_path -> if saving fails, remove the uploaded file.
import { deflateSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key, DEMO_ADMIN_EMAIL: email, DEMO_ADMIN_PASSWORD: password } = process.env;
if (!url || !key || !email || !password) {
  console.error('Missing VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, DEMO_ADMIN_EMAIL or DEMO_ADMIN_PASSWORD.');
  process.exit(1);
}
const LEAVE_WITHOUT_COVER = 2;

// ---------- tiny PNG encoder ----------
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}
function encodePng(width, height, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) rgb.copy(rows, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 5x7 pixel font ----------
const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
};

const W = 400;
const H = 600;
const PALETTES = {
  'Classic Fiction': [[122, 28, 44], [58, 14, 26]],
  'Science Fiction': [[38, 52, 120], [88, 34, 112]],
  Science: [[18, 110, 120], [14, 52, 84]],
  Technology: [[34, 92, 62], [30, 38, 44]],
};
const FALLBACK = [[70, 80, 96], [30, 34, 42]];

function drawCover(title, author, category) {
  const [top, bottom] = PALETTES[category] ?? FALLBACK;
  const rgb = Buffer.alloc(W * H * 3);
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    rgb[i] = r;
    rgb[i + 1] = g;
    rgb[i + 2] = b;
  };
  const fill = (x0, y0, x1, y1, color) => {
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) set(x, y, color);
  };

  for (let y = 0; y < H; y += 1) {
    const t = y / (H - 1);
    const color = top.map((v, k) => Math.round(v + (bottom[k] - v) * t));
    fill(0, y, W, y + 1, color);
  }
  const light = [244, 238, 224];
  fill(24, 24, W - 24, 28, light); // frame
  fill(24, H - 28, W - 24, H - 24, light);
  fill(24, 24, 28, H - 24, light);
  fill(W - 28, 24, W - 24, H - 24, light);
  fill(60, 392, W - 60, 396, light); // rule between title and author

  const wrap = (text, perLine) => {
    const lines = [];
    let line = '';
    for (const word of text.toUpperCase().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > perLine && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const text = (lines, scale, yStart, color) => {
    let y = yStart;
    for (const line of lines) {
      const width = line.length * 6 * scale - scale;
      let x = Math.round((W - width) / 2);
      for (const ch of line) {
        const glyph = FONT[ch];
        if (glyph) {
          glyph.forEach((row, ry) => {
            [...row].forEach((cell, rx) => {
              if (cell === '#') fill(x + rx * scale, y + ry * scale, x + (rx + 1) * scale, y + (ry + 1) * scale, color);
            });
          });
        }
        x += 6 * scale;
      }
      y += 10 * scale;
    }
  };

  const inner = 300;
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length));
  const titleScale = Math.max(2, Math.min(6, Math.floor(inner / (6 * longest))));
  const titleLines = wrap(title, Math.floor(inner / (6 * titleScale)));
  text(titleLines, titleScale, 70 + Math.max(0, (300 - titleLines.length * 10 * titleScale) / 2), light);
  const authorLines = wrap(author, Math.floor(inner / 18));
  text(authorLines, 3, 420, [226, 214, 184]);
  return encodePng(W, H, rgb);
}

// ---------- upload as the demo admin ----------
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
if (signInError) {
  console.error('Sign-in failed:', signInError.message);
  process.exit(1);
}
const adminId = signIn.user.id;

const { data: books, error: listError } = await supabase
  .from('books')
  .select('id, title, author, category:categories(name)')
  .eq('created_by', adminId)
  .is('cover_path', null)
  .order('created_at', { ascending: true });
if (listError) throw listError;

const targets = books.slice(0, Math.max(0, books.length - LEAVE_WITHOUT_COVER));
console.log(`${books.length} books without a cover from this admin; adding covers to ${targets.length}.`);

let failures = 0;
for (const book of targets) {
  const png = drawCover(book.title, book.author, book.category?.name);
  const path = `${book.id}/${randomUUID()}.png`;
  const { error: uploadError } = await supabase.storage.from('book-covers').upload(path, png, { upsert: false, contentType: 'image/png', cacheControl: '31536000' });
  if (uploadError) {
    console.error(`  upload failed for "${book.title}":`, uploadError.message);
    failures += 1;
    continue;
  }
  const { data: saved, error: saveError } = await supabase.from('books').update({ cover_path: path }).eq('id', book.id).select('id');
  if (saveError || !saved?.length) {
    console.error(`  saving cover_path failed for "${book.title}":`, saveError?.message ?? 'no row updated');
    await supabase.storage.from('book-covers').remove([path]); // do not leave an orphan behind
    failures += 1;
    continue;
  }
  console.log(`  ${book.title}: ${(png.length / 1024).toFixed(0)} KB -> ${path}`);
}
await supabase.auth.signOut();
process.exit(failures ? 1 : 0);
