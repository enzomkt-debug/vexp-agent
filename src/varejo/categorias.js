// Lista de categorias do varejo digital brasileiro.
// Cada entrada tem: id (único), label (nome amigável), keywords (para Google Trends).
// A rotação diária usa o dia do mês (1–31) mapeado ciclicamente sobre esta lista.

const CATEGORIAS = [
  { id: 'moda-feminina',        label: 'Moda Feminina',            keywords: ['moda feminina', 'roupas femininas', 'vestido'] },
  { id: 'moda-masculina',       label: 'Moda Masculina',           keywords: ['moda masculina', 'roupas masculinas', 'camisa'] },
  { id: 'calcados',             label: 'Calçados',                 keywords: ['tenis', 'calcados', 'sapato feminino'] },
  { id: 'smartphones',          label: 'Smartphones',              keywords: ['smartphone', 'celular', 'iphone brasil'] },
  { id: 'notebooks',            label: 'Notebooks e Computadores', keywords: ['notebook', 'computador', 'laptop'] },
  { id: 'tv-eletronicos',       label: 'TVs e Eletrônicos',        keywords: ['smart tv', 'televisao', 'home theater'] },
  { id: 'games',                label: 'Games e Consoles',         keywords: ['playstation', 'xbox', 'nintendo switch'] },
  { id: 'beleza-cosmeticos',    label: 'Beleza e Cosméticos',      keywords: ['maquiagem', 'perfume', 'skincare'] },
  { id: 'suplementos',          label: 'Suplementos e Fitness',    keywords: ['whey protein', 'suplemento alimentar', 'creatina'] },
  { id: 'casa-decoracao',       label: 'Casa e Decoração',         keywords: ['decoracao casa', 'cortina', 'tapete sala'] },
  { id: 'moveis',               label: 'Móveis',                   keywords: ['sofa', 'guarda roupa', 'cama box'] },
  { id: 'utensilios',           label: 'Utensílios Domésticos',    keywords: ['panela', 'airfryer', 'liquidificador'] },
  { id: 'eletrodomesticos',     label: 'Eletrodomésticos',         keywords: ['geladeira', 'maquina de lavar', 'fogao'] },
  { id: 'livros',               label: 'Livros',                   keywords: ['livros mais vendidos', 'livro ficcao', 'autoajuda livro'] },
  { id: 'esportes',             label: 'Artigos Esportivos',       keywords: ['chuteira', 'bicicleta', 'equipamento fitness'] },
  { id: 'ferramentas',          label: 'Ferramentas e Construção', keywords: ['furadeira', 'ferramentas', 'material construcao'] },
  { id: 'pet',                  label: 'Pet Shop',                 keywords: ['racao cachorro', 'petshop', 'acessorios pet'] },
  { id: 'brinquedos',           label: 'Brinquedos',               keywords: ['brinquedo', 'boneca', 'lego brasil'] },
  { id: 'bebe',                 label: 'Bebê e Maternidade',       keywords: ['carrinho de bebe', 'enxoval bebe', 'fraldas'] },
  { id: 'joias-relogios',       label: 'Joias e Relógios',         keywords: ['relogio masculino', 'pulseira', 'anel ouro'] },
  { id: 'informatica',          label: 'Informática e Periféricos',keywords: ['teclado mecanico', 'mouse gamer', 'headset'] },
  { id: 'automotivo',           label: 'Automotivo e Motos',       keywords: ['peca carro', 'acessorios automotivos', 'capacete moto'] },
  { id: 'saude',                label: 'Saúde e Farmácia',         keywords: ['vitamina c', 'termometro', 'medidor pressao'] },
  { id: 'bolsas',               label: 'Bolsas e Acessórios',      keywords: ['bolsa feminina', 'mochila', 'carteira masculina'] },
  { id: 'infantil-roupas',      label: 'Roupas Infantis',          keywords: ['roupa infantil', 'conjunto infantil', 'pijama infantil'] },
  { id: 'alimentos-delivery',   label: 'Alimentos e Delivery',     keywords: ['delivery', 'kit churrasqueira', 'cafeteira'] },
  { id: 'papelaria',            label: 'Papelaria e Escritório',   keywords: ['caderno', 'caneta', 'material escolar'] },
  { id: 'oculos',               label: 'Óculos e Acessórios',      keywords: ['oculos sol', 'oculos grau', 'lente contato'] },
  { id: 'streaming-digital',    label: 'Serviços Digitais',        keywords: ['assinatura streaming', 'curso online', 'software'] },
  { id: 'cama-banho',           label: 'Cama, Mesa e Banho',       keywords: ['jogo de cama', 'toalha banho', 'edredom'] },
  { id: 'audio',                label: 'Áudio e Música',           keywords: ['fone bluetooth', 'caixa de som', 'headphone'] },
];

// Retorna a categoria para o dia do mês (1–31), ciclicamente
function getCategoriaParaDia(diaDoMes) {
  const idx = (diaDoMes - 1) % CATEGORIAS.length;
  return CATEGORIAS[idx];
}

// Retorna todas as categorias
function getAllCategorias() {
  return CATEGORIAS;
}

module.exports = { CATEGORIAS, getCategoriaParaDia, getAllCategorias };
