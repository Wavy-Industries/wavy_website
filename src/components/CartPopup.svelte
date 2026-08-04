<script>
    import { onMount } from 'svelte';
    import { cart, cartInit, cartUpdate, cartRemove, cartCount, closeCart } from '~/lib/state/cart.svelte';
    import { isPreorder } from '~/lib/config/products';

    let hovered = $state(false);
    let timer = null;

    function clearTimer() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }

    onMount(() => {
        cartInit();
    });

    $effect(() => {
        clearTimer();
        if (cart.popupOpen && cart.popupReason === 'add' && !hovered) {
            timer = setTimeout(() => {
                if (!hovered) closeCart();
            }, 7000);
        }
        return clearTimer;
    });

    $effect(() => {
        if (!cart.popupOpen) return;
        function onKey(e) {
            if (e.key === 'Escape') closeCart();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    let count = $derived(cartCount());
</script>

{#if cart.popupOpen}
    <div class="backdrop" role="presentation" onclick={closeCart}></div>
    <div
        class="cart-popup"
        role="dialog"
        tabindex="-1"
        aria-label="Cart"
        onmouseenter={() => { hovered = true; clearTimer(); }}
        onmouseleave={() => { hovered = false; }}
    >
        <div class="head">
            <span class="title">Cart{count > 0 ? ` (${count})` : ''}</span>
            <button class="close" onclick={closeCart} aria-label="Close cart">×</button>
        </div>

        {#if cart.items.length === 0}
            <p class="empty">Your cart is empty.</p>
        {:else}
            <ul class="items">
                {#each cart.items as item (item.sku)}
                    <li>
                        <span class="name-wrap">
                            <span class="name">{item.name}</span>
                            {#if isPreorder(item.sku)}
                                <span class="preorder-tag">Pre-order</span>
                            {/if}
                        </span>
                        <div class="qty">
                            <button onclick={() => cartUpdate(item.sku, item.qty - 1)} aria-label="Decrease quantity">−</button>
                            <span class="qty-value">{item.qty}</span>
                            <button onclick={() => cartUpdate(item.sku, item.qty + 1)} aria-label="Increase quantity">+</button>
                            <button class="remove" onclick={() => cartRemove(item.sku)} aria-label="Remove item">×</button>
                        </div>
                    </li>
                {/each}
            </ul>
            <div class="actions">
                <button class="btn" onclick={closeCart}>Continue browsing</button>
                <a class="btn primary" href="/cart" onclick={closeCart}>Go to cart</a>
            </div>
        {/if}
    </div>
{/if}

<style>
    .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.35);
        z-index: 99;
        cursor: pointer;
    }

    .cart-popup {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 100;
        width: 320px;
        max-width: calc(100vw - 32px);
        background: white;
        color: black;
        border: 1px solid #d0d0d0;
        padding: 14px 16px;
        font-family: inherit;
        font-size: 14px;
        font-style: normal;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);
    }

    .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
    }

    .title {
        font-weight: 600;
    }

    .close {
        background: none;
        border: 0;
        font-size: 22px;
        line-height: 1;
        color: #888;
        cursor: pointer;
        padding: 0 2px;
        font-family: inherit;
    }

    .close:hover {
        color: #111;
    }

    .empty {
        margin: 0;
        color: #666;
        font-size: 13px;
    }

    .items {
        list-style: none;
        padding: 0;
        margin: 0 0 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .items li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
    }

    .name-wrap {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
    }

    .name {
        font-weight: 500;
    }

    .preorder-tag {
        display: inline-block;
        padding: 2px 6px;
        background-color: #ffcc00;
        color: #1a1a1a;
        font-size: 10px;
        font-weight: 600;
        font-style: normal;
        border-radius: 3px;
        letter-spacing: 0.3px;
    }

    .qty {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .qty button {
        background: white;
        border: 1px solid #ccc;
        width: 22px;
        height: 22px;
        padding: 0;
        cursor: pointer;
        font: inherit;
        font-size: 14px;
        line-height: 1;
    }

    .qty button:hover {
        background: #f5f5f5;
    }

    .qty-value {
        min-width: 18px;
        text-align: center;
        font-variant-numeric: tabular-nums;
    }

    .qty .remove {
        margin-left: 6px;
        color: #888;
        border-color: #ddd;
    }

    .actions {
        display: flex;
        gap: 8px;
    }

    .btn {
        flex: 1;
        padding: 8px 10px;
        border: 1px solid #ccc;
        background: white;
        color: black;
        text-align: center;
        text-decoration: none;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-style: normal;
    }

    .btn:hover {
        background: #f5f5f5;
    }

    .btn.primary {
        background: #57d865;
        color: #111;
        border-color: #57d865;
    }

    .btn.primary:hover {
        background: #48ce57;
        border-color: #48ce57;
    }
</style>
