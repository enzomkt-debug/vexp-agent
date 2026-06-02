require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'https://app.publer.com/api/v1';

function publerHeaders() {
  return {
    Authorization: `Bearer-API ${process.env.PUBLER_API_KEY}`,
    'Publer-Workspace-Id': process.env.PUBLER_WORKSPACE_ID,
    'Content-Type': 'application/json',
  };
}

async function pollJob(jobId, maxAttempts = 20, intervalMs = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const { data } = await axios.get(`${BASE_URL}/job_status/${jobId}`, { headers: publerHeaders() });
    if (data?.status === 'complete') return data.payload?.[0];
    if (data?.status === 'failed') throw new Error(`Publer job failed: ${JSON.stringify(data)}`);
  }
  throw new Error(`Publer job ${jobId} timed out`);
}

async function uploadUmaMidia(imageUrl) {
  const name = imageUrl.split('/').pop() || 'slide.png';
  let res;
  try {
    res = await axios.post(`${BASE_URL}/media/from-url`,
      { media: [{ url: imageUrl, name }], type: 'single', direct_upload: false, in_library: false },
      { headers: publerHeaders(), timeout: 30000 });
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Publer media upload ${err.response?.status ?? ''}: ${detail}`);
  }
  if (res.data?.job_id) {
    const result = await pollJob(res.data.job_id);
    if (!result?.id) throw new Error(`Publer media job sem ID: ${JSON.stringify(result)}`);
    return result.id;
  }
  throw new Error(`Publer media upload resposta inesperada: ${JSON.stringify(res.data)}`);
}

async function uploadCarouselMedia(imageUrls) {
  const ids = [];
  for (const url of imageUrls) {
    ids.push(await uploadUmaMidia(url));
    await new Promise((r) => setTimeout(r, 1000)); // respiro entre uploads
  }
  return ids;
}

/**
 * Publica um carrossel nativo de LinkedIn (details.type: "document") via Publer.
 * imageUrls: array de URLs públicas (já no GitHub). caption: texto do post.
 * title: título do documento. linkUrl: link anexado ao final do texto.
 */
async function postLinkedinCarousel({ imageUrls, caption, title, linkUrl }) {
  if (!process.env.PUBLER_LINKEDIN_ACCOUNT_ID) {
    console.warn('[postLinkedinCarousel] PUBLER_LINKEDIN_ACCOUNT_ID ausente — pulando.');
    return { skipped: true };
  }
  if (!Array.isArray(imageUrls) || imageUrls.length < 2) {
    throw new Error('Carrossel exige ao menos 2 imagens.');
  }

  const texto = linkUrl ? `${caption}\n\nLeia a análise completa: ${linkUrl}` : caption;

  if (process.env.TEST_MODE === 'true') {
    console.log('[postLinkedinCarousel] TEST_MODE ativo — publicação bloqueada.');
    console.log(`[postLinkedinCarousel] slides: ${imageUrls.length} | title: ${title}`);
    console.log('[postLinkedinCarousel] caption:\n' + texto);
    return { postId: 'test-mode-carousel', slides: imageUrls.length };
  }

  const mediaIds = await uploadCarouselMedia(imageUrls);
  const media = mediaIds.map((id) => ({ id, type: 'photo' }));

  const networks = {
    linkedin: {
      type: 'photo',
      text: texto,
      media,
      details: { type: 'document' }, // carrossel nativo deslizável do LinkedIn
      title: (title || 'Venda Exponencial').slice(0, 100),
    },
  };
  const accounts = [{ id: process.env.PUBLER_LINKEDIN_ACCOUNT_ID }];

  let res;
  try {
    res = await axios.post(`${BASE_URL}/posts/schedule/publish`,
      { bulk: { state: 'scheduled', posts: [{ networks, accounts }] } },
      { headers: publerHeaders(), timeout: 30000 });
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Publer post ${err.response?.status ?? ''}: ${detail}`);
  }

  const jobId = res.data?.job_id;
  if (!jobId) throw new Error(`Publer post sem job_id: ${JSON.stringify(res.data)}`);

  const result = await pollJob(jobId);
  if (result?.type === 'error' || result?.status === 'failed') {
    throw new Error(`Carrossel rejeitado pelo LinkedIn: ${result?.failure?.message || JSON.stringify(result)}`);
  }
  return { postId: result?.id || jobId, slides: imageUrls.length };
}

module.exports = { postLinkedinCarousel, uploadCarouselMedia };
