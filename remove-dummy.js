const fs = require('fs');
const file = 'backend/src/test/ordenes-trazabilidad.test.js';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/import\s+'\.\.\/routes\/ordenes\.js';\n/, '');
fs.writeFileSync(file, content);
console.log('Removed dummy import from ordenes-trazabilidad');
