/*
 * Fotos: ids que usa una libreta y el .zip de «Descargar fotos».
 */
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { refsOf, crc32, makeZip } = require('../js/photos.js');

test('refsOf: fotos de trabajos, filamentos, materiales y componentes', () => {
  const refs = refsOf({
    prints: [{ id: 'p1', photos: ['a', 'b'] }, { id: 'p2' }, { id: 'p3', photos: [] }],
    filaments: [{ id: 'f1', photo: 'c' }, { id: 'f2', photo: '' }],
    materials: [{ id: 'm1', photo: 'd' }],
    components: [{ id: 'c1', photo: 'a' }],
    sales: [{ id: 's1', photo: 'x' }],
  });
  assert.deepStrictEqual([...refs].sort(), ['a', 'b', 'c', 'd']);
  assert.strictEqual(refsOf(null).size, 0);
});

test('crc32 estándar', () => {
  assert.strictEqual(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('makeZip genera un .zip válido con nombres UTF-8', (t) => {
  const files = [
    { name: 'Trabajos/2026-10-04 Dragón (1).jpg', data: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]) },
    { name: 'Filamento y resina/PLA Negro.jpg', data: new Uint8Array(1000).fill(7) },
  ];
  const zip = makeZip(files);
  assert.strictEqual(new DataView(zip.buffer).getUint32(0, true), 0x04034b50);
  let python = true;
  try { execFileSync('python3', ['--version']); } catch (e) { python = false; }
  if (!python) { t.skip('sin python3 para comprobar el zip'); return; }
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zip-')), 'f.zip');
  fs.writeFileSync(file, zip);
  const out = execFileSync('python3', ['-c', `import zipfile,sys,json
z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
print(json.dumps([[i.filename, len(z.read(i))] for i in z.infolist()]))`, file]).toString();
  assert.deepStrictEqual(JSON.parse(out), files.map((f) => [f.name, f.data.length]));
});
