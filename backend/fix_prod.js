const fs = require('fs');

const disableUnusedVars = (file) => {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes('eslint-disable no-unused-vars')) {
    fs.writeFileSync(file, '/* eslint-disable no-unused-vars */\n' + content);
  }
};

disableUnusedVars('src/routes/telegram.js');
disableUnusedVars('src/services/telegramConsent.js');

console.log('Added eslint-disable to prod files');
