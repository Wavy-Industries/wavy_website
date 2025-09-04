<script>
    import { uplaodDeviceSamples, uplaodDeviceDefaultSamples } from "~/features/device-utility/states/samplesDevice.svelte";
    import { constructSamplePacks, packDisplayName, getSamplePack, compareDeviceSample } from "~/features/device-utility/utils/samples";
    import { deviceSamplesState, deviceSampleTransferState, DEFAULT_SAMPLE_PACK_IDS } from "~/features/device-utility/states/samplesDevice.svelte";
    import { fetchAvailableServerPacks } from "~/features/device-utility/services/serverSamplePacks";
    import { sampleParser_packSize } from "~/lib/parsers/samples_parser";
    import { compareSamplePack, getPackType } from "~/features/device-utility/utils/samples";

    import { Log } from "~/lib/utils/Log";
    import PackEditor from "./PackEditor.svelte";
    import { openPackEditorForId, openPackEditorNew, editState } from "../states/edits.svelte";
    import { samplesLocal, deleteLocalSamplePack, newLocalSamplePack } from "../states/samplesLocal.svelte";
    import NameBoxes from "../components/NameBoxes.svelte";
    import PackTypeBadge from "../components/PackTypeBadge.svelte";
    const LOG_LEVEL = Log.LEVEL_DEBUG
    const log = new Log("DeviceSampleManager", LOG_LEVEL);

    const selectedPacks = $state({
      ids: null,
      display: null,
      asyncData: null,
    });

    $inspect(selectedPacks);

    $effect(() => {
      // store the packs only once as we fetch the packs from device.
      if (selectedPacks.ids == null && deviceSamplesState.ids) {
        selectedPacks.ids = deviceSamplesState.ids;
      }
    });
    
    $effect(() => {
      const ids = selectedPacks.ids;
      const total = deviceSamplesState.storageTotal;
      const pages = deviceSamplesState.deviceSamples?.pages ?? [];
      selectedPacks.display = ids.map((id) => id ? packDisplayName(id) : {});
      selectedPacks.asyncData = ids.map((id, idx) => {
        if (!id) return null;
        const page = pages[idx];
        const totalSnapshot = total;
        return (async () => {
          const pack = await getSamplePack(id);
          const percentageUsage =
            pack && totalSnapshot ? (sampleParser_packSize(pack) / totalSnapshot) * 100 : null;
          const outOfSync =
            pack && page ? compareSamplePack(pack, page) : null;
          return { data: pack, percentageUsage, outOfSync };
        })();
      });
    });

    // If a pack was mutated and saved-as-new in the editor, replace it in the selection
    $effect(() => {
      const from = editState.sourceId;
      const to = editState.id;
      if (!selectedPacks?.ids || !from || !to || from === to) return;
      const idx = selectedPacks.ids.indexOf(from);
      if (idx !== -1) {
        selectedPacks.ids[idx] = to;
      }
    });

    // Transfer device packs to archive if online pack disappears; ensure all device packs exist locally
    $effect(async () => {
        const dev = deviceSamplesState.deviceSamples;
        if (!dev || !Array.isArray(dev.pages)) return;
        try {
            for (const page of dev.pages) {
                if (!page) continue;
                // If online pack but it no longer exists online, archive it locally and switch selection to archive ID
                if (getPackType(page.name) !== 'Local' && getPackType(page.name) !== 'Archive') {
                  const onlinePacks = await availablePacks();
                  if (!onlinePacks[page.name]) {
                    const archiveName = `A-${page.name.slice(2)}`;
                    const existsLocal = samplesLocal.packs.some(p => p?.name === archiveName);
                    if (!existsLocal) {
                      const pageMut = JSON.parse(JSON.stringify(page));
                      pageMut.name = archiveName;
                      newLocalSamplePack(pageMut);
                    }
                    const idx = selectedPacks.ids?.indexOf(page.name) ?? -1;
                    if (idx !== -1) selectedPacks.ids[idx] = archiveName;
                  }
                } else {
                  const exists = samplesLocal.packs.some(p => p?.name === page.name);
                  if (!exists) {
                    // Store a plain clone to ensure availability locally
                    newLocalSamplePack(JSON.parse(JSON.stringify(page)));
                  }
                }
            }
        } catch {}
    });

    const deviceStoragePercentState = $derived(deviceSamplesState.storageUsed != null && deviceSamplesState.storageTotal != null ? (deviceSamplesState.storageUsed/deviceSamplesState.storageTotal * 100).toFixed(1) : null)
    const isTransferring = $derived(deviceSampleTransferState.supportCheck.type === 'transferring' || deviceSampleTransferState.download.type === 'transferring' || deviceSampleTransferState.upload.type === 'transferring');

    let showTransferDetails = $state(false);
    
    let selectionCompare = $state({ dirty: false, computing: false });
    $effect(() => {
      const ids = selectedPacks.ids;
      const dev = deviceSamplesState.deviceSamples;
      if (!Array.isArray(ids) || !dev) { selectionCompare.dirty = false; return; }
      selectionCompare.computing = true;
      (async () => {
        try {
          const candidate = await constructSamplePacks(ids);
          if (!candidate) { selectionCompare.dirty = true; selectionCompare.computing = false; return; }
          const diff = compareDeviceSample(candidate, dev);
          selectionCompare.dirty = !(diff?.areIdentical ?? true);
        } catch {
          selectionCompare.dirty = true;
        } finally {
          selectionCompare.computing = false;
        }
      })();
    });
    const isSelectionDirty = $derived(selectionCompare.dirty);
    
    const availablePacks = $state(async () => fetchAvailableServerPacks());

    const mailtoForLocalPack = (pack) => {
      try {
        const subject = encodeURIComponent('WAVY MONKEY sample pack proposal');
        const packName = (pack?.name || '').slice(2, 9);
        const pretty = JSON.stringify(pack?.loops ?? {}, null, 2);
        const body = encodeURIComponent(
          'Hi WAVY team,\n\n' +
          'I would like to propose a public sample pack for MONKEY.\n' +
          'Please find the details below.\n\n' +
          'Author: <your name here>\n' +
          'Description: <one sentence about the pack>\n' +
          `Pack name (max 7 characters): ${packName}\n\n` +
          'Here is the sample pack content, cheers:\n\n' +
          pretty
        );
        return `mailto:hello@wavyindustries.com?subject=${subject}&body=${body}`;
      } catch {
        return 'mailto:hello@wavyindustries.com';
      }
    }

    const moveUp = (idx) => {
      if (!selectedPacks) return;
      const id = selectedPacks.ids[idx];
      selectedPacks.ids[idx] = selectedPacks.ids[idx - 1];
      selectedPacks.ids[idx - 1] = id;
    }
    
    const moveDown = (idx) => {
      if (!selectedPacks) return;
      const id = selectedPacks.ids[idx];
      selectedPacks.ids[idx] = selectedPacks.ids[idx + 1];
      selectedPacks.ids[idx + 1] = id;
    }

    const addToSelected = (id) => {
      if (!selectedPacks.ids) return;
      const nullIndex = selectedPacks.ids.findIndex(id => id === null);
      if (nullIndex === -1) {
        log.warning("No empty slots found in selected packs");
        return;
      }
      selectedPacks.ids[nullIndex] = id;
    }

    const uploadSelected = async () => {
      const samples = await constructSamplePacks(selectedPacks.ids);
      if (!samples) {
        log.error("Failed to construct samples");
        return;
      }
      log.debug("Uploading samples:");
      log.debug(samples);
      await uplaodDeviceSamples(samples);
    }

</script>

<!-- {#if editState.open}
<PackEditor />
{:else} -->
{#if editState.open === false}
<div class="content">
  <div class="beta-banner">
    <span class="beta-badge">BETA</span>
    <span>This feature is in beta — please report issues to <a href="mailto:hello@wavyindustries.com">hello@wavyindustries.com</a> or contribute on <a href="https://github.com/Wavy-Industries/wavy_website">GitHub</a>.</span>
  </div>
  <div class="toolbar">
    <div class="left">
      <h1>Sample Manager</h1>
      <span class="muted">Selected packs on top; available below.</span>
    </div>
    <div class="right">
      <div class="subhead">DEVICE ACTIONS</div>
      <div class="actions-row">
        <button class="btn caution" disabled={isTransferring} title="Reset device samples to default" aria-label="Reset to default" onclick={uplaodDeviceDefaultSamples}>Reset to default</button>
        <button class="btn" disabled={isTransferring} title="Sync selection from device" aria-label="Sync from device" onclick={() => selectedPacks.ids = DEFAULT_SAMPLE_PACK_IDS}>Sync from device</button>
        <button class="btn primary" disabled={isTransferring} title="Upload selected packs to device" aria-label="Upload to device" onclick={uploadSelected}>Upload to device</button>
      </div>
    </div>
  </div>
  <div class="status">
    <span>Storage used: {deviceStoragePercentState ?? "-"}%</span>
    <div class="progress" style={`--p:${deviceStoragePercentState ?? 0}`}></div>
    <div class="divider"></div>
    <span>Device activity:</span>
    {#if deviceSampleTransferState.supportCheck.type === 'transferring'}
      {@const progress = deviceSampleTransferState.supportCheck.progress}
      <span class="pill active">Checking support ({progress ? progress.toFixed(1) + '%' : 'Preparing'})</span>
    {:else if deviceSampleTransferState.download.type === 'transferring'}
      {@const progress = deviceSampleTransferState.download.progress}
      <span class="pill active">Downloading ({progress ? progress.toFixed(1) + '%' : 'Preparing'})</span>
    {:else if deviceSampleTransferState.upload.type === 'transferring'}
      {@const progress = deviceSampleTransferState.upload.progress}
      <span class="pill active">Uploading ({progress ? progress.toFixed(1) + '%' : 'Preparing'})</span>
    {:else}
      <span class="pill idle">Idle</span>
    {/if}
    <button class="button-link" onclick={() => showTransferDetails = !showTransferDetails}>{showTransferDetails ? 'Hide' : 'Show'} details</button>
    {#if isSelectionDirty}
      <span class="dirty">Unsaved selection</span>
    {/if}
  </div>
  {#if showTransferDetails}
    <div class="transfer-details">
      <div>Support check: {deviceSampleTransferState.supportCheck.type}{#if deviceSampleTransferState.supportCheck.progress != null} ({deviceSampleTransferState.supportCheck.progress}%) {/if}</div>
      <div>Download: {deviceSampleTransferState.download.type}{#if deviceSampleTransferState.download.progress != null} ({deviceSampleTransferState.download.progress}%) {/if}</div>
      <div>Upload: {deviceSampleTransferState.upload.type}{#if deviceSampleTransferState.upload.progress != null} ({deviceSampleTransferState.upload.progress}%) {/if}</div>
    </div>
  {/if}

  <div class="pane">
    <div class="pane-header"><h3>Selected Packs</h3></div>
    <div class="selected-list">
      {#each Array(10) as _, i (i + ':' + (selectedPacks.ids?.[i] ?? 'empty'))}
        {#if selectedPacks.ids?.[i]}
          <div class="row">
            <span class="index">{i < 9 ? i + 1 : 0}</span>
            <PackTypeBadge type={selectedPacks.display[i]?.type} />
            <span class="name"><NameBoxes value={selectedPacks.display[i]?.name || ''} />
              {#if selectedPacks.asyncData?.[i]}
                {#await selectedPacks.asyncData?.[i]}
                  <span class=""></span>
                {:then data}
                  {#if data?.outOfSync?.areIdentical === false}
                    <span class="outofsync">Out of sync</span>
                  {/if}
                {:catch e}
                  <span class="error">-</span>
                {/await}
              {/if}
            </span>

            {#if selectedPacks.asyncData?.[i]}
              {#await selectedPacks.asyncData?.[i]}
                <span class="usage">Loading...</span>
              {:then data}
                <span class="usage">{data.percentageUsage != null ? data.percentageUsage.toFixed(1) : "-" }%</span>
              {:catch e}
                <span class="usage error">-</span>
              {/await}
            {:else}
              <span class="usage">-</span>
            {/if}

            <div class="actions">
              <button class="btn" title="Move up"    onclick={() => moveUp(i)}>Move up</button>
              <button class="btn" title="Move down"  onclick={() => moveDown(i)}>Move down</button>
              <button class="btn" title="Remove"     onclick={() => selectedPacks.ids[i] = null}>Remove</button>
              {#if selectedPacks.display[i]?.type === 'Local'}
                <button class="btn" title="Edit local pack" onclick={() => openPackEditorForId(selectedPacks.ids[i])}>Edit</button>
              {:else}
                <button class="btn" title="Mutate pack (edit or clone)" onclick={() => openPackEditorForId(selectedPacks.ids[i])}>Mutate</button>
              {/if}
            </div>
          </div>
        {:else}
          <div class="row empty">
            <span class="index">{i < 9 ? i + 1 : 0}</span>
            <span class="badge">empty</span>
            <span class="name muted">Empty slot</span>
            <span class="usage"></span>
            <div class="actions">
              <button class="btn" title="Move up"   onclick={() => moveUp(i)}>Move up</button>
              <button class="btn" title="Move down" onclick={() => moveDown(i)}>Move down</button>
            </div>
          </div>
        {/if}
      {/each}

      {#if selectedPacks.ids?.length === 0}
        <div class="hint">No packs selected — add from below.</div>
      {/if}
    </div>
  </div>

  <div class="pane">
    <div class="pane-header">
      <h3>Local Packs</h3>
      <div class="inline-actions">
        <button class="btn primary" title="Create new pack" aria-label="Create new pack" onclick={() => openPackEditorNew()}>+ Create Local pack</button>
      </div>
    </div>
    <div class="grid">
      {#each samplesLocal.packs as p (p.name)}
        {@const packType = getPackType(p.name)}
        <div class="card">
          <div class="title"><PackTypeBadge id={p.name} /> <NameBoxes value={p.name.slice(2)} /></div>
          <div class="meta">
            <span class="usage">{deviceSamplesState.storageTotal ? (sampleParser_packSize(p) / deviceSamplesState.storageTotal * 100).toFixed(1) : '-'}%</span>
          </div>
          <div class="desc"></div>
          <div class="card-actions">
            <button class="btn" title="Add to selected" disabled={selectedPacks.ids?.includes(p.name)} onclick={() => addToSelected(p.name)}>Add</button>
            {#if packType === 'Local'}
              <button class="btn primary" title="Edit local pack" onclick={() => openPackEditorForId(p.name)}>Edit</button>
            {:else}
              <button class="btn" title="Mutate pack (edit or clone)" onclick={() => openPackEditorForId(p.name)}>Mutate</button>
            {/if}
            <button class="btn" title="Delete pack" disabled={selectedPacks.ids?.includes(p.name)} onclick={() => { if (confirm('Delete this pack? This cannot be undone.')) deleteLocalSamplePack(p.name); }}>Delete</button>
            {#if packType === 'Local'}
              <a class="btn" title="Publish (email)" href={mailtoForLocalPack(p)}>Publish</a>
            {/if}
          </div>
        </div>
      {/each}
      {#if samplesLocal.packs.length === 0}
        <div class="hint">No local packs — create one above.</div>
      {/if}
    </div>
  </div>

  <div class="pane">
    <div class="pane-header">
      <h3>Online Packs</h3>
    </div>
    <div class="grid">
      {#await availablePacks()}
        <p>Loading...</p>
      {:then packs}
        {#each Object.entries(packs) as [k, p], idx (k)}
          <div class="card" class:selected={k in selectedPacks.ids} >
            <div class="title"><PackTypeBadge type={p.display.type} /> <NameBoxes value={p.display.name || ''} /></div>
            <div class="meta">
              {#if p.author}
                <span>{p.author}</span>
              {/if}
              {#if selectedPacks.asyncData?.[idx]?.outOfSync?.areIdentical === false}
                <span class="outofsync">Out of sync</span>
              {/if}
            </div>
            {#if p.description}
              <div class="desc">{p.description}</div>
            {/if}
            <div class="card-actions">
              <button class="btn primary" title="Add to selected" disabled={selectedPacks.ids?.includes(k)} onclick={() => addToSelected(k)}>Add</button>
              <button class="btn" title="Mutate pack (edit or clone)" onclick={() => openPackEditorForId(k)}>Mutate</button>
            </div>
          </div>
        {/each}
      {/await}
    </div>
  </div>
</div>
{:else}
  <PackEditor />
{/if}

<style>
.content { padding: 16px; display: flex; flex-direction: column; gap: 16px; max-width: var(--du-maxw, 1100px); margin: 0 auto; }
.beta-banner { display:flex; align-items:center; gap:10px; background: var(--du-highlight); border:1px solid #e5e388; color:#4a3b00; padding:8px 12px; border-radius: var(--du-radius); }
.beta-banner a { color: inherit; text-decoration: underline; }
.beta-badge { background:#ffb84d; color:#4a3b00; font-weight: 700; font-size: 0.72rem; padding:2px 6px; border-radius:4px; letter-spacing: .5px; }
.toolbar { display: flex; gap: 12px; align-items: flex-end; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--du-border); }
.toolbar .left { display: flex; flex-direction: column; }
.toolbar .left .muted { color: var(--du-muted); font-size: 0.9em; }
.toolbar .right { display: flex; gap: 6px; align-items: flex-end; flex-direction: column; }
.toolbar .right .actions-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.toolbar .right .subhead { position: relative; font-size: 12px; font-weight: 800; letter-spacing: .08em; color: #111827; text-transform: uppercase; padding-bottom: 6px; align-self: flex-end; }
.toolbar .right .subhead::after { content: ""; position: absolute; right: 0; bottom: 0; width: 140px; height: 3px; background: #2f313a; }
.toolbar .left h1 { position: relative; display: inline-block; padding-bottom: 6px; }
.toolbar .left h1::after { content: ""; position: absolute; left: 0; bottom: 0; width: 120px; height: 3px; background: #2f313a; border-radius: 0; }
.user-pack { display: flex; gap: 8px; align-items: center; }
.dirty { background: repeating-linear-gradient(45deg, #FFFEAC, #FFFEAC 6px, #f1ea7d 6px, #f1ea7d 12px); color: #3a3200; border: 1px solid #b3ac5a; padding: 2px 6px; border-radius: var(--du-radius); font-weight: 700; }
.primary { background: var(--du-accent); color: var(--du-accent-contrast); }
.icon { border-radius: var(--du-radius); width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; }
.status { display:flex; gap: 12px; align-items: center; flex-wrap: wrap; color: var(--du-muted); }
.progress { position: relative; width: 160px; height: 8px; background: #E9ECFF; border-radius: var(--du-radius); overflow: hidden; border: 1px solid var(--du-border); }
.progress::after { content: ""; position: absolute; inset: 0; width: calc(var(--p, 0) * 1%); background: black; border-radius: var(--du-radius); }
.divider { width: 1px; height: 16px; background: var(--du-border); }
.pill { padding: 2px 8px; border-radius: 999px; border: 1px solid var(--du-border); font-size: 12px; }
.pill.active { background: #fff2cc; color: #7a5d00; border-color: #e5c566; }
.pill.idle { background: #f3f4f6; color: #6b7280; }
.transfer-details { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; border: 1px dashed var(--du-border); background: #fbfbfd; padding: 8px; border-radius: 8px; margin-top: 6px; }
.errors { display:flex; flex-direction: column; gap:4px; }
.error { color: var(--du-danger); background:#ffecec; border:1px solid #ffc1c1; padding:4px 8px; border-radius:6px; }
.pane { display: flex; flex-direction: column; gap: 8px; }
.pane-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.inline-actions { display: flex; gap: 8px; align-items: center; }
.selected-list { display: flex; flex-direction: column; gap: 6px; }
.row { display: grid; grid-template-columns: 46px 80px 1fr 90px auto; align-items: center; gap: 8px; padding: 10px; border: 1px solid #2f313a; border-radius: var(--du-radius); background: #fcfcfd; box-shadow: none; }
.row.overflow { border-color: #ffb0b0; background: #fff7f7; }
.row.empty { opacity: 0.75; background: #f9fafb; }
.index { text-align: center; background:#111827; color:#fff; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid #000; }
.badge { padding: 2px 8px; border-radius: var(--du-radius); font-size: 0.75em; text-transform: capitalize; border: 1px solid var(--du-border); background: #f9fafb; }
.badge.official { background:#eef5ff; color:#1f4fd6; border-color:#cfe0ff; }
.badge.public { background:#eef9f3; color:#1d6f3a; border-color:#cfeedd; }
.badge.local { background:#f3f4f6; color:#4b5563; }
.badge.archive { background:#fff7ed; color:#9a3412; border-color:#fed7aa; }
.usage { text-align: right; font-variant-numeric: tabular-nums; color: #555; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.actions .btn { border: 1px solid #2f313a; background: #f2f3f5; color: #111827; border-radius: var(--du-radius); padding: 6px 8px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.actions .btn:hover { background: #e9ebee; }
.actions button:disabled, .button-link:disabled { opacity: 0.5; cursor: not-allowed; }
/* Disabled look for top toolbar actions */
.toolbar .right .actions-row .btn:disabled { background: #f3f4f6; color: #9ca3af; border-color: #e5e7eb; cursor: not-allowed; pointer-events: none; opacity: 0.7; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.card { border: 1px solid #2f313a; border-radius: var(--du-radius); background: #fcfcfd; padding: 12px; display:flex; flex-direction: column; gap: 8px; box-shadow: none; min-height: 170px; }
.card.disabled { opacity: 0.6; filter: grayscale(0.1); }
.card-actions { margin-top: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid var(--du-border); }
.card-actions .btn { appearance: none; -webkit-appearance: none; border: 1px solid var(--du-border); background: #fff; color: var(--du-text); padding: 6px 10px; font-size: 13px; line-height: 1; border-radius: var(--du-radius); cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
.card-actions .btn:hover { background: #f9fafb; }
.card-actions .btn.primary { background: #2b2f36; color: #fff; border-color: #1f2329; }
.card-actions .btn.primary:hover { filter: brightness(0.97); }
/* removed caution/success/danger unused selectors during migration */
.card-actions .btn:disabled { background: #f3f4f6; color: #9ca3af; border-color: #e5e7eb; cursor: not-allowed; pointer-events: none; }
.card.selected { border: 3px solid black; }
.card.selected .title, .card.selected .meta { opacity: 0.7; }
.title { font-weight: 600; color: var(--du-text); }
.title { text-transform: uppercase; letter-spacing: .04em; }
.name.muted { color: #9ca3af; font-style: italic; }
.footnote { color: var(--du-muted); font-size: 0.9em; }
.button-link { display: inline-flex; align-items: center; justify-content: center; padding: 6px 10px; border: 1px solid var(--du-border); border-radius: var(--du-radius); text-decoration: none; color: inherit; white-space: nowrap; background: #fff; font-size: 13px; }
.desc { color:#444; font-size: 0.9em; }
.outofsync { margin-left: 8px; color: #a40000; font-weight: 600; font-size: 0.85em; }

/* Modal */
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: grid; place-items: center; z-index: 1000; padding: 12px; }
.modal { background: white; border-radius: var(--du-radius); border: 1px solid var(--du-border); width: min(800px, 90vw); max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--du-shadow); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #eee; }
.modal-body { padding: 0; }
.json-block { margin: 0; padding: 12px; background: #0b1020; color: #d7e2ff; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; line-height: 1.4; max-height: 60vh; overflow: auto; }
.modal-actions { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-top: 1px solid #eee; }
.copied { color: #2e7d32; font-weight: 600; }
</style>
