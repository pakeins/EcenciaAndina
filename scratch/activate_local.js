const sqlite3 = require('sqlite3');
const path = require('path');
const os = require('os');

// Ruta por defecto de la base de datos SQLite de n8n en Windows
const dbPath = path.join(os.homedir(), '.n8n', 'database.sqlite');

console.log('Abriendo la base de datos de n8n en:', dbPath);
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos:', err.message);
    process.exit(1);
  }
});

// Activar todos los workflows o el específico del proyecto
db.run("UPDATE workflow_entity SET active=1", function(err) {
  if (err) {
    console.error('Error al activar el workflow:', err.message);
  } else {
    console.log(`Workflows activados exitosamente. Filas afectadas: ${this.changes}`);
  }
  db.close();
});
