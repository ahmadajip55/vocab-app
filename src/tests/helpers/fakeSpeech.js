/**
 * A browser speech engine for tests: it records what it was asked to read and
 * finishes each utterance on the next tick. Install it on globalThis with
 * installFakeSpeech(); the returned remove() puts the old globals back.
 */
export function installFakeSpeech({ voices = [], error } = {}) {
  const spoken = [];
  const engine = {
    cancelled: 0,
    getVoices: () => voices,
    cancel() {
      engine.cancelled += 1;
    },
    speak(utterance) {
      spoken.push(utterance);
      utterance.onstart?.();
      setTimeout(() => (error ? utterance.onerror?.({ error }) : utterance.onend?.()), 0);
    },
  };
  class Utterance {
    constructor(text) {
      this.text = text;
    }
  }
  const before = { speechSynthesis: globalThis.speechSynthesis, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance };
  globalThis.speechSynthesis = engine;
  globalThis.SpeechSynthesisUtterance = Utterance;
  return {
    engine,
    spoken,
    remove() {
      Object.assign(globalThis, before);
    },
  };
}
