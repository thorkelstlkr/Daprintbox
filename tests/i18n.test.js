/*
 * Comprueba que cada texto de la interfaz tiene traducción en todos los idiomas
 * y que las traducciones conservan los {marcadores} y las etiquetas HTML.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const LANGS = ['ca', 'en', 'de', 'it', 'fr'];

globalThis.LIBRETA_I18N = {};
LANGS.forEach((l) => require(path.join(root, 'js', 'i18n', `${l}.js`)));
require(path.join(root, 'js', 'i18n.js'));

const unescape = (s) => s.replace(/\\n/g, '\n').replace(/\\(['"\\])/g, '$1');

/** Todos los textos que la app puede mostrar, en español (las claves de los diccionarios). */
function sourceKeys() {
  const keys = new Set();
  const add = (re, text) => { for (const m of text.matchAll(re)) keys.add(unescape(m[1])); };
  add(/\b(?:t|N_)\(\s*'((?:[^'\\]|\\.)*)'/g, read('js/app.js'));
  add(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g, read('js/remote.js'));
  add(/data-i18n(?:-label)?="([^"]+)"/g, read('index.html'));
  // mensajes de error que envía el servidor
  add(/(?:dpb_fail\(\d+,\s*|failed_attempt\(\$db,\s*)'((?:[^'\\]|\\.)*)'/g, read('api/api.php'));
  const google = read('api/lib.php').match(/function dpb_verify_google_token[\s\S]*?\n}\n/)[0];
  add(/return (?:\$certs \? )?'((?:[^'\\]|\\.)*)'(?: : '((?:[^'\\]|\\.)*)')?;/g, google);
  add(/: '((?:[^'\\]|\\.)*)';/g, google);
  return [...keys];
}

const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(' ');
const tags = (s) => (s.match(/<\/?[a-z]+/gi) || []).map((x) => x.toLowerCase()).sort().join(' ');

test('hay textos para traducir', () => {
  assert.ok(sourceKeys().length > 300);
});

for (const lang of LANGS) {
  test(`traducciones completas: ${lang}`, () => {
    const dict = globalThis.LIBRETA_I18N[lang];
    assert.ok(dict, `falta js/i18n/${lang}.js`);
    const missing = sourceKeys().filter((k) => !dict[k]);
    assert.deepStrictEqual(missing, [], `sin traducir en ${lang}`);
  });

  test(`marcadores y etiquetas intactos: ${lang}`, () => {
    const dict = globalThis.LIBRETA_I18N[lang];
    const bad = Object.entries(dict).filter(([k, v]) => placeholders(k) !== placeholders(v) || tags(k) !== tags(v)).map(([k]) => k);
    assert.deepStrictEqual(bad, []);
  });
}

test('t() traduce, sustituye marcadores y vuelve al español si falta', () => {
  const { I18n } = globalThis;
  I18n.setLang('en');
  assert.strictEqual(I18n.t('Guardar'), 'Save');
  assert.strictEqual(I18n.t('Versión {n}', { n: 7 }), 'Version 7');
  assert.strictEqual(I18n.t('texto que no existe'), 'texto que no existe');
  assert.strictEqual(I18n.locale(), 'en-GB');
  I18n.setLang('xx');
  assert.strictEqual(I18n.lang(), 'en');
  I18n.setLang('es');
  assert.strictEqual(I18n.t('Guardar'), 'Guardar');
});
