const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const {
  CLIENT_TYPE,
  ORDER_SOURCE,
  ORDER_STATE,
  ROLE,
} = require('../src/constants/domain');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const CANONICAL_PROJECT_REF = 'lkffhdcavohaxdihvwlb';
const PRESERVED_USERNAMES = new Set(['admin', 'cajero']);

const required = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const supabaseUrl = required('SUPABASE_URL');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
if (projectRef !== CANONICAL_PROJECT_REF) {
  throw new Error(`Refusing to sanitize Supabase project ${projectRef}.`);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const deterministicUuid = (scope, index) => {
  const bytes = crypto.createHash('sha256').update(`${scope}:${index}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('593')) return digits;
  if (digits.length === 10 && digits.startsWith('0')) return `593${digits.slice(1)}`;
  return digits;
};

const buildCedula = (seed) => {
  const province = String((seed % 24) + 1).padStart(2, '0');
  const body = `${province}${seed % 6}${String(100000 + seed).slice(-6)}`;
  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const sum = coefficients.reduce((total, coefficient, index) => {
    let product = Number(body[index]) * coefficient;
    if (product >= 10) product -= 9;
    return total + product;
  }, 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
};

const dateInBogota = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const addDays = (dateString, amount) => {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

const assertResult = (result, context) => {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data || [];
};

const deleteAll = async (table, primaryKey) => {
  assertResult(
    await supabase.from(table).delete().not(primaryKey, 'is', null),
    `Could not clear ${table}`,
  );
};

const deleteAllTextKey = async (table, primaryKey) => {
  assertResult(
    await supabase.from(table).delete().not(primaryKey, 'is', null),
    `Could not clear ${table}`,
  );
};

const upsertCatalogs = async () => {
  const catalogs = [
    ['roles', 'id_rol', [
      { id_rol: ROLE.ADMIN, nombre_rol: 'Super Admin' },
      { id_rol: ROLE.CASHIER, nombre_rol: 'Empleado' },
    ]],
    ['tipos_cliente', 'id_tipo_cliente', [
      { id_tipo_cliente: CLIENT_TYPE.DIRECT, nombre_tipo: 'Cliente frecuente' },
      { id_tipo_cliente: CLIENT_TYPE.AGREEMENT, nombre_tipo: 'Cliente de convenio' },
    ]],
    ['estados_orden', 'id_estado', [
      { id_estado: ORDER_STATE.RESERVED, nombre_estado: 'Reservado' },
      { id_estado: ORDER_STATE.CONSUMED, nombre_estado: 'Consumido' },
      { id_estado: ORDER_STATE.CANCELLED, nombre_estado: 'Cancelado' },
    ]],
    ['origenes_pedido', 'id_origen', [
      { id_origen: ORDER_SOURCE.TELEGRAM, nombre_origen: 'Telegram' },
      { id_origen: ORDER_SOURCE.SYSTEM, nombre_origen: 'Sistema' },
    ]],
    ['categorias_productos', 'id_categoria', [
      { id_categoria: 1, nombre_categoria: 'Almuerzos' },
      { id_categoria: 2, nombre_categoria: 'Restaurante' },
      { id_categoria: 3, nombre_categoria: 'Tienda' },
    ]],
    ['categorias_menu', 'id_categoria_menu', [
      { id_categoria_menu: 1, nombre_categoria: 'Sopa', codigo: 'sopas' },
      { id_categoria_menu: 2, nombre_categoria: 'Plato fuerte', codigo: 'segundos' },
      { id_categoria_menu: 3, nombre_categoria: 'Guarnicion', codigo: 'guarniciones' },
    ]],
  ];

  for (const [table, conflict, rows] of catalogs) {
    assertResult(await supabase.from(table).upsert(rows, { onConflict: conflict }), `Could not seed ${table}`);
  }
};

const seedProductsAndMenu = async (adminId) => {
  const products = [
    { id_producto: 1, id_categoria: 1, nombre_producto: 'Almuerzo', precio_unitario: 4.5, descripcion: 'Almuerzo completo del dia', esta_activo: true },
    { id_producto: 2, id_categoria: 1, nombre_producto: 'Almuerzo Telegram', precio_unitario: 4.5, descripcion: 'Almuerzo reservado mediante Telegram', esta_activo: true },
    { id_producto: 3, id_categoria: 2, nombre_producto: 'Jugo natural', precio_unitario: 1.5, descripcion: 'Jugo natural de temporada', esta_activo: true },
    { id_producto: 4, id_categoria: 2, nombre_producto: 'Postre de la casa', precio_unitario: 2, descripcion: 'Postre artesanal', esta_activo: true },
    { id_producto: 5, id_categoria: 3, nombre_producto: 'Agua mineral 500ml', precio_unitario: 1, descripcion: 'Botella personal', esta_activo: true },
    { id_producto: 6, id_categoria: 3, nombre_producto: 'Cafe organico', precio_unitario: 1.75, descripcion: 'Cafe caliente', esta_activo: true },
  ].map((product) => ({ ...product, created_by: adminId, updated_by: adminId }));
  assertResult(await supabase.from('productos').insert(products), 'Could not seed products');

  const foods = [
    [1, 1, 'Sopa de quinoa'],
    [2, 1, 'Crema de zapallo'],
    [3, 2, 'Pollo al horno con hierbas'],
    [4, 2, 'Llapingacho con ensalada'],
    [5, 2, 'Menestra de lenteja'],
    [6, 3, 'Mote pillo'],
    [7, 3, 'Pure de papa'],
  ].map(([id_alimento, id_categoria_menu, nombre_alimento]) => ({
    id_alimento,
    id_categoria_menu,
    nombre_alimento,
    created_by: adminId,
    updated_by: adminId,
  }));
  assertResult(await supabase.from('alimentos').insert(foods), 'Could not seed foods');

  const today = dateInBogota();
  const menuRows = [];
  for (let day = 0; day < 7; day += 1) {
    const fecha = addDays(today, day);
    for (const idAlimento of [1, 3 + (day % 3), 6 + (day % 2)]) {
      menuRows.push({
        id_menu_diario: deterministicUuid('menu', `${fecha}:${idAlimento}`),
        fecha,
        id_alimento: idAlimento,
        created_by: adminId,
      });
    }
  }
  assertResult(await supabase.from('menu_diario').insert(menuRows), 'Could not seed daily menu');
  assertResult(
    await supabase.from('menu_settings').upsert({
      id: 1,
      active_date: today,
      image_retention_days: 14,
      updated_by: adminId,
    }),
    'Could not seed menu settings',
  );
};

const seedBusinessHistory = async ({ adminId, cashierId, telegramClientId }) => {
  const convenioRows = [
    ['Corporacion Favorita', 101, 25],
    ['Banco Pichincha', 102, 30],
    ['Pronaca', 103, 20],
  ].map(([name, seed, capacity], index) => {
    const cedula = buildCedula(seed);
    return {
      id_convenio: deterministicUuid('convenio', index),
      ruc: `${cedula}001`,
      nombre_empresa: name,
      representante: `Representante Simulado ${index + 1}`,
      telefono: `5939900001${index}`,
      email: `convenio${index + 1}@empresas.example`,
      fecha_inicio: addDays(dateInBogota(), -180),
      fecha_caducidad: addDays(dateInBogota(), 180),
      esta_activo: true,
      cupo_maximo: capacity,
      created_by: adminId,
      updated_by: adminId,
    };
  });
  assertResult(await supabase.from('convenios').insert(convenioRows), 'Could not seed agreements');

  const directClients = [
    {
      id_cliente: telegramClientId,
      id_tipo_cliente: CLIENT_TYPE.DIRECT,
      cedula: buildCedula(200),
      nombre: 'Cliente',
      apellido: 'Telegram Demo',
      correo: 'telegram.demo@clientes.example',
      esta_activo: true,
      updated_by: adminId,
    },
    ...Array.from({ length: 4 }, (_, index) => ({
      id_cliente: deterministicUuid('direct-client', index),
      id_tipo_cliente: CLIENT_TYPE.DIRECT,
      cedula: buildCedula(210 + index),
      nombre: `Cliente Demo ${index + 1}`,
      apellido: 'Frecuente',
      telefono: `5939800001${index}`,
      correo: `frecuente${index + 1}@clientes.example`,
      esta_activo: true,
      created_by: adminId,
      updated_by: adminId,
    })),
  ];

  const preservedUpdate = directClients.shift();
  assertResult(
    await supabase.from('clientes').update(preservedUpdate).eq('id_cliente', telegramClientId),
    'Could not anonymize Telegram client',
  );
  assertResult(await supabase.from('clientes').insert(directClients), 'Could not seed direct clients');

  const agreementClients = Array.from({ length: 9 }, (_, index) => ({
    id_cliente: deterministicUuid('agreement-client', index),
    id_tipo_cliente: CLIENT_TYPE.AGREEMENT,
    cedula: buildCedula(300 + index),
    nombre: `Colaborador Demo ${index + 1}`,
    apellido: `Convenio ${Math.floor(index / 3) + 1}`,
    telefono: `5939700001${String(index).padStart(2, '0')}`,
    correo: `colaborador${index + 1}@empresas.example`,
    esta_activo: true,
    created_by: adminId,
    updated_by: adminId,
  }));
  assertResult(await supabase.from('clientes').insert(agreementClients), 'Could not seed agreement clients');

  const links = agreementClients.map((client, index) => ({
    id_cliente: client.id_cliente,
    id_convenio: convenioRows[Math.floor(index / 3)].id_convenio,
    created_by: adminId,
  }));
  assertResult(await supabase.from('clientes_convenios').insert(links), 'Could not link agreement clients');

  const allClients = [...directClients, preservedUpdate, ...agreementClients];
  const orders = [];
  const details = [];
  const today = dateInBogota();
  let sequence = 0;

  for (let dayOffset = -89; dayOffset <= 0; dayOffset += 1) {
    const date = addDays(today, dayOffset);
    const dailyOrders = 4 + (Math.abs(dayOffset) % 4);
    for (let dailyIndex = 0; dailyIndex < dailyOrders; dailyIndex += 1) {
      const client = allClients[(sequence * 3 + dailyIndex) % allClients.length];
      const stateCycle = sequence % 10;
      const idEstado = stateCycle === 0
        ? ORDER_STATE.CANCELLED
        : stateCycle === 1
          ? ORDER_STATE.RESERVED
          : ORDER_STATE.CONSUMED;
      const telegramOrder = client.id_cliente === telegramClientId && sequence % 6 === 0;
      const orderId = deterministicUuid('order', `${date}:${dailyIndex}`);
      const createdAt = new Date(`${date}T${String(10 + (dailyIndex % 8)).padStart(2, '0')}:15:00-05:00`).toISOString();
      const consumedAt = idEstado === ORDER_STATE.CONSUMED
        ? new Date(new Date(createdAt).getTime() + (45 + (dailyIndex % 4) * 20) * 60 * 1000).toISOString()
        : null;
      const isAgreement = client.id_tipo_cliente === CLIENT_TYPE.AGREEMENT;

      orders.push({
        id_orden: orderId,
        id_cliente: client.id_cliente,
        id_estado: idEstado,
        id_origen: telegramOrder ? ORDER_SOURCE.TELEGRAM : ORDER_SOURCE.SYSTEM,
        id_empleado_atiende: idEstado === ORDER_STATE.CONSUMED ? cashierId : null,
        canal_origen: telegramOrder ? 'Telegram' : 'Sistema',
        metodo_pago: isAgreement ? 'Convenio Empresa' : 'Saldo Prepago',
        observaciones: `Datos demo ${date}`,
        created_at: createdAt,
        consumed_at: consumedAt,
        created_by: telegramOrder ? null : cashierId,
        updated_at: consumedAt || createdAt,
        updated_by: telegramOrder ? null : cashierId,
      });

      const lunchProduct = telegramOrder ? 2 : 1;
      details.push({
        id_detalle: deterministicUuid('detail-lunch', `${date}:${dailyIndex}`),
        id_orden: orderId,
        id_producto: lunchProduct,
        cantidad: 1 + (sequence % 3 === 0 ? 1 : 0),
        precio_aplicado: 4.5,
        opciones: { sopa: 'Sopa de quinoa', segundo: 'Pollo al horno', guarnicion: 'Mote pillo' },
        created_by: telegramOrder ? null : cashierId,
        updated_by: telegramOrder ? null : cashierId,
      });
      if (sequence % 3 === 0) {
        const extraProduct = 3 + (sequence % 4);
        const prices = { 3: 1.5, 4: 2, 5: 1, 6: 1.75 };
        details.push({
          id_detalle: deterministicUuid('detail-extra', `${date}:${dailyIndex}`),
          id_orden: orderId,
          id_producto: extraProduct,
          cantidad: 1,
          precio_aplicado: prices[extraProduct],
          opciones: {},
          created_by: telegramOrder ? null : cashierId,
          updated_by: telegramOrder ? null : cashierId,
        });
      }
      sequence += 1;
    }
  }

  for (let index = 0; index < orders.length; index += 100) {
    assertResult(await supabase.from('ordenes').insert(orders.slice(index, index + 100)), 'Could not seed orders');
  }
  for (let index = 0; index < details.length; index += 100) {
    assertResult(await supabase.from('detalle_orden').insert(details.slice(index, index + 100)), 'Could not seed order details');
  }

  const walletRows = allClients
    .filter((client) => client.id_tipo_cliente === CLIENT_TYPE.DIRECT)
    .map((client, index) => ({
      id_cliente: client.id_cliente,
      id_producto: 1,
      cantidad_disponible: 10 + index,
      updated_by: cashierId,
    }));
  assertResult(await supabase.from('saldos_servicio').insert(walletRows), 'Could not seed wallet balances');

  const rechargeRows = walletRows.map((wallet, index) => ({
    id_recarga: deterministicUuid('recharge', index),
    id_cliente: wallet.id_cliente,
    id_producto: 1,
    cantidad_comprada: 20,
    monto_total: 90,
    numero_factura: `DEMO-${String(index + 1).padStart(4, '0')}`,
    created_at: new Date(`${addDays(today, -45 + index)}T09:00:00-05:00`).toISOString(),
    created_by: cashierId,
    updated_by: cashierId,
  }));
  assertResult(await supabase.from('recargas_saldo').insert(rechargeRows), 'Could not seed wallet recharges');
};

const main = async () => {
  const employees = assertResult(
    await supabase.from('empleados').select('id,nombre_usuario,correo'),
    'Could not load employees',
  );
  const preserved = employees.filter((employee) =>
    PRESERVED_USERNAMES.has(String(employee.nombre_usuario || '').toLowerCase()),
  );
  const admin = preserved.find((employee) => employee.nombre_usuario.toLowerCase() === 'admin');
  const cashier = preserved.find((employee) => employee.nombre_usuario.toLowerCase() === 'cajero');
  if (!admin || !cashier) throw new Error('The Admin and cajero accounts must exist before sanitizing.');

  const subscriptions = assertResult(
    await supabase
      .from('telegram_subscriptions')
      .select('id,id_cliente,phone_normalized,chat_id,consent_status,is_active')
      .eq('consent_status', 'accepted')
      .eq('is_active', true)
      .not('id_cliente', 'is', null)
      .limit(1),
    'Could not load Telegram subscription',
  );
  const subscription = subscriptions[0];
  if (!subscription?.id_cliente) throw new Error('An accepted Telegram test subscription is required.');

  await deleteAll('telegram_order_traces', 'id');
  await deleteAllTextKey('telegram_bot_state', 'key');
  await deleteAll('detalle_orden', 'id_detalle');
  await deleteAll('ordenes', 'id_orden');
  await deleteAll('recargas_saldo', 'id_recarga');
  assertResult(await supabase.from('saldos_servicio').delete().not('id_cliente', 'is', null), 'Could not clear balances');
  assertResult(await supabase.from('clientes_convenios').delete().not('id_cliente', 'is', null), 'Could not clear client links');
  await deleteAll('conveniohistorial', 'id');
  await deleteAll('convenios', 'id_convenio');
  await deleteAll('menu_diario', 'id_menu_diario');

  assertResult(
    await supabase.from('clientes').delete().neq('id_cliente', subscription.id_cliente),
    'Could not clear clients',
  );

  await deleteAll('productos', 'id_producto');
  await deleteAll('alimentos', 'id_alimento');

  for (const employee of employees) {
    if (PRESERVED_USERNAMES.has(employee.nombre_usuario.toLowerCase())) continue;

    const employeeDeletion = await supabase.from('empleados').delete().eq('id', employee.id);
    if (employeeDeletion.error) {
      throw new Error(
        `Could not delete employee profile ${employee.nombre_usuario}: ${employeeDeletion.error.message}`,
      );
    }

    const deletion = await supabase.auth.admin.deleteUser(employee.id);
    if (deletion.error) throw new Error(`Could not delete Auth user ${employee.nombre_usuario}: ${deletion.error.message}`);
  }

  let page = 1;
  while (true) {
    const usersResult = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (usersResult.error) throw usersResult.error;
    for (const user of usersResult.data.users) {
      if (user.id === admin.id || user.id === cashier.id) continue;
      const deletion = await supabase.auth.admin.deleteUser(user.id);
      if (deletion.error) throw deletion.error;
    }
    if (usersResult.data.users.length < 100) break;
    page += 1;
  }

  const accountUpdates = [
    [admin, ROLE.ADMIN, 'Administrador', 'Pruebas', 'administrador'],
    [cashier, ROLE.CASHIER, 'Cajero', 'Pruebas', 'caja'],
  ];
  for (const [employee, roleId, firstName, lastName, appRole] of accountUpdates) {
    assertResult(
      await supabase.from('empleados').update({
        id_rol: roleId,
        nombre: firstName,
        apellido: lastName,
        esta_activo: true,
        updated_by: admin.id,
      }).eq('id', employee.id),
      `Could not sanitize ${employee.nombre_usuario}`,
    );
    const update = await supabase.auth.admin.updateUserById(employee.id, {
      app_metadata: { rol: appRole },
      user_metadata: {
        nombre: firstName,
        apellido: lastName,
        nombre_usuario: employee.nombre_usuario,
        esta_activo: true,
      },
    });
    if (update.error) throw update.error;
  }

  await upsertCatalogs();
  await seedProductsAndMenu(admin.id);
  await seedBusinessHistory({
    adminId: admin.id,
    cashierId: cashier.id,
    telegramClientId: subscription.id_cliente,
  });

  const normalizedTelegramPhone = normalizePhone(subscription.phone_normalized);
  assertResult(
    await supabase.from('telegram_subscriptions').update({
      phone_normalized: normalizedTelegramPhone,
      id_cliente: subscription.id_cliente,
      consent_status: 'accepted',
      is_active: true,
    }).eq('id', subscription.id),
    'Could not preserve Telegram subscription',
  );
  assertResult(
    await supabase.from('clientes').update({ telefono: normalizedTelegramPhone }).eq('id_cliente', subscription.id_cliente),
    'Could not preserve Telegram phone',
  );

  console.log(`Sanitized ${projectRef} and generated ${dateInBogota()}-relative demo data.`);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
