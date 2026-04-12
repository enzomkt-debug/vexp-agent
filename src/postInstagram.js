require('dotenv').config();
const axios = require('axios');
const { subirImagemGithub } = require('./utils');

const BASE_URL = 'https://app.publer.com/api/v1';

function publerHeaders() {
  return {
    Authorization: `Bearer-API ${process.env.PUBLER_API_KEY}`,
    'Publer-Workspace-Id': process.env.PUBLER_WORKSPACE_ID,
    'Content-Type': 'application/json',
  };
}

async function pollJob(jobId, maxAttempts = 15, intervalMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const { data } = await axios.get(`${BASE_URL}/job_status/${jobId}`, {
      headers: publerHeaders(),
    });
    const status = data?.status;
    if (status === 'complete') return data.payload?.[0];
    if (status === 'failed') throw new Error(`Publer job failed: ${JSON.stringify(data)}`);
  }
  throw new Error(`Publer job ${jobId} timed out`);
}

async function uploadMedia(imageUrl) {
  let res;
  try {
    const imageName = imageUrl.split('/').pop() || 'image.png';
    res = await axios.post(
      `${BASE_URL}/media/from-url`,
      { media: [{ url: imageUrl, name: imageName }], type: 'single', direct_upload: false, in_library: false },
      { headers: publerHeaders(), timeout: 30000 },
    );
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Publer media upload ${err.response?.status ?? ''}: ${detail}`);
  }

  // Async response: poll until media is ready
  if (res.data?.job_id) {
    const result = await pollJob(res.data.job_id);
    if (!result?.id) throw new Error(`Publer media job sem ID: ${JSON.stringify(result)}`);
    return result.id;
  }

  throw new Error(`Publer media upload resposta inesperada: ${JSON.stringify(res.data)}`);
}

async function createPost(accounts, networks, state = 'scheduled') {
  let res;
  try {
    res = await axios.post(
      `${BASE_URL}/posts/schedule/publish`,
      {
        bulk: {
          state,
          posts: [{ networks, accounts }],
        },
      },
      { headers: publerHeaders(), timeout: 30000 },
    );
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Publer post ${err.response?.status ?? ''}: ${detail}`);
  }

  const jobId = res.data?.job_id;
  if (!jobId) throw new Error(`Publer post sem job_id: ${JSON.stringify(res.data)}`);
  return jobId;
}

async function postToInstagram({ imagePath, imageUrl: imageUrlParam, caption, linkUrl }) {
  const imageUrl = imageUrlParam || (await subirImagemGithub(imagePath));

  if (process.env.TEST_MODE === 'true') {
    console.log('[postInstagram] TEST_MODE ativo — publicação bloqueada.');
    console.log('[postInstagram] imageUrl:', imageUrl);
    console.log('[postInstagram] caption:', caption);
    console.log('[postInstagram] linkUrl:', linkUrl);
    return { postId: 'test-mode', mediaUrl: imageUrl };
  }

  const mediaId = await uploadMedia(imageUrl);

  const contentWithLink = linkUrl ? `${caption}\n\n🔗 ${linkUrl}` : caption;
  const media = [{ id: mediaId, type: 'image' }];

  const accounts = [{ id: process.env.PUBLER_INSTAGRAM_ACCOUNT_ID }];
  if (process.env.PUBLER_LINKEDIN_ACCOUNT_ID) {
    accounts.push({ id: process.env.PUBLER_LINKEDIN_ACCOUNT_ID });
  }

  const networks = {
    instagram: { type: 'photo', text: contentWithLink, media },
  };
  if (process.env.PUBLER_LINKEDIN_ACCOUNT_ID) {
    networks.linkedin = { type: 'photo', text: contentWithLink, media };
  }

  const jobId = await createPost(accounts, networks);
  // Poll apenas para detectar falha silenciosa; state='scheduled' pode não retornar id no payload
  try {
    const postResult = await pollJob(jobId);
    console.log('[postInstagram] Job completo:', JSON.stringify(postResult));
    return { postId: postResult?.id || jobId, mediaUrl: imageUrl };
  } catch (err) {
    console.error('[postInstagram] Job falhou:', err.message);
    throw err;
  }
}

async function publicarStory(imagePath, linkUrl, imageUrlParam) {
  const imageUrl = imageUrlParam || (await subirImagemGithub(imagePath));

  if (process.env.TEST_MODE === 'true') {
    console.log('[publicarStory] TEST_MODE ativo — story bloqueado.');
    console.log('[publicarStory] imageUrl:', imageUrl);
    console.log('[publicarStory] linkUrl:', linkUrl);
    return { postId: 'test-mode-story', mediaUrl: imageUrl };
  }

  // Instagram exige gap mínimo de 1 minuto entre posts consecutivos
  console.log('[publicarStory] Aguardando 65s (gap mínimo do Instagram)...');
  await new Promise(r => setTimeout(r, 65000));

  const mediaId = await uploadMedia(imageUrl);

  const networks = {
    instagram: {
      type: 'photo',
      text: '',
      media: [{ id: mediaId, type: 'image' }],
      details: { type: 'story' },
    },
  };

  const accounts = [{ id: process.env.PUBLER_INSTAGRAM_ACCOUNT_ID }];
  const jobId = await createPost(accounts, networks, 'published');

  let postResult;
  try {
    postResult = await pollJob(jobId, 10, 3000);
    console.log('[publicarStory] Job completo:', JSON.stringify(postResult));
  } catch (err) {
    console.error('[publicarStory] Job falhou:', err.message);
    throw err;
  }

  // Publer pode retornar job "complete" mas com payload de erro do Instagram
  if (postResult?.type === 'error' || postResult?.status === 'failed') {
    const msg = postResult?.failure?.message || JSON.stringify(postResult);
    throw new Error(`Story rejeitado pelo Instagram: ${msg}`);
  }

  return { postId: postResult?.id || jobId, mediaUrl: imageUrl };
}

module.exports = { postToInstagram, publicarStory };
