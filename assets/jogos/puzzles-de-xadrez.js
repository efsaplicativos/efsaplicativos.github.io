"use strict";
/*
 * Puzzles de xadrez: tabuleiro, fluxo do puzzle, placar e filtros.
 * O fluxo segue feature/puzzles/session/PuzzleViewModel.kt do Lance Certo: o lance do adversário abre o
 * puzzle, um lance errado aparece por um instante e volta, dica e solução contam como erro, cada puzzle
 * grava uma tentativa só e, no fim, dá para rever os lances e mexer nas peças. O tabuleiro (toque, arraste,
 * lances possíveis, último lance, coordenadas, de cabeça para baixo para as pretas) segue
 * ui/componentes/Tabuleiro.kt do Puzzles de Xadrez, com as cores e marcas de core/ui/board (BoardColors.kt, BoardMark.kt, ChessBoard.kt) do Lance Certo.
 * Os puzzles vêm em blocos por faixa de rating (indice.json), baixados só quando são precisos.
 */
(() => {
  const raiz = document.querySelector("#pzx");
  if (!raiz || typeof LogicaPuzzlesXadrez !== "object") return;
  const X = LogicaPuzzlesXadrez;

  const BASE = "/assets/jogos/puzzles-de-xadrez/";
  const SPRITE = BASE + "pecas.svg";
  const SVG = "http://www.w3.org/2000/svg";
  const ATRASO_ADVERSARIO_MS = 500;
  const ATRASO_ERRO_MS = 800;
  const ATRASO_SOLUCAO_MS = 800;
  const ARRASTO_MINIMO_PX = 6;
  const HISTORICO_VISIVEL = 12;
  const CHAVES = {
    rating: "efs-puzzles-de-xadrez-rating",
    tentativas: "efs-puzzles-de-xadrez-tentativas",
    estatisticas: "efs-puzzles-de-xadrez-estatisticas",
    historico: "efs-puzzles-de-xadrez-historico",
    preferencias: "efs-puzzles-de-xadrez-preferencias",
    atual: "efs-puzzles-de-xadrez-atual",
  };
  const NOMES_PROMOCAO = { q: "Dama", r: "Torre", b: "Bispo", n: "Cavalo" };

  const $ = (seletor) => raiz.querySelector(seletor);
  const tabuleiro = $("#pzx-tabuleiro");
  const camadaCasas = $("#pzx-casas");
  const camadaPecas = $("#pzx-pecas");
  const caixaPromocao = $("#pzx-promocao");
  const pecasPromocao = $("#pzx-promocao-pecas");
  const botaoCancelarPromocao = $("#pzx-promocao-cancelar");
  const aviso = $("#pzx-aviso");
  const avisoTexto = $("#pzx-aviso-texto");
  const avisoBotao = $("#pzx-aviso-botao");
  const textoVez = $("#pzx-vez-texto");
  const marcaVez = $("#pzx-vez-cor");
  const botaoVirar = $("#pzx-virar");
  const caixaStatus = $("#pzx-status-caixa");
  const statusTitulo = $("#pzx-status");
  const statusDetalhe = $("#pzx-detalhe");
  const botaoDica = $("#pzx-dica");
  const botaoSolucao = $("#pzx-solucao");
  const botaoProximo = $("#pzx-proximo");
  const navegacao = $("#pzx-navegacao");
  const botoesNavegacao = {
    inicio: $("#pzx-inicio"),
    voltar: $("#pzx-voltar"),
    avancar: $("#pzx-avancar"),
    fim: $("#pzx-fim"),
  };
  const info = $("#pzx-info");
  const infoPuzzle = $("#pzx-info-puzzle");
  const infoLances = $("#pzx-lances");
  const infoTemas = $("#pzx-temas");
  const infoGuia = $("#pzx-guia");
  const textoRating = $("#pzx-rating");
  const textoSequencia = $("#pzx-sequencia");
  const textoRecorde = $("#pzx-recorde");
  const textoResolvidos = $("#pzx-resolvidos");
  const notaRating = $("#pzx-rating-nota");
  const grupoDificuldade = $("#pzx-dificuldade");
  const seletorTema = $("#pzx-tema");
  const grupoDestaques = $("#pzx-destaques");
  const botaoRevisar = $("#pzx-revisar");
  const caixaHistorico = $("#pzx-historico-caixa");
  const listaHistorico = $("#pzx-historico");
  const textoFonte = $("#pzx-fonte");

  /** O que o tabuleiro mostra antes do primeiro puzzle chegar. */
  const POSICAO_DE_ESPERA = X.lerFen(X.FEN_INICIAL);
  const reduzirMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  // ---------- Armazenamento ----------

  function ler(chave) {
    try {
      const texto = localStorage.getItem(chave);
      return texto === null ? null : JSON.parse(texto);
    } catch (erro) {
      return null; // bloqueado ou corrompido: começa do zero
    }
  }

  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (erro) {
      /* Sem armazenamento, o progresso vale só enquanto a página estiver aberta. */
    }
  }

  let rating = X.validarRating(ler(CHAVES.rating)) ?? X.novoRating();
  let tentativas = X.validarTentativas(ler(CHAVES.tentativas));
  let estatisticas = X.validarEstatisticas(ler(CHAVES.estatisticas));
  let historico = X.validarHistorico(ler(CHAVES.historico));
  const preferencias = (() => {
    const salvo = ler(CHAVES.preferencias) ?? {};
    const dificuldade = X.DIFICULDADES.some((d) => d.id === salvo.dificuldade) ? salvo.dificuldade : "normal";
    const tema = typeof salvo.tema === "string" && X.NOMES_TEMAS[salvo.tema] ? salvo.tema : null;
    return { dificuldade, tema };
  })();

  // ---------- Estado ----------

  let indice = null;
  const blocos = new Map(); // arquivo → promessa da lista de puzzles
  let sessao = null;
  let blocoAtual = null;
  /** Os lances depois do fim, para rever e explorar. */
  let linha = null;
  let explorou = false;
  let fase = "carregando";
  let lanceErrado = null;
  let posicaoErrada = null;
  let pendente = null;
  let gravadoId = null;
  let resultado = null; // { delta } da tentativa do puzzle atual
  /** "normal" (vale rating), "revisao" (erros) ou "repeticao" (um puzzle do histórico). */
  let modo = "normal";
  let pedido = null; // o que carregar de novo em "Tentar de novo"
  let geracao = 0;
  let orientacao = "w";
  let selecionada = null;
  let foco = 0;
  let promocao = null;
  let ultimoAnimado = null;

  const emSolucao = () => fase === "sua-vez" || fase === "tente-de-novo";
  const acabou = () => fase === "resolvido" || fase === "falhou";
  const podeVerSolucao = () => emSolucao() || fase === "certo" || fase === "errado";

  function limparPendente() {
    clearTimeout(pendente);
    pendente = null;
  }

  function depois(ms, acao) {
    limparPendente();
    const minha = geracao;
    pendente = setTimeout(() => {
      pendente = null;
      if (minha === geracao) acao();
    }, ms);
  }

  // ---------- Tabuleiro ----------

  const botoesCasas = [];

  function montarCasas() {
    for (let casa = 0; casa < 64; casa++) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = (Math.floor(casa / 8) + (casa % 8)) % 2 === 1 ? "pzx-casa clara" : "pzx-casa escura";
      botao.dataset.casa = String(casa);
      botao.tabIndex = -1;
      botoesCasas.push(botao);
    }
    ordenarCasas();
  }

  /** Coluna e linha na tela (0 a 7, de cima para baixo) da casa, conforme o lado que está embaixo. */
  function naTela(casa) {
    const coluna = casa % 8;
    const fileira = Math.floor(casa / 8);
    return orientacao === "w" ? { x: coluna, y: 7 - fileira } : { x: 7 - coluna, y: fileira };
  }

  function daTela(x, y) {
    return orientacao === "w" ? (7 - y) * 8 + x : y * 8 + (7 - x);
  }

  function ordenarCasas() {
    const tinhaFoco = camadaCasas.contains(document.activeElement);
    const ordem = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) ordem.push(botoesCasas[daTela(x, y)]);
    for (const botao of ordem) {
      const casa = Number(botao.dataset.casa);
      const { x, y } = naTela(casa);
      const rotulos = [];
      if (x === 0) rotulos.push(rotulo("pzx-coord pzx-fileira", String(Math.floor(casa / 8) + 1)));
      if (y === 7) rotulos.push(rotulo("pzx-coord pzx-coluna", "abcdefgh"[casa % 8]));
      botao.replaceChildren(...rotulos);
    }
    camadaCasas.replaceChildren(...ordem);
    if (tinhaFoco) botoesCasas[foco].focus({ preventScroll: true });
  }

  function rotulo(classe, texto) {
    const span = document.createElement("span");
    span.className = classe;
    span.setAttribute("aria-hidden", "true");
    span.textContent = texto;
    return span;
  }

  function svgPeca(peca) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 45 45");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const uso = document.createElementNS(SVG, "use");
    uso.setAttribute("href", `${SPRITE}#${X.corDe(peca)}${peca.toUpperCase()}`);
    svg.append(uso);
    return svg;
  }

  function posicionar(el, casa) {
    const { x, y } = naTela(casa);
    el.style.setProperty("--x", x);
    el.style.setProperty("--y", y);
  }

  function posicaoMostrada() {
    if (linha) return linha.posicao;
    if (!sessao) return POSICAO_DE_ESPERA;
    return posicaoErrada ?? sessao.posicao;
  }

  function ultimoMostrado() {
    if (linha) return linha.ultimo?.lance ?? null;
    if (lanceErrado) return lanceErrado;
    return sessao?.ultimo?.lance ?? null;
  }

  function aceitaLances() {
    if (promocao || !sessao || !aviso.hidden) return false;
    if (linha) return X.lancesLegais(linha.posicao).length > 0;
    return emSolucao();
  }

  /** Pares [de, para]: a peça que agora está em "para" desliza a partir de "de". */
  function deslizes(l, reverso) {
    const pares = [[l.de, l.para]];
    if (l.roque) {
      const pequeno = l.para > l.de;
      pares.push([pequeno ? l.de + 3 : l.de - 4, pequeno ? l.de + 1 : l.de - 1]);
    }
    return reverso ? pares.map(([de, para]) => [para, de]) : pares;
  }

  const elementosPecas = new Map();
  /** Casa onde uma peça arrastada acabou de ser solta: ela já está lá e não desliza da origem. */
  let soltouEm = -1;

  function desenharPecas(pos, animar) {
    elementosPecas.clear();
    const fragmento = document.createDocumentFragment();
    if (pos) {
      pos.casas.forEach((peca, casa) => {
        if (!peca) return;
        const el = document.createElement("span");
        el.className = "pzx-peca";
        el.append(svgPeca(peca));
        posicionar(el, casa);
        elementosPecas.set(casa, el);
        fragmento.append(el);
      });
      for (const selo of selos()) fragmento.append(selo);
    }
    camadaPecas.replaceChildren(fragmento);
    if (!animar || reduzirMovimento) return;
    for (const [de, para] of animar) {
      const el = elementosPecas.get(para);
      if (!el || para === soltouEm) continue;
      el.classList.add("sem-transicao");
      posicionar(el, de);
      void el.offsetWidth; // aplica a posição de partida antes de ligar a transição
      el.classList.remove("sem-transicao");
      posicionar(el, para);
    }
  }

  /** Marcas de certo e errado no canto da casa, como os selos do tabuleiro do Lance Certo. */
  function selos() {
    const lista = [];
    const criar = (casa, certo) => {
      const el = document.createElement("span");
      el.className = certo ? "pzx-selo certo" : "pzx-selo errado";
      el.innerHTML = certo
        ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="11"/><path d="M6.5 12.5l3.5 3.5 7.5-8"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="11"/><path d="M8 8l8 8M16 8l-8 8"/></svg>';
      posicionar(el, casa);
      lista.push(el);
    };
    if (lanceErrado) criar(lanceErrado.para, false);
    else if (fase === "certo" && sessao?.ultimo) criar(sessao.ultimo.lance.para, true);
    else if (fase === "resolvido" && linha && !explorou && linha.cursor === linha.total && linha.ultimo) {
      criar(linha.ultimo.lance.para, true);
    }
    return lista;
  }

  function desenhar(animar = null) {
    const pos = posicaoMostrada();
    const ultimo = ultimoMostrado();
    const xeque = sessao && !lanceErrado && X.emXeque(pos) ? X.casaDoRei(pos, pos.vez) : -1;
    const alvos = new Map();
    if (pos && selecionada !== null && aceitaLances()) {
      for (const l of X.lancesDaCasa(pos, selecionada)) alvos.set(l.para, l);
    } else if (!aceitaLances()) {
      selecionada = null;
    }
    const dica = sessao && !linha && emSolucao() ? sessao.dica : null;

    for (const botao of botoesCasas) {
      const casa = Number(botao.dataset.casa);
      const peca = pos?.casas[casa] ?? null;
      const alvo = alvos.get(casa);
      const ehUltimo = Boolean(ultimo && (ultimo.de === casa || ultimo.para === casa));
      botao.classList.toggle("ultimo", ehUltimo);
      botao.classList.toggle("selecionada", selecionada === casa);
      botao.classList.toggle("alvo", Boolean(alvo));
      botao.classList.toggle("captura", Boolean(alvo && (alvo.captura || peca)));
      botao.classList.toggle("xeque", xeque === casa);
      botao.classList.toggle("dica", dica === casa);
      botao.tabIndex = casa === foco ? 0 : -1;

      const partes = [X.nomeDaCasa(casa), peca ? X.nomeDaPeca(peca) : "vazia"];
      if (selecionada === casa) partes.push("selecionada");
      if (alvo) partes.push(alvo.captura ? "captura possível" : "lance possível");
      if (ehUltimo) partes.push("último lance");
      if (xeque === casa) partes.push("em xeque");
      if (dica === casa) partes.push("dica: mova esta peça");
      botao.setAttribute("aria-label", partes.join(", "));
    }
    desenharPecas(pos, animar);
  }

  /** Casa sob o ponteiro, ou -1 fora do tabuleiro. */
  function casaNoPonto(clienteX, clienteY) {
    const area = camadaCasas.getBoundingClientRect();
    const x = Math.floor(((clienteX - area.left) / area.width) * 8);
    const y = Math.floor(((clienteY - area.top) / area.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return -1;
    return daTela(x, y);
  }

  function ehPropria(pos, casa) {
    const peca = pos?.casas[casa];
    return Boolean(peca && X.corDe(peca) === pos.vez);
  }

  /** Toque numa casa: escolhe a peça, troca a escolha ou joga na casa de destino. */
  function tocar(casa) {
    if (!aceitaLances()) return;
    const pos = posicaoMostrada();
    foco = casa;
    if (selecionada === null) {
      selecionada = ehPropria(pos, casa) ? casa : null;
    } else if (selecionada === casa) {
      selecionada = null;
    } else if (X.lancesDaCasa(pos, selecionada).some((l) => l.para === casa)) {
      const de = selecionada;
      selecionada = null;
      tentarLance(de, casa);
      return;
    } else {
      selecionada = ehPropria(pos, casa) ? casa : null;
    }
    desenhar();
  }

  function tentarLance(de, para, arrastado = false) {
    const pos = posicaoMostrada();
    if (X.ehPromocao(pos, de, para)) {
      abrirPromocao(de, para, pos.vez, arrastado);
      return;
    }
    const l = X.encontrarLance(pos, de, para);
    if (l) jogarSolto(l, arrastado);
    else desenhar();
  }

  function jogarSolto(l, arrastado) {
    soltouEm = arrastado ? l.para : -1;
    try {
      jogar(l);
    } finally {
      soltouEm = -1;
    }
  }

  // ---------- Promoção ----------

  function abrirPromocao(de, para, cor, arrastado) {
    promocao = { de, para, arrastado };
    pecasPromocao.replaceChildren(
      ...["q", "r", "b", "n"].map((tipo) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "pzx-promocao-peca";
        botao.dataset.tipo = tipo;
        botao.setAttribute("aria-label", NOMES_PROMOCAO[tipo]);
        botao.title = NOMES_PROMOCAO[tipo];
        botao.append(svgPeca(cor === "w" ? tipo.toUpperCase() : tipo));
        return botao;
      }),
    );
    caixaPromocao.hidden = false;
    desenhar();
    pecasPromocao.querySelector("button").focus({ preventScroll: true });
  }

  function fecharPromocao() {
    promocao = null;
    caixaPromocao.hidden = true;
  }

  pecasPromocao.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button[data-tipo]");
    if (!botao || !promocao) return;
    const { de, para, arrastado } = promocao;
    fecharPromocao();
    const l = X.encontrarLance(posicaoMostrada(), de, para, botao.dataset.tipo);
    focarCasa(para);
    if (l) jogarSolto(l, arrastado);
    else desenhar();
  });

  botaoCancelarPromocao.addEventListener("click", () => {
    const de = promocao?.de;
    fecharPromocao();
    desenhar();
    if (de !== undefined) focarCasa(de);
  });

  caixaPromocao.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
      evento.preventDefault();
      botaoCancelarPromocao.click();
    }
  });

  function focarCasa(casa) {
    foco = casa;
    for (const botao of botoesCasas) botao.tabIndex = Number(botao.dataset.casa) === casa ? 0 : -1;
    botoesCasas[casa].focus({ preventScroll: true });
  }

  // ---------- Toque, arraste e teclado ----------

  let arrasto = null;
  let ignorarClique = false;

  camadaCasas.addEventListener("click", (evento) => {
    if (ignorarClique) return;
    const botao = evento.target.closest(".pzx-casa");
    if (botao) tocar(Number(botao.dataset.casa));
  });

  camadaCasas.addEventListener("pointerdown", (evento) => {
    if (evento.button !== 0 || !aceitaLances()) return;
    const botao = evento.target.closest(".pzx-casa");
    if (!botao) return;
    const casa = Number(botao.dataset.casa);
    if (!ehPropria(posicaoMostrada(), casa)) return;
    arrasto = { casa, id: evento.pointerId, x: evento.clientX, y: evento.clientY, ativo: false, sob: -1 };
  });

  camadaCasas.addEventListener("pointermove", (evento) => {
    if (!arrasto || evento.pointerId !== arrasto.id) return;
    if (!arrasto.ativo) {
      if (Math.hypot(evento.clientX - arrasto.x, evento.clientY - arrasto.y) < ARRASTO_MINIMO_PX) return;
      arrasto.ativo = true;
      try {
        camadaCasas.setPointerCapture(evento.pointerId);
      } catch (erro) {
        /* Sem captura, o arraste ainda funciona enquanto o ponteiro estiver sobre o tabuleiro. */
      }
      selecionada = arrasto.casa;
      foco = arrasto.casa;
      desenhar();
      elementosPecas.get(arrasto.casa)?.classList.add("arrastando");
    }
    evento.preventDefault();
    const el = elementosPecas.get(arrasto.casa);
    if (el) {
      const area = camadaPecas.getBoundingClientRect();
      const lado = area.width / 8;
      el.style.transform = `translate(${evento.clientX - area.left - lado / 2}px, ${evento.clientY - area.top - lado / 2}px)`;
    }
    const sob = casaNoPonto(evento.clientX, evento.clientY);
    if (sob !== arrasto.sob) {
      botoesCasas[arrasto.sob]?.classList.remove("sob");
      if (sob >= 0) botoesCasas[sob].classList.add("sob");
      arrasto.sob = sob;
    }
  });

  function terminarArrasto(evento, cancelado) {
    if (!arrasto || evento.pointerId !== arrasto.id) return;
    const { casa, ativo, sob } = arrasto;
    arrasto = null;
    botoesCasas[sob]?.classList.remove("sob");
    if (!ativo) return; // foi um toque: o clique cuida
    ignorarClique = true;
    setTimeout(() => {
      ignorarClique = false;
    }, 0);
    const destino = cancelado ? -1 : casaNoPonto(evento.clientX, evento.clientY);
    const pos = posicaoMostrada();
    if (destino >= 0 && destino !== casa && X.lancesDaCasa(pos, casa).some((l) => l.para === destino)) {
      selecionada = null;
      foco = destino;
      tentarLance(casa, destino, true);
    } else {
      // Soltar na própria casa mantém a peça escolhida, para terminar o lance com um toque
      selecionada = destino === casa ? casa : null;
      desenhar();
    }
  }

  camadaCasas.addEventListener("pointerup", (evento) => terminarArrasto(evento, false));
  camadaCasas.addEventListener("pointercancel", (evento) => terminarArrasto(evento, true));

  camadaCasas.addEventListener("keydown", (evento) => {
    const passos = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (evento.key === "Escape") {
      if (selecionada !== null) {
        selecionada = null;
        desenhar();
      }
      return;
    }
    const passo = passos[evento.key];
    if (!passo) return;
    evento.preventDefault();
    const { x, y } = naTela(foco);
    const nx = Math.min(7, Math.max(0, x + passo[0]));
    const ny = Math.min(7, Math.max(0, y + passo[1]));
    focarCasa(daTela(nx, ny));
  });

  botaoVirar.addEventListener("click", () => {
    orientacao = orientacao === "w" ? "b" : "w";
    ordenarCasas();
    desenhar();
  });

  // ---------- Fluxo do puzzle ----------

  function jogar(l) {
    if (linha) {
      // Depois do fim, qualquer lado pode mexer: o lance novo corta o que vinha depois
      linha.jogar(l);
      explorou = true;
      desenhar(deslizes(l, false));
      atualizarTextos();
      return;
    }
    if (!emSolucao()) return;
    const r = sessao.enviar(l);
    if (r.tipo === "certo") {
      fase = "certo";
      desenhar(deslizes(r.jogado.lance, false));
      atualizarTextos();
      depois(ATRASO_ADVERSARIO_MS, () => {
        const resposta = sessao.jogarAdversario();
        fase = "sua-vez";
        ultimoAnimado = resposta;
        desenhar(deslizes(resposta.lance, false));
        atualizarTextos();
      });
    } else if (r.tipo === "resolvido") {
      terminar(deslizes(r.jogado.lance, false));
    } else {
      registrar(false);
      lanceErrado = r.lance;
      posicaoErrada = sessao.posicaoApos(r.lance);
      fase = "errado";
      desenhar(deslizes(r.lance, false));
      atualizarTextos();
      depois(ATRASO_ERRO_MS, () => {
        const desfeito = lanceErrado;
        lanceErrado = null;
        posicaoErrada = null;
        fase = "tente-de-novo";
        desenhar(deslizes(desfeito, true));
        atualizarTextos();
      });
    }
  }

  function terminar(animar = null) {
    if (!sessao.falhou) registrar(true);
    linha = sessao.linha();
    explorou = false;
    fase = sessao.falhou ? "falhou" : "resolvido";
    desenhar(animar);
    atualizarTextos();
    salvarAtual();
  }

  function mostrarDica() {
    if (!sessao || !emSolucao() || linha) return;
    sessao.mostrarDica();
    registrar(false);
    desenhar();
    atualizarTextos();
  }

  function mostrarSolucao() {
    if (!sessao || !podeVerSolucao() || sessao.terminou) return;
    limparPendente();
    const estavaErrado = lanceErrado;
    lanceErrado = null;
    posicaoErrada = null;
    registrar(false);
    fase = "solucao";
    selecionada = null;
    desenhar(estavaErrado ? deslizes(estavaErrado, true) : null);
    atualizarTextos();
    const passo = () => {
      const jogado = sessao.jogarSolucao();
      if (sessao.terminou) {
        terminar(deslizes(jogado.lance, false));
        return;
      }
      desenhar(deslizes(jogado.lance, false));
      depois(ATRASO_SOLUCAO_MS, passo);
    };
    depois(ATRASO_SOLUCAO_MS, passo);
  }

  /** Grava a tentativa uma vez por puzzle: um erro, a dica ou a solução gravam a falha na hora. */
  function registrar(resolvido) {
    const puzzle = sessao?.puzzle;
    if (!puzzle || gravadoId === puzzle.id) return;
    gravadoId = puzzle.id;
    const r = X.registrarTentativa(
      { rating, tentativas, estatisticas, historico },
      { puzzle, bloco: blocoAtual, resolvido, modo },
    );
    rating = r.rating;
    tentativas = r.tentativas;
    estatisticas = r.estatisticas;
    historico = r.historico;
    resultado = { delta: r.delta, ok: resolvido };
    gravar(CHAVES.rating, rating);
    gravar(CHAVES.tentativas, tentativas);
    gravar(CHAVES.estatisticas, estatisticas);
    gravar(CHAVES.historico, historico);
    salvarAtual();
    atualizarPlacar();
  }

  function salvarAtual() {
    if (!sessao) return;
    gravar(CHAVES.atual, { id: sessao.puzzle.id, b: blocoAtual, modo, gravado: gravadoId === sessao.puzzle.id });
  }

  function iniciar(puzzle, bloco, jaGravado) {
    let nova;
    try {
      nova = X.criarSessao(puzzle);
    } catch (erro) {
      mostrarProblema("erro", "Não foi possível abrir o puzzle.");
      return;
    }
    sessao = nova;
    blocoAtual = bloco;
    linha = null;
    explorou = false;
    lanceErrado = null;
    posicaoErrada = null;
    selecionada = null;
    resultado = null;
    gravadoId = jaGravado ? puzzle.id : null;
    if (orientacao !== sessao.lado) {
      orientacao = sessao.lado;
      ordenarCasas();
    }
    foco = sessao.lado === "w" ? X.casaDoNome("e2") : X.casaDoNome("e7");
    esconderAviso();
    fase = "adversario";
    salvarAtual();
    desenhar();
    atualizarTextos();
    depois(ATRASO_ADVERSARIO_MS, () => {
      const jogado = sessao.jogarAdversario();
      ultimoAnimado = jogado;
      fase = "sua-vez";
      desenhar(deslizes(jogado.lance, false));
      atualizarTextos();
    });
  }

  // ---------- Carregamento ----------

  function validarIndice(dados) {
    const ok =
      dados &&
      dados.formato === 1 &&
      Array.isArray(dados.blocos) &&
      dados.blocos.length > 0 &&
      dados.blocos.every(
        (b) =>
          b &&
          typeof b.arquivo === "string" &&
          /^blocos\/r\d{4}\.json$/.test(b.arquivo) &&
          Number.isFinite(b.min) &&
          Number.isFinite(b.max) &&
          b.temas &&
          typeof b.temas === "object",
      );
    if (!ok) throw new Error("Índice de puzzles inválido");
    return dados;
  }

  async function buscarJson(url, opcoes) {
    const resposta = await fetch(url, opcoes);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return resposta.json();
  }

  function carregarBloco(bloco) {
    if (!blocos.has(bloco.arquivo)) {
      const promessa = buscarJson(`${BASE}${bloco.arquivo}?v=${encodeURIComponent(bloco.v ?? "")}`).then((linhas) => {
        if (!Array.isArray(linhas)) throw new Error("Bloco de puzzles inválido");
        const lista = [];
        for (const texto of linhas) {
          try {
            lista.push({ ...X.lerPuzzle(texto), bloco: bloco.arquivo });
          } catch (erro) {
            /* Linha com defeito: fica de fora. */
          }
        }
        return lista;
      });
      // Um erro de rede não fica guardado: a próxima tentativa baixa de novo
      promessa.catch(() => blocos.delete(bloco.arquivo));
      blocos.set(bloco.arquivo, promessa);
    }
    return blocos.get(bloco.arquivo);
  }

  async function puzzlePorId(id, arquivo) {
    const bloco = indice.blocos.find((b) => b.arquivo === arquivo);
    if (!bloco) return null;
    const lista = await carregarBloco(bloco);
    return lista.find((p) => p.id === id) ?? null;
  }

  /** Carrega e mostra o próximo puzzle do [pedido]: { tipo: "proximo" | "id", id, bloco }. */
  async function carregar(novoPedido) {
    pedido = novoPedido;
    geracao++;
    const minha = geracao;
    limparPendente();
    fecharPromocao();
    const anterior = sessao?.puzzle.id ?? null;
    // As peças ficam como estão até o puzzle novo chegar, para o tabuleiro não piscar vazio
    sessao = null;
    linha = null;
    lanceErrado = null;
    posicaoErrada = null;
    selecionada = null;
    arrasto = null;
    fase = "carregando";
    esconderAviso();
    atualizarTextos();
    try {
      if (!indice) {
        indice = validarIndice(await buscarJson(`${BASE}indice.json`, { cache: "no-cache" }));
        preencherTemas();
        mostrarFonte();
      }
      let puzzle = null;
      if (novoPedido.tipo === "id") {
        puzzle = await puzzlePorId(novoPedido.id, novoPedido.bloco);
      } else if (modo === "revisao") {
        for (const erro of X.errosParaRevisar(tentativas, anterior)) {
          puzzle = await puzzlePorId(erro.id, erro.bloco);
          if (puzzle) break;
        }
        if (!puzzle) {
          if (minha === geracao) mostrarProblema("revisao-fim", "Você revisou todos os erros!");
          return;
        }
      } else {
        puzzle = await X.escolherPuzzle({
          indice,
          carregar: carregarBloco,
          alvo: X.ratingAlvo(rating.rating, preferencias.dificuldade),
          tema: preferencias.tema,
          tentativas,
          excluir: anterior,
        });
      }
      if (minha !== geracao) return;
      if (!puzzle) {
        if (novoPedido.tipo === "id") {
          // O puzzle salvo saiu dos blocos: segue com outro
          modo = "normal";
          atualizarPlacar();
          carregar({ tipo: "proximo" });
        } else {
          mostrarProblema("sem-puzzle", "Nenhum puzzle encontrado com esse tema.");
        }
        return;
      }
      iniciar(puzzle, puzzle.bloco, novoPedido.gravado === true);
    } catch (erro) {
      if (minha !== geracao) return;
      mostrarProblema("erro", "Não foi possível carregar os puzzles. Confira a conexão com a internet e tente de novo.");
    }
  }

  function mostrarProblema(qual, texto) {
    limparPendente();
    sessao = null;
    linha = null;
    fase = qual;
    avisoTexto.textContent = texto;
    avisoBotao.textContent =
      qual === "erro" ? "Tentar de novo" : qual === "revisao-fim" ? "Voltar aos puzzles" : "Ver todos os temas";
    aviso.dataset.problema = qual;
    aviso.hidden = false;
    desenhar();
    atualizarTextos();
  }

  function esconderAviso() {
    aviso.hidden = true;
    delete aviso.dataset.problema;
  }

  avisoBotao.addEventListener("click", () => {
    const problema = aviso.dataset.problema;
    if (problema === "revisao-fim") {
      modo = "normal";
      atualizarPlacar();
      carregar({ tipo: "proximo" });
    } else if (problema === "sem-puzzle") {
      escolherTema(null);
    } else {
      carregar(pedido ?? { tipo: "proximo" });
    }
  });

  function proximo() {
    if (modo === "repeticao") modo = "normal";
    carregar({ tipo: "proximo" });
  }

  // ---------- Textos e placar ----------

  const TITULOS = {
    carregando: "Carregando o puzzle…",
    adversario: "Veja o lance do adversário",
    "sua-vez": "Sua vez: encontre o melhor lance",
    certo: "Isso! Continue…",
    errado: "Não é esse lance.",
    "tente-de-novo": "Não é esse. Tente outro lance.",
    solucao: "Mostrando a solução…",
    resolvido: "Puzzle resolvido!",
    falhou: "Não foi dessa vez.",
    "sem-puzzle": "Nenhum puzzle encontrado com esse tema.",
    "revisao-fim": "Você revisou todos os erros!",
    erro: "Não foi possível abrir o puzzle.",
  };

  const formatarRating = (r) => `${Math.round(r.rating).toLocaleString("pt-BR")}${X.provisorio(r) ? "?" : ""}`;
  const sinal = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");

  function detalhe() {
    if (!sessao) return fase === "erro" ? "Confira a conexão com a internet e tente de novo." : "";
    const cor = sessao.lado === "w" ? "brancas" : "pretas";
    if (fase === "resolvido") return "Mexa as peças ou use os botões abaixo do tabuleiro para rever os lances.";
    if (fase === "falhou") {
      return modo === "revisao" ? "Ele continua na sua revisão de erros." : "O puzzle fica na sua revisão de erros.";
    }
    if (emSolucao() && sessao.dica !== null) return "Dica: mova a peça destacada.";
    // Enquanto a resposta a um lance certo não vem, o lance que acabou de ser jogado ainda conta como o atual
    const feitos = fase === "certo" ? sessao.lancesFeitos : sessao.lancesFeitos + 1;
    const lance = Math.min(Math.max(feitos, 1), sessao.lancesTotais);
    let texto = `Você joga com as ${cor} · lance ${lance} de ${sessao.lancesTotais}`;
    if (fase === "sua-vez" && ultimoAnimado && sessao.ultimo === ultimoAnimado) {
      texto = `O adversário jogou ${ultimoAnimado.san}. ${texto}`;
    }
    return texto;
  }

  function atualizarTextos() {
    statusTitulo.textContent = TITULOS[fase] ?? "";
    statusDetalhe.textContent = detalhe();
    caixaStatus.dataset.tom =
      fase === "certo" || fase === "resolvido"
        ? "certo"
        : fase === "errado" || fase === "tente-de-novo" || fase === "falhou"
          ? "errado"
          : "neutro";

    const pos = posicaoMostrada();
    const vez = sessao ? sessao.lado : orientacao;
    textoVez.textContent = !sessao
      ? "Puzzles de xadrez"
      : linha
        ? `Vez das ${pos.vez === "w" ? "brancas" : "pretas"}`
        : `Você joga com as ${vez === "w" ? "brancas" : "pretas"}`;
    marcaVez.dataset.cor = linha && pos ? pos.vez : vez;

    botaoDica.disabled = !(sessao && emSolucao() && sessao.dica === null);
    botaoSolucao.disabled = !(sessao && podeVerSolucao() && !sessao.terminou);
    botaoProximo.disabled = fase === "carregando";
    botaoProximo.textContent = modo === "revisao" ? "Próximo erro" : "Próximo puzzle";
    botaoDica.hidden = acabou();
    botaoSolucao.hidden = acabou();

    navegacao.hidden = !linha;
    if (linha) {
      botoesNavegacao.inicio.disabled = !linha.podeVoltar;
      botoesNavegacao.voltar.disabled = !linha.podeVoltar;
      botoesNavegacao.avancar.disabled = !linha.podeAvancar;
      botoesNavegacao.fim.disabled = !linha.podeAvancar;
    }
    atualizarInfo();
    atualizarNotaRating();
  }

  function atualizarInfo() {
    if (!sessao || !acabou()) {
      info.hidden = true;
      return;
    }
    const p = sessao.puzzle;
    infoPuzzle.replaceChildren(`Puzzle ${p.id} do Lichess, rating ${p.rating.toLocaleString("pt-BR")} · `);
    const link = document.createElement("a");
    link.href = `https://lichess.org/training/${encodeURIComponent(p.id)}`;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    link.textContent = "ver no lichess.org";
    infoPuzzle.append(link);
    infoLances.textContent = `Lances: ${X.textoDosLances(sessao.jogados)}`;
    infoTemas.replaceChildren(
      ...p.temas.map((tema) => {
        const li = document.createElement("li");
        li.textContent = X.nomeDoTema(tema);
        return li;
      }),
    );
    const motivos = p.temas.filter((t) => X.DESCRICOES_TEMAS[t]);
    infoGuia.replaceChildren(
      ...motivos.flatMap((tema) => {
        const dt = document.createElement("dt");
        dt.textContent = X.nomeDoTema(tema);
        const dd = document.createElement("dd");
        dd.textContent = X.DESCRICOES_TEMAS[tema];
        return [dt, dd];
      }),
    );
    infoGuia.hidden = motivos.length === 0;
    info.hidden = false;
  }

  function atualizarNotaRating() {
    let texto = "";
    let tom = "";
    if (resultado && resultado.delta !== null) {
      texto = `Seu rating: ${Math.round(rating.rating).toLocaleString("pt-BR")} (${sinal(resultado.delta)}).`;
      tom = resultado.delta > 0 ? "certo" : resultado.delta < 0 ? "errado" : "";
    } else if (sessao) {
      const id = sessao.puzzle.id;
      // Só a primeira tentativa de um puzzle, fora da revisão, muda o rating
      const vale = modo === "normal" && gravadoId !== id && !Object.prototype.hasOwnProperty.call(tentativas, id);
      texto = vale ? "Dica e solução contam como erro." : "Este puzzle não muda o seu rating.";
    }
    if (X.provisorio(rating)) {
      texto += `${texto ? " " : ""}Rating ainda provisório: ele se ajusta mais rápido nos primeiros puzzles.`;
    }
    notaRating.textContent = texto;
    notaRating.dataset.tom = tom;
  }

  function atualizarPlacar() {
    textoRating.textContent = formatarRating(rating);
    textoSequencia.textContent = estatisticas.sequencia.toLocaleString("pt-BR");
    textoRecorde.textContent = estatisticas.melhor.toLocaleString("pt-BR");
    const { tentados, resolvidos } = estatisticas;
    textoResolvidos.textContent = tentados
      ? `${resolvidos.toLocaleString("pt-BR")} de ${tentados.toLocaleString("pt-BR")} (${Math.round((resolvidos * 100) / tentados)}%)`
      : "0";
    const erros = X.errosParaRevisar(tentativas).length;
    botaoRevisar.textContent = modo === "revisao" ? "Sair da revisão" : `Revisar erros (${erros.toLocaleString("pt-BR")})`;
    botaoRevisar.disabled = modo !== "revisao" && erros === 0;
    botaoRevisar.setAttribute("aria-pressed", String(modo === "revisao"));
    desenharHistorico();
  }

  function desenharHistorico() {
    const itens = historico.slice(0, HISTORICO_VISIVEL);
    caixaHistorico.hidden = itens.length === 0;
    listaHistorico.replaceChildren(
      ...itens.map((h) => {
        const li = document.createElement("li");
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = h.ok ? "pzx-hist certo" : "pzx-hist errado";
        botao.dataset.id = h.id;
        const marca = document.createElement("span");
        marca.setAttribute("aria-hidden", "true");
        marca.textContent = h.ok ? "✓" : "✗";
        const delta = h.delta === null ? "" : ` ${sinal(h.delta)}`;
        botao.append(marca, ` ${h.rating}${delta}`);
        botao.setAttribute(
          "aria-label",
          `${h.ok ? "Resolvido" : "Errado"}: puzzle de rating ${h.rating}${h.delta === null ? "" : `, rating ${sinal(h.delta)}`}. Jogar de novo`,
        );
        botao.title = "Jogar de novo (não muda o rating)";
        li.append(botao);
        return li;
      }),
    );
  }

  listaHistorico.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button[data-id]");
    if (!botao) return;
    const t = tentativas[botao.dataset.id];
    if (!t?.b) return;
    modo = "repeticao";
    atualizarPlacar();
    carregar({ tipo: "id", id: botao.dataset.id, bloco: t.b });
  });

  function mostrarFonte() {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(indice.gerado ?? "") ? indice.gerado.split("-").reverse().join("/") : null;
    const total = Number.isInteger(indice.total) ? indice.total.toLocaleString("pt-BR") : "";
    textoFonte.textContent =
      `Fonte: banco aberto de puzzles do Lichess (lichess.org), em domínio público (CC0). ` +
      `${total} puzzles escolhidos entre os 50 mil dos apps${data ? `, arquivo gerado em ${data}` : ""}.`;
  }

  // ---------- Filtros ----------

  function preencherTemas() {
    const opcoes = [new Option(`Todos os temas (${(indice.total ?? 0).toLocaleString("pt-BR")})`, "")];
    seletorTema.replaceChildren(...opcoes);
    for (const grupo of X.GRUPOS_TEMAS) {
      const og = document.createElement("optgroup");
      og.label = grupo.nome;
      for (const tema of grupo.temas) {
        const quantos = indice.temas?.[tema] ?? 0;
        if (!quantos) continue;
        og.append(new Option(`${X.nomeDoTema(tema)} (${quantos.toLocaleString("pt-BR")})`, tema));
      }
      if (og.children.length) seletorTema.append(og);
    }
    if (preferencias.tema && !indice.temas?.[preferencias.tema]) preferencias.tema = null;
    marcarFiltros();
  }

  function marcarFiltros() {
    for (const botao of grupoDificuldade.querySelectorAll("button[data-dificuldade]")) {
      const ativo = botao.dataset.dificuldade === preferencias.dificuldade;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    for (const botao of grupoDestaques.querySelectorAll("button[data-tema]")) {
      const ativo = (botao.dataset.tema || null) === preferencias.tema;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    seletorTema.value = preferencias.tema ?? "";
  }

  function salvarPreferencias() {
    gravar(CHAVES.preferencias, preferencias);
  }

  /** Mudar um filtro abre um puzzle novo na hora; uma tentativa já gravada continua valendo. */
  function aplicarFiltro() {
    salvarPreferencias();
    marcarFiltros();
    modo = "normal";
    atualizarPlacar();
    carregar({ tipo: "proximo" });
  }

  function escolherTema(tema) {
    preferencias.tema = tema;
    aplicarFiltro();
  }

  grupoDificuldade.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button[data-dificuldade]");
    if (!botao || botao.dataset.dificuldade === preferencias.dificuldade) return;
    preferencias.dificuldade = botao.dataset.dificuldade;
    aplicarFiltro();
  });

  grupoDestaques.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button[data-tema]");
    if (!botao) return;
    const tema = botao.dataset.tema || null;
    if (tema === preferencias.tema) return;
    escolherTema(tema);
  });

  seletorTema.addEventListener("change", () => escolherTema(seletorTema.value || null));

  botaoRevisar.addEventListener("click", () => {
    modo = modo === "revisao" ? "normal" : "revisao";
    atualizarPlacar();
    carregar({ tipo: "proximo" });
  });

  // ---------- Botões ----------

  botaoDica.addEventListener("click", mostrarDica);
  botaoSolucao.addEventListener("click", mostrarSolucao);
  botaoProximo.addEventListener("click", proximo);

  function navegar(acao) {
    if (!linha) return;
    const antes = linha.cursor;
    const ultimoAntes = linha.ultimo;
    acao(linha);
    selecionada = null;
    // Um passo para a frente ou para trás desliza a peça; pulos maiores só redesenham
    if (linha.cursor === antes + 1) desenhar(deslizes(linha.ultimo.lance, false));
    else if (linha.cursor === antes - 1 && ultimoAntes) desenhar(deslizes(ultimoAntes.lance, true));
    else desenhar();
    atualizarTextos();
  }

  botoesNavegacao.inicio.addEventListener("click", () => navegar((l) => l.inicio()));
  botoesNavegacao.voltar.addEventListener("click", () => navegar((l) => l.voltar()));
  botoesNavegacao.avancar.addEventListener("click", () => navegar((l) => l.avancar()));
  botoesNavegacao.fim.addEventListener("click", () => navegar((l) => l.fim()));

  // ---------- Início ----------

  montarCasas();
  marcarFiltros();
  atualizarPlacar();
  desenhar();
  atualizarTextos();

  // O puzzle aberto antes de recarregar a página volta do começo, sem gravar a tentativa duas vezes
  const salvo = ler(CHAVES.atual);
  if (salvo && typeof salvo.id === "string" && typeof salvo.b === "string") {
    modo = ["normal", "revisao", "repeticao"].includes(salvo.modo) ? salvo.modo : "normal";
    atualizarPlacar();
    carregar({ tipo: "id", id: salvo.id, bloco: salvo.b, gravado: salvo.gravado === true });
  } else {
    carregar({ tipo: "proximo" });
  }
})();
