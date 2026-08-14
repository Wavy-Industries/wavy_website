import { defineConfig } from 'astro/config';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import obsidianEmbeds from './tools/remark/obsidianEmbeds.js';
import firstParagraphIntro from './tools/remark/firstParagraphIntro.js';

import mdx from '@astrojs/mdx';

import svelte from '@astrojs/svelte';

// Content hash of every file under public/assets, exposed to the client as the
// `virtual:asset-hashes` module. These files are fetched at runtime and change
// independently of the code that fetches them (sample packs, drum kits), so
// without a changing URL browsers keep serving a stale copy. See assetUrl().
function assetHashes() {
  const virtualId = 'virtual:asset-hashes';
  const resolvedId = '\0' + virtualId;
  const assetsDir = new URL('./public/assets/', import.meta.url).pathname;

  function collect(dir, urlBase, out) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const url = posix.join(urlBase, entry.name);
      if (entry.isDirectory()) collect(path, url, out);
      else out[url] = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8);
    }
    return out;
  }

  return {
    name: 'wavy-asset-hashes',
    resolveId: (id) => (id === virtualId ? resolvedId : null),
    load(id) {
      if (id !== resolvedId) return null;
      return `export default ${JSON.stringify(collect(assetsDir, '/assets', {}))};`;
    },
  };
}

// https://astro.build/config
export default defineConfig({
  build: {
    format: 'directory',
    assets: 'build_assets'
  },
  // /cart was a real page before the cart became a panel. The deploy deletes
  // orphaned files, so without this it would 404 for anyone with a bookmark.
  redirects: {
    '/cart': '/monkey#cart',
  },
  markdown: {
    remarkPlugins: [obsidianEmbeds, firstParagraphIntro],
  },
  vite: {
    plugins: [assetHashes()],
    resolve: {
      alias: {
        // Sets up an alias so you can import from "src/" as if it were a root
        '~/': new URL('./src/', import.meta.url).pathname
      }
    }
  },
  integrations: [mdx(), svelte()]
});
