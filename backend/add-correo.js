const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env', override: true });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const sql = `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS correo TEXT;`;
  console.log('Running SQL...', sql);
  const { data, error } = await supabase.rpc('execute_sql', { sql });
  if (error) {
    console.error('SQL failed:', error);
  } else {
    console.log('SQL completed successfully!', data);
  }
}

run();
