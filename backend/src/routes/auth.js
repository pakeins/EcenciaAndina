const express = require('express');
const router = express.Router();
const { supabase, getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');

// ─── Helpers testables (inyección de dependencias) ────────────────────────────

const PASSWORD_RESET_RESPONSE = { mensaje: 'Si el correo está registrado, recibirá un enlace pronto.' };

/**
 * Busca un empleado por nombre_usuario de forma insensible a mayúsculas.
 * Retorna null si no se encuentra o si hay ambigüedad (más de un match).
 * @param {object} adminClient  - cliente Supabase admin inyectable
 * @param {string} username
 * @returns {Promise<object|null>}
 */
const findEmployeeByUsername = async (adminClient, username) => {
  const normalized = username.toLowerCase();
  const { data, error } = await adminClient
    .from('empleados')
    .select('nombre_usuario, correo')
    .limit(500);
  if (error || !data) return null;
  const matches = data.filter((e) => e.nombre_usuario.toLowerCase() === normalized);
  if (matches.length !== 1) return null;
  return matches[0];
};

/**
 * Solicita un reset de contraseña de forma segura (respuesta genérica).
 * @param {{ email: string, adminClient: object, authClient: object, redirectTo: string }} opts
 * @returns {Promise<object>} PASSWORD_RESET_RESPONSE siempre (seguridad)
 */
const requestPasswordReset = async ({ email, adminClient, authClient, redirectTo }) => {
  const { data: empleado, error: dbError } = await adminClient
    .from('empleados')
    .select('correo, esta_activo')
    .ilike('correo', email)
    .maybeSingle();

  if (dbError || !empleado || !empleado.esta_activo) {
    return PASSWORD_RESET_RESPONSE;
  }

  await authClient.auth.resetPasswordForEmail(email, { redirectTo });
  return PASSWORD_RESET_RESPONSE;
};

// Ruta para el LOGIN
const fetchEmployeeEmail = async (adminClient, loginId) => {
  if (loginId.includes('@')) return { email: loginId };
  
  const { data: empleado, error } = await adminClient
    .from('empleados')
    .select('correo')
    .eq('nombre_usuario', loginId)
    .single();

  if (error || !empleado) {
    console.error('Login: Usuario no encontrado en tabla empleados:', loginId, error?.message); // NOSONAR
    return { error: 'Usuario no encontrado' };
  }
  return { email: empleado.correo };
};

const getEmployeeData = async (adminClient, uid, uemail) => {
  const { data: byIdData, error: byIdError } = await adminClient
    .from('empleados')
    .select('*, roles(nombre_rol)')
    .eq('id', uid)
    .limit(1);

  if (byIdError) console.error('Login: Error buscando datos del empleado por ID:', byIdError.message);
  if (byIdData && byIdData.length > 0) return byIdData[0];

  const { data: byEmailData, error: byEmailError } = await adminClient
    .from('empleados')
    .select('*, roles(nombre_rol)')
    .eq('correo', uemail)
    .limit(1);

  if (byEmailError) console.error('Login: Error en fallback por correo:', byEmailError.message);
  if (byEmailData && byEmailData.length > 0) return byEmailData[0];
  
  return null;
};

const determineFrontendRole = (empleadoData) => {
  const rawRoles = empleadoData.roles || empleadoData.Roles;
  const roleName = (Array.isArray(rawRoles) ? rawRoles[0]?.nombre_rol : rawRoles?.nombre_rol) || '';
  const normRole = roleName.toLowerCase().trim();
  
  return ['administrativo', 'administrador', 'admin'].includes(normRole) ? 'administrador' : 'caja';
};

const syncUserMetadata = async (adminClient, authData, empleadoData, rolFrontend) => {
  const meta = authData.user.user_metadata || {};
  if (meta.rol !== rolFrontend || meta.esta_activo !== empleadoData.esta_activo) {
    await adminClient.auth.admin.updateUserById(authData.user.id, {
      user_metadata: { 
        ...meta,
        rol: rolFrontend,
        esta_activo: empleadoData.esta_activo
      }
    });
  }
};

// Ruta para el LOGIN
router.post('/login', async (req, res) => {
  const loginId = req.body.identificador || req.body.email;
  const { password } = req.body;

  if (!loginId || !password) {
    return res.status(400).json({ mensaje: 'Identificador y contraseña obligatorios' });
  }

  try {
    const adminClient = getAdminClient();
    
    const { email: emailToLogin, error: emailError } = await fetchEmployeeEmail(adminClient, loginId);
    if (emailError) return res.status(401).json({ mensaje: emailError });

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: emailToLogin,
      password,
    });

    if (authError || !authData.user) {
      console.error('Login: Error en Supabase Auth:', emailToLogin, authError?.message); // NOSONAR
      return res.status(401).json({ mensaje: 'Credenciales inválidas' });
    }

    const empleadoData = await getEmployeeData(adminClient, authData.user.id, authData.user.email);
    if (!empleadoData) {
      console.error('Login: Empleado no encontrado tras auth exitosa:', authData.user.id, authData.user.email);
      return res.status(404).json({ mensaje: 'Empleado no registrado en la base de datos' });
    }

    if (empleadoData.esta_activo === false) {
      return res.status(403).json({ mensaje: 'Su cuenta ha sido desactivada.' });
    }

    const rolFrontend = determineFrontendRole(empleadoData);
    await syncUserMetadata(adminClient, authData, empleadoData, rolFrontend);

    return res.json({
      mensaje: '¡Acceso concedido!',
      token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      user: {
        id: empleadoData.id,
        email: authData.user.email,
        nombre: empleadoData.nombre,
        apellido: empleadoData.apellido,
        nombre_usuario: empleadoData.nombre_usuario,
        rol: rolFrontend,
      },
    });
  } catch (error) {
    console.error('Login: Error fatal:', error);
    return res.status(500).json({ mensaje: 'Error interno del servidor', detalle: error.message });
  }
});

router.get('/datos-privados', authMiddleware, async (req, res) => {
  res.json({
    mensaje: 'Zona segura',
    usuario_autenticado: req.user.email,
    id_usuario: req.user.id,
  });
});

router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'Token obligatorio' });
  try {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error) return res.status(401).json({ error: 'Sesión expirada' });
    res.json({ token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch {
    res.status(500).json({ error: 'Error interno' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { correo } = req.body;
  if (!correo) return res.status(400).json({ error: 'Correo obligatorio' });
  
  try {
    const adminClient = getAdminClient();
    const redirectTo = `${process.env.FRONTEND_URL || ''}/login`;
    const result = await requestPasswordReset({ email: correo, adminClient, authClient: supabase, redirectTo });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

router._private = { findEmployeeByUsername, requestPasswordReset, PASSWORD_RESET_RESPONSE };

module.exports = router;
