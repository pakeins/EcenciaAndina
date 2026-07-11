interface MenuImageSection {
  title: string;
  items: string[];
  accent: string;
}

interface MenuImageInput {
  sections: MenuImageSection[];
  date?: Date;
  combos?: { icon: string; name: string; desc: string }[];
}

const WIDTH = 1080;
const PADDING = 64;
const HEADER_HEIGHT = 200;

const COLORS = {
  ink: '#2f261f',
  muted: '#6e6258',
  paper: '#fffaf2',
  panel: '#ffffff',
  coffee: '#4b2f22',
};

const clean = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);

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
    while (ctx.measureText(lines[maxLines - 1] + '...').width > maxWidth && lines[maxLines - 1].length > 4) {
      lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1);
    }
    if (lines.join(' ').length < text.length) lines[maxLines - 1] += '...';
  }
  return lines;
};

const SECTION_HEADER = 64;
const SECTION_FIRST_GAP = 48;
const SECTION_ROW_ALLOC = 54;

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
  const rows = sectionItems.length ? sectionItems : ['Sin opciones configuradas'];

  // Measure text to find exact visual bottom
  ctx.font = '500 30px Arial, sans-serif';
  const rowY = (index: number) => y + SECTION_HEADER + SECTION_FIRST_GAP + index * SECTION_ROW_ALLOC;
  let visualBottom = y + SECTION_HEADER;
  rows.forEach((item, index) => {
    const rY = rowY(index);
    const lines = wrapText(ctx, item, width - 90, 2);
    const bottom = rY + (lines.length - 1) * 36 + 8;
    if (bottom > visualBottom) visualBottom = bottom;
  });

  const height = visualBottom - y + 16;

  ctx.save();
  ctx.shadowColor = 'rgba(40, 28, 20, 0.16)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = COLORS.panel;
  roundRect(ctx, x, y, width, height, 20);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = accent;
  roundRect(ctx, x, y, width, SECTION_HEADER, 20);
  ctx.fill();
  ctx.fillRect(x, y + SECTION_HEADER - 20, width, 20);

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 30px Arial, sans-serif';
  ctx.fillText(title.toUpperCase(), x + 28, y + 42);

  ctx.font = '500 30px Arial, sans-serif';
  ctx.fillStyle = COLORS.ink;

  rows.forEach((item, index) => {
    const rY = rowY(index);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x + 34, rY - 10, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.ink;
    const lines = wrapText(ctx, item, width - 90, 2);
    lines.forEach((line, lineIndex) => {
      ctx.fillText(line, x + 60, rY + lineIndex * 36);
    });
  });

  return height;
};

const drawCombosBox = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  combos: { icon: string; name: string; desc: string }[]
) => {
  const title = "Tipos de Almuerzo";
  const accent = COLORS.coffee;
  
  if (!combos || combos.length === 0) {
    // If no combos are provided, we don't draw anything
    return 0;
  }

  const rowHeight = 48;
  const paddingY = 24;
  const height = SECTION_HEADER + paddingY * 2 + combos.length * rowHeight;

  ctx.save();
  ctx.shadowColor = 'rgba(40, 28, 20, 0.16)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = COLORS.panel;
  roundRect(ctx, x, y, width, height, 20);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = accent;
  roundRect(ctx, x, y, width, SECTION_HEADER, 20);
  ctx.fill();
  ctx.fillRect(x, y + SECTION_HEADER - 20, width, 20);

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 30px Arial, sans-serif';
  ctx.fillText(title.toUpperCase(), x + 28, y + 42);

  combos.forEach((combo, index) => {
    const cy = y + SECTION_HEADER + paddingY + index * rowHeight + 32;
    
    // Icon
    ctx.font = '26px Arial, sans-serif';
    ctx.fillText(combo.icon, x + 28, cy);
    
    // Name (Bold)
    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 26px Arial, sans-serif';
    ctx.fillText(combo.name, x + 68, cy);
    
    // Desc (Normal)
    const nameWidth = ctx.measureText(combo.name).width;
    ctx.font = '400 26px Arial, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(" " + combo.desc, x + 68 + nameWidth, cy);
  });

  return height;
};

export const buildTelegramMenuImage = ({ sections, date = new Date(), combos = [] }: MenuImageInput) => {
  if (!sections.length) return '';

  const GENEROUS_HEIGHT = 5000;
  const contentWidth = WIDTH - PADDING * 2;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = GENEROUS_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, WIDTH, GENEROUS_HEIGHT);

  ctx.fillStyle = COLORS.coffee;
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 52px Arial, sans-serif';
  ctx.fillText('Ecencia Andina', PADDING, 80);
  ctx.font = '600 38px Arial, sans-serif';
  ctx.fillText('Menu del dia', PADDING, 132);
  ctx.font = '500 26px Arial, sans-serif';
  ctx.fillText(formatDate(date), PADDING, 174);

  let y = HEADER_HEIGHT + 48;
  for (const section of sections) {
    y += drawSection(ctx, section.title, section.items, PADDING, y, contentWidth, section.accent) + 28;
  }
  
  y += drawCombosBox(ctx, PADDING, y, contentWidth, combos) + 40;

  const footerY = y + 20;
  ctx.fillStyle = '#458B00'; // Eco green
  ctx.font = 'italic 600 26px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🌿 Nuestros platos están elaborados con productos agroecológicos 🌿', WIDTH / 2, footerY);

  ctx.fillStyle = COLORS.muted;
  ctx.font = '500 22px Arial, sans-serif';
  ctx.fillText('Reserva tu almuerzo respondiendo con los botones del bot', WIDTH / 2, footerY + 40);
  ctx.textAlign = 'left';

  const exactHeight = footerY + 80;
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = WIDTH;
  finalCanvas.height = exactHeight;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) return '';
  finalCtx.drawImage(canvas, 0, 0);

  return finalCanvas.toDataURL('image/jpeg', 0.9);
};
