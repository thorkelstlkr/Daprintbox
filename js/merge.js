/*
 * Mezcla de tres vías de una libreta: combina los cambios hechos en este dispositivo (local)
 * con los guardados en el servidor desde otro (remote), partiendo de la última versión común (base).
 * Se carga en el navegador como script normal (window.Merge) y en Node con require().
 *
 * Reglas, registro a registro (por id):
 *  - Lo añadido en cualquiera de los dos lados se conserva.
 *  - Si solo un lado cambió un registro, gana ese cambio; si cambiaron los dos, se mezclan campo a campo
 *    (en un mismo campo cambiado en ambos lados gana este dispositivo).
 *  - Lo borrado en un lado se borra, salvo que el otro lado lo haya modificado entretanto.
 *  - Los campos de stock (gramos de filamento, planchas, componentes) suman las variaciones de ambos lados.
 */
(function (root) {
  'use strict';

  const COLLECTIONS = ['printers', 'filaments', 'components', 'materials', 'prints', 'sales', 'expenses'];
  const DELTA_FIELDS = { filaments: ['remaining'], components: ['stock'], materials: ['stock'] };

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isNum = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
  const round = (v) => Math.round(v * 1000) / 1000;

  function mergeObject(base, local, remote, deltaFields) {
    const b = base || {}, l = local || {}, r = remote || {};
    const out = {};
    const keys = new Set([...Object.keys(l), ...Object.keys(r)]);
    keys.forEach((k) => {
      const bv = b[k], lv = l[k], rv = r[k];
      let v;
      if ((deltaFields || []).includes(k) && isNum(bv) && isNum(lv) && isNum(rv)) {
        v = round(Number(rv) + (Number(lv) - Number(bv))); // suma las variaciones de ambos lados
      } else {
        v = same(lv, bv) ? rv : lv;
      }
      if (v !== undefined) out[k] = v;
    });
    return out;
  }

  function mergeList(base, local, remote, deltaFields) {
    const byId = (arr) => {
      const m = new Map();
      (arr || []).forEach((it) => { if (it && it.id != null) m.set(it.id, it); });
      return m;
    };
    const bm = byId(base), lm = byId(local), rm = byId(remote);
    const out = [];
    (remote || []).forEach((r) => {
      if (!r || r.id == null) return;
      const b = bm.get(r.id), l = lm.get(r.id);
      if (!b) { out.push(l ? mergeObject({}, l, r, []) : r); return; }       // nuevo en el servidor
      if (!l) { if (!same(r, b)) out.push(r); return; }                        // borrado aquí: se borra si allí no cambió
      out.push(same(l, b) ? r : same(r, b) ? l : mergeObject(b, l, r, deltaFields));
    });
    (local || []).forEach((l) => {
      if (!l || l.id == null || rm.has(l.id)) return;
      const b = bm.get(l.id);
      if (!b) out.push(l);                                                     // nuevo aquí
      else if (!same(l, b)) out.push(l);                                       // borrado allí pero editado aquí: se conserva
    });
    return out;
  }

  /** Devuelve la libreta combinada. base puede ser null (sin versión común: se conserva todo). */
  function merge3(base, local, remote) {
    const b = base || {}, l = local || {}, r = remote || {};
    const out = { ...r };
    COLLECTIONS.forEach((c) => { out[c] = mergeList(b[c] || [], l[c] || [], r[c] || [], DELTA_FIELDS[c] || []); });
    out.settings = mergeObject(b.settings || {}, l.settings || {}, r.settings || {}, []);
    out.demo = same(l.demo, b.demo) ? r.demo : l.demo;
    return out;
  }

  const Merge = { merge3, mergeList, mergeObject, COLLECTIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Merge;
  else root.Merge = Merge;
})(typeof window !== 'undefined' ? window : globalThis);
