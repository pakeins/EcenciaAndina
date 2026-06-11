const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

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
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  
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

// GET /dashboard - Métricas y analíticas en tiempo real (admite filtros opcionales de fecha)
router.get('/dashboard', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { fecha_inicio, fecha_fin } = req.query;

    let useFilter = false;
    let filterStart, filterEnd;
    if (fecha_inicio && fecha_fin) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (dateRegex.test(fecha_inicio) && dateRegex.test(fecha_fin)) {
        useFilter = true;
        // Start of date range (Ecuador timezone 00:00:00 is 05:00:00 UTC)
        filterStart = `${fecha_inicio}T05:00:00.000Z`;
        // End of date range: we calculate 04:59:59.999 UTC of the day after fecha_fin
        const nextDay = new Date(new Date(fecha_fin).getTime() + 24 * 60 * 60 * 1000);
        const nextDayStr = nextDay.toISOString().split('T')[0];
        filterEnd = `${nextDayStr}T04:59:59.999Z`;
      }
    }

    const now = new Date();
    const dayRange = getEcuadorDayRange(now);
    const weekRange = getEcuadorWeekRange(now);
    const monthRange = getEcuadorMonthRange(now);

    const kpiStart = useFilter ? filterStart : dayRange.start;
    const kpiEnd = useFilter ? filterEnd : dayRange.end;

    // 1. Almuerzos en el periodo (id_estado = 2, id_categoria = 1)
    const { data: ordersKpi, error: errKpi } = await adminClient
      .from('ordenes')
      .select(`
        id_orden, created_at, id_estado,
        detalle_orden(cantidad, productos(id_categoria, nombre_producto))
      `)
      .eq('id_estado', 2)
      .gte('created_at', kpiStart)
      .lte('created_at', kpiEnd);

    if (errKpi) throw errKpi;

    let lunchesPeriod = 0;
    ordersKpi.forEach(o => {
      o.detalle_orden?.forEach(d => {
        if (d.productos?.id_categoria === 1) {
          lunchesPeriod += d.cantidad;
        }
      });
    });

    // 2. Almuerzos del Mes (o ingresos si hay filtro)
    let secondaryKpiValue = 0;
    let secondaryKpiTitle = 'Almuerzos del Mes';
    let secondaryKpiDesc = 'Total acumulado mensual';

    if (useFilter) {
      secondaryKpiTitle = 'Ingresos por Almuerzos';
      secondaryKpiDesc = 'Ventas del periodo filtrado';
      
      ordersKpi.forEach(o => {
        o.detalle_orden?.forEach(d => {
          if (d.productos?.id_categoria === 1) {
            secondaryKpiValue += d.cantidad * parseFloat(d.precio_aplicado || 0);
          }
        });
      });
      secondaryKpiValue = parseFloat(secondaryKpiValue.toFixed(2));
    } else {
      const { data: ordersMonth, error: errMonth } = await adminClient
        .from('ordenes')
        .select(`
          id_orden, created_at, id_estado,
          detalle_orden(cantidad, productos(id_categoria))
        `)
        .eq('id_estado', 2)
        .gte('created_at', monthRange.start)
        .lte('created_at', monthRange.end);

      if (errMonth) throw errMonth;

      ordersMonth.forEach(o => {
        o.detalle_orden?.forEach(d => {
          if (d.productos?.id_categoria === 1) {
            secondaryKpiValue += d.cantidad;
          }
        });
      });
    }

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
      .select(`
        id_orden, created_at, id_estado,
        detalle_orden(cantidad, productos(id_categoria))
      `)
      .eq('id_estado', 2)
      .gte('created_at', chartStart)
      .lte('created_at', chartEnd);

    if (errChart) throw errChart;

    let consumosPorDia = [];
    if (useFilter) {
      const dateMap = {};
      const startD = new Date(fecha_inicio);
      const endD = new Date(fecha_fin);
      
      // Inicializar el mapa de fechas
      for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const [, m, dayVal] = dateStr.split('-');
        dateMap[`${dayVal}/${m}`] = 0;
      }

      ordersChart.forEach(o => {
        const localDateStr = getEcuadorDayRange(new Date(o.created_at)).dateStr;
        const [, m, dayVal] = localDateStr.split('-');
        const shortDate = `${dayVal}/${m}`;
        o.detalle_orden?.forEach(d => {
          if (d.productos?.id_categoria === 1) {
            if (dateMap[shortDate] !== undefined) {
              dateMap[shortDate] += d.cantidad;
            }
          }
        });
      });

      consumosPorDia = Object.keys(dateMap).map(name => ({
        name,
        value: dateMap[name]
      }));
    } else {
      const weekMap = { 'Lun': 0, 'Mar': 0, 'Mié': 0, 'Jue': 0, 'Vie': 0, 'Sáb': 0, 'Dom': 0 };
      ordersChart.forEach(o => {
        const dayName = getLocalDayName(o.created_at);
        o.detalle_orden?.forEach(d => {
          if (d.productos?.id_categoria === 1) {
            if (weekMap[dayName] !== undefined) {
              weekMap[dayName] += d.cantidad;
            }
          }
        });
      });

      consumosPorDia = Object.keys(weekMap).map(name => ({
        name,
        value: weekMap[name]
      }));
    }

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
        detalle_orden(cantidad, productos(id_categoria))
      `)
      .eq('id_estado', 2)
      .gte('created_at', convenioStart)
      .lte('created_at', convenioEnd);

    if (errConvChart) throw errConvChart;

    const convenioMap = {};
    ordersConvenio.forEach(o => {
      const convenio = o.clientes?.clientes_convenios?.[0]?.convenios?.nombre_empresa || 'Clientes';
      o.detalle_orden?.forEach(d => {
        if (d.productos?.id_categoria === 1) {
          convenioMap[convenio] = (convenioMap[convenio] || 0) + d.cantidad;
        }
      });
    });

    const consumosPorConvenio = Object.keys(convenioMap).map(name => ({
      name,
      value: convenioMap[name]
    }));

    // 7. Actividad Reciente (Últimos 5 consumos registrados)
    const { data: recentOrders, error: errRecent } = await adminClient
      .from('ordenes')
      .select(`
        id_orden, created_at, id_estado, metodo_pago,
        clientes(nombre, apellido),
        estados_orden(nombre_estado),
        detalle_orden(cantidad, productos(nombre_producto))
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (errRecent) throw errRecent;

    const actividadReciente = (recentOrders || []).map(o => {
      const desc = o.detalle_orden?.map(d => `${d.cantidad}x ${d.productos?.nombre_producto}`).join(', ') || 'Sin detalles';
      return {
        id: o.id_orden,
        fecha: o.created_at,
        cliente: o.clientes ? `${o.clientes.nombre} ${o.clientes.apellido}` : 'Cliente Desconocido',
        descripcion: desc,
        metodo_pago: o.metodo_pago || 'N/A',
        estado: o.estados_orden?.nombre_estado || 'Desconocido'
      };
    });

    // 8. Productos Más Vendidos (Top 4 en el periodo filtrado o mes por defecto)
    const productCounts = {};
    ordersKpi.forEach(o => {
      o.detalle_orden?.forEach(d => {
        const name = d.productos?.nombre_producto || 'Desconocido';
        productCounts[name] = (productCounts[name] || 0) + d.cantidad;
      });
    });

    const topProducts = Object.keys(productCounts)
      .map(name => ({ name, value: productCounts[name] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);

    res.json({
      metrics: {
        almuerzosHoy: lunchesPeriod,
        almuerzosHoyTitle: useFilter ? 'Almuerzos Periodo' : 'Almuerzos Hoy',
        almuerzosHoyDesc: useFilter ? 'Consumidos en periodo filtrado' : 'Consumidos el día de hoy',
        almuerzosMes: secondaryKpiValue,
        almuerzosMesTitle: secondaryKpiTitle,
        almuerzosMesDesc: secondaryKpiDesc,
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

router.use(validateDates);

// 1. REPORTE GENERAL DE VENTAS (INGRESOS)
router.get('/ventas', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { fecha_inicio, fecha_fin } = req.query;

    let query = adminClient
      .from('ordenes')
      .select(`
        id_orden, id_estado, metodo_pago, created_at,
        detalle_orden ( cantidad, precio_aplicado )
      `);

    if (fecha_inicio) query = query.gte('created_at', fecha_inicio);
    if (fecha_fin) query = query.lte('created_at', fecha_fin + 'T23:59:59.999Z');

    const { data: ordenes, error } = await query;
    if (error) throw error;

    // Solo tomamos en cuenta consumidos (id_estado = 2) para ingresos reales
    const consumidos = ordenes.filter(o => o.id_estado === 2);

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

      let platos = 0;
      let dinero = 0;

      orden.detalle_orden.forEach(det => {
        platos += det.cantidad;
        dinero += det.cantidad * det.precio_aplicado;
      });

      resumen[key].cantidad += platos;
      resumen[key].total += dinero;
    });

    const resultadoArray = Object.keys(resumen).map(k => ({
      metodo_pago: k.charAt(0).toUpperCase() + k.slice(1),
      cantidadAlmuerzos: resumen[k].cantidad,
      totalConsumo: resumen[k].total
    })).filter(r => r.cantidadAlmuerzos > 0);

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
        id_orden, created_at, id_estado, metodo_pago,
        clientes ( nombre, apellido ),
        estados_orden ( nombre_estado ),
        detalle_orden ( cantidad, precio_aplicado, productos(nombre_producto) )
      `);

    if (fecha_inicio) query = query.gte('created_at', fecha_inicio);
    if (fecha_fin) query = query.lte('created_at', fecha_fin + 'T23:59:59.999Z');
    if (id_estado && id_estado !== 'all') query = query.eq('id_estado', id_estado);

    query = query.order('created_at', { ascending: false });

    const { data: ordenes, error } = await query;
    if (error) throw error;

    const reporteFormateado = ordenes.map(o => {
      const cantidadTotal = o.detalle_orden.reduce((sum, d) => sum + d.cantidad, 0);
      const montoTotal = o.detalle_orden.reduce((sum, d) => sum + (d.cantidad * d.precio_aplicado), 0);
      const descripciones = o.detalle_orden.map(d => `${d.cantidad}x ${d.productos?.nombre_producto}`).join(', ');

      return {
        id: o.id_orden,
        fecha: o.created_at,
        cliente: o.clientes ? `${o.clientes.nombre} ${o.clientes.apellido}` : 'Desconocido',
        estado: o.estados_orden?.nombre_estado || 'Desconocido',
        metodo_pago: o.metodo_pago || 'N/A',
        descripcion: descripciones,
        cantidadAlmuerzos: cantidadTotal,
        totalConsumo: montoTotal
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
        id_estado, created_at,
        detalle_orden ( cantidad, precio_aplicado, productos(nombre_producto, categorias_productos(nombre_categoria)) )
      `);

    if (fecha_inicio) query = query.gte('created_at', fecha_inicio);
    if (fecha_fin) query = query.lte('created_at', fecha_fin + 'T23:59:59.999Z');

    const { data: ordenes, error } = await query;
    if (error) throw error;

    // Solo contabilizar los consumidos
    const consumidos = ordenes.filter(o => o.id_estado === 2);

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
        id_orden, created_at, id_estado, metodo_pago,
        estados_orden ( nombre_estado ),
        detalle_orden ( cantidad, precio_aplicado, productos(nombre_producto) )
      `)
      .eq('id_cliente', id_cliente);

    if (fecha_inicio) query = query.gte('created_at', fecha_inicio);
    if (fecha_fin) query = query.lte('created_at', fecha_fin + 'T23:59:59.999Z');

    query = query.order('created_at', { ascending: false });

    const { data: ordenes, error } = await query;
    if (error) throw error;

    const reporteFormateado = ordenes.map(o => {
      const cantidadTotal = o.detalle_orden.reduce((sum, d) => sum + d.cantidad, 0);
      const montoTotal = o.detalle_orden.reduce((sum, d) => sum + (d.cantidad * d.precio_aplicado), 0);
      const descripciones = o.detalle_orden.map(d => `${d.cantidad}x ${d.productos?.nombre_producto}`).join(', ');

      return {
        id: o.id_orden,
        fecha: o.created_at,
        estado: o.estados_orden?.nombre_estado || 'Desconocido',
        metodo_pago: o.metodo_pago || 'N/A',
        descripcion: descripciones,
        cantidadAlmuerzos: cantidadTotal,
        totalConsumo: montoTotal,
        convenio: convenioNombre
      };
    });

    res.json(reporteFormateado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
