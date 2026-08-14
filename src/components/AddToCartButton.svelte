<script>
    import { onMount } from 'svelte';
    import { cartState, initCart, addToCart } from '~/lib/state/cart.svelte';
    import { formatShopifyPrice } from '~/lib/utils/shopify-util.js';

    let { sku, cta = 'hero', priceClass = 'monkey-price' } = $props();

    onMount(() => {
        initCart();
    });

    // The same page-load fetch that fills the panel fills this label.
    let price = $derived.by(() => {
        const product = cartState.products[sku];
        return product ? formatShopifyPrice(product.price.currencyCode, product.price.amount) : '';
    });
</script>

<button class="atc" onclick={() => addToCart(sku, 1, cta)} type="button">
    <span class="label">
        <span>Add to cart</span>
        <span class="{priceClass} atc-price" class:atc-price--loading={!price}>{price}</span>
    </span>
</button>

<style>
    .atc {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 9px 18px;
        font: inherit;
        font-size: 13px;
        font-weight: 400;
        font-style: normal;
        letter-spacing: 0.02em;
        border: 0;
        cursor: pointer;
        background-color: var(--buy-color);
        color: #111;
        transition: background-color 0.15s;
    }

    .atc:hover {
        background-color: var(--buy-color-hover);
    }
    .label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
    }
    :global(.atc-price) {
        display: inline-block;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
    :global(.atc-price--loading) {
        position: relative;
        min-width: 4ch;
        color: transparent;
    }
    :global(.atc-price--loading::before) {
        content: '';
        display: inline-block;
        width: 100%;
        height: 0.8em;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0.2) 100%);
        background-size: 200% 100%;
        animation: atc-price-shimmer 1.1s infinite;
    }
    @keyframes atc-price-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
    }
</style>
