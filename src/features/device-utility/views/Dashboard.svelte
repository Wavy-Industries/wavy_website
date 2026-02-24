<script>
    import { bluetoothManager, bluetoothState } from '~/lib/states/bluetooth.svelte';
    import { batteryState } from '~/features/device-utility/states/bas.svelte';
    import { disState } from '~/features/device-utility/states/dis.svelte';
    import { BT_DEVICE_FILTERS } from '~/lib/config/device';
    import ConnectionStatus from '~/features/device-utility/components/ConnectionStatus.svelte';
    import DeviceUpdate from '~/features/device-utility/views/DeviceUpdate.svelte';
    import DeviceSampleManager from '~/features/device-utility/views/DeviceSampleManager.svelte';
    import DeviceTester from '~/features/device-utility/views/DeviceTester.svelte';
    import { firmwareState } from '~/lib/states/firmware.svelte';
    import { dev } from '~/features/device-utility/states/devmode.svelte';
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import { deviceSamplesState } from '~/lib/states/samples.svelte';
    import { SampleMode } from '~/lib/types/sampleMode';
    import { initDrumKits } from '~/features/device-utility/states/drumKits.svelte';
    import {  windowStateInit, windowState, DeviceUtilityView, setHash } from '~/features/device-utility/states/window.svelte';
    import { deviceState } from '~/features/device-utility/states/deviceState.svelte';
    import { getOperatingSystem } from '~/lib/utils/operating_system';
    import { deviceSupports } from '~/lib/config/deviceProfiles';

    onMount(async () => {

        /* IOS only */
        if (getOperatingSystem() === 'iOS') {
            window.alert('Note for iOS: if you hear no sound, check that the hardware silent switch is off. Web audio can be muted by silent mode.');
        }

        windowStateInit();
        initDrumKits();
    });

    /* loading logic */
    let isLoading = $state(true);
    const deviceName = $derived(bluetoothManager.getDeviceName());
    $effect(() => {
        if (!isLoading) return; // already done, ignore future changes

        const fwReady = firmwareState?.firmwareVersion != null || firmwareState?.isSupported === false;

        // If device doesn't support SampleManager, skip waiting for samples state
        if (!deviceSupports(deviceName, DeviceUtilityView.SampleManager)) {
            if (fwReady) isLoading = false;
            return;
        }

        const drmState = deviceSamplesState.modes[SampleMode.DRM];
        const samplesUnsupported = deviceSamplesState.isSupported === false && drmState.isSet === null && drmState.ids === null;
        const samplesReady = deviceSamplesState.isSupported === true && drmState.ids != null && drmState.storageUsed != null && drmState.storageTotal != null;

        if (fwReady && (samplesUnsupported || samplesReady)) {
            isLoading = false;
        }
    });
    
    /* prompt user if an update is available */
    let updatePrompted = false;
    $effect(() => {
        if (firmwareState.upgradeAvailable && windowState.hash !== DeviceUtilityView.DeviceUpdate && !updatePrompted) {
            updatePrompted = true;
            const showUpdatePage = confirm("An update is available. Would you like to update your device?")
            if (showUpdatePage) setHash(DeviceUtilityView.DeviceUpdate)
        }
    })

    const currentView = $derived.by(() => {
        const urlHash = (windowState.hash || '').replace('#', '').trim();
        
        // Access all reactive dependencies upfront
        const samplesSupported = deviceSamplesState.isSupported;
        const firmwareSupported = firmwareState.isSupported;
        const devEnabled = dev.enabled;
        
        switch (urlHash) {
            case DeviceUtilityView.Playground:
                return DeviceUtilityView.Playground;
            case DeviceUtilityView.SampleManager:
                if (samplesSupported) return DeviceUtilityView.SampleManager;
                break;
            case DeviceUtilityView.DeviceUpdate:
                if (firmwareSupported !== false) return DeviceUtilityView.DeviceUpdate;
                break;
            case DeviceUtilityView.DeviceTester:
                if (devEnabled) return DeviceUtilityView.DeviceTester;
                break;
        }
        
        return DeviceUtilityView.Playground;
    });

    const batteryFillColor = $derived.by(() => {
        const level = batteryState.level;
        if (level === null) return '#d1d5db';
        if (level <= 15) return '#ef4444';
        if (level <= 35) return '#f59e0b';
        return '#22c55e';
    });
</script>

<div>
    {#if !isLoading}
    <nav>
      <div class="nav-inner">
        <div class="nav-status">
            <button onclick={() => {bluetoothManager.disconnect(); window.location.reload()}}>
                <i class="bi-bluetooth-disconnect"></i>
                exit
            </button>
            {#if bluetoothState.connectionState !== 'connected' && deviceState.updateInProgress === false}
                <button
                    class="connect-btn"
                    onclick={() => bluetoothManager.reconnectDialogue(BT_DEVICE_FILTERS)}
                >
                    <i class="bi-bluetooth"></i>
                    connect
                </button>
            {/if}
            <span>{bluetoothState.deviceName ?? 'No device'}</span>
            <ConnectionStatus />
            <span>v{firmwareState?.firmwareVersion?.versionString ?? '?.?.?'}</span>
            <span class="battery" title={batteryState.level === null ? 'Battery level unavailable' : `Battery ${batteryState.level}%`}>
                <span class="battery-glyph" aria-hidden="true">
                    <span class="battery-body">
                        <span class="battery-fill" style={`width: ${batteryState.level ?? 0}%; background-color: ${batteryFillColor};`}></span>
                    </span>
                    <span class="battery-cap"></span>
                </span>
                <span class="battery-text">{batteryState.level ?? '??'}%</span>
            </span>
            <span class="info-wrap">
                <button class="info-icon" type="button" aria-label="Device connection info">i</button>
                <div class="info-tooltip" role="tooltip">
                    <div class="info-row">
                        <span class="info-label">Power</span>
                        <span class="info-value">{deviceState.powerState}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">BT interval</span>
                        <span class="info-value">{deviceState.btConnInterval == null ? 'unavailable' : `${deviceState.btConnInterval} (${deviceState.btConnIntervalMs?.toFixed(2)} ms)`}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">BT timeout</span>
                        <span class="info-value">{deviceState.btConnTimeout == null ? 'unavailable' : `${deviceState.btConnTimeout} (${deviceState.btConnTimeoutMs} ms)`}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">MTU RX</span>
                        <span class="info-value">{deviceState.btMtuRx ?? 'unavailable'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">MTU TX</span>
                        <span class="info-value">{deviceState.btMtuTx ?? 'unavailable'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Manufacturer</span>
                        <span class="info-value">{disState.manufacturerName ?? 'unavailable'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Model</span>
                        <span class="info-value">{disState.modelNumber ?? 'unavailable'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">HW rev</span>
                        <span class="info-value">{disState.hardwareRevision ?? 'unavailable'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">FW rev</span>
                        <span class="info-value">{disState.firmwareRevision ?? 'unavailable'}</span>
                    </div>
                </div>
            </span>
            {#if deviceState.powerState == 'idle'}
                <span class="idle-indicator" title="Power state: IDLE" aria-label="Power idle">🌙</span>
            {/if}
            {#if dev.enabled}
                <span class="dev-indicator" title="Dev mode active - type 'disable dev mode' in console to disable">🔧</span>
            {/if}
        </div>
        <div class="nav-tabs">
            {#if deviceSupports(deviceName, DeviceUtilityView.Playground)}
            <a
                href="#playground"
                class={currentView === DeviceUtilityView.Playground ? 'active' : ''}
            >
                Playground
            </a>
            {/if}
            {#if deviceSupports(deviceName, DeviceUtilityView.DeviceUpdate)}
            <span class={`tab-with-badge ${firmwareState.upgradeAvailable && currentView !== DeviceUtilityView.DeviceUpdate && firmwareState.isSupported ? 'blink-update' : ''}`}>
              <a
                  href="#device-update"
                  class={currentView === DeviceUtilityView.DeviceUpdate ? 'active' : ''}
                  class:disabled={firmwareState.isSupported === false}
                  onclick={e => firmwareState.isSupported === false && e.preventDefault()}
                  title={firmwareState.isSupported === false ? "This device does not support firmware updates" : ""}
              >
                  Device Update
              </a>
              {#if firmwareState.upgradeAvailable && firmwareState.isSupported}
                  <span class="alert-dot" title={firmwareState.upgradeAvailable ? 'Upgrade available' : 'Downgrade available'}>!</span>
              {/if}
            </span>
            {/if}
            {#if deviceSupports(deviceName, DeviceUtilityView.SampleManager)}
            <a
                href="#pack-editor"
                class={`${currentView === DeviceUtilityView.SampleManager ? 'active' : ''}`}
                class:disabled={!deviceSamplesState.isSupported}
                onclick={e => deviceSamplesState.isSupported == false && e.preventDefault()}
                title={!deviceSamplesState.isSupported ? "firmware version 1.2.0 or greater is required" : ""}
            >
                Pack Editor
            </a>
            {/if}
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
    {:else}
      <div class="content-container">
          {#if currentView === DeviceUtilityView.DeviceUpdate}
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
        width: 100%;
        box-sizing: border-box;
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

    .nav-status,
    .nav-tabs {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 20px;
    }

    .connect-btn {
        background-color: #0082FC;
        color: #fff;
        border: 1px solid #005ECB;
        border-radius: var(--du-radius, 4px);
        padding: 6px 10px;
        font-size: 12px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
    }
    .connect-btn:hover { background-color: #006ed4; }

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
        min-width: 100px;
        text-align: center;
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
    .info-value { font-variant-numeric: tabular-nums; text-align: right; }

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

    .content-container {
        width: 1100px;
        max-width: 100%;
        margin: 0 auto;
        padding: 0;
        box-sizing: border-box;
        min-height: 60vh;
    }

    /* Ensure all child content fills the fixed width */
    .content-container > div {
        width: 100%;
    }

    @media (max-width: 860px) {
        nav { padding: 12px 14px; }
        .nav-inner { flex-direction: column; align-items: stretch; gap: 10px; }
        .nav-status,
        .nav-tabs { flex-wrap: wrap; justify-content: flex-start; gap: 10px; }
        nav a { font-size: 11px; padding: 6px 8px; }
        .info-tooltip { left: 0; right: auto; }
    }
</style>
