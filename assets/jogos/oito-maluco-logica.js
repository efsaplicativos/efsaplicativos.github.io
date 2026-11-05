"use strict";
/*
 * Oito Maluco: regras, jogadas do computador e estatísticas, sem nada de tela.
 *
 * Cartas de 0 a 51: naipe = id / 13 (0 espadas, 1 copas, 2 ouros, 3 paus) e valor = id % 13 + 1
 * (1 é o Ás, 11 o Valete, 12 a Dama e 13 o Rei).
 *
 * O modo é o número de jogadores: 2, 3 ou 4. O jogador 0 é você; os outros são o computador, na
 * ordem em que jogam (depois do último, volta a sua vez).
 *
 * Regras (o Oito Maluco clássico, com um baralho de 52 cartas e nenhuma carta especial além do 8):
 *   - cada jogador recebe 7 cartas com 2 jogadores e 5 com 3 ou 4; a carta de cima do monte abre o
 *     descarte e, se for um 8, volta para o meio do monte e vira-se outra;
 *   - na sua vez, jogue uma carta do mesmo naipe ou do mesmo valor da carta de cima do descarte;
 *   - o 8 serve sempre, e quem o joga escolhe o naipe seguinte (o próximo joga esse naipe ou outro 8);
 *   - sem carta que sirva (ou se preferir não jogar), compre do monte, uma carta por vez; depois de
 *     comprar, você pode jogar qualquer carta que sirva, inclusive a comprada, ou comprar outra;
 *   - quando o monte acaba, o descarte (menos a carta de cima) é embaralhado e vira o monte novo; se
 *     não há nada para comprar e nenhuma carta serve, você passa a vez;
 *   - quem fica sem cartas ganha a rodada e marca a soma das cartas que sobraram nas outras mãos:
 *     8 vale 50, Rei, Dama e Valete 10, Ás 1 e as outras o próprio número;
 *   - a partida acaba quando alguém chega a 100 pontos: esse é o vencedor. A cada rodada, quem
 *     começa passa para o jogador seguinte.
 * Não há como a mesa travar: sem nada para comprar, as outras 51 cartas estão nas mãos, e pelo menos
 * três 8 estão com alguém que pode jogá-los.
 *
 * Estado da partida (só números, listas e textos, para salvar em JSON):
 *   modo, semente: jogadores e número da partida (a mesma semente dá as mesmas distribuições);
 *   rodada: a rodada atual, de 1 em diante;
 *   maos: as cartas de cada jogador, na ordem em que chegaram;
 *   monte: cartas viradas para baixo, a última da lista é a de cima; descarte: a última é a de cima;
 *   naipe: o naipe da vez (o da carta de cima ou o que o 8 pediu);
 *   vez: quem joga agora; compradas: quantas cartas ele já comprou nesta vez;
 *   embaralhamentos: quantas vezes o descarte já virou monte nesta rodada;
 *   faltas: para cada jogador, os naipes em que todos o viram comprar (e que ele ainda não jogou);
 *   pontos: o total de cada jogador; rodadas: { vencedor, ganhos } de cada rodada já terminada;
 *   fase: "jogando", "fimRodada" ou "fimPartida"; vencedor: quem chegou a 100 (ou null);
 *   movimentos: jogadas feitas na rodada; iniciado: você já jogou (abandono conta nas estatísticas).
 */
const LogicaOitoMaluco = (() => {
  const NAIPES = [
    { id: "espadas", nome: "espadas", vermelho: false },
    { id: "copas", nome: "copas", vermelho: true },
    { id: "ouros", nome: "ouros", vermelho: true },
    { id: "paus", nome: "paus", vermelho: false },
  ];
  /** Ordem dos naipes na mão, alternando as cores. */
  const ORDEM_NAIPES = [0, 1, 3, 2];
  const VALORES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const NOMES_VALOR = ["Ás", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Valete", "Dama", "Rei"];
  /** Número de jogadores. */
  const MODOS = [2, 3, 4];
  const MODO_PADRAO = 3;
  const CARTAS = 52;
  const OITO = 8;
  const META = 100;
  const MAIOR_SEMENTE = 999999;
  /** Você e os jogadores do computador, na ordem em que jogam. */
  const NOMES = ["Você", "Ana", "Beto", "Lia"];
  const FASES = ["jogando", "fimRodada", "fimPartida"];
  /** Depois de refazer o monte tantas vezes na mesma rodada, o computador varia as jogadas. */
  const RODADA_LONGA = 3;

  const valor = (id) => (id % 13) + 1;
  const naipe = (id) => Math.floor(id / 13);
  const vermelha = (id) => NAIPES[naipe(id)].vermelho;
  const textoValor = (id) => VALORES[valor(id) - 1];
  const nomeCarta = (id) => `${NOMES_VALOR[valor(id) - 1]} de ${NAIPES[naipe(id)].nome}`;
  /** "o 7 de copas", "a Dama de ouros". */
  const comArtigo = (id) => `${valor(id) === 12 ? "a" : "o"} ${nomeCarta(id)}`;
  /** "um 9", "uma Dama", "um Ás". */
  const umValor = (v) => `${v === 12 ? "uma" : "um"} ${NOMES_VALOR[v - 1]}`;
  const nomeNaipe = (s) => NAIPES[s].nome;
  const topo = (lista) => (lista.length ? lista[lista.length - 1] : null);
  const textoModo = (modo) => `${modo} jogadores`;
  const nomeJogador = (j) => NOMES[j];
  const proximoJogador = (e, j = e.vez) => (j + 1) % e.modo;
  const cartasPorJogador = (modo) => (modo === 2 ? 7 : 5);

  /** 8 vale 50; Rei, Dama e Valete, 10; Ás, 1; as outras, o número. */
  function pontosDaCarta(id) {
    const v = valor(id);
    if (v === OITO) return 50;
    if (v > 10) return 10;
    return v;
  }
  const pontosDaMao = (mao) => mao.reduce((soma, id) => soma + pontosDaCarta(id), 0);

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

  /** Semente de cada embaralhada: a da partida, a rodada e quantas vezes o descarte já virou monte. */
  function misturar(...partes) {
    let h = 0x811c9dc5;
    for (const p of partes) {
      h = Math.imul(h ^ (p >>> 0), 0x01000193);
      h ^= h >>> 15;
    }
    return h >>> 0;
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

  const semFaltas = (modo) => Array.from({ length: modo }, () => [false, false, false, false]);

  const clonar = (e) => ({
    ...e,
    maos: e.maos.map((m) => m.slice()),
    monte: e.monte.slice(),
    descarte: e.descarte.slice(),
    faltas: e.faltas.map((f) => f.slice()),
    pontos: e.pontos.slice(),
    rodadas: e.rodadas.map((r) => ({ vencedor: r.vencedor, ganhos: r.ganhos.slice() })),
  });

  /** Vira a carta de cima do [monte] para abrir o descarte; um 8 volta para o meio do monte. Muda o [monte]. */
  function virarInicial(monte) {
    let inicio = monte.pop();
    while (valor(inicio) === OITO) {
      monte.splice(Math.floor(monte.length / 2), 0, inicio);
      inicio = monte.pop();
    }
    return inicio;
  }

  /**
   * Distribui a rodada [base.rodada]: as cartas saem uma a uma, a partir de quem começa, e a carta de
   * cima do monte abre o descarte (um 8 volta para o meio do monte).
   */
  function distribuir(base) {
    const { modo, semente, rodada } = base;
    const monte = embaralhar([...Array(CARTAS).keys()], aleatorioComSemente(misturar(semente, rodada, 0)));
    const primeiro = (rodada - 1) % modo;
    const maos = Array.from({ length: modo }, () => []);
    for (let k = 0; k < cartasPorJogador(modo); k++) {
      for (let j = 0; j < modo; j++) maos[(primeiro + j) % modo].push(monte.pop());
    }
    const inicio = virarInicial(monte);
    return {
      modo,
      semente,
      rodada,
      maos,
      monte,
      descarte: [inicio],
      naipe: naipe(inicio),
      vez: primeiro,
      compradas: 0,
      embaralhamentos: 0,
      faltas: semFaltas(modo),
      pontos: base.pontos ? base.pontos.slice() : Array(modo).fill(0),
      rodadas: base.rodadas ? base.rodadas.map((r) => ({ vencedor: r.vencedor, ganhos: r.ganhos.slice() })) : [],
      fase: "jogando",
      vencedor: null,
      movimentos: 0,
      iniciado: Boolean(base.iniciado),
    };
  }

  function novoJogo(modo, semente) {
    return distribuir({ modo: MODOS.includes(modo) ? modo : MODO_PADRAO, semente, rodada: 1 });
  }

  // ---------- Regras ----------

  const cartaDeCima = (e) => topo(e.descarte);
  /** Serve sobre o descarte: o 8 sempre; as outras, no naipe da vez ou no valor da carta de cima. */
  const serve = (e, id) => valor(id) === OITO || naipe(id) === e.naipe || valor(id) === valor(cartaDeCima(e));
  const cartasQueServem = (e, j = e.vez) => e.maos[j].filter((id) => serve(e, id));
  /** O 8 mudou o naipe: a carta de cima é um 8. */
  const naipePedido = (e) => valor(cartaDeCima(e)) === OITO;
  const podeComprar = (e) => e.fase === "jogando" && (e.monte.length > 0 || e.descarte.length > 1);
  const podePassar = (e) => e.fase === "jogando" && !podeComprar(e) && cartasQueServem(e).length === 0;
  /** O 8 que não é a última carta da mão pede um naipe. */
  const precisaNaipe = (e, id) => valor(id) === OITO && e.maos[e.vez].length > 1;
  const naipeValido = (s) => Number.isInteger(s) && s >= 0 && s < 4;

  function podeJogar(e, id) {
    return e.fase === "jogando" && e.maos[e.vez].includes(id) && serve(e, id);
  }

  /** Quem ficou sem cartas ganha a rodada e marca os pontos das outras mãos. */
  function encerrarRodada(n, vencedor) {
    const ganhos = Array(n.modo).fill(0);
    ganhos[vencedor] = n.maos.reduce((soma, mao, j) => (j === vencedor ? soma : soma + pontosDaMao(mao)), 0);
    n.pontos[vencedor] += ganhos[vencedor];
    n.rodadas.push({ vencedor, ganhos });
    n.compradas = 0;
    if (n.pontos[vencedor] >= META) {
      n.fase = "fimPartida";
      n.vencedor = vencedor;
    } else {
      n.fase = "fimRodada";
    }
    return n;
  }

  /** Joga [id] da mão de quem está na vez; um 8 que não é a última carta precisa do [naipeEscolhido]. */
  function jogar(e, id, naipeEscolhido) {
    if (!podeJogar(e, id)) return null;
    if (precisaNaipe(e, id) && !naipeValido(naipeEscolhido)) return null;
    const n = clonar(e);
    const j = n.vez;
    n.maos[j].splice(n.maos[j].indexOf(id), 1);
    n.descarte.push(id);
    if (valor(id) === OITO) {
      n.naipe = n.maos[j].length ? naipeEscolhido : naipe(id);
    } else {
      n.naipe = naipe(id);
      n.faltas[j][naipe(id)] = false;
    }
    n.movimentos += 1;
    if (j === 0) n.iniciado = true;
    if (!n.maos[j].length) return encerrarRodada(n, j);
    n.vez = proximoJogador(n);
    n.compradas = 0;
    return n;
  }

  /** Monte vazio: o descarte, menos a carta de cima, é embaralhado e vira o monte novo. */
  function reabastecer(e) {
    if (e.fase !== "jogando" || e.monte.length || e.descarte.length < 2) return null;
    const n = clonar(e);
    const cima = n.descarte.pop();
    n.embaralhamentos += 1;
    n.monte = embaralhar(n.descarte, aleatorioComSemente(misturar(n.semente, n.rodada, n.embaralhamentos)));
    n.descarte = [cima];
    return n;
  }

  /** Quem está na vez compra a carta de cima do monte (embaralhando o descarte, se o monte acabou). */
  function comprar(e) {
    if (!podeComprar(e)) return null;
    const n = e.monte.length ? clonar(e) : reabastecer(e);
    const j = n.vez;
    n.maos[j].push(n.monte.pop());
    // Todos viram: ele comprou quando o naipe da vez era este
    n.faltas[j][n.naipe] = true;
    n.compradas += 1;
    n.movimentos += 1;
    if (j === 0) n.iniciado = true;
    return n;
  }

  /** Sem carta que sirva e sem nada para comprar, a vez passa. */
  function passar(e) {
    if (!podePassar(e)) return null;
    const n = clonar(e);
    if (n.vez === 0) n.iniciado = true;
    n.vez = proximoJogador(n);
    n.compradas = 0;
    n.movimentos += 1;
    return n;
  }

  /** Distribui a rodada seguinte, mantendo os pontos. */
  function proximaRodada(e) {
    if (e.fase !== "fimRodada") return null;
    return distribuir({ ...e, rodada: e.rodada + 1 });
  }

  /** Jogada no formato { acao: "jogar", carta, naipe } | { acao: "comprar" } | { acao: "passar" }. */
  function aplicar(e, jogada) {
    if (!jogada) return null;
    if (jogada.acao === "jogar") return jogar(e, jogada.carta, jogada.naipe);
    if (jogada.acao === "comprar") return comprar(e);
    if (jogada.acao === "passar") return passar(e);
    return null;
  }

  /** Todas as jogadas possíveis agora (com os quatro naipes para cada 8 que pede naipe). */
  function jogadasPossiveis(e) {
    if (e.fase !== "jogando") return [];
    const lista = [];
    for (const id of cartasQueServem(e)) {
      if (precisaNaipe(e, id)) for (let s = 0; s < 4; s++) lista.push({ acao: "jogar", carta: id, naipe: s });
      else lista.push({ acao: "jogar", carta: id });
    }
    if (podeComprar(e)) lista.push({ acao: "comprar" });
    if (podePassar(e)) lista.push({ acao: "passar" });
    return lista;
  }

  /** Jogadores em ordem de pontos (empate: na ordem da mesa). */
  function classificacao(e) {
    return [...Array(e.modo).keys()].sort((a, b) => e.pontos[b] - e.pontos[a] || a - b);
  }

  // ---------- Computador ----------

  /**
   * O que o computador sabe: as próprias cartas, a mesa, quantas cartas cada um tem e os naipes em
   * que cada adversário foi visto comprando (provavelmente ele não tem esse naipe).
   */
  function contexto(e) {
    const j = e.vez;
    const mao = e.maos[j];
    const outros = [...Array(e.modo).keys()].filter((k) => k !== j);
    const proximo = proximoJogador(e);
    const menor = Math.min(...outros.map((k) => e.maos[k].length));
    const contagem = [0, 0, 0, 0];
    const soma = [0, 0, 0, 0];
    for (const id of mao) {
      if (valor(id) === OITO) continue;
      contagem[naipe(id)] += 1;
      soma[naipe(id)] += pontosDaCarta(id);
    }
    const faltaOutros = [0, 0, 0, 0];
    for (const k of outros) for (let s = 0; s < 4; s++) if (e.faltas[k][s]) faltaOutros[s] += 1;
    return {
      mao,
      contagem,
      soma,
      faltaProximo: e.faltas[proximo],
      faltaOutros,
      // Alguém perto de bater: hora de se livrar das cartas que valem mais
      ameaca: menor <= 2,
      urgente: menor <= 1,
      proximoAmeaca: e.maos[proximo].length <= 2,
    };
  }

  /** Quanto vale deixar [s] como naipe da vez, para quem fica com [contagem] cartas nele. */
  function notaDoNaipe(ctx, s, contagem) {
    let nota = contagem * 10;
    // Adversário que comprou nesse naipe provavelmente não tem nenhuma carta dele
    if (ctx.faltaProximo[s]) nota += ctx.proximoAmeaca ? 30 : 6;
    nota += ctx.faltaOutros[s] * 2;
    return nota;
  }

  /**
   * Rodada que já refez o monte muitas vezes pode estar presa num círculo (dois jogadores, cada um
   * sem o naipe do outro, passando os 8 de mão em mão): aí o computador deixa de escolher sempre a
   * melhor opção e varia entre as boas, para a rodada andar. Devolve a posição na lista ordenada.
   */
  function variacao(e, opcoes) {
    if (e.embaralhamentos < RODADA_LONGA || opcoes < 2) return 0;
    return misturar(e.semente, e.rodada, e.movimentos, e.vez) % Math.min(opcoes, 3);
  }

  /** Ordena [itens] pela nota, da maior para a menor (empate: a ordem original). */
  function ordenarPorNota(itens, nota) {
    return itens.map((item, i) => ({ item, i, n: nota(item) })).sort((a, b) => b.n - a.n || a.i - b.i).map((x) => x.item);
  }

  /** O naipe que o 8 deve pedir: o mais comprido da mão (sem contar o 8 jogado nem outros 8). */
  function melhorNaipe(e, oito, ctx = contexto(e)) {
    const ordem = ordenarPorNota(ORDEM_NAIPES, (s) => notaDoNaipe(ctx, s, ctx.contagem[s]) + ctx.soma[s] * 0.05);
    return ordem[variacao(e, 4)];
  }

  /**
   * A jogada do computador para quem está na vez (também é a dica para você). Ele joga a carta que
   * deixa como naipe da vez aquele em que tem mais cartas, de preferência um naipe que o próximo
   * jogador não tem; guarda os 8 para quando nada mais serve (e, sem ninguém perto de bater, ainda
   * tenta comprar uma carta antes de gastar o 8); e, quando um adversário está perto de bater, joga
   * primeiro as cartas que valem mais pontos, até o 8 se alguém está com a última carta.
   */
  function escolherJogada(e, { guardarOito = true } = {}) {
    if (e.fase !== "jogando") return null;
    const validas = cartasQueServem(e);
    if (!validas.length) return podeComprar(e) ? { acao: "comprar" } : { acao: "passar" };
    const ctx = contexto(e);
    const comuns = validas.filter((id) => valor(id) !== OITO);
    const oitos = validas.filter((id) => valor(id) === OITO);
    const peso = ctx.ameaca ? 2.5 : 0.4;
    const jogarOito = (id) => {
      const jogada = { acao: "jogar", carta: id };
      if (precisaNaipe(e, id)) jogada.naipe = melhorNaipe(e, id, ctx);
      return jogada;
    };
    // Alguém está com a última carta: o 8 (50 pontos) sai já, pedindo o naipe que atrapalha mais
    if (oitos.length && ctx.urgente && ctx.mao.length > 2) return jogarOito(oitos[0]);
    if (comuns.length) {
      const nota = (id) => notaDoNaipe(ctx, naipe(id), ctx.contagem[naipe(id)] - 1) + pontosDaCarta(id) * peso + pontosDaCarta(id) * 0.001;
      const ordem = ordenarPorNota(comuns, nota);
      return { acao: "jogar", carta: ordem[variacao(e, ordem.length)] };
    }
    // Só o 8 serve: sem pressa, compra uma carta antes de gastá-lo
    if (guardarOito && !ctx.ameaca && e.compradas === 0 && ctx.mao.length >= 3 && e.monte.length >= 4) return { acao: "comprar" };
    return jogarOito(oitos[0]);
  }

  // ---------- Salvar e restaurar ----------

  const inteiro = (v, min = 0) => Number.isInteger(v) && v >= min;
  const carta = (id) => inteiro(id) && id < CARTAS;
  const listaDeCartas = (l) => Array.isArray(l) && l.every(carta);

  /** Confere um estado salvo: 52 cartas uma vez só, vez e naipe válidos e pontos que batem com as rodadas. */
  function restaurar(salvo) {
    if (!salvo || typeof salvo !== "object" || !MODOS.includes(salvo.modo)) return null;
    const modo = salvo.modo;
    if (!inteiro(salvo.semente, 1) || !inteiro(salvo.rodada, 1) || !FASES.includes(salvo.fase)) return null;
    if (!Array.isArray(salvo.maos) || salvo.maos.length !== modo || !salvo.maos.every(listaDeCartas)) return null;
    if (!listaDeCartas(salvo.monte) || !listaDeCartas(salvo.descarte) || !salvo.descarte.length) return null;
    const todas = [...salvo.maos.flat(), ...salvo.monte, ...salvo.descarte];
    if (todas.length !== CARTAS || new Set(todas).size !== CARTAS) return null;
    if (!naipeValido(salvo.naipe) || !inteiro(salvo.vez) || salvo.vez >= modo) return null;
    for (const campo of ["compradas", "embaralhamentos", "movimentos"]) if (!inteiro(salvo[campo])) return null;
    const cima = topo(salvo.descarte);
    if (valor(cima) !== OITO && salvo.naipe !== naipe(cima)) return null;
    if (!Array.isArray(salvo.faltas) || salvo.faltas.length !== modo) return null;
    if (!salvo.faltas.every((f) => Array.isArray(f) && f.length === 4 && f.every((b) => typeof b === "boolean"))) return null;
    if (!Array.isArray(salvo.pontos) || salvo.pontos.length !== modo || !salvo.pontos.every((p) => inteiro(p))) return null;
    if (!Array.isArray(salvo.rodadas)) return null;
    const jogando = salvo.fase === "jogando";
    if (salvo.rodadas.length !== (jogando ? salvo.rodada - 1 : salvo.rodada)) return null;
    const somas = Array(modo).fill(0);
    for (const r of salvo.rodadas) {
      if (!r || !inteiro(r.vencedor) || r.vencedor >= modo || !Array.isArray(r.ganhos) || r.ganhos.length !== modo) return null;
      if (!r.ganhos.every((g, j) => inteiro(g) && (j === r.vencedor ? g > 0 : g === 0))) return null;
      r.ganhos.forEach((g, j) => (somas[j] += g));
    }
    if (somas.some((s, j) => s !== salvo.pontos[j])) return null;
    const maior = Math.max(...salvo.pontos);
    if (jogando) {
      if (salvo.maos.some((m) => !m.length) || maior >= META) return null;
      if (salvo.vencedor !== null && salvo.vencedor !== undefined) return null;
    } else {
      const ultima = salvo.rodadas[salvo.rodadas.length - 1];
      if (salvo.maos[ultima.vencedor].length) return null;
      if (salvo.fase === "fimRodada" && maior >= META) return null;
      if (salvo.fase === "fimPartida" && (salvo.vencedor !== ultima.vencedor || salvo.pontos[ultima.vencedor] < META)) return null;
    }
    return clonar({
      modo,
      semente: salvo.semente,
      rodada: salvo.rodada,
      maos: salvo.maos,
      monte: salvo.monte,
      descarte: salvo.descarte,
      naipe: salvo.naipe,
      vez: salvo.vez,
      compradas: salvo.compradas,
      embaralhamentos: salvo.embaralhamentos,
      faltas: salvo.faltas,
      pontos: salvo.pontos,
      rodadas: salvo.rodadas,
      fase: salvo.fase,
      vencedor: salvo.fase === "fimPartida" ? salvo.vencedor : null,
      movimentos: salvo.movimentos,
      iniciado: salvo.iniciado === true,
    });
  }

  // ---------- Estatísticas ----------

  const estatisticasVazias = () => ({
    jogadas: 0,
    vitorias: 0,
    rodadas: 0,
    sequencia: 0,
    melhorSequencia: 0,
  });

  function lerEstatisticas(salvas) {
    const limpo = estatisticasVazias();
    if (!salvas || typeof salvas !== "object") return limpo;
    for (const campo of Object.keys(limpo)) if (inteiro(salvas[campo])) limpo[campo] = salvas[campo];
    limpo.vitorias = Math.min(limpo.vitorias, limpo.jogadas);
    limpo.sequencia = Math.min(limpo.sequencia, limpo.vitorias);
    limpo.melhorSequencia = Math.max(limpo.melhorSequencia, limpo.sequencia);
    return limpo;
  }

  /** Soma uma partida terminada (ou abandonada, que conta como derrota). */
  function registrarResultado(estatisticas, { venceu }) {
    const e = { ...lerEstatisticas(estatisticas) };
    e.jogadas += 1;
    if (venceu) {
      e.vitorias += 1;
      e.sequencia += 1;
      e.melhorSequencia = Math.max(e.melhorSequencia, e.sequencia);
    } else {
      e.sequencia = 0;
    }
    return e;
  }

  /** Mais uma rodada vencida por você. */
  function registrarRodada(estatisticas) {
    const e = { ...lerEstatisticas(estatisticas) };
    e.rodadas += 1;
    return e;
  }

  const porcentagemVitorias = (e) => (e.jogadas ? Math.round((100 * e.vitorias) / e.jogadas) : 0);
  const formatarNumero = (n) => n.toLocaleString("pt-BR");

  return {
    NAIPES,
    ORDEM_NAIPES,
    MODOS,
    MODO_PADRAO,
    CARTAS,
    OITO,
    META,
    NOMES,
    valor,
    naipe,
    vermelha,
    textoValor,
    nomeCarta,
    comArtigo,
    umValor,
    nomeNaipe,
    textoModo,
    nomeJogador,
    proximoJogador,
    cartasPorJogador,
    pontosDaCarta,
    pontosDaMao,
    aleatorioComSemente,
    novaSemente,
    virarInicial,
    novoJogo,
    cartaDeCima,
    serve,
    cartasQueServem,
    naipePedido,
    podeJogar,
    precisaNaipe,
    podeComprar,
    podePassar,
    jogar,
    reabastecer,
    comprar,
    passar,
    proximaRodada,
    aplicar,
    jogadasPossiveis,
    classificacao,
    melhorNaipe,
    escolherJogada,
    restaurar,
    estatisticasVazias,
    lerEstatisticas,
    registrarResultado,
    registrarRodada,
    porcentagemVitorias,
    formatarNumero,
  };
})();

if (typeof module === "object") module.exports = LogicaOitoMaluco;
