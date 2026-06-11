const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

router.use(authMiddleware);
router.use(roleMiddleware(['administrador', 'caja']));

// Función auxiliar para formatear cliente con su convenio
const formatCliente = (cli) => {
  const convenioRel = cli.clientes_convenios?.[0]?.convenios;
  return {
    id: cli.id_cliente,
    cedula: cli.cedula,
    nombre: cli.nombre,
    apellido: cli.apellido,
    telefono: cli.telefono || '',
    activo: cli.esta_activo,
    id_tipo_cliente: cli.id_tipo_cliente,
    tipo_nombre: cli.tipos_cliente?.nombre_tipo || 'Sin tipo',
    convenio: convenioRel ? {
      id: convenioRel.id_convenio,
      nombre: convenioRel.nombre_empresa
    } : null
  };
};

// OBTENER TODOS LOS CLIENTES
router.get('/', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('clientes')
      .select(`
        *,
        tipos_cliente(nombre_tipo),
        clientes_convenios(
          convenios(id_convenio, nombre_empresa)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data.map(formatCliente));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// OBTENER TIPOS DE CLIENTE
router.get('/tipos', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('tipos_cliente')
      .select('*')
      .order('nombre_tipo', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// QUITAR CLIENTE DE CUALQUIER CONVENIO
router.delete('/:id/convenio', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { error } = await adminClient
      .from('clientes_convenios')
      .delete()
      .eq('id_cliente', req.params.id);

    if (error) throw error;
    res.json({ mensaje: 'Vínculo con convenio eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREAR NUEVO CLIENTE
router.post('/', async (req, res) => {
  const { cedula, nombre, apellido, telefono, id_tipo_cliente, id_convenio } = req.body;
  try {
    const adminClient = getAdminClient();

    if (telefono && telefono.trim() !== '') {
      const { data: phoneCheck } = await adminClient
        .from('clientes')
        .select('id_cliente, esta_activo')
        .eq('telefono', telefono.trim());

      if (phoneCheck && phoneCheck.some(c => c.esta_activo)) {
        return res.status(400).json({ error: 'Este teléfono ya está registrado y pertenece a un cliente activo.' });
      }
    }

    const { data, error } = await adminClient
      .from('clientes')
      .insert([{ cedula, nombre, apellido, telefono, id_tipo_cliente: id_tipo_cliente || 1, created_by: req.user.id }])
      .select('id_cliente')
      .single();
    if (error) throw error;

    if (id_tipo_cliente == 2 && id_convenio) {
      await adminClient.from('clientes_convenios').insert([{ id_cliente: data.id_cliente, id_convenio }]);
    }

    const { data: finalData, error: finalError } = await adminClient
      .from('clientes')
      .select('*, tipos_cliente(nombre_tipo), clientes_convenios(convenios(id_convenio, nombre_empresa))')
      .eq('id_cliente', data.id_cliente)
      .single();
    if (finalError) throw finalError;

    res.status(201).json(formatCliente(finalData));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ACTUALIZAR CLIENTE
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { activo, cedula, nombre, apellido, telefono, id_tipo_cliente, id_convenio } = req.body;

  const actualizacion = { updated_by: req.user.id };
  if (activo !== undefined) actualizacion.esta_activo = activo;
  if (cedula) actualizacion.cedula = cedula;
  if (nombre) actualizacion.nombre = nombre;
  if (apellido) actualizacion.apellido = apellido;
  if (telefono !== undefined) actualizacion.telefono = telefono;
  if (id_tipo_cliente) actualizacion.id_tipo_cliente = id_tipo_cliente;

  try {
    const adminClient = getAdminClient();

    if (telefono && telefono.trim() !== '') {
      const { data: phoneCheck } = await adminClient
        .from('clientes')
        .select('id_cliente, esta_activo')
        .eq('telefono', telefono.trim())
        .neq('id_cliente', id);

      if (phoneCheck && phoneCheck.some(c => c.esta_activo)) {
        return res.status(400).json({ error: 'Este teléfono ya está registrado y pertenece a un cliente activo.' });
      }
    }

    const { data, error } = await adminClient
      .from('clientes')
      .update(actualizacion)
      .eq('id_cliente', id)
      .select('id_cliente')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Cliente no encontrado' });

    if (id_tipo_cliente == 2) {
      if (id_convenio) {
        await adminClient.from('clientes_convenios').delete().eq('id_cliente', id);
        await adminClient.from('clientes_convenios').insert([{ id_cliente: id, id_convenio }]);
      } else if (id_convenio === '') {
        await adminClient.from('clientes_convenios').delete().eq('id_cliente', id);
      }
    } else if (id_tipo_cliente == 1) {
      await adminClient.from('clientes_convenios').delete().eq('id_cliente', id);
    }

    const { data: finalData, error: finalError } = await adminClient
      .from('clientes')
      .select('*, tipos_cliente(nombre_tipo), clientes_convenios(convenios(id_convenio, nombre_empresa))')
      .eq('id_cliente', id)
      .single();

    if (finalError) throw finalError;

    res.json(formatCliente(finalData));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// OBTENER SALDO DEL MONEDERO VIRTUAL
router.get('/:id/saldo', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('saldos_servicio')
      .select('*, productos(nombre_producto, precio_unitario)')
      .eq('id_cliente', req.params.id);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// RECARGAR SALDO AL MONEDERO VIRTUAL
router.post('/:id/recargar', async (req, res) => {
  const { id_producto, cantidad_comprada, monto_total, numero_factura } = req.body;
  const id_cliente = req.params.id;

  if (!numero_factura || !numero_factura.trim()) {
    return res.status(400).json({ error: 'El número de factura es requerido para registrar la recarga' });
  }

  try {
    const adminClient = getAdminClient();

    // 1. Insertar el registro de recarga
    const { error: errorRecarga } = await adminClient
      .from('recargas_saldo')
      .insert([{ 
        id_cliente, 
        id_producto, 
        cantidad_comprada, 
        monto_total,
        numero_factura: numero_factura.trim(),
        created_by: req.user.id 
      }]);

    if (errorRecarga) throw errorRecarga;

    // 2. Verificar si ya tiene saldo previo de este producto
    const { data: saldoPrevio, error: errorSaldoPrevio } = await adminClient
      .from('saldos_servicio')
      .select('cantidad_disponible')
      .eq('id_cliente', id_cliente)
      .eq('id_producto', id_producto)
      .single();

    if (errorSaldoPrevio && errorSaldoPrevio.code !== 'PGRST116') {
      // PGRST116 is "Results contain 0 rows"
      throw errorSaldoPrevio;
    }

    if (saldoPrevio) {
      // Actualizar sumando la nueva cantidad
      const nuevaCantidad = saldoPrevio.cantidad_disponible + cantidad_comprada;
      const { error: errorUpdate } = await adminClient
        .from('saldos_servicio')
        .update({ cantidad_disponible: nuevaCantidad, updated_by: req.user.id })
        .eq('id_cliente', id_cliente)
        .eq('id_producto', id_producto);

      if (errorUpdate) throw errorUpdate;
    } else {
      // Insertar nuevo registro de saldo
      const { error: errorInsert } = await adminClient
        .from('saldos_servicio')
        .insert([{ 
          id_cliente, 
          id_producto, 
          cantidad_disponible: cantidad_comprada,
          updated_by: req.user.id 
        }]);

      if (errorInsert) throw errorInsert;
    }

    res.status(201).json({ mensaje: 'Recarga registrada exitosamente y saldo actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// OBTENER HISTORIAL DE RECARGAS Y CONSUMOS DE UN CLIENTE
router.get('/:id/historial', async (req, res) => {
  const id_cliente = req.params.id;
  try {
    const adminClient = getAdminClient();

    // 1. Obtener todas las recargas del cliente
    const { data: recargas, error: errRecargas } = await adminClient
      .from('recargas_saldo')
      .select('id_recarga, cantidad_comprada, monto_total, numero_factura, created_at, created_by, productos(nombre_producto)')
      .eq('id_cliente', id_cliente)
      .order('created_at', { ascending: false });

    if (errRecargas) throw errRecargas;

    // 2. Obtener todas las órdenes consumidas (estado 2) con Saldo Prepago del cliente
    const { data: ordenes, error: errOrdenes } = await adminClient
      .from('ordenes')
      .select(`
        id_orden,
        created_at,
        created_by,
        detalle_orden(
          cantidad,
          precio_aplicado,
          productos(nombre_producto)
        )
      `)
      .eq('id_cliente', id_cliente)
      .eq('id_estado', 2)
      .eq('metodo_pago', 'Saldo Prepago')
      .order('created_at', { ascending: false });

    if (errOrdenes) throw errOrdenes;

    // 3. Obtener nombres de empleados para ambas fuentes
    const { data: empleados } = await adminClient
      .from('empleados')
      .select('id, nombre, apellido');

    const empMap = {};
    (empleados || []).forEach(e => { empMap[e.id] = `${e.nombre} ${e.apellido}`; });

    // 4. Formatear recargas
    const eventosRecarga = (recargas || []).map(r => ({
      tipo: 'recarga',
      fecha: r.created_at,
      producto: r.productos?.nombre_producto || 'Sin producto',
      cantidad: r.cantidad_comprada,
      monto_total: r.monto_total,
      numero_factura: r.numero_factura || null,
      registrado_por: empMap[r.created_by] || 'Sistema',
      referencia: r.id_recarga
    }));

    // 5. Formatear consumos (una entrada por detalle de la orden)
    const eventosConsumo = [];
    for (const orden of (ordenes || [])) {
      for (const det of (orden.detalle_orden || [])) {
        eventosConsumo.push({
          tipo: 'consumo',
          fecha: orden.created_at,
          producto: det.productos?.nombre_producto || 'Sin producto',
          cantidad: det.cantidad,
          precio_aplicado: det.precio_aplicado,
          registrado_por: empMap[orden.created_by] || 'Sistema',
          referencia: orden.id_orden
        });
      }
    }

    // 6. Combinar y ordenar por fecha descendente
    const historial = [...eventosRecarga, ...eventosConsumo]
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    res.json(historial);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
