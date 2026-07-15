const { ORDER_STATE, CLIENT_TYPE } = require('../constants/domain');
const { zonedStartOfDay, getDateInTimeZone, createHttpError } = require('./reporting');
const { sendMessage } = require('./telegramMicroservice');

const crearOrden = async (adminClient, payload, user) => {
  const { id_cliente, id_estado, id_origen, canal_origen, observaciones, detalles, metodo_pago } = payload;

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
      throw createHttpError(400, 'El cliente no cuenta con convenio asociado. Por favor asigne el convenio antes de confirmar el pedido.');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isExpired = convenioRel.fecha_caducidad ? new Date(convenioRel.fecha_caducidad + 'T00:00:00') < today : false;
    
    if (!convenioRel.esta_activo || isExpired) {
      throw createHttpError(400, 'El convenio no se encuentra habilitado y es necesario que se gestione.');
    }
  }

  const { data: orden, error: errorOrden } = await adminClient
    .from('ordenes')
    .insert([{ id_cliente, id_estado, id_origen, canal_origen, observaciones, metodo_pago, created_by: user.id }])
    .select()
    .single();

  if (errorOrden) throw errorOrden;

  const detallesAInsertar = detalles.map((det) => ({
    id_orden: orden.id_orden,
    id_producto: det.id_producto,
    cantidad: det.cantidad,
    precio_aplicado: det.precio_aplicado,
    opciones: det.opciones || {},
    created_by: user.id,
    updated_by: user.id,
  }));

  const { error: errorDetalles } = await adminClient.from('detalle_orden').insert(detallesAInsertar);

  if (errorDetalles) throw errorDetalles;

  return { mensaje: 'Orden registrada exitosamente', orden };
};

const getTelegramTrazabilidad = async (adminClient, params) => {
  const { chatId, outcome, idCliente, idOrden, fecha_inicio, fecha_fin, page, limit } = params;
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
  
  return {
    traces: data || [],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const getOrdenes = async (adminClient, queryParams) => {
  const { fecha_inicio, fecha_fin } = queryParams;

  const todayStart = zonedStartOfDay(getDateInTimeZone(new Date()));
  
  await adminClient
    .from('ordenes')
    .update({ id_estado: ORDER_STATE.CANCELLED })
    .eq('id_estado', ORDER_STATE.RESERVED)
    .lt('created_at', todayStart.toISOString());
  
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

  query = query.order('created_at', { ascending: false });

  const { data: ordenes, error: errorOrdenes } = await query;

  if (errorOrdenes) throw errorOrdenes;

  const { data: empleados, error: errorEmpleados } = await adminClient
    .from('empleados')
    .select('id, nombre, apellido');

  if (errorEmpleados) throw errorEmpleados;

  const ordenesConCreador = ordenes.map(orden => {
    const empleado = empleados.find(emp => emp.id === orden.created_by);
    return {
      ...orden,
      creador_nombre: empleado ? `${empleado.nombre} ${empleado.apellido}` : 'Sistema/Desconocido'
    };
  });

  return ordenesConCreador;
};

const actualizarOrdenCompleta = async (adminClient, id_orden, payload, user) => {
  const { observaciones, detalles } = payload;
  
  const { error: errorOrden } = await adminClient
    .from('ordenes')
    .update({ observaciones, updated_by: user.id })
    .eq('id_orden', id_orden);

  if (errorOrden) throw errorOrden;

  const { error: errorDelete } = await adminClient
    .from('detalle_orden')
    .delete()
    .eq('id_orden', id_orden);

  if (errorDelete) throw errorDelete;

  const detallesAInsertar = detalles.map((det) => ({
    id_orden: id_orden,
    id_producto: det.id_producto,
    cantidad: det.cantidad,
    precio_aplicado: det.precio_aplicado,
    opciones: det.opciones || {},
    created_by: user.id,
    updated_by: user.id,
  }));

  const { error: errorDetalles } = await adminClient.from('detalle_orden').insert(detallesAInsertar);

  if (errorDetalles) throw errorDetalles;

  return { mensaje: 'Orden actualizada exitosamente' };
};

const actualizarEstadoOrden = async (adminClient, id_orden, payload, user) => {
  const { id_estado, forceFallback } = payload;
  let orden;
  let devolvioSaldo = false;

  const { data: ordenPrevia, error: errOrdenPrevia } = await adminClient
    .from('ordenes')
    .select('id_estado, id_cliente, metodo_pago, clientes(id_tipo_cliente), detalle_orden(id_detalle, id_producto, cantidad, opciones)')
    .eq('id_orden', id_orden)
    .single();
  
  if (errOrdenPrevia) throw errOrdenPrevia;
  orden = ordenPrevia;

  if (orden.id_estado === ORDER_STATE.CONSUMED && id_estado !== ORDER_STATE.CONSUMED) {
    const isDirectClient = orden.clientes?.id_tipo_cliente === CLIENT_TYPE.DIRECT;
    if (orden.metodo_pago === 'Saldo Prepago' || (isDirectClient && orden.metodo_pago === 'Pendiente')) {
      for (const det of orden.detalle_orden) {
        const saldosUsados = det.opciones?.saldos_usados || [{ id_producto_saldo: det.id_producto, cantidad: det.cantidad }];
        for (const saldo of saldosUsados) {
          const { data: saldoActual } = await adminClient
            .from('saldos_servicio')
            .select('cantidad_disponible')
            .eq('id_cliente', orden.id_cliente)
            .eq('id_producto', saldo.id_producto_saldo)
            .maybeSingle();
            
          if (saldoActual) {
            await adminClient
              .from('saldos_servicio')
              .update({ 
                cantidad_disponible: saldoActual.cantidad_disponible + saldo.cantidad, 
                updated_by: user.id 
              })
              .eq('id_cliente', orden.id_cliente)
              .eq('id_producto', saldo.id_producto_saldo);
          } else {
            await adminClient
              .from('saldos_servicio')
              .insert({
                id_cliente: orden.id_cliente,
                id_producto: saldo.id_producto_saldo,
                cantidad_disponible: saldo.cantidad,
                created_by: user.id,
                updated_by: user.id
              });
          }
        }
      }
      devolvioSaldo = true;
    }
  }

  if (id_estado === ORDER_STATE.CONSUMED && orden.id_estado !== ORDER_STATE.CONSUMED) {
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
        throw createHttpError(400, 'El cliente no cuenta con convenio asociado. Por favor asigne el convenio antes de confirmar el pedido.');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isExpired = convenioRel.fecha_caducidad ? new Date(convenioRel.fecha_caducidad + 'T00:00:00') < today : false;
      
      if (!convenioRel.esta_activo || isExpired) {
        throw createHttpError(400, 'El convenio no se encuentra habilitado y es necesario que se gestione.');
      }
    }

    const isDirectClient = orden.clientes?.id_tipo_cliente === CLIENT_TYPE.DIRECT;
    if (orden.metodo_pago === 'Saldo Prepago' || (isDirectClient && orden.metodo_pago === 'Pendiente')) {
      const { data: saldosCliente, error: errSaldos } = await adminClient
        .from('saldos_servicio')
        .select('id_producto, cantidad_disponible, productos(precio_unitario, nombre_producto)')
        .eq('id_cliente', orden.id_cliente)
        .gt('cantidad_disponible', 0);

      if (errSaldos) throw errSaldos;

      const idsPedidos = orden.detalle_orden.map(d => d.id_producto);
      const { data: productosPedidos, error: errProd } = await adminClient
        .from('productos')
        .select('id_producto, precio_unitario')
        .in('id_producto', idsPedidos);

      if (errProd) throw errProd;

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
        const deduccionesDetalle = [];

        const saldoExacto = saldosDisponibles.find(s => s.id_producto === det.id_producto);
        if (saldoExacto && saldoExacto.cantidad > 0) {
          const descontar = Math.min(saldoExacto.cantidad, cantidadRestante);
          saldoExacto.cantidad -= descontar;
          cantidadRestante -= descontar;
          deducciones.push({ id_producto_saldo: saldoExacto.id_producto, cantidad: descontar });
          deduccionesDetalle.push({ id_producto_saldo: saldoExacto.id_producto, cantidad: descontar });
        }

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
            deduccionesDetalle.push({ id_producto_saldo: saldoCaro.id_producto, cantidad: descontar });
            
            if (saldoCaro.id_producto !== det.id_producto && saldoCaro.precio > precioPedido) {
              fallbackUsed = true;
            }
          }
        }

        if (cantidadRestante > 0) {
          throw createHttpError(400, 'El cliente no tiene saldo suficiente en su monedero. Por favor recargue el saldo.');
        }

        if (!det.opciones) det.opciones = {};
        det.opciones.saldos_usados = deduccionesDetalle;
        const { error: detErr } = await adminClient.from('detalle_orden').update({ opciones: det.opciones }).eq('id_detalle', det.id_detalle);
        if (detErr) throw detErr;
      }

      if (fallbackUsed && !forceFallback) {
        throw createHttpError(409, 'El cliente no tiene saldo exacto para este producto. Se utilizará el saldo de un almuerzo equivalente. ¿Desea continuar?', { requireConfirmation: true });
      }

      const deduccionesAgrupadas = {};
      for (const ded of deducciones) {
        deduccionesAgrupadas[ded.id_producto_saldo] = (deduccionesAgrupadas[ded.id_producto_saldo] || 0) + ded.cantidad;
      }

      for (const [id_producto_saldo, cant_a_descontar] of Object.entries(deduccionesAgrupadas)) {
        const { data: saldoActual } = await adminClient
          .from('saldos_servicio')
          .select('cantidad_disponible')
          .eq('id_cliente', orden.id_cliente)
          .single();

        await adminClient
          .from('saldos_servicio')
          .update({ 
            cantidad_disponible: saldoActual.cantidad_disponible - cant_a_descontar, 
            updated_by: user.id 
          })
          .eq('id_cliente', orden.id_cliente)
          .eq('id_producto', id_producto_saldo);
      }
    }
  }

  const updatePayload = {
    id_estado,
    updated_by: user.id,
  };

  if (id_estado === ORDER_STATE.CONSUMED && orden.id_estado !== ORDER_STATE.CONSUMED) {
    const isDirectClient = orden.clientes?.id_tipo_cliente === CLIENT_TYPE.DIRECT;
    if (isDirectClient && orden.metodo_pago === 'Pendiente') {
      updatePayload.metodo_pago = 'Saldo Prepago';
    }
  } else if (orden.id_estado === ORDER_STATE.CONSUMED && id_estado !== ORDER_STATE.CONSUMED) {
    if (orden.metodo_pago === 'Saldo Prepago') {
      updatePayload.metodo_pago = 'Pendiente';
    }
  }

  const { data, error } = await adminClient
    .from('ordenes')
    .update(updatePayload)
    .eq('id_orden', id_orden)
    .select()
    .single();

  if (error) throw error;

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
        
        if (id_estado === ORDER_STATE.CONSUMED && orden.id_estado !== ORDER_STATE.CONSUMED) {
          msg = `✅ <b>Pedido Consumido</b>\n\nTu pedido #<b>${numOrden}</b> ha sido marcado como consumido.\n¡Gracias por preferirnos y buen provecho!`;
        } else if (id_estado === ORDER_STATE.CANCELLED) {
          msg = `❌ <b>Pedido Cancelado</b>\n\nTu pedido #<b>${numOrden}</b> ha sido cancelado por el administrador.\nSi tienes dudas, por favor contáctanos.`;
          if (devolvioSaldo) msg += '\n\n💰 Se ha devuelto el saldo correspondiente a tu monedero prepago.';
        } else if (id_estado === ORDER_STATE.RESERVED && orden.id_estado === ORDER_STATE.CONSUMED) {
          msg = `🔄 <b>Cambio de Estado</b>\n\nTu pedido #<b>${numOrden}</b> ha sido devuelto al estado <b>Reservado</b>.`;
          if (devolvioSaldo) msg += '\n\n💰 Se ha devuelto el saldo correspondiente a tu monedero prepago.';
        }
        
        if (msg) {
          await sendMessage(sub.chat_id, msg, null, 'HTML');
        }
      }
    } catch (err) {
      console.error('Error enviando notificación de estado a Telegram:', String(err?.message || err || '').replace(/[\r\n]/g, '_'));
    }
  })();

  return { mensaje: 'Estado actualizado', orden: data };
};

module.exports = {
  crearOrden,
  getTelegramTrazabilidad,
  getOrdenes,
  actualizarOrdenCompleta,
  actualizarEstadoOrden,
};
