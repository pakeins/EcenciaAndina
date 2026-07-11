/**
 * Seed idempotente de la cuenta ADMINISTRADOR.
 *
 * Crea (o repara) un usuario administrador en Supabase Auth + su fila en la
 * tabla `empleados` con un rol que el backend normaliza a "administrador".
 *
 * Reglas de seguridad:
 *  - No hardcodea credenciales ni la service role key: cada valor se lee de
 *    variables de entorno (o GitHub Actions secrets).
 *  - No imprime la contrasena ni la service role key en ningun log.
 *  - Es idempotente: re-ejecutarlo NO duplica el rol, el usuario auth ni el
 *    empleado. Si ya existe, solo asegura/actualiza el estado deseado.
 *
 * Variables de entorno:
 *   Requeridas:
 *     SUPABASE_URL                URL del proyecto Supabase.
 *     SUPABASE_SERVICE_ROLE_KEY   Service role key (NUNCA se commitea ni loguea).
 *     ADMIN_SEED_PASSWORD         Contrasena del administrador (ej. en CI secret).
 *   Opcionales (con valores por defecto seguros):
 *     ADMIN_SEED_EMAIL     Correo del administrador. Default: administrador@ecencia.local
 *     ADMIN_SEED_USERNAME  nombre_usuario para login. Default: ADMINISTRADOR
 *     ADMIN_SEED_ROLE      nombre_rol visible. Default: ADMINISTRADOR
 *     ADMIN_SEED_NOMBRE    Default: Administrador
 *     ADMIN_SEED_APELLIDO  Default: General
 *
 * Uso:
 *   cd backend
 *   # Linux/macOS
 *   ADMIN_SEED_PASSWORD='***' node scripts/seed-admin.js
 *   # PowerShell
 *   $env:ADMIN_SEED_PASSWORD='***'; node scripts/seed-admin.js
 */

const path = require('node:path');
// Carga .env.local y .env del backend si existen (no son necesarios en CI con secrets).
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_SEED_PASSWORD'];

const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  password: process.env.ADMIN_SEED_PASSWORD,
  email: (process.env.ADMIN_SEED_EMAIL || 'administrador@ecencia.local').trim().toLowerCase(),
  username: (process.env.ADMIN_SEED_USERNAME || 'ADMINISTRADOR').trim(),
  roleName: (process.env.ADMIN_SEED_ROLE || 'ADMINISTRADOR').trim(),
  nombre: (process.env.ADMIN_SEED_NOMBRE || 'Administrador').trim(),
  apellido: (process.env.ADMIN_SEED_APELLIDO || 'General').trim(),
};

const log = (message) => console.log(`[seed-admin] ${message}`);

const assertEnv = () => {
  const missing = REQUIRED_ENV.filter((name) => !String(process.env[name] || '').trim());
  if (missing.length > 0) {
    // Solo nombra las variables que faltan; nunca imprime sus valores.
    console.error(`[seed-admin] Faltan variables de entorno requeridas: ${missing.join(', ')}`);
    process.exit(1);
  }
};

const ensureRole = async (admin, roleName) => {
  const { data: existing, error: selectError } = await admin
    .from('roles')
    .select('id_rol, nombre_rol')
    .ilike('nombre_rol', roleName)
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) {
    log(`Rol existente reutilizado: "${existing.nombre_rol}" (id_rol=${existing.id_rol}).`);
    return existing.id_rol;
  }

  const { data: inserted, error: insertError } = await admin
    .from('roles')
    .insert({ nombre_rol: roleName })
    .select('id_rol')
    .single();

  if (insertError) throw insertError;
  log(`Rol creado: "${roleName}" (id_rol=${inserted.id_rol}).`);
  return inserted.id_rol;
};

const findAuthUserByEmail = async (admin, email) => {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    const found = users.find((user) => String(user.email || '').toLowerCase() === email);
    if (found) return found;
    if (users.length < perPage) return null;
  }
};

const ensureAuthUser = async (admin, { email, password }) => {
  const existing = await findAuthUserByEmail(admin, email);

  if (existing) {
    // Idempotente: reafirma contrasena y confirmacion de correo sin duplicar.
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    log('Usuario de Supabase Auth ya existia; credenciales reafirmadas.');
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  log('Usuario de Supabase Auth creado.');
  return data.user.id;
};

const ensureEmpleado = async (admin, { id, idRol, username, email, nombre, apellido }) => {
  // Evita ambiguedad de login: el backend exige nombre_usuario unico.
  const { data: clash, error: clashError } = await admin
    .from('empleados')
    .select('id, nombre_usuario')
    .ilike('nombre_usuario', username)
    .neq('id', id)
    .limit(1)
    .maybeSingle();

  if (clashError) throw clashError;
  if (clash) {
    throw new Error(
      `Ya existe otro empleado con nombre_usuario "${clash.nombre_usuario}" (id=${clash.id}). ` +
        'Ajusta ADMIN_SEED_USERNAME para evitar logins ambiguos.',
    );
  }

  const { error } = await admin.from('empleados').upsert(
    {
      id,
      id_rol: idRol,
      nombre,
      apellido,
      nombre_usuario: username,
      correo: email,
      esta_activo: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (error) throw error;
  log('Fila de empleado asegurada (rol administrador, activa).');
};

const main = async () => {
  assertEnv();

  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  log(`Asegurando administrador: usuario="${config.username}", correo="${config.email}".`);

  const idRol = await ensureRole(admin, config.roleName);
  const userId = await ensureAuthUser(admin, { email: config.email, password: config.password });
  await ensureEmpleado(admin, {
    id: userId,
    idRol,
    username: config.username,
    email: config.email,
    nombre: config.nombre,
    apellido: config.apellido,
  });

  log('Listo. La cuenta ADMINISTRADOR esta disponible para iniciar sesion.');
  log(`Puede ingresar con el usuario "${config.username}" o el correo "${config.email}".`);
};

main().catch((error) => {
  // Mensaje de error sin exponer secretos.
  console.error(`[seed-admin] Error: ${error.message}`);
  process.exit(1);
});
