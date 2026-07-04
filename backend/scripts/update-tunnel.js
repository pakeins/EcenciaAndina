const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const logPath = 'C:/Users/esteb/.gemini/antigravity-ide/brain/1ee08076-711f-482c-afc5-6e2244d43029/.system_generated/tasks/task-2353.log';
const envPath = path.join(__dirname, '../.env');

try {
  const content = fs.readFileSync(logPath, 'utf8');
  const matches = [...content.matchAll(/https:\/\/[a-z0-9]+\.lhr\.life/g)];
  if (matches.length === 0) {
    throw new Error('No se encontro ninguna URL de localhost.run en el log.');
  }
  const latestUrl = matches[matches.length - 1][0];
  console.log('Ultima URL encontrada:', latestUrl);

  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(/^PUBLIC_BACKEND_URL=.*/m, `PUBLIC_BACKEND_URL=${latestUrl}`);
  envContent = envContent.replace(/^TELEGRAM_WEBHOOK_URL=.*/m, `TELEGRAM_WEBHOOK_URL=${latestUrl}/api/telegram/webhook`);
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('Archivo .env actualizado.');

  console.log('Actualizando Webhook de Telegram...');
  const output = execSync('npm run telegram:set-webhook', { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  console.log(output);
} catch (error) {
  console.error('Error:', error.message);
}
