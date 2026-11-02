/** UI strings in English, Hindi, Malayalam and Tamil (batch 3 #2). Translations were machine-drafted by
 *  the local Sarvam model via claw-local, then reviewed and corrected by hand (see docs/I18N.md);
 *  native-speaker review is still pending. Missing keys fall back to English. */
import en from './i18n/en.json';
import hi from './i18n/hi.json';
import ml from './i18n/ml.json';
import ta from './i18n/ta.json';
export const LANGS = { en: 'English', hi: 'हिन्दी', ml: 'മലയാളം', ta: 'தமிழ்' } as const;
export type Lang = keyof typeof LANGS;
export type Key = keyof typeof en;
const T: Record<Lang, Partial<Record<Key, string>>> = { en, hi, ml, ta };
export const isLang = (v: unknown): v is Lang => typeof v === 'string' && v in LANGS;
export function t(lang: Lang, key: Key): string { return T[lang][key] ?? en[key]; }
export function coverage(lang: Lang) { const keys = Object.keys(en) as Key[]; return { total: keys.length, translated: keys.filter((k) => T[lang][k]).length, missing: keys.filter((k) => !T[lang][k]) }; }
export const LANG_COOKIE = 'mb_lang';
export function langFromCookie(cookie: string | undefined | null): Lang { const m = /(?:^|;\s*)mb_lang=([a-z]{2})/.exec(cookie ?? ''); return m && isLang(m[1]) ? m[1] : 'en'; }
