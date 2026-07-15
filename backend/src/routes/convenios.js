const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const multer = require('multer');
const path = require('path');

const fs = require('fs');
const crypto = require('node:crypto');
const clientesService = require('../services/clientesService');

const storage = multer.memoryStorage();

const upload = multer({ // NOSONAR 
  storage: storage,
  limits: { fileSize: 8000000, files: 1 }, // NOSONAR
  fileFilter: (req, file, cb) => {
    const filetypes = /pdf|jpg|jpeg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Solo se permiten archivos PDF o imágenes (JPG, PNG)'));
  }
});

router.use(authMiddleware);
router.use(roleMiddleware(['administrador', 'caja']));
const adminOnly = roleMiddleware(['administrador']);

// Función auxiliar para formatear la respuesta del convenio
function formatConvenio(conv) {
  const adminClient = getAdminClient();
  const archivo_url = conv.archivo_firmado 
    ? adminClient.storage.from('convenios').getPublicUrl(conv.archivo_firmado).data.publicUrl 
    : null;

  return {
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
    tipos_almuerzo_permitidos: conv.tipos_almuerzo_permitidos || [],
    totalColaboradores: conv.clientes_convenios?.[0]?.count || 0,
    consumoMensual: 0,
    archivo_firmado: archivo_url,
  };
}

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
router.post('/:id/clientes', async (req, res) => {
  const { id_cliente } = req.body;
  const { id: id_convenio } = req.params;
  try {
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
    if (cliente.id_tipo_cliente !== 1) return res.status(400).json({ error: 'Este cliente es de tipo Frecuente.' });
    const { error: insError } = await adminClient.from('clientes_convenios').insert([{ id_cliente, id_convenio, created_by: req.user.id }]);
    if (insError) throw insError;
    res.status(201).json({ mensaje: 'Cliente agregado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREAR Y AGREGAR NUEVO CLIENTE A CONVENIO
router.post('/:id/clientes/nuevo', async (req, res) => {
  const { id: id_convenio } = req.params;
  const { cedula, nombre, apellido, telefono, correo } = req.body;

  try {
    const adminClient = getAdminClient();
    
    // Construir el payload tal como lo espera el servicio de clientes
    const payload = {
      cedula,
      nombre,
      apellido,
      telefono,
      correo,
      id_tipo_cliente: 1, // CLIENT_TYPE.AGREEMENT
      id_convenio
    };

    // Esto validará cupos, creará el cliente, lo vinculará, creará la invitación a telegram y mandará el correo.
    const result = await clientesService.createCliente(adminClient, payload, req.user || { id: null, rol: 'administrador' });

    res.status(201).json(result);
  } catch (error) {
    const status = Number(error?.status || 500);
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: error.message });
  }
});

// QUITAR CLIENTE DE CONVENIO
router.delete('/:id/clientes/:clienteId', adminOnly, async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { error: errorVinculo } = await adminClient.from('clientes_convenios').delete().eq('id_convenio', req.params.id).eq('id_cliente', req.params.clienteId);
    if (errorVinculo) throw errorVinculo;
    
    // Cambiar al cliente a tipo frecuente (id_tipo_cliente = 2) al perder su convenio
    const { error: errorUpdate } = await adminClient.from('clientes').update({ id_tipo_cliente: 2 }).eq('id_cliente', req.params.clienteId);
    if (errorUpdate) throw errorUpdate;

    res.json({ mensaje: 'Cliente retirado correctamente y cambiado a frecuente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREAR NUEVO CONVENIO
router.post('/', adminOnly, async (req, res) => {
  const { ruc, nombre_empresa, representante, telefono, email, fecha_inicio, fecha_caducidad, cupo_maximo, tipos_almuerzo_permitidos } = req.body;
  
  if (cupo_maximo !== undefined && cupo_maximo < 0) {
    return res.status(400).json({ error: 'El cupo máximo no puede ser menor a 0.' });
  }

  if (ruc && (!/^\d+$/.test(ruc) || ruc.length !== 13)) {
    return res.status(400).json({ error: 'El RUC debe tener exactamente 13 dígitos numéricos.' });
  }

  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('convenios')
      .insert([{ ruc, nombre_empresa, representante, telefono, email, fecha_inicio, fecha_caducidad, cupo_maximo, tipos_almuerzo_permitidos: tipos_almuerzo_permitidos || null, created_by: req.user.id }])
      .select('*, clientes_convenios(count)')
      .single();
    if (error) throw error;
    res.status(201).json(formatConvenio(data));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const buildConvenioUpdatePayload = (body, userId) => {
  const { activo, ruc, nombre_empresa, fecha_inicio, fecha_caducidad, tipos_almuerzo_permitidos, cupo_maximo, ...rest } = body;
  const actualizacion = { ...rest, updated_by: userId };
  let error = null;

  if (activo !== undefined) actualizacion.esta_activo = activo;
  if (ruc) {
    if (!/^\d+$/.test(ruc) || ruc.length !== 13) {
      error = 'El RUC debe tener exactamente 13 dígitos numéricos.';
    }
    actualizacion.ruc = ruc;
  }
  if (nombre_empresa) actualizacion.nombre_empresa = nombre_empresa;
  if (fecha_inicio) actualizacion.fecha_inicio = fecha_inicio;
  if (fecha_caducidad) actualizacion.fecha_caducidad = fecha_caducidad;
  if (tipos_almuerzo_permitidos !== undefined) actualizacion.tipos_almuerzo_permitidos = tipos_almuerzo_permitidos;
  
  if (cupo_maximo !== undefined) {
    if (cupo_maximo < 0) error = 'El cupo máximo no puede ser menor a 0.';
    actualizacion.cupo_maximo = cupo_maximo;
  }
  return { actualizacion, error, fecha_inicio, fecha_caducidad };
};

const handleConvenioRenewal = async (adminClient, id, actual, fecha_inicio, fecha_caducidad) => {
  const formatDate = (dateStr) => dateStr ? new Date(dateStr).toISOString().split('T')[0] : null;
  const dbInicio = formatDate(actual.fecha_inicio);
  const reqInicio = formatDate(fecha_inicio);
  const dbFin = formatDate(actual.fecha_caducidad);
  const reqFin = formatDate(fecha_caducidad);

  if ((reqInicio && reqInicio !== dbInicio) || (reqFin && reqFin !== dbFin)) {
    const { error: insertError } = await adminClient.from('conveniohistorial').insert([{
      id_convenio: id,
      fecha_inicio: actual.fecha_inicio,
      fecha_caducidad: actual.fecha_caducidad,
      archivo_firmado: actual.archivo_firmado
    }]);
    if (insertError) console.error('Error al guardar historial:', insertError);
    return true; // Indicate that it was renewed and we need to reset the file
  }
  return false;
};

// ACTUALIZAR CONVENIO (Y manejar historial si es renovación)
router.put('/:id', adminOnly, async (req, res) => {
  const { id } = req.params;
  const { actualizacion, error: payloadError, fecha_inicio, fecha_caducidad } = buildConvenioUpdatePayload(req.body, req.user.id);
  
  if (payloadError) {
    return res.status(400).json({ error: payloadError });
  }

  try {
    const adminClient = getAdminClient();

    if (fecha_inicio || fecha_caducidad) {
      const { data: actual } = await adminClient.from('convenios').select('*').eq('id_convenio', id).single();
      if (actual) {
        const wasRenewed = await handleConvenioRenewal(adminClient, id, actual, fecha_inicio, fecha_caducidad);
        if (wasRenewed) {
          actualizacion.archivo_firmado = null;
        }
      }
    }

    const { data, error } = await adminClient.from('convenios').update(actualizacion).eq('id_convenio', id).select('*, clientes_convenios(count)').single();
    if (error) throw error;
    res.json(formatConvenio(data));
  } catch (error) {
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
      archivo_url: h.archivo_firmado ? adminClient.storage.from('convenios').getPublicUrl(h.archivo_firmado).data.publicUrl : null
    }));
    
    res.json(historialFormateado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SUBIR ARCHIVO FIRMADO
router.post('/:id/upload', adminOnly, upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo.' });
  
  const { id } = req.params;
  try {
    const adminClient = getAdminClient();
    
    // Obtener mimeType (usando el helper para verificar magic bytes si es posible)
    const mimeType = detectDocumentMimeType(req.file.buffer) || req.file.mimetype;
    
    // Rechazar si no es válido incluso tras inspección binaria
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(mimeType)) {
      return res.status(400).json({ error: 'Formato de archivo no permitido o archivo corrupto.' });
    }

    const objectPath = createAgreementObjectPath(id, mimeType);
    
    // Subir a Supabase Storage
    const { error: uploadError } = await adminClient.storage
      .from('convenios')
      .upload(objectPath, req.file.buffer, {
        contentType: mimeType,
        upsert: true
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
    res.status(500).json({ error: error.message });
  }
});

// OBTENER REPORTE DE CONSUMOS
router.get('/:id/reporte', async (req, res) => {
  const { id } = req.params;
  const { fecha_inicio, fecha_fin } = req.query;

  if (fecha_inicio || fecha_fin) {
    if (!fecha_inicio || !fecha_fin) {
      return res.status(400).json({ error: 'Ambas fechas (inicio y fin) son requeridas si se filtra por rango.' });
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fecha_inicio) || !dateRegex.test(fecha_fin)) {
      return res.status(400).json({ error: 'El formato de las fechas debe ser YYYY-MM-DD.' });
    }
    if (new Date(fecha_fin) < new Date(fecha_inicio)) {
      return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la de inicio.' });
    }
  }

  try {
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
        clientes(id_cliente, nombre, apellido, cedula),
        detalle_orden(cantidad, precio_aplicado, productos(nombre_producto))
      `)
      .in('id_cliente', clienteIds)
      .or('metodo_pago.eq.Convenio Empresa,metodo_pago.is.null')
      .eq('id_estado', 2); // Consumido

    if (fecha_inicio) query = query.gte('created_at', `${fecha_inicio}T00:00:00.000Z`);
    if (fecha_fin) query = query.lte('created_at', `${fecha_fin}T23:59:59.999Z`);

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
          fecha: orden.created_at,
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
    res.status(500).json({ error: error.message });
  }
});

// ─── Helpers testables para documentos de convenio ────────────────────────────

const DOCUMENT_SIGNATURES = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

const MIME_TO_EXT = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * Detecta el MIME type de un buffer comprobando la firma binaria (magic bytes).
 * @param {Buffer} buffer
 * @returns {string|null} MIME type o null si no es un tipo permitido
 */
function detectDocumentMimeType(buffer) {
  for (const { mime, bytes } of DOCUMENT_SIGNATURES) {
    if (bytes.every(function(byte, i) { return buffer[i] === byte; })) return mime;
  }
  return null;
}

/**
 * Genera una ruta de objeto única para almacenar un documento de convenio.
 * Formato: {agreementId}/{uuid}.{ext}
 * @param {string} agreementId
 * @param {string} mimeType
 * @returns {string}
 */
function createAgreementObjectPath(agreementId, mimeType) {
  const ext = MIME_TO_EXT[mimeType] || 'bin';
  const uuid = crypto.randomUUID();
  return `${agreementId}/${uuid}.${ext}`;
}

router._private = { detectDocumentMimeType, createAgreementObjectPath };

module.exports = router;

