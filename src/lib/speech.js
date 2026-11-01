export const canSpeak =
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  'SpeechSynthesisUtterance' in window;

/** Read a word aloud with the browser's built-in voices (no network needed). */
export function speak(text, lang = 'en-GB') {
  if (!canSpeak) return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech is a nicety; ignore failures.
  }
}
