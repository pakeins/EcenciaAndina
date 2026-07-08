const fs = require('fs');

const wfPath = 'backend/n8n/workflows/eciencia_telegram_menu_reservas.workflow.json';
const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));

let count = 0;
for (const node of wf.nodes) {
  if (node.type === 'n8n-nodes-base.code' && node.parameters && node.parameters.jsCode) {
    let js = node.parameters.jsCode;
    const target = "const env = typeof process === 'undefined' ? {} : process.env;";
    const replacement = "const env = typeof $env === 'undefined' ? (typeof process === 'undefined' ? {} : process.env) : $env;";
    if (js.includes(target)) {
      js = js.replace(target, replacement);
      node.parameters.jsCode = js;
      count++;
      console.log(`Replaced in node: ${node.name}`);
    } else {
      console.log(`No match in node: ${node.name}`);
    }
  }
}

if (count > 0) {
  fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2));
  console.log(`Updated ${count} nodes in JSON workflow file.`);
} else {
  console.log('No updates made.');
}
