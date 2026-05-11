var API_BASE = import.meta.env.MODE === 'development'
  ? 'http://localhost:8000'
  : 'https://server.wavyindustries.com';

export async function getCountryCode() {
  try {
    var response = await fetch(API_BASE + '/api/geo');
    if (response && response.ok) {
      var data = await response.json();
      if (data && typeof data.country_code === 'string' && data.country_code.length === 2) {
        return data.country_code.toUpperCase();
      }
    }
  } catch (err) {
    // fall through
  }
  return null;
}
