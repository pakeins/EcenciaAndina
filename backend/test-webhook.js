require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
(async () => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['x-telegram-bot-api-secret-token'] = secret;

  const res = await fetch('http://localhost:3001/api/telegram/webhook', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 100, is_bot: false, first_name: 'Test', username: 'testuser' },
        chat: { id: 100, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: '/start'
      }
    })
  });
  console.log('Status:', res.status);
  console.log('Body:', await res.text());
})();
