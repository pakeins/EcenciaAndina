function cfg(name, fallback = '') {
  const vars = typeof $vars === 'undefined' ? {} : $vars;
  const env = typeof $env === 'undefined' ? (typeof process === 'undefined' ? {} : process.env) : $env;
  return env[name] || vars[name] || fallback;
}

const backendUrl = (cfg('N8N_ECENCIA_BACKEND_URL') || cfg('PUBLIC_BACKEND_URL')).replace(/\/$/, '');
const cleanupSecret = cfg('N8N_MENU_WEBHOOK_SECRET');

if (!backendUrl || !cleanupSecret) {
  throw new Error('Faltan N8N_ECENCIA_BACKEND_URL y N8N_MENU_WEBHOOK_SECRET.');
}

const result = await helpers.httpRequest({
  method: 'POST',
  url: backendUrl + '/api/menu/system/limpiar-imagenes',
  headers: {
    'X-Ecencia-Webhook-Secret': cleanupSecret,
  },
  body: {},
  json: true,
});

return [
  {
    json: {
      ...result,
      executedAt: new Date().toISOString(),
    },
  },
];
