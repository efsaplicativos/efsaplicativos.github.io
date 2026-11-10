"use strict";
/*
 * Interface da Cobrinha. Regras em cobrinha-logica.js. O passo é agendado com o intervalo do nível,
 * que encurta a cada fruta; a partida fica salva (pausada) quando você sai da página, e o recorde
 * de cada nível fica no localStorage.
 */
(() => {
  const raiz = document.querySelector(".cobrinha");
  if (!raiz || typeof LogicaCobrinha !== "object") return;
  const C = LogicaCobrinha;

  const CHAVE_PARTIDA = "efs-cobrinha-partida";
  const CHAVE_NIVEL = "efs-cobrinha-nivel";
  const CHAVE_RECORDES = "efs-cobrinha-recordes";

  const tabuleiroEl = raiz.querySelector("#cbr-tabuleiro");
  const mensagem = raiz.querySelector("#cbr-mensagem");
  const pontosEl = raiz.querySelector("#cbr-pontos");
  const recordeEl = raiz.querySelector("#cbr-recorde");
  const tamanhoEl = raiz.querySelector("#cbr-tamanho");
  const blocoNiveis = raiz.querySelector("#cbr-niveis");
  const botoesNivel = [...raiz.querySelectorAll("[data-nivel]")];
  const botoesDirecao = [...raiz.querySelectorAll("[data-direcao]")];
  const botaoJogar = raiz.querySelector("#cbr-jogar");
  const botaoReiniciar = raiz.querySelector("#cbr-reiniciar");
  const aviso = raiz.querySelector("#cbr-aviso");
  const botaoContinuar = raiz.querySelector("#cbr-continuar");
  const botaoZerar = raiz.querySelector("#cbr-zerar");
  const recordesEls = {
    facil: raiz.querySelector("#cbr-recorde-facil"),
    medio: raiz.querySelector("#cbr-recorde-medio"),
    dificil: raiz.querySelector("#cbr-recorde-dificil"),
  };
  // Sem a biblioteca de sons (script que não carregou), o jogo continua, só que mudo
  const som = typeof Sons === "object" ? Sons.criar("cobrinha", raiz) : { tocar() {}, ligarBotao() {} };
  som.ligarBotao(raiz.querySelector("#cbr-som"));

  let nivel = C.NIVEIS.medio;
  let partida = C.iniciar(nivel);
  let recordes = { ...C.RECORDES_ZERO };
  let rodando = false;
  let iniciada = false;
  let relogio = null;
  let celulas = [];
  let ultimaMensagem = "";

  // ---------- Armazenamento ----------

  function lerJson(chave) {
    try {
      return JSON.parse(localStorage.getItem(chave));
    } catch (erro) {
      return null;
    }
  }

  function gravar(chave, valor) {
    try {
      if (valor === null) localStorage.removeItem(chave);
      else localStorage.setItem(chave, JSON.stringify(valor));
    } catch (erro) {
      /* Armazenamento indisponível: vale só enquanto a página estiver aberta */
    }
  }

  const salvar = () => gravar(CHAVE_PARTIDA, C.paraSalvar(partida));

  function carregar() {
    const guardado = lerJson(CHAVE_NIVEL);
    if (guardado && C.NIVEIS[guardado]) nivel = C.NIVEIS[guardado];
    recordes = C.recordesDe(lerJson(CHAVE_RECORDES));
    const salva = C.restaurar(lerJson(CHAVE_PARTIDA));
    if (salva) {
      partida = salva;
      nivel = C.NIVEIS[salva.nivel];
      iniciada = true;
    }
  }

  // ---------- Batida da fruta ----------

  /*
   * A batida é feita aqui, e não com animação CSS, por dois motivos: dá para acertar o ritmo de
   * coração acelerado (dois toques fortes e um descanso curto) e para exatamente quando o jogo não
   * está andando. O CSS só aplica a escala que estiver na variável --cbr-batida.
   */
  const BATIDA_MS = 800;
  const BATIDA_MS_REDUZIDA = 1600;
  const BATIDA_TOQUES = [
    [0.12, 0.2],
    [0.38, 0.2],
  ];
  const BATIDA_BASE = 0.86;
  const BATIDA_AMPLITUDE = 0.16;
  const movimentoReduzido = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  const agoraMs = () =>
    typeof performance === "object" && typeof performance.now === "function" ? performance.now() : Date.now();
  let batidaQuadro = null;
  let batidaInicio = 0;

  /** Escala da fruta naquele instante: dois toques e um descanso curto, em ciclo. */
  function escalaDaBatida(agora) {
    const ciclo = movimentoReduzido && movimentoReduzido.matches ? BATIDA_MS_REDUZIDA : BATIDA_MS;
    const t = ((((agora - batidaInicio) % ciclo) + ciclo) % ciclo) / ciclo;
    let forca = 0;
    for (const [centro, largura] of BATIDA_TOQUES) {
      forca = Math.max(forca, Math.max(0, 1 - Math.abs(t - centro) / largura));
    }
    return BATIDA_BASE + BATIDA_AMPLITUDE * forca;
  }

  function pararBatida() {
    if (batidaQuadro !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(batidaQuadro);
    batidaQuadro = null;
    tabuleiroEl.style.setProperty("--cbr-batida", String(BATIDA_BASE));
  }

  function animarBatida(agora) {
    batidaQuadro = null;
    if (!rodando || partida.terminada) return;
    tabuleiroEl.style.setProperty("--cbr-batida", escalaDaBatida(agora).toFixed(3));
    if (typeof requestAnimationFrame === "function") batidaQuadro = requestAnimationFrame(animarBatida);
  }

  function comecarBatida() {
    pararBatida();
    if (!rodando || partida.terminada) return;
    if (typeof requestAnimationFrame !== "function") return;
    batidaInicio = agoraMs();
    batidaQuadro = requestAnimationFrame(animarBatida);
  }

  // ---------- Tabuleiro ----------

  function montarTabuleiro() {
    tabuleiroEl.style.setProperty("--colunas", String(nivel.colunas));
    tabuleiroEl.style.setProperty("--linhas", String(nivel.linhas));
    tabuleiroEl.replaceChildren();
    celulas = [];
    for (let casa = 0; casa < C.totalDeCasas(nivel); casa++) {
      const celula = document.createElement("div");
      celula.className = "cbr-casa";
      celulas.push(celula);
      tabuleiroEl.append(celula);
    }
  }

  function desenhar() {
    // A maçã só pisca com o jogo em andamento: antes de começar (parado) e no fim, fica parada
    tabuleiroEl.dataset.jogo = partida.terminada ? "fim" : iniciada ? "ativo" : "parado";

    // Monta a classe de cada casa e só escreve onde mudou: reescrever a mesma classe reiniciaria
    // a animação da maçã a cada passo, e ela nunca passaria do começo
    const classes = new Array(celulas.length).fill("cbr-casa");
    if (partida.comida >= 0 && partida.comida < classes.length) classes[partida.comida] = "cbr-casa cbr-comida";
    partida.corpo.forEach((casa, i) => {
      if (casa < 0 || casa >= classes.length) return;
      const partes = ["cbr-casa", i === 0 ? "cbr-cabeca" : "cbr-corpo"];
      if (i === partida.corpo.length - 1) partes.push("cbr-cauda");
      classes[casa] = partes.join(" ");
    });
    for (let casa = 0; casa < celulas.length; casa++) {
      if (celulas[casa].className !== classes[casa]) celulas[casa].className = classes[casa];
    }
    desenharMensagem();
    desenharControles();
  }

  function desenharMensagem() {
    let tipo = "vez";
    let texto;
    if (partida.terminada) {
      tipo = partida.vitoria ? "vitoria" : "derrota";
      texto = partida.vitoria
        ? "Você encheu o tabuleiro! Vitória!"
        : partida.motivo === C.MOTIVOS.PAREDE
          ? "Fim de jogo: bateu na parede."
          : "Fim de jogo: bateu no próprio corpo.";
    } else if (!iniciada) {
      texto = "Pronto? Use as setas ou toque em Jogar.";
    } else if (!rodando) {
      tipo = "pausado";
      texto = "Jogo pausado.";
    } else {
      texto = `Jogando · ${partida.comidas} ${partida.comidas === 1 ? "fruta" : "frutas"}`;
    }
    const chave = `${tipo}|${texto}|${partida.pontos}|${partida.comidas}`;
    if (chave === ultimaMensagem) return;
    ultimaMensagem = chave;
    mensagem.dataset.tipo = tipo;
    const icone = document.createElement("span");
    icone.className = "cbr-icone";
    icone.setAttribute("aria-hidden", "true");
    icone.textContent = { vez: "🐍", vitoria: "🏆", derrota: "💥", pausado: "⏸" }[tipo];
    const rotulo = document.createElement("span");
    rotulo.textContent = texto;
    mensagem.replaceChildren(icone, rotulo);
  }

  function desenharControles() {
    pontosEl.textContent = String(partida.pontos);
    recordeEl.textContent = String(recordes[nivel.id] ?? 0);
    tamanhoEl.textContent = `${nivel.colunas} × ${nivel.linhas}`;
    for (const id of Object.keys(recordesEls)) {
      const el = recordesEls[id];
      if (el) el.textContent = String(recordes[id] ?? 0);
    }
    for (const botao of botoesNivel) {
      const ativo = botao.dataset.nivel === nivel.id;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    botaoJogar.textContent = rodando ? "Pausar" : partida.terminada ? "Jogar novamente" : "Jogar";
    botaoJogar.setAttribute("aria-pressed", String(rodando));
    aviso.hidden = !iniciada || rodando || partida.terminada;
    botaoZerar.disabled = !Object.values(recordes).some((valor) => valor > 0);
    for (const botao of botoesDirecao) botao.disabled = partida.terminada;
  }

  // ---------- Partida ----------

  function pararRelogio() {
    if (relogio !== null) clearTimeout(relogio);
    relogio = null;
    rodando = false;
    pararBatida();
  }

  function novaPartida(comecarJogando = false) {
    pararRelogio();
    partida = C.iniciar(nivel);
    iniciada = comecarJogando;
    ultimaMensagem = "";
    montarTabuleiro();
    desenhar();
    if (comecarJogando) comecar();
    else {
      gravar(CHAVE_PARTIDA, null);
      som.tocar("inicio");
    }
  }

  function comecar() {
    if (partida.terminada) {
      novaPartida(true);
      return;
    }
    if (rodando) return;
    iniciada = true;
    rodando = true;
    som.tocar("inicio");
    agendar();
    desenhar();
    comecarBatida();
  }

  function pausar() {
    if (!rodando) return;
    pararRelogio();
    salvar();
    som.tocar("toque");
    desenhar();
  }

  function alternar() {
    if (rodando) pausar();
    else comecar();
  }

  /** Agenda o próximo passo com o intervalo do momento (que encurta a cada fruta). */
  function agendar() {
    if (!rodando) return;
    relogio = setTimeout(passo, C.intervaloDo(nivel, partida.comidas));
  }

  function passo() {
    relogio = null;
    if (!rodando) return;
    const antes = partida;
    partida = C.avancar(partida);
    if (partida.terminada) {
      terminar();
      return;
    }
    if (partida.comidas !== antes.comidas) {
      som.tocar("acerto");
      salvar();
    }
    desenhar();
    agendar();
  }

  function terminar() {
    pararRelogio();
    gravar(CHAVE_PARTIDA, null);
    const novos = C.atualizarRecorde(recordes, nivel, partida.pontos);
    if (novos !== recordes) {
      recordes = novos;
      gravar(CHAVE_RECORDES, recordes);
    }
    som.tocar(partida.vitoria ? "nivel" : "derrota");
    ultimaMensagem = "";
    desenhar();
  }

  /** Vira a cobra; se o jogo ainda não começou (ou está pausado), ele começa junto. */
  function virar(direcao) {
    if (partida.terminada) return;
    if (!rodando) {
      comecar();
      if (!rodando) return;
    }
    const antes = partida;
    partida = C.girar(partida, direcao);
    if (partida !== antes) som.tocar("toque");
  }

  // ---------- Controles ----------

  botaoJogar.addEventListener("click", alternar);
  botaoReiniciar.addEventListener("click", () => novaPartida(false));
  botaoContinuar.addEventListener("click", comecar);

  for (const botao of botoesDirecao) {
    botao.addEventListener("click", () => virar(botao.dataset.direcao));
  }

  for (const botao of botoesNivel) {
    botao.addEventListener("click", () => {
      if (botao.dataset.nivel === nivel.id) return;
      nivel = C.NIVEIS[botao.dataset.nivel];
      gravar(CHAVE_NIVEL, nivel.id);
      novaPartida(false);
    });
  }

  botaoZerar.addEventListener("click", () => {
    recordes = { ...C.RECORDES_ZERO };
    gravar(CHAVE_RECORDES, recordes);
    desenhar();
    som.tocar("toque");
  });

  document.addEventListener("keydown", (evento) => {
    const tecla = evento.key;
    const mapa = {
      ArrowUp: "cima",
      ArrowDown: "baixo",
      ArrowLeft: "esquerda",
      ArrowRight: "direita",
      w: "cima",
      s: "baixo",
      a: "esquerda",
      d: "direita",
      W: "cima",
      S: "baixo",
      A: "esquerda",
      D: "direita",
    };
    if (mapa[tecla]) {
      evento.preventDefault();
      virar(mapa[tecla]);
      return;
    }
    if (tecla === " " || tecla === "Spacebar") {
      // A barra de espaço pausa e retoma, menos quando o foco está num botão
      if (evento.target && evento.target.tagName === "BUTTON") return;
      evento.preventDefault();
      alternar();
    }
  });

  // Sair da aba (ou trocar de aplicativo) pausa, para a cobra não bater sozinha
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && rodando) pausar();
  });

  // Fechar ou recarregar a página também guarda a partida
  window.addEventListener("pagehide", () => {
    if (iniciada && !partida.terminada) salvar();
  });

  carregar();
  if (partida.nivel !== nivel.id) partida = C.iniciar(nivel);
  montarTabuleiro();
  pararBatida();
  desenhar();
})();
