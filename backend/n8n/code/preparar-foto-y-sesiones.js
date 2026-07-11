function cfg(name, fallback = '') {
  const vars = typeof $vars === 'undefined' ? {} : $vars;
  const env = typeof $env === 'undefined' ? (typeof process === 'undefined' ? {} : process.env) : $env;
  return env[name] || vars[name] || fallback;
}

const backendUrl = (cfg('N8N_ECENCIA_BACKEND_URL') || cfg('PUBLIC_BACKEND_URL')).replace(/\/$/, '');
const secret = cfg('N8N_MENU_WEBHOOK_SECRET');

if (!backendUrl || !secret) {
  throw new Error('Faltan N8N_ECENCIA_BACKEND_URL y N8N_MENU_WEBHOOK_SECRET en n8n.');
}

const payload = items[0]?.json || {};

const result = await helpers.httpRequest({
  method: 'POST',
  url: backendUrl + '/api/telegram/broadcast-sessions',
  headers: {
    'X-Ecencia-Webhook-Secret': secret,
    'Content-Type': 'application/json'
  },
  body: payload,
  json: true,
});

if (!Array.isArray(result)) {
  throw new Error('El backend no devolvio un arreglo de sesiones valido.');
}

return result.map(item => ({ json: item }));
