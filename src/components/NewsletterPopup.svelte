<script>
    import { newsletterUI, closeNewsletter } from '~/lib/state/newsletter.svelte';
    import { track, TRACKING_EVENT_TYPES } from '~/lib/api/tracking.js';

    const API_BASE = import.meta.env.MODE === 'development'
        ? 'http://localhost:8000'
        : 'https://server.wavyindustries.com';

    let email = $state('');
    let status = $state('idle'); // 'idle' | 'loading' | 'success'
    let errorMsg = $state('');
    let successFinal = $state(false);

    async function submit(e) {
        e.preventDefault();
        if (status === 'loading') return;
        const trimmed = email.trim();
        if (!trimmed) return;
        errorMsg = '';
        status = 'loading';
        try {
            const res = await fetch(API_BASE + '/api/newsletter/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmed }),
            });
            if (!res.ok) throw new Error('signup failed');
            try { track(TRACKING_EVENT_TYPES.newsletter_subscribe, { source: 'header' }); } catch {}
            status = 'success';
            successFinal = false;
            setTimeout(() => {
                successFinal = true;
                setTimeout(close, 3000);
            }, 2000);
        } catch {
            status = 'idle';
            errorMsg = 'Something went wrong. Try again.';
        }
    }

    function close() {
        closeNewsletter();
        // reset for next time after fade-out
        setTimeout(() => {
            status = 'idle';
            email = '';
            errorMsg = '';
            successFinal = false;
        }, 200);
    }
</script>

{#if newsletterUI.popupOpen}
    <div class="popup" role="dialog" aria-label="Newsletter signup">
        <div class="head">
            <span class="title">Newsletter</span>
            <button class="close" type="button" onclick={close} aria-label="Close">×</button>
        </div>

        {#if status === 'success'}
            <p class="success">{successFinal ? 'stay tuned..' : 'wonderful :)'}</p>
        {:else}
            <p class="intro">Stay up to date with new releases and other updates.</p>
            <form onsubmit={submit}>
                <input type="email" name="email" autocomplete="email" placeholder="email@example.com" bind:value={email} disabled={status === 'loading'} />
                <button type="submit" disabled={status === 'loading' || !email.trim()}>Subscribe</button>
            </form>
            {#if errorMsg}
                <p class="error">{errorMsg}</p>
            {/if}
        {/if}
    </div>
{/if}

<style>
    .popup {
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

    .intro {
        margin: 0 0 10px;
        color: #555;
        font-size: 13px;
    }

    form {
        display: flex;
        align-items: stretch;
        height: 32px;
        background: white;
        border: 1px solid #ccc;
    }

    input {
        flex: 1 1 auto;
        height: 100%;
        box-sizing: border-box;
        border: 0;
        padding: 0 10px;
        font-size: 14px;
        font-weight: 400;
        color: black;
        background: white;
        outline: none;
        font-family: inherit;
        min-width: 0;
    }

    input::placeholder {
        color: #999;
    }

    input:disabled {
        color: #888;
        background: #f5f5f5;
    }

    form button {
        height: 100%;
        box-sizing: border-box;
        border: 0;
        border-left: 1px solid #ccc;
        background: white;
        color: black;
        font-size: 14px;
        font-weight: 400;
        padding: 0 12px;
        cursor: pointer;
        font-family: inherit;
    }

    form button:hover:not(:disabled) {
        background: #f0f0f0;
    }

    form button:disabled {
        color: #888;
        background: #f5f5f5;
        cursor: default;
    }

    .success {
        margin: 0;
        font-style: italic;
        color: #111;
    }

    .error {
        margin: 8px 0 0;
        color: #c33;
        font-size: 12px;
    }
</style>
