<script>
    import { onMount } from 'svelte';
    import { cartState, initCart, openCart, closeCart, cartCount, CART_HASH } from '~/lib/state/cart.svelte';

    onMount(() => {
        initCart();
    });

    let count = $derived(cartCount());

    function toggle(e) {
        // A real href, so it works before hydration and can be opened in a new
        // tab; the handler only takes over to avoid a scroll jump.
        e.preventDefault();
        if (cartState.open) closeCart();
        else openCart();
    }
</script>

<a
    class="cart-link"
    class:full={count > 0}
    href={CART_HASH}
    aria-label={count > 0 ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart, empty'}
    onclick={toggle}
>
    cart{#if count > 0}&nbsp;({count}){/if}
</a>

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
        text-decoration: none;
    }
    .cart-link:hover {
        text-decoration: underline;
    }
    .cart-link.full {
        color: var(--buy-color);
    }
</style>
