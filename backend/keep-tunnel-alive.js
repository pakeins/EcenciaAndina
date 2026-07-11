const { spawn } = require('child_process');

function startTunnel() {
  console.log('Iniciando localtunnel...');
  const tunnel = spawn('npx', ['localtunnel', '--port', '3001', '--subdomain', 'ecencia2026'], {
    shell: true,
    stdio: 'inherit'
  });

  tunnel.on('close', (code) => {
    console.log(`Localtunnel cerrado con código ${code}. Reiniciando en 2 segundos...`);
    setTimeout(startTunnel, 2000);
  });
}

startTunnel();
