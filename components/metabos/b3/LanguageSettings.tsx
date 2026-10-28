'use client';
import { useEffect, useState } from 'react';
import { coverage, LANG_COOKIE, LANGS, langFromCookie, t, type Key, type Lang } from '@/lib/metabos/b3/i18n';
import en from '@/lib/metabos/b3/i18n/en.json';
export function LanguageSettings() {
  const [lang, setLang] = useState<Lang>('en'); const [saved, setSaved] = useState('');
  useEffect(() => { setLang(langFromCookie(document.cookie)); }, []);
  const save = (l: Lang) => { setLang(l); document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`; setSaved(`${t(l, 'save')} ✓`); };
  const cov = coverage(lang);
  return <section className="mb-v3" aria-labelledby="lang-h" lang={lang}>
    <h1 id="lang-h" className="mb-heading">{t(lang, 'language')}</h1>
    <fieldset><legend>Interface language</legend>
      {(Object.keys(LANGS) as Lang[]).map((l) => <label key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, marginRight: 16 }}><input type="radio" name="lang" checked={lang === l} onChange={() => save(l)} />{LANGS[l]}</label>)}
    </fieldset>
    <p role="status">{saved}</p>
    <p className="mb-muted" data-testid="lang-coverage">{cov.translated} of {cov.total} strings translated{cov.missing.length ? `; English shown for: ${cov.missing.join(', ')}` : ''}. Machine-drafted, reviewed by hand; native review pending.</p>
    <table><caption className="mb-muted">Preview</caption><thead><tr><th scope="col">English</th><th scope="col">{LANGS[lang]}</th></tr></thead>
      <tbody>{(Object.keys(en) as Key[]).map((k) => <tr key={k}><td>{en[k]}</td><td>{t(lang, k)}</td></tr>)}</tbody></table>
  </section>;
}
