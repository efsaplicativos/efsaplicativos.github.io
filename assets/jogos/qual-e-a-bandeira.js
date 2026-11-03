"use strict";
/*
 * Interface do Qual a Bandeira, como no app (ui/telas/TelaInicial.kt, ui/telas/jogo/TelaJogo.kt,
 * JogoViewModel.kt, PlacarJogo.kt e FimDeJogo.kt): início com "Continuar jogo", placar, vidas,
 * sequência, dificuldade, respostas coloridas por 1,1 s e o fim de jogo. As regras ficam em
 * qual-e-a-bandeira-logica.js; partida e recorde, no localStorage.
 */
(() => {
  const raiz = document.querySelector("#qbandeira");
  if (!raiz || typeof LogicaBandeiras === "undefined") return;
  const L = LogicaBandeiras;

  const TEMPO_RESPOSTA_MS = 1100;
  const TRAVA_AVISO_MS = 600;
  const CONTAGEM_MS = 900;
  const CHAVE_PARTIDA = "efs-qual-e-a-bandeira-partida";
  const CHAVE_RECORDE = "efs-qual-e-a-bandeira-recorde";
  const PASTA_BANDEIRAS = "/assets/jogos/qual-e-a-bandeira/bandeiras/";
  const NOMES_DIFICULDADE = { 1: "Fácil", 2: "Médio", 3: "Difícil" };

  const $ = (seletor) => raiz.querySelector(seletor);
  const painel = $("#qb-painel");
  const telaInicio = $("#qb-inicio");
  const telaJogo = $("#qb-jogo");
  const seloRecorde = $("#qb-selo-recorde");
  const textoRecordeInicio = $("#qb-recorde-inicio");
  const botaoContinuar = $("#qb-continuar");
  const textoResumo = $("#qb-resumo");
  const botaoNovo = $("#qb-novo");
  const botaoVoltar = $("#qb-voltar");
  const botaoReiniciar = $("#qb-reiniciar");
  const textoNumero = $("#qb-numero");
  const textoPontos = $("#qb-pontos");
  const textoRecorde = $("#qb-recorde");
  const vidas = $("#qb-vidas");
  const selo = $("#qb-sequencia");
  const dificuldade = $("#qb-dificuldade");
  const textoDificuldade = $("#qb-dificuldade-texto");
  const imagem = $("#qb-bandeira");
  const opcoes = [...raiz.querySelectorAll(".qb-opcao")];
  const aviso = $("#qb-aviso");
  const avisoIcone = $("#qb-aviso-icone");
  const avisoTitulo = $("#qb-aviso-titulo");
  const avisoCorpo = $("#qb-aviso-corpo");
  const avisoBotoes = $("#qb-aviso-botoes");
  const status = $("#qb-status");

  let recorde = 0;
  /**
   * Partida na tela: { partida, pergunta, fase: "jogando" | "respondida" | "fim", escolhida,
   * novoRecorde, proxima } — proxima é a pergunta seguinte, já sorteada para pré-carregar a bandeira.
   */
  let estado = null;
  let avanco = null;
  let fecharAvisoCom = null;
  let focoAntesDoAviso = null;

  const formatar = (n) => n.toLocaleString("pt-BR");
  const urlBandeira = (codigo) => `${PASTA_BANDEIRAS}${codigo.toLowerCase()}.webp`;
  const movimentoReduzido = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // ---------- Armazenamento ----------

  function carregarRecorde() {
    try {
      const valor = Number(localStorage.getItem(CHAVE_RECORDE));
      recorde = Number.isInteger(valor) && valor > 0 ? valor : 0;
    } catch (erro) {
      recorde = 0;
    }
  }

  function salvarRecorde() {
    try {
      localStorage.setItem(CHAVE_RECORDE, String(recorde));
    } catch (erro) {
      /* Armazenamento indisponível: o recorde vale só enquanto a página estiver aberta. */
    }
  }

  function carregarPartida() {
    try {
      return L.lerSalva(localStorage.getItem(CHAVE_PARTIDA));
    } catch (erro) {
      return null;
    }
  }

  function salvarPartida(partida) {
    try {
      localStorage.setItem(CHAVE_PARTIDA, JSON.stringify(L.paraSalvar(partida)));
    } catch (erro) {
      /* Sem armazenamento, "Continuar jogo" não aparece depois de recarregar. */
    }
  }

  function apagarPartida() {
    try {
      localStorage.removeItem(CHAVE_PARTIDA);
    } catch (erro) {
      /* Nada a apagar. */
    }
  }

  // ---------- Bandeiras ----------

  // Guarda as imagens pré-carregadas para o navegador não descartá-las antes de usar
  const preCarregadas = new Map();
  function preCarregar(codigo) {
    if (preCarregadas.has(codigo)) return;
    const img = new Image();
    img.decoding = "async";
    img.src = urlBandeira(codigo);
    preCarregadas.set(codigo, img);
    if (preCarregadas.size > 4) preCarregadas.delete(preCarregadas.keys().next().value);
  }

  function mostrarBandeira(codigo) {
    imagem.src = urlBandeira(codigo);
    imagem.classList.remove("qb-entrar");
    void imagem.offsetWidth; // reinicia a animação de entrada
    imagem.classList.add("qb-entrar");
  }

  // ---------- Telas ----------

  function mostrarInicio() {
    clearTimeout(avanco);
    estado = null;
    const salva = carregarPartida();
    seloRecorde.hidden = recorde <= 0;
    textoRecordeInicio.textContent = formatar(recorde);
    botaoContinuar.hidden = !salva;
    if (salva) {
      const vidasTexto = salva.vidas === 1 ? "1 vida" : `${salva.vidas} vidas`;
      textoResumo.textContent = `Pergunta ${salva.numeroPergunta} · ${formatar(salva.pontos)} pontos · ${vidasTexto}`;
    }
    telaJogo.hidden = true;
    telaInicio.hidden = false;
  }

  function comecar(partida) {
    clearTimeout(avanco);
    esconderAviso(false);
    estado = { partida, pergunta: null, fase: "jogando", escolhida: null, novoRecorde: false, proxima: null };
    telaInicio.hidden = true;
    telaJogo.hidden = false;
    novaPergunta(partida);
    opcoes[0].focus({ preventScroll: true });
  }

  function novaPergunta(partida, pronta = null) {
    const pergunta = pronta || L.gerarPergunta(partida.numeroPergunta, partida.perguntadas);
    const comPergunta = L.comPergunta(partida, pergunta);
    // A pergunta seguinte depende só do número e das bandeiras já vistas: sorteia agora e pré-carrega
    const proxima = L.gerarPergunta(comPergunta.numeroPergunta + 1, comPergunta.perguntadas);
    estado = { ...estado, partida: comPergunta, pergunta, fase: "jogando", escolhida: null, proxima };
    preCarregar(proxima.correta.codigo);
    mostrarBandeira(pergunta.correta.codigo);
    desenhar();
  }

  function desenhar() {
    const { partida, pergunta, fase, escolhida } = estado;
    textoNumero.textContent = `#${partida.numeroPergunta}`;
    textoNumero.setAttribute("aria-label", `Pergunta ${partida.numeroPergunta}`);
    textoPontos.textContent = formatar(partida.pontos);
    textoRecorde.textContent = formatar(recorde);

    [...vidas.children].forEach((coracao, i) => coracao.classList.toggle("cheio", i < partida.vidas));
    vidas.setAttribute("aria-label", `Vidas: ${partida.vidas}`);

    // O selo mostra o multiplicador do próximo acerto, a partir de 2 acertos seguidos
    const mostrarSelo = partida.sequencia >= 2;
    selo.hidden = !mostrarSelo;
    if (mostrarSelo) {
      const mult = L.multiplicador(partida.sequencia).toFixed(1).replace(".", ",");
      selo.textContent = `×${mult}`;
      selo.setAttribute("aria-label", `Sequência de ${partida.sequencia} acertos: próximo acerto vale ×${mult}`);
      selo.title = `Sequência de ${partida.sequencia} acertos`;
    }

    const nivel = pergunta.correta.dificuldade;
    dificuldade.dataset.nivel = String(nivel);
    textoDificuldade.textContent = NOMES_DIFICULDADE[nivel];

    const correta = pergunta.correta.codigo;
    opcoes.forEach((botao, i) => {
      const pais = pergunta.opcoes[i];
      botao.dataset.codigo = pais.codigo;
      botao.querySelector(".qb-nome").textContent = pais.nome;
      let classe = "";
      let marca = "";
      if (fase !== "jogando") {
        if (pais.codigo === correta) {
          classe = pais.codigo === escolhida ? "acertou" : "era-certa";
          marca = "✓";
        } else if (pais.codigo === escolhida) {
          classe = "errou";
          marca = "✕";
        } else {
          classe = "apagada";
        }
      }
      botao.className = `qb-opcao ${classe}`.trim();
      botao.querySelector(".qb-marca").textContent = marca;
      // aria-disabled em vez de disabled: o foco do teclado continua no botão
      botao.setAttribute("aria-disabled", String(fase !== "jogando"));
    });
  }

  // ---------- Partida ----------

  function responder(codigo) {
    if (!estado || estado.fase !== "jogando" || !aviso.hidden) return;
    const { acertou, pontosGanhos, partida } = L.responder(estado.partida, estado.pergunta, codigo);
    const bateuRecorde = partida.pontos > recorde;
    if (bateuRecorde) {
      recorde = partida.pontos;
      salvarRecorde();
    }
    // Grava já, para "Continuar" não devolver uma vida perdida nem esquecer pontos ganhos
    if (L.terminou(partida)) apagarPartida();
    else salvarPartida(partida);

    estado = { ...estado, partida, fase: "respondida", escolhida: codigo, novoRecorde: estado.novoRecorde || bateuRecorde };
    desenhar();
    const certa = estado.pergunta.correta.nome;
    if (acertou) {
      status.textContent = `Certo, é ${certa}! Mais ${pontosGanhos} pontos.`;
    } else {
      const restam = partida.vidas === 1 ? "Resta 1 vida." : `Restam ${partida.vidas} vidas.`;
      status.textContent = `Errado. Era ${certa}. ${partida.vidas > 0 ? restam : ""}`.trim();
    }
    if (!acertou) {
      const coracao = vidas.children[partida.vidas];
      coracao?.classList.remove("perdeu");
      void coracao?.offsetWidth;
      coracao?.classList.add("perdeu");
    }
    avanco = setTimeout(avancar, TEMPO_RESPOSTA_MS);
  }

  function avancar() {
    if (!estado || estado.fase !== "respondida") return;
    if (L.terminou(estado.partida)) {
      estado = { ...estado, fase: "fim" };
      mostrarFim();
      return;
    }
    novaPergunta(L.proximaRodada(estado.partida), estado.proxima);
  }

  function reiniciar() {
    apagarPartida();
    comecar(L.novaPartida());
  }

  // ---------- Avisos (reiniciar e fim de jogo) ----------

  function botao(rotulo, acao, secundario) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = secundario ? "button secondary" : "button";
    el.textContent = rotulo;
    el.addEventListener("click", acao);
    return el;
  }

  function mostrarAviso({ icone, titulo, corpo = [], botoes, aoFechar = null }) {
    focoAntesDoAviso = document.activeElement;
    avisoIcone.textContent = icone;
    avisoTitulo.textContent = titulo;
    avisoCorpo.replaceChildren(...corpo);
    avisoBotoes.replaceChildren(...botoes.map((b) => botao(b.rotulo, b.acao, b.secundario)));
    fecharAvisoCom = aoFechar;
    aviso.hidden = false;
    aviso.classList.add("travado");
    setTimeout(() => aviso.classList.remove("travado"), TRAVA_AVISO_MS);
    avisoBotoes.firstElementChild?.focus({ preventScroll: true });
  }

  function esconderAviso(devolverFoco = true) {
    if (aviso.hidden) return;
    aviso.hidden = true;
    fecharAvisoCom = null;
    if (devolverFoco && focoAntesDoAviso && document.contains(focoAntesDoAviso)) {
      focoAntesDoAviso.focus({ preventScroll: true });
    }
  }

  function pedirReinicio(aoConfirmar, textoCancelar) {
    const texto = document.createElement("p");
    texto.textContent = "Seu progresso atual será perdido. Tem certeza?";
    mostrarAviso({
      icone: "↻",
      titulo: "Reiniciar jogo?",
      corpo: [texto],
      botoes: [
        { rotulo: "Sim, reiniciar", acao: aoConfirmar },
        { rotulo: textoCancelar, acao: () => esconderAviso(), secundario: true },
      ],
      aoFechar: () => esconderAviso(),
    });
  }

  function mostrarFim() {
    const { partida, novoRecorde } = estado;
    const corpo = [];
    if (novoRecorde) {
      const seloNovo = document.createElement("p");
      seloNovo.className = "qb-novo-recorde";
      seloNovo.textContent = "Novo recorde!";
      corpo.push(seloNovo);
    }
    const rotulo = document.createElement("p");
    rotulo.className = "qb-fim-rotulo";
    rotulo.textContent = "Sua pontuação";
    const pontos = document.createElement("p");
    pontos.className = "qb-fim-pontos";
    pontos.textContent = formatar(partida.pontos);
    const recordeTexto = document.createElement("p");
    recordeTexto.className = "qb-fim-recorde";
    recordeTexto.textContent = `🏆 Recorde: ${formatar(recorde)}`;
    corpo.push(rotulo, pontos, recordeTexto);

    mostrarAviso({
      icone: novoRecorde ? "🏆" : "💔",
      titulo: "Fim de jogo",
      corpo,
      botoes: [
        { rotulo: "Jogar novamente", acao: reiniciar },
        { rotulo: "Início", acao: () => { esconderAviso(false); mostrarInicio(); botaoNovo.focus({ preventScroll: true }); }, secundario: true },
      ],
    });
    status.textContent = `Fim de jogo. ${formatar(partida.pontos)} pontos.${novoRecorde ? " Novo recorde!" : ""}`;
    contar(pontos, partida.pontos);
  }

  /** Os pontos sobem de 0 até o total, como no cartão de fim de jogo do app. */
  function contar(el, total) {
    if (movimentoReduzido() || total <= 0) return;
    const inicio = performance.now();
    const passo = (agora) => {
      const t = Math.min(1, (agora - inicio) / CONTAGEM_MS);
      el.textContent = formatar(Math.round(total * (1 - (1 - t) ** 3)));
      if (t < 1 && !aviso.hidden) requestAnimationFrame(passo);
      else el.textContent = formatar(total);
    };
    el.textContent = "0";
    requestAnimationFrame(passo);
  }

  // ---------- Controles ----------

  opcoes.forEach((b) => b.addEventListener("click", () => responder(b.dataset.codigo)));

  botaoNovo.addEventListener("click", () => {
    if (carregarPartida()) pedirReinicio(reiniciar, "Cancelar");
    else reiniciar();
  });

  botaoContinuar.addEventListener("click", () => {
    const salva = carregarPartida();
    if (salva) comecar(salva);
    else mostrarInicio();
  });

  botaoVoltar.addEventListener("click", () => {
    mostrarInicio();
    (botaoContinuar.hidden ? botaoNovo : botaoContinuar).focus({ preventScroll: true });
  });

  botaoReiniciar.addEventListener("click", () => {
    pedirReinicio(reiniciar, "Continuar jogando");
  });

  // As teclas só respondem com o jogo à vista, para não atrapalhar quem está lendo o texto
  function jogoVisivel() {
    const area = painel.getBoundingClientRect();
    const visivel = Math.min(area.bottom, window.innerHeight) - Math.max(area.top, 0);
    return visivel >= Math.min(area.height, window.innerHeight) / 2;
  }

  document.addEventListener("keydown", (evento) => {
    if (!aviso.hidden && evento.key === "Escape" && fecharAvisoCom) {
      evento.preventDefault();
      fecharAvisoCom();
      return;
    }
    if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
    if (evento.target.closest?.("input, textarea, select, [contenteditable]")) return;
    if (telaJogo.hidden || !aviso.hidden || !jogoVisivel()) return;
    const indice = ["1", "2", "3", "4"].indexOf(evento.key);
    if (indice < 0) return;
    evento.preventDefault();
    opcoes[indice].focus({ preventScroll: true });
    responder(opcoes[indice].dataset.codigo);
  });

  // Tab fica preso dentro do aviso aberto
  aviso.addEventListener("keydown", (evento) => {
    if (evento.key !== "Tab") return;
    const botoes = [...avisoBotoes.querySelectorAll("button")];
    if (!botoes.length) return;
    const primeiro = botoes[0];
    const ultimo = botoes[botoes.length - 1];
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  });

  // ---------- Início ----------

  carregarRecorde();
  mostrarInicio();
})();
