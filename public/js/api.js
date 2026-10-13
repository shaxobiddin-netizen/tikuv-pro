// API mijoz: fetch o'ragi. Webda o'z serveriga, Capacitor'da sozlangan URLga murojaat qiladi.
window.TP = window.TP || {};

TP.api = (function () {
  // Native ilovada server manzilini o'zgartirish mumkin (sozlamalar orqali yoki bu yerdan):
  const NATIVE_DEFAULT_URL = 'http://192.168.1.10:3000';

  function baseUrl() {
    var isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    if (isNative) return localStorage.getItem('tp_server_url') || NATIVE_DEFAULT_URL;
    return '';
  }

  async function request(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    var token = localStorage.getItem('tp_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var res;
    try {
      res = await fetch(baseUrl() + path, {
        method: method,
        headers: headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
      });
    } catch (e) {
      var netErr = new Error('Internet aloqasi yo‘q. Ma\'lumot yangilanmadi.');
      netErr.network = true;
      throw netErr;
    }
    var data = null;
    try { data = await res.json(); } catch (e) { /* bo'sh javob */ }
    if (!res.ok) {
      var err = new Error((data && data.error) || 'Server xatosi');
      err.status = res.status;
      if (res.status === 401 && path !== '/api/auth/login') TP.app && TP.app.onUnauthorized();
      throw err;
    }
    return data.data;
  }

  return {
    baseUrl: baseUrl,
    setServerUrl: function (u) { localStorage.setItem('tp_server_url', u); },
    getServerUrl: function () { return localStorage.getItem('tp_server_url') || NATIVE_DEFAULT_URL; },
    get: function (p) { return request('GET', p); },
    post: function (p, b) { return request('POST', p, b || {}); },
    put: function (p, b) { return request('PUT', p, b || {}); },
    patch: function (p, b) { return request('PATCH', p, b || {}); },
  };
})();
