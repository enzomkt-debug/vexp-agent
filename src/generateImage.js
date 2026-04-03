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
const STORY_HEIGHT = 1920;

async function extractOgImage(url) {
  try {
    const { data: html } = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; vexp-agent/1.0)' },
    });
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function loadBackground(ogImageUrl) {
  try {
    const response = await axios.get(ogImageUrl, {
      responseType: 'arraybuffer',
      timeout: 8000,
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

async function drawBackground(ctx, w, h, link, overlayAlpha) {
  let usedOgImage = false;
  if (link) {
    const ogUrl = await extractOgImage(link);
    if (ogUrl) {
      const bgImage = await loadBackground(ogUrl);
      if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, w, h);
        ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
        ctx.fillRect(0, 0, w, h);
        usedOgImage = true;
      }
    }
  }
  if (!usedOgImage) {
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

  await drawBackground(ctx, WIDTH, HEIGHT, news.link, 0.75);

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

  await drawBackground(ctx, STORY_WIDTH, STORY_HEIGHT, news.link, 0.85);

  // Accent bars
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(0, 0, STORY_WIDTH, 14);
  ctx.fillRect(0, STORY_HEIGHT - 14, STORY_WIDTH, 14);

  const CX = STORY_WIDTH / 2;

  // Handle label — top center
  ctx.fillStyle = ACCENT_COLOR;
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('@vendaexponencial', CX, 120);

  // Badge — centered
  ctx.font = 'bold 26px sans-serif';
  const badgeText = '⚡ ECOMMERCE NEWS';
  const badgeW = 24 + ctx.measureText(badgeText).width + 24;
  const badgeX = CX - badgeW / 2;
  ctx.fillStyle = ACCENT_COLOR;
  ctx.beginPath();
  ctx.roundRect(badgeX, 150, badgeW, 52, 26);
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.fillText(badgeText, CX, 186);

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(80, 230, STORY_WIDTH - 160, 2);

  // Title — large, centered, middle of canvas
  const title = news.title.length > 130 ? news.title.slice(0, 127) + '...' : news.title;
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 68px sans-serif';
  ctx.textAlign = 'center';

  // Measure and wrap centered
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
  const titleStartY = (STORY_HEIGHT - totalTitleH) / 2 - 60;
  lines.forEach((l, i) => ctx.fillText(l, CX, titleStartY + i * lineH));

  const afterTitle = titleStartY + totalTitleH + 40;

  // Divider below title
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(80, afterTitle, STORY_WIDTH - 160, 2);

  // Source chip — centered
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

  // CTA — bottom
  const ctaY = STORY_HEIGHT - 140;
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(80, ctaY - 20, STORY_WIDTH - 160, 3);
  ctx.fillStyle = 'rgba(255, 215, 0, 0.10)';
  ctx.fillRect(0, ctaY - 10, STORY_WIDTH, 100);
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('Leia o artigo completo — link na bio 👆', CX, ctaY + 52);

  const filename = `story_${Date.now()}.png`;
  const filepath = path.join(ASSETS_DIR, filename);
  fs.writeFileSync(filepath, canvas.toBuffer('image/png'));
  return { filepath, filename };
}

module.exports = { generateImage, gerarStory };
