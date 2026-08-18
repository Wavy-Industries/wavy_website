import { Log } from '~/lib/utils/Log';

var TAG_ID = 'AW-17959848782';
var IS_DEV = import.meta.env.MODE === 'development';

var log = new Log('google_ads', Log.LEVEL_DEBUG);

// Conversion labels from Google Ads (Goals -> Conversions -> conversion action
// -> "Use Google tag" setup; the part after the slash in send_to).
// An event whose label is empty is not sent as a conversion.
var CONVERSION_LABELS = {
  cart_add: '',
  checkout_start: '',
};

var initialized = false;

export function googleAdsTrack(eventType, metadata) {
  var events = _mapEvent(eventType, metadata);
  // page_view maps to no event of its own: loading the base tag reports it
  // through the config call in _ensureGtag.
  if (events.length === 0 && eventType !== 'page_view') return;
  log.debug(eventType, events);
  if (IS_DEV) return;
  _ensureGtag();
  events.forEach(function (e) { window.gtag.apply(null, e); });
}

// The official base snippet, deferred until the first tracked event: define
// dataLayer/gtag, register the tag, then load gtag.js which drains the queue.
function _ensureGtag() {
  if (initialized) return;
  initialized = true;
  var w = window;
  w.dataLayer = w.dataLayer || [];
  w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
  w.gtag('js', new Date());
  w.gtag('config', TAG_ID);
  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + TAG_ID;
  document.head.appendChild(script);
}

// Maps an internal tracking event to zero or more gtag() argument lists.
function _mapEvent(eventType, metadata) {
  var m = metadata || {};
  switch (eventType) {
    case 'cart_add':
      return _conversion('cart_add', {});
    case 'checkout_start': {
      var params = {};
      if (m.subtotal != null) params.value = Number(m.subtotal);
      if (m.currency) params.currency = m.currency;
      return _conversion('checkout_start', params);
    }
    default:
      return [];
  }
}

function _conversion(eventType, params) {
  var label = CONVERSION_LABELS[eventType];
  if (!label) return [];
  return [['event', 'conversion', Object.assign({ send_to: TAG_ID + '/' + label }, params)]];
}
