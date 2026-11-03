"use strict";
/*
 * Regras do Mahjong Solitário Clássico, portadas do app Android (com.efsaplicativos.mahjong):
 * logica/Pecas.kt (faces e naipes), logica/Tabuleiro.kt (posições em meias peças e peça livre),
 * logica/Tabuleiros.kt (os 15 desenhos), logica/Distribuidor.kt (sorteio com solução garantida
 * e embaralhar), logica/Partida.kt (jogadas, desfazer, dicas, pontuação) e
 * dados/RepositorioRecordes.kt (recordes por tabuleiro). Sem DOM: roda no navegador e no node.
 *
 * O sorteio recebe uma função aleatorio() que devolve um número em [0, 1), como Math.random,
 * para os testes poderem usar uma sequência fixa.
 */
const LogicaMahjong = (() => {
  const TENTATIVAS = 400;
  const DICAS_POR_PARTIDA = 3;
  const EMBARALHADAS_POR_PARTIDA = 2;
  const VERSAO_PARTIDA = 1;

  // ---------- Peças ----------

  /** Estações e flores são "coringas": combinam com qualquer peça do mesmo naipe. */
  const NAIPES = [
    { id: "bambu", nome: "Bambus" },
    { id: "caractere", nome: "Caracteres" },
    { id: "circulo", nome: "Círculos" },
    { id: "dragao", nome: "Dragões" },
    { id: "vento", nome: "Ventos" },
    { id: "estacao", nome: "Estações", coringa: true },
    { id: "flor", nome: "Flores", coringa: true },
  ];

  /**
   * As 42 faces, na mesma ordem do enum Face do app (o índice é o código salvo na partida).
   * O jogo completo tem 144 peças: 4 cópias de cada uma das 34 faces comuns, mais 4 estações
   * e 4 flores (uma de cada). [arquivo] é a imagem em /assets/jogos/mahjong/.
   */
  const FACES = [];
  function face(naipe, nome, arquivo) {
    const n = NAIPES.findIndex((item) => item.id === naipe);
    const indice = FACES.length;
    FACES.push({
      indice,
      naipe,
      nome,
      arquivo,
      // Peças com a mesma chave formam par (todas as estações têm a mesma chave; idem flores)
      chavePar: NAIPES[n].coringa ? -1 - n : indice,
    });
  }
  for (let i = 1; i <= 9; i++) face("bambu", `${i} de bambu`, `bambu-${i}`);
  for (let i = 1; i <= 9; i++) face("caractere", `${i} de caractere`, `caractere-${i}`);
  for (let i = 1; i <= 9; i++) face("circulo", `${i} de círculo`, `circulo-${i}`);
  face("dragao", "Dragão vermelho", "dragao-vermelho");
  face("dragao", "Dragão verde", "dragao-verde");
  face("dragao", "Dragão branco", "dragao-branco");
  face("vento", "Vento leste", "vento-leste");
  face("vento", "Vento sul", "vento-sul");
  face("vento", "Vento oeste", "vento-oeste");
  face("vento", "Vento norte", "vento-norte");
  face("estacao", "Primavera", "estacao-primavera");
  face("estacao", "Verão", "estacao-verao");
  face("estacao", "Outono", "estacao-outono");
  face("estacao", "Inverno", "estacao-inverno");
  face("flor", "Flor de ameixa", "flor-ameixa");
  face("flor", "Orquídea", "flor-orquidea");
  face("flor", "Crisântemo", "flor-crisantemo");
  face("flor", "Flor de bambu", "flor-bambu");

  function coringa(indiceFace) {
    const naipe = FACES[indiceFace].naipe;
    return naipe === "estacao" || naipe === "flor";
  }

  function combinam(a, b) {
    return FACES[a].chavePar === FACES[b].chavePar;
  }

  // ---------- Tabuleiros ----------

  const DIFICULDADES = [
    { id: "facil", titulo: "Fácil", descricao: "Tabuleiros baixos e abertos, com muitas peças livres. Bons para começar." },
    { id: "medio", titulo: "Médio", descricao: "Mais peças e camadas: pense antes de tirar os pares." },
    { id: "dificil", titulo: "Difícil", descricao: "Torres altas e muitas peças presas. Para quem já domina o jogo." },
  ];

  /**
   * Quem prende quem. Uma peça está livre quando nada está em cima dela (nem meia peça) e
   * pelo menos um dos lados, esquerdo ou direito, está desocupado.
   */
  function calcularVizinhanca(posicoes) {
    const acima = [];
    const esquerda = [];
    const direita = [];
    for (let i = 0; i < posicoes.length; i++) {
      const p = posicoes[i];
      const cima = [];
      const esq = [];
      const dir = [];
      for (let j = 0; j < posicoes.length; j++) {
        const q = posicoes[j];
        if (q.z > p.z && Math.abs(q.x - p.x) < 2 && Math.abs(q.y - p.y) < 2) cima.push(j);
        if (q.z === p.z && Math.abs(q.y - p.y) < 2) {
          if (q.x === p.x - 2) esq.push(j);
          if (q.x === p.x + 2) dir.push(j);
        }
      }
      acima.push(cima);
      esquerda.push(esq);
      direita.push(dir);
    }
    return { acima, esquerda, direita };
  }

  /**
   * Um desenho de tabuleiro, em meias peças: a peça em (x, y) ocupa as células x..x+1 e
   * y..y+1 da camada z. As posições ficam na ordem de desenho (camada, depois diagonal), que
   * é a mesma ordem dos índices da partida.
   */
  function criarTabuleiro(indice, id, nome, dificuldade, lista) {
    const minX = Math.min(...lista.map((p) => p.x));
    const minY = Math.min(...lista.map((p) => p.y));
    // A lateral 3D da peça fica à direita e embaixo: quem está à direita/abaixo (x + y maior)
    // precisa ser desenhado depois para cobri-la. O sort do JS é estável, como o do Kotlin.
    const posicoes = lista
      .map((p) => ({ x: p.x - minX, y: p.y - minY, z: p.z }))
      .sort((a, b) => a.z - b.z || a.x + a.y - (b.x + b.y) || a.x - b.x);
    let vizinhanca = null;
    return {
      indice,
      id,
      nome,
      dificuldade,
      posicoes,
      largura: Math.max(...posicoes.map((p) => p.x)) + 2,
      altura: Math.max(...posicoes.map((p) => p.y)) + 2,
      camadas: Math.max(...posicoes.map((p) => p.z)) + 1,
      totalPecas: posicoes.length,
      get vizinhanca() {
        if (!vizinhanca) vizinhanca = calcularVizinhanca(posicoes);
        return vizinhanca;
      },
    };
  }

  /** Funções de desenho dos tabuleiros, as mesmas de Tabuleiros.Desenho. */
  function desenho() {
    const posicoes = [];
    const peca = (x, y, z = 0) => posicoes.push({ x, y, z });
    /** [colunas] × [linhas] peças lado a lado, a partir de (x, y). */
    const bloco = (x, y, colunas, linhas, z = 0) => {
      for (let c = 0; c < colunas; c++) for (let l = 0; l < linhas; l++) peca(x + 2 * c, y + 2 * l, z);
    };
    const linha = (x, y, quantidade, z = 0) => bloco(x, y, quantidade, 1, z);
    const coluna = (x, y, quantidade, z = 0) => bloco(x, y, 1, quantidade, z);
    return { posicoes, peca, bloco, linha, coluna };
  }

  /** Os 15 tabuleiros do app, redesenhados para a tela em pé (até 8 peças de largura). */
  const DESENHOS = [
    // ---------- Fácil ----------
    ["jardim-zen", "Jardim Zen", "facil", ({ peca, bloco }) => {
      bloco(4, 4, 4, 4);
      // pedras do jardim nos quatro lados
      peca(7, 1); peca(7, 13); peca(1, 7); peca(13, 7);
      bloco(6, 6, 2, 2, 1);
    }],
    ["ponte-simples", "Ponte Simples", "facil", ({ peca, bloco, coluna }) => {
      bloco(0, 6, 7, 2); // tabuleiro da ponte
      coluna(2, 2, 2); coluna(10, 2, 2); // torres
      coluna(2, 10, 2); coluna(10, 10, 2); // pilares
      peca(5, 7, 1); peca(7, 7, 1); // arco no meio
      peca(2, 3, 1); peca(10, 3, 1); peca(2, 11, 1); peca(10, 11, 1);
    }],
    ["flor-de-lotus", "Flor de Lótus", "facil", ({ peca, bloco }) => {
      bloco(6, 6, 2, 2); // miolo
      peca(7, 0); peca(7, 2); peca(7, 4); // pétalas: cima
      peca(7, 10); peca(7, 12); peca(7, 14); // baixo
      peca(0, 7); peca(2, 7); peca(4, 7); // esquerda
      peca(10, 7); peca(12, 7); peca(14, 7); // direita
      peca(3, 3); peca(11, 3); peca(3, 11); peca(11, 11); // diagonais
      bloco(6, 6, 2, 2, 1);
      peca(7, 3, 1); peca(7, 11, 1); peca(3, 7, 1); peca(11, 7, 1);
      peca(6, 7, 2); peca(8, 7, 2);
    }],
    ["caminho-sereno", "Caminho Sereno", "facil", ({ peca, linha, coluna }) => {
      // trilha em S
      linha(0, 0, 6); coluna(10, 2, 2);
      linha(0, 6, 6); coluna(0, 8, 2);
      linha(0, 12, 6);
      // pedras de passagem
      for (const y of [0, 6, 12]) {
        peca(3, y, 1); peca(7, y, 1);
      }
      peca(10, 3, 1); peca(0, 9, 1);
    }],
    ["portal-basico", "Portal Básico", "facil", ({ peca, linha, coluna }) => {
      linha(0, 0, 8); // viga de cima
      peca(2, 2); peca(12, 2);
      linha(2, 4, 6); // viga de baixo
      coluna(2, 6, 4); coluna(12, 6, 4); // colunas
      linha(1, 0, 7, 1); // telhado
      peca(7, 4, 1);
      peca(2, 7, 1); peca(2, 11, 1); peca(12, 7, 1); peca(12, 11, 1);
    }],

    // ---------- Médio ----------
    ["dragao-adormecido", "Dragão Adormecido", "medio", ({ peca, bloco, linha }) => {
      bloco(10, 0, 2, 2); // cabeça
      bloco(2, 4, 6, 2); // corpo
      bloco(2, 8, 2, 2);
      bloco(2, 12, 6, 2);
      bloco(10, 16, 2, 2); // cauda
      // espinhaço
      linha(3, 5, 5, 1); linha(3, 13, 5, 1);
      peca(11, 1, 1); peca(3, 9, 1); peca(11, 17, 1);
      linha(4, 5, 4, 2); linha(4, 13, 4, 2);
      peca(11, 1, 2);
    }],
    ["labirinto-real", "Labirinto Real", "medio", ({ peca, linha, coluna }) => {
      // muro externo
      linha(0, 0, 7); linha(0, 16, 7);
      coluna(0, 2, 7); coluna(12, 2, 7);
      // paredes internas
      linha(2, 4, 4); linha(4, 8, 4); linha(2, 12, 4);
      linha(1, 0, 6, 1); linha(1, 16, 6, 1);
      for (const y of [3, 7, 11]) {
        peca(0, y, 1); peca(12, y, 1);
      }
      peca(3, 4, 1); peca(7, 4, 1);
      peca(5, 8, 1); peca(9, 8, 1);
      peca(3, 12, 1); peca(7, 12, 1);
    }],
    ["torre-do-vento", "Torre do Vento", "medio", ({ peca, bloco }) => {
      bloco(4, 0, 4, 8);
      // bandeiras ao vento
      peca(2, 2); peca(12, 6); peca(2, 10); peca(12, 14);
      bloco(5, 1, 3, 7, 1);
      bloco(6, 4, 2, 4, 2);
      peca(7, 7, 3);
    }],
    ["piramide-antiga", "Pirâmide Antiga", "medio", ({ peca, bloco }) => {
      bloco(0, 0, 6, 7);
      bloco(2, 2, 4, 5, 1);
      bloco(4, 4, 2, 3, 2);
      peca(5, 5, 3); peca(5, 7, 3);
    }],
    ["tartaruga-classica", "Tartaruga Clássica", "medio", ({ peca, bloco }) => {
      bloco(2, 2, 6, 7); // casco
      peca(7, 0); // cabeça
      peca(7, 16); // rabo
      peca(0, 3); peca(14, 3); peca(0, 11); peca(14, 11); // patas
      bloco(4, 4, 4, 5, 1);
      bloco(6, 6, 2, 3, 2);
    }],

    // ---------- Difícil ----------
    ["grande-muralha", "Grande Muralha", "dificil", ({ peca, bloco, linha }) => {
      // a muralha serpenteia em três trechos
      bloco(0, 0, 8, 2); bloco(12, 4, 2, 2);
      bloco(0, 8, 8, 2); bloco(0, 12, 2, 2);
      bloco(0, 16, 8, 2);
      for (const y of [1, 9, 17]) linha(1, y, 7, 1);
      peca(13, 5, 1); peca(1, 13, 1);
      // torres de vigia
      peca(1, 1, 2); peca(13, 1, 2);
      peca(1, 9, 2); peca(7, 9, 2); peca(13, 9, 2);
      peca(1, 17, 2); peca(13, 17, 2);
      peca(1, 1, 3); peca(13, 17, 3);
    }],
    ["fortaleza-imperial", "Fortaleza Imperial", "dificil", ({ peca, bloco, linha, coluna }) => {
      // muralha com pátio interno vazio
      for (let x = 0; x <= 7; x++) {
        for (let y = 0; y <= 9; y++) {
          if (x >= 3 && x <= 4 && y >= 3 && y <= 6) continue;
          peca(2 * x, 2 * y);
        }
      }
      // torres nos cantos
      bloco(0, 0, 2, 2, 1); bloco(12, 0, 2, 2, 1);
      bloco(0, 16, 2, 2, 1); bloco(12, 16, 2, 2, 1);
      // ameias
      linha(5, 1, 3, 1); linha(5, 15, 3, 1);
      coluna(1, 7, 3, 1); coluna(13, 7, 3, 1);
      peca(1, 1, 2); peca(13, 1, 2); peca(1, 17, 2); peca(13, 17, 2);
    }],
    ["templo-sagrado", "Templo Sagrado", "dificil", ({ peca, bloco }) => {
      bloco(0, 0, 7, 8);
      peca(5, 16); peca(7, 16); // escadaria
      bloco(1, 1, 6, 7, 1);
      bloco(4, 6, 3, 2, 2); // santuário
      peca(5, 7, 3); peca(7, 7, 3);
    }],
    ["montanha-celestial", "Montanha Celestial", "dificil", ({ peca, bloco }) => {
      bloco(0, 0, 8, 9);
      // dois picos
      bloco(1, 5, 3, 4, 1); bloco(9, 3, 3, 4, 1);
      bloco(2, 6, 2, 3, 2); bloco(10, 4, 2, 3, 2);
      peca(3, 7, 3); peca(3, 9, 3); peca(11, 5, 3); peca(11, 7, 3);
      peca(3, 8, 4); peca(11, 6, 4);
    }],
    ["palacio-do-imperador", "Palácio do Imperador", "dificil", ({ peca, bloco }) => {
      bloco(0, 0, 8, 10);
      bloco(4, 4, 4, 6, 1); // salão principal
      peca(1, 1, 1); peca(13, 1, 1); peca(1, 17, 1); peca(13, 17, 1); // pavilhões
      bloco(6, 6, 2, 4, 2);
      peca(7, 7, 3); peca(7, 11, 3);
    }],
  ];

  const TABULEIROS = DESENHOS.map(([id, nome, dificuldade, desenhar], indice) => {
    const d = desenho();
    desenhar(d);
    return criarTabuleiro(indice, id, nome, dificuldade, d.posicoes);
  });

  function tabuleiroPorId(id) {
    return TABULEIROS.find((t) => t.id === id) || null;
  }

  /** O próximo tabuleiro da lista (volta ao primeiro depois do último). */
  function proximoTabuleiro(tabuleiro) {
    return TABULEIROS[(tabuleiro.indice + 1) % TABULEIROS.length];
  }

  // ---------- Peça livre ----------

  function temAlguem(indices, faces) {
    for (const j of indices) if (faces[j] !== null) return true;
    return false;
  }

  /** A peça [i] está na mesa, sem nada em cima e com um dos lados vazio. */
  function livre(tabuleiro, faces, i) {
    if (faces[i] === null) return false;
    const viz = tabuleiro.vizinhanca;
    return (
      !temAlguem(viz.acima[i], faces) &&
      (!temAlguem(viz.esquerda[i], faces) || !temAlguem(viz.direita[i], faces))
    );
  }

  /** Pares que podem ser removidos agora, como [a, b] com a < b na ordem das posições. */
  function jogadas(tabuleiro, faces) {
    const livres = [];
    for (let i = 0; i < faces.length; i++) if (livre(tabuleiro, faces, i)) livres.push(i);
    const pares = [];
    for (let x = 0; x < livres.length; x++) {
      for (let y = x + 1; y < livres.length; y++) {
        if (combinam(faces[livres[x]], faces[livres[y]])) pares.push([livres[x], livres[y]]);
      }
    }
    return pares;
  }

  // ---------- Sorteio ----------

  function embaralharLista(lista, aleatorio) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  /** As 144 peças do jogo completo, agrupadas nos 72 pares possíveis e embaralhadas. */
  function paresSorteados(aleatorio) {
    const pares = [];
    for (const f of FACES) {
      if (!coringa(f.indice)) {
        pares.push([f.indice, f.indice]);
        pares.push([f.indice, f.indice]);
      }
    }
    for (const naipe of ["estacao", "flor"]) {
      // Estações e flores são únicas, mas qualquer uma combina com outra do mesmo naipe
      const faces = embaralharLista(
        FACES.filter((f) => f.naipe === naipe).map((f) => f.indice),
        aleatorio,
      );
      pares.push([faces[0], faces[1]]);
      pares.push([faces[2], faces[3]]);
    }
    return embaralharLista(pares, aleatorio);
  }

  /** Sorteio com peso: peças das camadas de cima saem antes. */
  function sortearIndice(candidatas, tabuleiro, aleatorio) {
    const pesos = candidatas.map((i) => 1 + 3 * tabuleiro.posicoes[i].z);
    let sorteio = Math.floor(aleatorio() * pesos.reduce((a, b) => a + b, 0));
    for (let k = 0; k < candidatas.length; k++) {
      sorteio -= pesos[k];
      if (sorteio < 0) return candidatas[k];
    }
    return candidatas[candidatas.length - 1];
  }

  function tentarOrdem(tabuleiro, indices, aleatorio) {
    const presente = new Array(tabuleiro.totalPecas).fill(null);
    for (const i of indices) presente[i] = 0;
    const ordem = [];
    const restantes = indices.slice();
    while (restantes.length) {
      const livres = restantes.filter((i) => livre(tabuleiro, presente, i));
      if (livres.length < 2) return null;
      const a = sortearIndice(livres, tabuleiro, aleatorio);
      const b = sortearIndice(livres.filter((i) => i !== a), tabuleiro, aleatorio);
      presente[a] = null;
      presente[b] = null;
      restantes.splice(restantes.indexOf(a), 1);
      restantes.splice(restantes.indexOf(b), 1);
      ordem.push([a, b]);
    }
    return ordem;
  }

  /**
   * Uma sequência de duplas que esvazia [indices], tirando sempre duas peças livres.
   * Peças das camadas de cima têm preferência: assim é raro sobrar uma pilha no final,
   * que deixaria a tentativa sem saída.
   */
  function ordemDeRemocao(tabuleiro, indices, aleatorio) {
    if (indices.length % 2 !== 0) return null;
    for (let t = 0; t < TENTATIVAS; t++) {
      const ordem = tentarOrdem(tabuleiro, indices, aleatorio);
      if (ordem) return ordem;
    }
    return null;
  }

  /**
   * Sorteia as faces garantindo solução: o sorteio é feito "de trás para frente". Primeiro se
   * escolhe uma ordem em que a mesa pode ser esvaziada de dois em dois (sempre tirando peças
   * livres) e só depois cada dupla dessa ordem recebe um par de faces que combinam. Jogando
   * nessa ordem a partida termina, então sempre existe pelo menos uma solução.
   */
  function distribuirComSolucao(tabuleiro, aleatorio = Math.random) {
    const todos = tabuleiro.posicoes.map((_, i) => i);
    const ordem = ordemDeRemocao(tabuleiro, todos, aleatorio);
    if (!ordem) throw new Error(`O tabuleiro ${tabuleiro.id} não pode ser esvaziado`);
    const pares = paresSorteados(aleatorio);
    if (pares.length < ordem.length) throw new Error(`Peças insuficientes para ${tabuleiro.id}`);
    const faces = new Array(tabuleiro.totalPecas).fill(null);
    ordem.forEach(([a, b], k) => {
      faces[a] = pares[k][0];
      faces[b] = pares[k][1];
    });
    return { faces, solucao: ordem };
  }

  /**
   * Embaralha as peças que sobraram, sem mudar as posições ocupadas. Sempre que a forma do que
   * restou permitir, o resultado tem solução. Se não permitir (por exemplo, só sobrou uma
   * pilha), tenta ao menos deixar uma jogada possível. Devolve null quando nenhuma arrumação
   * libera jogadas.
   */
  function reembaralhar(tabuleiro, faces, aleatorio = Math.random) {
    const ocupadas = [];
    for (let i = 0; i < faces.length; i++) if (faces[i] !== null) ocupadas.push(i);
    if (!ocupadas.length) return null;

    const grupos = new Map();
    for (const i of ocupadas) {
      const chave = FACES[faces[i]].chavePar;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(faces[i]);
    }
    let pares = [];
    for (const grupo of grupos.values()) {
      if (grupo.length % 2 !== 0) return null;
      const misturado = embaralharLista(grupo, aleatorio);
      for (let k = 0; k < misturado.length; k += 2) pares.push([misturado[k], misturado[k + 1]]);
    }
    pares = embaralharLista(pares, aleatorio);

    const ordem = ordemDeRemocao(tabuleiro, ocupadas, aleatorio);
    if (ordem) {
      const novas = faces.slice();
      ordem.forEach(([a, b], k) => {
        novas[a] = pares[k][0];
        novas[b] = pares[k][1];
      });
      return novas;
    }
    const pecas = ocupadas.map((i) => faces[i]);
    for (let t = 0; t < TENTATIVAS; t++) {
      const misturadas = embaralharLista(pecas, aleatorio);
      const novas = faces.slice();
      ocupadas.forEach((i, k) => {
        novas[i] = misturadas[k];
      });
      if (jogadas(tabuleiro, novas).length) return novas;
    }
    return null;
  }

  // ---------- Partida ----------

  /**
   * Estado de uma partida. [faces] tem a face de cada posição (null = já removida); [inicial]
   * guarda a distribuição do começo, para recomeçar a mesma partida.
   */
  function criarPartida(tabuleiro, inicial, extra = {}) {
    return {
      tabuleiro,
      inicial,
      faces: extra.faces || inicial.slice(),
      historico: extra.historico || [],
      segundos: extra.segundos || 0,
      dicasUsadas: extra.dicasUsadas || 0,
      embaralhadasUsadas: extra.embaralhadasUsadas || 0,
      desfeitas: extra.desfeitas || 0,
    };
  }

  function novaPartida(tabuleiro, aleatorio = Math.random) {
    return criarPartida(tabuleiro, distribuirComSolucao(tabuleiro, aleatorio).faces);
  }

  function restantes(partida) {
    return partida.faces.filter((f) => f !== null).length;
  }

  function venceu(partida) {
    return restantes(partida) === 0;
  }

  function pecaLivre(partida, i) {
    return livre(partida.tabuleiro, partida.faces, i);
  }

  function jogadasPossiveis(partida) {
    return jogadas(partida.tabuleiro, partida.faces);
  }

  function dicasRestantes(partida) {
    return Math.max(0, DICAS_POR_PARTIDA - partida.dicasUsadas);
  }

  function embaralhadasRestantes(partida) {
    return Math.max(0, EMBARALHADAS_POR_PARTIDA - partida.embaralhadasUsadas);
  }

  function formamPar(partida, a, b) {
    const fa = partida.faces[a];
    const fb = partida.faces[b];
    if (fa === null || fa === undefined || fb === null || fb === undefined) return false;
    return a !== b && pecaLivre(partida, a) && pecaLivre(partida, b) && combinam(fa, fb);
  }

  function remover(partida, a, b) {
    if (!formamPar(partida, a, b)) throw new Error(`As peças ${a} e ${b} não formam par`);
    const faces = partida.faces.slice();
    faces[a] = null;
    faces[b] = null;
    return {
      ...partida,
      faces,
      historico: [...partida.historico, { a, b, faceA: partida.faces[a], faceB: partida.faces[b] }],
    };
  }

  /** Devolve o último par à mesa (null se não há o que desfazer). */
  function desfazer(partida) {
    const ultima = partida.historico[partida.historico.length - 1];
    if (!ultima) return null;
    const faces = partida.faces.slice();
    faces[ultima.a] = ultima.faceA;
    faces[ultima.b] = ultima.faceB;
    return {
      ...partida,
      faces,
      historico: partida.historico.slice(0, -1),
      desfeitas: partida.desfeitas + 1,
    };
  }

  /** Usa uma dica: { partida, par } com a dica contada, ou null se acabaram ou não há par. */
  function usarDica(partida, aleatorio = Math.random) {
    if (dicasRestantes(partida) === 0) return null;
    const pares = jogadasPossiveis(partida);
    if (!pares.length) return null;
    const par = pares[Math.floor(aleatorio() * pares.length)];
    return { partida: { ...partida, dicasUsadas: partida.dicasUsadas + 1 }, par };
  }

  function embaralhar(partida, aleatorio = Math.random) {
    if (embaralhadasRestantes(partida) === 0) return null;
    const faces = reembaralhar(partida.tabuleiro, partida.faces, aleatorio);
    if (!faces) return null;
    return { ...partida, faces, embaralhadasUsadas: partida.embaralhadasUsadas + 1 };
  }

  /** A mesma distribuição do começo, com tempo e ajudas zerados. */
  function recomecar(partida) {
    return criarPartida(partida.tabuleiro, partida.inicial);
  }

  // ---------- Pontos ----------

  /** 1000 por par + bônus de tempo − ajudas (dicas, embaralhadas e jogadas desfeitas). */
  function calcularPontos(totalPecas, segundos, dicas, embaralhadas, desfeitas) {
    const base = Math.floor(totalPecas / 2) * 1000;
    const bonusTempo = Math.max(0, 2000 - 2 * segundos);
    const descontos = 100 * dicas + 200 * embaralhadas + 50 * desfeitas;
    return Math.max(0, base + bonusTempo - descontos);
  }

  /** 3 estrelas sem nenhuma ajuda, 2 com até 3 ajudas, 1 com mais. */
  function calcularEstrelas(dicas, embaralhadas, desfeitas) {
    const ajudas = dicas + embaralhadas + desfeitas;
    if (ajudas === 0) return 3;
    return ajudas <= 3 ? 2 : 1;
  }

  function pontos(partida) {
    return calcularPontos(
      partida.tabuleiro.totalPecas,
      partida.segundos,
      partida.dicasUsadas,
      partida.embaralhadasUsadas,
      partida.desfeitas,
    );
  }

  function estrelas(partida) {
    return calcularEstrelas(partida.dicasUsadas, partida.embaralhadasUsadas, partida.desfeitas);
  }

  function formatarTempo(segundos) {
    const s = Math.max(0, Math.floor(segundos));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const dois = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${dois(m)}:${dois(r)}` : `${dois(m)}:${dois(r)}`;
  }

  // ---------- Partida salva e recordes ----------

  /** Objeto simples para JSON (o mesmo conteúdo do CodecPartida do app). */
  function codificar(partida) {
    return {
      versao: VERSAO_PARTIDA,
      tabuleiro: partida.tabuleiro.id,
      segundos: partida.segundos,
      dicas: partida.dicasUsadas,
      embaralhadas: partida.embaralhadasUsadas,
      desfeitas: partida.desfeitas,
      inicial: partida.inicial,
      faces: partida.faces,
      historico: partida.historico.map((j) => [j.a, j.b, j.faceA, j.faceB]),
    };
  }

  /** Partida de volta do JSON, ou null se o conteúdo não for de uma partida válida. */
  function decodificar(dados) {
    if (!dados || typeof dados !== "object" || dados.versao !== VERSAO_PARTIDA) return null;
    const tabuleiro = tabuleiroPorId(dados.tabuleiro);
    if (!tabuleiro) return null;
    const n = tabuleiro.totalPecas;
    const ehFace = (v) => Number.isInteger(v) && v >= 0 && v < FACES.length;
    const contador = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
    const { inicial, faces, historico } = dados;
    if (!Array.isArray(inicial) || inicial.length !== n || !inicial.every(ehFace)) return null;
    if (!Array.isArray(faces) || faces.length !== n || !faces.every((f) => f === null || ehFace(f))) return null;
    if (!Array.isArray(historico)) return null;
    const jogadasSalvas = [];
    for (const item of historico) {
      if (!Array.isArray(item) || item.length !== 4) return null;
      const [a, b, faceA, faceB] = item;
      const indiceOk = (i) => Number.isInteger(i) && i >= 0 && i < n && faces[i] === null;
      if (!indiceOk(a) || !indiceOk(b) || a === b || !ehFace(faceA) || !ehFace(faceB)) return null;
      jogadasSalvas.push({ a, b, faceA, faceB });
    }
    const segundos = contador(dados.segundos);
    const dicas = contador(dados.dicas);
    const embaralhadas = contador(dados.embaralhadas);
    const desfeitas = contador(dados.desfeitas);
    if ([segundos, dicas, embaralhadas, desfeitas].includes(null)) return null;
    return criarPartida(tabuleiro, inicial.slice(), {
      faces: faces.slice(),
      historico: jogadasSalvas,
      segundos,
      dicasUsadas: dicas,
      embaralhadasUsadas: embaralhadas,
      desfeitas,
    });
  }

  /** Junta uma vitória nova ao recorde que já existia no tabuleiro. */
  function somarRecorde(anterior, tempo, pontosFeitos, estrelasGanhas) {
    if (!anterior) return { vitorias: 1, melhorTempo: tempo, melhorPontuacao: pontosFeitos, estrelas: estrelasGanhas };
    return {
      vitorias: anterior.vitorias + 1,
      melhorTempo: Math.min(anterior.melhorTempo, tempo),
      melhorPontuacao: Math.max(anterior.melhorPontuacao, pontosFeitos),
      estrelas: Math.max(anterior.estrelas, estrelasGanhas),
    };
  }

  /** O que mudou nos recordes com uma vitória. */
  function conquista(anterior, tempo, pontosFeitos) {
    return {
      primeiraVitoria: !anterior,
      melhorTempo: Boolean(anterior) && tempo < anterior.melhorTempo,
      melhorPontuacao: Boolean(anterior) && pontosFeitos > anterior.melhorPontuacao,
    };
  }

  /** Recordes lidos do JSON: só tabuleiros que existem e números que fazem sentido. */
  function validarRecordes(dados) {
    const saida = {};
    if (!dados || typeof dados !== "object") return saida;
    for (const t of TABULEIROS) {
      const r = dados[t.id];
      if (!r || typeof r !== "object") continue;
      const inteiro = (v) => Number.isInteger(v) && v >= 0;
      if (!inteiro(r.vitorias) || r.vitorias < 1 || !inteiro(r.melhorTempo) || !inteiro(r.melhorPontuacao)) continue;
      if (!inteiro(r.estrelas)) continue;
      saida[t.id] = {
        vitorias: r.vitorias,
        melhorTempo: r.melhorTempo,
        melhorPontuacao: r.melhorPontuacao,
        estrelas: Math.min(3, Math.max(1, r.estrelas)),
      };
    }
    return saida;
  }

  return {
    NAIPES,
    FACES,
    DIFICULDADES,
    TABULEIROS,
    DICAS_POR_PARTIDA,
    EMBARALHADAS_POR_PARTIDA,
    combinam,
    criarTabuleiro,
    tabuleiroPorId,
    proximoTabuleiro,
    livre,
    jogadas,
    paresSorteados,
    ordemDeRemocao,
    distribuirComSolucao,
    reembaralhar,
    criarPartida,
    novaPartida,
    restantes,
    venceu,
    pecaLivre,
    jogadasPossiveis,
    dicasRestantes,
    embaralhadasRestantes,
    formamPar,
    remover,
    desfazer,
    usarDica,
    embaralhar,
    recomecar,
    calcularPontos,
    calcularEstrelas,
    pontos,
    estrelas,
    formatarTempo,
    codificar,
    decodificar,
    somarRecorde,
    conquista,
    validarRecordes,
  };
})();
if (typeof module === "object") module.exports = LogicaMahjong;
