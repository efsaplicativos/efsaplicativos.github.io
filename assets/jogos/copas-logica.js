"use strict";
/*
 * Copas (o jogo que em inglês se chama Hearts): regras, jogadas do computador, placar e
 * estatísticas, sem nada de tela.
 *
 * Cartas de 0 a 51: naipe = id / 13 (0 espadas, 1 copas, 2 ouros, 3 paus) e posto = id % 13 + 2
 * (de 2 a 10, 11 o Valete, 12 a Dama, 13 o Rei e 14 o Ás, a carta mais alta).
 *
 * Jogadores: 0 é você (embaixo), 1 fica à esquerda, 2 à frente e 3 à direita. A vez anda nessa
 * ordem, sempre para a esquerda de quem acabou de jogar.
 *
 * Estado da partida (só números, listas e textos curtos, para salvar em JSON):
 *   modo: 100 ou 50, os pontos que encerram a partida.
 *   semente: o número da partida; as cartas de cada rodada saem dele e do número da rodada.
 *   rodada: a rodada atual, a partir de 1.
 *   fase: "troca" (cada um escolhe 3 cartas para passar), "vaza" (jogando) ou "fim" (as 13 vazas
 *     já saíram e a rodada já entrou no placar).
 *   maos: as cartas na mão de cada jogador, em ordem de naipe e valor.
 *   recebidas: as 3 cartas que cada jogador recebeu na troca desta rodada ([] sem troca).
 *   vazas: as vazas já fechadas da rodada, cada uma { lider, cartas: [as 4, na ordem em que saíram] }.
 *   atual: a vaza em andamento, { lider: quem começou, cartas }.
 *   placar: uma linha por rodada terminada, { pontos: [4 números], lua: quem deu o tiro na lua ou null }.
 *   iniciado: alguém já passou ou jogou uma carta.
 *
 * Regras: 13 cartas para cada um. Antes de cada rodada, cada um passa 3 cartas: para a esquerda,
 * para a direita, para a frente e, na quarta rodada, ninguém troca; depois o ciclo recomeça.
 * Quem tem o 2 de paus abre a primeira vaza com ele. É obrigatório seguir o naipe da primeira
 * carta; quem não tem, joga qualquer outra. Ganha a vaza a carta mais alta do naipe que abriu, e
 * quem ganhou começa a próxima. Na primeira vaza não vale jogar copas nem a Dama de espadas, a
 * não ser que a mão não tenha mais nada. Ninguém começa uma vaza com copas antes de alguma copa
 * ser jogada ("quebrar copas"), a não ser que só tenha copas. Cada copa vale 1 ponto e a Dama de
 * espadas, 13. Quem leva os 26 pontos da rodada dá o tiro na lua: fica com 0 e cada adversário
 * recebe 26. A partida acaba quando alguém chega aos pontos do modo; ganha quem tiver menos. Se
 * houver empate no menor total, joga-se mais uma rodada.
 */
const LogicaCopas = (() => {
  const NAIPES = [
    { id: "espadas", nome: "espadas", vermelho: false },
    { id: "copas", nome: "copas", vermelho: true },
    { id: "ouros", nome: "ouros", vermelho: true },
    { id: "paus", nome: "paus", vermelho: false },
  ];
  const ESPADAS = 0;
  const COPAS = 1;
  const OUROS = 2;
  const PAUS = 3;
  const VALORES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const NOMES_VALOR = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "Valete", "Dama", "Rei", "Ás"];
  /** Pontos que encerram a partida. */
  const MODOS = [100, 50];
  const MODO_PADRAO = 100;
  const JOGADORES = 4;
  const CARTAS = 52;
  const POR_MAO = 13;
  const NA_TROCA = 3;
  const VAZAS = 13;
  const PONTOS_DA_RODADA = 26;
  const DOIS_DE_PAUS = PAUS * 13;
  const DAMA_DE_ESPADAS = ESPADAS * 13 + 10;
  const MAIOR_SEMENTE = 999999;
  const NOMES = ["Você", "Ana", "Beto", "Clara"];
  const LUGARES = ["embaixo", "à esquerda", "à frente", "à direita"];
  /** A troca de cada rodada, em ciclo: passo é quantos lugares para a esquerda as cartas andam. */
  const DIRECOES = [
    { id: "esquerda", texto: "para a esquerda", curto: "esquerda", passo: 1 },
    { id: "direita", texto: "para a direita", curto: "direita", passo: 3 },
    { id: "frente", texto: "para a frente", curto: "frente", passo: 2 },
    { id: "sem-troca", texto: "sem troca", curto: "sem troca", passo: 0 },
  ];
  /** Ordem dos naipes na mão, alternando as cores: paus, ouros, espadas e copas. */
  const ORDEM_NAIPES = [PAUS, OUROS, ESPADAS, COPAS];

  const naipe = (c) => Math.floor(c / 13);
  const posto = (c) => (c % 13) + 2;
  const vermelha = (c) => NAIPES[naipe(c)].vermelho;
  const textoValor = (c) => VALORES[c % 13];
  const nomeCarta = (c) => `${NOMES_VALOR[c % 13]} de ${NAIPES[naipe(c)].nome}`;
  /** "o 9 de ouros", "a Dama de espadas". */
  const oCarta = (c) => `${posto(c) === 12 ? "a" : "o"} ${nomeCarta(c)}`;
  /** "do 9 de ouros", "da Dama de espadas". */
  const daCarta = (c) => `${posto(c) === 12 ? "da" : "do"} ${nomeCarta(c)}`;
  const pontosDaCarta = (c) => (naipe(c) === COPAS ? 1 : c === DAMA_DE_ESPADAS ? 13 : 0);
  const somaPontos = (cartas) => cartas.reduce((soma, c) => soma + pontosDaCarta(c), 0);
  const chaveDeOrdem = (c) => ORDEM_NAIPES.indexOf(naipe(c)) * 13 + (c % 13);
  const ordenar = (cartas) => cartas.slice().sort((a, b) => chaveDeOrdem(a) - chaveDeOrdem(b));
  const textoModo = (modo) => `até ${modo} pontos`;
  const listar = (itens) => (itens.length < 2 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`);
  const soma = (lista) => lista.reduce((a, b) => a + b, 0);

  // ---------- Troca ----------

  const direcao = (rodada) => DIRECOES[(rodada - 1) % 4];
  const temTroca = (rodada) => direcao(rodada).passo !== 0;
  /** Para quem [jogador] passa as cartas nesta rodada. */
  const destinoDaTroca = (jogador, rodada) => (jogador + direcao(rodada).passo) % JOGADORES;
  /** De quem [jogador] recebe as cartas nesta rodada. */
  const origemDaTroca = (jogador, rodada) => (jogador + JOGADORES - direcao(rodada).passo) % JOGADORES;

  // ---------- Embaralhar ----------

  /** Gerador pseudoaleatório (mulberry32): a mesma semente dá sempre as mesmas cartas. */
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

  /** As mãos da rodada [rodada] da partida [semente], antes da troca. */
  function distribuir(semente, rodada) {
    const mistura = (Math.imul(semente, 0x9e3779b1) ^ Math.imul(rodada, 0x85ebca6b)) >>> 0;
    const baralho = embaralhar([...Array(CARTAS).keys()], aleatorioComSemente(mistura));
    return [0, 1, 2, 3].map((j) => ordenar(baralho.slice(j * POR_MAO, (j + 1) * POR_MAO)));
  }

  const quemTem = (maos, c) => maos.findIndex((mao) => mao.includes(c));
  const copiarPlacar = (placar) => placar.map((linha) => ({ pontos: linha.pontos.slice(), lua: linha.lua }));

  function comecarRodada(base, rodada) {
    const maos = distribuir(base.semente, rodada);
    return {
      modo: base.modo,
      semente: base.semente,
      rodada,
      fase: temTroca(rodada) ? "troca" : "vaza",
      maos,
      recebidas: [[], [], [], []],
      vazas: [],
      atual: { lider: quemTem(maos, DOIS_DE_PAUS), cartas: [] },
      placar: copiarPlacar(base.placar),
      iniciado: base.iniciado,
    };
  }

  function novoJogo(modo, semente) {
    return comecarRodada({ modo: MODOS.includes(modo) ? modo : MODO_PADRAO, semente, placar: [], iniciado: false }, 1);
  }

  const trocaValida = (mao, escolha) =>
    Array.isArray(escolha) && escolha.length === NA_TROCA && new Set(escolha).size === NA_TROCA && escolha.every((c) => mao.includes(c));

  /** Todos passam as 3 cartas de [escolhas] (uma lista por jogador) ao mesmo tempo. */
  function trocar(e, escolhas) {
    if (e.fase !== "troca" || !Array.isArray(escolhas) || escolhas.length !== JOGADORES) return null;
    if (!e.maos.every((mao, j) => trocaValida(mao, escolhas[j]))) return null;
    const maos = e.maos.map((mao, j) => mao.filter((c) => !escolhas[j].includes(c)));
    const recebidas = [[], [], [], []];
    escolhas.forEach((escolha, j) => {
      const destino = destinoDaTroca(j, e.rodada);
      maos[destino].push(...escolha);
      recebidas[destino] = ordenar(escolha);
    });
    const ordenadas = maos.map(ordenar);
    return { ...e, fase: "vaza", maos: ordenadas, recebidas, atual: { lider: quemTem(ordenadas, DOIS_DE_PAUS), cartas: [] }, iniciado: true };
  }

  // ---------- Jogadas ----------

  /** De quem é a vez, ou null fora da fase de jogar. */
  const vez = (e) => (e.fase === "vaza" ? (e.atual.lider + e.atual.cartas.length) % JOGADORES : null);
  const cartasJogadas = (e) => [...e.vazas.flatMap((v) => v.cartas), ...e.atual.cartas];
  const copasQuebradas = (e) => cartasJogadas(e).some((c) => naipe(c) === COPAS);
  const primeiraVaza = (e) => e.vazas.length === 0;

  /** As cartas de [mao] que podem ser jogadas sobre [cartas] (a vaza em andamento). */
  function legaisDaMao(mao, cartas, primeira, quebradas) {
    if (!mao.length) return [];
    if (!cartas.length) {
      if (primeira) return mao.includes(DOIS_DE_PAUS) ? [DOIS_DE_PAUS] : [];
      if (quebradas) return mao.slice();
      const semCopas = mao.filter((c) => naipe(c) !== COPAS);
      return semCopas.length ? semCopas : mao.slice();
    }
    const doNaipe = mao.filter((c) => naipe(c) === naipe(cartas[0]));
    if (doNaipe.length) return doNaipe;
    if (primeira) {
      const semPontos = mao.filter((c) => pontosDaCarta(c) === 0);
      if (semPontos.length) return semPontos;
    }
    return mao.slice();
  }

  function jogadasLegais(e) {
    const j = vez(e);
    if (j === null) return [];
    return legaisDaMao(e.maos[j], e.atual.cartas, primeiraVaza(e), copasQuebradas(e));
  }

  const podeJogar = (e, c) => jogadasLegais(e).includes(c);

  /** Por que [c] não pode ser jogada agora por quem tem a vez (frase para você), ou null se pode. */
  function motivoIlegal(e, c) {
    if (e.fase === "troca") return "Primeiro escolha as 3 cartas da troca.";
    if (e.fase !== "vaza") return "A rodada já terminou.";
    const mao = e.maos[vez(e)];
    if (!mao.includes(c)) return "Essa carta não está na sua mão.";
    if (podeJogar(e, c)) return null;
    const { cartas } = e.atual;
    if (!cartas.length) {
      if (primeiraVaza(e)) return "A primeira vaza começa com o 2 de paus.";
      return "As copas ainda não foram quebradas: comece a vaza com outro naipe.";
    }
    const pedido = naipe(cartas[0]);
    if (naipe(c) !== pedido && mao.some((x) => naipe(x) === pedido)) return `Você precisa seguir o naipe de ${NAIPES[pedido].nome}.`;
    return c === DAMA_DE_ESPADAS ? "Na primeira vaza não vale jogar a Dama de espadas." : "Na primeira vaza não vale jogar copas.";
  }

  /** Quem ganha a vaza: a carta mais alta do naipe que a abriu. */
  function vencedorDaVaza(lider, cartas) {
    const pedido = naipe(cartas[0]);
    let melhor = 0;
    for (let i = 1; i < cartas.length; i++) {
      if (naipe(cartas[i]) === pedido && posto(cartas[i]) > posto(cartas[melhor])) melhor = i;
    }
    return (lider + melhor) % JOGADORES;
  }

  /** Pontos que cada um levou nas vazas [vazas], sem contar o tiro na lua. */
  function pontosDasVazas(vazas) {
    const pontos = [0, 0, 0, 0];
    for (const v of vazas) pontos[vencedorDaVaza(v.lider, v.cartas)] += somaPontos(v.cartas);
    return pontos;
  }
  const pontosNaRodada = (e) => pontosDasVazas(e.vazas);

  /** A linha do placar de uma rodada completa: quem levou os 26 pontos fica com 0 e os outros recebem 26. */
  function resultadoDaRodada(vazas) {
    const pontos = pontosDasVazas(vazas);
    const lua = pontos.indexOf(PONTOS_DA_RODADA);
    if (lua >= 0) return { pontos: pontos.map((_, j) => (j === lua ? 0 : PONTOS_DA_RODADA)), lua };
    return { pontos, lua: null };
  }

  /** Quem tem a vez joga a carta [c]; a quarta carta fecha a vaza, e a 13ª vaza fecha a rodada. */
  function jogar(e, c) {
    if (!podeJogar(e, c)) return null;
    const j = vez(e);
    const maos = e.maos.map((mao, k) => (k === j ? mao.filter((x) => x !== c) : mao));
    const cartas = [...e.atual.cartas, c];
    if (cartas.length < JOGADORES) return { ...e, maos, atual: { lider: e.atual.lider, cartas }, iniciado: true };
    const vazas = [...e.vazas, { lider: e.atual.lider, cartas }];
    const n = { ...e, maos, vazas, atual: { lider: vencedorDaVaza(e.atual.lider, cartas), cartas: [] }, iniciado: true };
    if (vazas.length < VAZAS) return n;
    return { ...n, fase: "fim", placar: [...copiarPlacar(e.placar), resultadoDaRodada(vazas)] };
  }

  const ultimaVaza = (e) => {
    if (!e.vazas.length) return null;
    const v = e.vazas[e.vazas.length - 1];
    return { lider: v.lider, cartas: v.cartas.slice(), vencedor: vencedorDaVaza(v.lider, v.cartas), pontos: somaPontos(v.cartas) };
  };

  // ---------- Placar ----------

  const totaisDoPlacar = (placar) => [0, 1, 2, 3].map((j) => soma(placar.map((linha) => linha.pontos[j])));
  const totais = (e) => totaisDoPlacar(e.placar);

  /** O placar encerra a partida: alguém chegou aos pontos do modo e o menor total não está empatado. */
  function encerraPartida(placar, modo) {
    const t = totaisDoPlacar(placar);
    if (Math.max(...t) < modo) return false;
    const menor = Math.min(...t);
    return t.filter((x) => x === menor).length === 1;
  }

  const terminou = (e) => e.fase === "fim" && encerraPartida(e.placar, e.modo);
  const vencedor = (e) => {
    if (!terminou(e)) return null;
    const t = totais(e);
    return t.indexOf(Math.min(...t));
  };

  /** Os quatro em ordem de pontos (menos é melhor), com a colocação; empates dividem o lugar. */
  function classificacao(e) {
    const t = totais(e);
    const ordem = [0, 1, 2, 3].sort((a, b) => t[a] - t[b] || a - b);
    return ordem.map((jogador) => ({ jogador, total: t[jogador], posicao: 1 + t.filter((x) => x < t[jogador]).length }));
  }

  /** A próxima rodada, depois de uma rodada que não encerrou a partida. */
  const proximaRodada = (e) => (e.fase === "fim" && !terminou(e) ? comecarRodada(e, e.rodada + 1) : null);

  // ---------- Computador: o que dá para saber ----------

  /**
   * O que qualquer jogador sabe olhando a mesa: as cartas já jogadas, o que cada um levou, quem
   * já mostrou que não tem um naipe (não seguiu quando ele saiu) e quantas vezes cada naipe abriu
   * uma vaza. Nada disso olha as mãos dos outros.
   */
  function analisar(e) {
    const jogadas = new Set();
    const ganhas = [[], [], [], []];
    const pontos = [0, 0, 0, 0];
    const vazios = [0, 1, 2, 3].map(() => [false, false, false, false]);
    const saidas = [0, 0, 0, 0];
    const anotar = (lider, cartas) => {
      const pedido = naipe(cartas[0]);
      cartas.forEach((c, i) => {
        jogadas.add(c);
        if (naipe(c) !== pedido) vazios[(lider + i) % JOGADORES][pedido] = true;
      });
    };
    for (const v of e.vazas) {
      anotar(v.lider, v.cartas);
      saidas[naipe(v.cartas[0])] += 1;
      const w = vencedorDaVaza(v.lider, v.cartas);
      ganhas[w].push(...v.cartas);
      pontos[w] += somaPontos(v.cartas);
    }
    if (e.atual.cartas.length) anotar(e.atual.lider, e.atual.cartas);
    return { jogadas, ganhas, pontos, vazios, saidas };
  }

  /**
   * Um adversário de [j] levou todos os pontos até agora, com muitas copas: ele pode estar tentando
   * o tiro na lua. Devolve quem é, ou null.
   */
  function ameacaDeLua(info, j) {
    const comPontos = [0, 1, 2, 3].filter((k) => info.pontos[k] > 0);
    if (comPontos.length !== 1 || comPontos[0] === j) return null;
    const k = comPontos[0];
    const copas = info.ganhas[k].filter((c) => naipe(c) === COPAS).length;
    const temDama = info.ganhas[k].includes(DAMA_DE_ESPADAS);
    return copas >= 6 || (temDama && copas >= 3) ? k : null;
  }

  const maior = (lista) => lista.reduce((a, b) => (posto(b) > posto(a) || (posto(b) === posto(a) && b < a) ? b : a));
  const menor = (lista) => lista.reduce((a, b) => (posto(b) < posto(a) || (posto(b) === posto(a) && b < a) ? b : a));

  function contexto(e) {
    const j = vez(e);
    const mao = e.maos[j];
    const naMao = new Set(mao);
    const info = analisar(e);
    // Cartas que ainda estão com os outros: nem jogadas nem na própria mão
    const fora = (c) => !info.jogadas.has(c) && !naMao.has(c);
    const doNaipe = (n) => [...Array(13).keys()].map((k) => n * 13 + k);
    const foraNoNaipe = (n) => doNaipe(n).filter(fora).length;
    const maioresFora = (c) => doNaipe(naipe(c)).filter((x) => x > c && fora(x)).length;
    const naMaoNoNaipe = (n) => mao.filter((c) => naipe(c) === n).length;
    const { cartas, lider } = e.atual;
    let iVencedora = 0;
    if (cartas.length) {
      const w = vencedorDaVaza(lider, cartas);
      iVencedora = (w - lider + JOGADORES) % JOGADORES;
    }
    return {
      e,
      j,
      mao,
      info,
      legais: jogadasLegais(e),
      cartas,
      lider,
      fora,
      foraNoNaipe,
      maioresFora,
      naMaoNoNaipe,
      damaFora: fora(DAMA_DE_ESPADAS),
      lua: ameacaDeLua(info, j),
      vencedora: cartas.length ? cartas[iVencedora] : null,
      quemGanha: cartas.length ? (lider + iVencedora) % JOGADORES : null,
      jaJogaram: cartas.map((_, i) => (lider + i) % JOGADORES),
    };
  }

  // ---------- Computador: jogadas ----------

  /** Abrir a vaza. */
  function decidirSaida(x) {
    const { legais, mao, info, lua, damaFora, j } = x;
    if (lua !== null) {
      const copasCertas = legais.filter((c) => naipe(c) === COPAS && x.maioresFora(c) === 0);
      if (copasCertas.length) {
        return { carta: maior(copasCertas), motivo: `${NOMES[lua]} levou todos os pontos até agora e pode dar o tiro na lua: saia com uma copa que ganha a vaza` };
      }
      const certas = legais.filter((c) => c !== DAMA_DE_ESPADAS && x.maioresFora(c) === 0 && x.foraNoNaipe(naipe(c)) > 0);
      if (certas.length) {
        return { carta: maior(certas), motivo: `${NOMES[lua]} pode dar o tiro na lua: fique com a vez para depois ganhar uma vaza com copas` };
      }
    }
    // Sem a Dama e só com espadas menores que ela: puxar espadas obriga quem tem a Dama a jogá-la
    const espadasLegais = legais.filter((c) => naipe(c) === ESPADAS);
    if (damaFora && espadasLegais.length && mao.filter((c) => naipe(c) === ESPADAS).every((c) => posto(c) < 12)) {
      return { carta: menor(espadasLegais), motivo: "suas espadas são todas menores que a Dama: puxe espadas para forçar quem tem a Dama de espadas a jogá-la" };
    }
    let melhor = null;
    for (const c of legais) {
      const n = naipe(c);
      const foraNoNaipe = x.foraNoNaipe(n);
      const maiores = x.maioresFora(c);
      const vaziosDepois = [1, 2, 3].filter((d) => info.vazios[(j + d) % JOGADORES][n]).length;
      let risco = posto(c);
      if (foraNoNaipe === 0) risco += 40;
      else if (maiores === 0) risco += 25;
      else risco -= Math.min(maiores, 3);
      risco += vaziosDepois * (maiores <= 1 ? 8 : 2);
      if (n === COPAS) risco += 3;
      if (n === ESPADAS && damaFora && posto(c) > 12) risco += 30;
      // As espadas baixas protegem o Rei e o Ás de espadas enquanto a Dama está fora
      else if (n === ESPADAS && damaFora && mao.some((x) => naipe(x) === ESPADAS && posto(x) > 12)) risco += 6;
      if (n === ESPADAS && mao.includes(DAMA_DE_ESPADAS)) risco += c === DAMA_DE_ESPADAS ? 60 : 12;
      if (n !== COPAS && x.naMaoNoNaipe(n) <= 2) risco -= 2;
      if (!melhor || risco < melhor.risco || (risco === melhor.risco && c < melhor.carta)) melhor = { carta: c, risco, maiores };
    }
    const curto = naipe(melhor.carta) !== COPAS && x.naMaoNoNaipe(naipe(melhor.carta)) <= 2;
    const motivo =
      melhor.maiores === 0
        ? "todas as saídas têm risco, e esta é a menos perigosa"
        : curto
          ? "saia com uma carta baixa: ela dificilmente ganha a vaza e ajuda você a ficar sem esse naipe"
          : "saia com uma carta baixa num naipe seguro: ela dificilmente ganha a vaza";
    return { carta: melhor.carta, motivo };
  }

  /** Seguir o naipe que abriu a vaza. */
  function decidirSeguindo(x) {
    const { e, legais, cartas, lua, damaFora, info, vencedora, quemGanha, j } = x;
    const pedido = naipe(cartas[0]);
    const pontos = somaPontos(cartas);
    const ultimo = cartas.length === JOGADORES - 1;
    const abaixo = legais.filter((c) => posto(c) < posto(vencedora));
    const acima = legais.filter((c) => posto(c) > posto(vencedora));
    if (lua !== null && pontos > 0 && acima.length && (quemGanha === lua || !x.jaJogaram.includes(lua))) {
      return { carta: maior(acima), motivo: `${NOMES[lua]} levou todos os pontos até agora: ganhe esta vaza para impedir o tiro na lua` };
    }
    if (primeiraVaza(e) && pontos === 0) {
      return { carta: maior(legais), motivo: "na primeira vaza ninguém pode descartar pontos: é a hora de gastar a carta mais alta do naipe" };
    }
    if (pedido === ESPADAS && legais.includes(DAMA_DE_ESPADAS) && posto(vencedora) > 12) {
      return { carta: DAMA_DE_ESPADAS, motivo: `${oCarta(vencedora)} está ganhando a vaza: jogue a Dama de espadas embaixo dele` };
    }
    const semDama = legais.filter((c) => c !== DAMA_DE_ESPADAS);
    if (ultimo) {
      if (pontos === 0 && semDama.length) {
        return { carta: maior(semDama), motivo: "a vaza não tem pontos e você é o último a jogar: aproveite para gastar uma carta alta" };
      }
      if (abaixo.length) return { carta: maior(abaixo), motivo: `fica abaixo ${daCarta(vencedora)}, que está ganhando a vaza` };
      return { carta: maior(semDama.length ? semDama : legais), motivo: "você vai ganhar esta vaza de qualquer jeito: use a carta mais alta" };
    }
    if (abaixo.length) return { carta: maior(abaixo), motivo: `fica abaixo ${daCarta(vencedora)}, que está ganhando a vaza` };
    // Não dá para ficar abaixo: evitar a Dama e, com ela ainda fora, o Rei e o Ás de espadas
    let opcoes = acima.filter((c) => c !== DAMA_DE_ESPADAS);
    if (pedido === ESPADAS && damaFora) {
      const seguras = opcoes.filter((c) => posto(c) < 12);
      if (seguras.length) opcoes = seguras;
    }
    if (!opcoes.length) opcoes = acima;
    const faltam = [];
    for (let d = 1; d < JOGADORES - cartas.length; d++) faltam.push((j + d) % JOGADORES);
    const alguemSemNaipe = faltam.some((k) => info.vazios[k][pedido]);
    if (pontos === 0 && !alguemSemNaipe && info.saidas[pedido] === 0 && pedido !== COPAS) {
      return { carta: maior(opcoes), motivo: "é a primeira vez que esse naipe sai e a vaza ainda não tem pontos: gaste uma carta alta" };
    }
    return { carta: menor(opcoes), motivo: `não dá para ficar abaixo ${daCarta(vencedora)}: jogue a menor carta, para que alguém ainda possa passar por cima` };
  }

  /** Sem o naipe pedido: descartar. */
  function decidirDescarte(x) {
    const { legais, lua, damaFora, quemGanha } = x;
    if (lua !== null) {
      const comPontos = legais.filter((c) => pontosDaCarta(c) > 0);
      if (quemGanha !== lua && x.jaJogaram.includes(lua) && comPontos.length) {
        const carta = comPontos.includes(DAMA_DE_ESPADAS) ? DAMA_DE_ESPADAS : maior(comPontos);
        return { carta, motivo: `${NOMES[quemGanha]} está ganhando a vaza: dê os pontos para quem não pode dar o tiro na lua` };
      }
      const semPontos = legais.filter((c) => pontosDaCarta(c) === 0);
      if (semPontos.length) {
        return { carta: maior(semPontos), motivo: `guarde suas copas: ${NOMES[lua]} levou todos os pontos até agora e pode estar tentando o tiro na lua` };
      }
    }
    let melhor = null;
    for (const c of legais) {
      const n = naipe(c);
      const p = posto(c);
      let nota;
      if (c === DAMA_DE_ESPADAS) nota = 1000;
      else if (n === ESPADAS && p > 12 && damaFora) nota = 500 + p;
      else if (n === COPAS) nota = p >= 10 ? 200 + p : 20 + p;
      else {
        nota = 2 * p;
        if (x.maioresFora(c) === 0 && x.foraNoNaipe(n) > 0) nota += 6;
        if (x.naMaoNoNaipe(n) <= 2) nota += 4;
      }
      if (!melhor || nota > melhor.nota || (nota === melhor.nota && c < melhor.carta)) melhor = { carta: c, nota };
    }
    const c = melhor.carta;
    let motivo;
    if (c === DAMA_DE_ESPADAS) motivo = "você não tem o naipe pedido: descarte a Dama de espadas, que vai para quem ganhar a vaza";
    else if (naipe(c) === ESPADAS && posto(c) > 12 && damaFora) motivo = `sem o naipe pedido, livre-se ${daCarta(c)} enquanto a Dama de espadas não saiu`;
    else if (naipe(c) === COPAS) motivo = "sem o naipe pedido, descarte copas: os pontos ficam com quem ganhar a vaza";
    else motivo = `sem o naipe pedido, livre-se ${daCarta(c)}, que poderia ganhar uma vaza mais tarde`;
    return { carta: c, motivo };
  }

  /**
   * A jogada do computador para quem tem a vez, com o motivo (a frase da dica): { carta, motivo }.
   * Fica abaixo da carta que está ganhando sempre que pode, descarta a Dama de espadas e as copas
   * altas quando não tem o naipe, sai com cartas baixas nos naipes seguros, puxa espadas para a
   * Dama sair quando só tem espadas baixas e tenta impedir o tiro na lua de um adversário.
   */
  function decidirJogada(e) {
    const legais = jogadasLegais(e);
    if (!legais.length) return null;
    if (legais.length === 1) {
      const motivo = legais[0] === DOIS_DE_PAUS && primeiraVaza(e) && !e.atual.cartas.length ? "quem tem o 2 de paus abre a primeira vaza com ele" : "é a única carta que pode ser jogada agora";
      return { carta: legais[0], motivo };
    }
    const x = contexto(e);
    if (!x.cartas.length) return decidirSaida(x);
    if (x.naMaoNoNaipe(naipe(x.cartas[0])) > 0) return decidirSeguindo(x);
    return decidirDescarte(x);
  }

  const escolherJogada = (e) => {
    const d = decidirJogada(e);
    return d ? d.carta : null;
  };

  // ---------- Computador: troca ----------

  /** Quanto vale passar [c] adiante, olhando o que ainda fica em [resto] e quantas [vagas] faltam. */
  function notaDeTroca(c, resto, vagas) {
    const n = naipe(c);
    const p = posto(c);
    const espadasBaixas = resto.filter((x) => naipe(x) === ESPADAS && posto(x) < 12).length;
    if (c === DAMA_DE_ESPADAS) return espadasBaixas >= 3 ? p : 100;
    if (n === ESPADAS && p > 12) {
      // Guardando a Dama bem protegida, o Rei e o Ás de espadas não correm o risco de ganhá-la
      if (resto.includes(DAMA_DE_ESPADAS) && espadasBaixas >= 3) return p;
      return espadasBaixas >= 3 ? 20 + p : 80 + p;
    }
    if (n === COPAS) return p >= 10 ? 40 + p : p - 4;
    if (n === ESPADAS) return p - 6;
    let nota = p;
    const qtd = resto.filter((x) => naipe(x) === n).length;
    if (qtd <= vagas) nota += 30;
    if (c === DOIS_DE_PAUS) nota -= 6;
    return nota;
  }

  /**
   * As 3 cartas que o computador passa: a Dama de espadas (e o Rei e o Ás de espadas) quando há
   * poucas espadas baixas para protegê-la, as copas altas e as cartas de um naipe curto, para
   * ficar sem ele; depois, as cartas mais altas.
   */
  function escolherTroca(mao) {
    const resto = mao.slice();
    const escolhidas = [];
    for (let k = 0; k < NA_TROCA; k++) {
      let melhor = null;
      let nota = -Infinity;
      for (const c of resto) {
        const v = notaDeTroca(c, resto, NA_TROCA - k);
        if (v > nota || (v === nota && c < melhor)) {
          nota = v;
          melhor = c;
        }
      }
      escolhidas.push(melhor);
      resto.splice(resto.indexOf(melhor), 1);
    }
    return ordenar(escolhidas);
  }

  /** A frase da dica para a troca. */
  function explicarTroca(mao, escolhidas) {
    const motivos = [];
    const resto = mao.filter((c) => !escolhidas.includes(c));
    if (escolhidas.includes(DAMA_DE_ESPADAS)) motivos.push("a Dama de espadas tem poucas espadas baixas para protegê-la");
    if (escolhidas.some((c) => naipe(c) === ESPADAS && posto(c) > 12)) motivos.push("espadas altas podem acabar ganhando a Dama");
    if (escolhidas.some((c) => naipe(c) === COPAS)) motivos.push("copas altas costumam ganhar vazas cheias de pontos");
    for (const n of [PAUS, OUROS]) {
      if (mao.some((c) => naipe(c) === n) && !resto.some((c) => naipe(c) === n)) motivos.push(`sem ${NAIPES[n].nome}, você poderá descartar pontos quando esse naipe sair`);
    }
    if (!motivos.length) motivos.push("são as cartas mais altas e perigosas da sua mão");
    return motivos.slice(0, 2).join("; ");
  }

  // ---------- Salvar e restaurar ----------

  const inteiro = (v, min = 0) => Number.isInteger(v) && v >= min;
  const eCarta = (c) => inteiro(c) && c < CARTAS;
  const eJogador = (j) => inteiro(j) && j < JOGADORES;
  const listaDeCartas = (lista, maximo) => Array.isArray(lista) && lista.length <= maximo && lista.every(eCarta);

  function linhaValida(linha) {
    if (!linha || typeof linha !== "object" || !Array.isArray(linha.pontos) || linha.pontos.length !== JOGADORES) return false;
    if (!linha.pontos.every((p) => inteiro(p) && p <= PONTOS_DA_RODADA)) return false;
    if (linha.lua === null) return soma(linha.pontos) === PONTOS_DA_RODADA && !linha.pontos.includes(PONTOS_DA_RODADA);
    return eJogador(linha.lua) && linha.pontos.every((p, k) => p === (k === linha.lua ? 0 : PONTOS_DA_RODADA));
  }

  const mesmasCartas = (a, b) => a.length === b.length && ordenar(a).every((c, i) => c === ordenar(b)[i]);

  /**
   * Confere um estado salvo e o reconstrói: as mãos antes da troca têm de ser as da semente, as
   * trocas têm de bater e cada carta jogada tem de ter sido uma jogada válida na sua vez.
   */
  function restaurar(salvo) {
    const s = salvo;
    if (!s || typeof s !== "object" || !MODOS.includes(s.modo) || !inteiro(s.semente, 1) || s.semente > MAIOR_SEMENTE) return null;
    if (!inteiro(s.rodada, 1) || s.rodada > 500 || !["troca", "vaza", "fim"].includes(s.fase)) return null;
    if (!Array.isArray(s.placar) || !s.placar.every(linhaValida)) return null;
    if (s.placar.length !== s.rodada - (s.fase === "fim" ? 0 : 1)) return null;
    for (let k = 1; k < s.rodada; k++) if (encerraPartida(s.placar.slice(0, k), s.modo)) return null;
    if (!Array.isArray(s.maos) || s.maos.length !== JOGADORES || !s.maos.every((m) => listaDeCartas(m, POR_MAO))) return null;
    if (!Array.isArray(s.recebidas) || s.recebidas.length !== JOGADORES || !s.recebidas.every((r) => listaDeCartas(r, NA_TROCA))) return null;
    if (!Array.isArray(s.vazas) || s.vazas.length > VAZAS) return null;
    if (!s.vazas.every((v) => v && eJogador(v.lider) && listaDeCartas(v.cartas, JOGADORES) && v.cartas.length === JOGADORES)) return null;
    if (!s.atual || !eJogador(s.atual.lider) || !listaDeCartas(s.atual.cartas, JOGADORES - 1)) return null;
    const ordem = [...s.vazas.flatMap((v) => v.cartas), ...s.atual.cartas];
    const todas = [...s.maos.flat(), ...ordem];
    if (todas.length !== CARTAS || new Set(todas).size !== CARTAS) return null;

    // A mão de cada um logo depois da troca: o que ainda tem mais o que já jogou
    const iniciais = s.maos.map((m) => m.slice());
    const anotar = (lider, cartas) => cartas.forEach((c, i) => iniciais[(lider + i) % JOGADORES].push(c));
    s.vazas.forEach((v) => anotar(v.lider, v.cartas));
    anotar(s.atual.lider, s.atual.cartas);
    if (!iniciais.every((m) => m.length === POR_MAO)) return null;

    // Antes da troca, cada um tinha as suas cartas menos as recebidas mais as que passou
    const houveTroca = temTroca(s.rodada) && s.fase !== "troca";
    if (!s.recebidas.every((r, j) => r.length === (houveTroca ? NA_TROCA : 0) && r.every((c) => iniciais[j].includes(c)))) return null;
    const distribuidas = distribuir(s.semente, s.rodada);
    for (let j = 0; j < JOGADORES; j++) {
      const passou = s.recebidas[destinoDaTroca(j, s.rodada)];
      const antes = [...iniciais[j].filter((c) => !s.recebidas[j].includes(c)), ...passou];
      if (!mesmasCartas(antes, distribuidas[j])) return null;
    }

    let e = {
      modo: s.modo,
      semente: s.semente,
      rodada: s.rodada,
      fase: s.fase === "troca" ? "troca" : "vaza",
      maos: iniciais.map(ordenar),
      recebidas: s.recebidas.map(ordenar),
      vazas: [],
      atual: { lider: quemTem(iniciais, DOIS_DE_PAUS), cartas: [] },
      placar: copiarPlacar(s.placar.slice(0, s.rodada - 1)),
      iniciado: s.iniciado === true,
    };
    if (s.atual.lider !== e.atual.lider && !ordem.length) return null;
    for (const c of ordem) {
      e = jogar(e, c);
      if (!e) return null;
    }
    if (e.fase !== s.fase || e.atual.lider !== s.atual.lider || e.vazas.some((v, i) => v.lider !== s.vazas[i].lider)) return null;
    if (s.fase === "fim" && JSON.stringify(e.placar[e.placar.length - 1]) !== JSON.stringify(s.placar[s.placar.length - 1])) return null;
    return { ...e, iniciado: s.iniciado === true || ordem.length > 0 };
  }

  // ---------- Estatísticas ----------

  const estatisticasVazias = () => ({
    jogadas: 0,
    vitorias: 0,
    melhorPontuacao: null,
    luas: 0,
    sequencia: 0,
    melhorSequencia: 0,
  });

  function lerEstatisticas(salvas) {
    const limpo = estatisticasVazias();
    if (!salvas || typeof salvas !== "object") return limpo;
    for (const campo of ["jogadas", "vitorias", "luas", "sequencia", "melhorSequencia"]) {
      if (inteiro(salvas[campo])) limpo[campo] = salvas[campo];
    }
    if (inteiro(salvas.melhorPontuacao)) limpo.melhorPontuacao = salvas.melhorPontuacao;
    limpo.vitorias = Math.min(limpo.vitorias, limpo.jogadas);
    limpo.sequencia = Math.min(limpo.sequencia, limpo.vitorias);
    limpo.melhorSequencia = Math.max(limpo.melhorSequencia, limpo.sequencia);
    return limpo;
  }

  /**
   * Soma uma partida: [pontos] é o seu total no fim (null numa partida abandonada). Devolve as
   * novas estatísticas e se a pontuação virou recorde.
   */
  function registrarResultado(estatisticas, { venceu: ganhou, pontos = null }) {
    const e = { ...lerEstatisticas(estatisticas) };
    const recordes = { pontuacao: false };
    e.jogadas += 1;
    if (ganhou) {
      e.vitorias += 1;
      e.sequencia += 1;
      e.melhorSequencia = Math.max(e.melhorSequencia, e.sequencia);
    } else {
      e.sequencia = 0;
    }
    if (inteiro(pontos) && (e.melhorPontuacao === null || pontos < e.melhorPontuacao)) {
      recordes.pontuacao = e.melhorPontuacao !== null;
      e.melhorPontuacao = pontos;
    }
    return { estatisticas: e, recordes };
  }

  /** Mais um tiro na lua seu. */
  const registrarLua = (estatisticas) => {
    const e = lerEstatisticas(estatisticas);
    return { ...e, luas: e.luas + 1 };
  };

  const porcentagemVitorias = (e) => (e.jogadas ? Math.round((100 * e.vitorias) / e.jogadas) : 0);
  const formatarNumero = (n) => n.toLocaleString("pt-BR");

  return {
    NAIPES,
    ESPADAS,
    COPAS,
    OUROS,
    PAUS,
    MODOS,
    MODO_PADRAO,
    JOGADORES,
    CARTAS,
    POR_MAO,
    NA_TROCA,
    VAZAS,
    PONTOS_DA_RODADA,
    DOIS_DE_PAUS,
    DAMA_DE_ESPADAS,
    NOMES,
    LUGARES,
    DIRECOES,
    naipe,
    posto,
    vermelha,
    textoValor,
    nomeCarta,
    oCarta,
    daCarta,
    pontosDaCarta,
    somaPontos,
    ordenar,
    textoModo,
    listar,
    direcao,
    temTroca,
    destinoDaTroca,
    origemDaTroca,
    aleatorioComSemente,
    novaSemente,
    distribuir,
    novoJogo,
    trocaValida,
    trocar,
    vez,
    cartasJogadas,
    copasQuebradas,
    primeiraVaza,
    legaisDaMao,
    jogadasLegais,
    podeJogar,
    motivoIlegal,
    vencedorDaVaza,
    pontosNaRodada,
    resultadoDaRodada,
    jogar,
    ultimaVaza,
    totais,
    encerraPartida,
    terminou,
    vencedor,
    classificacao,
    proximaRodada,
    analisar,
    ameacaDeLua,
    decidirJogada,
    escolherJogada,
    escolherTroca,
    explicarTroca,
    restaurar,
    estatisticasVazias,
    lerEstatisticas,
    registrarResultado,
    registrarLua,
    porcentagemVitorias,
    formatarNumero,
  };
})();

if (typeof module === "object") module.exports = LogicaCopas;
