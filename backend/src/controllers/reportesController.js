const { getAdminClient } = require('../config/supabase');
const reportesService = require('../services/reportesService');

const getDashboard = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const result = await reportesService.getDashboardMetrics(adminClient, req.query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTelegramKpis = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const result = await reportesService.getTelegramKpis(adminClient);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getVentas = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const result = await reportesService.getVentas(adminClient, req.query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getEstados = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const result = await reportesService.getEstados(adminClient, req.query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getProductos = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const result = await reportesService.getProductosPopulares(adminClient, req.query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getClientes = async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const result = await reportesService.getClientesReport(adminClient, req.query);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

module.exports = {
  getDashboard,
  getTelegramKpis,
  getVentas,
  getEstados,
  getProductos,
  getClientes
};
