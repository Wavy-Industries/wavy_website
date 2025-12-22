import {
  PRODUCT_ID,
  TOKEN,
  STOREFRONT_API,
  buildProductPriceQuery,
  formatShopifyPrice,
  guessCountryCode,
  resolveTaxSettings,
  computeNetAndTax,
} from '~/lib/utils/shopify-util.js';
import { trackEvent } from '~/lib/utils/metaPixel';

const productId = PRODUCT_ID;
const token = TOKEN;
const storefrontApi = STOREFRONT_API;

function requestProduct(queryConfig) {
  return fetch(storefrontApi, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({ query: queryConfig.query, variables: queryConfig.variables }),
  }).then(function (res) { return res.json(); }).then(function (resp) {
    if (!resp || !resp.data || !resp.data.product || !resp.data.product.variants.edges.length) {
      throw new Error('No product data returned');
    }
    const variant = resp.data.product.variants.edges[0].node;
    const localization = resp.data.localization && resp.data.localization.country ? resp.data.localization.country : null;
    const taxRate = null;
    const taxName = 'VAT';
    return {
      variant,
      countryIsoCode: localization ? localization.isoCode : null,
      taxRate: null,
      taxName,
      taxesIncluded: null,
    };
  });
}

function requestBaselineProduct() {
  const baselineConfig = buildProductPriceQuery ? buildProductPriceQuery(null, false) : { query: '', variables: { id: productId } };
  return requestProduct(baselineConfig);
}

function renderPrice(productData, priceEl) {
  const variant = productData.variant;
  const priceObj = variant.priceV2 || variant.price;
  if (priceObj && priceObj.amount && priceObj.currencyCode) {
    const currencyCode = priceObj.currencyCode;
    const gross = parseFloat(priceObj.amount);
    const taxSettings = resolveTaxSettings(productData.countryIsoCode, productData.taxesIncluded, productData.taxRate, productData.taxName);
    const netTax = computeNetAndTax(gross, taxSettings);
    let unitNet = netTax.net;

    requestBaselineProduct().then(function (baselineData) {
      const baselineVariant = baselineData && baselineData.variant ? baselineData.variant : null;
      const baselinePriceObj = baselineVariant ? (baselineVariant.priceV2 || baselineVariant.price) : null;
      if (
        baselinePriceObj &&
        baselinePriceObj.amount &&
        baselinePriceObj.currencyCode &&
        baselinePriceObj.currencyCode === currencyCode
      ) {
        const baselineNet = parseFloat(baselinePriceObj.amount);
        if (baselineNet < gross) {
          unitNet = baselineNet;
        }
      }
      const formatted = formatShopifyPrice
        ? formatShopifyPrice(currencyCode, unitNet)
        : (unitNet + ' ' + currencyCode);
      priceEl.textContent = formatted;
      priceEl.classList.remove('monkey-price--loading');
    }).catch(function () {
      const formatted = formatShopifyPrice
        ? formatShopifyPrice(currencyCode, unitNet)
        : (unitNet + ' ' + currencyCode);
      priceEl.textContent = formatted;
      priceEl.classList.remove('monkey-price--loading');
    });
  }
}

export async function loadHeroPrice(priceEl) {
  if (!priceEl) return;

  let countryCode = null;
  if (guessCountryCode) {
    try {
      countryCode = await guessCountryCode();
    } catch (err) {
      countryCode = null;
    }
  }

  const queryConfig = buildProductPriceQuery
    ? buildProductPriceQuery(countryCode, true)
    : { query: '', variables: { id: productId } };

  try {
    const productData = await requestProduct(queryConfig);
    renderPrice(productData, priceEl);
    return;
  } catch (err) {
    console.warn('Locale-based Shopify price failed, retrying without localization.', err);

    if (buildProductPriceQuery) {
      try {
        const productData = await requestProduct(buildProductPriceQuery(countryCode, false));
        renderPrice(productData, priceEl);
        return;
      } catch (noLocErr) {
        console.warn('Country query without localization failed, trying default market.', noLocErr);
      }
    }

    try {
      const productData = await requestProduct(
        buildProductPriceQuery ? buildProductPriceQuery(null, true) : { query: '', variables: { id: productId } }
      );
      renderPrice(productData, priceEl);
      return;
    } catch (fallbackErr) {
      if (buildProductPriceQuery) {
        try {
          const productData = await requestProduct(buildProductPriceQuery(null, false));
          renderPrice(productData, priceEl);
          return;
        } catch (finalErr) {
          console.error('Default Shopify price fetch failed after removing localization.', finalErr);
        }
      } else {
        console.error('Default Shopify price fetch failed.', fallbackErr);
      }
    }
  }

  priceEl.textContent = '€79';
  priceEl.classList.remove('monkey-price--loading');
}

const priceEl = document.getElementById('monkey-price');
loadHeroPrice(priceEl);

const buyButton = document.getElementById('monkey-buy-button');
if (buyButton) {
  buyButton.addEventListener('click', function () {
    trackEvent('AddToCart', {
      content_ids: [productId],
      content_name: 'MONKEY',
      content_type: 'product',
    });
  });
}
