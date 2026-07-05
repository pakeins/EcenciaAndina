const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env', override: true });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createTable() {
  const { error } = await supabase.rpc('execute_sql', {
    sql: `
      create table if not exists public.telegram_bot_state (
        key text primary key,
        value jsonb not null,
        created_at timestamp with time zone default timezone('utc'::text, now()) not null,
        updated_at timestamp with time zone default timezone('utc'::text, now()) not null
      );
      alter table public.telegram_bot_state enable row level security;
    `
  });
  console.log('Creation result:', error || 'Success');
}
createTable();
