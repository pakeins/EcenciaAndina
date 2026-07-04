try {
  const dotenv = require('dotenv');
  dotenv.config({ path: '.env.local' });
  dotenv.config();
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') {
    throw error;
  }
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('Falta TELEGRAM_BOT_TOKEN.');
}

const BOT_COMMANDS = [
  { command: 'menu', description: 'Ver el menu del dia y reservar' },
  { command: 'pedido', description: 'Consultar, modificar o cancelar tu reserva de hoy' },
  { command: 'cancelar', description: 'Descartar la seleccion en curso' },
  { command: 'ayuda', description: 'Ver los comandos disponibles' },
  { command: 'privacidad', description: 'Aviso de privacidad y consentimiento' },
  { command: 'misdatos', description: 'Conocer que categorias de datos tratamos' },
  { command: 'eliminarmisdatos', description: 'Solicitar la eliminacion de tus datos' },
  { command: 'revocar', description: 'Revocar tu consentimiento' },
];

async function telegramRequest(method, body = undefined) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.description || `Telegram respondio ${response.status} en ${method}`);
  }
  return data.result;
}

async function main() {
  const webhookInfo = await telegramRequest('getWebhookInfo');
  console.log('Webhook actual:', webhookInfo.url || '(sin webhook)');
  console.log('Actualizaciones pendientes:', webhookInfo.pending_update_count || 0);
  if (webhookInfo.last_error_message) {
    console.warn('Ultimo error del webhook:', webhookInfo.last_error_message, `(${new Date((webhookInfo.last_error_date || 0) * 1000).toISOString()})`);
  }
  if (!webhookInfo.url) {
    console.warn('No hay webhook registrado. Ejecuta: npm run telegram:set-webhook');
  } else if (!webhookInfo.url.endsWith('/api/telegram/webhook')) {
    console.warn('El webhook no apunta al backend (/api/telegram/webhook). Verifica antes de continuar.');
  }

  await telegramRequest('setMyCommands', { commands: BOT_COMMANDS });

  const registered = await telegramRequest('getMyCommands');
  const registeredNames = (registered || []).map((item) => item.command);
  const expectedNames = BOT_COMMANDS.map((item) => item.command);
  const missing = expectedNames.filter((name) => !registeredNames.includes(name));
  if (missing.length) {
    throw new Error(`Comandos no registrados: ${missing.join(', ')}`);
  }
  console.log(`Comandos registrados (${registeredNames.length}): ${registeredNames.join(', ')}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
