// Base URL of the Wavy backend (tracking, geo, newsletter, partners, feedback).
export const API_BASE = import.meta.env.MODE === 'development'
    ? 'http://localhost:8000'
    : 'https://server.wavyindustries.com';
