<script>
    import { onMount, onDestroy } from 'svelte';
    import ConnectView from '~/features/device-utility/views/ConnectView.svelte';
    import Dashboard from '~/features/device-utility/views/Dashboard.svelte';
    import { bluetoothState } from '~/lib/states/bluetooth.svelte';

    import { loadDevMode } from '~/features/device-utility/states/devmode.svelte';

    onMount(() => loadDevMode())

    const CONNECTED_CLASS = 'device-utility-connected';
    $effect(() => {
        if (typeof document === 'undefined') return;
        if (bluetoothState.connectionState === 'connected') {
            document.body.classList.add(CONNECTED_CLASS);
        } else {
            document.body.classList.remove(CONNECTED_CLASS);
        }
    });

    onDestroy(() => {
        if (typeof document === 'undefined') return;
        document.body.classList.remove(CONNECTED_CLASS);
    });

    import { callbacksSet } from '~/features/device-utility/eventRouter';
    callbacksSet()
</script>

<section style="flex-grow: 2; display: flex; flex-direction: column; align-items: center;">
    {#if bluetoothState.connectionState == 'disconnected' || bluetoothState.connectionState == 'connecting'}
        <ConnectView />
    {:else}
        <Dashboard />
    {/if}
</section>
