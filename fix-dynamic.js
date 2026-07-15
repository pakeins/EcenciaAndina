const fs = require('fs');

const files = [
  'backend/src/test/menu-cleanup-endpoint.test.js',
  'backend/src/test/menu-routes.test.js',
  'backend/src/test/menuService.test.js',
  'backend/src/test/ordenes-trazabilidad.test.js'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace import x from ... back to dynamic import if it's indented
  content = content.replace(/(\s+)import\s+([a-zA-Z0-9_]+)\s+from\s+'\.\.\/([a-zA-Z0-9_\/.]+)'\s*;/g, ' { default:  } = await import(\'../\');');
  
  fs.writeFileSync(file, content);
}
console.log('Fixed dynamic imports!');
