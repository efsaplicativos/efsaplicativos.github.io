"use strict";
/*
 * Paciência Spider: regras, pontuação, dica e estatísticas, sem nada de tela.
 *
 * São dois baralhos, 104 cartas, numeradas de 0 a 103. conjunto = id / 13 (de 0 a 7) e valor =
 * id % 13 + 1 (1 é o Ás, 11 o Valete, 12 a Dama e 13 o Rei). O naipe de cada conjunto depende do
 * modo: com 1 naipe, os 8 conjuntos são de espadas; com 2, espadas e copas se alternam; com 4,
 * cada naipe aparece duas vezes.
 *
 * Estado da partida (só listas de números, para salvar em JSON):
 *   monte: cartas ainda não distribuídas; cada distribuição tira 10 do fim da lista.
 *   colunas: as 10 colunas da mesa; a última carta da lista é a de cima.
 *   fechadas: quantas cartas de cada coluna, a partir de baixo, estão viradas para baixo.
 *   completos: os naipes já completos, cada um do Rei ao Ás, na ordem em que saíram da mesa.
 *
 * Regras: uma carta vai sobre qualquer carta de valor um acima, de qualquer naipe, ou numa
 * coluna vazia. Só uma sequência do mesmo naipe, em ordem, se move junta. O monte põe uma carta
 * em cada coluna e não pode ser usado com coluna vazia. Uma sequência do Rei ao Ás do mesmo naipe
 * sai sozinha da mesa. Ganha quem completar os 8 naipes.
 *
 * Pontuação: começa em 500, cada jogada (mover, distribuir ou desfazer) tira 1 e cada naipe
 * completo dá 100. Os pontos nunca ficam negativos.
 */
const LogicaSpider = (() => {
  const NAIPES = [
    { id: "espadas", nome: "espadas", vermelho: false },
    { id: "copas", nome: "copas", vermelho: true },
    { id: "ouros", nome: "ouros", vermelho: true },
    { id: "paus", nome: "paus", vermelho: false },
  ];
  const VALORES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const NOMES_VALOR = ["Ás", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Valete", "Dama", "Rei"];
  const MODOS = [1, 2, 4];
  const COLUNAS = 10;
  const CARTAS = 104;
  const CONJUNTOS = 8;
  const POR_DISTRIBUICAO = 10;
  const PONTOS = { inicial: 500, jogada: -1, naipeCompleto: 100 };
  const MAIOR_SEMENTE = 999999;

  const conjunto = (id) => Math.floor(id / 13);
  const valor = (id) => (id % 13) + 1;
  /** Naipe da carta no modo: 0 espadas, 1 copas, 2 ouros, 3 paus. */
  const naipe = (id, modo) => (modo === 1 ? 0 : conjunto(id) % modo);
  const vermelha = (id, modo) => NAIPES[naipe(id, modo)].vermelho;
  const textoValor = (id) => VALORES[valor(id) - 1];
  const nomeCarta = (id, modo) => `${NOMES_VALOR[valor(id) - 1]} de ${NAIPES[naipe(id, modo)].nome}`;
  const topo = (lista) => (lista.length ? lista[lista.length - 1] : null);
  const textoModo = (modo) => (modo === 1 ? "1 naipe" : `${modo} naipes`);

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

  /** Distribui 54 cartas: 6 nas quatro primeiras colunas e 5 nas outras, só a de cima virada. */
  function novoJogo(modo, semente) {
    const baralho = embaralhar([...Array(CARTAS).keys()], aleatorioComSemente(semente));
    const colunas = [];
    const fechadas = [];
    let k = 0;
    for (let c = 0; c < COLUNAS; c++) {
      const quantas = c < 4 ? 6 : 5;
      colunas.push(baralho.slice(k, k + quantas));
      fechadas.push(quantas - 1);
      k += quantas;
    }
    return {
      modo: MODOS.includes(modo) ? modo : 1,
      semente,
      monte: baralho.slice(k),
      colunas,
      fechadas,
      completos: [],
      movimentos: 0,
      segundos: 0,
      iniciado: false,
    };
  }

  const clonar = (e) => ({
    ...e,
    monte: e.monte.slice(),
    colunas: e.colunas.map((c) => c.slice()),
    fechadas: e.fechadas.slice(),
    completos: e.completos.map((c) => c.slice()),
  });

  /** 500 pontos, menos 1 por jogada, mais 100 por naipe completo; nunca abaixo de zero. */
  const pontuacao = (e) =>
    Math.max(0, PONTOS.inicial + PONTOS.naipeCompleto * e.completos.length + PONTOS.jogada * e.movimentos);

  // ---------- Onde está cada carta ----------

  function localizar(e, id) {
    for (let c = 0; c < e.colunas.length; c++) {
      const posicao = e.colunas[c].indexOf(id);
      if (posicao >= 0) return { tipo: "coluna", indice: c, posicao, aberta: posicao >= e.fechadas[c] };
    }
    for (let f = 0; f < e.completos.length; f++) {
      const posicao = e.completos[f].indexOf(id);
      if (posicao >= 0) return { tipo: "completo", indice: f, posicao };
    }
    const posicao = e.monte.indexOf(id);
    if (posicao >= 0) return { tipo: "monte", posicao };
    return null;
  }

  /** Cada carta é uma a menos que a de baixo e do mesmo naipe. */
  function sequenciaDoNaipe(ids, modo) {
    for (let i = 1; i < ids.length; i++) {
      if (valor(ids[i - 1]) !== valor(ids[i]) + 1 || naipe(ids[i - 1], modo) !== naipe(ids[i], modo)) return false;
    }
    return true;
  }

  /** Cartas que saem juntas ao pegar [id]: ela e as de cima, se formarem uma sequência do mesmo naipe. */
  function cartasParaMover(e, id) {
    const local = localizar(e, id);
    if (!local || local.tipo !== "coluna" || !local.aberta) return null;
    const ids = e.colunas[local.indice].slice(local.posicao);
    return sequenciaDoNaipe(ids, e.modo) ? ids : null;
  }

  function aceitaNaColuna(e, ids, c) {
    const coluna = e.colunas[c];
    if (!coluna || !ids || !ids.length) return false;
    return !coluna.length || valor(topo(coluna)) === valor(ids[0]) + 1;
  }

  function podeMover(e, id, destino) {
    if (!destino || destino.tipo !== "coluna") return false;
    const ids = cartasParaMover(e, id);
    if (!ids) return false;
    if (localizar(e, id).indice === destino.indice) return false;
    return aceitaNaColuna(e, ids, destino.indice);
  }

  const podeDistribuir = (e) => e.monte.length > 0 && e.colunas.every((c) => c.length > 0);

  // ---------- Jogadas ----------

  /** Vira a carta de cima da coluna, se ela ficou fechada. */
  function abrirTopo(n, c) {
    const tamanho = n.colunas[c].length;
    if (tamanho && n.fechadas[c] >= tamanho) n.fechadas[c] = tamanho - 1;
    n.fechadas[c] = Math.min(n.fechadas[c], tamanho);
  }

  /** Tira da mesa toda sequência do Rei ao Ás do mesmo naipe que ficou no topo de uma coluna. */
  function recolherCompletos(n) {
    for (let c = 0; c < COLUNAS; c++) {
      const coluna = n.colunas[c];
      const inicio = coluna.length - 13;
      if (inicio < 0 || inicio < n.fechadas[c]) continue;
      const sequencia = coluna.slice(inicio);
      if (valor(sequencia[0]) !== 13 || !sequenciaDoNaipe(sequencia, n.modo)) continue;
      coluna.splice(inicio);
      n.completos.push(sequencia);
      abrirTopo(n, c);
    }
  }

  /** Move a carta [id], com as que estão em cima dela, para { tipo: "coluna", indice }. */
  function mover(e, id, destino) {
    if (!podeMover(e, id, destino)) return null;
    const local = localizar(e, id);
    const ids = cartasParaMover(e, id);
    const n = clonar(e);
    n.colunas[local.indice].splice(local.posicao);
    abrirTopo(n, local.indice);
    n.colunas[destino.indice].push(...ids);
    recolherCompletos(n);
    n.movimentos += 1;
    n.iniciado = true;
    return n;
  }

  /** Põe uma carta do monte, aberta, em cada coluna. Não vale com o monte vazio ou com coluna vazia. */
  function distribuir(e) {
    if (!podeDistribuir(e)) return null;
    const n = clonar(e);
    for (let c = 0; c < COLUNAS; c++) n.colunas[c].push(n.monte.pop());
    recolherCompletos(n);
    n.movimentos += 1;
    n.iniciado = true;
    return n;
  }

  /** Volta para o estado [anterior]; desfazer também conta como jogada. */
  const desfazer = (atual, anterior) => ({ ...clonar(anterior), movimentos: atual.movimentos + 1, iniciado: true });

  /**
   * Para onde a carta vai com um toque: sobre uma carta do mesmo naipe, depois sobre qualquer
   * carta, e por último numa coluna vazia (se ela não for já a coluna inteira).
   */
  function melhorDestino(e, id) {
    const ids = cartasParaMover(e, id);
    if (!ids) return null;
    const local = localizar(e, id);
    let outroNaipe = null;
    let vazia = null;
    for (let k = 1; k < COLUNAS; k++) {
      const d = (local.indice + k) % COLUNAS;
      if (!aceitaNaColuna(e, ids, d)) continue;
      const coluna = e.colunas[d];
      if (!coluna.length) {
        if (vazia === null) vazia = d;
      } else if (naipe(topo(coluna), e.modo) === naipe(id, e.modo)) {
        return { tipo: "coluna", indice: d };
      } else if (outroNaipe === null) {
        outroNaipe = d;
      }
    }
    if (outroNaipe !== null) return { tipo: "coluna", indice: outroNaipe };
    return vazia !== null && local.posicao > 0 ? { tipo: "coluna", indice: vazia } : null;
  }

  const venceu = (e) => e.completos.length === CONJUNTOS;

  // ---------- Dica ----------

  /** A jogada de [ids] para a coluna [d] fecha um naipe do Rei ao Ás? */
  function completaNaipe(e, ids, d) {
    const destino = e.colunas[d];
    if (!destino.length || valor(ids[ids.length - 1]) !== 1) return false;
    let k = destino.length - 1;
    while (
      k > e.fechadas[d] &&
      valor(destino[k - 1]) === valor(destino[k]) + 1 &&
      naipe(destino[k - 1], e.modo) === naipe(destino[k], e.modo)
    ) {
      k--;
    }
    return (
      valor(destino[k]) === 13 &&
      naipe(destino[k], e.modo) === naipe(ids[0], e.modo) &&
      valor(topo(destino)) === valor(ids[0]) + 1 &&
      destino.length - k + ids.length === 13
    );
  }

  /**
   * A jogada mais útil agora. Em ordem: completar um naipe, abrir uma carta fechada, tirar uma
   * carta de cima de outra fora de sequência, passar uma sequência para cima do mesmo naipe e,
   * com o monte já vazio, esvaziar uma coluna. Sem nada disso, distribuir; e se uma coluna vazia
   * impede a distribuição, a dica põe uma carta nela.
   *
   * Nenhuma jogada sugerida desfaz o que outra ganhou (as cartas fechadas, as cartas fora de
   * sequência e as sequências do mesmo naipe só melhoram), então seguir a dica nunca anda em
   * círculos. Devolve { id, destino }, { distribuir: true } ou null quando não há nada útil.
   */
  function dica(e) {
    if (venceu(e)) return null;
    let melhor = null;
    const considerar = (prioridade, jogada) => {
      if (!melhor || prioridade > melhor.prioridade) melhor = { prioridade, ...jogada };
    };
    const monteVazio = !e.monte.length;

    e.colunas.forEach((coluna, c) => {
      const fechadas = e.fechadas[c];
      for (let p = fechadas; p < coluna.length; p++) {
        const id = coluna[p];
        const ids = cartasParaMover(e, id);
        if (!ids) continue;
        const abaixo = p > 0 ? coluna[p - 1] : null;
        const abaixoAberta = p - 1 >= fechadas;
        const revela = p === fechadas && fechadas > 0;
        const emSequencia = abaixoAberta && valor(abaixo) === valor(id) + 1;
        const noNaipe = emSequencia && naipe(abaixo, e.modo) === naipe(id, e.modo);
        for (let d = 0; d < COLUNAS; d++) {
          if (d === c || !aceitaNaColuna(e, ids, d)) continue;
          const destino = { tipo: "coluna", indice: d };
          if (completaNaipe(e, ids, d)) {
            considerar(100, { id, destino });
            continue;
          }
          if (noNaipe) continue;
          const vazio = !e.colunas[d].length;
          const mesmoNaipe = !vazio && naipe(topo(e.colunas[d]), e.modo) === naipe(id, e.modo);
          let prioridade = null;
          if (revela) prioridade = 80 + Math.min(fechadas, 9) + (mesmoNaipe ? 5 : 0) - (vazio ? 8 : 0);
          else if (p === 0) prioridade = monteVazio && !vazio ? (mesmoNaipe ? 55 : 45) : null;
          else if (!emSequencia) prioridade = 70 + (mesmoNaipe ? 5 : 0) - (vazio ? 8 : 0);
          else if (mesmoNaipe) prioridade = 60;
          if (prioridade !== null) considerar(prioridade, { id, destino });
        }
      }
    });

    if (melhor) {
      const { prioridade, ...jogada } = melhor;
      return jogada;
    }
    if (monteVazio) return null;
    if (podeDistribuir(e)) return { distribuir: true };

    // Uma coluna vazia impede a distribuição: a carta de cima de outra coluna vai para ela,
    // de preferência uma que não esteja sobre uma carta do mesmo naipe
    const vazia = e.colunas.findIndex((coluna) => !coluna.length);
    let escolhida = null;
    e.colunas.forEach((coluna, c) => {
      if (coluna.length < 2) return;
      const id = topo(coluna);
      const abaixo = coluna[coluna.length - 2];
      const presa = coluna.length - 2 >= e.fechadas[c] && valor(abaixo) === valor(id) + 1 && naipe(abaixo, e.modo) === naipe(id, e.modo);
      if (escolhida === null || (escolhida.presa && !presa)) escolhida = { id, presa };
    });
    return escolhida ? { id: escolhida.id, destino: { tipo: "coluna", indice: vazia } } : null;
  }

  // ---------- Salvar e restaurar ----------

  const inteiro = (v, min = 0) => Number.isInteger(v) && v >= min;

  /** Confere um estado salvo: todas as 104 cartas uma vez só, naipes completos em ordem e mesa válida. */
  function restaurar(salvo) {
    if (!salvo || typeof salvo !== "object" || !MODOS.includes(salvo.modo)) return null;
    if (!Array.isArray(salvo.colunas) || salvo.colunas.length !== COLUNAS) return null;
    if (!Array.isArray(salvo.fechadas) || salvo.fechadas.length !== COLUNAS) return null;
    if (!Array.isArray(salvo.completos) || salvo.completos.length > CONJUNTOS) return null;
    if (!Array.isArray(salvo.monte) || salvo.monte.length % POR_DISTRIBUICAO !== 0 || salvo.monte.length > 50) return null;
    const listas = [salvo.monte, ...salvo.colunas, ...salvo.completos];
    if (!listas.every((l) => Array.isArray(l) && l.every((id) => inteiro(id) && id < CARTAS))) return null;
    const todas = listas.flat();
    if (todas.length !== CARTAS || new Set(todas).size !== CARTAS) return null;
    const completoValido = (s) => s.length === 13 && valor(s[0]) === 13 && sequenciaDoNaipe(s, salvo.modo);
    if (!salvo.completos.every(completoValido)) return null;
    for (let c = 0; c < COLUNAS; c++) {
      const tamanho = salvo.colunas[c].length;
      const fechadas = salvo.fechadas[c];
      if (!inteiro(fechadas) || (tamanho ? fechadas >= tamanho : fechadas !== 0)) return null;
    }
    for (const campo of ["movimentos", "segundos"]) if (!inteiro(salvo[campo])) return null;
    if (!inteiro(salvo.semente, 1)) return null;
    return clonar({
      modo: salvo.modo,
      semente: salvo.semente,
      monte: salvo.monte,
      colunas: salvo.colunas,
      fechadas: salvo.fechadas,
      completos: salvo.completos,
      movimentos: salvo.movimentos,
      segundos: salvo.segundos,
      iniciado: salvo.iniciado === true,
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
    CARTAS,
    CONJUNTOS,
    POR_DISTRIBUICAO,
    PONTOS,
    conjunto,
    valor,
    naipe,
    vermelha,
    textoValor,
    nomeCarta,
    textoModo,
    aleatorioComSemente,
    novaSemente,
    novoJogo,
    pontuacao,
    localizar,
    sequenciaDoNaipe,
    cartasParaMover,
    aceitaNaColuna,
    podeMover,
    podeDistribuir,
    mover,
    distribuir,
    desfazer,
    melhorDestino,
    venceu,
    completaNaipe,
    dica,
    restaurar,
    estatisticasVazias,
    lerEstatisticas,
    registrarResultado,
    porcentagemVitorias,
    formatarTempo,
    formatarNumero,
  };
})();

if (typeof module === "object") module.exports = LogicaSpider;
