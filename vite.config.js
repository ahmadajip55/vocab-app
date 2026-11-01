import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Writes dist/sw.js from src/pwa/sw.js with the list of every built file and a
 * version taken from that list. A new build therefore means a new service
 * worker, which caches the new files (so the app works offline) and removes the old ones.
 */
function serviceWorkerPlugin() {
  return {
    name: 'vocab-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle)
        .filter((file) => !file.endsWith('.map'))
        .sort();
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 10);
      const source = readFileSync(new URL('./src/pwa/sw.js', import.meta.url), 'utf8')
        .replace("const VERSION = 'dev';", `const VERSION = '${version}';`)
        .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(files)};`);
      if (!source.includes(version)) throw new Error('src/pwa/sw.js: VERSION placeholder not found');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// base './' makes the build work from any sub-path or static host.
// The app uses HashRouter, so no server-side rewrite rules are needed.
export default defineConfig({
  base: './',
  plugins: [react(), serviceWorkerPlugin()],
  css: {
    preprocessorOptions: {
      scss: {
        // Bootstrap 5.3's Sass still uses @import and older colour functions.
        quietDeps: true,
        silenceDeprecations: ['import', 'global-builtin', 'color-functions'],
      },
    },
  },
});
