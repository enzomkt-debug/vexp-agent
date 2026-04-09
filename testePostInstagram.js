/**
 * Simulação completa do postInstagram.js com mock do axios.
 * Testa todos os cenários: fluxo feliz (feed + story) e falhas.
 * Não faz chamadas reais à API Publer.
 */

// ── Mock do axios ────────────────────────────────────────────────────────────
const axiosMock = { calls: [] };

let scenario = 'happy'; // alterado por cada teste

const axios = {
  get: async (url) => {
    axiosMock.calls.push({ method: 'GET', url });

    if (url.includes('/job_status/')) {
      if (scenario === 'job_failed') {
        return { data: { status: 'failed', error: 'Publer internal error' } };
      }
      if (scenario === 'job_timeout') {
        return { data: { status: 'pending' } }; // nunca complete
      }
      if (scenario === 'job_invalid_payload') {
        return { data: { status: 'complete', payload: [{ foo: 'bar' }] } }; // sem .id
      }
      // Happy path
      const isMedia = url.includes('media_job');
      return {
        data: {
          status: 'complete',
          payload: [{ id: isMedia ? 'media-abc123' : 'post-xyz789', type: 'image' }],
        },
      };
    }
    throw new Error(`Unexpected GET: ${url}`);
  },

  post: async (url, body) => {
    axiosMock.calls.push({ method: 'POST', url, body });

    if (url.includes('/media/from-url')) {
      // Verifica que account_ids NÃO está sendo enviado
      if (body?.media || body?.account_ids) {
        throw Object.assign(
          new Error('account_ids or media wrapper detected — bug reintroduced!'),
          { response: { status: 400, data: { error: 'invalid param' } } },
        );
      }
      if (!body?.url || typeof body.url !== 'string') {
        throw Object.assign(
          new Error('Missing url in media upload body'),
          { response: { status: 422, data: { error: 'url required' } } },
        );
      }
      return { data: { job_id: 'media_job_001' } };
    }

    if (url.includes('/posts/schedule/publish')) {
      if (scenario === 'create_post_fail') {
        throw Object.assign(
          new Error('Publer API error'),
          { response: { status: 500, data: { error: 'internal error' } } },
        );
      }
      return { data: { job_id: 'post_job_002' } };
    }

    throw new Error(`Unexpected POST: ${url}`);
  },
};

// Pré-carrega axios para obter o path real no cache, depois substitui
const axiosReal = require('axios');
const axiosRealPath = require.resolve('axios');
require.cache[axiosRealPath].exports = axios;

// Mock do subirImagemGithub
const utilsPath = require.resolve('./src/utils');
require(utilsPath); // garante que o módulo está no cache
require.cache[utilsPath].exports = {
  subirImagemGithub: async () => 'https://raw.githubusercontent.com/fake/repo/main/img.png',
};

// Configurar vars de ambiente mínimas
process.env.PUBLER_API_KEY = 'test-api-key';
process.env.PUBLER_WORKSPACE_ID = 'test-workspace';
process.env.PUBLER_INSTAGRAM_ACCOUNT_ID = 'test-ig-account';

const { postToInstagram, publicarStory } = require('./src/postInstagram');

// ── Helpers ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  axiosMock.calls = [];
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    → ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ── Testes ───────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n=== SIMULAÇÃO: postInstagram.js ===\n');

  // ── 1. Feed post — fluxo feliz ─────────────────────────────────────────────
  console.log('1. Feed Post — fluxo feliz');

  await runTest('uploadMedia: envia apenas { url } — sem account_ids', async () => {
    scenario = 'happy';
    await postToInstagram({
      imageUrl: 'https://example.com/img.png',
      caption: 'Teste de legenda',
      linkUrl: 'https://site.com/artigo',
    });
    const mediaCall = axiosMock.calls.find(c => c.url.includes('/media/from-url'));
    assert(mediaCall, 'Chamada /media/from-url não encontrada');
    assert(!mediaCall.body?.media, 'account_ids wrapper media[] presente — BUG!');
    assert(!mediaCall.body?.account_ids, 'account_ids direto presente — BUG!');
    assert(mediaCall.body?.url === 'https://example.com/img.png', 'url incorreta no body');
  });

  await runTest('pollJob: retorna postId real (não jobId)', async () => {
    scenario = 'happy';
    const result = await postToInstagram({
      imageUrl: 'https://example.com/img.png',
      caption: 'Legenda',
    });
    assert(result.postId === 'post-xyz789', `postId esperado 'post-xyz789', recebeu '${result.postId}'`);
  });

  await runTest('polling do job é chamado após createPost', async () => {
    scenario = 'happy';
    await postToInstagram({ imageUrl: 'https://example.com/img.png', caption: 'x' });
    const pollCalls = axiosMock.calls.filter(c => c.url.includes('/job_status/'));
    assert(pollCalls.length >= 2, `Esperava ≥2 polls (mídia + post), encontrou ${pollCalls.length}`);
  });

  await runTest('mediaUrl retornada é a imageUrl original', async () => {
    scenario = 'happy';
    const result = await postToInstagram({ imageUrl: 'https://example.com/img.png', caption: 'x' });
    assert(result.mediaUrl === 'https://example.com/img.png', `mediaUrl incorreta: ${result.mediaUrl}`);
  });

  // ── 2. Story — fluxo feliz ─────────────────────────────────────────────────
  console.log('\n2. Story — fluxo feliz');

  await runTest('publicarStory: usa state=published', async () => {
    scenario = 'happy';
    await publicarStory(null, null, 'https://example.com/story.png');
    const postCall = axiosMock.calls.find(c => c.url.includes('/posts/schedule/publish'));
    assert(postCall?.body?.bulk?.state === 'published', `state incorreto: ${postCall?.body?.bulk?.state}`);
  });

  await runTest('publicarStory: details.type === story', async () => {
    scenario = 'happy';
    await publicarStory(null, null, 'https://example.com/story.png');
    const postCall = axiosMock.calls.find(c => c.url.includes('/posts/schedule/publish'));
    const igNet = postCall?.body?.bulk?.posts?.[0]?.networks?.instagram;
    assert(igNet?.details?.type === 'story', `details.type incorreto: ${igNet?.details?.type}`);
  });

  await runTest('publicarStory: retorna postId real', async () => {
    scenario = 'happy';
    const result = await publicarStory(null, null, 'https://example.com/story.png');
    assert(result.postId === 'post-xyz789', `postId esperado 'post-xyz789', recebeu '${result.postId}'`);
  });

  // ── 3. Falhas — comportamento esperado ────────────────────────────────────
  console.log('\n3. Cenários de falha');

  await runTest('pollJob: lança erro se job falhar', async () => {
    scenario = 'job_failed';
    let threw = false;
    try { await postToInstagram({ imageUrl: 'https://example.com/img.png', caption: 'x' }); }
    catch (e) { threw = true; assert(e.message.includes('failed'), `Erro inesperado: ${e.message}`); }
    assert(threw, 'Deveria ter lançado erro');
  });

  await runTest('pollJob: lança erro se payload sem .id', async () => {
    scenario = 'job_invalid_payload';
    let threw = false;
    try { await postToInstagram({ imageUrl: 'https://example.com/img.png', caption: 'x' }); }
    catch (e) { threw = true; assert(e.message.includes('payload inválido'), `Erro inesperado: ${e.message}`); }
    assert(threw, 'Deveria ter lançado erro por payload inválido');
  });

  await runTest('createPost: lança erro HTTP 500 com mensagem clara', async () => {
    scenario = 'create_post_fail';
    let threw = false;
    try { await postToInstagram({ imageUrl: 'https://example.com/img.png', caption: 'x' }); }
    catch (e) { threw = true; assert(e.message.includes('Publer post'), `Erro inesperado: ${e.message}`); }
    assert(threw, 'Deveria ter lançado erro de createPost');
  });

  await runTest('TEST_MODE: bloqueia publicação e retorna postId=test-mode', async () => {
    process.env.TEST_MODE = 'true';
    // Recarrega módulo com TEST_MODE ativo
    delete require.cache[require.resolve('./src/postInstagram')];
    const { postToInstagram: fn } = require('./src/postInstagram');
    const result = await fn({ imageUrl: 'https://example.com/img.png', caption: 'x' });
    assert(result.postId === 'test-mode', `postId esperado 'test-mode', recebeu '${result.postId}'`);
    const apiCalls = axiosMock.calls.filter(c => c.url.includes('publer'));
    assert(apiCalls.length === 0, 'API Publer foi chamada em TEST_MODE — BUG!');
    delete process.env.TEST_MODE;
  });

  // ── Resultado ─────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Resultado: ${passed} passou | ${failed} falhou`);
  if (failed > 0) process.exit(1);
})();
