const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

router.use(authMiddleware);

// --- RUTAS PARA CATEGORIAS DE MENU ---

// Obtener todas las categorías de menú
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
    res.status(500).json({ error: error.message });
  }
});

// Crear nuevo alimento
router.post('/', roleMiddleware(['administrador', 'caja']), async (req, res) => {
  const { id_categoria, nombre } = req.body;
  try {
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
      .select('id_alimento, alimentos(nombre_alimento, id_categoria_menu)')
      .eq('fecha', hoy);

    if (error) throw error;

    res.json({
      fecha: hoy,
      alimentos: alimentosMenu.map(m => ({
        id_alimento: m.id_alimento,
        nombre: m.alimentos?.nombre_alimento,
        id_categoria: m.alimentos?.id_categoria_menu
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Guardar el menú del día
router.post('/menu-diario', roleMiddleware(['administrador', 'caja']), async (req, res) => {
  const { fecha, alimentos_ids } = req.body;
  
  if (!fecha || !Array.isArray(alimentos_ids)) {
    return res.status(400).json({ error: 'Fecha y array de alimentos_ids requeridos' });
  }

  try {
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
        created_by: userId
      }));

      const { error: insertError } = await adminClient
        .from('menu_diario')
        .insert(inserts);

      if (insertError) throw insertError;
    }

    res.json({ success: true, message: 'Menú diario guardado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
