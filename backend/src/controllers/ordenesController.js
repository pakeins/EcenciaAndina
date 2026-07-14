const { getAdminClient } = require('../config/supabase');
const { parseBody, schemas, sendValidationError } = require('../validation/ecencia');
const ordenesService = require('../services/ordenesService');

const crearOrden = async (req, res) => {
  try {
    const payload = parseBody(schemas.ordenCreate, req.body);
    const adminClient = getAdminClient();
    const result = await ordenesService.crearOrden(adminClient, payload, req.user);
    res.status(201).json(result);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(error.status || 500).json({ error: error.message });
  }
};

const getTelegramTrazabilidad = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(Math.max(1, Number.parseInt(String(req.query.limit || '20'), 10) || 20), 250);
    const params = {
      chatId: req.query.chat_id,
      outcome: req.query.outcome,
      idCliente: req.query.id_cliente,
      idOrden: req.query.id_orden,
      fecha_inicio: req.query.fecha_inicio,
      fecha_fin: req.query.fecha_fin,
      page,
      limit
    };
    
    const result = await ordenesService.getTelegramTrazabilidad(adminClient, params);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getOrdenes = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const result = await ordenesService.getOrdenes(adminClient, req.query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const actualizarOrdenCompleta = async (req, res) => {
  try {
    const payload = parseBody(schemas.ordenUpdate, req.body);
    const adminClient = getAdminClient();
    const result = await ordenesService.actualizarOrdenCompleta(adminClient, req.params.id, payload, req.user);
    res.json(result);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(error.status || 500).json({ error: error.message });
  }
};

const actualizarEstadoOrden = async (req, res) => {
  try {
    const payload = parseBody(schemas.estadoOrden, req.body);
    const adminClient = getAdminClient();
    const result = await ordenesService.actualizarEstadoOrden(adminClient, req.params.id, payload, req.user);
    res.json(result);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    
    // For specific custom validation logic, check required fields
    if (error.status === 409) {
      return res.status(409).json({ 
        requireConfirmation: true, 
        error: error.message 
      });
    }

    res.status(error.status || 500).json({ error: error.message });
  }
};

module.exports = {
  crearOrden,
  getTelegramTrazabilidad,
  getOrdenes,
  actualizarOrdenCompleta,
  actualizarEstadoOrden
};
