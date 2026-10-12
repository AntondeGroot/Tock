// Assembles the per-locale dictionaries (locales/*.ts) into one lookup, and
// re-exports the shared types so consumers only import from here.
import type { Dictionary, Locale } from './keys';
import { de } from './locales/de';
import { en } from './locales/en';
import { fr } from './locales/fr';
import { it } from './locales/it';
import { nb } from './locales/nb';
import { nl } from './locales/nl';

export type { Dictionary, Locale, TranslationKey } from './keys';
export { LANGUAGES } from './keys';

export const translations: Record<Locale, Dictionary> = { de, en, fr, it, nl, nb };
