const { buildInvitationEmail } = require('./outlookMail');
require('dotenv').config({ path: '/home/azureuser/ECenciaAPP/backend/.env' });

const emailData = buildInvitationEmail({
  nombre: 'Test',
  inviteLink: 'https://t.me/EcenciaBot?start=TEST_TOKEN',
  env: process.env
});

console.log('--- SUBJECT ---');
console.log(emailData.subject);
console.log('--- TEXT ---');
console.log(emailData.text);
console.log('--- HTML ---');
console.log(emailData.html);
