import {
  getTaxConfigForCountry as getTaxConfigOverride,
  getDefaultIncludedTaxRate as getDefaultIncludedTaxRateOverride,
} from '../config/tax-config.js';

export function formatShopifyPrice(currencyCode, amount) {
  if (!currencyCode) {
    return String(Math.round(typeof amount === 'number' ? amount : parseFloat(amount)));
  }
  const numeric = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(numeric)) {
    return String(amount);
  }

  const rounded = Math.round(numeric);
  const code = String(currencyCode).toUpperCase();
  const suffixMap = {
    NOK: 'kr',
    SEK: 'kr',
    DKK: 'kr',
  };

  if (suffixMap[code]) {
    return rounded + ' ' + suffixMap[code];
  }

  const symbolMap = {
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

  const symbol = symbolMap[code];
  if (symbol) {
    return symbol + rounded;
  }

  const formatter =
    typeof Intl !== 'undefined'
      ? new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: code,
          maximumFractionDigits: 0,
          minimumFractionDigits: 0,
        })
      : null;

  return formatter ? formatter.format(rounded) : String(rounded);
}

export function formatTaxAmount(currencyCode, amount) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return String(amount);
  }
  var code = currencyCode ? String(currencyCode).toUpperCase() : '';
  var suffixMap = { NOK: 'kr', SEK: 'kr', DKK: 'kr' };
  if (suffixMap[code]) {
    return amount.toFixed(2) + ' ' + suffixMap[code];
  }
  var symbolMap = {
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
  var symbol = symbolMap[code];
  if (symbol) {
    return symbol + amount.toFixed(2);
  }
  var formatter =
    typeof Intl !== 'undefined'
      ? new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: code || 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;
  return formatter ? formatter.format(amount) : String(amount.toFixed ? amount.toFixed(2) : amount);
}

export function resolveTaxSettings(countryCode, taxesIncludedFlag, taxRate, taxName) {
  var override = getTaxConfigForCountry(countryCode);
  var resolvedName = taxName || 'VAT';

  var resolvedIncluded =
    override && typeof override.taxesIncluded === 'boolean'
      ? override.taxesIncluded
      : (typeof taxesIncludedFlag === 'boolean' ? taxesIncludedFlag : null);

  var resolvedRate = null;
  if (override && typeof override.taxRate === 'number') {
    resolvedRate = override.taxRate;
  } else if (typeof taxRate === 'number') {
    resolvedRate = taxRate;
  } else if (override && override.taxesIncluded === true) {
    resolvedRate = getDefaultIncludedTaxRate();
  }

  return {
    taxName: resolvedName,
    taxesIncluded: resolvedIncluded,
    taxRate: resolvedRate,
  };
}

// Returns {gross, tax} ready for display.
// - amount: localized price returned by Shopify
// - taxSettings: from resolveTaxSettings()
// - baselineNet (optional): same product's price in the default market.
//   If localized > baseline, the difference is the actual tax Shopify added.
export function resolveDisplayGrossAndTax(amount, taxSettings, baselineNet) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return { gross: amount, tax: null };
  }
  if (typeof baselineNet === 'number' && !isNaN(baselineNet) && baselineNet < amount) {
    return { gross: amount, tax: amount - baselineNet };
  }
  if (!taxSettings) return { gross: amount, tax: null };

  var nt = computeNetAndTax(amount, taxSettings);
  if (taxSettings.taxesIncluded === true) {
    return { gross: amount, tax: nt.tax };
  }
  if (taxSettings.taxesIncluded === false && nt.tax !== null) {
    return { gross: amount + nt.tax, tax: nt.tax };
  }
  return { gross: amount, tax: null };
}

export function computeNetAndTax(amount, taxSettings) {
  if (typeof amount !== 'number' || isNaN(amount) || !taxSettings) {
    return { net: amount, tax: null };
  }
  var rate = typeof taxSettings.taxRate === 'number' ? taxSettings.taxRate : null;
  var included = taxSettings.taxesIncluded;

  if (rate !== null && included === true) {
    var net = amount / (1 + rate);
    return { net: net, tax: amount - net };
  }
  if (rate !== null && included === false) {
    return { net: amount, tax: amount * rate };
  }
  return { net: amount, tax: null };
}

function getTaxConfigForCountry(countryCode) {
  return getTaxConfigOverride ? getTaxConfigOverride(countryCode) : null;
}

function getDefaultIncludedTaxRate() {
  return getDefaultIncludedTaxRateOverride ? getDefaultIncludedTaxRateOverride() : 0.2;
}
