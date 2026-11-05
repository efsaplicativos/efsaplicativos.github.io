"use strict";
/*
 * Paciência Golf: regras, busca da solução (vitória ou melhor pontuação) e estatísticas, sem nada
 * de tela.
 *
 * Cartas de 0 a 51: naipe = id / 13 (0 espadas, 1 copas, 2 ouros, 3 paus) e valor = id % 13 + 1
 * (1 é o Ás, 11 o Valete, 12 a Dama e 13 o Rei).
 *
 * Estado da partida (só listas de números, para salvar em JSON):
 *   colunas: 7 listas de até 5 cartas; a última de cada uma é a que aparece inteira, a única que
 *            pode ser jogada.
 *   monte: cartas viradas para baixo; a última da lista é a de cima, a próxima a ser virada.
 *   fundacao: a pilha que recebe as cartas; a última da lista é a de cima.
 *   modo: "classico" (o Ás e o Rei não se ligam) ou "volta" (o Ás vai sobre o Rei e o Rei sobre o Ás).
 *
 * Regras: 35 cartas em 7 colunas de 5, todas abertas, e 17 no monte. No começo, a carta de cima do
 * monte já vai para a fundação, e sobram 16. A última carta de uma coluna vai para a fundação se o
 * valor dela for exatamente um acima ou um abaixo do valor da carta de cima da fundação; naipe e cor
 * não importam. O monte vira uma carta por vez para a fundação, a qualquer momento, e passa uma vez
 * só. Ganha quem limpar as 7 colunas; a partida acaba sem vitória quando o monte termina e nenhuma
 * carta das colunas encaixa.
 *
 * Pontuação (quanto menor, melhor): as cartas que sobram nas colunas. Com a mesa limpa, a pontuação
 * fica negativa: menos as cartas que ainda estão no monte.
 */
const LogicaGolf = (() => {
  const NAIPES = [
    { id: "espadas", nome: "espadas", vermelho: false },
    { id: "copas", nome: "copas", vermelho: true },
    { id: "ouros", nome: "ouros", vermelho: true },
    { id: "paus", nome: "paus", vermelho: false },
  ];
  const VALORES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const NOMES_VALOR = ["Ás", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Valete", "Dama", "Rei"];
  const MODOS = ["classico", "volta"];
  const MODO_PADRAO = "classico";
  const CARTAS = 52;
  const COLUNAS = 7;
  const POR_COLUNA = 5;
  const NAS_COLUNAS = COLUNAS * POR_COLUNA;
  const NO_MONTE = CARTAS - NAS_COLUNAS - 1;
  const MAIOR_SEMENTE = 999999;

  const valor = (id) => (id % 13) + 1;
  const naipe = (id) => Math.floor(id / 13);
  const vermelha = (id) => NAIPES[naipe(id)].vermelho;
  const textoValor = (id) => VALORES[valor(id) - 1];
  const nomeValor = (v) => NOMES_VALOR[v - 1];
  const nomeCarta = (id) => `${NOMES_VALOR[valor(id) - 1]} de ${NAIPES[naipe(id)].nome}`;
  /** "o 9", "o Ás", "a Dama": o valor com artigo, para as mensagens. */
  const valorComArtigo = (v) => `${v === 12 ? "a" : "o"} ${nomeValor(v)}`;
  const topo = (lista) => (lista.length ? lista[lista.length - 1] : null);
  const textoModo = (modo) => (modo === "volta" ? "Com volta" : "Clássico");

  /** O valor [a] pode ir sobre o valor [b] (e vice-versa): um acima ou um abaixo; com volta, Ás e Rei também. */
  const valoresEncaixam = (a, b, modo) => a - b === 1 || b - a === 1 || (modo === "volta" && a + b === 14 && (a === 1 || b === 1));
  const encaixa = (id, sobre, modo) => sobre !== null && valoresEncaixam(valor(id), valor(sobre), modo);

  /** Os valores que vão sobre [v]: no Clássico, o Rei só aceita a Dama e o Ás só o 2. */
  function vizinhos(v, modo) {
    const lista = [];
    if (v > 1) lista.push(v - 1);
    else if (modo === "volta") lista.push(13);
    if (v < 13) lista.push(v + 1);
    else if (modo === "volta") lista.push(1);
    return lista.sort((a, b) => a - b);
  }

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

  /** As 35 primeiras cartas formam as colunas (5 em cada, de cima para baixo); as 17 outras, o monte. */
  function novoJogo(modo, semente) {
    const baralho = embaralhar([...Array(CARTAS).keys()], aleatorioComSemente(semente));
    const colunas = [];
    for (let c = 0; c < COLUNAS; c++) colunas.push(baralho.slice(c * POR_COLUNA, (c + 1) * POR_COLUNA));
    const monte = baralho.slice(NAS_COLUNAS);
    const fundacao = [monte.pop()];
    return {
      modo: MODOS.includes(modo) ? modo : MODO_PADRAO,
      semente,
      colunas,
      monte,
      fundacao,
      movimentos: 0,
      segundos: 0,
      iniciado: false,
    };
  }

  const clonar = (e) => ({
    ...e,
    colunas: e.colunas.map((c) => c.slice()),
    monte: e.monte.slice(),
    fundacao: e.fundacao.slice(),
  });

  // ---------- Jogadas ----------

  const topoDaFundacao = (e) => topo(e.fundacao);
  const naColunas = (e) => e.colunas.reduce((n, c) => n + c.length, 0);
  const venceu = (e) => naColunas(e) === 0;

  /** A última carta da coluna [c] vai para a fundação? */
  function podeJogar(e, c) {
    const coluna = e.colunas[c];
    return Boolean(coluna && coluna.length) && encaixa(topo(coluna), topoDaFundacao(e), e.modo);
  }

  /** As colunas cuja última carta encaixa na fundação agora. */
  const colunasJogaveis = (e) => [...Array(COLUNAS).keys()].filter((c) => podeJogar(e, c));

  function jogar(e, c) {
    if (venceu(e) || !podeJogar(e, c)) return null;
    const n = clonar(e);
    n.fundacao.push(n.colunas[c].pop());
    n.movimentos += 1;
    n.iniciado = true;
    return n;
  }

  const podeVirar = (e) => e.monte.length > 0 && !venceu(e);

  /** Vira a carta de cima do monte para a fundação. */
  function virar(e) {
    if (!podeVirar(e)) return null;
    const n = clonar(e);
    n.fundacao.push(n.monte.pop());
    n.movimentos += 1;
    n.iniciado = true;
    return n;
  }

  /** A partida acabou: mesa limpa, ou monte vazio e nenhuma carta das colunas encaixa. */
  const terminou = (e) => venceu(e) || (!e.monte.length && colunasJogaveis(e).length === 0);
  const temJogada = (e) => !terminou(e);

  /** Quanto menor, melhor: as cartas que sobram nas colunas, ou menos as do monte com a mesa limpa. */
  const pontuacao = (e) => (venceu(e) ? 0 - e.monte.length : naColunas(e));

  /** Todas as jogadas possíveis agora, no formato da busca: { coluna } ou { monte: true }. */
  function jogadasPossiveis(e) {
    if (venceu(e)) return [];
    const lista = colunasJogaveis(e).map((coluna) => ({ coluna }));
    if (podeVirar(e)) lista.push({ monte: true });
    return lista;
  }

  /** Aplica uma jogada no formato da busca. */
  const aplicar = (e, jogada) =>
    jogada && jogada.monte ? virar(e) : jogada && Number.isInteger(jogada.coluna) ? jogar(e, jogada.coluna) : null;

  // ---------- Busca da solução ----------

  const POT = [1, 6, 36, 216, 1296, 7776, 46656];
  const FALTA = -128;

  /**
   * Tabela das posições já examinadas: chave (número inteiro positivo) -> melhor pontuação.
   * Endereçamento aberto em vetores tipados, que gastam bem menos memória que um Map quando a
   * busca passa de um milhão de posições.
   */
  function criarMemo(bits = 16) {
    let capacidade = 1 << bits;
    let chaves = new Int32Array(capacidade).fill(-1);
    let valores = new Int8Array(capacidade);
    let tamanho = 0;
    const lugar = (k, b) => Math.imul(k, 0x9e3779b1) >>> (32 - b);

    function get(k) {
      const mascara = capacidade - 1;
      for (let i = lugar(k, bits); ; i = (i + 1) & mascara) {
        const c = chaves[i];
        if (c === k) return valores[i];
        if (c === -1) return FALTA;
      }
    }

    function crescer() {
      const velhasChaves = chaves;
      const velhosValores = valores;
      bits += 1;
      capacidade = 1 << bits;
      chaves = new Int32Array(capacidade).fill(-1);
      valores = new Int8Array(capacidade);
      const mascara = capacidade - 1;
      for (let j = 0; j < velhasChaves.length; j++) {
        const k = velhasChaves[j];
        if (k === -1) continue;
        let i = lugar(k, bits);
        while (chaves[i] !== -1) i = (i + 1) & mascara;
        chaves[i] = k;
        valores[i] = velhosValores[j];
      }
    }

    function set(k, v) {
      if ((tamanho + 1) * 10 > capacidade * 6) crescer();
      const mascara = capacidade - 1;
      let i = lugar(k, bits);
      while (chaves[i] !== -1 && chaves[i] !== k) i = (i + 1) & mascara;
      if (chaves[i] === -1) tamanho += 1;
      chaves[i] = k;
      valores[i] = v;
    }

    return { get, set, tamanho: () => tamanho };
  }

  /**
   * Busca em profundidade a partir de [e], aos pedaços: continuar(maximo) examina até [maximo]
   * posições e devolve undefined enquanto não terminou. No fim, devolve:
   *   { vitoria: true, caminho, pontuacao } com as jogadas que limpam as colunas guardando o máximo
   *     de cartas no monte, ou seja, com a menor pontuação possível;
   *   { vitoria: false, caminho, pontuacao } quando provou que não há vitória: o caminho leva à
   *     menor pontuação possível daqui (as cartas que sobram nas colunas);
   *   null se o [limite] de posições acabou antes de achar qualquer vitória ou de provar que não há.
   *
   * A posição é só (alturas das 7 colunas, cartas no monte, valor da carta de cima da fundação):
   * as cartas de cada coluna e do monte não mudam de ordem, e o naipe da fundação não importa.
   * Ela vira um número só, e [memo] guarda a melhor pontuação de cada posição já examinada por
   * inteiro sem achar vitória. Como os números valem para a partida toda, o mesmo [memo] serve
   * para as próximas buscas da mesma partida. Toda jogada tira uma carta das colunas ou do monte,
   * então não há ciclos.
   *
   * Achada a primeira vitória, a busca continua só atrás de vitórias que guardem mais cartas no
   * monte: posições com menos cartas no monte que o necessário ficam de fora, e as já examinadas
   * nessa fase vão para outra tabela (valem como "daqui não sai vitória melhor").
   */
  function criarBusca(e, { limite = 4000000, memo = null } = {}) {
    const volta = e.modo === "volta";
    const valCol = e.colunas.map((c) => c.map(valor));
    const valMonte = e.monte.map(valor);
    const tabela = memo || criarMemo();
    const chave = (hc, m, r) => (hc * 18 + m) * 14 + r;
    const altura = (hc, c) => Math.floor(hc / POT[c]) % 6;
    const encaixam = (a, b) => a - b === 1 || b - a === 1 || (volta && a + b === 14 && (a === 1 || b === 1));
    function somaAlturas(hc) {
      let s = 0;
      for (let c = 0; c < COLUNAS; c++) s += altura(hc, c);
      return s;
    }

    // A pilha da busca em vetores: cada nível guarda a posição, as jogadas (colunas de 0 a 6, ou 7
    // para o monte), a próxima a tentar, a melhor pontuação achada até agora e a jogada que levou a ele
    const MAX = CARTAS + 2;
    const pHc = new Int32Array(MAX);
    const pM = new Int8Array(MAX);
    const pR = new Int8Array(MAX);
    const pOps = new Int8Array(MAX * 8);
    const pN = new Int8Array(MAX);
    const pI = new Int8Array(MAX);
    const pMelhor = new Int8Array(MAX);
    const pVeio = new Int8Array(MAX);
    let topoPilha = -1;
    let examinadas = 0;
    let resultado;
    // Depois da primeira vitória: o melhor caminho até agora e quantas cartas no monte a próxima precisa guardar
    let vitoria = null;
    let alvo = 0;
    const semMelhora = criarMemo(12);
    const venceuCom = () => ({ vitoria: true, caminho: vitoria.caminho, pontuacao: 0 - vitoria.monte });

    /** Jogadas a partir da posição: colunas primeiro (as mais altas antes), o monte por último. */
    function preencher(nivel, hc, m, r) {
      const base = nivel * 8;
      let n = 0;
      for (let c = 0; c < COLUNAS; c++) {
        const h = altura(hc, c);
        if (!h || !encaixam(valCol[c][h - 1], r)) continue;
        // Inserção mantendo a ordem: altura maior antes; no empate, a coluna da esquerda
        let j = n++;
        while (j > 0 && altura(hc, pOps[base + j - 1]) < h) {
          pOps[base + j] = pOps[base + j - 1];
          j -= 1;
        }
        pOps[base + j] = c;
      }
      if (m > 0) pOps[base + n++] = 7;
      return n;
    }

    function abrir(hc, m, r, veio) {
      const nivel = ++topoPilha;
      pHc[nivel] = hc;
      pM[nivel] = m;
      pR[nivel] = r;
      pN[nivel] = preencher(nivel, hc, m, r);
      pI[nivel] = 0;
      pMelhor[nivel] = 127;
      pVeio[nivel] = veio;
      examinadas += 1;
    }

    const jogadaDe = (op) => (op < 7 ? { coluna: op } : { monte: true });

    let hc0 = 0;
    valCol.forEach((c, i) => (hc0 += c.length * POT[i]));
    const m0 = valMonte.length;
    const r0 = valor(topo(e.fundacao));

    /** Sem vitória, segue sempre por uma jogada que mantém a melhor pontuação. */
    function melhorCaminho() {
      const caminho = [];
      let hc = hc0;
      let m = m0;
      let r = r0;
      const alvo = tabela.get(chave(hc, m, r));
      for (;;) {
        const n = preencher(MAX - 1, hc, m, r);
        const aqui = tabela.get(chave(hc, m, r));
        let achou = false;
        for (let k = 0; k < n && !achou; k++) {
          const op = pOps[(MAX - 1) * 8 + k];
          const h2 = op < 7 ? hc - POT[op] : hc;
          const m2 = op < 7 ? m : m - 1;
          const r2 = op < 7 ? valCol[op][altura(hc, op) - 1] : valMonte[m - 1];
          if (tabela.get(chave(h2, m2, r2)) === aqui) {
            caminho.push(jogadaDe(op));
            hc = h2;
            m = m2;
            r = r2;
            achou = true;
          }
        }
        if (!achou) break;
      }
      return { vitoria: false, caminho, pontuacao: alvo };
    }

    if (!hc0) resultado = { vitoria: true, caminho: [], pontuacao: 0 - m0 };
    else if (tabela.get(chave(hc0, m0, r0)) !== FALTA) resultado = melhorCaminho();
    else abrir(hc0, m0, r0, -1);

    function continuar(maximo = Infinity) {
      if (resultado !== undefined) return resultado;
      let neste = 0;
      while (topoPilha >= 0) {
        const q = topoPilha;
        if (pI[q] >= pN[q]) {
          topoPilha -= 1;
          if (vitoria) {
            semMelhora.set(chave(pHc[q], pM[q], pR[q]), 1);
            continue;
          }
          // Posição examinada por inteiro, sem vitória; sem jogadas, vale as cartas que sobraram nas colunas
          const v = pN[q] ? pMelhor[q] : somaAlturas(pHc[q]);
          tabela.set(chave(pHc[q], pM[q], pR[q]), v);
          if (topoPilha >= 0 && v < pMelhor[topoPilha]) pMelhor[topoPilha] = v;
          continue;
        }
        if (neste >= maximo) return undefined;
        if (examinadas >= limite) return (resultado = vitoria ? venceuCom() : null);
        const op = pOps[q * 8 + pI[q]++];
        let hc = pHc[q];
        let m = pM[q];
        let r;
        if (op < 7) {
          r = valCol[op][altura(hc, op) - 1];
          hc -= POT[op];
        } else {
          m -= 1;
          r = valMonte[m];
        }
        if (!hc) {
          if (m < alvo) continue;
          const caminho = [];
          for (let k = 1; k <= q; k++) caminho.push(jogadaDe(pVeio[k]));
          caminho.push(jogadaDe(op));
          vitoria = { caminho, monte: m };
          alvo = m + 1;
          // Ganhar sem virar mais nenhuma carta do monte não tem como melhorar
          if (alvo > m0) return (resultado = venceuCom());
          continue;
        }
        if (m < alvo) continue;
        const k = chave(hc, m, r);
        const conhecido = tabela.get(k);
        if (conhecido !== FALTA) {
          if (conhecido < pMelhor[q]) pMelhor[q] = conhecido;
          continue;
        }
        if (vitoria && semMelhora.get(k) !== FALTA) continue;
        abrir(hc, m, r, op);
        neste += 1;
      }
      return (resultado = vitoria ? venceuCom() : melhorCaminho());
    }

    return { continuar, examinadas: () => examinadas, memo: tabela };
  }

  /** A busca inteira de uma vez (para os testes). */
  const resolver = (e, opcoes) => criarBusca(e, opcoes).continuar();

  // ---------- Dica simples ----------

  /**
   * Uma jogada razoável sem a busca, para quando ela não termina a tempo: a coluna mais alta entre
   * as que encaixam; sem nenhuma, o monte. Devolve { coluna } ou { monte: true } ou null.
   */
  function dica(e) {
    if (terminou(e)) return null;
    const jogaveis = colunasJogaveis(e);
    if (jogaveis.length) {
      const coluna = jogaveis.reduce((melhor, c) => (e.colunas[c].length > e.colunas[melhor].length ? c : melhor));
      return { coluna };
    }
    return { monte: true };
  }

  // ---------- Salvar e restaurar ----------

  const inteiro = (v, min = 0) => Number.isInteger(v) && v >= min;
  const carta = (id) => inteiro(id) && id < CARTAS;

  /**
   * Confere um estado salvo refazendo a partida: as colunas e o monte têm de ser o começo dos da
   * distribuição daquela semente, e cada carta da fundação tem de ter vindo do monte, na ordem, ou
   * de uma coluna, encaixando na carta de antes.
   */
  function restaurar(salvo) {
    if (!salvo || typeof salvo !== "object" || !MODOS.includes(salvo.modo) || !inteiro(salvo.semente, 1)) return null;
    if (salvo.semente > MAIOR_SEMENTE) return null;
    const { colunas, monte, fundacao } = salvo;
    if (!Array.isArray(colunas) || colunas.length !== COLUNAS) return null;
    if (!colunas.every((c) => Array.isArray(c) && c.length <= POR_COLUNA && c.every(carta))) return null;
    if (!Array.isArray(monte) || !monte.every(carta) || !Array.isArray(fundacao) || !fundacao.length || !fundacao.every(carta)) return null;
    for (const campo of ["movimentos", "segundos"]) if (!inteiro(salvo[campo])) return null;

    const refeito = novoJogo(salvo.modo, salvo.semente);
    if (fundacao[0] !== refeito.fundacao[0]) return null;
    for (let i = 1; i < fundacao.length; i++) {
      const id = fundacao[i];
      if (id === topo(refeito.monte)) {
        refeito.fundacao.push(refeito.monte.pop());
        continue;
      }
      const c = refeito.colunas.findIndex((col) => topo(col) === id);
      if (c < 0 || !encaixa(id, topo(refeito.fundacao), salvo.modo)) return null;
      refeito.fundacao.push(refeito.colunas[c].pop());
    }
    const igual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    if (!igual(refeito.monte, monte) || !refeito.colunas.every((c, i) => igual(c, colunas[i]))) return null;
    return clonar({
      modo: salvo.modo,
      semente: salvo.semente,
      colunas,
      monte,
      fundacao,
      movimentos: salvo.movimentos,
      segundos: salvo.segundos,
      iniciado: salvo.iniciado === true || fundacao.length > 1,
    });
  }

  // ---------- Estatísticas ----------

  const estatisticasVazias = () => ({
    jogadas: 0,
    vitorias: 0,
    melhorPontuacao: null,
    melhorTempo: null,
    sequencia: 0,
    melhorSequencia: 0,
  });

  const pontuacaoValida = (p) => Number.isInteger(p) && p >= -NO_MONTE && p <= NAS_COLUNAS;

  function lerEstatisticas(salvas) {
    const limpo = estatisticasVazias();
    if (!salvas || typeof salvas !== "object") return limpo;
    for (const campo of ["jogadas", "vitorias", "sequencia", "melhorSequencia"]) {
      if (inteiro(salvas[campo])) limpo[campo] = salvas[campo];
    }
    if (inteiro(salvas.melhorTempo, 1)) limpo.melhorTempo = salvas.melhorTempo;
    if (pontuacaoValida(salvas.melhorPontuacao)) limpo.melhorPontuacao = salvas.melhorPontuacao;
    limpo.vitorias = Math.min(limpo.vitorias, limpo.jogadas);
    return limpo;
  }

  /**
   * Soma uma partida; devolve as novas estatísticas e o que virou recorde. [pontuacao] fica de fora
   * quando a partida foi abandonada no meio (conta como não terminada, sem pontuação).
   */
  function registrarResultado(estatisticas, { venceu: ganhou, segundos = 0, pontuacao: pontos = null }) {
    const e = { ...lerEstatisticas(estatisticas) };
    const recordes = { tempo: false, pontuacao: false };
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
    if (pontuacaoValida(pontos) && (e.melhorPontuacao === null || pontos < e.melhorPontuacao)) {
      recordes.pontuacao = e.melhorPontuacao !== null;
      e.melhorPontuacao = pontos;
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
  /** Pontuação com o sinal de menos tipográfico: "−4", "0", "7". */
  const formatarPontuacao = (p) => (p < 0 ? `−${-p}` : String(p));

  return {
    NAIPES,
    MODOS,
    MODO_PADRAO,
    CARTAS,
    COLUNAS,
    POR_COLUNA,
    NAS_COLUNAS,
    NO_MONTE,
    valor,
    naipe,
    vermelha,
    textoValor,
    nomeValor,
    nomeCarta,
    valorComArtigo,
    textoModo,
    valoresEncaixam,
    encaixa,
    vizinhos,
    aleatorioComSemente,
    novaSemente,
    novoJogo,
    topoDaFundacao,
    naColunas,
    venceu,
    podeJogar,
    colunasJogaveis,
    jogar,
    podeVirar,
    virar,
    terminou,
    temJogada,
    pontuacao,
    jogadasPossiveis,
    aplicar,
    criarMemo,
    criarBusca,
    resolver,
    dica,
    restaurar,
    estatisticasVazias,
    lerEstatisticas,
    registrarResultado,
    porcentagemVitorias,
    formatarTempo,
    formatarNumero,
    formatarPontuacao,
  };
})();

if (typeof module === "object") module.exports = LogicaGolf;
