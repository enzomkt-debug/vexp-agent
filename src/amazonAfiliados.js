require('dotenv').config();
const crypto  = require('crypto');
const axios   = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

const ASSOCIATE_TAG = process.env.AMAZON_ASSOCIATE_TAG || 'vexp-20';
const ACCESS_KEY    = process.env.AMAZON_ACCESS_KEY;
const SECRET_KEY    = process.env.AMAZON_SECRET_KEY;
const REGION        = 'us-east-1';
const HOST          = 'webservices.amazon.com.br';
const PATH          = '/paapi5/searchitems';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── AWS Signature V4 ─────────────────────────────────────────────────────────
function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}

function getSignatureKey(key, dateStamp, region, service) {
  const kDate    = sign(Buffer.from('AWS4' + key, 'utf8'), dateStamp);
  const kRegion  = sign(kDate, region);
  const kService = sign(kRegion, service);
  return sign(kService, 'aws4_request');
}

function buildPaapiRequest(keywords) {
  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);

  const payload = JSON.stringify({
    Keywords:     keywords,
    Resources:    ['ItemInfo.Title', 'Offers.Listings.Price', 'Images.Primary.Medium'],
    SearchIndex:  'All',
    ItemCount:    3,
    PartnerTag:   ASSOCIATE_TAG,
    PartnerType:  'Associates',
    Marketplace:  'www.amazon.com.br',
  });

  const payloadHash = crypto.createHash('sha256').update(payload, 'utf8').digest('hex');

  const headers = {
    'content-encoding':    'amz-1.0',
    'content-type':        'application/json; charset=utf-8',
    host:                  HOST,
    'x-amz-date':          amzDate,
    'x-amz-target':        'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
  };

  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(k => `${k}:${headers[k]}\n`).join('');

  const canonicalRequest = [
    'POST', PATH, '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${REGION}/ProductAdvertisingAPI/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
  ].join('\n');

  const signingKey = getSignatureKey(SECRET_KEY, dateStamp, REGION, 'ProductAdvertisingAPI');
  const signature  = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { payload, headers: { ...headers, Authorization: authorization } };
}

// ── Busca produtos via PAAPI5 ────────────────────────────────────────────────
async function searchProducts(keywords) {
  if (!ACCESS_KEY || !SECRET_KEY) return null;

  try {
    const { payload, headers } = buildPaapiRequest(keywords);
    const { data } = await axios.post(`https://${HOST}${PATH}`, payload, { headers, timeout: 10000 });
    const items = data?.SearchResult?.Items || [];

    return items.map(item => ({
      title: item.ItemInfo?.Title?.DisplayValue || keywords,
      url:   item.DetailPageURL,
      price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount || null,
    }));
  } catch (err) {
    console.warn(`[amazonAfiliados] API falhou para "${keywords}": ${err.message}`);
    return null;
  }
}

// ── Fallback: link de busca com tag de afiliado ──────────────────────────────
function buildFallbackLink(keyword) {
  const q = encodeURIComponent(keyword);
  return `https://www.amazon.com.br/s?k=${q}&tag=${ASSOCIATE_TAG}`;
}

// ── Insere links no artigo via Claude ────────────────────────────────────────
async function insertAffiliateLinks(articleText, productLinks) {
  if (!productLinks || productLinks.length === 0) return articleText;

  const linksInfo = productLinks.map(p =>
    `- Produto: "${p.keyword}" | URL: ${p.url}${p.title && p.title !== p.keyword ? ` | Nome: ${p.title}` : ''}`
  ).join('\n');

  const prompt = `Você receberá um artigo em markdown e uma lista de produtos da Amazon com seus links de afiliado.

Sua tarefa: inserir os links de afiliado de forma NATURAL e CONTEXTUAL no texto do artigo, transformando o texto existente em hiperlink markdown: [texto](url).

REGRAS ESTRITAS:
- Insira no máximo 3 links no total
- Cada link deve aparecer UMA ÚNICA VEZ no artigo, na primeira menção relevante
- Insira SOMENTE em produtos físicos ou digitais concretos que alguém poderia comprar na Amazon (ex: "notebook", "leitor de código de barras", "software de gestão", "câmera", "impressora")
- NUNCA insira links em palavras abstratas ou conceituais como "empresas", "mercado", "vendas", "estratégia", "crescimento", "presença", "marketplace", "ecommerce", "negócio", "loja"
- NUNCA insira links em verbos, adjetivos ou expressões genéricas
- Se o produto listado não aparecer explicitamente no artigo como item comprável, NÃO insira o link — prefira não inserir nenhum link a inserir um inadequado
- Não adicione frases novas, não altere o conteúdo, não adicione notas ou avisos
- Retorne SOMENTE o artigo com os links inseridos, sem comentários

PRODUTOS PARA LINKAR:
${linksInfo}

ARTIGO:
${articleText}`;

  try {
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages:   [{ role: 'user', content: prompt }],
    });
    return message.content[0].text.trim();
  } catch (err) {
    console.warn(`[amazonAfiliados] Erro ao inserir links: ${err.message}`);
    return articleText;
  }
}

// ── Classifica candidatos: retorna apenas os que são produtos compráveis na Amazon ──
async function classifyAmazonKeywords(candidates) {
  if (!candidates || candidates.length === 0) return [];

  const prompt = `Você receberá uma lista de termos extraídos de títulos de artigos ou tendências de busca.

Retorne SOMENTE os termos que são produtos físicos ou digitais que alguém pode comprar na Amazon.com.br. Exemplos válidos: "notebook", "tênis de corrida", "câmera", "fone de ouvido", "livro", "suplemento", "impressora", "leitor de código de barras".

NÃO retorne: verbos, conceitos abstratos, nomes de empresas, expressões jornalísticas, termos de mercado, categorias de negócio, adjetivos ou qualquer coisa que não seja um produto tangível.

Termos para classificar:
${candidates.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Retorne SOMENTE um JSON array com os termos aprovados (strings). Se nenhum for produto, retorne []. Sem explicações.`;

  try {
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages:   [{ role: 'user', content: prompt }],
    });
    const parsed = JSON.parse(message.content[0].text.trim());
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  } catch (err) {
    console.warn(`[amazonAfiliados] Erro ao classificar keywords: ${err.message}`);
    return [];
  }
}

// ── Função principal: extrai termos, busca produtos, insere links ─────────────
async function addAffiliateLinks(articleText, keywords = []) {
  if (!keywords.length) return articleText;

  const productLinks = [];

  for (const kw of keywords.slice(0, 3)) {
    const apiResults = await searchProducts(kw);

    if (apiResults && apiResults.length > 0) {
      productLinks.push({ keyword: kw, url: apiResults[0].url, title: apiResults[0].title });
    } else {
      productLinks.push({ keyword: kw, url: buildFallbackLink(kw) });
    }
  }

  console.log(`[amazonAfiliados] Links preparados: ${productLinks.map(p => p.keyword).join(', ')}`);
  return insertAffiliateLinks(articleText, productLinks);
}

module.exports = { addAffiliateLinks, buildFallbackLink, classifyAmazonKeywords };
