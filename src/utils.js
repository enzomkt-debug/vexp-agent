require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function subirImagemGithub(filepath) {
  const filename = path.basename(filepath);
  const content = fs.readFileSync(filepath).toString('base64');

  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN;
  const destPath = `assets/${filename}`;

  const url = `https://api.github.com/repos/${repo}/contents/${destPath}`;

  // Check if file already exists (need SHA to update)
  let sha;
  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `token ${token}` },
    });
    sha = data.sha;
  } catch (_) {
    // File does not exist yet — no SHA needed
  }

  const body = {
    message: `chore: upload image ${filename}`,
    content,
    branch,
    ...(sha ? { sha } : {}),
  };

  const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${destPath}`;

  try {
    await axios.put(url, body, {
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    if (err?.response?.status !== 409) throw err;
    // 409 = SHA stale (outro processo atualizou o arquivo) — busca a URL atual via API
    console.warn(`[utils] 409 no upload de ${filename} — conflito de SHA, obtendo URL via API...`);
    try {
      const { data } = await axios.get(url, { headers: { Authorization: `token ${token}` } });
      if (data?.download_url) {
        console.log(`[utils] URL obtida via API: ${data.download_url}`);
        return data.download_url;
      }
    } catch (getErr) {
      console.warn(`[utils] Falha ao obter URL via API: ${getErr.message}`);
    }
    // Fallback: raw URL com polling
  }

  // Aguarda CDN propagar com polling (até 60s, intervalo de 5s)
  const maxAttempts = 12;
  for (let i = 1; i <= maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const res = await axios.head(rawUrl, { timeout: 8000 });
      if (res.status === 200) {
        console.log(`[utils] Imagem disponível em: ${rawUrl} (tentativa ${i})`);
        return rawUrl;
      }
    } catch (_) {
      // ainda não propagou — tenta de novo
    }
    console.log(`[utils] Aguardando CDN... tentativa ${i}/${maxAttempts}`);
  }

  // Retorna a URL mesmo se o polling esgotou (pode já estar acessível no cliente)
  console.warn(`[utils] CDN não confirmado após ${maxAttempts * 5}s — retornando URL mesmo assim: ${rawUrl}`);
  return rawUrl;
}

module.exports = { subirImagemGithub };
