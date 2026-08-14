import assetHashes from 'virtual:asset-hashes';

/**
 * Appends a content hash to a `/assets/...` URL so browsers refetch the file
 * whenever it changes, instead of serving a stale cached copy.
 *
 * The query itself is never read by the server — it only varies the cache key.
 * Unknown paths are returned untouched, so a missing hash degrades to the old
 * (cacheable) behaviour rather than breaking the fetch.
 */
export function assetUrl(path: string): string {
    const hash = assetHashes[path] ?? assetHashes[decodePath(path)];
    return hash ? `${path}?v=${hash}` : path;
}

/** Call sites may percent-encode segments; the hash map is keyed on raw paths. */
function decodePath(path: string): string {
    try {
        return decodeURIComponent(path);
    } catch {
        return path;
    }
}
