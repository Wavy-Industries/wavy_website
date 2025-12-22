import {
  PRODUCT_ID,
  DOMAIN,
  TOKEN,
  STOREFRONT_API,
  buildProductPriceQuery,
  formatShopifyPrice,
  guessCountryCode,
  resolveTaxSettings,
  computeNetAndTax,
  formatTaxAmount,
} from '~/lib/utils/shopify-util.js';
import { trackEvent } from '~/lib/utils/metaPixel';

var scriptURL = 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js';
var productId = PRODUCT_ID;
var domain = DOMAIN;
var token = TOKEN;
var storefrontApi = STOREFRONT_API;

var buyButton = document.getElementById('buy-now-button');
var errorEl = document.getElementById('buy-error');
var priceEl = document.getElementById('product-price');
var priceMetaEl = document.getElementById('price-meta');
var regionLabelEl = document.getElementById('region-label');
var vatLabelEl = document.getElementById('VAT');
var quantityEl = document.getElementById('quantity');
var totalEl = document.getElementById('total-price');
var taxLabelEl = document.getElementById('tax-label');
var taxAmountEl = document.getElementById('tax-amount');
var quantityDecreaseBtn = document.getElementById('quantity-decrease');
var quantityIncreaseBtn = document.getElementById('quantity-increase');
var quantityDisplayEl = document.getElementById('quantity-display');
var loadingEl = document.getElementById('purchase-loading');
var sectionEl = document.getElementById('purchase-section');
var shippingStatusEl = document.getElementById('shipping-status');
var shippingLeadtimeEl = document.getElementById('shipping-status-leadtime');
var notifyForm = document.getElementById('stock-notify-form');
var client;
var variantId;
var unitNetAmount = 0;
var unitTaxAmount = null;
var currencyCode = null;
var taxNameForDisplay = '';
var MAX_QUANTITY = 10;
var isAvailableForSale = true;

function revealSection() {
  if (loadingEl) {
    loadingEl.classList.add('hidden');
  }
  if (sectionEl) {
    sectionEl.classList.remove('hidden');
  }
}

function showLoadingView() {
  if (loadingEl) {
    loadingEl.classList.remove('hidden');
  }
  if (sectionEl) {
    sectionEl.classList.add('hidden');
  }
}

function setButtonState(disabled) {
  if (!buyButton) return;
  buyButton.disabled = !!disabled;
}

function showError(message) {
  revealSection();
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
  setButtonState(true);
}

function setStockStatus(availableForSale, quantityAvailable) {
  if (!shippingStatusEl) return;
  shippingStatusEl.classList.remove('in-stock', 'out-of-stock', 'low-stock', 'unknown-stock');

  var label = 'Unknown';
  var className = 'unknown-stock';
  var showNotify = false;

  if (availableForSale === true) {
    label = 'In stock';
    className = 'in-stock';

    if (typeof quantityAvailable === 'number') {
      if (quantityAvailable <= 0) {
        label = 'Out of stock';
        className = 'out-of-stock';
        showNotify = true;
      } else if (quantityAvailable <= 3) {
        label = 'Low stock (' + quantityAvailable + ')';
        className = 'low-stock';
      }
    }
  } else if (availableForSale === false) {
    label = 'Out of stock';
    className = 'out-of-stock';
    showNotify = true;
  }

  shippingStatusEl.textContent = 'Status: ' + label;
  shippingStatusEl.classList.add(className);
  if (shippingLeadtimeEl) {
    shippingLeadtimeEl.textContent = '';
  }
  if (notifyForm) {
    notifyForm.classList.toggle('hidden', !showNotify);
  }
}

function requestProduct(queryConfig) {
  return fetch(storefrontApi, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({ query: queryConfig.query, variables: queryConfig.variables }),
  }).then(function (res) {
    return res.json();
  }).then(function (resp) {
    if (!resp || !resp.data || !resp.data.product || !resp.data.product.variants.edges.length) {
      console.log(resp);
      throw new Error('No product data returned');
    }

    var variant = resp.data.product.variants.edges[0].node;
    var localization = resp.data.localization && resp.data.localization.country ? resp.data.localization.country : null;
    var taxRate = null;
    var taxName = 'VAT';

    return {
      variant: variant,
      taxName: taxName,
      taxRate: null,
      taxesIncluded: null,
      countryIsoCode: localization ? localization.isoCode : null,
    };
  });
}

function requestBaselineProduct() {
  var baselineConfig = buildProductPriceQuery ? buildProductPriceQuery(null, false) : { query: '', variables: { id: productId } };
  return requestProduct(baselineConfig);
}

async function fetchProductData() {
  var countryCode = null;
  if (guessCountryCode) {
    try {
      countryCode = await guessCountryCode();
    } catch (err) {
      countryCode = null;
    }
  }

  var queryConfig = buildProductPriceQuery
    ? buildProductPriceQuery(countryCode, true)
    : { query: '', variables: { id: productId } };

  var productData;
  try {
    productData = await requestProduct(queryConfig);
  } catch (err) {
    console.warn('Falling back to Shopify price without localization.', err);
    if (buildProductPriceQuery) {
      try {
        productData = await requestProduct(buildProductPriceQuery(countryCode, false));
      } catch (fallbackNoLocErr) {
        console.warn('Country query without localization failed, trying default market.', fallbackNoLocErr);
      }
    }

    if (!productData) {
      if (regionLabelEl) {
        regionLabelEl.textContent = '';
      }
      var defaultConfig = buildProductPriceQuery
        ? buildProductPriceQuery(null, true)
        : { query: '', variables: { id: productId } };

      try {
        productData = await requestProduct(defaultConfig);
      } catch (defaultErr) {
        if (buildProductPriceQuery) {
          productData = await requestProduct(buildProductPriceQuery(null, false));
        } else {
          throw defaultErr;
        }
      }
    }
  }

  var variant = productData && productData.variant ? productData.variant : null;
  var taxesIncludedFlag = productData ? productData.taxesIncluded : null;
  var taxRate = productData ? productData.taxRate : null;
  var taxName = productData && productData.taxName ? productData.taxName : 'VAT';
  var localizedCountry = productData && productData.countryIsoCode ? productData.countryIsoCode : countryCode;
  var taxSettings = resolveTaxSettings(localizedCountry, taxesIncludedFlag, taxRate, taxName);
  taxNameForDisplay = taxSettings.taxName;

  variantId = variant.id;
  isAvailableForSale = variant.availableForSale !== false;

  setStockStatus(variant.availableForSale, variant.quantityAvailable);
  console.info('Shopify stock status', {
    availableForSale: variant.availableForSale,
    quantityAvailable: variant.quantityAvailable,
  });
  if (!isAvailableForSale) {
    setButtonState(true);
  }

  var priceObj = variant.priceV2 || variant.price;
  if (priceObj && priceObj.amount && priceObj.currencyCode && priceEl) {
    currencyCode = priceObj.currencyCode;
    var grossAmount = parseFloat(priceObj.amount);
    var netTax = computeNetAndTax(grossAmount, taxSettings);
    var baselineNet = null;

    try {
      var baselineData = await requestBaselineProduct();
      var baselineVariant = baselineData && baselineData.variant ? baselineData.variant : null;
      var baselinePriceObj = baselineVariant ? (baselineVariant.priceV2 || baselineVariant.price) : null;
      if (
        baselinePriceObj &&
        baselinePriceObj.amount &&
        baselinePriceObj.currencyCode &&
        baselinePriceObj.currencyCode === currencyCode
      ) {
        baselineNet = parseFloat(baselinePriceObj.amount);
      }
    } catch (baselineErr) {
      console.warn('Baseline price fetch failed, using localized tax settings.', baselineErr);
    }

    if (baselineNet !== null && baselineNet < grossAmount) {
      unitNetAmount = baselineNet;
      unitTaxAmount = grossAmount - baselineNet;
    } else {
      unitNetAmount = netTax.net;
      unitTaxAmount = netTax.tax;
    }

    var formatter = formatShopifyPrice;
    console.info('Shopify price', {
      currencyCode: currencyCode,
      amount: grossAmount,
    });
    var formatted = formatter
      ? formatter(currencyCode, unitNetAmount)
      : (unitNetAmount + ' ' + currencyCode);
    priceEl.textContent = formatted;
    if (priceMetaEl) {
      priceMetaEl.textContent = '';
    }
    updateTotal();
  }

  if (regionLabelEl) {
    var regionLabel = localizedCountry ? 'Region: ' + localizedCountry : 'Currency';
    if (currencyCode) {
      regionLabel += ' (' + currencyCode + ')';
    }
    regionLabelEl.textContent = regionLabel;
  }

  var taxesIncluded = unitTaxAmount && unitTaxAmount > 0 ? true : (taxSettings ? taxSettings.taxesIncluded : null);
  if (vatLabelEl) {
    if (unitTaxAmount !== null) {
      // We display the net price, so label as exclusive even if Shopify includes tax in the gross.
      vatLabelEl.textContent = 'ex. ' + taxNameForDisplay;
    } else {
      vatLabelEl.textContent = taxNameForDisplay + ' info at checkout';
    }
  }

  revealSection();
  setButtonState(false);
}

function updateTotal() {
  if (!quantityEl || !totalEl || !unitNetAmount) return;
  var qty = parseInt(quantityEl.value, 10) || 1;
  if (qty < 1) qty = 1;
  if (qty > MAX_QUANTITY) qty = MAX_QUANTITY;
  quantityEl.value = qty;
  if (quantityDisplayEl) {
    quantityDisplayEl.textContent = String(qty);
  }
  var totalNet = unitNetAmount * qty;
  var totalTax = unitTaxAmount !== null ? unitTaxAmount * qty : null;
  var formatter = formatShopifyPrice;
  totalEl.textContent = formatter
    ? formatter(currencyCode, totalNet)
    : (totalNet + ' ' + (currencyCode || ''));

  if (taxAmountEl) {
    if (totalTax === null) {
      taxAmountEl.textContent = 'at checkout';
    } else {
      taxAmountEl.textContent = formatTaxAmount(currencyCode || '', totalTax);
    }
  }

  if (taxLabelEl) {
    var taxLabel = 'Taxes' + (taxNameForDisplay ? ' (' + taxNameForDisplay + ')' : '');
    var taxPercent = unitTaxAmount !== null && unitNetAmount
      ? Math.round((unitTaxAmount / unitNetAmount) * 100)
      : null;
    if (taxPercent !== null && !isNaN(taxPercent)) {
      taxLabel += ' ' + taxPercent + '%';
    }
    taxLabelEl.textContent = taxLabel;
  }
}

function updateQuantityButtons() {
  if (!quantityEl) return;
  var qty = parseInt(quantityEl.value, 10) || 1;

  if (quantityDecreaseBtn) {
    if (qty <= 1) {
      quantityDecreaseBtn.disabled = true;
      quantityDecreaseBtn.title = 'Minimum quantity is 1.';
    } else {
    quantityDecreaseBtn.disabled = false;
    quantityDecreaseBtn.removeAttribute('title');
    }
  }

  if (quantityIncreaseBtn) {
    if (qty >= MAX_QUANTITY) {
      quantityIncreaseBtn.disabled = true;
      quantityIncreaseBtn.title = 'Maximum quantity is ' + MAX_QUANTITY + '.';
    } else {
      quantityIncreaseBtn.disabled = false;
      quantityIncreaseBtn.removeAttribute('title');
    }
  }
}

function changeQuantity(delta) {
  if (!quantityEl) return;
  var current = parseInt(quantityEl.value, 10) || 1;
  var next = current + delta;
  if (next < 1) {
    next = 1;
  } else if (next > MAX_QUANTITY) {
    next = MAX_QUANTITY;
  }
  quantityEl.value = next;
  updateTotal();
  updateQuantityButtons();
}

function loadScript() {
  var script = document.createElement('script');
  script.async = true;
  script.src = scriptURL;
  script.onload = initShopify;
  (document.head || document.body).appendChild(script);
}

function initShopify() {
  if (!window.ShopifyBuy || !window.ShopifyBuy.buildClient) {
    showError('Failed to load store client.');
    return;
  }

  client = window.ShopifyBuy.buildClient({
    domain: domain,
    storefrontAccessToken: token,
  });

  fetchProductData().catch(function (err) {
    console.error(err);
    showError('Product unavailable right now.');
  });
}

function handleBuy() {
  if (!client || !variantId) {
    showError('Product unavailable right now.');
    return;
  }
  if (!isAvailableForSale) {
    showError('Product is currently out of stock.');
    return;
  }

  var quantity = 1;
  if (quantityEl) {
    quantity = parseInt(quantityEl.value, 10) || 1;
    if (quantity < 1) quantity = 1;
    if (quantity > MAX_QUANTITY) quantity = MAX_QUANTITY;
  }

  var eventParams = {
    content_ids: [productId],
    content_name: 'MONKEY',
    content_type: 'product',
    num_items: quantity,
  };

  if (currencyCode) {
    eventParams.currency = currencyCode;
  }

  if (typeof unitNetAmount === 'number' && !isNaN(unitNetAmount) && unitNetAmount > 0) {
    eventParams.value = unitNetAmount * quantity;
  }

  trackEvent('InitiateCheckout', eventParams);

  showLoadingView();
  setButtonState(true);
  client.checkout.create().then(function (checkout) {
    return client.checkout.addLineItems(checkout.id, [{
      variantId: variantId,
      quantity: quantity,
    }]);
  }).then(function (checkout) {
    window.location.href = checkout.webUrl;
  }).catch(function (err) {
    console.error(err);
    showError('Could not start checkout.');
  });
}

if (buyButton) {
  buyButton.addEventListener('click', handleBuy);
}

if (quantityDecreaseBtn) {
  quantityDecreaseBtn.addEventListener('click', function () {
    changeQuantity(-1);
  });
}

if (quantityIncreaseBtn) {
  quantityIncreaseBtn.addEventListener('click', function () {
    changeQuantity(1);
  });
}

if (window.ShopifyBuy && window.ShopifyBuy.buildClient) {
  initShopify();
} else {
  loadScript();
}

// initialize quantity UI state
updateTotal();
updateQuantityButtons();
