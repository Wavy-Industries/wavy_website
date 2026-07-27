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

<button class="cart-link" class:full={hasItems} aria-label={hasItems ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart, empty'} onclick={toggle}>
    cart{#if hasItems}&nbsp;({count}){/if}
</button>

<style>
    .cart-link {
        background: none;
        border: 0;
        padding: 0;
        margin: 0;
        cursor: pointer;
        color: inherit;
        font: inherit;
        font-style: normal;
        letter-spacing: inherit;
        line-height: inherit;
        white-space: nowrap;
    }
    .cart-link:hover {
        text-decoration: underline;
    }
    .cart-link.full {
        color: #ff7a1a;
    }
</style>
