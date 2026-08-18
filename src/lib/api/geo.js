import { API_BASE } from '~/lib/config/server';

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
