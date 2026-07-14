const { getAdminClient } = require('../config/supabase');
const { parseBody, schemas, sendValidationError } = require('../validation/ecencia');
const clientesService = require('../services/clientesService');

const handleRouteError = (res, error) => {
  console.error('[ROUTE ERROR]', error);
  if (sendValidationError(res, error)) return;
  const status = Number(error?.status || 500);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: error.message || 'No se pudo completar la operacion del cliente.',
  });
};

const getAll = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const data = await clientesService.getAllClientes(adminClient);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTipos = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const data = await clientesService.getTiposCliente(adminClient);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getPrivacyRequests = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const data = await clientesService.getPrivacyRequests(adminClient);
    res.json(data);
  } catch (error) {
    handleRouteError(res, error);
  }
};

const resolvePrivacyRequest = async (req, res) => {
  try {
    const payload = parseBody(schemas.telegramPrivacyResolution, req.body);
    const adminClient = getAdminClient();
    const data = await clientesService.resolvePrivacyRequest(adminClient, req.params.requestId, payload, req.user);
    res.json(data);
  } catch (error) {
    handleRouteError(res, error);
  }
};

const removeConvenio = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const result = await clientesService.removeClienteFromConvenio(adminClient, req.params.id, req.user);
    res.json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
};

const create = async (req, res) => {
  try {
    const payload = parseBody(schemas.clienteCreate, req.body);
    const adminClient = getAdminClient();
    const result = await clientesService.createCliente(adminClient, payload, req.user);
    res.status(201).json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
};

const reinviteTelegram = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const result = await clientesService.reinviteClienteTelegram(adminClient, req.params.id, req.user);
    res.json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
};

const revokeTelegram = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const result = await clientesService.revokeTelegram(adminClient, req.params.id);
    res.json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
};

const update = async (req, res) => {
  try {
    const payload = parseBody(schemas.clienteUpdate, req.body);
    const adminClient = getAdminClient();
    const result = await clientesService.updateCliente(adminClient, req.params.id, payload, req.user);
    res.json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
};

const getSaldo = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const data = await clientesService.getClienteSaldo(adminClient, req.params.id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const recargar = async (req, res) => {
  try {
    const payload = parseBody(schemas.recarga, req.body);
    const adminClient = getAdminClient();
    const result = await clientesService.recargarSaldo(adminClient, req.params.id, payload, req.user);
    res.status(201).json(result);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
};

const getHistorial = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const data = await clientesService.getHistorialCliente(adminClient, req.params.id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const remove = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const result = await clientesService.deleteCliente(adminClient, req.params.id);
    res.json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
};

const hardDelete = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const result = await clientesService.hardDeleteCliente(adminClient, req.params.id);
    res.json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
};

module.exports = {
  getAll,
  getTipos,
  getPrivacyRequests,
  resolvePrivacyRequest,
  removeConvenio,
  create,
  reinviteTelegram,
  revokeTelegram,
  update,
  getSaldo,
  recargar,
  getHistorial,
  remove,
  hardDelete
};
