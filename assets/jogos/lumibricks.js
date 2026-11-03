"use strict";
/*
 * Interface do Lumibricks (app com.emerson1981.lumibricks). As regras estão em
 * lumibricks-logica.js; aqui ficam o desenho do tabuleiro (ui/componentes/Tabuleiro.kt e
 * PainelJogo.kt), os botões com repetição (BotaoJogo.kt e ControlesJogo.kt), os gestos, as
 * sobreposições de início, pausa e fim (SobreposicaoJogo.kt) e o laço da partida
 * (ui/telas/TelaJogo.kt), aqui com requestAnimationFrame. A partida pausa sozinha quando a
 * aba fica oculta, a janela perde o foco ou o tabuleiro sai da tela.
 */
(() => {
  const raiz = document.querySelector("#lumibricks");
  if (!raiz || typeof LogicaLumibricks !== "object") return;
  const L = LogicaLumibricks;

  const CHAVE_PARTIDA = "efs-lumibricks-partida";
  const CHAVE_RECORDES = "efs-lumibricks-recordes";
  const ATRASO_REPETICAO_MS = 170;
  const INTERVALO_REPETICAO_MS = 55;
  const ESPERA_BOTAO_FIM_MS = 1000;
  const CLARAO_MS = 350;
  const PISCA_MS = 600;
  const SALVAR_A_CADA_MS = 5000;
  const LIMITE_TOQUE_PX = 8;
  const VELOCIDADE_QUEDA_PX_S = 1100;

  // Cores próprias da versão web, uma por formato; o bloco dourado é o do app
  const CORES = {
    I: "#ff6b4a",
    J: "#38c8ff",
    L: "#e3e8ff",
    O: "#a77bff",
    S: "#ff4fa3",
    T: "#a3e635",
    Z: "#2ee6b0",
    DOURADO: "#ffd700",
  };
  const NOMES = {
    I: "reta de quatro blocos",
    J: "J",
    L: "L",
    O: "quadrado",
    S: "S",
    T: "T",
    Z: "Z",
    DOURADO: "bloco dourado",
  };
  const COR_FUNDO = "#0a0a12";
  const COR_COLUNA = "#0f0f19";
  const COR_GRADE = "#1c1c2a";

  const area = raiz.querySelector("#lb-area");
  const jogo = raiz.querySelector("#lb-jogo");
  const quadro = raiz.querySelector("#lb-quadro");
  const tela = raiz.querySelector("#lb-tela");
  const telaProxima = raiz.querySelector("#lb-proxima");
  const telaGuardada = raiz.querySelector("#lb-guardada");
  const textoProxima = raiz.querySelector("#lb-proxima-texto");
  const textoGuardada = raiz.querySelector("#lb-guardada-texto");
  const cartaoGuardada = raiz.querySelector("#lb-cartao-guardada");
  const textoPontos = raiz.querySelector("#lb-pontos");
  const textoLinhas = raiz.querySelector("#lb-linhas");
  const textoNivel = raiz.querySelector("#lb-nivel");
  const textoTempo = raiz.querySelector("#lb-tempo");
  const controles = raiz.querySelector("#lb-controles");
  const sobreposicao = raiz.querySelector("#lb-sobreposicao");
  const aviso = raiz.querySelector("#lb-aviso");
  const lista = raiz.querySelector("#lb-lista");
  const vazio = raiz.querySelector("#lb-vazio");
  const botaoLimpar = raiz.querySelector("#lb-limpar");
  const confirmar = raiz.querySelector("#lb-confirmar");
  const botaoLimparSim = raiz.querySelector("#lb-limpar-sim");
  const botaoLimparNao = raiz.querySelector("#lb-limpar-nao");
  const status = raiz.querySelector("#lb-status");
  const reduzirMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const motor = new L.Motor();
  let recordes = [];
  let novoRecorde = false;
  /** O que a sobreposição mostra: null (jogando), "inicio", "pausa", "reiniciar" ou "fim". */
  let telaAviso = null;
  let liberadoEm = 0;
  let versaoDesenhada = -1;
  let ultimoEstado = null;
  let laco = 0;
  let anterior = 0;
  let restoMs = 0;
  let claraoInicio = -Infinity;
  let ultimoSalvo = 0;
  let quadroNaTela = true;

  // ---------- Armazenamento ----------

  function ler(chave) {
    try {
      const texto = localStorage.getItem(chave);
      return texto ? JSON.parse(texto) : null;
    } catch (error) {
      return null;
    }
  }

  function gravar(chave, valor) {
    try {
      if (valor === null) localStorage.removeItem(chave);
      else localStorage.setItem(chave, JSON.stringify(valor));
    } catch (error) {
      /* Armazenamento indisponível: vale só enquanto a página estiver aberta. */
    }
  }

  function salvarPartida() {
    const partida = motor.salvar();
    gravar(CHAVE_PARTIDA, partida ? L.partidaParaJson(partida) : null);
    ultimoSalvo = motor.tempoMs;
  }

  // ---------- Desenho ----------

  /** Ajusta o tamanho em pixels de um canvas ao tamanho na tela (nítido em telas densas). */
  function ajustarCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const largura = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const altura = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== largura || canvas.height !== altura) {
      canvas.width = largura;
      canvas.height = altura;
      return true;
    }
    return false;
  }

  function retanguloArredondado(ctx, x, y, l, a, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, l, a, r);
    else ctx.rect(x, y, l, a);
  }

  /** Bloco com cantos arredondados, faixa de brilho em cima e contorno escuro ("tijolo de luz"). */
  function desenharBloco(ctx, x, y, celula, cor) {
    const margem = celula * 0.05;
    const lado = celula - margem * 2;
    const ox = x * celula + margem;
    const oy = y * celula + margem;
    ctx.fillStyle = cor;
    retanguloArredondado(ctx, ox, oy, lado, lado, celula * 0.16);
    ctx.fill();
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = "#fff";
    retanguloArredondado(ctx, ox + lado * 0.14, oy + lado * 0.1, lado * 0.72, lado * 0.2, lado * 0.1);
    ctx.fill();
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = celula * 0.07;
    retanguloArredondado(ctx, ox, oy, lado, lado, celula * 0.16);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function desenharGuia(ctx, peca, celula) {
    const margem = celula * 0.1;
    const lado = celula - margem * 2;
    ctx.strokeStyle = CORES[peca.tipo];
    ctx.fillStyle = CORES[peca.tipo];
    ctx.lineWidth = celula * 0.07;
    for (const c of L.celulas(peca)) {
      if (c.y < 0) continue;
      retanguloArredondado(ctx, c.x * celula + margem, c.y * celula + margem, lado, lado, celula * 0.14);
      ctx.globalAlpha = 0.14;
      ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function desenharTabuleiro(agora) {
    const e = ultimoEstado;
    const ctx = tela.getContext("2d");
    const celula = tela.width / e.largura;
    ctx.fillStyle = COR_FUNDO;
    ctx.fillRect(0, 0, tela.width, tela.height);
    ctx.fillStyle = COR_COLUNA;
    for (let x = 1; x < e.largura; x += 2) ctx.fillRect(x * celula, 0, celula, tela.height);
    ctx.strokeStyle = COR_GRADE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < e.largura; x++) {
      ctx.moveTo(Math.round(x * celula) + 0.5, 0);
      ctx.lineTo(Math.round(x * celula) + 0.5, tela.height);
    }
    for (let y = 1; y < e.altura; y++) {
      ctx.moveTo(0, Math.round(y * celula) + 0.5);
      ctx.lineTo(tela.width, Math.round(y * celula) + 0.5);
    }
    ctx.stroke();

    for (let y = 0; y < e.altura; y++) {
      for (let x = 0; x < e.largura; x++) {
        const tipo = L.tipoDoCodigo(e.celulas[y * e.largura + x]);
        if (tipo) desenharBloco(ctx, x, y, celula, CORES[tipo]);
      }
    }

    const atual = e.atual;
    if (atual && e.sombra && !L.mesmaPeca(atual, e.sombra)) desenharGuia(ctx, e.sombra, celula);
    if (atual) {
      const dourado = atual.tipo === "DOURADO";
      const fase = dourado && !reduzirMovimento ? (agora % PISCA_MS) / PISCA_MS : 0;
      // O bloco dourado pisca entre dourado e branco, com um halo, como no app
      const cor = dourado && fase >= 0.5 ? "#ffffff" : CORES[atual.tipo];
      for (const c of L.celulas(atual)) {
        if (c.y < 0) continue;
        if (dourado) {
          ctx.globalAlpha = (0.25 + 0.25 * Math.abs(fase * 2 - 1)) * 0.35;
          ctx.fillStyle = CORES.DOURADO;
          ctx.beginPath();
          ctx.arc((c.x + 0.5) * celula, (c.y + 0.5) * celula, celula * 0.95, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        desenharBloco(ctx, c.x, c.y, celula, cor);
      }
    }

    // Clarão rápido nas linhas apagadas
    const passado = agora - claraoInicio;
    if (passado < CLARAO_MS && e.ultimaLimpeza.length) {
      ctx.globalAlpha = 0.85 * (1 - passado / CLARAO_MS);
      ctx.fillStyle = "#fff";
      for (const linha of e.ultimaLimpeza) ctx.fillRect(0, linha * celula, tela.width, celula);
      ctx.globalAlpha = 1;
    }
  }

  /** Peça no estado inicial, centralizada no espaço (cabe a maior: 4 × 2). */
  function desenharMini(canvas, tipo) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!tipo) return;
    const lista = L.PECAS[tipo].rotacoes[0];
    const minX = Math.min(...lista.map((c) => c.x));
    const minY = Math.min(...lista.map((c) => c.y));
    const colunas = Math.max(...lista.map((c) => c.x)) - minX + 1;
    const linhas = Math.max(...lista.map((c) => c.y)) - minY + 1;
    const tamanho = Math.min(canvas.width / 4, canvas.height / 2);
    ctx.save();
    ctx.translate((canvas.width - colunas * tamanho) / 2, (canvas.height - linhas * tamanho) / 2);
    for (const c of lista) desenharBloco(ctx, c.x - minX, c.y - minY, tamanho, CORES[tipo]);
    ctx.restore();
  }

  function desenharPainel() {
    const e = ultimoEstado;
    desenharMini(telaProxima, e.proxima);
    desenharMini(telaGuardada, e.guardada);
    cartaoGuardada.classList.toggle("lb-apagado", !e.podeGuardar);
    textoProxima.textContent = e.proxima ? `Próxima peça: ${NOMES[e.proxima]}` : "";
    textoGuardada.textContent = e.guardada
      ? `Peça guardada: ${NOMES[e.guardada]}${e.podeGuardar ? "" : " (já usada nesta peça)"}`
      : "Nenhuma peça guardada";
    textoPontos.textContent = e.pontos.toLocaleString("pt-BR");
    textoLinhas.textContent = e.linhas.toLocaleString("pt-BR");
    textoNivel.textContent = e.nivel.toLocaleString("pt-BR");
    textoTempo.textContent = L.formatarTempo(e.tempoMs);
    controles.querySelector('[data-acao="segurar"]').disabled = !e.podeGuardar;
  }

  function desenharTudo(agora = performance.now()) {
    ultimoEstado = motor.estado();
    versaoDesenhada = motor.versao;
    desenharTabuleiro(agora);
    desenharPainel();
  }

  function redimensionar() {
    ajustarCanvas(tela);
    ajustarCanvas(telaProxima);
    ajustarCanvas(telaGuardada);
    desenharTudo();
  }

  // ---------- Laço da partida ----------

  /** Algo animado na tela: bloco dourado piscando ou clarão das linhas. */
  function animando(agora) {
    if (reduzirMovimento) return false;
    const dourado = motor.status === "jogando" && motor.atual?.tipo === "DOURADO";
    return dourado || agora - claraoInicio < CLARAO_MS;
  }

  function passo(agora) {
    laco = 0;
    if (motor.status === "jogando") {
      // O resto em frações de ms evita atraso acumulado, como no app
      const decorrido = agora - anterior + restoMs;
      anterior = agora;
      const inteiro = Math.floor(decorrido);
      restoMs = decorrido - inteiro;
      motor.avancar(inteiro);
      depoisDaAcao();
      if (motor.status === "jogando" && motor.tempoMs - ultimoSalvo >= SALVAR_A_CADA_MS) salvarPartida();
    }
    if (motor.versao !== versaoDesenhada || animando(agora)) desenharTudo(agora);
    if (motor.status === "jogando" || animando(agora)) laco = requestAnimationFrame(passo);
  }

  function ligarLaco() {
    if (laco) return;
    anterior = performance.now();
    restoMs = 0;
    laco = requestAnimationFrame(passo);
  }

  /** Confere o que mudou na partida: linhas apagadas, nível e fim de jogo. */
  function depoisDaAcao() {
    const antes = ultimoEstado;
    if (!antes) return;
    if (motor.contadorLimpezas !== antes.contadorLimpezas && motor.ultimaLimpeza.length) {
      claraoInicio = performance.now();
      const n = motor.ultimaLimpeza.length;
      let texto = `${n} ${n === 1 ? "linha apagada" : "linhas apagadas"}.`;
      if (motor.nivel !== antes.nivel) texto += ` Nível ${motor.nivel}.`;
      anunciar(texto);
    }
    if (motor.status === "fim" && antes.status !== "fim") terminar();
    if (motor.versao !== versaoDesenhada) desenharTudo();
  }

  function executar(acao) {
    if (motor.status !== "jogando") return;
    acao();
    depoisDaAcao();
    ligarLaco();
  }

  const ACOES = {
    esquerda: () => motor.mover(-1),
    direita: () => motor.mover(1),
    girar: () => motor.girar(true),
    "girar-anti": () => motor.girar(false),
    suave: () => motor.quedaSuave(),
    queda: () => motor.quedaInstantanea(),
    segurar: () => motor.segurar(),
  };

  function agir(nome) {
    if (nome === "pausar") {
      pausar();
      return;
    }
    if (ACOES[nome]) executar(ACOES[nome]);
  }

  // ---------- Partida ----------

  function anunciar(texto) {
    status.textContent = "";
    requestAnimationFrame(() => {
      status.textContent = texto;
    });
  }

  function iniciar() {
    novoRecorde = false;
    motor.novoJogo();
    claraoInicio = -Infinity;
    ultimoSalvo = 0;
    mostrar(null);
    desenharTudo();
    salvarPartida();
    ligarLaco();
    anunciar("Partida iniciada.");
    focarJogo();
  }

  /** Foco no tabuleiro e o tabuleiro inteiro na tela, para a partida não correr fora da vista. */
  function focarJogo() {
    quadro.focus({ preventScroll: true });
    if (!quadroVisivel()) area.scrollIntoView({ block: "nearest", behavior: reduzirMovimento ? "auto" : "smooth" });
  }

  function pausar() {
    if (motor.status !== "jogando") return;
    motor.pausar();
    pararRepeticoes();
    salvarPartida();
    desenharTudo();
    mostrar("pausa");
  }

  function retomar() {
    if (motor.status !== "pausado") return;
    motor.retomar();
    mostrar(null);
    desenharTudo();
    ligarLaco();
    focarJogo();
  }

  function terminar() {
    pararRepeticoes();
    gravar(CHAVE_PARTIDA, null);
    const pontos = motor.pontos;
    novoRecorde = false;
    if (pontos > 0) {
      novoRecorde = L.posicaoRecorde(recordes, pontos) === 0;
      recordes = L.adicionarRecorde(recordes, { pontos, nivel: motor.nivel, data: L.dataAgora() });
      gravar(CHAVE_RECORDES, L.recordesParaJson(recordes));
      mostrarRecordes();
    }
    mostrar("fim");
  }

  // ---------- Sobreposição ----------

  function criar(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function botao(texto, acao, secundario = false) {
    const b = criar("button", secundario ? "lb-botao-texto" : "lb-botao-principal", texto);
    b.type = "button";
    b.addEventListener("click", () => {
      if (Date.now() < liberadoEm) return;
      acao();
    });
    return b;
  }

  /** "LUMIBRICKS" com uma cor de peça por letra, como o título do app. */
  function tituloColorido(id) {
    const titulo = criar("p", "lb-titulo");
    titulo.id = id;
    titulo.setAttribute("aria-label", "Lumibricks");
    const cores = L.QUATRO_BLOCOS.map((t) => CORES[t]);
    [..."LUMIBRICKS"].forEach((letra, i) => {
      const span = criar("span", "", letra);
      span.setAttribute("aria-hidden", "true");
      span.style.color = cores[i % cores.length];
      titulo.append(span);
    });
    return titulo;
  }

  function conteudoInicio() {
    const melhor = recordes[0];
    const itens = [
      "Mova as peças com ← → ou arrastando no tabuleiro",
      "Toque no tabuleiro, use ↑ ou os botões de girar",
      "Deslize para baixo ou use ↓ para acelerar a queda",
      "Deslize rápido para baixo ou use espaço para a queda instantânea",
      "Deslize para cima, use C ou Segurar para guardar a peça (uma vez por peça)",
      "O bloco dourado atravessa as peças e cai no buraco mais fundo da coluna",
      "Limpe linhas para marcar pontos!",
    ];
    const listaDicas = criar("ul", "lb-dicas");
    for (const item of itens) listaDicas.append(criar("li", "", item));
    const partes = [
      tituloColorido("lb-aviso-titulo"),
      criar("p", "lb-sub", "Clássico jogo de blocos"),
      criar("p", "lb-como", "Como jogar"),
      listaDicas,
    ];
    if (melhor) partes.push(criar("p", "lb-sub", `Recorde: ${melhor.pontos.toLocaleString("pt-BR")} pontos`));
    partes.push(botao("Iniciar jogo", iniciar));
    return partes;
  }

  function conteudoPausa() {
    return [
      criar("p", "lb-aviso-titulo", "Jogo pausado"),
      criar("p", "lb-sub", "Pressione Retomar (ou a tecla P) para continuar."),
      botao("Retomar", retomar),
      botao("Reiniciar", () => mostrar("reiniciar"), true),
    ];
  }

  function conteudoReiniciar() {
    return [
      criar("p", "lb-aviso-titulo", "Reiniciar jogo"),
      criar("p", "lb-sub", "Tem certeza que deseja iniciar um novo jogo?"),
      botao("Reiniciar", iniciar),
      botao("Cancelar", () => mostrar("pausa"), true),
    ];
  }

  function conteudoFim() {
    const partes = [
      criar("p", "lb-aviso-titulo", "Fim de jogo"),
      criar("p", "lb-final", `Pontuação final: ${motor.pontos.toLocaleString("pt-BR")}`),
    ];
    if (novoRecorde) partes.push(criar("p", "lb-recorde-novo", "Novo recorde!"));
    partes.push(
      criar("p", "", "Obrigado por jogar!"),
      criar("p", "lb-sub", "Tente bater sua maior pontuação!"),
      botao("Novo jogo", iniciar),
    );
    return partes;
  }

  /**
   * Mostra a sobreposição (ou esconde, com null). Os botões do fim de jogo ignoram toques no
   * primeiro segundo: ela aparece onde o jogador estava tocando para girar a peça.
   */
  function mostrar(tipo) {
    const focoNoJogo = raiz.contains(document.activeElement);
    telaAviso = tipo;
    if (!tipo) {
      sobreposicao.hidden = true;
      jogo.inert = false;
      controles.inert = false;
      return;
    }
    const conteudo = { inicio: conteudoInicio, pausa: conteudoPausa, reiniciar: conteudoReiniciar, fim: conteudoFim }[tipo]();
    if (!conteudo[0].id) conteudo[0].id = "lb-aviso-titulo";
    aviso.replaceChildren(...conteudo);
    liberadoEm = tipo === "fim" ? Date.now() + ESPERA_BOTAO_FIM_MS : 0;
    sobreposicao.hidden = false;
    jogo.inert = true;
    controles.inert = true;
    if (tipo === "pausa") anunciar("Jogo pausado.");
    if (tipo === "fim") {
      anunciar(`Fim de jogo. Pontuação final: ${motor.pontos.toLocaleString("pt-BR")}.${novoRecorde ? " Novo recorde!" : ""}`);
    }
    if (focoNoJogo) aviso.querySelector("button")?.focus({ preventScroll: true });
  }

  // ---------- Recordes ----------

  function mostrarRecordes() {
    lista.replaceChildren(
      ...recordes.map((r, i) => {
        const item = criar("li");
        const data = L.formatarData(r.data);
        item.append(
          criar("span", "lb-posicao", `${i + 1}º`),
          criar("strong", "", `${r.pontos.toLocaleString("pt-BR")} pontos`),
          criar("span", "lb-detalhe", [r.nivel ? `nível ${r.nivel}` : "", data].filter(Boolean).join(" · ")),
        );
        return item;
      }),
    );
    vazio.hidden = recordes.length > 0;
    lista.hidden = recordes.length === 0;
    botaoLimpar.disabled = recordes.length === 0;
  }

  botaoLimpar.addEventListener("click", () => {
    confirmar.hidden = false;
    botaoLimparNao.focus();
  });
  botaoLimparNao.addEventListener("click", () => {
    confirmar.hidden = true;
    botaoLimpar.focus();
  });
  botaoLimparSim.addEventListener("click", () => {
    recordes = [];
    gravar(CHAVE_RECORDES, null);
    confirmar.hidden = true;
    mostrarRecordes();
    anunciar("Pontuações apagadas.");
    if (telaAviso === "inicio") mostrar("inicio");
  });

  // ---------- Botões ----------

  const repeticoes = new Map();

  function pararRepeticoes() {
    for (const parar of repeticoes.values()) parar();
    repeticoes.clear();
  }

  /** Repete a ação enquanto o botão ou a tecla ficam pressionados (170 ms, depois a cada 55 ms). */
  function repetir(chave, nome) {
    if (repeticoes.has(chave)) return;
    let intervalo = 0;
    const espera = setTimeout(() => {
      intervalo = setInterval(() => {
        if (motor.status !== "jogando") return pararRepeticao(chave);
        agir(nome);
      }, INTERVALO_REPETICAO_MS);
    }, ATRASO_REPETICAO_MS);
    repeticoes.set(chave, () => {
      clearTimeout(espera);
      clearInterval(intervalo);
    });
  }

  function pararRepeticao(chave) {
    const parar = repeticoes.get(chave);
    if (!parar) return;
    parar();
    repeticoes.delete(chave);
  }

  // Os botões agem no instante do toque (não ao soltar); o clique de teclado continua valendo
  for (const b of controles.querySelectorAll("[data-acao]")) {
    const nome = b.dataset.acao;
    const chave = `botao-${nome}`;
    b.addEventListener("pointerdown", (evento) => {
      if (b.disabled || evento.button > 0) return;
      evento.preventDefault();
      b.classList.add("lb-pressionado");
      try {
        b.setPointerCapture(evento.pointerId);
      } catch (error) {
        /* Sem captura, a repetição para quando o dedo sai do botão. */
      }
      agir(nome);
      if (b.hasAttribute("data-repetir")) repetir(chave, nome);
    });
    const soltar = () => {
      b.classList.remove("lb-pressionado");
      pararRepeticao(chave);
    };
    b.addEventListener("pointerup", soltar);
    b.addEventListener("pointercancel", soltar);
    b.addEventListener("lostpointercapture", soltar);
    b.addEventListener("click", (evento) => {
      if (evento.detail === 0) agir(nome);
    });
    b.addEventListener("contextmenu", (evento) => evento.preventDefault());
  }

  // ---------- Teclado ----------

  const TECLAS = {
    ArrowLeft: "esquerda",
    a: "esquerda",
    ArrowRight: "direita",
    d: "direita",
    ArrowDown: "suave",
    s: "suave",
    ArrowUp: "girar",
    w: "girar",
    x: "girar",
    q: "girar-anti",
    z: "girar-anti",
    " ": "queda",
    c: "segurar",
    Shift: "segurar",
  };
  const COM_REPETICAO = new Set(["esquerda", "direita", "suave"]);

  // As teclas só controlam o jogo com metade do tabuleiro na tela, para não atrapalhar a página
  function quadroVisivel() {
    const r = quadro.getBoundingClientRect();
    const visivel = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    return visivel >= r.height / 2;
  }

  document.addEventListener("keydown", (evento) => {
    if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
    if (evento.target.closest?.("input, textarea, select, [contenteditable]")) return;
    const tecla = evento.key.length === 1 ? evento.key.toLowerCase() : evento.key;
    if (tecla === "p" || tecla === "Escape") {
      if (!quadroVisivel()) return;
      if (motor.status === "jogando") {
        evento.preventDefault();
        pausar();
      } else if (motor.status === "pausado" && telaAviso === "pausa" && tecla === "p") {
        evento.preventDefault();
        retomar();
      }
      return;
    }
    const nome = TECLAS[tecla];
    if (!nome || motor.status !== "jogando" || !quadroVisivel()) return;
    // Espaço num botão focado aperta o botão, não derruba a peça
    if (tecla === " " && evento.target.closest?.("button, a, summary")) return;
    evento.preventDefault();
    if (evento.repeat) return;
    agir(nome);
    if (COM_REPETICAO.has(nome)) repetir(`tecla-${tecla}`, nome);
  });

  document.addEventListener("keyup", (evento) => {
    const tecla = evento.key.length === 1 ? evento.key.toLowerCase() : evento.key;
    pararRepeticao(`tecla-${tecla}`);
  });

  // ---------- Gestos no tabuleiro ----------

  /**
   * Toque: gira. Arrastar para os lados: move uma coluna a cada largura de célula.
   * Arrastar para baixo: queda suave; deslize rápido para baixo: queda instantânea.
   * Deslize para cima: segurar.
   */
  let gesto = null;

  quadro.addEventListener("pointerdown", (evento) => {
    if (motor.status !== "jogando" || evento.button > 0) return;
    evento.preventDefault();
    gesto = {
      id: evento.pointerId,
      x: evento.clientX,
      y: evento.clientY,
      totalX: 0,
      totalY: 0,
      restoX: 0,
      restoY: 0,
      eixo: null,
      amostras: [{ y: evento.clientY, t: evento.timeStamp }],
    };
    try {
      quadro.setPointerCapture(evento.pointerId);
    } catch (error) {
      /* Sem captura, o gesto vale enquanto o dedo estiver sobre o tabuleiro. */
    }
  });

  quadro.addEventListener("pointermove", (evento) => {
    if (!gesto || evento.pointerId !== gesto.id) return;
    const passoPx = quadro.clientWidth / L.LARGURA;
    const dx = evento.clientX - gesto.x;
    const dy = evento.clientY - gesto.y;
    gesto.x = evento.clientX;
    gesto.y = evento.clientY;
    gesto.totalX += dx;
    gesto.totalY += dy;
    gesto.amostras.push({ y: evento.clientY, t: evento.timeStamp });
    if (gesto.amostras.length > 12) gesto.amostras.shift();
    if (gesto.eixo === null) {
      if (Math.abs(gesto.totalX) > LIMITE_TOQUE_PX || Math.abs(gesto.totalY) > LIMITE_TOQUE_PX) {
        gesto.eixo = Math.abs(gesto.totalX) > Math.abs(gesto.totalY) ? "horizontal" : "vertical";
        gesto.restoX = gesto.totalX;
        gesto.restoY = gesto.totalY;
      }
    } else {
      gesto.restoX += dx;
      gesto.restoY += dy;
    }
    if (gesto.eixo === "horizontal") {
      while (gesto.restoX >= passoPx) {
        agir("direita");
        gesto.restoX -= passoPx;
      }
      while (gesto.restoX <= -passoPx) {
        agir("esquerda");
        gesto.restoX += passoPx;
      }
    } else if (gesto.eixo === "vertical") {
      while (gesto.restoY >= passoPx) {
        agir("suave");
        gesto.restoY -= passoPx;
      }
    }
  });

  quadro.addEventListener("pointerup", (evento) => {
    if (!gesto || evento.pointerId !== gesto.id) return;
    const g = gesto;
    gesto = null;
    const passoPx = quadro.clientWidth / L.LARGURA;
    // Velocidade vertical nos últimos 100 ms do gesto
    const fim = g.amostras[g.amostras.length - 1];
    const inicio = g.amostras.find((a) => fim.t - a.t <= 100) || fim;
    const tempo = Math.max(1, fim.t - inicio.t);
    const velocidade = ((fim.y - inicio.y) / tempo) * 1000;
    if (g.eixo === null) agir("girar");
    else if (g.eixo === "vertical" && velocidade > VELOCIDADE_QUEDA_PX_S && g.totalY > passoPx * 0.5) agir("queda");
    else if (g.eixo === "vertical" && g.totalY < -passoPx * 2) agir("segurar");
  });

  quadro.addEventListener("pointercancel", () => {
    gesto = null;
  });
  quadro.addEventListener("contextmenu", (evento) => evento.preventDefault());

  // ---------- Pausa automática ----------

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pausar();
      salvarPartida();
    }
  });
  window.addEventListener("blur", () => {
    pausar();
    pararRepeticoes();
  });
  window.addEventListener("pagehide", salvarPartida);

  // Rolar a página para longe do tabuleiro também pausa (as peças não caem sem ninguém ver)
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      ([entrada]) => {
        quadroNaTela = entrada.isIntersecting;
        if (!quadroNaTela) pausar();
      },
      { threshold: 0.35 },
    ).observe(quadro);
  }

  if ("ResizeObserver" in window) {
    new ResizeObserver(() => redimensionar()).observe(area);
  } else {
    window.addEventListener("resize", redimensionar);
  }

  // ---------- Início ----------

  recordes = L.recordesDeJson(ler(CHAVE_RECORDES));
  const salva = L.partidaDeJson(ler(CHAVE_PARTIDA));
  // Partida interrompida volta pausada, para o jogador decidir quando continuar
  if (salva && !motor.restaurar(salva)) gravar(CHAVE_PARTIDA, null);
  mostrarRecordes();
  redimensionar();
  mostrar(motor.status === "pausado" ? "pausa" : "inicio");
})();
