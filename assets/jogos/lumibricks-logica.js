"use strict";
/*
 * Regras do Lumibricks, portadas do app Android (com.emerson1981.lumibricks), sem DOM:
 * logica/TipoPeca.kt (formas e giros), logica/RotacaoSrs.kt (deslocamentos ao girar perto de
 * paredes e blocos), logica/Tabuleiro.kt (grade, colisão e linhas), logica/GeradorPecas.kt
 * (saco de 7 e bloco dourado), logica/Pontuacao.kt (pontos, níveis e velocidade),
 * logica/MotorJogo.kt (gravidade, atraso para travar, Segurar e fim de jogo),
 * dados/JsonPartida.kt (partida salva) e dados/Recordes.kt (Top 5).
 *
 * As funções de sorteio recebem aleatorio(), que devolve um número em [0, 1) como Math.random,
 * para os testes poderem usar uma sequência fixa.
 */
const LogicaLumibricks = (() => {
  const LARGURA = 10;
  const ALTURA = 20;
  const VAZIA = 0;

  // ---------- Peças ----------

  /**
   * As 7 peças de quatro blocos e o bloco dourado especial (TipoPeca.FANTASMA no app). Cada
   * desenho é a caixa da peça no estado inicial; os outros estados saem girando a caixa.
   * A ordem é a do app: o código gravado na grade é a posição na lista + 1.
   */
  const DESENHOS = {
    I: ["....", "####", "....", "...."],
    J: ["#..", "###", "..."],
    L: ["..#", "###", "..."],
    O: ["##", "##"],
    S: [".##", "##.", "..."],
    T: [".#.", "###", "..."],
    Z: ["##.", ".##", "..."],
    DOURADO: ["#"],
  };
  const TIPOS = Object.keys(DESENHOS);
  /** As peças de quatro blocos, que saem do saco de 7. */
  const QUATRO_BLOCOS = TIPOS.filter((t) => t !== "DOURADO");

  function gerarRotacoes(desenho) {
    const n = desenho.length;
    const inicial = [];
    desenho.forEach((linha, y) => {
      [...linha].forEach((c, x) => {
        if (c === "#") inicial.push({ x, y });
      });
    });
    // Girar a caixa n x n no sentido horário: (x, y) -> (n - 1 - y, x)
    const estados = [inicial];
    for (let k = 1; k < 4; k++) estados.push(estados[k - 1].map((p) => ({ x: n - 1 - p.y, y: p.x })));
    return estados.map((estado) => estado.slice().sort((a, b) => a.y - b.y || a.x - b.x));
  }

  const PECAS = {};
  for (const tipo of TIPOS) {
    const rotacoes = gerarRotacoes(DESENHOS[tipo]);
    PECAS[tipo] = {
      tipo,
      codigo: TIPOS.indexOf(tipo) + 1,
      tamanhoCaixa: DESENHOS[tipo].length,
      /** Células de cada estado de rotação: 0, R (horário), 2 e L. */
      rotacoes,
      /** O e o bloco dourado têm o mesmo formato em qualquer rotação. */
      giraSemEfeito: tipo === "O" || tipo === "DOURADO",
      /** A peça nasce com a primeira linha ocupada encostada no topo do tabuleiro. */
      yInicial: 0 - Math.min(...rotacoes[0].map((p) => p.y)),
    };
  }

  function codigoDoTipo(tipo) {
    return PECAS[tipo].codigo;
  }

  function tipoDoCodigo(codigo) {
    return TIPOS[codigo - 1] || null;
  }

  function peca(tipo, x, y, rotacao = 0) {
    return { tipo, x, y, rotacao };
  }

  function novaPeca(tipo, largura = LARGURA) {
    const info = PECAS[tipo];
    return peca(tipo, Math.floor((largura - info.tamanhoCaixa) / 2), info.yInicial, 0);
  }

  function celulas(p) {
    return PECAS[p.tipo].rotacoes[p.rotacao].map((c) => ({ x: p.x + c.x, y: p.y + c.y }));
  }

  function mover(p, dx, dy) {
    return { ...p, x: p.x + dx, y: p.y + dy };
  }

  function mesmaPeca(a, b) {
    if (!a || !b) return a === b;
    return a.tipo === b.tipo && a.x === b.x && a.y === b.y && a.rotacao === b.rotacao;
  }

  // ---------- Tabuleiro ----------

  /**
   * Grade do jogo. Cada célula guarda 0 (vazia) ou o código da peça que a ocupa.
   * Linhas acima do topo (y < 0) contam como livres para as peças poderem girar ao nascer.
   */
  class Tabuleiro {
    constructor(largura = LARGURA, altura = ALTURA, grade = null) {
      this.largura = largura;
      this.altura = altura;
      this.grade = grade && grade.length === largura * altura ? Array.from(grade) : new Array(largura * altura).fill(VAZIA);
    }

    copiaCelulas() {
      return this.grade.slice();
    }

    tipoEm(x, y) {
      if (x < 0 || x >= this.largura || y < 0 || y >= this.altura) return null;
      return tipoDoCodigo(this.grade[y * this.largura + x]);
    }

    /** Fora dos lados ou abaixo do fundo conta como ocupado; acima do topo, como livre. */
    ocupada(x, y) {
      if (x < 0 || x >= this.largura || y >= this.altura) return true;
      if (y < 0) return false;
      return this.grade[y * this.largura + x] !== VAZIA;
    }

    cabe(p) {
      return celulas(p).every((c) => !this.ocupada(c.x, c.y));
    }

    /** O bloco dourado só esbarra nas paredes e no fundo, nunca nas outras peças. */
    dentroDosLimites(p) {
      return celulas(p).every((c) => c.x >= 0 && c.x < this.largura && c.y < this.altura);
    }

    /**
     * Grava a peça na grade. Retorna false (sem gravar nada) se parte dela ficaria acima do
     * topo, o que encerra a partida.
     */
    fixar(p) {
      const lista = celulas(p);
      if (lista.some((c) => c.y < 0 || c.y >= this.altura || c.x < 0 || c.x >= this.largura)) return false;
      for (const c of lista) this.grade[c.y * this.largura + c.x] = codigoDoTipo(p.tipo);
      return true;
    }

    linhasCompletas() {
      const linhas = [];
      for (let y = 0; y < this.altura; y++) {
        let cheia = true;
        for (let x = 0; x < this.largura; x++) {
          if (this.grade[y * this.largura + x] === VAZIA) {
            cheia = false;
            break;
          }
        }
        if (cheia) linhas.push(y);
      }
      return linhas;
    }

    /** Remove as linhas indicadas e desce tudo o que estava acima delas. */
    limparLinhas(linhas) {
      if (!linhas.length) return;
      const remover = new Set(linhas);
      const nova = new Array(this.largura * this.altura).fill(VAZIA);
      let destino = this.altura - 1;
      for (let y = this.altura - 1; y >= 0; y--) {
        if (remover.has(y)) continue;
        for (let x = 0; x < this.largura; x++) nova[destino * this.largura + x] = this.grade[y * this.largura + x];
        destino--;
      }
      this.grade = nova;
    }

    /**
     * Linha onde o bloco dourado da coluna [x], hoje na linha [y], vai parar: o buraco vazio
     * mais fundo da linha [y] para baixo. Sem nenhum, o vazio mais próximo acima dele.
     * Retorna -1 quando a coluna está cheia.
     */
    destinoDourado(x, y) {
      if (x < 0 || x >= this.largura) return -1;
      const inicio = Math.max(0, y);
      for (let linha = this.altura - 1; linha >= inicio; linha--) {
        if (this.grade[linha * this.largura + x] === VAZIA) return linha;
      }
      for (let linha = Math.min(inicio, this.altura) - 1; linha >= 0; linha--) {
        if (this.grade[linha * this.largura + x] === VAZIA) return linha;
      }
      return -1;
    }
  }

  // ---------- Giro ----------

  // Deslocamentos testados ao girar, na ordem, com y para cima (por isso o sinal de y é
  // invertido ao aplicar). Se a peça girada não cabe no lugar, fica com o primeiro que cabe.
  const pares = (...valores) => {
    const lista = [];
    for (let i = 0; i < valores.length; i += 2) lista.push({ x: valores[i], y: valores[i + 1] });
    return lista;
  };
  const TESTES_COMUNS = {
    "0>1": pares(0, 0, -1, 0, -1, 1, 0, -2, -1, -2),
    "1>0": pares(0, 0, 1, 0, 1, -1, 0, 2, 1, 2),
    "1>2": pares(0, 0, 1, 0, 1, -1, 0, 2, 1, 2),
    "2>1": pares(0, 0, -1, 0, -1, 1, 0, -2, -1, -2),
    "2>3": pares(0, 0, 1, 0, 1, 1, 0, -2, 1, -2),
    "3>2": pares(0, 0, -1, 0, -1, -1, 0, 2, -1, 2),
    "3>0": pares(0, 0, -1, 0, -1, -1, 0, 2, -1, 2),
    "0>3": pares(0, 0, 1, 0, 1, 1, 0, -2, 1, -2),
  };
  const TESTES_I = {
    "0>1": pares(0, 0, -2, 0, 1, 0, -2, -1, 1, 2),
    "1>0": pares(0, 0, 2, 0, -1, 0, 2, 1, -1, -2),
    "1>2": pares(0, 0, -1, 0, 2, 0, -1, 2, 2, -1),
    "2>1": pares(0, 0, 1, 0, -2, 0, 1, -2, -2, 1),
    "2>3": pares(0, 0, 2, 0, -1, 0, 2, 1, -1, -2),
    "3>2": pares(0, 0, -2, 0, 1, 0, -2, -1, 1, 2),
    "3>0": pares(0, 0, 1, 0, -2, 0, 1, -2, -2, 1),
    "0>3": pares(0, 0, -1, 0, 2, 0, -1, 2, 2, -1),
  };

  /** Peça girada (já deslocada se precisou), ou null se nenhuma posição cabe. */
  function girar(tabuleiro, p, horario) {
    if (PECAS[p.tipo].giraSemEfeito) return null;
    const destino = (p.rotacao + (horario ? 1 : 3)) % 4;
    const tabela = p.tipo === "I" ? TESTES_I : TESTES_COMUNS;
    for (const d of tabela[`${p.rotacao}>${destino}`]) {
      const girada = { ...p, rotacao: destino, x: p.x + d.x, y: p.y - d.y };
      if (tabuleiro.cabe(girada)) return girada;
    }
    return null;
  }

  // ---------- Sorteio ----------

  const CHANCE_DOURADO = 0.15;

  function embaralhar(lista, aleatorio) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  /**
   * Sorteia as peças com o "saco de 7": cada grupo de 7 traz uma de cada peça de quatro
   * blocos em ordem aleatória, evitando longas secas da mesma peça. O bloco dourado aparece à
   * parte, com 15% de chance, sem gastar o saco.
   */
  class GeradorPecas {
    constructor(aleatorio = Math.random, saco = [], chanceDourado = CHANCE_DOURADO) {
      this.aleatorio = aleatorio;
      this.chanceDourado = chanceDourado;
      this.saco = saco.filter((t) => QUATRO_BLOCOS.includes(t));
    }

    proxima() {
      if (this.aleatorio() < this.chanceDourado) return "DOURADO";
      if (!this.saco.length) this.saco.push(...embaralhar(QUATRO_BLOCOS, this.aleatorio));
      return this.saco.shift();
    }

    /** Peças que ainda faltam sair do saco atual (para salvar a partida). */
    restantes() {
      return this.saco.slice();
    }
  }

  // ---------- Pontuação ----------

  const PONTOS_QUEDA_SUAVE = 1;
  const PONTOS_QUEDA_INSTANTANEA = 2;
  const LINHAS_POR_NIVEL = 10;

  /** 1 linha 100, 2 linhas 300, 3 linhas 500 e 4 linhas 800, vezes o nível. */
  function pontosPorLinhas(linhas, nivel) {
    const base = { 1: 100, 2: 300, 3: 500, 4: 800 }[linhas] || 0;
    return base * nivel;
  }

  function nivelPorLinhas(linhas) {
    return Math.floor(linhas / LINHAS_POR_NIVEL) + 1;
  }

  /** Tempo para a peça descer uma linha: 15% mais rápido a cada nível, até 70 ms. */
  function intervaloQuedaMs(nivel) {
    const intervalo = Math.round(1000 * Math.pow(0.85, Math.max(1, nivel) - 1));
    return Math.max(70, intervalo);
  }

  // ---------- Motor ----------

  const ATRASO_TRAVAMENTO_MS = 500;
  const REINICIOS_MAXIMOS = 15;
  const DELTA_MAXIMO_MS = 100;

  /**
   * Regras da partida: gravidade por tempo decorrido, atraso para travar a peça no chão,
   * linhas, pontos, níveis, Segurar e fim de jogo. status: "parado", "jogando", "pausado", "fim".
   */
  class Motor {
    constructor(aleatorio = Math.random, largura = LARGURA, altura = ALTURA) {
      this.aleatorio = aleatorio;
      this.largura = largura;
      this.altura = altura;
      this.status = "parado";
      this.atual = null;
      this.proxima = null;
      this.guardada = null;
      this.podeGuardar = true;
      this.pontos = 0;
      this.linhas = 0;
      this.nivel = 1;
      this.tempoMs = 0;
      /** Muda a cada alteração visível, para a interface só redesenhar quando precisa. */
      this.versao = 0;
      this.tabuleiro = new Tabuleiro(largura, altura);
      this.gerador = new GeradorPecas(aleatorio);
      this.ultimaLimpeza = [];
      this.contadorLimpezas = 0;
      this.acumuladorQueda = 0;
      this.tempoNoChao = 0;
      this.reinicios = 0;
      this.linhaMaisBaixa = 0;
    }

    get intervaloQuedaMs() {
      return intervaloQuedaMs(this.nivel);
    }

    tipoEm(x, y) {
      return this.tabuleiro.tipoEm(x, y);
    }

    novoJogo() {
      this.tabuleiro = new Tabuleiro(this.largura, this.altura);
      this.gerador = new GeradorPecas(this.aleatorio);
      this.guardada = null;
      this.podeGuardar = true;
      this.pontos = 0;
      this.linhas = 0;
      this.nivel = 1;
      this.tempoMs = 0;
      this.ultimaLimpeza = [];
      this.status = "jogando";
      this.proxima = this.gerador.proxima();
      this.entrarProximaPeca();
      this.mudou();
    }

    pausar() {
      if (this.status !== "jogando") return;
      this.status = "pausado";
      this.mudou();
    }

    retomar() {
      if (this.status !== "pausado") return;
      this.status = "jogando";
      this.acumuladorQueda = 0;
      this.mudou();
    }

    mover(dx) {
      const p = this.pecaEmJogo();
      if (!p) return false;
      const movida = mover(p, dx, 0);
      if (!this.podeOcupar(movida)) return false;
      this.aplicarMovimento(p, movida);
      return true;
    }

    girar(horario = true) {
      const p = this.pecaEmJogo();
      if (!p) return false;
      const girada = girar(this.tabuleiro, p, horario);
      if (!girada) return false;
      this.aplicarMovimento(p, girada);
      return true;
    }

    /** Desce uma linha (1 ponto). No chão não trava na hora: o atraso para travar decide. */
    quedaSuave() {
      const p = this.pecaEmJogo();
      if (!p || !this.podeDescer(p)) return false;
      this.atual = mover(p, 0, 1);
      this.pontos += PONTOS_QUEDA_SUAVE;
      this.acumuladorQueda = 0;
      this.registrarDescida();
      this.mudou();
      return true;
    }

    /** Leva a peça direto para o chão e trava (2 pontos por linha descida). */
    quedaInstantanea() {
      const p = this.pecaEmJogo();
      if (!p) return;
      const destino = this.posicaoDeQueda(p);
      this.pontos += PONTOS_QUEDA_INSTANTANEA * Math.max(0, destino.y - p.y);
      this.atual = destino;
      this.travarPeca();
    }

    /** Guarda a peça atual (ou troca pela guardada). Só uma vez por peça. */
    segurar() {
      const p = this.pecaEmJogo();
      if (!p || !this.podeGuardar) return false;
      const anterior = this.guardada;
      this.guardada = p.tipo;
      this.podeGuardar = false;
      if (anterior === null) this.entrarProximaPeca();
      else this.entrarPeca(anterior);
      this.mudou();
      return true;
    }

    /** Avança o relógio do jogo: gravidade e atraso para travar. */
    avancar(deltaMs) {
      if (this.status !== "jogando") return;
      const delta = Math.min(DELTA_MAXIMO_MS, Math.max(0, deltaMs));
      const segundoAnterior = Math.floor(this.tempoMs / 1000);
      this.tempoMs += delta;
      if (Math.floor(this.tempoMs / 1000) !== segundoAnterior) this.mudou();

      const p = this.atual;
      if (!p) return;
      if (this.podeDescer(p)) {
        this.tempoNoChao = 0;
        this.acumuladorQueda += delta;
        const intervalo = this.intervaloQuedaMs;
        while (this.acumuladorQueda >= intervalo) {
          this.acumuladorQueda -= intervalo;
          const agora = this.atual;
          if (!agora) return;
          if (!this.podeDescer(agora)) {
            this.acumuladorQueda = 0;
            break;
          }
          this.atual = mover(agora, 0, 1);
          this.registrarDescida();
          this.mudou();
        }
      } else {
        this.acumuladorQueda = 0;
        this.tempoNoChao += delta;
        if (this.tempoNoChao >= ATRASO_TRAVAMENTO_MS) this.travarPeca();
      }
    }

    estado() {
      const p = this.atual;
      return {
        status: this.status,
        largura: this.largura,
        altura: this.altura,
        celulas: this.tabuleiro.copiaCelulas(),
        atual: p,
        /** Onde a peça atual vai cair (peça-guia). */
        sombra: p ? this.posicaoDeQueda(p) : null,
        proxima: this.proxima,
        guardada: this.guardada,
        podeGuardar: this.podeGuardar,
        pontos: this.pontos,
        linhas: this.linhas,
        nivel: this.nivel,
        tempoMs: this.tempoMs,
        ultimaLimpeza: this.ultimaLimpeza,
        contadorLimpezas: this.contadorLimpezas,
      };
    }

    /** Partida atual para guardar, ou null se não há partida em andamento. */
    salvar() {
      if (this.status !== "jogando" && this.status !== "pausado") return null;
      return {
        celulas: this.tabuleiro.copiaCelulas(),
        pontos: this.pontos,
        linhas: this.linhas,
        nivel: this.nivel,
        tempoMs: this.tempoMs,
        atual: this.atual ? { ...this.atual } : null,
        proxima: this.proxima,
        guardada: this.guardada,
        podeGuardar: this.podeGuardar,
        saco: this.gerador.restantes(),
      };
    }

    /** Retoma uma partida guardada, sempre pausada. Retorna false se os dados não servem. */
    restaurar(partida) {
      if (!partida || !Array.isArray(partida.celulas) || partida.celulas.length !== this.largura * this.altura) return false;
      const codigos = partida.celulas.map((c) => (tipoDoCodigo(c) ? c : VAZIA));
      const novo = new Tabuleiro(this.largura, this.altura, codigos);
      // Remove linhas que já estariam completas (dados antigos) para não travar o jogo
      novo.limparLinhas(novo.linhasCompletas());

      this.tabuleiro = novo;
      this.gerador = new GeradorPecas(this.aleatorio, partida.saco || []);
      this.pontos = Math.max(0, partida.pontos || 0);
      this.linhas = Math.max(0, partida.linhas || 0);
      this.nivel = Math.max(partida.nivel || 1, nivelPorLinhas(this.linhas), 1);
      this.tempoMs = Math.max(0, partida.tempoMs || 0);
      this.guardada = partida.guardada || null;
      this.podeGuardar = partida.podeGuardar !== false;
      this.ultimaLimpeza = [];
      this.proxima = partida.proxima || this.gerador.proxima();
      this.status = "pausado";

      const salva = partida.atual;
      if (salva && salva.rotacao >= 0 && salva.rotacao <= 3 && this.podeOcupar(salva)) {
        this.atual = { ...salva };
        this.reiniciarTravamento(this.atual);
      } else {
        let tipo = salva ? salva.tipo : null;
        if (!tipo) {
          tipo = this.proxima;
          this.proxima = this.gerador.proxima();
        }
        this.entrarPeca(tipo);
      }
      this.mudou();
      return this.status === "pausado";
    }

    pecaEmJogo() {
      return this.status === "jogando" ? this.atual : null;
    }

    podeOcupar(p) {
      return p.tipo === "DOURADO" ? this.tabuleiro.dentroDosLimites(p) : this.tabuleiro.cabe(p);
    }

    podeDescer(p) {
      if (p.tipo === "DOURADO") return p.y < this.tabuleiro.destinoDourado(p.x, p.y);
      return this.tabuleiro.cabe(mover(p, 0, 1));
    }

    posicaoDeQueda(p) {
      if (p.tipo === "DOURADO") {
        const destino = this.tabuleiro.destinoDourado(p.x, p.y);
        return destino >= 0 ? { ...p, y: destino } : p;
      }
      let final = p;
      while (this.tabuleiro.cabe(mover(final, 0, 1))) final = mover(final, 0, 1);
      return final;
    }

    aplicarMovimento(antes, depois) {
      const estavaNoChao = !this.podeDescer(antes);
      this.atual = depois;
      // Mexer a peça no chão adia o travamento, mas só algumas vezes (evita enrolar para sempre)
      if (estavaNoChao && this.reinicios < REINICIOS_MAXIMOS) {
        this.tempoNoChao = 0;
        this.reinicios++;
      }
      this.registrarDescida();
      this.mudou();
    }

    registrarDescida() {
      const p = this.atual;
      if (!p) return;
      if (p.y > this.linhaMaisBaixa) {
        this.linhaMaisBaixa = p.y;
        this.reinicios = 0;
        this.tempoNoChao = 0;
      }
    }

    travarPeca() {
      const p = this.atual;
      if (!p) return;
      let final = p;
      if (p.tipo === "DOURADO") {
        const destino = this.tabuleiro.destinoDourado(p.x, p.y);
        if (destino < 0) {
          this.terminar();
          return;
        }
        final = { ...p, y: destino };
      }
      if (!this.tabuleiro.fixar(final)) {
        this.terminar();
        return;
      }
      const completas = this.tabuleiro.linhasCompletas();
      if (completas.length) {
        this.pontos += pontosPorLinhas(completas.length, this.nivel);
        this.linhas += completas.length;
        this.nivel = Math.max(this.nivel, nivelPorLinhas(this.linhas));
        this.tabuleiro.limparLinhas(completas);
        this.ultimaLimpeza = completas;
        this.contadorLimpezas++;
      }
      this.podeGuardar = true;
      this.entrarProximaPeca();
      this.mudou();
    }

    entrarProximaPeca() {
      const tipo = this.proxima || this.gerador.proxima();
      this.proxima = this.gerador.proxima();
      this.entrarPeca(tipo);
    }

    entrarPeca(tipo) {
      const p = novaPeca(tipo, this.largura);
      // Fim de jogo quando a nova peça já nasce em cima de blocos
      if (!this.podeOcupar(p)) {
        this.atual = null;
        this.terminar();
        return;
      }
      this.atual = p;
      this.reiniciarTravamento(p);
    }

    reiniciarTravamento(p) {
      this.acumuladorQueda = 0;
      this.tempoNoChao = 0;
      this.reinicios = 0;
      this.linhaMaisBaixa = p.y;
    }

    terminar() {
      this.atual = null;
      this.status = "fim";
      this.mudou();
    }

    mudou() {
      this.versao++;
    }
  }

  // ---------- Partida salva ----------

  const VERSAO_PARTIDA = 1;

  function partidaParaJson(partida) {
    return { versao: VERSAO_PARTIDA, ...partida };
  }

  /** Partida guardada de volta, ou null se o JSON não for de uma partida (JsonPartida.deJson). */
  function partidaDeJson(dados) {
    if (!dados || typeof dados !== "object" || !Array.isArray(dados.celulas)) return null;
    if (dados.celulas.length !== LARGURA * ALTURA) return null;
    const inteiro = (v, padrao) => (Number.isFinite(v) ? Math.trunc(v) : padrao);
    const tipo = (v) => (typeof v === "string" && TIPOS.includes(v) ? v : null);
    let atual = null;
    if (dados.atual && typeof dados.atual === "object" && tipo(dados.atual.tipo)) {
      const r = inteiro(dados.atual.rotacao, 0);
      atual = peca(dados.atual.tipo, inteiro(dados.atual.x, 0), inteiro(dados.atual.y, 0), ((r % 4) + 4) % 4);
    }
    return {
      celulas: dados.celulas.map((c) => (Number.isInteger(c) && tipoDoCodigo(c) ? c : VAZIA)),
      pontos: inteiro(dados.pontos, 0),
      linhas: inteiro(dados.linhas, 0),
      nivel: inteiro(dados.nivel, 1),
      tempoMs: inteiro(dados.tempoMs, 0),
      atual,
      proxima: tipo(dados.proxima),
      guardada: tipo(dados.guardada),
      podeGuardar: typeof dados.podeGuardar === "boolean" ? dados.podeGuardar : true,
      saco: Array.isArray(dados.saco) ? dados.saco.map(tipo).filter(Boolean) : [],
    };
  }

  // ---------- Recordes (Top 5) ----------

  const MAXIMO_RECORDES = 5;

  function adicionarRecorde(lista, novo) {
    return [...lista, novo].sort((a, b) => b.pontos - a.pontos).slice(0, MAXIMO_RECORDES);
  }

  /** Posição (0 = primeiro) que [pontos] ocuparia no ranking, ou null se não entra. */
  function posicaoRecorde(lista, pontos) {
    let indice = lista.findIndex((r) => pontos > r.pontos);
    if (indice < 0) indice = lista.length;
    return indice < MAXIMO_RECORDES ? indice : null;
  }

  function numero(valor) {
    if (typeof valor === "number" && Number.isFinite(valor)) return Math.trunc(valor);
    if (typeof valor === "string" && valor.trim() !== "" && Number.isFinite(Number(valor))) return Math.trunc(Number(valor));
    return null;
  }

  /**
   * Lista do JSON, com as chaves do app (score, level, at). Aceita também a versão mais antiga,
   * só de números. Itens com defeito são ignorados.
   */
  function recordesDeJson(dados) {
    if (!Array.isArray(dados)) return [];
    const lista = [];
    for (const item of dados) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const pontos = numero(item.score);
        if (pontos === null) continue;
        lista.push({ pontos, nivel: Math.max(0, numero(item.level) ?? 0), data: typeof item.at === "string" ? item.at : "" });
      } else if (typeof item === "number" || typeof item === "string") {
        const pontos = numero(item);
        if (pontos !== null) lista.push({ pontos, nivel: 0, data: "" });
      }
    }
    return lista.filter((r) => r.pontos >= 0).sort((a, b) => b.pontos - a.pontos).slice(0, MAXIMO_RECORDES);
  }

  function recordesParaJson(lista) {
    return lista.map((r) => ({ score: r.pontos, level: r.nivel, at: r.data }));
  }

  /** Data e hora locais no formato ISO sem fuso, como o app grava. */
  function dataAgora(agora = new Date()) {
    const d = (n, casas = 2) => String(n).padStart(casas, "0");
    return (
      `${agora.getFullYear()}-${d(agora.getMonth() + 1)}-${d(agora.getDate())}T` +
      `${d(agora.getHours())}:${d(agora.getMinutes())}:${d(agora.getSeconds())}.${d(agora.getMilliseconds(), 3)}`
    );
  }

  /**
   * Data curta (dd/mm/aaaa hh:mm). Datas em UTC ("Z" no fim) são convertidas para o fuso local,
   * ou para [fusoMinutos] (diferença para o UTC) quando informado. Texto que não é data volta
   * como veio.
   */
  function formatarData(iso, fusoMinutos = null) {
    if (!iso) return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
    if (!m) return iso;
    let [, ano, mes, dia, hora, minuto] = m.map(Number);
    const segundo = Number(m[6]);
    const teste = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, segundo));
    if (teste.getUTCMonth() !== mes - 1 || teste.getUTCDate() !== dia || hora > 23 || minuto > 59) return iso;
    if (iso.endsWith("Z")) {
      const ms = teste.getTime();
      const local = fusoMinutos === null ? new Date(ms) : new Date(ms + fusoMinutos * 60000);
      const pegar = fusoMinutos === null ? (k) => local[`get${k}`]() : (k) => local[`getUTC${k}`]();
      ano = pegar("FullYear");
      mes = pegar("Month") + 1;
      dia = pegar("Date");
      hora = pegar("Hours");
      minuto = pegar("Minutes");
    }
    const d = (n) => String(n).padStart(2, "0");
    return `${d(dia)}/${d(mes)}/${ano} ${d(hora)}:${d(minuto)}`;
  }

  function formatarTempo(ms) {
    const segundos = Math.floor(ms / 1000);
    const d = (n) => String(n).padStart(2, "0");
    return `${d(Math.floor(segundos / 60))}:${d(segundos % 60)}`;
  }

  return {
    LARGURA,
    ALTURA,
    TIPOS,
    QUATRO_BLOCOS,
    PECAS,
    ATRASO_TRAVAMENTO_MS,
    REINICIOS_MAXIMOS,
    CHANCE_DOURADO,
    codigoDoTipo,
    tipoDoCodigo,
    peca,
    novaPeca,
    celulas,
    mesmaPeca,
    Tabuleiro,
    girar,
    GeradorPecas,
    pontosPorLinhas,
    nivelPorLinhas,
    intervaloQuedaMs,
    Motor,
    partidaParaJson,
    partidaDeJson,
    adicionarRecorde,
    posicaoRecorde,
    recordesDeJson,
    recordesParaJson,
    dataAgora,
    formatarData,
    formatarTempo,
  };
})();
if (typeof module === "object") module.exports = LogicaLumibricks;
