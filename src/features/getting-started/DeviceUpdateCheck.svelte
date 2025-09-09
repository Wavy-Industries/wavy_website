<script lang="ts">
  import { onMount } from 'svelte';
  import { callbacksSet } from './eventRouter';
  import { bluetoothManager, bluetoothState } from '~/lib/states/bluetooth.svelte';
  import { firmwareState } from '~/lib/states/firmware.svelte';
  import { routes } from '~/routes';
  import { firmwareRhsIsNewer } from '~/lib/bluetooth/smp/FirmwareManager';

  const supportsBluetooth = navigator?.bluetooth !== undefined;
  onMount(() => {
    callbacksSet();
  });

  const BT_MIDI_SERVICE_UUID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
  const filters = [{ namePrefix: 'WAVY MONKEY', services: [BT_MIDI_SERVICE_UUID] }];

  async function connectAndCheck() { await bluetoothManager.connect(filters); }

  // Local deriveds (Svelte runes: do not export derived from modules)
  const updateAvailable = $derived.by(() => {
    const fw = firmwareState.firmwareVersion;
    const rel = firmwareState.changelog?.release || null;
    if (!fw || !rel) return null;
    return firmwareRhsIsNewer(fw, rel);
  });
  const hasFetchedFirmwareInfo = $derived(updateAvailable !== null);

  // Disconnect automatically once firmware info becomes available
  $effect(() => {
    if (updateAvailable !== null && bluetoothState.connectionState === 'connected') {
      try { bluetoothManager.disconnect(); } catch {}
    }
  });
</script>

{#if supportsBluetooth}
<div style="border: 1px solid var(--color-border, #ddd); padding: 12px; margin: 12px 0; border-radius: 6px;">
  <div style="font-weight:600; margin-bottom: 8px;">Device Updates</div>

  {#if bluetoothState.connectionState === 'connecting'}
    <div>Connecting…</div>
  {:else if bluetoothState.connectionState === 'connected'}
    <div>Checking firmware…</div>
  {:else}
    {#if hasFetchedFirmwareInfo}
      {#if updateAvailable}
        <div>An update is available.</div>
        <div style="margin-top:10px;">
          <a class="connect-btn" href={routes.deviceUtility} target="_blank" rel="noopener">Open device utility</a>
        </div>
      {:else}
        <div>Your device is up to date.</div>
      {/if}
      <div style="margin-top:6px; color: var(--color-text-muted, #666); font-size: 0.9em;">
        {#if firmwareState.firmwareVersion}
          Current: v{firmwareState.firmwareVersion.versionString}
        {/if}
        {#if firmwareState.changelog?.release}
          {#if firmwareState.firmwareVersion} • {/if}
          Latest: v{firmwareState.changelog.release.versionString}
        {/if}
      </div>
    {:else}
      <p>Check for updates by connecting your device.</p>
      <button class="connect-btn" onclick={() => connectAndCheck()}>Connect and check</button>
    {/if}
  {/if}
</div>
{/if}

<style>
  .connect-btn {
    background-color: #0082FC;
    color: #fff;
    border: 1px solid #005ECB;
    border-radius: var(--du-radius);
    padding: 8px 12px;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .connect-btn:disabled { opacity: .7; cursor: not-allowed; }
</style>
