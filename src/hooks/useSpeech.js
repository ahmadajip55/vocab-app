import { useSyncExternalStore } from 'react';
import { getLanguage } from '../languages/index.js';
import { createSpeechPlayer, speechKey } from '../lib/speechPlayer.js';

const player = createSpeechPlayer();

/** Plays `text` in a word language ("ja"): its voice language and name come from src/languages. */
function play(text, language) {
  const { speech, label } = getLanguage(language);
  return player.play(text, speech, label);
}

/**
 * Speech for components. `isPlaying(text, language)` and `problemOf(text, language)`
 * tell one Listen button about its own text; `rate` is 'normal' or 'slow'.
 */
export function useSpeech() {
  const { playing, problem, rate } = useSyncExternalStore(player.subscribe, player.getState, player.getState);
  const keyOf = (text, language) => speechKey(text, getLanguage(language).speech);
  return {
    rate,
    play,
    toggleSlow: player.toggleSlow,
    isPlaying: (text, language) => playing === keyOf(text, language),
    problemOf: (text, language) => (problem?.key === keyOf(text, language) ? problem.message : ''),
  };
}
