const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { parseBody, schemas, sendValidationError } = require('../validation/eciencia');
const { findOrCreateFood } = require('../services/menuCatalog');

router.use(authMiddleware);

// --- RUTAS PARA CATEGORIAS DE MENU ---

// Obtener todas las categorías de menú
router.get('/categorias', roleMiddleware(['administrador', 'caja']), async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('categorias_menu')
      .select('id_categoria_menu,nombre_categoria,codigo')
      .order('nombre_categoria', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// --- RUTAS PARA ALIMENTOS ---

// Obtener todos los alimentos (con su categoría)
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
    const food = await findOrCreateFood(adminClient, {
      categoryId: id_categoria,
      name: nombre,
      userId: req.user.id,
    });
    const { created, ...response } = food;

    res.status(created ? 201 : 200).json(response);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// --- RUTAS PARA EL MENU DIARIO ---

// Obtener el menú para el día actual
router.get('/menu-diario/hoy', roleMiddleware(['administrador', 'caja']), async (req, res) => {
  try {
    const adminClient = getAdminClient();
    
    // Usamos la fecha en formato local YYYY-MM-DD
    const hoy = new Date().toISOString().split('T')[0];
    
    // Traer los alimentos del menú de hoy
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

// Guardar el menú del día
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

    res.json({ success: true, message: 'Menú diario guardado correctamente' });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
