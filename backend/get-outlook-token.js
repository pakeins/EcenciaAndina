const express = require('express');
const app = express();

const CLIENT_ID = process.env.OUTLOOK_CLIENT_ID || 'TU_CLIENT_ID_AQUÍ';
const CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET || 'TU_CLIENT_SECRET_AQUÍ';
const REDIRECT_URI = process.env.OUTLOOK_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';
const TENANT = process.env.OUTLOOK_TENANT || 'consumers'; // o 'common'

const AUTH_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_mode=query&scope=${encodeURIComponent('offline_access Mail.Send')}`;

app.get('/api/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.send('Error: No se recibió ningún código. ' + JSON.stringify(req.query));
  }

  try {
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('code', code);
    params.append('redirect_uri', REDIRECT_URI);
    params.append('grant_type', 'authorization_code');

    const response = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('Error de Microsoft:', data);
      return res.send(`<h1>Error de Microsoft</h1><pre>${JSON.stringify(data, null, 2)}</pre>`);
    }

    console.log('\n=========================================');
    console.log('¡ÉXITO! AQUÍ ESTÁ TU REFRESH TOKEN:');
    console.log('=========================================');
    console.log(data.refresh_token);
    console.log('=========================================\n');
    
    res.send('<h1>¡Éxito!</h1><p>Revisa la consola (terminal) de tu computadora. Ahí está el Refresh Token impreso.</p><p>Puedes cerrar esta ventana.</p>');
    process.exit(0);
  } catch (error) {
    console.error('Error al obtener token:', error);
    res.send('Error al canjear el token. Revisa la consola para más detalles.');
  }
});

app.listen(3000, () => {
  console.log('\n--- PASO 1 ---');
  console.log('Copia y pega este enlace en tu navegador web:');
  console.log('\n' + AUTH_URL + '\n');
  console.log('--- PASO 2 ---');
  console.log('Inicia sesión con la cuenta de Outlook que configuraste en tu Azure App.');
});
