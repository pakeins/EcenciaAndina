const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);

export const toFiniteNumber = (value: unknown, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

export const formatMoney = (value: unknown) => toFiniteNumber(value).toFixed(2);

export const openSafeBlankWindow = () => {
  const blankWindow = window.open('', '_blank');
  if (blankWindow) blankWindow.opener = null;
  return blankWindow;
};

export const openPrintWindow = openSafeBlankWindow;
