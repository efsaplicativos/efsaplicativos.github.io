"use strict";
/*
 * Jogo da velha portado de logica/Regras.kt, Partida.kt, Placar.kt, InteligenciaArtificial.kt e de
 * dados/ResultadoContraIa.kt, RepositorioHistorico.kt e TempoDecorrido.kt do app Tic Tac Toe
 * (com.emerson1981.tictactoe). A partida é a lista de casas jogadas (X sempre começa) e é
 * imutável: jogar e desfazer devolvem outra partida.
 */
const LogicaVelha = (() => {
  const X = "X";
  const O = "O";
  const TOTAL_CASAS = 9;
  const adversario = (jogador) => (jogador === X ? O : X);

  const LINHAS = [
    // Linhas
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    // Colunas
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    // Diagonais
    [0, 4, 8], [2, 4, 6],
  ];

  const MODOS = {
    dois: { id: "dois", nome: "2 jogadores" },
    computador: { id: "computador", nome: "Contra o computador" },
  };

  /** Fácil joga ao acaso, Médio sorteia entre jogada aleatória e a melhor, Difícil nunca perde. */
  const NIVEIS = {
    facil: { id: "facil", nome: "Fácil" },
    medio: { id: "medio", nome: "Médio" },
    dificil: { id: "dificil", nome: "Difícil" },
  };

  /** No modo contra o computador, a pessoa joga com X (e começa). */
  const HUMANO = X;
  const COMPUTADOR = O;
  const ATRASO_COMPUTADOR_MS = 500;
  const LIMITE_HISTORICO = 200;

  // ---------- Regras ----------

  /** `linhas` tem mais de uma quando a última jogada fecha duas sequências ao mesmo tempo. */
  function vencedor(casas) {
    for (const jogador of [X, O]) {
      const linhas = LINHAS.filter((linha) => linha.every((i) => casas[i] === jogador));
      if (linhas.length) return { jogador, linhas, casas: [...new Set(linhas.flat())] };
    }
    return null;
  }

  const casasLivres = (casas) => casas.flatMap((valor, i) => (valor === null ? [i] : []));

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
      vez: jogadas.length % 2 === 0 ? X : O,
    });
  }

  const NOVA = criar([], Array(TOTAL_CASAS).fill(null));

  const podeJogar = (partida, casa) =>
    !partida.terminada && Number.isInteger(casa) && casa >= 0 && casa < TOTAL_CASAS && partida.casas[casa] === null;

  /** Jogadas inválidas (casa ocupada, partida encerrada) devolvem a mesma partida. */
  function jogar(partida, casa) {
    if (!podeJogar(partida, casa)) return partida;
    const casas = partida.casas.slice();
    casas[casa] = partida.vez;
    return criar([...partida.jogadas, casa], casas);
  }

  const desfazer = (partida) =>
    partida.jogadas.length === 0 ? partida : partida.jogadas.slice(0, -1).reduce(jogar, NOVA);

  /** Refaz a partida a partir das jogadas salvas; dados inválidos viram uma partida nova. */
  function restaurar(jogadas) {
    if (!Array.isArray(jogadas)) return NOVA;
    let partida = NOVA;
    for (const casa of jogadas) {
      if (!podeJogar(partida, casa)) return NOVA;
      partida = jogar(partida, casa);
    }
    return partida;
  }

  const mesmaPartida = (a, b) => a.jogadas.length === b.jogadas.length && a.jogadas.every((c, i) => c === b.jogadas[i]);

  // ---------- Computador (minimax) ----------

  const PONTOS_VITORIA = 10;

  const venceu = (tabuleiro, jogador) =>
    LINHAS.some(([a, b, c]) => tabuleiro[a] === jogador && tabuleiro[b] === jogador && tabuleiro[c] === jogador);

  function minimax(tabuleiro, vez, ia, profundidade) {
    if (venceu(tabuleiro, ia)) return PONTOS_VITORIA - profundidade;
    if (venceu(tabuleiro, adversario(ia))) return profundidade - PONTOS_VITORIA;
    if (!tabuleiro.includes(null)) return 0;
    let melhor = vez === ia ? -Infinity : Infinity;
    for (let casa = 0; casa < TOTAL_CASAS; casa++) {
      if (tabuleiro[casa] !== null) continue;
      tabuleiro[casa] = vez;
      const nota = minimax(tabuleiro, adversario(vez), ia, profundidade + 1);
      tabuleiro[casa] = null;
      melhor = vez === ia ? Math.max(melhor, nota) : Math.min(melhor, nota);
    }
    return melhor;
  }

  /**
   * Todas as jogadas com a melhor nota. A nota considera a profundidade: ganhar o quanto antes e,
   * se a derrota for inevitável, adiá-la (bloqueando a ameaça imediata).
   */
  function melhoresJogadas(casas, ia) {
    const tabuleiro = casas.slice();
    let melhorNota = -Infinity;
    let melhores = [];
    for (const casa of casasLivres(casas)) {
      tabuleiro[casa] = ia;
      const nota = minimax(tabuleiro, adversario(ia), ia, 1);
      tabuleiro[casa] = null;
      if (nota > melhorNota) {
        melhorNota = nota;
        melhores = [casa];
      } else if (nota === melhorNota) {
        melhores.push(casa);
      }
    }
    return melhores;
  }

  const sortear = (lista, aleatorio) => lista[Math.floor(aleatorio() * lista.length)];

  function escolherJogada(casas, ia, nivel, aleatorio = Math.random) {
    const livres = casasLivres(casas);
    if (livres.length === 0 || vencedor(casas) !== null) throw new Error("Partida já terminou");
    const aoAcaso = nivel.id === "facil" ? true : nivel.id === "medio" ? aleatorio() < 0.5 : false;
    return sortear(aoAcaso ? livres : melhoresJogadas(casas, ia), aleatorio);
  }

  // ---------- Placar da sessão ----------

  const PLACAR_ZERO = Object.freeze({ x: 0, o: 0, empates: 0 });

  /** `jogador` nulo é empate. */
  function ajustarPlacar(placar, jogador, delta) {
    const campo = jogador === X ? "x" : jogador === O ? "o" : "empates";
    return { ...placar, [campo]: Math.max(0, placar[campo] + delta) };
  }

  const somar = (placar, jogador) => ajustarPlacar(placar, jogador, 1);
  /** Usado ao desfazer a jogada que tinha encerrado a partida. */
  const subtrair = (placar, jogador) => ajustarPlacar(placar, jogador, -1);

  const placarParaLista = (p) => [p.x, p.o, p.empates];

  function placarDeLista(valores) {
    if (!Array.isArray(valores) || valores.length !== 3 || !valores.every((v) => Number.isInteger(v) && v >= 0)) {
      return { ...PLACAR_ZERO };
    }
    return { x: valores[0], o: valores[1], empates: valores[2] };
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
    const contar = (d) => resultados.filter((r) => r.desfecho === d).length;
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
    X,
    O,
    TOTAL_CASAS,
    LINHAS,
    MODOS,
    NIVEIS,
    HUMANO,
    COMPUTADOR,
    ATRASO_COMPUTADOR_MS,
    LIMITE_HISTORICO,
    DESFECHOS,
    PLACAR_ZERO,
    adversario,
    vencedor,
    casasLivres,
    NOVA,
    podeJogar,
    jogar,
    desfazer,
    restaurar,
    mesmaPartida,
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

if (typeof module === "object") module.exports = LogicaVelha;
