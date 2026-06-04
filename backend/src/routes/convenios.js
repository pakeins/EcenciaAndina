const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseBody, schemas, sendValidationError } = require('../validation/eciencia');

const UPLOAD_DIR = path.resolve(__dirname, '../../../convenios');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ConfiguraciÃ³n de Multer para almacenamiento local
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'convenio-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const filetypes = /pdf|jpg|jpeg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Solo se permiten archivos PDF o imÃ¡genes (JPG, PNG)'));
  }
});

const convenioFilePath = (filename) => {
  const safeName = path.basename(String(filename || ''));
  if (!/^convenio-\d+-\d+\.(pdf|jpg|jpeg|png)$/i.test(safeName)) return null;

  const resolvedPath = path.resolve(UPLOAD_DIR, safeName);
  if (!resolvedPath.startsWith(UPLOAD_DIR + path.sep)) return null;
  return resolvedPath;
};

const hasAllowedSignature = (filePath) => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead);

    const isPdf = header.subarray(0, 4).equals(Buffer.from('%PDF'));
    const isJpeg = header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const isPng = header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    return isPdf || isJpeg || isPng;
  } finally {
    fs.closeSync(fd);
  }
};

const removeUploadedFile = (filePath) => {
  if (!filePath) return;
  fs.promises.unlink(filePath).catch(() => {});
};

const sendConvenioFile = (res, filename) => {
  const filePath = convenioFilePath(filename);
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Archivo de convenio no encontrado.' });
    return;
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(filePath);
};

router.use(authMiddleware);
router.use(roleMiddleware(['administrador']));

// FunciÃ³n auxiliar para formatear la respuesta del convenio
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
router.post('/:id/clientes', async (req, res) => {
  const { id: id_convenio } = req.params;
  try {
    const { id_cliente } = parseBody(schemas.convenioAddClient, req.body);
    const adminClient = getAdminClient();
    
    // VALIDAR CUPO MÃXIMO
    const { data: convenio, error: convError } = await adminClient
      .from('convenios')
      .select('cupo_maximo, clientes_convenios(count)')
      .eq('id_convenio', id_convenio)
      .single();
    
    if (convError || !convenio) return res.status(404).json({ error: 'Convenio no encontrado.' });
    
    const countActual = convenio.clientes_convenios?.[0]?.count || 0;
    if (countActual >= convenio.cupo_maximo) {
      return res.status(400).json({ error: `Se ha alcanzado el cupo mÃ¡ximo de este convenio (${convenio.cupo_maximo}).` });
    }

    const { data: cliente, error: cliError } = await adminClient.from('clientes').select('id_tipo_cliente').eq('id_cliente', id_cliente).single();
    if (cliError || !cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
    if (cliente.id_tipo_cliente !== 1) return res.status(400).json({ error: 'Este cliente es de tipo Frecuente.' });
    const { error: insError } = await adminClient.from('clientes_convenios').insert([{ id_cliente, id_convenio, created_by: req.user.id }]);
    if (insError) throw insError;
    res.status(201).json({ mensaje: 'Cliente agregado correctamente' });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// CREAR Y AGREGAR NUEVO CLIENTE A CONVENIO
router.post('/:id/clientes/nuevo', async (req, res) => {
  const { id: id_convenio } = req.params;

  try {
    const { cedula, nombre, apellido, telefono } = parseBody(schemas.clienteCreate, {
      ...req.body,
      id_tipo_cliente: 1,
    });
    const adminClient = getAdminClient();

    // VALIDAR CUPO MÃXIMO
    const { data: convenio, error: convError } = await adminClient
      .from('convenios')
      .select('cupo_maximo, clientes_convenios(count)')
      .eq('id_convenio', id_convenio)
      .single();
    
    if (convError || !convenio) return res.status(404).json({ error: 'Convenio no encontrado.' });
    
    const countActual = convenio.clientes_convenios?.[0]?.count || 0;
    if (countActual >= convenio.cupo_maximo) {
      return res.status(400).json({ error: `Se ha alcanzado el cupo mÃ¡ximo de este convenio (${convenio.cupo_maximo}).` });
    }
    
    // 1. Crear el cliente (Siempre tipo Convenio: ID 1)
    const { data: newClient, error: clientError } = await adminClient
      .from('clientes')
      .insert([{
        cedula,
        nombre,
        apellido,
        telefono,
        id_tipo_cliente: 1, // Tipo Convenio
        created_by: req.user.id
      }])
      .select()
      .single();

    if (clientError) {
      if (clientError.message.includes('duplicate key')) return res.status(400).json({ error: 'Ya existe un cliente con esta cÃ©dula.' });
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

    if (linkError) throw linkError;

    res.status(201).json({
      id: newClient.id_cliente,
      cedula: newClient.cedula,
      nombre: newClient.nombre,
      apellido: newClient.apellido
    });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// QUITAR CLIENTE DE CONVENIO
router.delete('/:id/clientes/:clienteId', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { error } = await adminClient.from('clientes_convenios').delete().eq('id_convenio', req.params.id).eq('id_cliente', req.params.clienteId);
    if (error) throw error;
    res.json({ mensaje: 'Cliente retirado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREAR NUEVO CONVENIO
router.post('/', async (req, res) => {
  
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

// ACTUALIZAR CONVENIO (Y manejar historial si es renovaciÃ³n)
router.put('/:id', async (req, res) => {
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

    // Si se estÃ¡n actualizando las fechas (RenovaciÃ³n), guardamos el actual en el historial
    if (fecha_inicio || fecha_caducidad) {
      const { data: actual } = await adminClient.from('convenios').select('*').eq('id_convenio', id).single();
      if (actual) {
        // Verificar si las fechas realmente cambiaron para considerar que es una renovaciÃ³n
        const formatDate = (dateStr) => dateStr ? new Date(dateStr).toISOString().split('T')[0] : null;
        const dbInicio = formatDate(actual.fecha_inicio);
        const reqInicio = formatDate(fecha_inicio);
        const dbFin = formatDate(actual.fecha_caducidad);
        const reqFin = formatDate(fecha_caducidad);

        if ((reqInicio && reqInicio !== dbInicio) || (reqFin && reqFin !== dbFin)) {
          // Solo guardamos en historial si ya tenÃ­a fechas previas y hubo un cambio
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

    sendConvenioFile(res, data.archivo_firmado);
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

    sendConvenioFile(res, data.archivo_firmado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SUBIR ARCHIVO FIRMADO
router.post('/:id/upload', upload.single('archivo'), async (req, res) => {
  if (req.file && !hasAllowedSignature(req.file.path)) {
    removeUploadedFile(req.file.path);
    return res.status(400).json({ error: 'El archivo no coincide con un PDF o imagen valida.' });
  }

  if (!req.file) return res.status(400).json({ error: 'No se subiÃ³ ningÃºn archivo.' });
  
  const { id } = req.params;
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('convenios')
      .update({ archivo_firmado: req.file.filename, updated_by: req.user.id })
      .eq('id_convenio', id)
      .select('*, clientes_convenios(count)')
      .single();
    
    if (error) throw error;
    res.json(formatConvenio(data));
  } catch (error) {
    removeUploadedFile(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

// OBTENER REPORTE DE CONSUMOS
router.get('/:id/reporte', async (req, res) => {
  const { id } = req.params;
  const { fecha_inicio, fecha_fin } = req.query;

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

    // 2. Obtener las Ã³rdenes de estos clientes
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
    
    // Ordenar empleados alfabÃ©ticamente
    reporteArray.sort((a, b) => a.empleado.localeCompare(b.empleado));

    res.json(reporteArray);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
