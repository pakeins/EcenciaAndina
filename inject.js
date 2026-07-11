const fs = require('fs');
const js = fs.readFileSync('backend/n8n/code/preparar-foto-y-sesiones.js', 'utf8').replace(/\r\n/g, '\n');
const wf = JSON.parse(fs.readFileSync('backend/n8n/workflows/ecencia_telegram_menu_reservas.workflow.json', 'utf8'));
for (const node of wf.nodes) {
  if (node.type === 'n8n-nodes-base.code' && node.name === 'Preparar foto y sesiones') {
    node.parameters.jsCode = js;
  }
}
fs.writeFileSync('backend/n8n/workflows/ecencia_telegram_menu_reservas.workflow.json', JSON.stringify(wf, null, 2));
console.log('Done injecting');
