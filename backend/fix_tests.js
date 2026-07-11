const fs = require('fs');

const disableUnusedVars = (file) => {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes('eslint-disable no-unused-vars')) {
    fs.writeFileSync(file, '/* eslint-disable no-unused-vars */\n' + content);
  }
};

disableUnusedVars('src/test/auth.test.js');
disableUnusedVars('src/test/authMiddleware.test.js');
disableUnusedVars('src/test/clientes.test.js');
disableUnusedVars('src/test/ordenes.test.js');
disableUnusedVars('src/test/productos.test.js');
disableUnusedVars('src/test/reportes.test.js');
disableUnusedVars('src/test/setup.js');
disableUnusedVars('src/test/telegram-convenio-flow.test.js');
disableUnusedVars('src/test/validation-ecencia.test.js');

console.log('Added eslint-disable to tests');
