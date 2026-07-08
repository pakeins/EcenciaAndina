const fs = require('fs');
const path = require('path');

const codeDir = 'backend/n8n/code';
const wfPath = 'backend/n8n/workflows/eciencia_telegram_menu_reservas.workflow.json';

// 1. Fix JS Files
const jsFiles = fs.readdirSync(codeDir).filter(f => f.endsWith('.js'));
for (const file of jsFiles) {
  const filePath = path.join(codeDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  const target1 = "const env = typeof process === 'undefined' ? {} : process.env;";
  const replace1 = "const env = typeof $env === 'undefined' ? (typeof process === 'undefined' ? {} : process.env) : $env;";
  
  const target2 = "const processEnv = typeof process === 'undefined' ? {} : process.env;";
  const replace2 = "const processEnv = typeof $env === 'undefined' ? (typeof process === 'undefined' ? {} : process.env) : $env;";
  
  let modified = false;
  if (content.includes(target1)) {
    content = content.replace(target1, replace1);
    modified = true;
  }
  if (content.includes(target2)) {
    content = content.replace(target2, replace2);
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated JS file: ${file}`);
  }
}

// 2. Fix JSON Workflow
const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
let jsonCount = 0;
for (const node of wf.nodes) {
  if (node.type === 'n8n-nodes-base.code' && node.parameters && node.parameters.jsCode) {
    let js = node.parameters.jsCode;
    const target1 = "const env = typeof process === 'undefined' ? {} : process.env;";
    const replace1 = "const env = typeof $env === 'undefined' ? (typeof process === 'undefined' ? {} : process.env) : $env;";
    
    const target2 = "const processEnv = typeof process === 'undefined' ? {} : process.env;";
    const replace2 = "const processEnv = typeof $env === 'undefined' ? (typeof process === 'undefined' ? {} : process.env) : $env;";
    
    let nodeModified = false;
    if (js.includes(target1)) {
      js = js.replace(target1, replace1);
      nodeModified = true;
    }
    if (js.includes(target2)) {
      js = js.replace(target2, replace2);
      nodeModified = true;
    }
    
    if (nodeModified) {
      node.parameters.jsCode = js;
      jsonCount++;
      console.log(`Updated JSON node: ${node.name}`);
    }
  }
}

if (jsonCount > 0) {
  fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2));
  console.log(`Updated workflow JSON file.`);
}
