const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { ROLE } = require('../src/constants/domain');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const required = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const supabaseUrl = required('SUPABASE_URL');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const email = required('FIRST_ADMIN_EMAIL');
const password = required('FIRST_ADMIN_PASSWORD');
const username = required('FIRST_ADMIN_USERNAME');
const firstName = String(process.env.FIRST_ADMIN_NAME || 'Administrador').trim();
const lastName = String(process.env.FIRST_ADMIN_LAST_NAME || 'Principal').trim();

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const main = async () => {
  const existing = await supabase
    .from('empleados')
    .select('id')
    .or(`correo.eq.${email},nombre_usuario.eq.${username}`)
    .limit(1);
  if (existing.error) throw existing.error;
  if (existing.data?.length) throw new Error('An employee with that email or username already exists.');

  const authResult = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { rol: 'administrador' },
    user_metadata: {
      nombre: firstName,
      apellido: lastName,
      nombre_usuario: username,
      esta_activo: true,
    },
  });
  if (authResult.error) throw authResult.error;

  const userId = authResult.data.user.id;
  const employeeResult = await supabase.from('empleados').insert({
    id: userId,
    id_rol: ROLE.ADMIN,
    nombre: firstName,
    apellido: lastName,
    nombre_usuario: username,
    correo: email,
    esta_activo: true,
  });

  if (employeeResult.error) {
    await supabase.auth.admin.deleteUser(userId);
    throw employeeResult.error;
  }

  console.log(`Administrator ${username} created successfully.`);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
