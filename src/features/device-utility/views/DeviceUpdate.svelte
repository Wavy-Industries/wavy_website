<script>
    import { firmwareState } from "~/lib/states/firmware.svelte";
    import { firmwareRhsIsNewer } from '~/lib/bluetooth/smp/FirmwareManager';
    import Changelog from "~/features/device-utility/components/Changelog.svelte";
    import ToggleSwitch from "~/features/device-utility/components/ToggleSwitch.svelte";
    import FirmwareUpdate from "~/features/device-utility/components/FirmwareUpdate.svelte";
    import {deviceSampleTransferState} from "~/lib/states/samples.svelte";

    import { deviceUpdate, updaterState } from "~/lib/states/updater.svelte";
    let betaEnabled = $state(false);
    let selectedVersion = $state(null);

    const availableVersions = $derived.by(() => {
        if (!firmwareState.changelog) return [];
        return firmwareState.changelog.versions.filter(v => !v.isObsolete && (betaEnabled || !v.isDev));
    });

    const selectedVersionDetail = $derived.by(() => availableVersions.find(v => v.version.versionString === selectedVersion) ?? null);

    $effect(() => {
        if (!availableVersions.length) {
            selectedVersion = null;
            return;
        }
        if (!selectedVersion || !availableVersions.some(v => v.version.versionString === selectedVersion)) {
            selectedVersion = availableVersions[0].version.versionString;
        }
    });

    const updateState = $derived.by(() => {
        const deviceFw = firmwareState.firmwareVersion;
        if (!deviceFw || !selectedVersionDetail) return null;
        const target = selectedVersionDetail.version;
        if (target.versionString === deviceFw.versionString) return 'up-to-date';
        if (firmwareRhsIsNewer(deviceFw, target)) return 'upgrade';
        if (firmwareRhsIsNewer(target, deviceFw)) return 'downgrade';
        return null;
    });
</script>

<div class="content">
    
    <div class="toolbar">
        <div class="left">
            <h1>Device Update</h1>
            <span class="muted">Update device firmware</span>
        </div>
        <div class="right">
            <div class="subhead">Update Actions</div>
            <div class="actions-row">
                <span class="toggle-wrap"><span class="label">Beta</span><ToggleSwitch init={false} onChange={(val) => betaEnabled = val} /></span>
                <label class="select-wrap">
                    <span class="label">Firmware</span>
                    <select
                        bind:value={selectedVersion}
                        disabled={!availableVersions.length || (updaterState.stage !== 'idle' && updaterState.stage !== 'failed')}
                    >
                        {#each availableVersions as version}
                            <option value={version.version.versionString}>
                                {version.version.versionString}{version.isDev ? ' (beta)' : ''}
                            </option>
                        {/each}
                    </select>
                </label>
                <button class="update-buttons primary" onclick={() => selectedVersion && deviceUpdate(selectedVersion)} disabled={!(updateState === 'upgrade') || (updaterState.stage !== 'idle' && updaterState.stage !== 'failed')}>Start update</button>
                <button class="update-buttons caution" onclick={() => selectedVersion && deviceUpdate(selectedVersion)} disabled={!(updateState === 'downgrade') || (updaterState.stage !== 'idle' && updaterState.stage !== 'failed')}>Start downgrade</button>
            </div>
        </div>
    </div>
    <div class="main-content">
        <div class="console">
            {#if updaterState.stage !== 'idle' && updaterState.stage !== 'failed'}
              <FirmwareUpdate stage={updaterState.stage} uploadProgress={updaterState.uploadProgress} sampleUploadProgress={deviceSampleTransferState.type === 'transferring' ? deviceSampleTransferState.progress : null} />
            {:else}
              {#if updateState === 'up-to-date'}
                <div class="status-card ok">
                  <h2>Your device is up to date!</h2>
                  <span class="tagline">Your device is running the newest firmware. To get notifications when new firmware versions are available, add your email at the bottom of this page.</span>
                </div>
              {:else if updateState === 'upgrade'}
                <div class="status-card upgrade">
                  <h2>New update available</h2>
                  <span class="tagline">Your device is ready to be updated</span>
                </div>
              {:else if updateState === 'downgrade'}
                <div class="status-card downgrade">
                  <h2>Downgrade available</h2>
                  <span class="tagline">Your device running a beta firmware. Downgrade to stable release</span>
                </div>
              {:else}
                <div class="status-card neutral">
                  <h2>Waiting on device..</h2>
                </div>
              {/if}
            {/if}
        </div>
        <hr />
        <Changelog beta={betaEnabled} />
    </div>
</div>

<style>
    .content { padding: 16px; max-width: var(--du-maxw, 1100px); margin: 0 auto; }
    .main-content { display: flex; flex-direction: column; align-items: stretch; gap: 12px; }
    .console { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; border: 1px solid #2f313a; background: #fcfcfd; border-radius: var(--du-radius); padding: 12px; }
    hr { border: none; border-top: 1px solid var(--du-border); width: 100%; }
    .status-card { width: 100%; border: 1px solid #2f313a; border-radius: var(--du-radius); padding: 10px; background: #f2f3f5; }
    .status-card.ok { background: #f2f7f3; border-color: #1f2329; }
    .status-card.upgrade { background: #FFFEAC; border-color: #b3ac5a; }
    .status-card.downgrade { background: #fff3d1; border-color: #b3ac5a; }
    .status-card.neutral { background: #fcfcfd; border-color: #cfd4dc; }
    .update-buttons { border: 1px solid #2f313a; background: #f2f3f5; color: var(--du-text); border-radius: var(--du-radius); padding: 8px 12px; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; cursor: pointer; }
    .update-buttons.primary {
        background: var(--du-success);
        color: white;
        border-color: #1f2329;
    }
    .update-buttons.caution {
        background: var(--du-highlight);
        color: #4a3b00;
        border-color: #e5e388;
    }
    .update-buttons:disabled { background: #f3f4f6; color: #9ca3af; border-color: #e5e7eb; cursor: not-allowed; }
    .toggle-wrap { display: inline-flex; align-items: center; gap: 6px; }
    .toggle-wrap .label { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #111827; }
    .select-wrap { display: flex; flex-direction: column; gap: 4px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #111827; }
    .select-wrap .label { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #111827; }
    .select-wrap select {
        min-width: 160px;
        padding: 6px 8px;
        border: 1px solid #2f313a;
        border-radius: var(--du-radius);
        font-size: 13px;
        letter-spacing: normal;
        text-transform: none;
        color: var(--du-text);
        background: #fff;
    }
    .select-wrap select:disabled {
        background: #f3f4f6;
        color: #9ca3af;
        border-color: #e5e7eb;
        cursor: not-allowed;
    }
    .toolbar { display: flex; gap: 12px; align-items: flex-end; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--du-border); }
    .toolbar .left { display: flex; flex-direction: column; }
    .toolbar .left .muted { color: var(--du-muted); font-size: 0.9em; }
    .toolbar .left h1 { position: relative; display: inline-block; padding-bottom: 6px; margin: 0; }
    .toolbar .left h1::after { content: ""; position: absolute; left: 0; bottom: 0; width: 120px; height: 3px; background: #2f313a; border-radius: 0; }
    .toolbar .right { display: flex; gap: 6px; align-items: flex-end; flex-direction: column; }
    .toolbar .right .actions-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .toolbar .right .subhead { position: relative; font-size: 12px; font-weight: 800; letter-spacing: .08em; color: #111827; text-transform: uppercase; padding-bottom: 6px; align-self: flex-end; }
    .toolbar .right .subhead::after { content: ""; position: absolute; right: 0; bottom: 0; width: 140px; height: 3px; background: #2f313a; }

    @media (max-width: 900px) {
        .content { padding: 12px; max-width: 100%; }
        .toolbar { flex-direction: column; align-items: stretch; gap: 10px; }
        .toolbar .right { align-items: flex-start; }
        .toolbar .right .subhead { align-self: flex-start; }
        .toolbar .right .subhead::after { width: 100px; }
        .select-wrap select { min-width: 0; width: 100%; }
    }

    @media (max-width: 600px) {
        .toolbar .right .actions-row { width: 100%; }
        .update-buttons { width: 100%; }
    }
</style>
