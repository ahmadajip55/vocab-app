/** Register the service worker (public/sw.js) in production builds, so the app installs and works offline. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Without it the app still works, just not offline.
    });
  });
}
