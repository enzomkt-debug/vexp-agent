require('dotenv').config();
const axios = require('axios');
const { subirImagemGithub } = require('./utils');

async function postToInstagram({ imagePath, caption }) {
  const imageUrl = await subirImagemGithub(imagePath);

  if (process.env.TEST_MODE === 'true') {
    console.log('[postInstagram] TEST_MODE ativo — publicação bloqueada.');
    console.log('[postInstagram] imageUrl:', imageUrl);
    console.log('[postInstagram] caption:', caption);
    return { postId: 'test-mode', mediaUrl: imageUrl };
  }

  const payload = {
    platforms: [{ platform: 'instagram', accountId: process.env.ZERNIO_ACCOUNT_ID }],
    content: caption,
    mediaItems: [{ type: 'image', url: imageUrl }],
    publishNow: true,
  };

  let res;
  try {
    res = await axios.post('https://zernio.com/api/v1/posts', payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`,
      },
    });
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Zernio ${err.response?.status ?? ''}: ${detail}`);
  }

  return { postId: res.data.post?._id || res.data.id || res.data.post_id, mediaUrl: imageUrl };
}

module.exports = { postToInstagram };
