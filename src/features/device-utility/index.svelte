<script>
    import ConnectView from '~/features/device-utility/views/ConnectView.svelte';
    import ConnectedView from '~/features/device-utility/views/ConnectedView.svelte';
    import { bluetoothState } from '~/features/device-utility/stores/bluetooth.svelte';
    import { onMount } from 'svelte';
    import { initMidiRouter } from '~/features/device-utility/stores/midiRouter.svelte';
    import { initBluetoothStore } from '~/features/device-utility/stores/bluetooth.svelte';

    onMount(() => {
        // Wire store updates and global MIDI→sound routing once
        initBluetoothStore();
        initMidiRouter();
    });
</script>

<section style="flex-grow: 2; display: flex; flex-direction: column; align-items: center;">
    {#if bluetoothState.connectionState == 'disconnected' || bluetoothState.connectionState == 'connecting'}
        <ConnectView />
    {:else}
        <ConnectedView />
    {/if}
</section>
