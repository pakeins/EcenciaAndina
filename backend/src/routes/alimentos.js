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
      .select('id_categoria_menu,nombre_categoria')
      .order('nombre_categoria', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// Crear nueva categoria de menu
router.post('/categorias', roleMiddleware(['administrador']), async (req, res) => {
  try {
    const { nombre_categoria } = parseBody(schemas.categoriaMenu, req.body);
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('categorias_menu')
      .insert({ nombre_categoria })
      .select('id_categoria_menu,nombre_categoria')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// Eliminar categoria de menu
router.delete('/categorias/:id', roleMiddleware(['administrador']), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de categoria invalido.' });
    }

    const adminClient = getAdminClient();

    const { count } = await adminClient
      .from('alimentos')
      .select('id_alimento', { count: 'exact', head: true })
      .eq('id_categoria_menu', id);

    if (count && count > 0) {
      return res.status(409).json({ error: 'No se puede eliminar la categoria porque tiene alimentos asociados.' });
    }

    const { error } = await adminClient
      .from('categorias_menu')
      .delete()
      .eq('id_categoria_menu', id);

    if (error) throw error;
    res.json({ mensaje: 'Categoria eliminada correctamente.' });
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

// Eliminar alimento
router.delete('/:id', roleMiddleware(['administrador']), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de alimento invalido.' });
    }

    const adminClient = getAdminClient();

    const { count } = await adminClient
      .from('menu_diario')
      .select('id_alimento', { count: 'exact', head: true })
      .eq('id_alimento', id);

    if (count && count > 0) {
      return res.status(409).json({ error: 'No se puede eliminar el alimento porque esta asociado a menus anteriores.' });
    }

    const { error } = await adminClient
      .from('alimentos')
      .delete()
      .eq('id_alimento', id);

    if (error) throw error;
    res.json({ mensaje: 'Alimento eliminado correctamente.' });
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
