import { generateSamplePack } from '~/js/data/samplePack';
import { bluetoothManager } from './Bluetooth.svelte';
import { mcumgr } from './mcumgr.svelte';
import { SampleManager } from '~/js/mcumgr/SampleManager';
import { canonicalize } from '~/js/utilities.js'

export const sampleManager = new SampleManager(mcumgr);

// if null, it means the device does not support samples, or perhaps failed to communicate for some reason
export const sampleState = $state({
	isSupported: false,
    isset: null,
	storageTotal: null,
    storageUsed: null,
	storagePacksUsed: null,
    names: null,
	uploadPercentage: null,
});

bluetoothManager.onConnect(() => {
	sampleState.isSupported = false;
	(async () => {
		const hasSamples = await checkDeviceHasSamples()
		hasSamples && await checkDeviceSamples()
	})();
    getAvailableSamples();
});

bluetoothManager.onConnectionReestablished(() => {
	sampleState.isSupported = false;
	(async () => {
		const hasSamples = await checkDeviceHasSamples()
		hasSamples && await checkDeviceSamples()
	})();
});

export const DEFAULT_PAGE_IDS = ["MIXED", "UNDRGND", "OLLI", "OG", null, null, null, null, null, null]

export async function deviceSampleUploadDefault() {
	await deviceSamplesUpload(DEFAULT_PAGE_IDS);
}

export async function deviceSamplesUpload(selectedIds: string[]) {
	const samplePack = await generateSamplePack(selectedIds)

	console.log("sample pack:")
	console.log(samplePack)

	// return;

	sampleState.uploadPercentage = 0;
    await sampleManager.uploadSamples(samplePack, (percent) => sampleState.uploadPercentage = percent);
	sampleState.uploadPercentage = null;

	await checkDeviceSamples()
}

export async function deviceSamplesDownloadMatchesDefault(): Promise<boolean> {
	// Generate the expected default pack using the same IDs used for default upload
	const generated = await generateSamplePack(DEFAULT_PAGE_IDS)
	const downloaded = await sampleManager.downloadSamples()

	if (!generated || !downloaded) {
		console.log("Generated or downloaded pack is null; cannot compare")
		return false;
	}

	const genCanonical = canonicalize(generated)
	const downCanonical = canonicalize(downloaded)
	const equal = JSON.stringify(genCanonical) === JSON.stringify(downCanonical)
	if (!equal) {
		console.log("Default generated pack (canonical):")
		console.log(genCanonical)
		console.log("Downloaded pack (canonical):")
		console.log(downCanonical)
	}
	return equal;
}

async function checkDeviceSamples() {
	try {
		const ids = await sampleManager.getIDs();
		sampleState.names = ids
		console.log("sample names:")
		console.log(sampleState.names)
		const storage = await sampleManager.getSpaceUsed();

		sampleState.storageUsed = storage.usd
		sampleState.storageTotal = storage.tot
		sampleState.storagePacksUsed = storage.packs
		console.log("storage used:")
		console.log(storage)
	} catch (e) {
		console.log(e)
	}
}

async function checkDeviceHasSamples() {
	console.log("checking sample manager state")
	try {
		sampleState.isset = await sampleManager.isSet();
		sampleState.isSupported = true;
		if (!sampleState.isset) {
			console.log("no samples are set, setting default")
			await deviceSampleUploadDefault()
			sampleState.isset = true;
		}
		return true;
	} catch (e) {
        console.log(e)
	}
	return false;
}

async function getAvailableSamples() {
    // const device_name = "MONKEY"; // TODO: use DIS instead to get the ID of the device
    // try {
    //     const response = await fetch(`/samples/${device_name}/DRM/record.json`);
    //     const data = await response.json();
    //     sampleState.names = data;
    // } catch (e) {
    //     console.error('Failed to get available samples:', e);
    //     sampleState.names = {};
    // }
}