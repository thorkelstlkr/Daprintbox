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
