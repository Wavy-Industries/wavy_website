<script>
    import { getOperatingSystem } from "~/lib/utils/operating_system";
    import { getBrowserRecommendations } from "~/lib/config/browserSupport";

    import chrome from '~/assets/icons/browsers/browser-chrome.svg'
    import edge from '~/assets/icons/browsers/browser-edge.svg'
    import bluefy from '~/assets/icons/browsers/browser-bluefy.webp'

    const os = getOperatingSystem();
    const support = getBrowserRecommendations(os);

    const iconFor = (id) => ({
        chrome,
        edge,
        bluefy,
    }[id]);
</script>

<div class="note" style="text-align: center;">

        It looks like your browser does not support Bluetooth :/<br />
        <p>{support.message}</p>
        {#if support.recs?.length}
            <div class="download-note">Press the button below to download.</div>
            <div class="browser-icons">
                {#each support.recs as rec}
                    {#if rec.url}
                        <a href={rec.url} target="_blank" rel="noreferrer">
                            <img src={iconFor(rec.id).src} alt={rec.name} title={rec.name} height="32px" />
                        </a>
                    {:else}
                        <img src={iconFor(rec.id).src} alt={rec.name} title={rec.name} height="32px" />
                    {/if}
                {/each}
            </div>
        {/if}


</div>

<style>
    img {
        margin: 20px 10px;
        height: 40px;
        border-radius: 10%;
    }
    .browser-icons {
        display: flex;
        gap: 1rem;
        justify-content: center;
        font-size: 2rem;
        margin-bottom: 0.5rem;
        flex-wrap: wrap;
    }
    .download-note {
        margin-top: 0.5rem;
        font-size: 0.9rem;
    }
    p {
        text-align: center;
        margin: 0;
    }
</style>
