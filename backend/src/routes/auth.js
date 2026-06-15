const express = require('express');
const router = express.Router();
const { supabase, getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const { parseBody, schemas, sendValidationError } = require('../validation/eciencia');

const mapRoleToAppRole = (roleName = '') => {
  const normalized = String(roleName).toLowerCase().trim();
  if (['super admin', 'administrativo', 'administrador', 'admin'].includes(normalized)) {
    return 'administrador';
  }
  return 'caja';
};

const USERNAME_LOGIN_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;

const findEmployeeByUsername = async (adminClient, username) => {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  if (!USERNAME_LOGIN_PATTERN.test(username)) return null;

  const { data, error } = await adminClient
    .from('empleados')
    .select('correo,nombre_usuario')
    .limit(1000);

  if (error) throw error;

  const matches = (data || []).filter(
    (empleado) => String(empleado.nombre_usuario || '').trim().toLowerCase() === normalizedUsername
  );

  return matches.length === 1 ? matches[0] : null;
};

const PASSWORD_RESET_RESPONSE = 'Si el correo esta registrado, recibira un enlace pronto.';

const requestPasswordReset = async ({
  email,
  adminClient,
  authClient,
  redirectTo = process.env.PASSWORD_RECOVERY_REDIRECT_URL,
}) => {
  const { data: employee, error } = await adminClient
    .from('empleados')
    .select('correo, esta_activo')
    .ilike('correo', email)
    .maybeSingle();
  if (error) throw error;
  if (!employee || employee.esta_activo === false) return PASSWORD_RESET_RESPONSE;

  const options = redirectTo ? { redirectTo } : undefined;
  const { error: authError } = await authClient.auth.resetPasswordForEmail(employee.correo, options);
  if (authError) throw authError;
  return PASSWORD_RESET_RESPONSE;
};

// Ruta para el LOGIN
router.post('/login', async (req, res) => {
  try {
    const { identificador, email, password } = parseBody(schemas.login, req.body);
    const loginId = identificador || email;
    if (!loginId) return res.status(400).json({ mensaje: 'Identificador y contrasena obligatorios' });

    let emailToLogin = loginId;
    const adminClient = getAdminClient();

    // Si es nombre de usuario, buscar correo
    if (!loginId.includes('@')) {
      const empleado = await findEmployeeByUsername(adminClient, loginId);

      if (!empleado) {
        console.warn('Login: identificador no valido o no registrado.');
        return res.status(401).json({ mensaje: 'Credenciales invalidas' });
      }
      emailToLogin = empleado.correo;
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: emailToLogin,
      password,
    });

    if (authError || !authData.user) {
      console.warn('Login: autenticacion rechazada por Supabase Auth.');
      return res.status(401).json({ mensaje: 'Credenciales invalidas' });
    }

    const uid = authData.user.id;
    const uemail = authData.user.email;

    let { data: empleadosData, error: dbError } = await adminClient
      .from('empleados')
      .select('*, roles(nombre_rol)')
      .eq('id', uid)
      .limit(1);

    if (dbError) {
      console.error('Login: Error buscando datos del empleado:', dbError.message);
    }

    // Fallback por correo si falla el ID
    if (!dbError && (!empleadosData || empleadosData.length === 0)) {
      const { data: fallbackData, error: fbError } = await adminClient
        .from('empleados')
        .select('*, roles(nombre_rol)')
        .eq('correo', uemail)
        .limit(1);
      
      if (fbError) {
        console.error('Login: Error en fallback por correo:', fbError.message);
      }

      if (fallbackData && fallbackData.length > 0) {
        empleadosData = fallbackData;
      }
    }

    const empleadoData = empleadosData && empleadosData.length > 0 ? empleadosData[0] : null;

    if (!empleadoData) {
      console.error('Login: empleado no encontrado tras autenticacion exitosa.');
      return res.status(404).json({ mensaje: 'Empleado no registrado en la base de datos' });
    }

    if (empleadoData.esta_activo === false) {
      return res.status(403).json({ mensaje: 'Su cuenta ha sido desactivada.' });
    }

    // Mapeo de Rol para el Frontend
    const rawRoles = empleadoData.roles || empleadoData.Roles;
    const roleName = (Array.isArray(rawRoles) ? rawRoles[0]?.nombre_rol : rawRoles?.nombre_rol) || '';
    const rolFrontend = mapRoleToAppRole(roleName);

    // ACTUALIZAR METADATOS EN SUPABASE AUTH (para que el middleware no tenga que consultar la DB)
    // Solo lo hacemos si hay cambios o para asegurar sincronización
    if (authData.user.app_metadata?.rol !== rolFrontend || authData.user.user_metadata?.esta_activo !== empleadoData.esta_activo) {
      await adminClient.auth.admin.updateUserById(uid, {
        app_metadata: {
          ...authData.user.app_metadata,
          rol: rolFrontend,
        },
        user_metadata: { 
          ...authData.user.user_metadata,
          esta_activo: empleadoData.esta_activo
        }
      });
    }

    res.json({
      mensaje: '¡Acceso concedido!',
      token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      user: {
        id: empleadoData.id,
        email: uemail,
        nombre: empleadoData.nombre,
        apellido: empleadoData.apellido,
        nombre_usuario: empleadoData.nombre_usuario,
        rol: rolFrontend,
      },
    });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    console.error('Login: Error fatal:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
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
  try {
    const { refresh_token } = parseBody(schemas.refresh, req.body);
    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error) return res.status(401).json({ error: 'Sesion expirada' });
    res.json({ token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: 'Error interno' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { correo } = parseBody(schemas.forgotPassword, req.body);
    const message = await requestPasswordReset({
      email: correo.trim(),
      adminClient: getAdminClient(),
      authClient: supabase,
    });
    res.json({ mensaje: message });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    console.error('Error solicitando recuperacion de contrasena:', error);
    res.status(500).json({ error: 'No se pudo procesar la solicitud.' });
  }
});

router._private = {
  findEmployeeByUsername,
  requestPasswordReset,
  PASSWORD_RESET_RESPONSE,
  USERNAME_LOGIN_PATTERN,
};

module.exports = router;
