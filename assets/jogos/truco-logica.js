"use strict";
/*
 * Truco Paulista e Truco Mineiro em duplas: regras, jogadas do computador e estatísticas, sem
 * nada de tela.
 *
 * Baralho de 40 cartas (sem 8, 9, 10 e coringas). Carta de 0 a 39: naipe = id / 10 (0 ouros,
 * 1 espadas, 2 copas, 3 paus, que é também a força das manilhas do Paulista, da mais fraca para a
 * mais forte) e valor = id % 10, na ordem normal da mais fraca para a mais forte:
 * 4 5 6 7 Q J K A 2 3.
 *
 * Jogadores de 0 a 3, na ordem em que se joga (sentido anti-horário): 0 é você (embaixo), 1 o
 * adversário à sua direita, 2 o parceiro (em frente) e 3 o adversário à esquerda. A dupla é
 * jogador % 2: 0 é "Nós" e 1 é "Eles".
 *
 * Paulista: a vira define as manilhas (o valor seguinte ao dela, em ciclo), que valem pelo naipe:
 * paus (zap) > copas > espadas > ouros. A mão vale 1; truco 3, seis 6, nove 9 e doze 12. Mão de
 * onze: a dupla com 11 vê as cartas do parceiro e joga (valendo 3) ou corre (os outros ganham 1).
 * Mineiro: sem vira, manilhas fixas 4 de paus (zap) > 7 de copas > Ás de espadas (espadilha) >
 * 7 de ouros (pica-fumo). A mão vale 2; truco 4, seis 6, dez 10 e doze 12. Mão de dez: joga
 * valendo 4 ou corre e os outros ganham 2. Nos dois, com as duas duplas na mão especial (11 x 11
 * ou 10 x 10) vem a mão de ferro: ninguém vê as cartas e quem ganhar leva o jogo.
 *
 * Empates (cangar): empatou a 1ª, a 2ª decide (e, se ela empatar também, a 3ª); empatou a 2ª ou a
 * 3ª, ganha quem fez a 1ª; as três empatadas, ninguém marca. Depois de uma vaza empatada, começa a
 * próxima quem jogou primeiro uma das cartas empatadas. Da 2ª vaza em diante, a carta pode ir
 * coberta (virada para baixo): não vale nada.
 *
 * O estado (só números, textos e listas, para salvar em JSON) guarda o placar, a mão atual e a
 * lista das ações dela; restaurar() refaz a mão do zero a partir da semente e repete as ações, e
 * só aceita o estado salvo se tudo bater.
 */
const LogicaTruco = (() => {
  const NAIPES = [
    { id: "ouros", nome: "ouros", simbolo: "♦", vermelho: true },
    { id: "espadas", nome: "espadas", simbolo: "♠", vermelho: false },
    { id: "copas", nome: "copas", simbolo: "♥", vermelho: true },
    { id: "paus", nome: "paus", simbolo: "♣", vermelho: false },
  ];
  /** Ordem normal, da mais fraca para a mais forte. */
  const VALORES = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"];
  const NOMES_VALOR = ["4", "5", "6", "7", "Dama", "Valete", "Rei", "Ás", "2", "3"];
  const MODOS = ["paulista", "mineiro"];
  const MODO_PADRAO = "paulista";
  const CARTAS = 40;
  const JOGADORES = 4;
  const CARTAS_NA_MAO = 3;
  const PONTOS_JOGO = 12;
  const MAIOR_SEMENTE = 999999;
  const NOS = 0;
  const ELES = 1;
  const EMPATE = -1;

  const REGRAS = {
    paulista: {
      nome: "Paulista",
      escada: [1, 3, 6, 9, 12],
      nomes: { 3: "Truco", 6: "Seis", 9: "Nove", 12: "Doze" },
      limiteEspecial: 11,
      valorEspecial: 3,
      correrEspecial: 1,
      nomeEspecial: "mão de onze",
      vira: true,
    },
    mineiro: {
      nome: "Mineiro",
      escada: [2, 4, 6, 10, 12],
      nomes: { 4: "Truco", 6: "Seis", 10: "Dez", 12: "Doze" },
      limiteEspecial: 10,
      valorEspecial: 4,
      correrEspecial: 2,
      nomeEspecial: "mão de dez",
      vira: false,
    },
  };
  /** Manilhas fixas do Mineiro, da mais forte para a mais fraca: 4♣, 7♥, A♠ e 7♦. */
  const MANILHAS_MINEIRO = [30, 23, 17, 3];
  /** Apelidos das manilhas pelo naipe (no Mineiro, a de cada naipe é uma carta fixa). */
  const APELIDOS = ["pica-fumo", "espadilha", "copas", "zap"];

  const valor = (id) => id % 10;
  const naipe = (id) => Math.floor(id / 10);
  const vermelha = (id) => NAIPES[naipe(id)].vermelho;
  const textoValor = (id) => VALORES[valor(id)];
  const nomeCarta = (id) => `${NOMES_VALOR[valor(id)]} de ${NAIPES[naipe(id)].nome}`;
  const timeDe = (jogador) => jogador % 2;
  const parceiroDe = (jogador) => (jogador + 2) % JOGADORES;
  const textoModo = (modo) => (REGRAS[modo] || REGRAS[MODO_PADRAO]).nome;

  // ---------- Força das cartas ----------

  /** O valor que vira manilha no Paulista: o seguinte ao da vira, em ciclo (vira 3, manilha 4). */
  const valorManilha = (vira) => (valor(vira) + 1) % VALORES.length;

  /** Força da carta na mão: 0 a 9 pela ordem normal e 10 a 13 para as manilhas. */
  function forcaCarta(modo, vira, id) {
    if (modo === "mineiro") {
      const i = MANILHAS_MINEIRO.indexOf(id);
      return i >= 0 ? 13 - i : valor(id);
    }
    return valor(id) === valorManilha(vira) ? 10 + naipe(id) : valor(id);
  }

  const forca = (e, id) => forcaCarta(e.modo, e.mao.vira, id);
  const ehManilha = (e, id) => forca(e, id) >= 10;
  const apelidoManilha = (e, id) => (ehManilha(e, id) ? APELIDOS[forca(e, id) - 10] : null);

  /** As quatro manilhas da mão, da mais forte para a mais fraca. */
  function manilhasDaMao(e) {
    if (e.modo === "mineiro") return MANILHAS_MINEIRO.slice();
    const v = valorManilha(e.mao.vira);
    return [3, 2, 1, 0].map((n) => n * 10 + v);
  }

  // ---------- Valores da mão ----------

  const valorBase = (modo) => REGRAS[modo].escada[0];

  /** O próximo degrau depois de [valor] (truco, seis...), ou null quando já está no doze. */
  function proximoValor(modo, v) {
    const escada = REGRAS[modo].escada;
    const i = escada.indexOf(v);
    return i >= 0 && i < escada.length - 1 ? escada[i + 1] : null;
  }

  /** "Truco", "Seis", "Nove", "Dez" ou "Doze": o nome do pedido que leva a mão a [valor]. */
  const nomePedido = (modo, v) => REGRAS[modo].nomes[v] || String(v);

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

  /** Junta vários números numa semente só (cada mão da partida tem a sua). */
  function misturar(...numeros) {
    let h = 0x811c9dc5;
    for (const n of numeros) {
      h = Math.imul(h ^ (n >>> 0), 0x01000193);
      h ^= h >>> 13;
      h = Math.imul(h, 0x5bd1e995);
      h ^= h >>> 15;
    }
    return h >>> 0;
  }

  function embaralhar(lista, aleatorio) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  /** Quem dá as cartas na mão [numeroMao]: o primeiro sai da semente e depois passa para a direita. */
  const carteadorDaMao = (semente, numeroMao) =>
    (Math.floor(aleatorioComSemente(misturar(semente, 0))() * JOGADORES) + numeroMao - 1) % JOGADORES;

  /** As cartas da mão: uma de cada vez, começando pelo jogador à direita de quem dá; depois a vira. */
  function distribuir(modo, semente, numeroMao, carteador) {
    const baralho = embaralhar([...Array(CARTAS).keys()], aleatorioComSemente(misturar(semente, numeroMao)));
    const maos = [[], [], [], []];
    for (let i = 0; i < JOGADORES * CARTAS_NA_MAO; i++) maos[(carteador + 1 + i) % JOGADORES].push(baralho[i]);
    return { maos, vira: REGRAS[modo].vira ? baralho[JOGADORES * CARTAS_NA_MAO] : null };
  }

  function novaMao(modo, semente, numeroMao, placar) {
    const regras = REGRAS[modo];
    const carteador = carteadorDaMao(semente, numeroMao);
    const { maos, vira } = distribuir(modo, semente, numeroMao, carteador);
    const limite = regras.limiteEspecial;
    let especial = null;
    let timeEspecial = null;
    let valorInicial = regras.escada[0];
    if (placar[NOS] === limite && placar[ELES] === limite) {
      // Mão de ferro: quem ganhar chega aos 12
      especial = "ferro";
      valorInicial = PONTOS_JOGO - limite;
    } else if (placar[NOS] === limite || placar[ELES] === limite) {
      especial = "onze";
      timeEspecial = placar[NOS] === limite ? NOS : ELES;
      valorInicial = regras.valorEspecial;
    }
    return {
      carteador,
      distribuidas: maos.map((m) => m.slice()),
      cartas: maos,
      vira,
      vazas: [],
      vez: (carteador + 1) % JOGADORES,
      valor: valorInicial,
      ultimoPedido: null,
      pedido: null,
      especial,
      timeEspecial,
      decisao: especial === "onze",
      trucada: false,
      resultado: null,
      acoes: [],
    };
  }

  function novoJogo(modo, semente) {
    const m = MODOS.includes(modo) ? modo : MODO_PADRAO;
    return {
      modo: m,
      semente,
      numeroMao: 1,
      placar: [0, 0],
      placarAntes: [0, 0],
      trucosGanhos: 0,
      trucosAntes: 0,
      mao: novaMao(m, semente, 1, [0, 0]),
      fim: null,
      iniciado: false,
    };
  }

  const clonarMao = (m) => ({
    ...m,
    distribuidas: m.distribuidas.map((c) => c.slice()),
    cartas: m.cartas.map((c) => c.slice()),
    vazas: m.vazas.map((v) => ({ ...v, cartas: v.cartas.map((c) => ({ ...c })) })),
    pedido: m.pedido && { ...m.pedido },
    resultado: m.resultado && { ...m.resultado },
    acoes: m.acoes.map((a) => a.slice()),
  });

  const clonar = (e) => ({
    ...e,
    placar: e.placar.slice(),
    placarAntes: e.placarAntes.slice(),
    fim: e.fim && { ...e.fim },
    mao: clonarMao(e.mao),
  });

  // ---------- Vazas ----------

  /** A vaza em andamento (com menos de 4 cartas), ou null entre uma vaza e outra. */
  function vazaAtual(m) {
    const ultima = m.vazas[m.vazas.length - 1];
    return ultima && ultima.vencedor === null ? ultima : null;
  }

  const vazasCompletas = (m) => m.vazas.filter((v) => v.vencedor !== null);
  const resultadosDasVazas = (m) => vazasCompletas(m).map((v) => v.vencedor);

  /**
   * Quem leva a vaza: a carta mais forte. Se as mais fortes forem da mesma dupla, a vaza é dela;
   * se forem das duas duplas, empata. Carta coberta não vale nada. [proximo] é quem começa a
   * vaza seguinte: o dono da carta vencedora ou, no empate, quem jogou primeiro uma das empatadas.
   */
  function resolverVaza(modo, vira, cartas) {
    const forcas = cartas.map((c) => (c.coberta ? -1 : forcaCarta(modo, vira, c.carta)));
    const maior = Math.max(...forcas);
    const donos = cartas.filter((c, i) => forcas[i] === maior);
    const primeiro = donos[0].jogador;
    if (donos.every((c) => timeDe(c.jogador) === timeDe(primeiro))) {
      return { vencedor: timeDe(primeiro), ganhador: primeiro, proximo: primeiro };
    }
    return { vencedor: EMPATE, ganhador: null, proximo: primeiro };
  }

  /**
   * Quem ganha a mão pelos resultados das vazas até agora (0, 1 ou EMPATE em cada uma): uma
   * dupla, EMPATE (as três empataram) ou null (a mão continua).
   */
  function resultadoDasVazas(v) {
    if (v.length < 2) return null;
    const [a, b, c] = v;
    if (v.length === 2) {
      if (a === EMPATE && b === EMPATE) return null;
      if (a === EMPATE) return b;
      if (b === EMPATE) return a;
      return a === b ? a : null;
    }
    // Três vazas: a 1ª e a 2ª empataram (a 3ª decide) ou cada dupla fez uma (empate na 3ª dá a mão a quem fez a 1ª)
    if (a === EMPATE && b === EMPATE) return c;
    return c === EMPATE ? a : c;
  }

  // ---------- Jogadas ----------

  /** A mão está correndo: sem pedido para responder, sem decisão da mão de onze e sem resultado. */
  const emAndamento = (e) => !e.fim && !e.mao.resultado && !e.mao.pedido && !e.mao.decisao;

  /** Da 2ª vaza em diante a carta pode ir coberta, menos na mão de ferro (lá ninguém vê nada). */
  const podeCobrir = (e, jogador) =>
    emAndamento(e) && e.mao.vez === jogador && e.mao.especial !== "ferro" && vazasCompletas(e.mao).length >= 1;

  function podeJogar(e, jogador, carta, coberta = false) {
    if (!emAndamento(e) || e.mao.vez !== jogador) return false;
    if (!e.mao.cartas[jogador].includes(carta)) return false;
    return !coberta || podeCobrir(e, jogador);
  }

  /** Marca o fim da mão e soma os pontos. */
  function encerrarMao(n, vencedor, pontos, motivo) {
    const m = n.mao;
    m.resultado = { vencedor, pontos: vencedor === EMPATE ? 0 : pontos, motivo };
    m.pedido = null;
    m.decisao = false;
    if (vencedor === EMPATE) return;
    n.placar[vencedor] = Math.min(PONTOS_JOGO, n.placar[vencedor] + pontos);
    if (vencedor === NOS && m.trucada) n.trucosGanhos += 1;
    if (n.placar[vencedor] >= PONTOS_JOGO) n.fim = { vencedor };
  }

  function jogar(e, jogador, carta, coberta = false) {
    if (!podeJogar(e, jogador, carta, coberta)) return null;
    const n = clonar(e);
    const m = n.mao;
    let vaza = vazaAtual(m);
    if (!vaza) {
      vaza = { inicio: jogador, cartas: [], vencedor: null, ganhador: null };
      m.vazas.push(vaza);
    }
    m.cartas[jogador].splice(m.cartas[jogador].indexOf(carta), 1);
    vaza.cartas.push({ jogador, carta, coberta: Boolean(coberta) });
    m.acoes.push(["jogar", jogador, carta, coberta ? 1 : 0]);
    if (vaza.cartas.length < JOGADORES) {
      m.vez = (jogador + 1) % JOGADORES;
      return n;
    }
    const r = resolverVaza(n.modo, m.vira, vaza.cartas);
    vaza.vencedor = r.vencedor;
    vaza.ganhador = r.ganhador;
    m.vez = r.proximo;
    const fim = resultadoDasVazas(resultadosDasVazas(m));
    if (fim !== null) encerrarMao(n, fim, m.valor, fim === EMPATE ? "empate" : "vazas");
    return n;
  }

  /** Pode pedir truco (ou aumentar) agora: só na própria vez e se o último pedido não foi da sua dupla. */
  const podePedir = (e, jogador) =>
    emAndamento(e) &&
    e.mao.especial === null &&
    e.mao.vez === jogador &&
    e.mao.ultimoPedido !== timeDe(jogador) &&
    proximoValor(e.modo, e.mao.valor) !== null;

  function pedir(e, jogador) {
    if (!podePedir(e, jogador)) return null;
    const n = clonar(e);
    const m = n.mao;
    m.pedido = { time: timeDe(jogador), jogador, valor: proximoValor(n.modo, m.valor), anterior: m.valor };
    m.trucada = true;
    m.acoes.push(["pedir", jogador]);
    return n;
  }

  /** A dupla que tem de responder ao pedido, ou null. */
  const quemResponde = (e) => (e.mao.pedido && !e.fim ? 1 - e.mao.pedido.time : null);
  const podeAumentar = (e) => Boolean(e.mao.pedido) && proximoValor(e.modo, e.mao.pedido.valor) !== null;
  const RESPOSTAS = ["aceitar", "correr", "aumentar"];

  /**
   * A dupla [time] responde ao pedido: aceita (a mão passa a valer o pedido), corre (quem pediu
   * leva o valor de antes do pedido) ou aumenta (aceita e pede o degrau seguinte; [jogador] é quem
   * falou, só para mostrar na tela).
   */
  function responder(e, time, resposta, jogador = null) {
    if (e.fim || !e.mao.pedido || time !== 1 - e.mao.pedido.time || !RESPOSTAS.includes(resposta)) return null;
    if (resposta === "aumentar" && !podeAumentar(e)) return null;
    if (jogador !== null && !(Number.isInteger(jogador) && jogador >= 0 && jogador < JOGADORES && timeDe(jogador) === time)) return null;
    const n = clonar(e);
    const m = n.mao;
    const p = m.pedido;
    m.acoes.push(["responder", time, resposta, jogador]);
    if (resposta === "correr") {
      encerrarMao(n, p.time, p.anterior, "correu");
      return n;
    }
    m.valor = p.valor;
    m.ultimoPedido = p.time;
    m.pedido = resposta === "aumentar" ? { time, jogador, valor: proximoValor(n.modo, p.valor), anterior: p.valor } : null;
    return n;
  }

  /** Mão de onze (ou de dez): a dupla que chegou lá joga a mão ou corre. */
  function decidirEspecial(e, jogarMao) {
    if (e.fim || !e.mao.decisao) return null;
    const n = clonar(e);
    const m = n.mao;
    m.acoes.push(["especial", jogarMao ? 1 : 0]);
    if (jogarMao) m.decisao = false;
    else encerrarMao(n, 1 - m.timeEspecial, REGRAS[n.modo].correrEspecial, "correu-especial");
    return n;
  }

  /** Dá as cartas da mão seguinte (quem dá passa para a direita). */
  function proximaMao(e) {
    if (e.fim || !e.mao.resultado) return null;
    const n = clonar(e);
    n.numeroMao += 1;
    n.placarAntes = n.placar.slice();
    n.trucosAntes = n.trucosGanhos;
    n.mao = novaMao(n.modo, n.semente, n.numeroMao, n.placar);
    return n;
  }

  function aplicarAcao(e, acao) {
    if (!Array.isArray(acao)) return null;
    switch (acao[0]) {
      case "jogar":
        return acao[3] === 0 || acao[3] === 1 ? jogar(e, acao[1], acao[2], acao[3] === 1) : null;
      case "pedir":
        return pedir(e, acao[1]);
      case "responder":
        return responder(e, acao[1], acao[2], acao[3] === undefined ? null : acao[3]);
      case "especial":
        return acao[1] === 0 || acao[1] === 1 ? decidirEspecial(e, acao[1] === 1) : null;
      default:
        return null;
    }
  }

  // ---------- Computador ----------

  /** Gerador próprio de cada decisão do computador: a mesma partida decide sempre igual. */
  const aleatorioDaIA = (e, jogador, extra = 0) =>
    aleatorioComSemente(misturar(e.semente, e.numeroMao, e.mao.acoes.length, jogador + 1, extra));

  const BLEFE_PEDIDO = 0.05;
  const ESPERA = 0.4;
  const BLEFE_AUMENTO = 0.05;
  const CHANCE_COBRIR = 0.25;
  const AMOSTRAS = 36;

  /**
   * Termina a mão numa simulação rápida em que todos jogam do jeito simples: abre com a mais forte,
   * descarta a mais fraca se a dupla já ganha a vaza e, se não, joga a menor que ganha.
   */
  function simular(modo, vira, maos, resultados, vaza, vez) {
    const f = (id) => forcaCarta(modo, vira, id);
    let quem = vez;
    for (;;) {
      const mao = maos[quem];
      let escolhida = mao[0];
      if (!vaza.length) {
        for (const id of mao) if (f(id) > f(escolhida)) escolhida = id;
      } else {
        let maior = -2;
        let timeMaior = null;
        for (const c of vaza) {
          const forcaC = c.coberta ? -1 : f(c.carta);
          if (forcaC > maior) {
            maior = forcaC;
            timeMaior = timeDe(c.jogador);
          } else if (forcaC === maior && timeDe(c.jogador) !== timeMaior) {
            timeMaior = EMPATE;
          }
        }
        let fraca = mao[0];
        let menorQueVence = null;
        for (const id of mao) {
          if (f(id) < f(fraca)) fraca = id;
          if (f(id) > maior && (menorQueVence === null || f(id) < f(menorQueVence))) menorQueVence = id;
        }
        escolhida = timeMaior === timeDe(quem) || menorQueVence === null ? fraca : menorQueVence;
      }
      mao.splice(mao.indexOf(escolhida), 1);
      vaza.push({ jogador: quem, carta: escolhida, coberta: false });
      if (vaza.length < JOGADORES) {
        quem = (quem + 1) % JOGADORES;
        continue;
      }
      const r = resolverVaza(modo, vira, vaza);
      resultados.push(r.vencedor);
      const fim = resultadoDasVazas(resultados);
      if (fim !== null) return fim;
      vaza = [];
      quem = r.proximo;
    }
  }

  /**
   * Chance de a dupla de [jogador] ganhar a mão, vista por ele: sorteia muitas vezes as cartas que
   * ele não vê (as dos outros, menos as do parceiro na mão de onze) e termina a mão em cada sorteio.
   * Empate conta meia. Só usa o que o jogador sabe: as próprias cartas, as que já foram jogadas
   * abertas e a vira.
   */
  function chanceDeGanhar(e, jogador, { amostras = AMOSTRAS, aleatorio = aleatorioDaIA(e, jogador, 9), veParceiro } = {}) {
    const m = e.mao;
    const time = timeDe(jogador);
    if (m.resultado) return m.resultado.vencedor === time ? 1 : m.resultado.vencedor === EMPATE ? 0.5 : 0;
    const parceiro = parceiroDe(jogador);
    const ver = veParceiro === undefined ? m.especial === "onze" && m.timeEspecial === time : veParceiro;
    const vistas = new Set(m.cartas[jogador]);
    if (ver) for (const c of m.cartas[parceiro]) vistas.add(c);
    if (m.vira !== null) vistas.add(m.vira);
    for (const v of m.vazas) for (const c of v.cartas) if (!c.coberta || c.jogador === jogador) vistas.add(c.carta);
    const desconhecidas = [...Array(CARTAS).keys()].filter((id) => !vistas.has(id));
    const fixo = (p) => p === jogador || (ver && p === parceiro);
    const resultados = resultadosDasVazas(m);
    const atual = vazaAtual(m);
    let soma = 0;
    for (let s = 0; s < amostras; s++) {
      const sorteio = embaralhar(desconhecidas, aleatorio);
      let k = 0;
      const maos = m.cartas.map((c, p) => (fixo(p) ? c.slice() : sorteio.slice(k, (k += c.length))));
      const r = simular(e.modo, m.vira, maos, resultados.slice(), atual ? atual.cartas.map((c) => ({ ...c })) : [], m.vez);
      soma += r === time ? 1 : r === EMPATE ? 0.5 : 0;
    }
    return soma / amostras;
  }

  /**
   * A carta que o computador joga ({ carta, coberta }). Saindo: na 1ª vaza a do meio; na 2ª, a
   * mais forte se precisa da vaza, ou a mais fraca se já fez a 1ª (guardando a forte, a não ser
   * que ela seja um 3 ou manilha, que fecha a mão). Depois de outros: se o parceiro já ganha a
   * vaza, descarta a mais fraca; se não, joga a menor que ganha, ou a que empata, ou descarta.
   */
  function escolherCarta(e, jogador, aleatorio = aleatorioDaIA(e, jogador, 1)) {
    const m = e.mao;
    const mao = m.cartas[jogador];
    // Na mão de ferro ninguém vê as próprias cartas: vai uma qualquer
    if (m.especial === "ferro") return { carta: mao[Math.floor(aleatorio() * mao.length)], coberta: false };
    const f = (id) => forca(e, id);
    const ordem = mao.slice().sort((a, b) => f(a) - f(b) || a - b);
    const fraca = ordem[0];
    const forte = ordem[ordem.length - 1];
    const time = timeDe(jogador);
    const resultados = resultadosDasVazas(m);
    const n = resultados.length;
    const vaza = vazaAtual(m);
    const descartar = (carta) => ({ carta, coberta: podeCobrir(e, jogador) && aleatorio() < CHANCE_COBRIR });

    if (!vaza) {
      if (ordem.length === 1) return { carta: forte, coberta: false };
      if (n === 0) return { carta: ordem[ordem.length - 2], coberta: false };
      if (resultados[0] === time) return f(forte) >= 9 ? { carta: forte, coberta: false } : descartar(fraca);
      return { carta: forte, coberta: false };
    }

    const forcas = vaza.cartas.map((c) => (c.coberta ? -1 : f(c.carta)));
    const maior = Math.max(...forcas);
    const timesNoTopo = new Set(vaza.cartas.filter((c, i) => forcas[i] === maior).map((c) => timeDe(c.jogador)));
    const parceiroGanha = timesNoTopo.size === 1 && timesNoTopo.has(time);
    const ultimo = vaza.cartas.length === JOGADORES - 1;
    const vencem = ordem.filter((id) => f(id) > maior);
    const empatam = ordem.filter((id) => f(id) === maior);

    if (parceiroGanha) {
      // Vaza que decide a mão, com um adversário ainda por jogar e a carta do parceiro fraca: cobre
      if (!ultimo && n >= 1 && maior < 9 && vencem.length && f(vencem[0]) >= 9) return { carta: vencem[0], coberta: false };
      return descartar(fraca);
    }
    if (vencem.length) return { carta: vencem[0], coberta: false };
    if (empatam.length) return { carta: empatam[0], coberta: false };
    return descartar(fraca);
  }

  /** O computador pede truco (ou aumenta) na sua vez? Pede com mão forte e às vezes blefa. */
  function querPedir(e, jogador, aleatorio = aleatorioDaIA(e, jogador, 2)) {
    if (!podePedir(e, jogador)) return false;
    const m = e.mao;
    const time = timeDe(jogador);
    const nossos = e.placar[time];
    const deles = e.placar[1 - time];
    // Se ganhar a mão já dá o jogo, aumentar só arrisca dar mais pontos a eles
    if (nossos + m.valor >= PONTOS_JOGO) return false;
    const p = chanceDeGanhar(e, jogador, { aleatorio });
    const primeiro = m.valor === valorBase(e.modo);
    // Na 1ª vaza ainda se sabe pouco: pede só com mão bem forte
    let limiar = (primeiro ? 0.8 : 0.86) + (vazasCompletas(m).length === 0 ? 0.06 : 0);
    // Se perder a mão já dá o jogo a eles, aumentar não custa nada a mais
    if (deles + m.valor >= PONTOS_JOGO) limiar = 0.45;
    // Com a mão garantida, às vezes espera calado: quem sabe os outros pedem e dá para aumentar
    if (p >= 0.95 && aleatorio() < ESPERA) return false;
    if (p >= limiar) return true;
    return primeiro && p >= 0.35 && aleatorio() < BLEFE_PEDIDO;
  }

  /**
   * Resposta da dupla [time] ao pedido: { resposta, jogador }, em que [jogador] é quem fala. A
   * dupla responde pelo jogador que está mais confiante (como parceiros que se entendem) e
   * desconta um pouco a chance, porque quem pediu deve ter jogo.
   */
  function respostaDaIA(e, time, aleatorio = aleatorioDaIA(e, time, 3)) {
    const m = e.mao;
    const p0 = m.pedido;
    let p = -1;
    let quem = time;
    for (const j of [time, time + 2]) {
      const c = chanceDeGanhar(e, j, { aleatorio });
      if (c > p) {
        p = c;
        quem = j;
      }
    }
    p *= 0.85;
    const nossos = e.placar[time];
    const deles = e.placar[1 - time];
    const correrPerde = deles + p0.anterior >= PONTOS_JOGO;
    const podeSubir = podeAumentar(e) && nossos + p0.valor < PONTOS_JOGO;
    if (podeSubir && (p >= 0.7 || (p >= 0.4 && aleatorio() < BLEFE_AUMENTO))) return { resposta: "aumentar", jogador: quem };
    if (correrPerde) return { resposta: "aceitar", jogador: quem };
    let limiar = (1 - p0.anterior / p0.valor) / 2 + 0.12;
    if (deles + p0.valor >= PONTOS_JOGO) limiar = Math.max(limiar, 0.45);
    if (nossos + p0.valor >= PONTOS_JOGO) limiar -= 0.05;
    return { resposta: p >= limiar ? "aceitar" : "correr", jogador: quem };
  }

  /** Mão de onze (ou de dez) do computador: a dupla vê as seis cartas e joga se tiver boa chance. */
  function decisaoEspecialDaIA(e, aleatorio = aleatorioDaIA(e, e.mao.timeEspecial, 4)) {
    const m = e.mao;
    const time = m.timeEspecial;
    const p = chanceDeGanhar(e, time, { aleatorio, veParceiro: true, amostras: 60 });
    const deles = e.placar[1 - time];
    const limiar = deles + REGRAS[e.modo].valorEspecial >= PONTOS_JOGO ? 0.5 : 0.42;
    return p >= limiar;
  }

  // ---------- Salvar e restaurar ----------

  const inteiro = (v, min = 0) => Number.isInteger(v) && v >= min;
  const placarValido = (p, max) => Array.isArray(p) && p.length === 2 && p.every((x) => inteiro(x) && x <= max);
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /**
   * Confere um estado salvo: refaz a mão atual a partir da semente e repete as ações gravadas;
   * qualquer ação impossível ou diferença no resultado invalida o estado.
   */
  function restaurar(salvo) {
    if (!salvo || typeof salvo !== "object" || !MODOS.includes(salvo.modo) || !inteiro(salvo.semente, 1)) return null;
    if (!inteiro(salvo.numeroMao, 1) || !placarValido(salvo.placarAntes, PONTOS_JOGO - 1) || !placarValido(salvo.placar, PONTOS_JOGO)) {
      return null;
    }
    if (salvo.modo === "mineiro" && salvo.placarAntes.some((x) => x % 2)) return null;
    if (!inteiro(salvo.trucosAntes) || salvo.trucosAntes >= salvo.numeroMao || !inteiro(salvo.trucosGanhos)) return null;
    if (!salvo.mao || typeof salvo.mao !== "object" || !Array.isArray(salvo.mao.acoes) || salvo.mao.acoes.length > 40) return null;
    let e = {
      modo: salvo.modo,
      semente: salvo.semente,
      numeroMao: salvo.numeroMao,
      placar: salvo.placarAntes.slice(),
      placarAntes: salvo.placarAntes.slice(),
      trucosGanhos: salvo.trucosAntes,
      trucosAntes: salvo.trucosAntes,
      mao: novaMao(salvo.modo, salvo.semente, salvo.numeroMao, salvo.placarAntes),
      fim: null,
      iniciado: salvo.iniciado === true,
    };
    for (const acao of salvo.mao.acoes) {
      e = aplicarAcao(e, acao);
      if (!e) return null;
    }
    if (!igual(e.placar, salvo.placar) || e.trucosGanhos !== salvo.trucosGanhos || !igual(e.fim, salvo.fim === undefined ? null : salvo.fim)) {
      return null;
    }
    return igual(e.mao, salvo.mao) ? e : null;
  }

  // ---------- Estatísticas ----------

  const estatisticasVazias = () => ({
    partidas: 0,
    vitorias: 0,
    sequencia: 0,
    melhorSequencia: 0,
    trucosGanhos: 0,
  });

  function lerEstatisticas(salvas) {
    const limpo = estatisticasVazias();
    if (!salvas || typeof salvas !== "object") return limpo;
    for (const campo of Object.keys(limpo)) if (inteiro(salvas[campo])) limpo[campo] = salvas[campo];
    limpo.vitorias = Math.min(limpo.vitorias, limpo.partidas);
    limpo.sequencia = Math.min(limpo.sequencia, limpo.vitorias);
    limpo.melhorSequencia = Math.max(Math.min(limpo.melhorSequencia, limpo.vitorias), limpo.sequencia);
    return limpo;
  }

  /** Soma uma partida (terminada ou abandonada); devolve as novas estatísticas e se a sequência virou recorde. */
  function registrarResultado(estatisticas, { venceu: ganhou, trucos = 0 }) {
    const e = { ...lerEstatisticas(estatisticas) };
    const recordes = { sequencia: false };
    e.partidas += 1;
    e.trucosGanhos += inteiro(trucos) ? trucos : 0;
    if (ganhou) {
      e.vitorias += 1;
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

  const porcentagemVitorias = (e) => (e.partidas ? Math.round((100 * e.vitorias) / e.partidas) : 0);
  const formatarNumero = (n) => n.toLocaleString("pt-BR");

  return {
    NAIPES,
    VALORES,
    MODOS,
    MODO_PADRAO,
    CARTAS,
    JOGADORES,
    CARTAS_NA_MAO,
    PONTOS_JOGO,
    NOS,
    ELES,
    EMPATE,
    REGRAS,
    MANILHAS_MINEIRO,
    valor,
    naipe,
    vermelha,
    textoValor,
    nomeCarta,
    timeDe,
    parceiroDe,
    textoModo,
    valorManilha,
    forcaCarta,
    forca,
    ehManilha,
    apelidoManilha,
    manilhasDaMao,
    valorBase,
    proximoValor,
    nomePedido,
    aleatorioComSemente,
    novaSemente,
    misturar,
    carteadorDaMao,
    distribuir,
    novoJogo,
    vazaAtual,
    vazasCompletas,
    resultadosDasVazas,
    resolverVaza,
    resultadoDasVazas,
    emAndamento,
    podeCobrir,
    podeJogar,
    jogar,
    podePedir,
    pedir,
    quemResponde,
    podeAumentar,
    responder,
    decidirEspecial,
    proximaMao,
    aplicarAcao,
    aleatorioDaIA,
    chanceDeGanhar,
    escolherCarta,
    querPedir,
    respostaDaIA,
    decisaoEspecialDaIA,
    restaurar,
    estatisticasVazias,
    lerEstatisticas,
    registrarResultado,
    porcentagemVitorias,
    formatarNumero,
  };
})();

if (typeof module === "object") module.exports = LogicaTruco;
