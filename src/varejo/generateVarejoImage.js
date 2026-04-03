const { createCanvas } = require('canvas');
const path = require('path');
const fs   = require('fs');

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

// ── Paleta invertida: fundo gold, texto escuro ───────────────────────────────
const GOLD        = '#FFD700';
const GOLD_DIM    = 'rgba(0, 0, 0, 0.08)';
const WHITE       = '#0c0c0c';   // "branco" agora é preto (texto principal)
const DARK_BG     = '#FFD700';   // fundo principal = gold
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

  // Grade sutil
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  const step = 60;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Círculo decorativo canto superior direito
  ctx.beginPath();
  ctx.arc(w - 60, -60, 220, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.fill();

  // Círculo decorativo canto inferior esquerdo
  ctx.beginPath();
  ctx.arc(60, h + 60, 160, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.fill();
}

// Barra de dado com label e valor
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

// Quebra texto em linhas respeitando maxWidth
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

// ── Feed 1080×1080 ───────────────────────────────────────────────────────────
async function generateVarejoFeedImage(trendData, articleTitle = '') {
  const W = 1080, H = 1080;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const PAD    = 60;

  drawBackground(ctx, W, H);

  // Borda escura topo
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(0, 0, W, 6);

  // ── Cabeçalho ─────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0c0c0c';
  ctx.font      = 'bold 30px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('@vendaexponencial', PAD, 68);

  ctx.font = 'bold 19px sans-serif';
  const badgeText = '📊  TENDÊNCIAS DO VAREJO';
  const badgeW    = ctx.measureText(badgeText).width + 40;
  drawRoundRect(ctx, PAD, 84, badgeW, 38, 19);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fill();
  ctx.fillStyle = '#0c0c0c';
  ctx.fillText(badgeText, PAD + 20, 108);

  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(PAD, 140, W - PAD * 2, 1);

  // ── TÍTULO — elemento hero no topo ────────────────────────────────────────
  let titleBottom = 160;
  if (articleTitle) {
    ctx.font = 'bold 50px sans-serif';
    const maxW      = W - PAD * 2;
    const titleLines = wrapLines(ctx, articleTitle, maxW);
    const lineH     = 66;
    const maxLines  = 4;
    const displayed = titleLines.slice(0, maxLines);

    ctx.fillStyle = '#0c0c0c';
    ctx.textAlign = 'left';
    displayed.forEach((line, i) => {
      // última linha truncada com reticências se havia mais
      const text = (i === maxLines - 1 && titleLines.length > maxLines)
        ? truncate(line, 30)
        : line;
      ctx.fillText(text, PAD, 160 + 60 + i * lineH);
    });

    titleBottom = 160 + 60 + displayed.length * lineH + 16;

    // Linha decorativa sob o título
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(PAD, titleBottom, 80, 4);
    titleBottom += 20;
  }

  // ── Separador ─────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(PAD, titleBottom + 10, W - PAD * 2, 1);
  let dataY = titleBottom + 30;

  // ── Categoria ─────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.40)';
  ctx.font      = '22px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(trendData.categoria.label.toUpperCase(), PAD, dataY + 26);
  dataY += 40;

  // ── Hero: % + produto ─────────────────────────────────────────────────────
  const topTerm = (trendData.specificTrends || [])[0];
  if (topTerm) {
    const heroPct   = topTerm.isBreakout ? 'BREAKOUT' : topTerm.value ? `+${topTerm.value}%` : `${topTerm.avgInterest || ''}`;
    const heroColor = topTerm.isBreakout ? '#8B0000' : '#0c0c0c';
    const heroName  = truncate(topTerm.keyword, 22);

    // % em destaque (médio, pois o título é o hero)
    ctx.fillStyle = heroColor;
    ctx.font      = 'bold 90px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(heroPct, PAD, dataY + 90);

    ctx.fillStyle = WHITE;
    ctx.font      = 'bold 38px sans-serif';
    ctx.fillText(heroName, PAD, dataY + 140);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font      = '22px sans-serif';
    ctx.fillText('nas buscas — últimos 90 dias', PAD, dataY + 172);

    dataY += 192;
  }

  // ── Outros rising terms ────────────────────────────────────────────────────
  const others = (trendData.specificTrends || []).slice(1, 4);
  if (others.length) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(PAD, dataY + 8, W - PAD * 2, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font      = '20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TAMBÉM EM ALTA', PAD, dataY + 36);

    const maxVal  = Math.max(...others.map(t => t.value || t.avgInterest || 1));
    const barMaxW = W - PAD * 2 - 60;
    others.forEach((t, i) => {
      const y   = dataY + 56 + i * 66;
      const val = t.isBreakout ? 'BREAKOUT' : t.value ? `+${t.value}%` : t.avgInterest ? `${t.avgInterest}/100` : '';
      const pct = (t.value || t.avgInterest || 1) / (maxVal || 1);
      drawDataBar(ctx, PAD, y, barMaxW, truncate(t.keyword, 24), val, pct, false);
    });
  }

  // Borda escura fundo
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

  drawBackground(ctx, W, H);

  // Linha escura topo safe zone
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(PAD, SAFE_TOP, W - PAD * 2, 4);

  // ── Cabeçalho ─────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0c0c0c';
  ctx.font      = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('@vendaexponencial', CX, SAFE_TOP + 66);

  ctx.font = 'bold 24px sans-serif';
  const badgeText = '📊  TENDÊNCIAS DO VAREJO';
  const badgeW    = ctx.measureText(badgeText).width + 48;
  drawRoundRect(ctx, CX - badgeW / 2, SAFE_TOP + 82, badgeW, 46, 23);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fill();
  ctx.fillStyle = '#0c0c0c';
  ctx.fillText(badgeText, CX, SAFE_TOP + 114);

  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(PAD, SAFE_TOP + 148, W - PAD * 2, 1);

  // ── TÍTULO — elemento hero ────────────────────────────────────────────────
  let titleBottom = SAFE_TOP + 170;
  if (articleTitle) {
    ctx.font = 'bold 54px sans-serif';
    const maxW       = W - PAD * 2;
    const titleLines = wrapLines(ctx, articleTitle, maxW);
    const lineH      = 72;
    const maxLines   = 4;
    const displayed  = titleLines.slice(0, maxLines);

    ctx.fillStyle = '#0c0c0c';
    ctx.textAlign = 'center';
    displayed.forEach((line, i) => {
      const text = (i === maxLines - 1 && titleLines.length > maxLines)
        ? truncate(line, 28)
        : line;
      ctx.fillText(text, CX, titleBottom + 60 + i * lineH);
    });

    titleBottom = titleBottom + 60 + displayed.length * lineH + 20;

    // Linha decorativa
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(CX - 50, titleBottom, 100, 4);
    titleBottom += 24;
  }

  // ── Separador ─────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(PAD, titleBottom + 10, W - PAD * 2, 1);
  let dataY = titleBottom + 36;

  // ── Categoria ─────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.40)';
  ctx.font      = '26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(trendData.categoria.label.toUpperCase(), CX, dataY + 28);
  dataY += 50;

  // ── Hero: % + produto ─────────────────────────────────────────────────────
  const topTerm = (trendData.specificTrends || [])[0];
  if (topTerm) {
    const heroPct   = topTerm.isBreakout ? 'BREAKOUT' : topTerm.value ? `+${topTerm.value}%` : `${topTerm.avgInterest || ''}`;
    const heroColor = topTerm.isBreakout ? '#8B0000' : '#0c0c0c';

    ctx.fillStyle = heroColor;
    ctx.font      = 'bold 110px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(heroPct, CX, dataY + 110);

    const numW = ctx.measureText(heroPct).width;
    ctx.fillStyle = heroColor;
    ctx.fillRect(CX - numW / 2, dataY + 122, numW, 4);

    ctx.fillStyle = WHITE;
    ctx.font      = 'bold 48px sans-serif';
    ctx.fillText(truncate(topTerm.keyword, 18), CX, dataY + 180);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font      = '26px sans-serif';
    ctx.fillText('nas buscas — últimos 90 dias', CX, dataY + 220);

    dataY += 248;
  }

  // ── Ranking dos demais termos ─────────────────────────────────────────────
  const others = (trendData.specificTrends || []).slice(1, 5);
  if (others.length) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(PAD, dataY, W - PAD * 2, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font      = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAMBÉM EM ALTA', CX, dataY + 36);

    const maxVal  = Math.max(...others.map(t => t.value || t.avgInterest || 1));
    const barMaxW = W - PAD * 2 - 40;

    others.forEach((t, i) => {
      const y   = dataY + 56 + i * 90;
      const val = t.isBreakout ? 'BREAKOUT' : t.value ? `+${t.value}%` : t.avgInterest ? `${t.avgInterest}/100` : '';
      const pct = (t.value || t.avgInterest || 1) / (maxVal || 1);

      drawRoundRect(ctx, PAD - 10, y - 4, W - PAD * 2 + 20, 72, 12);
      ctx.fillStyle = CARD_BG;
      ctx.fill();
      drawRoundRect(ctx, PAD - 10, y - 4, W - PAD * 2 + 20, 72, 12);
      ctx.strokeStyle = CARD_BORDER;
      ctx.lineWidth = 1;
      ctx.stroke();

      drawDataBar(ctx, PAD, y + 14, barMaxW, truncate(t.keyword, 26), val, pct, false);
    });

    dataY += 56 + others.length * 90 + 20;
  }

  // ── CTA ───────────────────────────────────────────────────────────────────
  const ctaY = SAFE_BOTTOM - 110;
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(0, ctaY - 10, W, 110);
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(PAD, ctaY - 10, W - PAD * 2, 3);

  ctx.fillStyle = WHITE;
  ctx.font      = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Leia a análise completa — link na bio 👆', CX, ctaY + 46);

  // Linha escura rodapé safe zone
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(PAD, SAFE_BOTTOM - 4, W - PAD * 2, 4);

  const filename = `varejo_story_${Date.now()}.png`;
  const filepath = path.join(ASSETS_DIR, filename);
  fs.writeFileSync(filepath, canvas.toBuffer('image/png'));
  return { filepath, filename };
}

module.exports = { generateVarejoFeedImage, generateVarejoStoryImage };
