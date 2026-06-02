const { createCanvas, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

const FONTS_DIR  = path.join(__dirname, '..', '..', 'fonts');
const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

// Tipografia: condensada bold para títulos/números, sans regular para corpo.
registerFont(path.join(FONTS_DIR, 'DejaVuSans.ttf'),               { family: 'VX Sans' });
registerFont(path.join(FONTS_DIR, 'DejaVuSans-Bold.ttf'),          { family: 'VX Sans', weight: 'bold' });
registerFont(path.join(FONTS_DIR, 'DejaVuSansCondensed-Bold.ttf'), { family: 'VX Cond', weight: 'bold' });

// Sistema visual editorial claro + acento dourado + slide de virada escuro.
const PAPER = '#F4F0E6'; // off-white quente
const INK   = '#16140F'; // quase preto
const GOLD  = '#E0A400'; // dourado mais profundo (contraste no claro)
const GRAY  = '#524E45'; // corpo sobre claro
const PAPER_DIM = 'rgba(22,20,15,0.55)';   // texto secundário no claro
const W = 1080;
const H = 1350; // 4:5

const HEAD = (px) => `bold ${px}px "VX Cond"`;   // títulos/números
const BODY = (px) => `${px}px "VX Sans"`;        // corpo
const BODYB = (px) => `bold ${px}px "VX Sans"`;  // labels

function wrapLines(ctx, text, maxWidth) {
  const words = (text || '').split(' ');
  const lines = []; let line = '';
  for (const w of words) {
    const test = line + w + ' ';
    if (ctx.measureText(test).width > maxWidth && line !== '') { lines.push(line.trim()); line = w + ' '; }
    else line = test;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function drawWrapped(ctx, text, x, y, maxWidth, lineHeight, maxLines = Infinity) {
  const lines = wrapLines(ctx, text, maxWidth).slice(0, maxLines);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

// "Destaca" o primeiro número encontrado no texto (ex.: 134 milhões, 30%, R$ 50).
function extrairDestaque(texto) {
  if (!texto) return null;
  // Ordem do maior para o menor: "milhões" antes de "mil" para não casar o prefixo.
  const m = texto.match(/(R?\$?\s?\d[\d.,]*\s?(?:%|bilh(?:ão|ões)|milh(?:ão|ões)|mil|pontos)?)/i);
  return m ? m[1].trim() : null;
}

// Assinatura + filete superior (varia cor conforme fundo).
function marca(ctx, dark) {
  const c = dark ? PAPER : INK;
  ctx.fillStyle = GOLD; ctx.fillRect(60, 70, 56, 8); // marcador dourado
  ctx.fillStyle = c; ctx.font = BODYB(26); ctx.textAlign = 'left';
  ctx.fillText('VENDA EXPONENCIAL', 132, 92);
}

function rodape(ctx, dark, esquerda, direita) {
  const dim = dark ? 'rgba(244,240,230,0.55)' : PAPER_DIM;
  ctx.fillStyle = dim; ctx.font = BODYB(22); ctx.textAlign = 'left';
  ctx.fillText(esquerda, 60, H - 60);
  if (direita) { ctx.textAlign = 'right'; ctx.fillText(direita, W - 60, H - 60); }
}

function drawCover(content) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);

  marca(ctx, false);

  // Badge categoria (contorno dourado)
  ctx.font = BODYB(22); ctx.textAlign = 'left';
  const badge = content.categoria;
  const bw = ctx.measureText(badge).width + 44;
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(60, 170, bw, 50, 25); ctx.stroke();
  ctx.fillStyle = GOLD; ctx.fillText(badge, 82, 202);

  // Headline grande condensado (protagonista da capa)
  ctx.fillStyle = INK; ctx.font = HEAD(98); ctx.textAlign = 'left';
  const yEnd = drawWrapped(ctx, content.capa.titulo, 60, 400, W - 120, 104, 6);

  // Régua dourada
  ctx.fillStyle = GOLD; ctx.fillRect(60, yEnd + 24, 160, 10);

  // Gancho
  if (content.capa.gancho) {
    ctx.fillStyle = GRAY; ctx.font = BODY(38);
    drawWrapped(ctx, content.capa.gancho, 60, yEnd + 96, W - 140, 50, 4);
  }

  // Indicador de arraste
  ctx.fillStyle = INK; ctx.font = BODYB(26); ctx.textAlign = 'right';
  ctx.fillText('arraste  →', W - 60, H - 70);
  return canvas;
}

function drawContentSlide(content, slide, index, total, dark) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = dark ? INK : PAPER; ctx.fillRect(0, 0, W, H);
  marca(ctx, dark);

  // Número do slide grande, em contorno/leve no topo direito
  ctx.font = HEAD(150); ctx.textAlign = 'right';
  ctx.fillStyle = dark ? 'rgba(224,164,0,0.9)' : 'rgba(22,20,15,0.10)';
  ctx.fillText(String(index).padStart(2, '0'), W - 60, 250);

  // Destaque numérico do conteúdo, se existir
  const destaque = extrairDestaque(slide.texto);
  let y = 380;
  if (destaque) {
    ctx.textAlign = 'left'; ctx.fillStyle = GOLD;
    let fsize = 130;
    ctx.font = HEAD(fsize);
    while (ctx.measureText(destaque).width > W - 120 && fsize > 60) {
      fsize -= 6; ctx.font = HEAD(fsize);
    }
    ctx.fillText(destaque, 60, y);
    y += 70;
  }

  // Título do slide
  ctx.textAlign = 'left';
  ctx.fillStyle = dark ? PAPER : INK; ctx.font = HEAD(58);
  const yTit = drawWrapped(ctx, slide.titulo, 60, y, W - 120, 66, 3);

  // Régua dourada curta
  ctx.fillStyle = GOLD; ctx.fillRect(60, yTit + 18, 120, 8);

  // Corpo
  ctx.fillStyle = dark ? 'rgba(244,240,230,0.86)' : GRAY; ctx.font = BODY(38);
  drawWrapped(ctx, slide.texto, 60, yTit + 80, W - 120, 54, 9);

  rodape(ctx, dark, '@vendaexponencial', `${index} / ${total}`);
  return canvas;
}

function drawCta(content) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
  marca(ctx, true);

  ctx.textAlign = 'center';
  ctx.fillStyle = PAPER; ctx.font = HEAD(74);
  const yTit = drawWrapped(ctx, content.cta.titulo, W / 2, 470, W - 130, 84, 4);

  ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - 80, yTit + 20, 160, 10);

  ctx.fillStyle = 'rgba(244,240,230,0.82)'; ctx.font = BODY(38);
  drawWrapped(ctx, content.cta.texto, W / 2, yTit + 90, W - 150, 52, 4);

  // Bloco de marca dourado
  ctx.fillStyle = GOLD; ctx.font = HEAD(54);
  ctx.fillText('@vendaexponencial', W / 2, H - 230);
  ctx.fillStyle = 'rgba(244,240,230,0.6)'; ctx.font = BODYB(26);
  ctx.fillText('SIGA  ·  COMENTE  ·  COMPARTILHE', W / 2, H - 170);
  return canvas;
}

/**
 * Gera os PNGs do carrossel. Retorna [{ filepath, filename }] na ordem de exibição.
 * Sistema: capa clara → slides claros → 1 slide escuro de "virada" → CTA escura.
 */
async function generateCarouselImages(content) {
  const canvases = [];
  canvases.push(await drawCover(content));

  const total = content.slides.length;
  // Pattern interrupt: escurece o slide do meio (reduz drop-off).
  const darkIdx = total >= 3 ? Math.floor(total / 2) : -1;
  content.slides.forEach((s, i) => {
    canvases.push(drawContentSlide(content, s, i + 1, total, i === darkIdx));
  });

  canvases.push(drawCta(content));

  const stamp = Date.now();
  return canvases.map((canvas, i) => {
    const filename = `carrossel_${stamp}_${String(i).padStart(2, '0')}.png`;
    const filepath = path.join(ASSETS_DIR, filename);
    fs.writeFileSync(filepath, canvas.toBuffer('image/png'));
    return { filepath, filename };
  });
}

module.exports = { generateCarouselImages };
