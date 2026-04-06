require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function subirImagemGithub(filepath, _retries = 3) {
  const filename = path.basename(filepath);
  const content = fs.readFileSync(filepath).toString('base64');

  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN;
  const destPath = `assets/${filename}`;

  const url = `https://api.github.com/repos/${repo}/contents/${destPath}`;
  const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${destPath}`;

  for (let attempt = 1; attempt <= _retries; attempt++) {
    // Busca SHA atual do arquivo (necessário para atualizar)
    let sha;
    try {
      const { data } = await axios.get(url, {
        headers: { Authorization: `token ${token}` },
      });
      sha = data.sha;
    } catch (_) {
      // Arquivo não existe ainda — sem SHA
    }

    const body = {
      message: `chore: upload image ${filename}`,
      content,
      branch,
      ...(sha ? { sha } : {}),
    };

    try {
      await axios.put(url, body, {
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json',
        },
      });
      // Upload bem-sucedido — segue para polling de CDN
      break;
    } catch (err) {
      const status = err?.response?.status;

      // 422 = arquivo já existe com conteúdo idêntico ou SHA inválido
      // 409 = conflito git (deploy concorrente) — retenta com novo SHA
      if (status === 422 || status === 409) {
        // Tenta pegar a URL direto da API (arquivo pode já estar lá)
        try {
          const { data } = await axios.get(url, { headers: { Authorization: `token ${token}` } });
          if (data?.download_url) {
            console.log(`[utils] ${status} no upload de ${filename} — arquivo existente, URL via API: ${data.download_url}`);
            return data.download_url;
          }
        } catch (_) {}

        // Arquivo não existe ainda — conflito transitório, retenta
        if (attempt < _retries) {
          const wait = attempt * 3000;
          console.warn(`[utils] ${status} no upload de ${filename} — conflito transitório, retentando em ${wait / 1000}s (tentativa ${attempt}/${_retries})...`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
      }

      throw err;
    }
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

  console.warn(`[utils] CDN não confirmado após ${maxAttempts * 5}s — retornando URL mesmo assim: ${rawUrl}`);
  return rawUrl;
}

module.exports = { subirImagemGithub };
