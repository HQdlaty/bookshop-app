const priceFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** "12.5" -> "$12.50". Returns '' when there is no price. (The schema stores a plain amount; the currency is a display choice.) */
export function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '';
  const amount = Number(value);
  return Number.isFinite(amount) ? priceFormatter.format(amount) : '';
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
