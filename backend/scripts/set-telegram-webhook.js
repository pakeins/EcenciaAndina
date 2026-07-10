require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const https = require('https');

const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || `${process.env.PUBLIC_BACKEND_URL || ''}/api/telegram/webhook`;
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  throw new Error('Falta TELEGRAM_BOT_TOKEN.');
}
if (!webhookUrl || !/^https:\/\//i.test(webhookUrl)) {
  throw new Error('TELEGRAM_WEBHOOK_URL o PUBLIC_BACKEND_URL debe ser HTTPS.');
}
if (!secretToken) {
  throw new Error('Falta TELEGRAM_WEBHOOK_SECRET.');
}

async function setWebhook() {
  const payload = JSON.stringify({
    url: webhookUrl,
    secret_token: secretToken,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${token}/setWebhook`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok) {
            reject(new Error(parsed.description || `Telegram respondio ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Invalid JSON from Telegram API'));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(payload);
    req.end();
  });
}

setWebhook()
  .then(() => {
    console.log(`Webhook registrado: ${webhookUrl}`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
