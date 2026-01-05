<script>
    import { batteryState, bluetoothManager, bluetoothState } from '~/lib/states/bluetooth.svelte';
    import ConnectionStatus from '~/features/device-utility/components/ConnectionStatus.svelte';
    import DeviceUpdate from '~/features/device-utility/views/DeviceUpdate.svelte';
    import DeviceSampleManager from '~/features/device-utility/views/DeviceSampleManager.svelte';
    import DeviceTester from '~/features/device-utility/views/DeviceTester.svelte';
    import { firmwareState } from '~/lib/states/firmware.svelte';
    import { firmwareRhsIsNewer } from '~/lib/bluetooth/smp/FirmwareManager';
    import { dev } from '~/features/device-utility/states/devmode.svelte';
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import { deviceSamplesState } from '~/lib/states/samples.svelte';
    import { SampleMode } from '~/lib/types/sampleMode';
    import { initDrumKits } from '~/features/device-utility/states/drumKits.svelte';
    import {  windowStateInit, windowState, DeviceUtilityView } from '~/features/device-utility/states/window.svelte';
    import { deviceState } from '~/features/device-utility/states/deviceState.svelte';

    onMount(async () => {
        windowStateInit();
        initDrumKits();

        isLoading = true;
        await waitForInitialData();
        isLoading = false;
    });

    // Loading overlay while fetching initial device info
    let isLoading = $state(false);

    async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    const drmState = $derived(deviceSamplesState.modes[SampleMode.DRM]);

    async function waitForInitialData(timeoutMs = 1500) {
        const start = Date.now();
        // Ready when firmware known AND (samples unsupported OR basic sample info fetched)
        while (Date.now() - start < timeoutMs) {
            const fwReady = firmwareState?.firmwareVersion != null;
            const samplesUnsupported = deviceSamplesState.isSupported === false && drmState.isSet === null && drmState.ids === null;
            const samplesReady = deviceSamplesState.isSupported === true && drmState.ids != null && drmState.storageUsed != null && drmState.storageTotal != null;
            if (fwReady && (samplesUnsupported || samplesReady)) return true;
            await wait(100);
        }
        return false; // timeout
    }

    const currentView = $derived.by(() => {
        const hash = windowState.hash;
        const v = (hash || '').replace('#', '').trim();

        let view = DeviceUtilityView.Playground;
        if (deviceSamplesState.isSupported && v === DeviceUtilityView.SampleManager) view = DeviceUtilityView.SampleManager;
        else if (v === DeviceUtilityView.Playground) view = DeviceUtilityView.Playground;
        else if (v === DeviceUtilityView.DeviceUpdate) view = DeviceUtilityView.DeviceUpdate;
        else if (dev.enabled && v === DeviceUtilityView.DeviceTester) view = DeviceUtilityView.DeviceTester;

        return view;
    })

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
    const isUpdateTabActive = $derived(currentView === DeviceUtilityView.DeviceUpdate);
    const batteryPercent = $derived.by(() => {
        const level = batteryState.level;
        if (level === null || typeof level !== 'number' || Number.isNaN(level)) return null;
        return Math.max(0, Math.min(100, Math.round(level)));
    });
    const batteryFillColor = $derived.by(() => {
        const level = batteryPercent;
        if (level === null) return '#d1d5db';
        if (level <= 15) return '#ef4444';
        if (level <= 35) return '#f59e0b';
        return '#22c55e';
    });
    const powerStateLabels = {
        0: 'IDLE',
        1: 'LOW',
        2: 'HIGH',
        3: 'DATA_TRANSFER',
    };
    const powerStateLabel = $derived.by(() => {
        const state = deviceState.powerState;
        if (state === null || state === undefined) return 'unset';
        return powerStateLabels[state] ?? `unknown(${state})`;
    });
    const isPowerIdle = $derived(deviceState.powerState === 0);
    const btConnIntervalMs = $derived.by(() => {
        const raw = deviceState.btConnInterval;
        if (raw == null) return null;
        return raw * 1.25;
    });
    const btConnTimeoutMs = $derived.by(() => {
        const raw = deviceState.btConnTimeout;
        if (raw == null) return null;
        return raw * 10;
    });

</script>

<div>
    {#if !isLoading}
    <nav>
      <div class="nav-inner">
        <div>
            <button onclick={() => {bluetoothManager.disconnect(); window.location.reload()}}>
                <i class="bi-bluetooth-disconnect"></i>
                exit
            </button>
            <span>{bluetoothState.deviceName}</span>
            <ConnectionStatus />
            <span>v{firmwareState?.firmwareVersion?.versionString ?? '?.?.?'}</span>
            <span class="battery" title={batteryPercent === null ? 'Battery level unavailable' : `Battery ${batteryPercent}%`}>
                <span class="battery-glyph" aria-hidden="true">
                    <span class="battery-body">
                        <span class="battery-fill" style={`width: ${batteryPercent ?? 0}%; background-color: ${batteryFillColor};`}></span>
                    </span>
                    <span class="battery-cap"></span>
                </span>
                <span class="battery-text">{batteryPercent ?? '??'}%</span>
            </span>
            <span class="info-wrap">
                <button class="info-icon" type="button" aria-label="Device connection info">i</button>
                <div class="info-tooltip" role="tooltip">
                    <div class="info-row">
                        <span class="info-label">Power</span>
                        <span class="info-value">{powerStateLabel}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">BT interval</span>
                        <span class="info-value">{deviceState.btConnInterval == null ? 'unset' : `${deviceState.btConnInterval} (${btConnIntervalMs?.toFixed(2)} ms)`}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">BT timeout</span>
                        <span class="info-value">{deviceState.btConnTimeout == null ? 'unset' : `${deviceState.btConnTimeout} (${btConnTimeoutMs} ms)`}</span>
                    </div>
                </div>
            </span>
            {#if isPowerIdle}
                <span class="idle-indicator" title="Power state: IDLE" aria-label="Power idle">🌙</span>
            {/if}
            {#if dev.enabled}
                <span class="dev-indicator" title="Dev mode active - type 'disable dev mode' in console to disable">🔧</span>
            {/if}
        </div>
        <div>
            <a 
                href="#playground" 
                class={currentView === DeviceUtilityView.Playground ? 'active' : ''}
            >
                Playground
            </a>
            <span class={`tab-with-badge ${upgradeAvailable && !isUpdateTabActive ? 'blink-update' : ''}`}>
              <a href="#device-update" class={currentView === DeviceUtilityView.DeviceUpdate ? 'active' : ''}>
                  Device Update
              </a>
              {#if upgradeAvailable}
                  <span class="alert-dot" title={upgradeAvailable ? 'Upgrade available' : 'Downgrade available'}>!</span>
              {/if}
            </span>
            <a 
                href="#pack-editor" 
                class={`blink ${currentView === DeviceUtilityView.SampleManager ? 'active' : ''}`}
                class:disabled={!deviceSamplesState.isSupported}
                onclick={e => deviceSamplesState.isSupported == false && e.preventDefault()}
                title={!deviceSamplesState.isSupported ? "firmware version 1.2.0 or greater is required" : ""}
            >
                Pack Editor
            </a>
            {#if dev.enabled}
                <a 
                    href="#device-tester" 
                    class={currentView === DeviceUtilityView.DeviceTester ? 'active' : ''}
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
    {:else if currentView === DeviceUtilityView.DeviceUpdate}
    <div in:fade={{ duration: 200 }}>
        <DeviceUpdate />
    </div>
    {:else if currentView === DeviceUtilityView.SampleManager}
        <div in:fade={{ duration: 200 }}>
            <DeviceSampleManager />
        </div>
    {:else if currentView === DeviceUtilityView.DeviceTester}
        <div in:fade={{ duration: 200 }}>
            <DeviceTester />
        </div>
    {:else if currentView === DeviceUtilityView.Playground}
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
    .idle-indicator {
        font-size: 1.1em;
        opacity: 0.8;
        cursor: help;
    }
    .info-icon {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 1px solid #2f313a;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        background: #f2f3f5;
        color: #2f313a;
        cursor: help;
        padding: 0;
    }
    .info-icon:hover { background: #e5e7eb; }
    .info-wrap { position: relative; display: inline-flex; align-items: center; }
    .info-tooltip {
        position: absolute;
        top: 28px;
        right: 0;
        background: #111827;
        color: #fff;
        border-radius: 6px;
        padding: 8px 10px;
        min-width: 200px;
        display: none;
        z-index: 10;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
        font-size: 11px;
        letter-spacing: 0.02em;
    }
    .info-wrap:hover .info-tooltip,
    .info-wrap:focus-within .info-tooltip { display: block; }
    .info-row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; }
    .info-label { text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; font-size: 10px; }
    .info-value { font-variant-numeric: tabular-nums; }

    .battery {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #2f313a;
    }

    .battery-glyph {
        display: inline-flex;
        align-items: center;
    }

    .battery-body {
        width: 22px;
        height: 10px;
        border: 1px solid #2f313a;
        border-radius: 2px;
        background: #f6f7f9;
        overflow: hidden;
        position: relative;
    }

    .battery-fill {
        display: block;
        height: 100%;
        transition: width 160ms ease;
    }

    .battery-cap {
        width: 3px;
        height: 6px;
        margin-left: 2px;
        border-radius: 1px;
        background: #2f313a;
    }

    .battery-text {
        font-size: 12px;
        letter-spacing: 0.02em;
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
