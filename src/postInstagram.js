require('dotenv').config();
const axios = require('axios');
const { subirImagemGithub } = require('./utils');

async function postToInstagram({ imagePath, imageUrl: imageUrlParam, caption, linkUrl }) {
  const imageUrl = imageUrlParam || await subirImagemGithub(imagePath);

  if (process.env.TEST_MODE === 'true') {
    console.log('[postInstagram] TEST_MODE ativo — publicação bloqueada.');
    console.log('[postInstagram] imageUrl:', imageUrl);
    console.log('[postInstagram] caption:', caption);
    console.log('[postInstagram] linkUrl:', linkUrl);
    return { postId: 'test-mode', mediaUrl: imageUrl };
  }

  const platforms = [{ platform: 'instagram', accountId: process.env.ZERNIO_ACCOUNT_ID }];
  if (process.env.ZERNIO_LINKEDIN_ACCOUNT_ID) {
    platforms.push({
      platform: 'linkedin',
      accountId: process.env.ZERNIO_LINKEDIN_ACCOUNT_ID,
    });
  }

  // Inclui o link no caption global — clicável no LinkedIn, visível no Instagram
  const contentWithLink = linkUrl ? `${caption}\n\n🔗 ${linkUrl}` : caption;

  const payload = {
    platforms,
    content: contentWithLink,
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
      timeout: 30000,
    });
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Zernio ${err.response?.status ?? ''}: ${detail}`);
  }

  return { postId: res.data.post?._id || res.data.id || res.data.post_id, mediaUrl: imageUrl };
}

async function publicarStory(imagePath, linkUrl, imageUrlParam) {
  const imageUrl = imageUrlParam || await subirImagemGithub(imagePath);

  if (process.env.TEST_MODE === 'true') {
    console.log('[publicarStory] TEST_MODE ativo — story bloqueado.');
    console.log('[publicarStory] imageUrl:', imageUrl);
    console.log('[publicarStory] linkUrl:', linkUrl);
    return { postId: 'test-mode-story', mediaUrl: imageUrl };
  }

  const platformData = { contentType: 'story' };
  if (linkUrl) platformData.linkUrl = linkUrl;

  const payload = {
    platforms: [{
      platform: 'instagram',
      accountId: process.env.ZERNIO_ACCOUNT_ID,
      platformSpecificData: platformData,
    }],
    content: '',
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
      timeout: 30000,
    });
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Zernio story ${err.response?.status ?? ''}: ${detail}`);
  }

  return { postId: res.data.post?._id || res.data.id || res.data.post_id, mediaUrl: imageUrl };
}

module.exports = { postToInstagram, publicarStory };
