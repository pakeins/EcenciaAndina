interface MenuImageInput {
  entradas?: string[];
  sopas?: string[];
  segundos: string[];
  postres?: string[];
  bebidas?: string[];
  guarniciones?: string[];
  date?: Date;
}

const WIDTH = 1080;
const HEIGHT = 1650;
const PADDING = 72;

const COLORS = {
  ink: '#2F4D49',
  muted: '#61603C',
  paper: '#D1CDC4',
  panel: '#ffffff',
  coffee: '#7A402E',
  copper: '#BF5D30',
  gold: '#C2803A',
  green: '#61603C',
  deepGreen: '#2F4D49',
};

const clean = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);

// Imagen sin precios para todos; el precio se muestra solo en los botones
// del cliente frecuente.
const PACKAGE_LINES = [
  'Ejecutivo Completo - entrada, sopa, plato fuerte, postre y bebida',
  'Ejecutivo Sin Sopa - entrada, plato fuerte, postre y bebida',
  'Ejecutivo Simple - plato fuerte, postre y bebida',
  'Almuerzo del Dia - sopa, plato fuerte y bebida',
  'Almuerzo del Dia Simple - plato fuerte y bebida',
];

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('es-EC', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

// Acorta la linea hasta que quepa junto con la elipsis.
const truncateToWidth = (ctx: CanvasRenderingContext2D, line: string, maxWidth: number) => {
  let truncated = line;
  while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 4) {
    truncated = truncated.slice(0, -1);
  }
  return truncated;
};

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2,
) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  if (words.length && lines.length === maxLines) {
    lines[maxLines - 1] = truncateToWidth(ctx, lines[maxLines - 1], maxWidth);
    if (lines.join(' ').length < text.length) lines[maxLines - 1] += '...';
  }
  return lines;
};

const drawSection = (
  ctx: CanvasRenderingContext2D,
  title: string,
  items: string[],
  x: number,
  y: number,
  width: number,
  accent: string,
) => {
  const sectionItems = clean(items);
  const rowHeight = title === 'Paquetes' ? 58 : 76;
  const headerHeight = 72;
  const height = headerHeight + Math.max(sectionItems.length, 1) * rowHeight + 32;

  ctx.save();
  ctx.shadowColor = 'rgba(40, 28, 20, 0.16)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = COLORS.panel;
  roundRect(ctx, x, y, width, height, 24);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = accent;
  roundRect(ctx, x, y, width, headerHeight, 24);
  ctx.fill();
  ctx.fillRect(x, y + headerHeight - 24, width, 24);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 34px Arial, sans-serif';
  ctx.fillText(title.toUpperCase(), x + 34, y + 46);

  ctx.font = '600 34px Arial, sans-serif';
  ctx.fillStyle = COLORS.ink;

  const rows = sectionItems.length ? sectionItems : ['Sin opciones configuradas'];
  rows.forEach((item, index) => {
    const rowY = y + headerHeight + 40 + index * rowHeight;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x + 42, rowY - 8, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.ink;
    const lines = wrapText(ctx, item, width - 110, 2);
    lines.forEach((line, lineIndex) => {
      ctx.fillText(line, x + 72, rowY + lineIndex * 34);
    });
  });

  return height;
};

export const buildTelegramMenuImage = ({
  entradas = [],
  sopas = [],
  segundos,
  postres = [],
  bebidas = [],
  date = new Date(),
}: MenuImageInput) => {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  if (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom')) {
    return '';
  }

  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    return '';
  }
  if (!ctx) return '';

  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const gradient = ctx.createLinearGradient(0, 0, WIDTH, 0);
  gradient.addColorStop(0, COLORS.deepGreen);
  gradient.addColorStop(0.5, COLORS.coffee);
  gradient.addColorStop(1, COLORS.copper);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, 250);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 64px Arial, sans-serif';
  ctx.fillText('Ecencia Andina', PADDING, 100);
  ctx.font = '700 46px Arial, sans-serif';
  ctx.fillText('Menu del dia', PADDING, 164);
  ctx.font = '500 30px Arial, sans-serif';
  ctx.fillText(formatDate(date), PADDING, 212);

  const contentWidth = WIDTH - PADDING * 2;
  const sections: Array<{ title: string; items: string[]; accent: string }> = [
    { title: 'Entradas', items: entradas, accent: COLORS.green },
    { title: 'Sopas', items: sopas, accent: COLORS.green },
    { title: 'Platos fuertes', items: segundos, accent: COLORS.copper },
    { title: 'Postres', items: postres, accent: COLORS.gold },
    { title: 'Bebidas', items: bebidas, accent: COLORS.deepGreen },
  ];
  let y = 302;
  for (const section of sections) {
    // Solo el plato fuerte se muestra siempre; los demas solo si hay opciones.
    if (!clean(section.items).length && section.title !== 'Platos fuertes') continue;
    y += drawSection(ctx, section.title, section.items, PADDING, y, contentWidth, section.accent) + 36;
  }
  drawSection(ctx, 'Paquetes', PACKAGE_LINES, PADDING, y, contentWidth, COLORS.gold);

  ctx.fillStyle = COLORS.muted;
  ctx.font = '500 24px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Reserva tu almuerzo usando los botones del bot', WIDTH / 2, HEIGHT - 54);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/jpeg', 0.9);
};
