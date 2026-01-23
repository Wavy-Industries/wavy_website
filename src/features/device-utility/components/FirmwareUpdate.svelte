<script>
    import { deviceSampleTransferState } from "~/lib/states/samples.svelte";
    import { updaterTriggerReconnect } from "~/lib/states/updater.svelte";

    const { stage, uploadProgress, sampleUploadProgress } = $props();
    const hasSampleProgress = $derived(typeof sampleUploadProgress === 'number');
</script>

<div class="update-stages">
    <div class="stage" class:active={stage === 'fetching'}>
        {#if stage === 'fetching'}
            <div class="spinner"></div>
        {:else if ['uploading', 'applying', 'reconnect_required', 'verifying', 'done'].includes(stage)}
            <div class="checkmark">✓</div>
        {/if}
        Preparing firmware
    </div>
    <div class="stage" class:active={stage === 'uploading'}>
        {#if stage === 'uploading'}
            <div class="spinner"></div>
        {:else if ['applying', 'reconnect_required', 'verifying', 'done'].includes(stage)}
            <div class="checkmark">✓</div>
        {/if}
        Uploading firmware
        {#if stage === 'uploading'}
            <span class="stage-info">{#if uploadProgress === null}preparing device{:else}Progress {uploadProgress}%{/if}</span>
        {/if}
    </div>
    <div class="stage" class:active={stage === 'applying' || stage === 'reconnect_required'}>
        {#if stage === 'applying'}
            <div class="spinner"></div>
        {:else if ['reconnect_required', 'verifying', 'done'].includes(stage)}
            <div class="checkmark">✓</div>
        {/if}
        Applying update
        {#if stage === 'applying'}
            <span class="stage-info">Waiting on device</span>
        {/if}
    </div>
    {#if stage === 'reconnect_required'}
    <div class="stage active">
        <span class="stage-info reconnect-info">
            Failed to auto connect. Please reconnect manually:
            <button class="reconnect-btn" onclick={() => updaterTriggerReconnect()}>Reconnect</button>
        </span>
    </div>
    {/if}
    <div class="stage" class:active={stage === 'verifying'}>
        {#if stage === 'verifying'}
            <div class="spinner"></div>
        {:else if ['done'].includes(stage)}
            <div class="checkmark">✓</div>
        {/if}
        Verifying update 
        {#if stage === 'verifying'}
        {#if deviceSampleTransferState.supportCheck.type === 'transferring'}
            {@const progress = deviceSampleTransferState.supportCheck.progress}
            <span class="stage-info">Checking support ({progress ? progress.toFixed(1) + '%' : 'Preparing'})</span>
        {:else if deviceSampleTransferState.upload.type === 'transferring'}
            {@const progress = deviceSampleTransferState.upload.progress}
            <span class="stage-info">Uploading default samples({progress ? progress.toFixed(1) + '%' : 'Preparing'})</span>
        {:else if deviceSampleTransferState.download.type === 'transferring'}
            {@const progress = deviceSampleTransferState.download.progress}
            <span class="stage-info">Checking device samples({progress ? progress.toFixed(1) + '%' : 'Preparing'})</span>
        {/if}
        {/if}
    </div>
    <div class="stage" class:active={stage === 'done'}>
        {#if stage === 'done'}
            <div class="checkmark">✓</div>
        {/if}
        Done!
    </div>
    </div>

<style>
    .update-stages {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .stage {
        opacity: 0.5;
    }

    .stage.active {
        opacity: 1;
        font-weight: bold;
    }

    .stage-info {
        font-size: 0.8em;
        font-style: italic;
        margin-left: 5px;
    }

    .spinner {
        display: inline-block;
        width: 1em;
        height: 1em;
        border: 2px solid currentColor;
        border-radius: 50%;
        border-top-color: transparent;
        animation: spin 1s linear infinite;
        margin-right: 0.5em;
    }

    .checkmark {
        display: inline-block;
        margin-right: 0.5em;
        color: green;
    }

    .reconnect-info {
        display: flex;
        align-items: center;
        gap: 8px;
        font-style: normal;
    }

    .reconnect-btn {
        background-color: #0082FC;
        color: #fff;
        border: 1px solid #005ECB;
        border-radius: var(--du-radius, 4px);
        padding: 6px 12px;
        font-size: 13px;
        cursor: pointer;
    }

    .reconnect-btn:hover {
        background-color: #006ed4;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }
</style>
