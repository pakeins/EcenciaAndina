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
      const { data: empleado, error: empError } = await adminClient
        .from('empleados')
        .select('correo')
        .eq('nombre_usuario', loginId)
        .single();

      if (empError || !empleado) {
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
    // Solo lo hacemos si hay cambios o para asegurar sincronizaciÃƒÆ’Ã‚Â³n
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
      mensaje: 'Ãƒâ€šÃ‚Â¡Acceso concedido!',
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

module.exports = router;
