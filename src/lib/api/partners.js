var API_BASE = import.meta.env.MODE === 'development'
  ? 'http://localhost:8000'
  : 'https://server.wavyindustries.com';

// Requests partner portal access for the given email. The server responds
// identically whether or not the email is on the approved list, so callers
// must show the same acknowledgement on any 2xx response.
export async function requestPartnerAccess(opts) {
  var email = opts && opts.email;
  if (!email) throw new Error('email required');

  var res = await fetch(API_BASE + '/api/partners/request-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ email: email }),
  });

  if (res.ok) return { ok: true };
  if (res.status === 429) return { ok: false, reason: 'rate_limited' };
  if (res.status === 422) {
    var body = await res.json().catch(function () { return {}; });
    return { ok: false, reason: 'validation', errors: body && body.errors };
  }
  return { ok: false, reason: 'server' };
}
