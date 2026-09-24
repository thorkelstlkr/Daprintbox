/*
 * Daprintbox — interfaz: vistas, formularios y gráfico.
 */
(function () {
  'use strict';

  const { num, printCost, costPerGram, gramsByFilament, soldByPrint, saleTotals, summary, lastMonths, monthlySeries } = window.Calc;
  const { uid, today } = window.Store;

  let S = window.Store.load();
  const ui = { kind: 'all', period: 'month', salesPeriod: 'all', expensesPeriod: 'all', filamentQuery: '' };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const view = $('#view');

  // ---------------------------------------------------------------- formato

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function money(v) {
    try {
      return new Intl.NumberFormat('es-ES', { style: 'currency', currency: S.settings.currency || 'EUR' }).format(num(v));
    } catch (e) {
      return num(v).toFixed(2) + ' ' + (S.settings.currency || '');
    }
  }
  const moneySigned = (v) => `<span class="${v < 0 ? 'neg' : v > 0 ? 'pos' : ''}">${money(v)}</span>`;
  const fmtNum = (v, d = 0) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(num(v));
  const fmtGrams = (g) => (Math.abs(num(g)) >= 1000 ? fmtNum(num(g) / 1000, 2) + ' kg' : fmtNum(g) + ' g');
  const fmtDateTime = (dt) => {
    const d = new Date(String(dt).replace(' ', 'T'));
    return isNaN(d) ? String(dt) : d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
  const fmtHours = (h) => {
    const total = Math.round(num(h) * 60);
    return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')} min`;
  };
  const monthLabel = (ym, withYear) => {
    const d = new Date(ym + '-01T00:00:00');
    return d.toLocaleDateString('es-ES', withYear ? { month: 'short', year: 'numeric' } : { month: 'short' }).replace('.', '');
  };

  const filamentsById = () => Object.fromEntries(S.filaments.map((f) => [f.id, f]));
  const findPrinter = (id) => S.printers.find((x) => x.id === id);
  const componentsById = () => Object.fromEntries(S.components.map((c) => [c.id, c]));
  const materialsById = () => Object.fromEntries(S.materials.map((m) => [m.id, m]));
  const { sheetCostPerCm2, sheetsUsed } = window.Calc;
  const matLow = (m) => num(m.stock) <= (m.lowStock === '' || m.lowStock == null ? 0 : num(m.lowStock));
  const fmtSheets = (n) => `${fmtNum(n, 2)} ${Math.abs(num(n) - 1) < 1e-9 ? 'plancha' : 'planchas'}`;
  const materialLabel = (m) => `${m.name}${m.thickness ? ' ' + fmtNum(m.thickness, 1) + ' mm' : ''}`;

  // Tipos de trabajo y de máquina
  const KINDS = { '3d': 'Impresión 3D', laser: 'Corte y grabado láser', sello: 'Sello personalizado' };
  const KIND_SHORT = { '3d': '3D', laser: 'Láser', sello: 'Sello', otros: 'Otras ventas' };
  const MACHINE_TYPES = { '3d': 'Impresora 3D', laser: 'Láser', insoladora: 'Insoladora', otra: 'Otra' };
  const machineType = (m) => (m && m.type) || '3d';
  const machineForKind = (kind) => ({ '3d': '3d', laser: 'laser', sello: 'insoladora' }[kind] || '3d');
  const kindForMachine = (m) => ({ laser: 'laser', insoladora: 'sello' }[machineType(m)] || '3d');
  // Materiales típicos de un sello de fotopolímero: la plancha y el negativo (fotolito)
  const isPhotopolymer = (m) => /fotopol/i.test(`${m.category} ${m.name}`);
  const isNegative = (m) => /fotolito|negativo|acetato/i.test(`${m.category} ${m.name}`);
  const { componentUnitCost, componentsUsed } = window.Calc;
  const compLow = (c) => num(c.stock) <= (c.lowStock === '' || c.lowStock == null ? 0 : num(c.lowStock));
  const fmtQty = (q, unit) => `${fmtNum(q, 2)} ${unit || 'ud.'}`;
  const defaultPrinter = () => findPrinter(S.settings.defaultPrinterId) || S.printers[0];
  const printerHourCost = (pr) => window.Calc.printerHourCost(S.settings, pr);
  const filamentLabel = (f) => `${f.name}${f.material ? ' · ' + f.material : ''}`;
  const lowThreshold = (f) => (f.lowStock === '' || f.lowStock == null ? num(S.settings.lowStockGrams) : num(f.lowStock));
  const isLow = (f) => num(f.remaining) <= lowThreshold(f);

  // ---------------------------------------------------------------- periodos

  const PERIODS = {
    month: 'Este mes',
    prevMonth: 'Mes anterior',
    year: 'Este año',
    last12: 'Últimos 12 meses',
    all: 'Todo',
  };

  function periodRange(key) {
    const t = today();
    const [y, m] = t.split('-').map(Number);
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
      case 'last12': return [lastMonths(t.slice(0, 7), 12)[0] + '-01', t];
      default: return [null, null];
    }
  }
  const inPeriod = (date, key) => {
    const [from, to] = periodRange(key);
    return (!from || date >= from) && (!to || date <= to);
  };
  const periodSelect = (name, value) =>
    `<select data-period="${name}" aria-label="Periodo">${Object.entries(PERIODS)
      .map(([k, v]) => `<option value="${k}"${k === value ? ' selected' : ''}>${v}</option>`).join('')}</select>`;

  // ---------------------------------------------------------------- persistencia

  // Modo servidor: los datos se guardan en MySQL a través de api/api.php (ver js/config.js)
  const remote = !!(window.Remote && window.Remote.enabled);
  const sync = { ready: false, user: null, email: '', version: 0, pending: false, saving: false, error: '', updatedBy: '', updatedAt: '' };

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
      toast('Daprintbox instalada');
      if (currentView() === 'settings') render();
    });
  }

  function persist(msg) {
    if (remote) {
      sync.ready = true;
      render();
      queueSave(msg);
      return;
    }
    if (!window.Store.save(S)) toast('No se pudo guardar en este navegador. Exporta una copia desde Ajustes.');
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

  function openModal({ title, body, submitLabel = 'Guardar', onOpen, onSubmit, hideCancel = false }) {
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
      toast('Completa los campos obligatorios.');
      return;
    }
    if (modalSubmit && modalSubmit(body) === false) return;
    modal.close();
  });
  $$('[data-close]', modal).forEach((b) => b.addEventListener('click', () => modal.close()));

  /** Confirmación dentro de la página (no depende de window.confirm, que algunos visores bloquean). */
  function askConfirm(message, onYes, yesLabel = 'Eliminar') {
    openModal({
      title: 'Confirmar',
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
    const stockGrams = S.filaments.reduce((s, f) => s + Math.max(0, num(f.remaining)), 0);
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
      const key = s.description || 'Sin nombre';
      const t = saleTotals(s);
      byPiece[key] = byPiece[key] || { name: key, units: 0, revenue: 0, profit: 0 };
      byPiece[key].units += num(s.quantity);
      byPiece[key].revenue += t.revenue;
      byPiece[key].profit += t.profit;
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
        <h1>Resumen</h1>
        <div class="filters">${periodSelect('period', ui.period)}</div>
      </div>
      ${empty ? `<div class="card"><h2>Bienvenido 👋</h2>
        <p>Empieza añadiendo tus <b>máquinas</b> (impresoras 3D, láser, insoladora) y tus <b>materiales</b> (filamento, planchas, componentes), registra cada <b>trabajo</b> —impresión 3D, corte o grabado láser, sello— para calcular su coste y descontar el material, y apunta tus <b>ventas</b> para ver tu beneficio real.</p>
        <div class="filters"><button class="btn primary" data-action="new-printer">Añadir máquina</button>
        <button class="btn" data-action="new-filament">Añadir filamento</button>
        <button class="btn" data-action="load-demo">Cargar datos de ejemplo</button></div></div>` : ''}
      <div class="kpis">
        <div class="kpi"><div class="label">Ingresos por ventas</div><div class="value">${money(r.revenue)}</div>
          <div class="sub">${r.salesCount} ${r.salesCount === 1 ? 'venta' : 'ventas'} · ${fmtNum(r.units)} uds.</div></div>
        <div class="kpi"><div class="label">Beneficio de las ventas</div><div class="value">${moneySigned(r.salesProfit)}</div>
          <div class="sub">Margen ${fmtNum(r.marginPct, 1)} % · tras coste y comisiones</div></div>
        <div class="kpi"><div class="label">Gastos pagados</div><div class="value">${money(r.totalSpend)}</div>
          <div class="sub">Filamento ${money(r.filamentSpend)} · otros ${money(r.otherSpend)}</div></div>
        <div class="kpi"><div class="label">Resultado de caja</div><div class="value">${moneySigned(r.cashResult)}</div>
          <div class="sub">Ingresos − comisiones − gastos</div></div>
        <div class="kpi"><div class="label">Stock de filamento y material</div><div class="value">${fmtGrams(stockGrams)}</div>
          <div class="sub">Valor ${money(stockValue)} · ${S.filaments.length} bobinas${S.materials.length ? ` · planchas ${money(matValue)}` : ''}${S.components.length ? ` · componentes ${money(compValue)}` : ''}</div></div>
      </div>

      <div class="card">
        <h2>Ingresos vs. gastos · últimos 12 meses</h2>
        ${barChart(series)}
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h2>Stock bajo</h2>
          ${low.length || lowComps.length || lowMats.length ? `<ul class="alert-list">${low.map((f) => `
            <li><span><span class="swatch" style="background:${esc(f.color || '#999')}"></span>${esc(filamentLabel(f))}</span>
              <span class="nowrap"><span class="badge low">⚠ ${fmtGrams(f.remaining)}</span>
              <button class="btn small" data-action="restock" data-id="${f.id}">Reponer</button></span></li>`).join('')}${lowComps.map((c) => `
            <li><span>🔩 ${esc(c.name)}</span>
              <span class="nowrap"><span class="badge low">⚠ ${fmtQty(c.stock, c.unit)}</span>
              <button class="btn small" data-action="restock-component" data-id="${c.id}">Reponer</button></span></li>`).join('')}${lowMats.map((m) => `
            <li><span>▭ ${esc(materialLabel(m))}</span>
              <span class="nowrap"><span class="badge low">⚠ ${fmtSheets(m.stock)}</span>
              <button class="btn small" data-action="restock-material" data-id="${m.id}">Reponer</button></span></li>`).join('')}</ul>`
            : `<p class="muted">✓ Filamentos, planchas y componentes por encima del mínimo.</p>`}
        </div>
        <div class="card">
          <h2>Piezas más rentables · ${PERIODS[ui.period].toLowerCase()}</h2>
          ${top.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Pieza</th><th class="num">Uds.</th><th class="num">Ingresos</th><th class="num">Beneficio</th></tr></thead>
            <tbody>${top.map((t) => `<tr><td>${esc(t.name)}</td><td class="num">${fmtNum(t.units)}</td><td class="num">${money(t.revenue)}</td><td class="num">${moneySigned(t.profit)}</td></tr>`).join('')}</tbody>
          </table></div>` : `<p class="muted">Sin ventas en este periodo.</p>`}
        </div>
      </div>

      <div class="card">
        <h2>Por línea de negocio · ${PERIODS[ui.period].toLowerCase()}</h2>
        ${kindRows.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Línea</th><th class="num">Trabajos</th><th class="num">Uds. fabricadas</th><th class="num">Ingresos</th><th class="num">Beneficio</th><th class="num">Margen</th></tr></thead>
          <tbody>${kindRows.map((k) => { const r = kinds[k]; return `<tr><td><span class="badge kind-${k}">${esc(KIND_SHORT[k])}</span></td>
            <td class="num">${k === 'otros' ? '—' : fmtNum(r.jobs)}</td><td class="num">${k === 'otros' ? '—' : fmtNum(r.units)}</td>
            <td class="num">${money(r.revenue)}</td><td class="num">${moneySigned(r.profit)}</td>
            <td class="num">${r.revenue > 0 ? fmtNum((r.profit / r.revenue) * 100) + ' %' : '—'}</td></tr>`; }).join('')}</tbody>
        </table></div>` : `<p class="muted">Sin trabajos ni ventas en este periodo.</p>`}
      </div>

      <div class="card">
        <h2>Piezas fabricadas pendientes de vender</h2>
        ${unsold.length ? `<p class="small muted">${fmtNum(unsold.reduce((s, x) => s + x.left, 0))} unidades · coste inmovilizado ${money(unsoldValue)}</p>
          <div class="table-wrap"><table>
          <thead><tr><th>Pieza</th><th>Fecha</th><th class="num">Disponibles</th><th class="num">Coste ud.</th><th class="num">Precio sugerido</th><th></th></tr></thead>
          <tbody>${unsold.map(({ p, left }) => `<tr><td>${esc(p.name)}</td><td class="nowrap">${fmtDate(p.date)}</td><td class="num">${fmtNum(left)}</td>
            <td class="num">${money(p.cost && p.cost.unit)}</td><td class="num">${money(p.cost && p.cost.suggestedUnitPrice)}</td>
            <td class="actions"><button class="btn small" data-action="sell-print" data-id="${p.id}">Vender</button></td></tr>`).join('')}</tbody>
          </table></div>` : `<p class="muted">No hay piezas en inventario.</p>`}
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
      <div class="legend"><span><i style="background:var(--series-1)"></i>Ingresos netos</span><span><i style="background:var(--series-2)"></i>Gastos pagados</span></div>
      <div class="chart-scroll"><div class="chart" data-series='${esc(JSON.stringify(series))}'>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos por mes de los últimos 12 meses">${grid}${groups}</svg>
        <div class="tooltip"></div>
      </div></div>
      <details class="table-view"><summary>Ver como tabla</summary>
        <div class="table-wrap"><table>
          <thead><tr><th>Mes</th><th class="num">Ingresos netos</th><th class="num">Gastos</th><th class="num">Resultado</th></tr></thead>
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
            <div class="row"><span><i class="swatch" style="background:var(--series-1);border-radius:3px"></i>Ingresos</span><b>${money(d.income)}</b></div>
            <div class="row"><span><i class="swatch" style="background:var(--series-2);border-radius:3px"></i>Gastos</span><b>${money(d.spend)}</b></div>
            <div class="row"><span>Resultado</span><b>${moneySigned(d.result)}</b></div>`;
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

  const MATERIALS = ['PLA', 'PLA+', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'PC', 'PVA', 'HIPS', 'CF-PLA', 'Silk PLA', 'Resina'];

  function viewFilaments() {
    const q = ui.filamentQuery.toLowerCase();
    const list = S.filaments
      .filter((f) => !q || [f.name, f.material, f.brand, f.colorName].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (a.material || '').localeCompare(b.material || '') || a.name.localeCompare(b.name));
    const totalG = list.reduce((s, f) => s + Math.max(0, num(f.remaining)), 0);
    const totalV = list.reduce((s, f) => s + Math.max(0, num(f.remaining)) * costPerGram(f), 0);

    return `
      <div class="page-head">
        <h1>Filamentos</h1>
        <div class="actions">
          <input type="search" placeholder="Buscar…" data-filter="filamentQuery" value="${esc(ui.filamentQuery)}" aria-label="Buscar filamento">
          <button class="btn primary" data-action="new-filament">+ Nuevo filamento</button>
        </div>
      </div>
      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Filamento</th><th>Marca</th><th class="num">Precio bobina</th><th class="num">€/kg</th><th>Stock</th><th class="num">Valor</th><th></th></tr></thead>
          <tbody>${list.map((f) => {
            const pct = num(f.spoolWeight) > 0 ? Math.max(0, Math.min(100, (num(f.remaining) / num(f.spoolWeight)) * 100)) : 0;
            const low = isLow(f);
            return `<tr>
              <td><span class="swatch" style="background:${esc(f.color || '#999')}"></span><b>${esc(f.name)}</b>
                <div class="small muted">${esc([f.material, f.colorName, f.diameter ? f.diameter + ' mm' : ''].filter(Boolean).join(' · '))}</div></td>
              <td>${esc(f.brand || '')}</td>
              <td class="num">${money(f.price)}<div class="small muted">${fmtGrams(f.spoolWeight)}</div></td>
              <td class="num">${money(costPerGram(f) * 1000)}</td>
              <td><div class="stock"><div class="stock-bar${low ? ' low' : ''}"><span style="width:${pct}%"></span></div>
                <span class="nowrap small">${fmtGrams(f.remaining)}</span></div>
                ${low ? `<span class="badge low">⚠ Stock bajo</span>` : ''}</td>
              <td class="num">${money(Math.max(0, num(f.remaining)) * costPerGram(f))}</td>
              <td class="actions">
                <button class="btn small" data-action="restock" data-id="${f.id}">Reponer</button>
                <button class="icon-btn" data-action="edit-filament" data-id="${f.id}" aria-label="Editar" title="Editar / ajustar stock">✎</button>
                <button class="icon-btn" data-action="delete-filament" data-id="${f.id}" aria-label="Eliminar" title="Eliminar">🗑</button>
              </td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td colspan="4">Total</td><td>${fmtGrams(totalG)}</td><td class="num">${money(totalV)}</td><td></td></tr></tfoot>
        </table></div>` : `<div class="empty">${S.filaments.length ? 'Ningún filamento coincide con la búsqueda.' : 'Aún no tienes filamentos. Añade tu primera bobina.'}</div>`}
      </div>`;
  }

  function filamentForm(f) {
    const isNew = !f;
    f = f || { name: '', material: 'PLA', color: '#3987e5', colorName: '', brand: '', diameter: '1.75', spoolWeight: 1000, price: 20, remaining: '', lowStock: '' };
    openModal({
      title: isNew ? 'Nuevo filamento' : 'Editar filamento',
      body: `<div class="form-grid">
        ${field('Nombre *', inp('name', f.name, 'required placeholder="Ej. PLA Negro mate"'), { wide: true })}
        ${field('Material', inp('material', f.material, 'list="materials"') + `<datalist id="materials">${MATERIALS.map((m) => `<option value="${m}">`).join('')}</datalist>`)}
        ${field('Marca', inp('brand', f.brand))}
        ${field('Color', `<input type="color" name="color" value="${esc(f.color || '#999999')}">`)}
        ${field('Nombre del color', inp('colorName', f.colorName, 'placeholder="Negro"'))}
        ${field('Diámetro (mm)', `<select name="diameter">${['1.75', '2.85', '3.00'].map((d) => `<option${String(f.diameter) === d ? ' selected' : ''}>${d}</option>`).join('')}</select>`)}
        ${field('Peso neto bobina (g) *', numInp('spoolWeight', f.spoolWeight, 'required min="1"'))}
        ${field('Precio por bobina *', numInp('price', f.price, 'required min="0"'))}
        ${isNew
          ? field('Nº de bobinas compradas', numInp('spools', 1, 'min="0"'), { hint: 'Define el stock inicial.' })
          : field('Stock actual (g)', numInp('remaining', f.remaining), { hint: 'Ajusta tras pesar la bobina.' })}
        ${field('Aviso de stock bajo (g)', numInp('lowStock', f.lowStock, `placeholder="${S.settings.lowStockGrams}"`), { hint: 'Vacío = valor de Ajustes.' })}
        ${isNew ? `${field('Fecha de compra', `<input type="date" name="date" value="${today()}">`)}
          <div class="field wide"><label class="check"><input type="checkbox" name="asExpense" checked> Registrar la compra como gasto</label></div>` : ''}
      </div>`,
      onSubmit: (b) => {
        const data = {
          name: val(b, 'name'), material: val(b, 'material'), brand: val(b, 'brand'), color: val(b, 'color'),
          colorName: val(b, 'colorName'), diameter: val(b, 'diameter'),
          spoolWeight: num(val(b, 'spoolWeight')), price: num(val(b, 'price')), lowStock: val(b, 'lowStock'),
        };
        if (data.spoolWeight <= 0) { toast('El peso de la bobina debe ser mayor que 0.'); return false; }
        if (isNew) {
          const spools = num(val(b, 'spools'));
          const nf = { id: uid(), ...data, remaining: spools * data.spoolWeight, createdAt: today() };
          S.filaments.push(nf);
          if (checked(b, 'asExpense') && spools > 0) {
            S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'filamento', description: `${spools} × ${filamentLabel(nf)}`, amount: spools * data.price, filamentId: nf.id });
          }
          persist('Filamento añadido');
        } else {
          Object.assign(f, data, { remaining: num(val(b, 'remaining')) });
          persist('Filamento actualizado');
        }
      },
    });
  }

  function restockForm(f) {
    openModal({
      title: `Reponer · ${f.name}`,
      submitLabel: 'Añadir al stock',
      body: `<div class="form-grid">
        ${field('Nº de bobinas', numInp('spools', 1, 'min="0" step="1"'))}
        ${field('Gramos a añadir', numInp('grams', f.spoolWeight, 'required min="0"'))}
        ${field('Importe pagado', numInp('amount', f.price, 'min="0"'), { hint: 'Total de la compra.' })}
        ${field('Fecha', `<input type="date" name="date" value="${today()}">`)}
        <div class="field wide"><label class="check"><input type="checkbox" name="asExpense" checked> Registrar como gasto</label>
        <label class="check"><input type="checkbox" name="updatePrice"> Actualizar el precio de bobina con este importe</label></div>
      </div>
      <p class="small muted">Stock actual: ${fmtGrams(f.remaining)}</p>`,
      onOpen: (b) => {
        $('[name="spools"]', b).addEventListener('input', (e) => {
          const n = num(e.target.value);
          $('[name="grams"]', b).value = n * num(f.spoolWeight);
          $('[name="amount"]', b).value = Math.round(n * num(f.price) * 100) / 100;
        });
      },
      onSubmit: (b) => {
        const grams = num(val(b, 'grams')), amount = num(val(b, 'amount')), spools = num(val(b, 'spools'));
        f.remaining = num(f.remaining) + grams;
        if (checked(b, 'updatePrice') && spools > 0) f.price = Math.round((amount / spools) * 100) / 100;
        if (checked(b, 'asExpense') && amount > 0) {
          S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'filamento', description: `Reposición ${fmtGrams(grams)} · ${filamentLabel(f)}`, amount, filamentId: f.id });
        }
        persist(`+${fmtGrams(grams)} de ${f.name}`);
      },
    });
  }

  // ================================================================ MATERIALES EN PLANCHA

  const MATERIAL_CATEGORIES = ['Madera', 'Contrachapado', 'MDF', 'Metacrilato', 'Cuero', 'Fotopolímero', 'Fotolito / negativo', 'Goma para sellos', 'Cartón', 'Corcho', 'Tela', 'Papel', 'Vidrio', 'Metal', 'Otros'];

  function viewMaterials() {
    const list = [...S.materials].sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    const used = {};
    S.prints.forEach((p) => Object.entries(sheetsUsed(p.sheets, p.quantity, S.settings.sheetWaste, materialsById()))
      .forEach(([id, n]) => { used[id] = (used[id] || 0) + n; }));
    const total = list.reduce((s, m) => s + Math.max(0, num(m.stock)) * num(m.price), 0);
    return `
      <div class="page-head">
        <h1>Materiales en plancha</h1>
        <div class="actions"><button class="btn primary" data-action="new-material">+ Nuevo material</button></div>
      </div>
      <p class="small muted" style="margin-top:-8px">Para corte y grabado láser (madera, MDF, metacrilato, cuero…) y sellos de insoladora (plancha de fotopolímero y fotolito/negativo). El coste se calcula por cm² según las medidas de cada pieza, más un ${fmtNum(S.settings.sheetWaste)} % de desperdicio (cámbialo en Ajustes).</p>
      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Material</th><th class="num">Plancha</th><th class="num">Precio</th><th class="num">€/cm²</th><th class="num">Stock</th><th class="num">Usado</th><th class="num">Valor</th><th></th></tr></thead>
          <tbody>${list.map((m) => `<tr>
            <td><b>${esc(materialLabel(m))}</b><div class="small muted">${esc([m.category, m.supplier].filter(Boolean).join(' · '))}</div></td>
            <td class="num">${fmtNum(m.sheetWidth)} × ${fmtNum(m.sheetHeight)} mm</td>
            <td class="num">${money(m.price)}</td>
            <td class="num"><b>${money(sheetCostPerCm2(m) * 100).replace(/\s?€/, '')}</b><div class="small muted">€ / 100 cm²</div></td>
            <td class="num">${fmtSheets(m.stock)}${matLow(m) ? '<div><span class="badge low">⚠ Stock bajo</span></div>' : ''}</td>
            <td class="num">${fmtNum(used[m.id] || 0, 2)}</td>
            <td class="num">${money(Math.max(0, num(m.stock)) * num(m.price))}</td>
            <td class="actions">
              <button class="btn small" data-action="restock-material" data-id="${m.id}">Reponer</button>
              <button class="icon-btn" data-action="edit-material" data-id="${m.id}" aria-label="Editar" title="Editar / ajustar stock">✎</button>
              <button class="icon-btn" data-action="delete-material" data-id="${m.id}" aria-label="Eliminar" title="Eliminar">🗑</button>
            </td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="6">Total</td><td class="num">${money(total)}</td><td></td></tr></tfoot>
        </table></div>` : `<div class="empty">Aún no tienes materiales en plancha. Añade, por ejemplo, contrachapado de 3 mm o fotopolímero para sellos.</div>`}
      </div>`;
  }

  function materialForm(m) {
    const isNew = !m;
    m = m || { name: '', category: 'Contrachapado', thickness: 3, sheetWidth: 600, sheetHeight: 400, price: '', stock: '', lowStock: 1, supplier: '' };
    openModal({
      title: isNew ? 'Nuevo material' : 'Editar material',
      body: `<div class="form-grid">
        ${field('Nombre *', inp('name', m.name, 'required placeholder="Ej. Contrachapado de abedul"'), { wide: true })}
        ${field('Categoría', inp('category', m.category, 'list="mat-cats"') + `<datalist id="mat-cats">${MATERIAL_CATEGORIES.map((x) => `<option value="${x}">`).join('')}</datalist>`)}
        ${field('Grosor (mm)', numInp('thickness', m.thickness, 'min="0"'))}
        ${field('Ancho plancha (mm) *', numInp('sheetWidth', m.sheetWidth, 'required min="1"'))}
        ${field('Alto plancha (mm) *', numInp('sheetHeight', m.sheetHeight, 'required min="1"'), { hint: 'A4 = 297 × 210 mm.' })}
        ${field('Precio por plancha *', numInp('price', m.price, 'required min="0"'))}
        ${isNew
          ? field('Nº de planchas compradas', numInp('sheets', 1, 'min="0"'))
          : field('Stock (planchas)', numInp('stock', m.stock), { hint: 'Admite decimales: 0,5 = media plancha.' })}
        ${field('Aviso de stock bajo (planchas)', numInp('lowStock', m.lowStock, 'min="0"'))}
        ${field('Proveedor', inp('supplier', m.supplier))}
        ${isNew ? `${field('Fecha de compra', `<input type="date" name="date" value="${today()}">`)}
          <div class="field wide"><label class="check"><input type="checkbox" name="asExpense" checked> Registrar la compra como gasto</label></div>` : ''}
      </div>
      <div class="price-box" id="mat-preview"></div>`,
      onOpen: (b) => {
        const refresh = () => {
          const x = { price: val(b, 'price'), sheetWidth: val(b, 'sheetWidth'), sheetHeight: val(b, 'sheetHeight') };
          const cm2 = sheetCostPerCm2(x);
          $('#mat-preview', b).innerHTML = `<div><div class="small muted">Área de la plancha</div><strong>${fmtNum((num(x.sheetWidth) * num(x.sheetHeight)) / 100)} cm²</strong></div>
            <div><div class="small muted">Coste por 100 cm² (10×10 cm)</div><strong>${money(cm2 * 100)}</strong></div>`;
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
        if (data.sheetWidth <= 0 || data.sheetHeight <= 0) { toast('Indica las medidas de la plancha.'); return false; }
        if (isNew) {
          const n = num(val(b, 'sheets'));
          const nm = { id: uid(), ...data, stock: n };
          S.materials.push(nm);
          if (checked(b, 'asExpense') && n > 0) {
            S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'materiales', description: `${fmtSheets(n)} · ${materialLabel(nm)}`, amount: n * data.price, materialId: nm.id });
          }
          persist('Material añadido');
        } else {
          Object.assign(m, data, { stock: num(val(b, 'stock')) });
          S.prints.forEach((p) => (p.sheets || []).forEach((it) => { if (it.materialId === m.id) it.materialName = materialLabel(m); }));
          persist('Material actualizado');
        }
      },
    });
  }

  function restockMaterialForm(m) {
    openModal({
      title: `Reponer · ${materialLabel(m)}`,
      submitLabel: 'Añadir al stock',
      body: `<div class="form-grid">
        ${field('Nº de planchas', numInp('sheets', 1, 'required min="0"'))}
        ${field('Importe pagado', numInp('amount', m.price, 'min="0"'))}
        ${field('Fecha', `<input type="date" name="date" value="${today()}">`)}
        <div class="field wide"><label class="check"><input type="checkbox" name="asExpense" checked> Registrar como gasto</label></div>
      </div>
      <p class="small muted">Stock actual: ${fmtSheets(m.stock)}</p>`,
      onOpen: (b) => {
        $('[name="sheets"]', b).addEventListener('input', (e) => { $('[name="amount"]', b).value = Math.round(num(e.target.value) * num(m.price) * 100) / 100; });
      },
      onSubmit: (b) => {
        const n = num(val(b, 'sheets')), amount = num(val(b, 'amount'));
        m.stock = num(m.stock) + n;
        if (checked(b, 'asExpense') && amount > 0) {
          S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'materiales', description: `Reposición ${fmtSheets(n)} · ${materialLabel(m)}`, amount, materialId: m.id });
        }
        persist(`+${fmtSheets(n)} de ${m.name}`);
      },
    });
  }

  // ================================================================ COMPONENTES

  const COMPONENT_CATEGORIES = ['Iluminación', 'Electrónica', 'Tornillería', 'Imanes', 'Cables', 'Llaveros y anillas', 'Sellos', 'Embalaje', 'Otros'];

  function viewComponents() {
    const list = [...S.components].sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    const used = {};
    S.prints.forEach((p) => Object.entries(componentsUsed(p.components, p.quantity)).forEach(([id, q]) => { used[id] = (used[id] || 0) + q; }));
    const total = list.reduce((s, c) => s + Math.max(0, num(c.stock)) * componentUnitCost(c), 0);
    return `
      <div class="page-head">
        <h1>Componentes</h1>
        <div class="actions"><button class="btn primary" data-action="new-component">+ Nuevo componente</button></div>
      </div>
      <p class="small muted" style="margin-top:-8px">Piezas externas que montas en tus impresiones: portalámparas, tiras LED, imanes, tornillos… Al registrar una impresión indica cuántas lleva cada pieza y se sumarán al coste y se descontarán del stock.</p>
      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Componente</th><th>Proveedor</th><th class="num">Precio paquete</th><th class="num">Coste ud.</th><th class="num">Stock</th><th class="num">Usados</th><th class="num">Valor</th><th></th></tr></thead>
          <tbody>${list.map((c) => `<tr>
            <td><b>${esc(c.name)}</b><div class="small muted">${esc(c.category || '')}</div></td>
            <td>${esc(c.supplier || '')}</td>
            <td class="num">${money(c.price)}<div class="small muted">${fmtQty(c.packUnits || 1, c.unit)}</div></td>
            <td class="num"><b>${money(componentUnitCost(c))}</b><div class="small muted">por ${esc(c.unit || 'ud.')}</div></td>
            <td class="num">${fmtQty(c.stock, c.unit)}${compLow(c) ? '<div><span class="badge low">⚠ Stock bajo</span></div>' : ''}</td>
            <td class="num">${fmtNum(used[c.id] || 0, 2)}</td>
            <td class="num">${money(Math.max(0, num(c.stock)) * componentUnitCost(c))}</td>
            <td class="actions">
              <button class="btn small" data-action="restock-component" data-id="${c.id}">Reponer</button>
              <button class="icon-btn" data-action="edit-component" data-id="${c.id}" aria-label="Editar" title="Editar / ajustar stock">✎</button>
              <button class="icon-btn" data-action="delete-component" data-id="${c.id}" aria-label="Eliminar" title="Eliminar">🗑</button>
            </td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="6">Total</td><td class="num">${money(total)}</td><td></td></tr></tfoot>
        </table></div>` : `<div class="empty">Aún no tienes componentes. Añade, por ejemplo, un portalámparas o una tira LED.</div>`}
      </div>`;
  }

  function componentForm(c) {
    const isNew = !c;
    c = c || { name: '', category: 'Iluminación', unit: 'ud.', price: '', packUnits: 1, stock: '', lowStock: 2, supplier: '' };
    openModal({
      title: isNew ? 'Nuevo componente' : 'Editar componente',
      body: `<div class="form-grid">
        ${field('Nombre *', inp('name', c.name, 'required placeholder="Ej. Portalámparas E14"'), { wide: true })}
        ${field('Categoría', inp('category', c.category, 'list="comp-cats"') + `<datalist id="comp-cats">${COMPONENT_CATEGORIES.map((x) => `<option value="${x}">`).join('')}</datalist>`)}
        ${field('Unidad', inp('unit', c.unit, 'list="comp-units"') + '<datalist id="comp-units"><option value="ud."><option value="m"><option value="cm"><option value="par"><option value="juego"></datalist>', { hint: 'Cómo lo cuentas: ud., m…' })}
        ${field('Precio del paquete *', numInp('price', c.price, 'required min="0"'))}
        ${field('Unidades por paquete *', numInp('packUnits', c.packUnits, 'required min="0.01"'), { hint: 'Ej. bolsa de 50 imanes → 50.' })}
        ${isNew
          ? field('Nº de paquetes comprados', numInp('packs', 1, 'min="0"'), { hint: 'Define el stock inicial.' })
          : field('Stock actual', numInp('stock', c.stock), { hint: 'Ajusta tras contar.' })}
        ${field('Aviso de stock bajo', numInp('lowStock', c.lowStock, 'min="0"'))}
        ${field('Proveedor', inp('supplier', c.supplier, 'placeholder="AliExpress, Amazon…"'))}
        ${isNew ? `${field('Fecha de compra', `<input type="date" name="date" value="${today()}">`)}
          <div class="field wide"><label class="check"><input type="checkbox" name="asExpense" checked> Registrar la compra como gasto</label></div>` : ''}
      </div>
      <div class="price-box" id="comp-preview"></div>`,
      onOpen: (b) => {
        const refresh = () => {
          const unitCost = componentUnitCost({ price: val(b, 'price'), packUnits: val(b, 'packUnits') });
          $('#comp-preview', b).innerHTML = `<div><div class="small muted">Coste por ${esc(val(b, 'unit') || 'ud.')}</div><strong>${money(unitCost)}</strong></div>`;
        };
        b.addEventListener('input', refresh);
        refresh();
      },
      onSubmit: (b) => {
        const data = {
          name: val(b, 'name'), category: val(b, 'category'), unit: val(b, 'unit') || 'ud.', price: num(val(b, 'price')),
          packUnits: num(val(b, 'packUnits')), lowStock: val(b, 'lowStock'), supplier: val(b, 'supplier'),
        };
        if (data.packUnits <= 0) { toast('Las unidades por paquete deben ser mayores que 0.'); return false; }
        if (isNew) {
          const packs = num(val(b, 'packs'));
          const nc = { id: uid(), ...data, stock: packs * data.packUnits };
          S.components.push(nc);
          if (checked(b, 'asExpense') && packs > 0) {
            S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'componentes', description: `${packs} × ${nc.name}`, amount: packs * data.price, componentId: nc.id });
          }
          persist('Componente añadido');
        } else {
          Object.assign(c, data, { stock: num(val(b, 'stock')) });
          S.prints.forEach((p) => (p.components || []).forEach((it) => { if (it.componentId === c.id) it.componentName = c.name; }));
          persist('Componente actualizado');
        }
      },
    });
  }

  function restockComponentForm(c) {
    openModal({
      title: `Reponer · ${c.name}`,
      submitLabel: 'Añadir al stock',
      body: `<div class="form-grid">
        ${field('Nº de paquetes', numInp('packs', 1, 'min="0" step="1"'))}
        ${field(`Cantidad a añadir (${esc(c.unit || 'ud.')})`, numInp('qty', c.packUnits || 1, 'required min="0"'))}
        ${field('Importe pagado', numInp('amount', c.price, 'min="0"'))}
        ${field('Fecha', `<input type="date" name="date" value="${today()}">`)}
        <div class="field wide"><label class="check"><input type="checkbox" name="asExpense" checked> Registrar como gasto</label></div>
      </div>
      <p class="small muted">Stock actual: ${fmtQty(c.stock, c.unit)}</p>`,
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
          S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'componentes', description: `Reposición ${fmtQty(qty, c.unit)} · ${c.name}`, amount, componentId: c.id });
        }
        persist(`+${fmtQty(qty, c.unit)} de ${c.name}`);
      },
    });
  }

  // ================================================================ MÁQUINAS (impresoras 3D, láser…)

  function viewPrinters() {
    const stats = window.Calc.printerStats(S);
    const dp = defaultPrinter();
    return `
      <div class="page-head">
        <h1>Máquinas</h1>
        <div class="actions"><button class="btn primary" data-action="new-printer">+ Nueva máquina</button></div>
      </div>
      <div class="card">
        ${S.printers.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Máquina</th><th class="num">Consumo</th><th class="num">Precio</th><th class="num">Coste / hora</th>
            <th>Vida útil usada</th><th class="num">Trabajos</th><th class="num">Ingresos</th><th class="num">Beneficio</th><th></th></tr></thead>
          <tbody>${S.printers.map((pr) => {
            const st = stats[pr.id] || { hours: 0, jobs: 0, revenue: 0, profit: 0 };
            const life = num(pr.lifeHours);
            const pct = life > 0 ? Math.min(100, (st.hours / life) * 100) : 0;
            const isDefault = dp && dp.id === pr.id;
            return `<tr>
              <td><b>${esc(pr.name)}</b> <span class="badge">${esc(MACHINE_TYPES[machineType(pr)])}</span> ${isDefault ? '<span class="badge ok">★ Predeterminada</span>' : ''}
                ${pr.notes ? `<div class="small muted">${esc(pr.notes)}</div>` : ''}</td>
              <td class="num">${fmtNum(pr.watts)} W</td>
              <td class="num">${money(pr.price)}</td>
              <td class="num"><b>${money(printerHourCost(pr))}</b>
                <div class="small muted">máq. ${money(window.Calc.machineHourCost(S.settings, pr))} · luz ${money((num(pr.watts) / 1000) * num(S.settings.kwhPrice))}</div></td>
              <td><div class="stock"><div class="stock-bar"><span style="width:${pct}%"></span></div>
                <span class="nowrap small">${fmtNum(st.hours, 1)} / ${fmtNum(life)} h</span></div></td>
              <td class="num">${fmtNum(st.jobs)}</td>
              <td class="num">${money(st.revenue)}</td>
              <td class="num">${moneySigned(st.profit)}</td>
              <td class="actions">
                ${isDefault ? '' : `<button class="icon-btn" data-action="default-printer" data-id="${pr.id}" aria-label="Usar por defecto" title="Usar por defecto">☆</button>`}
                <button class="icon-btn" data-action="edit-printer" data-id="${pr.id}" aria-label="Editar" title="Editar">✎</button>
                <button class="icon-btn" data-action="delete-printer" data-id="${pr.id}" aria-label="Eliminar" title="Eliminar">🗑</button>
              </td></tr>`;
          }).join('')}</tbody>
        </table></div>` : `<div class="empty">Añade tus impresoras 3D, láser e insoladora para que cada trabajo use su propio consumo, amortización y mantenimiento.</div>`}
      </div>
      <p class="small muted">Coste / hora = amortización (precio ÷ vida útil) + mantenimiento + electricidad (consumo × ${money(S.settings.kwhPrice)}/kWh). Ingresos y beneficio salen de las ventas de los trabajos hechos en cada máquina. Cambiar una máquina no modifica el coste de trabajos ya registrados. «Predeterminada» es la que se elige por defecto para impresión 3D.</p>`;
  }

  function printerForm(pr) {
    const isNew = !pr;
    const st = S.settings;
    pr = pr || { type: '3d', name: '', notes: '', watts: st.printerWatts, price: st.printerPrice, lifeHours: st.printerLifeHours, maintenancePerHour: st.maintenancePerHour };
    openModal({
      title: isNew ? 'Nueva máquina' : 'Editar máquina',
      body: `<div class="form-grid">
        ${field('Nombre *', inp('name', pr.name, 'required placeholder="Ej. Bambu Lab P1S, xTool S1…"'), { wide: true })}
        ${field('Tipo', `<select name="type">${Object.entries(MACHINE_TYPES).map(([k, v]) => `<option value="${k}"${k === machineType(pr) ? ' selected' : ''}>${v}</option>`).join('')}</select>`)}
        ${field('Consumo medio (W) *', numInp('watts', pr.watts, 'required min="0"'), { hint: 'Láser: incluye extractor y air assist. Impresora 3D ≈ 80–150 W. Insoladora UV ≈ 20–60 W.' })}
        ${field('Precio de compra *', numInp('price', pr.price, 'required min="0"'))}
        ${field('Vida útil estimada (h) *', numInp('lifeHours', pr.lifeHours, 'required min="1"'), { hint: 'Horas en las que la amortizas.' })}
        ${field('Mantenimiento (/h)', numInp('maintenancePerHour', pr.maintenancePerHour, 'min="0"'), { hint: 'Boquillas, lentes, filtros, tubos UV…' })}
        ${field('Notas', inp('notes', pr.notes, 'placeholder="Boquilla 0.4, módulo 20 W…"'), { wide: true })}
        ${isNew ? `${field('Fecha de compra', `<input type="date" name="date" value="${today()}">`)}
          <div class="field wide"><label class="check"><input type="checkbox" name="asExpense"> Registrar la compra como gasto (Máquinas y herramientas)</label></div>` : ''}
      </div>
      <div class="price-box" id="printer-preview"></div>`,
      onOpen: (b) => {
        const read = () => ({ watts: val(b, 'watts'), price: val(b, 'price'), lifeHours: val(b, 'lifeHours'), maintenancePerHour: val(b, 'maintenancePerHour') });
        const refresh = () => {
          const x = read();
          const life = num(x.lifeHours);
          $('#printer-preview', b).innerHTML = `
            <div><div class="small muted">Amortización</div><strong>${money(life > 0 ? num(x.price) / life : 0)}/h</strong></div>
            <div><div class="small muted">Mantenimiento</div><strong>${money(x.maintenancePerHour)}/h</strong></div>
            <div><div class="small muted">Electricidad</div><strong>${money((num(x.watts) / 1000) * num(S.settings.kwhPrice))}/h</strong></div>
            <div><div class="small muted">Total por hora</div><strong>${money(printerHourCost(x))}</strong></div>`;
        };
        b.addEventListener('input', refresh);
        refresh();
      },
      onSubmit: (b) => {
        const data = {
          type: val(b, 'type') || '3d', name: val(b, 'name'), notes: val(b, 'notes'), watts: num(val(b, 'watts')), price: num(val(b, 'price')),
          lifeHours: num(val(b, 'lifeHours')), maintenancePerHour: num(val(b, 'maintenancePerHour')),
        };
        if (data.lifeHours <= 0) { toast('La vida útil debe ser mayor que 0.'); return false; }
        if (isNew) {
          const np = { id: uid(), ...data };
          S.printers.push(np);
          if (!findPrinter(S.settings.defaultPrinterId)) S.settings.defaultPrinterId = np.id;
          if (checked(b, 'asExpense') && data.price > 0) {
            S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'maquinaria', description: `${MACHINE_TYPES[data.type]} ${data.name}`, amount: data.price, printerId: np.id });
          }
          persist('Máquina añadida');
        } else {
          Object.assign(pr, data);
          S.prints.forEach((p) => { if (p.printerId === pr.id) p.printerName = pr.name; });
          persist('Máquina actualizada');
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
        <h1>Trabajos</h1>
        <div class="actions">
          <select data-period="kind" aria-label="Tipo de trabajo"><option value="all">Todos los tipos</option>${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${ui.kind === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
          <button class="btn" data-action="quote">Calculadora de coste</button>
          <button class="btn primary" data-action="new-print">+ Registrar trabajo</button>
        </div>
      </div>
      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Fecha</th><th>Pieza</th><th class="num">Uds.</th><th class="num">Material</th><th class="num">Tiempo</th>
            <th class="num">Coste total</th><th class="num">Coste ud.</th><th class="num">PVP sugerido</th><th class="num">Vendidas</th><th></th></tr></thead>
          <tbody>${list.map((p) => {
            const c = p.cost || {};
            const g = (p.items || []).reduce((s, it) => s + num(it.grams), 0);
            const cm2 = (p.sheets || []).reduce((s, it) => s + (num(it.width) * num(it.height)) / 100, 0) * num(p.quantity);
            const k = p.kind || '3d';
            const s = num(sold[p.id]);
            return `<tr>
              <td class="nowrap">${fmtDate(p.date)}</td>
              <td><span class="badge kind-${k}">${KIND_SHORT[k]}</span> <b>${esc(p.name)}</b><div class="small muted">${esc([p.printerName, (p.items || []).map((it) => it.filamentName).join(', '), (p.sheets || []).map((it) => it.materialName).join(', '), (p.components || []).map((it) => `${fmtNum(it.qty, 2)}× ${it.componentName}`).join(', ')].filter(Boolean).join(' · '))}</div></td>
              <td class="num">${fmtNum(p.quantity)}</td>
              <td class="num">${[g ? fmtGrams(g) : '', cm2 ? fmtNum(cm2) + ' cm²' : ''].filter(Boolean).join('<br>') || '—'}</td>
              <td class="num">${fmtHours(p.hours)}</td>
              <td class="num">${money(c.total)}</td>
              <td class="num"><b>${money(c.unit)}</b></td>
              <td class="num">${money(c.suggestedUnitPrice)}</td>
              <td class="num">${fmtNum(s)} / ${fmtNum(p.quantity)}</td>
              <td class="actions">
                ${s < num(p.quantity) ? `<button class="btn small" data-action="sell-print" data-id="${p.id}">Vender</button>` : '<span class="badge ok">✓ Vendida</span>'}
                <button class="icon-btn" data-action="edit-print" data-id="${p.id}" aria-label="Editar" title="Editar">✎</button>
                <button class="icon-btn" data-action="delete-print" data-id="${p.id}" aria-label="Eliminar" title="Eliminar">🗑</button>
              </td></tr>`;
          }).join('')}</tbody>
        </table></div>` : `<div class="empty">${S.prints.length ? 'No hay trabajos de este tipo.' : 'Registra tu primer trabajo para calcular su coste y descontar el material usado.'}</div>`}
      </div>
      <p class="small muted">El coste incluye material (filamento o plancha con un ${fmtNum(S.settings.sheetWaste)} % de desperdicio), componentes, electricidad (${money(S.settings.kwhPrice)}/kWh), amortización y mantenimiento de la máquina, mano de obra, extras y un ${fmtNum(S.settings.failureRate)} % por fallos. Cámbialo en Máquinas y Ajustes.</p>`;
  }

  function filamentOptions(selected) {
    return `<option value="">— Elige filamento —</option>` + S.filaments
      .map((f) => `<option value="${f.id}"${f.id === selected ? ' selected' : ''}>${esc(filamentLabel(f))} (${fmtGrams(f.remaining)})</option>`).join('');
  }

  function printForm(p, { quoteOnly = false } = {}) {
    const isNew = !p;
    if (!S.printers.length && !quoteOnly) {
      toast('Primero añade una máquina (impresora 3D o láser).');
      return printerForm();
    }
    const dp = defaultPrinter();
    const firstOf = (type) => S.printers.find((m) => machineType(m) === type);
    const startKind = p ? (p.kind || '3d') : (dp ? kindForMachine(dp) : '3d');
    const startMachine = (dp && machineType(dp) === machineForKind(startKind)) ? dp : firstOf(machineForKind(startKind));
    p = p || { kind: startKind, printerId: (startMachine || dp || {}).id || '', components: [], sheets: [], name: '', date: today(), quantity: 1, hours: 2, items: [{ filamentId: S.filaments[0] ? S.filaments[0].id : '', grams: 50 }], laborHours: 0, extras: 0, margin: '', notes: '', stockDeducted: true };
    const h = Math.floor(num(p.hours)), m = Math.round((num(p.hours) - h) * 60);
    const printerMissing = !isNew && p.printerId && !findPrinter(p.printerId);
    const selPrinterId = findPrinter(p.printerId) ? p.printerId : (dp ? dp.id : '');
    const printerField = S.printers.length
      ? field('Máquina', `<select name="printerId">${S.printers.map((pr) =>
          `<option value="${pr.id}"${pr.id === selPrinterId ? ' selected' : ''}>${esc(pr.name)} (${MACHINE_TYPES[machineType(pr)]}) · ${money(printerHourCost(pr))}/h</option>`).join('')}</select>`,
          { hint: printerMissing ? `⚠ La máquina original (${esc(p.printerName || '')}) se eliminó; elige otra.` : 'Cada máquina tiene su consumo, amortización y mantenimiento.' })
      : '';

    const itemRow = (it) => `<div class="item-row">
        <select name="item-filament" aria-label="Filamento">${filamentOptions(it.filamentId)}</select>
        <input name="item-grams" type="number" step="any" min="0" value="${esc(it.grams)}" aria-label="Gramos" placeholder="g">
        <button type="button" class="icon-btn" data-remove-item aria-label="Quitar">✕</button></div>`;

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
    const materialOptions = (selected) => `<option value="">— Elige material —</option>` + S.materials
      .map((m) => `<option value="${m.id}"${m.id === selected ? ' selected' : ''}>${esc(materialLabel(m))} · ${money(sheetCostPerCm2(m) * 100)}/100 cm² (${fmtNum(m.stock, 2)} pl.)</option>`).join('');
    const sheetRow = (it) => `<div class="sheet-row">
        <select name="sheet-id" aria-label="Material">${materialOptions(it.materialId)}</select>
        <input name="sheet-w" type="number" step="any" min="0" value="${esc(it.width)}" aria-label="Ancho por pieza (mm)" placeholder="ancho mm">
        <input name="sheet-h" type="number" step="any" min="0" value="${esc(it.height)}" aria-label="Alto por pieza (mm)" placeholder="alto mm">
        <button type="button" class="icon-btn" data-remove-sheet aria-label="Quitar">✕</button></div>`;

    const componentOptions = (selected) => `<option value="">— Elige componente —</option>` + S.components
      .map((c) => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${esc(c.name)} · ${money(componentUnitCost(c))}/${esc(c.unit || 'ud.')} (${fmtNum(c.stock, 2)} disp.)</option>`).join('');
    const compRow = (it) => `<div class="comp-row">
        <select name="comp-id" aria-label="Componente">${componentOptions(it.componentId)}</select>
        <input name="comp-qty" type="number" step="any" min="0" value="${esc(it.qty)}" aria-label="Cantidad por pieza" placeholder="por pieza">
        <button type="button" class="icon-btn" data-remove-comp aria-label="Quitar">✕</button></div>`;

    openModal({
      title: quoteOnly ? 'Calculadora de coste' : isNew ? 'Registrar trabajo' : 'Editar trabajo',
      submitLabel: quoteOnly ? 'Guardar como trabajo' : 'Guardar',
      body: `<div class="form-grid">
          ${field('Pieza / encargo *', inp('name', p.name, 'required placeholder="Ej. Soporte móvil, Sello logo, Posavasos…"'), { wide: true })}
          ${field('Tipo de trabajo', `<select name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${k === (p.kind || '3d') ? ' selected' : ''}>${v}</option>`).join('')}</select>`)}
          ${printerField}
          ${field('Fecha', `<input type="date" name="date" value="${esc(p.date)}">`)}
          ${field('Unidades producidas', numInp('quantity', p.quantity, 'min="1" step="1"'), { hint: 'Piezas que salen de este trabajo.' })}
          ${field('Horas', numInp('h', h, 'min="0" step="1"'))}
          ${field('Minutos', numInp('m', m, 'min="0" max="59" step="1"'), { hint: '<span id="time-hint">Tiempo total de máquina.</span>' })}
        </div>
        <div id="sec-fil">
          <h3 class="section-title">Filamento usado (gramos totales, según el laminador)</h3>
          ${S.filaments.length ? `<div class="items-list" id="items">${((p.items || []).length ? p.items : [{ filamentId: S.filaments[0].id, grams: 50 }]).map(itemRow).join('')}</div>
            <button type="button" class="btn small" id="add-item" style="margin-top:8px">+ Añadir otro filamento</button>`
            : `<p class="small muted">Da de alta tus bobinas en <a href="#filaments" data-close-link>Filamentos</a> para sumarlas al coste.</p>`}
        </div>
        <div id="sec-sheet">
          <h3 class="section-title">Material en plancha (medidas de cada pieza)</h3>
          ${S.materials.length ? `<div class="items-list" id="sheets">${((p.sheets || []).length ? p.sheets : defaultSheets(p.kind || '3d')).map(sheetRow).join('')}</div>
            <button type="button" class="btn small" id="add-sheet" style="margin-top:8px">+ Añadir otro material</button>
            <p class="small muted" style="margin:6px 0 0">Ancho × alto en mm que ocupa cada pieza en la plancha; se suma un ${fmtNum(S.settings.sheetWaste)} % de desperdicio. En sellos añade el fotopolímero y el fotolito (negativo).</p>`
            : `<p class="small muted">Da de alta madera, metacrilato, goma para sellos… en <a href="#materials" data-close-link>Materiales</a> para sumarlos al coste.</p>`}
        </div>
        <h3 class="section-title">Componentes externos (cantidad por pieza)</h3>
        ${S.components.length ? `<div class="items-list" id="comps">${(p.components || []).map(compRow).join('')}</div>
          <button type="button" class="btn small" id="add-comp" style="margin-top:8px">+ Añadir componente</button>`
          : `<p class="small muted">¿Lleva portalámparas, LED, imanes, mangos de sello…? Dalos de alta en <a href="#components" data-close-link>Componentes</a> para sumarlos al coste.</p>`}
        <h3 class="section-title">Otros costes</h3>
        <div class="form-grid">
          ${field('Mano de obra (h)', numInp('laborHours', p.laborHours, 'min="0"'), { hint: `Diseño, montaje y acabado a ${money(S.settings.laborRate)}/h` })}
          ${field('Extras (€)', numInp('extras', p.extras, 'min="0"'), { hint: 'Gastos sueltos no inventariados.' })}
          ${field('Margen (%)', numInp('margin', p.margin, `placeholder="${S.settings.defaultMargin}"`), { hint: 'Para el precio sugerido.' })}
          ${field('Notas', inp('notes', p.notes))}
          ${quoteOnly || isNew ? `<div class="field wide"><label class="check"><input type="checkbox" name="deduct" ${quoteOnly ? '' : 'checked'}> Descontar materiales y componentes del stock</label></div>` : ''}
        </div>
        <div class="card" style="margin:16px 0 0" id="preview"></div>`,
      onOpen: (b) => {
        const kindSel = $('[name="kind"]', b);
        const machineSel = $('[name="printerId"]', b);
        let sheetsTouched = !isNew;
        const sheetsBox = $('#sheets', b);
        if (sheetsBox) sheetsBox.addEventListener('input', () => { sheetsTouched = true; });
        const TIME_HINTS = {
          '3d': 'Tiempo total de impresión.',
          laser: 'Tiempo de corte y grabado.',
          sello: 'Insolado + post-exposición en la insoladora. El lavado y secado van en mano de obra.',
        };
        const showSections = () => {
          const k = kindSel.value;
          $('#sec-fil', b).hidden = k !== '3d';
          $('#sec-sheet', b).hidden = k === '3d';
          $('#time-hint', b).textContent = TIME_HINTS[k];
        };
        kindSel.addEventListener('change', () => {
          // proponer una máquina acorde al tipo de trabajo
          const want = machineForKind(kindSel.value);
          const cur = findPrinter(machineSel && machineSel.value);
          if (machineSel && machineType(cur) !== want) {
            const alt = S.printers.find((x) => machineType(x) === want);
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
          return { filamentId: id, filamentName: f ? filamentLabel(f) : '', grams: num($('[name="item-grams"]', row).value) };
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
              ${job.kind === '3d' ? `<dt>Filamento</dt><dd>${money(c.material)}</dd>` : `<dt>Material en plancha (+${fmtNum(S.settings.sheetWaste)} % desperdicio)</dt><dd>${money(c.sheet)}</dd>`}
              <dt>Electricidad${pr ? ` (${fmtNum(pr.watts)} W)` : ''}</dt><dd>${money(c.electricity)}</dd>
              <dt>Amortización y mantenimiento${pr ? ` · ${esc(pr.name)}` : ''}</dt><dd>${money(c.machine)}</dd>
              ${c.components ? `<dt>Componentes externos</dt><dd>${money(c.components)}</dd>` : ''}
              <dt>Mano de obra</dt><dd>${money(c.labor)}</dd>
              <dt>Extras</dt><dd>${money(c.extras)}</dd>
              <dt>Margen de fallos (${fmtNum(S.settings.failureRate)} %)</dt><dd>${money(c.failure)}</dd>
              <dt class="total">Coste total (${c.quantity} ${c.quantity === 1 ? 'ud.' : 'uds.'})</dt><dd class="total">${money(c.total)}</dd>
            </dl>
            <div class="price-box">
              <div><div class="small muted">Coste por unidad</div><strong>${money(c.unit)}</strong></div>
              <div><div class="small muted">Precio sugerido (+${fmtNum(c.margin)} %)</div><strong>${money(c.suggestedUnitPrice)}</strong></div>
            </div>
            ${short.length ? `<p class="small neg">⚠ Stock insuficiente: ${short.map(({ f }) => esc(f.name) + ' (' + fmtGrams(f.remaining) + ')').join(', ')}</p>` : ''}
            ${shortSheets.length ? `<p class="small neg">⚠ Faltan planchas: ${shortSheets.map(({ mt, n }) => `${esc(materialLabel(mt))} (necesitas ${fmtNum(n, 2)}, hay ${fmtNum(mt.stock, 2)})`).join(', ')}</p>` : ''}
            ${shortComps.length ? `<p class="small neg">⚠ Faltan componentes: ${shortComps.map(({ c: k, q }) => `${esc(k.name)} (necesitas ${fmtNum(q, 2)}, hay ${fmtNum(k.stock, 2)})`).join(', ')}</p>` : ''}`;
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
        if (!job.items.length && !job.sheets.length && !job.components.length && !job.hours) { toast('Indica el material usado o el tiempo de máquina.'); return false; }
        const pr = findPrinter(job.printerId);
        const cost = printCost(job, filamentsById(), S.settings, pr, componentsById(), materialsById());
        const data = { ...job, printerName: pr ? pr.name : '', name: val(b, 'name'), date: val(b, 'date') || today(), notes: val(b, 'notes'), cost };
        if (isNew) {
          const deduct = checked(b, 'deduct');
          if (deduct) applyJobStock(data, -1);
          S.prints.push({ id: uid(), ...data, stockDeducted: deduct });
          persist(deduct ? 'Trabajo registrado y stock actualizado' : 'Trabajo registrado');
        } else {
          if (p.stockDeducted) { applyJobStock(p, +1); applyJobStock(data, -1); }
          Object.assign(p, data);
          // actualizar el coste en las ventas ligadas que no se hayan modificado a mano
          S.sales.forEach((s) => { if (s.printId === p.id && s.costFromPrint) s.unitCost = cost.unit; });
          persist('Trabajo actualizado');
        }
      },
    });
  }

  // ================================================================ VENTAS

  function viewSales() {
    const list = S.sales.filter((s) => inPeriod(s.date, ui.salesPeriod)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const tot = list.reduce((acc, s) => {
      const t = saleTotals(s);
      acc.revenue += t.revenue; acc.fees += t.fees; acc.cogs += t.cogs; acc.profit += t.profit; acc.units += num(s.quantity);
      return acc;
    }, { revenue: 0, fees: 0, cogs: 0, profit: 0, units: 0 });

    return `
      <div class="page-head">
        <h1>Ventas</h1>
        <div class="actions">${periodSelect('salesPeriod', ui.salesPeriod)}
          <button class="btn primary" data-action="new-sale">+ Nueva venta</button></div>
      </div>
      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Fecha</th><th>Pieza / cliente</th><th class="num">Uds.</th><th class="num">Precio ud.</th><th class="num">Ingreso</th>
            <th class="num">Comisiones/envío</th><th class="num">Coste</th><th class="num">Beneficio</th><th class="num">Margen</th><th></th></tr></thead>
          <tbody>${list.map((s) => {
            const t = saleTotals(s);
            return `<tr>
              <td class="nowrap">${fmtDate(s.date)}</td>
              <td><b>${esc(s.description)}</b><div class="small muted">${esc([s.customer, s.channel].filter(Boolean).join(' · '))}</div></td>
              <td class="num">${fmtNum(s.quantity)}</td>
              <td class="num">${money(s.unitPrice)}</td>
              <td class="num">${money(t.revenue)}</td>
              <td class="num">${money(t.fees)}</td>
              <td class="num">${money(t.cogs)}</td>
              <td class="num"><b>${moneySigned(t.profit)}</b></td>
              <td class="num">${t.revenue > 0 ? fmtNum((t.profit / t.revenue) * 100, 0) + ' %' : '—'}</td>
              <td class="actions">
                <button class="icon-btn" data-action="edit-sale" data-id="${s.id}" aria-label="Editar" title="Editar">✎</button>
                <button class="icon-btn" data-action="delete-sale" data-id="${s.id}" aria-label="Eliminar" title="Eliminar">🗑</button></td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td colspan="2">Total</td><td class="num">${fmtNum(tot.units)}</td><td></td><td class="num">${money(tot.revenue)}</td>
            <td class="num">${money(tot.fees)}</td><td class="num">${money(tot.cogs)}</td><td class="num">${moneySigned(tot.profit)}</td>
            <td class="num">${tot.revenue > 0 ? fmtNum((tot.profit / tot.revenue) * 100, 0) + ' %' : '—'}</td><td></td></tr></tfoot>
        </table></div>` : `<div class="empty">No hay ventas en este periodo.</div>`}
      </div>`;
  }

  function saleForm(s, presetPrintId) {
    const isNew = !s;
    const sold = soldByPrint(S.sales);
    const available = (p) => num(p.quantity) - num(sold[p.id]) + (s && s.printId === p.id ? num(s.quantity) : 0);
    const prints = [...S.prints].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    s = s || { date: today(), printId: presetPrintId || '', description: '', quantity: 1, unitPrice: '', fees: 0, unitCost: 0, customer: '', channel: '', costFromPrint: true };

    openModal({
      title: isNew ? 'Nueva venta' : 'Editar venta',
      body: `<div class="form-grid">
        ${field('Trabajo', `<select name="printId"><option value="">— Venta libre (sin trabajo registrado) —</option>${prints.map((p) =>
          `<option value="${p.id}"${p.id === s.printId ? ' selected' : ''}>${esc(p.name)} · ${fmtDate(p.date)} (${fmtNum(available(p))} disp.)</option>`).join('')}</select>`, { wide: true })}
        ${field('Descripción *', inp('description', s.description, 'required'), { wide: true })}
        ${field('Fecha', `<input type="date" name="date" value="${esc(s.date)}">`)}
        ${field('Unidades', numInp('quantity', s.quantity, 'min="1" step="1"'))}
        ${field('Precio de venta por ud. *', numInp('unitPrice', s.unitPrice, 'required min="0"'))}
        ${field('Comisiones y envío (€)', numInp('fees', s.fees, 'min="0"'), { hint: 'Total de la venta: Etsy, Wallapop, PayPal, envío…' })}
        ${field('Coste por ud.', numInp('unitCost', s.unitCost, 'min="0"'), { hint: 'Se rellena con el coste de la impresión.' })}
        ${field('Cliente', inp('customer', s.customer))}
        ${field('Canal', inp('channel', s.channel, 'list="channels" placeholder="Etsy, tienda, feria…"') + '<datalist id="channels"><option value="Etsy"><option value="Wallapop"><option value="Amazon"><option value="Tienda online"><option value="Directo"><option value="Feria"></datalist>')}
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
          const t = saleTotals({ quantity: val(b, 'quantity'), unitPrice: val(b, 'unitPrice'), fees: val(b, 'fees'), unitCost: val(b, 'unitCost') });
          const p = S.prints.find((x) => x.id === sel.value);
          const warn = p && num(val(b, 'quantity')) > available(p) ? `<div class="small neg">⚠ Solo hay ${fmtNum(available(p))} uds. disponibles de esta impresión.</div>` : '';
          $('#sale-preview', b).innerHTML = `<div><div class="small muted">Ingreso</div><strong>${money(t.revenue)}</strong></div>
            <div><div class="small muted">Beneficio</div><strong>${moneySigned(t.profit)}</strong></div>
            <div><div class="small muted">Margen</div><strong>${t.revenue > 0 ? fmtNum((t.profit / t.revenue) * 100, 1) + ' %' : '—'}</strong></div>${warn}`;
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
        persist(isNew ? 'Venta registrada' : 'Venta actualizada');
      },
    });
  }

  // ================================================================ GASTOS

  const EXPENSE_CATEGORIES = {
    filamento: 'Filamento',
    materiales: 'Materiales en plancha',
    componentes: 'Componentes',
    electricidad: 'Electricidad',
    repuestos: 'Repuestos y mantenimiento',
    maquinaria: 'Máquinas y herramientas',
    embalaje: 'Embalaje y envíos',
    otros: 'Otros',
  };

  function viewExpenses() {
    const list = S.expenses.filter((e) => inPeriod(e.date, ui.expensesPeriod)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const byCat = {};
    list.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + num(e.amount); });
    const total = list.reduce((s, e) => s + num(e.amount), 0);
    return `
      <div class="page-head">
        <h1>Gastos</h1>
        <div class="actions">${periodSelect('expensesPeriod', ui.expensesPeriod)}
          <button class="btn primary" data-action="new-expense">+ Nuevo gasto</button></div>
      </div>
      ${list.length ? `<div class="kpis">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
        `<div class="kpi"><div class="label">${esc(EXPENSE_CATEGORIES[k] || k)}</div><div class="value">${money(v)}</div>
          <div class="sub">${fmtNum(total > 0 ? (v / total) * 100 : 0)} % del total</div></div>`).join('')}</div>` : ''}
      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th class="num">Importe</th><th></th></tr></thead>
          <tbody>${list.map((e) => `<tr>
            <td class="nowrap">${fmtDate(e.date)}</td>
            <td><span class="badge">${esc(EXPENSE_CATEGORIES[e.category] || e.category)}</span></td>
            <td>${esc(e.description)}</td>
            <td class="num">${money(e.amount)}</td>
            <td class="actions"><button class="icon-btn" data-action="edit-expense" data-id="${e.id}" aria-label="Editar" title="Editar">✎</button>
              <button class="icon-btn" data-action="delete-expense" data-id="${e.id}" aria-label="Eliminar" title="Eliminar">🗑</button></td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="3">Total</td><td class="num">${money(total)}</td><td></td></tr></tfoot>
        </table></div>` : `<div class="empty">No hay gastos en este periodo. Las compras de filamento se añaden aquí automáticamente.</div>`}
      </div>`;
  }

  function expenseForm(e) {
    const isNew = !e;
    e = e || { date: today(), category: 'otros', description: '', amount: '' };
    openModal({
      title: isNew ? 'Nuevo gasto' : 'Editar gasto',
      body: `<div class="form-grid">
        ${field('Fecha', `<input type="date" name="date" value="${esc(e.date)}">`)}
        ${field('Categoría', `<select name="category">${Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => `<option value="${k}"${k === e.category ? ' selected' : ''}>${v}</option>`).join('')}</select>`)}
        ${field('Importe *', numInp('amount', e.amount, 'required min="0"'))}
        ${field('Descripción *', inp('description', e.description, 'required'), { wide: true })}
      </div>
      ${e.filamentId ? '<p class="small muted">Este gasto está ligado a una compra de filamento. Modificarlo no cambia el stock.</p>' : ''}`,
      onSubmit: (b) => {
        const data = { date: val(b, 'date') || today(), category: val(b, 'category'), description: val(b, 'description'), amount: num(val(b, 'amount')) };
        if (isNew) S.expenses.push({ id: uid(), ...data });
        else Object.assign(e, data);
        persist(isNew ? 'Gasto añadido' : 'Gasto actualizado');
      },
    });
  }

  // ================================================================ AJUSTES

  function viewSettings() {
    const st = S.settings;
    const theme = safeGet('daprintbox:theme') || 'auto';
    return `
      <div class="page-head"><h1>Ajustes</h1></div>
      <form class="card" id="settings-form">
        <h2>Costes de producción</h2>
        <div class="form-grid">
          ${field('Moneda', `<select name="currency">${['EUR', 'USD', 'MXN', 'ARS', 'COP', 'CLP', 'GBP'].map((c) => `<option${c === st.currency ? ' selected' : ''}>${c}</option>`).join('')}</select>`)}
          ${field('Precio electricidad (/kWh)', numInp('kwhPrice', st.kwhPrice, 'min="0"'))}
          ${field('Mano de obra (/h)', numInp('laborRate', st.laborRate, 'min="0"'))}
          ${field('Margen por fallos (%)', numInp('failureRate', st.failureRate, 'min="0"'), { hint: 'Impresiones o cortes fallidos.' })}
          ${field('Desperdicio de plancha (%)', numInp('sheetWaste', st.sheetWaste, 'min="0"'), { hint: 'Márgenes, recortes y separación entre piezas.' })}
          ${field('Margen de beneficio por defecto (%)', numInp('defaultMargin', st.defaultMargin, 'min="0"'))}
          ${field('Aviso de stock bajo (g)', numInp('lowStockGrams', st.lowStockGrams, 'min="0"'))}
        </div>
        <p class="small muted">El consumo, precio, vida útil y mantenimiento de cada máquina se configuran en <a href="#printers">Máquinas</a>.</p>
        <button class="btn primary" type="submit">Guardar ajustes</button>
      </form>

      ${pwa.supported ? `<div class="card">
        <h2>Instalar en el móvil o el ordenador</h2>
        ${pwa.installed ? '<p class="small">✓ Estás usando Daprintbox como app instalada.</p>'
          : pwa.prompt ? `<p class="small">Instala Daprintbox como una app: icono en la pantalla de inicio, pantalla completa y funciona sin conexión.</p>
            <button class="btn primary" data-action="install-app">Instalar la app</button>`
          : `<p class="small">Para tenerla como una app con su icono:</p>
            <ul class="small" style="margin:0;padding-left:20px">
              <li><b>Android (Chrome):</b> menú <b>⋮</b> → <b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.</li>
              <li><b>iPhone (Safari):</b> botón <b>Compartir</b> → <b>Añadir a pantalla de inicio</b>.</li>
              <li><b>Ordenador (Chrome o Edge):</b> icono de instalar a la derecha de la barra de direcciones.</li>
            </ul>`}
      </div>` : ''}

      <div class="card">
        <h2>Apariencia</h2>
        <div class="filters">${field('Tema', `<select id="theme-select">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([k, v]) => `<option value="${k}"${k === theme ? ' selected' : ''}>${v}</option>`).join('')}</select>`)}</div>
      </div>

      ${remote ? `<div class="card">
        <h2>Servidor compartido</h2>
        <p class="small">Has entrado como <b>${esc(sync.user || '')}</b>${sync.email ? ` (${esc(sync.email)})` : ''}. Los datos se guardan en el servidor y los ve todo el equipo.</p>
        <p class="small muted">Versión ${fmtNum(sync.version)}${sync.updatedBy ? ` · último cambio de ${esc(sync.updatedBy)}${sync.updatedAt ? ' el ' + esc(fmtDateTime(sync.updatedAt)) : ''}` : ''}</p>
        <div class="filters">
          <button class="btn" data-action="history">Historial de versiones</button>
          <button class="btn" data-action="logout">Cerrar sesión</button>
        </div>
      </div>` : ''}

      <div class="card">
        <h2>Datos</h2>
        <p class="small muted">${remote ? 'Además del historial del servidor, puedes guardar tus propias copias.' : 'Los datos se guardan en este navegador.'} Guarda una copia de seguridad a menudo para no perderlos o para pasarlos a otro dispositivo. Si los botones de descarga no hacen nada (algunos visores web los bloquean), usa «Copia en texto».</p>
        <div class="filters">
          <button class="btn" data-action="backup-text">Copia en texto (copiar / pegar)</button>
          <button class="btn" data-action="export-json">⬇ Exportar copia (JSON)</button>
          <button class="btn" data-action="import-json">⬆ Importar copia</button>
          <button class="btn" data-action="export-csv" data-kind="sales">Ventas CSV</button>
          <button class="btn" data-action="export-csv" data-kind="expenses">Gastos CSV</button>
          <button class="btn" data-action="export-csv" data-kind="filaments">Filamentos CSV</button>
          <button class="btn" data-action="export-csv" data-kind="materials">Materiales CSV</button>
          <button class="btn" data-action="export-csv" data-kind="components">Componentes CSV</button>
          <button class="btn" data-action="load-demo">Cargar datos de ejemplo</button>
          <button class="btn danger" data-action="reset">Borrar todo</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>`;
  }

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }

  function applyTheme() {
    const t = safeGet('daprintbox:theme');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
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
        () => toast('Archivo guardado'),
        (err) => { if (err && err.code !== 'declined') toast('No se pudo descargar aquí; usa «Copia en texto».'); },
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
    if (kind === 'sales') {
      rows = [['Fecha', 'Descripción', 'Cliente', 'Canal', 'Unidades', 'Precio ud.', 'Ingreso', 'Comisiones', 'Coste', 'Beneficio']];
      S.sales.forEach((s) => { const t = saleTotals(s); rows.push([s.date, s.description, s.customer, s.channel, num(s.quantity), num(s.unitPrice), t.revenue, t.fees, t.cogs, t.profit]); });
    } else if (kind === 'materials') {
      rows = [['Nombre', 'Categoría', 'Grosor (mm)', 'Ancho (mm)', 'Alto (mm)', 'Precio plancha', 'Coste cm²', 'Stock (planchas)', 'Valor stock', 'Proveedor']];
      S.materials.forEach((m) => rows.push([m.name, m.category, num(m.thickness), num(m.sheetWidth), num(m.sheetHeight), num(m.price), sheetCostPerCm2(m), num(m.stock), Math.max(0, num(m.stock)) * num(m.price), m.supplier]));
    } else if (kind === 'components') {
      rows = [['Nombre', 'Categoría', 'Unidad', 'Precio paquete', 'Uds. por paquete', 'Coste ud.', 'Stock', 'Valor stock', 'Proveedor']];
      S.components.forEach((c) => rows.push([c.name, c.category, c.unit, num(c.price), num(c.packUnits), componentUnitCost(c), num(c.stock), Math.max(0, num(c.stock)) * componentUnitCost(c), c.supplier]));
    } else if (kind === 'expenses') {
      rows = [['Fecha', 'Categoría', 'Descripción', 'Importe']];
      S.expenses.forEach((e) => rows.push([e.date, EXPENSE_CATEGORIES[e.category] || e.category, e.description, num(e.amount)]));
    } else {
      rows = [['Nombre', 'Material', 'Color', 'Marca', 'Diámetro', 'Peso bobina (g)', 'Precio bobina', 'Stock (g)', 'Valor stock']];
      S.filaments.forEach((f) => rows.push([f.name, f.material, f.colorName, f.brand, f.diameter, num(f.spoolWeight), num(f.price), num(f.remaining), Math.max(0, num(f.remaining)) * costPerGram(f)]));
    }
    download(`daprintbox-${kind}-${today()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  }

  /** Copia de seguridad como texto: sirve donde las descargas están bloqueadas. */
  function backupTextForm() {
    openModal({
      title: 'Copia de seguridad en texto',
      submitLabel: 'Reemplazar mis datos con este texto',
      body: `<p class="small muted">Copia este texto y guárdalo en una nota o un archivo. Para restaurar, pega aquí una copia y pulsa el botón de abajo.</p>
        <textarea id="backup-text" name="backup" rows="12" spellcheck="false" style="font-family:ui-monospace,monospace;font-size:.8rem">${esc(JSON.stringify(S))}</textarea>
        <div class="filters" style="margin-top:8px"><button type="button" class="btn small" id="copy-backup">Copiar al portapapeles</button></div>`,
      onOpen: (b) => {
        const ta = $('#backup-text', b);
        $('#copy-backup', b).addEventListener('click', () => {
          const done = () => toast('Copia copiada al portapapeles');
          const fallback = () => { ta.focus(); ta.select(); toast('Texto seleccionado: cópialo con Ctrl+C / Cmd+C'); };
          try { navigator.clipboard.writeText(ta.value).then(done, fallback); } catch (e) { fallback(); }
        });
      },
      onSubmit: (b) => {
        let data;
        try { data = JSON.parse(val(b, 'backup')); } catch (e) { data = null; }
        if (!data || !Array.isArray(data.filaments)) { toast('El texto no es una copia válida de Daprintbox.'); return false; }
        S = window.Store.normalize(data);
        persist('Copia restaurada');
      },
    });
  }

  // ================================================================ DATOS DE EJEMPLO

  function demoData() {
    const t = today();
    const months = lastMonths(t.slice(0, 7), 6);
    const d = (i, day) => `${months[i]}-${String(day).padStart(2, '0')}`;
    const st = { ...window.Store.DEFAULT_SETTINGS };
    const f1 = { id: uid(), name: 'PLA Negro mate', material: 'PLA', color: '#222222', colorName: 'Negro', brand: 'Sunlu', diameter: '1.75', spoolWeight: 1000, price: 19.99, remaining: 0, lowStock: '' };
    const f2 = { id: uid(), name: 'PETG Transparente', material: 'PETG', color: '#cfe8f3', colorName: 'Transparente', brand: 'Prusament', diameter: '1.75', spoolWeight: 1000, price: 29.99, remaining: 0, lowStock: '' };
    const f3 = { id: uid(), name: 'PLA Silk Oro', material: 'Silk PLA', color: '#d4a93a', colorName: 'Oro', brand: 'Eryone', diameter: '1.75', spoolWeight: 1000, price: 22.5, remaining: 0, lowStock: 250 };
    const f4 = { id: uid(), name: 'TPU Rojo', material: 'TPU', color: '#c62828', colorName: 'Rojo', brand: 'Overture', diameter: '1.75', spoolWeight: 500, price: 18, remaining: 0, lowStock: 100 };
    const pr1 = { id: uid(), type: '3d', name: 'Bambu Lab P1S', notes: 'Cerrada · AMS', watts: 110, price: 699, lifeHours: 6000, maintenancePerHour: 0.08 };
    const pr3 = { id: uid(), type: 'laser', name: 'xTool S1 20 W', notes: 'Diodo 20 W · air assist · extractor', watts: 160, price: 1099, lifeHours: 10000, maintenancePerHour: 0.12 };
    const pr4 = { id: uid(), type: 'insoladora', name: 'Insoladora UV A4', notes: 'Tubos UV-A · exposición y post-exposición', watts: 40, price: 320, lifeHours: 3000, maintenancePerHour: 0.06 };
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
    const state = { version: 1, demo: true, settings: st, printers: [pr1, pr2, pr3, pr4], materials: [m1, m2, m3, m4, m5], components: [c1, c2, c3, c4, c5, c6], filaments: [f1, f2, f3, f4], prints: [], sales: [], expenses: [] };
    state.expenses.push({ id: uid(), date: d(0, 1), category: 'maquinaria', description: 'Impresora Creality Ender 3 V3', amount: 229, printerId: pr2.id });
    state.expenses.push({ id: uid(), date: d(1, 5), category: 'maquinaria', description: 'Láser xTool S1 20 W', amount: 1099, printerId: pr3.id });
    state.expenses.push({ id: uid(), date: d(2, 2), category: 'maquinaria', description: 'Insoladora UV A4', amount: 320, printerId: pr4.id });
    const buyM = (m, n, date) => { m.stock += n; state.expenses.push({ id: uid(), date, category: 'materiales', description: `${fmtSheets(n)} · ${materialLabel(m)}`, amount: n * m.price, materialId: m.id }); };
    buyM(m1, 10, d(1, 6)); buyM(m2, 3, d(1, 6)); buyM(m3, 4, d(2, 3)); buyM(m5, 10, d(2, 3)); buyM(m4, 2, d(3, 10)); buyM(m1, 5, d(4, 15));
    const buy = (f, n, date) => { f.remaining += n * f.spoolWeight; state.expenses.push({ id: uid(), date, category: 'filamento', description: `${n} × ${filamentLabel(f)}`, amount: n * f.price, filamentId: f.id }); };
    const buyC = (c, packs, date) => { c.stock += packs * c.packUnits; state.expenses.push({ id: uid(), date, category: 'componentes', description: `${packs} × ${c.name}`, amount: packs * c.price, componentId: c.id }); };
    buyC(c5, 1, d(2, 3)); buyC(c6, 5, d(2, 3));
    buyC(c1, 5, d(2, 20)); buyC(c2, 1, d(0, 4)); buyC(c3, 1, d(3, 28)); buyC(c4, 1, d(4, 2));
    buy(f1, 3, d(0, 3)); buy(f2, 1, d(0, 3)); buy(f3, 1, d(1, 12)); buy(f4, 1, d(2, 5)); buy(f1, 2, d(4, 8));
    state.expenses.push({ id: uid(), date: d(0, 10), category: 'repuestos', description: 'Boquillas 0.4 mm y cama PEI', amount: 34.9 });
    state.expenses.push({ id: uid(), date: d(3, 2), category: 'embalaje', description: 'Cajas y bolsas de envío', amount: 22 });
    state.expenses.push({ id: uid(), date: d(5, 1), category: 'repuestos', description: 'Correas GT2', amount: 12.5 });
    const byId = () => Object.fromEntries(state.filaments.map((f) => [f.id, f]));
    const matsById = () => Object.fromEntries(state.materials.map((m) => [m.id, m]));
    const print = (name, date, qty, hours, items, extra = {}) => {
      const pr = extra.printer || pr1;
      const sheets = (extra.sheets || []).map(([m, w, h]) => ({ materialId: m.id, materialName: materialLabel(m), width: w, height: h, costPerCm2: sheetCostPerCm2(m) }));
      const comps = (extra.components || []).map(([c, q]) => ({ componentId: c.id, componentName: c.name, qty: q, unitCost: componentUnitCost(c) }));
      const job = { kind: extra.kind || '3d', printerId: pr.id, printerName: pr.name, sheets, components: comps, items: items.map(([f, g]) => ({ filamentId: f.id, filamentName: filamentLabel(f), grams: g })), hours, quantity: qty, laborHours: extra.labor || 0, extras: extra.extras || 0, margin: '' };
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
    sell(l5, d(5, Math.min(Number(t.slice(8, 10)), 12)), 18, 4.5, 3, 'Colegio San Jorge', 'Directo');
    sell(s1, d(2, 11), 1, 29, 0, 'Asesoría Martín', 'Directo');
    sell(s2, d(4, 1), 3, 19, 2.8, 'Lucía y Pablo', 'Etsy');
    sell(s3, d(5, Math.min(Number(t.slice(8, 10)), 9)), 2, 17, 0, 'Floristería Nube', 'Directo');
    sell(p1, d(0, 14), 2, 14.9, 2.4, 'Laura', 'Etsy'); sell(p1, d(1, 3), 2, 14.9, 1.2, '', 'Wallapop');
    sell(p2, d(1, 18), 3, 16, 3.1, 'Floristería Nube', 'Directo');
    sell(p3, d(2, 1), 1, 24, 3.8, 'Marc', 'Etsy'); sell(p4, d(2, 20), 6, 7.5, 2, '', 'Feria');
    sell(p5, d(3, 22), 2, 45, 7.6, 'Ana', 'Etsy'); sell(p8, d(4, 27), 1, 49, 6.1, 'Jordi', 'Etsy'); sell(p4, d(4, 2), 3, 7.5, 0, '', 'Directo');
    sell(p6, d(4, 18), 20, 3.5, 4.2, 'Club Ciclista', 'Directo'); sell(p7, d(5, Math.min(Number(t.slice(8, 10)), 10)), 2, 16, 2.2, '', 'Wallapop');
    return state;
  }

  // ================================================================ SERVIDOR (datos compartidos)

  let saveChain = Promise.resolve();

  /** Encola un guardado del estado actual; los guardados van de uno en uno. */
  function queueSave(msg) {
    sync.pending = true;
    updateSyncBadge();
    saveChain = saveChain.then(() => doSave(msg));
  }

  async function doSave(msg) {
    if (!sync.pending || !sync.user) return;
    sync.pending = false;
    sync.saving = true;
    updateSyncBadge();
    try {
      const r = await window.Remote.save(S, sync.version);
      Object.assign(sync, { version: r.version, updatedBy: r.updated_by, updatedAt: r.updated_at, error: '' });
      if (msg) toast(msg);
    } catch (e) {
      if (e.status === 409 && e.data) {
        // Otra persona guardó antes: se cargan sus datos para no pisarlos
        applyRemote(e.data);
        toast(`${e.data.updated_by || 'Otra persona'} guardó cambios justo antes: se han cargado sus datos. Repite tu último cambio.`, 8000);
      } else if (e.status === 401) {
        Object.assign(sync, { pending: true, error: 'Sesión caducada' });
        showLogin('Tu sesión ha caducado. Vuelve a entrar y se guardarán tus cambios.');
      } else {
        Object.assign(sync, { pending: true, error: e.message });
        toast(`No se pudo guardar en el servidor: ${e.message}`, 6000);
      }
    } finally {
      sync.saving = false;
      updateSyncBadge();
    }
  }

  function applyRemote(r) {
    S = window.Store.normalize(r.data || {});
    Object.assign(sync, { version: r.version, updatedBy: r.updated_by || '', updatedAt: r.updated_at || '', pending: false, error: '' });
    sync.ready = true;
    render();
    updateSyncBadge();
  }

  /** Comprueba si otra persona ha guardado cambios y, si es así, los carga. */
  async function pollRemote() {
    if (!remote || !sync.ready || !sync.user || sync.pending || sync.saving || modal.open || document.hidden) return;
    try {
      const r = await window.Remote.load(sync.version);
      if (r.unchanged || sync.pending || sync.saving || modal.open) return;
      applyRemote(r);
      toast(`Datos actualizados: ${r.updated_by || 'otra persona'} hizo cambios.`, 4000);
    } catch (e) {
      if (e.status === 401) showLogin('Tu sesión ha caducado. Vuelve a entrar.');
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
    const [cls, label] = sync.saving ? ['saving', 'Guardando…'] : sync.pending ? ['error', sync.error ? 'Sin guardar' : 'Pendiente'] : ['ok', 'Guardado'];
    el.innerHTML = `<span class="dot ${cls}" aria-hidden="true"></span><span>${label}</span><span class="muted">· ${esc(sync.user)}</span>
      ${sync.pending && !sync.saving && sync.error ? '<button class="btn small" id="retry-save">Reintentar</button>' : ''}`;
    const retry = $('#retry-save');
    if (retry) retry.addEventListener('click', () => queueSave('Cambios guardados'));
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
        tag.onerror = () => { googleScript = null; reject(new Error('No se pudo cargar el acceso con Google. Revisa la conexión.')); };
        document.head.appendChild(tag);
      });
    }
    return googleScript;
  }

  async function afterLogin(r) {
    sync.user = r.user;
    sync.email = r.email || '';
    $('.tabs').hidden = false;
    if (sync.pending) {
      // había cambios sin guardar antes de caducar la sesión
      sync.ready = true;
      render();
      queueSave('Cambios guardados');
    } else {
      await loadFromServer();
    }
  }

  async function showLogin(message) {
    sync.ready = false;
    $('.tabs').hidden = true;
    updateSyncBadge();
    view.innerHTML = '<div class="empty">Cargando…</div>';
    if (!authConfig) {
      try { authConfig = await window.Remote.authConfig(); } catch (e) {
        view.innerHTML = `<div class="card"><h2>No se pudo conectar con el servidor</h2><p class="small">${esc(e.message)}</p>
          <button class="btn primary" id="retry-connect">Reintentar</button></div>`;
        $('#retry-connect').addEventListener('click', () => showLogin(message));
        return;
      }
    }
    const withGoogle = authConfig.methods.includes('google') && authConfig.google_client_id;
    const withPassword = authConfig.methods.includes('password');
    view.innerHTML = `<div class="card login">
      <h1>Daprintbox</h1>
      <p class="small muted">Entra para ver y guardar los datos compartidos del taller.</p>
      ${message ? `<p class="small neg">${esc(message)}</p>` : ''}
      ${withGoogle ? '<div id="google-btn" class="google-btn"><span class="small muted">Cargando el acceso con Google…</span></div>' : ''}
      ${withGoogle && withPassword ? '<p class="login-or small muted">o con usuario y contraseña</p>' : ''}
      ${withPassword ? `<form id="login-form" novalidate>
        <div class="form-grid" style="grid-template-columns:1fr">
          <div class="field"><label for="login-user">Usuario</label><input id="login-user" name="username" autocomplete="username" required></div>
          <div class="field"><label for="login-pass">Contraseña</label><input id="login-pass" name="password" type="password" autocomplete="current-password" required></div>
        </div>
        <button class="btn${withGoogle ? '' : ' primary'}" type="submit" style="margin-top:12px">Entrar</button>
      </form>` : ''}
      <p class="small neg" id="login-error" hidden></p>
    </div>`;
    const showError = (msg) => { const el = $('#login-error'); el.textContent = msg; el.hidden = false; };

    if (withGoogle) {
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
        google.accounts.id.renderButton(box, { theme: dark ? 'filled_black' : 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'es', width: 280 });
      }).catch((e) => {
        const box = $('#google-btn');
        if (box) box.innerHTML = `<span class="small neg">${esc(e.message)}</span>`;
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
          const r = await window.Remote.login($('#login-user').value.trim(), $('#login-pass').value);
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
      <h2>La base de datos está vacía</h2>
      <p>¿Con qué datos queréis empezar? Lo que elijas se guardará en el servidor y lo verán todos los usuarios.</p>
      <div class="filters">
        ${hasLocal ? `<button class="btn primary" data-first="local">Subir los datos de este navegador (${localCount} registros)</button>` : ''}
        <button class="btn${hasLocal ? '' : ' primary'}" data-first="paste">Pegar una copia en texto</button>
        <button class="btn" data-first="empty">Empezar vacío</button>
        <button class="btn" data-first="demo">Datos de ejemplo</button>
      </div>
      <p class="small muted">¿Tenéis los datos en otro ordenador? Allí, en Ajustes → «Copia en texto», copiadlos y pegadlos aquí.</p>
    </div>`;
    const start = (state, msg) => { S = state; persist(msg); };
    $$('[data-first]', view).forEach((btn) => btn.addEventListener('click', () => {
      const kind = btn.dataset.first;
      if (kind === 'local') start({ ...local, demo: false }, 'Datos subidos al servidor');
      if (kind === 'empty') start(window.Store.emptyState(), 'Listo: empieza añadiendo tus máquinas y materiales');
      if (kind === 'demo') start(demoData(), 'Datos de ejemplo cargados');
      if (kind === 'paste') backupTextForm();
    }));
  }

  async function historyForm() {
    let r;
    try { r = await window.Remote.history(); } catch (e) { toast(e.message, 5000); return; }
    openModal({
      title: 'Historial de versiones',
      submitLabel: 'Cerrar',
      hideCancel: true,
      body: `<p class="small muted">Cada vez que alguien guarda se crea una versión. Si algo se ha borrado o estropeado, restaura una anterior: se guardará como versión nueva y la actual seguirá en el historial.</p>
        ${r.versions.length ? `<div class="table-wrap"><table>
          <thead><tr><th class="num">Versión</th><th>Fecha</th><th>Usuario</th><th class="num">Tamaño</th><th></th></tr></thead>
          <tbody>${r.versions.map((v) => `<tr><td class="num">${v.version}</td><td class="nowrap">${esc(fmtDateTime(v.saved_at))}</td><td>${esc(v.saved_by)}</td>
            <td class="num">${fmtNum(v.bytes / 1024, 1)} KB</td>
            <td class="actions">${v.version === sync.version ? '<span class="badge ok">Actual</span>' : `<button type="button" class="btn small" data-restore="${v.version}">Restaurar</button>`}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="muted">Todavía no hay versiones guardadas.</p>'}`,
      onOpen: (b) => {
        $$('[data-restore]', b).forEach((btn) => btn.addEventListener('click', async () => {
          try {
            const h = await window.Remote.historyGet(btn.dataset.restore);
            askConfirm(`¿Restaurar la versión ${h.version} (${fmtDateTime(h.saved_at)}, ${h.saved_by})?\nSe guardará como una versión nueva; la actual seguirá en el historial.`, () => {
              S = window.Store.normalize(h.data);
              persist(`Versión ${h.version} restaurada`);
            }, 'Restaurar');
          } catch (e) { toast(e.message, 5000); }
        }));
      },
      onSubmit: () => {},
    });
  }

  async function startRemote() {
    view.innerHTML = '<div class="empty">Conectando con el servidor…</div>';
    updateSyncBadge();
    try {
      const me = await window.Remote.me();
      sync.user = me.user;
      sync.email = me.email || '';
      await loadFromServer();
    } catch (e) {
      if (e.status === 401) { showLogin(); return; }
      view.innerHTML = `<div class="card"><h2>No se pudo conectar con el servidor</h2><p class="small">${esc(e.message)}</p>
        <button class="btn primary" id="retry-connect">Reintentar</button></div>`;
      $('#retry-connect').addEventListener('click', startRemote);
    }
  }

  if (remote) {
    setInterval(pollRemote, 15000);
    document.addEventListener('visibilitychange', pollRemote);
    window.addEventListener('focus', pollRemote);
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
    view.innerHTML = (S.demo ? `<div class="demo-banner" role="note"><span><b>Datos de ejemplo.</b> Explora la app con libertad; cuando quieras, empieza con los tuyos.</span>
      <button class="btn small" data-action="start-fresh">Empezar con mis datos</button></div>` : '') + VIEWS[v]();
    wireChart();
    if (v === 'settings') wireSettings();
  }

  function wireSettings() {
    $('#settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      Object.keys(window.Store.DEFAULT_SETTINGS).forEach((k) => {
        if (!fd.has(k)) return;
        S.settings[k] = k === 'currency' ? fd.get(k) : num(fd.get(k));
      });
      persist('Ajustes guardados');
    });
    $('#theme-select').addEventListener('change', (e) => { safeSet('daprintbox:theme', e.target.value); applyTheme(); });
    $('#import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then((txt) => {
        const data = JSON.parse(txt);
        if (!data || !Array.isArray(data.filaments)) throw new Error('formato');
        askConfirm('Esto reemplazará todos los datos actuales por los de la copia. ¿Continuar?', () => {
          S = window.Store.normalize(data);
          persist('Copia importada');
        }, 'Importar');
      }).catch(() => toast('El archivo no es una copia válida de Daprintbox.'));
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
      askConfirm(`¿Eliminar "${materialLabel(m)}"? Los trabajos que lo usan conservan su coste.`, () => {
        S.materials = S.materials.filter((x) => x.id !== id);
        persist('Material eliminado');
      });
    },
    'new-component': () => componentForm(),
    'edit-component': (id) => componentForm(find(S.components, id)),
    'restock-component': (id) => restockComponentForm(find(S.components, id)),
    'delete-component': (id) => {
      const c = find(S.components, id);
      askConfirm(`¿Eliminar "${c.name}"? Las impresiones que lo usan conservan su coste.`, () => {
        S.components = S.components.filter((x) => x.id !== id);
        persist('Componente eliminado');
      });
    },
    'edit-filament': (id) => filamentForm(find(S.filaments, id)),
    'restock': (id) => restockForm(find(S.filaments, id)),
    'delete-filament': (id) => {
      const f = find(S.filaments, id);
      askConfirm(`¿Eliminar "${f.name}"? Las impresiones y gastos registrados se conservan.`, () => {
        S.filaments = S.filaments.filter((x) => x.id !== id);
        persist('Filamento eliminado');
      });
    },
    'new-printer': () => printerForm(),
    'edit-printer': (id) => printerForm(findPrinter(id)),
    'default-printer': (id) => { S.settings.defaultPrinterId = id; persist('Máquina predeterminada cambiada'); },
    'delete-printer': (id) => {
      const pr = findPrinter(id);
      const jobs = S.prints.filter((p) => p.printerId === id).length;
      askConfirm(`¿Eliminar "${pr.name}"?` + (jobs ? `\nSus ${jobs} trabajo(s) conservan el coste ya calculado.` : ''), () => {
        S.printers = S.printers.filter((x) => x.id !== id);
        if (S.settings.defaultPrinterId === id) S.settings.defaultPrinterId = S.printers[0] ? S.printers[0].id : '';
        persist('Máquina eliminada');
      });
    },
    'new-print': () => printForm(),
    'quote': () => printForm(null, { quoteOnly: true }),
    'edit-print': (id) => printForm(find(S.prints, id)),
    'delete-print': (id) => {
      const p = find(S.prints, id);
      const linked = S.sales.filter((s) => s.printId === id).length;
      const msg = `¿Eliminar el trabajo "${p.name}"?` + (p.stockDeducted ? '\nEl material y los componentes usados se devolverán al stock.' : '') + (linked ? `\nTiene ${linked} venta(s) asociada(s): se conservarán como ventas libres.` : '');
      askConfirm(msg, () => {
        if (p.stockDeducted) applyJobStock(p, +1);
        S.sales.forEach((s) => { if (s.printId === id) { s.printId = null; s.costFromPrint = false; } });
        S.prints = S.prints.filter((x) => x.id !== id);
        persist('Trabajo eliminado');
      });
    },
    'sell-print': (id) => saleForm(null, id),
    'new-sale': () => saleForm(),
    'edit-sale': (id) => saleForm(find(S.sales, id)),
    'delete-sale': (id) => {
      askConfirm('¿Eliminar esta venta?', () => {
        S.sales = S.sales.filter((x) => x.id !== id);
        persist('Venta eliminada');
      });
    },
    'new-expense': () => expenseForm(),
    'edit-expense': (id) => expenseForm(find(S.expenses, id)),
    'delete-expense': (id) => {
      askConfirm('¿Eliminar este gasto?', () => {
        S.expenses = S.expenses.filter((x) => x.id !== id);
        persist('Gasto eliminado');
      });
    },
    'export-json': () => download(`daprintbox-copia-${today()}.json`, JSON.stringify(S, null, 2), 'application/json'),
    'import-json': () => $('#import-file').click(),
    'export-csv': (id, el) => exportCSV(el.dataset.kind),
    'load-demo': () => {
      const hasData = S.printers.length || S.materials.length || S.components.length || S.filaments.length || S.prints.length || S.sales.length || S.expenses.length;
      const load = () => { S = demoData(); persist('Datos de ejemplo cargados'); };
      if (hasData && !S.demo) askConfirm('Los datos de ejemplo reemplazarán tus datos actuales. ¿Continuar?', load, 'Cargar ejemplo');
      else load();
    },
    'reset': () => {
      askConfirm('¿Borrar TODOS los datos? Esta acción no se puede deshacer (guarda una copia antes).', () => {
        S = window.Store.emptyState();
        persist('Datos borrados');
      }, 'Borrar todo');
    },
    'start-fresh': () => {
      askConfirm('Se borrarán los datos de ejemplo para que empieces con los tuyos.', () => {
        S = window.Store.emptyState();
        location.hash = 'dashboard';
        persist('Listo: empieza añadiendo tu impresora y tus filamentos');
      }, 'Empezar desde cero');
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
    'logout': async () => {
      if (sync.pending || sync.saving) { toast('Espera a que se guarden los cambios antes de salir.', 4000); return; }
      try { await window.Remote.logout(); } catch (e) { /* la sesión ya no existe */ }
      if (window.google && window.google.accounts) window.google.accounts.id.disableAutoSelect();
      Object.assign(sync, { user: null, email: '', ready: false, version: 0 });
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
