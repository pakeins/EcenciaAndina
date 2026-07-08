const path = require('path');

// Clear all routes and services from require cache before each test file runs
// to ensure Vitest can instrument them for coverage.
const routes = ['clientes', 'convenios', 'productos', 'ordenes', 'reportes', 'empleados', 'alimentos', 'menu', 'categorias', 'telegram', 'auth'];
routes.forEach(route => {
  try {
    const resolved = require.resolve(path.join(__dirname, '..', 'routes', `${route}.js`));
    delete require.cache[resolved];
  } catch (e) {
    // Ignore if not found
  }
});
