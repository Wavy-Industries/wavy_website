<script lang="ts">
  let { value } = $props<{ value: string }>();
  function cells(): string[] {
    const v = (value || '').slice(0, 7);
    const arr = Array.from(v as string) as string[];
    while (arr.length < 7) arr.push('');
    return arr;
  }
</script>

<div class="nameboxes" aria-label="Pack name visual">
  {#each cells() as c, i}
    <span class="cell" aria-hidden="true">{c || '\u00A0'}</span>
  {/each}
</div>

<style>
  .nameboxes { display: inline-flex; gap: 4px; align-items: center; }
  .cell { width: 18px; height: 22px; border: 1px solid var(--du-border); border-radius: 4px; display: inline-grid; place-items: center; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; background: #fff; }

  @media (max-width: 900px) {
    .nameboxes { gap: 3px; }
    .cell { width: 16px; height: 20px; font-size: 11px; }
  }
</style>

