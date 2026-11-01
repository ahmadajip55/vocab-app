import { defineLanguage } from './profile.js';
import { commitRomaji } from './japanese/ime.js';

export const ja = defineLanguage({
  code: 'ja',
  label: 'Japanese',
  tatoeba: 'jpn',
  speech: 'ja-JP',
  /** Use the romaji -> kana/kanji input method in the word field. */
  ime: true,
  inputProps: { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false },
  /** Leftover romaji becomes hiragana; kana, katakana and kanji are kept as typed. */
  normalizeTerm: (term) => commitRomaji(String(term ?? '').normalize('NFC')),
});
