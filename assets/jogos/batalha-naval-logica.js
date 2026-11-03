"use strict";
/*
 * Regras da Batalha Naval do app Multi-Game Strategy (com.emerson1981.multigames), sem DOM:
 * jogos/batalhanaval/logica/Modelos.kt, TabuleiroNaval.kt, IaBatalhaNaval.kt e Partida.kt,
 * dados/RepositorioBatalhaNaval.kt (validação da partida salva) e dados/recordes/RegrasRecordes.kt.
 * As casas são números de 0 a 99 (linha × 10 + coluna); o sorteio recebe uma função
 * aleatorio() que devolve [0, 1), para os testes repetirem as partidas.
 */
const LogicaBatalhaNaval = (() => {
  const TAMANHO = 10;
  const CASAS = TAMANHO * TAMANHO;
  const LIMITE_RECORDES = 10;

  /** Frota na ordem de posicionamento do app, com as cores de cada navio. */
  const NAVIOS = [
    { tipo: "carrier", nome: "Porta-aviões", tamanho: 5, cor: "#ff6b6b" },
    { tipo: "battleship", nome: "Encouraçado", tamanho: 4, cor: "#4ecdc4" },
    { tipo: "submarine", nome: "Submarino", tamanho: 3, cor: "#45b7d1" },
    { tipo: "destroyer", nome: "Contratorpedeiro", tamanho: 3, cor: "#96ceb4" },
    { tipo: "patrol", nome: "Patrulha", tamanho: 2, cor: "#ffeaa7" },
  ];
  const TIPO = new Map(NAVIOS.map((n) => [n.tipo, n]));

  /** Dificuldades da IA; a chave também é a categoria dos recordes. */
  const DIFICULDADES = [
    { chave: "easy", nome: "Fácil", descricao: "O computador atira quase sempre ao acaso" },
    { chave: "medium", nome: "Médio", descricao: "Às vezes ele caça perto dos acertos" },
    { chave: "hard", nome: "Difícil", descricao: "Ele persegue cada navio atingido" },
  ];
  const CHANCE_CACA = { easy: 0.2, medium: 0.6, hard: 1 };

  const casa = (linha, coluna) => linha * TAMANHO + coluna;
  const linhaDe = (i) => Math.floor(i / TAMANHO);
  const colunaDe = (i) => i % TAMANHO;
  const dentro = (linha, coluna) => linha >= 0 && linha < TAMANHO && coluna >= 0 && coluna < TAMANHO;
  const sortear = (lista, aleatorio) => lista[Math.floor(aleatorio() * lista.length)];

  function embaralhar(lista, aleatorio) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  /** Casas vizinhas (cima, baixo, esquerda, direita) dentro do tabuleiro. */
  function vizinhas(i) {
    const l = linhaDe(i);
    const c = colunaDe(i);
    return [
      [l - 1, c],
      [l + 1, c],
      [l, c - 1],
      [l, c + 1],
    ]
      .filter(([a, b]) => dentro(a, b))
      .map(([a, b]) => casa(a, b));
  }

  /** Casas de um navio que começa em (linha, coluna) e segue para a direita ou para baixo; null se sair. */
  function posicoesNavio(tipo, linha, coluna, orientacao) {
    const navio = TIPO.get(tipo);
    const posicoes = [];
    for (let k = 0; k < navio.tamanho; k++) {
      const l = orientacao === "horizontal" ? linha : linha + k;
      const c = orientacao === "horizontal" ? coluna + k : coluna;
      if (!dentro(l, c)) return null;
      posicoes.push(casa(l, c));
    }
    return posicoes;
  }

  // ---------- Tabuleiro: { navios: [{ tipo, posicoes }], tiros: [casas] } ----------

  const tabuleiroVazio = () => ({ navios: [], tiros: [] });

  function navioEm(t, i) {
    return t.navios.find((n) => n.posicoes.includes(i)) || null;
  }

  function afundado(t, navio) {
    return navio.posicoes.every((p) => t.tiros.includes(p));
  }

  /** "agua", "navio" (intacto), "acerto", "erro" ou "afundado". */
  function estado(t, i) {
    const navio = navioEm(t, i);
    const atingida = t.tiros.includes(i);
    if (!navio) return atingida ? "erro" : "agua";
    if (!atingida) return "navio";
    return afundado(t, navio) ? "afundado" : "acerto";
  }

  /** Vitória só com a frota no mar: um tabuleiro sem navios não conta como derrotado. */
  function todosAfundados(t) {
    return t.navios.length > 0 && t.navios.every((n) => afundado(t, n));
  }

  const tiposPosicionados = (t) => new Set(t.navios.map((n) => n.tipo));
  const afundados = (t) => t.navios.filter((n) => afundado(t, n)).map((n) => n.tipo);

  /** Casas atingidas de navios que ainda não afundaram (onde a IA deve caçar). */
  function acertosAbertos(t) {
    return t.tiros.filter((i) => estado(t, i) === "acerto");
  }

  function podePosicionar(t, posicoes) {
    return !!posicoes && posicoes.every((p) => p >= 0 && p < CASAS && !navioEm(t, p));
  }

  /** Coloca o navio (uma vez por tipo); null se sair do tabuleiro ou cruzar outro navio. */
  function posicionar(t, tipo, linha, coluna, orientacao) {
    if (!TIPO.has(tipo) || tiposPosicionados(t).has(tipo)) return null;
    const posicoes = posicoesNavio(tipo, linha, coluna, orientacao);
    if (!podePosicionar(t, posicoes)) return null;
    return { ...t, navios: [...t.navios, { tipo, posicoes }] };
  }

  function remover(t, tipo) {
    return { ...t, navios: t.navios.filter((n) => n.tipo !== tipo) };
  }

  /** Resultado de um tiro; null se a casa estiver fora do tabuleiro ou já tiver levado tiro. */
  function atirar(t, i) {
    if (!Number.isInteger(i) || i < 0 || i >= CASAS || t.tiros.includes(i)) return null;
    const novo = { ...t, tiros: [...t.tiros, i] };
    const navio = navioEm(t, i);
    return { tabuleiro: novo, posicao: i, atingido: navio ? navio.tipo : null, afundou: !!navio && afundado(novo, navio) };
  }

  /** Completa a frota sorteando entre todas as posições válidas; null se faltar espaço. */
  function completarAleatorio(t, aleatorio = Math.random) {
    let tabuleiro = t;
    const ja = tiposPosicionados(t);
    for (const { tipo } of NAVIOS) {
      if (ja.has(tipo)) continue;
      const opcoes = [];
      for (let i = 0; i < CASAS; i++) {
        for (const orientacao of ["horizontal", "vertical"]) {
          const posicoes = posicoesNavio(tipo, linhaDe(i), colunaDe(i), orientacao);
          if (podePosicionar(tabuleiro, posicoes)) opcoes.push(posicoes);
        }
      }
      if (!opcoes.length) return null;
      tabuleiro = { ...tabuleiro, navios: [...tabuleiro.navios, { tipo, posicoes: sortear(opcoes, aleatorio) }] };
    }
    return tabuleiro;
  }

  /** Frota bem formada: um navio de cada tipo, do tamanho certo, em linha, sem sobreposição. */
  function frotaValida(t, completa) {
    if (!t || !Array.isArray(t.navios) || !Array.isArray(t.tiros)) return false;
    const tipos = t.navios.map((n) => n && n.tipo);
    if (tipos.some((tipo) => !TIPO.has(tipo)) || new Set(tipos).size !== tipos.length) return false;
    if (completa && tipos.length !== NAVIOS.length) return false;
    const casas = t.navios.flatMap((n) => (Array.isArray(n.posicoes) ? n.posicoes : [null]));
    const casaValida = (i) => Number.isInteger(i) && i >= 0 && i < CASAS;
    if (!casas.every(casaValida) || new Set(casas).size !== casas.length) return false;
    const emLinha = t.navios.every((n) => {
      const ordenadas = n.posicoes.slice().sort((a, b) => a - b);
      if (ordenadas.length !== TIPO.get(n.tipo).tamanho) return false;
      const inicio = ordenadas[0];
      return ["horizontal", "vertical"].some((o) => {
        const esperadas = posicoesNavio(n.tipo, linhaDe(inicio), colunaDe(inicio), o);
        return !!esperadas && esperadas.every((p, k) => p === ordenadas[k]);
      });
    });
    return emLinha && t.tiros.every(casaValida) && new Set(t.tiros).size === t.tiros.length;
  }

  // ---------- Computador ----------

  /**
   * Onde o computador atira. Só sorteia entre casas que ainda não levaram tiro e caça a partir
   * de todos os acertos em navios ainda não afundados:
   * - Fácil: ao acaso; em 20% das vezes tenta ao lado de um acerto.
   * - Médio: em 60% das vezes tenta ao lado de um acerto.
   * - Difícil: sempre caça; com dois acertos em linha segue a linha, e sem acertos atira em
   *   casas alternadas (xadrez), já que o menor navio ocupa duas casas.
   */
  function escolherAlvo(t, dificuldade, aleatorio = Math.random) {
    const livres = [];
    for (let i = 0; i < CASAS; i++) if (!t.tiros.includes(i)) livres.push(i);
    if (!livres.length) return null;
    const acertos = acertosAbertos(t);
    if (acertos.length && aleatorio() < (CHANCE_CACA[dificuldade] ?? CHANCE_CACA.medium)) {
      const alvo = dificuldade === "hard" ? alvoInteligente(t, acertos, aleatorio) : alvoVizinho(t, acertos, aleatorio);
      if (alvo !== null) return alvo;
    }
    if (dificuldade === "hard") {
      const xadrez = livres.filter((i) => (linhaDe(i) + colunaDe(i)) % 2 === 0);
      if (xadrez.length) return sortear(xadrez, aleatorio);
    }
    return sortear(livres, aleatorio);
  }

  /** Casa livre ao lado de um acerto sorteado (Fácil e Médio). */
  function alvoVizinho(t, acertos, aleatorio) {
    for (const acerto of embaralhar(acertos, aleatorio)) {
      const opcoes = vizinhas(acerto).filter((i) => !t.tiros.includes(i));
      if (opcoes.length) return sortear(opcoes, aleatorio);
    }
    return null;
  }

  /** Continua as linhas de acertos pelas pontas; sem linha, tenta os vizinhos dos acertos. */
  function alvoInteligente(t, acertos, aleatorio = Math.random) {
    const abertos = new Set(acertos.map((i) => `${linhaDe(i)},${colunaDe(i)}`));
    const aberto = (l, c) => abertos.has(`${l},${c}`);
    const pontas = [];
    for (const acerto of acertos) {
      const l = linhaDe(acerto);
      const c = colunaDe(acerto);
      for (const [dl, dc] of [
        [0, 1],
        [1, 0],
      ]) {
        if (!aberto(l - dl, c - dc) && !aberto(l + dl, c + dc)) continue;
        let [il, ic] = [l, c];
        while (aberto(il - dl, ic - dc)) [il, ic] = [il - dl, ic - dc];
        let [fl, fc] = [l, c];
        while (aberto(fl + dl, fc + dc)) [fl, fc] = [fl + dl, fc + dc];
        for (const [pl, pc] of [
          [il - dl, ic - dc],
          [fl + dl, fc + dc],
        ]) {
          if (dentro(pl, pc) && !pontas.includes(casa(pl, pc))) pontas.push(casa(pl, pc));
        }
      }
    }
    const naLinha = pontas.filter((i) => !t.tiros.includes(i));
    if (naLinha.length) return sortear(naLinha, aleatorio);
    return alvoVizinho(t, acertos, aleatorio);
  }

  // ---------- Partida ----------
  /*
   * { jogador, inimigo, fase: "posicionando" | "jogando" | "fim", vez: "jogador" | "ia",
   *   vencedor: null | "jogador" | "ia", dificuldade: null | "easy" | "medium" | "hard",
   *   orientacao: "horizontal" | "vertical" }
   */

  function novaPartida(dificuldade = null, aleatorio = Math.random) {
    return {
      jogador: tabuleiroVazio(),
      inimigo: completarAleatorio(tabuleiroVazio(), aleatorio),
      fase: "posicionando",
      vez: "jogador",
      vencedor: null,
      dificuldade,
      orientacao: "horizontal",
    };
  }

  /** Tiros do jogador: as casas atingidas no tabuleiro inimigo. */
  const tiros = (p) => p.inimigo.tiros.length;
  const naviosFaltando = (p) => {
    const ja = tiposPosicionados(p.jogador);
    return NAVIOS.filter((n) => !ja.has(n.tipo)).map((n) => n.tipo);
  };
  const prontaParaComecar = (p) => p.fase === "posicionando" && naviosFaltando(p).length === 0;
  /** Há algo a perder ao começar outra: navio posicionado ou batalha em curso. */
  const emAndamento = (p) => p.fase === "jogando" || (p.fase === "posicionando" && p.jogador.navios.length > 0);
  const vezDaIa = (p) => p.fase === "jogando" && p.vez === "ia";

  function escolherDificuldade(p, dificuldade) {
    if (p.fase === "fim" || !DIFICULDADES.some((d) => d.chave === dificuldade)) return p;
    return { ...p, dificuldade };
  }

  function girar(p) {
    return { ...p, orientacao: p.orientacao === "horizontal" ? "vertical" : "horizontal" };
  }

  function posicionarNavio(p, tipo, linha, coluna) {
    if (p.fase !== "posicionando") return null;
    const jogador = posicionar(p.jogador, tipo, linha, coluna, p.orientacao);
    return jogador ? { ...p, jogador } : null;
  }

  /** Tira o navio do tabuleiro durante o posicionamento (para colocá-lo em outro lugar). */
  function removerNavio(p, tipo) {
    return p.fase === "posicionando" ? { ...p, jogador: remover(p.jogador, tipo) } : p;
  }

  function posicionarRestantes(p, aleatorio = Math.random) {
    if (p.fase !== "posicionando") return null;
    const jogador = completarAleatorio(p.jogador, aleatorio);
    return jogador ? { ...p, jogador } : null;
  }

  function iniciar(p) {
    if (!prontaParaComecar(p) || !p.dificuldade) return null;
    return { ...p, fase: "jogando", vez: "jogador" };
  }

  /** Tiro do jogador no tabuleiro inimigo; quem acerta joga de novo. */
  function atirarJogador(p, i) {
    if (p.fase !== "jogando" || p.vez !== "jogador") return null;
    const tiro = atirar(p.inimigo, i);
    if (!tiro) return null;
    const venceu = todosAfundados(tiro.tabuleiro);
    const partida = {
      ...p,
      inimigo: tiro.tabuleiro,
      vez: tiro.atingido || venceu ? "jogador" : "ia",
      fase: venceu ? "fim" : "jogando",
      vencedor: venceu ? "jogador" : null,
    };
    return { partida, tiro };
  }

  /** Um tiro do computador (ele também joga de novo quando acerta). */
  function jogadaIa(p, aleatorio = Math.random) {
    if (!vezDaIa(p)) return null;
    const alvo = escolherAlvo(p.jogador, p.dificuldade || "medium", aleatorio);
    if (alvo === null) return null;
    const tiro = atirar(p.jogador, alvo);
    if (!tiro) return null;
    const venceu = todosAfundados(tiro.tabuleiro);
    const partida = {
      ...p,
      jogador: tiro.tabuleiro,
      vez: tiro.atingido || venceu ? "ia" : "jogador",
      fase: venceu ? "fim" : "jogando",
      vencedor: venceu ? "ia" : null,
    };
    return { partida, tiro };
  }

  /** Partida salva coerente (como CodecBatalhaNaval.partidaValida); qualquer coisa estranha é descartada. */
  function partidaValida(p) {
    if (!p || typeof p !== "object") return false;
    if (!["posicionando", "jogando", "fim"].includes(p.fase)) return false;
    if (!["jogador", "ia"].includes(p.vez) || !["horizontal", "vertical"].includes(p.orientacao)) return false;
    if (p.dificuldade !== null && !DIFICULDADES.some((d) => d.chave === p.dificuldade)) return false;
    if (p.vencedor !== null && !["jogador", "ia"].includes(p.vencedor)) return false;
    if (!frotaValida(p.inimigo, true) || !frotaValida(p.jogador, p.fase !== "posicionando")) return false;
    if (p.fase === "posicionando" && (p.jogador.tiros.length || p.inimigo.tiros.length)) return false;
    if (p.fase === "jogando" && (todosAfundados(p.jogador) || todosAfundados(p.inimigo) || !p.dificuldade)) return false;
    return true;
  }

  /** Lê a partida do JSON salvo; null se faltar, estiver corrompida ou incoerente. */
  function lerPartida(texto) {
    if (typeof texto !== "string" || !texto) return null;
    try {
      const obj = JSON.parse(texto);
      const limpar = (t) => ({
        navios: Array.isArray(t?.navios) ? t.navios.map((n) => ({ tipo: n?.tipo, posicoes: n?.posicoes })) : null,
        tiros: t?.tiros,
      });
      const p = {
        jogador: limpar(obj.jogador),
        inimigo: limpar(obj.inimigo),
        fase: obj.fase,
        vez: obj.vez,
        vencedor: obj.vencedor ?? null,
        dificuldade: obj.dificuldade ?? null,
        orientacao: obj.orientacao,
      };
      return partidaValida(p) ? p : null;
    } catch (erro) {
      return null;
    }
  }

  // ---------- Estatísticas e recordes ----------

  const estatisticasVazias = () => ({ partidas: 0, vitorias: 0, derrotas: 0, mediaTiros: 0, melhorJogo: 0 });

  function registrarEstatistica(e, venceu, nTiros) {
    const total = e.partidas + 1;
    return {
      partidas: total,
      vitorias: e.vitorias + (venceu ? 1 : 0),
      derrotas: e.derrotas + (venceu ? 0 : 1),
      mediaTiros: Math.round((e.mediaTiros * e.partidas + nTiros) / total),
      melhorJogo: venceu && (e.melhorJogo === 0 || nTiros < e.melhorJogo) ? nTiros : e.melhorJogo,
    };
  }

  const taxaVitoria = (e) => (e.partidas === 0 ? 0 : Math.round((e.vitorias * 100) / e.partidas));

  function lerEstatisticas(texto) {
    try {
      const e = JSON.parse(texto);
      const campos = ["partidas", "vitorias", "derrotas", "mediaTiros", "melhorJogo"];
      if (e && campos.every((c) => Number.isInteger(e[c]) && e[c] >= 0) && e.vitorias + e.derrotas === e.partidas) {
        return Object.fromEntries(campos.map((c) => [c, e[c]]));
      }
    } catch (erro) {
      /* Corrompidas: começa do zero. */
    }
    return estatisticasVazias();
  }

  /** Menos tiros primeiro; no empate fica na frente quem fez antes. */
  const ordenarRecordes = (lista) => lista.slice().sort((a, b) => a.tiros - b.tiros || a.momento - b.momento);

  /**
   * Coloca a vitória na lista se ela couber entre as 10 melhores. Devolve a lista nova, a
   * posição (1 = melhor; null se não entrou) e se é um novo recorde (a primeira ou melhor que a
   * melhor anterior; empate não é recorde).
   */
  function inserirRecorde(lista, novo) {
    const melhor = lista[0];
    const novoRecorde = !melhor || novo.tiros < melhor.tiros;
    const mantidos = ordenarRecordes([...lista, novo]).slice(0, LIMITE_RECORDES);
    const indice = mantidos.indexOf(novo);
    return { lista: indice >= 0 ? mantidos : lista, posicao: indice >= 0 ? indice + 1 : null, novoRecorde };
  }

  /** { easy: [...], medium: [...], hard: [...] } com { tiros, momento }, já ordenadas. */
  function lerRecordes(texto) {
    const recordes = { easy: [], medium: [], hard: [] };
    try {
      const obj = JSON.parse(texto);
      for (const chave of Object.keys(recordes)) {
        const lista = Array.isArray(obj?.[chave]) ? obj[chave] : [];
        recordes[chave] = ordenarRecordes(
          lista.filter((r) => r && Number.isInteger(r.tiros) && r.tiros > 0 && Number.isFinite(r.momento)),
        ).slice(0, LIMITE_RECORDES);
      }
    } catch (erro) {
      /* Sem recordes válidos. */
    }
    return recordes;
  }

  return {
    TAMANHO,
    NAVIOS,
    DIFICULDADES,
    navio: (tipo) => TIPO.get(tipo) || null,
    casa,
    linhaDe,
    colunaDe,
    vizinhas,
    posicoesNavio,
    tabuleiroVazio,
    navioEm,
    afundado,
    estado,
    todosAfundados,
    tiposPosicionados,
    afundados,
    acertosAbertos,
    posicionar,
    remover,
    atirar,
    completarAleatorio,
    frotaValida,
    escolherAlvo,
    alvoInteligente,
    novaPartida,
    tiros,
    naviosFaltando,
    prontaParaComecar,
    emAndamento,
    vezDaIa,
    escolherDificuldade,
    girar,
    posicionarNavio,
    removerNavio,
    posicionarRestantes,
    iniciar,
    atirarJogador,
    jogadaIa,
    partidaValida,
    lerPartida,
    estatisticasVazias,
    registrarEstatistica,
    taxaVitoria,
    lerEstatisticas,
    ordenarRecordes,
    inserirRecorde,
    lerRecordes,
  };
})();
if (typeof module === "object") module.exports = LogicaBatalhaNaval;
