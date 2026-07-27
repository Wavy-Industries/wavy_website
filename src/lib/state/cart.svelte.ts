import { track, TRACKING_EVENT_TYPES } from '~/lib/api/tracking.js';
import { getProduct } from '~/lib/config/products';

export interface CartItem {
    sku: string;
    name: string;
    qty: number;
}

function productCodeFor(sku: string): string {
    return getProduct(sku)?.productCode ?? sku;
}

const STORAGE_KEY = 'wavy_cart_v1';
const MAX_QTY = 10;

export const cart = $state<{ items: CartItem[]; popupOpen: boolean; popupReason: 'add' | 'manual' | null }>({
    items: [],
    popupOpen: false,
    popupReason: null,
});

let initialized = false;

function load(): CartItem[] {
    if (typeof localStorage === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((i) => i && typeof i.sku === 'string' && typeof i.name === 'string' && Number.isFinite(i.qty))
            .map((i) => ({ sku: i.sku, name: i.name, qty: clampQty(i.qty) }));
    } catch {
        return [];
    }
}

function persist() {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cart.items));
    } catch {}
}

function clampQty(q: number): number {
    const n = Math.floor(Number(q));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(MAX_QTY, n);
}

function emit(event: string, payload?: Record<string, unknown>) {
    track(event, { ...payload, cart_size: cartCount() });
}

export function cartInit() {
    if (initialized) return;
    initialized = true;
    cart.items = load();
}

export function cartAdd(sku: string, name: string, qty = 1, cta?: string) {
    const existing = cart.items.find((i) => i.sku === sku);
    if (existing) {
        existing.qty = clampQty(existing.qty + qty);
    } else {
        cart.items.push({ sku, name, qty: clampQty(qty) });
    }
    persist();
    emit(TRACKING_EVENT_TYPES.cart_add, {
        code: productCodeFor(sku),
        qty,
        ...(cta ? { cta } : {}),
    });
}

export function cartUpdate(sku: string, qty: number) {
    const item = cart.items.find((i) => i.sku === sku);
    if (!item) return;
    if (qty <= 0) {
        cartRemove(sku);
        return;
    }
    const previousQty = item.qty;
    item.qty = clampQty(qty);
    persist();
    emit(TRACKING_EVENT_TYPES.cart_update, {
        code: productCodeFor(sku),
        qty: item.qty,
        qty_delta: item.qty - previousQty,
    });
}

export function cartRemove(sku: string) {
    const idx = cart.items.findIndex((i) => i.sku === sku);
    if (idx < 0) return;
    const removed = cart.items.splice(idx, 1)[0];
    persist();
    emit(TRACKING_EVENT_TYPES.cart_remove, {
        code: productCodeFor(sku),
        qty_removed: removed.qty,
    });
}

export function cartClear() {
    if (cart.items.length === 0) return;
    cart.items = [];
    persist();
    emit(TRACKING_EVENT_TYPES.cart_clear);
}

export function cartCount(): number {
    return cart.items.reduce((sum, i) => sum + i.qty, 0);
}

export function openCart(reason: 'manual' | 'add' = 'manual') {
    cart.popupReason = reason;
    cart.popupOpen = true;
}

export function closeCart() {
    cart.popupOpen = false;
    cart.popupReason = null;
}
