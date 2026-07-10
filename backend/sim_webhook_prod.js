const dotenv = require('dotenv');
dotenv.config({ path: 'c:/Users/esteb/Documents/TESIS/EcenciaAPP/backend/.env' });
dotenv.config({ path: 'c:/Users/esteb/Documents/TESIS/EcenciaAPP/backend/.env.local' });

async function run() {
  const payload = {
    update_id: 123456,
    message: {
      message_id: 1,
      from: { id: 999999, is_bot: false, first_name: 'Test', username: 'testuser' },
      chat: { id: 999999, first_name: 'Test', username: 'testuser', type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text: '/start',
    },
  };

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  console.log('Using secret:', secret);

  const response = await fetch('https://ecenciaapp.eastus2.cloudapp.azure.com/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': secret,
    },
    body: JSON.stringify(payload),
  });

  console.log('Status:', response.status);
  const text = await response.text();
  console.log('Body:', text);
}

run();
