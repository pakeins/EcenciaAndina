const fs = require('fs');

function generateDBML() {
  const data = JSON.parse(fs.readFileSync('live-schema.json', 'utf8'));
  let dbml = '// -- Diagrama ER ECencia Andina (LIVE) --\n\n';

  for (const [tableName, definition] of Object.entries(data)) {
    dbml += `Table ${tableName} {\n`;
    if (definition.properties) {
      for (const [colName, colDef] of Object.entries(definition.properties)) {
        let type = colDef.format || colDef.type || 'text';
        if (type === 'timestamp with time zone') type = 'timestamp';
                
        let tags = [];
        if (colDef.description && colDef.description.includes('<pk/>')) {
          tags.push('primary key');
        }
                
        let fkMatch = colDef.description ? colDef.description.match(/<fk table='([^']+)' column='([^']+)'\/>/) : null;
        if (fkMatch) {
          tags.push(`ref: > ${fkMatch[1]}.${fkMatch[2]}`);
        }
                
        let tagString = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
        dbml += `  ${colName} ${type}${tagString}\n`;
      }
    }
    dbml += '}\n\n';
  }

  fs.writeFileSync('schema.dbml', dbml);
  console.log('DBML generado en schema.dbml');
}

generateDBML();
