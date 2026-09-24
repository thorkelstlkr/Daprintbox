const test = require('node:test');
const assert = require('node:assert/strict');
const { merge3 } = require('../js/merge.js');

const base = {
  settings: { kwhPrice: 0.18, defaultMargin: 60 },
  filaments: [{ id: 'f1', name: 'PLA', remaining: 1000 }, { id: 'f2', name: 'PETG', remaining: 500 }],
  sales: [{ id: 's1', description: 'Llavero', unitPrice: 3 }, { id: 's2', description: 'Maceta', unitPrice: 15 }],
  expenses: [], prints: [], printers: [], components: [], materials: [],
};
const clone = (o) => JSON.parse(JSON.stringify(o));

test('lo añadido en cada dispositivo se conserva', () => {
  const local = clone(base); local.sales.push({ id: 'sL', description: 'Venta móvil' });
  const remote = clone(base); remote.sales.push({ id: 'sR', description: 'Venta PC' });
  const m = merge3(base, local, remote);
  assert.deepEqual(m.sales.map((s) => s.id).sort(), ['s1', 's2', 'sL', 'sR']);
});

test('ediciones en registros distintos se mezclan; mismo campo: gana este dispositivo', () => {
  const local = clone(base); local.sales[0].unitPrice = 4; local.sales[1].description = 'Maceta grande';
  const remote = clone(base); remote.sales[1].unitPrice = 18; remote.sales[1].description = 'Maceta XL';
  const m = merge3(base, local, remote);
  assert.equal(m.sales.find((s) => s.id === 's1').unitPrice, 4);
  const s2 = m.sales.find((s) => s.id === 's2');
  assert.equal(s2.unitPrice, 18);              // solo cambió en el servidor
  assert.equal(s2.description, 'Maceta grande'); // cambió en ambos: gana local
});

test('el stock suma las variaciones de ambos lados', () => {
  const local = clone(base); local.filaments[0].remaining = 900;   // -100 g aquí
  const remote = clone(base); remote.filaments[0].remaining = 950; // -50 g allí
  const m = merge3(base, local, remote);
  assert.equal(m.filaments.find((f) => f.id === 'f1').remaining, 850);
});

test('borrados: se aplican salvo que el otro lado haya editado el registro', () => {
  const local = clone(base); local.sales = local.sales.filter((s) => s.id !== 's1'); // borro s1 aquí
  local.sales = local.sales.filter((s) => s.id !== 's2');                           // y s2
  const remote = clone(base); remote.sales[1].unitPrice = 20;                       // s2 editado allí
  const m = merge3(base, local, remote);
  assert.deepEqual(m.sales.map((s) => s.id), ['s2']);
  assert.equal(m.sales[0].unitPrice, 20);

  const local2 = clone(base); local2.filaments[1].name = 'PETG negro';               // edito f2 aquí
  const remote2 = clone(base); remote2.filaments = remote2.filaments.filter((f) => f.id !== 'f2'); // borrado allí
  const m2 = merge3(base, local2, remote2);
  assert.equal(m2.filaments.find((f) => f.id === 'f2').name, 'PETG negro');
});

test('ajustes campo a campo y sin cambios locales se queda lo del servidor', () => {
  const local = clone(base); local.settings.kwhPrice = 0.2;
  const remote = clone(base); remote.settings.defaultMargin = 80;
  assert.deepEqual(merge3(base, local, remote).settings, { kwhPrice: 0.2, defaultMargin: 80 });
  const remoteOnly = clone(base); remoteOnly.sales.push({ id: 'x' });
  assert.deepEqual(merge3(base, clone(base), remoteOnly), { ...remoteOnly, demo: undefined });
});
