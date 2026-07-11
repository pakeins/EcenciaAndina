const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { parseBody, schemas, sendValidationError } = require('../validation/ecencia');
const { ORDER_STATE, CLIENT_TYPE } = require('../constants/domain');
const { zonedStartOfDay, getDateInTimeZone } = require('../services/reporting');
const { sendMessage } = require('../services/telegramMicroservice');

router.use(authMiddleware);
router.use(roleMiddleware(['administrador', 'caja']));

// CREAR UNA NUEVA ORDEN
router.post('/', async (req, res) => {
  try {
    const { id_cliente, id_estado, id_origen, canal_origen, observaciones, detalles, metodo_pago } = parseBody(
      schemas.ordenCreate,
      req.body,
    );
    const adminClient = getAdminClient();

    // Validar si el método de pago es Convenio Empresa
    if (metodo_pago === 'Convenio Empresa') {
      const { data: cliente, error: errCliente } = await adminClient
        .from('clientes')
        .select(`
          clientes_convenios(
            convenios(id_convenio, esta_activo, fecha_caducidad)
          )
        `)
        .eq('id_cliente', id_cliente)
        .single();
      
      if (errCliente) throw errCliente;
      
      const convenioRel = cliente.clientes_convenios?.[0]?.convenios;
      
      if (!convenioRel) {
        return res.status(400).json({ error: 'El cliente no cuenta con convenio asociado. Por favor asigne el convenio antes de confirmar el pedido.' });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isExpired = convenioRel.fecha_caducidad ? new Date(convenioRel.fecha_caducidad + 'T00:00:00') < today : false;
      
      if (!convenioRel.esta_activo || isExpired) {
        return res.status(400).json({ error: 'El convenio no se encuentra habilitado y es necesario que se gestione.' });
      }
    }

    // 1. Crear la cabecera de la Orden
    const { data: orden, error: errorOrden } = await adminClient
      .from('ordenes')
      .insert([{ id_cliente, id_estado, id_origen, canal_origen, observaciones, metodo_pago, created_by: req.user.id }])
      .select()
      .single();

    if (errorOrden) throw errorOrden;

    // 2. Insertar los detalles de la Orden
    const detallesAInsertar = detalles.map((det) => ({
      id_orden: orden.id_orden,
      id_producto: det.id_producto,
      cantidad: det.cantidad,
      precio_aplicado: det.precio_aplicado,
      opciones: det.opciones || {},
      created_by: req.user.id,
      updated_by: req.user.id,
    }));

    const { error: errorDetalles } = await adminClient.from('detalle_orden').insert(detallesAInsertar);

    if (errorDetalles) throw errorDetalles;

    res.status(201).json({ mensaje: 'Orden registrada exitosamente', orden });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// OBTENER TODAS LAS ORDENES
router.get('/telegram/trazabilidad', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const {
      chat_id: chatId,
      outcome,
      id_cliente: idCliente,
      id_orden: idOrden,
      fecha_inicio,
      fecha_fin
    } = req.query;
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(Math.max(1, Number.parseInt(String(req.query.limit || '20'), 10) || 20), 250);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = adminClient
      .from('telegram_order_traces')
      .select(`
        *,
        clientes(nombre,apellido,telefono),
        ordenes(id_orden,created_at)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (outcome) query = query.eq('outcome', outcome);
    if (chatId) query = query.eq('chat_id', chatId);
    if (idCliente) query = query.eq('id_cliente', idCliente);
    if (idOrden) query = query.eq('id_orden', idOrden);
    if (fecha_inicio) query = query.gte('created_at', fecha_inicio);
    if (fecha_fin) query = query.lte('created_at', fecha_fin + 'T23:59:59.999Z');

    const { data, error, count } = await query;
    if (error) throw error;
    const total = Number(count || 0);
    res.json({
      traces: data || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { fecha_inicio, fecha_fin } = req.query;

    // 1. Cancelar automáticamente pedidos reservados (estado 1) de días anteriores
    const todayStart = zonedStartOfDay(getDateInTimeZone(new Date()));
    
    await adminClient
      .from('ordenes')
      .update({ id_estado: ORDER_STATE.CANCELLED })
      .eq('id_estado', ORDER_STATE.RESERVED)
      .lt('created_at', todayStart.toISOString());
    
    // 2. Construir la consulta principal
    let query = adminClient
      .from('ordenes')
      .select(`
        id_orden,
        numero_orden,
        id_estado,
        created_at,
        consumed_at,
        updated_at,
        canal_origen,
        observaciones,
        created_by,
        clientes ( nombre, apellido, telefono, tipos_cliente ( nombre_tipo ) ),
        estados_orden ( nombre_estado ),
        origenes_pedido ( nombre_origen ),
        detalle_orden (
          id_detalle,
          id_producto,
          cantidad,
          precio_aplicado,
          opciones,
          productos ( nombre_producto )
        )
      `);

    if (fecha_inicio) {
      query = query.gte('created_at', fecha_inicio);
    }
    if (fecha_fin) {
      query = query.lte('created_at', fecha_fin);
    }

    // Aplicar ordenamiento al final (Supabase requiere filtros antes de modificadores)
    query = query.order('created_at', { ascending: false });

    // Fetch orders with related data
    const { data: ordenes, error: errorOrdenes } = await query;

    if (errorOrdenes) throw errorOrdenes;

    // Fetch employees to map creator names
    const { data: empleados, error: errorEmpleados } = await adminClient
      .from('empleados')
      .select('id, nombre, apellido');

    if (errorEmpleados) throw errorEmpleados;

    // Map creator names
    const ordenesConCreador = ordenes.map(orden => {
      const empleado = empleados.find(emp => emp.id === orden.created_by);
      return {
        ...orden,
        creador_nombre: empleado ? `${empleado.nombre} ${empleado.apellido}` : 'Sistema/Desconocido'
      };
    });

    res.json(ordenesConCreador);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ACTUALIZAR ORDEN COMPLETA
router.put('/:id', async (req, res) => {
  const id_orden = req.params.id;

  try {
    const { observaciones, detalles } = parseBody(schemas.ordenUpdate, req.body);
    const adminClient = getAdminClient();
    
    // 1. Actualizar la cabecera
    const { error: errorOrden } = await adminClient
      .from('ordenes')
      .update({ observaciones, updated_by: req.user.id })
      .eq('id_orden', id_orden);

    if (errorOrden) throw errorOrden;

    // 2. Eliminar detalles anteriores
    const { error: errorDelete } = await adminClient
      .from('detalle_orden')
      .delete()
      .eq('id_orden', id_orden);

    if (errorDelete) throw errorDelete;

    // 3. Insertar nuevos detalles
    const detallesAInsertar = detalles.map((det) => ({
      id_orden: id_orden,
      id_producto: det.id_producto,
      cantidad: det.cantidad,
      precio_aplicado: det.precio_aplicado,
      opciones: det.opciones || {},
      created_by: req.user.id,
      updated_by: req.user.id,
    }));

    const { error: errorDetalles } = await adminClient.from('detalle_orden').insert(detallesAInsertar);

    if (errorDetalles) throw errorDetalles;

    res.json({ mensaje: 'Orden actualizada exitosamente' });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// ACTUALIZAR ESTADO DE LA ORDEN
router.put('/:id/estado', async (req, res) => {
  const id_orden = req.params.id;
  try {
    const { id_estado, forceFallback } = parseBody(schemas.estadoOrden, req.body);
    const adminClient = getAdminClient();

    let orden;
    // Si se marca como Consumido (2)
    if (id_estado === ORDER_STATE.CONSUMED) {
      // Obtener detalles de la orden y cliente
      const { data, error: errOrden } = await adminClient
        .from('ordenes')
        .select('id_cliente, metodo_pago, clientes(id_tipo_cliente), detalle_orden(id_producto, cantidad)')
        .eq('id_orden', id_orden)
        .single();
      
      orden = data;
      
      if (errOrden) throw errOrden;

      // Validar si el cliente tiene convenio habilitado
      if (orden.metodo_pago === 'Convenio Empresa') {
        const { data: cliente, error: errCliente } = await adminClient
          .from('clientes')
          .select(`
            clientes_convenios(
              convenios(id_convenio, esta_activo, fecha_caducidad)
            )
          `)
          .eq('id_cliente', orden.id_cliente)
          .single();
        
        if (errCliente) throw errCliente;
        
        const convenioRel = cliente.clientes_convenios?.[0]?.convenios;
        
        if (!convenioRel) {
          return res.status(400).json({ error: 'El cliente no cuenta con convenio asociado. Por favor asigne el convenio antes de confirmar el pedido.' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isExpired = convenioRel.fecha_caducidad ? new Date(convenioRel.fecha_caducidad + 'T00:00:00') < today : false;
        
        if (!convenioRel.esta_activo || isExpired) {
          return res.status(400).json({ error: 'El convenio no se encuentra habilitado y es necesario que se gestione.' });
        }
      }

      // Verificar y descontar si es Saldo Prepago o Cliente Directo con metodo Pendiente
      const isDirectClient = orden.clientes?.id_tipo_cliente === CLIENT_TYPE.DIRECT;
      if (orden.metodo_pago === 'Saldo Prepago' || (isDirectClient && orden.metodo_pago === 'Pendiente')) {
        // Obtenemos todos los saldos del cliente junto con los precios de los productos
        const { data: saldosCliente, error: errSaldos } = await adminClient
          .from('saldos_servicio')
          .select('id_producto, cantidad_disponible, productos(precio_unitario, nombre_producto)')
          .eq('id_cliente', orden.id_cliente)
          .gt('cantidad_disponible', 0);

        if (errSaldos) throw errSaldos;

        // Obtenemos los precios de los productos que se están pidiendo
        const idsPedidos = orden.detalle_orden.map(d => d.id_producto);
        const { data: productosPedidos, error: errProd } = await adminClient
          .from('productos')
          .select('id_producto, precio_unitario')
          .in('id_producto', idsPedidos);

        if (errProd) throw errProd;

        // Copia local de los saldos para ir descontando en memoria
        // supabase devuelve s.productos como objeto (o array de 1 en algunos casos, probaremos objeto primero)
        let saldosDisponibles = saldosCliente.map(s => ({
          id_producto: s.id_producto,
          cantidad: s.cantidad_disponible,
          precio: Array.isArray(s.productos) ? s.productos[0]?.precio_unitario : s.productos?.precio_unitario
        }));

        const deducciones = [];

        let fallbackUsed = false;

        for (const det of orden.detalle_orden) {
          const prodPedido = productosPedidos.find(p => p.id_producto === det.id_producto);
          const precioPedido = prodPedido ? prodPedido.precio_unitario : 0;
          let cantidadRestante = det.cantidad;

          // 1. Intentar descontar del saldo exacto primero
          const saldoExacto = saldosDisponibles.find(s => s.id_producto === det.id_producto);
          if (saldoExacto && saldoExacto.cantidad > 0) {
            const descontar = Math.min(saldoExacto.cantidad, cantidadRestante);
            saldoExacto.cantidad -= descontar;
            cantidadRestante -= descontar;
            deducciones.push({ id_producto_saldo: saldoExacto.id_producto, cantidad: descontar });
          }

          // 2. Si aún falta, buscar saldos iguales o más caros
          if (cantidadRestante > 0) {
            const saldosMasCaros = saldosDisponibles
              .filter(s => s.precio >= precioPedido && s.cantidad > 0)
              .sort((a, b) => a.precio - b.precio);

            for (const saldoCaro of saldosMasCaros) {
              if (cantidadRestante === 0) break;
              const descontar = Math.min(saldoCaro.cantidad, cantidadRestante);
              saldoCaro.cantidad -= descontar;
              cantidadRestante -= descontar;
              deducciones.push({ id_producto_saldo: saldoCaro.id_producto, cantidad: descontar });
              
              if (saldoCaro.id_producto !== det.id_producto && saldoCaro.precio > precioPedido) {
                fallbackUsed = true;
              }
            }
          }

          if (cantidadRestante > 0) {
            return res.status(400).json({ error: 'El cliente no tiene saldo suficiente en su monedero. Por favor recargue el saldo.' });
          }
        }

        if (fallbackUsed && !forceFallback) {
          return res.status(409).json({ 
            requireConfirmation: true, 
            error: 'El cliente no tiene saldo exacto para este producto. Se utilizará el saldo de un almuerzo equivalente. ¿Desea continuar?' 
          });
        }

        // Agrupar deducciones por producto para realizar los updates
        const deduccionesAgrupadas = {};
        for (const ded of deducciones) {
          deduccionesAgrupadas[ded.id_producto_saldo] = (deduccionesAgrupadas[ded.id_producto_saldo] || 0) + ded.cantidad;
        }

        // Aplicar los descuentos reales a la BD
        for (const [id_producto_saldo, cant_a_descontar] of Object.entries(deduccionesAgrupadas)) {
          const { data: saldoActual } = await adminClient
            .from('saldos_servicio')
            .select('cantidad_disponible')
            .eq('id_cliente', orden.id_cliente)
            .eq('id_producto', id_producto_saldo)
            .single();

          await adminClient
            .from('saldos_servicio')
            .update({ 
              cantidad_disponible: saldoActual.cantidad_disponible - cant_a_descontar, 
              updated_by: req.user.id 
            })
            .eq('id_cliente', orden.id_cliente)
            .eq('id_producto', id_producto_saldo);
        }
      }
    }

    const updatePayload = {
      id_estado,
      updated_by: req.user.id,
    };

    // Si se consumio existosamente desde "Pendiente" y es cliente frecuente, forzamos "Saldo Prepago"
    if (id_estado === ORDER_STATE.CONSUMED && orden) {
      const isDirectClient = orden.clientes?.id_tipo_cliente === CLIENT_TYPE.DIRECT;
      if (isDirectClient && orden.metodo_pago === 'Pendiente') {
        updatePayload.metodo_pago = 'Saldo Prepago';
      }
    }

    const { data, error } = await adminClient
      .from('ordenes')
      .update(updatePayload)
      .eq('id_orden', id_orden)
      .select()
      .single();

    if (error) throw error;
    res.json({ mensaje: 'Estado actualizado', orden: data });

    // Notificar al usuario por Telegram asincrónicamente
    (async () => {
      try {
        const { data: sub } = await adminClient
          .from('telegram_subscriptions')
          .select('chat_id, consent_status, is_active')
          .eq('id_cliente', data.id_cliente)
          .maybeSingle();

        if (sub && sub.chat_id && sub.is_active !== false && sub.consent_status === 'accepted') {
          let msg = null;
          const numOrden = data.numero_orden || data.id_orden.split('-')[0].substring(0, 5).toUpperCase();
          
          if (id_estado === ORDER_STATE.CONSUMED) {
            msg = `✅ <b>Pedido Consumido</b>\n\nTu pedido #<b>${numOrden}</b> ha sido marcado como consumido.\n¡Gracias por preferirnos y buen provecho!`;
          } else if (id_estado === ORDER_STATE.CANCELLED) {
            msg = `❌ <b>Pedido Cancelado</b>\n\nTu pedido #<b>${numOrden}</b> ha sido cancelado por el administrador.\nSi tienes dudas, por favor contáctanos.`;
          }
          
          if (msg) {
            await sendMessage(sub.chat_id, msg, null, 'HTML');
          }
        }
      } catch (err) {
        console.error('Error enviando notificación de estado a Telegram:', err.message); // NOSONAR
      }
    })();
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
