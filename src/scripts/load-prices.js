import { getCountryCode } from '~/lib/api/geo.js';
import { fetchProduct } from '~/lib/api/shopify.js';
import { formatShopifyPrice, resolveTaxSettings, resolveDisplayGrossAndTax } from '~/lib/utils/shopify-util.js';

function renderPrice(productData, els) {
  var variant = productData.variant;
  var priceObj = variant.priceV2 || variant.price;
  if (!priceObj || !priceObj.amount || !priceObj.currencyCode) return;
  var taxSettings = resolveTaxSettings(productData.countryIsoCode, null, null, 'VAT');
  var display = resolveDisplayGrossAndTax(parseFloat(priceObj.amount), taxSettings);
  var text = formatShopifyPrice(priceObj.currencyCode, display.gross);
  els.forEach(function (el) {
    el.textContent = text;
    el.classList.remove('atc-price--loading');
  });
}

async function loadForSku(sku, els) {
  var countryCode;
  try {
    countryCode = await getCountryCode();
  } catch {
    countryCode = null;
  }
  try {
    var productData = await fetchProduct(sku, countryCode);
    renderPrice(productData, els);
  } catch (err) {
    console.warn('Localized price failed for ' + sku + ', retrying default market.', err);
    try {
      var productData2 = await fetchProduct(sku, null);
      renderPrice(productData2, els);
    } catch (fallbackErr) {
      console.error('Price fetch failed for ' + sku + '.', fallbackErr);
      els.forEach(function (el) { el.classList.remove('atc-price--loading'); });
    }
  }
}

var groups = {};
document.querySelectorAll('[data-atc-price-for]').forEach(function (el) {
  var sku = el.getAttribute('data-atc-price-for');
  if (!sku) return;
  if (!groups[sku]) groups[sku] = [];
  groups[sku].push(el);
});

Object.keys(groups).forEach(function (sku) {
  loadForSku(sku, groups[sku]);
});
