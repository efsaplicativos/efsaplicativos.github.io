"use strict";
/*
 * Damas (dama brasileira, tabuleiro 8x8, 12 peças de cada lado) no molde dos outros jogos do
 * site: a partida é imutável e jogar devolve outra partida.
 *
 * Regras da dama brasileira:
 *  - o peão anda uma casa na diagonal, só para a frente, e come uma peça em qualquer das quatro
 *    diagonais;
 *  - a dama (peão que chega à última linha) anda e come a qualquer distância, "voando" pela
 *    diagonal, desde que o caminho esteja livre;
 *  - comer é obrigatório: quem tem captura só pode capturar;
 *  - a captura é em cadeia: depois de comer, se a mesma peça puder comer de novo, continua;
 *  - o peão que chega à última linha no meio de uma captura para ali e vira dama.
 *
 * O computador usa minimax com poda alfa-beta sobre uma avaliação de material e de avanço.
 */
const LogicaDamas = (() => {
  const BRANCO = "B";
  const PRETO = "P";
  const LINHAS = 8;
  const COLUNAS = 8;
  const TOTAL_CASAS = LINHAS * COLUNAS;
  const PECAS_POR_LADO = 12;
  /** Lances seguidos sem captura: a partida empata, para não ficar sem fim. */
  const LANCES_ATE_EMPATE = 40;

  const adversario = (jogador) => (jogador === BRANCO ? PRETO : BRANCO);

  const MODOS = {
    dois: { id: "dois", nome: "2 jogadores" },
    computador: { id: "computador", nome: "Contra o computador" },
  };

  const NIVEIS = {
    facil: { id: "facil", nome: "Fácil" },
    medio: { id: "medio", nome: "Médio" },
    dificil: { id: "dificil", nome: "Difícil" },
  };

  /** No modo contra o computador, a pessoa joga com as brancas (e começa). */
  const HUMANO = BRANCO;
  const COMPUTADOR = PRETO;
  const ATRASO_COMPUTADOR_MS = 500;
  const LIMITE_HISTORICO = 200;

  // ---------- Tabuleiro ----------

  /** A casa 0 é a de cima, à esquerda. Só as casas escuras (linha + coluna ímpar) recebem peça. */
  const indice = (linha, coluna) => linha * COLUNAS + coluna;
  const linhaDaCasa = (casa) => Math.floor(casa / COLUNAS);
  const colunaDaCasa = (casa) => casa % COLUNAS;
  const nomeDaCasa = (casa) => `linha ${linhaDaCasa(casa) + 1}, coluna ${colunaDaCasa(casa) + 1}`;
  const casaEscura = (linha, coluna) => (linha + coluna) % 2 === 1;

  const DIAGONAIS = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  /** As brancas sobem o tabuleiro (linha menor) e as pretas descem. */
  const sentidoDoPeao = (jogador) => (jogador === BRANCO ? -1 : 1);

  /** Peça é `{ jogador, dama }`; a dama anda e come a qualquer distância. */
  const peca = (jogador, dama = false) => Object.freeze({ jogador, dama });
  const BRANCO_PEAO = peca(BRANCO);
  const PRETO_PEAO = peca(PRETO);

  /** Tabuleiro inicial: três linhas de peças de cada lado, nas casas escuras. */
  const TABULEIRO_INICIAL = Object.freeze(
    Array(TOTAL_CASAS)
      .fill(null)
      .map((_, casa) => {
        const linha = linhaDaCasa(casa);
        if (!casaEscura(linha, colunaDaCasa(casa))) return null;
        if (linha < 3) return PRETO_PEAO;
        if (linha > 4) return BRANCO_PEAO;
        return null;
      }),
  );

  const contarPecas = (casas, jogador) => casas.filter((c) => c && c.jogador === jogador).length;
  const pecasDe = (casas, jogador) => casas.flatMap((c, i) => (c && c.jogador === jogador ? [i] : []));

  /** Peão que chega à última linha vira dama. */
  const promoveAoChegar = (p, linha) =>
    !p.dama && ((p.jogador === BRANCO && linha === 0) || (p.jogador === PRETO && linha === LINHAS - 1));

  /** Capturas de um passo a partir de `de`, sem ver se há mais depois. */
  function capturasDePasso(casas, de) {
    const p = casas[de];
    if (!p) return [];
    const linha = linhaDaCasa(de);
    const coluna = colunaDaCasa(de);
    const passos = [];
    for (const [passoLinha, passoColuna] of DIAGONAIS) {
      let l = linha + passoLinha;
      let c = coluna + passoColuna;
      // O peão só enxerga a casa vizinha; a dama corre a diagonal até a primeira peça
      while (p.dama && l >= 0 && l < LINHAS && c >= 0 && c < COLUNAS && casas[indice(l, c)] === null) {
        l += passoLinha;
        c += passoColuna;
      }
      if (l < 0 || l >= LINHAS || c < 0 || c >= COLUNAS) continue;
      const alvo = casas[indice(l, c)];
      if (!alvo || alvo.jogador === p.jogador) continue;
      const capturada = indice(l, c);
      // Depois da peça comida, a dama pode cair em qualquer casa livre da mesma diagonal
      for (let ll = l + passoLinha, cc = c + passoColuna; ll >= 0 && ll < LINHAS && cc >= 0 && cc < COLUNAS; ll += passoLinha, cc += passoColuna) {
        if (casas[indice(ll, cc)] !== null) break;
        passos.push({ de, para: indice(ll, cc), capturada });
        if (!p.dama) break;
      }
    }
    return passos;
  }

  /** Movimentos sem captura: o peão só para a frente, a dama pela diagonal livre inteira. */
  function movimentosDePasso(casas, de) {
    const p = casas[de];
    if (!p) return [];
    const linha = linhaDaCasa(de);
    const coluna = colunaDaCasa(de);
    const passos = [];
    const direcoes = p.dama ? DIAGONAIS : DIAGONAIS.filter(([passoLinha]) => passoLinha === sentidoDoPeao(p.jogador));
    for (const [passoLinha, passoColuna] of direcoes) {
      for (let l = linha + passoLinha, c = coluna + passoColuna; l >= 0 && l < LINHAS && c >= 0 && c < COLUNAS; l += passoLinha, c += passoColuna) {
        if (casas[indice(l, c)] !== null) break;
        passos.push({ de, para: indice(l, c), capturada: null });
        if (!p.dama) break;
      }
    }
    return passos;
  }

  // ---------- Lances ----------

  /**
   * Todas as sequências de captura que começam em `de`. Cada lance é `{ passos: [...] }`, com um
   * passo por peça comida, e termina quando a peça não tem mais o que comer (ou vira dama).
   */
  function capturasDe(casas, de) {
    const lances = [];
    const visitar = (tabuleiro, atual, passos) => {
      const continuacoes = capturasDePasso(tabuleiro, atual);
      if (continuacoes.length === 0) {
        if (passos.length) lances.push({ passos });
        return;
      }
      const p = tabuleiro[atual];
      for (const passo of continuacoes) {
        const proximo = tabuleiro.slice();
        proximo[atual] = null;
        proximo[passo.capturada] = null;
        const promove = promoveAoChegar(p, linhaDaCasa(passo.para));
        proximo[passo.para] = promove ? peca(p.jogador, true) : p;
        const caminho = [...passos, passo];
        // O peão que chega à última linha para ali, mesmo com outra captura disponível
        if (promove) lances.push({ passos: caminho });
        else visitar(proximo, passo.para, caminho);
      }
    };
    visitar(casas.slice(), de, []);
    return lances;
  }

  /** Todos os lances legais do jogador. Comer é obrigatório: havendo captura, só ela vale. */
  function lancesLegais(casas, jogador) {
    const capturas = pecasDe(casas, jogador).flatMap((de) => capturasDe(casas, de));
    if (capturas.length) return capturas;
    return pecasDe(casas, jogador).flatMap((de) =>
      movimentosDePasso(casas, de).map((passo) => ({ passos: [passo] })),
    );
  }

  /** Lances que começam na casa `de` (é o que a tela mostra ao escolher uma peça). */
  const lancesDe = (casas, jogador, de) => lancesLegais(casas, jogador).filter((lance) => lance.passos[0].de === de);

  /** O lance que termina em `para` começando em `de`; nulo se não existir. */
  function lancePara(casas, jogador, de, para) {
    const achados = lancesDe(casas, jogador, de).filter((lance) => lance.passos.at(-1).para === para);
    return achados.length ? achados[0] : null;
  }

  const ehCaptura = (lance) => lance.passos.some((passo) => passo.capturada !== null);

  const mesmoLance = (a, b) =>
    a.passos.length === b.passos.length &&
    a.passos.every((passo, i) => passo.de === b.passos[i].de && passo.para === b.passos[i].para);

  /** Aplica um lance já validado e devolve o tabuleiro novo (ou nulo se o lance não encaixa). */
  function aplicarLance(casas, lance) {
    const tabuleiro = casas.slice();
    for (const passo of lance.passos) {
      const p = tabuleiro[passo.de];
      if (!p) return null;
      tabuleiro[passo.de] = null;
      if (passo.capturada !== null) tabuleiro[passo.capturada] = null;
      tabuleiro[passo.para] = promoveAoChegar(p, linhaDaCasa(passo.para)) ? peca(p.jogador, true) : p;
    }
    return tabuleiro;
  }

  /** Casas que o lance come: é o que o desenho apaga e o que a tela anuncia. */
  const capturadasDoLance = (lance) => lance.passos.flatMap((passo) => (passo.capturada === null ? [] : [passo.capturada]));

  // ---------- Partida ----------

  /** Lances seguidos sem captura, contando de trás para a frente. */
  function semCapturaSeguidos(jogadas) {
    let total = 0;
    for (let i = jogadas.length - 1; i >= 0 && !ehCaptura(jogadas[i]); i--) total++;
    return total;
  }

  function criar(jogadas, casas) {
    const vez = jogadas.length % 2 === 0 ? BRANCO : PRETO;
    // Sem lance possível (sem peças ou cercado), o jogador perde
    const vitoria = lancesLegais(casas, vez).length === 0 ? { jogador: adversario(vez) } : null;
    const empate = vitoria === null && semCapturaSeguidos(jogadas) >= LANCES_ATE_EMPATE;
    return Object.freeze({
      jogadas: Object.freeze(jogadas),
      casas: Object.freeze(casas),
      vitoria,
      empate,
      terminada: vitoria !== null || empate,
      vez,
      pecas: Object.freeze({ [BRANCO]: contarPecas(casas, BRANCO), [PRETO]: contarPecas(casas, PRETO) }),
    });
  }

  const NOVA = criar([], TABULEIRO_INICIAL.slice());

  /** Jogadas inválidas (lance que não está na lista legal) devolvem a mesma partida. */
  function jogar(partida, lance) {
    if (partida.terminada || !lance || !Array.isArray(lance.passos)) return partida;
    const legal = lancesLegais(partida.casas, partida.vez).some((opcao) => mesmoLance(opcao, lance));
    if (!legal) return partida;
    const casas = aplicarLance(partida.casas, lance);
    if (!casas) return partida;
    return criar([...partida.jogadas, lance], casas);
  }

  /** Atalho para a tela: jogar da casa `de` até a casa `para`. */
  function jogarDe(partida, de, para) {
    const lance = lancePara(partida.casas, partida.vez, de, para);
    return lance ? jogar(partida, lance) : partida;
  }

  const desfazer = (partida) =>
    partida.jogadas.length === 0 ? partida : partida.jogadas.slice(0, -1).reduce(jogar, NOVA);

  /** Refaz a partida a partir dos lances salvos; qualquer lance inválido devolve uma partida nova. */
  function restaurar(jogadas) {
    if (!Array.isArray(jogadas)) return NOVA;
    let partida = NOVA;
    for (const lance of jogadas) {
      if (!lance || !Array.isArray(lance.passos)) return NOVA;
      const depois = jogar(partida, lance);
      if (depois === partida) return NOVA;
      partida = depois;
    }
    return partida;
  }

  const mesmaPartida = (a, b) =>
    a.jogadas.length === b.jogadas.length && a.jogadas.every((lance, i) => mesmoLance(lance, b.jogadas[i]));

  // ---------- Computador (minimax com poda alfa-beta) ----------

  const PONTOS_VITORIA = 100000;
  const VALOR_PEAO = 100;
  const VALOR_DAMA = 300;
  const BONUS_AVANCO = 4;
  const BONUS_BASE = 6;
  const BONUS_CENTRO = 4;
  const PROFUNDIDADE = { facil: 0, medio: 2, dificil: 4 };

  /** Quanto vale o tabuleiro para `ia`: material, avanço das peças, base protegida e miolo. */
  function avaliar(casas, ia) {
    let nota = 0;
    for (let casa = 0; casa < TOTAL_CASAS; casa++) {
      const p = casas[casa];
      if (!p) continue;
      const linha = linhaDaCasa(casa);
      const coluna = colunaDaCasa(casa);
      let valor = p.dama ? VALOR_DAMA : VALOR_PEAO + BONUS_AVANCO * (p.jogador === BRANCO ? LINHAS - 1 - linha : linha);
      if (!p.dama && ((p.jogador === BRANCO && linha === LINHAS - 1) || (p.jogador === PRETO && linha === 0))) {
        valor += BONUS_BASE;
      }
      if (coluna >= 2 && coluna <= 5) valor += BONUS_CENTRO;
      nota += p.jogador === ia ? valor : -valor;
    }
    return nota;
  }

  /** Capturas primeiro: rendem mais e fazem a poda alfa-beta cortar mais cedo. */
  const capturasPrimeiro = (lances) =>
    [...lances].sort((a, b) => capturadasDoLance(b).length - capturadasDoLance(a).length);

  /** Nota do ponto de vista de `ia`; `profundidade` é quantos lances ainda serão olhados. */
  function minimax(casas, vez, ia, profundidade, alfa, beta) {
    const lances = capturasPrimeiro(lancesLegais(casas, vez));
    // Quem não tem lance perdeu
    if (lances.length === 0) return vez === ia ? -PONTOS_VITORIA - profundidade : PONTOS_VITORIA + profundidade;
    if (profundidade <= 0) return avaliar(casas, ia);
    const maximizando = vez === ia;
    let melhor = maximizando ? -Infinity : Infinity;
    for (const lance of lances) {
      const nota = minimax(aplicarLance(casas, lance), adversario(vez), ia, profundidade - 1, alfa, beta);
      if (maximizando) {
        if (nota > melhor) melhor = nota;
        if (melhor > alfa) alfa = melhor;
      } else {
        if (nota < melhor) melhor = nota;
        if (melhor < beta) beta = melhor;
      }
      if (beta <= alfa) break;
    }
    return melhor;
  }

  /** Todos os lances com a melhor nota (pode haver empate). */
  function melhoresJogadas(casas, jogador, profundidade = PROFUNDIDADE.dificil) {
    const lances = capturasPrimeiro(lancesLegais(casas, jogador));
    let melhorNota = -Infinity;
    let melhores = [];
    for (const lance of lances) {
      const proximo = aplicarLance(casas, lance);
      let nota;
      if (lancesLegais(proximo, adversario(jogador)).length === 0) nota = PONTOS_VITORIA;
      else if (profundidade <= 1) nota = avaliar(proximo, jogador);
      else nota = minimax(proximo, adversario(jogador), jogador, profundidade - 1, -Infinity, Infinity);
      if (nota > melhorNota) {
        melhorNota = nota;
        melhores = [lance];
      } else if (nota === melhorNota) {
        melhores.push(lance);
      }
    }
    return melhores;
  }

  const sortear = (lista, aleatorio) => lista[Math.floor(aleatorio() * lista.length)];

  function escolherJogada(casas, jogador, nivel, aleatorio = Math.random) {
    const lances = lancesLegais(casas, jogador);
    if (lances.length === 0) throw new Error("Partida já terminou");
    if (nivel.id === "facil") return sortear(lances, aleatorio);
    // No Médio, de vez em quando ele joga ao acaso, para não parecer que está copiando
    const aoAcaso = nivel.id === "medio" && aleatorio() < 0.2;
    const profundidade = PROFUNDIDADE[nivel.id] ?? PROFUNDIDADE.medio;
    return sortear(aoAcaso ? lances : melhoresJogadas(casas, jogador, profundidade), aleatorio);
  }

  // ---------- Placar da sessão ----------

  const PLACAR_ZERO = Object.freeze({ b: 0, p: 0, empates: 0 });

  /** `jogador` nulo é empate. */
  function ajustarPlacar(placar, jogador, delta) {
    const campo = jogador === BRANCO ? "b" : jogador === PRETO ? "p" : "empates";
    return { ...placar, [campo]: Math.max(0, placar[campo] + delta) };
  }

  const somar = (placar, jogador) => ajustarPlacar(placar, jogador, 1);
  const subtrair = (placar, jogador) => ajustarPlacar(placar, jogador, -1);

  const placarParaLista = (placar) => [placar.b, placar.p, placar.empates];

  function placarDeLista(valores) {
    if (!Array.isArray(valores) || valores.length !== 3 || !valores.every((v) => Number.isInteger(v) && v >= 0)) {
      return { ...PLACAR_ZERO };
    }
    return { b: valores[0], p: valores[1], empates: valores[2] };
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
    BRANCO,
    PRETO,
    LINHAS,
    COLUNAS,
    TOTAL_CASAS,
    PECAS_POR_LADO,
    LANCES_ATE_EMPATE,
    MODOS,
    NIVEIS,
    HUMANO,
    COMPUTADOR,
    ATRASO_COMPUTADOR_MS,
    LIMITE_HISTORICO,
    DESFECHOS,
    PLACAR_ZERO,
    PROFUNDIDADE,
    TABULEIRO_INICIAL,
    adversario,
    indice,
    linhaDaCasa,
    colunaDaCasa,
    nomeDaCasa,
    casaEscura,
    sentidoDoPeao,
    contarPecas,
    pecasDe,
    capturasDePasso,
    capturasDe,
    movimentosDePasso,
    lancesLegais,
    criar,
    lancesDe,
    lancePara,
    ehCaptura,
    mesmoLance,
    aplicarLance,
    capturadasDoLance,
    NOVA,
    jogar,
    jogarDe,
    desfazer,
    restaurar,
    mesmaPartida,
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

if (typeof module === "object") module.exports = LogicaDamas;
