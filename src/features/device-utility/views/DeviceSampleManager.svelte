<script>
    import { sampleState, addPackToSelected, removeSelectedAt, moveSelected, uploadSelected, loadInitialData, openPackEditorFor, revertToDevice, deviceSampleUploadDefault, deleteUserPackById } from "~/features/device-utility/stores/samples.svelte";
    import { packDisplayName, canonicalIdKey, deviceIndexForDisplay } from "~/features/device-utility/utils/packs";
    import { getPageByteSize } from "~/lib/parsers/samples_parser";
    import { onMount } from 'svelte';
    import PackEditor from '~/features/device-utility/views/PackEditor.svelte';

    const storagePercentage = $derived(sampleState.storageUsed != null && sampleState.storageTotal != null ? (sampleState.storageUsed/sampleState.storageTotal * 100).toFixed(1) : "??.?")

    onMount(() => { loadInitialData(); });

    const isSelected = (id) => sampleState.selected.some(x => x && canonicalIdKey(x.id) === canonicalIdKey(id));

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
        'Description: <one sentence about the pack>\n' +
        `Pack name (max 7 characters): ${packName}\n\n` +
        'Here is the sample pack content, cheers:\n\n' +
        pretty
      );
      return `mailto:hello@wavyindustries.com?subject=${subject}&body=${body}`;
    }

    function usagePercentFor(p, i) {
      if (!(i < 10)) return '';
      const total = sampleState.storageTotal || 0;
      if (!total) return '';
      if (!p) return '';
      // For user-local packs, estimate from encoded page size
      if (p?.source === 'user_local') {
        const page = p.loops || sampleState.userPacks.find(x => x.id === p.id)?.loops;
        if (page) {
          try {
            const bytes = getPageByteSize(page);
            return ((bytes / total) * 100).toFixed(1) + '%';
          } catch {}
        }
      }
      // Otherwise, use device-reported usage if available
      const used = sampleState.storagePacksUsed?.[deviceIndexForDisplay(i)];
      if (used != null) return ((used / total) * 100).toFixed(1) + '%';
      return '';
    }

    // JSON dialog state
    let jsonDialog = $state({ open: false, title: '', content: '', copied: false });
    async function openJsonDialogFor(id) {
      jsonDialog.title = `${packDisplayName(id)} — JSON`;
      jsonDialog.copied = false;
      jsonDialog.content = 'Loading…';
      jsonDialog.open = true;
      try {
        const { getPackPageById } = await import('~/features/device-utility/stores/samples.svelte');
        const page = await getPackPageById(id);
        jsonDialog.content = JSON.stringify(page ?? {}, null, 2);
      } catch (_) {
        jsonDialog.content = '{}';
      }
    }
    function closeJsonDialog() { jsonDialog.open = false; }
    async function copyJsonToClipboard() {
      try {
        await navigator.clipboard.writeText(jsonDialog.content || '');
        jsonDialog.copied = true;
        setTimeout(() => { jsonDialog.copied = false; }, 1500);
      } catch (_) {
        // no-op
      }
    }
</script>

{#if !sampleState.editor.open}
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
        <button class="btn caution" title="Reset device samples to default" aria-label="Reset to default" onclick={deviceSampleUploadDefault} disabled={sampleState.uploadPercentage != null}>Reset to default</button>
        <button class="btn" title="Sync selection from device" aria-label="Sync from device" onclick={revertToDevice} disabled={!sampleState.dirty}>Sync from device</button>
        <button class="btn primary" title="Upload selected packs to device" aria-label="Upload to device" onclick={uploadSelected} disabled={sampleState.uploadPercentage != null}>Upload to device</button>
      </div>
    </div>
  </div>
  <div class="status">
    <span>Storage used: {storagePercentage}%</span>
    <div class="progress" style={`--p:${storagePercentage}`}></div>
    {#if sampleState.uploadPercentage != null}
      <span>Uploading... {sampleState.uploadPercentage == 0 ? "(preparing device)" : `${sampleState.uploadPercentage}%`}</span>
    {/if}
    {#if sampleState.dirty}<span class="dirty">unsaved changes</span>{/if}
    {#if sampleState.errors.length > 0}
      <div class="errors">
        {#each sampleState.errors as e}
          <div class="error">{e}</div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="pane">
    <div class="pane-header"><h3>Selected Packs</h3></div>
    <div class="selected-list">
      {#each Array(10) as _, i}
        {#if sampleState.selected[i]}
          <div class="row">
            <span class="index">{i<9 ? i+1 : 0}</span>
            <span class="badge {sampleState.selected[i].type}">{sampleState.selected[i].type}</span>
            <span class="name" title={(sampleState.selected[i].author || sampleState.selected[i].created) ? `${sampleState.selected[i].author ?? ''}${sampleState.selected[i].author && sampleState.selected[i].created ? ' • ' : ''}${sampleState.selected[i].created ?? ''}` : ''}>{packDisplayName(sampleState.selected[i].id)}</span>
            <span class="usage">{usagePercentFor(sampleState.selected[i], i)}</span>
            <div class="actions">
              <button class="btn" title="Move up" onclick={() => moveSelected(i, -1)}>Move up</button>
              <button class="btn" title="Move down" onclick={() => moveSelected(i, 1)}>Move down</button>
              <button class="btn" title="Remove" onclick={() => removeSelectedAt(i)}>Remove</button>
              <button class="btn" title="Edit pack" onclick={() => openPackEditorFor(sampleState.selected[i].id)}>Edit</button>
            </div>
          </div>
        {:else}
          <div class="row empty">
            <span class="index">{i<9 ? i+1 : 0}</span>
            <span class="badge">empty</span>
            <span class="name muted">Empty slot</span>
            <span class="usage"></span>
            <div class="actions">
              <button class="btn" title="Move up" onclick={() => moveSelected(i, -1)}>Move up</button>
              <button class="btn" title="Move down" onclick={() => moveSelected(i, 1)}>Move down</button>
            </div>
          </div>
        {/if}
      {/each}
      {#if sampleState.selected.length > 10}
        {#each sampleState.selected.slice(10) as p, k}
          {#if p}
            <div class="row overflow">
              <span class="index">-</span>
              <span class="badge {p.type}">{p.type}</span>
              <span class="name" title={(p.author || p.created) ? `${p.author ?? ''}${p.author && p.created ? ' • ' : ''}${p.created ?? ''}` : ''}>{packDisplayName(p.id)}</span>
              <span class="usage"></span>
              <div class="actions">
                <button class="btn" title="Remove" onclick={() => removeSelectedAt(10 + k)}>Remove</button>
                <button class="btn" title="Edit pack" onclick={() => openPackEditorFor(p.id)}>Edit</button>
              </div>
            </div>
          {/if}
        {/each}
      {/if}
      {#if sampleState.selected.slice(0,10).every(x => !x) && sampleState.selected.length <= 10}
        <div class="hint">No packs selected — add from below.</div>
      {/if}
    </div>
  </div>

  <div class="pane">
    <div class="pane-header">
      <h3>Available Packs</h3>
      <div class="inline-actions">
        <button class="btn primary" title="Create new pack" aria-label="Create new pack" onclick={() => openPackEditorFor(null)}>+ Create Local pack</button>
      </div>
    </div>
    <div class="grid">
      {#each sampleState.available as p}
        <div class="card" class:selected={isSelected(p.id)} class:disabled={p?.disabled}>
          <div class="title"><span class="badge {p.type}">{p.type}</span> {packDisplayName(p.id)}</div>
          <div class="meta">
            {#if p.author || p.created}
              <span>{p.author}</span>
            {/if}
          </div>
          {#if p.description}
            <div class="desc">{p.description}</div>
          {/if}
          <div class="card-actions">
            <button class="btn primary" title="Add to selected" onclick={() => addPackToSelected(p.id)} disabled={p?.disabled || isSelected(p.id)}>Add</button>
            <button class="btn" title="Edit pack" onclick={() => openPackEditorFor(p.id)} disabled={p?.disabled}>Edit</button>
            {#if p.source === 'user_local'}
              <button class="btn danger" title="Delete user pack" onclick={() => deleteUserPackById(p.id)} disabled={p?.disabled}>Delete</button>
              <button class="btn success" title="Publish pack via email" onclick={() => (window.location.href = mailtoForUserPack(p.id))} disabled={p?.disabled}>Publish</button>
            {/if}
            <button class="btn" title="View raw JSON" onclick={() => openJsonDialogFor(p.id)} disabled={p?.disabled}>View raw</button>
          </div>
        </div>
      {/each}
    </div>
  </div>

</div>
{:else}
  <PackEditor />
{/if}

{#if jsonDialog.open}
  <div class="modal-backdrop" onclick={closeJsonDialog}>
    <div class="modal" onclick={(e)=>e.stopPropagation()}>
      <div class="modal-header">
        <div class="title">{jsonDialog.title}</div>
        <button class="icon" onclick={closeJsonDialog}>✕</button>
      </div>
      <div class="modal-body">
        <pre class="json-block">{jsonDialog.content}</pre>
      </div>
      <div class="modal-actions">
        <button class="button-link" onclick={copyJsonToClipboard}>Copy</button>
        {#if jsonDialog.copied}<span class="copied">Copied!</span>{/if}
      </div>
    </div>
  </div>
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
.user-pack textarea { width: 320px; height: 60px; }
.dirty { background: repeating-linear-gradient(45deg, #FFFEAC, #FFFEAC 6px, #f1ea7d 6px, #f1ea7d 12px); color: #3a3200; border: 1px solid #b3ac5a; padding: 2px 6px; border-radius: var(--du-radius); font-weight: 700; }
.primary { background: var(--du-accent); color: var(--du-accent-contrast); }
.icon { border-radius: var(--du-radius); width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; }
.status { display:flex; gap: 12px; align-items: center; flex-wrap: wrap; color: var(--du-muted); }
.progress { position: relative; width: 160px; height: 8px; background: #E9ECFF; border-radius: var(--du-radius); overflow: hidden; border: 1px solid var(--du-border); }
.progress::after { content: ""; position: absolute; inset: 0; width: calc(var(--p, 0) * 1%); background: black; border-radius: var(--du-radius); }
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
.usage { text-align: right; font-variant-numeric: tabular-nums; color: #555; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.actions .btn { border: 1px solid #2f313a; background: #f2f3f5; color: #111827; border-radius: var(--du-radius); padding: 6px 8px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.actions .btn:hover { background: #e9ebee; }
.actions button:disabled, .button-link:disabled { opacity: 0.5; cursor: not-allowed; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.card { border: 1px solid #2f313a; border-radius: var(--du-radius); background: #fcfcfd; padding: 12px; display:flex; flex-direction: column; gap: 8px; box-shadow: none; min-height: 170px; }
.card.disabled { opacity: 0.6; filter: grayscale(0.1); }
.card:hover { background-color: #f5f5f5; }
.card-actions { margin-top: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid var(--du-border); }
.card-actions .btn { appearance: none; -webkit-appearance: none; border: 1px solid var(--du-border); background: #fff; color: var(--du-text); padding: 6px 10px; font-size: 13px; line-height: 1; border-radius: var(--du-radius); cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
.card-actions .btn:hover { background: #f9fafb; }
.card-actions .btn.primary { background: #2b2f36; color: #fff; border-color: #1f2329; }
.card-actions .btn.primary:hover { filter: brightness(0.97); }
.card-actions .btn.caution { background: repeating-linear-gradient(45deg, #FFFEAC, #FFFEAC 6px, #f1ea7d 6px, #f1ea7d 12px); color: #3a3200; border-color: #b3ac5a; }
.card-actions .btn.success { background: var(--du-success); color: #fff; border-color: transparent; }
.card-actions .btn.success:hover { filter: brightness(0.97); }
.card-actions .btn.danger { border-color: #ffd2d2; color: #a40000; background: #fff5f5; }
.card-actions .btn.danger:hover { background: #ffecec; }
.card-actions .btn:disabled { background: #f3f4f6; color: #9ca3af; border-color: #e5e7eb; cursor: not-allowed; pointer-events: none; }
.card:hover { border-color: var(--du-border-strong); }
.card.selected { border: 3px solid black; }
.card.selected .title, .card.selected .meta { opacity: 0.7; }
.title { font-weight: 600; color: var(--du-text); }
.title { text-transform: uppercase; letter-spacing: .04em; }
.name.muted { color: #9ca3af; font-style: italic; }
.footnote { color: var(--du-muted); font-size: 0.9em; }
.button-link { display: inline-flex; align-items: center; justify-content: center; padding: 6px 10px; border: 1px solid var(--du-border); border-radius: var(--du-radius); text-decoration: none; color: inherit; white-space: nowrap; background: #fff; font-size: 13px; }
.desc { color:#444; font-size: 0.9em; }

/* Modal */
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: grid; place-items: center; z-index: 1000; padding: 12px; }
.modal { background: white; border-radius: var(--du-radius); border: 1px solid var(--du-border); width: min(800px, 90vw); max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--du-shadow); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #eee; }
.modal-header .title { font-weight: 600; }
.modal-body { padding: 0; }
.json-block { margin: 0; padding: 12px; background: #0b1020; color: #d7e2ff; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; line-height: 1.4; max-height: 60vh; overflow: auto; }
.modal-actions { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-top: 1px solid #eee; }
.copied { color: #2e7d32; font-weight: 600; }
</style>
