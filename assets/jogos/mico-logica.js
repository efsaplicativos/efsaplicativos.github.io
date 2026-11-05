"use strict";
/*
 * Mico: regras, jogadas dos computadores e estatísticas, sem nada de tela.
 *
 * Cartas de 0 a 51, como nos outros jogos de cartas do site: naipe = id / 13 (0 espadas, 1 copas,
 * 2 ouros, 3 paus) e valor = id % 13 + 1 (1 é o Ás, 11 o Valete, 12 a Dama e 13 o Rei). O Mico com
 * baralho comum tira a Dama de paus (50): sobram 51 cartas, e a Dama de espadas (11) fica sem par.
 * Ela é o mico.
 *
 * Par: duas cartas do mesmo valor e da mesma cor (espadas com paus, copas com ouros). Cada carta tem
 * um só parceiro possível; o da Dama de espadas seria a Dama de paus, que saiu do baralho.
 *
 * Jogadores: 0 é você; os outros são os computadores, na ordem em que a vez passa (0, 1, 2...).
 * Quem está na vez tira uma carta, sem ver, da mão do próximo jogador que ainda tem cartas.
 *
 * Estado da partida (só números e listas, para salvar em JSON):
 *   modo: quantos jogadores (3, 4 ou 5).
 *   semente: o número da partida; a mesma semente dá a mesma distribuição e os mesmos nomes.
 *   maos: a mão de cada jogador, da esquerda para a direita. A sua fica sempre em ordem de valor,
 *     menos o mico, que fica onde você o colocou.
 *   mesa: os pares já baixados, na ordem; cada par ocupa duas posições seguidas.
 *   saidas: os jogadores que já ficaram sem cartas, na ordem em que saíram.
 *   vez: o jogador que tira a próxima carta (no fim, quem ficou com o mico).
 *   jogadas: quantas cartas já foram tiradas.
 *   iniciado: alguma carta já foi tirada.
 */
const LogicaMico = (() => {
  const NAIPES = [
    { id: "espadas", nome: "espadas", vermelho: false },
    { id: "copas", nome: "copas", vermelho: true },
    { id: "ouros", nome: "ouros", vermelho: true },
    { id: "paus", nome: "paus", vermelho: false },
  ];
  const VALORES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const NOMES_VALOR = ["Ás", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Valete", "Dama", "Rei"];
  /** Quantos jogadores: você e mais 2, 3 ou 4 computadores. */
  const MODOS = [3, 4, 5];
  const MODO_PADRAO = 4;
  /** A Dama de espadas, que fica sem par. */
  const MICO = 11;
  /** A Dama de paus, que sai do baralho antes de dar as cartas. */
  const RETIRADA = 50;
  const CARTAS = 51;
  const BARALHO = [...Array(52).keys()].filter((id) => id !== RETIRADA);
  const MAIOR_SEMENTE = 999999;
  /** Chance de um computador embaralhar a mão depois da própria vez. */
  const CHANCE_EMBARALHAR = 0.3;
  /** Nomes curtos dos computadores, com o artigo de cada um ("a vez do Beto", "a vez da Lia"). */
  const NOMES = [
    ["Beto", "o"],
    ["Lia", "a"],
    ["Caio", "o"],
    ["Nina", "a"],
    ["Téo", "o"],
    ["Bia", "a"],
    ["Zeca", "o"],
    ["Lulu", "a"],
    ["Juca", "o"],
    ["Mel", "a"],
    ["Dudu", "o"],
    ["Tati", "a"],
  ];

  const valor = (id) => (id % 13) + 1;
  const naipe = (id) => Math.floor(id / 13);
  const vermelha = (id) => NAIPES[naipe(id)].vermelho;
  const textoValor = (id) => VALORES[valor(id) - 1];
  const nomeCarta = (id) => `${NOMES_VALOR[valor(id) - 1]} de ${NAIPES[naipe(id)].nome}`;
  /** "a" para as Damas, "o" para as outras cartas: "o seu 7 de copas", "a sua Dama de ouros". */
  const artigoCarta = (id) => (valor(id) === 12 ? "a" : "o");
  const textoModo = (modo) => `${modo} jogadores`;
  const textoPosicao = (k) => `${k}º`;
  const noBaralho = (id) => Number.isInteger(id) && id >= 0 && id < 52 && id !== RETIRADA;

  /** O único parceiro possível de [id]: mesmo valor, o outro naipe da mesma cor. */
  const PAR_DO_NAIPE = [3, 2, 1, 0];
  const parceiro = (id) => PAR_DO_NAIPE[naipe(id)] * 13 + valor(id) - 1;
  const formaPar = (a, b) => a !== b && noBaralho(a) && noBaralho(b) && parceiro(a) === b;

  /** Ordem da sua mão: por valor, e no mesmo valor espadas, copas, paus e ouros (cores alternadas). */
  const ORDEM_NAIPE = [0, 1, 3, 2];
  const chaveOrdem = (id) => valor(id) * 4 + ORDEM_NAIPE[naipe(id)];

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

  /** Os jogadores da partida: você e os computadores, com nomes sorteados pela semente. */
  function jogadores(modo, semente) {
    const sorteio = aleatorioComSemente((semente * 7919 + 17) >>> 0);
    const nomes = embaralhar(NOMES, sorteio).slice(0, modo - 1);
    return [{ nome: "Você", artigo: "" }, ...nomes.map(([nome, artigo]) => ({ nome, artigo }))];
  }

  // ---------- A sua mão ----------

  /** Põe a sua mão em ordem de valor, deixando o mico no lugar em que está. */
  function ordenarMinha(mao) {
    const i = mao.indexOf(MICO);
    const outras = mao.filter((id) => id !== MICO).sort((a, b) => chaveOrdem(a) - chaveOrdem(b));
    if (i >= 0) outras.splice(Math.min(i, outras.length), 0, MICO);
    return outras;
  }

  /**
   * Uma carta nova na sua mão entra no lugar dela pela ordem de valor; o mico não sai do lugar (se
   * estava na ponta da direita, continua lá). O próprio mico, quando chega, entra pela ordem.
   */
  function inserirNaMinha(mao, id) {
    const i = mao.indexOf(MICO);
    const outras = mao.filter((c) => c !== MICO);
    const lugar = (lista, carta) => {
      const k = lista.findIndex((c) => chaveOrdem(c) > chaveOrdem(carta));
      return k < 0 ? lista.length : k;
    };
    if (id === MICO) {
      outras.splice(lugar(outras, MICO), 0, MICO);
      return outras;
    }
    outras.splice(lugar(outras, id), 0, id);
    if (i >= 0) outras.splice(i === mao.length - 1 ? outras.length : i, 0, MICO);
    return outras;
  }

  /** Um computador põe a carta que tirou num lugar qualquer da mão. */
  function inserirAoAcaso(mao, id, aleatorio) {
    const nova = mao.slice();
    nova.splice(Math.floor(aleatorio() * (mao.length + 1)), 0, id);
    return nova;
  }

  // ---------- Partida ----------

  const clonar = (e) => ({
    ...e,
    maos: e.maos.map((m) => m.slice()),
    mesa: e.mesa.slice(),
    saidas: e.saidas.slice(),
  });

  /**
   * Embaralha as 51 cartas e dá uma por vez, a começar por quem joga primeiro (sorteado pela
   * semente): os primeiros a receber podem ficar com uma carta a mais. Os pares ainda estão nas mãos.
   */
  function distribuir(modo, semente) {
    const n = MODOS.includes(modo) ? modo : MODO_PADRAO;
    const aleatorio = aleatorioComSemente(semente);
    const baralho = embaralhar(BARALHO, aleatorio);
    const primeiro = Math.floor(aleatorio() * n);
    const maos = Array.from({ length: n }, () => []);
    baralho.forEach((id, k) => maos[(primeiro + k) % n].push(id));
    maos[0] = ordenarMinha(maos[0]);
    return { modo: n, semente, maos, mesa: [], saidas: [], vez: primeiro, jogadas: 0, iniciado: false };
  }

  const ativos = (e) => e.maos.reduce((lista, mao, j) => (mao.length ? [...lista, j] : lista), []);
  const terminou = (e) => ativos(e).length <= 1;
  /** Quem ficou com o mico (só no fim da partida). */
  const perdedor = (e) => (terminou(e) ? ativos(e)[0] : null);
  const comMico = (e) => e.maos.findIndex((mao) => mao.includes(MICO));
  /** Em que lugar o jogador saiu (1, 2...), ou null se ainda tem cartas. */
  const colocacao = (e, j) => {
    const k = e.saidas.indexOf(j);
    return k < 0 ? null : k + 1;
  };

  /** O próximo jogador depois de [j] que ainda tem cartas (sem contar o próprio j). */
  function proximoAtivo(e, j) {
    for (let k = 1; k < e.modo; k++) {
      const c = (j + k) % e.modo;
      if (e.maos[c].length) return c;
    }
    return null;
  }
  /** De quem [j] tira cartas: o próximo jogador que ainda está na rodada. */
  const alvoDe = (e, j) => proximoAtivo(e, j);
  /** Quem tira cartas de [j]: o jogador anterior que ainda está na rodada. */
  function quemTiraDe(e, j) {
    for (let k = 1; k < e.modo; k++) {
      const c = (j - k + e.modo) % e.modo;
      if (e.maos[c].length) return c;
    }
    return null;
  }

  /** Quem ficou sem cartas sai da rodada, na ordem dada. */
  function registrarSaidas(e, ordem) {
    for (const j of ordem) if (!e.maos[j].length && !e.saidas.includes(j)) e.saidas.push(j);
  }

  /** Os pares de uma mão, na ordem em que aparecem; [fica] é o que sobra, na mesma ordem. */
  function separarPares(mao) {
    const fica = [];
    const pares = [];
    for (const id of mao) {
      const k = fica.findIndex((c) => formaPar(c, id));
      if (k >= 0) {
        pares.push([fica[k], id]);
        fica.splice(k, 1);
      } else {
        fica.push(id);
      }
    }
    return { fica, pares };
  }

  /**
   * Todos baixam os pares que receberam, a começar por quem joga primeiro. Quem ficar sem cartas já
   * sai. Devolve o novo estado e a lista dos pares ({ jogador, cartas }), na ordem em que desceram.
   */
  function descartarIniciais(e) {
    const n = clonar(e);
    const pares = [];
    const ordem = [...Array(n.modo).keys()].map((k) => (e.vez + k) % n.modo);
    for (const j of ordem) {
      const r = separarPares(n.maos[j]);
      n.maos[j] = r.fica;
      for (const cartas of r.pares) {
        n.mesa.push(...cartas);
        pares.push({ jogador: j, cartas });
      }
    }
    registrarSaidas(n, ordem);
    if (!n.maos[n.vez].length && !terminou(n)) n.vez = proximoAtivo(n, n.vez);
    if (terminou(n)) n.vez = perdedor(n);
    return { estado: n, pares };
  }

  /** Partida nova, já com os pares iniciais na mesa. */
  const novoJogo = (modo, semente) => descartarIniciais(distribuir(modo, semente)).estado;

  /**
   * Quem está na vez tira a carta da [posicao] na mão do próximo jogador. A carta entra na mão de
   * quem tirou (na sua, pela ordem; na de um computador, num lugar qualquer) e, se formar par, os
   * dois descem para a mesa. Quem ficar sem cartas sai: primeiro quem deu a carta, depois quem tirou.
   * Devolve { estado, intermediario (antes de o par descer), carta, de, quem, posicao, par, saidas }
   * ou null se a jogada não vale.
   */
  function tirar(e, posicao, aleatorio = Math.random) {
    if (terminou(e)) return null;
    const quem = e.vez;
    const de = alvoDe(e, quem);
    if (de === null || !Number.isInteger(posicao) || posicao < 0 || posicao >= e.maos[de].length) return null;
    const n = clonar(e);
    const [carta] = n.maos[de].splice(posicao, 1);
    n.maos[quem] = quem === 0 ? inserirNaMinha(n.maos[quem], carta) : inserirAoAcaso(n.maos[quem], carta, aleatorio);
    n.jogadas += 1;
    n.iniciado = true;
    const intermediario = clonar(n);
    let par = null;
    const parceira = n.maos[quem].find((c) => formaPar(c, carta));
    if (parceira !== undefined) {
      n.maos[quem] = n.maos[quem].filter((c) => c !== carta && c !== parceira);
      n.mesa.push(parceira, carta);
      par = [parceira, carta];
    }
    const antes = n.saidas.length;
    registrarSaidas(n, [de, quem]);
    n.vez = terminou(n) ? perdedor(n) : proximoAtivo(n, quem);
    return { estado: n, intermediario, carta, de, quem, posicao, par, saidas: n.saidas.slice(antes) };
  }

  /** O computador tira uma carta qualquer: o Mico é jogo de sorte. */
  function escolhaDoComputador(e, aleatorio = Math.random) {
    const de = alvoDe(e, e.vez);
    return de === null ? null : Math.floor(aleatorio() * e.maos[de].length);
  }

  /** Embaralha a mão de um computador (a sua só tem o mico para mudar de lugar). */
  function embaralharMao(e, j, aleatorio = Math.random) {
    if (j === 0) return embaralharMinha(e, aleatorio);
    const n = clonar(e);
    n.maos[j] = embaralhar(n.maos[j], aleatorio);
    return n;
  }

  /** Muda o mico de lugar na sua mão; as outras cartas continuam em ordem. */
  function moverMico(e, posicao) {
    const mao = e.maos[0];
    if (!mao.includes(MICO) || !Number.isInteger(posicao)) return null;
    const n = clonar(e);
    const outras = mao.filter((c) => c !== MICO);
    outras.splice(Math.max(0, Math.min(posicao, outras.length)), 0, MICO);
    n.maos[0] = outras;
    return n;
  }

  /** "Embaralhar minha mão": o mico vai para um lugar qualquer. */
  function embaralharMinha(e, aleatorio = Math.random) {
    if (!e.maos[0].includes(MICO)) return clonar(e);
    return moverMico(e, Math.floor(aleatorio() * e.maos[0].length));
  }

  /**
   * Uma vez inteira, com a carta sorteada (para as simulações e para terminar a partida depressa):
   * quem joga tira uma carta qualquer; se foi você que tirou, o computador de quem você tirou
   * embaralha a mão; um computador às vezes embaralha a própria mão depois da vez.
   */
  function jogadaAleatoria(e, aleatorio = Math.random) {
    const r = tirar(e, escolhaDoComputador(e, aleatorio), aleatorio);
    if (!r) return null;
    let n = r.estado;
    if (r.quem === 0 && n.maos[r.de].length > 1) n = embaralharMao(n, r.de, aleatorio);
    if (r.quem !== 0 && n.maos[r.quem].length > 1 && aleatorio() < CHANCE_EMBARALHAR) n = embaralharMao(n, r.quem, aleatorio);
    return { ...r, estado: n };
  }

  /** Joga ao acaso até a partida acabar (ou até [limite] vezes). */
  function jogarAteOFim(e, aleatorio = Math.random, limite = 100000) {
    let n = e;
    for (let k = 0; k < limite && !terminou(n); k++) n = jogadaAleatoria(n, aleatorio).estado;
    return n;
  }

  // ---------- Salvar e restaurar ----------

  const inteiro = (v, min = 0) => Number.isInteger(v) && v >= min;
  const temPar = (mao) => separarPares(mao).pares.length > 0;

  /**
   * Confere um estado salvo: as 51 cartas uma vez só, nenhum par esquecido numa mão, a mesa só com
   * pares, quem saiu sem cartas e a vez com quem ainda joga.
   */
  function restaurar(salvo) {
    if (!salvo || typeof salvo !== "object" || !MODOS.includes(salvo.modo) || !inteiro(salvo.semente, 1)) return null;
    const { modo } = salvo;
    if (!Array.isArray(salvo.maos) || salvo.maos.length !== modo) return null;
    if (!salvo.maos.every((mao) => Array.isArray(mao) && mao.every(noBaralho))) return null;
    if (!Array.isArray(salvo.mesa) || !salvo.mesa.every(noBaralho) || salvo.mesa.length % 2) return null;
    for (let k = 0; k < salvo.mesa.length; k += 2) if (!formaPar(salvo.mesa[k], salvo.mesa[k + 1])) return null;
    const todas = [...salvo.maos.flat(), ...salvo.mesa];
    if (todas.length !== CARTAS || new Set(todas).size !== CARTAS) return null;
    if (salvo.maos.some(temPar)) return null;
    if (!Array.isArray(salvo.saidas) || !salvo.saidas.every((j) => inteiro(j) && j < modo)) return null;
    if (new Set(salvo.saidas).size !== salvo.saidas.length) return null;
    for (let j = 0; j < modo; j++) if (!salvo.maos[j].length !== salvo.saidas.includes(j)) return null;
    if (!inteiro(salvo.vez) || salvo.vez >= modo || !salvo.maos[salvo.vez].length) return null;
    if (!inteiro(salvo.jogadas)) return null;
    const e = clonar({
      modo,
      semente: salvo.semente,
      maos: salvo.maos,
      mesa: salvo.mesa,
      saidas: salvo.saidas,
      vez: salvo.vez,
      jogadas: salvo.jogadas,
      iniciado: salvo.iniciado === true,
    });
    e.maos[0] = ordenarMinha(e.maos[0]);
    return e;
  }

  // ---------- Estatísticas ----------

  const estatisticasVazias = () => ({
    partidas: 0,
    escapou: 0,
    primeiro: 0,
    sequencia: 0,
    melhorSequencia: 0,
  });

  function lerEstatisticas(salvas) {
    const limpo = estatisticasVazias();
    if (!salvas || typeof salvas !== "object") return limpo;
    for (const campo of Object.keys(limpo)) if (inteiro(salvas[campo])) limpo[campo] = salvas[campo];
    limpo.escapou = Math.min(limpo.escapou, limpo.partidas);
    limpo.primeiro = Math.min(limpo.primeiro, limpo.escapou);
    limpo.sequencia = Math.min(limpo.sequencia, limpo.escapou);
    limpo.melhorSequencia = Math.min(Math.max(limpo.melhorSequencia, limpo.sequencia), limpo.escapou);
    return limpo;
  }

  /**
   * Soma uma partida: [escapou] diz se você saiu sem o mico, e [posicao] em que lugar saiu. Partida
   * abandonada conta como não terminada (sem escapar). Devolve as novas estatísticas e se a
   * sequência sem pegar o mico virou recorde.
   */
  function registrarResultado(estatisticas, { escapou, posicao = null }) {
    const e = { ...lerEstatisticas(estatisticas) };
    const recordes = { sequencia: false };
    e.partidas += 1;
    if (escapou) {
      e.escapou += 1;
      if (posicao === 1) e.primeiro += 1;
      e.sequencia += 1;
      if (e.sequencia > e.melhorSequencia) {
        recordes.sequencia = e.melhorSequencia > 0;
        e.melhorSequencia = e.sequencia;
      }
    } else {
      e.sequencia = 0;
    }
    return { estatisticas: e, recordes };
  }

  const porcentagemEscapou = (e) => (e.partidas ? Math.round((100 * e.escapou) / e.partidas) : 0);
  const formatarNumero = (n) => n.toLocaleString("pt-BR");

  return {
    NAIPES,
    MODOS,
    MODO_PADRAO,
    MICO,
    RETIRADA,
    CARTAS,
    BARALHO,
    CHANCE_EMBARALHAR,
    NOMES,
    valor,
    naipe,
    vermelha,
    textoValor,
    nomeCarta,
    artigoCarta,
    textoModo,
    textoPosicao,
    noBaralho,
    parceiro,
    formaPar,
    chaveOrdem,
    aleatorioComSemente,
    novaSemente,
    embaralhar,
    jogadores,
    ordenarMinha,
    inserirNaMinha,
    inserirAoAcaso,
    distribuir,
    separarPares,
    descartarIniciais,
    novoJogo,
    ativos,
    terminou,
    perdedor,
    comMico,
    colocacao,
    proximoAtivo,
    alvoDe,
    quemTiraDe,
    tirar,
    escolhaDoComputador,
    embaralharMao,
    moverMico,
    embaralharMinha,
    jogadaAleatoria,
    jogarAteOFim,
    restaurar,
    estatisticasVazias,
    lerEstatisticas,
    registrarResultado,
    porcentagemEscapou,
    formatarNumero,
  };
})();

if (typeof module === "object") module.exports = LogicaMico;
