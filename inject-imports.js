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
  const matches = [...content.matchAll(/require\('(\.\.\/(?:services|controllers|routes)\/[^']+)'\)/g)];
  let importsToInject = '';
  // Avoid duplicates
  const seen = new Set();
  for (const match of matches) {
    if (!seen.has(match[1])) {
      importsToInject += "import '" + match[1] + "';\n";
      seen.add(match[1]);
    }
  }
  if (importsToInject) {
    const lines = content.split('\n');
    lines.splice(1, 0, importsToInject);
    fs.writeFileSync(file, lines.join('\n'));
  }
}
console.log('Injected dummy imports!');
