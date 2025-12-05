// Optional overrides for tax behavior by country code (ISO 2-letter).
// Example:
// export const TAX_CONFIG = {
//   DE: { taxesIncluded: true, taxRate: 0.19, taxName: 'VAT' },
// };

// EU + Monaco markets include taxes.
export const TAX_CONFIG = {
  AT: { taxesIncluded: true, taxRate: 0.20, taxName: 'VAT' },
  BE: { taxesIncluded: true, taxRate: 0.21, taxName: 'VAT' },
  BG: { taxesIncluded: true, taxRate: 0.20, taxName: 'VAT' },
  HR: { taxesIncluded: true, taxRate: 0.25, taxName: 'VAT' },
  CY: { taxesIncluded: true, taxRate: 0.19, taxName: 'VAT' },
  CZ: { taxesIncluded: true, taxRate: 0.21, taxName: 'VAT' },
  DK: { taxesIncluded: true, taxRate: 0.25, taxName: 'VAT' },
  EE: { taxesIncluded: true, taxRate: 0.20, taxName: 'VAT' },
  FI: { taxesIncluded: true, taxRate: 0.24, taxName: 'VAT' },
  FR: { taxesIncluded: true, taxRate: 0.20, taxName: 'VAT' },
  DE: { taxesIncluded: true, taxRate: 0.19, taxName: 'VAT' },
  GR: { taxesIncluded: true, taxRate: 0.24, taxName: 'VAT' },
  HU: { taxesIncluded: true, taxRate: 0.27, taxName: 'VAT' },
  IE: { taxesIncluded: true, taxRate: 0.23, taxName: 'VAT' },
  IT: { taxesIncluded: true, taxRate: 0.22, taxName: 'VAT' },
  LV: { taxesIncluded: true, taxRate: 0.21, taxName: 'VAT' },
  LT: { taxesIncluded: true, taxRate: 0.21, taxName: 'VAT' },
  LU: { taxesIncluded: true, taxRate: 0.17, taxName: 'VAT' },
  MT: { taxesIncluded: true, taxRate: 0.18, taxName: 'VAT' },
  NL: { taxesIncluded: true, taxRate: 0.21, taxName: 'VAT' },
  PL: { taxesIncluded: true, taxRate: 0.23, taxName: 'VAT' },
  PT: { taxesIncluded: true, taxRate: 0.23, taxName: 'VAT' },
  RO: { taxesIncluded: true, taxRate: 0.19, taxName: 'VAT' },
  SK: { taxesIncluded: true, taxRate: 0.20, taxName: 'VAT' },
  SI: { taxesIncluded: true, taxRate: 0.22, taxName: 'VAT' },
  ES: { taxesIncluded: true, taxRate: 0.21, taxName: 'VAT' },
  SE: { taxesIncluded: true, taxRate: 0.25, taxName: 'VAT' },
  MC: { taxesIncluded: true, taxRate: 0.20, taxName: 'VAT' },
  NO: { taxesIncluded: false, taxRate: 0.25, taxName: 'VAT' },
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
