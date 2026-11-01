/**
 * Every word language is described by one profile (one file per language in
 * this folder). A profile answers four questions about its language:
 *
 *  - how is a word typed?       inputProps, chars, ime, normalizeTerm
 *  - how is it read aloud?      speech
 *  - where do examples come from? tatoeba (language code)
 *  - what is it called?         code, label, name
 *
 * Keep language-specific behaviour in the language's own file, not in the UI.
 */

const BASE_INPUT = {
  inputMode: 'text',
  autoCapitalize: 'sentences',
  autoCorrect: 'on',
  spellCheck: true,
};

const nfc = (value) => String(value ?? '').normalize('NFC');

/**
 * @param {object} profile
 * @param {string} profile.code        BCP-47 language code, e.g. "es"
 * @param {string} profile.label       name shown in the language picker
 * @param {string} profile.tatoeba     ISO 639-3 code used by the Tatoeba API
 * @param {string} profile.speech      locale for speech synthesis
 */
export function defineLanguage(profile) {
  return Object.freeze({
    chars: [],
    ime: false,
    normalizeTerm: nfc,
    ...profile,
    inputProps: { ...BASE_INPUT, lang: profile.code, ...profile.inputProps },
  });
}
