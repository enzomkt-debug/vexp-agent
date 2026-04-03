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
    platforms: ['instagram'],
    caption,
    imageUrl,
    publishNow: true,
  };

  const { data } = await axios.post('https://zernio.com/api/v1/posts', payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`,
    },
  });

  return { postId: data.id || data.post_id, mediaUrl: imageUrl };
}

module.exports = { postToInstagram };
