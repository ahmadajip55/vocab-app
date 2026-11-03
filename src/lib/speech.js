/**
 * Reading text aloud with the browser's built-in voices (speech synthesis, no network).
 *
 * Setting `utterance.lang` alone is not enough: when the browser does not pick a
 * voice for that language it reads with the default one (often English), which
 * mangles Japanese. So a voice for the language is chosen explicitly, and a
 * missing voice is reported instead of reading with the wrong one.
 */
/** The browser's speech engine, looked up when needed (so tests can provide one). */
const synth = () => globalThis.speechSynthesis;

export const canSpeak = () => Boolean(synth() && globalThis.SpeechSynthesisUtterance);

/** Playback speeds offered next to the Listen buttons. */
export const SPEECH_RATES = { normal: 1, slow: 0.7 };

/** Words in a voice name that usually mean a better-sounding voice. */
const PREFERRED_NAMES = /natural|neural|premium|enhanced|google/i;

const baseOf = (lang) => String(lang ?? '').toLowerCase().split(/[-_]/)[0];

/**
 * The best voice for `lang` ("ja-JP") from a list of SpeechSynthesisVoice-like
 * objects: the same language and region first, then the same language; among
 * those, better-sounding and on-device voices first. null when there is none.
 */
export function pickVoice(lang, voices = []) {
  const wanted = String(lang ?? '').toLowerCase().replace('_', '-');
  const base = baseOf(wanted);
  const score = (voice) => {
    const voiceLang = String(voice.lang ?? '').toLowerCase().replace('_', '-');
    if (baseOf(voiceLang) !== base) return -1;
    return (voiceLang === wanted ? 8 : 0) + (PREFERRED_NAMES.test(voice.name) ? 4 : 0) + (voice.localService ? 2 : 0) + (voice.default ? 1 : 0);
  };
  let best = null;
  let bestScore = -1;
  for (const voice of voices) {
    const value = score(voice);
    if (value > bestScore) [best, bestScore] = [voice, value];
  }
  return best;
}

/**
 * The browser's voices. Some browsers load them a moment after the page, so
 * this waits for them (up to `timeoutMs`) and resolves to [] when there are none.
 */
export function loadVoices(timeoutMs = 1500) {
  if (!canSpeak()) return Promise.resolve([]);
  const engine = synth();
  const now = engine.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      engine.removeEventListener?.('voiceschanged', done);
      resolve(engine.getVoices());
    };
    const timer = setTimeout(done, timeoutMs);
    engine.addEventListener?.('voiceschanged', done);
  });
}

export function stopSpeaking() {
  if (canSpeak()) synth().cancel();
}

/**
 * Reads `text` aloud with a voice for `lang`. Resolves to 'done', 'stopped', or
 * 'no-voice' (this device has no voice for the language), or 'unsupported'.
 * `onStart` runs when the voice starts speaking.
 */
export async function speak(text, lang = 'en-GB', { rate = SPEECH_RATES.normal, onStart } = {}) {
  if (!canSpeak() || !String(text ?? '').trim()) return 'unsupported';
  const voice = pickVoice(lang, await loadVoices());
  if (!voice) return 'no-voice';
  return new Promise((resolve) => {
    try {
      const utterance = new globalThis.SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang || lang;
      utterance.rate = rate;
      utterance.onstart = () => onStart?.();
      utterance.onend = () => resolve('done');
      utterance.onerror = (event) => resolve(event?.error === 'interrupted' || event?.error === 'canceled' ? 'stopped' : 'done');
      synth().cancel(); // only one thing speaks at a time
      synth().speak(utterance);
    } catch {
      resolve('unsupported'); // speech is a nicety; never break the page for it
    }
  });
}
