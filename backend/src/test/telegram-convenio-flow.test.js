import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let activeConvenio;
let TELEGRAM_LUNCH_TYPE_BY_ID;
let buildComponentPlan;

const TODAY = '2026-07-01';

const clientWithConvenio = (overrides = {}) => ({
  id_cliente: 1,
  nombre: 'Ana',
  clientes_convenios: [
    {
      id_convenio: 'conv-1',
      convenios: {
        id_convenio: 'conv-1',
        nombre_empresa: 'Acme',
        esta_activo: true,
        fecha_caducidad: '2026-12-31',
        id_tipo_almuerzo: 8,
        ...overrides,
      },
    },
  ],
});

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  const telegramRouter = require('../routes/telegram.js');
  activeConvenio = telegramRouter._private.activeConvenio;
  TELEGRAM_LUNCH_TYPE_BY_ID = telegramRouter._private.TELEGRAM_LUNCH_TYPE_BY_ID;
  buildComponentPlan = telegramRouter._private.buildComponentPlan;
});

describe('buildComponentPlan (auto-seleccion, pasos y omision)', () => {
  const menu = {
    entradas: ['Bolon'],
    sopas: ['Locro', 'Crema'],
    segundos: ['Seco', 'Estofado'],
    postres: ['Flan'],
    bebidas: [],
  };

  it('autoselecciona 1 opcion, pide con botones >=2 y omite componentes vacios', () => {
    const plan = buildComponentPlan({ tipoAlmuerzo: { code: 'ejecutivo_completo' }, menu });
    // ejecutivo_completo: entrada, sopa, plato fuerte, postre, bebida
    expect(plan.opciones).toEqual({ entrada: 'Bolon', postre: 'Flan' });
    expect(plan.pendingSteps).toEqual(['sopa', 'plato fuerte']);
  });

  it('respeta los componentes del paquete (almuerzo_dia_simple = plato fuerte + bebida)', () => {
    const plan = buildComponentPlan({ tipoAlmuerzo: { code: 'almuerzo_dia_simple' }, menu });
    // solo plato fuerte (>=2 -> paso) ; bebida vacia -> omitida; sin entrada/sopa/postre
    expect(plan.opciones).toEqual({});
    expect(plan.pendingSteps).toEqual(['plato fuerte']);
  });

  it('almuerzo_dia con sopa unica autoselecciona la sopa', () => {
    const plan = buildComponentPlan({
      tipoAlmuerzo: { code: 'almuerzo_dia' },
      menu: { sopas: ['Locro'], segundos: ['Seco', 'Estofado'], bebidas: ['Jugo'] },
    });
    // almuerzo_dia: sopa, plato fuerte, bebida. sopa(1)->auto, plato(2)->paso, bebida(1)->auto
    expect(plan.opciones).toEqual({ sopa: 'Locro', bebida: 'Jugo' });
    expect(plan.pendingSteps).toEqual(['plato fuerte']);
  });
});

describe('activeConvenio (tipo contratado por empresa)', () => {
  it('devuelve el tipo de almuerzo contratado del convenio activo', () => {
    const result = activeConvenio(clientWithConvenio(), TODAY);
    expect(result.id_convenio).toBe('conv-1');
    expect(result.nombre_empresa).toBe('Acme');
    expect(result.id_tipo_almuerzo).toBe(8);
  });

  it('cae al tipo por defecto (9) si el convenio no tiene tipo contratado', () => {
    const result = activeConvenio(clientWithConvenio({ id_tipo_almuerzo: null }), TODAY);
    expect(result.id_convenio).toBe('conv-1');
    expect(result.id_tipo_almuerzo).toBe(9);
  });

  it('cliente frecuente (sin convenio) no tiene convenio ni tipo contratado', () => {
    const result = activeConvenio({ id_cliente: 2, clientes_convenios: [] }, TODAY);
    expect(result.id_convenio).toBeNull();
    expect(result.id_tipo_almuerzo).toBeNull();
  });

  it('un convenio vencido se trata como cliente sin convenio', () => {
    const result = activeConvenio(clientWithConvenio({ fecha_caducidad: '2026-06-30' }), TODAY);
    expect(result.id_convenio).toBeNull();
    expect(result.id_tipo_almuerzo).toBeNull();
  });

  it('el id contratado mapea a un paquete oficial de Telegram', () => {
    const contracted = activeConvenio(clientWithConvenio(), TODAY);
    const pkg = TELEGRAM_LUNCH_TYPE_BY_ID[contracted.id_tipo_almuerzo];
    expect(pkg).toBeTruthy();
    expect(pkg.id).toBe(8);
    expect(pkg.code).toBe('ejecutivo_simple');
  });
});
