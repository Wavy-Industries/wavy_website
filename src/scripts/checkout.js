import { getCountryCode } from '~/lib/api/geo.js';
import { fetchProduct, createCheckout, DOMAIN, TOKEN } from '~/lib/api/shopify.js';
import { formatShopifyPrice, formatTaxAmount, resolveTaxSettings, resolveDisplayGrossAndTax } from '~/lib/utils/shopify-util.js';
import { track, TRACKING_EVENT_TYPES, getVisitorId, getRef } from '~/lib/api/tracking.js';
import { cart, cartInit, cartUpdate, cartRemove } from '~/lib/state/cart.svelte';
import { PRODUCTS, getProduct, isPreorder } from '~/lib/config/products';

import monkeyFaceImg from '~/assets/monkey/monkey_face.svg';
import bridgeIconImg from '~/assets/bridge/bridge_icon.svg';

var scriptURL = 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js';
var MAX_QUANTITY = 10;

// Per-SKU display catalog.
var SKU_DISPLAY = {
  monkey: {
    title: PRODUCTS.monkey.displayName,
    image: typeof monkeyFaceImg === 'string' ? monkeyFaceImg : (monkeyFaceImg && monkeyFaceImg.src),
  },
  bridge: {
    title: PRODUCTS.bridge.displayName,
    image: typeof bridgeIconImg === 'string' ? bridgeIconImg : (bridgeIconImg && bridgeIconImg.src),
  },
};

var loadingEl = document.getElementById('checkout-loading');
var sectionEl = document.getElementById('checkout-section');
var emptyEl = document.getElementById('checkout-empty');
var lineItemsEl = document.getElementById('line-items');
var buyButton = document.getElementById('buy-now-button');
var errorEl = document.getElementById('buy-error');
var totalEl = document.getElementById('total-price');
var taxLabelEl = document.getElementById('tax-label');
var taxAmountEl = document.getElementById('tax-amount');
var regionLabelEl = document.getElementById('region-label');
var preorderDisclosureEl = document.getElementById('preorder-disclosure');
var termsCheckbox = document.getElementById('terms-accept');

var client;

// Per-SKU product info populated from Shopify.
// { [sku]: { variantId, available, qtyAvailable, unitGross, unitTax } }
var productInfo = {};
var currencyCode = null;
var taxNameForDisplay = '';

cartInit();

function showEmptyState() {
  if (loadingEl) loadingEl.classList.add('hidden');
  if (sectionEl) sectionEl.classList.add('hidden');
  if (emptyEl) emptyEl.classList.remove('hidden');
}

function revealSection() {
  if (loadingEl) loadingEl.classList.add('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');
  if (sectionEl) sectionEl.classList.remove('hidden');
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

function clampQty(q) {
  var n = Math.floor(Number(q));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_QUANTITY, n);
}

function unitGrossFor(sku) {
  return productInfo[sku] ? productInfo[sku].unitGross : 0;
}

function anyOutOfStock() {
  return cart.items.some(function (i) {
    var info = productInfo[i.sku];
    return info && info.available === false;
  });
}

function cartHasPreorder() {
  return cart.items.some(function (i) { return isPreorder(i.sku); });
}

function buildLineCard(item) {
  var display = SKU_DISPLAY[item.sku] || { title: item.name, image: '' };
  var unit = unitGrossFor(item.sku);

  var row = document.createElement('div');
  row.className = 'line-item';
  row.dataset.sku = item.sku;

  // Left group: icon + name + pre-order tag.
  var left = document.createElement('div');
  left.className = 'line-left';

  if (display.image) {
    var img = document.createElement('img');
    img.className = 'line-icon';
    img.src = display.image;
    img.alt = '';
    left.appendChild(img);
  }

  var nameWrap = document.createElement('span');
  nameWrap.className = 'line-name-wrap';
  var name = document.createElement('span');
  name.className = 'line-name';
  name.textContent = display.title;
  nameWrap.appendChild(name);
  if (isPreorder(item.sku)) {
    var tag = document.createElement('span');
    tag.className = 'preorder-tag';
    tag.textContent = 'Pre-order';
    nameWrap.appendChild(tag);
  }
  left.appendChild(nameWrap);
  row.appendChild(left);

  // Right group: price + qty + line total + remove. Wraps below when not enough space.
  var right = document.createElement('div');
  right.className = 'line-right';

  var price = document.createElement('span');
  price.className = 'line-price';
  price.textContent = unit && currencyCode ? formatShopifyPrice(currencyCode, unit) : '—';
  right.appendChild(price);

  var qtyControls = document.createElement('div');
  qtyControls.className = 'qty-controls';
  var dec = document.createElement('button');
  dec.type = 'button';
  dec.className = 'qty-button';
  dec.textContent = '−';
  dec.disabled = item.qty <= 1;
  dec.addEventListener('click', function () {
    cartUpdate(item.sku, item.qty - 1);
    rerenderLineItems();
    updateTotal();
    updateBuyButton();
  });
  var qtyVal = document.createElement('span');
  qtyVal.className = 'qty-value';
  qtyVal.textContent = String(item.qty);
  var inc = document.createElement('button');
  inc.type = 'button';
  inc.className = 'qty-button';
  inc.textContent = '+';
  inc.disabled = item.qty >= MAX_QUANTITY;
  inc.addEventListener('click', function () {
    cartUpdate(item.sku, item.qty + 1);
    rerenderLineItems();
    updateTotal();
    updateBuyButton();
  });
  qtyControls.appendChild(dec);
  qtyControls.appendChild(qtyVal);
  qtyControls.appendChild(inc);
  right.appendChild(qtyControls);

  var lineTotal = document.createElement('span');
  lineTotal.className = 'line-total';
  lineTotal.textContent = unit && currencyCode
    ? formatShopifyPrice(currencyCode, unit * item.qty)
    : '—';
  right.appendChild(lineTotal);

  var remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'line-remove';
  remove.textContent = 'Remove';
  remove.addEventListener('click', function () {
    cartRemove(item.sku);
    rerenderLineItems();
    updateTotal();
    updateBuyButton();
  });
  right.appendChild(remove);

  row.appendChild(right);

  return row;
}

function rerenderLineItems() {
  if (!lineItemsEl) return;
  lineItemsEl.innerHTML = '';
  if (cart.items.length === 0) {
    showEmptyState();
    return;
  }
  cart.items.forEach(function (item) {
    lineItemsEl.appendChild(buildLineCard(item));
  });
  if (preorderDisclosureEl) {
    preorderDisclosureEl.classList.toggle('hidden', !cartHasPreorder());
  }
}

async function fetchProductInfo(sku) {
  var country;
  try {
    country = await getCountryCode();
  } catch {
    country = null;
  }
  var data;
  try {
    data = await fetchProduct(sku, country);
  } catch (err) {
    console.warn('Localized fetch failed for ' + sku + ', falling back.', err);
    data = await fetchProduct(sku, null);
  }
  var localizedCountry = data.countryIsoCode || country;
  var taxSettings = resolveTaxSettings(localizedCountry, null, null, 'VAT');
  if (!taxNameForDisplay) taxNameForDisplay = taxSettings.taxName;

  var variant = data.variant;
  var priceObj = variant.priceV2 || variant.price;
  var localizedAmount = priceObj ? parseFloat(priceObj.amount) : 0;
  if (priceObj && priceObj.currencyCode) currencyCode = priceObj.currencyCode;

  var baselineNet = null;
  try {
    var baseline = await fetchProduct(sku, null);
    var basePriceObj = baseline.variant.priceV2 || baseline.variant.price;
    if (basePriceObj && basePriceObj.currencyCode === (priceObj && priceObj.currencyCode)) {
      baselineNet = parseFloat(basePriceObj.amount);
    }
  } catch (err) {
    console.warn('Baseline price fetch failed for ' + sku + '.', err);
  }

  var display = resolveDisplayGrossAndTax(localizedAmount, taxSettings, baselineNet);

  productInfo[sku] = {
    variantId: variant.id,
    available: variant.availableForSale !== false,
    qtyAvailable: variant.quantityAvailable,
    unitGross: display.gross,
    unitTax: display.tax,
    countryIso: localizedCountry,
  };

  if (regionLabelEl && localizedCountry) {
    var regionLabel = 'Region: ' + localizedCountry;
    if (currencyCode) regionLabel += ' (' + currencyCode + ')';
    regionLabelEl.textContent = regionLabel;
  }
}

async function fetchAll() {
  var skus = Array.from(new Set(cart.items.map(function (i) { return i.sku; })))
    .filter(function (s) { return !!getProduct(s); });
  await Promise.all(skus.map(function (sku) { return fetchProductInfo(sku); }));
  rerenderLineItems();
  updateTotal();
  revealSection();
  updateBuyButton();
}

function updateTotal() {
  if (!totalEl) return;
  var totalGross = 0;
  var totalTax = 0;
  var hasTax = false;
  cart.items.forEach(function (item) {
    var info = productInfo[item.sku];
    if (!info) return;
    totalGross += info.unitGross * clampQty(item.qty);
    if (info.unitTax !== null && info.unitTax !== undefined) {
      totalTax += info.unitTax * clampQty(item.qty);
      hasTax = true;
    }
  });

  totalEl.textContent = currencyCode ? formatShopifyPrice(currencyCode, totalGross) : '—';

  if (taxAmountEl) {
    if (!hasTax) {
      taxAmountEl.textContent = 'paid on delivery';
    } else {
      taxAmountEl.textContent = formatTaxAmount(currencyCode || '', totalTax);
    }
  }

  if (taxLabelEl) {
    if (!hasTax) {
      taxLabelEl.textContent = 'Import duties & taxes';
    } else {
      taxLabelEl.textContent = 'incl. ' + (taxNameForDisplay || 'VAT');
    }
  }
}

function updateBuyButton() {
  if (!buyButton) return;
  var termsOk = !termsCheckbox || termsCheckbox.checked;
  if (cart.items.length === 0 || anyOutOfStock() || !termsOk) {
    setButtonState(true);
  } else {
    setButtonState(false);
  }
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
  client = window.ShopifyBuy.buildClient({ domain: DOMAIN, storefrontAccessToken: TOKEN });
  fetchAll().catch(function (err) {
    console.error(err);
    showError('Product unavailable right now.');
  });
}

function handleBuy() {
  if (!client) {
    showError('Product unavailable right now.');
    return;
  }
  if (cart.items.length === 0) {
    showEmptyState();
    return;
  }
  if (anyOutOfStock()) {
    showError('A product in your cart is currently out of stock.');
    return;
  }

  var lineItems = [];
  var trackItems = [];
  var totalAmount = 0;
  for (var i = 0; i < cart.items.length; i++) {
    var item = cart.items[i];
    var info = productInfo[item.sku];
    if (!info || !info.variantId) {
      showError('A product in your cart is unavailable right now.');
      return;
    }
    var qty = clampQty(item.qty);
    lineItems.push({ variantId: info.variantId, quantity: qty });
    var product = getProduct(item.sku);
    trackItems.push({
      code: product ? product.productCode : item.sku,
      qty: qty,
      unit_price: info.unitGross,
      currency: currencyCode,
    });
    totalAmount += info.unitGross * qty;
  }

  track(TRACKING_EVENT_TYPES.checkout_start, {
    items: trackItems,
    subtotal: totalAmount,
    currency: currencyCode,
  });

  setButtonState(true);
  if (loadingEl) loadingEl.classList.remove('hidden');
  if (sectionEl) sectionEl.classList.add('hidden');

  createCheckout(client, lineItems, {
    visitorId: getVisitorId(),
    ref: getRef(),
  }).then(function (checkout) {
    window.location.href = checkout.webUrl;
  }).catch(function (err) {
    console.error(err);
    showError('Could not start checkout.');
  });
}

if (buyButton) buyButton.addEventListener('click', handleBuy);
if (termsCheckbox) termsCheckbox.addEventListener('change', updateBuyButton);

if (cart.items.length === 0) {
  showEmptyState();
} else {
  rerenderLineItems();
  if (window.ShopifyBuy && window.ShopifyBuy.buildClient) {
    initShopify();
  } else {
    loadScript();
  }
}

window.addEventListener('pageshow', function (event) {
  if (event.persisted) {
    if (cart.items.length === 0) {
      showEmptyState();
    } else {
      revealSection();
      updateBuyButton();
    }
  }
});
