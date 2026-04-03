const { createCanvas, loadImage, registerFont } = require('canvas');
const path  = require('path');
const fs    = require('fs');
const axios = require('axios');
const { subirImagemGithub } = require('../utils');

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

// ── Emoji da categoria via Twemoji CDN (PNG, funciona no canvas/Linux) ────────
const CATEGORY_EMOJI_CODE = {
  'sa[úu]de|farm[áa]cia|rem[ée]dio|vitamina|suplemento': '1f48a',   // 💊
  'brinqued|pelúcia|boneca':                              '1f9f8',   // 🧸
  'beb[êe]|matern':                                       '1f476',   // 👶
  'joia|rel[óo]gio':                                      '1f48d',   // 💍
  'inform[áa]tica|perif[eé]rico|computador':              '1f4bb',   // 💻
  'celular|smartphone':                                   '1f4f1',   // 📱
  'automotiv|moto':                                       '1f697',   // 🚗
  'esport|lazer|fitness|academia':                        '26bd',    // ⚽
  'pet|animal':                                           '1f43e',   // 🐾
  'jardim|ferramenta|constru':                            '1f331',   // 🌱
  'aliment|comida|bebida|cozinha':                        '1f37d',   // 🍽
  'moda|roupa|vest|camiseta':                             '1f457',   // 👗
  'cal[çc]ado|t[êe]nis|sapato':                           '1f45f',   // 👟
  'eletrodom|geladeira|fog[ãa]o':                         '1f3e0',   // 🏠
  'tv|televi|monitor':                                    '1f4fa',   // 📺
  'livr':                                                 '1f4da',   // 📚
  'beleza|cosm[eé]tic|perfume|maquiagem':                 '1f484',   // 💄
};

function getCategoryEmojiCode(label = '') {
  const l = label.toLowerCase();
  for (const [pattern, code] of Object.entries(CATEGORY_EMOJI_CODE)) {
    if (new RegExp(pattern).test(l)) return code;
  }
  return '1f6d2'; // 🛒 padrão
}

async function loadCategoryEmoji(categoriaLabel) {
  const code = getCategoryEmojiCode(categoriaLabel);
  const url  = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${code}.png`;
  try {
    const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 6000 });
    return await loadImage(Buffer.from(data));
  } catch {
    return null;
  }
}

// Extrai og:image da página do produto — retorna a imagem real do lojista
async function fetchProductOgImage(link) {
  if (!link || !link.startsWith('http')) return null;
  try {
    const { data } = await axios.get(link, {
      timeout: 7000,
      responseType: 'text',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      maxRedirects: 3,
      // Lê apenas os primeiros 30KB para encontrar as meta tags no <head>
      maxContentLength: 30000,
    });
    const match = data.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
               || data.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Carrega imagem real do produto: og:image da página → emoji da categoria
async function loadProductImage(product, emojiImg) {
  // 1. Tenta og:image da página do produto
  const ogUrl = await fetchProductOgImage(product.link);
  if (ogUrl) {
    try {
      const { data } = await axios.get(ogUrl, {
        responseType: 'arraybuffer',
        timeout: 6000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (data.byteLength > 500) return { img: await loadImage(Buffer.from(data)), isEmoji: false };
    } catch { /* fallthrough */ }
  }
  // 2. Fallback: emoji da categoria (já carregado)
  return { img: emojiImg, isEmoji: true };
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

  // ── Pré-carrega imagens em paralelo (og:image ou emoji fallback) ───────────
  const catLabel  = shoppingData.categoria?.label || '';
  const emojiImg  = await loadCategoryEmoji(catLabel);
  const products  = (shoppingData.products || []).slice(0, 4);
  const prodImgs  = await Promise.all(products.map(p => loadProductImage(p, emojiImg)));

  // ── Cards de produtos ─────────────────────────────────────────────────────
  const cardH    = 148;
  const cardGap  = 16;
  const ICON_W   = 84;
  const ICON_H   = 84;

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

    // Imagem do produto (og:image) ou emoji da categoria como fallback
    const iconX = cx + 80;
    const iconY = cy + (cardH - ICON_H) / 2;
    const { img: prodImg, isEmoji } = prodImgs[i];
    drawRoundRect(ctx, iconX, iconY, ICON_W, ICON_H, 10);
    ctx.fillStyle = 'rgba(255,215,0,0.08)';
    ctx.fill();
    if (prodImg) {
      ctx.save();
      drawRoundRect(ctx, iconX, iconY, ICON_W, ICON_H, 10);
      ctx.clip();
      if (isEmoji) {
        const pad = 10;
        ctx.drawImage(prodImg, iconX + pad, iconY + pad, ICON_W - pad * 2, ICON_H - pad * 2);
      } else {
        const scale = Math.max(ICON_W / prodImg.width, ICON_H / prodImg.height);
        const dw = prodImg.width * scale;
        const dh = prodImg.height * scale;
        ctx.drawImage(prodImg, iconX + (ICON_W - dw) / 2, iconY + (ICON_H - dh) / 2, dw, dh);
      }
      ctx.restore();
    }

    // Texto do produto
    const textX = iconX + ICON_W + 16;
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

  // ── Pré-carrega imagens em paralelo ─────────────────────────────────────
  const catLabelS  = shoppingData.categoria?.label || '';
  const emojiImgS  = await loadCategoryEmoji(catLabelS);
  const productsS  = (shoppingData.products || []).slice(0, 3);
  const prodImgsS  = await Promise.all(productsS.map(p => loadProductImage(p, emojiImgS)));

  // ── Cards de top 3 produtos ───────────────────────────────────────────────
  const products = productsS;
  const cardH    = 200;
  const cardGap  = 24;
  const ICON_WS  = 110;
  const ICON_HS  = 110;

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

    // Imagem do produto ou emoji fallback
    const iconX = cx + 110;
    const iconY = cy + (cardH - ICON_HS) / 2;
    const { img: prodImgS, isEmoji: isEmojiS } = prodImgsS[i];
    drawRoundRect(ctx, iconX, iconY, ICON_WS, ICON_HS, 12);
    ctx.fillStyle = 'rgba(255,215,0,0.08)';
    ctx.fill();
    if (prodImgS) {
      ctx.save();
      drawRoundRect(ctx, iconX, iconY, ICON_WS, ICON_HS, 12);
      ctx.clip();
      if (isEmojiS) {
        const pad = 12;
        ctx.drawImage(prodImgS, iconX + pad, iconY + pad, ICON_WS - pad * 2, ICON_HS - pad * 2);
      } else {
        const scale = Math.max(ICON_WS / prodImgS.width, ICON_HS / prodImgS.height);
        const dw = prodImgS.width * scale;
        const dh = prodImgS.height * scale;
        ctx.drawImage(prodImgS, iconX + (ICON_WS - dw) / 2, iconY + (ICON_HS - dh) / 2, dw, dh);
      }
      ctx.restore();
    }

    // Texto
    const textX = iconX + ICON_WS + 20;

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
