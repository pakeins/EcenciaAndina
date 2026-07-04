const PERSON_NAME_PATTERN = /^\p{L}+(?:[ '-]\p{L}+)*$/u;

export const normalizePersonName = (value: string) => value.trim().replace(/\s+/g, ' ');

export const isValidPersonName = (value: string) => {
  const normalized = normalizePersonName(value);
  return normalized.length >= 2 && normalized.length <= 80 && PERSON_NAME_PATTERN.test(normalized);
};

export const sanitizePersonNameInput = (value: string) =>
  value.replace(/[0-9<>]/g, '').replace(/\s+/g, ' ');

export const isPositiveInteger = (value: number | string) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0;
};

export const isConvenioVigente = (convenio: { activo?: boolean; vigente?: boolean; fecha_caducidad?: string }) => {
  if (convenio.vigente !== undefined) return Boolean(convenio.activo && convenio.vigente);
  if (!convenio.activo || !convenio.fecha_caducidad) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${convenio.fecha_caducidad}T00:00:00`) >= today;
};
