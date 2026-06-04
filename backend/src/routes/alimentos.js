const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { parseBody, schemas, sendValidationError } = require('../validation/eciencia');

router.use(authMiddleware);

// --- RUTAS PARA CATEGORIAS DE MENU ---

// Obtener todas las categorÃƒÂ­as de menÃƒÂº
router.get('/categorias', roleMiddleware(['administrador', 'caja']), async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('categorias_menu')
      .select('*')
      .order('nombre_categoria', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// --- RUTAS PARA ALIMENTOS ---

// Obtener todos los alimentos (con su categorÃƒÂ­a)
router.get('/', roleMiddleware(['administrador', 'caja']), async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('alimentos')
      .select(`
        id_alimento,
        nombre_alimento,
        id_categoria_menu
      `)
      .order('nombre_alimento', { ascending: true });

    if (error) {
      throw error;
    }

    const formatted = data.map(item => ({
      id: item.id_alimento,
      nombre: item.nombre_alimento,
      id_categoria: item.id_categoria_menu
    }));

    res.json(formatted);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// Crear nuevo alimento
router.post('/', roleMiddleware(['administrador', 'caja']), async (req, res) => {
  try {
    const { id_categoria, nombre } = parseBody(schemas.alimentoCreate, req.body);
    const adminClient = getAdminClient();
    
    // Primero verificamos si ya existe uno igual para no duplicar
    const { data: existing } = await adminClient
      .from('alimentos')
      .select('*')
      .eq('nombre_alimento', nombre)
      .eq('id_categoria_menu', id_categoria)
      .single();
    
    if (existing) {
      return res.json({
        id: existing.id_alimento,
        nombre: existing.nombre_alimento,
        id_categoria: existing.id_categoria_menu
      });
    }

    const { data, error } = await adminClient
      .from('alimentos')
      .insert([
        {
          id_categoria_menu: id_categoria,
          nombre_alimento: nombre,
          created_by: req.user.id
        }
      ])
      .select('*, categorias_menu(nombre_categoria)')
      .single();

    if (error) throw error;

    res.status(201).json({
      id: data.id_alimento,
      nombre: data.nombre_alimento,
      id_categoria: data.id_categoria_menu,
      categoria_nombre: data.categorias_menu?.nombre_categoria
    });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// --- RUTAS PARA EL MENU DIARIO ---

// Obtener el menÃƒÂº para el dÃƒÂ­a actual
router.get('/menu-diario/hoy', roleMiddleware(['administrador', 'caja']), async (req, res) => {
  try {
    const adminClient = getAdminClient();
    
    // Usamos la fecha en formato local YYYY-MM-DD
    const hoy = new Date().toISOString().split('T')[0];
    
    // Traer los alimentos del menÃƒÂº de hoy
    const { data: alimentosMenu, error } = await adminClient
      .from('menu_diario')
      .select('id_alimento, imagen_url, alimentos(nombre_alimento, id_categoria_menu)')
      .eq('fecha', hoy);

    if (error) throw error;

    res.json({
      fecha: hoy,
      imagen_url: alimentosMenu.find(m => m.imagen_url)?.imagen_url || null,
      alimentos: alimentosMenu.map(m => ({
        id_alimento: m.id_alimento,
        nombre: m.alimentos?.nombre_alimento,
        id_categoria: m.alimentos?.id_categoria_menu
      }))
    });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// Guardar el menÃƒÂº del dÃƒÂ­a
router.post('/menu-diario', roleMiddleware(['administrador', 'caja']), async (req, res) => {
  try {
    const { fecha, alimentos_ids, imagen_url } = parseBody(schemas.menuDiario, req.body);
    const adminClient = getAdminClient();
    const userId = req.user.id;

    // 1. Eliminar los alimentos anteriores de esa fecha
    const { error: deleteError } = await adminClient
      .from('menu_diario')
      .delete()
      .eq('fecha', fecha);
      
    if (deleteError) throw deleteError;

    // 2. Insertar los nuevos
    if (alimentos_ids.length > 0) {
      const inserts = alimentos_ids.map(id => ({
        fecha,
        id_alimento: id,
        imagen_url: imagen_url || null,
        created_by: userId
      }));

      const { error: insertError } = await adminClient
        .from('menu_diario')
        .insert(inserts);

      if (insertError) throw insertError;
    }

    res.json({ success: true, message: 'MenÃƒÂº diario guardado correctamente' });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
