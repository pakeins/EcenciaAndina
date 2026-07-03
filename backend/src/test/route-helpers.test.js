import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

let clientesPrivate;
let conveniosPrivate;
let ordenesPrivate;
let reportesPrivate;

// Stub minimo de Supabase por tabla: single/list configurables y log de escrituras.
const makeAdminClient = (tables = {}, log = []) => ({
  from(table) {
    const conf = tables[table] || {};
    const q = {
      _write: false,
      select() { return q; },
      eq() { return q; },
      neq() { return q; },
      gte() { return q; },
      lte() { return q; },
      in() { return q; },
      order() { return q; },
      limit() { return q; },
      insert(payload) { log.push({ table, op: 'insert', payload }); q._write = true; return q; },
      update(payload) { log.push({ table, op: 'update', payload }); q._write = true; return q; },
      delete() { log.push({ table, op: 'delete' }); q._write = true; return q; },
      single() { return Promise.resolve(conf.single || { data: null, error: null }); },
      maybeSingle() { return Promise.resolve(conf.single || { data: null, error: null }); },
      then(resolve, reject) {
        const result = q._write ? { error: null } : (conf.list || { data: [], error: null });
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return q;
  },
});

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  process.env.CONVENIOS_UPLOAD_DIR = join(tmpdir(), 'eciencia-test-convenios');

  clientesPrivate = require('../routes/clientes.js')._private;
  conveniosPrivate = require('../routes/convenios.js')._private;
  ordenesPrivate = require('../routes/ordenes.js')._private;
  reportesPrivate = require('../routes/reportes.js')._private;
});

describe('clientes: helpers extraidos', () => {
  it('buildClienteUpdate mapea solo los campos presentes', () => {
    const full = clientesPrivate.buildClienteUpdate(
      { activo: true, cedula: '1712345675', nombre: 'Ana', apellido: 'Lopez', email: 'a@b.co', telefono: '', id_tipo_cliente: '2' },
      'user-1',
    );
    expect(full).toEqual({
      updated_by: 'user-1',
      esta_activo: true,
      cedula: '1712345675',
      nombre: 'Ana',
      apellido: 'Lopez',
      email: 'a@b.co',
      telefono: null,
      id_tipo_cliente: 2,
    });

    expect(clientesPrivate.buildClienteUpdate({}, 'user-2')).toEqual({ updated_by: 'user-2' });
  });

  it('validateClientContactAndConvenio rechaza telefono y correo duplicados de clientes activos', async () => {
    const dupClient = makeAdminClient({ clientes: { list: { data: [{ id_cliente: 'x', esta_activo: true }], error: null } } });

    const phoneError = await clientesPrivate.validateClientContactAndConvenio(dupClient, { telefono: '0999999999' });
    expect(phoneError).toMatch(/telefono ya esta registrado/);

    const emailError = await clientesPrivate.validateClientContactAndConvenio(dupClient, { email: 'dup@x.co' });
    expect(emailError).toMatch(/correo ya esta registrado/);
  });

  it('validateClientContactAndConvenio valida el convenio solo para clientes de convenio', async () => {
    const vigente = makeAdminClient({
      clientes: { list: { data: [], error: null } },
      convenios: { single: { data: { id_convenio: 'c1', esta_activo: true, fecha_caducidad: '2099-01-01' }, error: null } },
    });
    expect(await clientesPrivate.validateClientContactAndConvenio(vigente, { tipoCliente: 2, idConvenio: 'c1' })).toBeNull();

    const vencido = makeAdminClient({
      clientes: { list: { data: [], error: null } },
      convenios: { single: { data: { id_convenio: 'c1', esta_activo: true, fecha_caducidad: '2000-01-01' }, error: null } },
    });
    expect(await clientesPrivate.validateClientContactAndConvenio(vencido, { tipoCliente: 2, idConvenio: 'c1' })).toMatch(/inactivo o vencido/);

    expect(await clientesPrivate.validateClientContactAndConvenio(vencido, { tipoCliente: 1, idConvenio: 'c1' })).toBeNull();
  });

  it('syncConvenioLink recrea, limpia o elimina el vinculo segun el tipo', async () => {
    const logConvenio = [];
    await clientesPrivate.syncConvenioLink(makeAdminClient({}, logConvenio), {
      id: 'cli-1', tipoCliente: 2, idConvenio: 'c1', userId: 'u1',
    });
    expect(logConvenio.map((w) => w.op)).toEqual(['delete', 'insert']);
    expect(logConvenio[1].payload[0]).toMatchObject({ id_cliente: 'cli-1', id_convenio: 'c1' });

    const logLimpiar = [];
    await clientesPrivate.syncConvenioLink(makeAdminClient({}, logLimpiar), {
      id: 'cli-1', tipoCliente: 2, idConvenio: '', userId: 'u1',
    });
    expect(logLimpiar.map((w) => w.op)).toEqual(['delete']);

    const logFrecuente = [];
    await clientesPrivate.syncConvenioLink(makeAdminClient({}, logFrecuente), {
      id: 'cli-1', tipoCliente: 1, idConvenio: null, userId: 'u1',
    });
    expect(logFrecuente.map((w) => w.op)).toEqual(['delete']);

    const logNada = [];
    await clientesPrivate.syncConvenioLink(makeAdminClient({}, logNada), {
      id: 'cli-1', tipoCliente: Number.NaN, idConvenio: null, userId: 'u1',
    });
    expect(logNada).toEqual([]);
  });
});

describe('convenios: helpers extraidos', () => {
  it('buildConvenioUpdate mapea solo los campos presentes', () => {
    const full = conveniosPrivate.buildConvenioUpdate({
      activo: false,
      ruc: '1790012345001',
      nombre_empresa: 'Acme',
      representante: 'Rep',
      telefono: '0999999999',
      email: 'c@acme.co',
      fecha_inicio: '2026-01-01',
      fecha_caducidad: '2026-12-31',
      cupo_maximo: 10,
      id_tipo_almuerzo: 9,
    }, 'user-1');

    expect(full).toMatchObject({ updated_by: 'user-1', esta_activo: false, ruc: '1790012345001', cupo_maximo: 10, id_tipo_almuerzo: 9 });
    expect(conveniosPrivate.buildConvenioUpdate({}, 'user-2')).toEqual({ updated_by: 'user-2' });
  });

  it('validateNewConvenioClient exige nombre, cedula y telefono validos', () => {
    expect(conveniosPrivate.validateNewConvenioClient({ nombre: 'Ana', apellido: 'Lopez', cedula: '1712345675' }).validName)
      .toEqual({ nombre: 'Ana', apellido: 'Lopez' });
    expect(conveniosPrivate.validateNewConvenioClient({ nombre: 'Ana', apellido: 'Lopez', cedula: '123' }).message)
      .toMatch(/10 digitos/);
    expect(conveniosPrivate.validateNewConvenioClient({ nombre: 'Ana', apellido: 'Lopez', cedula: '1712345675', telefono: 'abc' }).message)
      .toMatch(/telefono/);
    expect(conveniosPrivate.validateNewConvenioClient({ nombre: '1', apellido: 'Lopez', cedula: '1712345675' }).message)
      .toMatch(/Nombre/);
  });

  it('loadConvenioWithCupo valida existencia, vigencia y cupo', async () => {
    const notFound = makeAdminClient({ convenios: { single: { data: null, error: { message: 'x' } } } });
    expect(await conveniosPrivate.loadConvenioWithCupo(notFound, 'c1')).toMatchObject({ status: 404 });

    const vencido = makeAdminClient({
      convenios: { single: { data: { id_convenio: 'c1', esta_activo: false, fecha_caducidad: '2099-01-01', cupo_maximo: 5 }, error: null } },
    });
    expect(await conveniosPrivate.loadConvenioWithCupo(vencido, 'c1')).toMatchObject({ status: 400 });

    const lleno = makeAdminClient({
      convenios: {
        single: {
          data: { id_convenio: 'c1', esta_activo: true, fecha_caducidad: '2099-01-01', cupo_maximo: 2, clientes_convenios: [{ count: 2 }] },
          error: null,
        },
      },
    });
    expect((await conveniosPrivate.loadConvenioWithCupo(lleno, 'c1')).message).toMatch(/cupo máximo/);

    const ok = makeAdminClient({
      convenios: {
        single: {
          data: { id_convenio: 'c1', esta_activo: true, fecha_caducidad: '2099-01-01', cupo_maximo: 2, clientes_convenios: [{ count: 1 }] },
          error: null,
        },
      },
    });
    expect((await conveniosPrivate.loadConvenioWithCupo(ok, 'c1')).convenio).toMatchObject({ id_convenio: 'c1' });
  });

  it('archiveConvenioIfRenewed archiva el periodo solo cuando cambian las fechas', async () => {
    const sinFechas = [];
    const actualizacion1 = {};
    await conveniosPrivate.archiveConvenioIfRenewed(makeAdminClient({}, sinFechas), 'c1', {}, actualizacion1);
    expect(sinFechas).toEqual([]);
    expect(actualizacion1).toEqual({});

    const mismasFechas = [];
    const actualizacion2 = {};
    await conveniosPrivate.archiveConvenioIfRenewed(
      makeAdminClient({ convenios: { single: { data: { fecha_inicio: '2026-01-01', fecha_caducidad: '2026-12-31', archivo_firmado: 'f.pdf' }, error: null } } }, mismasFechas),
      'c1',
      { fecha_inicio: '2026-01-01', fecha_caducidad: '2026-12-31' },
      actualizacion2,
    );
    expect(mismasFechas.filter((w) => w.op === 'insert')).toEqual([]);
    expect(actualizacion2).toEqual({});

    const renovacion = [];
    const actualizacion3 = {};
    await conveniosPrivate.archiveConvenioIfRenewed(
      makeAdminClient({ convenios: { single: { data: { fecha_inicio: '2026-01-01', fecha_caducidad: '2026-12-31', archivo_firmado: 'f.pdf' }, error: null } } }, renovacion),
      'c1',
      { fecha_inicio: '2027-01-01', fecha_caducidad: '2027-12-31' },
      actualizacion3,
    );
    const historial = renovacion.find((w) => w.table === 'conveniohistorial' && w.op === 'insert');
    expect(historial.payload[0]).toMatchObject({ id_convenio: 'c1', archivo_firmado: 'f.pdf' });
    expect(actualizacion3.archivo_firmado).toBeNull();
  });
});

describe('ordenes: applyConsumptionPayment', () => {
  it('sin metodo especial no cobra nada', async () => {
    const log = [];
    const result = await ordenesPrivate.applyConsumptionPayment(
      makeAdminClient({}, log),
      { metodo_pago: 'Pendiente', id_cliente: 'cli-1' },
      4.5,
      'u1',
    );
    expect(result).toEqual({ montoAjustado: 0 });
    expect(log).toEqual([]);
  });

  it('convenio empresa exige convenio asociado y vigente', async () => {
    const sinConvenio = makeAdminClient({ clientes: { single: { data: { clientes_convenios: [] }, error: null } } });
    const noAsociado = await ordenesPrivate.applyConsumptionPayment(sinConvenio, { metodo_pago: 'Convenio Empresa', id_cliente: 'cli-1' }, 4.5, 'u1');
    expect(noAsociado.error).toMatch(/no cuenta con convenio/);

    const vigente = makeAdminClient({
      clientes: {
        single: { data: { clientes_convenios: [{ convenios: { esta_activo: true, fecha_caducidad: '2099-01-01' } }] }, error: null },
      },
    });
    expect(await ordenesPrivate.applyConsumptionPayment(vigente, { metodo_pago: 'Convenio Empresa', id_cliente: 'cli-1' }, 4.5, 'u1'))
      .toEqual({ montoAjustado: 0 });
  });

  it('saldo prepago valida el disponible y descuenta el total', async () => {
    const pobre = makeAdminClient({ monederos_cliente: { single: { data: { saldo_disponible: 2 }, error: null } } });
    const insuficiente = await ordenesPrivate.applyConsumptionPayment(pobre, { metodo_pago: 'Saldo Prepago', id_cliente: 'cli-1' }, 4.5, 'u1');
    expect(insuficiente.error).toMatch(/Saldo insuficiente/);

    const log = [];
    const rico = makeAdminClient({ monederos_cliente: { single: { data: { id_cliente: 'cli-1', saldo_disponible: 10 }, error: null } } }, log);
    const cobrado = await ordenesPrivate.applyConsumptionPayment(rico, { metodo_pago: 'Saldo Prepago', id_cliente: 'cli-1' }, 4.5, 'u1');
    expect(cobrado).toEqual({ montoAjustado: 4.5 });
    const walletWrite = log.find((w) => w.table === 'monederos_cliente' && w.op === 'update');
    expect(walletWrite.payload.saldo_disponible).toBe(5.5);
  });
});

describe('reportes: helpers extraidos', () => {
  const almuerzoDetalle = {
    cantidad: 2,
    precio_aplicado: 4.5,
    id_tipo_almuerzo: 9,
    productos: { id_categoria: 1, nombre_producto: 'Almuerzo del Dia' },
  };
  const order = { id_orden: 'o1', created_at: '2026-07-02T15:00:00Z', id_estado: 2, detalle_orden: [almuerzoDetalle] };

  it('resolveDashboardFilter valida fechas y arma el rango en UTC de Ecuador', () => {
    expect(reportesPrivate.resolveDashboardFilter({})).toEqual({ useFilter: false });
    expect(reportesPrivate.resolveDashboardFilter({ fecha_inicio: 'ayer', fecha_fin: '2026-07-02' })).toEqual({ useFilter: false });
    expect(reportesPrivate.resolveDashboardFilter({ fecha_inicio: '2026-07-01', fecha_fin: '2026-07-02' })).toEqual({
      useFilter: true,
      filterStart: '2026-07-01T05:00:00.000Z',
      filterEnd: '2026-07-03T04:59:59.999Z',
    });
  });

  it('sumKpiSummaries acumula los contadores de paquetes', () => {
    const summary = reportesPrivate.sumKpiSummaries([order, order]);
    expect(summary.almuerzosPrincipales).toBe(4);
    expect(summary.almuerzoDia).toBe(4);
    expect(summary.totalConsumo).toBe(18);
  });

  it('buildConsumosPorSemana agrupa por dia local de Ecuador', () => {
    const consumos = reportesPrivate.buildConsumosPorSemana([order]);
    expect(consumos.find((c) => c.name === 'Jue').value).toBe(2);
    expect(consumos.find((c) => c.name === 'Lun').value).toBe(0);
  });

  it('buildConsumosPorDiaFiltrado inicializa el rango y suma por fecha local', () => {
    const consumos = reportesPrivate.buildConsumosPorDiaFiltrado([order], '2026-07-01', '2026-07-02');
    expect(consumos).toEqual([
      { name: '01/07', value: 0 },
      { name: '02/07', value: 2 },
    ]);
  });

  it('buildConsumosPorConvenio agrupa por empresa con fallback Clientes', () => {
    const conConvenio = {
      ...order,
      clientes: { clientes_convenios: [{ convenios: { nombre_empresa: 'Acme' } }] },
    };
    const consumos = reportesPrivate.buildConsumosPorConvenio([conConvenio, order]);
    expect(consumos).toContainEqual({ name: 'Acme', value: 2 });
    expect(consumos).toContainEqual({ name: 'Clientes', value: 2 });
  });

  it('buildActividadReciente formatea cliente, descripcion y estado', () => {
    const actividad = reportesPrivate.buildActividadReciente([
      {
        ...order,
        metodo_pago: 'Pendiente',
        clientes: { nombre: 'Ana', apellido: 'Lopez' },
        estados_orden: { nombre_estado: 'Consumido' },
      },
      { id_orden: 'o2', created_at: order.created_at, detalle_orden: [] },
    ]);
    expect(actividad[0]).toMatchObject({ cliente: 'Ana Lopez', estado: 'Consumido', metodo_pago: 'Pendiente' });
    expect(actividad[0].descripcion).toContain('Almuerzo del Dia');
    expect(actividad[1]).toMatchObject({ cliente: 'Cliente Desconocido', descripcion: 'Sin detalles', metodo_pago: 'N/A' });
  });

  it('buildTopProducts devuelve el top 4 por cantidad', () => {
    const orders = ['A', 'B', 'C', 'D', 'E'].map((name, index) => ({
      detalle_orden: [{ cantidad: index + 1, productos: { nombre_producto: name } }],
    }));
    const top = reportesPrivate.buildTopProducts(orders);
    expect(top).toHaveLength(4);
    expect(top[0]).toEqual({ name: 'E', value: 5 });
  });

  it('fetchMonthlyLunchCount suma los almuerzos principales del mes', async () => {
    const adminClient = makeAdminClient({ ordenes: { list: { data: [order, order], error: null } } });
    expect(await reportesPrivate.fetchMonthlyLunchCount(adminClient, { start: 'x', end: 'y' })).toBe(4);
  });
});
