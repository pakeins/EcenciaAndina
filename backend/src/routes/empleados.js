const express = require('express');
const router = express.Router();
const { getAdminClient, supabase } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { parseBody, schemas, sendValidationError } = require('../validation/eciencia');

// Obtener todos los empleados
router.get('/', authMiddleware, roleMiddleware(['administrador']), async (req, res) => {
  try {
    const adminClient = getAdminClient();

    const { data, error } = await adminClient
      .from('empleados')
      .select(
        `
                id,
                id_rol,
                nombre,
                apellido,
                correo,
                nombre_usuario,
                esta_activo,
                created_at,
                roles (nombre_rol)
            `
      )
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// Crear un nuevo empleado
router.post('/', authMiddleware, roleMiddleware(['administrador']), async (req, res) => {
  try {
    const { nombre, apellido, correo, password, nombre_usuario, id_rol } = parseBody(schemas.empleadoCreate, req.body);
    const creatorId = req.user.id;
    const adminClient = getAdminClient();

    // 0. Validaciones de duplicados
    const [emailCheck, usernameCheck] = await Promise.all([
      adminClient.from('empleados').select('correo, nombre_usuario').eq('correo', correo).limit(1),
      adminClient.from('empleados').select('correo, nombre_usuario').eq('nombre_usuario', nombre_usuario).limit(1),
    ]);

    if (emailCheck.error) throw emailCheck.error;
    if (usernameCheck.error) throw usernameCheck.error;

    const existingUser = [...(emailCheck.data || []), ...(usernameCheck.data || [])];
    if (existingUser.length > 0) {
      const dupe = existingUser.find((u) => u.correo === correo);
      if (dupe) return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
      const dupeUser = existingUser.find((u) => u.nombre_usuario === nombre_usuario);
      if (dupeUser) return res.status(400).json({ error: 'El nombre de usuario ya está en uso.' });
    }

    // 1. Crear el usuario en Auth con metadatos de rol y estado
    const rolNombre = id_rol === 1 || id_rol === '1' ? 'administrador' : 'caja'; // Ajustar según tus IDs de roles
    
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email: correo,
      password: password,
      email_confirm: true,
      app_metadata: {
        rol: rolNombre,
      },
      user_metadata: { 
        nombre, 
        apellido, 
        nombre_usuario,
        esta_activo: true
      },
    });

    if (authError) throw authError;

    // 2. Insertar en empleados
    const { data: empleadoData, error: dbError } = await adminClient
      .from('empleados')
      .insert({
        id: authUser.user.id,
        nombre,
        apellido,
        correo,
        nombre_usuario,
        id_rol,
        esta_activo: true,
        created_by: creatorId,
        updated_by: creatorId,
      })
      .select(
        `
                id,
                id_rol,
                nombre,
                apellido,
                correo,
                nombre_usuario,
                esta_activo,
                created_at,
                roles (nombre_rol)
            `
      )
      .single();

    if (dbError) {
      await adminClient.auth.admin.deleteUser(authUser.user.id);
      throw dbError;
    }

    res.status(201).json(empleadoData);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// Los demás métodos también deben usar adminClient si hay RLS...
// Pero por ahora actualicemos los básicos de lectura.

// Obtener perfil del usuario autenticado
router.get('/perfil', authMiddleware, async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('empleados')
      .select('id, nombre, apellido, correo, nombre_usuario, esta_activo, roles(nombre_rol)')
      .eq('id', req.user.id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch {
    res.status(500).json({ error: 'No se pudo cargar el perfil.' });
  }
});

// Actualizar perfil del usuario autenticado
router.put('/perfil', authMiddleware, async (req, res) => {
  try {
    const { nombre, apellido, nombre_usuario } = parseBody(schemas.perfilUpdate, req.body);
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('empleados')
      .update({
        nombre,
        apellido,
        nombre_usuario,
        updated_by: req.user.id,
      })
      .eq('id', req.user.id)
      .select('*, roles(nombre_rol)')
      .single();

    if (error) throw error;

    await adminClient.auth.admin.updateUserById(req.user.id, {
      user_metadata: { nombre, apellido, nombre_usuario }
    });

    res.json({ mensaje: 'Perfil actualizado exitosamente', data });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// Cambiar contraseña del usuario autenticado
router.put('/perfil/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = parseBody(schemas.passwordChange, req.body);
    
    // Verificar contraseña actual
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: req.user.email,
      password: currentPassword,
    });
    if (authError) {
      return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
    }

    const adminClient = getAdminClient();
    const { error } = await adminClient.auth.admin.updateUserById(req.user.id, {
      password: newPassword
    });

    if (error) throw error;
    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

router.put('/perfil/recovery-password', authMiddleware, async (req, res) => {
  try {
    const { password } = parseBody(schemas.passwordAdmin, req.body);
    const adminClient = getAdminClient();
    const { error } = await adminClient.auth.admin.updateUserById(req.user.id, { password });
    if (error) throw error;
    res.json({ mensaje: 'Contrasena recuperada exitosamente' });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: 'No se pudo actualizar la contrasena.' });
  }
});

router.post('/:id/reset-password', authMiddleware, roleMiddleware(['administrador']), async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data: employee, error } = await adminClient
      .from('empleados')
      .select('correo, esta_activo')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!employee) return res.status(404).json({ error: 'Empleado no encontrado.' });
    if (employee.esta_activo === false) {
      return res.status(400).json({ error: 'No se puede recuperar una cuenta inactiva.' });
    }

    const options = process.env.PASSWORD_RECOVERY_REDIRECT_URL
      ? { redirectTo: process.env.PASSWORD_RECOVERY_REDIRECT_URL }
      : undefined;
    const { error: authError } = await supabase.auth.resetPasswordForEmail(employee.correo, options);
    if (authError) throw authError;
    res.json({ mensaje: `Enlace de recuperacion enviado a ${employee.correo}` });
  } catch {
    res.status(500).json({ error: 'No se pudo enviar el enlace de recuperacion.' });
  }
});

// Actualizar estado (Activar/Desactivar)
router.put('/:id/estado', authMiddleware, roleMiddleware(['administrador']), async (req, res) => {
  try {
    const { esta_activo } = parseBody(schemas.empleadoEstado, req.body);
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('empleados')
      .update({ esta_activo, updated_by: req.user.id })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Sincronizar metadato de estado en Auth
    await adminClient.auth.admin.updateUserById(req.params.id, {
      user_metadata: { esta_activo }
    });

    res.json(data);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// Actualizar datos del empleado
router.put('/:id', authMiddleware, roleMiddleware(['administrador']), async (req, res) => {
  try {
    const { nombre, apellido, nombre_usuario, id_rol } = parseBody(schemas.empleadoUpdate, req.body);
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('empleados')
      .update({
        nombre,
        apellido,
        nombre_usuario,
        id_rol,
        updated_by: req.user.id,
      })
      .eq('id', req.params.id)
      .select('*, roles(nombre_rol)')
      .single();

    if (error) throw error;

    // Sincronizar metadato de rol en Auth si cambió
    const rolNombre = id_rol === 1 || id_rol === '1' ? 'administrador' : 'caja';
    await adminClient.auth.admin.updateUserById(req.params.id, {
      app_metadata: { rol: rolNombre }
    });

    res.json(data);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// Cambiar contraseña (Fuerza bruta administrativa)
router.put('/:id/password', authMiddleware, roleMiddleware(['administrador']), async (req, res) => {
  try {
    const { password } = parseBody(schemas.passwordAdmin, req.body);
    const adminClient = getAdminClient();
    const { error } = await adminClient.auth.admin.updateUserById(req.params.id, {
      password,
    });

    if (error) throw error;
    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
