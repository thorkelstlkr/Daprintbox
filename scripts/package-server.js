/*
 * Prepara la carpeta para subir al servidor (PHP + MySQL): dist/libreta-maker-servidor/
 * y, si hay `zip` disponible, dist/libreta-maker-servidor.zip. Uso: npm run package
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist', 'libreta-maker-servidor');
fs.rmSync(out, { recursive: true, force: true });

const copy = (rel) => {
  const src = path.join(root, rel);
  const dst = path.join(out, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
};

['index.html', 'css/styles.css', 'js/calc.js', 'js/store.js', 'js/merge.js', 'js/remote.js', 'js/app.js',
  'api/api.php', 'api/lib.php', 'api/setup.php', 'api/config.example.php', 'api/.htaccess', 'INSTALACION.md',
  'manifest.webmanifest', 'sw.js', 'img/cabecera.png', 'privacidad.html', 'condiciones.html',
  ...fs.readdirSync(path.join(root, 'icons')).filter((f) => f.endsWith('.png') && f !== 'original.png').map((f) => `icons/${f}`),
].forEach(copy);

// En el servidor la app usa la API
fs.writeFileSync(path.join(out, 'js', 'config.js'), fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8')
  .replace(/^(\s*)apiUrl:\s*'[^']*'/m, "$1apiUrl: 'api/api.php'"));

let zipped = false;
try {
  fs.rmSync(`${out}.zip`, { force: true });
  execSync(`zip -qr ../libreta-maker-servidor.zip .`, { cwd: out });
  zipped = true;
} catch (e) { /* sin zip: se sube la carpeta */ }
console.log(`dist/libreta-maker-servidor/${zipped ? ' y dist/libreta-maker-servidor.zip' : ''}`);
