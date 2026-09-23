/*
 * Empaqueta la app en un único HTML (CSS y JS en línea) en dist/daprintbox.html.
 * Útil para publicarla como página sin servidor. Uso: npm run build
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('index.html');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];

const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const css = read('css/styles.css');
// La versión de un solo archivo guarda en el navegador: sin configuración ni cliente del servidor
const SERVER_ONLY = ['js/config.js', 'js/remote.js'];
const markup = body
  .replace(/\s*<script src="([^"]+)"><\/script>/g, (_, src) => (SERVER_ONLY.includes(src) ? ''
    : `\n<script>\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`));

const out = `${title}\n<style>\n${css}\n</style>\n${markup.trim()}\n`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'daprintbox.html'), out);
console.log(`dist/daprintbox.html (${(out.length / 1024).toFixed(1)} KB)`);
