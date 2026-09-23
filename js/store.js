/*
 * Estado de la aplicación y persistencia en localStorage.
 */
(function (root) {
  'use strict';

  const KEY = 'daprintbox:v1';

  const DEFAULT_SETTINGS = {
    currency: 'EUR',
    kwhPrice: 0.18,          // €/kWh
    // Valores iniciales para una impresora nueva (y para migrar datos antiguos)
    printerWatts: 120,       // consumo medio en W
    printerPrice: 400,       // precio de la impresora
    printerLifeHours: 5000,  // horas de vida útil estimadas
    maintenancePerHour: 0.05,// boquillas, correas, lubricante... €/h
    defaultPrinterId: '',    // impresora preseleccionada al registrar impresiones
    laborRate: 10,           // €/h de mano de obra (post-procesado, preparación)
    failureRate: 10,         // % extra por impresiones fallidas
    defaultMargin: 60,       // % de margen sobre coste para el precio sugerido
    lowStockGrams: 200,      // aviso de stock bajo por defecto
    sheetWaste: 15,          // % de plancha que se pierde (márgenes, kerf, recortes)
  };

  const emptyState = () => ({
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    printers: [],
    filaments: [],
    components: [],
    materials: [],
    prints: [],
    sales: [],
    expenses: [],
  });

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /** Impresora creada a partir de los valores de ajustes. */
  const printerFromSettings = (settings, name) => ({
    id: uid(),
    name: name || 'Mi impresora',
    watts: settings.printerWatts,
    price: settings.printerPrice,
    lifeHours: settings.printerLifeHours,
    maintenancePerHour: settings.maintenancePerHour,
    notes: '',
  });

  function normalize(data) {
    const base = emptyState();
    if (!data || typeof data !== 'object') return base;
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    const prints = Array.isArray(data.prints) ? data.prints : [];
    let printers = Array.isArray(data.printers) ? data.printers : [];
    // Datos anteriores a las impresoras múltiples: la impresora de ajustes pasa a ser la primera.
    if (!Array.isArray(data.printers) && (prints.length || data.settings)) {
      const legacy = printerFromSettings(settings);
      printers = [legacy];
      settings.defaultPrinterId = legacy.id;
      prints.forEach((p) => {
        if (!p.printerId) { p.printerId = legacy.id; p.printerName = legacy.name; }
      });
    }
    return {
      version: 1,
      demo: !!data.demo,
      settings,
      printers,
      filaments: Array.isArray(data.filaments) ? data.filaments : [],
      components: Array.isArray(data.components) ? data.components : [],
      materials: Array.isArray(data.materials) ? data.materials : [],
      prints,
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

  const today = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  root.Store = { load, save, normalize, emptyState, uid, today, printerFromSettings, DEFAULT_SETTINGS };
})(window);
