import { defineLanguage } from './profile.js';

export const es = defineLanguage({
  code: 'es',
  label: 'Spanish',
  tatoeba: 'spa',
  speech: 'es-ES',
  chars: ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', '¿', '¡'],
});
