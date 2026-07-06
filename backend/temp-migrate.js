const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sql = "ALTER TABLE public.convenios ADD COLUMN IF NOT EXISTS tipos_almuerzo_permitidos jsonb DEFAULT '[\"ejecutivo_completo\", \"ejecutivo_simple\", \"ejecutivo_sin_sopa\", \"almuerzo_dia\", \"almuerzo_dia_simple\"]'::jsonb;";
supabase.rpc('execute_sql', { sql }).then(console.log).catch(console.error);
