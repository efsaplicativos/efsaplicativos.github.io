"use strict";
/*
 * Paciência Pirâmide: regras, dica com busca da solução e estatísticas, sem nada de tela.
 *
 * Cartas de 0 a 51: naipe = id / 13 (0 espadas, 1 copas, 2 ouros, 3 paus) e valor = id % 13 + 1
 * (1 é o Ás, 11 o Valete, 12 a Dama e 13 o Rei).
 *
 * A pirâmide tem 7 linhas: a linha r (de 0, a ponta, a 6, a base) tem r + 1 cartas. A posição da
 * carta k da linha r é r * (r + 1) / 2 + k, de 0 a 27. Cada carta fica coberta pelas duas da linha
 * de baixo que encostam nela.
 *
 * Estado da partida (só listas de números, para salvar em JSON):
 *   piramide: as 28 posições; null onde a carta já saiu.
 *   monte: cartas viradas para baixo; a última da lista é a de cima.
 *   descarte: cartas já viradas do monte; a última da lista é a de cima, a única que pode ser usada.
 *   tiradas: as cartas que já saíram do jogo, na ordem em que saíram.
 *   volta: a passagem atual pelo monte, começando em 1.
 *
 * Regras: saem juntas duas cartas livres que somam 13 (o Valete vale 11 e a Dama 12); o Rei sai
 * sozinho. Uma carta da pirâmide fica livre quando as duas que a cobrem já saíram; a carta de cima
 * do descarte também está livre. O monte vira uma carta por vez; quando acaba, o descarte volta a
 * ser o monte, na mesma ordem, se o modo ainda deixar mais uma volta. Ganha quem tirar as 28 cartas
 * da pirâmide; as que sobrarem no monte e no descarte não contam.
 */
const LogicaPiramide = (() => {
  const NAIPES = [
    { id: "espadas", nome: "espadas", vermelho: false },
    { id: "copas", nome: "copas", vermelho: true },
    { id: "ouros", nome: "ouros", vermelho: true },
    { id: "paus", nome: "paus", vermelho: false },
  ];
  const VALORES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const NOMES_VALOR = ["Ás", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Valete", "Dama", "Rei"];
  /** Quantas voltas o monte pode dar; 0 é sem limite. */
  const MODOS = [3, 1, 0];
  const MODO_PADRAO = 3;
  const CARTAS = 52;
  const LINHAS = 7;
  const POSICOES = 28;
  const SOMA = 13;
  const MAIOR_SEMENTE = 999999;

  const valor = (id) => (id % 13) + 1;
  const naipe = (id) => Math.floor(id / 13);
  const vermelha = (id) => NAIPES[naipe(id)].vermelho;
  const textoValor = (id) => VALORES[valor(id) - 1];
  const nomeCarta = (id) => `${NOMES_VALOR[valor(id) - 1]} de ${NAIPES[naipe(id)].nome}`;
  const topo = (lista) => (lista.length ? lista[lista.length - 1] : null);
  const textoModo = (modo) => (modo === 0 ? "voltas sem limite" : modo === 1 ? "1 volta" : `${modo} voltas`);
  const formaPar = (a, b) => valor(a) + valor(b) === SOMA;

  // ---------- Posições da pirâmide ----------

  const LINHA_DE = [];
  const COLUNA_DE = [];
  for (let r = 0; r < LINHAS; r++) {
    for (let k = 0; k <= r; k++) {
      LINHA_DE.push(r);
      COLUNA_DE.push(k);
    }
  }
  const posicao = (linha, coluna) => (linha * (linha + 1)) / 2 + coluna;
  /** As duas posições que cobrem [p], ou [] na base. */
  const cobertoras = (p) => (LINHA_DE[p] === LINHAS - 1 ? [] : [p + LINHA_DE[p] + 1, p + LINHA_DE[p] + 2]);
  /** As posições que [p] cobre (uma nas pontas da linha, duas no meio). */
  function cobertas(p) {
    const r = LINHA_DE[p];
    const k = COLUNA_DE[p];
    if (r === 0) return [];
    const lista = [];
    if (k > 0) lista.push(posicao(r - 1, k - 1));
    if (k < r) lista.push(posicao(r - 1, k));
    return lista;
  }
  const COBERTORAS = [...Array(POSICOES).keys()].map(cobertoras);
  /** Bits das posições que [p] cobre, direta ou indiretamente: elas só saem depois dela. */
  const CONE = [];
  for (let p = 0; p < POSICOES; p++) {
    let mascara = 0;
    const fila = cobertas(p);
    while (fila.length) {
      const c = fila.pop();
      if ((mascara >> c) & 1) continue;
      mascara |= 1 << c;
      fila.push(...cobertas(c));
    }
    CONE.push(mascara);
  }
  /** Bits das posições que estão sobre [p], direta ou indiretamente: elas têm de sair antes dela. */
  const ACIMA_DE = [...Array(POSICOES).keys()].map((p) => CONE.reduce((m, cone, q) => ((cone >> p) & 1 ? m | (1 << q) : m), 0));

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

  /** As 28 primeiras cartas formam a pirâmide, da ponta para a base; as 24 outras, o monte. */
  function novoJogo(modo, semente) {
    const baralho = embaralhar([...Array(CARTAS).keys()], aleatorioComSemente(semente));
    return {
      modo: MODOS.includes(modo) ? modo : MODO_PADRAO,
      semente,
      piramide: baralho.slice(0, POSICOES),
      monte: baralho.slice(POSICOES),
      descarte: [],
      tiradas: [],
      volta: 1,
      movimentos: 0,
      segundos: 0,
      iniciado: false,
    };
  }

  const clonar = (e) => ({
    ...e,
    piramide: e.piramide.slice(),
    monte: e.monte.slice(),
    descarte: e.descarte.slice(),
    tiradas: e.tiradas.slice(),
  });

  // ---------- Onde está cada carta ----------

  const livreNaPiramide = (e, p) => e.piramide[p] !== null && COBERTORAS[p].every((c) => e.piramide[c] === null);

  function localizar(e, id) {
    const p = e.piramide.indexOf(id);
    if (p >= 0) return { tipo: "piramide", posicao: p, livre: livreNaPiramide(e, p) };
    let i = e.descarte.indexOf(id);
    if (i >= 0) return { tipo: "descarte", posicao: i, livre: i === e.descarte.length - 1 };
    i = e.monte.indexOf(id);
    if (i >= 0) return { tipo: "monte", posicao: i, livre: false };
    i = e.tiradas.indexOf(id);
    if (i >= 0) return { tipo: "tirada", posicao: i, livre: false };
    return null;
  }

  /** As cartas que podem sair agora: as livres da pirâmide (da ponta para a base) e a de cima do descarte. */
  function cartasLivres(e) {
    const ids = [];
    for (let p = 0; p < POSICOES; p++) if (livreNaPiramide(e, p)) ids.push(e.piramide[p]);
    if (e.descarte.length) ids.push(topo(e.descarte));
    return ids;
  }

  function disponivel(e, id) {
    const local = localizar(e, id);
    return Boolean(local && local.livre);
  }

  /** Dá para tirar [ids]: um Rei livre ou duas cartas livres que somam 13. */
  function podeTirar(e, ids) {
    if (!Array.isArray(ids)) return false;
    if (ids.length === 1) return valor(ids[0]) === 13 && disponivel(e, ids[0]);
    if (ids.length !== 2 || ids[0] === ids[1]) return false;
    return formaPar(ids[0], ids[1]) && disponivel(e, ids[0]) && disponivel(e, ids[1]);
  }

  // ---------- Jogadas ----------

  function tirar(e, ids) {
    if (!podeTirar(e, ids)) return null;
    const n = clonar(e);
    for (const id of ids) {
      const p = n.piramide.indexOf(id);
      if (p >= 0) n.piramide[p] = null;
      else n.descarte.pop();
      n.tiradas.push(id);
    }
    n.movimentos += 1;
    n.iniciado = true;
    return n;
  }

  const podeVirar = (e) => e.monte.length > 0;
  const voltasRestantes = (e) => (e.modo === 0 ? Infinity : e.modo - e.volta);
  const podeReciclar = (e) => !e.monte.length && e.descarte.length > 0 && voltasRestantes(e) > 0;

  /** Um toque no monte: vira a carta de cima ou, com ele vazio, devolve o descarte para começar outra volta. */
  function usarMonte(e) {
    if (podeVirar(e)) {
      const n = clonar(e);
      n.descarte.push(n.monte.pop());
      n.movimentos += 1;
      n.iniciado = true;
      return n;
    }
    if (!podeReciclar(e)) return null;
    const n = clonar(e);
    n.monte = n.descarte.reverse();
    n.descarte = [];
    n.volta += 1;
    n.movimentos += 1;
    n.iniciado = true;
    return n;
  }

  /** Cartas livres que formam par com [id] (ou só o próprio Rei). */
  function parceiros(e, id) {
    if (!disponivel(e, id)) return [];
    if (valor(id) === 13) return [];
    return cartasLivres(e).filter((outra) => outra !== id && formaPar(id, outra));
  }

  /** Todas as jogadas de tirar cartas possíveis agora: Reis sozinhos e pares. */
  function jogadasDeTirar(e) {
    const livres = cartasLivres(e);
    const jogadas = [];
    for (let i = 0; i < livres.length; i++) {
      if (valor(livres[i]) === 13) jogadas.push([livres[i]]);
      for (let j = i + 1; j < livres.length; j++) if (formaPar(livres[i], livres[j])) jogadas.push([livres[i], livres[j]]);
    }
    return jogadas;
  }

  const naPiramide = (e) => e.piramide.reduce((n, id) => n + (id === null ? 0 : 1), 0);
  const venceu = (e) => naPiramide(e) === 0;
  const temJogada = (e) => !venceu(e) && (jogadasDeTirar(e).length > 0 || podeVirar(e) || podeReciclar(e));

  /**
   * Ainda sai alguma carta? Enquanto nenhuma carta sai, as cartas livres da pirâmide não mudam, e
   * as do monte e do descarte só servem se forem Rei ou formarem par com uma delas. O descarte (fora
   * a de cima) só volta a ser usado com mais uma volta.
   */
  function podeProgredir(e) {
    if (venceu(e)) return false;
    if (jogadasDeTirar(e).length) return true;
    const precisa = new Set();
    for (let p = 0; p < POSICOES; p++) if (livreNaPiramide(e, p)) precisa.add(SOMA - valor(e.piramide[p]));
    const serve = (id) => valor(id) === 13 || precisa.has(valor(id));
    if (e.monte.some(serve)) return true;
    return voltasRestantes(e) > 0 && e.descarte.slice(0, -1).some(serve);
  }

  // ---------- Busca da solução ----------

  /**
   * Busca em profundidade a partir de [e], aos pedaços: continuar(maximo) examina até [maximo]
   * posições e devolve undefined enquanto a busca não terminou, a lista de jogadas que limpa a
   * pirâmide ou null quando não há solução (ou o [limite] de posições acabou).
   *
   * Cada jogada é { tirar: [ids] } ou { monte: true }. Para ir rápido, a busca representa a
   * posição por quatro números: as cartas que ainda estão na pirâmide (bits), as que restam do
   * monte e do descarte (bits sobre a ordem em que saem do monte), quantas delas já foram viradas
   * nesta volta e a volta. Tirar um Rei nunca atrapalha, então ele sai antes de qualquer outra
   * jogada; entre as outras, os pares da pirâmide vêm primeiro, depois os pares com o descarte e
   * por último o monte.
   */
  function criarBusca(e, { limite = 200000, podar = true } = {}) {
    const piramide = e.piramide.slice();
    const ordem = [...e.descarte, ...e.monte.slice().reverse()];
    const semLimite = e.modo === 0;
    const ultimaVolta = e.modo;

    let mp = 0;
    for (let p = 0; p < POSICOES; p++) if (piramide[p] !== null) mp |= 1 << p;
    const ms = ordem.length ? (1 << ordem.length) - 1 : 0;

    const livre = (mascara, p) => (mascara >> p) & 1 && COBERTORAS[p].every((c) => !((mascara >> c) & 1));
    const topoDescarte = (s, ponteiro) => {
      for (let i = ponteiro - 1; i >= 0; i--) if ((s >> i) & 1) return i;
      return -1;
    };
    const proximaDoMonte = (s, ponteiro) => {
      for (let i = ponteiro; i < ordem.length; i++) if ((s >> i) & 1) return i;
      return -1;
    };
    const chave = (n) => (semLimite ? `${n.mp},${n.ms},${n.p}` : `${n.mp},${n.ms},${n.p},${n.v}`);

    // Bits, para cada valor, das posições da pirâmide e das cartas do monte que têm esse valor
    const naPiramideComValor = Array(14).fill(0);
    const noMonteComValor = Array(14).fill(0);
    piramide.forEach((id, p) => id !== null && (naPiramideComValor[valor(id)] |= 1 << p));
    ordem.forEach((id, i) => (noMonteComValor[valor(id)] |= 1 << i));

    /**
     * Posição sem saída: alguma carta da pirâmide não tem mais parceiro possível. Não servem as
     * cartas que ela cobre nem as que a cobrem, porque uma teria de sair antes da outra.
     */
    function semSaida(n) {
      for (let p = 0; p < POSICOES; p++) {
        if (!((n.mp >> p) & 1)) continue;
        const v = valor(piramide[p]);
        if (v === 13) continue;
        if (noMonteComValor[SOMA - v] & n.ms) continue;
        if (naPiramideComValor[SOMA - v] & n.mp & ~CONE[p] & ~ACIMA_DE[p]) continue;
        return true;
      }
      return false;
    }

    /** Filhos de uma posição, já na ordem em que a busca deve tentar. */
    function filhos(n) {
      const livres = [];
      for (let p = 0; p < POSICOES; p++) if (livre(n.mp, p)) livres.push(p);
      const t = topoDescarte(n.ms, n.p);

      for (const p of livres) {
        if (valor(piramide[p]) === 13) return [{ jogada: { tirar: [piramide[p]] }, n: { ...n, mp: n.mp & ~(1 << p) } }];
      }
      if (t >= 0 && valor(ordem[t]) === 13) return [{ jogada: { tirar: [ordem[t]] }, n: { ...n, ms: n.ms & ~(1 << t) } }];

      const lista = [];
      for (let i = 0; i < livres.length; i++) {
        for (let j = i + 1; j < livres.length; j++) {
          const a = livres[i];
          const b = livres[j];
          if (formaPar(piramide[a], piramide[b])) {
            lista.push({ jogada: { tirar: [piramide[a], piramide[b]] }, n: { ...n, mp: n.mp & ~(1 << a) & ~(1 << b) } });
          }
        }
      }
      if (t >= 0) {
        for (const p of livres) {
          if (formaPar(piramide[p], ordem[t])) {
            lista.push({ jogada: { tirar: [ordem[t], piramide[p]] }, n: { ...n, mp: n.mp & ~(1 << p), ms: n.ms & ~(1 << t) } });
          }
        }
      }
      const proxima = proximaDoMonte(n.ms, n.p);
      if (proxima >= 0) lista.push({ jogada: { monte: true }, n: { ...n, p: proxima + 1 } });
      else if (n.ms && (semLimite || n.v < ultimaVolta)) lista.push({ jogada: { monte: true }, n: { ...n, p: 0, v: n.v + 1 } });
      return lista;
    }

    const inicio = { mp, ms, p: e.descarte.length, v: e.volta };
    const vistos = new Set([chave(inicio)]);
    const pilha = [{ n: inicio, opcoes: null, i: 0, jogada: null }];
    let examinadas = 0;
    let resultado;

    function continuar(maximo = Infinity) {
      if (resultado !== undefined) return resultado;
      if (!inicio.mp) return (resultado = []);
      if (podar && semSaida(inicio)) return (resultado = null);
      let neste = 0;
      while (pilha.length) {
        if (neste >= maximo) return undefined;
        if (examinadas >= limite) return (resultado = null);
        const quadro = pilha[pilha.length - 1];
        if (!quadro.opcoes) {
          quadro.opcoes = filhos(quadro.n);
          examinadas += 1;
          neste += 1;
        }
        if (quadro.i >= quadro.opcoes.length) {
          pilha.pop();
          continue;
        }
        const { jogada, n } = quadro.opcoes[quadro.i++];
        if (!n.mp) {
          const caminho = pilha.slice(1).map((q) => q.jogada);
          caminho.push(jogada);
          return (resultado = caminho);
        }
        const k = chave(n);
        if (vistos.has(k)) continue;
        vistos.add(k);
        if (podar && semSaida(n)) continue;
        pilha.push({ n, opcoes: null, i: 0, jogada });
      }
      return (resultado = null);
    }

    return { continuar, examinadas: () => examinadas };
  }

  /** A solução inteira de uma vez (para os testes). */
  const resolver = (e, opcoes) => criarBusca(e, opcoes).continuar();

  /** Aplica uma jogada no formato da busca: { tirar: [ids] } ou { monte: true }. */
  const aplicar = (e, jogada) => (jogada && jogada.monte ? usarMonte(e) : jogada && jogada.tirar ? tirar(e, jogada.tirar) : null);

  // ---------- Dica simples ----------

  /** Quantas cartas da pirâmide ficam livres se [posicoes] saírem. */
  function cartasLiberadas(e, posicoes) {
    const saem = new Set(posicoes);
    let total = 0;
    const vistas = new Set();
    for (const p of posicoes) {
      for (const c of cobertas(p)) {
        if (vistas.has(c) || saem.has(c) || e.piramide[c] === null) continue;
        vistas.add(c);
        if (COBERTORAS[c].every((x) => e.piramide[x] === null || saem.has(x))) total += 1;
      }
    }
    return total;
  }

  /**
   * Uma jogada boa sem procurar a solução, para quando a busca não termina a tempo: um Rei, depois
   * o par que mais libera cartas da pirâmide (dando preferência a usar a carta do descarte, que não
   * gasta carta da pirâmide à toa), e por último o monte. Devolve { tirar } ou { monte } ou null.
   */
  function dica(e) {
    if (venceu(e)) return null;
    let melhor = null;
    for (const ids of jogadasDeTirar(e)) {
      const posicoes = ids.map((id) => e.piramide.indexOf(id)).filter((p) => p >= 0);
      const usaDescarte = posicoes.length < ids.length;
      let nota = valor(ids[0]) === 13 ? 1000 : 0;
      nota += 10 * cartasLiberadas(e, posicoes) + (usaDescarte ? 5 : 0) + posicoes.length;
      if (!melhor || nota > melhor.nota) melhor = { nota, ids };
    }
    if (melhor) return { tirar: melhor.ids };
    return podeVirar(e) || podeReciclar(e) ? { monte: true } : null;
  }

  // ---------- Salvar e restaurar ----------

  const inteiro = (v, min = 0) => Number.isInteger(v) && v >= min;
  const carta = (id) => inteiro(id) && id < CARTAS;

  /** Confere um estado salvo: as 52 cartas uma vez só e nenhuma posição vazia sob uma carta ainda presente. */
  function restaurar(salvo) {
    if (!salvo || typeof salvo !== "object" || !MODOS.includes(salvo.modo) || !inteiro(salvo.semente, 1)) return null;
    if (!Array.isArray(salvo.piramide) || salvo.piramide.length !== POSICOES) return null;
    if (!salvo.piramide.every((id) => id === null || carta(id))) return null;
    for (const lista of [salvo.monte, salvo.descarte, salvo.tiradas]) if (!Array.isArray(lista) || !lista.every(carta)) return null;
    const todas = [...salvo.piramide.filter((id) => id !== null), ...salvo.monte, ...salvo.descarte, ...salvo.tiradas];
    if (todas.length !== CARTAS || new Set(todas).size !== CARTAS) return null;
    for (let p = 0; p < POSICOES; p++) {
      if (salvo.piramide[p] === null && COBERTORAS[p].some((c) => salvo.piramide[c] !== null)) return null;
    }
    if (!inteiro(salvo.volta, 1) || (salvo.modo !== 0 && salvo.volta > salvo.modo)) return null;
    for (const campo of ["movimentos", "segundos"]) if (!inteiro(salvo[campo])) return null;
    return clonar({
      modo: salvo.modo,
      semente: salvo.semente,
      piramide: salvo.piramide,
      monte: salvo.monte,
      descarte: salvo.descarte,
      tiradas: salvo.tiradas,
      volta: salvo.volta,
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
    limpo.vitorias = Math.min(limpo.vitorias, limpo.jogadas);
    return limpo;
  }

  /** Soma uma partida terminada; devolve as novas estatísticas e se o tempo virou recorde. */
  function registrarResultado(estatisticas, { venceu: ganhou, segundos = 0 }) {
    const e = { ...lerEstatisticas(estatisticas) };
    const recordes = { tempo: false };
    e.jogadas += 1;
    if (ganhou) {
      e.vitorias += 1;
      e.sequencia += 1;
      e.melhorSequencia = Math.max(e.melhorSequencia, e.sequencia);
      if (segundos > 0 && (e.melhorTempo === null || segundos < e.melhorTempo)) {
        recordes.tempo = e.melhorTempo !== null;
        e.melhorTempo = segundos;
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
    MODO_PADRAO,
    CARTAS,
    LINHAS,
    POSICOES,
    SOMA,
    valor,
    naipe,
    vermelha,
    textoValor,
    nomeCarta,
    textoModo,
    formaPar,
    LINHA_DE,
    COLUNA_DE,
    posicao,
    cobertoras,
    cobertas,
    aleatorioComSemente,
    novaSemente,
    novoJogo,
    livreNaPiramide,
    localizar,
    cartasLivres,
    disponivel,
    podeTirar,
    tirar,
    podeVirar,
    podeReciclar,
    voltasRestantes,
    usarMonte,
    parceiros,
    jogadasDeTirar,
    naPiramide,
    venceu,
    temJogada,
    podeProgredir,
    criarBusca,
    resolver,
    aplicar,
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

if (typeof module === "object") module.exports = LogicaPiramide;
