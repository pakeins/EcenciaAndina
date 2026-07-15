const fs = require('fs');
const files = [
  'backend/src/test/menu-cleanup-endpoint.test.js',
  'backend/src/test/menu-routes.test.js',
  'backend/src/test/menuService.test.js',
  'backend/src/test/ordenes-trazabilidad.test.js'
];
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/beforeAll\(\(\)\s*=>\s*\{/g, 'beforeAll(async () => {');
  content = content.replace(/beforeEach\(\(\)\s*=>\s*\{/g, 'beforeEach(async () => {');
  fs.writeFileSync(file, content);
}
console.log('Fixed async callbacks');
