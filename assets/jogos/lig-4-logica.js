"use strict";
/*
 * Lig 4 (quatro em linha) no molde do jogo da velha: tabuleiro de 7 colunas por 6 linhas, e a
 * partida é a lista de colunas jogadas. Jogar e desfazer devolvem outra partida, então o estado
 * pode ser comparado e salvo no navegador sem risco de alteração por engano.
 *
 * O computador usa minimax com poda alfa-beta e uma avaliação das janelas de quatro casas.
 */
const LogicaLig4 = (() => {
  const VERMELHO = "V";
  const AMARELO = "A";
  const COLUNAS = 7;
  const LINHAS = 6;
  const TOTAL_CASAS = COLUNAS * LINHAS;
  const SEGUIDAS = 4;

  const adversario = (jogador) => (jogador === VERMELHO ? AMARELO : VERMELHO);

  const MODOS = {
    dois: { id: "dois", nome: "2 jogadores" },
    computador: { id: "computador", nome: "Contra o computador" },
  };

  /** Fácil joga ao acaso, Médio olha duas jogadas à frente, Difícil cinco. */
  const NIVEIS = {
    facil: { id: "facil", nome: "Fácil" },
    medio: { id: "medio", nome: "Médio" },
    dificil: { id: "dificil", nome: "Difícil" },
  };

  /** No modo contra o computador, a pessoa joga com o vermelho (e começa). */
  const HUMANO = VERMELHO;
  const COMPUTADOR = AMARELO;
  const ATRASO_COMPUTADOR_MS = 500;
  const LIMITE_HISTORICO = 200;

  // ---------- Tabuleiro ----------

  /** A casa 0 é a de cima, à esquerda, e a 41 é a de baixo, à direita. */
  const indice = (linha, coluna) => linha * COLUNAS + coluna;
  const linhaDaCasa = (casa) => Math.floor(casa / COLUNAS);
  const colunaDaCasa = (casa) => casa % COLUNAS;
  const nomeDaCasa = (casa) => `linha ${linhaDaCasa(casa) + 1}, coluna ${colunaDaCasa(casa) + 1}`;

  /** Todas as janelas de quatro casas: horizontais, verticais e as duas diagonais. */
  const SEQUENCIAS = (() => {
    const lista = [];
    const quatro = (passo) => [...Array(SEGUIDAS)].map((_, i) => passo(i));
    for (let linha = 0; linha < LINHAS; linha++) {
      for (let coluna = 0; coluna < COLUNAS; coluna++) {
        if (coluna + SEGUIDAS <= COLUNAS) lista.push(quatro((i) => indice(linha, coluna + i)));
        if (linha + SEGUIDAS <= LINHAS) lista.push(quatro((i) => indice(linha + i, coluna)));
        if (linha + SEGUIDAS <= LINHAS && coluna + SEGUIDAS <= COLUNAS) lista.push(quatro((i) => indice(linha + i, coluna + i)));
        if (linha + SEGUIDAS <= LINHAS && coluna - SEGUIDAS + 1 >= 0) lista.push(quatro((i) => indice(linha + i, coluna - i)));
      }
    }
    return Object.freeze(lista);
  })();

  const DIRECOES = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  /** `sequencias` tem mais de uma quando a jogada fecha quatro em duas direções ao mesmo tempo. */
  function vencedor(casas) {
    for (const jogador of [VERMELHO, AMARELO]) {
      const sequencias = SEQUENCIAS.filter((sequencia) => sequencia.every((casa) => casas[casa] === jogador));
      if (sequencias.length) return { jogador, sequencias, casas: [...new Set(sequencias.flat())] };
    }
    return null;
  }

  /** Confere só as quatro direções a partir da casa jogada: é o que o minimax usa a cada nó. */
  function venceNaCasa(casas, casa, jogador) {
    const linha = linhaDaCasa(casa);
    const coluna = colunaDaCasa(casa);
    for (const [passoLinha, passoColuna] of DIRECOES) {
      let seguidas = 1;
      for (const sentido of [1, -1]) {
        let l = linha + passoLinha * sentido;
        let c = coluna + passoColuna * sentido;
        while (l >= 0 && l < LINHAS && c >= 0 && c < COLUNAS && casas[indice(l, c)] === jogador) {
          seguidas++;
          l += passoLinha * sentido;
          c += passoColuna * sentido;
        }
      }
      if (seguidas >= SEGUIDAS) return true;
    }
    return false;
  }

  /** Casa em que a peça para ao cair na coluna: a primeira livre, de baixo para cima. */
  function casaDeQueda(casas, coluna) {
    for (let linha = LINHAS - 1; linha >= 0; linha--) {
      const casa = indice(linha, coluna);
      if (casas[casa] === null) return casa;
    }
    return -1;
  }

  const colunaCheia = (casas, coluna) => casaDeQueda(casas, coluna) === -1;
  const colunasJogaveis = (casas) => [...Array(COLUNAS).keys()].filter((coluna) => !colunaCheia(casas, coluna));

  // ---------- Partida ----------

  function criar(jogadas, casas) {
    const vitoria = vencedor(casas);
    const empate = vitoria === null && jogadas.length === TOTAL_CASAS;
    return Object.freeze({
      jogadas: Object.freeze(jogadas),
      casas: Object.freeze(casas),
      vitoria,
      empate,
      terminada: vitoria !== null || empate,
      vez: jogadas.length % 2 === 0 ? VERMELHO : AMARELO,
    });
  }

  const NOVA = criar([], Array(TOTAL_CASAS).fill(null));

  const podeJogar = (partida, coluna) =>
    !partida.terminada &&
    Number.isInteger(coluna) &&
    coluna >= 0 &&
    coluna < COLUNAS &&
    !colunaCheia(partida.casas, coluna);

  /** Jogadas inválidas (coluna cheia ou fora do tabuleiro) devolvem a mesma partida. */
  function jogar(partida, coluna) {
    if (!podeJogar(partida, coluna)) return partida;
    const casas = partida.casas.slice();
    casas[casaDeQueda(casas, coluna)] = partida.vez;
    return criar([...partida.jogadas, coluna], casas);
  }

  const desfazer = (partida) =>
    partida.jogadas.length === 0 ? partida : partida.jogadas.slice(0, -1).reduce(jogar, NOVA);

  /** Refaz a partida a partir das colunas salvas; dados inválidos viram uma partida nova. */
  function restaurar(jogadas) {
    if (!Array.isArray(jogadas)) return NOVA;
    let partida = NOVA;
    for (const coluna of jogadas) {
      if (!podeJogar(partida, coluna)) return NOVA;
      partida = jogar(partida, coluna);
    }
    return partida;
  }

  const mesmaPartida = (a, b) =>
    a.jogadas.length === b.jogadas.length && a.jogadas.every((coluna, i) => coluna === b.jogadas[i]);

  /** Casa onde a última peça caiu: a mais alta da coluna. É o que o desenho anima e o som anuncia. */
  function casaDaUltimaJogada(partida) {
    const coluna = partida.jogadas.at(-1);
    if (coluna === undefined) return -1;
    for (let linha = 0; linha < LINHAS; linha++) {
      const casa = indice(linha, coluna);
      if (partida.casas[casa] !== null) return casa;
    }
    return -1;
  }

  // ---------- Computador (minimax com poda alfa-beta) ----------

  const PONTOS_VITORIA = 1000000;
  /** Quanto vale uma janela de quatro casas com 1, 2 ou 3 peças de um jogador só. */
  const PESO_JANELA = [0, 1, 12, 90];
  const PESO_CENTRO = 4;
  /** O centro vale mais, então é por ele que a busca começa — e a poda rende mais. */
  const ORDEM_COLUNAS = [3, 2, 4, 1, 5, 0, 6];
  const PROFUNDIDADE = { facil: 0, medio: 2, dificil: 5 };

  function avaliar(casas, ia) {
    let nota = 0;
    for (const sequencia of SEQUENCIAS) {
      let minhas = 0;
      let outras = 0;
      for (const casa of sequencia) {
        if (casas[casa] === ia) minhas++;
        else if (casas[casa] !== null) outras++;
      }
      if (minhas && outras) continue;
      if (minhas) nota += PESO_JANELA[minhas];
      else if (outras) nota -= PESO_JANELA[outras];
    }
    for (let linha = 0; linha < LINHAS; linha++) {
      const casa = indice(linha, 3);
      if (casas[casa] === ia) nota += PESO_CENTRO;
      else if (casas[casa] !== null) nota -= PESO_CENTRO;
    }
    return nota;
  }

  /**
   * Vitória imediata vale PONTOS_VITORIA; uma vitória forçada que a busca encontra vale
   * PONTOS_VITORIA / 2, sempre abaixo da imediata. A profundidade desempata: ganhar antes vale
   * mais, e adiar a derrota vale mais do que perdê-la agora.
   */
  function minimax(casas, vez, ia, profundidade, alfa, beta) {
    const maximizando = vez === ia;
    let melhor = maximizando ? -Infinity : Infinity;
    let jogou = false;
    for (const coluna of ORDEM_COLUNAS) {
      const casa = casaDeQueda(casas, coluna);
      if (casa === -1) continue;
      jogou = true;
      casas[casa] = vez;
      let nota;
      if (venceNaCasa(casas, casa, vez)) {
        nota = maximizando ? PONTOS_VITORIA / 2 + profundidade : -PONTOS_VITORIA / 2 - profundidade;
      } else if (profundidade <= 1) {
        nota = avaliar(casas, ia);
      } else {
        nota = minimax(casas, adversario(vez), ia, profundidade - 1, alfa, beta);
      }
      casas[casa] = null;
      if (maximizando) {
        if (nota > melhor) melhor = nota;
        if (melhor > alfa) alfa = melhor;
      } else {
        if (nota < melhor) melhor = nota;
        if (melhor < beta) beta = melhor;
      }
      if (beta <= alfa) break;
    }
    // Sem coluna livre: tabuleiro cheio, empate
    return jogou ? melhor : 0;
  }

  /** Todas as colunas com a melhor nota, na ordem de preferência do centro. */
  function melhoresJogadas(casas, ia, profundidade = PROFUNDIDADE.dificil) {
    const tabuleiro = casas.slice();
    let melhorNota = -Infinity;
    let melhores = [];
    for (const coluna of ORDEM_COLUNAS) {
      const casa = casaDeQueda(tabuleiro, coluna);
      if (casa === -1) continue;
      tabuleiro[casa] = ia;
      let nota;
      if (venceNaCasa(tabuleiro, casa, ia)) nota = PONTOS_VITORIA;
      else if (profundidade <= 1) nota = avaliar(tabuleiro, ia);
      else nota = minimax(tabuleiro, adversario(ia), ia, profundidade - 1, -Infinity, Infinity);
      tabuleiro[casa] = null;
      if (nota > melhorNota) {
        melhorNota = nota;
        melhores = [coluna];
      } else if (nota === melhorNota) {
        melhores.push(coluna);
      }
    }
    return melhores;
  }

  const sortear = (lista, aleatorio) => lista[Math.floor(aleatorio() * lista.length)];

  function escolherJogada(casas, ia, nivel, aleatorio = Math.random) {
    const livres = colunasJogaveis(casas);
    if (livres.length === 0 || vencedor(casas) !== null) throw new Error("Partida já terminou");
    if (nivel.id === "facil") return sortear(livres, aleatorio);
    // No Médio, de vez em quando ele joga ao acaso, para não parecer que está copiando
    const aoAcaso = nivel.id === "medio" && aleatorio() < 0.25;
    const profundidade = PROFUNDIDADE[nivel.id] ?? PROFUNDIDADE.medio;
    return sortear(aoAcaso ? livres : melhoresJogadas(casas, ia, profundidade), aleatorio);
  }

  // ---------- Placar da sessão ----------

  const PLACAR_ZERO = Object.freeze({ v: 0, a: 0, empates: 0 });

  /** `jogador` nulo é empate. */
  function ajustarPlacar(placar, jogador, delta) {
    const campo = jogador === VERMELHO ? "v" : jogador === AMARELO ? "a" : "empates";
    return { ...placar, [campo]: Math.max(0, placar[campo] + delta) };
  }

  const somar = (placar, jogador) => ajustarPlacar(placar, jogador, 1);
  /** Usado ao desfazer a jogada que tinha encerrado a partida. */
  const subtrair = (placar, jogador) => ajustarPlacar(placar, jogador, -1);

  const placarParaLista = (placar) => [placar.v, placar.a, placar.empates];

  function placarDeLista(valores) {
    if (!Array.isArray(valores) || valores.length !== 3 || !valores.every((v) => Number.isInteger(v) && v >= 0)) {
      return { ...PLACAR_ZERO };
    }
    return { v: valores[0], a: valores[1], empates: valores[2] };
  }

  // ---------- Histórico contra o computador ----------

  const DESFECHOS = { VITORIA: "vitoria", DERROTA: "derrota", EMPATE: "empate" };

  function resultadoContraComputador(jogadorVencedor, humano, nivel, momento) {
    const desfecho =
      jogadorVencedor === null ? DESFECHOS.EMPATE : jogadorVencedor === humano ? DESFECHOS.VITORIA : DESFECHOS.DERROTA;
    return { desfecho, nivel: nivel.id, momento };
  }

  /** As partidas mais recentes primeiro, no máximo 200. */
  const adicionarAoHistorico = (lista, resultado) => [resultado, ...lista].slice(0, LIMITE_HISTORICO);

  function lerHistorico(dados) {
    if (!Array.isArray(dados)) return [];
    const desfechos = Object.values(DESFECHOS);
    return dados
      .filter((r) => r && desfechos.includes(r.desfecho) && NIVEIS[r.nivel] && Number.isFinite(r.momento))
      .map((r) => ({ desfecho: r.desfecho, nivel: r.nivel, momento: r.momento }))
      .slice(0, LIMITE_HISTORICO);
  }

  function estatisticas(resultados) {
    const contar = (desfecho) => resultados.filter((r) => r.desfecho === desfecho).length;
    const vitorias = contar(DESFECHOS.VITORIA);
    const derrotas = contar(DESFECHOS.DERROTA);
    const empates = contar(DESFECHOS.EMPATE);
    return { vitorias, derrotas, empates, total: vitorias + derrotas + empates };
  }

  // ---------- Tempo decorrido ----------

  const MINUTO_MS = 60000;
  const HORA_MS = 60 * MINUTO_MS;
  const DIA_MS = 24 * HORA_MS;
  const plural = (n, singular, varios) => (n === 1 ? singular : varios);

  /** "Agora mesmo", "Há 5 minutos", "Há 1 hora", "Há 3 dias"; depois de 30 dias, a data. */
  function textoTempoDecorrido(momento, agora, fuso) {
    const diferenca = Math.max(0, agora - momento);
    const minutos = Math.floor(diferenca / MINUTO_MS);
    const horas = Math.floor(diferenca / HORA_MS);
    const dias = Math.floor(diferenca / DIA_MS);
    if (minutos < 1) return "Agora mesmo";
    if (horas < 1) return `Há ${minutos} ${plural(minutos, "minuto", "minutos")}`;
    if (dias < 1) return `Há ${horas} ${plural(horas, "hora", "horas")}`;
    if (dias < 30) return `Há ${dias} ${plural(dias, "dia", "dias")}`;
    const opcoes = { day: "2-digit", month: "2-digit", year: "numeric" };
    if (fuso) opcoes.timeZone = fuso;
    return new Intl.DateTimeFormat("pt-BR", opcoes).format(new Date(momento));
  }

  return {
    VERMELHO,
    AMARELO,
    COLUNAS,
    LINHAS,
    TOTAL_CASAS,
    SEGUIDAS,
    SEQUENCIAS,
    MODOS,
    NIVEIS,
    HUMANO,
    COMPUTADOR,
    ATRASO_COMPUTADOR_MS,
    LIMITE_HISTORICO,
    DESFECHOS,
    PLACAR_ZERO,
    PROFUNDIDADE,
    adversario,
    indice,
    linhaDaCasa,
    colunaDaCasa,
    nomeDaCasa,
    vencedor,
    venceNaCasa,
    casaDeQueda,
    colunaCheia,
    colunasJogaveis,
    NOVA,
    podeJogar,
    jogar,
    desfazer,
    restaurar,
    mesmaPartida,
    casaDaUltimaJogada,
    avaliar,
    melhoresJogadas,
    escolherJogada,
    somar,
    subtrair,
    placarParaLista,
    placarDeLista,
    resultadoContraComputador,
    adicionarAoHistorico,
    lerHistorico,
    estatisticas,
    textoTempoDecorrido,
  };
})();

if (typeof module === "object") module.exports = LogicaLig4;
