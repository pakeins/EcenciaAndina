require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

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

async function main() {
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.description || `Telegram respondio ${response.status}`);
  }

  console.log(`Webhook registrado: ${webhookUrl}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
