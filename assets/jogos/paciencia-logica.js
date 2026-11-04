"use strict";
/*
 * Paciência (Klondike): regras, pontuação, dica e estatísticas, sem nada de tela.
 *
 * Cartas: números de 0 a 51. naipe = id / 13 (0 espadas, 1 copas, 2 ouros, 3 paus) e valor =
 * id % 13 + 1 (1 é o Ás, 11 o Valete, 12 a Dama e 13 o Rei).
 *
 * Estado da partida (só listas de números, para salvar em JSON):
 *   monte: cartas viradas para baixo; a última da lista é a de cima.
 *   descarte: cartas já viradas do monte; a última é a de cima, a única que pode ser jogada.
 *   fundacoes: uma pilha por naipe, na ordem dos naipes, do Ás ao Rei.
 *   colunas: as 7 colunas da mesa; a última carta da lista é a de cima.
 *   fechadas: quantas cartas de cada coluna, a partir de baixo, estão viradas para baixo.
 *
 * Pontuação: carta do descarte para a mesa +5, qualquer carta para a fundação +10, carta
 * revelada na mesa +5, carta tirada da fundação −15 e cada vez que o descarte volta para o monte
 * −100 (virando 1) ou −20 (virando 3). Os pontos nunca ficam negativos. Ao vencer, o bônus de
 * tempo é 700.000 ÷ segundos, para partidas de 30 segundos ou mais.
 */
const LogicaPaciencia = (() => {
  const NAIPES = [
    { id: "espadas", nome: "espadas", vermelho: false },
    { id: "copas", nome: "copas", vermelho: true },
    { id: "ouros", nome: "ouros", vermelho: true },
    { id: "paus", nome: "paus", vermelho: false },
  ];
  const VALORES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const NOMES_VALOR = ["Ás", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Valete", "Dama", "Rei"];
  const MODOS = [1, 3];
  const COLUNAS = 7;
  const PONTOS = { descarteParaMesa: 5, paraFundacao: 10, revelar: 5, fundacaoParaMesa: -15, reciclar: { 1: -100, 3: -20 } };
  const MAIOR_SEMENTE = 999999;

  const naipe = (id) => Math.floor(id / 13);
  const valor = (id) => (id % 13) + 1;
  const vermelha = (id) => NAIPES[naipe(id)].vermelho;
  const textoValor = (id) => VALORES[valor(id) - 1];
  const nomeCarta = (id) => `${NOMES_VALOR[valor(id) - 1]} de ${NAIPES[naipe(id)].nome}`;
  const topo = (lista) => (lista.length ? lista[lista.length - 1] : null);

  // ---------- Embaralhar ----------

  /** Gerador pseudoaleatório (mulberry32): a mesma semente dá sempre a mesma partida. */
  function aleatorioComSemente(semente) {
    let a = semente >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const novaSemente = (aleatorio = Math.random) => 1 + Math.floor(aleatorio() * MAIOR_SEMENTE);

  function embaralhar(lista, aleatorio) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  /** Distribui as cartas: a coluna n recebe n cartas, só a de cima virada; o resto vai para o monte. */
  function novoJogo(modo, semente) {
    const baralho = embaralhar([...Array(52).keys()], aleatorioComSemente(semente));
    const colunas = [];
    const fechadas = [];
    let k = 0;
    for (let c = 0; c < COLUNAS; c++) {
      colunas.push(baralho.slice(k, k + c + 1));
      fechadas.push(c);
      k += c + 1;
    }
    return {
      modo: MODOS.includes(modo) ? modo : 1,
      semente,
      monte: baralho.slice(k),
      descarte: [],
      fundacoes: [[], [], [], []],
      colunas,
      fechadas,
      pontos: 0,
      movimentos: 0,
      segundos: 0,
      iniciado: false,
      passagens: 0,
    };
  }

  const clonar = (e) => ({
    ...e,
    monte: e.monte.slice(),
    descarte: e.descarte.slice(),
    fundacoes: e.fundacoes.map((f) => f.slice()),
    colunas: e.colunas.map((c) => c.slice()),
    fechadas: e.fechadas.slice(),
  });

  // ---------- Onde está cada carta ----------

  function localizar(e, id) {
    for (let c = 0; c < e.colunas.length; c++) {
      const posicao = e.colunas[c].indexOf(id);
      if (posicao >= 0) return { tipo: "coluna", indice: c, posicao, aberta: posicao >= e.fechadas[c] };
    }
    let posicao = e.descarte.indexOf(id);
    if (posicao >= 0) return { tipo: "descarte", posicao, topo: posicao === e.descarte.length - 1 };
    for (let f = 0; f < 4; f++) {
      posicao = e.fundacoes[f].indexOf(id);
      if (posicao >= 0) return { tipo: "fundacao", indice: f, posicao, topo: posicao === e.fundacoes[f].length - 1 };
    }
    posicao = e.monte.indexOf(id);
    if (posicao >= 0) return { tipo: "monte", posicao };
    return null;
  }

  /** Cada carta é uma a menos que a de baixo e de outra cor. */
  function sequenciaValida(ids) {
    for (let i = 1; i < ids.length; i++) {
      if (valor(ids[i - 1]) !== valor(ids[i]) + 1 || vermelha(ids[i - 1]) === vermelha(ids[i])) return false;
    }
    return true;
  }

  /** Cartas que saem juntas ao pegar [id]: a sequência da carta até o topo da coluna, ou só a de cima. */
  function cartasParaMover(e, id) {
    const local = localizar(e, id);
    if (!local) return null;
    if (local.tipo === "coluna") {
      if (!local.aberta) return null;
      const ids = e.colunas[local.indice].slice(local.posicao);
      return sequenciaValida(ids) ? ids : null;
    }
    if ((local.tipo === "descarte" || local.tipo === "fundacao") && local.topo) return [id];
    return null;
  }

  function aceitaNaColuna(e, ids, c) {
    const coluna = e.colunas[c];
    if (!coluna || !ids.length) return false;
    const base = ids[0];
    if (!coluna.length) return valor(base) === 13;
    const deCima = topo(coluna);
    return valor(deCima) === valor(base) + 1 && vermelha(deCima) !== vermelha(base);
  }

  const aceitaNaFundacao = (e, id) => e.fundacoes[naipe(id)].length === valor(id) - 1;

  function podeMover(e, id, destino) {
    const ids = cartasParaMover(e, id);
    if (!ids || !destino) return false;
    const local = localizar(e, id);
    if (destino.tipo === "coluna") {
      if (local.tipo === "coluna" && local.indice === destino.indice) return false;
      return aceitaNaColuna(e, ids, destino.indice);
    }
    if (destino.tipo === "fundacao") return ids.length === 1 && local.tipo !== "fundacao" && aceitaNaFundacao(e, id);
    return false;
  }

  // ---------- Jogadas ----------

  /** Tira as cartas da coluna e vira a de baixo, se ficou fechada no topo. Devolve os pontos ganhos. */
  function tirarDaColuna(n, c, posicao) {
    n.colunas[c].splice(posicao);
    if (n.colunas[c].length && n.fechadas[c] >= n.colunas[c].length) {
      n.fechadas[c] = n.colunas[c].length - 1;
      return PONTOS.revelar;
    }
    n.fechadas[c] = Math.min(n.fechadas[c], n.colunas[c].length);
    return 0;
  }

  /**
   * Move a carta [id] (com as que estão em cima dela, na mesa) para o destino:
   * { tipo: "coluna", indice } ou { tipo: "fundacao" }. Devolve o novo estado, ou null se não pode.
   */
  function mover(e, id, destino) {
    if (!podeMover(e, id, destino)) return null;
    const local = localizar(e, id);
    const ids = cartasParaMover(e, id);
    const n = clonar(e);
    let pontos = 0;
    if (local.tipo === "coluna") pontos += tirarDaColuna(n, local.indice, local.posicao);
    else if (local.tipo === "descarte") n.descarte.pop();
    else n.fundacoes[local.indice].pop();
    if (destino.tipo === "coluna") {
      n.colunas[destino.indice].push(...ids);
      if (local.tipo === "descarte") pontos += PONTOS.descarteParaMesa;
      if (local.tipo === "fundacao") pontos += PONTOS.fundacaoParaMesa;
    } else {
      n.fundacoes[naipe(id)].push(id);
      pontos += PONTOS.paraFundacao;
    }
    n.pontos = Math.max(0, n.pontos + pontos);
    n.movimentos += 1;
    n.iniciado = true;
    return n;
  }

  /** Vira 1 ou 3 cartas do monte; com o monte vazio, o descarte volta a ser o monte. */
  function comprar(e) {
    if (!e.monte.length && !e.descarte.length) return null;
    const n = clonar(e);
    if (n.monte.length) {
      const quantas = Math.min(n.modo, n.monte.length);
      for (let i = 0; i < quantas; i++) n.descarte.push(n.monte.pop());
    } else {
      n.monte = n.descarte.reverse();
      n.descarte = [];
      n.passagens += 1;
      n.pontos = Math.max(0, n.pontos + PONTOS.reciclar[n.modo]);
    }
    n.movimentos += 1;
    n.iniciado = true;
    return n;
  }

  /** Para onde a carta vai com um toque: fundação, depois uma coluna com cartas, depois uma vazia. */
  function melhorDestino(e, id) {
    const ids = cartasParaMover(e, id);
    if (!ids) return null;
    const local = localizar(e, id);
    if (podeMover(e, id, { tipo: "fundacao" })) return { tipo: "fundacao" };
    const comeco = local.tipo === "coluna" ? local.indice + 1 : 0;
    let vazia = null;
    for (let k = 0; k < COLUNAS; k++) {
      const c = (comeco + k) % COLUNAS;
      if (!podeMover(e, id, { tipo: "coluna", indice: c })) continue;
      if (e.colunas[c].length) return { tipo: "coluna", indice: c };
      if (vazia === null) vazia = c;
    }
    // Um Rei que já está no fundo de uma coluna não ganha nada indo para outra vazia
    const reiNoFundo = local.tipo === "coluna" && local.posicao === 0;
    return vazia !== null && !reiNoFundo ? { tipo: "coluna", indice: vazia } : null;
  }

  const venceu = (e) => e.fundacoes.every((f) => f.length === 13);

  // ---------- Dica ----------

  /** Cartas que podem aparecer no topo do descarte só virando o monte, numa volta completa. */
  function alcancaveisNoMonte(e) {
    let monte = e.monte.slice();
    let descarte = e.descarte.slice();
    const total = monte.length + descarte.length;
    const vistas = new Set();
    if (!total) return [];
    for (let passo = 0; passo < 3 * (total + 1); passo++) {
      if (monte.length) {
        const quantas = Math.min(e.modo, monte.length);
        for (let i = 0; i < quantas; i++) descarte.push(monte.pop());
      } else {
        monte = descarte.reverse();
        descarte = [];
      }
      if (descarte.length) vistas.add(topo(descarte));
    }
    vistas.delete(topo(e.descarte));
    return [...vistas];
  }

  function cartaServe(e, id) {
    if (aceitaNaFundacao(e, id)) return true;
    for (let c = 0; c < COLUNAS; c++) if (aceitaNaColuna(e, [id], c)) return true;
    return false;
  }

  /** Um Rei que poderia ocupar uma coluna vazia: no descarte ou na base de uma sequência sobre cartas fechadas. */
  function temReiParaColunaVazia(e) {
    const deCima = topo(e.descarte);
    if (deCima !== null && valor(deCima) === 13) return true;
    return e.colunas.some((coluna, c) => {
      const base = coluna[e.fechadas[c]];
      return e.fechadas[c] > 0 && base !== undefined && valor(base) === 13;
    });
  }

  /**
   * A jogada mais útil agora, em ordem: carta para a fundação, sequência que revela uma carta
   * fechada, carta do descarte para a mesa, jogada que libera uma carta para a fundação, coluna
   * esvaziada para um Rei e, por fim, virar o monte.
   * Devolve { id, destino }, { comprar: true } ou null quando não há nada útil a fazer.
   */
  function dica(e) {
    if (venceu(e)) return null;
    let melhor = null;
    const considerar = (prioridade, jogada) => {
      if (!melhor || prioridade > melhor.prioridade) melhor = { prioridade, ...jogada };
    };
    const deCimaDescarte = topo(e.descarte);

    e.colunas.forEach((coluna, c) => {
      const fechadas = e.fechadas[c];
      for (let p = fechadas; p < coluna.length; p++) {
        const id = coluna[p];
        const ehTopo = p === coluna.length - 1;
        if (ehTopo && podeMover(e, id, { tipo: "fundacao" })) {
          considerar(p === fechadas && fechadas > 0 ? 100 : 90, { id, destino: { tipo: "fundacao" } });
        }
        for (let d = 0; d < COLUNAS; d++) {
          if (d === c || !podeMover(e, id, { tipo: "coluna", indice: d })) continue;
          const destino = { tipo: "coluna", indice: d };
          if (p === fechadas && fechadas > 0) {
            // Revela uma carta fechada; vale mais na coluna com mais cartas fechadas
            considerar(80 + fechadas, { id, destino });
          } else if (p > fechadas && aceitaNaFundacao(e, coluna[p - 1])) {
            considerar(70, { id, destino });
          } else if (p === 0 && e.colunas[d].length && temReiParaColunaVazia(e)) {
            considerar(40, { id, destino });
          }
        }
      }
    });

    if (deCimaDescarte !== null) {
      if (podeMover(e, deCimaDescarte, { tipo: "fundacao" })) considerar(85, { id: deCimaDescarte, destino: { tipo: "fundacao" } });
      for (let d = 0; d < COLUNAS; d++) {
        if (podeMover(e, deCimaDescarte, { tipo: "coluna", indice: d })) {
          considerar(60, { id: deCimaDescarte, destino: { tipo: "coluna", indice: d } });
          break;
        }
      }
    }

    if (melhor) {
      const { prioridade, ...jogada } = melhor;
      return jogada;
    }
    if (alcancaveisNoMonte(e).some((id) => cartaServe(e, id))) return { comprar: true };
    return null;
  }

  // ---------- Final automático ----------

  /** Sem cartas fechadas a partida já está ganha; virando 3, só com o monte e o descarte vazios. */
  const podeConcluirSozinho = (e) =>
    !venceu(e) && e.fechadas.every((f) => f === 0) && (e.modo === 1 || (!e.monte.length && !e.descarte.length));

  /**
   * Um passo do final automático: a menor carta que já pode ir para a fundação, esteja ela no
   * topo de uma coluna, no descarte ou no monte (virando 1, todas as cartas do monte ficam ao
   * alcance). Não conta movimento nem tira pontos por voltar o monte.
   */
  function passoAutomatico(e) {
    if (!podeConcluirSozinho(e)) return null;
    const candidatas = [
      ...e.colunas.map(topo).filter((id) => id !== null),
      ...e.descarte,
      ...e.monte,
    ].filter((id) => aceitaNaFundacao(e, id));
    if (!candidatas.length) return null;
    const id = candidatas.reduce((a, b) => (valor(b) < valor(a) ? b : a));
    const local = localizar(e, id);
    const n = clonar(e);
    if (local.tipo === "coluna") n.colunas[local.indice].pop();
    else if (local.tipo === "descarte") n.descarte.splice(local.posicao, 1);
    else n.monte.splice(local.posicao, 1);
    n.fundacoes[naipe(id)].push(id);
    n.pontos += PONTOS.paraFundacao;
    return { estado: n, id };
  }

  const bonusTempo = (segundos) => (segundos >= 30 ? Math.round(700000 / segundos) : 0);

  // ---------- Salvar e restaurar ----------

  const inteiro = (v, min = 0) => Number.isInteger(v) && v >= min;

  /** Confere um estado salvo: todas as 52 cartas uma vez só, fundações em ordem e mesa válida. */
  function restaurar(salvo) {
    if (!salvo || typeof salvo !== "object" || !MODOS.includes(salvo.modo)) return null;
    if (!Array.isArray(salvo.fundacoes) || salvo.fundacoes.length !== 4) return null;
    if (!Array.isArray(salvo.colunas) || salvo.colunas.length !== COLUNAS) return null;
    if (!Array.isArray(salvo.fechadas) || salvo.fechadas.length !== COLUNAS) return null;
    const listas = [salvo.monte, salvo.descarte, ...salvo.fundacoes, ...salvo.colunas];
    if (!listas.every((l) => Array.isArray(l) && l.every((id) => inteiro(id) && id < 52))) return null;
    const todas = listas.flat();
    if (todas.length !== 52 || new Set(todas).size !== 52) return null;
    if (!salvo.fundacoes.every((f, i) => f.every((id, p) => id === i * 13 + p))) return null;
    for (let c = 0; c < COLUNAS; c++) {
      const coluna = salvo.colunas[c];
      const fechadas = salvo.fechadas[c];
      if (!inteiro(fechadas) || (coluna.length ? fechadas >= coluna.length : fechadas !== 0)) return null;
      if (!sequenciaValida(coluna.slice(fechadas))) return null;
    }
    for (const campo of ["pontos", "movimentos", "segundos", "passagens"]) if (!inteiro(salvo[campo])) return null;
    if (!inteiro(salvo.semente, 1)) return null;
    return clonar({
      modo: salvo.modo,
      semente: salvo.semente,
      monte: salvo.monte,
      descarte: salvo.descarte,
      fundacoes: salvo.fundacoes,
      colunas: salvo.colunas,
      fechadas: salvo.fechadas,
      pontos: salvo.pontos,
      movimentos: salvo.movimentos,
      segundos: salvo.segundos,
      iniciado: salvo.iniciado === true,
      passagens: salvo.passagens,
    });
  }

  // ---------- Estatísticas ----------

  const estatisticasVazias = () => ({
    jogadas: 0,
    vitorias: 0,
    melhorTempo: null,
    melhorPontuacao: 0,
    sequencia: 0,
    melhorSequencia: 0,
  });

  function lerEstatisticas(salvas) {
    const limpo = estatisticasVazias();
    if (!salvas || typeof salvas !== "object") return limpo;
    for (const campo of ["jogadas", "vitorias", "melhorPontuacao", "sequencia", "melhorSequencia"]) {
      if (inteiro(salvas[campo])) limpo[campo] = salvas[campo];
    }
    if (inteiro(salvas.melhorTempo, 1)) limpo.melhorTempo = salvas.melhorTempo;
    limpo.vitorias = Math.min(limpo.vitorias, limpo.jogadas);
    return limpo;
  }

  /** Soma uma partida terminada; devolve as novas estatísticas e o que virou recorde. */
  function registrarResultado(estatisticas, { venceu: ganhou, segundos = 0, pontos = 0 }) {
    const e = { ...lerEstatisticas(estatisticas) };
    const recordes = { tempo: false, pontos: false };
    e.jogadas += 1;
    if (ganhou) {
      e.vitorias += 1;
      e.sequencia += 1;
      e.melhorSequencia = Math.max(e.melhorSequencia, e.sequencia);
      if (segundos > 0 && (e.melhorTempo === null || segundos < e.melhorTempo)) {
        recordes.tempo = e.melhorTempo !== null;
        e.melhorTempo = segundos;
      }
      if (pontos > e.melhorPontuacao) {
        recordes.pontos = e.melhorPontuacao > 0;
        e.melhorPontuacao = pontos;
      }
    } else {
      e.sequencia = 0;
    }
    return { estatisticas: e, recordes };
  }

  const porcentagemVitorias = (e) => (e.jogadas ? Math.round((100 * e.vitorias) / e.jogadas) : 0);

  function formatarTempo(segundos) {
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;
    const dois = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
  }

  const formatarNumero = (n) => n.toLocaleString("pt-BR");

  return {
    NAIPES,
    MODOS,
    COLUNAS,
    PONTOS,
    naipe,
    valor,
    vermelha,
    textoValor,
    nomeCarta,
    aleatorioComSemente,
    novaSemente,
    novoJogo,
    localizar,
    sequenciaValida,
    cartasParaMover,
    aceitaNaColuna,
    aceitaNaFundacao,
    podeMover,
    mover,
    comprar,
    melhorDestino,
    venceu,
    alcancaveisNoMonte,
    dica,
    podeConcluirSozinho,
    passoAutomatico,
    bonusTempo,
    restaurar,
    estatisticasVazias,
    lerEstatisticas,
    registrarResultado,
    porcentagemVitorias,
    formatarTempo,
    formatarNumero,
  };
})();

if (typeof module === "object") module.exports = LogicaPaciencia;
