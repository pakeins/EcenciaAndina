const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { parseBody, schemas, sendValidationError } = require('../validation/eciencia');
const { applyDateRange, getDateInTimeZone, parseDateRange } = require('../services/reporting');
const { CLIENT_TYPE, ORDER_STATE } = require('../constants/domain');
const { createInvitation } = require('../services/telegramConsent');
const { sendTelegramInvitationEmail } = require('../services/telegramInvitationEmail');

const AGREEMENT_DOCUMENTS_BUCKET =
  process.env.AGREEMENT_DOCUMENTS_BUCKET || 'eciencia-agreement-documents';
const DOCUMENT_EXTENSION_BY_MIME = Object.freeze({
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
});
const ALLOWED_DOCUMENT_EXTENSIONS = Object.freeze({
  'application/pdf': new Set(['.pdf']),
  'image/jpeg': new Set(['.jpg', '.jpeg']),
  'image/png': new Set(['.png']),
});

// Configuración de Multer para almacenamiento local
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_DOCUMENT_EXTENSIONS[file.mimetype]?.has(extension)) return cb(null, true);
    cb(new Error('Solo se permiten archivos PDF o imágenes (JPG, PNG)'));
  }
});

const uploadAgreementDocument = (req, res, next) => {
  upload.single('archivo')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    const message =
      error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera el limite de 5 MB.'
        : error.message;
    res.status(400).json({ error: message });
  });
};

const detectDocumentMimeType = (buffer) => {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.subarray(0, 4).equals(Buffer.from('%PDF'))) return 'application/pdf';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  return null;
};

const createAgreementObjectPath = (agreementId, mimeType) => {
  const safeAgreementId = String(agreementId).replace(/[^a-zA-Z0-9_-]/g, '');
  const extension = DOCUMENT_EXTENSION_BY_MIME[mimeType];
  if (!safeAgreementId || !extension) return null;
  return `${safeAgreementId}/${crypto.randomUUID()}${extension}`;
};

const removeAgreementObject = async (adminClient, objectPath) => {
  if (!objectPath) return;
  const { error } = await adminClient.storage
    .from(AGREEMENT_DOCUMENTS_BUCKET)
    .remove([objectPath]);
  if (error) {
    console.warn('No se pudo eliminar el archivo de convenio despues de un error:', error.message);
  }
};

const sendConvenioFile = async (res, adminClient, objectPath) => {
  const { data, error } = await adminClient.storage
    .from(AGREEMENT_DOCUMENTS_BUCKET)
    .download(objectPath);

  if (error || !data) {
    if (error && !/not found|does not exist/i.test(error.message)) throw error;
    res.status(404).json({ error: 'Archivo de convenio no encontrado.' });
    return;
  }

  const extension = path.extname(objectPath).toLowerCase();
  const contentType =
    data.type ||
    Object.entries(DOCUMENT_EXTENSION_BY_MIME).find(([, value]) => value === extension)?.[0] ||
    'application/octet-stream';
  const fileBuffer = Buffer.from(await data.arrayBuffer());

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="convenio${extension}"`);
  res.type(contentType).send(fileBuffer);
};

router.use(authMiddleware);
router.use(roleMiddleware(['administrador', 'caja']));
const adminOnly = roleMiddleware(['administrador']);

// Función auxiliar para formatear la respuesta del convenio
const formatConvenio = (conv) => ({
  id: conv.id_convenio,
  ruc: conv.ruc,
  nombre_empresa: conv.nombre_empresa,
  representante: conv.representante || '',
  telefono: conv.telefono || '',
  email: conv.email || '',
  fecha_inicio: conv.fecha_inicio,
  fecha_caducidad: conv.fecha_caducidad,
  activo: conv.esta_activo,
  cupo_maximo: conv.cupo_maximo || 0,
  totalColaboradores: conv.clientes_convenios?.[0]?.count || 0,
  consumoMensual: 0,
  archivo_firmado: conv.archivo_firmado ? `/convenios/${conv.id_convenio}/archivo` : null,
});

// OBTENER TODOS LOS CONVENIOS
router.get('/', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('convenios')
      .select('*, clientes_convenios(count)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data.map(formatConvenio));
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// OBTENER CLIENTES DE UN CONVENIO
router.get('/:id/clientes', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('clientes_convenios')
      .select('clientes(id_cliente, cedula, nombre, apellido)')
      .eq('id_convenio', req.params.id);
    if (error) throw error;
    res.json(data.map(item => ({
      id: item.clientes.id_cliente,
      cedula: item.clientes.cedula,
      nombre: item.clientes.nombre,
      apellido: item.clientes.apellido
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AGREGAR CLIENTE EXISTENTE A CONVENIO
router.post('/:id/clientes', adminOnly, async (req, res) => {
  const { id: id_convenio } = req.params;
  try {
    const { id_cliente } = parseBody(schemas.convenioAddClient, req.body);
    const adminClient = getAdminClient();
    
    // VALIDAR CUPO MÁXIMO
    const { data: convenio, error: convError } = await adminClient
      .from('convenios')
      .select('cupo_maximo, clientes_convenios(count)')
      .eq('id_convenio', id_convenio)
      .single();
    
    if (convError || !convenio) return res.status(404).json({ error: 'Convenio no encontrado.' });
    
    const countActual = convenio.clientes_convenios?.[0]?.count || 0;
    if (countActual >= convenio.cupo_maximo) {
      return res.status(400).json({ error: `Se ha alcanzado el cupo máximo de este convenio (${convenio.cupo_maximo}).` });
    }

    const { data: cliente, error: cliError } = await adminClient.from('clientes').select('id_tipo_cliente').eq('id_cliente', id_cliente).single();
    if (cliError || !cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
    if (cliente.id_tipo_cliente !== CLIENT_TYPE.DIRECT) {
      return res.status(400).json({ error: 'El cliente ya pertenece a un convenio.' });
    }
    const { error: insError } = await adminClient.from('clientes_convenios').insert([{ id_cliente, id_convenio, created_by: req.user.id }]);
    if (insError) throw insError;
    const updateResult = await adminClient
      .from('clientes')
      .update({ id_tipo_cliente: CLIENT_TYPE.AGREEMENT, updated_by: req.user.id })
      .eq('id_cliente', id_cliente);
    if (updateResult.error) {
      await adminClient.from('clientes_convenios').delete().eq('id_cliente', id_cliente);
      throw updateResult.error;
    }
    res.status(201).json({ mensaje: 'Cliente agregado correctamente' });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// CREAR Y AGREGAR NUEVO CLIENTE A CONVENIO
router.post('/:id/clientes/nuevo', adminOnly, async (req, res) => {
  const { id: id_convenio } = req.params;

  try {
    const { cedula, nombre, apellido, telefono, correo } = parseBody(schemas.clienteCreate, {
      ...req.body,
      id_tipo_cliente: CLIENT_TYPE.AGREEMENT,
      id_convenio,
    });
    const adminClient = getAdminClient();

    // VALIDAR CUPO MÁXIMO
    const { data: convenio, error: convError } = await adminClient
      .from('convenios')
      .select('cupo_maximo, esta_activo, fecha_caducidad, clientes_convenios(count)')
      .eq('id_convenio', id_convenio)
      .single();
    
    if (convError || !convenio) return res.status(404).json({ error: 'Convenio no encontrado.' });
    if (
      convenio.esta_activo === false ||
      (convenio.fecha_caducidad && convenio.fecha_caducidad < getDateInTimeZone(new Date()))
    ) {
      return res.status(400).json({ error: 'El convenio esta inactivo o vencido.' });
    }
    
    const countActual = convenio.clientes_convenios?.[0]?.count || 0;
    if (countActual >= convenio.cupo_maximo) {
      return res.status(400).json({ error: `Se ha alcanzado el cupo máximo de este convenio (${convenio.cupo_maximo}).` });
    }
    
    if (telefono) {
      const phoneResult = await adminClient
        .from('clientes')
        .select('id_cliente')
        .eq('telefono', telefono)
        .eq('esta_activo', true)
        .limit(1);
      if (phoneResult.error) throw phoneResult.error;
      if (phoneResult.data?.length) {
        return res.status(400).json({ error: 'Este telefono ya pertenece a un cliente activo.' });
      }
    }
    const emailResult = await adminClient
      .from('clientes')
      .select('id_cliente')
      .ilike('correo', correo)
      .limit(1);
    if (emailResult.error) throw emailResult.error;
    if (emailResult.data?.length) {
      return res.status(400).json({ error: 'Este correo ya pertenece a otro cliente.' });
    }

    // Crear el cliente como cliente de convenio.
    const { data: newClient, error: clientError } = await adminClient
      .from('clientes')
      .insert([{
        cedula,
        nombre,
        apellido,
        telefono,
        correo,
        id_tipo_cliente: CLIENT_TYPE.AGREEMENT,
        created_by: req.user.id
      }])
      .select()
      .single();

    if (clientError) {
      if (clientError.message.includes('duplicate key')) return res.status(400).json({ error: 'Ya existe un cliente con esta cédula.' });
      throw clientError;
    }

    // 2. Vincularlo al convenio
    const { error: linkError } = await adminClient
      .from('clientes_convenios')
      .insert([{
        id_cliente: newClient.id_cliente,
        id_convenio,
        created_by: req.user.id
      }]);

    if (linkError) {
      await adminClient.from('clientes').delete().eq('id_cliente', newClient.id_cliente);
      throw linkError;
    }

    let onboarding;
    try {
      onboarding = await createInvitation(
        newClient.id_cliente,
        req.user.empleado_id || req.user.id,
      );
    } catch (invitationError) {
      await adminClient.from('clientes').delete().eq('id_cliente', newClient.id_cliente);
      throw invitationError;
    }
    onboarding.email_delivery = await sendTelegramInvitationEmail({
      client: { nombre, apellido, correo },
      onboarding,
    });

    res.status(201).json({
      id: newClient.id_cliente,
      cedula: newClient.cedula,
      nombre: newClient.nombre,
      apellido: newClient.apellido,
      telefono: newClient.telefono || '',
      correo: newClient.correo,
      telegram_onboarding: {
        status: onboarding.status,
        onboarding_url: onboarding.onboarding_url,
        expires_at: onboarding.expires_at,
        email_delivery: onboarding.email_delivery,
      },
    });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// QUITAR CLIENTE DE CONVENIO
router.delete('/:id/clientes/:clienteId', adminOnly, async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { error } = await adminClient.from('clientes_convenios').delete().eq('id_convenio', req.params.id).eq('id_cliente', req.params.clienteId);
    if (error) throw error;
    const updateResult = await adminClient
      .from('clientes')
      .update({ id_tipo_cliente: CLIENT_TYPE.DIRECT, updated_by: req.user.id })
      .eq('id_cliente', req.params.clienteId);
    if (updateResult.error) throw updateResult.error;
    res.json({ mensaje: 'Cliente retirado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREAR NUEVO CONVENIO
router.post('/', adminOnly, async (req, res) => {
  
  try {
    const { ruc, nombre_empresa, representante, telefono, email, fecha_inicio, fecha_caducidad, cupo_maximo } = parseBody(
      schemas.convenioCreate,
      req.body,
    );
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('convenios')
      .insert([{ ruc, nombre_empresa, representante, telefono, email, fecha_inicio, fecha_caducidad, cupo_maximo, created_by: req.user.id }])
      .select('*, clientes_convenios(count)')
      .single();
    if (error) throw error;
    res.status(201).json(formatConvenio(data));
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// ACTUALIZAR CONVENIO (Y manejar historial si es renovación)
router.put('/:id', adminOnly, async (req, res) => {
  const { id } = req.params;

  try {
    const { activo, ruc, nombre_empresa, representante, telefono, email, fecha_inicio, fecha_caducidad, cupo_maximo } = parseBody(
      schemas.convenioUpdate,
      req.body,
    );
    const actualizacion = { updated_by: req.user.id };
    if (activo !== undefined) actualizacion.esta_activo = activo;
    if (ruc !== undefined) actualizacion.ruc = ruc;
    if (nombre_empresa !== undefined) actualizacion.nombre_empresa = nombre_empresa;
    if (representante !== undefined) actualizacion.representante = representante;
    if (telefono !== undefined) actualizacion.telefono = telefono;
    if (email !== undefined) actualizacion.email = email;
    if (fecha_inicio !== undefined) actualizacion.fecha_inicio = fecha_inicio;
    if (fecha_caducidad !== undefined) actualizacion.fecha_caducidad = fecha_caducidad;
    if (cupo_maximo !== undefined) actualizacion.cupo_maximo = cupo_maximo;

    const adminClient = getAdminClient();

    // Si se están actualizando las fechas (Renovación), guardamos el actual en el historial
    if (fecha_inicio || fecha_caducidad) {
      const { data: actual } = await adminClient.from('convenios').select('*').eq('id_convenio', id).single();
      if (actual) {
        // Verificar si las fechas realmente cambiaron para considerar que es una renovación
        const formatDate = (dateStr) => dateStr ? new Date(dateStr).toISOString().split('T')[0] : null;
        const dbInicio = formatDate(actual.fecha_inicio);
        const reqInicio = formatDate(fecha_inicio);
        const dbFin = formatDate(actual.fecha_caducidad);
        const reqFin = formatDate(fecha_caducidad);

        if ((reqInicio && reqInicio !== dbInicio) || (reqFin && reqFin !== dbFin)) {
          // Solo guardamos en historial si ya tenía fechas previas y hubo un cambio
          const { error: insertError } = await adminClient.from('conveniohistorial').insert([{
            id_convenio: id,
            fecha_inicio: actual.fecha_inicio,
            fecha_caducidad: actual.fecha_caducidad,
            archivo_firmado: actual.archivo_firmado
          }]);
          if (insertError) console.error('Error al guardar historial:', insertError);
          // Al renovar, el nuevo periodo empieza sin archivo firmado (debe subirse el nuevo)
          actualizacion.archivo_firmado = null;
        }
      }
    }

    const { data, error } = await adminClient.from('convenios').update(actualizacion).eq('id_convenio', id).select('*, clientes_convenios(count)').single();
    if (error) throw error;
    res.json(formatConvenio(data));
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// OBTENER HISTORIAL DE CONVENIO
router.get('/:id/historial', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('conveniohistorial')
      .select('*')
      .eq('id_convenio', req.params.id)
      .order('fecha_registro', { ascending: false });
    
    if (error) throw error;
    
    const historialFormateado = data.map(h => ({
      ...h,
      archivo_url: h.archivo_firmado ? `/convenios/${req.params.id}/historial/${h.id}/archivo` : null
    }));
    
    res.json(historialFormateado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/archivo', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('convenios')
      .select('archivo_firmado')
      .eq('id_convenio', req.params.id)
      .single();

    if (error || !data?.archivo_firmado) {
      return res.status(404).json({ error: 'Archivo de convenio no encontrado.' });
    }

    await sendConvenioFile(res, adminClient, data.archivo_firmado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/historial/:historialId/archivo', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('conveniohistorial')
      .select('archivo_firmado')
      .eq('id_convenio', req.params.id)
      .eq('id', req.params.historialId)
      .single();

    if (error || !data?.archivo_firmado) {
      return res.status(404).json({ error: 'Archivo historico no encontrado.' });
    }

    await sendConvenioFile(res, adminClient, data.archivo_firmado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SUBIR ARCHIVO FIRMADO
router.post('/:id/upload', adminOnly, uploadAgreementDocument, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo.' });
  
  const { id } = req.params;
  const detectedMimeType = detectDocumentMimeType(req.file.buffer);
  if (!detectedMimeType || detectedMimeType !== req.file.mimetype) {
    return res.status(400).json({ error: 'El archivo no coincide con el tipo declarado.' });
  }

  const objectPath = createAgreementObjectPath(id, detectedMimeType);
  if (!objectPath) {
    return res.status(400).json({ error: 'El convenio o el tipo de archivo no son validos.' });
  }

  let adminClient;
  try {
    adminClient = getAdminClient();
    const { error: uploadError } = await adminClient.storage
      .from(AGREEMENT_DOCUMENTS_BUCKET)
      .upload(objectPath, req.file.buffer, {
        contentType: detectedMimeType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data, error } = await adminClient
      .from('convenios')
      .update({ archivo_firmado: objectPath, updated_by: req.user.id })
      .eq('id_convenio', id)
      .select('*, clientes_convenios(count)')
      .single();
    
    if (error) throw error;
    res.json(formatConvenio(data));
  } catch (error) {
    if (adminClient) await removeAgreementObject(adminClient, objectPath);
    res.status(500).json({ error: error.message });
  }
});

// OBTENER REPORTE DE CONSUMOS
router.get('/:id/reporte', adminOnly, async (req, res) => {
  const { id } = req.params;

  try {
    const range = parseDateRange(req.query, { required: true });
    const adminClient = getAdminClient();

    // 1. Obtener los IDs de los clientes asociados a este convenio
    const { data: clientesConvenio, error: errorClientes } = await adminClient
      .from('clientes_convenios')
      .select('id_cliente')
      .eq('id_convenio', id);

    if (errorClientes) throw errorClientes;

    const clienteIds = clientesConvenio.map(c => c.id_cliente);

    if (clienteIds.length === 0) {
      return res.json([]);
    }

    // 2. Obtener las órdenes de estos clientes
    let query = adminClient
      .from('ordenes')
      .select(`
        id_orden,
        created_at,
        consumed_at,
        clientes(id_cliente, nombre, apellido, cedula),
        detalle_orden(cantidad, precio_aplicado, productos(nombre_producto))
      `)
      .in('id_cliente', clienteIds)
      .or('metodo_pago.eq.Convenio Empresa,metodo_pago.is.null')
      .eq('id_estado', ORDER_STATE.CONSUMED);

    query = applyDateRange(query, range, 'consumed_at');

    const { data: ordenes, error: errorOrdenes } = await query;
    if (errorOrdenes) throw errorOrdenes;

    // 3. Agrupar por empleado
    const reporteMap = {};

    (ordenes || []).forEach(orden => {
      const cli = orden.clientes;
      if (!cli) return;
      const clienteId = cli.id_cliente;
      
      if (!reporteMap[clienteId]) {
        reporteMap[clienteId] = {
          empleado: `${cli.nombre} ${cli.apellido}`,
          cedula: cli.cedula,
          total: 0,
          consumos: []
        };
      }

      (orden.detalle_orden || []).forEach(det => {
        const valor = det.cantidad * det.precio_aplicado;
        reporteMap[clienteId].total += valor;
        reporteMap[clienteId].consumos.push({
          fecha: orden.consumed_at || orden.created_at,
          producto: det.productos?.nombre_producto || 'Sin producto',
          cantidad: det.cantidad,
          valor: valor
        });
      });
    });

    const reporteArray = Object.values(reporteMap);
    // Ordenar consumos de cada empleado por fecha descendente
    reporteArray.forEach(emp => {
      emp.consumos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    });
    
    // Ordenar empleados alfabéticamente
    reporteArray.sort((a, b) => a.empleado.localeCompare(b.empleado));

    res.json(reporteArray);
  } catch (error) {
    const status = Number(error?.status || 500);
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: status >= 500 ? 'No se pudo generar el reporte del convenio.' : error.message,
    });
  }
});

router._private = {
  createAgreementObjectPath,
  detectDocumentMimeType,
};

module.exports = router;
