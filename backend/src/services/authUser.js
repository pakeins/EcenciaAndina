const normalizeRole = (roleName = '') => {
  const normalized = String(roleName).toLowerCase().trim();
  // Reconoce cualquier variante de rol administrativo: "admin", "administrador",
  // "administrativo", "Super Admin", "ADMINISTRADOR", etc. El resto opera como caja.
  return normalized.includes('admin') ? 'administrador' : 'caja';
};

const roleFromEmpleado = (empleado) => {
  const rawRoles = empleado?.roles || empleado?.Roles;
  const roleName = (Array.isArray(rawRoles) ? rawRoles[0]?.nombre_rol : rawRoles?.nombre_rol) || '';
  return normalizeRole(roleName);
};

const publicUserFromEmpleado = (empleado, email) => ({
  id: empleado.id,
  email,
  nombre: empleado.nombre,
  apellido: empleado.apellido,
  nombre_usuario: empleado.nombre_usuario,
  rol: empleado.rol || roleFromEmpleado(empleado),
});

const findEmpleadoForAuthUser = async (adminClient, authUser) => {
  let { data, error } = await adminClient
    .from('empleados')
    .select('*, roles(nombre_rol)')
    .eq('id', authUser.id)
    .limit(1);

  if (error) throw error;

  if ((!data || data.length === 0) && authUser.email) {
    const fallback = await adminClient
      .from('empleados')
      .select('*, roles(nombre_rol)')
      .eq('correo', authUser.email)
      .limit(1);
    if (fallback.error) throw fallback.error;
    data = fallback.data;
  }

  return data && data.length > 0 ? data[0] : null;
};

const syncAppMetadata = async (adminClient, authUser, empleado) => {
  const rol = roleFromEmpleado(empleado);
  const estaActivo = empleado.esta_activo !== false;
  const current = authUser.app_metadata || {};

  if (current.rol === rol && current.esta_activo === estaActivo) return;

  await adminClient.auth.admin.updateUserById(authUser.id, {
    app_metadata: {
      ...current,
      rol,
      esta_activo: estaActivo,
    },
  });
};

module.exports = {
  findEmpleadoForAuthUser,
  normalizeRole,
  publicUserFromEmpleado,
  roleFromEmpleado,
  syncAppMetadata,
};
