require('dotenv').config();
const fs = require('fs');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

async function fetchSchema() {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${SUPABASE_SERVICE_ROLE_KEY}`);
    const data = await response.json();
    fs.writeFileSync('live-schema.json', JSON.stringify(data.definitions, null, 2));
    console.log('Schema dumped to live-schema.json');
  } catch(e) {
    console.error(e);
  }
}
fetchSchema();
