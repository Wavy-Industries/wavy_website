<script>
    import { sampleState, addPackToSelected, removeSelectedAt, moveSelected, uploadSelected, loadInitialData, openPackEditorFor, revertToDevice, deviceSampleUploadDefault, deleteUserPackById } from "~/features/device-utility/stores/samples.svelte";
    import { packDisplayName, canonicalIdKey, deviceIndexForDisplay } from "~/features/device-utility/utils/packs";
    import { onMount } from 'svelte';
    import PackEditor from '~/features/device-utility/views/PackEditor.svelte';

    const storagePercentage = $derived(sampleState.storageUsed != null && sampleState.storageTotal != null ? (sampleState.storageUsed/sampleState.storageTotal * 100).toFixed(1) : "??.?")

    onMount(() => { loadInitialData(); });

    const isSelected = (id) => sampleState.selected.some(x => canonicalIdKey(x.id) === canonicalIdKey(id));

    function mailtoForUserPack(id) {
      const meta = sampleState.userPacks.find(p => p.id === id);
      const page = meta?.loops;
      const subject = encodeURIComponent('WAVY MONKEY sample pack proposal');
      const packName = packDisplayName(id).slice(0,7);
      const pretty = page ? JSON.stringify(page, null, 2) : '{}';
      const body = encodeURIComponent(
        'Hi WAVY team,\n\n' +
        'I would like to propose a public sample pack for MONKEY.\n' +
        'Please find the details below.\n\n' +
        'Author: <your name here>\n' +
        `Pack name (max 7 characters): ${packName}\n\n` +
        'Here is the sample pack content, cheers:\n\n' +
        pretty
      );
      return `mailto:hello@wavyindustries.com?subject=${subject}&body=${body}`;
    }
</script>

{#if !sampleState.editor.open}
<div class="content">
  <div class="beta-banner">
    <span class="beta-badge">BETA</span>
    <span>This feature is in beta — please report issues to <a href="mailto:hello@wavyindustries.com">hello@wavyindustries.com</a>.</span>
  </div>
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
          <span class="name" title={(p.author || p.created) ? `${p.author ?? ''}${p.author && p.created ? ' • ' : ''}${p.created ?? ''}` : ''}>{packDisplayName(p.id)}</span>
          {#if sampleState.storageTotal && sampleState.storagePacksUsed && i < 10}
            {@const used = sampleState.storagePacksUsed?.[deviceIndexForDisplay(i)]}
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
        <div class="card" class:selected={isSelected(p.id)}>
          <div class="title"><span class="badge {p.type}">{p.type}</span> {packDisplayName(p.id)}</div>
          <div class="meta">
            {#if p.author || p.created}
              <span>{p.author ?? ''}{p.author && p.created ? ' • ' : ''}{p.created ?? ''}</span>
            {:else}
              <span>{p.source}</span>
            {/if}
          </div>
          <div class="actions">
            <button title="Add to selected" onclick={() => addPackToSelected(p.id)} disabled={isSelected(p.id)}>↑ add</button>
            <button title="Edit pack" onclick={() => openPackEditorFor(p.id)}>✎</button>
            {#if p.source === 'user_local'}
              <button title="Delete user pack" onclick={() => deleteUserPackById(p.id)}>🗑</button>
              <a class="button-link publish" title="Publish pack via email" href={mailtoForUserPack(p.id)}>📤 Publish</a>
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
.beta-banner { display:flex; align-items:center; gap:10px; background:#fff8e6; border:1px solid #ffe1a3; color:#7a5a00; padding:8px 12px; border-radius:6px; }
.beta-banner a { color: inherit; text-decoration: underline; }
.beta-badge { background:#ffb84d; color:#4a3b00; font-weight: 700; font-size: 0.75rem; padding:2px 6px; border-radius:4px; letter-spacing: .5px; }
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
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.card { border: 1px solid #ddd; border-radius:4px; background: white; padding: 10px; display:flex; flex-direction: column; gap: 6px; }
.card.selected .title, .card.selected .meta { opacity: 0.5; }
.title { font-weight: 600; }
.footnote { opacity: 0.7; font-size: 0.9em; }
.button-link { display: inline-flex; align-items: center; justify-content: center; padding: 4px 8px; border: 1px solid #ddd; border-radius:4px; text-decoration: none; color: inherit; white-space: nowrap; }
.button-link.publish { color: #0B5FFF; border-color: #BFD6FF; }
.button-link.publish:hover { background: #F3F8FF; }
</style>
