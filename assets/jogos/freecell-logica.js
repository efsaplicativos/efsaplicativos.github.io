"use strict";
/*
 * FreeCell: regras, distribuição numerada, dica e estatísticas, sem nada de tela.
 *
 * As 52 cartas são numeradas de 0 a 51: valor = id / 4 + 1 (1 é o Ás, 13 o Rei) e naipe = id % 4
 * (0 paus, 1 ouros, 2 copas, 3 espadas). É a numeração da distribuição clássica do FreeCell: o
 * número da partida é a semente de um gerador simples (multiplica por 214013, soma 2531011), e a
 * mesma partida sai igual aqui e nos outros jogos que usam essa numeração.
 *
 * Estado da partida (só listas de números, para salvar em JSON):
 *   colunas: as 8 colunas; a última carta da lista é a de cima, a única que se joga sozinha.
 *   celulas: as 4 células livres, cada uma com uma carta ou null.
 *   fundacoes: uma por naipe, na ordem dos naipes, do Ás para cima.
 *
 * Regras: todas as cartas ficam abertas. Na coluna, uma carta vai sobre outra de valor um acima e
 * de cor diferente; coluna vazia aceita qualquer carta. Cada célula guarda uma carta. A fundação
 * de cada naipe sobe do Ás ao Rei, e carta que entrou nela não volta. Uma sequência em ordem,
 * alternando as cores, se move junta se houver espaço para movê-la carta por carta: (células
 * livres + 1) vezes 2 para cada coluna vazia que não seja o destino. Ganha quem levar as 52
 * cartas para as fundações.
 */
const LogicaFreeCell = (() => {
  const NAIPES = [
    { id: "paus", nome: "paus", vermelho: false },
    { id: "ouros", nome: "ouros", vermelho: true },
    { id: "copas", nome: "copas", vermelho: true },
    { id: "espadas", nome: "espadas", vermelho: false },
  ];
  const VALORES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const NOMES_VALOR = ["Ás", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Valete", "Dama", "Rei"];
  const COLUNAS = 8;
  const CELULAS = 4;
  const CARTAS = 52;
  const MAIOR_PARTIDA = 1000000;

  const valor = (id) => Math.floor(id / 4) + 1;
  const naipe = (id) => id % 4;
  const vermelha = (id) => NAIPES[naipe(id)].vermelho;
  const textoValor = (id) => VALORES[valor(id) - 1];
  const nomeCarta = (id) => `${NOMES_VALOR[valor(id) - 1]} de ${NAIPES[naipe(id)].nome}`;
  const topo = (lista) => (lista.length ? lista[lista.length - 1] : null);
  /** [carta] pode ficar sobre [baixo]: um valor abaixo e da outra cor. */
  const encaixa = (baixo, carta) => valor(baixo) === valor(carta) + 1 && vermelha(baixo) !== vermelha(carta);

  // ---------- Distribuição numerada ----------

  const partidaValida = (n) => Number.isInteger(n) && n >= 1 && n <= MAIOR_PARTIDA;
  const novaSemente = (aleatorio = Math.random) => 1 + Math.floor(aleatorio() * MAIOR_PARTIDA);

  /** A ordem clássica das cartas da partida [numero]: a carta i vai para a coluna i % 8. */
  function baralhoDaPartida(numero) {
    let semente = numero % 2147483648;
    const sortear = () => {
      semente = (semente * 214013 + 2531011) % 2147483648;
      return Math.floor(semente / 65536);
    };
    const baralho = [...Array(CARTAS).keys()].reverse();
    for (let i = 0; i < CARTAS - 1; i++) {
      const j = CARTAS - 1 - (sortear() % (CARTAS - i));
      [baralho[i], baralho[j]] = [baralho[j], baralho[i]];
    }
    return baralho;
  }

  /** Abre as 52 cartas em 8 colunas: as quatro primeiras com 7 cartas e as outras com 6. */
  function novoJogo(numero) {
    const colunas = [...Array(COLUNAS)].map(() => []);
    baralhoDaPartida(numero).forEach((id, i) => colunas[i % COLUNAS].push(id));
    return {
      semente: numero,
      colunas,
      celulas: [null, null, null, null],
      fundacoes: [[], [], [], []],
      movimentos: 0,
      segundos: 0,
      iniciado: false,
    };
  }

  const clonar = (e) => ({
    ...e,
    colunas: e.colunas.map((c) => c.slice()),
    celulas: e.celulas.slice(),
    fundacoes: e.fundacoes.map((f) => f.slice()),
  });

  const naFundacao = (e) => e.fundacoes.reduce((soma, f) => soma + f.length, 0);
  const celulasLivres = (e) => e.celulas.filter((c) => c === null).length;
  const colunasVazias = (e) => e.colunas.filter((c) => !c.length).length;

  /** Quantas cartas se movem juntas; indo para uma coluna vazia, ela não conta como espaço. */
  const capacidade = (e, paraColunaVazia = false) =>
    (celulasLivres(e) + 1) * 2 ** Math.max(0, colunasVazias(e) - (paraColunaVazia ? 1 : 0));

  // ---------- Onde está cada carta ----------

  function localizar(e, id) {
    for (let c = 0; c < COLUNAS; c++) {
      const posicao = e.colunas[c].indexOf(id);
      if (posicao >= 0) return { tipo: "coluna", indice: c, posicao };
    }
    const celula = e.celulas.indexOf(id);
    if (celula >= 0) return { tipo: "celula", indice: celula };
    for (let f = 0; f < e.fundacoes.length; f++) {
      const posicao = e.fundacoes[f].indexOf(id);
      if (posicao >= 0) return { tipo: "fundacao", indice: f, posicao };
    }
    return null;
  }

  /** Cada carta encaixa na de baixo: um valor abaixo e da outra cor. */
  function sequenciaAlternada(ids) {
    for (let i = 1; i < ids.length; i++) if (!encaixa(ids[i - 1], ids[i])) return false;
    return true;
  }

  /** Onde começa a sequência alternada que está no alto da coluna [c]. */
  function inicioDaSequencia(e, c) {
    const coluna = e.colunas[c];
    if (!coluna.length) return 0;
    let p = coluna.length - 1;
    while (p > 0 && encaixa(coluna[p - 1], coluna[p])) p--;
    return p;
  }

  /** Cartas que saem juntas ao pegar [id]: ela e as de cima, se estiverem em sequência; ou a da célula. */
  function cartasParaMover(e, id) {
    const local = localizar(e, id);
    if (!local || local.tipo === "fundacao") return null;
    if (local.tipo === "celula") return [id];
    const ids = e.colunas[local.indice].slice(local.posicao);
    return sequenciaAlternada(ids) ? ids : null;
  }

  const aceitaNaFundacao = (e, id) => e.fundacoes[naipe(id)].length === valor(id) - 1;

  function podeMover(e, id, destino) {
    const ids = cartasParaMover(e, id);
    if (!ids || !destino) return false;
    const local = localizar(e, id);
    if (destino.tipo === "fundacao") {
      return ids.length === 1 && destino.indice === naipe(id) && aceitaNaFundacao(e, id);
    }
    if (destino.tipo === "celula") {
      return ids.length === 1 && local.tipo === "coluna" && e.celulas[destino.indice] === null;
    }
    if (destino.tipo !== "coluna") return false;
    const coluna = e.colunas[destino.indice];
    if (!coluna || (local.tipo === "coluna" && local.indice === destino.indice)) return false;
    if (!coluna.length) return ids.length <= capacidade(e, true);
    return encaixa(topo(coluna), ids[0]) && ids.length <= capacidade(e, false);
  }

  // ---------- Jogadas ----------

  function tirar(n, local) {
    if (local.tipo === "celula") {
      const id = n.celulas[local.indice];
      n.celulas[local.indice] = null;
      return [id];
    }
    return n.colunas[local.indice].splice(local.posicao);
  }

  /** Move [id] (com as cartas de cima dela) para { tipo: "coluna" | "celula" | "fundacao", indice }. */
  function mover(e, id, destino) {
    if (!podeMover(e, id, destino)) return null;
    const n = clonar(e);
    const ids = tirar(n, localizar(e, id));
    if (destino.tipo === "fundacao") n.fundacoes[destino.indice].push(id);
    else if (destino.tipo === "celula") n.celulas[destino.indice] = id;
    else n.colunas[destino.indice].push(...ids);
    n.movimentos += 1;
    n.iniciado = true;
    return n;
  }

  /** Cartas que podem ir agora para a fundação: as de cima das colunas e as das células. */
  function cartasLivres(e) {
    const livres = e.colunas.filter((c) => c.length).map(topo);
    for (const id of e.celulas) if (id !== null) livres.push(id);
    return livres;
  }

  /**
   * Subir a carta não atrapalha: nenhuma carta que ainda está na mesa precisaria dela. Vale para
   * Ás e 2 e para as cartas cujos valores um abaixo, da outra cor, já estão nas duas fundações.
   */
  function seguroSubir(e, id) {
    const v = valor(id);
    if (v <= 2) return true;
    return e.fundacoes.every((f, s) => NAIPES[s].vermelho === vermelha(id) || f.length >= v - 1);
  }

  /** Cada coluna desce do fundo para o alto: dá para terminar só subindo cartas. */
  const podeTerminarSozinho = (e) =>
    e.colunas.every((coluna) => coluna.every((id, i) => i === 0 || valor(id) <= valor(coluna[i - 1])));

  /**
   * Sobe sozinho para a fundação o que não faz falta na mesa e, se a partida já está resolvida,
   * todo o resto. Devolve o novo estado e as cartas que subiram, em ordem. Não conta movimentos.
   */
  function subirSozinhas(e) {
    let n = e;
    const ids = [];
    for (;;) {
      const terminar = podeTerminarSozinho(n);
      const id = cartasLivres(n)
        .filter((c) => aceitaNaFundacao(n, c) && (terminar || seguroSubir(n, c)))
        .sort((a, b) => valor(a) - valor(b))[0];
      if (id === undefined) break;
      n = clonar(n);
      tirar(n, localizar(n, id));
      n.fundacoes[naipe(id)].push(id);
      ids.push(id);
    }
    return { estado: n, ids };
  }

  /**
   * Para onde a carta vai com um toque: para a fundação, depois sobre uma carta de outra coluna,
   * depois para uma coluna vazia (se ela não for já a coluna inteira) e, por fim, para uma célula.
   */
  function melhorDestino(e, id) {
    const ids = cartasParaMover(e, id);
    if (!ids) return null;
    const local = localizar(e, id);
    if (ids.length === 1 && aceitaNaFundacao(e, id)) return { tipo: "fundacao", indice: naipe(id) };
    const origem = local.tipo === "coluna" ? local.indice : -1;
    let vazia = null;
    for (let k = 1; k <= COLUNAS; k++) {
      const d = (origem + k + COLUNAS) % COLUNAS;
      const destino = { tipo: "coluna", indice: d };
      if (!podeMover(e, id, destino)) continue;
      if (e.colunas[d].length) return destino;
      if (vazia === null) vazia = destino;
    }
    if (vazia && (local.tipo === "celula" || local.posicao > 0)) return vazia;
    const livre = e.celulas.indexOf(null);
    if (local.tipo === "coluna" && ids.length === 1 && livre >= 0) return { tipo: "celula", indice: livre };
    return null;
  }

  const venceu = (e) => naFundacao(e) === CARTAS;

  /** Alguma jogada é possível (passar uma carta de uma célula para outra não conta). */
  function temJogada(e) {
    if (venceu(e)) return false;
    const ids = cartasLivres(e);
    const destinos = [
      ...e.colunas.map((_, indice) => ({ tipo: "coluna", indice })),
      ...e.celulas.map((_, indice) => ({ tipo: "celula", indice })),
      ...e.fundacoes.map((_, indice) => ({ tipo: "fundacao", indice })),
    ];
    return ids.some((id) => destinos.some((d) => podeMover(e, id, d)));
  }

  // ---------- Dica ----------

  /**
   * A jogada mais útil agora. Em ordem: subir uma carta que não faz falta, tirar uma carta da
   * célula para cima de outra, tirar uma sequência de cima de uma carta em que ela não encaixa,
   * esvaziar uma coluna, subir qualquer carta, usar uma coluna vazia e, por último, guardar numa
   * célula uma carta que não encaixa na de baixo.
   *
   * Cada jogada sugerida tira uma carta da mesa ou diminui (3 × cartas fora de sequência + 2 ×
   * células ocupadas − colunas vazias), então seguir a dica nunca anda em círculos.
   * Devolve { id, destino } ou null quando não há nada útil.
   */
  function dica(e) {
    if (venceu(e)) return null;
    let melhor = null;
    const considerar = (prioridade, id, destino) => {
      if (!melhor || prioridade > melhor.prioridade) melhor = { prioridade, id, destino };
    };

    for (const id of cartasLivres(e)) {
      if (aceitaNaFundacao(e, id)) considerar(seguroSubir(e, id) ? 100 : 70, id, { tipo: "fundacao", indice: naipe(id) });
    }
    e.celulas.forEach((id) => {
      if (id === null) return;
      for (let d = 0; d < COLUNAS; d++) {
        const destino = { tipo: "coluna", indice: d };
        if (podeMover(e, id, destino)) considerar(e.colunas[d].length ? 90 : 50, id, destino);
      }
    });
    e.colunas.forEach((coluna, c) => {
      if (!coluna.length) return;
      const p = inicioDaSequencia(e, c);
      const id = coluna[p];
      // A sequência está sobre uma carta em que não encaixa (p > 0, pois em p - 1 a sequência parou)
      const quebrada = p > 0;
      // Desempate: a coluna que fica mais curta está mais perto de esvaziar
      const bonus = Math.max(0, 6 - p) * 0.5;
      for (let d = 0; d < COLUNAS; d++) {
        const destino = { tipo: "coluna", indice: d };
        if (d === c || !podeMover(e, id, destino)) continue;
        if (e.colunas[d].length) considerar(quebrada ? 80 + bonus : 75, id, destino);
        else if (quebrada) considerar(60 + bonus, id, destino);
      }
      const livre = e.celulas.indexOf(null);
      if (livre >= 0 && coluna.length > 1 && !encaixa(coluna[coluna.length - 2], topo(coluna))) {
        considerar(40 + bonus, topo(coluna), { tipo: "celula", indice: livre });
      }
    });
    return melhor ? { id: melhor.id, destino: melhor.destino } : null;
  }

  // ---------- Resolver a partida ----------

  /** Identifica a posição: as células e as colunas em qualquer ordem dão a mesma chave. */
  function chave(e) {
    const celulas = e.celulas.filter((id) => id !== null).sort((a, b) => a - b).join(",");
    return `${celulas}|${e.colunas.map((c) => c.join(",")).sort().join("|")}`;
  }

  /**
   * Quanto falta, por estimativa: cartas fora da fundação, cartas sobre outra de valor menor
   * (vão ter de sair dali), células ocupadas e cartas em cima das próximas que sobem.
   */
  function distancia(e) {
    let presas = 0;
    let enterradas = 0;
    for (const coluna of e.colunas) {
      let menor = 99;
      coluna.forEach((id, i) => {
        const v = valor(id);
        if (v > menor) presas += 1;
        else menor = v;
        if (e.fundacoes[naipe(id)].length === v - 1) enterradas += coluna.length - 1 - i;
      });
    }
    return CARTAS - naFundacao(e) + 2 * presas + 2 * (CELULAS - celulasLivres(e)) + enterradas;
  }

  /** As jogadas que valem a pena testar: colunas vazias e células livres iguais contam uma vez. */
  function jogadasParaResolver(e) {
    const jogadas = [];
    const vazia = e.colunas.findIndex((c) => !c.length);
    const livre = e.celulas.indexOf(null);
    const tentar = (id, destino) => podeMover(e, id, destino) && jogadas.push({ id, destino });
    for (const id of cartasLivres(e)) if (aceitaNaFundacao(e, id)) jogadas.push({ id, destino: { tipo: "fundacao", indice: naipe(id) } });
    e.celulas.forEach((id) => {
      if (id === null) return;
      e.colunas.forEach((coluna, d) => coluna.length && tentar(id, { tipo: "coluna", indice: d }));
      if (vazia >= 0) tentar(id, { tipo: "coluna", indice: vazia });
    });
    e.colunas.forEach((coluna, c) => {
      for (let p = inicioDaSequencia(e, c); p < coluna.length; p++) {
        const id = coluna[p];
        e.colunas.forEach((alvo, d) => alvo.length && d !== c && tentar(id, { tipo: "coluna", indice: d }));
        if (vazia >= 0 && p > 0) tentar(id, { tipo: "coluna", indice: vazia });
      }
      if (coluna.length && livre >= 0) tentar(topo(coluna), { tipo: "celula", indice: livre });
    });
    return jogadas;
  }

  /**
   * Procura uma solução a partir de [e], olhando primeiro as posições que parecem mais perto do
   * fim (busca gulosa com memória das posições já vistas). Cada passo é uma jogada seguida das
   * cartas que sobem sozinhas, como no jogo.
   *
   * A busca anda aos pedaços: continuar(n) examina até n posições e devolve a lista de jogadas
   * quando acha, null quando desiste (passou do [limite] de posições) ou undefined se ainda está
   * procurando. Assim a tela não trava enquanto a dica pensa.
   */
  function criarBusca(e, { limite = 30000 } = {}) {
    // Se alguma carta já pode subir sozinha, subir a primeira é a primeira jogada: as outras vão
    // atrás dela, como no jogo
    const pendentes = subirSozinhas(e);
    const prefixo = pendentes.ids.slice(0, 1).map((id) => ({ id, destino: { tipo: "fundacao", indice: naipe(id) } }));
    const inicio = pendentes.estado;
    if (venceu(inicio)) return { continuar: () => prefixo };
    const vistos = new Set([chave(inicio)]);
    // Fila de prioridade (heap binário) pela distância até o fim
    const fila = [];
    const empurrar = (no) => {
      fila.push(no);
      let i = fila.length - 1;
      while (i > 0) {
        const pai = (i - 1) >> 1;
        if (fila[pai].prioridade <= no.prioridade) break;
        fila[i] = fila[pai];
        i = pai;
      }
      fila[i] = no;
    };
    const tirarMelhor = () => {
      const melhor = fila[0];
      const ultimo = fila.pop();
      if (fila.length) {
        let i = 0;
        for (;;) {
          const a = 2 * i + 1;
          const b = a + 1;
          let menor = i;
          const p = (k) => (k === i ? ultimo.prioridade : fila[k].prioridade);
          if (a < fila.length && fila[a].prioridade < p(menor)) menor = a;
          if (b < fila.length && fila[b].prioridade < p(menor)) menor = b;
          if (menor === i) break;
          fila[i] = fila[menor];
          i = menor;
        }
        fila[i] = ultimo;
      }
      return melhor;
    };
    empurrar({ estado: inicio, prioridade: distancia(inicio), anterior: null, jogada: null });
    let expandidos = 0;
    let resultado;
    function continuar(maximo = Infinity) {
      for (let feitos = 0; resultado === undefined && feitos < maximo; feitos++) {
        if (!fila.length || expandidos >= limite) {
          resultado = null;
          break;
        }
        const no = tirarMelhor();
        expandidos += 1;
        for (const jogada of jogadasParaResolver(no.estado)) {
          const proximo = subirSozinhas(mover(no.estado, jogada.id, jogada.destino)).estado;
          const k = chave(proximo);
          if (vistos.has(k)) continue;
          vistos.add(k);
          const filho = { estado: proximo, prioridade: distancia(proximo), anterior: no, jogada };
          if (venceu(proximo)) {
            const caminho = [];
            for (let n = filho; n.jogada; n = n.anterior) caminho.push(n.jogada);
            resultado = prefixo.concat(caminho.reverse());
            break;
          }
          empurrar(filho);
        }
      }
      return resultado;
    }
    return { continuar };
  }

  /** A busca inteira de uma vez: a lista de jogadas até a vitória, ou null. */
  const resolver = (e, opcoes) => criarBusca(e, opcoes).continuar();

  // ---------- Salvar e restaurar ----------

  const inteiro = (v, min = 0) => Number.isInteger(v) && v >= min;
  const carta = (id) => inteiro(id) && id < CARTAS;

  /** Confere um estado salvo: as 52 cartas uma vez só e as fundações em ordem, do Ás para cima. */
  function restaurar(salvo) {
    if (!salvo || typeof salvo !== "object" || !partidaValida(salvo.semente)) return null;
    if (!Array.isArray(salvo.colunas) || salvo.colunas.length !== COLUNAS) return null;
    if (!Array.isArray(salvo.celulas) || salvo.celulas.length !== CELULAS) return null;
    if (!Array.isArray(salvo.fundacoes) || salvo.fundacoes.length !== NAIPES.length) return null;
    if (!salvo.colunas.every((c) => Array.isArray(c) && c.every(carta))) return null;
    if (!salvo.celulas.every((id) => id === null || carta(id))) return null;
    if (!salvo.fundacoes.every((f, s) => Array.isArray(f) && f.every((id, i) => carta(id) && naipe(id) === s && valor(id) === i + 1))) {
      return null;
    }
    const todas = [...salvo.colunas.flat(), ...salvo.celulas.filter((id) => id !== null), ...salvo.fundacoes.flat()];
    if (todas.length !== CARTAS || new Set(todas).size !== CARTAS) return null;
    for (const campo of ["movimentos", "segundos"]) if (!inteiro(salvo[campo])) return null;
    return clonar({
      semente: salvo.semente,
      colunas: salvo.colunas,
      celulas: salvo.celulas,
      fundacoes: salvo.fundacoes,
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
    menosMovimentos: null,
    sequencia: 0,
    melhorSequencia: 0,
  });

  function lerEstatisticas(salvas) {
    const limpo = estatisticasVazias();
    if (!salvas || typeof salvas !== "object") return limpo;
    for (const campo of ["jogadas", "vitorias", "sequencia", "melhorSequencia"]) {
      if (inteiro(salvas[campo])) limpo[campo] = salvas[campo];
    }
    if (inteiro(salvas.melhorTempo, 1)) limpo.melhorTempo = salvas.melhorTempo;
    if (inteiro(salvas.menosMovimentos, 1)) limpo.menosMovimentos = salvas.menosMovimentos;
    limpo.vitorias = Math.min(limpo.vitorias, limpo.jogadas);
    return limpo;
  }

  /** Soma uma partida terminada; devolve as novas estatísticas e o que virou recorde. */
  function registrarResultado(estatisticas, { venceu: ganhou, segundos = 0, movimentos = 0 }) {
    const e = { ...lerEstatisticas(estatisticas) };
    const recordes = { tempo: false, movimentos: false };
    e.jogadas += 1;
    if (ganhou) {
      e.vitorias += 1;
      e.sequencia += 1;
      e.melhorSequencia = Math.max(e.melhorSequencia, e.sequencia);
      if (segundos > 0 && (e.melhorTempo === null || segundos < e.melhorTempo)) {
        recordes.tempo = e.melhorTempo !== null;
        e.melhorTempo = segundos;
      }
      if (movimentos > 0 && (e.menosMovimentos === null || movimentos < e.menosMovimentos)) {
        recordes.movimentos = e.menosMovimentos !== null;
        e.menosMovimentos = movimentos;
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
    COLUNAS,
    CELULAS,
    CARTAS,
    MAIOR_PARTIDA,
    valor,
    naipe,
    vermelha,
    textoValor,
    nomeCarta,
    encaixa,
    partidaValida,
    novaSemente,
    baralhoDaPartida,
    novoJogo,
    naFundacao,
    celulasLivres,
    colunasVazias,
    capacidade,
    localizar,
    sequenciaAlternada,
    inicioDaSequencia,
    cartasParaMover,
    aceitaNaFundacao,
    podeMover,
    mover,
    seguroSubir,
    podeTerminarSozinho,
    subirSozinhas,
    melhorDestino,
    venceu,
    temJogada,
    dica,
    chave,
    criarBusca,
    resolver,
    restaurar,
    estatisticasVazias,
    lerEstatisticas,
    registrarResultado,
    porcentagemVitorias,
    formatarTempo,
    formatarNumero,
  };
})();

if (typeof module === "object") module.exports = LogicaFreeCell;
