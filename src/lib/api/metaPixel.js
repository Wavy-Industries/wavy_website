import { PRODUCTS } from '~/lib/config/products';
import { Log } from '~/lib/utils/Log';

var PIXEL_ID = '828004349726924';
var IS_DEV = import.meta.env.MODE === 'development';

var log = new Log('meta_pixel', Log.LEVEL_DEBUG);

// Pages that count as a product view. Keys are pathnames with the
// trailing slash stripped (build uses directory format URLs).
var PRODUCT_PAGES = {
  '/monkey': { content_ids: [PRODUCTS.monkey.productCode], content_name: PRODUCTS.monkey.displayName },
  '/bridge': { content_ids: [PRODUCTS.bridge.productCode], content_name: PRODUCTS.bridge.displayName },
  '/KD-3': { content_name: 'KD-3' },
};

var initialized = false;

function ensurePixel() {
  if (initialized) return;
  initialized = true;
  var w = window;
  if (!w.fbq) {
    var n = (w.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!w._fbq) w._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    var first = document.getElementsByTagName('script')[0];
    first.parentNode.insertBefore(script, first);
  }
  w.fbq('init', PIXEL_ID);
}

function normalizedPath() {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

// Maps an internal tracking event to zero or more [name, params] pixel events.
function mapEvent(eventType, metadata) {
  var m = metadata || {};
  switch (eventType) {
    case 'page_view': {
      var events = [['PageView']];
      var page = PRODUCT_PAGES[normalizedPath()];
      if (page) {
        events.push(['ViewContent', Object.assign({ content_type: 'product' }, page)]);
      }
      return events;
    }
    case 'cart_add': {
      if (!m.code) return [['AddToCart']];
      return [['AddToCart', {
        content_type: 'product',
        content_ids: [m.code],
        contents: [{ id: m.code, quantity: m.qty || 1 }],
      }]];
    }
    case 'checkout_start': {
      var items = m.items || [];
      return [['InitiateCheckout', {
        content_type: 'product',
        content_ids: items.map(function (i) { return i.code; }),
        contents: items.map(function (i) { return { id: i.code, quantity: i.qty }; }),
        num_items: items.reduce(function (sum, i) { return sum + i.qty; }, 0),
        value: m.subtotal,
        currency: m.currency,
      }]];
    }
    default:
      return [];
  }
}

export function metaTrack(eventType, metadata) {
  var events = mapEvent(eventType, metadata);
  if (events.length === 0) return;
  events.forEach(function (e) { log.debug(e[0], e[1] || {}); });
  if (IS_DEV) return;
  ensurePixel();
  events.forEach(function (e) { window.fbq('track', e[0], e[1]); });
}
