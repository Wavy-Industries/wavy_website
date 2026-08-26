<script>
  import { onMount } from 'svelte';
  const { json, onSave, onClose } = $props();
  let jsonText = $state(JSON.stringify(json ?? {}, null, 2));
  let saveError = $state('');
  let jsonAreaEl = null;

  function close() {
    if (JSON.stringify(jsonText) !== JSON.stringify(JSON.stringify(json ?? {}, null, 2))) {
      const confirmed = window.confirm('You have unsaved changes. Discard and close?');
      if (!confirmed) return;
    }
    onClose && onClose();
  }
  function handleBackdropKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      close();
    }
  }
  function handleModalKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      close();
    }
  }
  // onSave may return a message to reject the input; the dialog then stays open and shows it
  function handleSave() {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      saveError = e?.message ? `Invalid JSON: ${e.message}` : 'Invalid JSON';
      return;
    }
    const rejection = typeof onSave === 'function' ? onSave(parsed) : null;
    if (typeof rejection === 'string' && rejection.length > 0) {
      saveError = rejection;
      return;
    }
    saveError = '';
    onClose && onClose(); // saved, so skip the unsaved-changes prompt in close()
  }

  onMount(() => {
    try {
      if (jsonAreaEl && typeof jsonAreaEl.focus === 'function') {
        jsonAreaEl.focus();
        if (typeof jsonAreaEl.select === 'function') jsonAreaEl.select();
      }
    } catch {}
  });
</script>

<div class="modal-backdrop" role="button" tabindex="0" onclick={close} onkeydown={handleBackdropKeydown}>
  <div class="modal" role="dialog" aria-modal="true" tabindex="0" onclick={(e)=>e.stopPropagation()} onkeydown={handleModalKeydown}>
    <div class="modal-header">
      <div class="title">View & edit raw JSON</div>
      <button class="icon" onclick={close}>✕</button>
    </div>
    <div class="modal-body padded">
      <textarea class="json-input" bind:value={jsonText} bind:this={jsonAreaEl} placeholder='Paste loops array or an object with a "loops" array'></textarea>
      {#if saveError}
        <div class="save-error" role="alert">{saveError}</div>
      {/if}
    </div>
    <div class="modal-actions">
        <button class="button-link" onclick={close}>Cancel</button>
        <button class="button-link" onclick={handleSave}>Save & Close</button>
    </div>
  </div>
</div>

<style>
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: grid; place-items: center; z-index: 1000; padding: 12px; }
.modal { background: white; border-radius: var(--du-radius); border: 1px solid var(--du-border); width: min(800px, 90vw); max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--du-shadow); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #eee; }
.modal-header .title { font-weight: 600; }
.modal-body { padding: 0; }
.modal-body.padded { padding: 12px; display:flex; flex-direction:column; gap:8px; }
.modal-actions { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-top: 1px solid #eee; }
.save-error { border: 1px solid #ef4444; background: #fef2f2; color: #991b1b; border-radius: var(--du-radius); padding: 8px 10px; font-size: 12px; }
.json-input { width: 100%; min-height: 220px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
.button-link { display:inline-flex; align-items:center; justify-content:center; padding:6px 10px; border:1px solid var(--du-border); border-radius:var(--du-radius); background:#fff; color:inherit; text-decoration:none; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.icon { width: 36px; height: 36px; border-radius: var(--du-radius); display: inline-flex; align-items: center; justify-content: center; }
</style>
