const priceFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** "12.5" -> "$12.50". Returns '' when there is no price. (The schema stores a plain amount; the currency is a display choice.) */
export function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '';
  const amount = Number(value);
  return Number.isFinite(amount) ? priceFormatter.format(amount) : '';
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

/** An ISO timestamp as "Nov 8, 2026". Returns '' for anything that is not a valid date. */
export function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
}

/** 4.25 -> "4.3". Returns '' when there is no value. */
export function formatAverage(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '';
}
