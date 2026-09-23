const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../js/calc.js');

const settings = {
  kwhPrice: 0.2, printerWatts: 100, printerPrice: 500, printerLifeHours: 5000,
  maintenancePerHour: 0.1, laborRate: 10, failureRate: 10, defaultMargin: 50,
};
const fil = { a: { id: 'a', price: 20, spoolWeight: 1000 }, b: { id: 'b', price: 30, spoolWeight: 500 } };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('coste por gramo', () => {
  close(Calc.costPerGram(fil.a), 0.02);
  assert.equal(Calc.costPerGram({ price: 10, spoolWeight: 0 }), 0);
});

test('desglose de coste de una impresión', () => {
  const c = Calc.printCost({ items: [{ filamentId: 'a', grams: 100 }, { filamentId: 'b', grams: 50 }], hours: 10, quantity: 2, laborHours: 1, extras: 3 }, fil, settings);
  close(c.material, 2 + 3);          // 100 g × 0,02 + 50 g × 0,06
  close(c.electricity, 10 * 0.1 * 0.2); // 0,2
  close(c.machine, 10 * (0.1 + 0.1)); // amortización 0,1/h + mantenimiento 0,1/h
  close(c.labor, 10);
  close(c.failure, (5 + 0.2 + 2) * 0.1);
  close(c.total, 5 + 0.2 + 2 + 10 + 3 + 0.72);
  close(c.unit, c.total / 2);
  close(c.suggestedUnitPrice, c.unit * 1.5);
});

test('margen propio sustituye al de ajustes', () => {
  const c = Calc.printCost({ items: [], hours: 1, quantity: 1, margin: 100 }, fil, settings);
  close(c.suggestedUnitPrice, c.unit * 2);
});

test('resumen del periodo: beneficio de ventas y resultado de caja', () => {
  const state = {
    sales: [
      { date: '2026-03-10', quantity: 2, unitPrice: 15, fees: 3, unitCost: 4 },
      { date: '2026-04-01', quantity: 1, unitPrice: 100, fees: 0, unitCost: 10 },
    ],
    expenses: [
      { date: '2026-03-01', category: 'filamento', amount: 20 },
      { date: '2026-03-05', category: 'otros', amount: 5 },
    ],
  };
  const r = Calc.summary(state, '2026-03-01', '2026-03-31');
  close(r.revenue, 30);
  close(r.cogs, 8);
  close(r.salesProfit, 30 - 3 - 8);
  close(r.cashResult, 30 - 3 - 25);
  assert.equal(r.salesCount, 1);
  close(Calc.summary(state).revenue, 130);
});

test('series mensuales y meses', () => {
  assert.deepEqual(Calc.lastMonths('2026-02', 3), ['2025-12', '2026-01', '2026-02']);
  const s = Calc.monthlySeries({ sales: [{ date: '2026-01-05', quantity: 1, unitPrice: 10, fees: 1, unitCost: 0 }], expenses: [{ date: '2026-01-09', amount: 4 }] }, ['2026-01']);
  close(s[0].income, 9);
  close(s[0].spend, 4);
  close(s[0].result, 5);
});

test('unidades vendidas por impresión y gramos por filamento', () => {
  assert.deepEqual(Calc.soldByPrint([{ printId: 'p', quantity: 2 }, { printId: 'p', quantity: 1 }, { printId: null, quantity: 5 }]), { p: 3 });
  assert.deepEqual(Calc.gramsByFilament([{ filamentId: 'a', grams: 10 }, { filamentId: 'a', grams: 5 }]), { a: 15 });
});

test('cada impresora aplica su propio consumo, amortización y mantenimiento', () => {
  const job = { items: [{ filamentId: 'a', grams: 100 }], hours: 10, quantity: 1 };
  const cheap = { watts: 150, price: 200, lifeHours: 4000, maintenancePerHour: 0.05 };
  const pro = { watts: 100, price: 1200, lifeHours: 6000, maintenancePerHour: 0.1 };
  const c1 = Calc.printCost(job, fil, settings, cheap);
  const c2 = Calc.printCost(job, fil, settings, pro);
  close(c1.electricity, 10 * 0.15 * 0.2);
  close(c1.machine, 10 * (200 / 4000 + 0.05));
  close(c2.electricity, 10 * 0.1 * 0.2);
  close(c2.machine, 10 * (1200 / 6000 + 0.1));
  close(c1.material, c2.material);
  close(Calc.printerHourCost(settings, pro), 0.2 + 0.1 + 0.02);
  // sin impresora se usan los valores de ajustes
  close(Calc.printCost(job, fil, settings).machine, 10 * 0.2);
});

test('estadísticas por impresora', () => {
  const state = {
    prints: [
      { id: 'j1', printerId: 'A', hours: 5, quantity: 2, cost: { total: 6 } },
      { id: 'j2', printerId: 'A', hours: 3, quantity: 1, cost: { total: 4 } },
      { id: 'j3', printerId: 'B', hours: 1, quantity: 1, cost: { total: 1 } },
    ],
    sales: [
      { printId: 'j1', quantity: 2, unitPrice: 10, fees: 2, unitCost: 3 },
      { printId: null, quantity: 1, unitPrice: 99, fees: 0, unitCost: 0 },
    ],
  };
  const st = Calc.printerStats(state);
  assert.deepEqual(st.A, { hours: 8, jobs: 2, units: 3, cost: 10, revenue: 20, profit: 12 });
  assert.deepEqual(st.B, { hours: 1, jobs: 1, units: 1, cost: 1, revenue: 0, profit: 0 });
});

test('componentes externos por pieza entran en el coste', () => {
  const comps = { led: { id: 'led', price: 6, packUnits: 1 }, iman: { id: 'iman', price: 5, packUnits: 50 } };
  close(Calc.componentUnitCost(comps.iman), 0.1);
  const job = { items: [], hours: 0, quantity: 3, components: [{ componentId: 'led', qty: 1 }, { componentId: 'iman', qty: 4 }] };
  const c = Calc.printCost(job, fil, settings, null, comps);
  close(c.components, 3 * 6 + 3 * 4 * 0.1);
  close(c.failure, 0); // sin margen de fallos sobre componentes
  close(c.unit, 6 + 0.4);
  // componente eliminado: usa el coste guardado
  const gone = Calc.printCost({ ...job, components: [{ componentId: 'x', qty: 2, unitCost: 1.5 }] }, fil, settings, null, comps);
  close(gone.components, 3 * 2 * 1.5);
  assert.deepEqual(Calc.componentsUsed(job.components, 3), { led: 3, iman: 12 });
});

test('material en plancha: coste por cm² con desperdicio y planchas usadas', () => {
  const mats = { mdf: { id: 'mdf', price: 6, sheetWidth: 600, sheetHeight: 400 } }; // 2400 cm² → 0,0025 €/cm²
  close(Calc.sheetCostPerCm2(mats.mdf), 0.0025);
  const s2 = { ...settings, sheetWaste: 20 };
  const job = { items: [], hours: 0, quantity: 4, sheets: [{ materialId: 'mdf', width: 100, height: 100 }] }; // 100 cm²/pieza
  const c = Calc.printCost(job, fil, s2, null, {}, mats);
  close(c.sheet, 100 * 4 * 1.2 * 0.0025);
  close(c.failure, c.sheet * 0.1);
  const used = Calc.sheetsUsed(job.sheets, 4, 20, mats);
  close(used.mdf, 480 / 2400);
  // material eliminado: usa el coste por cm² guardado
  const gone = Calc.printCost({ ...job, sheets: [{ materialId: 'x', width: 100, height: 100, costPerCm2: 0.01 }] }, fil, s2, null, {}, mats);
  close(gone.sheet, 480 * 0.01);
});

test('resultados por tipo de trabajo', () => {
  const state = {
    prints: [{ id: 'a', kind: 'laser', date: '2026-01-02', quantity: 3 }, { id: 'b', date: '2026-01-03', quantity: 1 }],
    sales: [
      { printId: 'a', date: '2026-01-05', quantity: 2, unitPrice: 10, fees: 1, unitCost: 2 },
      { printId: 'b', date: '2026-01-05', quantity: 1, unitPrice: 5, fees: 0, unitCost: 1 },
      { printId: null, date: '2026-01-06', quantity: 1, unitPrice: 7, fees: 0, unitCost: 0 },
    ],
  };
  const k = Calc.kindStats(state);
  assert.deepEqual(k.laser, { jobs: 1, units: 3, revenue: 20, profit: 15 });
  assert.deepEqual(k['3d'], { jobs: 1, units: 1, revenue: 5, profit: 4 });
  assert.equal(k.otros.revenue, 7);
});
