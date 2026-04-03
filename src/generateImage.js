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
    const buffer = Buffer.from(response.data);
    return await loadImage(buffer);
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

async function generateImage(news) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // --- Background ---
  let usedOgImage = false;
  if (news.link) {
    const ogUrl = await extractOgImage(news.link);
    if (ogUrl) {
      const bgImage = await loadBackground(ogUrl);
      if (bgImage) {
        // Draw og:image scaled to fill canvas
        ctx.drawImage(bgImage, 0, 0, WIDTH, HEIGHT);
        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        usedOgImage = true;
      }
    }
  }

  if (!usedOgImage) {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Decorative circles only on solid bg
    ctx.beginPath();
    ctx.arc(WIDTH - 80, 80, 200, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.06)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(80, HEIGHT - 80, 150, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.04)';
    ctx.fill();
  }

  // Accent bar top
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(0, 0, WIDTH, 12);

  // Accent bar bottom
  ctx.fillRect(0, HEIGHT - 12, WIDTH, 12);

  // Handle label
  ctx.fillStyle = ACCENT_COLOR;
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('@vendaexponencial', 60, 80);

  // Category badge
  ctx.fillStyle = ACCENT_COLOR;
  ctx.beginPath();
  ctx.roundRect(60, 110, 285, 44, 22);
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 21px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('⚡ ECOMMERCE NEWS', 80, 139);

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(60, 180, WIDTH - 120, 2);

  // Title
  const title = news.title.length > 120 ? news.title.slice(0, 117) + '...' : news.title;
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 58px sans-serif';
  ctx.textAlign = 'left';
  const lastY = wrapText(ctx, title, 60, 280, WIDTH - 120, 74);

  // Source chip
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.roundRect(60, lastY + 60, 300, 48, 24);
  ctx.fill();
  ctx.fillStyle = SUBTITLE_COLOR;
  ctx.font = '26px sans-serif';
  ctx.fillText(`📰  ${news.source}`, 80, lastY + 92);

  // Summary snippet
  if (news.summary) {
    const snippet = news.summary.replace(/(<([^>]+)>)/gi, '').slice(0, 180);
    ctx.fillStyle = SUBTITLE_COLOR;
    ctx.font = '30px sans-serif';
    wrapText(ctx, snippet + '...', 60, lastY + 180, WIDTH - 120, 42);
  }

  // Save to disk
  const filename = `post_${Date.now()}.png`;
  const filepath = path.join(ASSETS_DIR, filename);
  fs.writeFileSync(filepath, canvas.toBuffer('image/png'));

  return { filepath, filename };
}

module.exports = { generateImage };
