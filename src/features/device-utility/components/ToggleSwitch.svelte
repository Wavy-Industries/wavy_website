<script>
    const { init, onChange } = $props();

    let on = $state(init);

    $effect(() => {
        onChange?.(on);
    });
</script>

<div class="toggle-container">
  <label class="switch" aria-label="toggle">
    <input type="checkbox" bind:checked={on} />
    <span class="track"><span class="knob"></span></span>
  </label>
</div>

<style>
    .toggle-container {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .switch { position: relative; display: inline-block; width: 48px; height: 22px; }

    .switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    .track { position: absolute; inset: 0; background: #f2f3f5; border: 1px solid #2f313a; border-radius: var(--du-radius); display: inline-block; transition: background-color .12s ease, border-color .12s ease; }
    .knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: #fff; border: 1px solid #2f313a; border-radius: var(--du-radius); transition: transform .12s ease, border-color .12s ease, background-color .12s ease; }
    input:checked + .track { background: var(--du-success); border-color: #1f2329; }
    input:checked + .track .knob { transform: translateX(26px); border-color: #12202a; }
</style>
