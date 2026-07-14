const supabase = require('../config/supabase');
const telegramApi = require('../services/telegramApi');
const { labelForStep, todayInTimezone, dayOfWeekInTimezone, isBusinessDay, generateSid, activeConvenio, tomorrowFromDate } = require('../utils/telegramHelpers');
const { tipoAlmuerzoKeyboard, optionsKeyboard, confirmacionKeyboard, modificarPasosKeyboard, confirmationKeyboard, pedidoKeyboard, buildPedidoMessage, buildOrderSummaryMessage, cancelConfirmKeyboard, inlineKeyboard } = require('../ui/telegramKeyboards');
const telegramState = require('../services/telegramState');
const telegramOrderTrace = require('../services/telegramOrderTrace');
const { orderConfirmation } = require('../utils/telegramHelpers');

const menuCaption = (today) =>
  `<b>🍱 Menú del día ${today}</b>\n\n` +
  'Realiza tu pedido seleccionando las opciones con los botones de abajo.\n\n' +
  '👉 <b>Paso 1:</b> Elige el tipo de almuerzo que deseas hoy:';
const LUNCH_COMPONENTS = {
  ejecutivo_completo: ['entrada', 'sopa', 'plato fuerte', 'postre', 'bebida'],
  almuerzo_dia: ['sopa', 'plato fuerte', 'bebida'],
  almuerzo_dia_simple: ['plato fuerte', 'bebida'],
};

const TIPOS_ALMUERZO = [
  { id: 6, code: 'ejecutivo_completo', label: 'Almuerzo Ejecutivo Completo', shortLabel: 'Ejecutivo Completo', nombreProducto: 'Almuerzo Ejecutivo Completo', requiresEntrada: true, requiresSopa: true, requiresSegundo: true, requiresBebida: true, requiresPostre: true },
  { id: 7, code: 'ejecutivo_sin_sopa', label: 'Almuerzo Ejecutivo Sin Sopa', shortLabel: 'Ejecutivo Sin Sopa', nombreProducto: 'Almuerzo Ejecutivo Sin Sopa', requiresEntrada: true, requiresSopa: false, requiresSegundo: true, requiresBebida: true, requiresPostre: true },
  { id: 8, code: 'ejecutivo_simple', label: 'Almuerzo Ejecutivo Simple', shortLabel: 'Ejecutivo Simple', nombreProducto: 'Almuerzo Ejecutivo Simple', requiresEntrada: false, requiresSopa: false, requiresSegundo: true, requiresBebida: true, requiresPostre: true },
  { id: 9, code: 'almuerzo_dia', label: 'Almuerzo del Dia', shortLabel: 'Almuerzo del Dia', nombreProducto: 'Almuerzo del Dia', requiresEntrada: false, requiresSopa: true, requiresSegundo: true, requiresBebida: true, requiresPostre: false },
  { id: 10, code: 'almuerzo_dia_simple', label: 'Almuerzo del Dia Simple', shortLabel: 'Almuerzo del Dia Simple', nombreProducto: 'Almuerzo del Dia Simple', requiresEntrada: false, requiresSopa: false, requiresSegundo: true, requiresBebida: true, requiresPostre: false },
];

const ESTADO_RESERVADO_NOMBRE = 'Reservado';
const ORIGEN_NOMBRE = process.env.N8N_ECENCIA_ORIGEN_NOMBRE || 'Telegram';

const getLookupId = async (table, idField, nameField, nameValue) => {
  const { data, error } = await supabase.getAdminClient()
    .from(table).select(idField).ilike(nameField, nameValue).maybeSingle();
  if (error || !data) throw new Error(`Lookup failed for ${table}: ${nameValue}`);
  return data[idField];
};const orderSummary = (session) => {
  const opc = session.opciones || {};
  const entrada = opc.entrada || session.entrada;
  const sopa = opc.sopa || session.sopa;
  const segundo = opc.segundo || session.segundo;
  const bebida = opc.bebida || session.bebida;
  const postre = opc.postre || session.postre;
  const guarnicion = opc.guarnicion || session.guarnicion;
  const quantity = session.quantity;
  const tipoLabel = session.tipoAlmuerzo?.shortLabel;
  return (
    (tipoLabel ? `📌 <b>Tipo:</b> ${tipoLabel}\n` : '') +
    (quantity ? `🔢 <b>Cantidad:</b> ${Number(quantity)}\n` : '') +
    (entrada ? `🥗 <b>Entrada:</b> ${entrada}\n` : '') +
    (sopa ? `🍜 <b>Sopa:</b> ${sopa}\n` : '') +
    (segundo ? `🍽️ <b>Plato fuerte:</b> ${segundo}\n` : '') +
    (guarnicion ? `🧆 <b>Guarnición:</b> ${guarnicion}\n` : '') +
    (bebida ? `🥤 <b>Bebida:</b> ${bebida}\n` : '') +
    (postre ? `🍰 <b>Postre:</b> ${postre}\n` : '')
  );
};

const buildComponentPlan = ({ tipoAlmuerzo, menu }) => {
  const code = tipoAlmuerzo?.code || 'almuerzo_dia';
  const components = LUNCH_COMPONENTS[code] || ['sopa', 'plato fuerte'];
  const menuMap = {
    entrada: menu.entradas || [],
    sopa: menu.sopas || [],
    'plato fuerte': menu.segundos || [],
    postre: menu.postres || [],
    bebida: menu.bebidas || [],
  };

  const opciones = {};
  const pendingSteps = [];

  for (const comp of components) {
    const options = menuMap[comp] || [];
    if (options.length === 0) continue; // omitir componentes vacios
    if (options.length === 1) {
      opciones[comp === 'plato fuerte' ? 'segundo' : comp] = options[0];
    } else {
      pendingSteps.push(comp);
    }
  }

  return { opciones, pendingSteps };
};

const getNextStep = (tipo, currentStep) => {
  const flow = [];
  if (tipo?.requiresEntrada) flow.push('entrada');
  if (tipo?.requiresSopa) flow.push('sopa');
  if (tipo?.requiresSegundo) flow.push('segundo');
  if (tipo?.requiresBebida) flow.push('bebida');
  if (tipo?.requiresPostre) flow.push('postre');
  flow.push('confirmar');

  if (!currentStep) return flow[0];
  const idx = flow.indexOf(currentStep);
  if (idx === -1 || idx === flow.length - 1) return 'confirmar';
  return flow[idx + 1];
};

const getMenuOptionsForStep = (menu, step) => {
  if (!menu) return [];
  switch (step) {
  case 'entrada': return menu.entradas || [];
  case 'sopa': return menu.sopas || [];
  case 'segundo': return menu.segundos || [];
  case 'bebida': return menu.bebidas || [];
  case 'postre': return menu.postres || [];
  default: return [];
  }
};

const getPromptTextForStep = (tipo, step) => {
  const base = `🍱 <b>Tipo de Almuerzo:</b> ${tipo?.shortLabel || 'Almuerzo'}\n\n`;
  switch (step) {
  case 'entrada': return `${base}🥗 <b>Paso siguiente:</b> Elige tu entrada favorita:`;
  case 'sopa': return `${base}🍜 <b>Paso siguiente:</b> Selecciona la sopa de hoy:`;
  case 'segundo': return `${base}🍽️ <b>Paso siguiente:</b> Selecciona tu plato fuerte:`;
  case 'bebida': return `${base}🥤 <b>Paso siguiente:</b> Elige tu bebida:`;
  case 'postre': return `${base}🍰 <b>Paso siguiente:</b> Por último, elige tu postre:`;
  default: return 'Selecciona una de las opciones:';
  }
};

const optionFromCallback = (text, kind, options) => {
  const parts = String(text || '').split(':');
  const receivedKind = parts[0];
  const rawIndex = parts[1];
  if (receivedKind !== kind) return '';
  if (rawIndex === 'sin') {
    return `Sin ${labelForStep(kind)}`;
  }
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0 || index >= options.length) return '';
  return options[index];
};

const getProduct = async () => {
  const { data, error } = await supabase.getAdminClient()
    .from('productos')
    .select('id_producto,nombre_producto,precio_unitario')
    .eq('esta_activo', true)
    .order('id_producto', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error('No hay producto activo para registrar la reserva.');
  return data;
};

const insertOrder = async (session) => {
  const today = todayInTimezone();

  // Modo modificacion: actualizar detalle existente
  if (session.mode === 'modify' && session.orderId) {
    const tipoAlm = session.tipoAlmuerzo || {};
    const adminClient = supabase.getAdminClient();
    await adminClient
      .from('detalle_orden')
      .update({
        id_tipo_almuerzo: tipoAlm.id || null,
        opciones: {
          ...(session.opciones || {}),
          tipoAlmuerzo: tipoAlm.code || null,
          tipoOrigen: 'cliente_elige',
        },
      })
      .eq('id_orden', session.orderId);
    const { data: orderMeta } = await adminClient.from('ordenes').select('numero_orden').eq('id_orden', session.orderId).single();
    return { id_orden: session.orderId, numero_orden: orderMeta?.numero_orden, modified: true };
  }

  const existing = await findActiveTodayOrder(session.cliente.id_cliente);
  if (existing?.id_orden) return { id_orden: existing.id_orden, duplicate: true };

  const adminClient = supabase.getAdminClient();
  const tipoAlm = session.tipoAlmuerzo || {};
  const product = await (async () => {
    if (tipoAlm.nombreProducto) {
      const { data } = await adminClient
        .from('productos')
        .select('id_producto,nombre_producto,precio_unitario')
        .ilike('nombre_producto', tipoAlm.nombreProducto)
        .limit(1)
        .maybeSingle();
      if (data) return data;
    }
    return getProduct();
  })();

  const { data: order, error: orderError } = await adminClient
    .from('ordenes')
    .insert({
      id_cliente: session.cliente.id_cliente,
      id_estado: session.estadoReservadoId,
      id_origen: session.origenTelegramId,
      canal_origen: 'Telegram',
      metodo_pago: session.convenio?.id_convenio ? 'Convenio Empresa' : 'Pendiente',
      observaciones: `Reserva via Telegram ${today}.`,
    })
    .select()
    .single();
  if (orderError) throw orderError;

  const { error: detailError } = await adminClient.from('detalle_orden').insert({
    id_orden: order.id_orden,
    id_producto: product.id_producto,
    cantidad: Number(session.quantity || 1),
    precio_aplicado: Number(product.precio_unitario || 0),
    id_tipo_almuerzo: tipoAlm.id || null,
    opciones: {
      ...(session.opciones || {}),
      tipoAlmuerzo: tipoAlm.code || null,
      tipoOrigen: 'cliente_elige',
      menuDate: session.menuDate || session.date,
      canal: 'Telegram',
    },
  });
  if (detailError) {
    await adminClient.from('ordenes').delete().eq('id_orden', order.id_orden);
    throw detailError;
  }
  return order;
};

const findActiveTodayOrder = async (clientId) => {
  const today = todayInTimezone();
  const { data, error } = await supabase.getAdminClient()
    .from('ordenes')
    .select('id_orden,numero_orden,id_estado,created_at,canal_origen')
    .eq('id_cliente', clientId)
    .eq('canal_origen', 'Telegram')
    .eq('id_estado', 1) // Solo considerar pedidos en estado Reservado
    .gte('created_at', `${today}T05:00:00Z`)
    .lt('created_at', `${tomorrowFromDate(today)}T05:00:00Z`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const getOrderDetail = async (orderId) => {
  const { data, error } = await supabase.getAdminClient()
    .from('detalle_orden')
    .select('id_orden,id_producto,cantidad,precio_aplicado,id_tipo_almuerzo,observaciones_tipo,opciones,productos(nombre_producto)')
    .eq('id_orden', orderId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const getEstadoName = async (idEstado) => {
  const { data } = await supabase.getAdminClient()
    .from('estados_orden')
    .select('nombre_estado')
    .eq('id_estado', idEstado)
    .maybeSingle();
  return data?.nombre_estado || String(idEstado);
};

const handlePedidoCallback = async (parsed, subscription) => {
  const { chatId, text } = parsed;
  const parts = String(text).split(':');
  // pedido:can:orderId / pedido:can2:orderId / pedido:keep:orderId / pedido:mod:orderId
  if (parts[0] !== 'pedido') return false;

  if (parsed.isCallback && parsed.messageId) {
    await telegramApi.removeInlineKeyboard(chatId, parsed.messageId);
  }

  const action = parts[1];
  const orderId = parts.slice(2).join(':');

  if (action === 'can') {
    // Pedir confirmacion antes de cancelar
    const { data: order } = await supabase.getAdminClient()
      .from('ordenes').select('id_orden,id_estado').eq('id_orden', orderId).maybeSingle();
    if (!order || order.id_estado !== 1) {
      await telegramApi.sendMessage(chatId, 'Esta reserva ya no esta en estado Reservado y no puede cancelarse.');
      return true;
    }
    await telegramApi.sendMessage(chatId, 'Confirma tu decision:\n\n\xbfDeseas cancelar tu reserva de hoy?', cancelConfirmKeyboard(orderId));
    return true;
  }

  if (action === 'can2') {
    // Confirmar cancelacion
    const { data: order } = await supabase.getAdminClient()
      .from('ordenes').select('id_orden,id_estado').eq('id_orden', orderId).maybeSingle();
    if (!order || order.id_estado !== 1) {
      await telegramApi.sendMessage(chatId, 'Esta reserva ya no esta en estado Reservado.');
      return true;
    }
    const estadoAnterior = order.id_estado;
    await supabase.getAdminClient()
      .from('ordenes')
      .update({ id_estado: 3 })
      .eq('id_orden', orderId);
    await supabase.getAdminClient()
      .from('orden_estado_auditoria')
      .insert([{ id_orden: orderId, estado_anterior: estadoAnterior, estado_nuevo: 3 }]);
    await telegramApi.sendMessage(chatId, 'Tu reserva fue cancelada. Puedes hacer una nueva reserva con /menu.');
    return true;
  }

  if (action === 'keep') {
    await telegramApi.sendMessage(chatId, 'Tu reserva se mantiene sin cambios.');
    return true;
  }

  if (action === 'mod') {
    // Verificar que la orden sigue en estado Reservado
    const { data: order } = await supabase.getAdminClient()
      .from('ordenes').select('id_orden,numero_orden,id_estado,id_cliente').eq('id_orden', orderId).maybeSingle();
    if (!order || order.id_estado !== 1) {
      await telegramApi.sendMessage(chatId, 'Esta reserva ya no esta en estado Reservado y no puede modificarse.');
      return true;
    }
    const { getClientById } = require('./telegramPrivacyHandler');
    const client = await getClientById(subscription.id_cliente);
    if (!client) return true;

    // Cargar opciones existentes
    const detail = await getOrderDetail(orderId);
    if (!detail) {
      await telegramApi.sendMessage(chatId, 'No se encontraron los detalles de la reserva.');
      return true;
    }
    const opciones = detail.opciones || {};
    const tipoCode = opciones.tipoAlmuerzo;
    const tipoAlmuerzo = TIPOS_ALMUERZO.find((t) => t.code === tipoCode) || TIPOS_ALMUERZO.find((t) => t.id === detail.id_tipo_almuerzo) || null;

    const session = await startSessionForClient(chatId, client, { 
      mode: 'modify', 
      orderId,
      step: 'confirmar',
      opciones,
      tipoAlmuerzo
    });
    if (!session) {
      await telegramApi.sendMessage(chatId, 'No hay menu activo para modificar la reserva.');
      return true;
    }
    
    const shortOrderId = order.numero_orden ? `#${order.numero_orden}` : `#${orderId.split('-')[0].substring(0, 5).toUpperCase()}`;
    await telegramApi.sendMessage(chatId, `Vamos a modificar tu reserva <code>${shortOrderId}</code>.\n¿Qué parte de tu almuerzo deseas modificar?`, modificarPasosKeyboard(session, session.sid), 'HTML');
    return true;
  }

  return false;
};

const handleAcceptedSession = async (parsed, traceId) => {
  const { chatId, text, isCallback, messageId } = parsed;
  const trace = (patch) => telegramOrderTrace.updateOrderTrace(traceId, patch);
  let session = await telegramState.getState(telegramState.stateKey(chatId));

  if (!session) {
    await trace({
      interpreted_payload: { source: isCallback ? 'buttons' : 'text', step: 'missing_session' },
      outcome: 'failed',
      error_message: 'No existe una sesion de menu activa',
    });
    if (!isCallback) await telegramApi.deleteMessage(chatId, messageId);
    await telegramApi.sendMessage(chatId, 'No hay una seleccion activa. Usa /menu y luego los botones.');
    return;
  }

  if (session.date !== todayInTimezone()) {
    await telegramState.deleteState(telegramState.stateKey(chatId));
    await telegramApi.sendMessage(chatId, 'El menu activo ya vencio. Usa /menu para cargar el menu de hoy.');
    return;
  }

  if (!isCallback) {
    await telegramApi.deleteMessage(chatId, messageId);
    if (!session.invalidInputNoticeSent) {
      await telegramState.setState(telegramState.stateKey(chatId), { ...session, invalidInputNoticeSent: true });
      await telegramApi.sendMessage(chatId, 'Por seguridad, esta reserva solo acepta botones. Continua con la opcion visible.');
    }
    return;
  }

  await telegramApi.removeInlineKeyboard(chatId, messageId);

  // Verificar SID para callbacks con sid embebido (confirmar:ok:sid, tipo:*:sid, segundo:*:sid)
  const callbackSid = extractSidFromCallback(text);
  if (!sessionSidValid(session, callbackSid)) {
    await telegramApi.sendMessage(chatId, 'Este boton pertenece a un menu anterior y ya no es valido.');
    return;
  }

  // ---- Modificación interactiva (modstep:category:sid) ----
  if (String(text).startsWith('modstep:')) {
    const parts = String(text).split(':');
    const targetStep = parts[1];
    session.step = targetStep;
    session.modifying = true;
    await telegramState.setState(telegramState.stateKey(chatId), session);
    await promptForStep(chatId, session, targetStep);
    return;
  }

  // ---- Paso: eleccion de tipo de almuerzo ----
  if (session.step === 'tipo') {
    const parts = String(text).split(':');
    const kind = parts[0];
    const code = parts[1];
    if (kind !== 'tipo') {
      await telegramApi.sendMessage(chatId, 'Elige el tipo de almuerzo con los botones.', tipoAlmuerzoKeyboard(session.sid, session.convenio?.tipos_almuerzo_permitidos));
      return;
    }
    const tipo = TIPOS_ALMUERZO.find((t) => t.code === code);
    if (!tipo) {
      await telegramApi.sendMessage(chatId, 'Tipo de almuerzo no reconocido. Usa los botones.', tipoAlmuerzoKeyboard(session.sid, session.convenio?.tipos_almuerzo_permitidos));
      return;
    }
    
    const nextStep = getNextStep(tipo, null);
    session = { ...session, tipoAlmuerzo: tipo, step: nextStep };
    await telegramState.setState(telegramState.stateKey(chatId), session);
    await promptForStep(chatId, session, nextStep);
    return;
  }

  // ---- Paso: confirmacion (nuevo protocolo confirmar:ok:sid) ----
  if (session.step === 'confirmar') {
    const parts = String(text).split(':');
    const kind = parts[0];
    const action = parts[1];

    if (kind === 'confirmar' && action === 'edit') {
      await telegramApi.sendMessage(chatId, '¿Qué parte de tu almuerzo deseas modificar?', modificarPasosKeyboard(session, session.sid), 'HTML');
      return;
    }

    if (kind === 'confirmar' && action === 'back') {
      await promptForStep(chatId, session, 'confirmar');
      return;
    }

    if (kind !== 'confirmar' || action !== 'ok') {
      const resumen = `📝 <b>Resumen de tu Selección:</b>\n\n${orderSummary(session)}\n❓ <b>¿Confirmas tu reserva para hoy?</b>`;
      await telegramApi.sendMessage(chatId, resumen, confirmacionKeyboard(session.sid), 'HTML');
      return;
    }

    // Verificar duplicado ANTES de insertar
    const today = todayInTimezone();
    const existing = await findActiveTodayOrder(session.cliente.id_cliente);
    if (existing?.id_orden && session.mode !== 'modify') {
      // Hay una reserva activa — preparamos la sesion actual para reemplazarla
      session.mode = 'modify';
      session.orderId = existing.id_orden;
      await telegramState.setState(telegramState.stateKey(chatId), session);

      const detail = await getOrderDetail(existing.id_orden);
      const estadoNombre = await getEstadoName(existing.id_estado);
      existing._estadoNombre = estadoNombre;
      
      const msg = buildOrderSummaryMessage(existing, detail) + 
                  '\n\n⚠️ <b>Tienes una nueva selección pendiente.</b> ¿Qué deseas hacer?';
                  
      const replaceKeyboard = inlineKeyboard([
        [{ text: '🔄 Reemplazar con nueva selección', callback_data: `confirmar:ok:${session.sid}` }],
        [{ text: '❌ Mantener reserva anterior', callback_data: 'confirm:cancel' }]
      ]);

      await telegramApi.sendMessage(chatId, msg, replaceKeyboard, 'HTML');
      return;
    }

    let order;
    try {
      order = await insertOrder(session);
    } catch (error) {
      await telegramApi.sendMessage(chatId, 'No pude registrar la reserva. Tus selecciones siguen disponibles.', confirmacionKeyboard(session.sid), 'HTML');
      return;
    }

    await telegramState.deleteState(telegramState.stateKey(chatId));
    await telegramApi.sendMessage(chatId, orderConfirmation(session, order), null, 'HTML');
    return;
  }

  // ---- Pasos Dinamicos: entrada, sopa, segundo, bebida, postre ----
  const validSteps = ['entrada', 'sopa', 'segundo', 'bebida', 'postre'];
  if (validSteps.includes(session.step)) {
    const parts = String(text).split(':');
    const kind = parts[0];
    const options = getMenuOptionsForStep(session.menu, session.step);
    
    if (kind !== session.step) {
      await telegramApi.sendMessage(chatId, `Por favor, elige tu ${session.step} con los botones.`, optionsKeyboard(session.step, options, session.sid), 'HTML');
      return;
    }
    
    const chosen = optionFromCallback(text, session.step, options);
    if (!chosen) {
      await telegramApi.sendMessage(chatId, `Opcion invalida. Elige tu ${session.step} con los botones.`, optionsKeyboard(session.step, options, session.sid), 'HTML');
      return;
    }
    
    session.opciones = { ...(session.opciones || {}), [session.step]: chosen };
    
    await telegramApi.telegramRequest('editMessageText', {
      chat_id: String(chatId),
      message_id: Number(messageId),
      text: `✅ <b>${labelForStep(session.step)}:</b> ${chosen}`,
      parse_mode: 'HTML'
    }).catch(() => {});
    
    if (session.modifying) {
      delete session.modifying;
      session.step = 'confirmar';
      await telegramState.setState(telegramState.stateKey(chatId), session);
      await promptForStep(chatId, session, 'confirmar');
      return;
    }
    
    const nextStep = getNextStep(session.tipoAlmuerzo, session.step);
    session.step = nextStep;
    await telegramState.setState(telegramState.stateKey(chatId), session);
    await promptForStep(chatId, session, nextStep);
    return;
  }

  await telegramApi.sendMessage(chatId, 'No hay una seleccion activa. Usa /menu y luego los botones.');
};

const promptMenu = async (chatId, client) => {
  const session = await startSessionForClient(chatId, client);
  if (!session) {
    await telegramApi.sendMessage(chatId, 'Aun no hay un menu activo. Recibiras el siguiente envio disponible.');
    return;
  }
  
  const activeMenuState = await getActiveMenu();
  const photoUrl = activeMenuState?.photoUrl || process.env.N8N_ECENCIA_MENU_IMAGE_URL || 'https://lkffhdcavohaxdihvwlb.supabase.co/storage/v1/object/public/ecencia-menu-assets/telegram/ecencia-menu-demo.png';

  const caption = menuCaption(session.date);
  const inlineKeyboardData = tipoAlmuerzoKeyboard(session.sid, session.convenio?.tipos_almuerzo_permitidos);

  await telegramApi.sendPhoto(chatId, photoUrl, caption, inlineKeyboardData, 'HTML');
};

const promptForStep = async (chatId, session, step) => {
  if (step === 'confirmar') {
    const resumen = `📝 <b>Resumen de tu Selección:</b>\n\n${orderSummary(session)}\n❓ <b>¿Confirmas tu reserva para hoy?</b>`;
    await telegramApi.sendMessage(chatId, resumen, confirmacionKeyboard(session.sid), 'HTML');
    return;
  }
  const options = getMenuOptionsForStep(session.menu, step);
  if (!options.length) {
    const nextStep = getNextStep(session.tipoAlmuerzo, step);
    session.step = nextStep;
    await telegramState.setState(telegramState.stateKey(chatId), session);
    return promptForStep(chatId, session, nextStep);
  }
  const promptText = getPromptTextForStep(session.tipoAlmuerzo, step);
  await telegramApi.sendMessage(chatId, promptText, optionsKeyboard(step, options, session.sid), 'HTML');
};

const startSessionForClient = async (chatId, client, opts = {}) => {
  const activeMenu = await getActiveMenu();
  if (!activeMenu) return null;

  const today = todayInTimezone();
  const sid = opts.sid || generateSid();
  const session = {
    sid,
    mode: opts.mode || 'new',
    step: opts.step || 'tipo',
    date: today,
    menuDate: activeMenu.date || today,
    menu: activeMenu.menu,
    quantity: opts.quantity || 1,
    opciones: opts.opciones || {},
    tipoAlmuerzo: opts.tipoAlmuerzo || null,
    cliente: {
      id_cliente: client.id_cliente,
      nombre: client.nombre,
      apellido: client.apellido,
    },
    convenio: activeConvenio(client, today),
    estadoReservadoId: await getLookupId('estados_orden', 'id_estado', 'nombre_estado', ESTADO_RESERVADO_NOMBRE),
    origenTelegramId: await getLookupId('origenes_pedido', 'id_origen', 'nombre_origen', ORIGEN_NOMBRE),
    createdAt: new Date().toISOString(),
    ...(opts.orderId ? { orderId: opts.orderId } : {}),
  };
  await telegramState.setState(telegramState.stateKey(chatId), session);
  return session;
};

const getActiveMenu = async () => {
  const state = await telegramState.getState('latest-menu:active');
  if (!state || !state.menu) return null;
  return state;
};

const sessionSidValid = (session, callbackSid) => {
  if (!callbackSid) return true; // callbacks legacy sin sid siempre son validos
  if (!session?.sid) return true; // sesion legacy sin sid es valida
  return session.sid === callbackSid;
};

const extractSidFromCallback = (text) => {
  const parts = String(text || '').split(':');
  // confirmar:ok:SID => parts[2]
  // tipo:code:SID => parts[2]
  // segundo:0:SID => parts[2]
  return parts.length >= 3 ? parts[parts.length - 1] : null;
};

module.exports = { LUNCH_COMPONENTS, orderSummary, getNextStep, optionFromCallback, buildComponentPlan, insertOrder, findActiveTodayOrder, getOrderDetail, getEstadoName, handlePedidoCallback, handleAcceptedSession, promptMenu, promptForStep, startSessionForClient, getActiveMenu, sessionSidValid, extractSidFromCallback };