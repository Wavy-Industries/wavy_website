import { PRODUCTS } from '~/lib/config/products';

var DOMAIN = 'checkout.wavyindustries.com';
var TOKEN = '3f43932f0e0e93973efb1da30bd44f74';
var STOREFRONT_API = 'https://' + DOMAIN + '/api/2024-01/graphql.json';

// Backwards-compatible default for callers that still want MONKEY directly.
var PRODUCT_ID = PRODUCTS.monkey.shopifyProductId;

function resolveProductId(skuOrProductId) {
  if (!skuOrProductId) return PRODUCT_ID;
  if (typeof skuOrProductId === 'string' && skuOrProductId.indexOf('gid://') === 0) {
    return skuOrProductId;
  }
  var prod = PRODUCTS[skuOrProductId];
  return prod ? prod.shopifyProductId : PRODUCT_ID;
}

function buildProductPriceQuery(productId, countryCode) {
  var baseFields =
    'product(id: $id) { variants(first: 1) { edges { node { id availableForSale quantityAvailable price { amount currencyCode } priceV2 { amount currencyCode } } } } }' +
    ' localization { country { isoCode } }';

  if (countryCode) {
    return {
      query: 'query productPrice($id: ID!, $country: CountryCode) @inContext(country: $country) { ' + baseFields + ' }',
      variables: { id: productId, country: countryCode },
    };
  }

  return {
    query: 'query productPrice($id: ID!) { ' + baseFields + ' }',
    variables: { id: productId },
  };
}

// Backwards compatible: fetchProduct(countryCode) → MONKEY
// New form:             fetchProduct(skuOrId, countryCode)
export function fetchProduct(arg1, arg2) {
  var skuOrId, countryCode;
  if (arg2 === undefined && (arg1 === null || (typeof arg1 === 'string' && arg1.length <= 4))) {
    // Treat as legacy single-arg country code call.
    skuOrId = null;
    countryCode = arg1 || null;
  } else {
    skuOrId = arg1;
    countryCode = arg2 || null;
  }
  var productId = resolveProductId(skuOrId);
  var queryConfig = buildProductPriceQuery(productId, countryCode);

  return fetch(STOREFRONT_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query: queryConfig.query, variables: queryConfig.variables }),
  }).then(function (res) {
    return res.json();
  }).then(function (resp) {
    if (!resp || !resp.data || !resp.data.product || !resp.data.product.variants.edges.length) {
      throw new Error('No product data returned');
    }
    var variant = resp.data.product.variants.edges[0].node;
    var localization = resp.data.localization && resp.data.localization.country
      ? resp.data.localization.country
      : null;
    return {
      variant: variant,
      countryIsoCode: localization ? localization.isoCode : null,
    };
  });
}

// Legacy: createCheckout(client, variantId, quantity, options)
// New:    createCheckout(client, lineItems, options)
//   where lineItems = [{ variantId, quantity }, ...]
export function createCheckout(client, arg2, arg3, arg4) {
  var lineItems;
  var options;
  if (Array.isArray(arg2)) {
    lineItems = arg2;
    options = arg3 || {};
  } else {
    lineItems = [{ variantId: arg2, quantity: arg3 }];
    options = arg4 || {};
  }

  var visitorId = options.visitorId;
  var ref = options.ref;

  return client.checkout.create().then(function (checkout) {
    return client.checkout.addLineItems(checkout.id, lineItems);
  }).then(function (checkout) {
    var customAttributes = [];
    if (visitorId) customAttributes.push({ key: '_wavy_vid', value: String(visitorId) });
    if (ref) customAttributes.push({ key: '_wavy_ref', value: String(ref) });
    if (!customAttributes.length) return checkout;
    return client.checkout.updateAttributes(checkout.id, { customAttributes: customAttributes });
  }).then(function (checkout) {
    if (!ref) return checkout;
    return client.checkout.addDiscount(checkout.id, ref).catch(function () {
      return checkout;
    });
  });
}

export { PRODUCT_ID, DOMAIN, TOKEN };
