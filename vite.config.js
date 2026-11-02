import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import purgeCss from '@fullhuman/postcss-purgecss';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * The app is a PWA (installable, works offline) through vite-plugin-pwa:
 * it writes the web app manifest and a Workbox service worker that caches every
 * built file. A new build updates the installed app automatically.
 */
const pwa = VitePWA({
  // src/lib/pwa.js registers the worker itself (virtual:pwa-register).
  injectRegister: false,
  registerType: 'autoUpdate',
  includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
  manifest: {
    name: 'Vocab Cards',
    short_name: 'Vocab Cards',
    description: 'Practice vocabulary with study cards and quizzes.',
    lang: 'id',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#e8edf3',
    theme_color: '#0e7c6b',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // Every address (/words, /quiz/…) is the same page, so index.html is also the offline page.
    globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
    navigateFallback: '/index.html',
    cleanupOutdatedCaches: true,
  },
});

/**
 * Drops the Bootstrap classes the app never uses (most of its utility classes),
 * so the CSS that blocks the first paint is a fraction of the full framework.
 * Build only. A class built from a variable must be listed in `safelist`.
 */
const unusedCss = purgeCss({
  content: ['./index.html', './src/**/*.{js,jsx}'],
  safelist: {
    standard: [
      /^alert-(success|danger)$/, // `alert-${...}` in QuizSession
      /^(bg|border)-(success|warning|danger|secondary)$/, // `bg-${STATUS_COLORS[...]}` and `border-${...}`
    ],
    greedy: [/data-bs-theme/], // dark mode
  },
});

/**
 * Puts the main stylesheet inside index.html instead of linking it, so the
 * first paint does not wait for a separate CSS request (index.html is cached by
 * the service worker, so the styles work offline too). Relative url()s, such as
 * the font files, are rewritten to stay correct from the page's folder.
 */
function inlineEntryCss() {
  return {
    name: 'vocab-inline-entry-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, { bundle }) {
        return html.replace(/<link rel="stylesheet"[^>]*href="\.?\/([^"]+\.css)"[^>]*>/g, (tag, file) => {
          const asset = bundle?.[file];
          if (!asset || asset.type !== 'asset') return tag;
          const folder = file.slice(0, file.lastIndexOf('/') + 1); // "assets/"
          const css = String(asset.source).replace(/url\((["']?)\.\//g, `url($1./${folder}`);
          return `<style>${css}</style>`;
        });
      },
    },
  };
}

/**
 * Lets the app shell in index.html (header and loader) paint before the app's
 * JavaScript is requested: the entry script is imported right after the first
 * frame, about 16 ms later (250 ms at most, for a tab opened in the background).
 * Requesting it earlier (even as a modulepreload) can make the first paint wait
 * for the whole app on a slow connection.
 */
function paintShellFirst() {
  return {
    name: 'vocab-paint-shell-first',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (tag, src) =>
          // requestAnimationFrame does not run in a background tab, hence the timeout as a fallback.
          `<script type="module">let started = false; const start = () => { if (!started) { started = true; import(${JSON.stringify(src)}); } }; requestAnimationFrame(() => setTimeout(start)); setTimeout(start, 250);</script>`,
        );
      },
    },
  };
}

// Addresses have no "#" (BrowserRouter), so files are served from the site root ('/'),
// and the host must answer every app address (/words, /quiz/…) with index.html.
// `vite preview` does; most static hosts need a "single-page app" rewrite rule.
export default defineConfig(({ command }) => ({
  base: '/',
  plugins: [react(), pwa, inlineEntryCss(), paintShellFirst()],
  css: {
    postcss: { plugins: command === 'build' ? [unusedCss] : [] },
    preprocessorOptions: {
      scss: {
        // Bootstrap 5.3's Sass still uses @import and older colour functions.
        quietDeps: true,
        silenceDeprecations: ['import', 'global-builtin', 'color-functions'],
      },
    },
  },
}));
