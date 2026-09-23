/*
 * Cálculos puros de Daprintbox (sin DOM ni almacenamiento).
 * Se carga en el navegador como script normal (window.Calc) y en Node con require().
 */
(function (root) {
  'use strict';

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const round2 = (v) => Math.round(num(v) * 100) / 100;

  /** Coste por gramo de un filamento (precio de la bobina / peso neto). */
  function costPerGram(filament) {
    const weight = num(filament && filament.spoolWeight);
    if (weight <= 0) return 0;
    return num(filament.price) / weight;
  }

  /**
   * Parámetros de la impresora usada: los de `printer` si se indica
   * ({ watts, price, lifeHours, maintenancePerHour }) o, si no, los de ajustes.
   */
  function printerParams(settings, printer) {
    if (printer) {
      return { watts: num(printer.watts), price: num(printer.price), lifeHours: num(printer.lifeHours), maintenancePerHour: num(printer.maintenancePerHour) };
    }
    return { watts: num(settings.printerWatts), price: num(settings.printerPrice), lifeHours: num(settings.printerLifeHours), maintenancePerHour: num(settings.maintenancePerHour) };
  }

  /** Coste de amortización + mantenimiento de la impresora por hora. */
  function machineHourCost(settings, printer) {
    const p = printerParams(settings, printer);
    const amort = p.lifeHours > 0 ? p.price / p.lifeHours : 0;
    return amort + p.maintenancePerHour;
  }

  /** Coste por hora de impresión sin material: máquina + electricidad. */
  function printerHourCost(settings, printer) {
    const p = printerParams(settings, printer);
    return machineHourCost(settings, printer) + (p.watts / 1000) * num(settings.kwhPrice);
  }

  /**
   * Desglose de coste de un trabajo de impresión.
   * job.items: [{ filamentId, grams }] — gramos totales del trabajo (todas las unidades).
   * job.hours: horas totales de impresión. job.quantity: piezas producidas.
   * printer: impresora usada (opcional; sin ella se usan los valores de ajustes).
   */
  function printCost(job, filamentsById, settings, printer) {
    const material = (job.items || []).reduce((sum, it) => {
      const f = filamentsById[it.filamentId];
      return sum + (f ? num(it.grams) * costPerGram(f) : 0);
    }, 0);
    const hours = num(job.hours);
    const electricity = hours * (printerParams(settings, printer).watts / 1000) * num(settings.kwhPrice);
    const machine = hours * machineHourCost(settings, printer);
    const labor = num(job.laborHours) * num(settings.laborRate);
    const extras = num(job.extras);
    const failure = (material + electricity + machine) * (num(settings.failureRate) / 100);
    const total = material + electricity + machine + labor + extras + failure;
    const quantity = Math.max(1, Math.floor(num(job.quantity)) || 1);
    const unit = total / quantity;
    const margin = job.margin === undefined || job.margin === '' ? num(settings.defaultMargin) : num(job.margin);
    return {
      material, electricity, machine, labor, extras, failure, total,
      quantity, unit,
      suggestedUnitPrice: unit * (1 + margin / 100),
      margin,
    };
  }

  /** Gramos que consume un trabajo agrupados por filamento. */
  function gramsByFilament(items) {
    const out = {};
    (items || []).forEach((it) => {
      if (!it.filamentId) return;
      out[it.filamentId] = (out[it.filamentId] || 0) + num(it.grams);
    });
    return out;
  }

  /** Unidades vendidas de cada trabajo de impresión. */
  function soldByPrint(sales) {
    const out = {};
    (sales || []).forEach((s) => {
      if (!s.printId) return;
      out[s.printId] = (out[s.printId] || 0) + num(s.quantity);
    });
    return out;
  }

  /**
   * Uso y rentabilidad por impresora: horas, trabajos, unidades, coste de producción
   * y, de las ventas ligadas a sus impresiones, ingresos y beneficio.
   */
  function printerStats(state) {
    const out = {};
    const row = (id) => (out[id] = out[id] || { hours: 0, jobs: 0, units: 0, cost: 0, revenue: 0, profit: 0 });
    const printerOf = {};
    (state.prints || []).forEach((p) => {
      if (!p.printerId) return;
      printerOf[p.id] = p.printerId;
      const r = row(p.printerId);
      r.hours += num(p.hours);
      r.jobs += 1;
      r.units += num(p.quantity);
      r.cost += num(p.cost && p.cost.total);
    });
    (state.sales || []).forEach((s) => {
      const id = printerOf[s.printId];
      if (!id) return;
      const t = saleTotals(s);
      out[id].revenue += t.revenue;
      out[id].profit += t.profit;
    });
    return out;
  }

  function saleTotals(sale) {
    const revenue = num(sale.quantity) * num(sale.unitPrice);
    const fees = num(sale.fees);
    const cogs = num(sale.quantity) * num(sale.unitCost);
    return { revenue, fees, cogs, profit: revenue - fees - cogs };
  }

  const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);

  /**
   * Resumen económico de un periodo [from, to] (fechas 'AAAA-MM-DD', ambas opcionales).
   * - Beneficio de ventas: ingresos - comisiones - coste de lo vendido.
   * - Resultado de caja: ingresos - comisiones - todos los gastos pagados (incluidas compras de filamento).
   */
  function summary(state, from, to) {
    const r = { revenue: 0, fees: 0, cogs: 0, salesProfit: 0, filamentSpend: 0, otherSpend: 0, units: 0, salesCount: 0 };
    (state.sales || []).forEach((s) => {
      if (!inRange(s.date, from, to)) return;
      const t = saleTotals(s);
      r.revenue += t.revenue;
      r.fees += t.fees;
      r.cogs += t.cogs;
      r.units += num(s.quantity);
      r.salesCount += 1;
    });
    (state.expenses || []).forEach((e) => {
      if (!inRange(e.date, from, to)) return;
      if (e.category === 'filamento') r.filamentSpend += num(e.amount);
      else r.otherSpend += num(e.amount);
    });
    r.salesProfit = r.revenue - r.fees - r.cogs;
    r.totalSpend = r.filamentSpend + r.otherSpend;
    r.cashResult = r.revenue - r.fees - r.totalSpend;
    r.marginPct = r.revenue > 0 ? (r.salesProfit / r.revenue) * 100 : 0;
    return r;
  }

  /** Lista de meses 'AAAA-MM' terminando en endMonth (incluido). */
  function lastMonths(endMonth, count) {
    const [y, m] = endMonth.split('-').map(Number);
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      out.push(d.toISOString().slice(0, 7));
    }
    return out;
  }

  /** Ingresos (netos de comisiones) y gastos pagados por mes. */
  function monthlySeries(state, months) {
    const map = {};
    months.forEach((k) => { map[k] = { month: k, income: 0, spend: 0 }; });
    (state.sales || []).forEach((s) => {
      const row = map[(s.date || '').slice(0, 7)];
      if (!row) return;
      const t = saleTotals(s);
      row.income += t.revenue - t.fees;
    });
    (state.expenses || []).forEach((e) => {
      const row = map[(e.date || '').slice(0, 7)];
      if (row) row.spend += num(e.amount);
    });
    return months.map((k) => ({ ...map[k], result: map[k].income - map[k].spend }));
  }

  const Calc = {
    num, round2, costPerGram, printerParams, machineHourCost, printerHourCost, printCost, gramsByFilament,
    soldByPrint, printerStats, saleTotals, summary, lastMonths, monthlySeries,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(typeof window !== 'undefined' ? window : globalThis);
