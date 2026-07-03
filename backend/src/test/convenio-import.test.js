import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const { importConvenioEmployees, _private } = require('../services/convenioEmployeeImport.js');
const {
  buildConvenioInvitationMessage,
  buildInvitationLink,
  generateConvenioInvitation,
  resolveInvitationStatus,
} = require('../services/convenioInvitations.js');
const { readXlsxRows, _private: xlsxPrivate } = require('../services/xlsxReader.js');

const crc32Table = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const cellRef = (row, column) => `${String.fromCharCode(65 + column)}${row + 1}`;

const createZip = (files) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const input = Buffer.from(content, 'utf8');
    const compressed = zlib.deflateRawSync(input);
    const nameBuffer = Buffer.from(name, 'utf8');
    const checksum = crc32(input);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(input.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(input.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDirectory, end]);
};

const createWorkbook = (rows) => {
  const sheetData = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) =>
          `<c r="${cellRef(rowIndex, columnIndex)}" t="inlineStr"><is><t>${String(value)}</t></is></c>`,
        )
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  return createZip({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    'xl/workbook.xml':
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Clientes" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${sheetData}</sheetData></worksheet>`,
  });
};

const validCedula = (prefix) => {
  const digits = String(prefix).padStart(9, '0').slice(0, 9);
  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const total = coefficients.reduce((sum, coefficient, index) => {
    let value = Number(digits[index]) * coefficient;
    if (value >= 10) value -= 9;
    return sum + value;
  }, 0);
  return `${digits}${(10 - (total % 10)) % 10}`;
};

class FakeQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.operation = 'select';
    this.payload = null;
    this.inserted = null;
  }

  select() { return this; }
  limit() { return this; }
  eq(column, value) { this.filters.push({ column, value, op: 'eq' }); return this; }
  neq(column, value) { this.filters.push({ column, value, op: 'neq' }); return this; }
  in(column, values) { this.filters.push({ column, value: values, op: 'in' }); return this; }
  not() { return this; }

  insert(payload) {
    this.operation = 'insert';
    this.payload = Array.isArray(payload) ? payload : [payload];
    this.inserted = this.payload.map((row) => this.db.insert(this.table, row));
    return this;
  }

  update(payload) {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  rows() {
    return this.db.table(this.table).filter((row) =>
      this.filters.every((filter) => {
        if (filter.op === 'neq') return String(row[filter.column]) !== String(filter.value);
        if (filter.op === 'in') return filter.value.map(String).includes(String(row[filter.column]));
        return String(row[filter.column]) === String(filter.value);
      }),
    );
  }

  decorate(row) {
    if (!row || this.table !== 'convenios') return row;
    return {
      ...row,
      clientes_convenios: [{ count: this.db.links.filter((link) => link.id_convenio === row.id_convenio).length }],
    };
  }

  async maybeSingle() {
    if (this.operation === 'insert') return { data: this.decorate(this.inserted[0]), error: null };
    if (this.operation === 'update') {
      const row = this.rows()[0];
      if (row) Object.assign(row, this.payload);
      return { data: this.decorate(row || null), error: null };
    }
    return { data: this.decorate(this.rows()[0] || null), error: null };
  }

  async single() {
    const result = await this.maybeSingle();
    return result.data ? result : { data: null, error: new Error('not found') };
  }

  then(resolve) {
    resolve({ data: this.rows().map((row) => this.decorate(row)), error: null });
  }
}

const makeDb = () => {
  const db = {
    convenios: [{
      id_convenio: 'conv-1',
      nombre_empresa: 'Convenio QA',
      cupo_maximo: 5,
      esta_activo: true,
      fecha_caducidad: '2099-12-31',
    }],
    clients: [],
    links: [],
    subscriptions: [],
    invitations: [],
    table(name) {
      return {
        convenios: this.convenios,
        clientes: this.clients,
        clientes_convenios: this.links,
        telegram_subscriptions: this.subscriptions,
        telegram_convenio_invitaciones: this.invitations,
      }[name] || [];
    },
    insert(name, row) {
      const table = this.table(name);
      const inserted = { ...row };
      if (name === 'clientes') inserted.id_cliente = inserted.id_cliente || `client-${this.clients.length + 1}`;
      if (name === 'telegram_subscriptions') inserted.id = inserted.id || `sub-${this.subscriptions.length + 1}`;
      if (name === 'telegram_convenio_invitaciones') inserted.id = inserted.id || `inv-${this.invitations.length + 1}`;
      table.push(inserted);
      return inserted;
    },
    client: {
      from(table) {
        return new FakeQuery(db, table);
      },
    },
  };
  return db;
};

// Imita la plantilla oficial (frontend/public/templates): etiquetas con
// prefijo de namespace x:, titulo/instrucciones arriba, encabezados en la
// fila 4, celdas t="str" con <x:v> y filas vacias pre-formateadas.
const createNamespacedTemplateWorkbook = (dataRows, { relAttr = 'r:id' } = {}) => {
  const cell = (ref, value) => `<x:c r="${ref}" s="1" t="str"><x:v>${value}</x:v></x:c>`;
  const headers = ['cedula', 'nombre', 'apellido', 'email', 'telefono', 'estado_validacion', 'errores', 'accion_sugerida'];
  const headerCells = headers.map((h, i) => cell(`${String.fromCharCode(65 + i)}4`, h)).join('');
  const dataXml = dataRows
    .map((row, index) => {
      const rowNumber = 5 + index;
      const cells = row.map((value, col) => cell(`${String.fromCharCode(65 + col)}${rowNumber}`, value)).join('');
      return `<x:row r="${rowNumber}">${cells}</x:row>`;
    })
    .join('');
  const sheetXml =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>' +
    '<x:row r="1"><x:c r="A1" t="str"><x:v>Plantilla de carga masiva de clientes de convenio</x:v></x:c></x:row>' +
    '<x:row r="2"><x:c r="A2" t="str"><x:v>Complete una fila por cliente. No cambie encabezados.</x:v></x:c></x:row>' +
    `<x:row r="4">${headerCells}</x:row>` +
    dataXml +
    '<x:row r="90" />' +
    '</x:sheetData></x:worksheet>';

  return createZip({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<x:sheets><x:sheet name="Clientes" sheetId="1" ${relAttr}="Rtpl001" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets>` +
      '</x:workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="Rtpl001" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" /></Relationships>',
    'xl/sharedStrings.xml':
      '<?xml version="1.0" encoding="utf-8"?><x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" />',
    'xl/worksheets/sheet1.xml': sheetXml,
  });
};

describe('importacion Excel de colaboradores de convenio', () => {
  it('lee la plantilla oficial con namespaces y encabezados en la fila 4', () => {
    const cedula = validCedula('091000001');
    const buffer = createNamespacedTemplateWorkbook([
      [cedula, 'Ana', 'Perez', 'ana@example.com', '0998313804', '', '', ''],
    ]);

    const parsed = xlsxPrivate ? readXlsxRows(buffer, { sheetName: 'Clientes' }) : null;
    expect(parsed.sheetName).toBe('Clientes');
    expect(parsed.rows[3].slice(0, 5)).toEqual(['cedula', 'nombre', 'apellido', 'email', 'telefono']);

    const { records } = _private.parseConvenioEmployeeWorkbook(buffer);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ cedula, nombre: 'Ana', email: 'ana@example.com' });
  });

  it('resuelve la hoja aunque el atributo de relacion use otro prefijo (d:id)', () => {
    const cedula = validCedula('092000002');
    const buffer = createNamespacedTemplateWorkbook(
      [[cedula, 'Ana', 'Perez', 'ana.did@example.com', '0998313804', '', '', '']],
      { relAttr: 'd:id' },
    );

    const parsed = readXlsxRows(buffer, { sheetName: 'Clientes' });
    expect(parsed.sheetName).toBe('Clientes');

    const { records } = _private.parseConvenioEmployeeWorkbook(buffer);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ cedula, email: 'ana.did@example.com' });
  });

  it('lee la hoja Clientes de un .xlsx minimo', () => {
    const buffer = createWorkbook([
      ['cedula', 'nombre', 'apellido', 'email', 'telefono'],
      [validCedula('010203040'), 'Ana', 'Perez', 'ana@example.com', '0998313804'],
    ]);

    const parsed = readXlsxRows(buffer, { sheetName: 'Clientes' });

    expect(parsed.sheetName).toBe('Clientes');
    expect(parsed.rows[0]).toEqual(['cedula', 'nombre', 'apellido', 'email', 'telefono']);
    expect(parsed.rows[1][1]).toBe('Ana');
  });

  it('normaliza cedula y telefono importados', () => {
    expect(_private.normalizeImportedCedula('912345678')).toBe('0912345678');
    expect(_private.normalizeImportedPhone('998313804')).toBe('593998313804');
  });

  it('normaliza encabezados con acentos, espacios y separadores repetidos sin regex inseguro', () => {
    expect(_private.normalizeHeader('  Cédula / RUC  ')).toBe('cedula_ruc');
    expect(_private.normalizeHeader('__Número---Teléfono__')).toBe('numero_telefono');
    expect(_private.normalizeHeader('Nombre')).toBe('nombre');
    expect(_private.normalizeHeader('***')).toBe('');
  });

  it('rechaza filas importadas sin correo', () => {
    const result = _private.validateImportRecord({
      cedula: validCedula('010203040'),
      nombre: 'Ana',
      apellido: 'Perez',
      email: '',
      telefono: '0998313804',
    });

    expect(result.errors).toContain('El correo es obligatorio.');
  });

  it('parsea atributos XML con espacios, namespaces y entidades', () => {
    expect(xlsxPrivate.parseAttributes(' r:id = "rId1" name="Clientes &amp; QA" sheetId="1" ')).toEqual({
      'r:id': 'rId1',
      name: 'Clientes & QA',
      sheetId: '1',
    });
  });

  it('ignora atributos XML incompletos sin bloquear el parser', () => {
    expect(xlsxPrivate.parseAttributes('name="Clientes" broken= r:id="rId1" empty')).toEqual({
      name: 'Clientes',
      'r:id': 'rId1',
    });
  });

  it('crea cliente, vinculo, suscripcion pendiente e invitacion manual', async () => {
    process.env.TELEGRAM_BOT_USERNAME = 'EcienciaBot';
    const cedula = validCedula('010203040');
    const db = makeDb();
    const buffer = createWorkbook([
      ['cedula', 'nombre', 'apellido', 'email', 'telefono'],
      [cedula, 'Ana', 'Perez', 'ana@example.com', '0998313804'],
    ]);

    const result = await importConvenioEmployees(db.client, {
      idConvenio: 'conv-1',
      fileBuffer: buffer,
      userId: 'admin-1',
    });

    expect(result.resumen).toMatchObject({ creados: 1, rechazados: 0, invitacionesPendientesManual: 1 });
    expect(db.clients[0]).toMatchObject({ cedula, nombre: 'Ana', email: 'ana@example.com', id_tipo_cliente: 2 });
    expect(db.links[0]).toMatchObject({ id_cliente: 'client-1', id_convenio: 'conv-1' });
    expect(db.subscriptions[0]).toMatchObject({ id_cliente: 'client-1', consent_status: 'pending' });
    expect(db.invitations[0].invite_link).toContain('https://t.me/EcienciaBot?start=');
  });

  it('dry run valida todas las filas sin escribir clientes, vinculos ni invitaciones', async () => {
    const db = makeDb();
    db.clients.push({
      id_cliente: 'client-owner-dry',
      cedula: validCedula('061111111'),
      nombre: 'Otro',
      apellido: 'Dueno',
      email: 'dueno.dry@example.com',
      telefono: '593977770001',
      id_tipo_cliente: 2,
      esta_activo: true,
    });
    const buffer = createWorkbook([
      ['cedula', 'nombre', 'apellido', 'email', 'telefono'],
      [validCedula('062222220'), 'Ana', 'Perez', 'ana.dry@example.com', '0998313804'],
      [validCedula('073333330'), 'Luis', 'Mora', 'dueno.dry@example.com', '0977770099'],
    ]);

    const result = await importConvenioEmployees(db.client, {
      idConvenio: 'conv-1',
      fileBuffer: buffer,
      userId: 'admin-1',
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.mensaje).toMatch(/ningun registro fue guardado/i);
    expect(result.resumen).toMatchObject({ creados: 1, rechazados: 1 });
    expect(result.resultados[0]).toMatchObject({ estado: 'created', telegramStatus: 'not_generated', emailStatus: 'not_attempted' });
    expect(result.resultados[1].errores.join(' ')).toMatch(/correo ya pertenece/i);
    // Nada persistido: la vista previa no toca la base.
    expect(db.clients).toHaveLength(1);
    expect(db.links).toHaveLength(0);
    expect(db.invitations).toHaveLength(0);
    expect(db.subscriptions).toHaveLength(0);
  });

  it('dry run con cliente existente proyecta omitidos, correo nuevo y conflicto sin escribir', async () => {
    const db = makeDb();
    // Cliente ya vinculado al convenio -> skipped_existing.
    db.clients.push({
      id_cliente: 'client-linked',
      cedula: validCedula('081111111'),
      nombre: 'Vinculado',
      apellido: 'Previo',
      email: 'vinculado@example.com',
      telefono: '593966660001',
      id_tipo_cliente: 2,
      esta_activo: true,
    });
    db.links.push({ id_cliente: 'client-linked', id_convenio: 'conv-1' });
    // Cliente existente sin vinculo con correo nuevo -> linked_existing (preview).
    db.clients.push({
      id_cliente: 'client-free',
      cedula: validCedula('082222220'),
      nombre: 'Libre',
      apellido: 'Sin Convenio',
      email: 'viejo@example.com',
      telefono: '593966660002',
      id_tipo_cliente: 2,
      esta_activo: true,
    });
    // Dueno del correo en conflicto para el tercer caso.
    db.clients.push({
      id_cliente: 'client-mail-owner',
      cedula: validCedula('083333330'),
      nombre: 'Dueno',
      apellido: 'Correo',
      email: 'conflicto@example.com',
      telefono: '593966660003',
      id_tipo_cliente: 2,
      esta_activo: true,
    });
    // Cliente existente cuyo correo nuevo choca con el dueno anterior.
    db.clients.push({
      id_cliente: 'client-clash',
      cedula: validCedula('084444440'),
      nombre: 'Choca',
      apellido: 'Con Otro',
      email: 'choca@example.com',
      telefono: '593966660004',
      id_tipo_cliente: 2,
      esta_activo: true,
    });

    const buffer = createWorkbook([
      ['cedula', 'nombre', 'apellido', 'email', 'telefono'],
      [validCedula('081111111'), 'Vinculado', 'Previo', 'vinculado@example.com', '0966660001'],
      [validCedula('082222220'), 'Libre', 'Sin Convenio', 'nuevo.correo@example.com', '0966660002'],
      [validCedula('084444440'), 'Choca', 'Con Otro', 'conflicto@example.com', '0966660004'],
    ]);

    const result = await importConvenioEmployees(db.client, {
      idConvenio: 'conv-1',
      fileBuffer: buffer,
      userId: 'admin-1',
      dryRun: true,
    });

    expect(result.resumen).toMatchObject({ omitidos: 1, vinculados: 1, rechazados: 1 });
    expect(result.resultados[0].estado).toBe('skipped_existing');
    expect(result.resultados[1].estado).toBe('linked_existing');
    expect(result.resultados[1].errores.join(' ')).toMatch(/correo actualizado/i);
    expect(result.resultados[2].errores.join(' ')).toMatch(/correo ya pertenece/i);
    // Nada persistido: ni vinculos nuevos ni correos actualizados.
    expect(db.links).toHaveLength(1);
    expect(db.clients.find((c) => c.id_cliente === 'client-free').email).toBe('viejo@example.com');
    expect(db.invitations).toHaveLength(0);
  });

  it('rechaza una fila cuyo telefono ya pertenece a otro cliente activo', async () => {
    const db = makeDb();
    db.clients.push({
      id_cliente: 'client-owner',
      cedula: validCedula('211111111'),
      nombre: 'Otro',
      apellido: 'Dueno',
      email: 'otro@example.com',
      telefono: '593998313804',
      id_tipo_cliente: 2,
      esta_activo: true,
    });
    const cedula = validCedula('222222220');
    const buffer = createWorkbook([
      ['cedula', 'nombre', 'apellido', 'email', 'telefono'],
      [cedula, 'Ana', 'Perez', 'ana@example.com', '0998313804'],
    ]);

    const result = await importConvenioEmployees(db.client, {
      idConvenio: 'conv-1',
      fileBuffer: buffer,
      userId: 'admin-1',
    });

    expect(result.resumen).toMatchObject({ creados: 0, rechazados: 1 });
    expect(result.resultados[0].estado).toBe('rejected');
    expect(result.resultados[0].errores.join(' ')).toMatch(/telefono ya pertenece a otro cliente activo/i);
  });

  it('rechaza una fila cuyo correo ya pertenece a otro cliente activo', async () => {
    const db = makeDb();
    db.clients.push({
      id_cliente: 'client-email-owner',
      cedula: validCedula('233333330'),
      nombre: 'Otro',
      apellido: 'Correo',
      email: 'dup@example.com',
      telefono: '593911111111',
      id_tipo_cliente: 2,
      esta_activo: true,
    });
    const cedula = validCedula('244444440');
    const buffer = createWorkbook([
      ['cedula', 'nombre', 'apellido', 'email', 'telefono'],
      [cedula, 'Ana', 'Perez', 'dup@example.com', '0987654321'],
    ]);

    const result = await importConvenioEmployees(db.client, {
      idConvenio: 'conv-1',
      fileBuffer: buffer,
      userId: 'admin-1',
    });

    expect(result.resumen).toMatchObject({ creados: 0, rechazados: 1 });
    expect(result.resultados[0].errores.join(' ')).toMatch(/correo ya pertenece a otro cliente activo/i);
  });

  it('envia directo si ya existe suscripcion aceptada con chat_id', async () => {
    process.env.TELEGRAM_BOT_USERNAME = 'EcienciaBot';
    process.env.TELEGRAM_BOT_TOKEN = 'token-test';
    const cedula = validCedula('020203040');
    const db = makeDb();
    db.clients.push({
      id_cliente: 'client-existing',
      cedula,
      nombre: 'Luis',
      apellido: 'Mora',
      email: 'luis@example.com',
      telefono: '593998313804',
      id_tipo_cliente: 2,
      esta_activo: true,
    });
    db.subscriptions.push({
      id: 'sub-1',
      id_cliente: 'client-existing',
      phone_normalized: '593998313804',
      chat_id: '123',
      consent_status: 'accepted',
      is_active: true,
    });
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 88 } }),
    }));
    const buffer = createWorkbook([
      ['cedula', 'nombre', 'apellido', 'email', 'telefono'],
      [cedula, 'Luis', 'Mora', 'luis@example.com', '0998313804'],
    ]);

    const result = await importConvenioEmployees(
      db.client,
      { idConvenio: 'conv-1', fileBuffer: buffer, userId: 'admin-1' },
      { invitationOptions: { telegramOptions: { fetchImpl, token: 'token-test' } } },
    );

    expect(result.resultados[0]).toMatchObject({ estado: 'linked_existing', telegramStatus: 'sent' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(db.invitations[0]).toMatchObject({ status: 'sent', telegram_message_id: 88 });
  });

  it('construye el mensaje publicitario con link al bot', () => {
    const message = buildConvenioInvitationMessage({
      nombre: 'Ana',
      convenioNombre: 'Convenio QA',
      inviteLink: 'https://t.me/EcienciaBot?start=abc',
    });

    expect(message).toContain('bienvenido/a a ECencia Andina');
    expect(message).toContain('Convenio QA');
    expect(message).toContain('https://t.me/EcienciaBot?start=abc');
  });

  it('detecta filas duplicadas en el Excel sin crear un segundo cliente', async () => {
    process.env.TELEGRAM_BOT_USERNAME = 'EcienciaBot';
    const cedula = validCedula('030203040');
    const db = makeDb();
    const buffer = createWorkbook([
      ['cedula', 'nombre', 'apellido', 'email', 'telefono'],
      [cedula, 'Ana', 'Perez', 'ana@example.com', '0998313804'],
      [cedula, 'Ana', 'Perez', 'ana@example.com', '0998313804'],
    ]);

    const result = await importConvenioEmployees(db.client, {
      idConvenio: 'conv-1',
      fileBuffer: buffer,
      userId: 'admin-1',
    });

    expect(result.resumen).toMatchObject({ creados: 1, rechazados: 1 });
    expect(result.resultados[1]).toMatchObject({
      estado: 'rejected',
      errores: ['La cedula esta repetida dentro del Excel.'],
    });
    expect(db.clients).toHaveLength(1);
  });

  it('omite un cliente que ya estaba vinculado al convenio y no regenera invitacion', async () => {
    const cedula = validCedula('040203040');
    const db = makeDb();
    db.clients.push({
      id_cliente: 'client-existing',
      cedula,
      nombre: 'Luis',
      apellido: 'Mora',
      email: 'luis@example.com',
      telefono: '593998313804',
      id_tipo_cliente: 2,
      esta_activo: true,
    });
    db.links.push({ id_cliente: 'client-existing', id_convenio: 'conv-1' });
    const buffer = createWorkbook([
      ['cedula', 'nombre', 'apellido', 'email', 'telefono'],
      [cedula, 'Luis', 'Mora', 'luis@example.com', '0998313804'],
    ]);

    const result = await importConvenioEmployees(db.client, {
      idConvenio: 'conv-1',
      fileBuffer: buffer,
      userId: 'admin-1',
    });

    expect(result.resultados[0]).toMatchObject({
      estado: 'skipped_existing',
      telegramStatus: 'not_generated',
    });
    expect(db.invitations).toHaveLength(0);
  });

  it('rechaza nuevos empleados cuando el convenio ya no tiene cupo', async () => {
    const cedula = validCedula('050203040');
    const db = makeDb();
    db.convenios[0].cupo_maximo = 1;
    db.links.push({ id_cliente: 'client-ocupado', id_convenio: 'conv-1' });
    const buffer = createWorkbook([
      ['cedula', 'nombre', 'apellido', 'email', 'telefono'],
      [cedula, 'Maria', 'Lopez', 'maria@example.com', '0998313804'],
    ]);

    const result = await importConvenioEmployees(db.client, {
      idConvenio: 'conv-1',
      fileBuffer: buffer,
      userId: 'admin-1',
    });

    expect(result.resumen.rechazados).toBe(1);
    expect(result.resultados[0].errores[0]).toContain('cupo maximo');
    expect(db.clients).toHaveLength(0);
  });

  it('genera auditoria sin suscripcion cuando el cliente no tiene telefono', async () => {
    process.env.TELEGRAM_BOT_USERNAME = 'EcienciaBot';
    const db = makeDb();

    const invitation = await generateConvenioInvitation(db.client, {
      convenio: db.convenios[0],
      client: {
        id_cliente: 'client-sin-telefono',
        nombre: 'Ana',
        apellido: 'Perez',
        email: 'ana@example.com',
        telefono: '',
      },
      createdBy: 'admin-1',
      sendDirect: true,
    });

    expect(invitation).toMatchObject({
      inviteLink: expect.stringContaining('https://t.me/EcienciaBot?start='),
      telegramStatus: 'manual_required',
      subscriptionStatus: 'no_phone',
    });
    expect(db.subscriptions).toHaveLength(0);
    expect(db.invitations[0]).toMatchObject({ phone_normalized: null, status: 'manual_required' });
  });

  it('envia correo de invitacion por Outlook cuando Graph responde correctamente', async () => {
    process.env.TELEGRAM_BOT_USERNAME = 'EcienciaBot';
    const db = makeDb();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'graph-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: (name) => (name === 'request-id' ? 'request-123' : null) },
        text: async () => '',
      });

    const invitation = await generateConvenioInvitation(
      db.client,
      {
        convenio: db.convenios[0],
        client: {
          id_cliente: 'client-email',
          nombre: 'Ana',
          apellido: 'Perez',
          email: 'ana@example.com',
          telefono: '',
        },
        createdBy: 'admin-1',
        sendDirect: true,
      },
      {
        mailOptions: {
          fetchImpl,
          env: {
            OUTLOOK_FROM_EMAIL: 'ecenciaconvenios@outlook.com',
            OUTLOOK_CLIENT_ID: 'client-id',
            OUTLOOK_CLIENT_SECRET: 'client-secret',
            OUTLOOK_REFRESH_TOKEN: 'refresh-token',
            OUTLOOK_TOKEN_TENANT: 'consumers',
          },
        },
      },
    );

    expect(invitation).toMatchObject({
      emailTo: 'ana@example.com',
      emailStatus: 'sent',
      emailProviderRequestId: 'request-123',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(db.invitations[0]).toMatchObject({
      email_to: 'ana@example.com',
      email_status: 'sent',
      email_provider_request_id: 'request-123',
    });
  });

  it('audita correo no configurado sin bloquear la invitacion', async () => {
    process.env.TELEGRAM_BOT_USERNAME = 'EcienciaBot';
    const db = makeDb();

    const invitation = await generateConvenioInvitation(
      db.client,
      {
        convenio: db.convenios[0],
        client: {
          id_cliente: 'client-email-missing-config',
          nombre: 'Ana',
          apellido: 'Perez',
          email: 'ana@example.com',
          telefono: '',
        },
        createdBy: 'admin-1',
        sendDirect: true,
      },
      { mailOptions: { env: {} } },
    );

    expect(invitation).toMatchObject({
      inviteLink: expect.stringContaining('https://t.me/EcienciaBot?start='),
      telegramStatus: 'manual_required',
      emailTo: 'ana@example.com',
      emailStatus: 'not_configured',
    });
    expect(db.invitations[0]).toMatchObject({
      email_to: 'ana@example.com',
      email_status: 'not_configured',
    });
    expect(db.invitations[0].email_error_message).toContain('Falta configuracion Outlook');
  });

  it('marca reinvitacion manual cuando el telefono habia rechazado terminos', async () => {
    process.env.TELEGRAM_BOT_USERNAME = 'EcienciaBot';
    const db = makeDb();
    db.subscriptions.push({
      id: 'sub-rejected',
      id_cliente: 'client-rejected',
      phone_normalized: '593998313804',
      chat_id: '123',
      consent_status: 'rejected',
      is_active: false,
    });

    const invitation = await generateConvenioInvitation(db.client, {
      convenio: db.convenios[0],
      client: {
        id_cliente: 'client-rejected',
        nombre: 'Ana',
        apellido: 'Perez',
        email: 'ana@example.com',
        telefono: '0998313804',
      },
      createdBy: 'admin-1',
      sendDirect: true,
    });

    expect(invitation.telegramStatus).toBe('rejected_manual_required');
    expect(db.invitations[0]).toMatchObject({ status: 'rejected_manual_required', subscription_id: 'sub-rejected' });
  });

  it('audita fallo si Telegram rechaza el envio directo', async () => {
    process.env.TELEGRAM_BOT_USERNAME = 'EcienciaBot';
    process.env.TELEGRAM_BOT_TOKEN = 'token-test';
    const db = makeDb();
    db.subscriptions.push({
      id: 'sub-accepted',
      id_cliente: 'client-accepted',
      phone_normalized: '593998313804',
      chat_id: '123',
      consent_status: 'accepted',
      is_active: true,
    });
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ ok: false, description: 'rate limited' }),
    }));

    const invitation = await generateConvenioInvitation(
      db.client,
      {
        convenio: db.convenios[0],
        client: {
          id_cliente: 'client-accepted',
          nombre: 'Ana',
          apellido: 'Perez',
          email: 'ana@example.com',
          telefono: '0998313804',
        },
        createdBy: 'admin-1',
        sendDirect: true,
      },
      { telegramOptions: { fetchImpl, token: 'token-test' } },
    );

    expect(invitation).toMatchObject({ telegramStatus: 'failed', errorMessage: 'rate limited' });
    expect(db.invitations[0]).toMatchObject({ status: 'failed', error_message: 'rate limited' });
  });

  it('resuelve links y estados base de invitacion', () => {
    expect(buildInvitationLink('abc_123', '@EcienciaBot')).toBe('https://t.me/EcienciaBot?start=abc_123');
    expect(buildInvitationLink('', '@EcienciaBot')).toBeNull();
    expect(resolveInvitationStatus({
      phoneNormalized: '',
      inviteLink: null,
      subscriptionStatus: 'no_phone',
    })).toBe('no_phone');
    expect(resolveInvitationStatus({
      phoneNormalized: '',
      inviteLink: 'https://t.me/EcienciaBot?start=abc',
      subscriptionStatus: 'no_phone',
    })).toBe('manual_required');
    expect(resolveInvitationStatus({
      phoneNormalized: '593998313804',
      inviteLink: null,
      subscriptionStatus: 'pending',
    })).toBe('missing_bot_username');
  });
});
