const fs = require('fs');
const content = fs.readFileSync('temp.json', 'utf16le');
fs.writeFileSync('temp_utf8.json', content, 'utf8');
console.log('Converted to utf8');
