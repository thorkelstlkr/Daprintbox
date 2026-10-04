/*
 * Fotos de Libreta Maker. Las fotos no van dentro de la libreta (la harían enorme y lenta de
 * guardar): la libreta solo guarda su id. Cada foto se reduce en el navegador (foto de 1600 px y
 * miniatura de 360 px, en JPEG; al redibujarla se pierden los datos ocultos como la ubicación),
 * se guarda en este dispositivo (IndexedDB) y, en la versión con servidor, se sube a la API en
 * cuanto hay conexión. Las que llegan del servidor también se guardan aquí para verlas sin conexión.
 *
 * En Node solo se exportan las funciones puras (refsOf, crc32, makeZip) para los tests.
 */
(function (root) {
  'use strict';

  /** Ids de las fotos que usa una libreta: varias por trabajo y una por filamento, material o componente. */
  function refsOf(state) {
    const refs = new Set();
    ['prints', 'filaments', 'materials', 'components'].forEach((c) => ((state && state[c]) || []).forEach((it) => {
      if (!it) return;
      (Array.isArray(it.photos) ? it.photos : []).forEach((id) => { if (typeof id === 'string' && id) refs.add(id); });
      if (typeof it.photo === 'string' && it.photo) refs.add(it.photo);
    }));
    return refs;
  }

  // ---------------------------------------------------------------- ZIP (sin compresión: las JPEG ya van comprimidas)

  const CRC_TABLE = (() => {
    const tbl = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      tbl[n] = c >>> 0;
    }
    return tbl;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /** files: [{name, data: Uint8Array}] → Uint8Array con el .zip (nombres en UTF-8). */
  function makeZip(files, date = new Date()) {
    const enc = new TextEncoder();
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const parts = [], central = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(10, time, true); h.setUint16(12, day, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(12, time, true); c.setUint16(14, day, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const cdSize = central.reduce((s, a) => s + a.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(e.buffer)];
    const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
    let p = 0;
    all.forEach((a) => { out.set(a, p); p += a.length; });
    return out;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { refsOf, crc32, makeZip };
    return;
  }

  // ---------------------------------------------------------------- navegador

  const FULL = 1600, THUMB = 360;
  const t = (s, p) => (root.I18n ? root.I18n.t(s, p) : s);

  let scope = null;        // 'local' o el nombre de usuario: cada cuenta tiene su almacén
  let api = null;          // window.Remote en la versión con servidor
  let dbPromise = null;
  const urls = new Map();  // `${id}:${size}` → URL para <img>
  const loading = new Map();
  const failed = new Map();
  const listeners = new Set();
  let pendingCount = 0, uploading = false, lastError = '';

  const notify = () => listeners.forEach((fn) => { try { fn(); } catch (e) { /* nada */ } });
  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  function db() {
    if (!dbPromise) {
      const name = 'libreta-fotos:' + (scope || 'local');
      dbPromise = new Promise((resolve, reject) => {
        let req;
        try { req = root.indexedDB.open(name, 1); } catch (e) { reject(e); return; }
        req.onupgradeneeded = () => {
          req.result.createObjectStore('photos', { keyPath: 'id' });
          req.result.createObjectStore('queue', { keyPath: 'id' }); // fotos pendientes de subir
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  }
  const os = async (name, mode) => (await db()).transaction(name, mode).objectStore(name);
  const getRec = async (id) => reqP((await os('photos', 'readonly')).get(id));
  const putRec = async (rec) => reqP((await os('photos', 'readwrite')).put(rec));

  function resetUrls() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls.clear(); loading.clear(); failed.clear();
  }

  /** Almacén de fotos de la cuenta (o 'local' sin servidor). Se puede llamar varias veces. */
  function setScope(name, remoteApi) {
    if (name === scope && remoteApi === api) return;
    if (dbPromise) dbPromise.then((d) => d.close(), () => {});
    dbPromise = null;
    resetUrls();
    scope = name; api = remoteApi || null; pendingCount = 0; lastError = '';
    if (api) upload();
  }

  const newId = () => Array.from(root.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('No se pudo leer la imagen. Prueba con una foto JPEG o PNG.'))); };
      img.src = url;
    });
  }

  function toJpeg(img, max, quality) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; // fondo blanco para PNG con transparencia
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(t('No se pudo leer la imagen. Prueba con una foto JPEG o PNG.')))), 'image/jpeg', quality));
  }

  /** Reduce la foto elegida, la guarda en el dispositivo y la pone en cola para subirla. Devuelve su id. */
  async function fromFile(file) {
    if (file.type && !/^image\//.test(file.type)) throw new Error(t('No se pudo leer la imagen. Prueba con una foto JPEG o PNG.'));
    const { img, url } = await loadImage(file);
    try {
      let full = await toJpeg(img, FULL, 0.82);
      if (full.size > 700 * 1024) full = await toJpeg(img, FULL, 0.7);
      const thumb = await toJpeg(img, THUMB, 0.75);
      const id = newId();
      try {
        await putRec({ id, full, thumb, created: Date.now() });
        if (api) await reqP((await os('queue', 'readwrite')).put({ id }));
      } catch (e) {
        throw new Error(t('Este navegador no permite guardar fotos (¿modo privado o sin espacio?).'));
      }
      if (api) { pendingCount++; notify(); upload(); }
      return id;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** La foto como Blob (size 'thumb' o 'full'): del dispositivo o, si no está, del servidor. */
  async function blob(id, size = 'thumb') {
    let rec = null;
    try { rec = await getRec(id); } catch (e) { /* sin IndexedDB */ }
    let b = rec && (size === 'thumb' ? rec.thumb || rec.full : rec.full);
    if (b || !api) return b || null;
    const key = id + ':' + size;
    if (Date.now() - (failed.get(key) || 0) < 30000) return null; // no insistir en cada repintado
    try {
      b = await api.photoGet(id, size);
    } catch (e) {
      failed.set(key, Date.now());
      return null;
    }
    try {
      const fresh = (await getRec(id)) || { id, created: Date.now() };
      fresh[size === 'thumb' ? 'thumb' : 'full'] = b;
      await putRec(fresh);
    } catch (e) { /* se verá, aunque no quede guardada */ }
    return b;
  }

  /** URL para un <img> (o null si la foto no está disponible ahora mismo). */
  function src(id, size = 'thumb') {
    const key = id + ':' + size;
    if (urls.has(key)) return Promise.resolve(urls.get(key));
    if (!loading.has(key)) {
      loading.set(key, blob(id, size).then((b) => {
        loading.delete(key);
        if (!b) return null;
        const u = URL.createObjectURL(b);
        urls.set(key, u);
        return u;
      }));
    }
    return loading.get(key);
  }

  /** Carga las imágenes <img data-photo="id" [data-size="full"]> que haya dentro de el. */
  function hydrate(el) {
    (el || document).querySelectorAll('img[data-photo]:not([data-loaded])').forEach((img) => {
      img.setAttribute('data-loaded', '1');
      src(img.dataset.photo, img.dataset.size || 'thumb').then((u) => {
        if (u) img.src = u;
        else img.closest('.ph')?.classList.add('missing');
      });
    });
  }

  const toBase64 = (b) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

  /** Sube las fotos pendientes, de una en una. Sin conexión se para y se reintenta más tarde. */
  async function upload() {
    if (!api || uploading) return;
    uploading = true;
    try {
      const queue = await os('queue', 'readonly');
      const ids = await reqP(queue.getAllKeys());
      pendingCount = ids.length; notify();
      for (const id of ids) {
        if (root.navigator && root.navigator.onLine === false) break;
        const rec = await getRec(id);
        let done = !rec || !rec.full || !rec.thumb; // sin datos que subir: se quita de la cola
        if (!done) {
          try {
            await api.photoUpload(id, await toBase64(rec.full), await toBase64(rec.thumb));
            done = true; lastError = '';
          } catch (e) {
            if (e.status === 400 || e.status === 415) { done = true; lastError = e.message; } // no se arregla reintentando
            else { if (e.status !== 0 && e.status !== 401) lastError = e.message; break; }
          }
        }
        if (done) {
          await reqP((await os('queue', 'readwrite')).delete(id));
          pendingCount = Math.max(0, pendingCount - 1);
        }
        notify();
      }
    } catch (e) {
      /* sin IndexedDB */
    } finally {
      uploading = false;
      notify();
    }
  }

  /** Borra del dispositivo las fotos que la libreta ya no usa (las del servidor se pueden volver a bajar). */
  async function gc(refs, minAgeMs = 3600000) {
    try {
      const keys = await reqP((await os('photos', 'readonly')).getAllKeys());
      for (const id of keys) {
        if (refs.has(id)) continue;
        const rec = await getRec(id);
        if (rec && Date.now() - (rec.created || 0) < minAgeMs) continue; // puede estar en un formulario abierto
        await reqP((await os('photos', 'readwrite')).delete(id));
        await reqP((await os('queue', 'readwrite')).delete(id));
      }
      const queued = await reqP((await os('queue', 'readonly')).getAllKeys());
      pendingCount = queued.length; notify();
    } catch (e) { /* sin IndexedDB */ }
  }

  /** Al cerrar sesión: borra las fotos de esta cuenta guardadas en el dispositivo. */
  async function clear() {
    const name = 'libreta-fotos:' + (scope || 'local');
    if (dbPromise) { try { (await dbPromise).close(); } catch (e) { /* nada */ } }
    dbPromise = null;
    resetUrls();
    scope = null; api = null; pendingCount = 0; lastError = '';
    try { root.indexedDB.deleteDatabase(name); } catch (e) { /* nada */ }
    notify();
  }

  root.Photos = {
    refsOf, crc32, makeZip, setScope, fromFile, blob, src, hydrate, upload, gc, clear,
    pending: () => pendingCount,
    error: () => lastError,
    onChange: (fn) => listeners.add(fn),
  };
})(typeof window !== 'undefined' ? window : globalThis);
