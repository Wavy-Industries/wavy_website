/*
 * Cart state.
 *
 * Prices are fetched exactly once per page load into `products`, keyed by SKU.
 * Everything the panel shows — line totals, subtotal — is that map multiplied
 * by a quantity, so adding, removing and changing quantity are instant and
 * never touch the network. The only price arithmetic here is × quantity, which
 * is the same sum Shopify does; no tax is inferred, ever.
 *
 * The Shopify cart is created once, when the buyer clicks through to checkout.
 * That is the only moment we need Shopify to have an opinion, and it is the one
 * moment a short wait is expected.
 *
 * Whether the panel is open is a URL question (`#cart`), not a variable, so the
 * back button closes it and a link can open it.
 */

import { fetchStorefrontContext, cartCreate, type CountryOption, type ProductInfo } from '~/lib/api/shopify';
import { getCountryCode } from '~/lib/api/geo.js';
import { track, TRACKING_EVENT_TYPES, getVisitorId, getRef } from '~/lib/api/tracking.js';
import { PRODUCTS, getProduct } from '~/lib/config/products';
import {
    getStoredCountry,
    setStoredCountry,
    isCountryStale,
    getStoredCart,
    setStoredCart,
    clampQty,
    MAX_QTY,
    type CartLine,
} from '~/lib/storage';

export const CART_HASH = '#cart';
export { MAX_QTY };

export const cartState = $state<{
    lines: CartLine[];
    /** SKU → price and variant, fetched once per page load. */
    products: Record<string, ProductInfo>;
    countries: CountryOption[];
    country: string | null;
    open: boolean;
    /** The one-per-page-load price fetch is still running. */
    loading: boolean;
    /** Creating the Shopify cart on the way to checkout. */
    checkingOut: boolean;
    error: string | null;
}>({
    lines: [],
    products: {},
    countries: [],
    country: null,
    open: false,
    loading: true,
    checkingOut: false,
    error: null,
});

let initialized = false;

// ---------------------------------------------------------------------------
// URL as the open/closed state
// ---------------------------------------------------------------------------

function bareUrl() {
    return window.location.pathname + window.location.search;
}

function syncFromHash() {
    cartState.open = window.location.hash === CART_HASH;
}

export function openCart() {
    if (cartState.open) return;
    history.pushState({ wavyCart: true }, '', bareUrl() + CART_HASH);
    cartState.open = true;
}

export function closeCart() {
    if (!cartState.open) return;
    if (history.state?.wavyCart) {
        // We pushed this entry, so back lands where the buyer was.
        history.back();
        return;
    }
    // Arrived on #cart directly — drop the hash without adding history.
    history.replaceState(null, '', bareUrl());
    cartState.open = false;
}

// ---------------------------------------------------------------------------
// Page load
// ---------------------------------------------------------------------------

/** Uses the stored country when it is fresh; only asks the geo API otherwise. */
async function resolveCountry(): Promise<string | null> {
    const stored = getStoredCountry();
    if (!isCountryStale(stored)) return stored!.code;

    const geo = await getCountryCode();
    if (geo) {
        setStoredCountry(geo, 'geo');
        return geo;
    }
    // Leave the stale value in place so the next load tries again.
    return stored?.code ?? null;
}

async function loadPrices(country: string | null) {
    const context = await fetchStorefrontContext(country);
    cartState.products = context.products;
    cartState.countries = context.countries;
    // Shopify resolves the country itself when we could not, so take its answer.
    cartState.country = context.countryCode ?? country;

    // A SKU we no longer sell cannot be priced, so it cannot be bought.
    cartState.lines = cartState.lines.filter((line) => cartState.products[line.sku]);
    setStoredCart(cartState.lines);
}

export function initCart() {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;

    cartState.lines = getStoredCart();
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    window.addEventListener('popstate', syncFromHash);

    (async () => {
        try {
            await loadPrices(await resolveCountry());
        } catch (err) {
            console.error('Price load failed', err);
            cartState.error = 'Could not reach the store.';
        } finally {
            cartState.loading = false;
        }
    })();
}

// ---------------------------------------------------------------------------
// Cart edits — all local, all instant
// ---------------------------------------------------------------------------

function persist() {
    setStoredCart(cartState.lines);
}

export function addToCart(sku: string, qty = 1, cta?: string) {
    if (!PRODUCTS[sku]) return;

    const existing = cartState.lines.find((l) => l.sku === sku);
    if (existing) existing.qty = clampQty(existing.qty + qty);
    else cartState.lines.push({ sku, qty: clampQty(qty) });
    persist();

    track(TRACKING_EVENT_TYPES.cart_add, {
        code: getProduct(sku)?.productCode ?? sku,
        qty,
        cart_size: cartCount(),
        ...(cta ? { cta } : {}),
    });

    openCart();
}

export function setQuantity(sku: string, qty: number) {
    const line = cartState.lines.find((l) => l.sku === sku);
    if (!line) return;
    if (qty <= 0) return removeLine(sku);

    const previous = line.qty;
    line.qty = clampQty(qty);
    persist();

    track(TRACKING_EVENT_TYPES.cart_update, {
        code: getProduct(sku)?.productCode ?? sku,
        qty: line.qty,
        qty_delta: line.qty - previous,
        cart_size: cartCount(),
    });
}

export function removeLine(sku: string) {
    const index = cartState.lines.findIndex((l) => l.sku === sku);
    if (index < 0) return;
    const [removed] = cartState.lines.splice(index, 1);
    persist();

    track(TRACKING_EVENT_TYPES.cart_remove, {
        code: getProduct(sku)?.productCode ?? sku,
        qty_removed: removed.qty,
        cart_size: cartCount(),
    });
}

/** The buyer overriding our geo guess. Prices change, so this refetches them. */
export async function chooseCountry(code: string) {
    if (!code || code === cartState.country) return;
    setStoredCountry(code, 'user');
    cartState.country = code;
    cartState.loading = true;
    cartState.error = null;
    try {
        await loadPrices(code);
    } catch (err) {
        console.error('Reprice failed', err);
        cartState.error = 'Could not price for that country.';
    } finally {
        cartState.loading = false;
    }
}

// ---------------------------------------------------------------------------
// Checkout — the one place a Shopify round trip is worth waiting for
// ---------------------------------------------------------------------------

export async function startCheckout() {
    if (cartState.checkingOut || cartState.lines.length === 0) return;

    const priced = cartState.lines
        .map((line) => ({ line, product: cartState.products[line.sku] }))
        .filter((entry) => entry.product);
    if (priced.length === 0) return;

    cartState.checkingOut = true;
    cartState.error = null;

    track(TRACKING_EVENT_TYPES.checkout_start, {
        items: priced.map(({ line, product }) => ({
            code: getProduct(line.sku)?.productCode ?? line.sku,
            qty: line.qty,
            unit_price: product.price.amount,
            currency: product.price.currencyCode,
        })),
        subtotal: subtotal()?.amount,
        currency: subtotal()?.currencyCode,
    });

    try {
        const cart = await cartCreate(
            priced.map(({ line, product }) => ({ variantId: product.variantId, quantity: line.qty })),
            cartState.country,
            { visitorId: getVisitorId(), ref: getRef() }
        );
        window.location.href = cart.checkoutUrl;
    } catch (err) {
        console.error('Checkout failed', err);
        cartState.error = 'Could not start checkout.';
        cartState.checkingOut = false;
    }
}

// ---------------------------------------------------------------------------
// Read helpers — plain arithmetic over the price map
// ---------------------------------------------------------------------------

export function cartCount(): number {
    return cartState.lines.reduce((sum, line) => sum + line.qty, 0);
}

export function unitPrice(sku: string) {
    return cartState.products[sku]?.price ?? null;
}

export function linePrice(line: CartLine) {
    const price = unitPrice(line.sku);
    return price ? { amount: price.amount * line.qty, currencyCode: price.currencyCode } : null;
}

export function subtotal() {
    let amount = 0;
    let currencyCode: string | null = null;
    for (const line of cartState.lines) {
        const price = unitPrice(line.sku);
        if (!price) return null;
        amount += price.amount * line.qty;
        currencyCode = price.currencyCode;
    }
    return currencyCode ? { amount, currencyCode } : null;
}

export function cartHasPreorder(): boolean {
    return cartState.lines.some((line) => PRODUCTS[line.sku]?.preorder);
}

export function isSoldOut(sku: string): boolean {
    const product = cartState.products[sku];
    return !!product && !product.available;
}
