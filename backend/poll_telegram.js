require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const localWebhookUrl = 'http://localhost:3001/api/telegram/webhook';
let offset = 0;
let isPolling = false;

console.log('Empezando a sondear (poll) actualizaciones de Telegram y redirigiendolas localmente a', localWebhookUrl);
console.log('Usando secreto:', secret ? '***' + secret.slice(-4) : 'Ninguno');

fetch(`https://api.telegram.org/bot${token}/deleteWebhook`).then(() => {
  setInterval(async () => {
    if (isPolling) return;
    isPolling = true;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=5`);
      const data = await res.json();
      if (data.ok && data.result.length > 0) {
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
    } catch (e) {
      console.error('Error:', e.message);
    } finally {
      isPolling = false;
    }
  }, 2000);
});
