const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const {
  compactLunchSummary,
  formatDetailDescription,
  summarizeOrderDetails,
} = require('../services/lunchTypes');

router.use(authMiddleware);
router.use(roleMiddleware(['administrador', 'caja']));

// Helper functions for Ecuador Timezone (America/Guayaquil - UTC-5)
const getEcuadorDayRange = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;

  const localDateStr = `${year}-${month}-${day}`;
  const startUtc = new Date(`${localDateStr}T05:00:00.000Z`);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1);

  return { start: startUtc.toISOString(), end: endUtc.toISOString(), dateStr: localDateStr };
};

const getEcuadorWeekRange = (date = new Date()) => {
  const dayRange = getEcuadorDayRange(date);
  const localDate = new Date(dayRange.start);
  const utcDay = localDate.getUTCDay();
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
  
  const mondayUtc = new Date(localDate.getTime() + diffToMonday * 24 * 60 * 60 * 1000);
  const sundayUtc = new Date(mondayUtc.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  
  return { start: mondayUtc.toISOString(), end: sundayUtc.toISOString() };
};

const getEcuadorMonthRange = (date = new Date()) => {
  const dayRange = getEcuadorDayRange(date);
  const [yearStr, monthStr] = dayRange.dateStr.split('-');
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  
  const startLocalStr = `${yearStr}-${monthStr}-01`;
  const startUtc = new Date(`${startLocalStr}T05:00:00.000Z`);
  
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthStr = nextMonth.toString().padStart(2, '0');
  const nextYearStr = nextYear.toString();
  
  const nextMonthStartUtc = new Date(`${nextYearStr}-${nextMonthStr}-01T05:00:00.000Z`);
  const endUtc = new Date(nextMonthStartUtc.getTime() - 1);
  
  return { start: startUtc.toISOString(), end: endUtc.toISOString() };
};

const getLocalDayName = (utcDateStr, timeZone = 'America/Guayaquil') => {
  const date = new Date(utcDateStr);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short', timeZone });
  const map = {
    'Mon': 'Lun',
    'Tue': 'Mar',
    'Wed': 'Mié',
    'Thu': 'Jue',
    'Fri': 'Vie',
    'Sat': 'Sáb',
    'Sun': 'Dom'
  };
  return map[weekday] || 'Otros';
};

const ORDER_DETAIL_SELECT = `
  id_orden, created_at, id_estado,
  clientes(
    clientes_convenios(id_convenio)
  ),
  detalle_orden(
    cantidad,
    precio_aplicado,
    id_tipo_almuerzo,
    tipos_almuerzo(codigo, nombre),
    productos(id_categoria, nombre_producto, categorias_productos(nombre_categoria))
  )
`;

// Rango filtrado en UTC (Ecuador 00:00 local = 05:00 UTC).
const resolveDashboardFilter = ({ fecha_inicio, fecha_fin }) => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!fecha_inicio || !fecha_fin || !dateRegex.test(fecha_inicio) || !dateRegex.test(fecha_fin)) {
    return { useFilter: false };
  }
  const nextDay = new Date(new Date(fecha_fin).getTime() + 24 * 60 * 60 * 1000);
  const nextDayStr = nextDay.toISOString().split('T')[0];
  return {
    useFilter: true,
    filterStart: `${fecha_inicio}T05:00:00.000Z`,
    filterEnd: `${nextDayStr}T04:59:59.999Z`,
  };
};

const KPI_KEYS = [
  'almuerzosPrincipales',
  'ejecutivoCompleto',
  'ejecutivoSinSopa',
  'ejecutivoSimple',
  'almuerzoDia',
  'almuerzoDiaSimple',
  'otrosAlmuerzos',
  'segundosAlmuerzos',
  'vegetarianos',
  'especiales',
  'almuerzosConExtras',
  'extrasCantidad',
  'extrasTotal',
  'totalConsumo',
];

const sumKpiSummaries = (orders) =>
  (orders || []).reduce((acc, order) => {
    const summary = summarizeOrderDetails(order.detalle_orden || []);
    for (const key of KPI_KEYS) acc[key] += summary[key];
    return acc;
  }, Object.fromEntries(KPI_KEYS.map((key) => [key, 0])));

const fetchMonthlyLunchCount = async (adminClient, monthRange) => {
  const { data: ordersMonth, error } = await adminClient
    .from('ordenes')
    .select(ORDER_DETAIL_SELECT)
    .eq('id_estado', 2)
    .gte('created_at', monthRange.start)
    .lte('created_at', monthRange.end);

  if (error) throw error;
  return (ordersMonth || []).reduce(
    (total, o) => total + summarizeOrderDetails(o.detalle_orden || []).almuerzosPrincipales,
    0,
  );
};

const buildConsumosPorDiaFiltrado = (ordersChart, fecha_inicio, fecha_fin) => {
  const dateMap = {};
  const DAY_MS = 86400000;
  for (let time = new Date(fecha_inicio).getTime(); time <= new Date(fecha_fin).getTime(); time += DAY_MS) {
    const dateStr = new Date(time).toISOString().split('T')[0];
    const [, m, dayVal] = dateStr.split('-');
    dateMap[`${dayVal}/${m}`] = 0;
  }

  ordersChart.forEach((o) => {
    const localDateStr = getEcuadorDayRange(new Date(o.created_at)).dateStr;
    const [, m, dayVal] = localDateStr.split('-');
    const shortDate = `${dayVal}/${m}`;
    if (dateMap[shortDate] !== undefined) {
      dateMap[shortDate] += summarizeOrderDetails(o.detalle_orden || []).almuerzosPrincipales;
    }
  });

  return Object.keys(dateMap).map((name) => ({ name, value: dateMap[name] }));
};

const buildConsumosPorSemana = (ordersChart) => {
  const weekMap = { 'Lun': 0, 'Mar': 0, 'Mié': 0, 'Jue': 0, 'Vie': 0, 'Sáb': 0, 'Dom': 0 };
  ordersChart.forEach((o) => {
    const dayName = getLocalDayName(o.created_at);
    if (weekMap[dayName] !== undefined) {
      weekMap[dayName] += summarizeOrderDetails(o.detalle_orden || []).almuerzosPrincipales;
    }
  });
  return Object.keys(weekMap).map((name) => ({ name, value: weekMap[name] }));
};

const buildConsumosPorConvenio = (ordersConvenio) => {
  const convenioMap = {};
  ordersConvenio.forEach((o) => {
    const convenio = o.clientes?.clientes_convenios?.[0]?.convenios?.nombre_empresa;
    if (convenio) {
      convenioMap[convenio] = (convenioMap[convenio] || 0) + summarizeOrderDetails(o.detalle_orden || []).almuerzosPrincipales;
    }
  });
  return Object.keys(convenioMap).map((name) => ({ name, value: convenioMap[name] }));
};

const buildActividadReciente = (recentOrders) =>
  (recentOrders || []).map((o) => ({
    id: o.id_orden,
    fecha: o.created_at,
    cliente: o.clientes ? `${o.clientes.nombre} ${o.clientes.apellido}` : 'Cliente Desconocido',
    descripcion: o.detalle_orden?.map(formatDetailDescription).join(', ') || 'Sin detalles',
    metodo_pago: o.metodo_pago || 'N/A',
    estado: o.estados_orden?.nombre_estado || 'Desconocido',
  }));

const buildTopProducts = (ordersKpi) => {
  const productCounts = {};
  ordersKpi.forEach((o) => {
    o.detalle_orden?.forEach((d) => {
      const name = d.productos?.nombre_producto || 'Desconocido';
      productCounts[name] = (productCounts[name] || 0) + d.cantidad;
    });
  });

  return Object.keys(productCounts)
    .map((name) => ({ name, value: productCounts[name] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);
};

// GET /dashboard - Métricas y analíticas en tiempo real (admite filtros opcionales de fecha)
router.get('/dashboard', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { fecha_inicio, fecha_fin } = req.query;
    const { useFilter, filterStart, filterEnd } = resolveDashboardFilter(req.query);

    const now = new Date();
    const dayRange = getEcuadorDayRange(now);
    const weekRange = getEcuadorWeekRange(now);
    const monthRange = getEcuadorMonthRange(now);

    const kpiStart = useFilter ? filterStart : dayRange.start;
    const kpiEnd = useFilter ? filterEnd : dayRange.end;

    // 1. Almuerzos en el periodo (Traemos todas las ordenes)
    const { data: allOrders, error: errKpi } = await adminClient
      .from('ordenes')
      .select(ORDER_DETAIL_SELECT)
      .gte('created_at', kpiStart)
      .lte('created_at', kpiEnd);

    if (errKpi) throw errKpi;

    let totalHoy = 0, consumidosHoy = 0, pendientesHoy = 0, canceladosHoy = 0;
    let conveniosHoy = 0, frecuentesHoy = 0;

    (allOrders || []).forEach(order => {
      const summary = summarizeOrderDetails(order.detalle_orden || []);
      const cantidadAlmuerzos = summary.almuerzosPrincipales;
      
      totalHoy += cantidadAlmuerzos;
      
      if (order.id_estado === 1) pendientesHoy += cantidadAlmuerzos;
      else if (order.id_estado === 2) consumidosHoy += cantidadAlmuerzos;
      else if (order.id_estado === 3) canceladosHoy += cantidadAlmuerzos;
      
      const tieneConvenio = order.clientes?.clientes_convenios && order.clientes.clientes_convenios.length > 0;
      if (tieneConvenio) conveniosHoy += cantidadAlmuerzos;
      else frecuentesHoy += cantidadAlmuerzos;
    });

    const ordersKpi = allOrders.filter(o => o.id_estado === 2);
    const kpiSummary = sumKpiSummaries(ordersKpi);
    const lunchesPeriod = kpiSummary.almuerzosPrincipales;

    // 2. Almuerzos del Mes
    const secondaryKpiValue = await fetchMonthlyLunchCount(adminClient, monthRange);
    const secondaryKpiTitle = 'Almuerzos del Mes';
    const secondaryKpiDesc = 'Total acumulado mensual';

    // 3. Convenios Activos
    const { count: conveniosActivos, error: errConv } = await adminClient
      .from('convenios')
      .select('*', { count: 'exact', head: true })
      .eq('esta_activo', true);

    if (errConv) throw errConv;

    // 4. Clientes Frecuentes Activos
    const { count: clientesFrecuentes, error: errCli } = await adminClient
      .from('clientes')
      .select('*', { count: 'exact', head: true })
      .eq('esta_activo', true);

    if (errCli) throw errCli;



    // 5. Consumos por Día (Rango semanal por defecto, o cada día del periodo filtrado)
    const chartStart = useFilter ? filterStart : weekRange.start;
    const chartEnd = useFilter ? filterEnd : weekRange.end;

    const { data: ordersChart, error: errChart } = await adminClient
      .from('ordenes')
      .select(ORDER_DETAIL_SELECT)
      .eq('id_estado', 2)
      .gte('created_at', chartStart)
      .lte('created_at', chartEnd);

    if (errChart) throw errChart;

    const consumosPorDia = useFilter
      ? buildConsumosPorDiaFiltrado(ordersChart, fecha_inicio, fecha_fin)
      : buildConsumosPorSemana(ordersChart);

    // 6. Consumos por Convenio (Mes por defecto, o periodo filtrado)
    const convenioStart = useFilter ? filterStart : monthRange.start;
    const convenioEnd = useFilter ? filterEnd : monthRange.end;

    const { data: ordersConvenio, error: errConvChart } = await adminClient
      .from('ordenes')
      .select(`
        id_orden, created_at, id_estado,
        clientes(
          id_cliente,
          clientes_convenios(
            convenios(nombre_empresa)
          )
        ),
        detalle_orden(
          cantidad,
          precio_aplicado,
          id_tipo_almuerzo,
          tipos_almuerzo(codigo, nombre),
          productos(id_categoria, nombre_producto, categorias_productos(nombre_categoria))
        )
      `)
      .eq('id_estado', 2)
      .gte('created_at', convenioStart)
      .lte('created_at', convenioEnd);

    if (errConvChart) throw errConvChart;

    const consumosPorConvenio = buildConsumosPorConvenio(ordersConvenio);

    // 7. Actividad Reciente (Últimos 5 consumos registrados)
    const { data: recentOrders, error: errRecent } = await adminClient
      .from('ordenes')
      .select(`
        id_orden, created_at, id_estado, metodo_pago,
        clientes(nombre, apellido),
        estados_orden(nombre_estado),
        detalle_orden(
          cantidad,
          precio_aplicado,
          id_tipo_almuerzo,
          observaciones_tipo,
          opciones,
          tipos_almuerzo(codigo, nombre),
          productos(id_categoria, nombre_producto, categorias_productos(nombre_categoria))
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (errRecent) throw errRecent;

    const actividadReciente = buildActividadReciente(recentOrders);

    // 8. Productos Más Vendidos (Top 4 en el periodo filtrado o mes por defecto)
    const topProducts = buildTopProducts(ordersKpi);

    res.json({
      metrics: {
        almuerzosHoy: lunchesPeriod,
        almuerzosHoyTitle: useFilter ? 'Almuerzos Periodo' : 'Almuerzos Hoy',
        almuerzosHoyDesc: useFilter ? 'Consumidos en periodo filtrado' : 'Consumidos el día de hoy',
        almuerzosMes: secondaryKpiValue,
        almuerzosMesTitle: secondaryKpiTitle,
        almuerzosMesDesc: secondaryKpiDesc,
        totalHoy,
        consumidosHoy,
        pendientesHoy,
        canceladosHoy,
        conveniosHoy,
        frecuentesHoy,
        ejecutivoCompleto: kpiSummary.ejecutivoCompleto,
        ejecutivoSinSopa: kpiSummary.ejecutivoSinSopa,
        ejecutivoSimple: kpiSummary.ejecutivoSimple,
        almuerzoDia: kpiSummary.almuerzoDia,
        almuerzoDiaSimple: kpiSummary.almuerzoDiaSimple,
        otrosAlmuerzos: kpiSummary.otrosAlmuerzos,
        vegetarianos: kpiSummary.vegetarianos,
        especiales: kpiSummary.especiales,
        almuerzosConExtras: kpiSummary.almuerzosConExtras,
        extrasCantidad: kpiSummary.extrasCantidad,
        valorExtras: Number(kpiSummary.extrasTotal.toFixed(2)),
        conveniosActivos: conveniosActivos || 0,
        clientesFrecuentes: clientesFrecuentes || 0
      },
      consumosPorDia,
      consumosPorConvenio,
      actividadReciente,
      topProducts
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


const validateDates = (req, res, next) => {
  const { fecha_inicio, fecha_fin } = req.query;
  if (!fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: 'Las fechas de inicio y fin son obligatorias.' });
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(fecha_inicio) || !dateRegex.test(fecha_fin)) {
    return res.status(400).json({ error: 'El formato de las fechas debe ser YYYY-MM-DD.' });
  }
  if (new Date(fecha_fin) < new Date(fecha_inicio)) {
    return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la de inicio.' });
  }
  next();
};

router.get('/telegram-kpis', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    
    // 1. Usuarios de Telegram
    const { data: subsData, error: subsError } = await adminClient
      .from('telegram_subscriptions')
      .select('consent_status, is_active');
    if (subsError) throw subsError;

    let users = {
      total: 0,
      activos: 0,
      pendientes: 0,
      bloqueados: 0
    };

    (subsData || []).forEach(sub => {
      users.total++;
      if (sub.consent_status === 'accepted' && sub.is_active) {
        users.activos++;
      } else if (sub.consent_status === 'pending') {
        users.pendientes++;
      } else if (['rejected', 'revoked'].includes(sub.consent_status) || !sub.is_active) {
        users.bloqueados++;
      }
    });

    // 2. Reservas de Telegram (Hoy y Historico)
    const { start: todayStart, end: todayEnd } = getEcuadorDayRange(new Date());

    const { data: ordenesData, error: ordenesError } = await adminClient
      .from('ordenes')
      .select('id_estado, created_at')
      .eq('id_origen', 1);
    
    if (ordenesError) throw ordenesError;

    let reservas = {
      hoy: { total: 0, pendientes: 0, consumidas: 0, canceladas: 0 },
      historico: { total: 0, pendientes: 0, consumidas: 0, canceladas: 0 }
    };

    (ordenesData || []).forEach(o => {
      const isToday = o.created_at >= todayStart && o.created_at <= todayEnd;
      
      reservas.historico.total++;
      if (o.id_estado === 1) reservas.historico.pendientes++;
      else if (o.id_estado === 2) reservas.historico.consumidas++;
      else if (o.id_estado === 3) reservas.historico.canceladas++;

      if (isToday) {
        reservas.hoy.total++;
        if (o.id_estado === 1) reservas.hoy.pendientes++;
        else if (o.id_estado === 2) reservas.hoy.consumidas++;
        else if (o.id_estado === 3) reservas.hoy.canceladas++;
      }
    });

    res.json({ users, reservas });
  } catch (error) {
    console.error('Error fetching telegram KPIs:', error);
    res.status(500).json({ error: error.message });
  }
});

router.use(validateDates);

// 1. REPORTE GENERAL DE VENTAS (INGRESOS)
router.get('/ventas', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { fecha_inicio, fecha_fin } = req.query;

    let query = adminClient
      .from('ordenes')
      .select(`
        id_orden, id_estado, metodo_pago, created_at, consumed_at,
        detalle_orden (
          cantidad,
          precio_aplicado,
          id_tipo_almuerzo,
          tipos_almuerzo(codigo, nombre),
          productos(id_categoria, nombre_producto, categorias_productos(nombre_categoria))
        )
      `)
      .eq('id_estado', 2);

    if (fecha_inicio) query = query.gte('consumed_at', fecha_inicio);
    if (fecha_fin) query = query.lte('consumed_at', fecha_fin + 'T23:59:59.999Z');

    const { data: ordenes, error } = await query;
    if (error) throw error;

    const consumidos = ordenes || [];

    const resumen = {
      efectivo: { cantidad: 0, total: 0 },
      convenio: { cantidad: 0, total: 0 },
      saldo: { cantidad: 0, total: 0 },
      transferencia: { cantidad: 0, total: 0 },
      otros: { cantidad: 0, total: 0 }
    };

    consumidos.forEach(orden => {
      const metodo = orden.metodo_pago ? orden.metodo_pago.toLowerCase() : 'otros';
      
      let key = 'otros';
      if (metodo.includes('efectivo')) key = 'efectivo';
      else if (metodo.includes('convenio')) key = 'convenio';
      else if (metodo.includes('saldo') || metodo.includes('prepago')) key = 'saldo';
      else if (metodo.includes('transferencia')) key = 'transferencia';

      const summary = summarizeOrderDetails(orden.detalle_orden || []);
      resumen[key].cantidad += summary.almuerzosPrincipales;
      resumen[key].ejecutivoCompleto = (resumen[key].ejecutivoCompleto || 0) + summary.ejecutivoCompleto;
      resumen[key].ejecutivoSinSopa = (resumen[key].ejecutivoSinSopa || 0) + summary.ejecutivoSinSopa;
      resumen[key].ejecutivoSimple = (resumen[key].ejecutivoSimple || 0) + summary.ejecutivoSimple;
      resumen[key].almuerzoDia = (resumen[key].almuerzoDia || 0) + summary.almuerzoDia;
      resumen[key].almuerzoDiaSimple = (resumen[key].almuerzoDiaSimple || 0) + summary.almuerzoDiaSimple;
      resumen[key].otrosAlmuerzos = (resumen[key].otrosAlmuerzos || 0) + summary.otrosAlmuerzos;
      resumen[key].segundosAlmuerzos = (resumen[key].segundosAlmuerzos || 0) + summary.segundosAlmuerzos;
      resumen[key].vegetarianos = (resumen[key].vegetarianos || 0) + summary.vegetarianos;
      resumen[key].especiales = (resumen[key].especiales || 0) + summary.especiales;
      resumen[key].almuerzosConExtras = (resumen[key].almuerzosConExtras || 0) + summary.almuerzosConExtras;
      resumen[key].extrasCantidad = (resumen[key].extrasCantidad || 0) + summary.extrasCantidad;
      resumen[key].valorExtras = (resumen[key].valorExtras || 0) + summary.extrasTotal;
      resumen[key].total += summary.totalConsumo;
    });

    const resultadoArray = Object.keys(resumen).map(k => ({
      metodo_pago: k.charAt(0).toUpperCase() + k.slice(1),
      cantidadAlmuerzos: resumen[k].cantidad,
      almuerzosPrincipales: resumen[k].cantidad,
      ejecutivoCompleto: resumen[k].ejecutivoCompleto || 0,
      ejecutivoSinSopa: resumen[k].ejecutivoSinSopa || 0,
      ejecutivoSimple: resumen[k].ejecutivoSimple || 0,
      almuerzoDia: resumen[k].almuerzoDia || 0,
      almuerzoDiaSimple: resumen[k].almuerzoDiaSimple || 0,
      otrosAlmuerzos: resumen[k].otrosAlmuerzos || 0,
      segundosAlmuerzos: resumen[k].segundosAlmuerzos || 0,
      vegetarianos: resumen[k].vegetarianos || 0,
      especiales: resumen[k].especiales || 0,
      almuerzosConExtras: resumen[k].almuerzosConExtras || 0,
      extrasCantidad: resumen[k].extrasCantidad || 0,
      valorExtras: Number((resumen[k].valorExtras || 0).toFixed(2)),
      totalConsumo: resumen[k].total
    })).filter(r => r.cantidadAlmuerzos > 0 || r.segundosAlmuerzos > 0 || r.extrasCantidad > 0 || r.totalConsumo > 0);

    res.json(resultadoArray);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. REPORTE DE PEDIDOS POR ESTADO
router.get('/estados', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { fecha_inicio, fecha_fin, id_estado } = req.query;

    let query = adminClient
      .from('ordenes')
      .select(`
        id_orden, created_at, consumed_at, id_estado, metodo_pago,
        clientes ( nombre, apellido ),
        estados_orden ( nombre_estado ),
        detalle_orden (
          cantidad,
          precio_aplicado,
          id_tipo_almuerzo,
          observaciones_tipo,
          opciones,
          tipos_almuerzo(codigo, nombre),
          productos(id_categoria, nombre_producto, categorias_productos(nombre_categoria))
        )
      `);

    if (fecha_inicio) query = query.gte('created_at', fecha_inicio);
    if (fecha_fin) query = query.lte('created_at', fecha_fin + 'T23:59:59.999Z');
    if (id_estado && id_estado !== 'all') query = query.eq('id_estado', id_estado);

    query = query.order('created_at', { ascending: false });

    const { data: ordenes, error } = await query;
    if (error) throw error;

    const reporteFormateado = ordenes.map(o => {
      const summary = summarizeOrderDetails(o.detalle_orden || []);
      const descripciones = o.detalle_orden.map(formatDetailDescription).join(', ');

      return {
        id: o.id_orden,
        fecha: o.consumed_at || o.created_at,
        cliente: o.clientes ? `${o.clientes.nombre} ${o.clientes.apellido}` : 'Desconocido',
        estado: o.estados_orden?.nombre_estado || 'Desconocido',
        metodo_pago: o.metodo_pago || 'N/A',
        descripcion: descripciones,
        ...compactLunchSummary(summary)
      };
    });

    res.json(reporteFormateado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. REPORTE DE POPULARIDAD DE PRODUCTOS
router.get('/productos', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { fecha_inicio, fecha_fin } = req.query;

    let query = adminClient
      .from('ordenes')
      .select(`
        id_estado, created_at, consumed_at,
        detalle_orden ( cantidad, precio_aplicado, productos(nombre_producto, categorias_productos(nombre_categoria)) )
      `)
      .eq('id_estado', 2);

    if (fecha_inicio) query = query.gte('consumed_at', fecha_inicio);
    if (fecha_fin) query = query.lte('consumed_at', fecha_fin + 'T23:59:59.999Z');

    const { data: ordenes, error } = await query;
    if (error) throw error;

    const consumidos = ordenes || [];

    const productosMap = {};

    consumidos.forEach(orden => {
      orden.detalle_orden.forEach(det => {
        const nombre = det.productos?.nombre_producto || 'Desconocido';
        const categoria = det.productos?.categorias_productos?.nombre_categoria || 'Otra';
        if (!productosMap[nombre]) {
          productosMap[nombre] = { nombre, categoria, cantidadVendida: 0, ingresosGenerados: 0 };
        }
        productosMap[nombre].cantidadVendida += det.cantidad;
        productosMap[nombre].ingresosGenerados += (det.cantidad * det.precio_aplicado);
      });
    });

    const resultadoArray = Object.values(productosMap).sort((a, b) => b.cantidadVendida - a.cantidadVendida);

    res.json(resultadoArray);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. REPORTE POR CLIENTE
router.get('/clientes', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { fecha_inicio, fecha_fin, id_cliente } = req.query;

    if (!id_cliente || id_cliente === 'all') {
      return res.status(400).json({ error: 'Debe seleccionar un cliente específico.' });
    }

    // Consultar el convenio del cliente
    const { data: cliente, error: clientError } = await adminClient
      .from('clientes')
      .select(`
        id_cliente,
        clientes_convenios(
          convenios(nombre_empresa)
        )
      `)
      .eq('id_cliente', id_cliente)
      .maybeSingle();

    if (clientError) throw clientError;
    const convenioNombre = cliente?.clientes_convenios?.[0]?.convenios?.nombre_empresa || 'N/A';

    let query = adminClient
      .from('ordenes')
      .select(`
        id_orden, created_at, consumed_at, id_estado, metodo_pago,
        estados_orden ( nombre_estado ),
        detalle_orden (
          cantidad,
          precio_aplicado,
          id_tipo_almuerzo,
          observaciones_tipo,
          opciones,
          tipos_almuerzo(codigo, nombre),
          productos(id_categoria, nombre_producto, categorias_productos(nombre_categoria))
        )
      `)
      .eq('id_cliente', id_cliente);

    if (fecha_inicio) query = query.gte('created_at', fecha_inicio);
    if (fecha_fin) query = query.lte('created_at', fecha_fin + 'T23:59:59.999Z');

    query = query.order('created_at', { ascending: false });

    const { data: ordenes, error } = await query;
    if (error) throw error;

    const reporteFormateado = ordenes.map(o => {
      const summary = summarizeOrderDetails(o.detalle_orden || []);
      const descripciones = o.detalle_orden.map(formatDetailDescription).join(', ');

      return {
        id: o.id_orden,
        fecha: o.consumed_at || o.created_at,
        estado: o.estados_orden?.nombre_estado || 'Desconocido',
        metodo_pago: o.metodo_pago || 'N/A',
        descripcion: descripciones,
        ...compactLunchSummary(summary),
        convenio: convenioNombre
      };
    });

    res.json(reporteFormateado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports._private = {
  buildActividadReciente,
  buildConsumosPorConvenio,
  buildConsumosPorDiaFiltrado,
  buildConsumosPorSemana,
  buildTopProducts,
  fetchMonthlyLunchCount,
  resolveDashboardFilter,
  sumKpiSummaries,
};
