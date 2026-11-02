import { useCallback, useEffect, useState } from 'react';

/**
 * The browser's "install this app" prompt (Chrome, Edge, Android).
 * canInstall is true once the browser offers it and the app is not installed;
 * install() shows the prompt. Safari has no such prompt: there canInstall stays false.
 */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState(null);

  useEffect(() => {
    const keep = (event) => {
      event.preventDefault(); // show it from our own button instead of the browser's banner
      setPrompt(event);
    };
    const forget = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', keep);
    window.addEventListener('appinstalled', forget);
    return () => {
      window.removeEventListener('beforeinstallprompt', keep);
      window.removeEventListener('appinstalled', forget);
    };
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => null);
    setPrompt(null); // a prompt can only be shown once
  }, [prompt]);

  return { canInstall: Boolean(prompt), install };
}
