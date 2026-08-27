/*
 * Cart state.
 *
 * Prices are fetched exactly once per page load into `products`, keyed by SKU.
 * Everything the panel shows — line totals, subtotal — is that map multiplied
 * by a quantity, so adding, removing and changing quantity are instant and
 * never touch the network.
 *
 * Shopify hands us a price with the buyer country's VAT already inside it and
 * no way to ask how much of it is tax. Multiplying such a price by a quantity
 * is the same sum Shopify does only while the consignment stays under the IOSS
 * limit; past it Shopify takes the VAT off again at checkout. So the cart keeps
 * the untaxed price as well and switches to it there. The tax section below is
 * the only place any of that reasoning lives.
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
    // Shopify orders these by ISO code, which lands United Arab Emirates third.
    // A dropdown is read by name, so sort by name — collating in the language
    // Shopify wrote the names in, so the order follows whatever it hands us.
    const byName = new Intl.Collator(context.languageCode ?? undefined);
    cartState.countries = [...context.countries].sort((a, b) => byName.compare(a.name, b.name));
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
// Tax — reading what Shopify already decided, rather than deciding it again
// ---------------------------------------------------------------------------

/*
 * Where we ship from. A buyer here is a domestic sale: MVA is added at checkout
 * rather than folded into the price, and nothing crosses a border, so none of
 * the import reasoning below applies to them.
 */
const SHIP_FROM = 'NO';

/*
 * IOSS only covers consignments holding up to EUR 150 of goods. Above that we
 * cannot ship VAT-paid, so Shopify takes the VAT back off at checkout and the
 * buyer's customs authority charges it on delivery instead. Shopify decides
 * this on its own and will not say so before checkout, so the cart has to know
 * the limit to arrive at the same total.
 */
const IOSS_GOODS_LIMIT_EUR = 150;

/*
 * A gap outside this band is not a VAT rate we could be charging: EU law floors
 * a standard rate at 15% and Hungary has the steepest at 27%. Reading anything
 * else means basePriceEur has drifted from what Shopify charges, and a wrong
 * number stated confidently is worse than the vague line we fall back to.
 */
const MIN_VAT_RATE = 0.15;
const MAX_VAT_RATE = 0.3;

export type TaxState =
    | 'domestic'        // shipped within Norway: MVA added at checkout, no border
    | 'vatIncluded'     // registered here and under the limit: price is final
    | 'vatOnDelivery'   // registered here but over the limit: customs bills it
    | 'noVatCollected'  // not registered here: customs may bill it
    | 'unknown';        // basePriceEur no longer agrees with Shopify

export interface TaxSummary {
    state: TaxState;
    countryName: string | null;
    /** The part of the subtotal that is tax, when any of it is. */
    vatInSubtotal: { amount: number; currencyCode: string } | null;
}

/*
 * The untaxed price of a SKU. It exists only for the EUR market: every other
 * market we sell through prices a single country, so its price is whatever
 * Shopify says and there is no second country to measure a gap against.
 */
function _basePriceEur(sku: string): number | null {
    const product = cartState.products[sku];
    if (!product || product.price.currencyCode !== 'EUR') return null;
    return PRODUCTS[sku]?.basePriceEur ?? null;
}

/*
 * The goods value of the consignment, which is what the IOSS limit is measured
 * against — not the tax-inclusive total, and not counting shipping.
 */
function _goodsTotalEur(): number | null {
    if (cartState.lines.length === 0) return null;
    let amount = 0;
    for (const line of cartState.lines) {
        const base = _basePriceEur(line.sku);
        if (base === null) return null;
        amount += base * line.qty;
    }
    return amount;
}

/*
 * How much VAT Shopify folded into this country's prices, read straight off the
 * gap between what it charges and what the goods cost untaxed. Zero means we
 * are not registered in that country. Null means we cannot tell: either there
 * is no base to compare against, or the gap is not the shape of a VAT rate,
 * which means basePriceEur has drifted from Shopify and we would rather say
 * nothing than state a rate that is wrong.
 */
function _vatRate(): number | null {
    for (const line of cartState.lines) {
        const base = _basePriceEur(line.sku);
        const price = cartState.products[line.sku]?.price;
        if (base === null || !price) continue;
        const rate = price.amount / base - 1;
        if (rate === 0) return 0;
        if (rate < MIN_VAT_RATE || rate > MAX_VAT_RATE) return null;
        return rate;
    }
    return null;
}

/*
 * Over the limit Shopify drops the VAT again at checkout, so its tax-inclusive
 * price would promise a total the buyer never pays. Lines and subtotal both go
 * through this, so the panel keeps adding up whichever side of the limit it is.
 */
function _vatDroppedAtCheckout(): boolean {
    const goodsTotal = _goodsTotalEur();
    if (goodsTotal === null || goodsTotal <= IOSS_GOODS_LIMIT_EUR) return false;
    const rate = _vatRate();
    return rate !== null && rate > 0;
}

/*
 * What, if anything, this buyer still owes after they click through. Shopify
 * folds VAT into the price for countries we are registered in and leaves it off
 * everywhere else, so the gap between its price and our untaxed one settles the
 * question without us keeping a list of countries anywhere.
 */
export function taxSummary(): TaxSummary {
    const countryName = cartState.countries.find((c) => c.isoCode === cartState.country)?.name ?? null;
    const summary: TaxSummary = { state: 'noVatCollected', countryName, vatInSubtotal: null };

    if (cartState.country === SHIP_FROM) return { ...summary, state: 'domestic' };

    // No base to compare against means a single-country market, which is a
    // market we hold no registration in.
    const goodsTotal = _goodsTotalEur();
    if (goodsTotal === null) return summary;

    const rate = _vatRate();
    if (rate === null) return { ...summary, state: 'unknown' };
    if (rate === 0) return summary;

    // Over the limit the subtotal has already dropped to the untaxed goods, so
    // there is no tax inside it — what customs bills is between them and the
    // buyer, and we do not know their shipping to guess at it.
    if (goodsTotal > IOSS_GOODS_LIMIT_EUR) return { ...summary, state: 'vatOnDelivery' };

    // Under the limit Shopify's price is what the buyer pays, so the tax inside
    // it is the exact difference from the untaxed goods — no rounding a rate.
    let taxedTotal = 0;
    for (const line of cartState.lines) {
        taxedTotal += (cartState.products[line.sku]?.price.amount ?? 0) * line.qty;
    }
    return {
        ...summary,
        state: 'vatIncluded',
        vatInSubtotal: { amount: taxedTotal - goodsTotal, currencyCode: 'EUR' },
    };
}

// ---------------------------------------------------------------------------
// Read helpers — plain arithmetic over the price map
// ---------------------------------------------------------------------------

export function cartCount(): number {
    return cartState.lines.reduce((sum, line) => sum + line.qty, 0);
}

export function unitPrice(sku: string) {
    const price = cartState.products[sku]?.price ?? null;
    if (!price || !_vatDroppedAtCheckout()) return price;
    const base = _basePriceEur(sku);
    return base === null ? price : { amount: base, currencyCode: price.currencyCode };
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
