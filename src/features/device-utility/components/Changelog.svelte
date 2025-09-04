<script>
    import { firmwareState } from "~/features/device-utility/states/firmware.svelte";

    const changelog = $derived(firmwareState.changelog);

    const { beta } = $props();
</script>

<div id="changelog">
  <div class="header">
    <h3>Changelog</h3>
  </div>
  <div class="list">
    {#each changelog?.versions as version}
      {#if !version.isObsolete && (!version.isDev || beta)}
        <div class="item">
          <div class="item-head">
            <div class="left">
              <span class="ver">{version.version.versionString}</span>
              {#if version.highlight}
                <span class="highlight">{version.highlight}</span>
              {/if}
              {#if version.isDev}
                <span class="badge beta">BETA</span>
              {/if}
            </div>
            <div class="right">
              <span class="date">{version.date ?? ''}</span>
            </div>
          </div>
          {#if version.changes?.length}
            <ul class="changes">
              {#each version.changes as change}
                <li>{change}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
#changelog { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.header h3 { position: relative; padding-bottom: 6px; margin: 0; text-transform: uppercase; letter-spacing: .04em; }
.header h3::after { content: ""; position: absolute; left: 0; bottom: 0; width: 140px; height: 3px; background: #2f313a; }
.list { display: flex; flex-direction: column; gap: 10px; }
.item { border: 1px solid #2f313a; border-radius: var(--du-radius); background: #fcfcfd; padding: 10px; }
.item-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.item-head .left { display: flex; align-items: center; gap: 8px; }
.ver { font-weight: 700; }
.highlight { color: #111827; font-weight: 600; }
.badge.beta { background: var(--du-highlight); color: #3a3200; border: 1px solid #b3ac5a; padding: 2px 6px; border-radius: var(--du-radius); font-size: 11px; font-weight: 800; letter-spacing: .04em; }
.date { color: var(--du-muted); font-size: 12px; }
.changes { margin: 0; padding-left: 18px; }
.changes li { margin-bottom: 3px; }
</style>
