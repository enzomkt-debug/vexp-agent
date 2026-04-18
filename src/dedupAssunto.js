require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STOPWORDS = new Set([
  'para','como','sobre','pelo','pela','pelos','pelas','com','sem','mais','menos',
  'essa','esse','isso','este','esta','isto','aquele','aquela','aquilo','dos','das',
  'nos','nas','que','qual','quais','ser','são','está','estão','são','tem','têm',
  'seu','sua','seus','suas','por','porque','quando','onde','depois','antes','entre',
  'ate','até','uma','uns','umas','dos','nos','aos','lhe','lhes','novo','nova',
  'novos','novas','ano','anos','dia','dias','mes','mês','meses','digital','brasil',
  'brasileiro','brasileira','muda','mudanca','mudança','pode','podem','foi','vai',
  'ja','já','seu','negocio','negócio',
]);

function tokenizar(titulo) {
  if (!titulo) return [];
  return titulo
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersect = 0;
  for (const t of setA) if (setB.has(t)) intersect++;
  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? 0 : intersect / unionSize;
}

function candidatoBateAlgumRecente(candidato, recentes, threshold = 0.35) {
  const tokensC = tokenizar(candidato);
  if (tokensC.length === 0) return null;
  let melhor = { titulo: null, score: 0 };
  for (const r of recentes) {
    const score = jaccard(tokensC, tokenizar(r));
    if (score > melhor.score) melhor = { titulo: r, score };
  }
  return melhor.score >= threshold ? melhor : null;
}

async function assuntoJaPostadoViaClaude(candidato, recentes) {
  if (!recentes.length) return false;
  const lista = recentes.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const prompt = `Você é um editor que evita repetição de pauta em um perfil de Instagram sobre ecommerce.

Analise o título CANDIDATO abaixo e diga se ele trata do MESMO ASSUNTO de algum dos títulos da lista RECENTES (mesmo fato/evento/tema central, mesmo que a fonte ou o ângulo seja diferente). Mudanças superficiais de redação, fonte ou data NÃO tornam o assunto diferente.

CANDIDATO:
${candidato}

RECENTES (últimos 30 dias):
${lista}

Responda SOMENTE com uma linha no formato:
DUPLICADO: <número do item recente que bate> | <justificativa curta>
OU
NOVO | <justificativa curta>`;

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    const resposta = (msg.content[0]?.text || '').trim();
    return /^DUPLICADO\b/i.test(resposta) ? resposta : false;
  } catch (err) {
    console.warn('[dedupAssunto] Erro ao consultar Claude:', err.message);
    return false;
  }
}

async function isAssuntoDuplicado(candidato, recentes) {
  const porOverlap = candidatoBateAlgumRecente(candidato, recentes, 0.35);
  if (porOverlap) {
    return { duplicado: true, motivo: `overlap ${porOverlap.score.toFixed(2)} com "${porOverlap.titulo}"` };
  }
  const overlapBorderline = candidatoBateAlgumRecente(candidato, recentes, 0.2);
  if (!overlapBorderline) return { duplicado: false };

  const respostaClaude = await assuntoJaPostadoViaClaude(candidato, recentes);
  if (respostaClaude) return { duplicado: true, motivo: respostaClaude };
  return { duplicado: false };
}

module.exports = { isAssuntoDuplicado, tokenizar, jaccard };
