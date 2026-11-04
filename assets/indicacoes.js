"use strict";
/*
 * Indicações de produtos com links de afiliado da Amazon e do Mercado Livre.
 *
 * Cada página de jogo ou ferramenta tem, logo depois do jogo ou da ferramenta e antes do texto,
 * um espaço <aside class="indicacao" data-indicacao="<nome da página>" hidden>. O título e o
 * aviso ficam no alto do quadro, e os botões das lojas embaixo, longe do tabuleiro e dos campos,
 * para ninguém tocar num link de loja sem querer.
 *
 * Para mostrar um produto, cole o link de afiliado dele em "amazon" ou "mercadolivre" na
 * lista INDICACOES abaixo (o nome da página é o nome do arquivo em _fonte/paginas, sem .html).
 * Para a Amazon, basta naAmazon("<código do produto>"): o código fica no endereço da página do
 * produto, depois de /dp/, e o link já sai com o ID de associado.
 * Produto sem nenhum link não aparece, e uma página sem nenhum link continua com o espaço
 * escondido. Dá para trocar o nome e o texto de cada produto para combinar com o link escolhido.
 *
 * Links aceitos: https em amazon.com.br, amzn.to, link.amazon, mercadolivre.com.br,
 * mercadolivre.com e meli.la. Para ver como o espaço fica antes de ter os links, abra a página com
 * ?indicacoes=teste no endereço.
 */
const Indicacoes = (() => {
  const LOJAS = {
    amazon: { nome: "Amazon", hosts: ["amazon.com.br", "amzn.to", "link.amazon"] },
    mercadolivre: { nome: "Mercado Livre", hosts: ["mercadolivre.com.br", "mercadolivre.com", "meli.la"] },
  };

  // Frase exigida pelo Programa de Associados da Amazon na página que tem link da Amazon
  const AVISO_AMAZON = "Como associado da Amazon, ganho com compras qualificadas.";
  const AVISO =
    "Links de indicação: se você comprar por eles, a EFS Aplicativos recebe uma comissão, sem custo a mais para você.";

  const produto = (nome, texto, amazon = "", mercadolivre = "") => ({ nome, texto, amazon, mercadolivre });

  // ID de associado da Amazon. O link de um produto é amazon.com.br/dp/<código do produto>?tag=<ID>.
  const ID_AMAZON = "efsaplicativo-20";
  const naAmazon = (codigo) => `https://www.amazon.com.br/dp/${codigo}?tag=${ID_AMAZON}`;

  // Produtos que aparecem em mais de uma página
  const LIVRO_FINANCAS = () =>
    produto(
      "Livro O Homem Mais Rico da Babilônia",
      "Um clássico das finanças pessoais, com lições simples sobre poupar e investir.",
      naAmazon("8595081530"),
    );
  const CALCULADORA_CIENTIFICA = () =>
    produto(
      "Calculadora científica Casio FX-82MS",
      "240 funções, para as provas e aulas em que o celular não pode ser usado.",
      naAmazon("B0D24MHSNN"),
    );
  const ADAPTADOR_TOMADA = () =>
    produto(
      "Adaptador de tomada universal",
      "Serve nas tomadas de mais de 150 países, para carregar o celular em viagens.",
      naAmazon("B0BQ41CYR5"),
    );
  const JOGO_XADREZ = (texto) =>
    produto("Jogo de xadrez em madeira, 39 × 39 cm", texto, naAmazon("B0D33VG78Q"));
  const BARALHO = (texto) => produto("Baralho Copag 139, naipe grande", texto, naAmazon("B07CYJZ23G"));

  // Os produtos sem link são ideias para quando houver um bom produto disponível.
  const INDICACOES = {
    // Jogos
    "2048": [
      produto("Cubo mágico GAN 3x3 magnético", "Outro quebra-cabeça de lógica, para treinar longe da tela.", naAmazon("B0C3B3SJJR")),
    ],
    "batalha-naval": [
      produto("Jogo Batalha Naval de tabuleiro", "A versão de tabuleiro, para jogar com a família na mesa.", naAmazon("B077PJBVWV")),
    ],
    "campo-minado": [
      produto(
        "Jogo Campo Minado Aventureiros, da Elka",
        "O campo minado para pular: placas de EVA no chão e cartas com o caminho certo. De 2 a 8 jogadores, para crianças de 4 a 8 anos.",
        "",
        "https://meli.la/1SNswKg",
      ),
    ],
    "color-sort": [],
    "cores-da-memoria": [
      produto("Jogo Genius, da Estrela", "O clássico de repetir a sequência de cores e sons.", naAmazon("B077P8HCHD")),
    ],
    "jogo-da-memoria": [
      produto("Jogo da memória em madeira, 40 peças", "Peças de verdade para jogar em família, sem tela.", naAmazon("B08VCYG2FG")),
    ],
    "jogo-da-velha": [produto("Jogo da velha em madeira", "Para levar a partida para a mesa.", naAmazon("B09Y2KNRVT"))],
    lumibricks: [],
    mahjong: [
      produto(
        "Mahjong com 144 peças",
        "As peças de verdade, com suporte e dados, para jogar o Mahjong tradicional com amigos.",
        "",
        "https://meli.la/2hMTATj",
      ),
    ],
    paciencia: [
      produto(
        "Baralho Copag 139, naipe grande",
        "Números e naipes maiores, fáceis de ler na mesa. No Mercado Livre, vem um kit com dois baralhos, um vermelho e um azul-marinho.",
        "https://link.amazon/B03b6LpYl",
        "https://meli.la/1ANvoPs",
      ),
    ],
    "puzzles-de-xadrez": [
      JOGO_XADREZ("Peças e tabuleiro de madeira, com rainhas extras, para montar os problemas e jogar com alguém."),
      produto(
        "Livro Xadrez: Táticas e Estratégias dos Campeões",
        "Mais problemas e ideias para treinar a visão de jogo.",
        naAmazon("8573931396"),
      ),
    ],
    "qual-e-a-bandeira": [
      produto("Atlas Geográfico Escolar do IBGE", "Mapas do Brasil e do mundo para consultar e estudar.", naAmazon("852404599X")),
    ],
    "quebra-cabeca": [produto("Quebra-cabeça Grow de 1000 peças", "Para montar com calma, peça por peça.", naAmazon("B07BFH2YJ5"))],
    sudoku: [
      produto("Livro Coquetel Sudoku", "Grades nos níveis fácil, médio e difícil, para jogar no papel.", naAmazon("8500520531")),
    ],

    // Ferramentas
    aposentadoria: [LIVRO_FINANCAS()],
    calculadora: [produto("Calculadora de mesa Casio MX-12B", "12 dígitos, para as contas do dia a dia.", naAmazon("B0CN1LNJJ8"))],
    "calculadora-cientifica": [CALCULADORA_CIENTIFICA()],
    "calculadora-de-combustivel": [
      produto(
        "Calibrador de pneus digital portátil",
        "Com compressor, para calibrar em casa. Pneu bem calibrado gasta menos combustível.",
        "",
        "https://meli.la/1BhUHo5",
      ),
    ],
    "calculadora-de-datas": [],
    "calculadora-de-idade": [],
    "calculadora-financeira-rpn": [
      produto("Calculadora financeira HP 12C Gold", "A calculadora RPN de verdade, muito usada em finanças.", naAmazon("B006FUTYX8")),
    ],
    "consulta-cep": [],
    "consumo-de-agua": [
      produto(
        "Garrafa motivacional de 2 litros",
        "Com canudo, alça e frases de motivação, para ter água por perto o dia todo.",
        "",
        "https://meli.la/1mAt5uw",
      ),
    ],
    "conversor-de-bases": [],
    "conversor-de-medidas": [
      produto("Balança digital de cozinha, até 10 kg", "Pesa os ingredientes de grama em grama.", naAmazon("B0843HKX18")),
    ],
    "conversor-de-moedas": [ADAPTADOR_TOMADA()],
    "conversor-de-temperatura": [
      produto("Termômetro culinário digital", "Tipo espeto, para medir a temperatura de alimentos e líquidos.", naAmazon("B07X5S15SM")),
    ],
    "correcao-ipca": [LIVRO_FINANCAS()],
    "cronometro-e-timer": [
      produto("Timer digital com ímã", "Um cronômetro de mesa para a cozinha ou os estudos.", naAmazon("B0BS9SC4GD")),
    ],
    equacoes: [CALCULADORA_CIENTIFICA()],
    estatistica: [CALCULADORA_CIENTIFICA()],
    financiamento: [LIVRO_FINANCAS()],
    "fuso-horario": [ADAPTADOR_TOMADA()],
    geometria: [
      produto(
        "Kit de desenho Acrimet",
        "Régua de 30 cm, dois esquadros e transferidor para desenhar as figuras.",
        naAmazon("B077QPLR6Q"),
      ),
    ],
    "gerador-de-numeros-loteria": [],
    imc: [produto("Balança digital de banheiro, até 180 kg", "Para acompanhar o peso em casa.", naAmazon("B07J5HDFMR"))],
    "investimento-com-aportes": [LIVRO_FINANCAS()],
    "juros-compostos": [LIVRO_FINANCAS()],
    "juros-simples": [LIVRO_FINANCAS()],
    "lei-de-ohm": [
      produto("Multímetro digital Minipa ET-1002", "Mede tensão, corrente e resistência na prática.", naAmazon("B075SBGT6Q")),
    ],
    "lista-de-compras": [
      produto(
        "Sacola de compras dobrável",
        "Reforçada e dobrável, para levar na bolsa e usar no mercado no lugar da sacola plástica.",
        "",
        "https://meli.la/2iv39eC",
      ),
    ],
    "lista-de-tarefas": [
      produto(
        "Planner semanal permanente",
        "Sem datas impressas, para organizar as tarefas no papel em qualquer semana do ano.",
        "",
        "https://meli.la/2hL3taX",
      ),
    ],
    "marcador-de-truco": [BARALHO("O baralho clássico das partidas de truco, com naipes grandes e fáceis de ler.")],
    matrizes: [CALCULADORA_CIENTIFICA()],
    "relogio-de-blinds-poker": [
      BARALHO("Um baralho clássico para as mãos do torneio em casa."),
      produto(
        "Maleta de pôquer com 300 fichas",
        "Fichas e acessórios numa maleta com tranca, para o torneio em casa.",
        "",
        "https://meli.la/1gA1D4F",
      ),
    ],
    "relogio-de-xadrez": [
      produto(
        "Relógio de xadrez digital",
        "Com bônus de tempo e contagem de atraso, para as partidas no tabuleiro.",
        naAmazon("B07X8WMRD3"),
      ),
      JOGO_XADREZ("Peças e tabuleiro de madeira para jogar com o relógio."),
    ],
  };

  /** Aceita só https nos endereços das lojas, para um link colado errado não ir ao ar. */
  function linkValido(endereco, loja) {
    if (typeof endereco !== "string" || !endereco || !LOJAS[loja]) return false;
    let url;
    try {
      url = new URL(endereco);
    } catch (error) {
      return false;
    }
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return LOJAS[loja].hosts.some((permitido) => host === permitido || host.endsWith(`.${permitido}`));
  }

  /**
   * Produtos que aparecem na página, cada um com os links válidos. No modo de teste, aparecem
   * também os produtos ainda sem link, com links vazios.
   */
  function produtosDaPagina(pagina, teste = false, lista = INDICACOES) {
    const produtos = Object.prototype.hasOwnProperty.call(lista, pagina) ? lista[pagina] : [];
    const visiveis = [];
    for (const item of produtos) {
      const links = [];
      for (const loja of Object.keys(LOJAS)) {
        if (linkValido(item[loja], loja)) links.push({ loja, nomeLoja: LOJAS[loja].nome, link: item[loja] });
        else if (teste) links.push({ loja, nomeLoja: LOJAS[loja].nome, link: "" });
      }
      if (teste || links.length) visiveis.push({ nome: item.nome, texto: item.texto, links });
    }
    return visiveis;
  }

  /** Links preenchidos que não passam na verificação, para avisar no console. */
  function linksInvalidos(lista = INDICACOES) {
    const erros = [];
    for (const [pagina, produtos] of Object.entries(lista)) {
      for (const item of produtos) {
        for (const loja of Object.keys(LOJAS)) {
          if (item[loja] && !linkValido(item[loja], loja)) erros.push(`${pagina}: ${item.nome} (${LOJAS[loja].nome})`);
        }
      }
    }
    return erros;
  }

  return { LOJAS, AVISO, AVISO_AMAZON, INDICACOES, linkValido, produtosDaPagina, linksInvalidos };
})();

if (typeof module === "object") module.exports = Indicacoes;

if (typeof document === "object") {
  (() => {
    const espaco = document.querySelector(".indicacao[data-indicacao]");
    if (!espaco) return;

    let teste = false;
    try {
      teste = new URLSearchParams(location.search).get("indicacoes") === "teste";
    } catch (error) {
      teste = false;
    }

    for (const erro of Indicacoes.linksInvalidos()) console.warn(`Link de indicação recusado: ${erro}`);

    const produtos = Indicacoes.produtosDaPagina(espaco.dataset.indicacao, teste);
    if (!produtos.length) return;

    const criar = (tag, classe, texto) => {
      const elemento = document.createElement(tag);
      if (classe) elemento.className = classe;
      if (texto) elemento.textContent = texto;
      return elemento;
    };

    const titulo = criar("h2", "", "Indicações para você");
    titulo.id = "indicacao-titulo";
    espaco.setAttribute("aria-labelledby", titulo.id);

    const temAmazon = produtos.some((item) => item.links.some((link) => link.loja === "amazon"));
    const aviso = criar("p", "indicacao-aviso", Indicacoes.AVISO + (temAmazon ? ` ${Indicacoes.AVISO_AMAZON}` : ""));

    const lista = criar("ul", "indicacao-lista");
    for (const item of produtos) {
      const li = criar("li", "indicacao-item");
      li.append(criar("strong", "", item.nome), criar("p", "", item.texto));
      const lojas = criar("div", "indicacao-lojas");
      for (const { nomeLoja, link } of item.links) {
        const rotulo = nomeLoja === "Amazon" ? "Ver na Amazon" : "Ver no Mercado Livre";
        if (link) {
          const a = criar("a", "indicacao-link", rotulo);
          a.href = link;
          a.target = "_blank";
          a.rel = "sponsored noopener";
          a.setAttribute("aria-label", `${rotulo}: ${item.nome} (abre em nova aba)`);
          const seta = criar("span", "", "↗");
          seta.setAttribute("aria-hidden", "true");
          a.append(seta);
          lojas.append(a);
        } else {
          lojas.append(criar("span", "indicacao-link indicacao-sem-link", `${rotulo} (sem link ainda)`));
        }
      }
      li.append(lojas);
      lista.append(li);
    }

    espaco.append(titulo, aviso, lista);
    if (teste) espaco.classList.add("indicacao-teste");
    espaco.hidden = false;
  })();
}
