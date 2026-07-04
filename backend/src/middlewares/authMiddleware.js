/**
 * Middleware de autenticacion.
 * Valida el JWT con Supabase Auth y resuelve permisos desde empleados/roles.
 */
const { supabase, getAdminClient } = require('../config/supabase');

const mapRoleToAppRole = (roleName = '') => {
  const normalized = String(roleName).toLowerCase().trim();
  if (['super admin', 'administrativo', 'administrador', 'admin'].includes(normalized)) {
    return 'administrador';
  }
  return 'caja';
};

const resolveEmpleado = async (adminClient, user) => {
  let { data, error } = await adminClient
    .from('empleados')
    .select('id, esta_activo, roles(nombre_rol)')
    .eq('id', user.id)
    .maybeSingle();

  if (!data && user.email) {
    const fallback = await adminClient
      .from('empleados')
      .select('id, esta_activo, roles(nombre_rol)')
      .eq('correo', user.email)
      .maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;
  return data;
};

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No Autorizado. Falta el Token.' });
    }

    const token = authHeader.split(' ')[1];
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Token invalido o expirado.' });
    }

    const adminClient = getAdminClient();
    const empleado = await resolveEmpleado(adminClient, user);

    if (!empleado) {
      return res.status(403).json({ error: 'Empleado no registrado o sin rol asignado.' });
    }

    if (empleado.esta_activo === false) {
      return res.status(403).json({ error: 'Su cuenta ha sido desactivada.' });
    }

    const rawRole = Array.isArray(empleado.roles) ? empleado.roles[0] : empleado.roles;
    req.user = {
      ...user,
      rol: mapRoleToAppRole(rawRole?.nombre_rol),
      empleado_id: empleado.id,
    };

    next();
  } catch (err) {
    console.error('Error en middleware de autenticacion:', err);
    res.status(500).json({ error: 'Error interno verificando la autenticacion.' });
  }
};

module.exports = authMiddleware;
