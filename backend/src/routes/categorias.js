const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { parseBody, schemas, sendValidationError } = require('../validation/eciencia');

router.use(authMiddleware);
router.use(roleMiddleware(['administrador']));

// OBTENER TODAS LAS CATEGORÍAS
router.get('/', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('categorias_productos')
      .select('*')
      .order('nombre_categoria', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREAR CATEGORÍA
router.post('/', async (req, res) => {
  try {
    const { nombre_categoria } = parseBody(schemas.categoriaProducto, req.body);
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('categorias_productos')
      .insert([{ nombre_categoria }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// ACTUALIZAR CATEGORÍA
router.put('/:id', async (req, res) => {
  try {
    const { nombre_categoria } = parseBody(schemas.categoriaProducto, req.body);
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('categorias_productos')
      .update({ nombre_categoria })
      .eq('id_categoria', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
