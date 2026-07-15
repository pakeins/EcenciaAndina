const fs = require('fs');

const file = 'backend/src/test/ordenes-trazabilidad.test.js';
let content = fs.readFileSync(file, 'utf8');

// Remove static import
content = content.replace(/import\s+'\.\.\/routes\/ordenes\.js';\n/, '');

// Add dynamic import
content = content.replace(/(const ordenesRouter = require\('\.\.\/routes\/ordenes\.js'\);)/, 'await import(\'../routes/ordenes.js\');\n');

fs.writeFileSync(file, content);
console.log('Fixed ordenes-trazabilidad.test.js');
