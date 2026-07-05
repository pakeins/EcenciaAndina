const { z } = require('zod');

const MAX_LENGTHS = {
  nombre: 60,
  empresa: 120,
  email: 254,
  username: 40,
  factura: 50,
  descripcion: 300,
  observaciones: 500,
  menuOption: 80,
  canal: 40,
};

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

const trimToUndefined = (value) => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
};

const normalizeEmail = (value) => {
  const email = trimToUndefined(value);
  return email ? email.toLowerCase() : undefined;
};

const toNumber = (value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  return Number(value);
};

const isValidCedula = (value) => {
  const cedula = onlyDigits(value);
  if (!/^\d{10}$/.test(cedula)) return false;

  const province = Number(cedula.slice(0, 2));
  const thirdDigit = Number(cedula[2]);
  if (province < 1 || province > 24 || thirdDigit > 5) return false;

  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const sum = coefficients.reduce((total, coefficient, index) => {
    let valueAtIndex = Number(cedula[index]) * coefficient;
    if (valueAtIndex >= 10) valueAtIndex -= 9;
    return total + valueAtIndex;
  }, 0);

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(cedula[9]);
};

const modulo11Digit = (digits, coefficients) => {
  const sum = coefficients.reduce((total, coefficient, index) => total + Number(digits[index]) * coefficient, 0);
  const remainder = sum % 11;
  const result = 11 - remainder;
  if (result === 11) return 0;
  if (result === 10) return -1;
  return result;
};

const isValidRuc = (value) => {
  const ruc = onlyDigits(value);
  if (!/^\d{13}$/.test(ruc) || ruc.slice(10) === '000') return false;

  const province = Number(ruc.slice(0, 2));
  const thirdDigit = Number(ruc[2]);
  if (province < 1 || province > 24) return false;

  if (thirdDigit < 6) {
    return isValidCedula(ruc.slice(0, 10));
  }

  if (thirdDigit === 6) {
    const checkDigit = modulo11Digit(ruc, [3, 2, 7, 6, 5, 4, 3, 2]);
    return checkDigit === Number(ruc[8]);
  }

  if (thirdDigit === 9) {
    const checkDigit = modulo11Digit(ruc, [4, 3, 2, 7, 6, 5, 4, 3, 2]);
    return checkDigit === Number(ruc[9]);
  }

  return false;
};

const normalizePhone = (value) => {
  const digits = onlyDigits(value);
  if (!digits) return undefined;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('593')) return digits;
  if (digits.length === 10 && digits.startsWith('0')) return `593${digits.slice(1)}`;
  return digits;
};

const requiredText = (max, field) =>
  z.preprocess(
    trimToUndefined,
    z
      .string({ required_error: `${field} es obligatorio.` })
      .min(1, `${field} es obligatorio.`)
      .max(max, `${field} no puede superar ${max} caracteres.`),
  );

const optionalText = (max, field) =>
  z.preprocess(
    trimToUndefined,
    z.string().max(max, `${field} no puede superar ${max} caracteres.`).optional(),
  );

const phoneSchema = z
  .preprocess(normalizePhone, z.string().regex(/^\d{8,15}$/, 'El telefono debe tener entre 8 y 15 digitos.').optional())
  .optional();

const requiredEmailSchema = z.preprocess(
  normalizeEmail,
  z
    .string({ required_error: 'El correo es obligatorio.' })
    .email('El correo no es valido.')
    .max(MAX_LENGTHS.email, 'El correo es demasiado largo.'),
);

const optionalEmailSchema = z.preprocess(
  normalizeEmail,
  z
    .string()
    .email('El correo no es valido.')
    .max(MAX_LENGTHS.email, 'El correo es demasiado largo.')
    .optional(),
);

const rucSchema = z.preprocess(
  onlyDigits,
  z
    .string({ required_error: 'El RUC es obligatorio.' })
    .refine((value) => isValidRuc(value), 'El RUC ecuatoriano no es valido.'),
);

const documentSchema = z.preprocess(
  onlyDigits,
  z
    .string({ required_error: 'El documento es obligatorio.' })
    .refine((value) => isValidCedula(value) || isValidRuc(value), 'Debe ingresar una cedula o RUC ecuatoriano valido.'),
);

const positiveInt = (field, max = 1000000) =>
  z.preprocess(
    toNumber,
    z
      .number({ required_error: `${field} es obligatorio.`, invalid_type_error: `${field} debe ser numerico.` })
      .int(`${field} debe ser entero.`)
      .positive(`${field} debe ser mayor a 0.`)
      .max(max, `${field} supera el maximo permitido.`),
  );

const uuid = (field) =>
  z.preprocess(
    trimToUndefined,
    z.string({ required_error: `${field} es obligatorio.` }).uuid(`${field} no es valido.`),
  );

const nonNegativeInt = (field, max = 1000000) =>
  z.preprocess(
    toNumber,
    z
      .number({ required_error: `${field} es obligatorio.`, invalid_type_error: `${field} debe ser numerico.` })
      .int(`${field} debe ser entero.`)
      .min(0, `${field} no puede ser negativo.`)
      .max(max, `${field} supera el maximo permitido.`),
  );

const nonNegativeMoney = (field, max = 100000) =>
  z.preprocess(
    toNumber,
    z
      .number({ required_error: `${field} es obligatorio.`, invalid_type_error: `${field} debe ser numerico.` })
      .finite(`${field} debe ser numerico.`)
      .min(0, `${field} no puede ser negativo.`)
      .max(max, `${field} supera el maximo permitido.`),
  );

const booleanSchema = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const isoDate = z
  .preprocess(trimToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD.').optional())
  .optional();

const optionalNullableUuid = z.preprocess((value) => {
  if (value === '') return null;
  return value;
}, z.union([z.string().uuid('El convenio no es valido.'), z.null()]).optional());

const empleadoBase = {
  nombre: requiredText(MAX_LENGTHS.nombre, 'Nombre'),
  apellido: requiredText(MAX_LENGTHS.nombre, 'Apellido'),
  nombre_usuario: requiredText(MAX_LENGTHS.username, 'Nombre de usuario').refine(
    (value) => /^[a-zA-Z0-9._-]+$/.test(value),
    'El nombre de usuario solo puede usar letras, numeros, punto, guion y guion bajo.',
  ),
};

const orderDetailSchema = z.object({
  id_producto: positiveInt('Producto'),
  cantidad: positiveInt('Cantidad', 20),
  precio_aplicado: nonNegativeMoney('Precio aplicado'),
  opciones: z.record(z.unknown()).optional().default({}),
});

const menuOptionsSchema = z
  .array(requiredText(MAX_LENGTHS.menuOption, 'Opcion de menu'))
  .max(20, 'No puede registrar mas de 20 opciones por seccion.');

const schemas = {
  login: z.object({
    identificador: requiredText(MAX_LENGTHS.email, 'Usuario o correo').optional(),
    email: optionalText(MAX_LENGTHS.email, 'Correo'),
    password: requiredText(72, 'Contrasena'),
  }),
  refresh: z.object({
    refresh_token: requiredText(2048, 'Refresh token'),
  }),
  forgotPassword: z.object({
    correo: z.string().email('El correo no es valido.').max(MAX_LENGTHS.email, 'El correo es demasiado largo.'),
  }),
  clienteCreate: z.object({
    cedula: documentSchema,
    nombre: requiredText(MAX_LENGTHS.nombre, 'Nombre'),
    apellido: requiredText(MAX_LENGTHS.nombre, 'Apellido'),
    telefono: phoneSchema,
    correo: requiredEmailSchema,
    id_tipo_cliente: positiveInt('Tipo de cliente').optional().default(1),
    id_convenio: optionalNullableUuid,
  }),
  clienteUpdate: z.object({
    activo: booleanSchema.optional(),
    cedula: documentSchema.optional(),
    nombre: requiredText(MAX_LENGTHS.nombre, 'Nombre').optional(),
    apellido: requiredText(MAX_LENGTHS.nombre, 'Apellido').optional(),
    telefono: phoneSchema,
    correo: optionalEmailSchema,
    id_tipo_cliente: positiveInt('Tipo de cliente').optional(),
    id_convenio: optionalNullableUuid,
  }),
  recarga: z.object({
    id_producto: positiveInt('Producto'),
    cantidad_comprada: positiveInt('Cantidad comprada', 1000),
    monto_total: nonNegativeMoney('Monto total'),
    numero_factura: requiredText(MAX_LENGTHS.factura, 'Numero de factura'),
  }),
  convenioCreate: z.object({
    ruc: rucSchema,
    nombre_empresa: requiredText(MAX_LENGTHS.empresa, 'Nombre de empresa'),
    representante: optionalText(MAX_LENGTHS.empresa, 'Representante'),
    telefono: phoneSchema,
    email: z.preprocess(
      trimToUndefined,
      z.string().email('El correo no es valido.').max(MAX_LENGTHS.email, 'El correo es demasiado largo.').optional(),
    ),
    fecha_inicio: isoDate,
    fecha_caducidad: isoDate,
    cupo_maximo: nonNegativeInt('Cupo maximo', 10000).optional().default(0),
  }),
  convenioUpdate: z.object({
    activo: booleanSchema.optional(),
    ruc: rucSchema.optional(),
    nombre_empresa: requiredText(MAX_LENGTHS.empresa, 'Nombre de empresa').optional(),
    representante: optionalText(MAX_LENGTHS.empresa, 'Representante'),
    telefono: phoneSchema,
    email: z.preprocess(
      trimToUndefined,
      z.string().email('El correo no es valido.').max(MAX_LENGTHS.email, 'El correo es demasiado largo.').optional(),
    ),
    fecha_inicio: isoDate,
    fecha_caducidad: isoDate,
    cupo_maximo: nonNegativeInt('Cupo maximo', 10000).optional(),
  }),
  convenioAddClient: z.object({
    id_cliente: uuid('Cliente'),
  }),
  productoCreate: z.object({
    id_categoria: positiveInt('Categoria'),
    nombre: requiredText(80, 'Nombre del producto'),
    precio: nonNegativeMoney('Precio'),
    descripcion: optionalText(MAX_LENGTHS.descripcion, 'Descripcion'),
  }),
  productoUpdate: z.object({
    id_categoria: positiveInt('Categoria').optional(),
    nombre: requiredText(80, 'Nombre del producto').optional(),
    precio: nonNegativeMoney('Precio').optional(),
    activo: booleanSchema.optional(),
    descripcion: optionalText(MAX_LENGTHS.descripcion, 'Descripcion'),
  }),
  ordenCreate: z.object({
    id_cliente: uuid('Cliente'),
    id_estado: positiveInt('Estado'),
    id_origen: positiveInt('Origen'),
    canal_origen: optionalText(MAX_LENGTHS.canal, 'Canal'),
    observaciones: optionalText(MAX_LENGTHS.observaciones, 'Observaciones'),
    metodo_pago: optionalText(60, 'Metodo de pago'),
    detalles: z.array(orderDetailSchema).min(1, 'La orden debe tener al menos un detalle.').max(20, 'La orden no puede superar 20 detalles.'),
  }),
  ordenUpdate: z.object({
    observaciones: optionalText(MAX_LENGTHS.observaciones, 'Observaciones'),
    detalles: z.array(orderDetailSchema).min(1, 'La orden debe tener al menos un detalle.').max(20, 'La orden no puede superar 20 detalles.'),
  }),
  estadoOrden: z.object({
    id_estado: positiveInt('Estado'),
    forceFallback: booleanSchema.optional().default(false),
  }),
  empleadoCreate: z.object({
    ...empleadoBase,
    correo: z.string().email('El correo no es valido.').max(MAX_LENGTHS.email, 'El correo es demasiado largo.'),
    password: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres.').max(72, 'La contrasena no puede superar 72 caracteres.'),
    id_rol: positiveInt('Rol'),
  }),
  empleadoUpdate: z.object({
    ...empleadoBase,
    id_rol: positiveInt('Rol'),
  }),
  perfilUpdate: z.object(empleadoBase),
  passwordChange: z.object({
    currentPassword: z.string().min(1, 'La contrasena actual es obligatoria.').max(72),
    newPassword: z.string().min(8, 'La nueva contrasena debe tener al menos 8 caracteres.').max(72),
  }),
  passwordAdmin: z.object({
    password: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres.').max(72),
  }),
  empleadoEstado: z.object({
    esta_activo: booleanSchema,
  }),
  alimentoCreate: z.object({
    id_categoria: positiveInt('Categoria'),
    nombre: requiredText(80, 'Nombre del alimento'),
  }),
  categoriaProducto: z.object({
    nombre_categoria: requiredText(80, 'Nombre de categoria'),
  }),
  categoriaMenu: z.object({
    nombre_categoria: requiredText(80, 'Nombre de categoria de menu'),
  }),
  menuDiario: z.object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD.'),
    alimentos_ids: z.array(positiveInt('Alimento')).max(50, 'No puede registrar mas de 50 alimentos.'),
    imagen_url: optionalText(2048, 'URL de imagen'),
  }),
  menuDashboard: z.object({
    opciones: z.record(z.string(), menuOptionsSchema).optional().default({}),
    image: optionalText(8 * 1024 * 1024, 'Imagen'),
    confirmarEdicion: booleanSchema.optional(),
    clientIds: z.array(z.union([z.string(), z.number()])).optional(),
  }),
  menuOpciones: z.record(z.string(), menuOptionsSchema),
  telegramPrivacyResolution: z.object({
    status: z.enum(['in_review', 'resolved', 'rejected']),
    resolution_notes: optionalText(1000, 'Notas de resolucion'),
  }),
};

const formatValidationError = (error) => {
  const details = error.issues.map((issue) => ({
    campo: issue.path.join('.') || 'body',
    mensaje: issue.message,
  }));
  return {
    error: details[0]?.mensaje || 'Datos invalidos.',
    detalles: details,
  };
};

const parseBody = (schema, body) => {
  const result = schema.safeParse(body || {});
  if (result.success) return result.data;
  const error = new Error(formatValidationError(result.error).error);
  error.status = 400;
  error.payload = formatValidationError(result.error);
  throw error;
};

const sendValidationError = (res, error) => {
  if (error?.status === 400 && error.payload) {
    res.status(400).json(error.payload);
    return true;
  }
  return false;
};

module.exports = {
  MAX_LENGTHS,
  schemas,
  parseBody,
  sendValidationError,
  onlyDigits,
  normalizeEmail,
  normalizePhone,
  isValidCedula,
  isValidRuc,
};
