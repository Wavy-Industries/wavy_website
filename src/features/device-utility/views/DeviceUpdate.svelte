<script>
    import { imageState } from "~/features/device-utility/stores/image.svelte";
    import { imageRhsIsNewer } from '~/lib/mcumgr/ImageManager';
    import { imageManager } from '~/features/device-utility/stores/image.svelte'
    import Changelog from "~/features/device-utility/components/Changelog.svelte";
    import ToggleSwitch from "~/features/device-utility/components/ToggleSwitch.svelte";
    import FirmwareUpdate from "~/features/device-utility/components/FirmwareUpdate.svelte";
    import { bluetoothManager } from '~/features/device-utility/stores/bluetooth.svelte';
    import { sampleManager, sampleState } from '~/features/device-utility/stores/samples.svelte';

    let beta = $state(false);
    let updateStage = $state('idle');
    let uploadProgress = $state(0);

    const betaChanged = (value) => beta = value;

    const newestAvailableFirmware = $derived(beta ? imageState.changelog?.dev.versionString : imageState.changelog?.release.versionString)

    let updateState = $derived.by(() => {
        if (imageState.firmwareVersion == null || imageState.changelog == null)
            return null;

        const fw = imageState.firmwareVersion;
        const availableNewest = beta ? imageState.changelog.dev : imageState.changelog.release;

        if (availableNewest.versionString == fw.versionString) {
            return 'up-to-date';
        } else if (imageRhsIsNewer(fw, availableNewest)) {
            return 'upgrade';
        } else {
            return 'downgrade';
        }
    });

    async function startUpdate() {
        try {
            updateStage = 'fetching';
            const firmwareVersion = beta ? imageState.changelog.dev.versionString : imageState.changelog.release.versionString;
            
            updateStage = 'uploading';
            const image = await fetch(`/firmware/MONKEY/app_update_${firmwareVersion}.bin`)
                .then(res => res.arrayBuffer());

            const success = await imageManager.uploadImage(image, (percent) => {
                uploadProgress = percent;
            });
            if (!success) {
                throw "failed to upload image"
            }
            
            updateStage = 'applying';
            await new Promise((resolve) => {
                bluetoothManager.onConnectionReestablished(() => {
                    resolve(null);
                });
            });
            
            updateStage = 'verifying';
            const newFirmware = await imageManager.getFirmwareVersion();
            if (newFirmware.versionString !== firmwareVersion) {
                throw new Error(`Update failed: Device firmware version is ${newFirmware.versionString} but expected ${firmwareVersion}`);
            }

            // As part of verification: if samples are not set and an upload is in progress, await it
            try {
                const isSetNow = await sampleManager.isSet();
                if (!isSetNow && sampleManager.isUploading()) {
                    await sampleManager.waitForUploadToFinish();
                }
            } catch (e) {
                // Sample manager unsupported; skip silently
            }
            
            updateStage = 'done';
            await new Promise(resolve => setTimeout(resolve, 2000));
            updateStage = 'idle';
            uploadProgress = 0;
        } catch (e) {
            console.log(e)
            updateStage = 'failed'
            await new Promise(resolve => setTimeout(resolve, 2000));
            updateStage = 'idle';
        }
    }
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
                <span class="toggle-wrap"><span class="label">Beta</span><ToggleSwitch init={false} onChange={betaChanged} /></span>
                <button class="update-buttons primary" onclick={startUpdate} disabled={!(updateState === 'upgrade') || (updateStage !== 'idle' && updateStage !== 'failed')}>Start update</button>
                <button class="update-buttons caution" onclick={startUpdate} disabled={!(updateState === 'downgrade') || (updateStage !== 'idle' && updateStage !== 'failed')}>Start downgrade</button>
            </div>
        </div>
    </div>
    <div class="main-content">
        <div class="console">
            {#if updateStage !== 'idle' && updateStage !== 'failed'}
              <FirmwareUpdate stage={updateStage} uploadProgress={uploadProgress} sampleUploadProgress={sampleState.uploadPercentage} />
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
        <Changelog beta={beta} />
    </div>
</div>

<style>
    .content {
        padding: 20px;
        max-width: var(--du-maxw, 1100px);
        margin: 0 auto;
    }
    .top-bar {
        display: flex;
        flex-direction: row;
        justify-content: end;
        align-items: center;
        gap: 5px;
    }

    .main-content { display: flex; flex-direction: column; align-items: stretch; gap: 12px; }

    .console { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; border: 1px solid #2f313a; background: #fcfcfd; border-radius: var(--du-radius); padding: 12px; }
    .console h1, .console h2 { position: relative; padding-bottom: 6px; margin: 6px 0; text-transform: uppercase; letter-spacing: .04em; }
    .console h1::after, .console h2::after { content: ""; position: absolute; left: 0; bottom: 0; width: 180px; height: 3px; background: #2f313a; }
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
    .toolbar { display: flex; gap: 12px; align-items: flex-end; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--du-border); }
    .toolbar .left { display: flex; flex-direction: column; }
    .toolbar .left .muted { color: var(--du-muted); font-size: 0.9em; }
    .toolbar .right { display: flex; gap: 6px; align-items: flex-start; flex-direction: column; }
    .toolbar .right .actions-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .toolbar .right .subhead { position: relative; font-size: 12px; font-weight: 800; letter-spacing: .02em; color: #111827; padding-bottom: 6px; align-self: flex-start; }
    .toolbar .right .subhead::after { content: ""; position: absolute; left: 0; bottom: 0; width: 140px; height: 3px; background: #2f313a; }
</style>
