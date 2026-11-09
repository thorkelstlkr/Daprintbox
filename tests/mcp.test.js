/*
 * Servidor MCP (api/calc.php y api/mcp_tools.php): los costes en PHP deben coincidir con los de la app
 * (js/calc.js) y las herramientas deben dejar la libreta igual que la dejaría la app. Necesita `php`.
 */
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const Calc = require('../js/calc.js');

let php = true;
try { execFileSync('php', ['-v']); } catch (e) { php = false; }
const harness = path.join(__dirname, 'php', 'harness.php');
const run = (input) => JSON.parse(execFileSync('php', [harness], { input: JSON.stringify(input) }).toString());

const SETTINGS = { currency: 'EUR', kwhPrice: 0.18, printerWatts: 120, printerPrice: 400, printerLifeHours: 5000, maintenancePerHour: 0.05,
  defaultPrinterId: 'pr1', laborRate: 10, failureRate: 10, defaultMargin: 60, lowStockGrams: 200, sheetWaste: 15 };

const fixture = () => ({
  version: 1, settings: { ...SETTINGS },
  printers: [
    { id: 'pr1', type: '3d', name: 'Bambu P1S', watts: 110, price: 699, lifeHours: 6000, maintenancePerHour: 0.08 },
    { id: 'pr2', type: 'laser', name: 'xTool S1', watts: 160, price: 1099, lifeHours: 10000, maintenancePerHour: 0.12 },
    { id: 'pr3', type: 'insoladora', name: 'Insoladora A4', watts: 40, price: 320, lifeHours: 3000, maintenancePerHour: 0.06 },
  ],
  filaments: [
    { id: 'f1', name: 'PLA Negro', material: 'PLA', spoolWeight: 1000, price: 19.99, remaining: 800, lowStock: '' },
    { id: 'f2', kind: 'resina', unit: 'ml', name: 'Resina gris', material: '8K', spoolWeight: 1000, price: 32.99, remaining: 150, lowStock: 250 },
  ],
  materials: [
    { id: 'm1', name: 'Contrachapado', category: 'Contrachapado', thickness: 3, sheetWidth: 600, sheetHeight: 400, price: 4.8, stock: 5, lowStock: 2 },
    { id: 'm2', name: 'Fotopolímero', category: 'Fotopolímero', thickness: 1.7, sheetWidth: 297, sheetHeight: 210, price: 9.5, stock: 1, lowStock: 1 },
  ],
  components: [{ id: 'c1', name: 'Imán 6×2', category: 'Imanes', unit: 'ud.', price: 6.5, packUnits: 50, stock: 30, lowStock: 10 }],
  prints: [{ id: 'p1', kind: '3d', name: 'Maceta', date: '2026-10-02', printerId: 'pr1', printerName: 'Bambu P1S', quantity: 3, hours: 9.5,
    items: [{ filamentId: 'f1', grams: 390 }], sheets: [], components: [], laborHours: 0, extras: 1.5, margin: '', cost: { unit: 4.1, total: 12.3 }, stockDeducted: true }],
  sales: [
    { id: 's1', date: '2026-10-05', printId: 'p1', description: 'Maceta', quantity: 2, unitPrice: 16, fees: 3.1, unitCost: 4.1, customer: 'Ana', channel: 'Etsy' },
    { id: 's2', date: '2026-11-01', printId: null, description: 'Arreglo', quantity: 1, unitPrice: 10, fees: 0, unitCost: 0, customer: '', channel: 'Directo' },
  ],
  expenses: [
    { id: 'e1', date: '2026-10-03', category: 'filamento', description: '1 × PLA', amount: 19.99 },
    { id: 'e2', date: '2026-11-02', category: 'embalaje', description: 'Cajas', amount: 12 },
  ],
});

const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: PHP ${a} ≠ JS ${b}`);

test('los costes en PHP coinciden con los de la app', { skip: !php && 'sin php' }, () => {
  const st = fixture();
  const jobs = [
    { kind: '3d', printerId: 'pr1', items: [{ filamentId: 'f1', grams: 123.4 }, { filamentId: 'f2', grams: 55 }], sheets: [], components: [{ componentId: 'c1', qty: 2 }], hours: 3.25, quantity: 4, laborHours: 0.5, extras: 1.2, margin: '' },
    { kind: 'laser', printerId: 'pr2', items: [], sheets: [{ materialId: 'm1', width: 100, height: 80 }], components: [], hours: 0.75, quantity: 12, laborHours: 1, extras: 0, margin: 45 },
    { kind: 'sello', printerId: 'pr3', items: [], sheets: [{ materialId: 'm2', width: 40, height: 40 }, { materialId: 'gone', width: 40, height: 40, costPerCm2: 0.02 }], components: [{ componentId: 'old', qty: 1, unitCost: 1.19 }], hours: 0.2, quantity: '2', laborHours: '0.75', extras: '', margin: 0 },
    { kind: '3d', printerId: 'none', items: [], sheets: [], components: [], hours: 2, quantity: 0, laborHours: 0, extras: 0 },
  ];
  const cases = jobs.map((job, i) => ({ state: st, job, from: i % 2 ? '2026-10-01' : null, to: i % 2 ? '2026-10-31' : null }));
  const out = run({ mode: 'calc', cases });
  cases.forEach((c, i) => {
    const pr = st.printers.find((p) => p.id === c.job.printerId);
    const js = Calc.printCost(c.job, Object.fromEntries(st.filaments.map((f) => [f.id, f])), st.settings, pr,
      Object.fromEntries(st.components.map((x) => [x.id, x])), Object.fromEntries(st.materials.map((x) => [x.id, x])));
    Object.keys(js).forEach((k) => close(out[i].cost[k], js[k], `caso ${i} ${k}`));
    const sheets = Calc.sheetsUsed(c.job.sheets, c.job.quantity, st.settings.sheetWaste, Object.fromEntries(st.materials.map((x) => [x.id, x])));
    Object.keys(sheets).forEach((k) => close(out[i].sheets[k], sheets[k], `caso ${i} planchas ${k}`));
    const sum = Calc.summary(st, c.from, c.to);
    Object.keys(sum).forEach((k) => close(out[i].summary[k], sum[k], `caso ${i} resumen ${k}`));
    const kinds = Calc.kindStats(st, c.from, c.to);
    assert.deepStrictEqual(Object.keys(out[i].kinds).sort(), Object.keys(kinds).sort());
    if (pr) close(out[i].hourCost, Calc.printerHourCost(st.settings, pr), `caso ${i} coste/hora`);
  });
});

test('herramientas: registrar un trabajo descuenta el stock y su coste es el de la app', { skip: !php && 'sin php' }, () => {
  const st = fixture();
  const { results, state } = run({ mode: 'tools', state: st, today: '2026-11-06', calls: [
    { name: 'registrar_trabajo', args: { nombre: 'Llavero', horas: 1.5, unidades: 10, filamentos: [{ id: 'f1', cantidad: 120 }], componentes: [{ id: 'c1', cantidad_por_pieza: 1 }], mano_obra_horas: 0.5, enlace_archivo: 'printables.com/model/1' } },
    { name: 'registrar_trabajo', args: { nombre: 'Sellos', tipo: 'sello', horas: 0.2, unidades: 2, planchas: [{ id: 'm2', ancho_mm: 40, alto_mm: 40 }] } },
  ] });
  assert.ok(results.every((r) => r.ok), JSON.stringify(results));
  const job = state.prints.find((p) => p.name === 'Llavero');
  assert.strictEqual(job.printerId, 'pr1');               // la predeterminada
  assert.strictEqual(job.fileUrl, 'https://printables.com/model/1');
  assert.strictEqual(job.stockDeducted, true);
  assert.deepStrictEqual(job.items, [{ filamentId: 'f1', filamentName: 'PLA Negro · PLA', unit: 'g', grams: 120 }]);
  assert.strictEqual(state.filaments[0].remaining, 680);
  assert.strictEqual(state.components[0].stock, 20);
  const js = Calc.printCost(job, { f1: st.filaments[0] }, st.settings, st.printers[0], { c1: st.components[0] }, {});
  close(job.cost.total, js.total, 'total');
  assert.strictEqual(results[0].data.desglose.coste_total, Math.round(js.total * 100) / 100);
  const sello = state.prints.find((p) => p.name === 'Sellos');
  assert.strictEqual(sello.printerId, 'pr3');              // la insoladora, por el tipo
  assert.strictEqual(sello.sheets[0].materialName, 'Fotopolímero 1,7 mm');
  const used = Calc.sheetsUsed(sello.sheets, 2, 15, { m2: st.materials[1] }).m2;
  assert.strictEqual(state.materials[1].stock, Math.round((1 - used) * 1000) / 1000);
});

test('herramientas: venta de un trabajo, reposición con gasto y eliminación que devuelve el stock', { skip: !php && 'sin php' }, () => {
  const { results, state } = run({ mode: 'tools', state: fixture(), today: '2026-11-06', calls: [
    { name: 'registrar_venta', args: { trabajo_id: 'p1', unidades: 2, precio_unidad: 15, comisiones: 1.5, cliente: 'Luis' } },
    { name: 'reponer_stock', args: { seccion: 'filamentos', id: 'f2', unidades_compradas: 2, importe: 60, actualizar_precio: true } },
    { name: 'eliminar', args: { seccion: 'trabajos', id: 'p1' } },
  ] });
  assert.ok(results.every((r) => r.ok), JSON.stringify(results));
  const sale = state.sales[2];
  assert.deepStrictEqual([sale.description, sale.unitCost, sale.costFromPrint, sale.date, sale.customer], ['Maceta', 4.1, false, '2026-11-06', 'Luis']);
  assert.ok(results[0].data.avisos[0].includes('solo quedaban 1'));        // 3 fabricadas, 2 ya vendidas
  assert.strictEqual(state.filaments[1].remaining, 2150);
  assert.strictEqual(state.filaments[1].price, 30);
  assert.deepStrictEqual(state.expenses[2], { id: state.expenses[2].id, date: '2026-11-06', category: 'filamento',
    description: 'Reposición 2 L · Resina gris · 8K', amount: 60, filamentId: 'f2' });
  assert.strictEqual(state.prints.length, 0);
  assert.strictEqual(state.filaments[0].remaining, 1190);                   // 800 + 390 devueltos
  assert.ok(state.sales.filter((s) => s.description === 'Maceta').every((s) => s.printId === null && s.costFromPrint === false));
});

test('herramientas: consultas, fichas y errores claros', { skip: !php && 'sin php' }, () => {
  const { results, state, tools } = run({ mode: 'tools', state: fixture(), today: '2026-11-06', calls: [
    { name: 'ver_resumen', args: { periodo: 'mes_anterior' } },
    { name: 'ver_stock', args: { solo_bajo: true } },
    { name: 'buscar_ventas', args: { periodo: 'este_mes' } },
    { name: 'guardar_ficha', args: { seccion: 'componentes', datos: { nombre: 'Tira LED', precio: 5.99, unidades_por_paquete: 1 } } },
    { name: 'guardar_ficha', args: { seccion: 'maquinas', id: 'pr1', datos: { nombre: 'Bambu Lab P1S' } } },
    { name: 'guardar_ficha', args: { seccion: 'filamentos', id: 'f1', datos: { peso: 3 } } },
    { name: 'registrar_venta', args: { trabajo_id: 'nope', precio_unidad: 3 } },
    { name: 'registrar_gasto', args: { categoria: 'embalaje', descripcion: 'Sobres', importe: 4, fecha: '2026-02-30' } },
    { name: 'calcular_coste', args: { horas: 2, filamentos: [{ id: 'f2', cantidad: 400 }] } },
    { name: 'ver_fotos', args: { seccion: 'trabajos', id: 'p1' } },
  ] });
  const [resumen, stock, ventas, nuevo, edit, badField, badId, badDate, quote, fotos] = results;
  assert.deepStrictEqual(resumen.data.periodo, { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.strictEqual(resumen.data.ventas.ingresos, 32);
  assert.strictEqual(resumen.data.resultado_de_caja, Math.round((32 - 3.1 - 19.99) * 100) / 100);
  assert.deepStrictEqual(stock.data.filamentos_y_resinas.map((f) => f.id), ['f2']);
  assert.deepStrictEqual(stock.data.materiales_en_plancha.map((m) => m.id), ['m2']);
  assert.strictEqual(ventas.data.encontradas, 1);
  assert.ok(nuevo.ok && nuevo.data.ficha.unidad === 'ud.' && state.components.length === 2);
  assert.ok(edit.ok && state.prints[0].printerName === 'Bambu Lab P1S');   // el nombre llega a sus trabajos
  assert.ok(!badField.ok && /Campo desconocido.*peso/.test(badField.error));
  assert.ok(!badId.ok && /trabajo con id «nope»/.test(badId.error));
  assert.ok(!badDate.ok && /Fecha no válida/.test(badDate.error));
  assert.ok(quote.ok && quote.data.avisos.some((a) => a.includes('Resina gris')) && state.prints.length === 1);
  assert.deepStrictEqual(fotos.photos, []);
  // las herramientas declaran si escriben y los esquemas son objetos JSON
  assert.ok(tools.every((t) => t.inputSchema.type === 'object' && typeof t.write === 'boolean' && t.annotations.readOnlyHint === !t.write));
});

test('herramientas: un encargo de escandallo cuesta lo mismo que en la app y registra trabajo y venta', { skip: !php && 'sin php' }, () => {
  const st = fixture();
  st.products = [{ id: 'k1', name: 'Clicker', kind: '3d', printerId: '', laborMinutes: 3, extras: 0.05, margin: '',
    parts: [{ name: 'Carcasa', qty: 1, filamentId: 'f1', grams: 4.5, minutes: 16 }, { name: 'Tecla', qty: 2, filamentId: 'f1', grams: 1.2, minutes: 5 }],
    components: [{ componentId: 'c1', qty: 1 }] },
  { id: 'k2', name: 'Posavasos ×4', kind: 'laser', parts: [{ name: 'Posavasos', qty: 4, materialId: 'm1', width: 100, height: 100, minutes: 6 }], components: [] }];
  const { results, state } = run({ mode: 'tools', state: st, today: '2026-11-07', calls: [
    { name: 'ver_escandallos', args: {} },
    { name: 'presupuestar_encargo', args: { escandallo_id: 'k1', conjuntos: 25, precio_por_conjunto: 3 } },
    { name: 'registrar_encargo', args: { escandallo_id: 'k1', conjuntos: 25, venta: { precio_por_conjunto: 3, cliente: 'Instituto' } } },
    { name: 'registrar_encargo', args: { escandallo_id: 'k2', conjuntos: 3 } },
    { name: 'guardar_ficha', args: { seccion: 'escandallos', id: 'k1', datos: { nombre: 'x' } } },
  ] });
  const [list, quote, order, laser, edit] = results;
  assert.ok([list, quote, order, laser].every((r) => r.ok), JSON.stringify(results));
  const by = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  for (const [id, n] of [['k1', 25], ['k2', 3]]) {
    const pd = st.products.find((x) => x.id === id);
    const job = Calc.productJob(pd, n, by(st.filaments), by(st.materials));
    const pr = id === 'k1' ? st.printers[0] : st.printers[1];        // la predeterminada (3D) y la primera láser
    const js = Calc.printCost(job, by(st.filaments), st.settings, pr, by(st.components), by(st.materials));
    const rec = state.prints.find((p) => p.productId === id);
    assert.strictEqual(rec.printerId, pr.id);
    close(rec.cost.total, js.total, `${id} total`);
    close(rec.hours, job.hours, `${id} horas`);
  }
  assert.strictEqual(list.data.escandallos[0].coste_por_conjunto, quote.data.coste_por_conjunto);
  assert.strictEqual(quote.data.total_del_encargo, 75);
  assert.strictEqual(state.filaments[0].remaining, 800 - 25 * (4.5 + 2.4));
  assert.strictEqual(state.components[0].stock, 5);
  const sale = state.sales[state.sales.length - 1];
  assert.deepStrictEqual([sale.quantity, sale.unitPrice, sale.customer, sale.costFromPrint, sale.printId === state.prints[1].id], [25, 3, 'Instituto', true, true]);
  assert.strictEqual(state.prints[2].sheets[0].count, 4);
  assert.ok(!edit.ok && /se crean y se editan en la app/.test(edit.error));
});

test('herramientas: reponer con gramos en lugar de bobinas pide confirmación', { skip: !php && 'sin php' }, () => {
  const { results, state } = run({ mode: 'tools', state: fixture(), today: '2026-11-07', calls: [
    { name: 'reponer_stock', args: { seccion: 'filamentos', id: 'f1', unidades_compradas: 1000 } },
    { name: 'reponer_stock', args: { seccion: 'filamentos', id: 'f1', unidades_compradas: 1, cantidad: 1000 } },
    { name: 'reponer_stock', args: { seccion: 'filamentos', id: 'f1', unidades_compradas: 30, confirmar: true } },
  ] });
  assert.ok(!results[0].ok && /Compra inusual/.test(results[0].error));
  assert.ok(results[1].ok && results[2].ok);
  assert.strictEqual(state.filaments[0].remaining, 800 + 1000 + 30 * 1000);
  assert.strictEqual(state.expenses.filter((e) => e.filamentId === 'f1').length, 2);
});

test('herramientas: precio de venta del trabajo al registrar, editar y vender', { skip: !php && 'sin php' }, () => {
  const { results, state } = run({ mode: 'tools', state: fixture(), today: '2026-11-09', calls: [
    { name: 'registrar_venta', args: { trabajo_id: 'p1', unidades: 1 } },
    { name: 'guardar_ficha', args: { seccion: 'trabajos', id: 'p1', datos: { precio_venta: 6.5 } } },
    { name: 'registrar_venta', args: { trabajo_id: 'p1', unidades: 1 } },
    { name: 'registrar_trabajo', args: { nombre: 'Llavero', horas: 1, filamentos: [{ id: 'f1', cantidad: 20 }], precio_venta: 3 } },
    { name: 'ver_ficha', args: { seccion: 'trabajos', id: 'p1' } },
  ] });
  assert.ok(!results[0].ok && /no tiene precio de venta/.test(results[0].error));
  assert.ok(results.slice(1).every((r) => r.ok), JSON.stringify(results));
  assert.strictEqual(state.sales[state.sales.length - 1].unitPrice, 6.5);
  assert.strictEqual(state.prints.find((p) => p.name === 'Llavero').salePrice, 3);
  assert.strictEqual(results[4].data.precio_venta_unidad, 6.5);
});
