<script>
    import { cartAdd } from '~/lib/state/cart.svelte';
    import { track } from '~/lib/api/tracking.js';

    let { sku, name, cta = 'hero', priceClass = 'monkey-price' } = $props();

    function handleClick() {
        cartAdd(sku, name, 1);
        track('click', { button: 'add_to_cart', sku, cta });
    }
</script>

<button class="atc" onclick={handleClick} type="button">
    <span class="label">
        <span>Add to cart</span>
        <span class="{priceClass} atc-price atc-price--loading" data-atc-price-for={sku}></span>
    </span>
</button>

<style>
    .atc {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 6px 10px;
        font: inherit;
        font-size: 14px;
        font-weight: 400;
        font-style: normal;
        background-color: rgb(8, 76, 207);
        color: white;
        border: 1px solid #a0bee9;
        cursor: pointer;
    }
    .atc:hover {
        background-color: blue;
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
