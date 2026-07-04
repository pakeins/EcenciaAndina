const express = require('express');
const router = express.Router();
const { supabase, getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');

// Ruta para el LOGIN
router.post('/login', async (req, res) => {
  const { identificador, password } = req.body;
  const loginId = identificador || req.body.email;

  if (!loginId || !password) {
    return res.status(400).json({ mensaje: 'Identificador y contraseña obligatorios' });
  }

  try {
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
        console.error('Login: Usuario no encontrado en tabla empleados:', loginId, empError?.message);
        return res.status(401).json({ mensaje: 'Usuario no encontrado' });
      }
      emailToLogin = empleado.correo;
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: emailToLogin,
      password,
    });

    if (authError || !authData.user) {
      console.error('Login: Error en Supabase Auth:', emailToLogin, authError?.message);
      return res.status(401).json({ mensaje: 'Credenciales inválidas' });
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
      console.error('Login: Empleado no encontrado tras auth exitosa:', uid, uemail);
      return res.status(404).json({ mensaje: 'Empleado no registrado en la base de datos' });
    }

    if (empleadoData.esta_activo === false) {
      return res.status(403).json({ mensaje: 'Su cuenta ha sido desactivada.' });
    }

    // Mapeo de Rol para el Frontend
    let rolFrontend = 'caja';
    const rawRoles = empleadoData.roles || empleadoData.Roles;
    const roleName = (Array.isArray(rawRoles) ? rawRoles[0]?.nombre_rol : rawRoles?.nombre_rol) || '';
    const normRole = roleName.toLowerCase().trim();

    if (['administrativo', 'administrador', 'admin'].includes(normRole)) {
      rolFrontend = 'administrador';
    }

    // ACTUALIZAR METADATOS EN SUPABASE AUTH (para que el middleware no tenga que consultar la DB)
    // Solo lo hacemos si hay cambios o para asegurar sincronización
    if (authData.user.user_metadata?.rol !== rolFrontend || authData.user.user_metadata?.esta_activo !== empleadoData.esta_activo) {
      await adminClient.auth.admin.updateUserById(uid, {
        user_metadata: { 
          ...authData.user.user_metadata,
          rol: rolFrontend,
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
    console.error('Login: Error fatal:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor', detalle: error.message });
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
    
    const { data: empleado, error: dbError } = await adminClient
      .from('empleados')
      .select('correo, esta_activo')
      .eq('correo', correo)
      .single();
      
    if (dbError || !empleado) {
      // Se devuelve success igual para no revelar qué correos existen en el sistema (seguridad)
      return res.json({ mensaje: 'Si el correo está registrado, recibirá un enlace pronto.' });
    }
    
    if (!empleado.esta_activo) {
      return res.status(403).json({ error: 'La cuenta asociada está inactiva.' });
    }

    const { error: authError } = await supabase.auth.resetPasswordForEmail(correo);
    if (authError) throw authError;

    res.json({ mensaje: 'Si el correo está registrado, recibirá un enlace pronto.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

module.exports = router;
