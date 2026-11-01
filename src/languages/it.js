import { defineLanguage } from './profile.js';

export const it = defineLanguage({
  code: 'it',
  label: 'Italian',
  tatoeba: 'ita',
  speech: 'it-IT',
  chars: ['à', 'è', 'é', 'ì', 'ò', 'ù'],
});
