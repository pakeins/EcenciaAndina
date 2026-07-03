const PERSON_NAME_PATTERN = /^\p{L}+(?:[ '-]\p{L}+)*$/u;

const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const normalizePersonName = (value) => normalizeText(value);

const validatePersonName = (value, fieldName) => {
  const normalized = normalizePersonName(value);
  if (normalized.length < 2 || normalized.length > 80 || !PERSON_NAME_PATTERN.test(normalized)) {
    return {
      error: `${fieldName} solo debe contener letras, espacios, apostrofes o guiones.`,
    };
  }
  return { value: normalized };
};

const isPositiveInteger = (value) => Number.isInteger(Number(value)) && Number(value) > 0;

const startOfLocalDay = (date = new Date()) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const isConvenioVigente = (convenio, now = new Date()) => {
  if (!convenio || convenio.esta_activo === false || convenio.activo === false) return false;
  const endDate = convenio.fecha_caducidad || convenio.fecha_fin;
  if (!endDate) return false;
  return new Date(`${endDate}T00:00:00`) >= startOfLocalDay(now);
};

const isValidOrderTransition = (currentState, nextState) => {
  const current = Number(currentState);
  const next = Number(nextState);
  if (current === next) return true;
  if (current === 1 && [2, 3].includes(next)) return true;
  return false;
};

// Descuenta primero del saldo del mismo producto; devuelve lo que falta.
const deductFromExactBalance = (saldosDisponibles, requestedProductId, cantidadRestante, deducciones) => {
  const saldoExacto = saldosDisponibles.find((saldo) => saldo.id_producto === requestedProductId);
  if (!saldoExacto || saldoExacto.cantidad <= 0) return cantidadRestante;

  const descontar = Math.min(saldoExacto.cantidad, cantidadRestante);
  saldoExacto.cantidad -= descontar;
  deducciones.push({ id_producto_saldo: saldoExacto.id_producto, cantidad: descontar });
  return cantidadRestante - descontar;
};

// Cubre el resto con saldos de productos equivalentes (precio >= pedido),
// del mas barato al mas caro; marca fallback si uso un saldo mas caro.
const deductFromEquivalentBalances = (saldosDisponibles, { requestedProductId, precioPedido, cantidadRestante, deducciones }) => {
  let fallbackUsed = false;
  const saldosEquivalentes = saldosDisponibles
    .filter((saldo) => saldo.precio >= precioPedido && saldo.cantidad > 0)
    .sort((a, b) => a.precio - b.precio);

  for (const saldo of saldosEquivalentes) {
    if (cantidadRestante === 0) break;
    const descontar = Math.min(saldo.cantidad, cantidadRestante);
    saldo.cantidad -= descontar;
    cantidadRestante -= descontar;
    deducciones.push({ id_producto_saldo: saldo.id_producto, cantidad: descontar });

    if (saldo.id_producto !== requestedProductId && saldo.precio > precioPedido) {
      fallbackUsed = true;
    }
  }

  return { cantidadRestante, fallbackUsed };
};

const calculateSaldoDeductions = ({ detalles, saldosCliente, productosPedidos, forceFallback = false }) => {
  const saldosDisponibles = (saldosCliente || []).map((saldo) => ({
    id_producto: Number(saldo.id_producto),
    cantidad: Number(saldo.cantidad_disponible),
    precio: Number(Array.isArray(saldo.productos) ? saldo.productos[0]?.precio_unitario : saldo.productos?.precio_unitario),
  }));

  const productos = (productosPedidos || []).map((producto) => ({
    id_producto: Number(producto.id_producto),
    precio_unitario: Number(producto.precio_unitario),
  }));

  const deducciones = [];
  let fallbackUsed = false;

  for (const detalle of detalles || []) {
    const requestedProductId = Number(detalle.id_producto);
    const productoPedido = productos.find((producto) => producto.id_producto === requestedProductId);
    const precioPedido = productoPedido ? productoPedido.precio_unitario : 0;

    let cantidadRestante = deductFromExactBalance(
      saldosDisponibles,
      requestedProductId,
      Number(detalle.cantidad),
      deducciones,
    );

    if (cantidadRestante > 0) {
      const equivalente = deductFromEquivalentBalances(saldosDisponibles, {
        requestedProductId,
        precioPedido,
        cantidadRestante,
        deducciones,
      });
      cantidadRestante = equivalente.cantidadRestante;
      fallbackUsed = fallbackUsed || equivalente.fallbackUsed;
    }

    if (cantidadRestante > 0) {
      return {
        ok: false,
        status: 400,
        error: 'El cliente no tiene saldo suficiente en su monedero. Por favor recargue el saldo.',
      };
    }
  }

  if (fallbackUsed && !forceFallback) {
    return {
      ok: false,
      status: 409,
      requireConfirmation: true,
      error: 'El cliente no tiene saldo exacto para este producto. Se utilizará el saldo de un almuerzo equivalente. ¿Desea continuar?',
    };
  }

  return { ok: true, deducciones, fallbackUsed };
};

const groupDeductions = (deducciones) => deducciones.reduce((acc, deduccion) => {
  acc[deduccion.id_producto_saldo] = (acc[deduccion.id_producto_saldo] || 0) + deduccion.cantidad;
  return acc;
}, {});

module.exports = {
  calculateSaldoDeductions,
  groupDeductions,
  isConvenioVigente,
  isPositiveInteger,
  isValidOrderTransition,
  normalizePersonName,
  validatePersonName,
};
