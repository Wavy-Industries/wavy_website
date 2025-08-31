<script>
    import { bluetoothManager, bluetoothState } from '~/features/device-utility/stores/bluetooth.svelte';
    import ConnectionStatus from '~/features/device-utility/components/ConnectionStatus.svelte';
    import DeviceUpdate from '~/features/device-utility/views/DeviceUpdate.svelte';
    import DeviceSampleManager from '~/features/device-utility/views/DeviceSampleManager.svelte';
    import DeviceTester from '~/features/device-utility/views/DeviceTester.svelte';
    import { firmwareState } from '~/features/device-utility/stores/firmware.svelte';
    import { firmwareRhsIsNewer } from '~/lib/bluetooth/mcumgr/FirmwareManager';
    import { devMode } from '~/features/device-utility/stores/devmode.svelte';
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import ActionStatus from '~/features/device-utility/components/ActionStatus.svelte';
    import { sampleState } from '~/features/device-utility/stores/samples.svelte';
    import { deviceUtilityView, DeviceUtilityView, initDeviceUtilityView } from '~/features/device-utility/stores/view.svelte';

    onMount(async () => {
        initDeviceUtilityView();

        isLoading = true;
        await waitForInitialData();
        isLoading = false;
    });

    // Loading overlay while fetching initial device info
    let isLoading = $state(false);

    async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    async function waitForInitialData(timeoutMs = 1500) {
        const start = Date.now();
        // Ready when firmware known AND (samples unsupported OR basic sample info fetched)
        while (Date.now() - start < timeoutMs) {
            const fwReady = firmwareState?.firmwareVersion != null;
            const samplesUnsupported = sampleState.isSupported === false && sampleState.isset === null && sampleState.names === null;
            const samplesReady = sampleState.isSupported === true && sampleState.names != null && sampleState.storageUsed != null && sampleState.storageTotal != null;
            if (fwReady && (samplesUnsupported || samplesReady)) return true;
            await wait(100);
        }
        return false; // timeout
    }

    // Indicators for upgrade/downgrade availability
    const upgradeAvailable = $derived.by(() => {
        const fw = firmwareState?.firmwareVersion;
        const rel = firmwareState?.changelog?.release;
        if (!fw || !rel) return false;
        return firmwareRhsIsNewer(fw, rel);
    });
    const downgradeAvailable = $derived.by(() => {
        const fw = firmwareState?.firmwareVersion;
        const rel = firmwareState?.changelog?.release;
        if (!fw || !rel) return false;
        // fw > rel → downgrade available
        return firmwareRhsIsNewer(rel, fw);
    });
    const needsUpdateAttention = $derived(upgradeAvailable || downgradeAvailable);
    const isUpdateTabActive = $derived(deviceUtilityView.current === DeviceUtilityView.DeviceUpdate);

    // $effect(async() => {
    //     if (bluetoothState.connectionState === 'connected') {
    //         isLoading = true;
    //         await waitForInitialData();
    //         isLoading = false;
    //     } else {
    //         isLoading = false;
    //     }
    // });
</script>

<div>
    {#if !isLoading}
    <nav>
      <div class="nav-inner">
        <div>
            <button onclick={() => {bluetoothManager.disconnect(); window.location.reload()}}>
                <i class="bi-bluetooth-disconnect"></i>
                disconnect
            </button>
            <span>{bluetoothState.deviceName}</span>
            <ConnectionStatus />
                <span>v{firmwareState?.firmwareVersion?.versionString ?? '?.?.?'}</span>
            <ActionStatus />
            {#if $devMode}
                <span class="dev-indicator" title="Dev mode active - type 'disable dev mode' in console to disable">🔧</span>
            {/if}
        </div>
        <div>
            <a 
                href="#playground" 
                class={deviceUtilityView.current === DeviceUtilityView.Playground ? 'active' : ''}
            >
                Playground
            </a>
            <span class={`tab-with-badge ${needsUpdateAttention && !isUpdateTabActive ? 'blink-update' : ''}`}>
              <a href="#device-update" class={deviceUtilityView.current === DeviceUtilityView.DeviceUpdate ? 'active' : ''}>
                  Device Update
              </a>
              {#if needsUpdateAttention}
                  <span class="alert-dot" title={upgradeAvailable ? 'Upgrade available' : 'Downgrade available'}>!</span>
              {/if}
            </span>
            <a 
                href="#sample-manager" 
                class={`blink ${deviceUtilityView.current === DeviceUtilityView.SampleManager ? 'active' : ''}`}
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
      </div>
    </nav>
    {/if}
    {#if isLoading}
      <div class="loading" in:fade={{ duration: 100 }}>
          <div class="spinner"></div>
          <div>Fetching device info…</div>
      </div>
    {:else if deviceUtilityView.current === DeviceUtilityView.DeviceUpdate}
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
    {:else if deviceUtilityView.current === DeviceUtilityView.Playground}
        <div in:fade={{ duration: 200 }}>
            {#await import('~/features/device-utility/views/Playground.svelte') then Mod}
              {@const Comp = Mod.default}
              <Comp />
            {/await}
        </div>
    {/if}
</div>


<style>
    nav {
        background-color: white;
        display: flex;
        flex-direction: row;
        align-items: center;
        padding: 16px 20px;
        justify-content: space-between;
        width: 100vw;
        flex-wrap: wrap;
        border-top: 1px solid var(--du-border);
        border-bottom: 1px solid var(--du-border);
    }
    .nav-inner {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        max-width: var(--du-maxw, 1100px);
        margin: 0 auto;
        padding: 0 16px; /* match page content gutter */
        gap: 12px;
    }

    .nav-inner > div {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 20px;
    }

    /* Keep badge tight and centered with the tab text */
    .tab-with-badge { display: inline-flex; align-items: center; gap: 3px; }

    nav a:hover {
        text-decoration: none;
    }

    nav a {
        padding: 6px 10px;
        color: inherit;
        border-bottom: 3px solid transparent;
        text-transform: uppercase;
        letter-spacing: .04em;
        font-size: 12px;
    }
    nav a.active {
        border-bottom-color: #2f313a;
        text-decoration: none;
    }
    nav a.blink:not(.active):not(.disabled) {
        animation: blink 1.5s infinite;
    }
    nav a.blink-update:not(.active):not(.disabled) { animation: blink-update 1.5s infinite; }
    .tab-with-badge.blink-update { animation: blink-update 1.5s infinite; }
    @keyframes blink {
        0%, 100% {  }
        50% { color: #FFB84D; transform: scale(1.05); }
    }
    @keyframes blink-update {
        0%, 100% { }
        50% { color: var(--du-success, #16a34a); transform: scale(1.05); }
    }
    nav a:hover:not(.active) { background: #f4f5f7; }

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

    /* Simple alert icon next to Device Update */
    .alert-dot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--du-success, #16a34a);
        color: #fff;
        font-size: 10px;
        font-weight: 900;
        line-height: 14px; /* visually center inside circle */
        vertical-align: middle; /* align with text baseline */
        transform: translateY(-1px); /* optical alignment with tab text */
    }

    .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        height: 40vh;
        color: #666;
    }
    .spinner {
        width: 24px;
        height: 24px;
        border: 3px solid #ddd;
        border-top-color: #888;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
</style>
