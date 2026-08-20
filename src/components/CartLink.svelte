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

<!-- The bag is inlined rather than <img>-ed so its outline can follow the
     header's text colour and the bag can fill green once something is in it. -->
<a
    class="cart-link"
    class:full={count > 0}
    href={CART_HASH}
    aria-label={count > 0 ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart, empty'}
    onclick={toggle}
>
    <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
    >
        <path class="bag" d="M4.5 7.5h15l-1.1 12.2a1.5 1.5 0 0 1-1.5 1.3H7.1a1.5 1.5 0 0 1-1.5-1.3L4.5 7.5Z" />
        <path d="M8.5 7.5V6.5a3.5 3.5 0 0 1 7 0v1" />
        {#if count > 0}
            <text class="count" class:wide={count > 9} x="12" y="17.6" text-anchor="middle">{count > 9 ? '9+' : count}</text>
        {/if}
    </svg>
</a>

<style>
    .cart-link {
        display: inline-block;
        background: none;
        border: 0;
        padding: 0;
        margin: 0;
        cursor: pointer;
        color: inherit;
        text-decoration: none;
    }
    .cart-link svg {
        display: block;
        /* The nav aligns on the text baseline; nudge the icon down so it sits
           optically centred against the neighbouring links. */
        margin-bottom: -5px;
        /* Swings from the handle rather than spinning about its middle. */
        transform-origin: 50% 15%;
    }
    .cart-link:hover svg {
        animation: cart-shake 380ms ease-in-out;
    }

    @keyframes cart-shake {
        0%, 100% { transform: rotate(0deg); }
        20% { transform: rotate(-10deg); }
        40% { transform: rotate(8deg); }
        60% { transform: rotate(-5deg); }
        80% { transform: rotate(3deg); }
    }

    @media (prefers-reduced-motion: reduce) {
        .cart-link:hover svg {
            animation: none;
        }
        .cart-link:hover {
            opacity: 0.6;
        }
    }

    .bag {
        fill: transparent;
        transition: fill 120ms ease-out;
    }
    /* Light green, so the dark quantity digit reads against it on both the
       light and the dark header. */
    .cart-link.full .bag {
        fill: #77e77e;
    }

    .count {
        stroke: none;
        fill: #062d12;
        font-family: inherit;
        font-size: 9.5px;
        font-weight: 700;
        font-style: normal;
    }
    /* Two characters need to give the bag walls some room. */
    .count.wide {
        font-size: 8px;
    }
</style>
