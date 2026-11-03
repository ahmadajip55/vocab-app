import { SPEECH_RATES, speak, stopSpeaking } from './speech.js';
import { readPreference, writePreference } from './preferences.js';

export const RATE_KEY = 'vocab-app:speech-rate';

/** Identifies one piece of text in one voice language ("ja-JP:たべる"). */
export const speechKey = (text, lang) => `${lang}:${text}`;

/**
 * One speech state for the whole app, so every Listen button knows what is playing:
 * { playing: speechKey being read, or null; problem: { key, message } or null;
 *   rate: 'normal' or 'slow' (remembered on this device) }.
 * The engine and the preference storage can be replaced (tests).
 */
export function createSpeechPlayer({
  say = speak,
  stop = stopSpeaking,
  read = readPreference,
  write = writePreference,
} = {}) {
  let state = { playing: null, problem: null, rate: read(RATE_KEY, 'normal') === 'slow' ? 'slow' : 'normal' };
  const listeners = new Set();

  function setState(changes) {
    state = { ...state, ...changes };
    for (const listener of listeners) listener();
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Reads `text` in `lang`; the same one again stops it. `languageLabel` names the language in messages. */
    async play(text, lang, languageLabel) {
      const key = speechKey(text, lang);
      if (state.playing === key) {
        stop();
        setState({ playing: null });
        return;
      }
      setState({ playing: key, problem: null });
      const result = await say(text, lang, { rate: SPEECH_RATES[state.rate] });
      const changes = state.playing === key ? { playing: null } : {};
      if (result === 'no-voice') {
        changes.problem = {
          key,
          message: `This device has no ${languageLabel} voice. Add one in the system's speech or language settings.`,
        };
      }
      setState(changes);
    },

    toggleSlow() {
      const rate = state.rate === 'slow' ? 'normal' : 'slow';
      write(RATE_KEY, rate);
      setState({ rate });
    },
  };
}
