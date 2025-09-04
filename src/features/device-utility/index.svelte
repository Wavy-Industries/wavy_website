<script>
    import {onMount} from 'svelte';
    import ConnectView from '~/features/device-utility/views/ConnectView.svelte';
    import Dashboard from '~/features/device-utility/views/Dashboard.svelte';
    import { bluetoothState } from '~/features/device-utility/states/bluetooth.svelte';

    import { loadDevMode } from '~/features/device-utility/states/devmode.svelte';

    onMount(() => loadDevMode())

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
