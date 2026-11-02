import { registerSW } from 'virtual:pwa-register';

/**
 * Register the service worker made by vite-plugin-pwa, so the app installs and
 * works offline. Production builds only; a new version is applied automatically.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  registerSW({ immediate: true });
}
