const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs   = require('fs');
const { fetchProductImage } = require('./fetchProductImage');

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

// ── Paleta invertida: fundo gold, texto escuro ───────────────────────────────
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

function drawDataBar(ctx, x, y, barMaxW, label, value, pct, isTop) {
  const barH    = 10;
  const barFill = Math.max(0.05, Math.min(1, pct)) * barMaxW;

  ctx.fillStyle = isTop ? '#0c0c0c' : 'rgba(0,0,0,0.55)';
  ctx.font      = isTop ? 'bold 22px sans-serif' : '20px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(truncate(label, 28), x, y);

  drawRoundRect(ctx, x, y + 10, barMaxW, barH, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();

  drawRoundRect(ctx, x, y + 10, barFill, barH, 5);
  const grad = ctx.createLinearGradient(x, 0, x + barFill, 0);
  grad.addColorStop(0, isTop ? '#0c0c0c' : 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, isTop ? '#333333' : 'rgba(0,0,0,0.25)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.fillStyle = isTop ? '#0c0c0c' : 'rgba(0,0,0,0.55)';
  ctx.font      = isTop ? 'bold 22px sans-serif' : '20px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(value, x + barMaxW, y);
}

/**
 * Desenha uma imagem do produto recortada em retângulo arredondado.
 * Mantém proporção (cover), centraliza. Retorna a altura usada.
 */
async function drawProductImage(ctx, imgUrl, x, y, w, h, radius = 16) {
  if (!imgUrl) return false;
  try {
    const img = await loadImage(imgUrl);

    // Cover: escala para preencher toda a área
    const scale = Math.max(w / img.width, h / img.height);
    const dw    = img.width * scale;
    const dh    = img.height * scale;
    const dx    = x + (w - dw) / 2;
    const dy    = y + (h - dh) / 2;

    ctx.save();
    drawRoundRect(ctx, x, y, w, h, radius);
    ctx.clip();
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();

    // Borda sutil
    drawRoundRect(ctx, x, y, w, h, radius);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    return true;
  } catch {
    return false;
  }
}

/** Badge de categoria: fundo preto sólido, texto gold — grande e destacado */
function drawCategoryBadge(ctx, text, x, y, align = 'left') {
  ctx.font = 'bold 26px sans-serif';
  const textW  = ctx.measureText(text).width;
  const padH   = 14;
  const padV   = 16;
  const badgeW = textW + padH * 2;
  const badgeH = 26 + padV * 2;  // font size + vertical padding

  const bx = align === 'center' ? x - badgeW / 2
           : align === 'right'  ? x - badgeW
           : x;

  drawRoundRect(ctx, bx, y, badgeW, badgeH, badgeH / 2);
  ctx.fillStyle = '#0c0c0c';
  ctx.fill();

  ctx.fillStyle  = '#FFD700';
  ctx.textAlign  = align === 'center' ? 'center' : 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, align === 'center' ? x : bx + padH, y + badgeH / 2);
  ctx.textBaseline = 'alphabetic';

  return badgeH;
}

// ── Feed 1080×1080 ───────────────────────────────────────────────────────────
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

  // ── Badge "TENDÊNCIAS DO VAREJO" ─────────────────────────────────────────
  ctx.font = 'bold 22px sans-serif';
  const subBadgeText = '📊  TENDÊNCIAS DO VAREJO';
  const subBadgeW    = ctx.measureText(subBadgeText).width + 36;
  drawRoundRect(ctx, PAD, 76, subBadgeW, 36, 18);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fill();
  ctx.fillStyle  = '#0c0c0c';
  ctx.textAlign  = 'left';
  ctx.fillText(subBadgeText, PAD + 18, 100);

  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(PAD, 130, W - PAD * 2, 1);

  // ── TÍTULO — hero no topo ─────────────────────────────────────────────────
  let titleBottom = 145;
  if (articleTitle) {
    ctx.font = 'bold 50px sans-serif';
    const maxW       = W - PAD * 2;
    const titleLines = wrapLines(ctx, articleTitle, maxW);
    const lineH      = 66;
    const maxLines   = 4;
    const displayed  = titleLines.slice(0, maxLines);

    ctx.fillStyle = '#0c0c0c';
    ctx.textAlign = 'left';
    displayed.forEach((line, i) => {
      const text = (i === maxLines - 1 && titleLines.length > maxLines)
        ? truncate(line, 30) : line;
      ctx.fillText(text, PAD, 145 + 60 + i * lineH);
    });

    titleBottom = 145 + 60 + displayed.length * lineH + 16;
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(PAD, titleBottom, 80, 4);
    titleBottom += 24;
  }

  // ── Separador ─────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(PAD, titleBottom + 8, W - PAD * 2, 1);
  let dataY = titleBottom + 26;

  // ── Badge de categoria destacado ─────────────────────────────────────────
  const catBadgeH = drawCategoryBadge(
    ctx,
    trendData.categoria.label.toUpperCase(),
    PAD,
    dataY,
    'left'
  );
  dataY += catBadgeH + 18;

  // ── Linha com imagem do produto + % hero ─────────────────────────────────
  const topTerm = (trendData.specificTrends || [])[0];

  const IMG_SIZE  = 220;
  const imgX      = W - PAD - IMG_SIZE;
  const imgY      = dataY;
  const textAreaW = W - PAD * 2 - IMG_SIZE - 24;

  // Buscar imagem do produto (em paralelo com resto do desenho)
  const imgUrlPromise = topTerm
    ? fetchProductImage(topTerm.keyword, trendData.categoria?.label || '')
    : Promise.resolve(null);

  if (topTerm) {
    const heroPct   = topTerm.isBreakout ? 'BREAKOUT' : topTerm.value ? `+${topTerm.value}%` : `${topTerm.avgInterest || ''}`;
    const heroColor = topTerm.isBreakout ? '#8B0000' : '#0c0c0c';

    ctx.fillStyle = heroColor;
    ctx.font      = 'bold 88px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(heroPct, PAD, dataY + 88);

    ctx.fillStyle = WHITE;
    ctx.font      = 'bold 36px sans-serif';
    ctx.fillText(truncate(topTerm.keyword, 20), PAD, dataY + 138);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font      = '22px sans-serif';
    ctx.fillText('nas buscas — últimos 90 dias', PAD, dataY + 168);

    dataY += 192;
  } else {
    dataY += 20;
  }

  // ── Outros rising terms ────────────────────────────────────────────────────
  const others = (trendData.specificTrends || []).slice(1, 4);
  if (others.length) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(PAD, dataY + 8, W - PAD * 2, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font      = '20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TAMBÉM EM ALTA', PAD, dataY + 32);

    const maxVal  = Math.max(...others.map(t => t.value || t.avgInterest || 1));
    const barMaxW = W - PAD * 2 - 60;
    others.forEach((t, i) => {
      const y   = dataY + 50 + i * 66;
      const val = t.isBreakout ? 'BREAKOUT' : t.value ? `+${t.value}%` : t.avgInterest ? `${t.avgInterest}/100` : '';
      const pct = (t.value || t.avgInterest || 1) / (maxVal || 1);
      drawDataBar(ctx, PAD, y, barMaxW, truncate(t.keyword, 24), val, pct, false);
    });
  }

  // ── Imagem do produto (aguarda e desenha) ─────────────────────────────────
  const imgUrl = await imgUrlPromise;
  if (imgUrl) {
    await drawProductImage(ctx, imgUrl, imgX, imgY, IMG_SIZE, IMG_SIZE, 20);
  }

  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(0, H - 6, W, 6);

  const filename = `varejo_${Date.now()}.png`;
  const filepath = path.join(ASSETS_DIR, filename);
  fs.writeFileSync(filepath, canvas.toBuffer('image/png'));
  return { filepath, filename };
}

// ── Story 1080×1920 ──────────────────────────────────────────────────────────
async function generateVarejoStoryImage(trendData, articleTitle = '') {
  const W = 1080, H = 1920;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const SAFE_TOP    = 270;
  const SAFE_BOTTOM = 1600;
  const CX          = W / 2;
  const PAD         = 80;
  // Usable: SAFE_BOTTOM - SAFE_TOP = 1330px

  drawBackground(ctx, W, H);

  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(PAD, SAFE_TOP, W - PAD * 2, 4);

  // ── Handle ────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0c0c0c';
  ctx.font      = 'bold 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('@vendaexponencial', CX, SAFE_TOP + 58);

  // ── Badge "TENDÊNCIAS DO VAREJO" ─────────────────────────────────────────
  ctx.font = 'bold 22px sans-serif';
  const subText = '📊  TENDÊNCIAS DO VAREJO';
  const subW    = ctx.measureText(subText).width + 44;
  drawRoundRect(ctx, CX - subW / 2, SAFE_TOP + 72, subW, 42, 21);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fill();
  ctx.fillStyle = '#0c0c0c';
  ctx.fillText(subText, CX, SAFE_TOP + 100);

  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(PAD, SAFE_TOP + 132, W - PAD * 2, 1);

  // ── TÍTULO — hero (max 3 linhas, fonte compacta) ──────────────────────────
  let titleBottom = SAFE_TOP + 148;
  if (articleTitle) {
    ctx.font = 'bold 50px sans-serif';
    const maxW       = W - PAD * 2;
    const titleLines = wrapLines(ctx, articleTitle, maxW);
    const lineH      = 64;
    const maxLines   = 3;
    const displayed  = titleLines.slice(0, maxLines);

    ctx.fillStyle = '#0c0c0c';
    ctx.textAlign = 'center';
    displayed.forEach((line, i) => {
      const text = (i === maxLines - 1 && titleLines.length > maxLines)
        ? truncate(line, 28) + '…' : line;
      ctx.fillText(text, CX, titleBottom + 54 + i * lineH);
    });

    titleBottom = titleBottom + 54 + displayed.length * lineH + 14;
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(CX - 44, titleBottom, 88, 4);
    titleBottom += 22;
  }

  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(PAD, titleBottom + 6, W - PAD * 2, 1);
  let dataY = titleBottom + 24;

  // ── Badge de categoria destacado (centralizado) ──────────────────────────
  const catBadgeH = drawCategoryBadge(
    ctx,
    trendData.categoria.label.toUpperCase(),
    CX,
    dataY,
    'center'
  );
  dataY += catBadgeH + 18;

  // ── Imagem do produto (centralizada) ─────────────────────────────────────
  const topTerm = (trendData.specificTrends || [])[0];
  const IMG_W = 200, IMG_H = 200;
  const imgX  = CX - IMG_W / 2;
  const imgY  = dataY;

  const imgUrlPromise = topTerm
    ? fetchProductImage(topTerm.keyword, trendData.categoria?.label || '')
    : Promise.resolve(null);

  // Reserva espaço
  dataY += IMG_H + 14;

  // ── % hero + produto ──────────────────────────────────────────────────────
  if (topTerm) {
    const heroPct   = topTerm.isBreakout ? 'BREAKOUT' : topTerm.value ? `+${topTerm.value}%` : `${topTerm.avgInterest || ''}`;
    const heroColor = topTerm.isBreakout ? '#8B0000' : '#0c0c0c';

    ctx.fillStyle = heroColor;
    ctx.font      = 'bold 100px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(heroPct, CX, dataY + 100);

    const numW = ctx.measureText(heroPct).width;
    ctx.fillStyle = heroColor;
    ctx.fillRect(CX - numW / 2, dataY + 112, numW, 4);

    ctx.fillStyle = WHITE;
    ctx.font      = 'bold 42px sans-serif';
    ctx.fillText(truncate(topTerm.keyword, 20), CX, dataY + 168);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font      = '24px sans-serif';
    ctx.fillText('nas buscas — últimos 90 dias', CX, dataY + 204);

    dataY += 228;
  }

  // ── Outros rising terms (máx 2 no story) ────────────────────────────────
  const others = (trendData.specificTrends || []).slice(1, 3);
  if (others.length) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(PAD, dataY, W - PAD * 2, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font      = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAMBÉM EM ALTA', CX, dataY + 32);

    const maxVal  = Math.max(...others.map(t => t.value || t.avgInterest || 1));
    const barMaxW = W - PAD * 2 - 40;

    others.forEach((t, i) => {
      const y   = dataY + 50 + i * 78;
      const val = t.isBreakout ? 'BREAKOUT' : t.value ? `+${t.value}%` : t.avgInterest ? `${t.avgInterest}/100` : '';
      const pct = (t.value || t.avgInterest || 1) / (maxVal || 1);

      drawRoundRect(ctx, PAD - 10, y - 4, W - PAD * 2 + 20, 62, 12);
      ctx.fillStyle = CARD_BG;
      ctx.fill();
      drawRoundRect(ctx, PAD - 10, y - 4, W - PAD * 2 + 20, 62, 12);
      ctx.strokeStyle = CARD_BORDER;
      ctx.lineWidth = 1;
      ctx.stroke();

      drawDataBar(ctx, PAD, y + 10, barMaxW, truncate(t.keyword, 26), val, pct, false);
    });
  }

  // ── CTA ───────────────────────────────────────────────────────────────────
  const ctaY = SAFE_BOTTOM - 104;
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(0, ctaY - 10, W, 104);
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(PAD, ctaY - 10, W - PAD * 2, 3);
  ctx.fillStyle = WHITE;
  ctx.font      = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Leia a análise completa — link na bio 👆', CX, ctaY + 42);

  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(PAD, SAFE_BOTTOM - 4, W - PAD * 2, 4);

  // ── Imagem do produto (aguarda e desenha sobre o espaço reservado) ────────
  const imgUrl = await imgUrlPromise;
  if (imgUrl) {
    await drawProductImage(ctx, imgUrl, imgX, imgY, IMG_W, IMG_H, 20);
  } else {
    drawRoundRect(ctx, imgX, imgY, IMG_W, IMG_H, 20);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fill();
    drawRoundRect(ctx, imgX, imgY, IMG_W, IMG_H, 20);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const filename = `varejo_story_${Date.now()}.png`;
  const filepath = path.join(ASSETS_DIR, filename);
  fs.writeFileSync(filepath, canvas.toBuffer('image/png'));
  return { filepath, filename };
}

module.exports = { generateVarejoFeedImage, generateVarejoStoryImage };
