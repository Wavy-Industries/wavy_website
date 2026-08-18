/*
 * Money formatting. Nothing in here derives or adjusts a number — every amount
 * we display comes from Shopify exactly as Shopify computed it.
 */

var SUFFIX = { NOK: 'kr', SEK: 'kr', DKK: 'kr' };

var SYMBOL = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  CAD: '$',
  AUD: '$',
  NZD: '$',
  CHF: 'CHF',
};

/**
 * Whole amounts render clean ("€79"); anything with a fractional part keeps its
 * cents ("€158.50"), so a subtotal always equals the lines above it.
 */
export function formatShopifyPrice(currencyCode, amount) {
  var numeric = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(numeric)) return String(amount);

  var code = currencyCode ? String(currencyCode).toUpperCase() : '';
  var isWhole = Math.abs(numeric - Math.round(numeric)) < 0.005;
  var digits = isWhole ? 0 : 2;
  var value = numeric.toFixed(digits);

  if (!code) return value;
  if (SUFFIX[code]) return value + ' ' + SUFFIX[code];
  if (SYMBOL[code]) return SYMBOL[code] + value;

  if (typeof Intl !== 'undefined') {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(numeric);
  }
  return value + ' ' + code;
}
