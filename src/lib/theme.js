/** Bootstrap's dark mode (data-bs-theme) follows the system setting, and updates when it changes. */
export function followSystemTheme(root = document.documentElement) {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const apply = () => root.setAttribute('data-bs-theme', media?.matches ? 'dark' : 'light');
  apply();
  media?.addEventListener?.('change', apply);
}
