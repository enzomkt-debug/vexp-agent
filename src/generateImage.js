const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ACCENT_COLOR = '#FFD700';
const TEXT_COLOR = '#ffffff';
const SUBTITLE_COLOR = '#cccccc';
const WIDTH = 1080;
const HEIGHT = 1080;
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920; // 9:16 — formato nativo de Story

const STOPWORDS = new Set([
  'de','da','do','dos','das','no','na','nos','nas','e','com','para','que',
  'em','um','uma','o','a','os','as','por','se','ao','ou','mas','é','são',
  'foi','ser','ter','mais','seu','sua','seus','suas','pelo','pela',
]);

function extrairKeywords(titulo) {
  const palavras = titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));

  return palavras.slice(0, 3).join(' ') || 'ecommerce business digital';
}

async function buscarImagemUnsplash(titulo, orientation = 'landscape') {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  const query = extrairKeywords(titulo);

  try {
    const { data } = await axios.get('https://api.unsplash.com/photos/random', {
      params: { query, orientation, client_id: key },
      timeout: 8000,
    });
    return data?.urls?.regular || null;
  } catch {
    // Fallback com query genérica
    try {
      const { data } = await axios.get('https://api.unsplash.com/photos/random', {
        params: { query: 'ecommerce business digital', orientation, client_id: key },
        timeout: 8000,
      });
      return data?.urls?.regular || null;
    } catch {
      return null;
    }
  }
}

async function loadBackground(imageUrl) {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; vexp-agent/1.0)' },
    });
    return await loadImage(Buffer.from(response.data));
  } catch {
    return null;
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let posY = y;
  for (const word of words) {
    const testLine = line + word + ' ';
    if (ctx.measureText(testLine).width > maxWidth && line !== '') {
      ctx.fillText(line.trim(), x, posY);
      line = word + ' ';
      posY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, posY);
  return posY;
}

async function drawBackground(ctx, w, h, titulo, overlayAlpha, orientation = 'landscape') {
  let usedPhoto = false;

  const imageUrl = await buscarImagemUnsplash(titulo, orientation);
  if (imageUrl) {
    const bgImage = await loadBackground(imageUrl);
    if (bgImage) {
      ctx.drawImage(bgImage, 0, 0, w, h);
      ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
      ctx.fillRect(0, 0, w, h);
      usedPhoto = true;
    }
  }

  if (!usedPhoto) {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    ctx.arc(w - 80, 80, 200, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.06)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(80, h - 80, 150, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.04)';
    ctx.fill();
  }
}

async function generateImage(news) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  await drawBackground(ctx, WIDTH, HEIGHT, news.title, 0.75, 'landscape');

  // Accent bars
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(0, 0, WIDTH, 12);
  ctx.fillRect(0, HEIGHT - 12, WIDTH, 12);

  // Handle label
  ctx.fillStyle = ACCENT_COLOR;
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('@vendaexponencial', 60, 80);

  // Category badge — dynamic width
  ctx.font = 'bold 21px sans-serif';
  const badgeText = '⚡ ECOMMERCE NEWS';
  const badgeW = 20 + ctx.measureText(badgeText).width + 20;
  ctx.fillStyle = ACCENT_COLOR;
  ctx.beginPath();
  ctx.roundRect(60, 110, badgeW, 44, 22);
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.fillText(badgeText, 80, 139);

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(60, 180, WIDTH - 120, 2);

  // Title
  const title = news.title.length > 120 ? news.title.slice(0, 117) + '...' : news.title;
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 58px sans-serif';
  ctx.textAlign = 'left';
  const lastY = wrapText(ctx, title, 60, 280, WIDTH - 120, 74);

  // Source chip — dynamic width
  const sourceLabel = `📰  ${news.source}`;
  ctx.font = '26px sans-serif';
  const sourceChipW = Math.min(20 + ctx.measureText(sourceLabel).width + 20, WIDTH - 120);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.roundRect(60, lastY + 60, sourceChipW, 48, 24);
  ctx.fill();
  ctx.fillStyle = SUBTITLE_COLOR;
  ctx.fillText(sourceLabel, 80, lastY + 92);

  // Summary snippet
  if (news.summary) {
    const snippet = news.summary.replace(/(<([^>]+)>)/gi, '').slice(0, 180);
    ctx.fillStyle = SUBTITLE_COLOR;
    ctx.font = '30px sans-serif';
    wrapText(ctx, snippet + '...', 60, lastY + 180, WIDTH - 120, 42);
  }

  const filename = `post_${Date.now()}.png`;
  const filepath = path.join(ASSETS_DIR, filename);
  fs.writeFileSync(filepath, canvas.toBuffer('image/png'));
  return { filepath, filename };
}

async function gerarStory(news) {
  const canvas = createCanvas(STORY_WIDTH, STORY_HEIGHT);
  const ctx = canvas.getContext('2d');

  await drawBackground(ctx, STORY_WIDTH, STORY_HEIGHT, news.title, 0.85, 'portrait');

  const CX = STORY_WIDTH / 2;

  // Safe zones: top UI ~270px, bottom UI ~320px
  // Usable area: y=270 to y=1600
  const SAFE_TOP = 270;
  const SAFE_BOTTOM = 1600;

  // Accent line just inside safe zone (top)
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(60, SAFE_TOP, STORY_WIDTH - 120, 4);

  // Handle label
  ctx.fillStyle = ACCENT_COLOR;
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('@vendaexponencial', CX, SAFE_TOP + 70);

  // Badge
  ctx.font = 'bold 26px sans-serif';
  const badgeText = '⚡ ECOMMERCE NEWS';
  const badgeW = 24 + ctx.measureText(badgeText).width + 24;
  const badgeX = CX - badgeW / 2;
  ctx.fillStyle = ACCENT_COLOR;
  ctx.beginPath();
  ctx.roundRect(badgeX, SAFE_TOP + 90, badgeW, 52, 26);
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.fillText(badgeText, CX, SAFE_TOP + 126);

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(80, SAFE_TOP + 170, STORY_WIDTH - 160, 2);

  // Title — centered in the middle of the safe area
  const title = news.title.length > 130 ? news.title.slice(0, 127) + '...' : news.title;
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 68px sans-serif';
  ctx.textAlign = 'center';

  const words = title.split(' ');
  const maxW = STORY_WIDTH - 120;
  const lineH = 86;
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxW && line !== '') {
      lines.push(line.trim());
      line = word + ' ';
    } else {
      line = test;
    }
  }
  if (line.trim()) lines.push(line.trim());

  const totalTitleH = lines.length * lineH;
  const contentMidY = (SAFE_TOP + SAFE_BOTTOM) / 2;
  const titleStartY = contentMidY - totalTitleH / 2;
  lines.forEach((l, i) => ctx.fillText(l, CX, titleStartY + i * lineH));

  const afterTitle = titleStartY + totalTitleH + 40;

  // Divider below title
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(80, afterTitle, STORY_WIDTH - 160, 2);

  // Source chip
  const sourceLabel = `📰  ${news.source}`;
  ctx.font = '30px sans-serif';
  const srcChipW = Math.min(24 + ctx.measureText(sourceLabel).width + 24, STORY_WIDTH - 120);
  const srcChipX = CX - srcChipW / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.roundRect(srcChipX, afterTitle + 20, srcChipW, 54, 27);
  ctx.fill();
  ctx.fillStyle = SUBTITLE_COLOR;
  ctx.fillText(sourceLabel, CX, afterTitle + 57);

  // CTA — just inside safe zone (bottom)
  const ctaY = SAFE_BOTTOM - 110;
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(80, ctaY - 20, STORY_WIDTH - 160, 3);
  ctx.fillStyle = 'rgba(255, 215, 0, 0.10)';
  ctx.fillRect(0, ctaY - 10, STORY_WIDTH, 110);
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('Leia o artigo completo — link na bio 👆', CX, ctaY + 52);

  // Accent line just inside safe zone (bottom)
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(60, SAFE_BOTTOM - 4, STORY_WIDTH - 120, 4);

  const filename = `story_${Date.now()}.png`;
  const filepath = path.join(ASSETS_DIR, filename);
  fs.writeFileSync(filepath, canvas.toBuffer('image/png'));
  return { filepath, filename };
}

module.exports = { generateImage, gerarStory };
