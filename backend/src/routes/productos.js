const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { parseBody, schemas, sendValidationError } = require('../validation/eciencia');
router.use(authMiddleware);

// OBTENER TODOS LOS PRODUCTOS
router.get('/', roleMiddleware(['administrador', 'caja']), async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('productos')
      .select(`
                id_producto,
                nombre_producto,
                precio_unitario,
                esta_activo,
                descripcion,
                id_categoria,
                categorias_productos (id_categoria, nombre_categoria)
            `)
      .order('nombre_producto', { ascending: true });

    if (error) throw error;

    // Formatear para el frontend
    const productosFormateados = data.map((p) => ({
      id: p.id_producto,
      nombre: p.nombre_producto,
      precio: parseFloat(p.precio_unitario),
      activo: p.esta_activo,
      descripcion: p.descripcion || '',
      id_categoria: p.id_categoria,
      categoria_nombre: p.categorias_productos?.nombre_categoria || 'Sin categoría',
    }));

    res.json(productosFormateados);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREAR NUEVO PRODUCTO
router.post('/', roleMiddleware(['administrador']), async (req, res) => {
  try {
    const { id_categoria, nombre, precio, descripcion } = parseBody(schemas.productoCreate, req.body);
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('productos')
      .insert([
        {
          id_categoria,
          nombre_producto: nombre,
          precio_unitario: precio,
          descripcion,
          created_by: req.user.id,
        },
      ])
      .select('*, categorias_productos(nombre_categoria)')
      .single();

    if (error) throw error;

    const formatted = {
      id: data.id_producto,
      nombre: data.nombre_producto,
      precio: parseFloat(data.precio_unitario),
      activo: data.esta_activo,
      descripcion: data.descripcion || '',
      id_categoria: data.id_categoria,
      categoria_nombre: data.categorias_productos?.nombre_categoria || 'Sin categoría',
    };

    res.status(201).json(formatted);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// ACTUALIZAR PRODUCTO
router.put('/:id', roleMiddleware(['administrador']), async (req, res) => {
  try {
    const { id_categoria, nombre, precio, activo, descripcion } = parseBody(schemas.productoUpdate, req.body);
    const updateData = { updated_by: req.user.id };
    if (id_categoria !== undefined) updateData.id_categoria = id_categoria;
    if (nombre !== undefined) updateData.nombre_producto = nombre;
    if (precio !== undefined) updateData.precio_unitario = precio;
    if (activo !== undefined) updateData.esta_activo = activo;
    if (descripcion !== undefined) updateData.descripcion = descripcion;

    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('productos')
      .update(updateData)
      .eq('id_producto', req.params.id)
      .select('*, categorias_productos(nombre_categoria)')
      .single();

    if (error) throw error;

    const formatted = {
      id: data.id_producto,
      nombre: data.nombre_producto,
      precio: parseFloat(data.precio_unitario),
      activo: data.esta_activo,
      descripcion: data.descripcion || '',
      id_categoria: data.id_categoria,
      categoria_nombre: data.categorias_productos?.nombre_categoria || 'Sin categoría',
    };

    res.json(formatted);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
