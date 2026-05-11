<script>
    import { onMount } from 'svelte';
    import { cart, cartInit, cartCount, openCart, closeCart } from '~/lib/state/cart.svelte';

    onMount(() => {
        cartInit();
    });

    let count = $derived(cartCount());
    let hasItems = $derived(count > 0);

    function toggle() {
        if (cart.popupOpen) closeCart();
        else openCart('manual');
    }
</script>

<button class="cart-icon" class:full={hasItems} aria-label={hasItems ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart, empty'} onclick={toggle}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="9" cy="20" r="1.4"></circle>
        <circle cx="18" cy="20" r="1.4"></circle>
        <path d="M2 3h3l2.4 12.1a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21.5 7H6"></path>
    </svg>
    {#if hasItems}
        <span class="badge">{count}</span>
    {/if}
</button>

<style>
    .cart-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: white;
        color: black;
        border: 1px solid #ccc;
        padding: 5px 9px;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        line-height: 1;
        font-style: normal;
    }
    .cart-icon:hover {
        background: #f5f5f5;
    }
    .cart-icon.full {
        background: #ff7a1a;
        color: white;
        border-color: #ff7a1a;
    }
    .cart-icon.full:hover {
        background: #ff8a35;
    }
    .badge {
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
        min-width: 14px;
        text-align: center;
    }
</style>
