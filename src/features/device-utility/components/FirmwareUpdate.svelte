<script>
    import { deviceSampleTransferState } from "~/features/device-utility/states/samplesDevice.svelte";

    const { stage, uploadProgress, sampleUploadProgress } = $props();
    const hasSampleProgress = $derived(typeof sampleUploadProgress === 'number');
</script>

<div class="update-stages">
    <div class="stage" class:active={stage === 'fetching'}>
        {#if stage === 'fetching'}
            <div class="spinner"></div>
        {:else if ['uploading', 'applying', 'verifying', 'done'].includes(stage)}
            <div class="checkmark">✓</div>
        {/if}
        Preparing firmware
    </div>
    <div class="stage" class:active={stage === 'uploading'}>
        {#if stage === 'uploading'}
            <div class="spinner"></div>
        {:else if ['applying', 'verifying', 'done'].includes(stage)}
            <div class="checkmark">✓</div>
        {/if}
        Uploading firmware 
        {#if stage === 'uploading'}
            <span class="stage-info">{#if uploadProgress === null}preparing device{:else}Progress {uploadProgress}%{/if}</span>
        {/if}
    </div>
    <div class="stage" class:active={stage === 'applying'}>
        {#if stage === 'applying'}
            <div class="spinner"></div>
        {:else if ['verifying', 'done'].includes(stage)}
            <div class="checkmark">✓</div>
        {/if}
        Applying update 
        {#if stage === 'applying'}
            <span class="stage-info">Waiting on device</span>
        {/if}
    </div>
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

    @keyframes spin {
        to { transform: rotate(360deg); }
    }
</style>
