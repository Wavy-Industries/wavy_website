<script>
    import { DeviceUtilityView, setHash } from '~/features/device-utility/states/window.svelte';
    import { deviceSupports } from '~/lib/config/deviceProfiles';
    import { disState } from '~/features/device-utility/states/dis.svelte';

    const deviceName = $derived(disState.modelNumber);

    const tools = $derived.by(() => {
        const items = [];
        if (deviceSupports(deviceName, DeviceUtilityView.Playground)) {
            items.push({
                id: DeviceUtilityView.Playground,
                title: 'Playground',
                description: 'play with our devices directly in the browser',
                icon: '🎹',
            });
        }
        if (deviceSupports(deviceName, DeviceUtilityView.DeviceUpdate)) {
            items.push({
                id: DeviceUtilityView.DeviceUpdate,
                title: 'Device Update',
                description: 'Check and install the latest firmware',
                icon: '⬆️',
            });
        }
        if (deviceSupports(deviceName, DeviceUtilityView.SampleManager)) {
            items.push({
                id: DeviceUtilityView.SampleManager,
                title: 'Pack Editor',
                description: 'Upload and manage sample packs',
                icon: '📦',
            });
        }
        return items;
    });
</script>

<div class="landing">
    <h2>Device Tools</h2>
    <div class="tile-grid">
        {#each tools as tool}
            <button class="tile" onclick={() => setHash(tool.id)}>
                <span class="tile-icon">{tool.icon}</span>
                <span class="tile-title">{tool.title}</span>
                <span class="tile-desc">{tool.description}</span>
            </button>
        {/each}
    </div>
</div>

<style>
    .landing {
        padding: 40px 20px;
    }
    h2 {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 24px;
        color: #2f313a;
    }
    .tile-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 16px;
        max-width: 800px;
    }
    .tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 8px;
        padding: 28px 20px;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        cursor: pointer;
        transition: box-shadow 150ms ease, transform 150ms ease, border-color 150ms ease;
    }
    .tile:hover {
        background: #f9fafb;
    }
    .tile-icon {
        font-size: 32px;
        line-height: 1;
    }
    .tile-title {
        font-size: 14px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #2f313a;
    }
    .tile-desc {
        font-size: 13px;
        color: #6b7280;
        line-height: 1.4;
    }
</style>
