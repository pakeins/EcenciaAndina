const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value: string | number | boolean | null | undefined) =>
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

// Abre el documento en una ventana nueva via Blob URL (document.write esta
// deprecado); el blob se libera cuando el documento termina de cargar.
export const openPrintWindow = (html: string) => {
  const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const printWindow = window.open(blobUrl, '_blank');
  if (!printWindow) {
    URL.revokeObjectURL(blobUrl);
    return null;
  }
  printWindow.opener = null;
  printWindow.addEventListener('load', () => URL.revokeObjectURL(blobUrl));
  return printWindow;
};
