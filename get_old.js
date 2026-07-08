const cp = require('child_process');
const json = cp.execSync('git show 80e739d:backend/n8n/workflows/eciencia_telegram_menu_reservas.workflow.json').toString();
const wf = JSON.parse(json);
const oldCode = wf.nodes.find(n => n.name === 'Preparar foto y sesiones').parameters.jsCode;
console.log("OLD:");
console.log(oldCode.substring(0, 300));

const newJson = require('fs').readFileSync('backend/n8n/workflows/eciencia_telegram_menu_reservas.workflow.json', 'utf8');
const newWf = JSON.parse(newJson);
const newCode = newWf.nodes.find(n => n.name === 'Preparar foto y sesiones').parameters.jsCode;
console.log("NEW:");
console.log(newCode.substring(0, 300));
