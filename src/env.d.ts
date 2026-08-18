/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module 'virtual:asset-hashes' {
	/** `/assets/...` path -> short content hash, generated in astro.config.mjs */
	const assetHashes: Record<string, string | undefined>;
	export default assetHashes;
}
