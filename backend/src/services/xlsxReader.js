const zlib = require('node:zlib');

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

const xmlEntities = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
};

const xmlDecode = (value) =>
  String(value || '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const isHex = entity[1]?.toLowerCase() === 'x';
      const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return xmlEntities[entity] || match;
  });

const isAttributeNameStart = (char) => {
  if (!char) return false;
  const code = char.codePointAt(0);
  return code === 95 || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
};

const isAttributeNameChar = (char) => {
  if (!char) return false;
  const code = char.codePointAt(0);
  return (
    isAttributeNameStart(char) ||
    code === 45 ||
    code === 46 ||
    code === 58 ||
    (code >= 48 && code <= 57)
  );
};

const isWhitespace = (char) => char === ' ' || char === '\n' || char === '\r' || char === '\t';

const skipWhitespace = (source, index) => {
  let cursor = index;
  while (cursor < source.length && isWhitespace(source[cursor])) cursor += 1;
  return cursor;
};

const readAttributeName = (source, index) => {
  if (!isAttributeNameStart(source[index])) return null;

  let cursor = index + 1;
  while (cursor < source.length && isAttributeNameChar(source[cursor])) cursor += 1;

  return {
    name: source.slice(index, cursor),
    nextIndex: cursor,
  };
};

const readQuotedAttributeValue = (source, index) => {
  if (source[index] !== '"') return null;

  const valueStart = index + 1;
  const valueEnd = source.indexOf('"', valueStart);
  if (valueEnd === -1) return null;

  return {
    value: xmlDecode(source.slice(valueStart, valueEnd)),
    nextIndex: valueEnd + 1,
  };
};

const readAttribute = (source, index) => {
  const nameResult = readAttributeName(source, index);
  if (!nameResult) return { nextIndex: index + 1 };

  const equalsIndex = skipWhitespace(source, nameResult.nextIndex);
  if (source[equalsIndex] !== '=') return { nextIndex: Math.max(equalsIndex, nameResult.nextIndex) + 1 };

  const valueIndex = skipWhitespace(source, equalsIndex + 1);
  const valueResult = readQuotedAttributeValue(source, valueIndex);
  if (!valueResult) return { nextIndex: valueIndex };

  return {
    name: nameResult.name,
    value: valueResult.value,
    nextIndex: valueResult.nextIndex,
  };
};

const parseAttributes = (text) => {
  const attrs = {};
  const source = String(text || '');
  let index = 0;

  while (index < source.length) {
    index = skipWhitespace(source, index);
    const attribute = readAttribute(source, index);
    if (attribute.name) attrs[attribute.name] = attribute.value;
    index = attribute.nextIndex;
  }

  return attrs;
};

const findEndOfCentralDirectory = (buffer) => {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw Object.assign(new Error('El archivo Excel no tiene una estructura .xlsx valida.'), { status: 400 });
};

const readZipEntries = (buffer) => {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entriesCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entriesCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw Object.assign(new Error('El indice interno del Excel esta corrupto.'), { status: 400 });
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength).replaceAll('\\', '/');

    entries.set(fileName, {
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

const readZipEntry = (buffer, entries, name) => {
  const entry = entries.get(name);
  if (!entry) return null;

  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_SIGNATURE) {
    throw Object.assign(new Error(`Entrada corrupta en el Excel: ${name}`), { status: 400 });
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);

  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) {
    const inflated = zlib.inflateRawSync(compressed);
    if (entry.uncompressedSize && inflated.length !== entry.uncompressedSize) {
      throw Object.assign(new Error(`Entrada Excel con tamano inesperado: ${name}`), { status: 400 });
    }
    return inflated;
  }

  throw Object.assign(new Error('El Excel usa un metodo de compresion no soportado.'), { status: 400 });
};

const readTextEntry = (buffer, entries, name) => {
  const entry = readZipEntry(buffer, entries, name);
  return entry ? entry.toString('utf8') : '';
};

// Algunos generadores OOXML (p.ej. plantillas creadas con librerias .NET)
// escriben las etiquetas con prefijo de namespace (<x:sheet>, <x:c>, <x:v>).
// Se elimina el prefijo del nombre de etiqueta para que el parser funcione
// con y sin prefijos. Los atributos (r:id) no se tocan.
const stripTagNamespaces = (xml) => String(xml || '').replace(/<(\/?)[A-Za-z_][\w.-]*?:/g, '<$1');

const normalizeTargetPath = (target) => {
  const rawTarget = String(target || '');
  const cleanTarget = rawTarget.startsWith('/') ? rawTarget.slice(1) : rawTarget;
  return cleanTarget.startsWith('xl/') ? cleanTarget : `xl/${cleanTarget}`;
};

const workbookSheetTargets = (workbookXml, relsXml) => {
  const rels = new Map();
  const relRegex = /<Relationship\b([^>]*)\/?>/g;
  let relMatch;
  while ((relMatch = relRegex.exec(relsXml))) {
    const attrs = parseAttributes(relMatch[1]);
    if (attrs.Id && attrs.Target) rels.set(attrs.Id, normalizeTargetPath(attrs.Target));
  }

  const sheets = [];
  const sheetRegex = /<sheet\b([^>]*)\/?>/g;
  let sheetMatch;
  while ((sheetMatch = sheetRegex.exec(workbookXml))) {
    const attrs = parseAttributes(sheetMatch[1]);
    // El atributo de relacion suele ser r:id, pero el prefijo puede variar.
    const relId = attrs['r:id']
      || Object.entries(attrs).find(([key]) => key === 'id' || key.endsWith(':id'))?.[1];
    if (attrs.name && relId && rels.has(relId)) {
      sheets.push({ name: attrs.name, path: rels.get(relId) });
    }
  }
  return sheets;
};

const sharedStrings = (sharedStringsXml) => {
  const values = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let siMatch;
  while ((siMatch = siRegex.exec(sharedStringsXml || ''))) {
    const parts = [];
    const textRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let textMatch;
    while ((textMatch = textRegex.exec(siMatch[1]))) {
      parts.push(xmlDecode(textMatch[1]));
    }
    values.push(parts.join(''));
  }
  return values;
};

const columnIndex = (letters) => {
  let index = 0;
  for (const letter of String(letters || '').toUpperCase()) {
    index = index * 26 + ((letter.codePointAt(0) || 64) - 64);
  }
  return index - 1;
};

const CELL_REFERENCE_PATTERN = /^([A-Z]+)(\d+)$/i;

const cellPosition = (reference) => {
  const match = CELL_REFERENCE_PATTERN.exec(String(reference || ''));
  if (!match) return null;
  return {
    column: columnIndex(match[1]),
    row: Number(match[2]) - 1,
  };
};

const tagValue = (xml, tagName) => {
  const source = String(xml || '');
  const openStart = source.indexOf(`<${tagName}`);
  if (openStart === -1) return '';

  const openEnd = source.indexOf('>', openStart);
  if (openEnd === -1) return '';

  const closeStart = source.indexOf(`</${tagName}>`, openEnd + 1);
  if (closeStart === -1) return '';

  return xmlDecode(source.slice(openEnd + 1, closeStart));
};

const cellValue = (cellXml, attrs, strings) => {
  if (attrs.t === 'inlineStr') return tagValue(cellXml, 't').trim();

  const rawValue = tagValue(cellXml, 'v');
  if (attrs.t === 's') return strings[Number(rawValue)] || '';
  if (attrs.t === 'b') return rawValue === '1' ? 'TRUE' : 'FALSE';
  return String(rawValue || '').trim();
};

const parseWorksheet = (worksheetXml, strings) => {
  const rows = [];
  const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
  let match;
  while ((match = cellRegex.exec(worksheetXml || ''))) {
    const attrs = parseAttributes(match[1] || match[3]);
    const position = cellPosition(attrs.r);
    if (!position) continue;

    const value = cellValue(match[2] || '', attrs, strings);
    if (!rows[position.row]) rows[position.row] = [];
    rows[position.row][position.column] = value;
  }

  return rows.map((row) => (row || []).map((value) => String(value || '').trim()));
};

const readXlsxRows = (buffer, { sheetName = 'Clientes' } = {}) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw Object.assign(new Error('El archivo Excel esta vacio o corrupto.'), { status: 400 });
  }

  const entries = readZipEntries(buffer);
  const workbookXml = stripTagNamespaces(readTextEntry(buffer, entries, 'xl/workbook.xml'));
  const relsXml = stripTagNamespaces(readTextEntry(buffer, entries, 'xl/_rels/workbook.xml.rels'));
  if (!workbookXml || !relsXml) {
    throw Object.assign(new Error('El archivo Excel no contiene un libro valido.'), { status: 400 });
  }

  const sheets = workbookSheetTargets(workbookXml, relsXml);
  const worksheet =
    sheets.find((sheet) => sheet.name.toLowerCase() === String(sheetName).toLowerCase()) ||
    sheets[0];
  if (!worksheet) {
    throw Object.assign(new Error('El Excel no contiene hojas para leer.'), { status: 400 });
  }

  const worksheetXml = stripTagNamespaces(readTextEntry(buffer, entries, worksheet.path));
  if (!worksheetXml) {
    throw Object.assign(new Error(`No se pudo leer la hoja ${worksheet.name}.`), { status: 400 });
  }

  const strings = sharedStrings(stripTagNamespaces(readTextEntry(buffer, entries, 'xl/sharedStrings.xml')));
  return {
    sheetName: worksheet.name,
    rows: parseWorksheet(worksheetXml, strings),
  };
};

module.exports = {
  _private: {
    parseAttributes,
    xmlDecode,
  },
  readXlsxRows,
};
