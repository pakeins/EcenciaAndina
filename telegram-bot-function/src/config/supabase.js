const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan credenciales de Supabase en el archivo .env');
}

// Cliente Singleton (puede verse afectado por sesiones de auth)
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Retorna un cliente fresco con la llave de servicio.
 * Útil para operaciones de servidor que deben saltarse el RLS 
 * y no verse afectadas por el estado de autenticación del cliente singleton.
 */
const getAdminClient = () => {
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

module.exports = {
  supabase,
  getAdminClient
};
