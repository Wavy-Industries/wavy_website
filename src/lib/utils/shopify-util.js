const PRODUCT_ID = 'gid://shopify/Product/14798616985972';
const DOMAIN = 'checkout.wavyindustries.com';
const TOKEN = '3f43932f0e0e93973efb1da30bd44f74';
const STOREFRONT_API = 'https://' + DOMAIN + '/api/2024-01/graphql.json';

function guessCountryCode() {
  const locale =
    (typeof navigator !== 'undefined' && ((navigator.languages && navigator.languages[0]) || navigator.language)) || '';
  const parts = locale.split('-');
  if (parts.length > 1 && parts[1]) {
    return parts[1].toUpperCase();
  }
  return null;
}

function buildProductPriceQuery(countryCode) {
  if (countryCode) {
    return {
      query:
        "query productPrice($id: ID!, $country: CountryCode) @inContext(country: $country) { product(id: $id) { variants(first: 1) { edges { node { id price { amount currencyCode } priceV2 { amount currencyCode } } } } } }",
      variables: {
        id: PRODUCT_ID,
        country: countryCode,
      },
    };
  }

  return {
    query:
      "query productPrice($id: ID!) { product(id: $id) { variants(first: 1) { edges { node { id price { amount currencyCode } priceV2 { amount currencyCode } } } } } }",
    variables: {
      id: PRODUCT_ID,
    },
  };
}

function formatShopifyPrice(currencyCode, amount) {
  if (!currencyCode) {
    return String(amount);
  }
  const numeric = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(numeric)) {
    return String(amount);
  }

  const isInteger = Math.abs(numeric - Math.round(numeric)) < 0.005;
  const code = String(currencyCode).toUpperCase();
  const symbolMap = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CNY: '¥',
    CAD: '$',
    AUD: '$',
    NZD: '$',
    NOK: 'kr',
    SEK: 'kr',
    DKK: 'kr',
    CHF: 'CHF',
  };

  const symbol = symbolMap[code];
  if (symbol) {
    if (isInteger) {
      return symbol + Math.round(numeric);
    }
    return symbol + numeric.toFixed(2);
  }

  const formatter =
    typeof Intl !== 'undefined'
      ? new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: code,
          ...(isInteger ? { maximumFractionDigits: 0 } : {}),
        })
      : null;

  return formatter ? formatter.format(numeric) : String(numeric);
}

export {
  PRODUCT_ID,
  DOMAIN,
  TOKEN,
  STOREFRONT_API,
  guessCountryCode,
  buildProductPriceQuery,
  formatShopifyPrice,
};
