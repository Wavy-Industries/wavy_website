<script>
    // Dev Mode Feature:
    // - Type "enable dev mode" in the browser console to show the Device Tester tab
    // - Type "disable dev mode" to hide it
    // - Dev mode state persists in localStorage
    // - The Device Tester allows testing Bluetooth MIDI functionality with the WAVY MONKEY device
    
    import { bluetoothManager, bluetoothState } from '~/features/device-utility/stores/bluetooth.svelte';
    import ConnectionStatus from '~/features/device-utility/components/ConnectionStatus.svelte';
    import DeviceUpdate from '~/features/device-utility/views/DeviceUpdate.svelte';
    import DeviceSampleManager from '~/features/device-utility/views/DeviceSampleManager.svelte';
    import DeviceTester from '~/features/device-utility/views/DeviceTester.svelte';
    import { imageState } from '~/features/device-utility/stores/image.svelte';
    import { devMode } from '~/features/device-utility/stores/devmode.svelte';
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import ActionStatus from '~/features/device-utility/components/ActionStatus.svelte';
    import { sampleState } from '~/features/device-utility/stores/samples.svelte';
    import { deviceUtilityView, DeviceUtilityView, initDeviceUtilityView } from '~/features/device-utility/stores/view.svelte';

    onMount(() => {
        initDeviceUtilityView();
    });
</script>

<div>
    <nav>
        <div>
            <button onclick={() => {bluetoothManager.disconnect(); window.location.reload()}}>
                <i class="bi-bluetooth-disconnect"></i>
                disconnect
            </button>
            <span>{bluetoothState.deviceName}</span>
            <ConnectionStatus />
                <span>v{imageState?.firmwareVersion?.versionString ?? '?.?.?'}</span>
            <ActionStatus />
            {#if $devMode}
                <span class="dev-indicator" title="Dev mode active - type 'disable dev mode' in console to disable">🔧</span>
            {/if}
        </div>
        <div>
            <a href="#device-update" class={deviceUtilityView.current === DeviceUtilityView.DeviceUpdate ? 'active' : ''}>Device Update</a>
            <a 
                href="#sample-manager" 
                class={deviceUtilityView.current === DeviceUtilityView.SampleManager ? 'active' : ''}
                class:disabled={!sampleState.isSupported}
                onclick={e => sampleState.isSupported == false && e.preventDefault()}
                title={!sampleState.isSupported ? "firmware version 1.2.0 or greater is required" : ""}
            >
                Sample Manager
            </a>
            {#if $devMode}
                <a 
                    href="#device-tester" 
                    class={deviceUtilityView.current === DeviceUtilityView.DeviceTester ? 'active' : ''}
                >
                    Device Tester
                </a>
            {/if}
        </div>
    </nav>

    {#if deviceUtilityView.current === DeviceUtilityView.DeviceUpdate}
    <div in:fade={{ duration: 200 }}>
        <DeviceUpdate />
    </div>
    {:else if deviceUtilityView.current === DeviceUtilityView.SampleManager}
        <div in:fade={{ duration: 200 }}>
            <DeviceSampleManager />
        </div>
    {:else if deviceUtilityView.current === DeviceUtilityView.DeviceTester}
        <div in:fade={{ duration: 200 }}>
            <DeviceTester />
        </div>
    {/if}
</div>


<style>
    nav {
        background-color: white;
        display: flex;
        flex-direction: row;
        align-items: center;
        padding: 20px;
        justify-content: space-between;
        width: 100vw;
        flex-wrap: wrap;
        border-top: 2px solid rgba(0,0,0,0.1);
        border-bottom: 2px solid rgba(0,0,0,0.1);
    }

    nav > div {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 20px;
    }

    nav a:hover {
        text-decoration: none;
    }

    .active {
        border-bottom: 2px solid gray;
    }

    a.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        position: relative;
    }

    .dev-indicator {
        font-size: 1.2em;
        opacity: 0.7;
        cursor: help;
    }
</style>
