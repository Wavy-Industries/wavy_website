<script>
    import { openNewsletter } from '~/lib/state/newsletter.svelte';
</script>

<button class="newsletter-icon" type="button" aria-label="Newsletter signup" onclick={() => openNewsletter('header_popup')}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
</button>

<style>
    .newsletter-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: 0;
        padding: 0;
        margin: 0;
        cursor: pointer;
        color: inherit;
        opacity: 0.7;
    }
    .newsletter-icon:hover {
        opacity: 1;
    }
</style>
