import { defineLanguage } from './profile.js';

export const de = defineLanguage({
  code: 'de',
  label: 'German',
  tatoeba: 'deu',
  speech: 'de-DE',
  chars: ['ä', 'ö', 'ü', 'ß'],
});
