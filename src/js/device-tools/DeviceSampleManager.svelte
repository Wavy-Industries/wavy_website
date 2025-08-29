
<script>
    import { sampleState, deviceSampleUploadDefault, deviceSamplesDownloadMatchesDefault } from "~/stores/SampleManager.svelte";

    const storagePercentage = $derived(sampleState.storageUsed != null && sampleState.storageTotal != null ? (sampleState.storageUsed/sampleState.storageTotal * 100).toFixed(1) : "??.?")

    const rows = $derived.by(() => {
        if (sampleState.names == null) return [];
        const n = sampleState.names.length;
        if (n === 0) return [];
        const orderedIndices = [...Array(n).keys()];
        // reorder to start at 1..n-1, then 0 at the end
        const shifted = orderedIndices.slice(1).concat(orderedIndices[0]);
        return shifted.map((index) => {
            const id = sampleState.names[index];
            const used = sampleState.storagePacksUsed?.[index];
            const total = sampleState.storageTotal;
            const usage = used == null || total == null ? null : (used / total) * 100;
            return { index, id, usage };
        });
    })

    let compareResult = $state(null);
    async function compareDownloadedToDefault() {
        compareResult = null;
        try {
            const matches = await deviceSamplesDownloadMatchesDefault();
            compareResult = matches ? 'Downloaded pack matches generated default' : 'Downloaded pack differs from generated default';
        } catch (e) {
            compareResult = 'Comparison failed';
            console.error(e);
        }
    }
</script>


<div class="content">
    <div class="main-content">
        <div class="console">
            <h1>Sample Manager</h1>
            <span>The presets in <b>DRM</b> are each a pack of drum loop samples. Here you can see which are currently loaded on your device.</span>
            <span><i>To access a pack, first enable the DRM effect, then select it like any other effect preset: hold SHIFT and press a number.</i></span>
        </div>
        <button 
            onclick={deviceSampleUploadDefault} 
            disabled={sampleState.uploadPercentage != null}
        >
            {#if sampleState.uploadPercentage != null}
                Uploading... {sampleState.uploadPercentage == 0 ? "(preparing device)" : `${sampleState.uploadPercentage}%`}
            {:else}
                Reupload default samples
            {/if}
        </button>
        <!-- <button onclick={compareDownloadedToDefault} style="margin-left: 12px;">
            Compare device download vs default
        </button>
        {#if compareResult}
            <div style="margin-top: 8px;">{compareResult}</div>
        {/if} -->
        <div>Storage used: {storagePercentage}%</div>
            
        {#if rows.length > 0}
        <table>
            <tbody>
                <tr>
                    <th>Preset number</th>
                    <th>Pack name</th>
                    <th>Pack usage</th>
                </tr>
                {#each rows as row}
                    <tr>
                        <td>{row.index}</td>
                        <td>{row.id == null ? "<empty>" : row.id}</td>
                        <td>{row.usage == null ? "<empty>" : `${row.usage.toFixed(1)}%`}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
        {/if}
        
        <p>🚧 You will soon be able to upload other drum loops 🚧</p>
        <p>If you want to share a pack with the community, please contact us!</p>
        <br />
        <br />
        <br />
        <br />
        <p><i>This page is <a target="_blank" href="https://github.com/Wavy-Industries/wavy_website">open-source</a></i>. Contributions are very welcome.</p>
    </div>
</div>

<style>
    table {
        border: 1px solid black;
        border-radius: 3px;
        padding: 10px;
        text-align: left;
    }
    .content {
        padding: 20px;
    }

    .main-content {
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .console {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
    }
</style> 