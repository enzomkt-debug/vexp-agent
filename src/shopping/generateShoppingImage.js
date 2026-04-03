const { createCanvas, loadImage, registerFont } = require('canvas');
const path  = require('path');
const fs    = require('fs');
const axios = require('axios');
const { subirImagemGithub }  = require('../utils');
const { fetchProductImage }  = require('../varejo/fetchProductImage');

const FONTS_DIR  = path.join(__dirname, '..', '..', 'fonts');
const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

registerFont(path.join(FONTS_DIR, 'DejaVuSans.ttf'),      { family: 'DejaVu Sans' });
registerFont(path.join(FONTS_DIR, 'DejaVuSans-Bold.ttf'), { family: 'DejaVu Sans', weight: 'bold' });

const DARK_BG     = '#0a0a0a';
const GOLD        = '#FFD700';
const WHITE       = '#ffffff';
const CARD_BG     = 'rgba(255,255,255,0.05)';
const CARD_BORDER = 'rgba(255,255,255,0.1)';

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

  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
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
  ctx.fillStyle = 'rgba(255,215,0,0.04)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(60, h + 60, 160, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,215,0,0.03)';
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

async function loadProductThumbnail(product, categoriaLabel) {
  // 1. Tenta URL direta do ScaleSerp com headers de browser
  if (product.thumbnail) {
    try {
      const response = await axios.get(product.thumbnail, {
        responseType: 'arraybuffer',
        timeout: 6000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Referer': 'https://www.google.com.br/',
        },
      });
      if (response.data.byteLength > 500) {
        return await loadImage(Buffer.from(response.data));
      }
    } catch { /* fallthrough */ }
  }

  // 2. Fallback: Unsplash → Wikimedia Commons
  // Traduz termos PT→EN pois o Unsplash é majoritariamente em inglês
  const enTitle = translateToEn(product.title);
  const shortEn = enTitle.split(' ').slice(0, 3).join(' ');
  for (const query of [shortEn, enTitle, product.title.split(' ').slice(0, 3).join(' ')]) {
    try {
      const imageUrl = await fetchProductImage(query, categoriaLabel);
      if (imageUrl) return await loadImage(imageUrl);
    } catch { /* fallthrough */ }
  }

  return null;
}

// Tradução simples de termos PT→EN para melhorar buscas no Unsplash
function translateToEn(title) {
  const map = {
    'vitamina': 'vitamin', 'suplemento': 'supplement', 'proteína': 'protein', 'proteina': 'protein',
    'termômetro': 'thermometer', 'termometro': 'thermometer', 'medidor': 'meter',
    'brinquedo': 'toy', 'boneca': 'doll', 'carrinho': 'toy car', 'pelúcia': 'plush toy',
    'celular': 'smartphone', 'notebook': 'laptop', 'computador': 'computer', 'teclado': 'keyboard',
    'televisão': 'television', 'televisao': 'television', 'monitor': 'monitor',
    'geladeira': 'refrigerator', 'fogão': 'stove', 'fogao': 'stove', 'micro-ondas': 'microwave',
    'roupa': 'clothing', 'camiseta': 'shirt', 'calça': 'pants', 'calca': 'pants',
    'tênis': 'sneakers', 'tenis': 'sneakers', 'sapato': 'shoes', 'sandália': 'sandal',
    'relógio': 'watch', 'relogio': 'watch', 'joia': 'jewelry', 'anel': 'ring', 'colar': 'necklace',
    'livro': 'book', 'cadeira': 'chair', 'mesa': 'table', 'sofá': 'sofa', 'sofa': 'sofa',
    'perfume': 'perfume', 'maquiagem': 'makeup', 'creme': 'cream', 'shampoo': 'shampoo',
    'câmera': 'camera', 'camera': 'camera', 'fone': 'headphone', 'headset': 'headset',
    'panela': 'pan', 'frigideira': 'frying pan', 'liquidificador': 'blender',
    'colchão': 'mattress', 'colchao': 'mattress', 'travesseiro': 'pillow',
    'mochila': 'backpack', 'bolsa': 'bag', 'mala': 'suitcase',
    'ração': 'pet food', 'racao': 'pet food',
    'bicicleta': 'bicycle', 'patins': 'skates', 'skate': 'skateboard',
  };
  const words = title.toLowerCase().split(/\s+/);
  return words.map(w => map[w] || w).join(' ');
}

// ── Feed 1080×1080 ───────────────────────────────────────────────────────────
async function generateShoppingFeedImage(shoppingData, articleTitle = '') {
  const W = 1080, H = 1080;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const PAD    = 60;

  drawBackground(ctx, W, H);

  // Borda superior dourada
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, W, 5);

  // ── Header ────────────────────────────────────────────────────────────────
  ctx.fillStyle = GOLD;
  ctx.font      = 'bold 30px DejaVu Sans';
  ctx.textAlign = 'left';
  ctx.fillText('@vendaexponencial', PAD, 62);

  // Badge "🛒 MAIS VENDIDOS"
  const badgeText = '🛒 MAIS VENDIDOS';
  ctx.font = 'bold 20px DejaVu Sans';
  const badgeW = ctx.measureText(badgeText).width + 32;
  const badgeH = 36;
  drawRoundRect(ctx, PAD, 76, badgeW, badgeH, 18);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';
  ctx.fillText(badgeText, PAD + 16, 76 + 24);

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(PAD, 128, W - PAD * 2, 1);

  // ── Título do artigo ──────────────────────────────────────────────────────
  let titleBottom = 142;
  if (articleTitle) {
    ctx.font = 'bold 44px DejaVu Sans';
    const titleLines = wrapLines(ctx, articleTitle, W - PAD * 2);
    const lineH      = 58;
    const maxLines   = 2;
    const displayed  = titleLines.slice(0, maxLines);

    ctx.fillStyle = WHITE;
    ctx.textAlign = 'left';
    displayed.forEach((line, i) => {
      const text = (i === maxLines - 1 && titleLines.length > maxLines)
        ? truncate(line, 32) : line;
      ctx.fillText(text, PAD, 142 + 54 + i * lineH);
    });

    titleBottom = 142 + 54 + displayed.length * lineH + 14;
    ctx.fillStyle = GOLD;
    ctx.fillRect(PAD, titleBottom, 70, 4);
    titleBottom += 20;
  }

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(PAD, titleBottom + 6, W - PAD * 2, 1);
  let cardY = titleBottom + 28;

  // ── Cards de produtos ─────────────────────────────────────────────────────
  const products = (shoppingData.products || []).slice(0, 4);
  const cardH    = 148;
  const cardGap  = 16;
  const THUMB_W  = 100;
  const THUMB_H  = 100;

  for (const [i, product] of products.entries()) {
    const cx = PAD;
    const cy = cardY;
    const cw = W - PAD * 2;

    // Fundo do card
    drawRoundRect(ctx, cx, cy, cw, cardH, 12);
    ctx.fillStyle = CARD_BG;
    ctx.fill();
    drawRoundRect(ctx, cx, cy, cw, cardH, 12);
    ctx.strokeStyle = CARD_BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Número de posição
    ctx.fillStyle = GOLD;
    ctx.font      = 'bold 36px DejaVu Sans';
    ctx.textAlign = 'left';
    ctx.fillText(`#${i + 1}`, cx + 18, cy + 52);

    // Thumbnail
    const thumbX = cx + 80;
    const thumbY = cy + (cardH - THUMB_H) / 2;
    const thumb  = await loadProductThumbnail(product, shoppingData.categoria?.label || '');
    if (thumb) {
      ctx.save();
      drawRoundRect(ctx, thumbX, thumbY, THUMB_W, THUMB_H, 8);
      ctx.clip();
      const scale = Math.min(THUMB_W / thumb.width, THUMB_H / thumb.height);
      const dw = thumb.width * scale;
      const dh = thumb.height * scale;
      const dx = thumbX + (THUMB_W - dw) / 2;
      const dy = thumbY + (THUMB_H - dh) / 2;
      ctx.drawImage(thumb, dx, dy, dw, dh);
      ctx.restore();
    } else {
      drawRoundRect(ctx, thumbX, thumbY, THUMB_W, THUMB_H, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fill();
    }

    // Texto do produto
    const textX = thumbX + THUMB_W + 16;
    const maxTextW = cw - (textX - cx) - 16;

    ctx.fillStyle = WHITE;
    ctx.font      = 'bold 22px DejaVu Sans';
    ctx.textAlign = 'left';
    ctx.fillText(truncate(product.title, 40), textX, cy + 38);

    ctx.fillStyle = GOLD;
    ctx.font      = 'bold 24px DejaVu Sans';
    ctx.fillText(product.price || '', textX, cy + 70);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font      = '18px DejaVu Sans';
    ctx.fillText(truncate(product.source || '', 28), textX, cy + 96);

    cardY += cardH + cardGap;
  }

  // ── Badge da categoria no rodapé ──────────────────────────────────────────
  const catText = (shoppingData.categoria.label || '').toUpperCase();
  ctx.font = 'bold 22px DejaVu Sans';
  const catW = ctx.measureText(catText).width + 40;
  const catBH = 38;
  const catX  = PAD;
  const catY  = H - PAD - catBH;
  drawRoundRect(ctx, catX, catY, catW, catBH, catBH / 2);
  ctx.fillStyle = 'rgba(255,215,0,0.15)';
  ctx.fill();
  drawRoundRect(ctx, catX, catY, catW, catBH, catBH / 2);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(catText, catX + 20, catY + catBH / 2);
  ctx.textBaseline = 'alphabetic';

  // Borda inferior dourada
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, H - 5, W, 5);

  const filename = `shopping_${Date.now()}.png`;
  const filepath = path.join(ASSETS_DIR, filename);
  fs.writeFileSync(filepath, canvas.toBuffer('image/png'));

  let githubUrl = null;
  try {
    githubUrl = await subirImagemGithub(filepath);
  } catch (err) {
    console.warn(`[generateShoppingFeedImage] Upload GitHub falhou: ${err.message}`);
  }

  return { filename, filepath, githubUrl };
}

// ── Story 1080×1920 ──────────────────────────────────────────────────────────
async function generateShoppingStoryImage(shoppingData, articleTitle = '') {
  const W = 1080, H = 1920;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const CX     = W / 2;
  const PAD    = 80;

  const SAFE_TOP    = 270;
  const SAFE_BOTTOM = 1650;

  drawBackground(ctx, W, H);

  // Borda superior dourada
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, W, 5);

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(PAD, SAFE_TOP, W - PAD * 2, 4);

  // ── Header ────────────────────────────────────────────────────────────────
  ctx.fillStyle = GOLD;
  ctx.font      = 'bold 36px DejaVu Sans';
  ctx.textAlign = 'center';
  ctx.fillText('@vendaexponencial', CX, SAFE_TOP + 54);

  // Badge
  const badgeText = '🛒 MAIS VENDIDOS';
  ctx.font = 'bold 22px DejaVu Sans';
  const badgeW = ctx.measureText(badgeText).width + 40;
  const badgeH = 42;
  drawRoundRect(ctx, CX - badgeW / 2, SAFE_TOP + 66, badgeW, badgeH, 21);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, CX, SAFE_TOP + 66 + badgeH / 2);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(PAD, SAFE_TOP + 122, W - PAD * 2, 1);

  // ── Título ────────────────────────────────────────────────────────────────
  let titleBottom = SAFE_TOP + 138;
  if (articleTitle) {
    ctx.font = 'bold 48px DejaVu Sans';
    const titleLines = wrapLines(ctx, articleTitle, W - PAD * 2);
    const lineH      = 62;
    const maxLines   = 3;
    const displayed  = titleLines.slice(0, maxLines);

    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    displayed.forEach((line, i) => {
      const text = (i === maxLines - 1 && titleLines.length > maxLines)
        ? truncate(line, 28) + '…' : line;
      ctx.fillText(text, CX, titleBottom + 52 + i * lineH);
    });

    titleBottom = titleBottom + 52 + displayed.length * lineH + 12;
    ctx.fillStyle = GOLD;
    ctx.fillRect(CX - 40, titleBottom, 80, 4);
    titleBottom += 20;
  }

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(PAD, titleBottom + 6, W - PAD * 2, 1);
  let cardY = titleBottom + 36;

  // ── Cards de top 3 produtos ───────────────────────────────────────────────
  const products = (shoppingData.products || []).slice(0, 3);
  const cardH    = 200;
  const cardGap  = 24;
  const THUMB_W  = 130;
  const THUMB_H  = 130;

  for (const [i, product] of products.entries()) {
    const cx = PAD;
    const cy = cardY;
    const cw = W - PAD * 2;

    drawRoundRect(ctx, cx, cy, cw, cardH, 16);
    ctx.fillStyle = CARD_BG;
    ctx.fill();
    drawRoundRect(ctx, cx, cy, cw, cardH, 16);
    ctx.strokeStyle = i === 0 ? GOLD : CARD_BORDER;
    ctx.lineWidth = i === 0 ? 2 : 1;
    ctx.stroke();

    // Número de posição
    ctx.fillStyle = GOLD;
    ctx.font      = 'bold 56px DejaVu Sans';
    ctx.textAlign = 'left';
    ctx.fillText(`#${i + 1}`, cx + 20, cy + 74);

    // Thumbnail
    const thumbX = cx + 110;
    const thumbY = cy + (cardH - THUMB_H) / 2;
    const thumb  = await loadProductThumbnail(product, shoppingData.categoria?.label || '');
    if (thumb) {
      ctx.save();
      drawRoundRect(ctx, thumbX, thumbY, THUMB_W, THUMB_H, 10);
      ctx.clip();
      const scale = Math.min(THUMB_W / thumb.width, THUMB_H / thumb.height);
      const dw = thumb.width * scale;
      const dh = thumb.height * scale;
      const dx = thumbX + (THUMB_W - dw) / 2;
      const dy = thumbY + (THUMB_H - dh) / 2;
      ctx.drawImage(thumb, dx, dy, dw, dh);
      ctx.restore();
    } else {
      drawRoundRect(ctx, thumbX, thumbY, THUMB_W, THUMB_H, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fill();
    }

    // Texto
    const textX = thumbX + THUMB_W + 20;

    ctx.fillStyle = WHITE;
    ctx.font      = 'bold 28px DejaVu Sans';
    ctx.textAlign = 'left';
    ctx.fillText(truncate(product.title, 28), textX, cy + 52);

    ctx.fillStyle = GOLD;
    ctx.font      = 'bold 34px DejaVu Sans';
    ctx.fillText(product.price || '', textX, cy + 96);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font      = '24px DejaVu Sans';
    ctx.fillText(truncate(product.source || '', 20), textX, cy + 132);

    cardY += cardH + cardGap;
  }

  // ── Badge da categoria ────────────────────────────────────────────────────
  const catText = (shoppingData.categoria.label || '').toUpperCase();
  ctx.font = 'bold 26px DejaVu Sans';
  const catW = ctx.measureText(catText).width + 48;
  const catBH = 46;
  const catX  = CX - catW / 2;
  const catY  = SAFE_BOTTOM - catBH - 20;
  drawRoundRect(ctx, catX, catY, catW, catBH, catBH / 2);
  ctx.fillStyle = 'rgba(255,215,0,0.15)';
  ctx.fill();
  drawRoundRect(ctx, catX, catY, catW, catBH, catBH / 2);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(catText, CX, catY + catBH / 2);
  ctx.textBaseline = 'alphabetic';

  // CTA
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, SAFE_BOTTOM, W, 100);
  ctx.fillStyle = WHITE;
  ctx.font      = 'bold 30px DejaVu Sans';
  ctx.textAlign = 'center';
  ctx.fillText('Leia a análise completa — link na bio', CX, SAFE_BOTTOM + 56);

  ctx.fillStyle = GOLD;
  ctx.fillRect(0, H - 5, W, 5);

  const filename = `shopping_story_${Date.now()}.png`;
  const filepath = path.join(ASSETS_DIR, filename);
  fs.writeFileSync(filepath, canvas.toBuffer('image/png'));

  let githubUrl = null;
  try {
    githubUrl = await subirImagemGithub(filepath);
  } catch (err) {
    console.warn(`[generateShoppingStoryImage] Upload GitHub falhou: ${err.message}`);
  }

  return { filename, filepath, githubUrl };
}

module.exports = { generateShoppingFeedImage, generateShoppingStoryImage };
