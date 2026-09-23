/*
 * Estado de la aplicación y persistencia en localStorage.
 */
(function (root) {
  'use strict';

  const KEY = 'daprintbox:v1';

  const DEFAULT_SETTINGS = {
    currency: 'EUR',
    kwhPrice: 0.18,          // €/kWh
    printerWatts: 120,       // consumo medio en W
    printerPrice: 400,       // precio de la impresora
    printerLifeHours: 5000,  // horas de vida útil estimadas
    maintenancePerHour: 0.05,// boquillas, correas, lubricante... €/h
    laborRate: 10,           // €/h de mano de obra (post-procesado, preparación)
    failureRate: 10,         // % extra por impresiones fallidas
    defaultMargin: 60,       // % de margen sobre coste para el precio sugerido
    lowStockGrams: 200,      // aviso de stock bajo por defecto
  };

  const emptyState = () => ({
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    filaments: [],
    prints: [],
    sales: [],
    expenses: [],
  });

  function normalize(data) {
    const base = emptyState();
    if (!data || typeof data !== 'object') return base;
    return {
      version: 1,
      settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
      filaments: Array.isArray(data.filaments) ? data.filaments : [],
      prints: Array.isArray(data.prints) ? data.prints : [],
      sales: Array.isArray(data.sales) ? data.sales : [],
      expenses: Array.isArray(data.expenses) ? data.expenses : [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : emptyState();
    } catch (e) {
      return emptyState();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const today = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  root.Store = { load, save, normalize, emptyState, uid, today, DEFAULT_SETTINGS };
})(window);
