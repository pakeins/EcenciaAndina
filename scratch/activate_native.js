const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), '.n8n', 'database.sqlite');
console.log('Abriendo la base de datos de n8n en:', dbPath);

try {
  const db = new DatabaseSync(dbPath);
  const query = db.prepare("UPDATE workflow_entity SET active=1");
  const result = query.run();
  console.log(`Workflows activados exitosamente. Filas afectadas: ${result.changes}`);
} catch (error) {
  console.error('Error al activar workflows:', error.message);
  process.exit(1);
}
