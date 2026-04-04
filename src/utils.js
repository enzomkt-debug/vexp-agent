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

  try {
    await axios.put(url, body, {
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    // 409 = arquivo já existe (upload concorrente) — URL válida mesmo assim
    if (err?.response?.status !== 409) throw err;
    console.warn(`[utils] 409 no upload de ${filename} — arquivo já existe, usando URL existente`);
  }

  // Wait 5s for GitHub CDN to propagate
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${destPath}`;
  console.log(`[utils] Imagem disponível em: ${rawUrl}`);
  return rawUrl;
}

module.exports = { subirImagemGithub };
