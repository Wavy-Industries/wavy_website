<script>
    import { sampleState, addPackToSelected, removeSelectedAt, moveSelected, uploadSelected, loadInitialData, openPackEditorFor, revertToDevice, deviceSampleUploadDefault, deleteUserPackById } from "~/features/device-utility/stores/samples.svelte";
    import { packDisplayName } from "~/features/device-utility/utils/packs";
    import { onMount } from 'svelte';
    import PackEditor from '~/features/device-utility/views/PackEditor.svelte';

    const storagePercentage = $derived(sampleState.storageUsed != null && sampleState.storageTotal != null ? (sampleState.storageUsed/sampleState.storageTotal * 100).toFixed(1) : "??.?")

    onMount(() => { loadInitialData(); });

    const typeCharFromId = (id) => {
      if (!id) return 'U';
      if (id.startsWith('W-')) return 'W';
      if (id.startsWith('P-')) return 'P';
      if (id.startsWith('U-')) return 'U';
      const c = id[0];
      return (c === 'W' || c === 'P' || c === 'U') ? c : 'U';
    };
    const baseNameFromId = (id) => {
      if (!id) return '';
      if (id.startsWith('W-') || id.startsWith('P-') || id.startsWith('U-')) return id.substring(2);
      if (id[0] === 'W' || id[0] === 'P' || id[0] === 'U') return id.substring(1).trim();
      return id;
    };
    const canonicalKey = (id) => `${typeCharFromId(id)}|${baseNameFromId(id)}`;
    const isSelected = (id) => sampleState.selected.some(x => canonicalKey(x.id) === canonicalKey(id));
</script>

{#if !sampleState.editor.open}
<div class="content">
  <div class="toolbar">
    <div class="left">
      <h1>Sample Manager</h1>
      <span class="muted">Selected packs on top; available below.</span>
    </div>
    <div class="right">
      <button class="icon green" title="Create new pack" aria-label="Create new pack" onclick={() => openPackEditorFor(null)}>➕</button>
      <button class="icon" title="Revert device samples to default" aria-label="Revert device samples to default" onclick={deviceSampleUploadDefault} disabled={sampleState.uploadPercentage != null}>⟲</button>
      <button class="icon" title="Sync to device" aria-label="Sync to device" onclick={revertToDevice} disabled={!sampleState.dirty}>←</button>
      <button class="icon primary" title="Upload samples to device" aria-label="Upload" onclick={uploadSelected} disabled={sampleState.uploadPercentage != null}>→</button>
    </div>
  </div>
  <div class="status">
    <span>Storage used: {storagePercentage}%</span>
    {#if sampleState.uploadPercentage != null}
      <span>Uploading... {sampleState.uploadPercentage == 0 ? "(preparing device)" : `${sampleState.uploadPercentage}%`}</span>
    {/if}
    {#if sampleState.dirty}<span class="dirty">unsaved changes</span>{/if}
  </div>

  <div class="pane">
    <h3>Selected Packs</h3>
    <div class="selected-list">
      {#each sampleState.selected as p, i}
        <div class="row" class:overflow={i>=10}>
          <span class="index">{i<9 ? i+1 : (i===9 ? 0 : '-')}</span>
          <span class="badge {p.type}">{p.type}</span>
          <span class="name">{packDisplayName(p.id)}</span>
          {#if sampleState.storageTotal && sampleState.storagePacksUsed && i < 10}
            {@const used = sampleState.storagePacksUsed?.[(i + 1) % 10]}
            <span class="usage">{used != null ? ((used / sampleState.storageTotal * 100).toFixed(1) + '%') : ''}</span>
          {/if}
          <div class="actions">
            <button title="Move up" onclick={() => moveSelected(i, -1)}>↑</button>
            <button title="Move down" onclick={() => moveSelected(i, 1)}>↓</button>
            <button title="Remove" onclick={() => removeSelectedAt(i)}>✕</button>
            <button title="Edit pack" onclick={() => openPackEditorFor(p.id)}>✎</button>
          </div>
        </div>
      {/each}
      {#if sampleState.selected.length === 0}
        <div class="hint">No packs selected — add from below.</div>
      {/if}
    </div>
  </div>

  <div class="pane">
    <h3>Available Packs</h3>
    <div class="grid">
      {#each sampleState.available as p}
        <div class="card">
          <div class="title"><span class="badge {p.type}">{p.type}</span> {packDisplayName(p.id)}</div>
          <div class="meta">{p.source}</div>
          <div class="actions">
            <button title="Add to selected" onclick={() => addPackToSelected(p.id)} disabled={isSelected(p.id)}>↑ add</button>
            <button title="Edit pack" onclick={() => openPackEditorFor(p.id)}>✎</button>
            {#if p.source === 'user_local'}
              <button title="Delete user pack" onclick={() => deleteUserPackById(p.id)}>🗑</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>

</div>
{:else}
  <PackEditor />
{/if}

<style>
.content { padding: 20px; display: flex; flex-direction: column; gap: 20px; }
.toolbar { display: flex; flex-direction: row; gap: 10px; align-items: center; justify-content: space-between; }
.toolbar .left { display: flex; flex-direction: column; }
.toolbar .left .muted { opacity: 0.7; font-size: 0.9em; }
.toolbar .right { display: flex; gap: 8px; align-items: center; }
.user-pack { display: flex; gap: 8px; align-items: center; }
.user-pack textarea { width: 320px; height: 60px; }
.dirty { color: #E67E22; font-style: italic; }
.primary { background:#0082FC; color:white; }
.green { background:#2ecc71; color:white; }
.icon { border-radius: 4px; width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; }
.status { display:flex; gap: 12px; align-items: center; }
.pane { display: flex; flex-direction: column; gap: 8px; }
.selected-list { display: flex; flex-direction: column; gap: 6px; }
	.row { display: grid; grid-template-columns: 40px 80px 1fr 90px auto; align-items: center; gap: 8px; padding: 8px; border: 1px solid #ddd; border-radius:4px; background: white; }
.row.overflow { border-color: #ffb0b0; background: #fff3f3; }
.index { text-align: center; opacity: 0.7; }
.badge { padding: 2px 6px; border-radius: 3px; font-size: 0.8em; text-transform: capitalize; }
.badge.official { background:#dff0ff; color:#0066cc; }
.badge.public { background:#eef9e9; color:#2e7d32; }
	.badge.private { background:#f3f3f3; color:#555; }
	.usage { text-align: right; font-variant-numeric: tabular-nums; color: #555; }
.actions { display: flex; gap: 6px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.card { border: 1px solid #ddd; border-radius:4px; background: white; padding: 10px; display:flex; flex-direction: column; gap: 6px; }
  .card.disabled { opacity: 0.5; }
.title { font-weight: 600; }
.footnote { opacity: 0.7; font-size: 0.9em; }
</style>
