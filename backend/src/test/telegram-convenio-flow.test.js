/* eslint-disable no-unused-vars */
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
        tipos_almuerzo_permitidos: [8],
        ...overrides,
      },
    },
  ],
});

beforeAll(async () => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  
  delete require.cache[require.resolve('../routes/telegram.js')];
  const telegramRouter = (await import('../routes/telegram.js')).default;
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
  it('devuelve los tipos permitidos contratados del convenio activo', () => {
    const result = activeConvenio(clientWithConvenio(), TODAY);
    expect(result.id_convenio).toBe('conv-1');
    expect(result.nombre_empresa).toBe('Acme');
    expect(result.tipos_almuerzo_permitidos).toEqual([8]);
  });

  it('devuelve null en tipos_almuerzo_permitidos si el convenio no lo tiene configurado', () => {
    const result = activeConvenio(clientWithConvenio({ tipos_almuerzo_permitidos: null }), TODAY);
    expect(result.id_convenio).toBe('conv-1');
    expect(result.tipos_almuerzo_permitidos).toBeNull();
  });

  it('cliente frecuente (sin convenio) no tiene convenio ni tipo contratado', () => {
    const result = activeConvenio({ id_cliente: 2, clientes_convenios: [] }, TODAY);
    expect(result.id_convenio).toBeNull();
    expect(result.tipos_almuerzo_permitidos).toBeNull();
  });

  it('un convenio vencido se trata como cliente sin convenio', () => {
    const result = activeConvenio(clientWithConvenio({ fecha_caducidad: '2026-06-30' }), TODAY);
    expect(result.id_convenio).toBeNull();
    expect(result.tipos_almuerzo_permitidos).toBeNull();
  });


});
