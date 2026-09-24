/*
 * Cliente de la API del servidor (api/api.php). Solo se usa si config.js define apiUrl.
 */
(function (root) {
  'use strict';

  const base = ((root.DAPRINTBOX_CONFIG || {}).apiUrl || '').trim();

  async function call(action, { method = 'GET', body, params } = {}) {
    const qs = new URLSearchParams({ action, ...(params || {}) });
    const headers = { 'X-Daprintbox': '1' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(`${base}?${qs}`, {
        method, headers, credentials: 'same-origin', cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      const err = new Error('Sin conexión con el servidor.');
      err.status = 0;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* respuesta no JSON */ }
    if (!res.ok || !data || data.ok === false) {
      const err = new Error((data && data.error) || `Error del servidor (${res.status}).`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  root.Remote = {
    enabled: base !== '',
    authConfig: () => call('auth_config'),
    me: () => call('me'),
    register: (username, password, code) => call('register', { method: 'POST', body: { username, password, code } }),
    changePassword: (current, password) => call('change_password', { method: 'POST', body: { current, password } }),
    loginGoogle: (credential) => call('login_google', { method: 'POST', body: { credential } }),
    login: (username, password) => call('login', { method: 'POST', body: { username, password } }),
    logout: () => call('logout', { method: 'POST', body: {} }),
    load: (since) => call('state', { params: since == null ? {} : { since } }),
    save: (data, baseVersion) => call('save', { method: 'POST', body: { data, baseVersion } }),
    history: () => call('history'),
    historyGet: (version) => call('history_get', { params: { version } }),
  };
})(window);
