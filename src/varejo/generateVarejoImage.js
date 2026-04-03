const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs   = require('fs');
const { fetchProductImage } = require('./fetchProductImage');

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

const DARK_BG     = '#FFD700';
const WHITE       = '#0c0c0c';
const CARD_BG     = 'rgba(0,0,0,0.06)';
const CARD_BORDER = 'rgba(0,0,0,0.12)';

// ── Helpers ─────────────────────────────────────────────────────────────────
function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawBackground(ctx, w, h) {
  ctx.fillStyle = DARK_BG;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  const step = 60;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(w - 60, -60, 220, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(60, h + 60, 160, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.fill();
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line + (line ? ' ' : '') + word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawDataBar(ctx, x, y, barMaxW, label, value, pct) {
  const barH    = 9;
  const barFill = Math.max(0.05, Math.min(1, pct)) * barMaxW;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font      = '19px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(truncate(label, 26), x, y);

  drawRoundRect(ctx, x, y + 8, barMaxW, barH, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();

  drawRoundRect(ctx, x, y + 8, barFill, barH, 4);
  const grad = ctx.createLinearGradient(x, 0, x + barFill, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font      = '19px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(value, x + barMaxW, y);
}

/**
 * Desenha imagem em modo COVER (preenche a área, centraliza e recorta).
 */
async function drawImgCover(ctx, imgUrl, x, y, w, h, radius = 20) {
  if (!imgUrl) return false;
  try {
    const img   = await loadImage(imgUrl);
    const scale = Math.max(w / img.width, h / img.height);
    const dw    = img.width  * scale;
    const dh    = img.height * scale;
    const dx    = x + (w - dw) / 2;
    const dy    = y + (h - dh) / 2;

    ctx.save();
    drawRoundRect(ctx, x, y, w, h, radius);
    ctx.clip();
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();

    // Borda
    drawRoundRect(ctx, x, y, w, h, radius);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth   = 3;
    ctx.stroke();
    return true;
  } catch {
    return false;
  }
}

/**
 * Desenha imagem em modo CONTAIN (exibe o produto inteiro, sem corte).
 */
async function drawImgContain(ctx, imgUrl, x, y, w, h, radius = 20) {
  if (!imgUrl) return false;
  try {
    const img   = await loadImage(imgUrl);
    const scale = Math.min(w / img.width, h / img.height);
    const dw    = img.width  * scale;
    const dh    = img.height * scale;
    const dx    = x + (w - dw) / 2;
    const dy    = y + (h - dh) / 2;

    // Fundo arredondado atrás da imagem
    drawRoundRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();

    ctx.save();
    drawRoundRect(ctx, x, y, w, h, radius);
    ctx.clip();
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();

    drawRoundRect(ctx, x, y, w, h, radius);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth   = 3;
    ctx.stroke();
    return true;
  } catch {
    return false;
  }
}

/** Badge de categoria: fundo preto sólido, texto gold */
function drawCategoryBadge(ctx, text, x, y, align = 'left') {
  ctx.font = 'bold 26px sans-serif';
  const textW  = ctx.measureText(text).width;
  const padH   = 14, padV = 14;
  const badgeW = textW + padH * 2;
  const badgeH = 26 + padV * 2;

  const bx = align === 'center' ? x - badgeW / 2
           : align === 'right'  ? x - badgeW
           : x;

  drawRoundRect(ctx, bx, y, badgeW, badgeH, badgeH / 2);
  ctx.fillStyle = '#0c0c0c';
  ctx.fill();

  ctx.fillStyle    = '#FFD700';
  ctx.textAlign    = align === 'center' ? 'center' : 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, align === 'center' ? x : bx + padH, y + badgeH / 2);
  ctx.textBaseline = 'alphabetic';

  return badgeH;
}

// ── Feed 1080×1080 ───────────────────────────────────────────────────────────
// Layout: título hero no topo (full width) → separador → coluna esquerda com
// dados + coluna direita com imagem grande (460×460)
async function generateVarejoFeedImage(trendData, articleTitle = '') {
  const W = 1080, H = 1080;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const PAD    = 60;

  drawBackground(ctx, W, H);

  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(0, 0, W, 6);

  // ── Handle ────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0c0c0c';
  ctx.font      = 'bold 30px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('@vendaexponencial', PAD, 62);

  ctx.font = 'bold 22px sans-serif';
  const subText = '📊  TENDÊNCIAS DO VAREJO';
  const subW    = ctx.measureText(subText).width + 36;
  drawRoundRect(ctx, PAD, 76, subW, 36, 18);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fill();
  ctx.fillStyle = '#0c0c0c';
  ctx.textAlign = 'left';
  ctx.fillText(subText, PAD + 18, 100);

  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(PAD, 128, W - PAD * 2, 1);

  // ── TÍTULO — hero (full width) ────────────────────────────────────────────
  let titleBottom = 142;
  if (articleTitle) {
    ctx.font = 'bold 50px sans-serif';
    const titleLines = wrapLines(ctx, articleTitle, W - PAD * 2);
    const lineH      = 66;
    const maxLines   = 3;
    const displayed  = titleLines.slice(0, maxLines);

    ctx.fillStyle = '#0c0c0c';
    ctx.textAlign = 'left';
    displayed.forEach((line, i) => {
      const text = (i === maxLines - 1 && titleLines.length > maxLines)
        ? truncate(line, 30) : line;
      ctx.fillText(text, PAD, 142 + 60 + i * lineH);
    });

    titleBottom = 142 + 60 + displayed.length * lineH + 14;
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(PAD, titleBottom, 70, 4);
    titleBottom += 20;
  }

  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(PAD, titleBottom + 6, W - PAD * 2, 1);
  const dataY = titleBottom + 24;

  // ── Coluna direita: IMAGEM GRANDE ────────────────────────────────────────
  const IMG_W = 460, IMG_H = H - dataY - PAD - 6;
  const imgX  = W - PAD - IMG_W;
  const imgY  = dataY;

  const topTerm = (trendData.specificTrends || [])[0];
  const imgUrlPromise = topTerm
    ? fetchProductImage(topTerm.keyword, trendData.categoria?.label || '')
    : Promise.resolve(null);

  // ── Coluna esquerda: dados ────────────────────────────────────────────────
  const leftW = W - PAD * 3 - IMG_W;   // largura disponível na coluna esquerda
  let leftY   = dataY;

  const catBadgeH = drawCategoryBadge(
    ctx, trendData.categoria.label.toUpperCase(), PAD, leftY, 'left'
  );
  leftY += catBadgeH + 16;

  if (topTerm) {
    const heroPct   = topTerm.isBreakout ? 'BREAKOUT' : topTerm.value ? `+${topTerm.value}%` : `${topTerm.avgInterest || ''}`;
    const heroColor = topTerm.isBreakout ? '#8B0000' : '#0c0c0c';

    ctx.fillStyle = heroColor;
    ctx.font      = 'bold 96px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(heroPct, PAD, leftY + 96);

    ctx.fillStyle = WHITE;
    ctx.font      = 'bold 34px sans-serif';
    ctx.fillText(truncate(topTerm.keyword, 18), PAD, leftY + 148);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font      = '22px sans-serif';
    ctx.fillText('nas buscas', PAD, leftY + 180);
    ctx.fillText('últimos 90 dias', PAD, leftY + 206);

    leftY += 228;
  }

  const others = (trendData.specificTrends || []).slice(1, 4);
  if (others.length) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(PAD, leftY + 8, leftW, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font      = '18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TAMBÉM EM ALTA', PAD, leftY + 28);

    const maxVal  = Math.max(...others.map(t => t.value || t.avgInterest || 1));
    others.forEach((t, i) => {
      const y   = leftY + 46 + i * 62;
      const val = t.isBreakout ? 'BREAKOUT' : t.value ? `+${t.value}%` : t.avgInterest ? `${t.avgInterest}/100` : '';
      const pct = (t.value || t.avgInterest || 1) / (maxVal || 1);
      drawDataBar(ctx, PAD, y, leftW, truncate(t.keyword, 22), val, pct);
    });
  }

  // ── Borda inferior ────────────────────────────────────────────────────────
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(0, H - 6, W, 6);

  // ── Imagem do produto (aguarda e preenche coluna direita) ─────────────────
  const imgUrl = await imgUrlPromise;
  const drawn  = imgUrl && await drawImgCover(ctx, imgUrl, imgX, imgY, IMG_W, Math.min(IMG_H, 500), 24);
  if (!drawn) {
    // Placeholder
    drawRoundRect(ctx, imgX, imgY, IMG_W, Math.min(IMG_H, 500), 24);
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fill();
    drawRoundRect(ctx, imgX, imgY, IMG_W, Math.min(IMG_H, 500), 24);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const filename = `varejo_${Date.now()}.png`;
  const filepath = path.join(ASSETS_DIR, filename);
  fs.writeFileSync(filepath, canvas.toBuffer('image/png'));
  return { filepath, filename };
}

// ── Story 1080×1920 ──────────────────────────────────────────────────────────
// Layout: título → badge de categoria → IMAGEM GRANDE (quase full-width) →
// % hero + produto → 2 barras → CTA
async function generateVarejoStoryImage(trendData, articleTitle = '') {
  const W = 1080, H = 1920;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const SAFE_TOP    = 270;
  const SAFE_BOTTOM = 1600;
  const CX          = W / 2;
  const PAD         = 80;

  drawBackground(ctx, W, H);

  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(PAD, SAFE_TOP, W - PAD * 2, 4);

  // ── Handle ────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0c0c0c';
  ctx.font      = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('@vendaexponencial', CX, SAFE_TOP + 54);

  ctx.font = 'bold 21px sans-serif';
  const subText = '📊  TENDÊNCIAS DO VAREJO';
  const subW    = ctx.measureText(subText).width + 40;
  drawRoundRect(ctx, CX - subW / 2, SAFE_TOP + 66, subW, 40, 20);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fill();
  ctx.fillStyle = '#0c0c0c';
  ctx.fillText(subText, CX, SAFE_TOP + 92);

  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(PAD, SAFE_TOP + 122, W - PAD * 2, 1);

  // ── TÍTULO ────────────────────────────────────────────────────────────────
  let titleBottom = SAFE_TOP + 138;
  if (articleTitle) {
    ctx.font = 'bold 48px sans-serif';
    const titleLines = wrapLines(ctx, articleTitle, W - PAD * 2);
    const lineH      = 62;
    const maxLines   = 3;
    const displayed  = titleLines.slice(0, maxLines);

    ctx.fillStyle = '#0c0c0c';
    ctx.textAlign = 'center';
    displayed.forEach((line, i) => {
      const text = (i === maxLines - 1 && titleLines.length > maxLines)
        ? truncate(line, 28) + '…' : line;
      ctx.fillText(text, CX, titleBottom + 52 + i * lineH);
    });

    titleBottom = titleBottom + 52 + displayed.length * lineH + 12;
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(CX - 40, titleBottom, 80, 4);
    titleBottom += 20;
  }

  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(PAD, titleBottom + 6, W - PAD * 2, 1);
  let dataY = titleBottom + 22;

  // ── Badge de categoria ────────────────────────────────────────────────────
  const catBadgeH = drawCategoryBadge(
    ctx, trendData.categoria.label.toUpperCase(), CX, dataY, 'center'
  );
  dataY += catBadgeH + 16;

  // ── IMAGEM GRANDE (quase full-width, modo contain) ────────────────────────
  const topTerm = (trendData.specificTrends || [])[0];
  const IMG_W   = W - PAD * 2;    // 920px de largura
  const IMG_H   = 400;
  const imgX    = PAD;
  const imgY    = dataY;

  const imgUrlPromise = topTerm
    ? fetchProductImage(topTerm.keyword, trendData.categoria?.label || '')
    : Promise.resolve(null);

  dataY += IMG_H + 24;

  // ── % hero + produto ──────────────────────────────────────────────────────
  if (topTerm) {
    const heroPct   = topTerm.isBreakout ? 'BREAKOUT' : topTerm.value ? `+${topTerm.value}%` : `${topTerm.avgInterest || ''}`;
    const heroColor = topTerm.isBreakout ? '#8B0000' : '#0c0c0c';

    ctx.fillStyle = heroColor;
    ctx.font      = 'bold 110px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(heroPct, CX, dataY + 110);

    const numW = ctx.measureText(heroPct).width;
    ctx.fillStyle = heroColor;
    ctx.fillRect(CX - numW / 2, dataY + 124, numW, 5);

    ctx.fillStyle = WHITE;
    ctx.font      = 'bold 44px sans-serif';
    ctx.fillText(truncate(topTerm.keyword, 20), CX, dataY + 182);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font      = '26px sans-serif';
    ctx.fillText('nas buscas — últimos 90 dias', CX, dataY + 222);
  }

  // ── CTA ───────────────────────────────────────────────────────────────────
  const ctaY = SAFE_BOTTOM - 100;
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(0, ctaY - 10, W, 100);
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(PAD, ctaY - 10, W - PAD * 2, 3);
  ctx.fillStyle = WHITE;
  ctx.font      = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Leia a análise completa — link na bio 👆', CX, ctaY + 40);

  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(PAD, SAFE_BOTTOM - 4, W - PAD * 2, 4);

  // ── Imagem do produto (aguarda e desenha) ─────────────────────────────────
  const imgUrl = await imgUrlPromise;
  const drawn  = imgUrl && await drawImgContain(ctx, imgUrl, imgX, imgY, IMG_W, IMG_H, 24);
  if (!drawn) {
    drawRoundRect(ctx, imgX, imgY, IMG_W, IMG_H, 24);
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fill();
    drawRoundRect(ctx, imgX, imgY, IMG_W, IMG_H, 24);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const filename = `varejo_story_${Date.now()}.png`;
  const filepath = path.join(ASSETS_DIR, filename);
  fs.writeFileSync(filepath, canvas.toBuffer('image/png'));
  return { filepath, filename };
}

module.exports = { generateVarejoFeedImage, generateVarejoStoryImage };
