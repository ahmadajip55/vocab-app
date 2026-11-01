import { de } from './de.js';
import { en } from './en.js';
import { es } from './es.js';
import { fr } from './fr.js';
import { id } from './id.js';
import { it } from './it.js';
import { ja } from './ja.js';
import { nl } from './nl.js';
import { pl } from './pl.js';
import { pt } from './pt.js';

/** Order here is the order of the language pickers. */
export const LANGUAGES = [en, id, ja, es, de, fr, it, nl, pt, pl];

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));
const BY_NAME = new Map(LANGUAGES.map((language) => [language.label.toLowerCase(), language.code]));

export const DEFAULT_WORD_LANGUAGE = 'en';
export const DEFAULT_MEANING_LANGUAGE = 'id';

/** Accepts "ja", "Japanese" or a bare code; unknown plausible codes pass through. */
export function normalizeLanguageCode(value, fallback = DEFAULT_WORD_LANGUAGE) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (BY_CODE.has(raw)) return raw;
  if (BY_NAME.has(raw)) return BY_NAME.get(raw);
  return raw.length >= 2 && /^[a-z-]+$/.test(raw) ? raw : fallback;
}

/** The profile for a language code. Unknown codes get English behaviour with their own code. */
export function getLanguage(code) {
  const normalized = normalizeLanguageCode(code);
  return BY_CODE.get(normalized) ?? { ...en, code: normalized, inputProps: { ...en.inputProps, lang: normalized } };
}

export const LANGUAGE_OPTIONS = LANGUAGES.map(({ code, label }) => ({ value: code, label }));
