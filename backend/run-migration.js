const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env', override: true });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runMigration() {
  const sqlPath = path.join(__dirname, 'supabase', 'migrations', '20260612152151_telegram_consent_onboarding_privacy.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running migration...');
  const { data, error } = await supabase.rpc('execute_sql', { sql });
  if (error) {
    console.error('Migration failed:', error);
  } else {
    console.log('Migration completed successfully!', data);
  }
}

runMigration();
