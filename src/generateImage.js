const { createCanvas, loadImage, registerFont } = require('canvas');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const FONTS_DIR  = path.join(__dirname, '..', 'fonts');
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

registerFont(path.join(FONTS_DIR, 'DejaVuSans.ttf'),      { family: 'DejaVu Sans' });
registerFont(path.join(FONTS_DIR, 'DejaVuSans-Bold.ttf'), { family: 'DejaVu Sans', weight: 'bold' });

const ACCENT_COLOR = '#FFD700';
const TEXT_COLOR = '#ffffff';
const SUBTITLE_COLOR = '#cccccc';
const WIDTH = 1080;
const HEIGHT = 1080;
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920; // 9:16 — formato nativo de Story

function limparMarkdown(texto) {
  return texto
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [texto](url) → texto
    .replace(/^#{1,6}\s+/gm, '')               // # headings → sem prefixo
    .replace(/\*\*/g, '')                       // **bold** → texto
    .replace(/\*/g, '')                         // *italic* → texto
    .replace(/\n+/g, ' ')
    .trim();
}

// Para o título da imagem: extrai a primeira frase completa
function extrairPrimeiraSentenca(artigo) {
  if (!artigo) return null;
  const texto = limparMarkdown(artigo);
  const match = texto.match(/^.+?[.!?]/);
  if (match) return match[0].replace(/[.!?]$/, '').trim();
  // Fallback: 120 chars cortando na última palavra
  const cortado = texto.slice(0, 120);
  const ultimoEspaco = cortado.lastIndexOf(' ');
  return cortado.slice(0, ultimoEspaco > 0 ? ultimoEspaco : 120);
}

// Para o texto menor: primeiro parágrafo com até 150 chars
function extrairPrimeiroParagrafo(artigo) {
  if (!artigo) return null;
  const texto = limparMarkdown(artigo);
  const primeiro = texto.split(/\n\n/)[0] || texto;
  if (primeiro.length <= 150) return primeiro;
  const cortado = primeiro.slice(0, 150);
  const ultimoEspaco = cortado.lastIndexOf(' ');
  return cortado.slice(0, ultimoEspaco > 0 ? ultimoEspaco : 150) + '...';
}

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

  // Sufixo garante imagens de contexto digital/profissional, evitando mercados físicos
  const keywords = extrairKeywords(titulo);
  const query = `${keywords} digital technology business`;

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
        params: { query: 'ecommerce business digital technology', orientation, client_id: key },
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

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = Infinity) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const testLine = line + word + ' ';
    if (ctx.measureText(testLine).width > maxWidth && line !== '') {
      lines.push(line.trim());
      line = word + ' ';
    } else {
      line = testLine;
    }
  }
  if (line.trim()) lines.push(line.trim());

  const displayed = lines.slice(0, maxLines);
  let posY = y;
  displayed.forEach((l, i) => {
    let t = l;
    const isLastDisplayed = i === displayed.length - 1;
    const overflows = i === maxLines - 1 && lines.length > maxLines;

    if (overflows) {
      // Shrink until ellipsis fits
      while (ctx.measureText(t + '…').width > maxWidth && t.length > 0) {
        t = t.slice(0, t.lastIndexOf(' '));
      }
      // Prefer cutting at last clause boundary (comma, semicolon, colon)
      const clauseIdx = Math.max(t.lastIndexOf(','), t.lastIndexOf(';'), t.lastIndexOf(':'));
      if (clauseIdx > t.length * 0.5) t = t.slice(0, clauseIdx).trim();
      t = t + '…';
    } else if (isLastDisplayed) {
      // Always add ellipsis on the last visible line to signal there's more
      while (ctx.measureText(t + '…').width > maxWidth && t.length > 0) {
        t = t.slice(0, t.lastIndexOf(' '));
      }
      const clauseIdx = Math.max(t.lastIndexOf(','), t.lastIndexOf(';'), t.lastIndexOf(':'));
      if (clauseIdx > t.length * 0.5) t = t.slice(0, clauseIdx).trim();
      t = t + '…';
    }

    ctx.fillText(t, x, posY);
    posY += lineHeight;
  });
  return posY - lineHeight;
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

async function generateImage(news, artigo) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  await drawBackground(ctx, WIDTH, HEIGHT, news.title, 0.75, 'landscape');

  // Accent bars
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(0, 0, WIDTH, 12);
  ctx.fillRect(0, HEIGHT - 12, WIDTH, 12);

  // Handle label
  ctx.fillStyle = ACCENT_COLOR;
  ctx.font = 'bold 34px DejaVu Sans';
  ctx.textAlign = 'left';
  ctx.fillText('@vendaexponencial', 60, 80);

  // Category badge — dynamic width
  ctx.font = 'bold 21px DejaVu Sans';
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

  // Texto principal: primeira frase do artigo ou título como fallback
  const primeiraSentenca = extrairPrimeiraSentenca(artigo);
  const textoImagem = primeiraSentenca || (news.title.length > 120 ? news.title.slice(0, 117) : news.title);
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 52px DejaVu Sans';
  ctx.textAlign = 'left';
  const lastY = wrapText(ctx, textoImagem, 60, 280, WIDTH - 120, 68, 3);

  // Source chip — dynamic width
  const sourceLabel = `📰  ${news.source}`;
  ctx.font = '26px DejaVu Sans';
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
    ctx.font = '30px DejaVu Sans';
    wrapText(ctx, snippet + '...', 60, lastY + 180, WIDTH - 120, 42);
  }

  const filename = `post_${Date.now()}.png`;
  const filepath = path.join(ASSETS_DIR, filename);
  fs.writeFileSync(filepath, canvas.toBuffer('image/png'));
  return { filepath, filename };
}

async function gerarStory(news, artigo) {
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
  ctx.font = 'bold 44px DejaVu Sans';
  ctx.textAlign = 'center';
  ctx.fillText('@vendaexponencial', CX, SAFE_TOP + 70);

  // Badge
  ctx.font = 'bold 26px DejaVu Sans';
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

  // Texto principal: primeira frase do artigo ou título como fallback
  const primeiraSentencaStory = extrairPrimeiraSentenca(artigo);
  const title = primeiraSentencaStory || (news.title.length > 130 ? news.title.slice(0, 127) : news.title);
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 62px DejaVu Sans';
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

  const MAX_STORY_LINES = 5;
  const displayed = lines.slice(0, MAX_STORY_LINES);
  // Always truncate last visible line at a clause boundary with ellipsis
  const lastIdx = displayed.length - 1;
  let last = displayed[lastIdx];
  while (ctx.measureText(last + '…').width > maxW && last.length > 0) {
    last = last.slice(0, last.lastIndexOf(' '));
  }
  const clauseIdx = Math.max(last.lastIndexOf(','), last.lastIndexOf(';'), last.lastIndexOf(':'));
  if (clauseIdx > last.length * 0.5) last = last.slice(0, clauseIdx).trim();
  displayed[lastIdx] = last + '…';

  const totalTitleH = displayed.length * lineH;
  const contentMidY = (SAFE_TOP + SAFE_BOTTOM) / 2;
  const titleStartY = contentMidY - totalTitleH / 2;
  displayed.forEach((l, i) => ctx.fillText(l, CX, titleStartY + i * lineH));

  const afterTitle = titleStartY + totalTitleH + 40;

  // Divider below title
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(80, afterTitle, STORY_WIDTH - 160, 2);

  // Source chip
  const sourceLabel = `📰  ${news.source}`;
  ctx.font = '30px DejaVu Sans';
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
  ctx.font = 'bold 34px DejaVu Sans';
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
