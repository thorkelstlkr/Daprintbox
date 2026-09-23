/*
 * Daprintbox — interfaz: vistas, formularios y gráfico.
 */
(function () {
  'use strict';

  const { num, printCost, costPerGram, gramsByFilament, soldByPrint, saleTotals, summary, lastMonths, monthlySeries } = window.Calc;
  const { uid, today } = window.Store;

  let S = window.Store.load();
  const ui = { period: 'month', salesPeriod: 'all', expensesPeriod: 'all', filamentQuery: '' };

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

  function persist(msg) {
    if (!window.Store.save(S)) toast('No se pudo guardar en este navegador. Exporta una copia desde Ajustes.');
    else if (msg) toast(msg);
    render();
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /** Suma (sign=+1) o descuenta (sign=-1) del stock los gramos de un trabajo. */
  function applyStock(items, sign) {
    const byId = filamentsById();
    Object.entries(gramsByFilament(items)).forEach(([id, g]) => {
      if (byId[id]) byId[id].remaining = Math.round((num(byId[id].remaining) + sign * g) * 10) / 10;
    });
  }

  // ---------------------------------------------------------------- modal

  const modal = $('#modal');
  let modalSubmit = null;

  function openModal({ title, body, submitLabel = 'Guardar', onOpen, onSubmit }) {
    $('#modal-title').textContent = title;
    // cuerpo nuevo en cada apertura para no acumular listeners de formularios anteriores
    const old = $('#modal-body');
    const fresh = old.cloneNode(false);
    old.replaceWith(fresh);
    fresh.innerHTML = body;
    $('#modal-submit').textContent = submitLabel;
    modalSubmit = onSubmit;
    modal.showModal();
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
        <p>Empieza añadiendo tus <b>impresoras</b> y tus <b>filamentos</b> (con su precio y stock), registra cada <b>impresión</b> para calcular su coste y descontar el material, y apunta tus <b>ventas</b> para ver tu beneficio real.</p>
        <div class="filters"><button class="btn primary" data-action="new-printer">Añadir impresora</button>
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
        <div class="kpi"><div class="label">Stock de filamento</div><div class="value">${fmtGrams(stockGrams)}</div>
          <div class="sub">Valor ${money(stockValue)} · ${S.filaments.length} bobinas</div></div>
      </div>

      <div class="card">
        <h2>Ingresos vs. gastos · últimos 12 meses</h2>
        ${barChart(series)}
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h2>Stock bajo</h2>
          ${low.length ? `<ul class="alert-list">${low.map((f) => `
            <li><span><span class="swatch" style="background:${esc(f.color || '#999')}"></span>${esc(filamentLabel(f))}</span>
              <span class="nowrap"><span class="badge low">⚠ ${fmtGrams(f.remaining)}</span>
              <button class="btn small" data-action="restock" data-id="${f.id}">Reponer</button></span></li>`).join('')}</ul>`
            : `<p class="muted">✓ Todo el filamento está por encima del mínimo.</p>`}
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

  // ================================================================ IMPRESORAS

  function viewPrinters() {
    const stats = window.Calc.printerStats(S);
    const dp = defaultPrinter();
    return `
      <div class="page-head">
        <h1>Impresoras</h1>
        <div class="actions"><button class="btn primary" data-action="new-printer">+ Nueva impresora</button></div>
      </div>
      <div class="card">
        ${S.printers.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Impresora</th><th class="num">Consumo</th><th class="num">Precio</th><th class="num">Coste / hora</th>
            <th>Vida útil usada</th><th class="num">Trabajos</th><th class="num">Ingresos</th><th class="num">Beneficio</th><th></th></tr></thead>
          <tbody>${S.printers.map((pr) => {
            const st = stats[pr.id] || { hours: 0, jobs: 0, revenue: 0, profit: 0 };
            const life = num(pr.lifeHours);
            const pct = life > 0 ? Math.min(100, (st.hours / life) * 100) : 0;
            const isDefault = dp && dp.id === pr.id;
            return `<tr>
              <td><b>${esc(pr.name)}</b> ${isDefault ? '<span class="badge ok">★ Predeterminada</span>' : ''}
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
        </table></div>` : `<div class="empty">Añade tus impresoras para que cada impresión use su propio consumo, amortización y mantenimiento.</div>`}
      </div>
      <p class="small muted">Coste / hora = amortización (precio ÷ vida útil) + mantenimiento + electricidad (consumo × ${money(S.settings.kwhPrice)}/kWh). Ingresos y beneficio salen de las ventas de piezas impresas en cada impresora. Cambiar una impresora no modifica el coste de impresiones ya registradas.</p>`;
  }

  function printerForm(pr) {
    const isNew = !pr;
    const st = S.settings;
    pr = pr || { name: '', notes: '', watts: st.printerWatts, price: st.printerPrice, lifeHours: st.printerLifeHours, maintenancePerHour: st.maintenancePerHour };
    openModal({
      title: isNew ? 'Nueva impresora' : 'Editar impresora',
      body: `<div class="form-grid">
        ${field('Nombre *', inp('name', pr.name, 'required placeholder="Ej. Bambu Lab P1S"'), { wide: true })}
        ${field('Consumo medio (W) *', numInp('watts', pr.watts, 'required min="0"'), { hint: 'Ender/Prusa ≈ 80–150 W; con cámara cerrada más.' })}
        ${field('Precio de compra *', numInp('price', pr.price, 'required min="0"'))}
        ${field('Vida útil estimada (h) *', numInp('lifeHours', pr.lifeHours, 'required min="1"'), { hint: 'Horas en las que la amortizas.' })}
        ${field('Mantenimiento (/h)', numInp('maintenancePerHour', pr.maintenancePerHour, 'min="0"'), { hint: 'Boquillas, correas, PEI…' })}
        ${field('Notas', inp('notes', pr.notes, 'placeholder="Boquilla 0.4, cama PEI…"'), { wide: true })}
        ${isNew ? `${field('Fecha de compra', `<input type="date" name="date" value="${today()}">`)}
          <div class="field wide"><label class="check"><input type="checkbox" name="asExpense"> Registrar la compra como gasto (Impresoras y herramientas)</label></div>` : ''}
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
          name: val(b, 'name'), notes: val(b, 'notes'), watts: num(val(b, 'watts')), price: num(val(b, 'price')),
          lifeHours: num(val(b, 'lifeHours')), maintenancePerHour: num(val(b, 'maintenancePerHour')),
        };
        if (data.lifeHours <= 0) { toast('La vida útil debe ser mayor que 0.'); return false; }
        if (isNew) {
          const np = { id: uid(), ...data };
          S.printers.push(np);
          if (!findPrinter(S.settings.defaultPrinterId)) S.settings.defaultPrinterId = np.id;
          if (checked(b, 'asExpense') && data.price > 0) {
            S.expenses.push({ id: uid(), date: val(b, 'date') || today(), category: 'maquinaria', description: `Impresora ${data.name}`, amount: data.price, printerId: np.id });
          }
          persist('Impresora añadida');
        } else {
          Object.assign(pr, data);
          S.prints.forEach((p) => { if (p.printerId === pr.id) p.printerName = pr.name; });
          persist('Impresora actualizada');
        }
      },
    });
  }

  // ================================================================ IMPRESIONES

  function viewPrints() {
    const sold = soldByPrint(S.sales);
    const list = [...S.prints].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return `
      <div class="page-head">
        <h1>Impresiones</h1>
        <div class="actions">
          <button class="btn" data-action="quote">Calculadora de coste</button>
          <button class="btn primary" data-action="new-print">+ Registrar impresión</button>
        </div>
      </div>
      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Fecha</th><th>Pieza</th><th class="num">Uds.</th><th class="num">Filamento</th><th class="num">Tiempo</th>
            <th class="num">Coste total</th><th class="num">Coste ud.</th><th class="num">PVP sugerido</th><th class="num">Vendidas</th><th></th></tr></thead>
          <tbody>${list.map((p) => {
            const c = p.cost || {};
            const g = (p.items || []).reduce((s, it) => s + num(it.grams), 0);
            const s = num(sold[p.id]);
            return `<tr>
              <td class="nowrap">${fmtDate(p.date)}</td>
              <td><b>${esc(p.name)}</b><div class="small muted">${esc([p.printerName, (p.items || []).map((it) => it.filamentName).join(', ')].filter(Boolean).join(' · '))}</div></td>
              <td class="num">${fmtNum(p.quantity)}</td>
              <td class="num">${fmtGrams(g)}</td>
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
        </table></div>` : `<div class="empty">Registra tu primera impresión para calcular su coste y descontar el filamento usado.</div>`}
      </div>
      <p class="small muted">El coste incluye material, electricidad (consumo de cada impresora a ${money(S.settings.kwhPrice)}/kWh), amortización y mantenimiento de la impresora usada, mano de obra, extras y un ${fmtNum(S.settings.failureRate)} % por fallos. Cámbialo en Impresoras y Ajustes.</p>`;
  }

  function filamentOptions(selected) {
    return `<option value="">— Elige filamento —</option>` + S.filaments
      .map((f) => `<option value="${f.id}"${f.id === selected ? ' selected' : ''}>${esc(filamentLabel(f))} (${fmtGrams(f.remaining)})</option>`).join('');
  }

  function printForm(p, { quoteOnly = false } = {}) {
    const isNew = !p;
    if (!S.printers.length && !quoteOnly) {
      toast('Primero añade tu impresora.');
      return printerForm();
    }
    if (!S.filaments.length && !quoteOnly) {
      toast('Primero añade al menos un filamento.');
      return filamentForm();
    }
    const dp = defaultPrinter();
    p = p || { printerId: dp ? dp.id : '', name: '', date: today(), quantity: 1, hours: 2, items: [{ filamentId: S.filaments[0] ? S.filaments[0].id : '', grams: 50 }], laborHours: 0, extras: 0, margin: '', notes: '', stockDeducted: true };
    const h = Math.floor(num(p.hours)), m = Math.round((num(p.hours) - h) * 60);
    const printerMissing = !isNew && p.printerId && !findPrinter(p.printerId);
    const selPrinterId = findPrinter(p.printerId) ? p.printerId : (dp ? dp.id : '');
    const printerField = S.printers.length
      ? field('Impresora', `<select name="printerId">${S.printers.map((pr) =>
          `<option value="${pr.id}"${pr.id === selPrinterId ? ' selected' : ''}>${esc(pr.name)} · ${money(printerHourCost(pr))}/h</option>`).join('')}</select>`,
          { wide: true, hint: printerMissing ? `⚠ La impresora original (${esc(p.printerName || '')}) se eliminó; elige otra.` : 'Cada impresora tiene su consumo, amortización y mantenimiento.' })
      : '';

    const itemRow = (it) => `<div class="item-row">
        <select name="item-filament" aria-label="Filamento">${filamentOptions(it.filamentId)}</select>
        <input name="item-grams" type="number" step="any" min="0" value="${esc(it.grams)}" aria-label="Gramos" placeholder="g">
        <button type="button" class="icon-btn" data-remove-item aria-label="Quitar">✕</button></div>`;

    openModal({
      title: quoteOnly ? 'Calculadora de coste' : isNew ? 'Registrar impresión' : 'Editar impresión',
      submitLabel: quoteOnly ? 'Guardar como impresión' : 'Guardar',
      body: `<div class="form-grid">
          ${field('Pieza *', inp('name', p.name, 'required placeholder="Ej. Soporte móvil"'), { wide: true })}
          ${printerField}
          ${field('Fecha', `<input type="date" name="date" value="${esc(p.date)}">`)}
          ${field('Unidades producidas', numInp('quantity', p.quantity, 'min="1" step="1"'), { hint: 'Piezas que salen de este trabajo.' })}
          ${field('Horas', numInp('h', h, 'min="0" step="1"'))}
          ${field('Minutos', numInp('m', m, 'min="0" max="59" step="1"'), { hint: 'Tiempo total de impresión.' })}
        </div>
        <h3 class="section-title">Filamento usado (gramos totales, según el laminador)</h3>
        <div class="items-list" id="items">${(p.items.length ? p.items : [{ filamentId: '', grams: '' }]).map(itemRow).join('')}</div>
        <button type="button" class="btn small" id="add-item" style="margin-top:8px">+ Añadir otro filamento</button>
        <h3 class="section-title">Otros costes</h3>
        <div class="form-grid">
          ${field('Mano de obra (h)', numInp('laborHours', p.laborHours, 'min="0"'), { hint: `Post-procesado a ${money(S.settings.laborRate)}/h` })}
          ${field('Extras (€)', numInp('extras', p.extras, 'min="0"'), { hint: 'Tornillos, imanes, embalaje…' })}
          ${field('Margen (%)', numInp('margin', p.margin, `placeholder="${S.settings.defaultMargin}"`), { hint: 'Para el precio sugerido.' })}
          ${field('Notas', inp('notes', p.notes))}
          ${quoteOnly || isNew ? `<div class="field wide"><label class="check"><input type="checkbox" name="deduct" ${quoteOnly ? '' : 'checked'}> Descontar el filamento del stock</label></div>` : ''}
        </div>
        <div class="card" style="margin:16px 0 0" id="preview"></div>`,
      onOpen: (b) => {
        const readItems = () => $$('.item-row', b).map((row) => {
          const id = $('[name="item-filament"]', row).value;
          const f = S.filaments.find((x) => x.id === id);
          return { filamentId: id, filamentName: f ? filamentLabel(f) : '', grams: num($('[name="item-grams"]', row).value) };
        }).filter((it) => it.filamentId && it.grams > 0);
        const readJob = () => ({
          printerId: val(b, 'printerId'),
          items: readItems(),
          hours: num(val(b, 'h')) + num(val(b, 'm')) / 60,
          quantity: Math.max(1, Math.floor(num(val(b, 'quantity'))) || 1),
          laborHours: num(val(b, 'laborHours')),
          extras: num(val(b, 'extras')),
          margin: val(b, 'margin'),
        });
        const refresh = () => {
          const job = readJob();
          const pr = findPrinter(job.printerId);
          const c = printCost(job, filamentsById(), S.settings, pr);
          // stock disponible teniendo en cuenta lo que este trabajo ya descontó
          const prev = !isNew && p.stockDeducted ? gramsByFilament(p.items) : {};
          const short = Object.entries(gramsByFilament(job.items))
            .map(([id, g]) => ({ f: S.filaments.find((x) => x.id === id), g }))
            .filter(({ f, g }) => f && g > num(f.remaining) + num(prev[f.id]));
          $('#preview', b).innerHTML = `
            <dl class="breakdown">
              <dt>Material</dt><dd>${money(c.material)}</dd>
              <dt>Electricidad${pr ? ` (${fmtNum(pr.watts)} W)` : ''}</dt><dd>${money(c.electricity)}</dd>
              <dt>Amortización y mantenimiento${pr ? ` · ${esc(pr.name)}` : ''}</dt><dd>${money(c.machine)}</dd>
              <dt>Mano de obra</dt><dd>${money(c.labor)}</dd>
              <dt>Extras</dt><dd>${money(c.extras)}</dd>
              <dt>Margen de fallos (${fmtNum(S.settings.failureRate)} %)</dt><dd>${money(c.failure)}</dd>
              <dt class="total">Coste total (${c.quantity} uds.)</dt><dd class="total">${money(c.total)}</dd>
            </dl>
            <div class="price-box">
              <div><div class="small muted">Coste por unidad</div><strong>${money(c.unit)}</strong></div>
              <div><div class="small muted">Precio sugerido (+${fmtNum(c.margin)} %)</div><strong>${money(c.suggestedUnitPrice)}</strong></div>
            </div>
            ${short.length ? `<p class="small neg">⚠ Stock insuficiente: ${short.map(({ f }) => esc(f.name) + ' (' + fmtGrams(f.remaining) + ')').join(', ')}</p>` : ''}`;
        };
        b.addEventListener('input', refresh);
        b.addEventListener('change', refresh);
        b.addEventListener('click', (e) => {
          if (e.target.closest('[data-remove-item]')) {
            const rows = $$('.item-row', b);
            if (rows.length > 1) e.target.closest('.item-row').remove();
            refresh();
          }
        });
        $('#add-item', b).addEventListener('click', () => {
          $('#items', b).insertAdjacentHTML('beforeend', itemRow({ filamentId: '', grams: '' }));
          refresh();
        });
        b._readJob = readJob;
        refresh();
      },
      onSubmit: (b) => {
        const job = b._readJob();
        if (!job.items.length && !job.hours) { toast('Indica el filamento usado o el tiempo de impresión.'); return false; }
        const pr = findPrinter(job.printerId);
        const cost = printCost(job, filamentsById(), S.settings, pr);
        const data = { ...job, printerName: pr ? pr.name : '', name: val(b, 'name'), date: val(b, 'date') || today(), notes: val(b, 'notes'), cost };
        if (isNew) {
          const deduct = checked(b, 'deduct');
          if (deduct) applyStock(data.items, -1);
          S.prints.push({ id: uid(), ...data, stockDeducted: deduct });
          persist(deduct ? 'Impresión registrada y stock actualizado' : 'Impresión registrada');
        } else {
          if (p.stockDeducted) { applyStock(p.items, +1); applyStock(data.items, -1); }
          Object.assign(p, data);
          // actualizar el coste en las ventas ligadas que no se hayan modificado a mano
          S.sales.forEach((s) => { if (s.printId === p.id && s.costFromPrint) s.unitCost = cost.unit; });
          persist('Impresión actualizada');
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
        ${field('Pieza impresa', `<select name="printId"><option value="">— Venta libre (sin impresión registrada) —</option>${prints.map((p) =>
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
    electricidad: 'Electricidad',
    repuestos: 'Repuestos y mantenimiento',
    maquinaria: 'Impresoras y herramientas',
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
        <h2>Costes de impresión</h2>
        <div class="form-grid">
          ${field('Moneda', `<select name="currency">${['EUR', 'USD', 'MXN', 'ARS', 'COP', 'CLP', 'GBP'].map((c) => `<option${c === st.currency ? ' selected' : ''}>${c}</option>`).join('')}</select>`)}
          ${field('Precio electricidad (/kWh)', numInp('kwhPrice', st.kwhPrice, 'min="0"'))}
          ${field('Mano de obra (/h)', numInp('laborRate', st.laborRate, 'min="0"'))}
          ${field('Margen por fallos (%)', numInp('failureRate', st.failureRate, 'min="0"'))}
          ${field('Margen de beneficio por defecto (%)', numInp('defaultMargin', st.defaultMargin, 'min="0"'))}
          ${field('Aviso de stock bajo (g)', numInp('lowStockGrams', st.lowStockGrams, 'min="0"'))}
        </div>
        <p class="small muted">El consumo, precio, vida útil y mantenimiento de cada máquina se configuran en <a href="#printers">Impresoras</a>.</p>
        <button class="btn primary" type="submit">Guardar ajustes</button>
      </form>

      <div class="card">
        <h2>Apariencia</h2>
        <div class="filters">${field('Tema', `<select id="theme-select">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([k, v]) => `<option value="${k}"${k === theme ? ' selected' : ''}>${v}</option>`).join('')}</select>`)}</div>
      </div>

      <div class="card">
        <h2>Datos</h2>
        <p class="small muted">Los datos se guardan en este navegador. Guarda una copia de seguridad a menudo para no perderlos o para pasarlos a otro dispositivo. Si los botones de descarga no hacen nada (algunos visores web los bloquean), usa «Copia en texto».</p>
        <div class="filters">
          <button class="btn" data-action="backup-text">Copia en texto (copiar / pegar)</button>
          <button class="btn" data-action="export-json">⬇ Exportar copia (JSON)</button>
          <button class="btn" data-action="import-json">⬆ Importar copia</button>
          <button class="btn" data-action="export-csv" data-kind="sales">Ventas CSV</button>
          <button class="btn" data-action="export-csv" data-kind="expenses">Gastos CSV</button>
          <button class="btn" data-action="export-csv" data-kind="filaments">Filamentos CSV</button>
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
    const pr1 = { id: uid(), name: 'Bambu Lab P1S', notes: 'Cerrada · AMS', watts: 110, price: 699, lifeHours: 6000, maintenancePerHour: 0.08 };
    const pr2 = { id: uid(), name: 'Creality Ender 3 V3', notes: 'Boquilla 0.4', watts: 150, price: 229, lifeHours: 4000, maintenancePerHour: 0.05 };
    st.defaultPrinterId = pr1.id;
    const state = { version: 1, demo: true, settings: st, printers: [pr1, pr2], filaments: [f1, f2, f3, f4], prints: [], sales: [], expenses: [] };
    state.expenses.push({ id: uid(), date: d(0, 1), category: 'maquinaria', description: 'Impresora Creality Ender 3 V3', amount: 229, printerId: pr2.id });
    const buy = (f, n, date) => { f.remaining += n * f.spoolWeight; state.expenses.push({ id: uid(), date, category: 'filamento', description: `${n} × ${filamentLabel(f)}`, amount: n * f.price, filamentId: f.id }); };
    buy(f1, 3, d(0, 3)); buy(f2, 1, d(0, 3)); buy(f3, 1, d(1, 12)); buy(f4, 1, d(2, 5)); buy(f1, 2, d(4, 8));
    state.expenses.push({ id: uid(), date: d(0, 10), category: 'repuestos', description: 'Boquillas 0.4 mm y cama PEI', amount: 34.9 });
    state.expenses.push({ id: uid(), date: d(3, 2), category: 'embalaje', description: 'Cajas y bolsas de envío', amount: 22 });
    state.expenses.push({ id: uid(), date: d(5, 1), category: 'repuestos', description: 'Correas GT2', amount: 12.5 });
    const byId = () => Object.fromEntries(state.filaments.map((f) => [f.id, f]));
    const print = (name, date, qty, hours, items, extra = {}) => {
      const pr = extra.printer || pr1;
      const job = { printerId: pr.id, printerName: pr.name, items: items.map(([f, g]) => ({ filamentId: f.id, filamentName: filamentLabel(f), grams: g })), hours, quantity: qty, laborHours: extra.labor || 0, extras: extra.extras || 0, margin: '' };
      const p = { id: uid(), name, date, notes: '', ...job, cost: printCost(job, byId(), st, pr), stockDeducted: true };
      job.items.forEach((it) => { byId()[it.filamentId].remaining -= it.grams; });
      state.prints.push(p);
      return p;
    };
    const sell = (p, date, qty, price, fees, customer, channel) => state.sales.push({ id: uid(), date, printId: p.id, description: p.name, quantity: qty, unitPrice: price, fees, unitCost: p.cost.unit, customer, channel, costFromPrint: true });
    const p1 = print('Soporte de auriculares', d(0, 6), 4, 14, [[f1, 520]], { labor: 0.5, printer: pr2 });
    const p2 = print('Maceta geométrica', d(1, 2), 3, 9.5, [[f3, 390]], { extras: 1.5 });
    const p3 = print('Organizador de escritorio', d(1, 20), 2, 11, [[f1, 610], [f2, 120]], { labor: 1 });
    const p4 = print('Fundas flexibles', d(2, 9), 10, 6, [[f4, 330]], { extras: 2, printer: pr2 });
    const p5 = print('Lámpara lunar', d(3, 15), 2, 18, [[f2, 480]], { extras: 12, labor: 1, printer: pr2 });
    const p6 = print('Llaveros personalizados', d(4, 11), 25, 5, [[f1, 150], [f3, 90]], { labor: 1.5 });
    const p7 = print('Maceta geométrica', d(5, 4), 4, 12.5, [[f3, 450]], { extras: 2 });
    sell(p1, d(0, 14), 2, 14.9, 2.4, 'Laura', 'Etsy'); sell(p1, d(1, 3), 2, 14.9, 1.2, '', 'Wallapop');
    sell(p2, d(1, 18), 3, 16, 3.1, 'Floristería Nube', 'Directo');
    sell(p3, d(2, 1), 1, 24, 3.8, 'Marc', 'Etsy'); sell(p4, d(2, 20), 6, 7.5, 2, '', 'Feria');
    sell(p5, d(3, 22), 2, 45, 7.6, 'Ana', 'Etsy'); sell(p4, d(4, 2), 3, 7.5, 0, '', 'Directo');
    sell(p6, d(4, 18), 20, 3.5, 4.2, 'Club Ciclista', 'Directo'); sell(p7, d(5, Math.min(Number(t.slice(8, 10)), 10)), 2, 16, 2.2, '', 'Wallapop');
    return state;
  }

  // ================================================================ ENRUTADO Y EVENTOS

  const VIEWS = { dashboard: viewDashboard, filaments: viewFilaments, printers: viewPrinters, prints: viewPrints, sales: viewSales, expenses: viewExpenses, settings: viewSettings };
  const currentView = () => { const v = location.hash.slice(1); return VIEWS[v] ? v : 'dashboard'; };

  function render() {
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
    'default-printer': (id) => { S.settings.defaultPrinterId = id; persist('Impresora predeterminada cambiada'); },
    'delete-printer': (id) => {
      const pr = findPrinter(id);
      const jobs = S.prints.filter((p) => p.printerId === id).length;
      askConfirm(`¿Eliminar "${pr.name}"?` + (jobs ? `\nSus ${jobs} impresión(es) conservan el coste ya calculado.` : ''), () => {
        S.printers = S.printers.filter((x) => x.id !== id);
        if (S.settings.defaultPrinterId === id) S.settings.defaultPrinterId = S.printers[0] ? S.printers[0].id : '';
        persist('Impresora eliminada');
      });
    },
    'new-print': () => printForm(),
    'quote': () => printForm(null, { quoteOnly: true }),
    'edit-print': (id) => printForm(find(S.prints, id)),
    'delete-print': (id) => {
      const p = find(S.prints, id);
      const linked = S.sales.filter((s) => s.printId === id).length;
      const msg = `¿Eliminar la impresión "${p.name}"?` + (p.stockDeducted ? '\nEl filamento usado se devolverá al stock.' : '') + (linked ? `\nTiene ${linked} venta(s) asociada(s): se conservarán como ventas libres.` : '');
      askConfirm(msg, () => {
        if (p.stockDeducted) applyStock(p.items, +1);
        S.sales.forEach((s) => { if (s.printId === id) { s.printId = null; s.costFromPrint = false; } });
        S.prints = S.prints.filter((x) => x.id !== id);
        persist('Impresión eliminada');
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
      const hasData = S.printers.length || S.filaments.length || S.prints.length || S.sales.length || S.expenses.length;
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

  // Primera visita: se abre con datos de ejemplo para ver la app funcionando.
  if (!safeGet('daprintbox:v1')) {
    S = demoData();
    window.Store.save(S);
  }

  applyTheme();
  render();
})();
