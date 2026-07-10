require('dotenv').config();
const http = require('http');

const data = JSON.stringify({
  update_id: 1,
  message: {
    message_id: 1,
    from: { id: 12345, username: 'test_user' },
    chat: { id: 12345 },
    text: '/start'
  }
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/telegram/webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET || ''
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
