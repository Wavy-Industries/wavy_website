var API_BASE = import.meta.env.MODE === 'development'
  ? 'http://localhost:8000'
  : 'https://server.wavyindustries.com';

var TRACKING_URL = API_BASE + '/api/tracking/event';

export const TRACKING_EVENT_TYPES = {
  // Funnel
  page_view: 'page_view',
  // Commerce — cart lifecycle
  cart_add: 'cart_add',
  cart_update: 'cart_update',
  cart_remove: 'cart_remove',
  cart_clear: 'cart_clear',
  // Commerce — checkout
  checkout_start: 'checkout_start',
  checkout_success: 'checkout_success',
  checkout_cancel: 'checkout_cancel',
  // Engagement
  download: 'download',
  newsletter_subscribe: 'newsletter_subscribe',
  notify_subscribe: 'notify_subscribe',
  feedback_submit: 'feedback_submit',
}

export function getVisitorId() {
  var key = 'wavy_vid';
  var id = localStorage.getItem(key);
  if (!id) {
    id = 'wv_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    localStorage.setItem(key, id);
  }
  return id;
}

export function getRef() {
  return localStorage.getItem('wavy_ref') || undefined;
}

function captureRef() {
  var key = 'wavy_ref';
  var params = new URLSearchParams(window.location.search);
  var ref = params.get('ref');
  if (ref) {
    localStorage.setItem(key, ref);
  }
  return localStorage.getItem(key) || undefined;
}

export function track(eventType, metadata) {
  var ref = captureRef();
  var merged = metadata || {};
  if (ref) {
    merged.ref = ref;
  }

  fetch(TRACKING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visitor_id: getVisitorId(),
      event_type: eventType,
      page_url: window.location.pathname,
      referrer: !document.referrer ? 'unknown'
        : document.referrer.includes(window.location.hostname) ? undefined
        : document.referrer,
      metadata: Object.keys(merged).length ? merged : undefined,
    }),
    credentials: 'omit',
    keepalive: true,
  }).catch(function () {});
}
