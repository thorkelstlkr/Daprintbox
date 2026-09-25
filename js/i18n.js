/*
 * Idioma de la interfaz. Los textos se escriben en español en el código y se traducen con t():
 * los diccionarios de js/i18n/*.js usan el texto en español como clave. Si falta una
 * traducción se muestra el español. Los {marcadores} se sustituyen por los parámetros.
 */
(function (root) {
  'use strict';

  const LANGS = { es: 'Español', ca: 'Català', en: 'English', de: 'Deutsch', it: 'Italiano', fr: 'Français' };
  const LOCALES = { es: 'es-ES', ca: 'ca-ES', en: 'en-GB', de: 'de-DE', it: 'it-IT', fr: 'fr-FR' };
  const KEY = 'libreta:lang';
  const dicts = root.LIBRETA_I18N || {};

  function stored() {
    try { return root.localStorage.getItem(KEY); } catch (e) { return null; }
  }

  /** Primer idioma del dispositivo que tenga la app; si no, español. */
  function detect() {
    const prefs = (root.navigator && (root.navigator.languages || [root.navigator.language])) || [];
    for (const p of prefs) {
      const code = String(p || '').toLowerCase().split('-')[0];
      if (LANGS[code]) return code;
    }
    return 'es';
  }

  let lang = LANGS[stored()] ? stored() : detect();

  function t(text, params) {
    const d = lang !== 'es' && dicts[lang];
    let s = (d && d[text]) || text;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(params, k) ? params[k] : m));
    return s;
  }

  function setLang(code) {
    if (!LANGS[code]) return;
    lang = code;
    try { root.localStorage.setItem(KEY, code); } catch (e) { /* sin almacenamiento */ }
    if (root.document) root.document.documentElement.lang = code;
  }

  if (root.document) root.document.documentElement.lang = lang;

  root.I18n = {
    t,
    /** Marca un texto para traducir más tarde con t() (listas y constantes). */
    N_: (s) => s,
    LANGS,
    lang: () => lang,
    locale: () => LOCALES[lang],
    setLang,
  };
})(typeof window !== 'undefined' ? window : globalThis);
