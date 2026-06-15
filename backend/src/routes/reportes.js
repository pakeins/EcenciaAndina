const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { CLIENT_TYPE } = require('../constants/domain');
const {
  aggregateDashboard,
  applyDateRange,
  getConsumedStateId,
  getDefaultDashboardRanges,
  getLunchCategoryIds,
  getReportTimeZone,
  parseDateRange,
} = require('../services/reporting');

router.use(authMiddleware);
router.use(roleMiddleware(['administrador']));

const asArray = (value) => (Array.isArray(value) ? value : []);
const asRelation = (value) => (Array.isArray(value) ? value[0] : value);
const asNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const getProduct = (detail) => asRelation(detail?.productos);

const handleRouteError = (res, error) => {
  const status = Number(error?.status || 500);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: status >= 500 ? 'No se pudo generar la informacion solicitada.' : error.message,
  });
};

router.get('/dashboard', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const timeZone = getReportTimeZone();
    const customRange = parseDateRange(req.query, { timeZone });
    const defaultRanges = getDefaultDashboardRanges(new Date(), timeZone);
    const analysisRanges = customRange
      ? [customRange]
      : [defaultRanges.day, defaultRanges.week, defaultRanges.month];
    const analysisStart = analysisRanges.reduce(
      (earliest, range) => (range.start < earliest ? range.start : earliest),
      analysisRanges[0].start,
    );
    const analysisEndExclusive = analysisRanges.reduce(
      (latest, range) => (range.endExclusive > latest ? range.endExclusive : latest),
      analysisRanges[0].endExclusive,
    );

    let ordersQuery = adminClient
      .from('ordenes')
      .select(`
        id_orden,
        created_at,
        consumed_at,
        id_estado,
        metodo_pago,
        clientes(
          nombre,
          apellido,
          clientes_convenios(convenios(nombre_empresa))
        ),
        estados_orden(nombre_estado),
        detalle_orden(
          cantidad,
          precio_aplicado,
          productos(id_categoria, nombre_producto)
        )
      `)
      .eq('id_estado', getConsumedStateId())
      .order('consumed_at', { ascending: false });
    ordersQuery = ordersQuery.gte('consumed_at', analysisStart).lt('consumed_at', analysisEndExclusive);

    let reservationsQuery = adminClient
      .from('ordenes')
      .select('id_orden,created_at')
      .order('created_at', { ascending: false });
    reservationsQuery = applyDateRange(
      reservationsQuery,
      customRange || defaultRanges.week,
    );

    const [ordersResult, reservationsResult, conveniosResult, clientsResult] = await Promise.all([
      ordersQuery,
      reservationsQuery,
      adminClient
        .from('convenios')
        .select('*', { count: 'exact', head: true })
        .eq('esta_activo', true)
        .gte('fecha_caducidad', defaultRanges.day.startDate),
      adminClient
        .from('clientes')
        .select('*', { count: 'exact', head: true })
        .eq('esta_activo', true)
        .eq('id_tipo_cliente', CLIENT_TYPE.DIRECT),
    ]);

    for (const result of [ordersResult, reservationsResult, conveniosResult, clientsResult]) {
      if (result.error) throw result.error;
    }

    res.json(
      aggregateDashboard({
        orders: ordersResult.data || [],
        reservationOrders: reservationsResult.data || [],
        customRange,
        defaultRanges,
        activeConvenios: conveniosResult.count || 0,
        activeClients: clientsResult.count || 0,
        timeZone,
        lunchCategoryIds: getLunchCategoryIds(),
        consumedStateId: getConsumedStateId(),
      }),
    );
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.get('/ventas', async (req, res) => {
  try {
    const range = parseDateRange(req.query, { required: true });
    const adminClient = getAdminClient();
    let query = adminClient
      .from('ordenes')
      .select('id_orden, metodo_pago, detalle_orden(cantidad, precio_aplicado)')
      .eq('id_estado', getConsumedStateId());
    query = applyDateRange(query, range, 'consumed_at');

    const { data, error } = await query;
    if (error) throw error;

    const summary = new Map();
    for (const order of data || []) {
      const rawMethod = String(order.metodo_pago || 'Otros').trim();
      const normalized = rawMethod.toLowerCase();
      let method = 'Otros';
      if (normalized.includes('efectivo')) method = 'Efectivo';
      else if (normalized.includes('convenio')) method = 'Convenio';
      else if (normalized.includes('saldo') || normalized.includes('prepago')) method = 'Saldo';
      else if (normalized.includes('transferencia')) method = 'Transferencia';

      const current = summary.get(method) || { metodo_pago: method, cantidadAlmuerzos: 0, totalConsumo: 0 };
      for (const detail of asArray(order.detalle_orden)) {
        const quantity = asNumber(detail.cantidad);
        current.cantidadAlmuerzos += quantity;
        current.totalConsumo += quantity * asNumber(detail.precio_aplicado);
      }
      summary.set(method, current);
    }

    res.json(
      [...summary.values()].map((row) => ({
        ...row,
        totalConsumo: Number(row.totalConsumo.toFixed(2)),
      })),
    );
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.get('/estados', async (req, res) => {
  try {
    const range = parseDateRange(req.query, { required: true });
    const adminClient = getAdminClient();
    let query = adminClient.from('ordenes').select(`
      id_orden,
      created_at,
      id_estado,
      metodo_pago,
      clientes(nombre, apellido),
      estados_orden(nombre_estado),
      detalle_orden(cantidad, precio_aplicado, productos(nombre_producto))
    `);
    query = applyDateRange(query, range);
    if (req.query.id_estado && req.query.id_estado !== 'all') {
      query = query.eq('id_estado', req.query.id_estado);
    }
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    res.json(
      (data || []).map((order) => {
        const client = asRelation(order.clientes);
        const state = asRelation(order.estados_orden);
        const details = asArray(order.detalle_orden);
        return {
          id: order.id_orden,
          fecha: order.created_at,
          cliente: client ? `${client.nombre || ''} ${client.apellido || ''}`.trim() : 'Desconocido',
          estado: state?.nombre_estado || 'Desconocido',
          metodo_pago: order.metodo_pago || 'N/A',
          descripcion: details
            .map((detail) => `${asNumber(detail.cantidad)}x ${getProduct(detail)?.nombre_producto || 'Sin producto'}`)
            .join(', '),
          cantidadAlmuerzos: details.reduce((sum, detail) => sum + asNumber(detail.cantidad), 0),
          totalConsumo: Number(
            details
              .reduce(
                (sum, detail) =>
                  sum + asNumber(detail.cantidad) * asNumber(detail.precio_aplicado),
                0,
              )
              .toFixed(2),
          ),
        };
      }),
    );
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.get('/productos', async (req, res) => {
  try {
    const range = parseDateRange(req.query, { required: true });
    const adminClient = getAdminClient();
    let query = adminClient
      .from('ordenes')
      .select(`
        id_orden,
        consumed_at,
        detalle_orden(
          cantidad,
          precio_aplicado,
          productos(nombre_producto, categorias_productos(nombre_categoria))
        )
      `)
      .eq('id_estado', getConsumedStateId());
    query = applyDateRange(query, range, 'consumed_at');

    const { data, error } = await query;
    if (error) throw error;

    const products = new Map();
    for (const order of data || []) {
      for (const detail of asArray(order.detalle_orden)) {
        const product = getProduct(detail);
        const category = asRelation(product?.categorias_productos);
        const name = product?.nombre_producto || 'Sin producto';
        const current = products.get(name) || {
          nombre: name,
          categoria: category?.nombre_categoria || 'Otra',
          cantidadVendida: 0,
          ingresosGenerados: 0,
        };
        const quantity = asNumber(detail.cantidad);
        current.cantidadVendida += quantity;
        current.ingresosGenerados += quantity * asNumber(detail.precio_aplicado);
        products.set(name, current);
      }
    }

    res.json(
      [...products.values()]
        .map((row) => ({
          ...row,
          ingresosGenerados: Number(row.ingresosGenerados.toFixed(2)),
        }))
        .sort((left, right) => right.cantidadVendida - left.cantidadVendida),
    );
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.get('/clientes', async (req, res) => {
  try {
    const range = parseDateRange(req.query, { required: true });
    const clientId = String(req.query.id_cliente || '').trim();
    if (!clientId || clientId === 'all') {
      return res.status(400).json({ error: 'Debe seleccionar un cliente especifico.' });
    }

    const adminClient = getAdminClient();
    const clientResult = await adminClient
      .from('clientes')
      .select('clientes_convenios(convenios(nombre_empresa))')
      .eq('id_cliente', clientId)
      .maybeSingle();
    if (clientResult.error) throw clientResult.error;
    if (!clientResult.data) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const link = asArray(clientResult.data.clientes_convenios)[0];
    const convenio = asRelation(link?.convenios);
    const convenioName = convenio?.nombre_empresa || 'N/A';

    let query = adminClient
      .from('ordenes')
      .select(`
        id_orden,
        created_at,
        metodo_pago,
        estados_orden(nombre_estado),
        detalle_orden(cantidad, precio_aplicado, productos(nombre_producto))
      `)
      .eq('id_cliente', clientId)
      .order('created_at', { ascending: false });
    query = applyDateRange(query, range);

    const { data, error } = await query;
    if (error) throw error;

    res.json(
      (data || []).map((order) => {
        const state = asRelation(order.estados_orden);
        const details = asArray(order.detalle_orden);
        return {
          id: order.id_orden,
          fecha: order.created_at,
          convenio: convenioName,
          estado: state?.nombre_estado || 'Desconocido',
          metodo_pago: order.metodo_pago || 'N/A',
          descripcion: details
            .map((detail) => `${asNumber(detail.cantidad)}x ${getProduct(detail)?.nombre_producto || 'Sin producto'}`)
            .join(', '),
          cantidadAlmuerzos: details.reduce((sum, detail) => sum + asNumber(detail.cantidad), 0),
          totalConsumo: Number(
            details
              .reduce(
                (sum, detail) =>
                  sum + asNumber(detail.cantidad) * asNumber(detail.precio_aplicado),
                0,
              )
              .toFixed(2),
          ),
        };
      }),
    );
  } catch (error) {
    handleRouteError(res, error);
  }
});

module.exports = router;
