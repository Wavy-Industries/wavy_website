// Optional overrides for tax behavior by country code (ISO 2-letter).
// Example:
// export const TAX_CONFIG = {
//   DE: { taxesIncluded: true, taxRate: 0.19 },
// };

// Tells display code how Shopify's localized price relates to the customer-facing gross.
// - taxesIncluded:true  → Shopify already returns gross for that market (most EU markets)
// - taxesIncluded:false → Shopify returns net; we add taxRate on top for display (NO)
// - omitted             → no VAT applied to display; "taxes at checkout"
// Last verified against Shopify market settings: 2026-05-04. Re-check annually.
export const TAX_CONFIG = {
  AT: { taxesIncluded: true },
  BE: { taxesIncluded: true },
  BG: { taxesIncluded: true },
  HR: { taxesIncluded: true },
  CY: { taxesIncluded: true },
  CZ: { taxesIncluded: true },
  DK: { taxesIncluded: true },
  EE: { taxesIncluded: true },
  FI: { taxesIncluded: true },
  FR: { taxesIncluded: true },
  DE: { taxesIncluded: true },
  GR: { taxesIncluded: true },
  HU: { taxesIncluded: true },
  IE: { taxesIncluded: true },
  IT: { taxesIncluded: true },
  LV: { taxesIncluded: true },
  LT: { taxesIncluded: true },
  LU: { taxesIncluded: true },
  MT: { taxesIncluded: true },
  NL: { taxesIncluded: true },
  PL: { taxesIncluded: true },
  PT: { taxesIncluded: true },
  RO: { taxesIncluded: true },
  SK: { taxesIncluded: true },
  SI: { taxesIncluded: true },
  ES: { taxesIncluded: true },
  SE: { taxesIncluded: true },
  MC: { taxesIncluded: true },
  NO: { taxesIncluded: false, taxRate: 0.25 },
};

// Used when a market is marked as taxesIncluded but no rate is configured.
export const DEFAULT_INCLUDED_TAX_RATE = 0.20;

export function getTaxConfigForCountry(countryCode) {
  if (!countryCode) return null;
  var code = String(countryCode).toUpperCase();
  return TAX_CONFIG.hasOwnProperty(code) ? TAX_CONFIG[code] : null;
}

export function getDefaultIncludedTaxRate() {
  return DEFAULT_INCLUDED_TAX_RATE;
}
