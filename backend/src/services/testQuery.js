const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/home/azureuser/ECenciaAPP/backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: invs, error } = await supabase.from('telegram_invitations').select('*, clientes(*)').order('created_at', { ascending: false }).limit(2);
  if (error) {
    console.error(error);
    return;
  }
  console.log(JSON.stringify(invs, null, 2));
}

run();
