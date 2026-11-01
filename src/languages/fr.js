import { defineLanguage } from './profile.js';

export const fr = defineLanguage({
  code: 'fr',
  label: 'French',
  tatoeba: 'fra',
  speech: 'fr-FR',
  chars: ['é', 'è', 'ê', 'ë', 'à', 'â', 'ç', 'î', 'ï', 'ô', 'ù', 'û', 'œ'],
});
