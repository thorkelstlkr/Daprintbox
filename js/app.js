/*
 * Libreta Maker — interfaz: vistas, formularios y gráfico.
 */
(function () {
  'use strict';

  const { num, printCost, costPerGram, gramsByFilament, soldByPrint, saleTotals, summary, lastMonths, monthlySeries } = window.Calc;
  const { uid, today } = window.Store;
  const { t, N_ } = window.I18n;
  const LOC = () => window.I18n.locale();

  let S = window.Store.load();
  const ui = { kind: 'all', period: 'month', salesPeriod: 'all', expensesPeriod: 'all', filamentQuery: '' };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const view = $('#view');

  // ---------------------------------------------------------------- formato

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function money(v) {
    try {
      return new Intl.NumberFormat(LOC(), { style: 'currency', currency: S.settings.currency || 'EUR' }).format(num(v));
    } catch (e) {
      return num(v).toFixed(2) + ' ' + (S.settings.currency || '');
    }
  }
  const moneySigned = (v) => `<span class="${v < 0 ? 'neg' : v > 0 ? 'pos' : ''}">${money(v)}</span>`;
  const fmtNum = (v, d = 0) => new Intl.NumberFormat(LOC(), { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(num(v));
  const fmtGrams = (g) => (Math.abs(num(g)) >= 1000 ? fmtNum(num(g) / 1000, 2) + ' kg' : fmtNum(g) + ' g');
  const fmtMl = (ml) => (Math.abs(num(ml)) >= 1000 ? fmtNum(num(ml) / 1000, 2) + ' L' : fmtNum(ml) + ' ml');
  // Filamento (FDM) o resina: la resina suele medirse en ml (es lo que da el laminador)
  const isResin = (f) => !!f && f.kind === 'resina';
  const unitOf = (f) => (f && f.unit) || (isResin(f) ? 'ml' : 'g');
  const fmtAmount = (q, unit) => (unit === 'ml' ? fmtMl(q) : fmtGrams(q));
  const fmtStock = (f) => fmtAmount(f.remaining, unitOf(f));
  const fmtDateTime = (dt) => {
    const d = new Date(String(dt).replace(' ', 'T'));
    return isNaN(d) ? String(dt) : d.toLocaleString(LOC(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(LOC(), { day: '2-digit', month: 'short', year: 'numeric' }) : '');
  const fmtHours = (h) => {
    const total = Math.round(num(h) * 60);
    return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')} min`;
  };
  const monthLabel = (ym, withYear) => {
    const d = new Date(ym + '-01T00:00:00');
    return d.toLocaleDateString(LOC(), withYear ? { month: 'short', year: 'numeric' } : { month: 'short' }).replace('.', '');
  };

  const filamentsById = () => Object.fromEntries(S.filaments.map((f) => [f.id, f]));
  const findPrinter = (id) => S.printers.find((x) => x.id === id);
  const componentsById = () => Object.fromEntries(S.components.map((c) => [c.id, c]));
  const materialsById = () => Object.fromEntries(S.materials.map((m) => [m.id, m]));
  const { sheetCostPerCm2, sheetsUsed } = window.Calc;
  const matLow = (m) => num(m.stock) <= (m.lowStock === '' || m.lowStock == null ? 0 : num(m.lowStock));
  const fmtSheets = (n) => (Math.abs(num(n) - 1) < 1e-9 ? t('{n} plancha', { n: fmtNum(n, 2) }) : t('{n} planchas', { n: fmtNum(n, 2) }));
  const materialLabel = (m) => `${m.name}${m.thickness ? ' ' + fmtNum(m.thickness, 1) + ' mm' : ''}`;

  // Tipos de trabajo y de máquina
  // (en español; se traducen al mostrarlos con t())
  const KINDS = { '3d': N_('Impresión 3D'), laser: N_('Corte y grabado láser'), sello: N_('Sello personalizado') };
  const KIND_SHORT = { '3d': '3D', laser: N_('Láser'), sello: N_('Sello'), otros: N_('Otras ventas') };
  const MACHINE_TYPES = { '3d': N_('Impresora 3D FDM'), resina: N_('Impresora 3D de resina'), laser: N_('Láser'), insoladora: N_('Insoladora'), otra: N_('Otra') };
  const machineType = (m) => (m && m.type) || '3d';
  const machineForKind = (kind) => ({ '3d': '3d', laser: 'laser', sello: 'insoladora' }[kind] || '3d');
  const kindForMachine = (m) => ({ laser: 'laser', insoladora: 'sello' }[machineType(m)] || '3d');
  /** ¿Sirve esta máquina para este tipo de trabajo? (la impresión 3D admite FDM y resina) */
  const machineFits = (m, kind) => !!m && (kind === '3d' ? ['3d', 'resina'].includes(machineType(m)) : machineType(m) === machineForKind(kind));
  // Materiales típicos de un sello de fotopolímero: la plancha y el negativo (fotolito)
  const isPhotopolymer = (m) => /fotopol|photopol/i.test(`${m.category} ${m.name}`);
  const isNegative = (m) => /fotolit|negati|n[ée]gatif|acetat|ac[ée]tate|film|pellicola|typon/i.test(`${m.category} ${m.name}`);
  const { componentUnitCost, componentsUsed } = window.Calc;
  const compLow = (c) => num(c.stock) <= (c.lowStock === '' || c.lowStock == null ? 0 : num(c.lowStock));
  // «ud.» es la unidad por defecto guardada en los datos; se muestra traducida
  const unitLabel = (u) => (!u || u === 'ud.' ? t('ud.') : u);
  const fmtQty = (q, unit) => `${fmtNum(q, 2)} ${unitLabel(unit)}`;
  const defaultPrinter = () => findPrinter(S.settings.defaultPrinterId) || S.printers[0];
  const printerHourCost = (pr) => window.Calc.printerHourCost(S.settings, pr);
  const filamentLabel = (f) => `${f.name}${f.material ? ' · ' + f.material : ''}`;
  const lowThreshold = (f) => (f.lowStock === '' || f.lowStock == null ? num(S.settings.lowStockGrams) : num(f.lowStock));
  const isLow = (f) => num(f.remaining) <= lowThreshold(f);

  // ---------------------------------------------------------------- periodos

  const PERIODS = {
    month: N_('Este mes'),
    prevMonth: N_('Mes anterior'),
    year: N_('Este año'),
    last12: N_('Últimos 12 meses'),
    all: N_('Todo'),
  };

  function periodRange(key) {
    const td = today();
    const [y, m] = td.split('-').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    const lastDay = (yy, mm) => new Date(yy, mm, 0).getDate();
    switch (key) {
      case 'month': return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${lastDay(y, m)}`];
      case 'prevMonth': {
        const py = m === 1 ? y - 1 : y;
        const pm = m === 1 ? 12 : m - 1;
        return [`${py}-${pad(pm)}-01`, `${py}-${pad(pm)}-${lastDay(py, pm)}`];
      }
      case 'year': return [`${y}-01-01`, `${y}-12-31`];
      case 'last12': return [lastMonths(td.slice(0, 7), 12)[0] + '-01', td];
      default: return [null, null];
    }
  }
  const inPeriod = (date, key) => {
    const [from, to] = periodRange(key);
    return (!from || date >= from) && (!to || date <= to);
  };
  const periodSelect = (name, value) =>
    `<select data-period="${name}" aria-label="${t('Periodo')}">${Object.entries(PERIODS)
      .map(([k, v]) => `<option value="${k}"${k === value ? ' selected' : ''}>${t(v)}</option>`).join('')}</select>`;

  // ---------------------------------------------------------------- persistencia

  // Modo servidor: los datos se guardan en MySQL a través de api/api.php (ver js/config.js)
  const remote = !!(window.Remote && window.Remote.enabled);
  const sync = {
    ready: false, user: null, username: '', email: '', version: 0,
    pending: false, saving: false, offline: false, error: '', updatedBy: '', updatedAt: '',
    base: null,          // última versión confirmada por el servidor (para combinar cambios)
    replaceAll: false,   // el próximo guardado sustituye la libreta entera (restaurar, cargar ejemplo…)
  };

  // App instalable (PWA): solo cuando la página se sirve con manifiesto (versión web/servidor)
  const pwa = {
    supported: 'serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !!document.querySelector('link[rel="manifest"]'),
    installed: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    prompt: null,
  };
  if (pwa.supported) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      pwa.prompt = e;
      if (currentView() === 'settings') render();
    });
    window.addEventListener('appinstalled', () => {
      pwa.prompt = null;
      pwa.installed = true;
      toast(t('Libreta Maker instalada'));
      if (currentView() === 'settings') render();
    });
  }

  function persist(msg) {
    if (remote) {
      sync.ready = true;
      render();
      queueSave(msg);
      saveCache(); // primero en el dispositivo; el servidor se actualiza en cuanto hay conexión
      return;
    }
    if (!window.Store.save(S)) toast(t('No se pudo guardar en este navegador. Exporta una copia desde Ajustes.'));
    else if (msg) toast(msg);
    render();
  }

  let toastTimer;
  function toast(msg, ms = 2600) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  /** Suma (sign=+1) o descuenta (sign=-1) del stock los gramos de un trabajo. */
  /** Suma (sign=+1) o descuenta (sign=-1) del stock los componentes de un trabajo. */
  function applyComponentStock(components, quantity, sign) {
    const byId = componentsById();
    Object.entries(componentsUsed(components, quantity)).forEach(([id, q]) => {
      if (byId[id]) byId[id].stock = Math.round((num(byId[id].stock) + sign * q) * 100) / 100;
    });
  }

  /** Suma (sign=+1) o descuenta (sign=-1) del stock las planchas de un trabajo. */
  function applySheetStock(sheets, quantity, sign) {
    const byId = materialsById();
    Object.entries(sheetsUsed(sheets, quantity, S.settings.sheetWaste, byId)).forEach(([id, n]) => {
      byId[id].stock = Math.round((num(byId[id].stock) + sign * n) * 1000) / 1000;
    });
  }

  /** Aplica al stock todo lo que consume un trabajo (filamento, planchas y componentes). */
  function applyJobStock(job, sign) {
    applyStock(job.items, sign);
    applySheetStock(job.sheets, job.quantity, sign);
    applyComponentStock(job.components, job.quantity, sign);
  }

  function applyStock(items, sign) {
    const byId = filamentsById();
    Object.entries(gramsByFilament(items)).forEach(([id, g]) => {
      if (byId[id]) byId[id].remaining = Math.round((num(byId[id].remaining) + sign * g) * 10) / 10;
    });
  }

  // ---------------------------------------------------------------- modal

  const modal = $('#modal');
  let modalSubmit = null;

  function openModal({ title, body, submitLabel = t('Guardar'), onOpen, onSubmit, hideCancel = false }) {
    $('#modal-title').textContent = title;
    // cuerpo nuevo en cada apertura para no acumular listeners de formularios anteriores
    const old = $('#modal-body');
    const fresh = old.cloneNode(false);
    old.replaceWith(fresh);
    fresh.innerHTML = body;
    $('#modal-submit').textContent = submitLabel;
    $('.modal-foot [data-close]', modal).hidden = hideCancel;
    modalSubmit = onSubmit;
    if (!modal.open) modal.showModal();
    if (onOpen) onOpen($('#modal-body'));
    const first = $('#modal-body input, #modal-body select');
    if (first) first.focus();
  }

  $('#modal-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const body = $('#modal-body');
    const invalid = $$('[required]', body).find((el) => !String(el.value).trim());
    if (invalid) {
      invalid.focus();
      toast(t('Completa los campos obligatorios.'));
      return;
    }
    if (modalSubmit && modalSubmit(body) === false) return;
    modal.close();
  });
  $$('[data-close]', modal).forEach((b) => b.addEventListener('click', () => modal.close()));

  /** Confirmación dentro de la página (no depende de window.confirm, que algunos visores bloquean). */
  function askConfirm(message, onYes, yesLabel = t('Eliminar')) {
    openModal({
      title: t('Confirmar'),
      submitLabel: yesLabel,
      body: message.split('\n').map((line) => `<p>${esc(line)}</p>`).join(''),
      onSubmit: () => { onYes(); },
    });
  }

  const field = (label, input, opts = {}) =>
    `<div class="field${opts.wide ? ' wide' : ''}"><label>${label}</label>${input}${opts.hint ? `<span class="hint">${opts.hint}</span>` : ''}</div>`;
  const inp = (name, value, attrs = '') => `<input name="${name}" value="${esc(value)}" ${attrs}>`;
  const numInp = (name, value, attrs = '') => inp(name, value, `type="number" step="any" inputmode="decimal" ${attrs}`);
  const val = (body, name) => { const el = body.querySelector(`[name="${name}"]`); return el ? el.value.trim() : ''; };
  const checked = (body, name) => { const el = body.querySelector(`[name="${name}"]`); return !!(el && el.checked); };

  // ================================================================ RESUMEN

  function viewDashboard() {
    const [from, to] = periodRange(ui.period);
    const r = summary(S, from, to);
    const stockGrams = S.filaments.filter((f) => unitOf(f) === 'g').reduce((s, f) => s + Math.max(0, num(f.remaining)), 0);
    const stockMl = S.filaments.filter((f) => unitOf(f) === 'ml').reduce((s, f) => s + Math.max(0, num(f.remaining)), 0);
    const stockValue = S.filaments.reduce((s, f) => s + Math.max(0, num(f.remaining)) * costPerGram(f), 0);
    const low = S.filaments.filter(isLow);
    const lowComps = S.components.filter(compLow);
    const lowMats = S.materials.filter(matLow);
    const matValue = S.materials.reduce((s, m) => s + Math.max(0, num(m.stock)) * num(m.price), 0);
    const kinds = window.Calc.kindStats(S, from, to);
    const kindRows = ['3d', 'laser', 'sello', 'otros'].filter((k) => kinds[k] && (kinds[k].jobs || kinds[k].revenue));
    const compValue = S.components.reduce((s, c) => s + Math.max(0, num(c.stock)) * componentUnitCost(c), 0);

    const months = lastMonths(today().slice(0, 7), 12);
    const series = monthlySeries(S, months);

    // Rentabilidad por pieza (en el periodo)
    const byPiece = {};
    S.sales.filter((s) => (!from || s.date >= from) && (!to || s.date <= to)).forEach((s) => {
      const key = s.description || t('Sin nombre');
      const tt = saleTotals(s);
      byPiece[key] = byPiece[key] || { name: key, units: 0, revenue: 0, profit: 0 };
      byPiece[key].units += num(s.quantity);
      byPiece[key].revenue += tt.revenue;
      byPiece[key].profit += tt.profit;
    });
    const top = Object.values(byPiece).sort((a, b) => b.profit - a.profit).slice(0, 6);

    // Piezas fabricadas aún sin vender
    const sold = soldByPrint(S.sales);
    const unsold = S.prints
      .map((p) => ({ p, left: num(p.quantity) - num(sold[p.id]) }))
      .filter((x) => x.left > 0);
    const unsoldValue = unsold.reduce((s, x) => s + x.left * num(x.p.cost && x.p.cost.unit), 0);

    const empty = !S.printers.length && !S.filaments.length && !S.prints.length && !S.sales.length && !S.expenses.length;

    return `
      <div class="page-head">
        <h1>${t('Resumen')}</h1>
        <div class="filters">${periodSelect('period', ui.period)}</div>
      </div>
      ${empty ? `<div class="card"><h2>${t('Bienvenido 👋')}</h2>
        <p>${t('Empieza añadiendo tus <b>máquinas</b> (impresoras 3D, láser, insoladora) y tus <b>materiales</b> (filamento, planchas, componentes), registra cada <b>trabajo</b> —impresión 3D, corte o grabado láser, sello— para calcular su coste y descontar el material, y apunta tus <b>ventas</b> para ver tu beneficio real.')}</p>
        <div class="filters"><button class="btn primary" data-action="new-printer">${t('Añadir máquina')}</button>
        <button class="btn" data-action="new-filament">${t('Añadir filamento')}</button>
        <button class="btn" data-action="load-demo">${t('Cargar datos de ejemplo')}</button></div></div>` : ''}
      <div class="kpis">
        <div class="kpi"><div class="label">${t('Ingresos por ventas')}</div><div class="value">${money(r.revenue)}</div>
          <div class="sub">${r.salesCount === 1 ? t('1 venta') : t('{n} ventas', { n: r.salesCount })} · ${t('{n} uds.', { n: fmtNum(r.units) })}</div></div>
        <div class="kpi"><div class="label">${t('Beneficio de las ventas')}</div><div class="value">${moneySigned(r.salesProfit)}</div>
          <div class="sub">${t('Margen {pct} % · tras coste y comisiones', { pct: fmtNum(r.marginPct, 1) })}</div></div>
        <div class="kpi"><div class="label">${t('Gastos pagados')}</div><div class="value">${money(r.totalSpend)}</div>
          <div class="sub">${t('Filamento {a} · otros {b}', { a: money(r.filamentSpend), b: money(r.otherSpend) })}</div></div>
        <div class="kpi"><div class="label">${t('Resultado de caja')}</div><div class="value">${moneySigned(r.cashResult)}</div>
          <div class="sub">${t('Ingresos − comisiones − gastos')}</div></div>
        <div class="kpi"><div class="label">${t('Stock de impresión 3D')}</div><div class="value">${[stockGrams || !stockMl ? fmtGrams(stockGrams) : '', stockMl ? fmtMl(stockMl) : ''].filter(Boolean).join(' · ')}</div>
          <div class="sub">${t('Valor {v} · {n} bobinas y envases', { v: money(stockValue), n: S.filaments.length })}${S.materials.length ? ` · ${t('planchas {v}', { v: money(matValue) })}` : ''}${S.components.length ? ` · ${t('componentes {v}', { v: money(compValue) })}` : ''}</div></div>
      </div>

      <div class="card">
        <h2>${t('Ingresos vs. gastos · últimos 12 meses')}</h2>
        ${barChart(series)}
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h2>${t('Stock bajo')}</h2>
          ${low.length || lowComps.length || lowMats.length ? `<ul class="alert-list">${low.map((f) => `
            <li><span><span class="swatch" style="background:${esc(f.color || '#999')}"></span>${esc(filamentLabel(f))}</span>
              <span class="nowrap"><span class="badge low">⚠ ${fmtStock(f)}</span>
              <button class="btn small" data-action="restock" data-id="${f.id}">${t('Reponer')}</button></span></li>`).join('')}${lowComps.map((c) => `
            <li><span>🔩 ${esc(c.name)}</span>
              <span class="nowrap"><span class="badge low">⚠ ${fmtQty(c.stock, c.unit)}</span>
              <button class="btn small" data-action="restock-component" data-id="${c.id}">${t('Reponer')}</button></span></li>`).join('')}${lowMats.map((m) => `
            <li><span>▭ ${esc(materialLabel(m))}</span>
              <span class="nowrap"><span class="badge low">⚠ ${fmtSheets(m.stock)}</span>
              <button class="btn small" data-action="restock-material" data-id="${m.id}">${t('Reponer')}</button></span></li>`).join('')}</ul>`
            : `<p class="muted">${t('✓ Filamento, resina, planchas y componentes por encima del mínimo.')}</p>`}
        </div>
        <div class="card">
          <h2>${t('Piezas más rentables')} · ${t(PERIODS[ui.period]).toLowerCase()}</h2>
          ${top.length ? `<div class="table-wrap"><table>
            <thead><tr><th>${t('Pieza')}</th><th class="num">${t('Uds.')}</th><th class="num">${t('Ingresos')}</th><th class="num">${t('Beneficio')}</th></tr></thead>
            <tbody>${top.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${fmtNum(x.units)}</td><td class="num">${money(x.revenue)}</td><td class="num">${moneySigned(x.profit)}</td></tr>`).join('')}</tbody>
          </table></div>` : `<p class="muted">${t('Sin ventas en este periodo.')}</p>`}
        </div>
      </div>

      <div class="card">
        <h2>${t('Por línea de negocio')} · ${t(PERIODS[ui.period]).toLowerCase()}</h2>
        ${kindRows.length ? `<div class="table-wrap"><table>
          <thead><tr><th>${t('Línea')}</th><th class="num">${t('Trabajos')}</th><th class="num">${t('Uds. fabricadas')}</th><th class="num">${t('Ingresos')}</th><th class="num">${t('Beneficio')}</th><th class="num">${t('Margen')}</th></tr></thead>
          <tbody>${kindRows.map((k) => { const r = kinds[k]; return `<tr><td><span class="badge kind-${k}">${esc(t(KIND_SHORT[k]))}</span></td>
            <td class="num">${k === 'otros' ? '—' : fmtNum(r.jobs)}</td><td class="num">${k === 'otros' ? '—' : fmtNum(r.units)}</td>
            <td class="num">${money(r.revenue)}</td><td class="num">${moneySigned(r.profit)}</td>
            <td class="num">${r.revenue > 0 ? fmtNum((r.profit / r.revenue) * 100) + ' %' : '—'}</td></tr>`; }).join('')}</tbody>
        </table></div>` : `<p class="muted">${t('Sin trabajos ni ventas en este periodo.')}</p>`}
      </div>

      <div class="card">
        <h2>${t('Piezas fabricadas pendientes de vender')}</h2>
        ${unsold.length ? `<p class="small muted">${t('{n} unidades · coste inmovilizado {v}', { n: fmtNum(unsold.reduce((s, x) => s + x.left, 0)), v: money(unsoldValue) })}</p>
          <div class="table-wrap"><table>
          <thead><tr><th>${t('Pieza')}</th><th>${t('Fecha')}</th><th class="num">${t('Disponibles')}</th><th class="num">${t('Coste ud.')}</th><th class="num">${t('Precio sugerido')}</th><th></th></tr></thead>
          <tbody>${unsold.map(({ p, left }) => `<tr><td>${esc(p.name)}</td><td class="nowrap">${fmtDate(p.date)}</td><td class="num">${fmtNum(left)}</td>
            <td class="num">${money(p.cost && p.cost.unit)}</td><td class="num">${money(p.cost && p.cost.suggestedUnitPrice)}</td>
            <td class="actions"><button class="btn small" data-action="sell-print" data-id="${p.id}">${t('Vender')}</button></td></tr>`).join('')}</tbody>
          </table></div>` : `<p class="muted">${t('No hay piezas en inventario.')}</p>`}
      </div>`;
  }

  // Gráfico de barras agrupadas (SVG) con tooltip y vista de tabla.
  function barChart(series) {
    const W = 760, H = 260, padL = 56, padR = 8, padT = 10, padB = 28;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxVal = Math.max(1, ...series.map((d) => Math.max(d.income, d.spend)));
    const niceStep = (() => {
      const raw = maxVal / 4;
      const pow = Math.pow(10, Math.floor(Math.log10(raw)));
      const n = raw / pow;
      return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
    })();
    const yMax = niceStep * 4;
    const y = (v) => padT + plotH - (v / yMax) * plotH;
    const groupW = plotW / series.length;
    const barW = Math.min(22, (groupW - 12) / 2);
    const gap = 2;

    const bar = (x, v, cls) => {
      const h = Math.max(0, (v / yMax) * plotH);
      if (h < 0.5) return '';
      const top = padT + plotH - h, r = Math.min(4, barW / 2, h);
      return `<path class="${cls}" d="M${x},${padT + plotH} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + barW - r},${top} Q${x + barW},${top} ${x + barW},${top + r} L${x + barW},${padT + plotH} Z"/>`;
    };

    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const v = niceStep * i, yy = y(v);
      grid += `<line class="${i === 0 ? 'baseline' : 'gridline'}" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/>`;
      grid += `<text class="tick" x="${padL - 8}" y="${yy + 4}" text-anchor="end">${esc(money(v).replace(/,00(?=\D*$)/, ''))}</text>`;
    }

    const groups = series.map((d, i) => {
      const cx = padL + groupW * i + groupW / 2;
      const x1 = cx - barW - gap / 2, x2 = cx + gap / 2;
      return `${bar(x1, d.income, 'bar-income')}${bar(x2, d.spend, 'bar-spend')}
        <text class="tick" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(monthLabel(d.month))}</text>
        <rect class="hit" data-i="${i}" x="${padL + groupW * i}" y="${padT}" width="${groupW}" height="${plotH}"/>`;
    }).join('');

    return `
      <div class="legend"><span><i style="background:var(--series-1)"></i>${t('Ingresos netos')}</span><span><i style="background:var(--series-2)"></i>${t('Gastos pagados')}</span></div>
      <div class="chart-scroll"><div class="chart" data-series='${esc(JSON.stringify(series))}'>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Ingresos y gastos por mes de los últimos 12 meses')}">${grid}${groups}</svg>
        <div class="tooltip"></div>
      </div></div>
      <details class="table-view"><summary>${t('Ver como tabla')}</summary>
        <div class="table-wrap"><table>
          <thead><tr><th>${t('Mes')}</th><th class="num">${t('Ingresos netos')}</th><th class="num">${t('Gastos')}</th><th class="num">${t('Resultado')}</th></tr></thead>
          <tbody>${series.map((d) => `<tr><td>${esc(monthLabel(d.month, true))}</td><td class="num">${money(d.income)}</td><td class="num">${money(d.spend)}</td><td class="num">${moneySigned(d.result)}</td></tr>`).join('')}</tbody>
        </table></div>
      </details>`;
  }

  function wireChart() {
    $$('.chart-scroll').forEach((sc) => { sc.scrollLeft = sc.scrollWidth; });
    $$('.chart').forEach((chart) => {
      const series = JSON.parse(chart.dataset.series);
      const tip = $('.tooltip', chart);
      $$('.hit', chart).forEach((hit) => {
        hit.addEventListener('mouseenter', () => {
          const d = series[+hit.dataset.i];
          tip.innerHTML = `<div><b>${esc(monthLabel(d.month, true))}</b></div>
            <div class="row"><span><i class="swatch" style="background:var(--series-1);border-radius:3px"></i>${t('Ingresos')}</span><b>${money(d.income)}</b></div>
            <div class="row"><span><i class="swatch" style="background:var(--series-2);border-radius:3px"></i>${t('Gastos')}</span><b>${money(d.spend)}</b></div>
            <div class="row"><span>${t('Resultado')}</span><b>${moneySigned(d.result)}</b></div>`;

          tip.classList.add('show');
        });
        hit.addEventListener('mousemove', (ev) => {
          const box = chart.getBoundingClientRect();
          let left = ev.clientX - box.left + 14;
          if (left + tip.offsetWidth > box.width) left = ev.clientX - box.left - tip.offsetWidth - 14;
          tip.style.left = Math.max(0, left) + 'px';
          tip.style.top = Math.max(0, ev.clientY - box.top - tip.offsetHeight / 2) + 'px';
        });
        hit.addEventListener('mouseleave', () => tip.classList.remove('show'));
      });
    });
  }

  // ================================================================ FILAMENTOS

  const MATERIALS = ['PLA', 'PLA+', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'PC', 'PVA', 'HIPS', 'CF-PLA', 'Silk PLA'];
  const RESINS = [N_('Resina estándar'), 'ABS-like', N_('Lavable con agua'), 'Tough', N_('Flexible'), N_('8K / alta definición'), N_('Transparente'), N_('Vegetal')];
  const resinNames = () => RESINS.map((r) => t(r));

  function viewFilaments() {
    const q = ui.filamentQuery.toLowerCase();
    const list = S.filaments
      .filter((f) => !q || [f.name, f.material, f.brand, f.colorName, isResin(f) ? t('Resina') : t('Filamento')].join(' ').toLowerCase().includes(q))
      .sort((a, b) => Number(isResin(a)) - Number(isResin(b)) || (a.material || '').localeCompare(b.material || '') || a.name.localeCompare(b.name));
    const total = (unit) => list.filter((f) => unitOf(f) === unit).reduce((s, f) => s + Math.max(0, num(f.remaining)), 0);
    const totalV = list.reduce((s, f) => s + Math.max(0, num(f.remaining)) * costPerGram(f), 0);
    const totals = [total('g') ? fmtGrams(total('g')) : '', total('ml') ? fmtMl(total('ml')) : ''].filter(Boolean).join(' · ') || '—';

    return `
      <div class="page-head">
        <h1>${t('Filamento y resina')}</h1>
        <div class="actions">
          <input type="search" placeholder="${t('Buscar…')}" data-filter="filamentQuery" value="${esc(ui.filamentQuery)}" aria-label="${t('Buscar filamento o resina')}">
          <button class="btn primary" data-action="new-filament">${t('+ Nuevo filamento o resina')}</button>
        </div>
      </div>
      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>${t('Material')}</th><th>${t('Marca')}</th><th class="num">${t('Precio')}</th><th class="num">€/kg · €/L</th><th>${t('Stock')}</th><th class="num">${t('Valor')}</th><th></th></tr></thead>
          <tbody>${list.map((f) => {
            const pct = num(f.spoolWeight) > 0 ? Math.max(0, Math.min(100, (num(f.remaining) / num(f.spoolWeight)) * 100)) : 0;
            const low = isLow(f);
            return `<tr>
              <td><span class="swatch" style="background:${esc(f.color || '#999')}"></span><b>${esc(f.name)}</b>
                <div class="small muted">${esc([isResin(f) ? t('Resina') : t('Filamento'), f.material, f.colorName, !isResin(f) && f.diameter ? f.diameter + ' mm' : ''].filter(Boolean).join(' · '))}</div></td>
              <td>${esc(f.brand || '')}</td>
              <td class="num">${money(f.price)}<div class="small muted">${t(isResin(f) ? 'envase de {q}' : 'bobina de {q}', { q: fmtAmount(f.spoolWeight, unitOf(f)) })}</div></td>
              <td class="num">${money(costPerGram(f) * 1000)}<div class="small muted">${unitOf(f) === 'ml' ? t('por litro') : t('por kg')}</div></td>
              <td><div class="stock"><div class="stock-bar${low ? ' low' : ''}"><span style="width:${pct}%"></span></div>
                <span class="nowrap small">${fmtStock(f)}</span></div>
                ${low ? `<span class="badge low">${t('⚠ Stock bajo')}</span>` : ''}</td>
              <td class="num">${money(Math.max(0, num(f.remaining)) * costPerGram(f))}</td>
              <td class="actions">
                <button class="btn small" data-action="restock" data-id="${f.id}">${t('Reponer')}</button>
                <button class="icon-btn" data-action="edit-filament" data-id="${f.id}" aria-label="${t('Editar')}" title="${t('Editar / ajustar stock')}">✎</button>
                <button class="icon-btn" data-action="delete-filament" data-id="${f.id}" aria-label="${t('Eliminar')}" title="${t('Eliminar')}">🗑</button>
              </td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td colspan="4">${t('Total')}</td><td>${totals}</td><td class="num">${money(totalV)}</td><td></td></tr></tfoot>
        </table></div>` : `<div class="empty">${S.filaments.length ? t('Nada coincide con la búsqueda.') : t('Aún no tienes filamento ni resina. Añade tu primera bobina o envase.')}</div>`}
      </div>`;
  }

  function filamentForm(f) {
    const isNew = !f;
    f = f || { kind: 'filamento', name: '', material: 'PLA', color: '#3987e5', colorName: '', brand: '', diameter: '1.75', spoolWeight: 1000, price: 20, remaining: '', lowStock: '' };
    const resin = isResin(f);
    openModal({
      title: isNew ? t('Nuevo filamento o resina') : (resin ? t('Editar resina') : t('Editar filamento')),
      body: `<div class="form-grid">
        ${field(t('Tipo'), `<select name="kind"><option value="filamento"${resin ? '' : ' selected'}>${t('Filamento (FDM)')}</option><option value="resina"${resin ? ' selected' : ''}>${t('Resina (SLA / MSLA)')}</option></select>`)}
        ${field(t('Nombre *'), inp('name', f.name, `required placeholder="${t('Ej. PLA Negro mate, Resina gris 8K…')}"`))}
        ${field(t('Material'), inp('material', f.material, 'list="materials"') + '<datalist id="materials"></datalist>')}
        ${field(t('Marca'), inp('brand', f.brand))}
        ${field(t('Color'), `<input type="color" name="color" value="${esc(f.color || '#999999')}">`)}
        ${field(t('Nombre del color'), inp('colorName', f.colorName, `placeholder="${t('Negro')}"`))}
        <div class="field" data-only="filamento"><label>${t('Diámetro (mm)')}</label><select name="diameter">${['1.75', '2.85', '3.00'].map((d) => `<option${String(f.diameter) === d ? ' selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="field" data-only="resina"><label>${t('Se mide en')}</label><select name="unit"><option value="ml"${unitOf(f) === 'ml' ? ' selected' : ''}>${t('mililitros (ml)')}</option><option value="g"${resin && unitOf(f) === 'g' ? ' selected' : ''}>${t('gramos (g)')}</option></select>
          <span class="hint">${t('Usa la misma unidad que te da el laminador.')}</span></div>
        ${field('<span data-lbl="size"></span> *', numInp('spoolWeight', f.spoolWeight, 'required min="1"'))}
        ${field('<span data-lbl="price"></span> *', numInp('price', f.price, 'required min="0"'))}
        ${isNew
          ? field('<span data-lbl="count"></span>', numInp('spools', 1, 'min="0"'), { hint: t('Define el stock inicial.') })
          : field('<span data-lbl="stock"></span>', numInp('remaining', f.remaining), { hint: '<span data-lbl="stockhint"></span>' })}
        ${field('<span data-lbl="low"></span>', numInp('lowStock', f.lowStock, `placeholder="${S.settings.lowStockGrams}"`), { hint: t('Vacío = valor de Ajustes.') })}
        ${isNew ? `${field(t('Fecha de compra'), `<input type="date" name="date" value="${today()}">`)}
          <div class="field wide"><label class="check"><input type="checkbox" name="asExpense" checked> ${t('Registrar la compra como gasto')}</label></div>` : ''}
      </div>`,
      onOpen: (b) => {
        const update = () => {
          const r = val(b, 'kind') === 'resina';
          const u = r ? val(b, 'unit') : 'g';
          $$('[data-only]', b).forEach((el) => { el.hidden = el.dataset.only !== (r ? 'resina' : 'filamento'); });
          const L = {
            size: r ? t('Contenido del envase ({u})', { u }) : t('Peso neto de la bobina (g)'),
            price: r ? t('Precio por envase') : t('Precio por bobina'),
            count: r ? t('Nº de envases comprados') : t('Nº de bobinas compradas'),
            stock: t('Stock actual ({u})', { u }),
            stockhint: r ? t('Lo que queda en el envase.') : t('Ajusta tras pesar la bobina.'),
            low: t('Aviso de stock bajo ({u})', { u }),
          };
          $$('[data-lbl]', b).forEach((el) => { el.textContent = L[el.dataset.lbl]; });
          $('#materials', b).innerHTML = (r ? resinNames() : MATERIALS).map((m) => `<option value="${esc(m)}">`).join('');
        };
        $('[name="kind"]', b).addEventListener('change', (e) => {
          // valores típicos al cambiar de tipo en un alta nueva
          if (isNew && e.target.value === 'resina' && val(b, 'material') === 'PLA') { $('[name="material"]', b).value = t('Resina estándar'); $('[name="price"]', b).value = 30; }
          if (isNew && e.target.value === 'filamento' && resinNames().includes(val(b, 'material'))) { $('[name="material"]', b).value = 'PLA'; $('[name="price"]', b).value = 20; }
          update();
        });
        $('[name="unit"]', b).addEventListener('change', update);
        update();
      },
      onSubmit: (b) => {
        const kind = val(b, 'kind') === 'resina' ? 'resina' : 'filamento';
        const data = {
          kind, unit: kind === 'resina' ? (val(b, 'unit') || 'ml') : 'g',
          name: val(b, 'name'), material: val(b, 'material'), brand: val(b, 'brand'), color: val(b, 'color'),
          colorName: val(b, 'colorName'), diameter: kind === 'resina' ? '' : val(b, 'diameter'),
          spoolWeight: num(val(b, 'spoolWeight')), price: num(val(b, 'price')), lowStock: val(b, 'lowStock'),
        };
        if (data.spoolWeight <= 0) { toast(kind === 'resina' ? t('El contenido del envase debe ser mayor que 0.') : t('El peso de la bobina debe ser mayor que 0.')); return false; }
        if (isNew) {
          const n = num(val(b, 'spools'));
          const nf = { id: uid(), ...data, remaining: n * data.spoolWeight, createdAt: today() };
          S.filaments.push(nf);
          if (checked(b, 'asExpense') && n > 0) {
            S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'filamento', description: `${n} × ${filamentLabel(nf)}`, amount: n * data.price, filamentId: nf.id });
          }
          persist(kind === 'resina' ? t('Resina añadida') : t('Filamento añadido'));
        } else {
          Object.assign(f, data, { remaining: num(val(b, 'remaining')) });
          persist(kind === 'resina' ? t('Resina actualizada') : t('Filamento actualizado'));
        }
      },
    });
  }

  function restockForm(f) {
    const u = unitOf(f), resin = isResin(f);
    openModal({
      title: t('Reponer · {name}', { name: f.name }),
      submitLabel: t('Añadir al stock'),
      body: `<div class="form-grid">
        ${field(resin ? t('Nº de envases') : t('Nº de bobinas'), numInp('spools', 1, 'min="0" step="1"'))}
        ${field(t('Cantidad a añadir ({u})', { u }), numInp('grams', f.spoolWeight, 'required min="0"'))}
        ${field(t('Importe pagado'), numInp('amount', f.price, 'min="0"'), { hint: t('Total de la compra.') })}
        ${field(t('Fecha'), `<input type="date" name="date" value="${today()}">`)}
        <div class="field wide"><label class="check"><input type="checkbox" name="asExpense" checked> ${t('Registrar como gasto')}</label>
        <label class="check"><input type="checkbox" name="updatePrice"> ${resin ? t('Actualizar el precio por envase con este importe') : t('Actualizar el precio por bobina con este importe')}</label></div>
      </div>
      <p class="small muted">${t('Stock actual: {q}', { q: fmtStock(f) })}</p>`,
      onOpen: (b) => {
        $('[name="spools"]', b).addEventListener('input', (e) => {
          const n = num(e.target.value);
          $('[name="grams"]', b).value = n * num(f.spoolWeight);
          $('[name="amount"]', b).value = Math.round(n * num(f.price) * 100) / 100;
        });
      },
      onSubmit: (b) => {
        const qty = num(val(b, 'grams')), amount = num(val(b, 'amount')), n = num(val(b, 'spools'));
        f.remaining = num(f.remaining) + qty;
        if (checked(b, 'updatePrice') && n > 0) f.price = Math.round((amount / n) * 100) / 100;
        if (checked(b, 'asExpense') && amount > 0) {
          S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'filamento', description: t('Reposición {q} · {name}', { q: fmtAmount(qty, u), name: filamentLabel(f) }), amount, filamentId: f.id });
        }
        persist(t('+{q} de {name}', { q: fmtAmount(qty, u), name: f.name }));
      },
    });
  }

  // ================================================================ MATERIALES EN PLANCHA

  const MATERIAL_CATEGORIES = [N_('Madera'), N_('Contrachapado'), 'MDF', N_('Metacrilato'), N_('Cuero'), N_('Fotopolímero'), N_('Fotolito / negativo'), N_('Goma para sellos'), N_('Cartón'), N_('Corcho'), N_('Tela'), N_('Papel'), N_('Vidrio'), N_('Metal'), N_('Otros')];

  function viewMaterials() {
    const list = [...S.materials].sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    const used = {};
    S.prints.forEach((p) => Object.entries(sheetsUsed(p.sheets, p.quantity, S.settings.sheetWaste, materialsById()))
      .forEach(([id, n]) => { used[id] = (used[id] || 0) + n; }));
    const total = list.reduce((s, m) => s + Math.max(0, num(m.stock)) * num(m.price), 0);
    return `
      <div class="page-head">
        <h1>${t('Materiales en plancha')}</h1>
        <div class="actions"><button class="btn primary" data-action="new-material">${t('+ Nuevo material')}</button></div>
      </div>
      <p class="small muted" style="margin-top:-8px">${t('Para corte y grabado láser (madera, MDF, metacrilato, cuero…) y sellos de insoladora (plancha de fotopolímero y fotolito/negativo). El coste se calcula por cm² según las medidas de cada pieza, más un {pct} % de desperdicio (cámbialo en Ajustes).', { pct: fmtNum(S.settings.sheetWaste) })}</p>
      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>${t('Material')}</th><th class="num">${t('Plancha')}</th><th class="num">${t('Precio')}</th><th class="num">€/cm²</th><th class="num">${t('Stock')}</th><th class="num">${t('Usado')}</th><th class="num">${t('Valor')}</th><th></th></tr></thead>
          <tbody>${list.map((m) => `<tr>
            <td><b>${esc(materialLabel(m))}</b><div class="small muted">${esc([m.category, m.supplier].filter(Boolean).join(' · '))}</div></td>
            <td class="num">${fmtNum(m.sheetWidth)} × ${fmtNum(m.sheetHeight)} mm</td>
            <td class="num">${money(m.price)}</td>
            <td class="num"><b>${money(sheetCostPerCm2(m) * 100).replace(/\s?€/, '')}</b><div class="small muted">€ / 100 cm²</div></td>
            <td class="num">${fmtSheets(m.stock)}${matLow(m) ? `<div><span class="badge low">${t('⚠ Stock bajo')}</span></div>` : ''}</td>
            <td class="num">${fmtNum(used[m.id] || 0, 2)}</td>
            <td class="num">${money(Math.max(0, num(m.stock)) * num(m.price))}</td>
            <td class="actions">
              <button class="btn small" data-action="restock-material" data-id="${m.id}">${t('Reponer')}</button>
              <button class="icon-btn" data-action="edit-material" data-id="${m.id}" aria-label="${t('Editar')}" title="${t('Editar / ajustar stock')}">✎</button>
              <button class="icon-btn" data-action="delete-material" data-id="${m.id}" aria-label="${t('Eliminar')}" title="${t('Eliminar')}">🗑</button>
            </td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="6">${t('Total')}</td><td class="num">${money(total)}</td><td></td></tr></tfoot>
        </table></div>` : `<div class="empty">${t('Aún no tienes materiales en plancha. Añade, por ejemplo, contrachapado de 3 mm o fotopolímero para sellos.')}</div>`}
      </div>`;
  }

  function materialForm(m) {
    const isNew = !m;
    m = m || { name: '', category: t('Contrachapado'), thickness: 3, sheetWidth: 600, sheetHeight: 400, price: '', stock: '', lowStock: 1, supplier: '' };
    openModal({
      title: isNew ? t('Nuevo material') : t('Editar material'),
      body: `<div class="form-grid">
        ${field(t('Nombre *'), inp('name', m.name, `required placeholder="${t('Ej. Contrachapado de abedul')}"`), { wide: true })}
        ${field(t('Categoría'), inp('category', m.category, 'list="mat-cats"') + `<datalist id="mat-cats">${MATERIAL_CATEGORIES.map((x) => `<option value="${esc(t(x))}">`).join('')}</datalist>`)}
        ${field(t('Grosor (mm)'), numInp('thickness', m.thickness, 'min="0"'))}
        ${field(t('Ancho plancha (mm) *'), numInp('sheetWidth', m.sheetWidth, 'required min="1"'))}
        ${field(t('Alto plancha (mm) *'), numInp('sheetHeight', m.sheetHeight, 'required min="1"'), { hint: t('A4 = 297 × 210 mm.') })}
        ${field(t('Precio por plancha *'), numInp('price', m.price, 'required min="0"'))}
        ${isNew
          ? field(t('Nº de planchas compradas'), numInp('sheets', 1, 'min="0"'))
          : field(t('Stock (planchas)'), numInp('stock', m.stock), { hint: t('Admite decimales: 0,5 = media plancha.') })}
        ${field(t('Aviso de stock bajo (planchas)'), numInp('lowStock', m.lowStock, 'min="0"'))}
        ${field(t('Proveedor'), inp('supplier', m.supplier))}
        ${isNew ? `${field(t('Fecha de compra'), `<input type="date" name="date" value="${today()}">`)}
          <div class="field wide"><label class="check"><input type="checkbox" name="asExpense" checked> ${t('Registrar la compra como gasto')}</label></div>` : ''}
      </div>
      <div class="price-box" id="mat-preview"></div>`,
      onOpen: (b) => {
        const refresh = () => {
          const x = { price: val(b, 'price'), sheetWidth: val(b, 'sheetWidth'), sheetHeight: val(b, 'sheetHeight') };
          const cm2 = sheetCostPerCm2(x);
          $('#mat-preview', b).innerHTML = `<div><div class="small muted">${t('Área de la plancha')}</div><strong>${fmtNum((num(x.sheetWidth) * num(x.sheetHeight)) / 100)} cm²</strong></div>
            <div><div class="small muted">${t('Coste por 100 cm² (10×10 cm)')}</div><strong>${money(cm2 * 100)}</strong></div>`;
        };
        b.addEventListener('input', refresh);
        refresh();
      },
      onSubmit: (b) => {
        const data = {
          name: val(b, 'name'), category: val(b, 'category'), thickness: num(val(b, 'thickness')),
          sheetWidth: num(val(b, 'sheetWidth')), sheetHeight: num(val(b, 'sheetHeight')), price: num(val(b, 'price')),
          lowStock: val(b, 'lowStock'), supplier: val(b, 'supplier'),
        };
        if (data.sheetWidth <= 0 || data.sheetHeight <= 0) { toast(t('Indica las medidas de la plancha.')); return false; }
        if (isNew) {
          const n = num(val(b, 'sheets'));
          const nm = { id: uid(), ...data, stock: n };
          S.materials.push(nm);
          if (checked(b, 'asExpense') && n > 0) {
            S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'materiales', description: `${fmtSheets(n)} · ${materialLabel(nm)}`, amount: n * data.price, materialId: nm.id });
          }
          persist(t('Material añadido'));
        } else {
          Object.assign(m, data, { stock: num(val(b, 'stock')) });
          S.prints.forEach((p) => (p.sheets || []).forEach((it) => { if (it.materialId === m.id) it.materialName = materialLabel(m); }));
          persist(t('Material actualizado'));
        }
      },
    });
  }

  function restockMaterialForm(m) {
    openModal({
      title: t('Reponer · {name}', { name: materialLabel(m) }),
      submitLabel: t('Añadir al stock'),
      body: `<div class="form-grid">
        ${field(t('Nº de planchas'), numInp('sheets', 1, 'required min="0"'))}
        ${field(t('Importe pagado'), numInp('amount', m.price, 'min="0"'))}
        ${field(t('Fecha'), `<input type="date" name="date" value="${today()}">`)}
        <div class="field wide"><label class="check"><input type="checkbox" name="asExpense" checked> ${t('Registrar como gasto')}</label></div>
      </div>
      <p class="small muted">${t('Stock actual: {q}', { q: fmtSheets(m.stock) })}</p>`,
      onOpen: (b) => {
        $('[name="sheets"]', b).addEventListener('input', (e) => { $('[name="amount"]', b).value = Math.round(num(e.target.value) * num(m.price) * 100) / 100; });
      },
      onSubmit: (b) => {
        const n = num(val(b, 'sheets')), amount = num(val(b, 'amount'));
        m.stock = num(m.stock) + n;
        if (checked(b, 'asExpense') && amount > 0) {
          S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'materiales', description: t('Reposición {q} · {name}', { q: fmtSheets(n), name: materialLabel(m) }), amount, materialId: m.id });
        }
        persist(t('+{q} de {name}', { q: fmtSheets(n), name: m.name }));
      },
    });
  }

  // ================================================================ COMPONENTES

  const COMPONENT_CATEGORIES = [N_('Iluminación'), N_('Electrónica'), N_('Tornillería'), N_('Imanes'), N_('Cables'), N_('Llaveros y anillas'), N_('Sellos'), N_('Embalaje'), N_('Otros')];

  function viewComponents() {
    const list = [...S.components].sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    const used = {};
    S.prints.forEach((p) => Object.entries(componentsUsed(p.components, p.quantity)).forEach(([id, q]) => { used[id] = (used[id] || 0) + q; }));
    const total = list.reduce((s, c) => s + Math.max(0, num(c.stock)) * componentUnitCost(c), 0);
    return `
      <div class="page-head">
        <h1>${t('Componentes')}</h1>
        <div class="actions"><button class="btn primary" data-action="new-component">${t('+ Nuevo componente')}</button></div>
      </div>
      <p class="small muted" style="margin-top:-8px">${t('Piezas externas que montas en tus impresiones: portalámparas, tiras LED, imanes, tornillos… Al registrar una impresión indica cuántas lleva cada pieza y se sumarán al coste y se descontarán del stock.')}</p>
      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>${t('Componente')}</th><th>${t('Proveedor')}</th><th class="num">${t('Precio paquete')}</th><th class="num">${t('Coste ud.')}</th><th class="num">${t('Stock')}</th><th class="num">${t('Usados')}</th><th class="num">${t('Valor')}</th><th></th></tr></thead>
          <tbody>${list.map((c) => `<tr>
            <td><b>${esc(c.name)}</b><div class="small muted">${esc(c.category || '')}</div></td>
            <td>${esc(c.supplier || '')}</td>
            <td class="num">${money(c.price)}<div class="small muted">${fmtQty(c.packUnits || 1, c.unit)}</div></td>
            <td class="num"><b>${money(componentUnitCost(c))}</b><div class="small muted">${t('por {u}', { u: esc(unitLabel(c.unit)) })}</div></td>
            <td class="num">${fmtQty(c.stock, c.unit)}${compLow(c) ? `<div><span class="badge low">${t('⚠ Stock bajo')}</span></div>` : ''}</td>
            <td class="num">${fmtNum(used[c.id] || 0, 2)}</td>
            <td class="num">${money(Math.max(0, num(c.stock)) * componentUnitCost(c))}</td>
            <td class="actions">
              <button class="btn small" data-action="restock-component" data-id="${c.id}">${t('Reponer')}</button>
              <button class="icon-btn" data-action="edit-component" data-id="${c.id}" aria-label="${t('Editar')}" title="${t('Editar / ajustar stock')}">✎</button>
              <button class="icon-btn" data-action="delete-component" data-id="${c.id}" aria-label="${t('Eliminar')}" title="${t('Eliminar')}">🗑</button>
            </td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="6">${t('Total')}</td><td class="num">${money(total)}</td><td></td></tr></tfoot>
        </table></div>` : `<div class="empty">${t('Aún no tienes componentes. Añade, por ejemplo, un portalámparas o una tira LED.')}</div>`}
      </div>`;
  }

  function componentForm(c) {
    const isNew = !c;
    c = c || { name: '', category: t('Iluminación'), unit: t('ud.'), price: '', packUnits: 1, stock: '', lowStock: 2, supplier: '' };
    openModal({
      title: isNew ? t('Nuevo componente') : t('Editar componente'),
      body: `<div class="form-grid">
        ${field(t('Nombre *'), inp('name', c.name, `required placeholder="${t('Ej. Portalámparas E14')}"`), { wide: true })}
        ${field(t('Categoría'), inp('category', c.category, 'list="comp-cats"') + `<datalist id="comp-cats">${COMPONENT_CATEGORIES.map((x) => `<option value="${esc(t(x))}">`).join('')}</datalist>`)}
        ${field(t('Unidad'), inp('unit', unitLabel(c.unit), 'list="comp-units"') + `<datalist id="comp-units">${[t('ud.'), 'm', 'cm', t('par'), t('juego')].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`, { hint: t('Cómo lo cuentas: ud., m…') })}
        ${field(t('Precio del paquete *'), numInp('price', c.price, 'required min="0"'))}
        ${field(t('Unidades por paquete *'), numInp('packUnits', c.packUnits, 'required min="0.01"'), { hint: t('Ej. bolsa de 50 imanes → 50.') })}
        ${isNew
          ? field(t('Nº de paquetes comprados'), numInp('packs', 1, 'min="0"'), { hint: t('Define el stock inicial.') })
          : field(t('Stock actual'), numInp('stock', c.stock), { hint: t('Ajusta tras contar.') })}
        ${field(t('Aviso de stock bajo'), numInp('lowStock', c.lowStock, 'min="0"'))}
        ${field(t('Proveedor'), inp('supplier', c.supplier, 'placeholder="AliExpress, Amazon…"'))}
        ${isNew ? `${field(t('Fecha de compra'), `<input type="date" name="date" value="${today()}">`)}
          <div class="field wide"><label class="check"><input type="checkbox" name="asExpense" checked> ${t('Registrar la compra como gasto')}</label></div>` : ''}
      </div>
      <div class="price-box" id="comp-preview"></div>`,
      onOpen: (b) => {
        const refresh = () => {
          const unitCost = componentUnitCost({ price: val(b, 'price'), packUnits: val(b, 'packUnits') });
          $('#comp-preview', b).innerHTML = `<div><div class="small muted">${t('Coste por {u}', { u: esc(unitLabel(val(b, 'unit'))) })}</div><strong>${money(unitCost)}</strong></div>`;
        };
        b.addEventListener('input', refresh);
        refresh();
      },
      onSubmit: (b) => {
        const data = {
          name: val(b, 'name'), category: val(b, 'category'), unit: !val(b, 'unit') || val(b, 'unit') === t('ud.') ? 'ud.' : val(b, 'unit'), price: num(val(b, 'price')),
          packUnits: num(val(b, 'packUnits')), lowStock: val(b, 'lowStock'), supplier: val(b, 'supplier'),
        };
        if (data.packUnits <= 0) { toast(t('Las unidades por paquete deben ser mayores que 0.')); return false; }
        if (isNew) {
          const packs = num(val(b, 'packs'));
          const nc = { id: uid(), ...data, stock: packs * data.packUnits };
          S.components.push(nc);
          if (checked(b, 'asExpense') && packs > 0) {
            S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'componentes', description: `${packs} × ${nc.name}`, amount: packs * data.price, componentId: nc.id });
          }
          persist(t('Componente añadido'));
        } else {
          Object.assign(c, data, { stock: num(val(b, 'stock')) });
          S.prints.forEach((p) => (p.components || []).forEach((it) => { if (it.componentId === c.id) it.componentName = c.name; }));
          persist(t('Componente actualizado'));
        }
      },
    });
  }

  function restockComponentForm(c) {
    openModal({
      title: t('Reponer · {name}', { name: c.name }),
      submitLabel: t('Añadir al stock'),
      body: `<div class="form-grid">
        ${field(t('Nº de paquetes'), numInp('packs', 1, 'min="0" step="1"'))}
        ${field(t('Cantidad a añadir ({u})', { u: esc(unitLabel(c.unit)) }), numInp('qty', c.packUnits || 1, 'required min="0"'))}
        ${field(t('Importe pagado'), numInp('amount', c.price, 'min="0"'))}
        ${field(t('Fecha'), `<input type="date" name="date" value="${today()}">`)}
        <div class="field wide"><label class="check"><input type="checkbox" name="asExpense" checked> ${t('Registrar como gasto')}</label></div>
      </div>
      <p class="small muted">${t('Stock actual: {q}', { q: fmtQty(c.stock, c.unit) })}</p>`,
      onOpen: (b) => {
        $('[name="packs"]', b).addEventListener('input', (e) => {
          const n = num(e.target.value);
          $('[name="qty"]', b).value = n * num(c.packUnits || 1);
          $('[name="amount"]', b).value = Math.round(n * num(c.price) * 100) / 100;
        });
      },
      onSubmit: (b) => {
        const qty = num(val(b, 'qty')), amount = num(val(b, 'amount'));
        c.stock = num(c.stock) + qty;
        if (checked(b, 'asExpense') && amount > 0) {
          S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'componentes', description: t('Reposición {q} · {name}', { q: fmtQty(qty, c.unit), name: c.name }), amount, componentId: c.id });
        }
        persist(t('+{q} de {name}', { q: fmtQty(qty, c.unit), name: c.name }));

      },
    });
  }

  // ================================================================ MÁQUINAS (impresoras 3D, láser…)

  function viewPrinters() {
    const stats = window.Calc.printerStats(S);
    const dp = defaultPrinter();
    return `
      <div class="page-head">
        <h1>${t('Máquinas')}</h1>
        <div class="actions"><button class="btn primary" data-action="new-printer">${t('+ Nueva máquina')}</button></div>
      </div>
      <div class="card">
        ${S.printers.length ? `<div class="table-wrap"><table>
          <thead><tr><th>${t('Máquina')}</th><th class="num">${t('Consumo')}</th><th class="num">${t('Precio')}</th><th class="num">${t('Coste / hora')}</th>
            <th>${t('Vida útil usada')}</th><th class="num">${t('Trabajos')}</th><th class="num">${t('Ingresos')}</th><th class="num">${t('Beneficio')}</th><th></th></tr></thead>
          <tbody>${S.printers.map((pr) => {
            const st = stats[pr.id] || { hours: 0, jobs: 0, revenue: 0, profit: 0 };
            const life = num(pr.lifeHours);
            const pct = life > 0 ? Math.min(100, (st.hours / life) * 100) : 0;
            const isDefault = dp && dp.id === pr.id;
            return `<tr>
              <td><b>${esc(pr.name)}</b> <span class="badge">${esc(t(MACHINE_TYPES[machineType(pr)]))}</span> ${isDefault ? `<span class="badge ok">${t('★ Predeterminada')}</span>` : ''}
                ${pr.notes ? `<div class="small muted">${esc(pr.notes)}</div>` : ''}</td>
              <td class="num">${fmtNum(pr.watts)} W</td>
              <td class="num">${money(pr.price)}</td>
              <td class="num"><b>${money(printerHourCost(pr))}</b>
                <div class="small muted">${t('máq. {a} · luz {b}', { a: money(window.Calc.machineHourCost(S.settings, pr)), b: money((num(pr.watts) / 1000) * num(S.settings.kwhPrice)) })}</div></td>
              <td><div class="stock"><div class="stock-bar"><span style="width:${pct}%"></span></div>
                <span class="nowrap small">${fmtNum(st.hours, 1)} / ${fmtNum(life)} h</span></div></td>
              <td class="num">${fmtNum(st.jobs)}</td>
              <td class="num">${money(st.revenue)}</td>
              <td class="num">${moneySigned(st.profit)}</td>
              <td class="actions">
                ${isDefault ? '' : `<button class="icon-btn" data-action="default-printer" data-id="${pr.id}" aria-label="${t('Usar por defecto')}" title="${t('Usar por defecto')}">☆</button>`}
                <button class="icon-btn" data-action="edit-printer" data-id="${pr.id}" aria-label="${t('Editar')}" title="${t('Editar')}">✎</button>
                <button class="icon-btn" data-action="delete-printer" data-id="${pr.id}" aria-label="${t('Eliminar')}" title="${t('Eliminar')}">🗑</button>
              </td></tr>`;
          }).join('')}</tbody>
        </table></div>` : `<div class="empty">${t('Añade tus impresoras 3D, láser e insoladora para que cada trabajo use su propio consumo, amortización y mantenimiento.')}</div>`}
      </div>
      <p class="small muted">${t('Coste / hora = amortización (precio ÷ vida útil) + mantenimiento + electricidad (consumo × {kwh}/kWh). Ingresos y beneficio salen de las ventas de los trabajos hechos en cada máquina. Cambiar una máquina no modifica el coste de trabajos ya registrados. «Predeterminada» es la que se elige por defecto para impresión 3D.', { kwh: money(S.settings.kwhPrice) })}</p>`;
  }

  function printerForm(pr) {
    const isNew = !pr;
    const st = S.settings;
    pr = pr || { type: '3d', name: '', notes: '', watts: st.printerWatts, price: st.printerPrice, lifeHours: st.printerLifeHours, maintenancePerHour: st.maintenancePerHour };
    openModal({
      title: isNew ? t('Nueva máquina') : t('Editar máquina'),
      body: `<div class="form-grid">
        ${field(t('Nombre *'), inp('name', pr.name, `required placeholder="${t('Ej. Bambu Lab P1S, xTool S1…')}"`), { wide: true })}
        ${field(t('Tipo'), `<select name="type">${Object.entries(MACHINE_TYPES).map(([k, v]) => `<option value="${k}"${k === machineType(pr) ? ' selected' : ''}>${t(v)}</option>`).join('')}</select>`)}
        ${field(t('Consumo medio (W) *'), numInp('watts', pr.watts, 'required min="0"'), { hint: t('FDM ≈ 80–150 W · resina ≈ 30–70 W · láser: incluye extractor y air assist · insoladora UV ≈ 20–60 W.') })}
        ${field(t('Precio de compra *'), numInp('price', pr.price, 'required min="0"'))}
        ${field(t('Vida útil estimada (h) *'), numInp('lifeHours', pr.lifeHours, 'required min="1"'), { hint: t('Horas en las que la amortizas.') })}
        ${field(t('Mantenimiento (/h)'), numInp('maintenancePerHour', pr.maintenancePerHour, 'min="0"'), { hint: t('Boquillas, FEP y pantalla LCD (resina), lentes, tubos UV…') })}
        ${field(t('Notas'), inp('notes', pr.notes, `placeholder="${t('Boquilla 0.4, módulo 20 W…')}"`), { wide: true })}
        ${isNew ? `${field(t('Fecha de compra'), `<input type="date" name="date" value="${today()}">`)}
          <div class="field wide"><label class="check"><input type="checkbox" name="asExpense"> ${t('Registrar la compra como gasto (Máquinas y herramientas)')}</label></div>` : ''}
      </div>
      <div class="price-box" id="printer-preview"></div>`,
      onOpen: (b) => {
        const read = () => ({ watts: val(b, 'watts'), price: val(b, 'price'), lifeHours: val(b, 'lifeHours'), maintenancePerHour: val(b, 'maintenancePerHour') });
        const refresh = () => {
          const x = read();
          const life = num(x.lifeHours);
          $('#printer-preview', b).innerHTML = `
            <div><div class="small muted">${t('Amortización')}</div><strong>${money(life > 0 ? num(x.price) / life : 0)}/h</strong></div>
            <div><div class="small muted">${t('Mantenimiento')}</div><strong>${money(x.maintenancePerHour)}/h</strong></div>
            <div><div class="small muted">${t('Electricidad')}</div><strong>${money((num(x.watts) / 1000) * num(S.settings.kwhPrice))}/h</strong></div>
            <div><div class="small muted">${t('Total por hora')}</div><strong>${money(printerHourCost(x))}</strong></div>`;
        };
        b.addEventListener('input', refresh);
        refresh();
      },
      onSubmit: (b) => {
        const data = {
          type: val(b, 'type') || '3d', name: val(b, 'name'), notes: val(b, 'notes'), watts: num(val(b, 'watts')), price: num(val(b, 'price')),
          lifeHours: num(val(b, 'lifeHours')), maintenancePerHour: num(val(b, 'maintenancePerHour')),
        };
        if (data.lifeHours <= 0) { toast(t('La vida útil debe ser mayor que 0.')); return false; }
        if (isNew) {
          const np = { id: uid(), ...data };
          S.printers.push(np);
          if (!findPrinter(S.settings.defaultPrinterId)) S.settings.defaultPrinterId = np.id;
          if (checked(b, 'asExpense') && data.price > 0) {
            S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'maquinaria', description: `${t(MACHINE_TYPES[data.type])} ${data.name}`, amount: data.price, printerId: np.id });
          }
          persist(t('Máquina añadida'));
        } else {
          Object.assign(pr, data);
          S.prints.forEach((p) => { if (p.printerId === pr.id) p.printerName = pr.name; });
          persist(t('Máquina actualizada'));
        }
      },
    });
  }

  // ================================================================ TRABAJOS (impresión 3D, láser, sellos)

  function viewPrints() {
    const sold = soldByPrint(S.sales);
    const list = [...S.prints].filter((p) => ui.kind === 'all' || (p.kind || '3d') === ui.kind)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return `
      <div class="page-head">
        <h1>${t('Trabajos')}</h1>
        <div class="actions">
          <select data-period="kind" aria-label="${t('Tipo de trabajo')}"><option value="all">${t('Todos los tipos')}</option>${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${ui.kind === k ? ' selected' : ''}>${t(v)}</option>`).join('')}</select>
          <button class="btn" data-action="quote">${t('Calculadora de coste')}</button>
          <button class="btn primary" data-action="new-print">${t('+ Registrar trabajo')}</button>
        </div>
      </div>
      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>${t('Fecha')}</th><th>${t('Pieza')}</th><th class="num">${t('Uds.')}</th><th class="num">${t('Material')}</th><th class="num">${t('Tiempo')}</th>
            <th class="num">${t('Coste total')}</th><th class="num">${t('Coste ud.')}</th><th class="num">${t('PVP sugerido')}</th><th class="num">${t('Vendidas')}</th><th></th></tr></thead>
          <tbody>${list.map((p) => {
            const c = p.cost || {};
            const byUnit = (u) => (p.items || []).filter((it) => (it.unit || unitOf(S.filaments.find((f) => f.id === it.filamentId))) === u).reduce((s, it) => s + num(it.grams), 0);
            const g = byUnit('g'), ml = byUnit('ml');
            const cm2 = (p.sheets || []).reduce((s, it) => s + (num(it.width) * num(it.height)) / 100, 0) * num(p.quantity);
            const k = p.kind || '3d';
            const s = num(sold[p.id]);
            return `<tr>
              <td class="nowrap">${fmtDate(p.date)}</td>
              <td><span class="badge kind-${k}">${t(KIND_SHORT[k])}</span> <b>${esc(p.name)}</b>${fileLink(p.fileUrl)}<div class="small muted">${esc([p.printerName, (p.items || []).map((it) => it.filamentName).join(', '), (p.sheets || []).map((it) => it.materialName).join(', '), (p.components || []).map((it) => `${fmtNum(it.qty, 2)}× ${it.componentName}`).join(', ')].filter(Boolean).join(' · '))}</div></td>
              <td class="num">${fmtNum(p.quantity)}</td>
              <td class="num">${[g ? fmtGrams(g) : '', ml ? fmtMl(ml) : '', cm2 ? fmtNum(cm2) + ' cm²' : ''].filter(Boolean).join('<br>') || '—'}</td>
              <td class="num">${fmtHours(p.hours)}</td>
              <td class="num">${money(c.total)}</td>
              <td class="num"><b>${money(c.unit)}</b></td>
              <td class="num">${money(c.suggestedUnitPrice)}</td>
              <td class="num">${fmtNum(s)} / ${fmtNum(p.quantity)}</td>
              <td class="actions">
                ${s < num(p.quantity) ? `<button class="btn small" data-action="sell-print" data-id="${p.id}">${t('Vender')}</button>` : `<span class="badge ok">${t('✓ Vendida')}</span>`}
                <button class="icon-btn" data-action="edit-print" data-id="${p.id}" aria-label="${t('Editar')}" title="${t('Editar')}">✎</button>
                <button class="icon-btn" data-action="delete-print" data-id="${p.id}" aria-label="${t('Eliminar')}" title="${t('Eliminar')}">🗑</button>
              </td></tr>`;
          }).join('')}</tbody>
        </table></div>` : `<div class="empty">${S.prints.length ? t('No hay trabajos de este tipo.') : t('Registra tu primer trabajo para calcular su coste y descontar el material usado.')}</div>`}
      </div>
      <p class="small muted">${t('El coste incluye material (filamento o plancha con un {waste} % de desperdicio), componentes, electricidad ({kwh}/kWh), amortización y mantenimiento de la máquina, mano de obra, extras y un {fail} % por fallos. Cámbialo en Máquinas y Ajustes.', { waste: fmtNum(S.settings.sheetWaste), kwh: money(S.settings.kwhPrice), fail: fmtNum(S.settings.failureRate) })}</p>`;
  }

  // Enlace al archivo del trabajo (Printables, Thingiverse…): solo se enlazan direcciones http(s)
  function normalizeUrl(u) {
    u = String(u || '').trim();
    if (u && !/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
    return u;
  }
  function fileLink(u) {
    if (!u) return '';
    let url;
    try { url = new URL(u); } catch (e) { return ''; }
    if (!/^https?:$/.test(url.protocol)) return '';
    const site = url.hostname.replace(/^www\./, '');
    return ` <a class="file-link" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer" title="${esc(t('Abrir el archivo en {site}', { site }))}">🔗 ${esc(site)}</a>`;
  }

  function filamentOptions(selected) {
    const opt = (f) => `<option value="${f.id}" data-unit="${unitOf(f)}"${f.id === selected ? ' selected' : ''}>${esc(filamentLabel(f))} (${fmtStock(f)})</option>`;
    const fil = S.filaments.filter((f) => !isResin(f)), res = S.filaments.filter(isResin);
    return `<option value="">${t('— Elige filamento o resina —')}</option>`
      + (fil.length ? `<optgroup label="${t('Filamento (g)')}">${fil.map(opt).join('')}</optgroup>` : '')
      + (res.length ? `<optgroup label="${t('Resina')}">${res.map(opt).join('')}</optgroup>` : '');
  }

  function printForm(p, { quoteOnly = false } = {}) {
    const isNew = !p;
    if (!S.printers.length && !quoteOnly) {
      toast(t('Primero añade una máquina (impresora 3D o láser).'));
      return printerForm();
    }
    const dp = defaultPrinter();
    const firstOf = (type) => S.printers.find((m) => machineType(m) === type);
    const startKind = p ? (p.kind || '3d') : (dp ? kindForMachine(dp) : '3d');
    const startMachine = machineFits(dp, startKind) ? dp : S.printers.find((m) => machineFits(m, startKind));
    p = p || { kind: startKind, printerId: (startMachine || dp || {}).id || '', components: [], sheets: [], name: '', date: today(), quantity: 1, hours: 2, items: [{ filamentId: S.filaments[0] ? S.filaments[0].id : '', grams: 50 }], laborHours: 0, extras: 0, margin: '', notes: '', stockDeducted: true };
    const h = Math.floor(num(p.hours)), m = Math.round((num(p.hours) - h) * 60);
    const printerMissing = !isNew && p.printerId && !findPrinter(p.printerId);
    const selPrinterId = findPrinter(p.printerId) ? p.printerId : (dp ? dp.id : '');
    const printerField = S.printers.length
      ? field(t('Máquina'), `<select name="printerId">${S.printers.map((pr) =>
          `<option value="${pr.id}"${pr.id === selPrinterId ? ' selected' : ''}>${esc(pr.name)} (${t(MACHINE_TYPES[machineType(pr)])}) · ${money(printerHourCost(pr))}/h</option>`).join('')}</select>`,
          { hint: printerMissing ? t('⚠ La máquina original ({name}) se eliminó; elige otra.', { name: esc(p.printerName || '') }) : t('Cada máquina tiene su consumo, amortización y mantenimiento.') })
      : '';

    const itemRow = (it) => `<div class="item-row">
        <select name="item-filament" aria-label="${t('Filamento')}">${filamentOptions(it.filamentId)}</select>
        <input name="item-grams" type="number" step="any" min="0" value="${esc(it.grams)}" aria-label="${t('Cantidad (g o ml)')}" placeholder="g / ml">
        <button type="button" class="icon-btn" data-remove-item aria-label="${t('Quitar')}">✕</button></div>`;

    /** Filas de plancha propuestas según el tipo: sello = fotopolímero + fotolito; láser = primer material de corte. */
    const defaultSheets = (kind) => {
      if (!S.materials.length) return [];
      if (kind === 'sello') {
        const rows = [S.materials.find(isPhotopolymer), S.materials.find(isNegative)].filter(Boolean)
          .map((mt) => ({ materialId: mt.id, width: 40, height: 40 }));
        return rows.length ? rows : [{ materialId: S.materials[0].id, width: 40, height: 40 }];
      }
      const mt = S.materials.find((x) => !isPhotopolymer(x) && !isNegative(x)) || S.materials[0];
      return [{ materialId: mt.id, width: 100, height: 100 }];
    };
    const materialOptions = (selected) => `<option value="">${t('— Elige material —')}</option>` + S.materials
      .map((m) => `<option value="${m.id}"${m.id === selected ? ' selected' : ''}>${esc(materialLabel(m))} · ${money(sheetCostPerCm2(m) * 100)}/100 cm² (${t('{n} pl.', { n: fmtNum(m.stock, 2) })})</option>`).join('');
    const sheetRow = (it) => `<div class="sheet-row">
        <select name="sheet-id" aria-label="${t('Material')}">${materialOptions(it.materialId)}</select>
        <input name="sheet-w" type="number" step="any" min="0" value="${esc(it.width)}" aria-label="${t('Ancho por pieza (mm)')}" placeholder="${t('ancho mm')}">
        <input name="sheet-h" type="number" step="any" min="0" value="${esc(it.height)}" aria-label="${t('Alto por pieza (mm)')}" placeholder="${t('alto mm')}">
        <button type="button" class="icon-btn" data-remove-sheet aria-label="${t('Quitar')}">✕</button></div>`;

    const componentOptions = (selected) => `<option value="">${t('— Elige componente —')}</option>` + S.components
      .map((c) => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${esc(c.name)} · ${money(componentUnitCost(c))}/${esc(unitLabel(c.unit))} (${t('{n} disp.', { n: fmtNum(c.stock, 2) })})</option>`).join('');
    const compRow = (it) => `<div class="comp-row">
        <select name="comp-id" aria-label="${t('Componente')}">${componentOptions(it.componentId)}</select>
        <input name="comp-qty" type="number" step="any" min="0" value="${esc(it.qty)}" aria-label="${t('Cantidad por pieza')}" placeholder="${t('por pieza')}">
        <button type="button" class="icon-btn" data-remove-comp aria-label="${t('Quitar')}">✕</button></div>`;

    openModal({
      title: quoteOnly ? t('Calculadora de coste') : isNew ? t('Registrar trabajo') : t('Editar trabajo'),
      submitLabel: quoteOnly ? t('Guardar como trabajo') : t('Guardar'),
      body: `<div class="form-grid">
          ${field(t('Pieza / encargo *'), inp('name', p.name, `required placeholder="${t('Ej. Soporte móvil, Sello logo, Posavasos…')}"`), { wide: true })}
          ${field(t('Enlace al archivo'), inp('fileUrl', p.fileUrl, 'type="url" inputmode="url" autocapitalize="none" spellcheck="false" placeholder="https://www.printables.com/model/…"'), { wide: true, hint: t('De dónde sacaste el archivo: Printables, Thingiverse, MakerWorld, Cults…') })}
          ${field(t('Tipo de trabajo'), `<select name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${k === (p.kind || '3d') ? ' selected' : ''}>${t(v)}</option>`).join('')}</select>`)}
          ${printerField}
          ${field(t('Fecha'), `<input type="date" name="date" value="${esc(p.date)}">`)}
          ${field(t('Unidades producidas'), numInp('quantity', p.quantity, 'min="1" step="1"'), { hint: t('Piezas que salen de este trabajo.') })}
          ${field(t('Horas'), numInp('h', h, 'min="0" step="1"'))}
          ${field(t('Minutos'), numInp('m', m, 'min="0" max="59" step="1"'), { hint: `<span id="time-hint">${t('Tiempo total de máquina.')}</span>` })}
        </div>
        <div id="sec-fil">
          <h3 class="section-title">${t('Filamento o resina usados (cantidad total según el laminador: g de filamento, ml de resina)')}</h3>
          ${S.filaments.length ? `<div class="items-list" id="items">${((p.items || []).length ? p.items : [{ filamentId: S.filaments[0].id, grams: 50 }]).map(itemRow).join('')}</div>
            <button type="button" class="btn small" id="add-item" style="margin-top:8px">${t('+ Añadir otro filamento')}</button>`
            : `<p class="small muted">${t('Da de alta tus bobinas o envases en <a href="#filaments" data-close-link>Filamento y resina</a> para sumarlos al coste.')}</p>`}
        </div>
        <div id="sec-sheet">
          <h3 class="section-title">${t('Material en plancha (medidas de cada pieza)')}</h3>
          ${S.materials.length ? `<div class="items-list" id="sheets">${((p.sheets || []).length ? p.sheets : defaultSheets(p.kind || '3d')).map(sheetRow).join('')}</div>
            <button type="button" class="btn small" id="add-sheet" style="margin-top:8px">${t('+ Añadir otro material')}</button>
            <p class="small muted" style="margin:6px 0 0">${t('Ancho × alto en mm que ocupa cada pieza en la plancha; se suma un {pct} % de desperdicio. En sellos añade el fotopolímero y el fotolito (negativo).', { pct: fmtNum(S.settings.sheetWaste) })}</p>`
            : `<p class="small muted">${t('Da de alta madera, metacrilato, goma para sellos… en <a href="#materials" data-close-link>Materiales</a> para sumarlos al coste.')}</p>`}
        </div>
        <h3 class="section-title">${t('Componentes externos (cantidad por pieza)')}</h3>
        ${S.components.length ? `<div class="items-list" id="comps">${(p.components || []).map(compRow).join('')}</div>
          <button type="button" class="btn small" id="add-comp" style="margin-top:8px">${t('+ Añadir componente')}</button>`
          : `<p class="small muted">${t('¿Lleva portalámparas, LED, imanes, mangos de sello…? Dalos de alta en <a href="#components" data-close-link>Componentes</a> para sumarlos al coste.')}</p>`}
        <h3 class="section-title">${t('Otros costes')}</h3>
        <div class="form-grid">
          ${field(t('Mano de obra (h)'), numInp('laborHours', p.laborHours, 'min="0"'), { hint: t('Diseño, montaje y acabado a {rate}/h', { rate: money(S.settings.laborRate) }) })}
          ${field(t('Extras (€)'), numInp('extras', p.extras, 'min="0"'), { hint: t('Gastos sueltos no inventariados.') })}
          ${field(t('Margen (%)'), numInp('margin', p.margin, `placeholder="${S.settings.defaultMargin}"`), { hint: t('Para el precio sugerido.') })}
          ${field(t('Notas'), inp('notes', p.notes))}
          ${quoteOnly || isNew ? `<div class="field wide"><label class="check"><input type="checkbox" name="deduct" ${quoteOnly ? '' : 'checked'}> ${t('Descontar materiales y componentes del stock')}</label></div>` : ''}
        </div>
        <div class="card" style="margin:16px 0 0" id="preview"></div>`,
      onOpen: (b) => {
        const kindSel = $('[name="kind"]', b);
        const machineSel = $('[name="printerId"]', b);
        let sheetsTouched = !isNew;
        const sheetsBox = $('#sheets', b);
        if (sheetsBox) sheetsBox.addEventListener('input', () => { sheetsTouched = true; });
        const TIME_HINTS = {
          '3d': t('Tiempo total de impresión.'),
          laser: t('Tiempo de corte y grabado.'),
          sello: t('Insolado + post-exposición en la insoladora. El lavado y secado van en mano de obra.'),
        };
        const showSections = () => {
          const k = kindSel.value;
          $('#sec-fil', b).hidden = k !== '3d';
          $('#sec-sheet', b).hidden = k === '3d';
          $('#time-hint', b).textContent = TIME_HINTS[k];
        };
        kindSel.addEventListener('change', () => {
          // proponer una máquina acorde al tipo de trabajo
          const cur = findPrinter(machineSel && machineSel.value);
          if (machineSel && !machineFits(cur, kindSel.value)) {
            const alt = S.printers.find((x) => machineFits(x, kindSel.value));
            if (alt) machineSel.value = alt.id;
          }
          // proponer los materiales típicos del tipo mientras el usuario no los haya tocado
          if (sheetsBox && !sheetsTouched) sheetsBox.innerHTML = defaultSheets(kindSel.value).map(sheetRow).join('');
          showSections();
        });
        showSections();
        const readSheets = () => (kindSel.value === '3d' ? [] : $$('.sheet-row', b).map((row) => {
          const id = $('[name="sheet-id"]', row).value;
          const mt = S.materials.find((x) => x.id === id);
          return { materialId: id, materialName: mt ? materialLabel(mt) : '', width: num($('[name="sheet-w"]', row).value), height: num($('[name="sheet-h"]', row).value), costPerCm2: mt ? sheetCostPerCm2(mt) : 0 };
        }).filter((it) => it.materialId && it.width > 0 && it.height > 0));
        const readItems = () => (kindSel.value !== '3d' ? [] : $$('.item-row', b).map((row) => {
          const id = $('[name="item-filament"]', row).value;
          const f = S.filaments.find((x) => x.id === id);
          const input = $('[name="item-grams"]', row);
          if (f) input.placeholder = unitOf(f);
          return { filamentId: id, filamentName: f ? filamentLabel(f) : '', unit: unitOf(f), grams: num(input.value) };
        }).filter((it) => it.filamentId && it.grams > 0));
        const readComps = () => $$('.comp-row', b).map((row) => {
          const id = $('[name="comp-id"]', row).value;
          const c = S.components.find((x) => x.id === id);
          return { componentId: id, componentName: c ? c.name : '', qty: num($('[name="comp-qty"]', row).value), unitCost: c ? componentUnitCost(c) : 0 };
        }).filter((it) => it.componentId && it.qty > 0);
        const readJob = () => ({
          kind: kindSel.value,
          printerId: val(b, 'printerId'),
          items: readItems(),
          sheets: readSheets(),
          components: readComps(),
          hours: num(val(b, 'h')) + num(val(b, 'm')) / 60,
          quantity: Math.max(1, Math.floor(num(val(b, 'quantity'))) || 1),
          laborHours: num(val(b, 'laborHours')),
          extras: num(val(b, 'extras')),
          margin: val(b, 'margin'),
        });
        const refresh = () => {
          const job = readJob();
          const pr = findPrinter(job.printerId);
          const c = printCost(job, filamentsById(), S.settings, pr, componentsById(), materialsById());
          const prevSheets = !isNew && p.stockDeducted ? sheetsUsed(p.sheets, p.quantity, S.settings.sheetWaste, materialsById()) : {};
          const shortSheets = Object.entries(sheetsUsed(job.sheets, job.quantity, S.settings.sheetWaste, materialsById()))
            .map(([id, n]) => ({ mt: S.materials.find((x) => x.id === id), n }))
            .filter(({ mt, n }) => mt && n > num(mt.stock) + num(prevSheets[mt.id]) + 1e-9);
          const prevComps = !isNew && p.stockDeducted ? componentsUsed(p.components, p.quantity) : {};
          const shortComps = Object.entries(componentsUsed(job.components, job.quantity))
            .map(([id, q]) => ({ c: S.components.find((x) => x.id === id), q }))
            .filter(({ c: k, q }) => k && q > num(k.stock) + num(prevComps[k.id]));
          // stock disponible teniendo en cuenta lo que este trabajo ya descontó
          const prev = !isNew && p.stockDeducted ? gramsByFilament(p.items) : {};
          const short = Object.entries(gramsByFilament(job.items))
            .map(([id, g]) => ({ f: S.filaments.find((x) => x.id === id), g }))
            .filter(({ f, g }) => f && g > num(f.remaining) + num(prev[f.id]));
          $('#preview', b).innerHTML = `
            <dl class="breakdown">
              ${job.kind === '3d' ? `<dt>${t('Filamento / resina')}</dt><dd>${money(c.material)}</dd>` : `<dt>${t('Material en plancha (+{pct} % desperdicio)', { pct: fmtNum(S.settings.sheetWaste) })}</dt><dd>${money(c.sheet)}</dd>`}
              <dt>${t('Electricidad')}${pr ? ` (${fmtNum(pr.watts)} W)` : ''}</dt><dd>${money(c.electricity)}</dd>
              <dt>${t('Amortización y mantenimiento')}${pr ? ` · ${esc(pr.name)}` : ''}</dt><dd>${money(c.machine)}</dd>
              ${c.components ? `<dt>${t('Componentes externos')}</dt><dd>${money(c.components)}</dd>` : ''}
              <dt>${t('Mano de obra')}</dt><dd>${money(c.labor)}</dd>
              <dt>${t('Extras')}</dt><dd>${money(c.extras)}</dd>
              <dt>${t('Margen de fallos ({pct} %)', { pct: fmtNum(S.settings.failureRate) })}</dt><dd>${money(c.failure)}</dd>
              <dt class="total">${c.quantity === 1 ? t('Coste total (1 ud.)') : t('Coste total ({n} uds.)', { n: c.quantity })}</dt><dd class="total">${money(c.total)}</dd>
            </dl>
            <div class="price-box">
              <div><div class="small muted">${t('Coste por unidad')}</div><strong>${money(c.unit)}</strong></div>
              <div><div class="small muted">${t('Precio sugerido (+{pct} %)', { pct: fmtNum(c.margin) })}</div><strong>${money(c.suggestedUnitPrice)}</strong></div>
            </div>
            ${short.length ? `<p class="small neg">${t('⚠ Stock insuficiente: {list}', { list: short.map(({ f }) => esc(f.name) + ' (' + fmtStock(f) + ')').join(', ') })}</p>` : ''}
            ${shortSheets.length ? `<p class="small neg">${t('⚠ Faltan planchas: {list}', { list: shortSheets.map(({ mt, n }) => `${esc(materialLabel(mt))} (${t('necesitas {a}, hay {b}', { a: fmtNum(n, 2), b: fmtNum(mt.stock, 2) })})`).join(', ') })}</p>` : ''}
            ${shortComps.length ? `<p class="small neg">${t('⚠ Faltan componentes: {list}', { list: shortComps.map(({ c: k, q }) => `${esc(k.name)} (${t('necesitas {a}, hay {b}', { a: fmtNum(q, 2), b: fmtNum(k.stock, 2) })})`).join(', ') })}</p>` : ''}`;
        };
        b.addEventListener('input', refresh);
        b.addEventListener('change', refresh);
        b.addEventListener('click', (e) => {
          if (e.target.closest('[data-remove-sheet]')) {
            if ($$('.sheet-row', b).length > 1) e.target.closest('.sheet-row').remove();
            refresh();
          }
          if (e.target.closest('[data-remove-comp]')) {
            e.target.closest('.comp-row').remove();
            refresh();
          }
          if (e.target.closest('[data-close-link]')) modal.close();
          if (e.target.closest('[data-remove-item]')) {
            const rows = $$('.item-row', b);
            if (rows.length > 1) e.target.closest('.item-row').remove();
            refresh();
          }
        });
        const addComp = $('#add-comp', b);
        if (addComp) addComp.addEventListener('click', () => {
          $('#comps', b).insertAdjacentHTML('beforeend', compRow({ componentId: '', qty: 1 }));
          refresh();
        });
        const addItem = $('#add-item', b);
        if (addItem) addItem.addEventListener('click', () => {
          $('#items', b).insertAdjacentHTML('beforeend', itemRow({ filamentId: '', grams: '' }));
          refresh();
        });
        const addSheet = $('#add-sheet', b);
        if (addSheet) addSheet.addEventListener('click', () => {
          $('#sheets', b).insertAdjacentHTML('beforeend', sheetRow({ materialId: '', width: '', height: '' }));
          refresh();
        });
        b._readJob = readJob;
        refresh();
      },
      onSubmit: (b) => {
        const job = b._readJob();
        if (!job.items.length && !job.sheets.length && !job.components.length && !job.hours) { toast(t('Indica el material usado o el tiempo de máquina.')); return false; }
        const pr = findPrinter(job.printerId);
        const cost = printCost(job, filamentsById(), S.settings, pr, componentsById(), materialsById());
        const data = { ...job, printerName: pr ? pr.name : '', name: val(b, 'name'), fileUrl: normalizeUrl(val(b, 'fileUrl')), date: val(b, 'date') || today(), notes: val(b, 'notes'), cost };
        if (isNew) {
          const deduct = checked(b, 'deduct');
          if (deduct) applyJobStock(data, -1);
          S.prints.push({ id: uid(), ...data, stockDeducted: deduct });
          persist(deduct ? t('Trabajo registrado y stock actualizado') : t('Trabajo registrado'));
        } else {
          if (p.stockDeducted) { applyJobStock(p, +1); applyJobStock(data, -1); }
          Object.assign(p, data);
          // actualizar el coste en las ventas ligadas que no se hayan modificado a mano
          S.sales.forEach((s) => { if (s.printId === p.id && s.costFromPrint) s.unitCost = cost.unit; });
          persist(t('Trabajo actualizado'));

        }
      },
    });
  }

  // ================================================================ VENTAS

  function viewSales() {
    const list = S.sales.filter((s) => inPeriod(s.date, ui.salesPeriod)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const tot = list.reduce((acc, s) => {
      const tt = saleTotals(s);
      acc.revenue += tt.revenue; acc.fees += tt.fees; acc.cogs += tt.cogs; acc.profit += tt.profit; acc.units += num(s.quantity);
      return acc;
    }, { revenue: 0, fees: 0, cogs: 0, profit: 0, units: 0 });

    return `
      <div class="page-head">
        <h1>${t('Ventas')}</h1>
        <div class="actions">${periodSelect('salesPeriod', ui.salesPeriod)}
          <button class="btn primary" data-action="new-sale">${t('+ Nueva venta')}</button></div>
      </div>
      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>${t('Fecha')}</th><th>${t('Pieza / cliente')}</th><th class="num">${t('Uds.')}</th><th class="num">${t('Precio ud.')}</th><th class="num">${t('Ingreso')}</th>
            <th class="num">${t('Comisiones/envío')}</th><th class="num">${t('Coste')}</th><th class="num">${t('Beneficio')}</th><th class="num">${t('Margen')}</th><th></th></tr></thead>
          <tbody>${list.map((s) => {
            const tt = saleTotals(s);
            return `<tr>
              <td class="nowrap">${fmtDate(s.date)}</td>
              <td><b>${esc(s.description)}</b><div class="small muted">${esc([s.customer, s.channel].filter(Boolean).join(' · '))}</div></td>
              <td class="num">${fmtNum(s.quantity)}</td>
              <td class="num">${money(s.unitPrice)}</td>
              <td class="num">${money(tt.revenue)}</td>
              <td class="num">${money(tt.fees)}</td>
              <td class="num">${money(tt.cogs)}</td>
              <td class="num"><b>${moneySigned(tt.profit)}</b></td>
              <td class="num">${tt.revenue > 0 ? fmtNum((tt.profit / tt.revenue) * 100, 0) + ' %' : '—'}</td>
              <td class="actions">
                <button class="icon-btn" data-action="edit-sale" data-id="${s.id}" aria-label="${t('Editar')}" title="${t('Editar')}">✎</button>
                <button class="icon-btn" data-action="delete-sale" data-id="${s.id}" aria-label="${t('Eliminar')}" title="${t('Eliminar')}">🗑</button></td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td colspan="2">${t('Total')}</td><td class="num">${fmtNum(tot.units)}</td><td></td><td class="num">${money(tot.revenue)}</td>
            <td class="num">${money(tot.fees)}</td><td class="num">${money(tot.cogs)}</td><td class="num">${moneySigned(tot.profit)}</td>
            <td class="num">${tot.revenue > 0 ? fmtNum((tot.profit / tot.revenue) * 100, 0) + ' %' : '—'}</td><td></td></tr></tfoot>
        </table></div>` : `<div class="empty">${t('No hay ventas en este periodo.')}</div>`}
      </div>`;
  }

  function saleForm(s, presetPrintId) {
    const isNew = !s;
    const sold = soldByPrint(S.sales);
    const available = (p) => num(p.quantity) - num(sold[p.id]) + (s && s.printId === p.id ? num(s.quantity) : 0);
    const prints = [...S.prints].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    s = s || { date: today(), printId: presetPrintId || '', description: '', quantity: 1, unitPrice: '', fees: 0, unitCost: 0, customer: '', channel: '', costFromPrint: true };

    openModal({
      title: isNew ? t('Nueva venta') : t('Editar venta'),
      body: `<div class="form-grid">
        ${field(t('Trabajo'), `<select name="printId"><option value="">${t('— Venta libre (sin trabajo registrado) —')}</option>${prints.map((p) =>
          `<option value="${p.id}"${p.id === s.printId ? ' selected' : ''}>${esc(p.name)} · ${fmtDate(p.date)} (${t('{n} disp.', { n: fmtNum(available(p)) })})</option>`).join('')}</select>`, { wide: true })}
        ${field(t('Descripción *'), inp('description', s.description, 'required'), { wide: true })}
        ${field(t('Fecha'), `<input type="date" name="date" value="${esc(s.date)}">`)}
        ${field(t('Unidades'), numInp('quantity', s.quantity, 'min="1" step="1"'))}
        ${field(t('Precio de venta por ud. *'), numInp('unitPrice', s.unitPrice, 'required min="0"'))}
        ${field(t('Comisiones y envío (€)'), numInp('fees', s.fees, 'min="0"'), { hint: t('Total de la venta: Etsy, Wallapop, PayPal, envío…') })}
        ${field(t('Coste por ud.'), numInp('unitCost', s.unitCost, 'min="0"'), { hint: t('Se rellena con el coste de la impresión.') })}
        ${field(t('Cliente'), inp('customer', s.customer))}
        ${field(t('Canal'), inp('channel', s.channel, `list="channels" placeholder="${t('Etsy, tienda, feria…')}"`) + `<datalist id="channels">${['Etsy', 'Wallapop', 'Amazon', t('Tienda online'), t('Directo'), t('Feria')].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`)}
      </div>
      <div class="price-box" id="sale-preview"></div>`,
      onOpen: (b) => {
        const sel = $('[name="printId"]', b);
        const costInput = $('[name="unitCost"]', b);
        let costTouched = !s.costFromPrint;
        costInput.addEventListener('input', () => { costTouched = true; });
        const fillFromPrint = (force) => {
          const p = S.prints.find((x) => x.id === sel.value);
          if (!p) return;
          if (force || !val(b, 'description')) $('[name="description"]', b).value = p.name;
          if (force || !val(b, 'unitPrice')) $('[name="unitPrice"]', b).value = Math.round(num(p.cost && p.cost.suggestedUnitPrice) * 100) / 100;
          costInput.value = Math.round(num(p.cost && p.cost.unit) * 10000) / 10000;
          costTouched = false;
        };
        sel.addEventListener('change', () => fillFromPrint(true));
        if (isNew && s.printId) fillFromPrint(false);
        const refresh = () => {
          const tt = saleTotals({ quantity: val(b, 'quantity'), unitPrice: val(b, 'unitPrice'), fees: val(b, 'fees'), unitCost: val(b, 'unitCost') });
          const p = S.prints.find((x) => x.id === sel.value);
          const warn = p && num(val(b, 'quantity')) > available(p) ? `<div class="small neg">${t('⚠ Solo hay {n} uds. disponibles de esta impresión.', { n: fmtNum(available(p)) })}</div>` : '';
          $('#sale-preview', b).innerHTML = `<div><div class="small muted">${t('Ingreso')}</div><strong>${money(tt.revenue)}</strong></div>
            <div><div class="small muted">${t('Beneficio')}</div><strong>${moneySigned(tt.profit)}</strong></div>
            <div><div class="small muted">${t('Margen')}</div><strong>${tt.revenue > 0 ? fmtNum((tt.profit / tt.revenue) * 100, 1) + ' %' : '—'}</strong></div>${warn}`;
        };
        b.addEventListener('input', refresh);
        b.addEventListener('change', refresh);
        b._costTouched = () => costTouched;
        refresh();
      },
      onSubmit: (b) => {
        const data = {
          printId: val(b, 'printId') || null, description: val(b, 'description'), date: val(b, 'date') || today(),
          quantity: Math.max(1, num(val(b, 'quantity'))), unitPrice: num(val(b, 'unitPrice')), fees: num(val(b, 'fees')),
          unitCost: num(val(b, 'unitCost')), customer: val(b, 'customer'), channel: val(b, 'channel'),
        };
        data.costFromPrint = !!data.printId && !b._costTouched();
        if (isNew) S.sales.push({ id: uid(), ...data });
        else Object.assign(s, data);
        persist(isNew ? t('Venta registrada') : t('Venta actualizada'));
      },
    });
  }

  // ================================================================ GASTOS

  const EXPENSE_CATEGORIES = {
    filamento: N_('Filamento y resina'),
    materiales: N_('Materiales en plancha'),
    componentes: N_('Componentes'),
    electricidad: N_('Electricidad'),
    repuestos: N_('Repuestos y mantenimiento'),
    maquinaria: N_('Máquinas y herramientas'),
    embalaje: N_('Embalaje y envíos'),
    otros: N_('Otros'),
  };
  const expenseCat = (k) => (EXPENSE_CATEGORIES[k] ? t(EXPENSE_CATEGORIES[k]) : k);

  function viewExpenses() {
    const list = S.expenses.filter((e) => inPeriod(e.date, ui.expensesPeriod)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const byCat = {};
    list.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + num(e.amount); });
    const total = list.reduce((s, e) => s + num(e.amount), 0);
    return `
      <div class="page-head">
        <h1>${t('Gastos')}</h1>
        <div class="actions">${periodSelect('expensesPeriod', ui.expensesPeriod)}
          <button class="btn primary" data-action="new-expense">${t('+ Nuevo gasto')}</button></div>
      </div>
      ${list.length ? `<div class="kpis">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
        `<div class="kpi"><div class="label">${esc(expenseCat(k))}</div><div class="value">${money(v)}</div>
          <div class="sub">${t('{pct} % del total', { pct: fmtNum(total > 0 ? (v / total) * 100 : 0) })}</div></div>`).join('')}</div>` : ''}
      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>${t('Fecha')}</th><th>${t('Categoría')}</th><th>${t('Descripción')}</th><th class="num">${t('Importe')}</th><th></th></tr></thead>
          <tbody>${list.map((e) => `<tr>
            <td class="nowrap">${fmtDate(e.date)}</td>
            <td><span class="badge">${esc(expenseCat(e.category))}</span></td>
            <td>${esc(e.description)}</td>
            <td class="num">${money(e.amount)}</td>
            <td class="actions"><button class="icon-btn" data-action="edit-expense" data-id="${e.id}" aria-label="${t('Editar')}" title="${t('Editar')}">✎</button>
              <button class="icon-btn" data-action="delete-expense" data-id="${e.id}" aria-label="${t('Eliminar')}" title="${t('Eliminar')}">🗑</button></td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="3">${t('Total')}</td><td class="num">${money(total)}</td><td></td></tr></tfoot>
        </table></div>` : `<div class="empty">${t('No hay gastos en este periodo. Las compras de filamento se añaden aquí automáticamente.')}</div>`}
      </div>`;
  }

  function expenseForm(e) {
    const isNew = !e;
    e = e || { date: today(), category: 'otros', description: '', amount: '' };
    openModal({
      title: isNew ? t('Nuevo gasto') : t('Editar gasto'),
      body: `<div class="form-grid">
        ${field(t('Fecha'), `<input type="date" name="date" value="${esc(e.date)}">`)}
        ${field(t('Categoría'), `<select name="category">${Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => `<option value="${k}"${k === e.category ? ' selected' : ''}>${t(v)}</option>`).join('')}</select>`)}
        ${field(t('Importe *'), numInp('amount', e.amount, 'required min="0"'))}
        ${field(t('Descripción *'), inp('description', e.description, 'required'), { wide: true })}
      </div>
      ${e.filamentId ? `<p class="small muted">${t('Este gasto está ligado a una compra de filamento. Modificarlo no cambia el stock.')}</p>` : ''}`,
      onSubmit: (b) => {
        const data = { date: val(b, 'date') || today(), category: val(b, 'category'), description: val(b, 'description'), amount: num(val(b, 'amount')) };
        if (isNew) S.expenses.push({ id: uid(), ...data });
        else Object.assign(e, data);
        persist(isNew ? t('Gasto añadido') : t('Gasto actualizado'));
      },
    });
  }

  // ================================================================ AJUSTES

  function viewSettings() {
    const st = S.settings;
    const theme = safeGet('daprintbox:theme') || 'auto';
    return `
      <div class="page-head"><h1>${t('Ajustes')}</h1></div>
      <form class="card" id="settings-form">
        <h2>${t('Costes de producción')}</h2>
        <div class="form-grid">
          ${field(t('Moneda'), `<select name="currency">${['EUR', 'USD', 'MXN', 'ARS', 'COP', 'CLP', 'GBP', 'CHF'].map((c) => `<option${c === st.currency ? ' selected' : ''}>${c}</option>`).join('')}</select>`)}
          ${field(t('Precio electricidad (/kWh)'), numInp('kwhPrice', st.kwhPrice, 'min="0"'))}
          ${field(t('Mano de obra (/h)'), numInp('laborRate', st.laborRate, 'min="0"'))}
          ${field(t('Margen por fallos (%)'), numInp('failureRate', st.failureRate, 'min="0"'), { hint: t('Impresiones o cortes fallidos.') })}
          ${field(t('Desperdicio de plancha (%)'), numInp('sheetWaste', st.sheetWaste, 'min="0"'), { hint: t('Márgenes, recortes y separación entre piezas.') })}
          ${field(t('Margen de beneficio por defecto (%)'), numInp('defaultMargin', st.defaultMargin, 'min="0"'))}
          ${field(t('Aviso de stock bajo (g o ml)'), numInp('lowStockGrams', st.lowStockGrams, 'min="0"'), { hint: t('Para filamento y resina sin aviso propio.') })}
        </div>
        <p class="small muted">${t('El consumo, precio, vida útil y mantenimiento de cada máquina se configuran en <a href="#printers">Máquinas</a>.')}</p>
        <button class="btn primary" type="submit">${t('Guardar ajustes')}</button>
      </form>

      ${pwa.supported ? `<div class="card">
        <h2>${t('Instalar en el móvil o el ordenador')}</h2>
        ${pwa.installed ? `<p class="small">${t('✓ Estás usando Libreta Maker como app instalada.')}</p>`
          : pwa.prompt ? `<p class="small">${t('Instala Libreta Maker como una app: icono en la pantalla de inicio, pantalla completa y funciona sin conexión.')}</p>
            <button class="btn primary" data-action="install-app">${t('Instalar la app')}</button>`
          : `<p class="small">${t('Para tenerla como una app con su icono:')}</p>
            <ul class="small" style="margin:0;padding-left:20px">
              <li>${t('<b>Android (Chrome):</b> menú <b>⋮</b> → <b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.')}</li>
              <li>${t('<b>iPhone (Safari):</b> botón <b>Compartir</b> → <b>Añadir a pantalla de inicio</b>.')}</li>
              <li>${t('<b>Ordenador (Chrome o Edge):</b> icono de instalar a la derecha de la barra de direcciones.')}</li>
            </ul>`}
      </div>` : ''}

      <div class="card">
        <h2>${t('Idioma y apariencia')}</h2>
        <div class="filters">${field(t('Idioma'), langSelect('lang-select'))}
          ${field(t('Tema'), `<select id="theme-select">${[['auto', N_('Automático')], ['light', N_('Claro')], ['dark', N_('Oscuro')]].map(([k, v]) => `<option value="${k}"${k === theme ? ' selected' : ''}>${t(v)}</option>`).join('')}</select>`)}</div>
      </div>

      ${remote ? `<div class="card">
        <h2>${t('Tu cuenta')}</h2>
        <p class="small">${t('Has entrado como <b>{user}</b>{email}. Esta libreta es <b>solo tuya</b>: se guarda en el servidor y ningún otro usuario puede verla.', { user: esc(sync.user || ''), email: sync.email ? ` (${esc(sync.email)})` : '' })}</p>
        <p class="small muted">${t('Funciona también sin conexión: cada cambio se guarda al momento en este dispositivo y se sincroniza solo con el servidor en cuanto hay internet. Si cambias cosas en dos dispositivos a la vez, se combinan.')}</p>
        <p class="small muted">${t('Versión {n}', { n: fmtNum(sync.version) })}${sync.updatedAt ? ` · ${t('último cambio el {date}', { date: esc(fmtDateTime(sync.updatedAt)) })}` : ''}</p>
        <div class="filters">
          <button class="btn" data-action="history">${t('Historial de versiones')}</button>
          ${sync.email ? '' : `<button class="btn" data-action="change-password">${t('Cambiar contraseña')}</button>`}
          <button class="btn" data-action="logout">${t('Cerrar sesión')}</button>
        </div>
        <p class="small muted" style="margin-bottom:0"><a href="condiciones.html" target="_blank" rel="noopener">${t('Condiciones de uso')}</a> · <a href="privacidad.html" target="_blank" rel="noopener">${t('Privacidad')}</a> · ${t('Para borrar tu cuenta, escribe al administrador indicando tu usuario.')}</p>
      </div>` : ''}

      <div class="card">
        <h2>${t('Datos')}</h2>
        <p class="small muted">${remote ? t('Además del historial del servidor, puedes guardar tus propias copias.') : t('Los datos se guardan en este navegador.')} ${t('Guarda una copia de seguridad a menudo para no perderlos o para pasarlos a otro dispositivo. Si los botones de descarga no hacen nada (algunos visores web los bloquean), usa «Copia en texto».')}</p>
        <div class="filters">
          <button class="btn" data-action="backup-text">${t('Copia en texto (copiar / pegar)')}</button>
          <button class="btn" data-action="export-json">${t('⬇ Exportar copia (JSON)')}</button>
          <button class="btn" data-action="import-json">${t('⬆ Importar copia')}</button>
          <button class="btn" data-action="export-csv" data-kind="sales">${t('Ventas CSV')}</button>
          <button class="btn" data-action="export-csv" data-kind="expenses">${t('Gastos CSV')}</button>
          <button class="btn" data-action="export-csv" data-kind="filaments">${t('Filamento y resina CSV')}</button>
          <button class="btn" data-action="export-csv" data-kind="materials">${t('Materiales CSV')}</button>
          <button class="btn" data-action="export-csv" data-kind="components">${t('Componentes CSV')}</button>
          <button class="btn" data-action="load-demo">${t('Cargar datos de ejemplo')}</button>
          <button class="btn danger" data-action="reset">${t('Borrar todo')}</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>`;
  }

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }

  function applyTheme() {
    const th = safeGet('daprintbox:theme');
    if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
    else delete document.documentElement.dataset.theme;
  }

  // Visor de claude.ai: las descargas pasan por su capacidad `downloads` (null fuera de él).
  let viewerDownloads = null;
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('downloads').then((d) => { viewerDownloads = d; }, () => {});
  }

  function download(name, content, type) {
    if (viewerDownloads) {
      viewerDownloads.save({ filename: name, data: content }).then(
        () => toast(t('Archivo guardado')),
        (err) => { if (err && err.code !== 'declined') toast(t('No se pudo descargar aquí; usa «Copia en texto».')); },
      );
      return;
    }
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function toCSV(rows) {
    const cell = (v) => {
      const s = String(v == null ? '' : v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const dec = (v) => String(Math.round(num(v) * 100) / 100).replace('.', ',');
    return '﻿' + rows.map((r) => r.map((v) => cell(typeof v === 'number' ? dec(v) : v)).join(';')).join('\n');
  }

  function exportCSV(kind) {
    let rows;
    const head = (cols) => cols.map((c) => t(c));
    if (kind === 'sales') {
      rows = [head([N_('Fecha'), N_('Descripción'), N_('Cliente'), N_('Canal'), N_('Unidades'), N_('Precio ud.'), N_('Ingreso'), N_('Comisiones'), N_('Coste'), N_('Beneficio')])];
      S.sales.forEach((s) => { const tt = saleTotals(s); rows.push([s.date, s.description, s.customer, s.channel, num(s.quantity), num(s.unitPrice), tt.revenue, tt.fees, tt.cogs, tt.profit]); });
    } else if (kind === 'materials') {
      rows = [head([N_('Nombre'), N_('Categoría'), N_('Grosor (mm)'), N_('Ancho (mm)'), N_('Alto (mm)'), N_('Precio plancha'), N_('Coste cm²'), N_('Stock (planchas)'), N_('Valor stock'), N_('Proveedor')])];
      S.materials.forEach((m) => rows.push([m.name, m.category, num(m.thickness), num(m.sheetWidth), num(m.sheetHeight), num(m.price), sheetCostPerCm2(m), num(m.stock), Math.max(0, num(m.stock)) * num(m.price), m.supplier]));
    } else if (kind === 'components') {
      rows = [head([N_('Nombre'), N_('Categoría'), N_('Unidad'), N_('Precio paquete'), N_('Uds. por paquete'), N_('Coste ud.'), N_('Stock'), N_('Valor stock'), N_('Proveedor')])];
      S.components.forEach((c) => rows.push([c.name, c.category, unitLabel(c.unit), num(c.price), num(c.packUnits), componentUnitCost(c), num(c.stock), Math.max(0, num(c.stock)) * componentUnitCost(c), c.supplier]));
    } else if (kind === 'expenses') {
      rows = [head([N_('Fecha'), N_('Categoría'), N_('Descripción'), N_('Importe')])];
      S.expenses.forEach((e) => rows.push([e.date, expenseCat(e.category), e.description, num(e.amount)]));
    } else {
      rows = [head([N_('Tipo'), N_('Nombre'), N_('Material'), N_('Color'), N_('Marca'), N_('Diámetro'), N_('Unidad'), N_('Contenido bobina/envase'), N_('Precio'), N_('Stock'), N_('Valor stock')])];
      S.filaments.forEach((f) => rows.push([isResin(f) ? t('Resina') : t('Filamento'), f.name, f.material, f.colorName, f.brand, f.diameter || '', unitOf(f), num(f.spoolWeight), num(f.price), num(f.remaining), Math.max(0, num(f.remaining)) * costPerGram(f)]));
    }
    download(`libreta-maker-${kind}-${today()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  }

  /** Copia de seguridad como texto: sirve donde las descargas están bloqueadas. */
  function backupTextForm() {
    openModal({
      title: t('Copia de seguridad en texto'),
      submitLabel: t('Reemplazar mis datos con este texto'),
      body: `<p class="small muted">${t('Copia este texto y guárdalo en una nota o un archivo. Para restaurar, pega aquí una copia y pulsa el botón de abajo.')}</p>
        <textarea id="backup-text" name="backup" rows="12" spellcheck="false" style="font-family:ui-monospace,monospace;font-size:.8rem">${esc(JSON.stringify(S))}</textarea>
        <div class="filters" style="margin-top:8px"><button type="button" class="btn small" id="copy-backup">${t('Copiar al portapapeles')}</button></div>`,
      onOpen: (b) => {
        const ta = $('#backup-text', b);
        $('#copy-backup', b).addEventListener('click', () => {
          const done = () => toast(t('Copia copiada al portapapeles'));
          const fallback = () => { ta.focus(); ta.select(); toast(t('Texto seleccionado: cópialo con Ctrl+C / Cmd+C')); };
          try { navigator.clipboard.writeText(ta.value).then(done, fallback); } catch (e) { fallback(); }
        });
      },
      onSubmit: (b) => {
        let data;
        try { data = JSON.parse(val(b, 'backup')); } catch (e) { data = null; }
        if (!data || !Array.isArray(data.filaments)) { toast(t('El texto no es una copia válida de Libreta Maker.')); return false; }
        S = window.Store.normalize(data);
        sync.replaceAll = true;
        persist(t('Copia restaurada'));

      },
    });
  }

  // ================================================================ DATOS DE EJEMPLO

  function demoData() {
    const td = today();
    const months = lastMonths(td.slice(0, 7), 6);
    const d = (i, day) => `${months[i]}-${String(day).padStart(2, '0')}`;
    const st = { ...window.Store.DEFAULT_SETTINGS };
    const f1 = { id: uid(), name: 'PLA Negro mate', material: 'PLA', color: '#222222', colorName: 'Negro', brand: 'Sunlu', diameter: '1.75', spoolWeight: 1000, price: 19.99, remaining: 0, lowStock: '' };
    const f2 = { id: uid(), name: 'PETG Transparente', material: 'PETG', color: '#cfe8f3', colorName: 'Transparente', brand: 'Prusament', diameter: '1.75', spoolWeight: 1000, price: 29.99, remaining: 0, lowStock: '' };
    const f3 = { id: uid(), name: 'PLA Silk Oro', material: 'Silk PLA', color: '#d4a93a', colorName: 'Oro', brand: 'Eryone', diameter: '1.75', spoolWeight: 1000, price: 22.5, remaining: 0, lowStock: 250 };
    const f4 = { id: uid(), name: 'TPU Rojo', material: 'TPU', color: '#c62828', colorName: 'Rojo', brand: 'Overture', diameter: '1.75', spoolWeight: 500, price: 18, remaining: 0, lowStock: 100 };
    const pr1 = { id: uid(), type: '3d', name: 'Bambu Lab P1S', notes: 'Cerrada · AMS', watts: 110, price: 699, lifeHours: 6000, maintenancePerHour: 0.08 };
    const pr3 = { id: uid(), type: 'laser', name: 'xTool S1 20 W', notes: 'Diodo 20 W · air assist · extractor', watts: 160, price: 1099, lifeHours: 10000, maintenancePerHour: 0.12 };
    const pr4 = { id: uid(), type: 'insoladora', name: 'Insoladora UV A4', notes: 'Tubos UV-A · exposición y post-exposición', watts: 40, price: 320, lifeHours: 3000, maintenancePerHour: 0.06 };
    const pr5 = { id: uid(), type: 'resina', name: 'Elegoo Saturn 4', notes: 'MSLA 12K · estación de lavado y curado', watts: 60, price: 399, lifeHours: 3000, maintenancePerHour: 0.2 };
    const f5 = { id: uid(), kind: 'resina', unit: 'ml', name: 'Resina gris 8K', material: '8K / alta definición', color: '#8d9196', colorName: 'Gris', brand: 'Elegoo', diameter: '', spoolWeight: 1000, price: 32.99, remaining: 0, lowStock: 250 };
    const pr2 = { id: uid(), type: '3d', name: 'Creality Ender 3 V3', notes: 'Boquilla 0.4', watts: 150, price: 229, lifeHours: 4000, maintenancePerHour: 0.05 };
    st.defaultPrinterId = pr1.id;
    const c1 = { id: uid(), name: 'Tira LED USB blanco cálido', category: 'Iluminación', unit: 'ud.', price: 5.99, packUnits: 1, stock: 0, lowStock: 2, supplier: 'Amazon' };
    const c2 = { id: uid(), name: 'Imanes neodimio 6×2 mm', category: 'Imanes', unit: 'ud.', price: 6.5, packUnits: 50, stock: 0, lowStock: 10, supplier: 'AliExpress' };
    const c3 = { id: uid(), name: 'Anillas de llavero 25 mm', category: 'Llaveros y anillas', unit: 'ud.', price: 4.2, packUnits: 100, stock: 0, lowStock: 20, supplier: 'AliExpress' };
    const c4 = { id: uid(), name: 'Portalámparas E14 con cable', category: 'Iluminación', unit: 'ud.', price: 17.9, packUnits: 5, stock: 0, lowStock: 2, supplier: 'Leroy Merlin' };
    const c5 = { id: uid(), name: 'Mango de madera para sello 40 mm', category: 'Sellos', unit: 'ud.', price: 11.9, packUnits: 10, stock: 0, lowStock: 3, supplier: 'Amazon' };
    const c6 = { id: uid(), name: 'Almohadilla de tinta negra', category: 'Sellos', unit: 'ud.', price: 3.5, packUnits: 1, stock: 0, lowStock: 2, supplier: 'Papelería' };
    const m1 = { id: uid(), name: 'Contrachapado de abedul', category: 'Contrachapado', thickness: 3, sheetWidth: 600, sheetHeight: 400, price: 4.8, stock: 0, lowStock: 2, supplier: 'Maderas del Sur' };
    const m2 = { id: uid(), name: 'Metacrilato transparente', category: 'Metacrilato', thickness: 3, sheetWidth: 600, sheetHeight: 400, price: 11.5, stock: 0, lowStock: 1, supplier: 'Plásticos Levante' };
    const m3 = { id: uid(), name: 'Fotopolímero para sellos', category: 'Fotopolímero', thickness: 1.7, sheetWidth: 297, sheetHeight: 210, price: 9.5, stock: 0, lowStock: 1, supplier: 'Sellos Pro' };
    const m5 = { id: uid(), name: 'Fotolito (acetato impreso)', category: 'Fotolito / negativo', thickness: 0, sheetWidth: 297, sheetHeight: 210, price: 0.6, stock: 0, lowStock: 3, supplier: 'Copistería' };
    const m4 = { id: uid(), name: 'Cuero vegetal', category: 'Cuero', thickness: 2, sheetWidth: 300, sheetHeight: 300, price: 14, stock: 0, lowStock: 1, supplier: 'Curtidos Ubrique' };
    const state = { version: 1, demo: true, settings: st, printers: [pr1, pr2, pr3, pr4, pr5], materials: [m1, m2, m3, m4, m5], components: [c1, c2, c3, c4, c5, c6], filaments: [f1, f2, f3, f4, f5], prints: [], sales: [], expenses: [] };
    state.expenses.push({ id: uid(), date: d(0, 1), category: 'maquinaria', description: 'Impresora Creality Ender 3 V3', amount: 229, printerId: pr2.id });
    state.expenses.push({ id: uid(), date: d(1, 5), category: 'maquinaria', description: 'Láser xTool S1 20 W', amount: 1099, printerId: pr3.id });
    state.expenses.push({ id: uid(), date: d(2, 2), category: 'maquinaria', description: 'Insoladora UV A4', amount: 320, printerId: pr4.id });
    const buyM = (m, n, date) => { m.stock += n; state.expenses.push({ id: uid(), date, category: 'materiales', description: `${fmtSheets(n)} · ${materialLabel(m)}`, amount: n * m.price, materialId: m.id }); };
    buyM(m1, 10, d(1, 6)); buyM(m2, 3, d(1, 6)); buyM(m3, 4, d(2, 3)); buyM(m5, 10, d(2, 3)); buyM(m4, 2, d(3, 10)); buyM(m1, 5, d(4, 15));
    const buy = (f, n, date) => { f.remaining += n * f.spoolWeight; state.expenses.push({ id: uid(), date, category: 'filamento', description: `${n} × ${filamentLabel(f)}`, amount: n * f.price, filamentId: f.id }); };
    const buyC = (c, packs, date) => { c.stock += packs * c.packUnits; state.expenses.push({ id: uid(), date, category: 'componentes', description: `${packs} × ${c.name}`, amount: packs * c.price, componentId: c.id }); };
    buyC(c5, 1, d(2, 3)); buyC(c6, 5, d(2, 3));
    buyC(c1, 5, d(2, 20)); buyC(c2, 1, d(0, 4)); buyC(c3, 1, d(3, 28)); buyC(c4, 1, d(4, 2));
    buy(f1, 3, d(0, 3)); buy(f2, 1, d(0, 3)); buy(f3, 1, d(1, 12)); buy(f4, 1, d(2, 5)); buy(f1, 2, d(4, 8)); buy(f5, 2, d(3, 1));
    state.expenses.push({ id: uid(), date: d(0, 10), category: 'repuestos', description: 'Boquillas 0.4 mm y cama PEI', amount: 34.9 });
    state.expenses.push({ id: uid(), date: d(3, 2), category: 'embalaje', description: 'Cajas y bolsas de envío', amount: 22 });
    state.expenses.push({ id: uid(), date: d(5, 1), category: 'repuestos', description: 'Correas GT2', amount: 12.5 });
    const byId = () => Object.fromEntries(state.filaments.map((f) => [f.id, f]));
    const matsById = () => Object.fromEntries(state.materials.map((m) => [m.id, m]));
    const print = (name, date, qty, hours, items, extra = {}) => {
      const pr = extra.printer || pr1;
      const sheets = (extra.sheets || []).map(([m, w, h]) => ({ materialId: m.id, materialName: materialLabel(m), width: w, height: h, costPerCm2: sheetCostPerCm2(m) }));
      const comps = (extra.components || []).map(([c, q]) => ({ componentId: c.id, componentName: c.name, qty: q, unitCost: componentUnitCost(c) }));
      const job = { kind: extra.kind || '3d', printerId: pr.id, printerName: pr.name, sheets, components: comps, items: items.map(([f, g]) => ({ filamentId: f.id, filamentName: filamentLabel(f), unit: unitOf(f), grams: g })), hours, quantity: qty, laborHours: extra.labor || 0, extras: extra.extras || 0, margin: '' };
      const p = { id: uid(), name, date, notes: '', ...job, cost: printCost(job, byId(), st, pr, Object.fromEntries(state.components.map((c) => [c.id, c])), matsById()), stockDeducted: true };
      Object.entries(sheetsUsed(sheets, qty, st.sheetWaste, matsById())).forEach(([id, n]) => { matsById()[id].stock = Math.round((matsById()[id].stock - n) * 1000) / 1000; });
      job.items.forEach((it) => { byId()[it.filamentId].remaining -= it.grams; });
      comps.forEach((it) => { state.components.find((c) => c.id === it.componentId).stock -= it.qty * qty; });
      state.prints.push(p);
      return p;
    };
    const sell = (p, date, qty, price, fees, customer, channel) => state.sales.push({ id: uid(), date, printId: p.id, description: p.name, quantity: qty, unitPrice: price, fees, unitCost: p.cost.unit, customer, channel, costFromPrint: true });
    const p1 = print('Soporte de auriculares', d(0, 6), 4, 14, [[f1, 520]], { labor: 0.5, printer: pr2 });
    const p2 = print('Maceta geométrica', d(1, 2), 3, 9.5, [[f3, 390]], { extras: 1.5 });
    const p3 = print('Organizador de escritorio', d(1, 20), 2, 11, [[f1, 610], [f2, 120]], { labor: 1, components: [[c2, 4]] });
    const p4 = print('Fundas flexibles', d(2, 9), 10, 6, [[f4, 330]], { extras: 2, printer: pr2 });
    const p5 = print('Lámpara lunar', d(3, 15), 2, 18, [[f2, 480]], { labor: 1, printer: pr2, components: [[c1, 1]] });
    const p6 = print('Llaveros personalizados', d(4, 11), 25, 5, [[f1, 150], [f3, 90]], { labor: 1.5, components: [[c3, 1]] });
    const p7 = print('Maceta geométrica', d(5, 4), 4, 12.5, [[f3, 450]], { extras: 2 });
    const p8 = print('Lámpara de mesa Voronoi', d(4, 20), 2, 22, [[f1, 380]], { labor: 1.5, components: [[c4, 1]] });
    const r1 = print('Miniaturas para rol (lote)', d(4, 9), 12, 3.5, [[f5, 85]], { printer: pr5, labor: 1, extras: 1.5 });
    const L = (name, date, qty, hours, sheets, extra = {}) => print(name, date, qty, hours, [], { kind: 'laser', printer: pr3, sheets, ...extra });
    const l1 = L('Posavasos grabados (set)', d(1, 10), 12, 1.5, [[m1, 100, 100]], { labor: 0.5 });
    const l2 = L('Letrero de metacrilato con nombre', d(2, 14), 1, 0.75, [[m2, 400, 200]], { labor: 0.5, components: [[c1, 1]] });
    const l3 = L('Llaveros de cuero grabados', d(3, 18), 20, 1, [[m4, 70, 35]], { labor: 1, components: [[c3, 1]] });
    const l4 = L('Cajas regalo de madera', d(4, 6), 4, 2, [[m1, 300, 200]], { labor: 1 });
    const l5 = L('Adornos navideños personalizados', d(5, 3), 30, 1.25, [[m1, 80, 80]], { labor: 1 });
    const ST = (name, date, qty, hours, w, h, extra = {}) => print(name, date, qty, hours, [], { kind: 'sello', printer: pr4, sheets: [[m3, w, h], [m5, w, h]], ...extra });
    const s1 = ST('Sello logo empresa', d(2, 8), 1, 0.2, 40, 40, { labor: 0.75, components: [[c5, 1]] });
    const s2 = ST('Sellos boda (iniciales)', d(3, 25), 3, 0.25, 50, 50, { labor: 1, components: [[c5, 1], [c6, 1]] });
    const s3 = ST('Sello «Pagado» para tienda', d(5, 6), 2, 0.2, 60, 25, { labor: 0.5, components: [[c5, 1]] });
    sell(l1, d(1, 16), 12, 3.5, 3.9, 'Bar La Terraza', 'Directo');
    sell(l2, d(2, 19), 1, 38, 4.6, 'Sara', 'Etsy');
    sell(l3, d(3, 26), 15, 6, 5.1, 'Moto Club', 'Directo');
    sell(l4, d(4, 12), 3, 22, 4.4, '', 'Etsy');
    sell(l5, d(5, Math.min(Number(td.slice(8, 10)), 12)), 18, 4.5, 3, 'Colegio San Jorge', 'Directo');
    sell(s1, d(2, 11), 1, 29, 0, 'Asesoría Martín', 'Directo');
    sell(s2, d(4, 1), 3, 19, 2.8, 'Lucía y Pablo', 'Etsy');
    sell(s3, d(5, Math.min(Number(td.slice(8, 10)), 9)), 2, 17, 0, 'Floristería Nube', 'Directo');
    sell(p1, d(0, 14), 2, 14.9, 2.4, 'Laura', 'Etsy'); sell(p1, d(1, 3), 2, 14.9, 1.2, '', 'Wallapop');
    sell(p2, d(1, 18), 3, 16, 3.1, 'Floristería Nube', 'Directo');
    sell(p3, d(2, 1), 1, 24, 3.8, 'Marc', 'Etsy'); sell(p4, d(2, 20), 6, 7.5, 2, '', 'Feria');
    sell(p5, d(3, 22), 2, 45, 7.6, 'Ana', 'Etsy'); sell(p8, d(4, 27), 1, 49, 6.1, 'Jordi', 'Etsy'); sell(r1, d(4, 23), 10, 4.5, 2.6, 'Club de rol El Dado', 'Directo'); sell(p4, d(4, 2), 3, 7.5, 0, '', 'Directo');
    sell(p6, d(4, 18), 20, 3.5, 4.2, 'Club Ciclista', 'Directo'); sell(p7, d(5, Math.min(Number(td.slice(8, 10)), 10)), 2, 16, 2.2, '', 'Wallapop');
    return state;
  }

  // ================================================================ SERVIDOR (datos compartidos)

  let saveChain = Promise.resolve();

  // Copia de la libreta en este dispositivo, por cuenta: permite trabajar sin conexión
  const CACHE_PREFIX = 'libreta:cache:';
  const LAST_USER = 'libreta:lastUser';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function saveCache() {
    if (!remote || !sync.username || !sync.ready) return;
    try {
      localStorage.setItem(CACHE_PREFIX + sync.username, JSON.stringify({
        user: sync.user, email: sync.email, version: sync.version, base: sync.base, state: S,
        pending: sync.pending || sync.saving, replaceAll: sync.replaceAll, savedAt: Date.now(),
      }));
      localStorage.setItem(LAST_USER, sync.username);
    } catch (e) { /* sin almacenamiento: solo se pierde el modo sin conexión */ }
  }
  function readCache(username) {
    try { return username ? JSON.parse(localStorage.getItem(CACHE_PREFIX + username) || 'null') : null; } catch (e) { return null; }
  }
  function clearCache(username) {
    try { localStorage.removeItem(CACHE_PREFIX + username); localStorage.removeItem(LAST_USER); } catch (e) { /* nada */ }
  }
  /** Carga la copia del dispositivo como estado de trabajo. */
  function useCache(cache) {
    S = window.Store.normalize(cache.state);
    Object.assign(sync, {
      version: cache.version || 0, base: cache.base || null, pending: !!cache.pending,
      replaceAll: !!cache.replaceAll, ready: true,
    });
    if (!sync.user) Object.assign(sync, { user: cache.user, email: cache.email || '' });
    $('.tabs').hidden = false;
    render();
    updateSyncBadge();
  }

  /** Encola un guardado del estado actual; los guardados van de uno en uno. */
  function queueSave(msg) {
    sync.pending = true;
    updateSyncBadge();
    saveChain = saveChain.then(() => doSave(msg));
  }

  async function doSave(msg) {
    if (!sync.pending || !sync.user || sync.saving) return;
    sync.pending = false;
    sync.saving = true;
    updateSyncBadge();
    const snapshot = clone(S);
    try {
      const r = await window.Remote.save(snapshot, sync.version);
      Object.assign(sync, { version: r.version, updatedBy: r.updated_by, updatedAt: r.updated_at, error: '', offline: false, base: snapshot, replaceAll: false });
      if (msg) toast(msg);
    } catch (e) {
      if (e.status === 409 && e.data) {
        // Se guardó desde otro dispositivo: se combinan sus cambios con los de aquí y se vuelve a guardar
        const theirs = window.Store.normalize(e.data.data || {});
        if (!sync.replaceAll) S = window.Store.normalize(window.Merge.merge3(sync.base, S, theirs));
        Object.assign(sync, { version: e.data.version, base: theirs, pending: true, error: '', offline: false });
        if (!modal.open) render();
        if (!sync.replaceAll) toast(t('Tus cambios se han combinado con los hechos en otro dispositivo.'), 5000);
        saveChain = saveChain.then(() => doSave(msg));
      } else if (e.status === 401) {
        Object.assign(sync, { pending: true, error: t('Sesión caducada') });
        showLogin(t('Tu sesión ha caducado. Vuelve a entrar: tus cambios están guardados en este dispositivo y se sincronizarán.'));
      } else if (e.status === 0) {
        Object.assign(sync, { pending: true, offline: true, error: '' }); // sin conexión: se reintentará solo
      } else {
        Object.assign(sync, { pending: true, error: t(e.message) });
        toast(t('No se pudo guardar en el servidor: {error}', { error: t(e.message) }), 6000);
      }
    } finally {
      sync.saving = false;
      saveCache();
      updateSyncBadge();
    }
  }

  function applyRemote(r) {
    S = window.Store.normalize(r.data || {});
    Object.assign(sync, {
      version: r.version, updatedBy: r.updated_by || '', updatedAt: r.updated_at || '',
      pending: false, error: '', offline: false, base: clone(S), replaceAll: false, ready: true,
    });
    render();
    updateSyncBadge();
    saveCache();
  }

  /** Sube los cambios pendientes o, si no hay, comprueba si otro dispositivo guardó algo. */
  async function pollRemote() {
    if (!remote || !sync.ready || !sync.user || sync.saving || modal.open || document.hidden) return;
    if (sync.pending) { queueSave(); return; }
    try {
      const r = await window.Remote.load(sync.version);
      if (sync.offline) { sync.offline = false; updateSyncBadge(); }
      if (r.unchanged || sync.pending || sync.saving || modal.open) return;
      applyRemote(r);
      toast(t('Libreta actualizada con los cambios hechos en otro dispositivo.'), 4000);
    } catch (e) {
      if (e.status === 401) showLogin(t('Tu sesión ha caducado. Vuelve a entrar.'));
      else if (e.status === 0 && !sync.offline) { sync.offline = true; updateSyncBadge(); }
    }
  }

  function updateSyncBadge() {
    if (!remote) return;
    let el = $('#sync');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sync';
      el.className = 'sync';
      el.setAttribute('role', 'status');
      $('.topbar').appendChild(el);
    }
    if (!sync.user) { el.innerHTML = ''; return; }
    const [cls, label] = sync.saving ? ['saving', t('Guardando…')]
      : sync.pending && sync.offline ? ['offline', t('Sin conexión · guardado en este dispositivo')]
      : sync.pending && sync.error ? ['error', t('Sin guardar')]
      : sync.pending ? ['saving', t('Pendiente')]
      : sync.offline ? ['offline', t('Sin conexión')]
      : ['ok', t('Guardado')];
    el.innerHTML = `<span class="dot ${cls}" aria-hidden="true"></span><span>${label}</span><span class="muted">· ${esc(sync.user)}</span>
      ${sync.pending && !sync.saving && sync.error ? `<button class="btn small" id="retry-save">${t('Reintentar')}</button>` : ''}`;
    const retry = $('#retry-save');
    if (retry) retry.addEventListener('click', () => queueSave(t('Cambios guardados')));
  }

  let authConfig = null;
  let googleScript = null;

  /** Carga la librería oficial de «Iniciar sesión con Google» (una sola vez). */
  function loadGoogleScript() {
    if (!googleScript) {
      googleScript = new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = 'https://accounts.google.com/gsi/client';
        tag.async = true;
        tag.onload = () => resolve(window.google);
        tag.onerror = () => { googleScript = null; reject(new Error(t('No se pudo cargar el acceso con Google. Revisa la conexión.'))); };
        document.head.appendChild(tag);
      });
    }
    return googleScript;
  }

  async function afterLogin(r) {
    const previous = sync.username;
    Object.assign(sync, { user: r.user, email: r.email || '', username: r.username || r.user });
    $('.tabs').hidden = false;
    const cache = readCache(sync.username);
    if (sync.pending && previous === sync.username) {
      // había cambios sin guardar antes de caducar la sesión
      sync.ready = true;
      render();
      queueSave(t('Cambios guardados'));
    } else if (cache && cache.pending) {
      // cambios hechos sin conexión en una sesión anterior de esta cuenta
      useCache(cache);
      queueSave(t('Cambios hechos sin conexión sincronizados'));
    } else {
      await loadFromServer();
    }
  }

  async function showLogin(message, mode = 'login') {
    sync.ready = false;
    $('.tabs').hidden = true;
    updateSyncBadge();
    view.innerHTML = `<div class="empty">${t('Cargando…')}</div>`;
    if (!authConfig) {
      try { authConfig = await window.Remote.authConfig(); } catch (e) {
        view.innerHTML = `<div class="card"><h2>${t('No se pudo conectar con el servidor')}</h2><p class="small">${esc(t(e.message))}${e.status === 0 ? ' ' + t('Cuando entres una vez con conexión, la app podrá abrirse también sin ella.') : ''}</p>
          <button class="btn primary" id="retry-connect">${t('Reintentar')}</button></div>`;
        $('#retry-connect').addEventListener('click', () => showLogin(message));
        return;
      }
    }
    const withGoogle = authConfig.methods.includes('google') && authConfig.google_client_id;
    const withPassword = authConfig.methods.includes('password');
    const registering = mode === 'register' && withPassword && authConfig.registration;
    view.innerHTML = `<div class="card login">
      ${withPassword && authConfig.registration ? `<div class="login-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="${!registering}" data-mode="login">${t('Entrar')}</button>
        <button type="button" role="tab" aria-selected="${registering}" data-mode="register">${t('Crear cuenta')}</button>
      </div>` : `<h2>${t('Entrar')}</h2>`}
      <p class="small muted">${registering
        ? t('Crea tu cuenta: tendrás tu propia libreta, privada, guardada en el servidor.')
        : t('Entra para ver y guardar tu libreta.')}</p>
      ${message ? `<p class="small neg">${esc(message)}</p>` : ''}
      ${withGoogle && !registering ? `<div id="google-btn" class="google-btn"><span class="small muted">${t('Cargando el acceso con Google…')}</span></div>` : ''}
      ${withGoogle && withPassword && !registering ? `<p class="login-or small muted">${t('o con usuario y contraseña')}</p>` : ''}
      ${withPassword ? `<form id="login-form" novalidate>
        <div class="form-grid" style="grid-template-columns:1fr">
          <div class="field"><label for="login-user">${t('Usuario')}</label>
            <input id="login-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required>
            ${registering ? `<span class="hint">${t('Entre 2 y 50 letras, números, puntos o guiones, sin espacios.')}</span>` : ''}</div>
          <div class="field"><label for="login-pass">${t('Contraseña')}</label>
            <input id="login-pass" name="password" type="password" autocomplete="${registering ? 'new-password' : 'current-password'}" required>
            ${registering ? `<span class="hint">${t('Mínimo 8 caracteres.')}</span>` : ''}</div>
          ${registering ? `<div class="field"><label for="login-pass2">${t('Repite la contraseña')}</label>
            <input id="login-pass2" type="password" autocomplete="new-password" required></div>
          ${authConfig.registration_code ? `<div class="field"><label for="login-code">${t('Código de invitación')}</label>
            <input id="login-code" autocomplete="off" autocapitalize="none" spellcheck="false" required>
            <span class="hint">${t('Te lo da quien administra este servidor.')}</span></div>` : ''}` : ''}
        </div>
        <button class="btn${withGoogle && !registering ? '' : ' primary'}" type="submit" style="margin-top:12px">${registering ? t('Crear cuenta y entrar') : t('Entrar')}</button>
      </form>` : ''}
      <p class="small neg" id="login-error" hidden></p>
      <p class="small muted login-legal">${registering
        ? t('Al crear la cuenta aceptas las <a href="condiciones.html" target="_blank" rel="noopener">condiciones de uso</a> y la <a href="privacidad.html" target="_blank" rel="noopener">información de privacidad</a>.')
        : t('Consulta las <a href="condiciones.html" target="_blank" rel="noopener">condiciones de uso</a> y la <a href="privacidad.html" target="_blank" rel="noopener">información de privacidad</a>.')}</p>
      <div class="login-lang">${field(t('Idioma'), langSelect('login-lang'))}</div>
    </div>`;
    $$('[data-mode]', view).forEach((b) => b.addEventListener('click', () => showLogin('', b.dataset.mode)));
    $('#login-lang').addEventListener('change', (e) => { changeLang(e.target.value); showLogin('', mode); });
    const showError = (msg) => { const el = $('#login-error'); el.textContent = t(msg); el.hidden = false; };

    if (withGoogle && !registering) {
      loadGoogleScript().then((google) => {
        const box = $('#google-btn');
        if (!box) return;
        box.innerHTML = '';
        google.accounts.id.initialize({
          client_id: authConfig.google_client_id,
          ux_mode: 'popup',
          callback: async (resp) => {
            $('#login-error').hidden = true;
            try {
              const r = await window.Remote.loginGoogle(resp.credential);
              await afterLogin(r);
            } catch (e) { showError(e.message); }
          },
        });
        const dark = document.documentElement.dataset.theme === 'dark'
          || (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
        google.accounts.id.renderButton(box, { theme: dark ? 'filled_black' : 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: window.I18n.lang(), width: 280 });
      }).catch((e) => {
        const box = $('#google-btn');
        if (box) box.innerHTML = `<span class="small neg">${esc(t(e.message))}</span>`;
      });
    }

    if (withPassword) {
      const form = $('#login-form');
      if (!withGoogle) $('#login-user').focus();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('button[type="submit"]', form);
        btn.disabled = true;
        $('#login-error').hidden = true;
        try {
          const user = $('#login-user').value.trim();
          const pass = $('#login-pass').value;
          let r;
          if (registering) {
            if (pass !== $('#login-pass2').value) throw new Error(t('Las dos contraseñas no coinciden.'));
            r = await window.Remote.register(user, pass, $('#login-code') ? $('#login-code').value.trim() : '');
            toast(t('Cuenta «{user}» creada. ¡Bienvenido/a a tu libreta!', { user: r.username }), 5000);
          } else {
            r = await window.Remote.login(user, pass);
          }
          await afterLogin(r);
        } catch (ex) {
          showError(ex.message);
          btn.disabled = false;
        }
      });
    }
  }

  async function loadFromServer() {
    const r = await window.Remote.load();
    $('.tabs').hidden = false;
    if (!r.data) {
      sync.version = r.version;
      showFirstRun();
      return;
    }
    applyRemote(r);
  }

  /** Base de datos vacía: elegir con qué datos empezar. */
  function showFirstRun() {
    sync.ready = false;
    updateSyncBadge();
    const local = window.Store.load();
    const localCount = local.filaments.length + local.materials.length + local.prints.length + local.sales.length + local.expenses.length;
    const hasLocal = localCount > 0 && !local.demo;
    view.innerHTML = `<div class="card">
      <h2>${t('Tu libreta está vacía')}</h2>
      <p>${t('¿Con qué datos quieres empezar? Lo que elijas se guardará en tu libreta del servidor; solo tú podrás verla.')}</p>
      <div class="filters">
        ${hasLocal ? `<button class="btn primary" data-first="local">${t('Subir los datos de este navegador ({n} registros)', { n: localCount })}</button>` : ''}
        <button class="btn${hasLocal ? '' : ' primary'}" data-first="paste">${t('Pegar una copia en texto')}</button>
        <button class="btn" data-first="empty">${t('Empezar vacío')}</button>
        <button class="btn" data-first="demo">${t('Datos de ejemplo')}</button>
      </div>
      <p class="small muted">${t('¿Tienes tus datos en otro sitio (otro navegador o el enlace de Claude)? Allí, en Ajustes → «Copia en texto», cópialos y pégalos aquí.')}</p>
    </div>`;
    const start = (state, msg) => { S = state; sync.replaceAll = true; persist(msg); };
    $$('[data-first]', view).forEach((btn) => btn.addEventListener('click', () => {
      const kind = btn.dataset.first;
      if (kind === 'local') start({ ...local, demo: false }, t('Datos subidos al servidor'));
      if (kind === 'empty') start(window.Store.emptyState(), t('Listo: empieza añadiendo tus máquinas y materiales'));
      if (kind === 'demo') start(demoData(), t('Datos de ejemplo cargados'));
      if (kind === 'paste') backupTextForm();
    }));
  }

  async function historyForm() {
    let r;
    try { r = await window.Remote.history(); } catch (e) { toast(t(e.message), 5000); return; }
    openModal({
      title: t('Historial de versiones'),
      submitLabel: t('Cerrar'),
      hideCancel: true,
      body: `<p class="small muted">${t('Cada vez que alguien guarda se crea una versión. Si algo se ha borrado o estropeado, restaura una anterior: se guardará como versión nueva y la actual seguirá en el historial.')}</p>
        ${r.versions.length ? `<div class="table-wrap"><table>
          <thead><tr><th class="num">${t('Versión')}</th><th>${t('Fecha')}</th><th>${t('Usuario')}</th><th class="num">${t('Tamaño')}</th><th></th></tr></thead>
          <tbody>${r.versions.map((v) => `<tr><td class="num">${v.version}</td><td class="nowrap">${esc(fmtDateTime(v.saved_at))}</td><td>${esc(v.saved_by)}</td>
            <td class="num">${fmtNum(v.bytes / 1024, 1)} KB</td>
            <td class="actions">${v.version === sync.version ? `<span class="badge ok">${t('Actual')}</span>` : `<button type="button" class="btn small" data-restore="${v.version}">${t('Restaurar')}</button>`}</td></tr>`).join('')}</tbody>
        </table></div>` : `<p class="muted">${t('Todavía no hay versiones guardadas.')}</p>`}`,
      onOpen: (b) => {
        $$('[data-restore]', b).forEach((btn) => btn.addEventListener('click', async () => {
          try {
            const h = await window.Remote.historyGet(btn.dataset.restore);
            askConfirm(t('¿Restaurar la versión {n} ({date}, {user})?\nSe guardará como una versión nueva; la actual seguirá en el historial.', { n: h.version, date: fmtDateTime(h.saved_at), user: h.saved_by }), () => {
              S = window.Store.normalize(h.data);
              sync.replaceAll = true;
              persist(t('Versión {n} restaurada', { n: h.version }));
            }, t('Restaurar'));
          } catch (e) { toast(t(e.message), 5000); }
        }));
      },
      onSubmit: () => {},
    });
  }

  /** Sin conexión al abrir la app: se trabaja con la copia del dispositivo de la última cuenta usada. */
  function startOffline() {
    let username = '';
    try { username = localStorage.getItem(LAST_USER) || ''; } catch (e) { /* nada */ }
    const cache = readCache(username);
    if (!cache) return false;
    Object.assign(sync, { user: cache.user, email: cache.email || '', username, offline: true });
    useCache(cache);
    toast(t('Sin conexión: trabajas con la copia de este dispositivo. Se sincronizará sola al volver la conexión.'), 6000);
    return true;
  }

  async function startRemote() {
    view.innerHTML = `<div class="empty">${t('Conectando con el servidor…')}</div>`;
    updateSyncBadge();
    try {
      const me = await window.Remote.me();
      Object.assign(sync, { user: me.user, email: me.email || '', username: me.username || me.user });
      const cache = readCache(sync.username);
      if (cache && cache.pending) {
        useCache(cache);
        queueSave(t('Cambios hechos sin conexión sincronizados'));
        return;
      }
      await loadFromServer();
    } catch (e) {
      if (e.status === 401) { showLogin(); return; }
      if (e.status === 0 && startOffline()) return;
      view.innerHTML = `<div class="card"><h2>${t('No se pudo conectar con el servidor')}</h2><p class="small">${esc(t(e.message))}</p>
        <button class="btn primary" id="retry-connect">${t('Reintentar')}</button></div>`;
      $('#retry-connect').addEventListener('click', startRemote);
    }
  }

  if (remote) {
    setInterval(pollRemote, 15000);
    document.addEventListener('visibilitychange', pollRemote);
    window.addEventListener('focus', pollRemote);
    window.addEventListener('online', () => setTimeout(pollRemote, 500));
    window.addEventListener('offline', () => { sync.offline = true; updateSyncBadge(); });
    modal.addEventListener('close', () => setTimeout(pollRemote, 300));
    window.addEventListener('beforeunload', (e) => {
      if (sync.pending || sync.saving) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ================================================================ ENRUTADO Y EVENTOS

  const VIEWS = { dashboard: viewDashboard, filaments: viewFilaments, materials: viewMaterials, components: viewComponents, printers: viewPrinters, prints: viewPrints, sales: viewSales, expenses: viewExpenses, settings: viewSettings };
  const currentView = () => { const v = location.hash.slice(1); return VIEWS[v] ? v : 'dashboard'; };

  function render() {
    if (remote && !sync.ready) return; // pantalla de acceso o de primera carga
    const v = currentView();
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    view.innerHTML = (S.demo ? `<div class="demo-banner" role="note"><span>${t('<b>Datos de ejemplo.</b> Explora la app con libertad; cuando quieras, empieza con los tuyos.')}</span>
      <button class="btn small" data-action="start-fresh">${t('Empezar con mis datos')}</button></div>` : '') + VIEWS[v]();
    wireChart();
    if (v === 'settings') wireSettings();
  }

  // ---------------------------------------------------------------- idioma

  const langSelect = (id) => `<select id="${id}" aria-label="${t('Idioma')}">${Object.entries(window.I18n.LANGS)
    .map(([k, v]) => `<option value="${k}" lang="${k}"${k === window.I18n.lang() ? ' selected' : ''}>${v}</option>`).join('')}</select>`;

  /** Textos fijos de index.html (pestañas, botones del diálogo…): llevan el español en data-i18n. */
  function translateStatic() {
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
  }

  function changeLang(code) {
    window.I18n.setLang(code);
    translateStatic();
    updateSyncBadge();
  }

  function wireSettings() {
    $('#settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      Object.keys(window.Store.DEFAULT_SETTINGS).forEach((k) => {
        if (!fd.has(k)) return;
        S.settings[k] = k === 'currency' ? fd.get(k) : num(fd.get(k));
      });
      persist(t('Ajustes guardados'));
    });
    $('#theme-select').addEventListener('change', (e) => { safeSet('daprintbox:theme', e.target.value); applyTheme(); });
    $('#lang-select').addEventListener('change', (e) => { changeLang(e.target.value); render(); });
    $('#import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then((txt) => {
        const data = JSON.parse(txt);
        if (!data || !Array.isArray(data.filaments)) throw new Error('formato');
        askConfirm(t('Esto reemplazará todos los datos actuales por los de la copia. ¿Continuar?'), () => {
          S = window.Store.normalize(data);
          sync.replaceAll = true;
          persist(t('Copia importada'));
        }, t('Importar'));
      }).catch(() => toast(t('El archivo no es una copia válida de Libreta Maker.')));
      e.target.value = '';
    });
  }

  const find = (arr, id) => arr.find((x) => x.id === id);

  const actions = {
    'new-filament': () => filamentForm(),
    'new-material': () => materialForm(),
    'edit-material': (id) => materialForm(find(S.materials, id)),
    'restock-material': (id) => restockMaterialForm(find(S.materials, id)),
    'delete-material': (id) => {
      const m = find(S.materials, id);
      askConfirm(t('¿Eliminar «{name}»? Los trabajos que lo usan conservan su coste.', { name: materialLabel(m) }), () => {
        S.materials = S.materials.filter((x) => x.id !== id);
        persist(t('Material eliminado'));
      });
    },
    'new-component': () => componentForm(),
    'edit-component': (id) => componentForm(find(S.components, id)),
    'restock-component': (id) => restockComponentForm(find(S.components, id)),
    'delete-component': (id) => {
      const c = find(S.components, id);
      askConfirm(t('¿Eliminar «{name}»? Los trabajos que lo usan conservan su coste.', { name: c.name }), () => {
        S.components = S.components.filter((x) => x.id !== id);
        persist(t('Componente eliminado'));
      });
    },
    'edit-filament': (id) => filamentForm(find(S.filaments, id)),
    'restock': (id) => restockForm(find(S.filaments, id)),
    'delete-filament': (id) => {
      const f = find(S.filaments, id);
      askConfirm(t('¿Eliminar «{name}»? Los trabajos y gastos registrados se conservan.', { name: f.name }), () => {
        S.filaments = S.filaments.filter((x) => x.id !== id);
        persist(isResin(f) ? t('Resina eliminada') : t('Filamento eliminado'));
      });
    },
    'new-printer': () => printerForm(),
    'edit-printer': (id) => printerForm(findPrinter(id)),
    'default-printer': (id) => { S.settings.defaultPrinterId = id; persist(t('Máquina predeterminada cambiada')); },
    'delete-printer': (id) => {
      const pr = findPrinter(id);
      const jobs = S.prints.filter((p) => p.printerId === id).length;
      askConfirm(t('¿Eliminar «{name}»?', { name: pr.name }) + (jobs ? '\n' + t('Sus {n} trabajo(s) conservan el coste ya calculado.', { n: jobs }) : ''), () => {
        S.printers = S.printers.filter((x) => x.id !== id);
        if (S.settings.defaultPrinterId === id) S.settings.defaultPrinterId = S.printers[0] ? S.printers[0].id : '';
        persist(t('Máquina eliminada'));
      });
    },
    'new-print': () => printForm(),
    'quote': () => printForm(null, { quoteOnly: true }),
    'edit-print': (id) => printForm(find(S.prints, id)),
    'delete-print': (id) => {
      const p = find(S.prints, id);
      const linked = S.sales.filter((s) => s.printId === id).length;
      const msg = t('¿Eliminar el trabajo «{name}»?', { name: p.name }) + (p.stockDeducted ? '\n' + t('El material y los componentes usados se devolverán al stock.') : '') + (linked ? '\n' + t('Tiene {n} venta(s) asociada(s): se conservarán como ventas libres.', { n: linked }) : '');
      askConfirm(msg, () => {
        if (p.stockDeducted) applyJobStock(p, +1);
        S.sales.forEach((s) => { if (s.printId === id) { s.printId = null; s.costFromPrint = false; } });
        S.prints = S.prints.filter((x) => x.id !== id);
        persist(t('Trabajo eliminado'));
      });
    },
    'sell-print': (id) => saleForm(null, id),
    'new-sale': () => saleForm(),
    'edit-sale': (id) => saleForm(find(S.sales, id)),
    'delete-sale': (id) => {
      askConfirm(t('¿Eliminar esta venta?'), () => {
        S.sales = S.sales.filter((x) => x.id !== id);
        persist(t('Venta eliminada'));
      });
    },
    'new-expense': () => expenseForm(),
    'edit-expense': (id) => expenseForm(find(S.expenses, id)),
    'delete-expense': (id) => {
      askConfirm(t('¿Eliminar este gasto?'), () => {
        S.expenses = S.expenses.filter((x) => x.id !== id);
        persist(t('Gasto eliminado'));
      });
    },
    'export-json': () => download(`libreta-maker-copia-${today()}.json`, JSON.stringify(S, null, 2), 'application/json'),
    'import-json': () => $('#import-file').click(),
    'export-csv': (id, el) => exportCSV(el.dataset.kind),
    'load-demo': () => {
      const hasData = S.printers.length || S.materials.length || S.components.length || S.filaments.length || S.prints.length || S.sales.length || S.expenses.length;
      const load = () => { S = demoData(); sync.replaceAll = true; persist(t('Datos de ejemplo cargados')); };
      if (hasData && !S.demo) askConfirm(t('Los datos de ejemplo reemplazarán tus datos actuales. ¿Continuar?'), load, t('Cargar ejemplo'));
      else load();
    },
    'reset': () => {
      askConfirm(t('¿Borrar TODOS los datos? Esta acción no se puede deshacer (guarda una copia antes).'), () => {
        S = window.Store.emptyState();
        sync.replaceAll = true;
        persist(t('Datos borrados'));
      }, t('Borrar todo'));
    },
    'start-fresh': () => {
      askConfirm(t('Se borrarán los datos de ejemplo para que empieces con los tuyos.'), () => {
        S = window.Store.emptyState();
        location.hash = 'dashboard';
        sync.replaceAll = true;
        persist(t('Listo: empieza añadiendo tus máquinas y materiales'));
      }, t('Empezar desde cero'));
    },
    'backup-text': () => backupTextForm(),
    'install-app': async () => {
      if (!pwa.prompt) return;
      pwa.prompt.prompt();
      try { await pwa.prompt.userChoice; } catch (e) { /* cancelado */ }
      pwa.prompt = null;
      render();
    },
    'history': () => historyForm(),
    'change-password': () => openModal({
      title: t('Cambiar contraseña'),
      submitLabel: t('Cambiar contraseña'),
      body: `<div class="form-grid" style="grid-template-columns:1fr">
        ${field(t('Contraseña actual'), '<input type="password" name="current" autocomplete="current-password" required>')}
        ${field(t('Contraseña nueva'), '<input type="password" name="password" autocomplete="new-password" minlength="8" required>', { hint: t('Mínimo 8 caracteres.') })}
        ${field(t('Repite la contraseña nueva'), '<input type="password" name="password2" autocomplete="new-password" required>')}
      </div>`,
      onSubmit: (b) => {
        const cur = $('[name="current"]', b).value, pw = $('[name="password"]', b).value;
        if (pw !== $('[name="password2"]', b).value) { toast(t('Las dos contraseñas nuevas no coinciden.')); return false; }
        if (pw.length < 8) { toast(t('La contraseña nueva debe tener al menos 8 caracteres.')); return false; }
        window.Remote.changePassword(cur, pw)
          .then(() => { modal.close(); toast(t('Contraseña cambiada')); })
          .catch((e) => toast(t(e.message), 5000));
        return false;
      },
    }),
    'logout': async () => {
      if (sync.pending || sync.saving) {
        toast(sync.offline ? t('Tienes cambios sin sincronizar: conéctate a internet antes de cerrar sesión.') : t('Espera a que se guarden los cambios antes de salir.'), 5000);
        return;
      }
      clearCache(sync.username);
      try { await window.Remote.logout(); } catch (e) { /* la sesión ya no existe */ }
      if (window.google && window.google.accounts) window.google.accounts.id.disableAutoSelect();
      Object.assign(sync, { user: null, username: '', email: '', ready: false, version: 0, base: null, offline: false });
      S = window.Store.emptyState();
      showLogin();
    },
  };

  view.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el.dataset.id, el);
  });
  view.addEventListener('change', (e) => {
    const p = e.target.dataset.period;
    if (p) { ui[p] = e.target.value; render(); }
  });
  view.addEventListener('input', (e) => {
    const k = e.target.dataset.filter;
    if (!k) return;
    ui[k] = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const again = $(`[data-filter="${k}"]`);
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  });

  $$('.tabs button').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.view; }));
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

  applyTheme();
  translateStatic();
  if (remote) {

    startRemote();
  } else {
    // Primera visita: se abre con datos de ejemplo para ver la app funcionando.
    if (!safeGet('daprintbox:v1')) {
      S = demoData();
      window.Store.save(S);
    }
    render();
  }
})();
