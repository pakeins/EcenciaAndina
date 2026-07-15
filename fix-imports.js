const fs = require('fs');

const files = [
  'backend/src/test/clientesService.test.js',
  'backend/src/test/menu-cleanup-endpoint.test.js',
  'backend/src/test/menu-routes.test.js',
  'backend/src/test/menuService.test.js',
  'backend/src/test/ordenes-trazabilidad.test.js'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace require with import for module assignments
  content = content.replace(/const\s+([a-zA-Z0-9_]+)\s*=\s*require\('\.\.\/([a-zA-Z0-9_\/.]+)'\);/g, 'import $1 from \'../$2\';');
  
  fs.writeFileSync(file, content);
}
console.log('Fixed imports!');
