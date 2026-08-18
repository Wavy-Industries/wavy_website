import { track, TRACKING_EVENT_TYPES } from '~/lib/api/tracking.js';
import { API_BASE } from '~/lib/config/server';

// Subscribes the given email to the newsletter and fires the tracking event on
// success. Throws on network or server error so callers can show a UI error;
// tracking failures are swallowed internally by track().
export async function submitNewsletter(opts) {
  var email = opts && opts.email;
  var tag = (opts && opts.tag) || null;
  var source = (opts && opts.source) || 'unknown';

  if (!email) throw new Error('email required');

  var body = { email: email, source: source };
  if (tag) body.tags = [tag];

  var res = await fetch(API_BASE + '/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error('signup failed');

  var metadata = { source: source };
  if (tag) metadata.tag = tag;
  track(TRACKING_EVENT_TYPES.newsletter_subscribe, metadata);
}
