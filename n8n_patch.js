const fs = require('fs');
const file = 'c:/Users/esteb/Documents/TESIS/ECenciaAPP/backend/n8n/workflows/eciencia_telegram_menu_reservas.workflow.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

// 1. Add Trigger Node
data.nodes.push({
  parameters: {
    rule: {
      interval: [
        {
          field: 'cronExpression',
          expression: '59 23 * * *'
        }
      ]
    }
  },
  id: 'trigger-expirar-menu',
  name: 'Expirar menu activo 23:59',
  type: 'n8n-nodes-base.scheduleTrigger',
  typeVersion: 1.2,
  position: [-900, 180]
});

// 2. Add Code Node
const jsCode = `function cfg(name, fallback = '') {
  const vars = typeof $vars === 'undefined' ? {} : $vars;
  const env = typeof process === 'undefined' ? {} : process.env;
  return env[name] || vars[name] || fallback;
}

const backendUrl = (cfg('N8N_ECIENCIA_BACKEND_URL') || cfg('PUBLIC_BACKEND_URL')).replace(/\\/$/, '');
const cleanupSecret = cfg('N8N_MENU_WEBHOOK_SECRET');

if (!backendUrl || !cleanupSecret) {
  throw new Error('Faltan N8N_ECIENCIA_BACKEND_URL y N8N_MENU_WEBHOOK_SECRET.');
}

const result = await helpers.httpRequest({
  method: 'POST',
  url: backendUrl + '/api/menu/system/expirar-activo',
  headers: {
    'X-Eciencia-Webhook-Secret': cleanupSecret,
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
];`;

data.nodes.push({
  parameters: {
    mode: 'runOnceForAllItems',
    jsCode: jsCode
  },
  id: 'code-expirar-menu',
  name: 'Expirar menu en backend',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [-640, 180]
});

// 3. Add Connection
if (!data.connections['Expirar menu activo 23:59']) {
  data.connections['Expirar menu activo 23:59'] = {
    main: [
      [
        {
          node: 'Expirar menu en backend',
          type: 'main',
          index: 0
        }
      ]
    ]
  };
}

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log('JSON modificado exitosamente');
