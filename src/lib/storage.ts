/*
 * The single place where this site writes to localStorage.
 *
 * Two things live here, and nothing else:
 *
 *   1. the visitor's country, because resolving it costs a geo round trip and
 *      it changes about as often as the visitor moves house, and
 *   2. what is in their cart, which is not a cache — it is the only record
 *      that the cart exists at all until they click through to checkout.
 *
 * Prices are deliberately absent. They are fetched once per page load and held
 * in memory; a price that outlives the page it was fetched on is a price that
 * can be wrong.
 *
 * Keys owned by this module:
 *   wavy_country   { code, source, ts }   see COUNTRY_TTL_MS
 *   wavy_cart_v1   [{ sku, qty }]
 *
 * Keys owned elsewhere (listed so this file stays the map of client storage):
 *   wavy_vid             src/lib/api/tracking.js   visitor id
 *   wavy_ref             src/lib/api/tracking.js   referral code from ?ref=
 *   wavy_blog_last_seen  src/layouts/Header.astro  blog "new" dot
 */

const COUNTRY_KEY = 'wavy_country';
const CART_KEY = 'wavy_cart_v1';

/** A geo-estimated country is re-checked after a week. A user's own choice never expires. */
const COUNTRY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const MAX_QTY = 10;

export type CountrySource = 'geo' | 'user';

export interface StoredCountry {
    code: string;
    source: CountrySource;
    ts: number;
}

export interface CartLine {
    sku: string;
    qty: number;
}

function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* private mode, quota — the site works without persistence */
    }
}

export function getStoredCountry(): StoredCountry | null {
    const raw = read(COUNTRY_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (
            !parsed ||
            typeof parsed.code !== 'string' ||
            parsed.code.length !== 2 ||
            (parsed.source !== 'geo' && parsed.source !== 'user') ||
            !Number.isFinite(parsed.ts)
        ) {
            return null;
        }
        return { code: parsed.code.toUpperCase(), source: parsed.source, ts: parsed.ts };
    } catch {
        return null;
    }
}

export function setStoredCountry(code: string, source: CountrySource) {
    write(COUNTRY_KEY, JSON.stringify({ code: code.toUpperCase(), source, ts: Date.now() }));
}

/** True when we should ask the geo API again: nothing stored, or a stale estimate. */
export function isCountryStale(stored: StoredCountry | null): boolean {
    if (!stored) return true;
    if (stored.source === 'user') return false;
    return Date.now() - stored.ts > COUNTRY_TTL_MS;
}

export function clampQty(qty: number): number {
    const n = Math.floor(Number(qty));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(MAX_QTY, n);
}

export function getStoredCart(): CartLine[] {
    const raw = read(CART_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((l) => l && typeof l.sku === 'string' && Number.isFinite(l.qty))
            .map((l) => ({ sku: l.sku, qty: clampQty(l.qty) }));
    } catch {
        return [];
    }
}

export function setStoredCart(lines: CartLine[]) {
    write(CART_KEY, JSON.stringify(lines));
}
