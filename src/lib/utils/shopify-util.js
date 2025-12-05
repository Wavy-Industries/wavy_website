import {
  getTaxConfigForCountry as getTaxConfigOverride,
  getDefaultIncludedTaxRate as getDefaultIncludedTaxRateOverride,
} from '../config/tax-config.js';

const PRODUCT_ID = 'gid://shopify/Product/14798616985972';
const DOMAIN = 'checkout.wavyindustries.com';
const TOKEN = '3f43932f0e0e93973efb1da30bd44f74';
const STOREFRONT_API = 'https://' + DOMAIN + '/api/2024-01/graphql.json';

async function guessCountryCode() {
  function localeFallback() {
    var locale = '';

    if (typeof navigator !== 'undefined') {
      if (Array.isArray(navigator.languages) && navigator.languages.length) {
        locale = navigator.languages[0];
      } else if (navigator.language) {
        locale = navigator.language;
      }
    }

    if (!locale && typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      var resolved = Intl.DateTimeFormat().resolvedOptions();
      if (resolved && resolved.locale) {
        locale = resolved.locale;
      }
    }

    if (typeof locale === 'string') {
      var cleaned = locale.replace('_', '-');
      var parts = cleaned.split('-');
      if (parts.length > 1 && parts[parts.length - 1]) {
        var countryPart = parts[parts.length - 1].replace(/[^A-Za-z]/g, '');
        if (countryPart.length === 2) {
          return countryPart.toUpperCase();
        }
      }
    }

    return null;
  }

  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timeoutId = null;

  try {
    if (typeof fetch !== 'function') {
      return localeFallback();
    }

    if (controller) {
      timeoutId = setTimeout(function () {
        try {
          controller.abort();
        } catch (err) {
          // swallow
        }
      }, 1500);
    }

    var response = await fetch('https://ipwho.is/?fields=country_code', {
      signal: controller ? controller.signal : undefined,
    });

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (response && response.ok) {
      var data = await response.json();
      if (data && typeof data.country_code === 'string' && data.country_code.length === 2) {
        return data.country_code.toUpperCase();
      }
    }
  } catch (err) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  return localeFallback();
}

function buildProductPriceQuery(countryCode, includeLocalization) {
  var includeLoc = typeof includeLocalization === 'boolean' ? includeLocalization : true;

  var baseFields =
    "product(id: $id) { variants(first: 1) { edges { node { id availableForSale quantityAvailable price { amount currencyCode } priceV2 { amount currencyCode } } } } }" +
    (includeLoc ? " localization { country { isoCode } }" : '');

  if (countryCode) {
    return {
      query:
        "query productPrice($id: ID!, $country: CountryCode) @inContext(country: $country) { " +
        baseFields +
        " }",
      variables: {
        id: PRODUCT_ID,
        country: countryCode,
      },
    };
  }

  return {
    query: "query productPrice($id: ID!) { " + baseFields + " }",
    variables: {
      id: PRODUCT_ID,
    },
  };
}

function formatShopifyPrice(currencyCode, amount) {
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

function resolveTaxSettings(countryCode, taxesIncludedFlag, taxRate, taxName) {
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

function computeNetAndTax(amount, taxSettings) {
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

function formatTaxAmount(currencyCode, amount) {
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

export {
  PRODUCT_ID,
  DOMAIN,
  TOKEN,
  STOREFRONT_API,
  guessCountryCode,
  buildProductPriceQuery,
  formatShopifyPrice,
  getTaxConfigForCountry,
  getDefaultIncludedTaxRate,
  resolveTaxSettings,
  computeNetAndTax,
  formatTaxAmount,
};

function getTaxConfigForCountry(countryCode) {
  return getTaxConfigOverride ? getTaxConfigOverride(countryCode) : null;
}

function getDefaultIncludedTaxRate() {
  return getDefaultIncludedTaxRateOverride ? getDefaultIncludedTaxRateOverride() : 0.2;
}
