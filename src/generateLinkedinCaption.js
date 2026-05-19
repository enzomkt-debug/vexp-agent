require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateLinkedinCaption({ titulo, fonte, url_fonte, artigo_completo }) {
  if (!artigo_completo) return null;

  const prompt = `Você é um analista editorial escrevendo um post de LinkedIn para a página Venda Exponencial, voltada a profissionais de e-commerce, varejo e marketplaces no Brasil.

A partir do artigo abaixo (que já contém análise e ponto de vista próprios), escreva um post NATIVO de LinkedIn seguindo ESTRITAMENTE estas regras:

ESTRUTURA OBRIGATÓRIA:
1. Primeira linha: uma tese, contraintuição ou afirmação forte em UMA frase. Essa linha precisa funcionar sozinha como gancho antes do "ver mais" do LinkedIn (máximo 200 caracteres). Nunca comece com "Você sabia", "Atenção", emoji ou pergunta genérica.
2. Linha em branco.
3. 2 a 4 parágrafos curtos (1 a 3 linhas cada) contendo: contexto mínimo da notícia + ao menos 1 dado concreto (número, prazo, percentual) + a análise/ponto de vista que já está no artigo, reescrita em tom de post.
4. Linha em branco.
5. Pergunta final que convide o leitor a responder com opinião própria nos comentários. Não pode ser pergunta retórica nem genérica tipo "o que você acha?".

REGRAS DE TOM E FORMATO:
- Tom editorial e analítico, como um colunista de Valor Econômico ou Brazil Journal. Nunca tom de portal de notícia, Instagram ou newsletter promocional.
- PROIBIDO: emoji decorativo, expressões "salva esse post", "fica de olho", "atenção", "spoiler", "imperdível", listas com bullet, negrito em markdown, ALL CAPS para ênfase.
- PROIBIDO: hashtag de marca própria. Nada de #vendaexponencial. No máximo 2 hashtags ao final, específicas do tema (ex: #ecommerce #varejo), sempre em minúsculas.
- PROIBIDO: incluir link clicável, URL ou citação de fonte no corpo do texto. Não escreva "Fonte:", "Fonte original:", "Leia mais:" nem qualquer URL — o link do artigo é anexado automaticamente depois.
- Sem assinatura, sem "por Venda Exponencial", sem rodapé.
- Comprimento total entre 600 e 1100 caracteres (esse range é o que o algoritmo do LinkedIn premia hoje).
- Português do Brasil. Quando expressar opinião, use primeira pessoa do plural ("vemos", "esperamos", "achamos"), nunca "nós da Venda Exponencial".

ARTIGO DE ORIGEM:
Título: ${titulo}
Conteúdo:
${artigo_completo}

Retorne APENAS o texto do post, sem explicação, sem aspas envolvendo o texto, sem markdown, sem comentário inicial ou final.`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    return message.content[0].text.trim();
  } catch (err) {
    console.error('Erro ao gerar legenda LinkedIn:', err.message);
    return null;
  }
}

module.exports = { generateLinkedinCaption };
