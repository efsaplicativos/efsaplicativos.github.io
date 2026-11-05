"use strict";
/*
 * Buraco a dois, você contra o computador: regras, pontuação, a jogada do computador e as
 * estatísticas, sem nada de tela.
 *
 * Cartas de 0 a 103 (dois baralhos de 52, sem coringas): naipe = (id % 52) / 13 (0 espadas,
 * 1 copas, 2 ouros, 3 paus) e valor = id % 13 + 1 (1 é o Ás, 11 o Valete, 12 a Dama e 13 o Rei).
 * Os 2 são os curingas.
 *
 * Jogo é uma sequência de 3 ou mais cartas do mesmo naipe (não há trincas). Cada carta ocupa uma
 * posição de 1 a 14: o Ás pode ser 1 (Ás-2-3) ou 14 (Dama-Rei-Ás), e o 2 do naipe do jogo, no lugar
 * dele (a posição 2), é carta natural. Qualquer outro 2 é curinga: tapa um buraco ou estica uma
 * ponta, e cada jogo aceita um só. O jogo fica guardado como a lista das cartas, em ordem; a posição
 * de cada uma (e a do curinga) é refeita a cada carta nova, então o curinga muda de lugar quando
 * chega a carta que ele substituía, e o 2 do naipe volta a ser natural quando a sequência chega até
 * o lugar dele.
 *
 * Estado da partida (só números, textos e listas, para salvar em JSON):
 *   modo ("aberto" ou "fechado"), alvo (pontos para ganhar), semente, rodada e inicial (quem
 *   começou a rodada); vez (0 você, 1 o computador) e fase ("comprar", "jogar", "fim" da rodada
 *   ou "acabou", a partida);
 *   maos e jogos de cada um; monte e lixo (a última carta da lista é a de cima); mortos;
 *   pegouMorto; mortoIntocado (pegou o morto ao descartar a última carta e ainda não jogou com ele);
 *   ultimaVolta (o monte acabou sem morto para virar monte: a rodada termina nesta vez);
 *   conhecidas (as cartas que cada um pegou do lixo e ainda tem na mão: todos viram) e descartes;
 *   novaCarta (a carta que veio do monte nesta vez); placar (pontos de cada rodada), totais,
 *   resumo da última rodada e vencedor.
 */
const LogicaBuraco = (() => {
  const NAIPES = [
    { id: "espadas", nome: "espadas", vermelho: false },
    { id: "copas", nome: "copas", vermelho: true },
    { id: "ouros", nome: "ouros", vermelho: true },
    { id: "paus", nome: "paus", vermelho: false },
  ];
  const VALORES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const NOMES_VALOR = ["Ás", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Valete", "Dama", "Rei"];
  const MODOS = ["aberto", "fechado"];
  const MODO_PADRAO = "aberto";
  const ALVOS = [3000, 1500];
  const ALVO_PADRAO = 3000;
  const CARTAS = 104;
  const NA_MAO = 11;
  const NO_MORTO = 11;
  const CANASTRA = 7;
  const MAIOR_JOGO = 14;
  const PONTOS = { limpa: 200, suja: 100, quinhentos: 500, mil: 1000, bater: 100, morto: 100 };
  const NOME_COMPUTADOR = "Zeca";
  const VOCE = 0;
  const COMPUTADOR = 1;
  const FASES = ["comprar", "jogar", "fim", "acabou"];
  const MAIOR_SEMENTE = 999999;

  const MSG_SEQUENCIA = "Uma sequência precisa ter cartas do mesmo naipe em ordem.";
  const MSG_TRINCA = "Aqui só valem sequências do mesmo naipe: trincas de cartas iguais não valem.";
  const MSG_CURINGA = "Um jogo só pode ter um curinga (um 2 fora do lugar dele).";
  const MSG_BURACO = "Falta carta na sequência: cada jogo aceita um só curinga para completar.";
  const MSG_REPETIDA = "Uma sequência não pode ter duas cartas iguais.";
  const MSG_FECHADO =
    "No Fechado, a carta de cima do lixo precisa entrar num jogo na hora: escolha na mão as cartas que formam sequência com ela, ou toque no seu jogo onde ela encaixa.";

  const valor = (id) => (id % 13) + 1;
  const naipe = (id) => Math.floor((id % 52) / 13);
  const vermelha = (id) => NAIPES[naipe(id)].vermelho;
  const ehDois = (id) => valor(id) === 2;
  const textoValor = (id) => VALORES[valor(id) - 1];
  const nomeCarta = (id) => `${NOMES_VALOR[valor(id) - 1]} de ${NAIPES[naipe(id)].nome}`;
  const topo = (lista) => (lista.length ? lista[lista.length - 1] : null);
  const textoModo = (modo) => (modo === "fechado" ? "Fechado" : "Aberto");
  const formatarNumero = (n) => n.toLocaleString("pt-BR");
  const textoAlvo = (alvo) => `até ${formatarNumero(alvo)}`;
  const chaveModo = (modo, alvo) => `${modo}-${alvo}`;

  /** Pontos da carta: 3 a 7 valem 5, 8 a Rei valem 10, o Ás 15 e o 2 (curinga ou não) 10. */
  function pontosCarta(id) {
    const v = valor(id);
    if (v === 1) return 15;
    if (v === 2 || v >= 8) return 10;
    return 5;
  }
  const somaPontos = (ids) => ids.reduce((s, id) => s + pontosCarta(id), 0);

  function nomePosicao(p) {
    if (p === 1 || p === 14) return "Ás";
    if (p >= 11) return NOMES_VALOR[p - 1];
    return String(p);
  }

  /** "5, 6 e 7 de copas" quando é tudo do mesmo naipe; senão, o nome de cada carta. */
  function listarCartas(ids) {
    if (!ids.length) return "";
    const juntar = (partes) => (partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`);
    const mesmoNaipe = ids.every((id) => naipe(id) === naipe(ids[0]));
    if (mesmoNaipe && ids.length > 1) return `${juntar(ids.map((id) => NOMES_VALOR[valor(id) - 1]))} de ${NAIPES[naipe(ids[0])].nome}`;
    return juntar(ids.map(nomeCarta));
  }

  // ---------- Jogos ----------

  const falha = (motivo) => ({ valido: false, motivo });

  /**
   * Confere se as cartas formam um jogo e devolve o arranjo: naipe, ordem (as cartas da posição mais
   * baixa para a mais alta), curinga (o 2 que faz papel de outra carta, ou null), posicaoCuringa,
   * inicio e fim (posições de 1 a 14), limpo, canastra e o bônus. Entre os arranjos possíveis, fica
   * o limpo, se houver.
   */
  function analisarJogo(ids) {
    if (!Array.isArray(ids) || ids.length < 3) return falha("Um jogo precisa de pelo menos 3 cartas.");
    if (!ids.every((id) => Number.isInteger(id) && id >= 0 && id < CARTAS) || new Set(ids).size !== ids.length) return falha("Cartas inválidas.");
    if (ids.length > MAIOR_JOGO) return falha("Uma sequência tem no máximo 14 cartas, de Ás a Ás.");
    const dois = ids.filter(ehDois);
    const outras = ids.filter((id) => !ehDois(id));
    if (!outras.length) return falha(MSG_CURINGA);
    if (outras.length >= 2 && outras.every((id) => valor(id) === valor(outras[0]))) {
      return falha(new Set(outras.map(naipe)).size > 1 ? MSG_TRINCA : MSG_REPETIDA);
    }
    const s = naipe(outras[0]);
    if (outras.some((id) => naipe(id) !== s)) return falha(MSG_SEQUENCIA);
    const ases = outras.filter((id) => valor(id) === 1);
    const meio = outras.filter((id) => valor(id) !== 1);
    const vistos = new Set();
    for (const id of meio) {
      if (vistos.has(valor(id))) return falha(MSG_REPETIDA);
      vistos.add(valor(id));
    }
    if (ases.length > 2) return falha(MSG_REPETIDA);

    const doisDoNaipe = dois.filter((id) => naipe(id) === s);
    const opcoesAs = ases.length === 0 ? [[]] : ases.length === 1 ? [[1], [14]] : [[1, 14]];
    const opcoesNatural = doisDoNaipe.length ? [doisDoNaipe[0], null] : [null];
    let melhor = null;
    let soCuringaDemais = true;
    for (const posAses of opcoesAs) {
      for (const natural of opcoesNatural) {
        const curingas = dois.filter((id) => id !== natural);
        if (curingas.length > 1) continue;
        soCuringaDemais = false;
        const pos = new Map();
        for (const id of meio) pos.set(id, valor(id));
        ases.forEach((id, i) => pos.set(id, posAses[i]));
        if (natural !== null) pos.set(natural, 2);
        const usadas = [...pos.values()];
        const lo = Math.min(...usadas);
        const hi = Math.max(...usadas);
        const buracos = hi - lo + 1 - usadas.length;
        if (buracos > curingas.length) continue;
        let posicaoCuringa = null;
        if (curingas.length) {
          if (buracos === 1) {
            const ocupadas = new Set(usadas);
            for (let p = lo; p <= hi; p++) if (!ocupadas.has(p)) posicaoCuringa = p;
          } else {
            posicaoCuringa = hi < MAIOR_JOGO ? hi + 1 : lo - 1;
          }
          pos.set(curingas[0], posicaoCuringa);
        }
        const candidato = { pos, curinga: curingas.length ? curingas[0] : null, posicaoCuringa };
        if (!melhor || (melhor.curinga !== null && candidato.curinga === null)) melhor = candidato;
      }
    }
    if (!melhor) return falha(soCuringaDemais ? MSG_CURINGA : dois.length ? MSG_BURACO : MSG_SEQUENCIA);

    const ordem = ids.slice().sort((a, b) => melhor.pos.get(a) - melhor.pos.get(b) || a - b);
    const posicoes = ordem.map((id) => melhor.pos.get(id));
    const limpo = melhor.curinga === null;
    const n = ids.length;
    let bonus = 0;
    if (n >= CANASTRA) {
      if (!limpo) bonus = PONTOS.suja;
      else if (n >= 14) bonus = PONTOS.mil;
      else if (n === 13) bonus = PONTOS.quinhentos;
      else bonus = PONTOS.limpa;
    }
    return {
      valido: true,
      naipe: s,
      ordem,
      posicoes,
      curinga: melhor.curinga,
      posicaoCuringa: melhor.posicaoCuringa,
      inicio: posicoes[0],
      fim: posicoes[posicoes.length - 1],
      limpo,
      tamanho: n,
      canastra: n >= CANASTRA,
      bonus,
    };
  }

  const jogoValido = (ids) => analisarJogo(ids).valido;
  const ehCanastraLimpa = (ids) => {
    const a = analisarJogo(ids);
    return a.valido && a.canastra && a.limpo;
  };
  const temCanastraLimpa = (jogos) => jogos.some(ehCanastraLimpa);
  const pontosDoJogo = (ids) => somaPontos(ids) + (analisarJogo(ids).bonus || 0);
  const pontosNaMesa = (jogos) => jogos.reduce((s, jg) => s + pontosDoJogo(jg), 0);

  /** "4 a 8 de copas", com o curinga dito quando houver. */
  function descreverJogo(ids) {
    const a = analisarJogo(ids);
    if (!a.valido) return listarCartas(ids);
    let texto = `${nomePosicao(a.inicio)} a ${nomePosicao(a.fim)} de ${NAIPES[a.naipe].nome}`;
    if (a.curinga !== null) texto += `, com o ${nomeCarta(a.curinga)} no lugar do ${nomePosicao(a.posicaoCuringa)}`;
    return texto;
  }

  /** limpa, suja, 500 ou 1000 (ou null se ainda não é canastra). */
  function tipoCanastra(ids) {
    const a = analisarJogo(ids);
    if (!a.valido || !a.canastra) return null;
    if (!a.limpo) return "suja";
    return a.bonus === PONTOS.mil ? "mil" : a.bonus === PONTOS.quinhentos ? "quinhentos" : "limpa";
  }

  // ---------- Embaralhar e distribuir ----------

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

  /** Cartas de uma rodada: 11 para cada um, dois mortos de 11, uma carta abre o lixo e 59 ficam no monte. */
  function distribuir(base) {
    const baralho = embaralhar([...Array(CARTAS).keys()], aleatorioComSemente((base.semente + 1000003 * (base.rodada - 1)) >>> 0));
    return {
      ...base,
      vez: base.inicial,
      fase: "comprar",
      maos: [baralho.slice(0, 11), baralho.slice(11, 22)],
      jogos: [[], []],
      mortos: [baralho.slice(22, 33), baralho.slice(33, 44)],
      lixo: [baralho[44]],
      monte: baralho.slice(45),
      pegouMorto: [false, false],
      mortoIntocado: [false, false],
      ultimaVolta: false,
      conhecidas: [[], []],
      descartes: [[], []],
      novaCarta: null,
      turnos: 0,
      resumo: null,
    };
  }

  function novoJogo(modo, alvo, semente) {
    return distribuir({
      versao: 1,
      modo: MODOS.includes(modo) ? modo : MODO_PADRAO,
      alvo: ALVOS.includes(alvo) ? alvo : ALVO_PADRAO,
      semente,
      rodada: 1,
      inicial: VOCE,
      placar: [],
      totais: [0, 0],
      vencedor: null,
      iniciado: false,
    });
  }

  /** Depois do fim de uma rodada: a próxima, com quem não começou a anterior. */
  function novaRodada(e) {
    if (e.fase !== "fim") return null;
    const base = clonar(e);
    return distribuir({ ...base, rodada: e.rodada + 1, inicial: 1 - e.inicial });
  }

  const copiaPar = (par) => [par[0].slice(), par[1].slice()];
  const clonar = (e) => ({
    ...e,
    maos: copiaPar(e.maos),
    jogos: [e.jogos[0].map((jg) => jg.slice()), e.jogos[1].map((jg) => jg.slice())],
    mortos: e.mortos.map((m) => m.slice()),
    lixo: e.lixo.slice(),
    monte: e.monte.slice(),
    pegouMorto: e.pegouMorto.slice(),
    mortoIntocado: e.mortoIntocado.slice(),
    conhecidas: copiaPar(e.conhecidas),
    descartes: copiaPar(e.descartes),
    placar: e.placar.map((p) => p.slice()),
    totais: e.totais.slice(),
    resumo: e.resumo ? JSON.parse(JSON.stringify(e.resumo)) : null,
  });

  // ---------- Regras da vez ----------

  const temMortoParaPegar = (e, j) => !e.pegouMorto[j] && e.mortos.length > 0;
  const podeBater = (e, j, jogos = e.jogos[j]) => e.pegouMorto[j] && temCanastraLimpa(jogos);

  /** O que acontece se a mão de [j] ficar vazia: "morto", "bater" ou null (não pode ficar sem cartas). */
  function podeEsvaziar(e, j, jogos = e.jogos[j]) {
    if (temMortoParaPegar(e, j)) return "morto";
    if (podeBater(e, j, jogos)) return "bater";
    return null;
  }

  /** Quem não pode ficar sem cartas precisa guardar 2: uma para descartar e outra na mão. */
  function motivoMao(e, j, jogosDepois, restantes) {
    if (restantes >= 2 || podeEsvaziar(e, j, jogosDepois)) return null;
    if (!e.pegouMorto[j]) {
      return "Os mortos acabaram e você não pegou nenhum, então não pode ficar sem cartas: guarde pelo menos 2 na mão (uma para descartar).";
    }
    return "Para bater você precisa de uma canastra limpa. Até lá, guarde pelo menos 2 cartas na mão (uma para descartar).";
  }

  function motivoFase(e, fase) {
    if (e.fase === "fim" || e.fase === "acabou") return "A rodada já terminou.";
    if (e.fase === fase) return null;
    if (fase === "jogar") return "Primeiro compre uma carta do monte ou pegue o lixo.";
    return "Você já comprou nesta vez: agora baixe jogos ou descarte uma carta.";
  }

  function cartasDaMao(mao, cartas) {
    return (
      Array.isArray(cartas) &&
      cartas.length > 0 &&
      cartas.every((id) => Number.isInteger(id) && mao.includes(id)) &&
      new Set(cartas).size === cartas.length
    );
  }

  function motivoComprar(e) {
    const f = motivoFase(e, "comprar");
    if (f) return f;
    if (!e.monte.length) return "O monte acabou.";
    return null;
  }

  /** Motivo para não juntar [cartas] ao jogo [indice] (ou para não formar um jogo novo, com null). */
  function motivoEncaixe(jogos, indice, cartas) {
    if (indice === null || indice === undefined) {
      const r = analisarJogo(cartas);
      return r.valido ? null : r.motivo;
    }
    if (!Number.isInteger(indice) || !jogos[indice]) return "Esse jogo não existe.";
    const r = analisarJogo([...jogos[indice], ...cartas]);
    if (r.valido) return null;
    const a = analisarJogo(jogos[indice]);
    const nome = NAIPES[a.naipe].nome;
    if (cartas.some((id) => !ehDois(id) && naipe(id) !== a.naipe)) return `Esse jogo é de ${nome}: só entram cartas de ${nome} ou um curinga.`;
    if (r.motivo === MSG_CURINGA || (r.motivo === MSG_BURACO && a.curinga !== null && cartas.some(ehDois))) return "Esse jogo já tem um curinga.";
    if (r.motivo === MSG_REPETIDA) return "Essa carta já está nesse jogo.";
    if (r.motivo.startsWith("Uma sequência tem no máximo")) return r.motivo;
    return `Essas cartas não continuam a sequência de ${descreverJogo(jogos[indice])}.`;
  }

  function jogosDepoisDe(jogos, indice, cartas) {
    const novos = jogos.map((jg) => jg.slice());
    if (indice === null || indice === undefined) novos.push(analisarJogo(cartas).ordem);
    else novos[indice] = analisarJogo([...jogos[indice], ...cartas]).ordem;
    return novos;
  }

  function motivoBaixar(e, cartas) {
    const f = motivoFase(e, "jogar");
    if (f) return f;
    const j = e.vez;
    if (!cartasDaMao(e.maos[j], cartas)) return "Escolha as cartas da sua mão.";
    const m = motivoEncaixe(e.jogos[j], null, cartas);
    if (m) return m;
    return motivoMao(e, j, jogosDepoisDe(e.jogos[j], null, cartas), e.maos[j].length - cartas.length);
  }

  function motivoAdicionar(e, indice, cartas) {
    const f = motivoFase(e, "jogar");
    if (f) return f;
    const j = e.vez;
    if (!cartasDaMao(e.maos[j], cartas)) return "Escolha na mão as cartas que vão para o jogo.";
    const m = motivoEncaixe(e.jogos[j], indice, cartas);
    if (m) return m;
    return motivoMao(e, j, jogosDepoisDe(e.jogos[j], indice, cartas), e.maos[j].length - cartas.length);
  }

  /**
   * Pegar o lixo inteiro. [uso] = { cartas, jogo } põe a carta de cima, com as [cartas] da mão, num
   * jogo novo (jogo null) ou no jogo [jogo]; no Fechado ele é obrigatório.
   */
  function motivoPegarLixo(e, uso = null) {
    const f = motivoFase(e, "comprar");
    if (f) return f;
    if (!e.lixo.length) return "O lixo está vazio.";
    if (!uso) return e.modo === "fechado" ? MSG_FECHADO : null;
    if (typeof uso !== "object" || !Array.isArray(uso.cartas)) return "Jogada inválida.";
    const j = e.vez;
    if (uso.cartas.length && !cartasDaMao(e.maos[j], uso.cartas)) return "Escolha as cartas da sua mão.";
    const t = topo(e.lixo);
    const cartas = [t, ...uso.cartas];
    const indice = uso.jogo === undefined ? null : uso.jogo;
    if (indice === null && uso.cartas.length < 2) {
      return `Para formar um jogo novo com o ${nomeCarta(t)}, escolha mais 2 cartas da mão que façam sequência com ele.`;
    }
    const m = motivoEncaixe(e.jogos[j], indice, cartas);
    if (m) return indice === null ? `O ${nomeCarta(t)} não forma jogo com as cartas escolhidas. ${m}` : m;
    const restantes = e.maos[j].length + e.lixo.length - cartas.length;
    return motivoMao(e, j, jogosDepoisDe(e.jogos[j], indice, cartas), restantes);
  }

  function motivoDescartar(e, carta) {
    const f = motivoFase(e, "jogar");
    if (f) return f;
    const j = e.vez;
    if (!Number.isInteger(carta) || !e.maos[j].includes(carta)) return "Escolha uma carta da sua mão para descartar.";
    if (e.maos[j].length === 1 && !podeEsvaziar(e, j)) return motivoMao(e, j, e.jogos[j], 0);
    return null;
  }

  function motivoAcao(e, acao) {
    if (!e || !acao || typeof acao !== "object") return "Jogada inválida.";
    switch (acao.tipo) {
      case "monte":
        return motivoComprar(e);
      case "lixo":
        return motivoPegarLixo(e, acao.uso || null);
      case "baixar":
        return motivoBaixar(e, acao.cartas);
      case "adicionar":
        return motivoAdicionar(e, acao.jogo, acao.cartas);
      case "descartar":
        return motivoDescartar(e, acao.carta);
      default:
        return "Jogada inválida.";
    }
  }

  // ---------- Jogadas ----------

  function pegarMorto(n, j, indireto) {
    n.maos[j] = n.mortos.pop();
    n.pegouMorto[j] = true;
    n.mortoIntocado[j] = indireto;
  }

  /** Depois de baixar: a mão vazia pega o morto (e a vez continua) ou bate. */
  function depoisDeBaixar(n, j) {
    if (n.maos[j].length) return;
    const tipo = podeEsvaziar(n, j);
    if (tipo === "morto") pegarMorto(n, j, false);
    else if (tipo === "bater") encerrarRodada(n, j);
  }

  function baixarNoEstado(n, j, indice, cartas) {
    n.maos[j] = n.maos[j].filter((id) => !cartas.includes(id));
    n.conhecidas[j] = n.conhecidas[j].filter((id) => !cartas.includes(id));
    n.jogos[j] = jogosDepoisDe(n.jogos[j], indice, cartas);
    if (cartas.includes(n.novaCarta)) n.novaCarta = null;
    depoisDeBaixar(n, j);
  }

  function comprarMonte(e) {
    if (motivoComprar(e)) return null;
    const n = clonar(e);
    const j = n.vez;
    const carta = n.monte.pop();
    n.maos[j].push(carta);
    n.novaCarta = carta;
    n.fase = "jogar";
    if (j === VOCE) n.iniciado = true;
    if (!n.monte.length) {
      // Com o monte vazio, um morto que ninguém pegou vira o monte; sem morto, esta é a última vez
      if (n.mortos.length) n.monte = n.mortos.pop();
      else n.ultimaVolta = true;
    }
    return n;
  }

  function pegarLixo(e, uso = null) {
    if (motivoPegarLixo(e, uso)) return null;
    const n = clonar(e);
    const j = n.vez;
    const lixo = n.lixo;
    const t = topo(lixo);
    n.lixo = [];
    n.maos[j].push(...lixo);
    n.conhecidas[j].push(...lixo);
    n.novaCarta = null;
    n.fase = "jogar";
    if (j === VOCE) n.iniciado = true;
    if (uso) baixarNoEstado(n, j, uso.jogo === undefined ? null : uso.jogo, [t, ...uso.cartas]);
    return n;
  }

  function baixarJogo(e, cartas) {
    if (motivoBaixar(e, cartas)) return null;
    const n = clonar(e);
    baixarNoEstado(n, n.vez, null, cartas);
    return n;
  }

  function adicionar(e, indice, cartas) {
    if (motivoAdicionar(e, indice, cartas)) return null;
    const n = clonar(e);
    baixarNoEstado(n, n.vez, indice, cartas);
    return n;
  }

  function passarVez(n) {
    n.vez = 1 - n.vez;
    n.fase = "comprar";
    n.mortoIntocado[n.vez] = false;
    n.novaCarta = null;
    n.turnos += 1;
  }

  function descartar(e, carta) {
    if (motivoDescartar(e, carta)) return null;
    const n = clonar(e);
    const j = n.vez;
    n.maos[j] = n.maos[j].filter((id) => id !== carta);
    n.conhecidas[j] = n.conhecidas[j].filter((id) => id !== carta);
    n.lixo.push(carta);
    n.descartes[j].push(carta);
    if (!n.maos[j].length) {
      if (podeEsvaziar(n, j) === "morto") {
        // Batida indireta: o morto vai para a mão, mas só pode ser usado na próxima vez
        pegarMorto(n, j, true);
      } else {
        encerrarRodada(n, j);
        return n;
      }
    }
    if (n.ultimaVolta) {
      encerrarRodada(n, null);
      return n;
    }
    passarVez(n);
    return n;
  }

  function aplicar(e, acao) {
    if (motivoAcao(e, acao)) return null;
    switch (acao.tipo) {
      case "monte":
        return comprarMonte(e);
      case "lixo":
        return pegarLixo(e, acao.uso || null);
      case "baixar":
        return baixarJogo(e, acao.cartas);
      case "adicionar":
        return adicionar(e, acao.jogo, acao.cartas);
      default:
        return descartar(e, acao.carta);
    }
  }

  // ---------- Fim da rodada ----------

  /**
   * Pontos de cada um: cartas dos jogos, bônus das canastras, 100 por bater, menos as cartas da mão
   * e menos 100 de quem não pegou o morto (se o outro pegou). O morto pego ao descartar a última
   * carta e ainda não usado conta como não pego, e as cartas dele não descontam.
   */
  function contarPontos(e, quemBateu) {
    const pegou = [0, 1].map((j) => e.pegouMorto[j] && !e.mortoIntocado[j]);
    const alguem = pegou[0] || pegou[1];
    return [0, 1].map((j) => {
      const analises = e.jogos[j].map(analisarJogo);
      const cartasMesa = e.jogos[j].reduce((s, jg) => s + somaPontos(jg), 0);
      const canastras = analises.reduce((s, a) => s + a.bonus, 0);
      const limpas = analises.filter((a) => a.canastra && a.limpo).length;
      const sujas = analises.filter((a) => a.canastra && !a.limpo).length;
      const bater = quemBateu === j ? PONTOS.bater : 0;
      const mao = e.mortoIntocado[j] ? 0 : 0 - somaPontos(e.maos[j]);
      const morto = alguem && !pegou[j] ? -PONTOS.morto : 0;
      return { cartasMesa, canastras, limpas, sujas, bater, mao, morto, total: cartasMesa + canastras + bater + mao + morto };
    });
  }

  function encerrarRodada(n, quemBateu) {
    const linhas = contarPontos(n, quemBateu);
    n.placar.push([linhas[0].total, linhas[1].total]);
    n.totais = [n.totais[0] + linhas[0].total, n.totais[1] + linhas[1].total];
    n.resumo = { rodada: n.rodada, bateu: quemBateu, linhas };
    n.fase = "fim";
    n.novaCarta = null;
    // Quem passar do alvo com mais pontos ganha; empatados, joga-se mais uma rodada
    if (Math.max(...n.totais) >= n.alvo && n.totais[0] !== n.totais[1]) {
      n.fase = "acabou";
      n.vencedor = n.totais[0] > n.totais[1] ? VOCE : COMPUTADOR;
    }
  }

  const terminouRodada = (e) => e.fase === "fim" || e.fase === "acabou";

  // ---------- Ajudas para a tela ----------

  /** Os seus jogos onde as [cartas] entram agora. */
  function jogosOndeCabe(e, cartas) {
    if (e.fase !== "jogar" || !cartas.length) return [];
    return e.jogos[e.vez].map((_, i) => i).filter((i) => !motivoAdicionar(e, i, cartas));
  }

  /** No Fechado (ou para pegar e baixar de uma vez): as maneiras de usar a carta de cima com as [cartas]. */
  function usosDoLixo(e, cartas = []) {
    if (e.fase !== "comprar" || !e.lixo.length) return [];
    const usos = [];
    if (cartas.length >= 2 && !motivoPegarLixo(e, { cartas, jogo: null })) usos.push({ cartas: cartas.slice(), jogo: null });
    e.jogos[e.vez].forEach((_, i) => {
      if (!motivoPegarLixo(e, { cartas: cartas.slice(), jogo: i })) usos.push({ cartas: cartas.slice(), jogo: i });
    });
    return usos;
  }

  /** A mão em ordem de naipe (ou de valor, com [porValor]) para mostrar na tela. */
  function ordenarMao(mao, porValor = false) {
    // Naipes alternando as cores; o Ás vem depois do Rei e os 2 (curingas) ficam no fim
    const ordemNaipe = [0, 1, 3, 2];
    const chave = (id) => {
      const v = valor(id);
      const posicao = v === 1 ? 14 : v;
      const n = ordemNaipe.indexOf(naipe(id));
      if (v === 2) return 10000 + n * 10;
      return porValor ? posicao * 10 + n : n * 100 + posicao;
    };
    return mao.slice().sort((a, b) => chave(a) - chave(b) || a - b);
  }

  // ---------- Computador ----------
  //
  // A jogada do computador (e a dica para você) só usa o que o jogador da vez pode saber: a própria
  // mão, os jogos na mesa, o lixo, quantas cartas o outro tem e quais ele pegou do lixo. Nunca olha a
  // mão do outro, o monte ou os mortos.

  const posicoesDe = (id) => (valor(id) === 1 ? [1, 14] : [valor(id)]);
  function distancia(a, b) {
    let d = 99;
    for (const pa of posicoesDe(a)) for (const pb of posicoesDe(b)) d = Math.min(d, Math.abs(pa - pb));
    return d;
  }

  /** Sequências naturais (sem curinga) que saem das cartas, a mais longa primeiro em cada naipe. */
  function acharSequencias(cartas) {
    const sequencias = [];
    let resto = cartas.slice().sort((a, b) => a - b);
    for (let s = 0; s < 4; s++) {
      for (;;) {
        const porPosicao = Array.from({ length: 15 }, () => []);
        let ases = 0;
        for (const id of resto) {
          if (naipe(id) !== s) continue;
          const v = valor(id);
          if (v === 1) {
            ases += 1;
            porPosicao[1].push(id);
            porPosicao[14].push(id);
          } else {
            porPosicao[v].push(id);
          }
        }
        let melhor = null;
        for (let ini = 1; ini <= 14; ini++) {
          if (!porPosicao[ini].length) continue;
          let fim = ini;
          while (fim < 14 && porPosicao[fim + 1].length) fim += 1;
          const a = ini;
          const b = a === 1 && fim === 14 && ases < 2 ? 13 : fim;
          if (b - a + 1 >= 3 && (!melhor || b - a > melhor.b - melhor.a)) melhor = { a, b };
          ini = fim;
        }
        if (!melhor) break;
        const seq = [];
        for (let p = melhor.a; p <= melhor.b; p++) {
          const livres = porPosicao[p].filter((id) => !seq.includes(id));
          seq.push(p === 14 ? livres[livres.length - 1] : livres[0]);
        }
        sequencias.push(seq);
        resto = resto.filter((id) => !seq.includes(id));
      }
    }
    return sequencias;
  }

  /** Junta ao jogo, sem curinga novo, todas as cartas da mão que continuam a sequência. */
  function extensaoNatural(jogo, mao) {
    const antes = analisarJogo(jogo);
    const junta = [];
    let cresceu = true;
    while (cresceu) {
      cresceu = false;
      for (const id of mao) {
        if (junta.includes(id)) continue;
        const r = analisarJogo([...jogo, ...junta, id]);
        if (r.valido && (r.limpo || !antes.limpo)) {
          junta.push(id);
          cresceu = true;
        }
      }
    }
    return junta;
  }

  /**
   * Plano de baixas sem gastar curinga: primeiro continua os jogos da mesa, depois forma as
   * sequências novas, e repete. Devolve as ações, as cartas que sobram e os jogos no fim.
   */
  function planoNatural(mao, jogos) {
    let resto = mao.slice().sort((a, b) => a - b);
    const sim = jogos.map((jg) => jg.slice());
    const acoes = [];
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (let i = 0; i < sim.length; i++) {
        const junta = extensaoNatural(sim[i], resto);
        if (!junta.length) continue;
        acoes.push({ tipo: "adicionar", jogo: i, cartas: junta });
        sim[i] = analisarJogo([...sim[i], ...junta]).ordem;
        resto = resto.filter((id) => !junta.includes(id));
        mudou = true;
      }
      for (const seq of acharSequencias(resto)) {
        acoes.push({ tipo: "baixar", cartas: seq });
        sim.push(analisarJogo(seq).ordem);
        resto = resto.filter((id) => !seq.includes(id));
        mudou = true;
      }
    }
    return { acoes, resto, jogos: sim };
  }

  const cartasUsadas = (acao) => (acao.tipo === "descartar" ? 1 : acao.cartas ? acao.cartas.length : 0);

  function vistaDoOponente(e, j) {
    const o = 1 - j;
    return {
      jogos: e.jogos[o],
      cartas: e.maos[o].length,
      conhecidas: e.conhecidas[o],
      descartes: e.descartes[o],
      pegouMorto: e.pegouMorto[o],
    };
  }

  /** O outro já pode bater e tem poucas cartas: a rodada pode acabar logo. */
  function oponentePerto(e, j) {
    const op = vistaDoOponente(e, j);
    return op.pegouMorto && temCanastraLimpa(op.jogos) && op.cartas <= 6;
  }

  const fimProximo = (e, j) => e.ultimaVolta || e.monte.length <= 12 || oponentePerto(e, j);

  function estimarMaoDoOponente(e, j) {
    const op = vistaDoOponente(e, j);
    return somaPontos(op.conhecidas) + (op.cartas - op.conhecidas.length) * 7;
  }

  /** Bate quando já está na frente nesta rodada, quando ganha a partida ou quando esperar é arriscado. */
  function querBater(e, j) {
    const o = 1 - j;
    const meus = pontosNaMesa(e.jogos[j]) + PONTOS.bater;
    const op = vistaDoOponente(e, j);
    const deles = pontosNaMesa(op.jogos) - estimarMaoDoOponente(e, j) - (op.pegouMorto ? 0 : PONTOS.morto);
    if (e.totais[j] + meus >= e.alvo && e.totais[j] + meus > e.totais[o] + deles) return true;
    if (meus >= deles) return true;
    return fimProximo(e, j);
  }

  /** Recusa baixar o que deixaria a mão com 0 ou 1 carta quando isso faria bater sem querer. */
  function aceitavel(e, j, acao, quer) {
    const restantes = e.maos[j].length - cartasUsadas(acao);
    return !(restantes <= 1 && e.pegouMorto[j] && !quer);
  }

  function opcoesDeCuringa(mao, jogos) {
    const curingas = mao.filter(ehDois);
    if (!curingas.length) return [];
    const w = curingas[0];
    const naturais = mao.filter((id) => !ehDois(id));
    const opcoes = [];
    jogos.forEach((jg, i) => {
      const a = analisarJogo(jg);
      if (!a.limpo) return;
      if (analisarJogo([...jg, w]).valido) opcoes.push({ tipo: "adicionar", jogo: i, cartas: [w] });
      for (const id of naturais) {
        if (naipe(id) === a.naipe && analisarJogo([...jg, id, w]).valido) opcoes.push({ tipo: "adicionar", jogo: i, cartas: [id, w] });
      }
    });
    for (let x = 0; x < naturais.length; x++) {
      for (let y = x + 1; y < naturais.length; y++) {
        const a = naturais[x];
        const b = naturais[y];
        if (naipe(a) !== naipe(b)) continue;
        const d = distancia(a, b);
        if (d >= 1 && d <= 2 && analisarJogo([a, b, w]).valido) opcoes.push({ tipo: "baixar", cartas: [a, b, w] });
      }
    }
    return opcoes;
  }

  function simular(mao, jogos, acao) {
    return {
      mao: mao.filter((id) => !acao.cartas.includes(id)),
      jogos: jogosDepoisDe(jogos, acao.tipo === "baixar" ? null : acao.jogo, acao.cartas),
    };
  }

  /** Curinga só quando vale a pena: para esvaziar a mão, fechar uma canastra ou no fim da rodada. */
  function escolherCuringa(e, j, quer) {
    const mao = e.maos[j];
    const jogos = e.jogos[j];
    const opcoes = opcoesDeCuringa(mao, jogos).filter((a) => !motivoAcao(e, a) && aceitavel(e, j, a, quer));
    if (!opcoes.length) return null;
    const temLimpa = temCanastraLimpa(jogos);
    const fim = fimProximo(e, j);
    const curingas = mao.filter(ehDois).length;
    const precisaMorto = temMortoParaPegar(e, j);
    if (precisaMorto || (quer && e.pegouMorto[j])) {
      for (const a of opcoes) {
        const s = simular(mao, jogos, a);
        if (planoNatural(s.mao, s.jogos).resto.length <= 1 && (precisaMorto || temCanastraLimpa(s.jogos))) return a;
      }
    }
    // Daqui em diante, nunca suja uma canastra que já é limpa
    const semSujarCanastra = opcoes.filter((a) => a.tipo === "baixar" || jogos[a.jogo].length < CANASTRA);
    // Fechar uma canastra suja só depois de ter a limpa que deixa bater (ou no fim da rodada)
    for (const a of semSujarCanastra) {
      if (a.tipo === "adicionar" && jogos[a.jogo].length + a.cartas.length >= CANASTRA && (temLimpa || fim || curingas >= 3)) return a;
    }
    if (fim || curingas >= 3 || (precisaMorto && mao.length <= 5)) {
      for (const a of semSujarCanastra) {
        if (a.tipo === "adicionar" && a.cartas.length === 2 && (temLimpa || fim || jogos[a.jogo].length < 4)) return a;
      }
      for (const a of semSujarCanastra) if (a.tipo === "baixar") return a;
    }
    return null;
  }

  /** Quanto a carta vale para quem a tem: curinga, vizinhas do mesmo naipe e jogos onde encaixa. */
  function utilidade(id, mao, jogos) {
    if (ehDois(id)) return 500;
    let u = 0;
    for (const jg of jogos) {
      if (extensaoNatural(jg, [id]).length) {
        u += 40;
        break;
      }
    }
    for (const outra of mao) {
      if (outra === id || ehDois(outra) || naipe(outra) !== naipe(id)) continue;
      const d = distancia(id, outra);
      if (d === 1) u += 24;
      else if (d === 2) u += 12;
      else if (d === 0) u += 2;
    }
    return u - pontosCarta(id) * 0.8;
  }

  /** Forma sequência de 3 com duas das [cartas]? */
  function fechaTrio(id, cartas) {
    const pos = new Set();
    for (const c of cartas) if (!ehDois(c) && naipe(c) === naipe(id) && c !== id) for (const p of posicoesDe(c)) pos.add(p);
    return posicoesDe(id).some((p) => (pos.has(p - 2) && pos.has(p - 1)) || (pos.has(p - 1) && pos.has(p + 1)) || (pos.has(p + 1) && pos.has(p + 2)));
  }

  /** Quanto a carta ajudaria o outro se fosse para o lixo: jogos dele, cartas que ele pegou, o que ele já descartou. */
  function perigo(e, j, id) {
    const op = vistaDoOponente(e, j);
    let p = ehDois(id) ? 60 : 0;
    for (const jg of op.jogos) {
      if (jogoValido([...jg, id])) {
        p += 45;
        break;
      }
    }
    if (!ehDois(id)) {
      const conhecidas = op.conhecidas.filter((c) => !ehDois(c) && naipe(c) === naipe(id));
      if (fechaTrio(id, conhecidas)) p += 40;
      else for (const c of conhecidas) p += distancia(id, c) <= 2 ? 10 : 0;
      let frio = 0;
      for (const c of op.descartes.slice(-12)) if (!ehDois(c) && naipe(c) === naipe(id) && distancia(c, id) <= 2) frio += 6;
      p -= Math.min(frio, 18);
    }
    // No Aberto, quem pega o lixo leva todas as cartas dele
    if (e.modo === "aberto") p *= 1 + Math.min(e.lixo.length, 12) / 8;
    return p;
  }

  function escolherDescarte(e, j) {
    const mao = e.maos[j];
    let melhor = null;
    for (const id of mao) {
      if (motivoDescartar(e, id)) continue;
      const nota = utilidade(id, mao, e.jogos[j]) + perigo(e, j, id);
      if (!melhor || nota < melhor.nota - 1e-9 || (Math.abs(nota - melhor.nota) < 1e-9 && pontosCarta(id) > pontosCarta(melhor.id))) {
        melhor = { id, nota };
      }
    }
    return melhor ? melhor.id : mao[0];
  }

  /** Maneiras de usar a carta de cima do lixo agora (no Fechado é preciso uma delas). */
  function usosPossiveisDoLixo(e, j) {
    const t = topo(e.lixo);
    const mao = e.maos[j];
    const usos = [];
    const vistos = new Set();
    const juntar = (uso) => {
      const chave = `${uso.jogo}|${uso.cartas.slice().sort((a, b) => a - b).join(",")}`;
      if (vistos.has(chave) || motivoPegarLixo(e, uso)) return;
      vistos.add(chave);
      usos.push(uso);
    };
    e.jogos[j].forEach((jg, i) => {
      if (jogoValido([...jg, t])) {
        juntar({ cartas: extensaoNatural([...jg, t], mao), jogo: i });
        juntar({ cartas: [], jogo: i });
      }
    });
    if (!ehDois(t)) {
      for (const seq of acharSequencias([...mao.filter((id) => naipe(id) === naipe(t)), t])) {
        if (seq.includes(t)) juntar({ cartas: seq.filter((id) => id !== t), jogo: null });
      }
      const curinga = mao.find(ehDois);
      if (curinga !== undefined) {
        for (const id of mao) if (!ehDois(id) && naipe(id) === naipe(t) && distancia(id, t) <= 2) juntar({ cartas: [id, curinga], jogo: null });
      }
    } else {
      const naturais = mao.filter((id) => !ehDois(id));
      for (let x = 0; x < naturais.length; x++) {
        for (let y = x + 1; y < naturais.length; y++) {
          if (naipe(naturais[x]) === naipe(naturais[y]) && distancia(naturais[x], naturais[y]) <= 2) juntar({ cartas: [naturais[x], naturais[y]], jogo: null });
        }
      }
    }
    return usos;
  }

  /** Quanto o lixo melhora a mão: cartas que descem já, curingas, canastras novas, menos o que sobra. */
  function valorDoLixo(e, j, uso) {
    const mao = e.maos[j];
    const jogos = e.jogos[j];
    const lixo = e.lixo;
    const t = topo(lixo);
    const antes = planoNatural(mao, jogos);
    const baixadasAntes = mao.length - antes.resto.length;
    let maoDepois = [...mao, ...lixo];
    let jogosDepois = jogos;
    let usadas = 0;
    let custo = 0;
    if (uso) {
      const cartas = [t, ...uso.cartas];
      maoDepois = maoDepois.filter((id) => !cartas.includes(id));
      jogosDepois = jogosDepoisDe(jogos, uso.jogo, cartas);
      usadas = cartas.length;
      if (uso.cartas.some(ehDois) || (ehDois(t) && uso.jogo === null)) custo += 15;
    }
    const depois = planoNatural(maoDepois, jogosDepois);
    const baixadasDepois = maoDepois.length - depois.resto.length + usadas;
    const ganho = baixadasDepois - baixadasAntes;
    const curingas = lixo.filter(ehDois).length;
    const doLixoNaMao = depois.resto.filter((id) => lixo.includes(id) && !ehDois(id));
    const vizinhas = doLixoNaMao.filter((id) => depois.resto.some((o) => o !== id && !ehDois(o) && naipe(o) === naipe(id) && distancia(o, id) <= 2)).length;
    const sobra = doLixoNaMao.length - vizinhas;
    const canastras = (lista) => lista.filter((jg) => jg.length >= CANASTRA).length;
    const novas = canastras(depois.jogos) - canastras(antes.jogos);
    const risco = fimProximo(e, j) ? 3 : 1;
    const peso = 2 * risco + (temMortoParaPegar(e, j) ? 2 : 0);
    // Lixo grande no começo da rodada é material para mais canastras
    const material = !fimProximo(e, j) && lixo.length >= 4 ? 2 * lixo.length : 0;
    const nota = 10 * ganho + 25 * curingas + 30 * novas + 4 * vizinhas + material - peso * sobra - custo;
    return { nota, ganho, curingas };
  }

  function decidirCompra(e, j) {
    if (!e.lixo.length) return { tipo: "monte" };
    const usos = e.modo === "fechado" ? usosPossiveisDoLixo(e, j) : [null];
    let melhor = null;
    for (const uso of usos) {
      if (motivoPegarLixo(e, uso)) continue;
      const v = valorDoLixo(e, j, uso);
      // Sem carta que desça já, só vale pegar curinga ou um lixo grande (assim ninguém fica
      // pegando e devolvendo a mesma carta para sempre)
      if (v.ganho < 1 && v.curingas < 1 && e.lixo.length < 4) continue;
      if (!melhor || v.nota > melhor.nota) melhor = { uso, nota: v.nota };
    }
    if (melhor && melhor.nota > 6) return { tipo: "lixo", uso: melhor.uso };
    if (!e.monte.length) return melhor ? { tipo: "lixo", uso: melhor.uso } : null;
    return { tipo: "monte" };
  }

  function decidirJogada(e, j) {
    const quer = querBater(e, j);
    const plano = planoNatural(e.maos[j], e.jogos[j]);
    for (const acao of plano.acoes) if (!motivoAcao(e, acao) && aceitavel(e, j, acao, quer)) return acao;
    const curinga = escolherCuringa(e, j, quer);
    if (curinga) return curinga;
    return { tipo: "descartar", carta: escolherDescarte(e, j) };
  }

  /** A próxima ação do jogador da vez: { tipo: "monte" | "lixo" | "baixar" | "adicionar" | "descartar", ... }. */
  function proximaAcao(e) {
    if (e.fase === "comprar") return decidirCompra(e, e.vez);
    if (e.fase === "jogar") return decidirJogada(e, e.vez);
    return null;
  }

  // ---------- Salvar e restaurar ----------

  const inteiro = (v, min = 0) => Number.isInteger(v) && v >= min;
  const carta = (id) => inteiro(id) && id < CARTAS;
  const listaDeCartas = (l) => Array.isArray(l) && l.every(carta);
  const par = (v, teste) => Array.isArray(v) && v.length === 2 && v.every(teste);
  const booleano = (v) => v === true || v === false;

  function linhaValida(l) {
    if (!l || typeof l !== "object") return false;
    const campos = ["cartasMesa", "canastras", "limpas", "sujas", "bater", "mao", "morto", "total"];
    if (!campos.every((c) => Number.isInteger(l[c]))) return false;
    return l.cartasMesa + l.canastras + l.bater + l.mao + l.morto === l.total;
  }

  /** Confere um estado salvo: as 104 cartas uma vez só, jogos válidos e cada campo no formato certo. */
  function restaurar(salvo) {
    const s = salvo;
    if (!s || typeof s !== "object" || s.versao !== 1) return null;
    if (!MODOS.includes(s.modo) || !ALVOS.includes(s.alvo) || !inteiro(s.semente, 1) || !inteiro(s.rodada, 1)) return null;
    if (![0, 1].includes(s.inicial) || ![0, 1].includes(s.vez) || !FASES.includes(s.fase)) return null;
    if (!par(s.maos, listaDeCartas) || !par(s.conhecidas, listaDeCartas) || !par(s.descartes, listaDeCartas)) return null;
    if (!par(s.jogos, (lista) => Array.isArray(lista) && lista.every(listaDeCartas))) return null;
    if (!listaDeCartas(s.monte) || !listaDeCartas(s.lixo)) return null;
    if (!Array.isArray(s.mortos) || s.mortos.length > 2 || !s.mortos.every((m) => listaDeCartas(m) && m.length === NO_MORTO)) return null;
    if (!par(s.pegouMorto, booleano) || !par(s.mortoIntocado, booleano) || !booleano(s.ultimaVolta)) return null;
    const todas = [...s.maos[0], ...s.maos[1], ...s.jogos[0].flat(), ...s.jogos[1].flat(), ...s.monte, ...s.lixo, ...s.mortos.flat()];
    if (todas.length !== CARTAS || new Set(todas).size !== CARTAS) return null;
    for (const lado of s.jogos) for (const jg of lado) if (!jogoValido(jg)) return null;
    for (const j of [0, 1]) {
      if (!s.conhecidas[j].every((id) => s.maos[j].includes(id))) return null;
      if (s.mortoIntocado[j] && !s.pegouMorto[j]) return null;
    }
    if (s.mortos.length + s.pegouMorto.filter(Boolean).length > 2) return null;
    const emJogo = s.fase === "comprar" || s.fase === "jogar";
    if (emJogo) {
      if (!s.maos[s.vez].length || !s.maos[1 - s.vez].length) return null;
      if (s.fase === "comprar" && !s.monte.length) return null;
      if (s.ultimaVolta && (s.monte.length || s.mortos.length || s.fase === "comprar")) return null;
    }
    if (s.novaCarta !== null && !carta(s.novaCarta)) return null;
    if (!Array.isArray(s.placar) || !s.placar.every((p) => par(p, Number.isInteger))) return null;
    if (!par(s.totais, Number.isInteger)) return null;
    const soma = [0, 1].map((j) => s.placar.reduce((t, p) => t + p[j], 0));
    if (soma[0] !== s.totais[0] || soma[1] !== s.totais[1]) return null;
    if (emJogo && s.placar.length !== s.rodada - 1) return null;
    if (!emJogo) {
      if (s.placar.length !== s.rodada) return null;
      const r = s.resumo;
      if (!r || r.rodada !== s.rodada || ![null, 0, 1].includes(r.bateu) || !par(r.linhas, linhaValida)) return null;
      const ultima = s.placar[s.placar.length - 1];
      if (r.linhas[0].total !== ultima[0] || r.linhas[1].total !== ultima[1]) return null;
    }
    if (s.fase === "acabou") {
      if (![0, 1].includes(s.vencedor) || s.totais[s.vencedor] <= s.totais[1 - s.vencedor] || Math.max(...s.totais) < s.alvo) return null;
    } else if (s.vencedor !== null) {
      return null;
    }
    if (!inteiro(s.turnos)) return null;
    const limpo = clonar({ ...s, resumo: emJogo ? null : s.resumo, iniciado: s.iniciado === true });
    limpo.jogos = [s.jogos[0].map((jg) => analisarJogo(jg).ordem), s.jogos[1].map((jg) => analisarJogo(jg).ordem)];
    return {
      versao: 1,
      modo: limpo.modo,
      alvo: limpo.alvo,
      semente: limpo.semente,
      rodada: limpo.rodada,
      inicial: limpo.inicial,
      vez: limpo.vez,
      fase: limpo.fase,
      maos: limpo.maos,
      jogos: limpo.jogos,
      mortos: limpo.mortos,
      lixo: limpo.lixo,
      monte: limpo.monte,
      pegouMorto: limpo.pegouMorto,
      mortoIntocado: limpo.mortoIntocado,
      ultimaVolta: limpo.ultimaVolta,
      conhecidas: limpo.conhecidas,
      descartes: limpo.descartes,
      novaCarta: emJogo && limpo.maos[limpo.vez].includes(limpo.novaCarta) ? limpo.novaCarta : null,
      turnos: limpo.turnos,
      resumo: limpo.resumo,
      placar: limpo.placar,
      totais: limpo.totais,
      vencedor: limpo.vencedor,
      iniciado: limpo.iniciado,
    };
  }

  // ---------- Estatísticas ----------

  const estatisticasVazias = () => ({
    jogadas: 0,
    vitorias: 0,
    maiorPontuacao: null,
    sequencia: 0,
    melhorSequencia: 0,
  });

  function lerEstatisticas(salvas) {
    const limpo = estatisticasVazias();
    if (!salvas || typeof salvas !== "object") return limpo;
    for (const campo of ["jogadas", "vitorias", "sequencia", "melhorSequencia"]) {
      if (inteiro(salvas[campo])) limpo[campo] = salvas[campo];
    }
    if (Number.isInteger(salvas.maiorPontuacao)) limpo.maiorPontuacao = salvas.maiorPontuacao;
    limpo.vitorias = Math.min(limpo.vitorias, limpo.jogadas);
    limpo.sequencia = Math.min(limpo.sequencia, limpo.vitorias);
    limpo.melhorSequencia = Math.max(limpo.melhorSequencia, limpo.sequencia);
    return limpo;
  }

  /** Soma uma partida; [pontos] só vem nas partidas terminadas. Devolve as estatísticas e se a pontuação virou recorde. */
  function registrarResultado(estatisticas, { venceu, pontos = null }) {
    const e = { ...lerEstatisticas(estatisticas) };
    const recordes = { pontos: false };
    e.jogadas += 1;
    if (venceu) {
      e.vitorias += 1;
      e.sequencia += 1;
      e.melhorSequencia = Math.max(e.melhorSequencia, e.sequencia);
    } else {
      e.sequencia = 0;
    }
    if (Number.isInteger(pontos) && (e.maiorPontuacao === null || pontos > e.maiorPontuacao)) {
      recordes.pontos = e.maiorPontuacao !== null;
      e.maiorPontuacao = pontos;
    }
    return { estatisticas: e, recordes };
  }

  const porcentagemVitorias = (e) => (e.jogadas ? Math.round((100 * e.vitorias) / e.jogadas) : 0);

  return {
    NAIPES,
    MODOS,
    MODO_PADRAO,
    ALVOS,
    ALVO_PADRAO,
    CARTAS,
    NA_MAO,
    NO_MORTO,
    CANASTRA,
    PONTOS,
    NOME_COMPUTADOR,
    VOCE,
    COMPUTADOR,
    MSG_SEQUENCIA,
    MSG_FECHADO,
    valor,
    naipe,
    vermelha,
    ehDois,
    textoValor,
    nomeCarta,
    listarCartas,
    pontosCarta,
    somaPontos,
    textoModo,
    textoAlvo,
    chaveModo,
    topo,
    analisarJogo,
    jogoValido,
    descreverJogo,
    tipoCanastra,
    ehCanastraLimpa,
    temCanastraLimpa,
    pontosDoJogo,
    pontosNaMesa,
    aleatorioComSemente,
    novaSemente,
    novoJogo,
    novaRodada,
    temMortoParaPegar,
    podeBater,
    podeEsvaziar,
    motivoComprar,
    motivoPegarLixo,
    motivoBaixar,
    motivoAdicionar,
    motivoDescartar,
    motivoAcao,
    comprarMonte,
    pegarLixo,
    baixarJogo,
    adicionar,
    descartar,
    aplicar,
    contarPontos,
    terminouRodada,
    jogosOndeCabe,
    usosDoLixo,
    ordenarMao,
    acharSequencias,
    planoNatural,
    usosPossiveisDoLixo,
    querBater,
    proximaAcao,
    restaurar,
    estatisticasVazias,
    lerEstatisticas,
    registrarResultado,
    porcentagemVitorias,
    formatarNumero,
  };
})();

if (typeof module === "object") module.exports = LogicaBuraco;
