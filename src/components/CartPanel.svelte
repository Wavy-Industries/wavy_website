<script>
    import { onMount } from 'svelte';
    import {
        cartState,
        initCart,
        closeCart,
        setQuantity,
        removeLine,
        chooseCountry,
        startCheckout,
        cartHasPreorder,
        linePrice,
        subtotal,
        taxSummary,
        MAX_QTY,
    } from '~/lib/state/cart.svelte';
    import { formatShopifyPrice } from '~/lib/utils/shopify-util.js';
    import { PRODUCTS } from '~/lib/config/products';
    import { routes } from '~/routes';

    onMount(() => {
        initCart();
    });

    $effect(() => {
        if (!cartState.open) return;
        function onKey(e) {
            if (e.key === 'Escape') closeCart();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    let total = $derived(subtotal());
    let taxes = $derived(taxSummary());
    let canCheckout = $derived(
        cartState.lines.length > 0 &&
        !cartState.loading &&
        !cartState.checkingOut &&
        cartState.lines.every((l) => cartState.products[l.sku]?.available)
    );

    function price(money) {
        return money ? formatShopifyPrice(money.currencyCode, money.amount) : '—';
    }

    // Every tax state reads as one value on the VAT line; only one of them
    // leaves the buyer with something still to pay, so only one carries a note.
    let vat = $derived.by(() => {
        switch (taxes.state) {
            case 'vatIncluded':
                return { value: `${price(taxes.vatInSubtotal)} included`, note: null };
            case 'vatOnDelivery':
                return { value: 'collected on delivery', note: null };
            case 'noVatCollected':
                return {
                    value: 'not collected',
                    note: `${taxes.countryName ?? 'Your country'} may charge import VAT on arrival.`,
                };
            case 'domestic':
            case 'unknown':
                return { value: 'calculated at checkout', note: null };
        }
    });
</script>

{#if cartState.open}
    <div class="scrim" role="presentation" onclick={closeCart}></div>

    <aside class="panel" role="dialog" aria-modal="true" aria-label="Cart">
        <header>
            <h2>Cart</h2>
            <button class="close" onclick={closeCart} aria-label="Close cart">×</button>
        </header>

        <div class="body">
            {#if cartState.lines.length === 0}
                <p class="quiet">Your cart is empty.</p>
                <a href={routes.monkey} onclick={closeCart}>Browse MONKEY</a>
            {:else}
                <ul class="lines">
                    {#each cartState.lines as line (line.sku)}
                        <li>
                            <div class="name">
                                <span>{PRODUCTS[line.sku]?.displayName ?? line.sku}</span>
                                {#if PRODUCTS[line.sku]?.preorder}
                                    <span class="tag">Pre-order</span>
                                {/if}
                                {#if cartState.products[line.sku]?.available === false}
                                    <span class="tag out">Sold out</span>
                                {/if}
                            </div>
                            <div class="meta">
                                <div class="qty">
                                    <button
                                        onclick={() => setQuantity(line.sku, line.qty - 1)}
                                        aria-label="Decrease quantity">−</button>
                                    <span>{line.qty}</span>
                                    <button
                                        onclick={() => setQuantity(line.sku, line.qty + 1)}
                                        disabled={line.qty >= MAX_QTY}
                                        aria-label="Increase quantity">+</button>
                                </div>
                                <span class="total">{price(linePrice(line))}</span>
                                <button class="remove" onclick={() => removeLine(line.sku)}>Remove</button>
                            </div>
                        </li>
                    {/each}
                </ul>

                <div class="summary">
                    <div class="subtotal">
                        <span>Subtotal</span>
                        <span>{price(total)}</span>
                    </div>
                    <div class="summaryLine">
                        <span>VAT</span>
                        <span>{vat.value}</span>
                    </div>

                    {#if vat.note}
                        <p class="quiet">{vat.note}</p>
                    {/if}

                    <p class="quiet">Ships worldwide from Norway, 4–12 business days.</p>
                </div>

                {#if cartHasPreorder()}
                    <div class="preorder">
                        <span class="tag">Pre-order</span>
                        <p>
                            Estimated shipping Q3 2026. Nothing ships until every item is ready, and you can
                            cancel for a full refund any time before it does.
                        </p>
                    </div>
                {/if}
            {/if}

            {#if cartState.error}
                <p class="error" role="alert">{cartState.error}</p>
            {/if}
        </div>

        {#if cartState.lines.length > 0}
            <footer>
                <button
                    class="checkout"
                    class:busy={cartState.checkingOut}
                    onclick={startCheckout}
                    disabled={!canCheckout}
                >
                    {#if cartState.checkingOut}
                        <span class="spinner" aria-hidden="true"></span>
                        Opening checkout…
                    {:else}
                        Proceed to checkout
                    {/if}
                </button>
                <p class="trust">Secure checkout · Cards, Apple Pay, Google Pay, PayPal</p>
                {#if cartState.countries.length > 0}
                    <label class="country">
                        <span>Prices for</span>
                        <select
                            value={cartState.country ?? ''}
                            disabled={cartState.loading}
                            onchange={(e) => chooseCountry(e.currentTarget.value)}
                        >
                            {#each cartState.countries as c (c.isoCode)}
                                <option value={c.isoCode}>{c.name}</option>
                            {/each}
                        </select>
                    </label>
                {/if}
            </footer>
        {/if}
    </aside>
{/if}

<style>
    .scrim {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.35);
        z-index: 99;
    }

    .panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        z-index: 100;
        width: 380px;
        max-width: 100vw;
        background: #fff;
        color: #111;
        display: flex;
        flex-direction: column;
        font-family: inherit;
        font-size: 14px;
        font-style: normal;
    }

    header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 20px 14px;
        border-bottom: 1px solid #e6e6e6;
    }

    h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
    }

    .close {
        background: none;
        border: 0;
        font: inherit;
        font-size: 24px;
        line-height: 1;
        color: #888;
        cursor: pointer;
        padding: 0 2px;
    }

    .close:hover {
        color: #111;
    }

    .body {
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .lines {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    .lines li {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px 0;
    }

    .lines li + li {
        border-top: 1px solid #eee;
    }

    .lines li:first-child {
        padding-top: 0;
    }

    .name {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        font-weight: 500;
    }

    .meta {
        display: flex;
        align-items: center;
        gap: 14px;
    }

    .tag {
        padding: 2px 6px;
        background: #ffcc00;
        color: #1a1a1a;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.3px;
        white-space: nowrap;
    }

    .tag.out {
        background: #ffd9d0;
        color: #8a2b12;
    }

    .qty {
        display: flex;
        align-items: center;
        gap: 2px;
    }

    .qty button {
        width: 26px;
        height: 26px;
        padding: 0;
        border: 1px solid #ccc;
        background: #fff;
        font: inherit;
        font-size: 15px;
        line-height: 1;
        cursor: pointer;
    }

    .qty button:hover:not(:disabled) {
        background: #f2f2f2;
    }

    .qty button:disabled {
        opacity: 0.4;
        cursor: default;
    }

    .qty span {
        min-width: 26px;
        text-align: center;
        font-variant-numeric: tabular-nums;
    }

    .total {
        margin-left: auto;
        font-variant-numeric: tabular-nums;
    }

    .remove {
        background: none;
        border: 0;
        padding: 0;
        font: inherit;
        font-size: 12px;
        color: #888;
        text-decoration: underline;
        cursor: pointer;
    }

    .remove:hover {
        color: #111;
    }

    .summary {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 16px;
        border-top: 1px solid #e6e6e6;
    }

    .subtotal {
        display: flex;
        justify-content: space-between;
        font-size: 16px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
    }

    .summaryLine {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 13px;
        color: #555;
        font-variant-numeric: tabular-nums;
    }

    .quiet {
        margin: 0;
        font-size: 12px;
        color: #666;
        line-height: 1.5;
    }

    .body a {
        font-style: normal;
        align-self: flex-start;
    }

    .preorder {
        display: flex;
        gap: 10px;
        align-items: flex-start;
    }

    .preorder p {
        margin: 0;
        font-size: 12px;
        color: #666;
        line-height: 1.5;
    }

    .error {
        margin: 0;
        font-size: 13px;
        color: #b3261e;
    }

    footer {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 16px 20px;
        border-top: 1px solid #e6e6e6;
    }

    .checkout {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 0;
        padding: 15px 20px;
        background: var(--buy-color);
        color: #111;
        font: inherit;
        font-size: 14px;
        letter-spacing: 0.02em;
        cursor: pointer;
    }

    .checkout:hover:not(:disabled) {
        background: var(--buy-color-hover);
    }

    .checkout:disabled {
        opacity: 0.5;
        cursor: default;
    }

    .checkout.busy {
        opacity: 1;
    }

    .spinner {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid rgba(17, 17, 17, 0.25);
        border-top-color: #111;
        animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .trust {
        margin: 0;
        text-align: center;
        font-size: 11px;
        color: #666;
    }

    .country {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 11px;
        color: #666;
    }

    .country select {
        font: inherit;
        font-size: 11px;
        color: #333;
        background: #fff;
        border: 1px solid #ddd;
        padding: 3px 4px;
        max-width: 60%;
    }

    @media (max-width: 520px) {
        .panel {
            width: 100vw;
        }
    }
</style>
