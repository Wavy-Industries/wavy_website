<script>
  import { getPackType } from "~/features/device-utility/utils/samples";
  const { type = null, id = null } = $props();
  const effectiveType = $derived(type || (id ? getPackType(id) : null));
  const help = {
    Local: 'This is a local pack which is stored in your browser',
    Archive: 'This is an archive of a pack which used to be publicly available',
    User: 'This is a user made pack which has been made publicly available by submitting it to Wavy Industries',
    Official: 'This is a pack which is made publicly available by the Wavy team'
  };
  const titleText = $derived(effectiveType ? help[effectiveType] : '');
  const cls = $derived(effectiveType ? `badge ${effectiveType.toLowerCase()}` : 'badge');
</script>

{#if effectiveType}
  <span class={cls} title={titleText} aria-label={`${effectiveType} pack`}>{effectiveType}</span>
{/if}

<style>
  .badge { padding: 2px 8px; border-radius: var(--du-radius); font-size: 0.75em; text-transform: capitalize; border: 1px solid var(--du-border); background: #f9fafb; display: inline-flex; align-items: center; }
  .badge.official { background:#eef5ff; color:#1f4fd6; border-color:#cfe0ff; }
  .badge.user { background:#eef9f3; color:#1d6f3a; border-color:#cfeedd; }
  .badge.local { background:#f3f4f6; color:#4b5563; }
  .badge.archive { background:#fff7ed; color:#9a3412; border-color:#fed7aa; }
</style>
