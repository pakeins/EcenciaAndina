require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const localWebhookUrl = process.env.LOCAL_WEBHOOK_URL || 'http://localhost:3001/api/telegram/webhook';
let offset = 0;
let isPolling = false;
let errorCount = 0;
const MAX_ERROR_COUNT = 5;

console.log('Empezando a sondear (poll) actualizaciones de Telegram y redirigiendolas localmente a', localWebhookUrl);
console.log('Usando secreto:', secret ? '***' + secret.slice(-4) : 'Ninguno');

const poll = async () => {
  if (isPolling) return;
  isPolling = true;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=5`);
    const data = await res.json();
    if (!res.ok && res.status === 409) {
      console.error('Conflicto 409: Alguien más está haciendo polling o hay webhooks activos.');
      errorCount = Math.min(errorCount + 1, MAX_ERROR_COUNT);
    } else if (data.ok) {
      errorCount = 0; // Reset on success
      if (data.result.length > 0) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          console.log('Enviando update localmente:', update.update_id);
          
          const headers = { 'Content-Type': 'application/json' };
          if (secret) headers['x-telegram-bot-api-secret-token'] = secret;
          
          const forwardRes = await fetch(localWebhookUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(update)
          });
          
          if (!forwardRes.ok) {
            console.error('El webhook local fallo:', forwardRes.status, await forwardRes.text());
          }
        }
      }
    } else {
      errorCount = Math.min(errorCount + 1, MAX_ERROR_COUNT);
      console.error('Error API Telegram:', data);
    }
  } catch (e) {
    console.error('Error de red:', e.message);
    errorCount = Math.min(errorCount + 1, MAX_ERROR_COUNT);
  } finally {
    isPolling = false;
    const nextTimeout = errorCount > 0 ? Math.min(2000 * Math.pow(2, errorCount), 60000) : 2000;
    setTimeout(poll, nextTimeout);
  }
};

fetch(`https://api.telegram.org/bot${token}/deleteWebhook`).then(() => {
  setTimeout(poll, 2000);
});
