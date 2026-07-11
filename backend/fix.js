const fs = require('fs');
const removeLine = (file, pattern) => {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n').filter(line => !pattern.test(line));
  fs.writeFileSync(file, lines.join('\n'));
};
const replacePattern = (file, pattern, replacement) => {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, content.replace(pattern, replacement));
};

removeLine('src/test/authMiddleware.test.js', /let fetchSpy;/);
removeLine('src/test/clientes.test.js', /let fetchSpy;/);
removeLine('src/test/ordenes.test.js', /let fetchSpy;/);
removeLine('src/test/productos.test.js', /let fetchSpy;/);
removeLine('src/test/reportes.test.js', /let fetchSpy;/);

removeLine('src/test/clientes.test.js', /const isDescuentos =/);
removeLine('src/test/reportes.test.js', /const method =/);
removeLine('src/test/telegram-convenio-flow.test.js', /const TELEGRAM_LUNCH_TYPE_BY_ID =/);
removeLine('src/test/validation-ecencia.test.js', /const MAX_LENGTHS =/);
removeLine('src/test/validation-ecencia.test.js', /const data =/);
removeLine('src/services/telegramConsent.js', /const fs = require\('fs'\);/);
removeLine('src/services/telegramConsent.js', /const path = require\('path'\);/);

replacePattern('src/test/auth.test.js', /catch \(e\)/g, 'catch');
replacePattern('src/test/setup.js', /catch \(e\)/g, 'catch');

console.log('Fixed simple variables');
