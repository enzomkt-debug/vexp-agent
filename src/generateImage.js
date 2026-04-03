const { createCanvas, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

const BRAND_COLOR = '#0a0a0a';
const ACCENT_COLOR = '#FFD700';
const TEXT_COLOR = '#ffffff';
const SUBTITLE_COLOR = '#cccccc';
const WIDTH = 1080;
const HEIGHT = 1080;

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let posY = y;

  for (const word of words) {
    const testLine = line + word + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line !== '') {
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

  // Background solid black
  ctx.fillStyle = BRAND_COLOR;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Accent bar top
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(0, 0, WIDTH, 12);

  // Accent bar bottom
  ctx.fillRect(0, HEIGHT - 12, WIDTH, 12);

  // Decorative circle
  ctx.beginPath();
  ctx.arc(WIDTH - 80, 80, 200, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 215, 0, 0.06)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(80, HEIGHT - 80, 150, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 215, 0, 0.04)';
  ctx.fill();

  // Handle label
  ctx.fillStyle = ACCENT_COLOR;
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('@vendaexponencial', 60, 80);

  // Category badge
  ctx.fillStyle = ACCENT_COLOR;
  ctx.beginPath();
  ctx.roundRect(60, 110, 220, 44, 22);
  ctx.fill();
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('⚡ ECOMMERCE NEWS', 80, 139);

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(60, 180, WIDTH - 120, 2);

  // Title
  const title = news.title.length > 120 ? news.title.slice(0, 117) + '...' : news.title;
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 58px sans-serif';
  ctx.textAlign = 'left';
  const lastY = wrapText(ctx, title, 60, 280, WIDTH - 120, 74);

  // Source chip
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.roundRect(60, lastY + 60, 280, 48, 24);
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

  // Bottom CTA bar
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(60, HEIGHT - 140, WIDTH - 120, 3);
  ctx.fillStyle = 'rgba(255, 215, 0, 0.10)';
  ctx.fillRect(60, HEIGHT - 130, WIDTH - 120, 80);
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🚀  Siga para mais novidades de ecommerce e vendas digitais', WIDTH / 2, HEIGHT - 82);

  // Save to disk
  const filename = `post_${Date.now()}.png`;
  const filepath = path.join(ASSETS_DIR, filename);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filepath, buffer);

  return { filepath, filename };
}

module.exports = { generateImage };
