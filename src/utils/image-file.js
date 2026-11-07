export const MAX_COVER_BYTES = 2 * 1024 * 1024; // matches the book-covers bucket limit
export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const TYPE_LABELS = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' };

// Looks at the first bytes of the file, so a renamed .exe or .html with an image extension is rejected.
function sniffImageType(bytes) {
  const startsWith = (...signature) => signature.every((byte, i) => bytes[i] === byte);
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  const ascii = (from, to) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function formatMegabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Checks a file the admin picked as a cover, in the browser (the bucket enforces the same limits on the server).
 * Resolves { ok: true, type } or { ok: false, message }. `type` comes from the file's content, not its name.
 */
export async function inspectCoverFile(file) {
  if (!file || file.size === 0) return { ok: false, message: 'The selected file is empty.' };
  if (file.size > MAX_COVER_BYTES) {
    return { ok: false, message: `The image must be 2 MB or smaller (this one is ${formatMegabytes(file.size)}).` };
  }
  if (!COVER_TYPES.includes(file.type)) return { ok: false, message: 'Use a JPEG, PNG or WebP image.' };

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const sniffed = sniffImageType(header);
  if (sniffed !== file.type) {
    return { ok: false, message: `This file is not a valid ${TYPE_LABELS[file.type]} image.` };
  }
  return { ok: true, type: sniffed };
}
