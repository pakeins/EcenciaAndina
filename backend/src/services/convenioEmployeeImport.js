const { readXlsxRows } = require('./xlsxReader');
const { isConvenioVigente, validatePersonName } = require('./businessRules');
const { isValidCedula, normalizeEmail, normalizePhone, onlyDigits } = require('../validation/eciencia');
const { generateConvenioInvitation } = require('./convenioInvitations');

const CONVENIO_CLIENT_TYPE = 2;
const MAX_IMPORT_ROWS = 1000;

const HEADER_ALIASES = {
  cedula: ['cedula', 'cedula_ruc', 'documento', 'ci', 'identificacion'],
  nombre: ['nombre', 'nombres'],
  apellido: ['apellido', 'apellidos'],
  email: ['email', 'correo', 'correo_electronico', 'e_mail'],
  telefono: ['telefono', 'celular', 'whatsapp', 'numero_telefono'],
};

const isAsciiLowerAlnum = (char) => {
  const code = char.codePointAt(0);
  return (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
};

const isCombiningMark = (char) => {
  const code = char.codePointAt(0);
  return code >= 0x0300 && code <= 0x036f;
};

const normalizeHeader = (value) => {
  const output = [];
  for (const char of String(value || '').toLowerCase().normalize('NFD')) {
    if (isCombiningMark(char)) continue;
    if (isAsciiLowerAlnum(char)) {
      output.push(char);
    } else if (output.length && output.at(-1) !== '_') {
      output.push('_');
    }
  }

  if (output.at(-1) === '_') output.pop();
  return output.join('');
};

const normalizeImportedCedula = (value) => {
  const digits = onlyDigits(value);
  return digits.length === 9 ? digits.padStart(10, '0') : digits;
};

const normalizeImportedPhone = (value) => {
  const digits = onlyDigits(value);
  if (!digits) return '';
  const localPhone = digits.length === 9 && digits.startsWith('9') ? `0${digits}` : digits;
  return normalizePhone(localPhone) || '';
};

const createHttpError = (status, message, payload) => Object.assign(new Error(message), { status, payload });

const rowHasData = (row) => (row || []).some((value) => String(value || '').trim());

const findHeader = (rows) => {
  const aliases = Object.fromEntries(
    Object.entries(HEADER_ALIASES).flatMap(([key, values]) => values.map((alias) => [alias, key])),
  );

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const columns = {};
    (rows[rowIndex] || []).forEach((value, columnIndex) => {
      const canonical = aliases[normalizeHeader(value)];
      if (canonical && columns[canonical] === undefined) columns[canonical] = columnIndex;
    });

    if (
      columns.cedula !== undefined &&
      columns.nombre !== undefined &&
      columns.apellido !== undefined &&
      columns.email !== undefined
    ) {
      return { rowIndex, columns };
    }
  }

  throw createHttpError(400, 'El Excel debe incluir las columnas cedula, nombre, apellido y email. La columna telefono es opcional.');
};

const parseConvenioEmployeeWorkbook = (buffer) => {
  const { rows, sheetName } = readXlsxRows(buffer, { sheetName: 'Clientes' });
  const header = findHeader(rows);
  const records = [];

  for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    if (!rowHasData(row)) continue;

    records.push({
      fila: rowIndex + 1,
      cedula: row[header.columns.cedula] || '',
      nombre: row[header.columns.nombre] || '',
      apellido: row[header.columns.apellido] || '',
      email: row[header.columns.email] || '',
      telefono: header.columns.telefono === undefined ? '' : row[header.columns.telefono] || '',
    });
  }

  if (records.length > MAX_IMPORT_ROWS) {
    throw createHttpError(400, `El Excel no puede superar ${MAX_IMPORT_ROWS} filas de empleados.`);
  }

  return { sheetName, records };
};

const validateImportRecord = (record) => {
  const errors = [];
  const cedula = normalizeImportedCedula(record.cedula);
  const email = normalizeEmail(record.email);
  const telefono = normalizeImportedPhone(record.telefono);
  const nameResult = validatePersonName(record.nombre, 'Nombre');
  const lastNameResult = validatePersonName(record.apellido, 'Apellido');

  if (!cedula) errors.push('La cedula es obligatoria.');
  else if (!/^\d{10}$/.test(cedula) || !isValidCedula(cedula)) errors.push('La cedula ecuatoriana no es valida.');
  if (!email) errors.push('El correo es obligatorio.');
  else if (email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) errors.push('El correo no es valido.');
  if (nameResult.error) errors.push(nameResult.error);
  if (lastNameResult.error) errors.push(lastNameResult.error);
  if (record.telefono && (!telefono || !/^\d{8,15}$/.test(telefono))) {
    errors.push('El telefono debe tener entre 8 y 15 digitos.');
  }

  return {
    errors,
    value: {
      cedula,
      nombre: nameResult.value,
      apellido: lastNameResult.value,
      email,
      telefono,
    },
  };
};

const fetchConvenio = async (adminClient, idConvenio) => {
  const { data, error } = await adminClient
    .from('convenios')
    .select('id_convenio,nombre_empresa,cupo_maximo,esta_activo,fecha_caducidad,clientes_convenios(count)')
    .eq('id_convenio', idConvenio)
    .single();
  if (error || !data) throw createHttpError(404, 'Convenio no encontrado.');
  if (!isConvenioVigente(data)) throw createHttpError(400, 'No se puede importar en un convenio inactivo o vencido.');
  return data;
};

const currentConvenioCount = (convenio) => Number(convenio.clientes_convenios?.[0]?.count || 0);

const fetchClientByCedula = async (adminClient, cedula) => {
  const { data, error } = await adminClient
    .from('clientes')
    .select('id_cliente,cedula,nombre,apellido,email,telefono,id_tipo_cliente,esta_activo')
    .eq('cedula', cedula)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const fetchActiveClientByPhone = async (adminClient, telefono, excludeClientId) => {
  if (!telefono) return null;
  let query = adminClient
    .from('clientes')
    .select('id_cliente,cedula,esta_activo')
    .eq('telefono', telefono);
  if (excludeClientId) query = query.neq('id_cliente', excludeClientId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).find((client) => client.esta_activo !== false) || null;
};

const fetchActiveClientByEmail = async (adminClient, email, excludeClientId) => {
  if (!email) return null;
  let query = adminClient
    .from('clientes')
    .select('id_cliente,cedula,esta_activo')
    .eq('email', email);
  if (excludeClientId) query = query.neq('id_cliente', excludeClientId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).find((client) => client.esta_activo !== false) || null;
};

const updateClientEmail = async (adminClient, client, email, userId) => {
  if (!email || String(client.email || '').toLowerCase() === email) return client;
  const owner = await fetchActiveClientByEmail(adminClient, email, client.id_cliente);
  if (owner) {
    return {
      error: 'El correo ya pertenece a otro cliente activo.',
    };
  }

  const { data, error } = await adminClient
    .from('clientes')
    .update({ email, updated_by: userId })
    .eq('id_cliente', client.id_cliente)
    .select('id_cliente,cedula,nombre,apellido,email,telefono,id_tipo_cliente,esta_activo')
    .single();
  if (error) throw error;
  return data;
};

const fetchClientConvenioLink = async (adminClient, idCliente) => {
  const { data, error } = await adminClient
    .from('clientes_convenios')
    .select('id_convenio')
    .eq('id_cliente', idCliente)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const insertClient = async (adminClient, payload, userId) => {
  const { data, error } = await adminClient
    .from('clientes')
    .insert([{
      cedula: payload.cedula,
      nombre: payload.nombre,
      apellido: payload.apellido,
      email: payload.email,
      telefono: payload.telefono || null,
      id_tipo_cliente: CONVENIO_CLIENT_TYPE,
      created_by: userId,
    }])
    .select('id_cliente,cedula,nombre,apellido,email,telefono,id_tipo_cliente,esta_activo')
    .single();
  if (error) throw error;
  return data;
};

const insertConvenioLink = async (adminClient, idConvenio, idCliente, userId) => {
  const { error } = await adminClient
    .from('clientes_convenios')
    .insert([{ id_cliente: idCliente, id_convenio: idConvenio, created_by: userId }]);
  if (error) throw error;
};

const rejectedResult = (record, errors) => ({
  fila: record.fila,
  cedula: normalizeImportedCedula(record.cedula),
  nombre: String(record.nombre || '').trim(),
  apellido: String(record.apellido || '').trim(),
  email: normalizeEmail(record.email) || '',
  estado: 'rejected',
  errores: errors,
  clienteId: null,
  inviteLink: null,
  invitationMessage: null,
  telegramStatus: 'not_generated',
  emailStatus: 'not_attempted',
  emailError: null,
});

const summarizeResults = (results) => {
  const count = (predicate) => results.filter(predicate).length;
  return {
    totalFilas: results.length,
    creados: count((row) => row.estado === 'created'),
    vinculados: count((row) => row.estado === 'linked_existing'),
    omitidos: count((row) => row.estado === 'skipped_existing'),
    rechazados: count((row) => row.estado === 'rejected'),
    invitacionesTelegramEnviadas: count((row) => row.telegramStatus === 'sent'),
    invitacionesPendientesManual: count((row) =>
      ['manual_required', 'rejected_manual_required'].includes(row.telegramStatus),
    ),
    sinTelefono: count((row) => row.telegramStatus === 'no_phone'),
    invitacionesEmailEnviadas: count((row) => row.emailStatus === 'sent'),
    invitacionesEmailFallidas: count((row) => ['failed', 'not_configured', 'missing_recipient'].includes(row.emailStatus)),
  };
};

const defaultInvitation = () => ({
  inviteLink: null,
  invitationMessage: null,
  telegramStatus: 'not_generated',
  errorMessage: null,
  emailStatus: 'not_attempted',
  emailErrorMessage: null,
});

const rejectedByCapacity = (record, maxSlots) =>
  rejectedResult(record, [`Se alcanzo el cupo maximo del convenio (${maxSlots}).`]);

// Resuelve la actualizacion de correo del cliente existente (o la simula en
// dryRun). Devuelve { currentClient } o { rejection } si el correo pertenece
// a otro cliente activo o la escritura falla.
const resolveExistingClientEmail = async ({ adminClient, client, payload, userId, dryRun, warnings }) => {
  if (dryRun) {
    // Vista previa: mismas validaciones, sin escribir el correo.
    const email = payload.email;
    if (!email || String(client.email || '').toLowerCase() === email) return { currentClient: client };
    const owner = await fetchActiveClientByEmail(adminClient, email, client.id_cliente);
    if (owner) return { rejection: 'El correo ya pertenece a otro cliente activo.' };
    warnings.push('Correo actualizado desde el Excel.');
    return { currentClient: { ...client, email } };
  }

  const currentClient = await updateClientEmail(adminClient, client, payload.email, userId);
  if (currentClient.error) return { rejection: currentClient.error };
  if (currentClient.email !== client.email) warnings.push('Correo actualizado desde el Excel.');
  return { currentClient };
};

const processExistingClient = async ({
  adminClient,
  client,
  idConvenio,
  maxSlots,
  payload,
  record,
  usedSlots,
  userId,
  dryRun,
}) => {
  const warnings = [];

  if (Number(client.id_tipo_cliente) !== CONVENIO_CLIENT_TYPE) {
    return { result: rejectedResult(record, ['La cedula ya existe como cliente frecuente o de otro tipo.']), usedSlots };
  }

  if (client.esta_activo === false) {
    return { result: rejectedResult(record, ['La cedula ya existe, pero el cliente esta inactivo.']), usedSlots };
  }

  const emailResolution = await resolveExistingClientEmail({ adminClient, client, payload, userId, dryRun, warnings });
  if (emailResolution.rejection) {
    return { result: rejectedResult(record, [emailResolution.rejection]), usedSlots };
  }
  const currentClient = emailResolution.currentClient;

  const link = await fetchClientConvenioLink(adminClient, currentClient.id_cliente);
  if (link?.id_convenio === idConvenio) {
    return { client: currentClient, estado: 'skipped_existing', warnings, usedSlots };
  }

  if (link?.id_convenio) {
    return { result: rejectedResult(record, ['La cedula ya esta vinculada a otro convenio.']), usedSlots };
  }

  if (usedSlots >= maxSlots) return { result: rejectedByCapacity(record, maxSlots), usedSlots };

  if (!dryRun) await insertConvenioLink(adminClient, idConvenio, currentClient.id_cliente, userId);
  if (!currentClient.telefono && payload.telefono) {
    warnings.push('Cliente existente sin telefono; revise la ficha para habilitar Telegram.');
  }

  return { client: currentClient, estado: 'linked_existing', warnings, usedSlots: usedSlots + 1 };
};

const processNewClient = async ({
  adminClient,
  idConvenio,
  maxSlots,
  payload,
  record,
  usedSlots,
  userId,
  dryRun,
}) => {
  if (usedSlots >= maxSlots) return { result: rejectedByCapacity(record, maxSlots), usedSlots };

  const phoneOwner = await fetchActiveClientByPhone(adminClient, payload.telefono);
  if (phoneOwner) {
    return { result: rejectedResult(record, ['El telefono ya pertenece a otro cliente activo.']), usedSlots };
  }

  const emailOwner = await fetchActiveClientByEmail(adminClient, payload.email);
  if (emailOwner) {
    return { result: rejectedResult(record, ['El correo ya pertenece a otro cliente activo.']), usedSlots };
  }

  if (dryRun) {
    // Vista previa: se proyecta el alta sin escribir en la base.
    const client = {
      id_cliente: null,
      cedula: payload.cedula,
      nombre: payload.nombre,
      apellido: payload.apellido,
      email: payload.email,
      telefono: payload.telefono || null,
    };
    return { client, estado: 'created', warnings: [], usedSlots: usedSlots + 1 };
  }

  const client = await insertClient(adminClient, payload, userId);
  await insertConvenioLink(adminClient, idConvenio, client.id_cliente, userId);
  return { client, estado: 'created', warnings: [], usedSlots: usedSlots + 1 };
};

const processValidatedRecord = async (adminClient, context) => {
  const client = await fetchClientByCedula(adminClient, context.payload.cedula);
  if (client) return processExistingClient({ ...context, adminClient, client });
  return processNewClient({ ...context, adminClient });
};

const buildImportResult = async (adminClient, { convenio, outcome, payload, record, userId, dryRun }, options) => {
  // En vista previa no se generan invitaciones ni correos.
  const invitation =
    outcome.estado === 'skipped_existing' || dryRun
      ? defaultInvitation()
      : await generateConvenioInvitation(
        adminClient,
        { convenio, client: outcome.client, createdBy: userId, sendDirect: true },
        options.invitationOptions || {},
      );

  return {
    fila: record.fila,
    cedula: payload.cedula,
    email: outcome.client.email || payload.email,
    nombre: outcome.client.nombre,
    apellido: outcome.client.apellido,
    estado: outcome.estado,
    errores: outcome.warnings,
    clienteId: outcome.client.id_cliente,
    inviteLink: invitation.inviteLink,
    invitationMessage: invitation.invitationMessage,
    telegramStatus: invitation.telegramStatus,
    telegramError: invitation.errorMessage,
    emailTo: invitation.emailTo,
    emailStatus: invitation.emailStatus,
    emailError: invitation.emailErrorMessage,
  };
};

const importConvenioEmployees = async (adminClient, { idConvenio, fileBuffer, userId, dryRun = false }, options = {}) => {
  const { records } = parseConvenioEmployeeWorkbook(fileBuffer);
  const convenio = await fetchConvenio(adminClient, idConvenio);
  const results = [];
  const seenCedulas = new Set();
  let usedSlots = currentConvenioCount(convenio);
  const maxSlots = Number(convenio.cupo_maximo || 0);

  for (const record of records) {
    const validation = validateImportRecord(record);
    if (validation.errors.length) {
      results.push(rejectedResult(record, validation.errors));
      continue;
    }

    const payload = validation.value;
    if (seenCedulas.has(payload.cedula)) {
      results.push(rejectedResult(record, ['La cedula esta repetida dentro del Excel.']));
      continue;
    }
    seenCedulas.add(payload.cedula);

    const outcome = await processValidatedRecord(adminClient, {
      idConvenio,
      maxSlots,
      payload,
      record,
      usedSlots,
      userId,
      dryRun,
    });

    usedSlots = outcome.usedSlots;
    if (outcome.result) {
      results.push(outcome.result);
      continue;
    }

    results.push(await buildImportResult(adminClient, { convenio, outcome, payload, record, userId, dryRun }, options));
  }

  return {
    mensaje: dryRun
      ? 'Validacion procesada. Ningun registro fue guardado; confirme la carga para aplicarla.'
      : 'Importacion procesada.',
    dryRun: Boolean(dryRun),
    resumen: summarizeResults(results),
    resultados: results,
  };
};

module.exports = {
  _private: {
    findHeader,
    normalizeHeader,
    normalizeImportedCedula,
    normalizeImportedPhone,
    parseConvenioEmployeeWorkbook,
    validateImportRecord,
  },
  importConvenioEmployees,
};
