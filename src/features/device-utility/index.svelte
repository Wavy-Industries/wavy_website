<script>
    import ConnectView from '~/features/device-utility/views/ConnectView.svelte';
    import ConnectedView from '~/features/device-utility/views/ConnectedView.svelte';
    import { bluetoothState } from '~/features/device-utility/stores/bluetooth.svelte';
    // Import MIDI router for side effects so connected devices always play sound
    import '~/features/device-utility/stores/midiRouter.svelte';
</script>

<section style="flex-grow: 2; display: flex; flex-direction: column; align-items: center;">
    {#if bluetoothState.connectionState == 'disconnected' || bluetoothState.connectionState == 'connecting'}
        <ConnectView />
    {:else}
        <ConnectedView />
    {/if}
</section>
