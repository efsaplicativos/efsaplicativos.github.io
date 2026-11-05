"use strict";
/*
 * Interface do Copas. As regras, as jogadas do computador e o placar ficam em copas-logica.js.
 *
 * Você joga embaixo, contra Ana (à esquerda), Beto (à frente) e Clara (à direita). As cartas da
 * sua mão e as que já foram jogadas são desenhadas com a face; as mãos dos adversários são só
 * versos, sem nenhuma identidade, e a face de uma carta deles só entra na página quando ela é
 * jogada. As cartas se movem com a propriedade CSS translate. Um toque (ou Enter) numa carta da
 * mão escolhe a carta da troca ou joga a carta. No teclado, as setas andam pela mão e, para cima,
 * pela mesa e pelos adversários. A partida inteira, o modo e as estatísticas ficam no localStorage.
 */
(() => {
  const raiz = document.querySelector(".copas");
  if (!raiz || typeof LogicaCopas !== "object") return;
  const C = LogicaCopas;

  const CHAVE_PARTIDA = "efs-copas-partida";
  const CHAVE_ESTATISTICAS = "efs-copas-estatisticas";
  const CHAVE_MODO = "efs-copas-modo";
  const TRAVA_DIALOGO_MS = 500;
  const MENSAGEM_MS = 3600;
  const MENSAGEM_LONGA_MS = 6000;
  const ESPERA_COMPUTADOR = 700;
  const ESPERA_VAZA = 1100;
  const RECOLHER_MS = 420;
  const DESTAQUE_RECEBIDAS_MS = 2800;
  const reduzirMovimento = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  const mesa = raiz.querySelector("#cp-mesa");
  const textoPartida = raiz.querySelector("#cp-partida");
  const textoSituacao = raiz.querySelector("#cp-situacao");
  const botaoDica = raiz.querySelector("#cp-dica");
  const botaoUltima = raiz.querySelector("#cp-ultima");
  const botaoNova = raiz.querySelector("#cp-nova");
  const botoesModo = [...raiz.querySelectorAll("[data-modo]")];
  const status = raiz.querySelector("#cp-status");
  const tabela = raiz.querySelector("#cp-tabela");
  const resumoPlacar = raiz.querySelector("#cp-placar-resumo");
  const estLista = raiz.querySelector("#cp-est-lista");
  const estModo = raiz.querySelector("#cp-est-modo");
  const botaoZerar = raiz.querySelector("#cp-zerar");
  const dialogo = raiz.querySelector("#cp-dialogo");
  const dialogoTitulo = raiz.querySelector("#cp-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#cp-dialogo-texto");
  const dialogoVaza = raiz.querySelector("#cp-dialogo-vaza");
  const dialogoDados = raiz.querySelector("#cp-dialogo-dados");
  const dialogoBotoes = raiz.querySelector("#cp-dialogo-botoes");
  // Se sons.js não carregar, o jogo segue mudo e o botão some
  const som = typeof Sons === "object" ? Sons.criar("copas", raiz) : { tocar() {}, ligarBotao: (b) => b && (b.hidden = true) };

  const NOMES = C.NOMES;
  const ROTACAO_NA_VAZA = [-3, 5, 2, -6];

  let estado;
  let estatisticas = {};
  let g = null;
  // Cartas escolhidas para a troca
  let selecao = new Set();
  // Vaza já fechada que ainda está na mesa: { lider, cartas, vencedor, pontos, recolhendo }
  let pendente = null;
  // A troca está animando; as cartas recebidas ainda não entraram na mão
  let aChegar = new Set();
  let recebidasVisiveis = new Set();
  let dicaCartas = new Set();
  let resultadoFinal = null;
  let foco = { linha: 2, i: 0 };
  let agendaComputador = null;
  let dicaTimer = null;
  // O resumo da rodada já apareceu (ou não precisa aparecer)
  let resumoMostrado = true;
  const timers = new Set();

  // ---------- Elementos da mesa ----------

  const criar = (classe, atributos = {}) => {
    const el = document.createElement("div");
    el.className = classe;
    for (const [nome, valor] of Object.entries(atributos)) el.setAttribute(nome, valor);
    return el;
  };

  // O quadro de cada jogador: nome, pontos da rodada e, nos adversários, as cartas na mão
  const assentosEl = [0, 1, 2, 3].map((j) => {
    const el = criar(`cp-assento cp-assento-${j}`);
    el.innerHTML = '<span class="cp-nome"></span><span class="cp-qtd"></span><span class="cp-pontos"></span>';
    el.querySelector(".cp-nome").textContent = NOMES[j];
    if (j === 0) {
      el.setAttribute("aria-hidden", "true");
    } else {
      el.setAttribute("role", "button");
      el.dataset.alvo = `assento-${j}`;
      el.tabIndex = -1;
    }
    return el;
  });
  // Os versos das mãos dos adversários: não dizem que carta é qual
  const versosEl = [0, 1, 2, 3].map((j) => (j === 0 ? [] : [...Array(C.POR_MAO)].map(() => criar("cp-mini", { "aria-hidden": "true" }))));
  const vagaVaza = criar("cp-vaga-vaza", { role: "button", "data-alvo": "vaza" });
  vagaVaza.tabIndex = -1;
  const painel = criar("cp-painel");
  painel.hidden = true;
  const painelTexto = document.createElement("p");
  const painelBotao = document.createElement("button");
  painelBotao.type = "button";
  painelBotao.className = "button";
  painel.append(painelTexto, painelBotao);
  // Aviso curto e visível sobre a mesa; o leitor de tela recebe o mesmo texto pelo status
  const mensagemEl = document.createElement("p");
  mensagemEl.className = "cp-mensagem";
  mensagemEl.setAttribute("aria-hidden", "true");
  mesa.replaceChildren(vagaVaza, ...versosEl.flat(), ...assentosEl, painel, mensagemEl);

  /** A face de uma carta, só para cartas que já estão à vista: a sua mão e as jogadas. */
  function htmlDaFace(id) {
    const naipe = C.NAIPES[C.naipe(id)].id;
    const p = C.posto(id);
    const centro =
      p > 10 && p < 14
        ? `<span class="cp-centro cp-figura">${C.textoValor(id)}</span>`
        : `<span class="cp-centro"><i class="cp-naipe cp-naipe-${naipe}"></i></span>`;
    return (
      `<span class="cp-frente"><span class="cp-valor${p === 10 ? " dez" : ""}">${C.textoValor(id)}</span>` +
      `<i class="cp-naipe cp-naipe-${naipe} cp-naipe-canto"></i>${centro}</span><span class="cp-verso"></span>`
    );
  }

  const cartasEl = new Map();

  function elementoDaCarta(id) {
    let el = cartasEl.get(id);
    if (el) return el;
    el = criar(`cp-carta${C.vermelha(id) ? " vermelha" : ""}`);
    el.dataset.id = String(id);
    el.innerHTML = htmlDaFace(id);
    mesa.insertBefore(el, painel);
    cartasEl.set(id, el);
    return el;
  }

  function removerCarta(id) {
    const el = cartasEl.get(id);
    if (!el) return;
    const tinhaFoco = document.activeElement === el;
    el.remove();
    cartasEl.delete(id);
    if (tinhaFoco) atualizarFoco(true);
  }

  function removerTodasAsCartas() {
    for (const id of [...cartasEl.keys()]) removerCarta(id);
    for (const el of mesa.querySelectorAll(".cp-fantasma")) el.remove();
  }

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
      /* Armazenamento indisponível: vale só enquanto a página estiver aberta. */
    }
  }

  function salvar() {
    if (!estado || C.terminou(estado)) return;
    gravar(CHAVE_PARTIDA, { estado });
  }

  // ---------- Tempo ----------

  function esperar(ms, acao) {
    const id = setTimeout(() => {
      timers.delete(id);
      acao();
    }, ms);
    timers.add(id);
    return id;
  }

  function cancelarTudo() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    agendaComputador = null;
    clearTimeout(dicaTimer);
  }

  // ---------- Medidas da mesa ----------

  function medir() {
    const W = mesa.clientWidth;
    const compacto = W < 560;
    const vh = window.innerHeight || 800;
    const alvo = compacto ? W * 1.28 : W * 0.64;
    const H = Math.round(Math.max(compacto ? 410 : 430, Math.min(alvo, compacto ? 580 : 640, vh - (compacto ? 110 : 96))));
    const cw = compacto ? Math.round(Math.min(62, Math.max(40, W / 6.5))) : Math.round(Math.min(84, Math.max(52, Math.min(W / 12, H / 5.8))));
    const ch = Math.round(cw * 1.4);
    const m = compacto ? 6 : 12;
    const curva = compacto ? 0.25 : 0.45;
    const giro = compacto ? 1 : 1.4;
    const ergue = compacto ? 9 : 13;
    const ergueEscolhida = compacto ? 20 : 26;
    // A mão fica no pé da mesa; a ponta mais baixa do leque (6 cartas do meio) ainda cabe
    const maoY = Math.round(H - ch - (compacto ? 8 : 12) - curva * 36 - 4);
    const maoTopo = maoY - ergueEscolhida;
    const mw = Math.round(cw * 0.56);
    const mh = Math.round(mw * 1.4);
    const passoMini = Math.max(4, Math.round(mw * 0.15));
    const quadroW = compacto ? 76 : 138;
    const quadroH = compacto ? 42 : 44;
    const meuH = compacto ? 24 : 30;
    const cx = W / 2;
    // Do pé dos adversários de cima até o topo da mão (no celular, acima do seu quadro)
    const topoLivre = compacto ? m + quadroH + 4 : m + mh + 6 + quadroH + 4;
    const baseLivre = compacto ? maoTopo - meuH - 8 : maoTopo - 6;
    const cy = Math.round((topoLivre + baseLivre) / 2);

    const quadros = [];
    const leques = [];
    const pontos = [];
    const larguraLateral = Math.max(quadroW, mw + 12 * passoMini);
    // Você: quadro acima da ponta esquerda da mão
    quadros[0] = { x: m, y: maoTopo - meuH - 4 };
    pontos[0] = { x: cx, y: maoY + ch / 2 };
    // Beto, em cima
    if (compacto) {
      quadros[2] = { x: cx - quadroW / 2, y: m };
      pontos[2] = { x: cx, y: m + quadroH / 2 };
    } else {
      leques[2] = { x: cx, y: m };
      quadros[2] = { x: cx - quadroW / 2, y: m + mh + 6 };
      pontos[2] = { x: cx, y: m + mh / 2 };
    }
    // Ana à esquerda e Clara à direita
    for (const j of [1, 3]) {
      const centroX = j === 1 ? m + larguraLateral / 2 : W - m - larguraLateral / 2;
      if (compacto) {
        const x = j === 1 ? m : W - m - quadroW;
        quadros[j] = { x, y: cy - quadroH / 2 };
        pontos[j] = { x: x + quadroW / 2, y: cy };
      } else {
        const topo = cy - (mh + 6 + quadroH) / 2;
        leques[j] = { x: centroX, y: topo };
        quadros[j] = { x: centroX - quadroW / 2, y: topo + mh + 6 };
        pontos[j] = { x: centroX, y: topo + mh / 2 };
      }
    }
    // Onde cada um põe a carta na vaza: um losango em volta do centro
    const dx = cw * 1.04;
    const dy = ch * 0.52;
    const vaza = [
      { x: cx - cw / 2, y: cy - ch / 2 + dy },
      { x: cx - cw / 2 - dx, y: cy - ch / 2 },
      { x: cx - cw / 2, y: cy - ch / 2 - dy },
      { x: cx - cw / 2 + dx, y: cy - ch / 2 },
    ].map((p, j) => ({ ...p, rot: ROTACAO_NA_VAZA[j] }));

    g = { W, H, compacto, cw, ch, m, curva, giro, ergue, ergueEscolhida, maoY, maoTopo, mw, mh, passoMini, quadroW, quadroH, cx, cy, quadros, leques, pontos, vaza, dx, dy };
    mesa.classList.toggle("compacta", compacto);
    mesa.style.height = `${H}px`;
    mesa.style.setProperty("--cw", `${cw}px`);
    mesa.style.setProperty("--ch", `${ch}px`);
    mesa.style.setProperty("--mw", `${mw}px`);
    mesa.style.setProperty("--mh", `${mh}px`);
    vagaVaza.style.translate = `${cx - cw / 2 - dx - 6}px ${cy - ch / 2 - dy - 6}px`;
    vagaVaza.style.width = `${2 * dx + cw + 12}px`;
    vagaVaza.style.height = `${2 * dy + ch + 12}px`;
    mensagemEl.style.bottom = `${H - maoTopo + 6}px`;
    painel.style.left = `${cx}px`;
    painel.style.top = `${cy}px`;
    painel.style.width = compacto ? `${Math.max(150, W - 2 * (m + quadroW + 6))}px` : `${Math.min(320, 2 * dx + cw + 40)}px`;
    assentosEl.forEach((el, j) => {
      el.style.translate = `${quadros[j].x}px ${quadros[j].y}px`;
      el.style.width = j === 0 ? "" : `${quadroW}px`;
    });
  }

  /** Posições da sua mão em leque: [n] cartas, da esquerda para a direita. */
  function posicoesDaMao(n) {
    const passoMaximo = g.cw * (g.compacto ? 0.56 : 0.6);
    const passo = n > 1 ? Math.min(passoMaximo, (g.W - 2 * g.m - g.cw) / (n - 1)) : 0;
    const largura = g.cw + (n - 1) * passo;
    const x0 = (g.W - largura) / 2;
    const meio = (n - 1) / 2;
    return [...Array(n).keys()].map((i) => {
      const d = i - meio;
      return { x: x0 + i * passo, y: g.maoY + d * d * g.curva, rot: d * g.giro };
    });
  }

  /** Posição do verso [k] do leque de [j] com [n] cartas (na tela larga). */
  function posicaoDoVerso(j, k, n) {
    const leque = g.leques[j];
    const largura = g.mw + (n - 1) * g.passoMini;
    return { x: leque.x - largura / 2 + k * g.passoMini, y: leque.y };
  }

  /** De onde sai a carta que [j] joga: o último verso do leque, ou o quadro dele no celular. */
  function origemDaJogada(j, n) {
    if (!g.compacto && n > 0) {
      const p = posicaoDoVerso(j, n - 1, n);
      return { x: p.x + g.mw / 2, y: p.y + g.mh / 2 };
    }
    return g.pontos[j];
  }

  function aplicarPosicao(el, p) {
    el._p = p;
    el.style.translate = `${Math.round(p.x)}px ${Math.round(p.y)}px`;
    el.style.rotate = p.rot ? `${p.rot}deg` : "";
    el.style.scale = p.escala && p.escala !== 1 ? String(p.escala) : "";
  }

  /** Põe a carta em [p] na hora, sem animação, para depois ela andar até o destino. */
  function posicionarJa(el, p) {
    el.classList.add("parada");
    aplicarPosicao(el, p);
    void el.offsetWidth;
    el.classList.remove("parada");
  }

  const noPonto = (ponto, escala) => ({ x: ponto.x - g.cw / 2, y: ponto.y - g.ch / 2, rot: 0, escala });

  // ---------- Situação ----------

  const vezHumana = () => estado.fase === "vaza" && !pendente && aChegar.size === 0 && C.vez(estado) === 0;
  const vazaNaMesa = () => pendente || (estado.fase === "vaza" && estado.atual.cartas.length ? { lider: estado.atual.lider, cartas: estado.atual.cartas } : null);
  const textoPontos = (n) => `${C.formatarNumero(n)} ${n === 1 ? "ponto" : "pontos"}`;
  const textoCartas = (n) => `${n} ${n === 1 ? "carta" : "cartas"}`;
  const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  function textoSuaVez() {
    const { cartas } = estado.atual;
    if (!cartas.length) {
      if (C.primeiraVaza(estado)) return "Sua vez: abra a primeira vaza com o 2 de paus.";
      const soCopas = estado.maos[0].every((c) => C.naipe(c) === C.COPAS);
      if (!C.copasQuebradas(estado) && !soCopas) return "Sua vez de abrir a vaza. As copas ainda não foram quebradas.";
      return "Sua vez de abrir a vaza.";
    }
    const pedido = C.naipe(cartas[0]);
    const nome = C.NAIPES[pedido].nome;
    if (estado.maos[0].some((c) => C.naipe(c) === pedido)) return `Sua vez: siga o naipe de ${nome}.`;
    if (C.primeiraVaza(estado)) return `Sua vez: você não tem ${nome}; jogue outra carta, sem copas nem a Dama de espadas.`;
    return `Sua vez: você não tem ${nome} e pode jogar qualquer carta.`;
  }

  function textoDaSituacao() {
    if (estado.fase === "troca") {
      const d = C.destinoDaTroca(0, estado.rodada);
      return `Escolha 3 cartas para passar para ${NOMES[d]}, ${C.LUGARES[d]}.`;
    }
    if (aChegar.size) return "Trocando as cartas…";
    if (estado.fase === "fim" && !pendente) return C.terminou(estado) ? "Fim de jogo." : `Fim da rodada ${estado.rodada}.`;
    if (pendente) {
      const quem = pendente.vencedor === 0 ? "Você leva" : `${NOMES[pendente.vencedor]} leva`;
      return `${quem} a vaza${pendente.pontos ? `, com ${textoPontos(pendente.pontos)}` : ""}.`;
    }
    const j = C.vez(estado);
    return j === 0 ? textoSuaVez() : `Vez de ${NOMES[j]}…`;
  }

  // ---------- Desenho ----------

  function desenhar({ animar = true } = {}) {
    if (!g) medir();
    const semAnimacao = !animar || reduzirMovimento.matches;
    mesa.classList.toggle("sem-animacao", semAnimacao);
    const minhaVez = vezHumana();
    const legais = new Set(minhaVez ? C.jogadasLegais(estado) : []);
    const visiveis = new Map();

    // A sua mão, em leque; na troca, as escolhidas sobem mais; na sua vez, as que podem ser jogadas
    const mao = estado.fase === "fim" ? [] : estado.maos[0].filter((id) => !aChegar.has(id));
    const pos = posicoesDaMao(mao.length);
    mao.forEach((id, i) => {
      const escolhida = estado.fase === "troca" && selecao.has(id);
      const jogavel = minhaVez && legais.has(id);
      const y = pos[i].y - (escolhida ? g.ergueEscolhida : jogavel ? g.ergue : 0);
      visiveis.set(id, { p: { x: pos[i].x, y, rot: pos[i].rot }, z: 100 + i, naMao: true, escolhida, jogavel, bloqueada: minhaVez && !jogavel });
    });

    // A vaza: cada carta na frente de quem jogou; ao recolher, todas vão para quem ganhou
    const vaza = vazaNaMesa();
    if (vaza) {
      vaza.cartas.forEach((id, i) => {
        const j = (vaza.lider + i) % C.JOGADORES;
        const p = vaza.recolhendo ? noPonto(g.pontos[vaza.vencedor], 0.4) : g.vaza[j];
        visiveis.set(id, { p, z: 300 + i, sumindo: Boolean(vaza.recolhendo) });
      });
    }

    for (const [id, v] of visiveis) {
      const el = elementoDaCarta(id);
      const antes = el._p;
      const mudou = !antes || antes.x !== v.p.x || antes.y !== v.p.y;
      aplicarPosicao(el, v.p);
      // A carta que está andando passa por cima das outras durante o caminho
      el._zAlvo = v.z;
      if (mudou && antes && !semAnimacao) {
        clearTimeout(el._z);
        el.style.zIndex = String(1000 + v.z);
        el._z = setTimeout(() => {
          el._z = null;
          el.style.zIndex = String(el._zAlvo);
        }, 320);
      } else if (!el._z) {
        el.style.zIndex = String(v.z);
      }
      if (!el.classList.contains("aberta")) {
        el.classList.add("aberta");
        if (!semAnimacao && antes) {
          el.classList.remove("virando");
          void el.offsetWidth;
          el.classList.add("virando");
        }
      }
      el.classList.toggle("na-mao", Boolean(v.naMao));
      el.classList.toggle("trocando", Boolean(v.naMao) && estado.fase === "troca");
      el.classList.toggle("escolhida", Boolean(v.escolhida));
      el.classList.toggle("jogavel", Boolean(v.jogavel));
      el.classList.toggle("bloqueada", Boolean(v.bloqueada));
      el.classList.toggle("recebida", Boolean(v.naMao) && recebidasVisiveis.has(id));
      el.classList.toggle("cp-dica", dicaCartas.has(id));
      el.classList.toggle("sumindo", Boolean(v.sumindo));
      if (v.naMao) {
        el.setAttribute("role", "button");
        el.removeAttribute("aria-hidden");
        el.dataset.alvo = "carta";
        el.setAttribute("aria-label", rotuloDaCarta(id, legais));
      } else {
        el.removeAttribute("role");
        el.removeAttribute("aria-label");
        el.removeAttribute("tabindex");
        delete el.dataset.alvo;
        el.setAttribute("aria-hidden", "true");
      }
    }
    for (const id of [...cartasEl.keys()]) if (!visiveis.has(id)) removerCarta(id);

    // Os versos dos adversários (no celular, só o número aparece no quadro)
    for (const j of [1, 2, 3]) {
      const n = estado.fase === "fim" ? 0 : estado.maos[j].length;
      versosEl[j].forEach((el, k) => {
        const visivel = k < n && !g.compacto;
        el.hidden = !visivel;
        if (!visivel) return;
        aplicarPosicao(el, posicaoDoVerso(j, k, n));
        el.style.zIndex = String(40 + k);
      });
    }

    // Quadros: nome, pontos e de quem é a vez
    const pontos = C.pontosNaRodada(estado);
    const totais = C.totais(estado);
    const vezDe = estado.fase === "vaza" && !pendente && !aChegar.size ? C.vez(estado) : null;
    assentosEl.forEach((el, j) => {
      const n = estado.fase === "fim" ? 0 : estado.maos[j].length;
      el.querySelector(".cp-pontos").innerHTML = g.compacto
        ? `<b>${pontos[j]}</b> ${pontos[j] === 1 ? "pt" : "pts"}`
        : `<b>${pontos[j]}</b> ${pontos[j] === 1 ? "pt" : "pts"} · total ${C.formatarNumero(totais[j])}`;
      if (j) {
        el.querySelector(".cp-qtd").textContent = g.compacto ? String(n) : textoCartas(n);
        el.setAttribute("aria-label", rotuloDoAssento(j, pontos, totais, n, vezDe));
      }
      el.classList.toggle("vez", vezDe === j);
    });
    vagaVaza.setAttribute("aria-label", rotuloDaVaza(pontos, totais));

    desenharPainel();
    textoSituacao.textContent = textoDaSituacao();
    const direcao = C.direcao(estado.rodada);
    textoPartida.textContent =
      `Partida nº ${C.formatarNumero(estado.semente)} · ${C.textoModo(estado.modo)} · rodada ${estado.rodada} · ` +
      (C.temTroca(estado.rodada) ? `troca ${direcao.texto}` : "sem troca");
    botaoDica.disabled = !(vezHumana() || (estado.fase === "troca" && !aChegar.size));
    botaoUltima.disabled = !estado.vazas.length;
    for (const botao of botoesModo) {
      const ativo = Number(botao.dataset.modo) === estado.modo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    if (semAnimacao) requestAnimationFrame(() => mesa.classList.remove("sem-animacao"));
    atualizarFoco(mesa.contains(document.activeElement) && document.activeElement !== painelBotao && !alvoValido(document.activeElement));
  }

  function desenharPainel() {
    let texto = "";
    let rotulo = "";
    let pronto = true;
    if (estado.fase === "troca" && !aChegar.size) {
      const d = C.destinoDaTroca(0, estado.rodada);
      const faltam = C.NA_TROCA - selecao.size;
      texto = faltam ? `Escolha ${faltam === 3 ? "3 cartas" : `mais ${textoCartas(faltam)}`} para ${NOMES[d]}.` : `Pronto: as 3 cartas vão para ${NOMES[d]}.`;
      rotulo = `Passar 3 cartas ${C.direcao(estado.rodada).texto}`;
      pronto = faltam === 0;
    } else if (estado.fase === "fim" && !pendente && !dialogo.open) {
      texto = C.terminou(estado) ? "A partida terminou." : `A rodada ${estado.rodada} terminou.`;
      rotulo = C.terminou(estado) ? "Nova partida" : "Próxima rodada";
    }
    painel.hidden = !rotulo;
    if (!rotulo) return;
    painelTexto.textContent = texto;
    painelBotao.textContent = rotulo;
    painelBotao.setAttribute("aria-disabled", String(!pronto));
  }

  // ---------- Rótulos para o leitor de tela ----------

  function rotuloDaCarta(id, legais) {
    let texto = C.nomeCarta(id);
    if (estado.fase === "troca") {
      if (selecao.has(id)) texto += ", escolhida para passar";
    } else if (vezHumana()) {
      texto += legais.has(id) ? ", pode jogar" : ", não pode jogar agora";
    }
    if (estado.recebidas[0].includes(id)) texto += ", recebida na troca";
    return `${texto}.`;
  }

  function rotuloDoAssento(j, pontos, totais, n, vezDe) {
    const vez = vezDe === j ? ` É a vez de ${NOMES[j]}.` : "";
    return `${NOMES[j]}, ${C.LUGARES[j]}: ${textoCartas(n)} na mão, ${textoPontos(pontos[j])} nesta rodada, ${textoPontos(totais[j])} no total.${vez}`;
  }

  function rotuloDaVaza(pontos, totais) {
    const voce = ` Você: ${textoPontos(pontos[0])} nesta rodada, ${textoPontos(totais[0])} no total.`;
    if (estado.fase === "troca") return `${textoDaSituacao()} ${selecao.size} de 3 escolhidas.${voce}`;
    const vaza = vazaNaMesa();
    let texto = "Mesa vazia.";
    if (vaza && vaza.cartas.length) {
      const lances = vaza.cartas.map((c, i) => {
        const j = (vaza.lider + i) % C.JOGADORES;
        return `${j === 0 ? "você jogou" : `${NOMES[j]} jogou`} ${C.oCarta(c)}`;
      });
      texto = `Na mesa: ${C.listar(lances)}.`;
    }
    return `${texto} ${textoDaSituacao()}${voce}`;
  }

  // ---------- Avisos ----------

  let mensagemTimer = null;

  function anunciar(texto) {
    status.textContent = texto;
    if (mensagemEl.classList.contains("visivel")) {
      clearTimeout(mensagemTimer);
      mensagemEl.classList.remove("visivel");
    }
  }

  /** Explica, na mesa e para o leitor de tela, o que aconteceu ou por que a jogada não saiu. */
  function avisar(texto, ms = MENSAGEM_MS) {
    anunciar(texto);
    mensagemEl.textContent = texto;
    mensagemEl.classList.add("visivel");
    mensagemTimer = setTimeout(() => mensagemEl.classList.remove("visivel"), ms);
  }

  // ---------- Foco do teclado ----------

  /** As fileiras que o teclado percorre: Beto em cima; Ana, a mesa e Clara no meio; a sua mão embaixo. */
  function fileiras() {
    const mao = estado.fase === "fim" ? [] : estado.maos[0].filter((id) => cartasEl.has(id) && !aChegar.has(id)).map((id) => cartasEl.get(id));
    return [[assentosEl[2]], [assentosEl[1], vagaVaza, assentosEl[3]], mao];
  }

  const alvoValido = (el) => Boolean(el && el.dataset && el.dataset.alvo && mesa.contains(el));

  function atualizarFoco(mover = false) {
    const linhas = fileiras();
    if (!linhas[foco.linha].length) foco = { linha: 1, i: 1 };
    foco.i = Math.max(0, Math.min(foco.i, linhas[foco.linha].length - 1));
    const alvo = linhas[foco.linha][foco.i];
    for (const linha of linhas) for (const el of linha) el.tabIndex = el === alvo ? 0 : -1;
    if (mover && alvo) alvo.focus({ preventScroll: true });
  }

  function posicaoDoAlvo(el) {
    const linhas = fileiras();
    for (let linha = 0; linha < linhas.length; linha++) {
      const i = linhas[linha].indexOf(el);
      if (i >= 0) return { linha, i };
    }
    return null;
  }

  const centroX = (el) => {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2;
  };

  function moverFoco(tecla) {
    const linhas = fileiras();
    const lista = linhas[foco.linha];
    if (tecla === "ArrowLeft" || tecla === "ArrowRight") {
      if (!lista.length) return;
      foco.i = (foco.i + (tecla === "ArrowRight" ? 1 : -1) + lista.length) % lista.length;
    } else if (tecla === "Home" || tecla === "End") {
      foco.i = tecla === "Home" ? 0 : lista.length - 1;
    } else {
      const passo = tecla === "ArrowDown" ? 1 : -1;
      let alvo = foco.linha + passo;
      while (alvo >= 0 && alvo < linhas.length && !linhas[alvo].length) alvo += passo;
      if (alvo < 0 || alvo >= linhas.length) return;
      const x = lista[foco.i] ? centroX(lista[foco.i]) : 0;
      const destino = linhas[alvo];
      let melhor = 0;
      destino.forEach((el, i) => {
        if (Math.abs(centroX(el) - x) < Math.abs(centroX(destino[melhor]) - x)) melhor = i;
      });
      foco = { linha: alvo, i: melhor };
    }
    atualizarFoco(true);
  }

  // ---------- Diálogo ----------

  let aoCancelarDialogo = null;

  function abrirDialogo({ titulo, texto, dados = [], vaza = null, botoes, aoCancelar }) {
    dialogoTitulo.textContent = titulo;
    dialogoTexto.textContent = texto;
    dialogoDados.replaceChildren(
      ...dados.map(([rotulo, valor, destaque]) => {
        const linha = document.createElement("div");
        if (destaque) linha.className = "destaque";
        const dt = document.createElement("dt");
        dt.textContent = rotulo;
        const dd = document.createElement("dd");
        dd.textContent = valor;
        linha.append(dt, dd);
        return linha;
      }),
    );
    dialogoDados.hidden = dados.length === 0;
    desenharVazaNoDialogo(vaza);
    dialogoBotoes.replaceChildren(
      ...botoes.map(({ rotulo, acao, secundario }) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = secundario ? "button secondary" : "button";
        botao.textContent = rotulo;
        botao.addEventListener("click", () => {
          fecharDialogo();
          acao();
        });
        return botao;
      }),
    );
    aoCancelarDialogo = aoCancelar || null;
    if (!dialogo.open) dialogo.showModal();
    dialogo.classList.add("travado");
    setTimeout(() => dialogo.classList.remove("travado"), TRAVA_DIALOGO_MS);
    anunciar(`${titulo}. ${texto}`);
    desenharPainel();
  }

  function fecharDialogo() {
    aoCancelarDialogo = null;
    if (dialogo.open) dialogo.close();
    if (estado) desenharPainel();
  }

  dialogo.addEventListener("cancel", (evento) => {
    evento.preventDefault();
    const acao = aoCancelarDialogo;
    fecharDialogo();
    acao?.();
  });

  /** A última vaza no diálogo: cada carta do lado de quem a jogou, e quem ganhou em destaque. */
  function desenharVazaNoDialogo(vaza) {
    dialogoVaza.hidden = !vaza;
    if (!vaza) {
      dialogoVaza.replaceChildren();
      return;
    }
    dialogoVaza.replaceChildren(
      ...vaza.cartas.map((id, i) => {
        const j = (vaza.lider + i) % C.JOGADORES;
        const lance = document.createElement("div");
        lance.className = `cp-lance cp-lance-${j}${j === vaza.vencedor ? " ganhou" : ""}`;
        const cartaEl = criar(`cp-carta aberta${C.vermelha(id) ? " vermelha" : ""}`, { role: "img", "aria-label": `${NOMES[j]}: ${C.nomeCarta(id)}` });
        cartaEl.innerHTML = htmlDaFace(id);
        const nome = document.createElement("span");
        nome.textContent = `${NOMES[j]}${i === 0 ? " (abriu)" : ""}`;
        nome.setAttribute("aria-hidden", "true");
        lance.append(cartaEl, nome);
        return lance;
      }),
    );
  }

  // ---------- Jogadas ----------

  function limparDica() {
    clearTimeout(dicaTimer);
    if (!dicaCartas.size) return;
    dicaCartas = new Set();
    for (const el of cartasEl.values()) el.classList.remove("cp-dica");
  }

  function tremer(id) {
    const el = cartasEl.get(id);
    if (!el) return;
    el.classList.remove("tremendo");
    void el.offsetWidth;
    el.classList.add("tremendo");
  }

  /** Um toque (ou Enter) numa carta da sua mão. */
  function tocarCarta(id) {
    if (!estado.maos[0].includes(id) || aChegar.has(id)) return;
    if (estado.fase === "troca") {
      alternarEscolha(id);
      return;
    }
    if (estado.fase !== "vaza") return;
    if (pendente) {
      avisar("Espere a vaza ser recolhida.");
      return;
    }
    const j = C.vez(estado);
    if (j !== 0) {
      avisar(`Espere a sua vez: agora é a vez de ${NOMES[j]}.`);
      return;
    }
    const motivo = C.motivoIlegal(estado, id);
    if (motivo) {
      tremer(id);
      som.tocar("erro");
      avisar(motivo);
      return;
    }
    executarJogada(id);
  }

  function alternarEscolha(id) {
    limparDica();
    if (selecao.has(id)) {
      selecao.delete(id);
      anunciar(`${C.nomeCarta(id)} saiu da troca. ${selecao.size} de 3 escolhidas.`);
    } else if (selecao.size >= C.NA_TROCA) {
      tremer(id);
      som.tocar("erro");
      avisar("Você já escolheu 3 cartas. Toque numa delas para trocá-la por outra.");
      return;
    } else {
      selecao.add(id);
      anunciar(`${C.nomeCarta(id)} escolhida para passar. ${selecao.size} de 3.`);
    }
    som.tocar("selecionar");
    desenhar();
  }

  /** Quem tem a vez joga [id]: a carta vai para a vaza; a quarta fecha a vaza. */
  function executarJogada(id) {
    const antes = estado;
    const j = C.vez(antes);
    const novo = C.jogar(antes, id);
    if (!novo) return;
    limparDica();
    if (j !== 0) {
      // A carta sai do leque (ou do quadro) de quem jogou, ainda virada para baixo
      const el = elementoDaCarta(id);
      el.classList.remove("aberta");
      posicionarJa(el, noPonto(origemDaJogada(j, antes.maos[j].length), g.mw / g.cw));
    }
    estado = novo;
    const fechou = antes.atual.cartas.length === C.JOGADORES - 1;
    if (fechou) {
      const v = C.ultimaVaza(novo);
      pendente = { lider: v.lider, cartas: v.cartas, vencedor: v.vencedor, pontos: v.pontos, recolhendo: false };
    }
    desenhar();
    som.tocar(j === 0 ? "pousar" : "virar");
    const texto = `${j === 0 ? "Você jogou" : `${NOMES[j]} jogou`} ${C.oCarta(id)}.`;
    anunciar(texto);
    if (novo.fase === "fim") aoFecharRodada();
    else salvar();
    if (fechou) esperar(ESPERA_VAZA, recolherVaza);
    else proximoPasso(texto);
  }

  /** Depois da pausa, as quatro cartas deslizam para quem ganhou a vaza. */
  function recolherVaza() {
    if (!pendente) return;
    pendente.recolhendo = true;
    desenhar();
    som.tocar("deslizar");
    const { vencedor, pontos } = pendente;
    const quadro = assentosEl[vencedor];
    quadro.classList.remove("ganhou");
    void quadro.offsetWidth;
    quadro.classList.add("ganhou");
    const quem = vencedor === 0 ? "Você levou" : `${NOMES[vencedor]} levou`;
    const texto = `${quem} a vaza${pontos ? `, com ${textoPontos(pontos)}` : ""}.`;
    anunciar(texto);
    esperar(RECOLHER_MS + 40, () => {
      pendente = null;
      desenhar();
      proximoPasso(texto);
    });
  }

  /**
   * Decide o que acontece agora: a vez do computador, a sua ou o fim da rodada. [antes] é o último
   * anúncio, que vai junto com o aviso da sua vez (um anúncio novo apagaria o anterior).
   */
  function proximoPasso(antes = "") {
    if (agendaComputador) {
      clearTimeout(agendaComputador);
      timers.delete(agendaComputador);
      agendaComputador = null;
    }
    if (pendente || aChegar.size) return;
    if (estado.fase === "fim") {
      esperar(350, mostrarFimDaRodada);
      return;
    }
    if (estado.fase !== "vaza") return;
    const j = C.vez(estado);
    if (j === 0) {
      anunciar(`${antes} ${textoSuaVez()}`.trim());
      return;
    }
    agendaComputador = esperar(reduzirMovimento.matches ? 500 : ESPERA_COMPUTADOR, () => jogarComputador(j));
  }

  function jogarComputador(j) {
    agendaComputador = null;
    if (estado.fase !== "vaza" || pendente || C.vez(estado) !== j) return;
    // Com um diálogo aberto, o computador espera
    if (dialogo.open) {
      agendaComputador = esperar(400, () => jogarComputador(j));
      return;
    }
    executarJogada(C.escolherJogada(estado));
  }

  /** A troca: você passa as 3 escolhidas e os adversários passam as deles. */
  function passarCartas() {
    if (estado.fase !== "troca" || aChegar.size) return;
    if (selecao.size !== C.NA_TROCA) {
      const faltam = C.NA_TROCA - selecao.size;
      som.tocar("erro");
      avisar(`Escolha mais ${textoCartas(faltam)} para passar.`);
      return;
    }
    const minhas = C.ordenar([...selecao]);
    const escolhas = [minhas, ...[1, 2, 3].map((j) => C.escolherTroca(estado.maos[j]))];
    const novo = C.trocar(estado, escolhas);
    if (!novo) return;
    limparDica();
    const rodada = estado.rodada;
    const destino = C.destinoDaTroca(0, rodada);
    const origem = C.origemDaTroca(0, rodada);
    // As suas 3 cartas viram para baixo e vão até quem recebe: a partir daqui são cartas da mão
    // de outro jogador, então perdem a face e a identidade
    const tinhaFoco = document.activeElement === painelBotao || minhas.some((id) => cartasEl.get(id) === document.activeElement);
    for (const id of minhas) {
      const el = cartasEl.get(id);
      if (!el) continue;
      cartasEl.delete(id);
      el.className = "cp-carta cp-fantasma";
      el.innerHTML = '<span class="cp-verso"></span>';
      for (const atributo of ["data-id", "data-alvo", "role", "aria-label", "tabindex"]) el.removeAttribute(atributo);
      el.setAttribute("aria-hidden", "true");
      el.style.zIndex = "1200";
      aplicarPosicao(el, noPonto(g.pontos[destino], 0.5));
      el.classList.add("sumindo");
      esperar(reduzirMovimento.matches ? 0 : 450, () => el.remove());
    }
    // Entre os adversários, só versos andam de um lugar para o outro
    for (const j of [1, 2, 3]) {
      const para = C.destinoDaTroca(j, rodada);
      if (para !== 0) voarVersos(j, para);
    }
    estado = novo;
    selecao = new Set();
    const recebidas = novo.recebidas[0];
    aChegar = new Set(recebidas);
    desenhar();
    if (tinhaFoco) atualizarFoco(true);
    som.tocar("deslizar");
    salvar();
    esperar(reduzirMovimento.matches ? 0 : 480, () => {
      // As cartas recebidas chegam de quem passou, com a face para você
      for (const id of recebidas) {
        const el = elementoDaCarta(id);
        posicionarJa(el, noPonto(origemDaJogada(origem, C.POR_MAO), 0.5));
      }
      aChegar = new Set();
      recebidasVisiveis = new Set(recebidas);
      desenhar();
      som.tocar("pousar");
      avisar(`Você recebeu de ${NOMES[origem]}: ${C.listar(recebidas.map(C.oCarta))}.`, MENSAGEM_LONGA_MS);
      esperar(DESTAQUE_RECEBIDAS_MS, () => {
        recebidasVisiveis = new Set();
        desenhar();
      });
      esperar(reduzirMovimento.matches ? 600 : 1300, () => proximoPasso());
    });
  }

  /** Três versos que andam de um adversário para outro na troca. */
  function voarVersos(de, para) {
    if (reduzirMovimento.matches) return;
    const a = noPonto(origemDaJogada(de, C.POR_MAO), g.mw / g.cw);
    const b = noPonto(origemDaJogada(para, C.POR_MAO), g.mw / g.cw);
    for (let k = 0; k < C.NA_TROCA; k++) {
      const el = criar("cp-carta cp-fantasma", { "aria-hidden": "true" });
      el.innerHTML = '<span class="cp-verso"></span>';
      el.style.zIndex = String(1100 + k);
      mesa.insertBefore(el, painel);
      posicionarJa(el, { ...a, x: a.x + k * 4 });
      el.style.transitionDelay = `${k * 50}ms`;
      aplicarPosicao(el, { ...b, x: b.x + k * 4 });
      esperar(300 + k * 50, () => el.classList.add("sumindo"));
      esperar(700, () => el.remove());
    }
  }

  // ---------- Fim da rodada e da partida ----------

  /** A rodada acabou de fechar: tiro na lua e resultado da partida entram nas estatísticas. */
  function aoFecharRodada() {
    const linha = estado.placar[estado.placar.length - 1];
    const modo = estado.modo;
    if (linha.lua === 0) estatisticas = { ...estatisticas, [modo]: C.registrarLua(estatisticas[modo]) };
    resultadoFinal = null;
    resumoMostrado = false;
    if (C.terminou(estado)) {
      const total = C.totais(estado)[0];
      const venceu = C.vencedor(estado) === 0;
      const { estatisticas: novas, recordes } = C.registrarResultado(estatisticas[modo], { venceu, pontos: total });
      estatisticas = { ...estatisticas, [modo]: novas };
      resultadoFinal = { recordes, sequencia: novas.sequencia };
      gravar(CHAVE_PARTIDA, null);
    } else {
      salvar();
    }
    gravar(CHAVE_ESTATISTICAS, estatisticas);
    desenharEstatisticas();
    desenharPlacar();
  }

  function mostrarFimDaRodada() {
    if (estado.fase !== "fim" || pendente || dialogo.open || resumoMostrado) return;
    resumoMostrado = true;
    if (C.terminou(estado)) {
      mostrarFimDaPartida();
      return;
    }
    const linha = estado.placar[estado.placar.length - 1];
    const t = C.totais(estado);
    let texto;
    if (linha.lua === 0) texto = "Tiro na lua! Você levou todas as copas e a Dama de espadas, e cada adversário recebeu 26 pontos.";
    else if (linha.lua !== null) texto = `Tiro na lua de ${NOMES[linha.lua]}: levou todas as copas e a Dama de espadas, e cada um dos outros recebeu 26 pontos.`;
    else texto = `Você fez ${textoPontos(linha.pontos[0])} nesta rodada.`;
    if (Math.max(...t) >= estado.modo) texto += ` Alguém chegou a ${estado.modo}, mas o menor total está empatado: vale mais uma rodada.`;
    const proxima = estado.rodada + 1;
    texto += C.temTroca(proxima) ? ` Na próxima, a troca é ${C.direcao(proxima).texto}.` : " Na próxima rodada não há troca.";
    abrirDialogo({
      titulo: `Fim da rodada ${estado.rodada}`,
      texto,
      dados: [0, 1, 2, 3].map((j) => [NOMES[j], `${linha.lua === j ? "tiro na lua, " : ""}+${linha.pontos[j]} · total ${C.formatarNumero(t[j])}`, j === 0]),
      botoes: [{ rotulo: "Próxima rodada", acao: avancarRodada }],
    });
    som.tocar(linha.lua === 0 ? "acerto" : "completo");
  }

  function mostrarFimDaPartida() {
    const t = C.totais(estado);
    const v = C.vencedor(estado);
    const ranking = C.classificacao(estado);
    const minha = ranking.find((l) => l.jogador === 0);
    const dados = ranking.map((l) => [`${l.posicao}º ${NOMES[l.jogador]}`, textoPontos(l.total), l.jogador === 0]);
    if (resultadoFinal && resultadoFinal.recordes.pontuacao) dados.push(["Nova melhor pontuação!", textoPontos(t[0]), true]);
    if (resultadoFinal) dados.push(["Vitórias seguidas", C.formatarNumero(resultadoFinal.sequencia)]);
    const { semente, modo } = estado;
    abrirDialogo({
      titulo: v === 0 ? "Você venceu!" : "Fim de jogo",
      texto:
        v === 0
          ? `Você terminou com ${textoPontos(t[0])}, o menor total da mesa, em ${estado.rodada} rodadas.`
          : `${NOMES[v]} venceu com ${textoPontos(t[v])}. Você ficou em ${minha.posicao}º lugar, com ${textoPontos(t[0])}.`,
      dados,
      botoes: [
        { rotulo: "Nova partida", acao: () => novaPartida({ modo }) },
        { rotulo: "Jogar esta de novo", acao: () => novaPartida({ modo, semente }), secundario: true },
        { rotulo: "Fechar", acao: () => {}, secundario: true },
      ],
    });
    som.tocar(v === 0 ? "vitoria" : "derrota");
  }

  function avancarRodada() {
    const novo = C.proximaRodada(estado);
    if (!novo) return;
    fecharDialogo();
    cancelarTudo();
    // Pedida pelo botão do painel ou do diálogo: o foco vai para a mão nova
    const ativo = document.activeElement;
    const focoNoPainel = !ativo || ativo === document.body || mesa.contains(ativo) || dialogo.contains(ativo);
    estado = novo;
    selecao = new Set();
    recebidasVisiveis = new Set();
    aChegar = new Set();
    resumoMostrado = true;
    limparDica();
    removerTodasAsCartas();
    foco = { linha: 2, i: 0 };
    desenhar({ animar: false });
    if (focoNoPainel) atualizarFoco(true);
    animarDistribuicao();
    salvar();
    som.tocar("embaralhar");
    const direcao = C.direcao(estado.rodada);
    anunciar(`Rodada ${estado.rodada}. ${C.temTroca(estado.rodada) ? `Escolha 3 cartas para passar ${direcao.texto}.` : "Nesta rodada não há troca."}`);
    esperar(reduzirMovimento.matches ? 300 : 1300, () => proximoPasso());
  }

  // ---------- Placar e estatísticas ----------

  function desenharPlacar() {
    const t = C.totais(estado);
    resumoPlacar.textContent = `· ${NOMES.map((n, j) => `${n} ${C.formatarNumero(t[j])}`).join(" · ")}`;
    const cabeca = document.createElement("thead");
    cabeca.innerHTML = `<tr><th scope="col">Rodada</th>${NOMES.map((n) => `<th scope="col">${n}</th>`).join("")}</tr>`;
    const corpo = document.createElement("tbody");
    if (!estado.placar.length) {
      const tr = document.createElement("tr");
      tr.className = "vazia";
      tr.innerHTML = '<td colspan="5">Nenhuma rodada terminada ainda.</td>';
      corpo.append(tr);
    }
    estado.placar.forEach((linha, k) => {
      const tr = document.createElement("tr");
      const rodada = document.createElement("td");
      rodada.textContent = `${k + 1}ª · ${C.direcao(k + 1).curto}`;
      tr.append(rodada);
      linha.pontos.forEach((p, j) => {
        const td = document.createElement("td");
        td.textContent = linha.lua === j ? `${p} (lua)` : String(p);
        if (linha.lua === j) td.className = "lua";
        else if (j === 0) td.className = "voce";
        tr.append(td);
      });
      corpo.append(tr);
    });
    const pe = document.createElement("tfoot");
    pe.innerHTML = `<tr><th scope="row">Total</th>${t.map((x) => `<td>${C.formatarNumero(x)}</td>`).join("")}</tr>`;
    tabela.replaceChildren(cabeca, corpo, pe);
  }

  function desenharEstatisticas() {
    const modo = estado ? estado.modo : C.MODO_PADRAO;
    const e = estatisticas[modo];
    estModo.textContent = C.textoModo(modo);
    const linhas = [
      ["Partidas", C.formatarNumero(e.jogadas)],
      ["Vitórias", `${C.formatarNumero(e.vitorias)} (${C.porcentagemVitorias(e)}%)`],
      ["Melhor pontuação final", e.melhorPontuacao === null ? "—" : textoPontos(e.melhorPontuacao)],
      ["Tiros na lua", C.formatarNumero(e.luas)],
      ["Vitórias seguidas", C.formatarNumero(e.sequencia)],
      ["Maior sequência", C.formatarNumero(e.melhorSequencia)],
    ];
    estLista.replaceChildren(
      ...linhas.map(([rotulo, valor]) => {
        const linha = document.createElement("div");
        const dt = document.createElement("dt");
        dt.textContent = rotulo;
        const dd = document.createElement("dd");
        dd.textContent = valor;
        linha.append(dt, dd);
        return linha;
      }),
    );
  }

  /** Partida começada e abandonada conta como não terminada. */
  function registrarAbandono() {
    if (!estado || !estado.iniciado || C.terminou(estado)) return;
    estatisticas = { ...estatisticas, [estado.modo]: C.registrarResultado(estatisticas[estado.modo], { venceu: false }).estatisticas };
    gravar(CHAVE_ESTATISTICAS, estatisticas);
  }

  // ---------- Partida ----------

  /** As cartas saem do centro da mesa para cada jogador, uma de cada vez. */
  function animarDistribuicao() {
    if (reduzirMovimento.matches) return;
    const centro = noPonto({ x: g.cx, y: g.cy }, g.mw / g.cw);
    const mao = estado.maos[0].map((id) => cartasEl.get(id)).filter(Boolean);
    const versos = [1, 2, 3].map((j) => versosEl[j].filter((el) => !el.hidden));
    mesa.classList.add("sem-animacao");
    const destinos = new Map();
    for (const el of [...mao, ...versos.flat()]) destinos.set(el, el._p);
    for (const el of mao) {
      el.classList.remove("aberta");
      aplicarPosicao(el, centro);
    }
    for (const el of versos.flat()) aplicarPosicao(el, { x: g.cx - g.mw / 2, y: g.cy - g.mh / 2 });
    void mesa.offsetWidth;
    mesa.classList.remove("sem-animacao");
    // Uma volta por vez: Ana, Beto, Clara e você
    const ordem = [];
    for (let k = 0; k < C.POR_MAO; k++) {
      for (const j of [1, 2, 3, 0]) {
        const el = j === 0 ? mao[k] : versos[j - 1][k];
        if (el) ordem.push(el);
      }
    }
    ordem.forEach((el, k) => {
      const atraso = k * 16;
      el.style.transitionDelay = `${atraso}ms`;
      aplicarPosicao(el, destinos.get(el));
      if (mao.includes(el)) {
        esperar(atraso + 200, () => {
          el.classList.add("aberta");
          el.classList.remove("virando");
          void el.offsetWidth;
          el.classList.add("virando");
        });
      }
    });
    esperar(ordem.length * 16 + 300, () => ordem.forEach((el) => (el.style.transitionDelay = "")));
  }

  function novaPartida({ modo = estado ? estado.modo : C.MODO_PADRAO, semente = C.novaSemente() } = {}) {
    fecharDialogo();
    cancelarTudo();
    registrarAbandono();
    pendente = null;
    selecao = new Set();
    recebidasVisiveis = new Set();
    aChegar = new Set();
    dicaCartas = new Set();
    resultadoFinal = null;
    resumoMostrado = true;
    removerTodasAsCartas();
    estado = C.novoJogo(modo, semente);
    gravar(CHAVE_MODO, estado.modo);
    foco = { linha: 2, i: 0 };
    desenhar({ animar: false });
    animarDistribuicao();
    desenharEstatisticas();
    desenharPlacar();
    salvar();
    som.tocar("embaralhar");
    anunciar(`Nova partida ${C.textoModo(estado.modo)}. Partida número ${C.formatarNumero(semente)}. ${textoDaSituacao()}`);
    esperar(reduzirMovimento.matches ? 300 : 1300, () => proximoPasso());
  }

  function confirmarNovaPartida(opcoes = {}) {
    if (!estado.iniciado || C.terminou(estado)) {
      novaPartida(opcoes);
      return;
    }
    abrirDialogo({
      titulo: "Começar outra partida?",
      texto: "A partida atual vai contar como não terminada nas suas estatísticas.",
      botoes: [
        { rotulo: "Sim, começar", acao: () => novaPartida(opcoes) },
        { rotulo: "Não", acao: () => {}, secundario: true },
      ],
    });
  }

  // ---------- Dica e última vaza ----------

  function mostrarDica() {
    limparDica();
    let texto;
    if (estado.fase === "troca" && !aChegar.size) {
      const sugestao = C.escolherTroca(estado.maos[0]);
      dicaCartas = new Set(sugestao);
      texto = `Dica: passe ${C.listar(sugestao.map(C.oCarta))}. ${maiuscula(C.explicarTroca(estado.maos[0], sugestao))}.`;
    } else if (vezHumana()) {
      const d = C.decidirJogada(estado);
      if (!d) return;
      dicaCartas = new Set([d.carta]);
      texto = `Dica: jogue ${C.oCarta(d.carta)}: ${d.motivo}.`;
    } else {
      avisar("A dica aparece na sua vez de jogar.");
      return;
    }
    desenhar();
    som.tocar("dica");
    avisar(texto, MENSAGEM_LONGA_MS);
    dicaTimer = setTimeout(limparDica, MENSAGEM_LONGA_MS);
  }

  function mostrarUltimaVaza() {
    const v = C.ultimaVaza(estado);
    if (!v) {
      avisar("Nenhuma vaza foi fechada ainda nesta rodada.");
      return;
    }
    const quem = v.vencedor === 0 ? "Você levou" : `${NOMES[v.vencedor]} levou`;
    abrirDialogo({
      titulo: "Última vaza",
      texto: `${quem} a vaza ${estado.vazas.length} de 13${v.pontos ? `, com ${textoPontos(v.pontos)}` : ", sem pontos"}.`,
      vaza: v,
      botoes: [{ rotulo: "Fechar", acao: () => {} }],
    });
  }

  // ---------- Toque, clique e teclado ----------

  mesa.addEventListener("click", (evento) => {
    const cartaEl = evento.target.closest(".cp-carta.na-mao");
    if (cartaEl) {
      const id = Number(cartaEl.dataset.id);
      foco = { linha: 2, i: Math.max(0, estado.maos[0].indexOf(id)) };
      tocarCarta(id);
      return;
    }
    const assento = evento.target.closest(".cp-assento[data-alvo]");
    if (assento && evento.detail === 0) anunciar(assento.getAttribute("aria-label"));
  });
  mesa.addEventListener("contextmenu", (evento) => evento.target.closest(".cp-carta") && evento.preventDefault());

  painelBotao.addEventListener("click", () => {
    if (estado.fase === "troca") passarCartas();
    else if (estado.fase === "fim" && C.terminou(estado)) novaPartida();
    else if (estado.fase === "fim") avancarRodada();
  });

  mesa.addEventListener("keydown", (evento) => {
    const alvo = evento.target.closest?.("[data-alvo]");
    if (!alvo || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const onde = posicaoDoAlvo(alvo);
    if (onde) foco = onde;
    switch (evento.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown":
      case "Home":
      case "End":
        moverFoco(evento.key);
        break;
      case "Enter":
      case " ":
        if (alvo.dataset.alvo === "carta") tocarCarta(Number(alvo.dataset.id));
        else anunciar(alvo.getAttribute("aria-label"));
        break;
      case "Escape":
        if (estado.fase !== "troca" || !selecao.size) return;
        selecao = new Set();
        desenhar();
        anunciar("Escolhas da troca desfeitas.");
        break;
      default:
        return;
    }
    evento.preventDefault();
  });

  mesa.addEventListener("focusin", (evento) => {
    const onde = posicaoDoAlvo(evento.target);
    if (onde) {
      foco = onde;
      atualizarFoco(false);
    }
  });

  // ---------- Botões ----------

  botaoDica.addEventListener("click", mostrarDica);
  botaoUltima.addEventListener("click", mostrarUltimaVaza);
  botaoNova.addEventListener("click", () => confirmarNovaPartida());
  for (const botao of botoesModo) {
    botao.addEventListener("click", () => {
      const modo = Number(botao.dataset.modo);
      if (modo !== estado.modo) confirmarNovaPartida({ modo });
    });
  }
  botaoZerar.addEventListener("click", () => {
    const modo = estado.modo;
    abrirDialogo({
      titulo: "Zerar estatísticas?",
      texto: `As estatísticas ${C.textoModo(modo)} voltam para zero. Isso não pode ser desfeito.`,
      botoes: [
        {
          rotulo: "Sim, zerar",
          acao: () => {
            estatisticas = { ...estatisticas, [modo]: C.estatisticasVazias() };
            gravar(CHAVE_ESTATISTICAS, estatisticas);
            desenharEstatisticas();
            anunciar("Estatísticas zeradas.");
          },
        },
        { rotulo: "Não", acao: () => {}, secundario: true },
      ],
    });
  });
  som.ligarBotao(raiz.querySelector("#cp-som"));

  // Se a rodada acabou com outro diálogo aberto (a última vaza, por exemplo), o resumo vem depois
  dialogo.addEventListener("close", () => {
    if (!estado) return;
    desenharPainel();
    if (estado.fase === "fim" && !resumoMostrado) esperar(250, mostrarFimDaRodada);
  });

  // ---------- Tamanho da tela e saída da página ----------

  let redesenho = null;
  let ultimaMedida = "";
  function aoMudarTamanho() {
    cancelAnimationFrame(redesenho);
    redesenho = requestAnimationFrame(() => {
      const medida = `${mesa.clientWidth}x${window.innerHeight}`;
      if (medida === ultimaMedida) return;
      ultimaMedida = medida;
      medir();
      desenhar({ animar: false });
    });
  }
  if (typeof ResizeObserver === "function") new ResizeObserver(aoMudarTamanho).observe(mesa);
  window.addEventListener("resize", aoMudarTamanho);

  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && salvar());
  window.addEventListener("pagehide", salvar);

  // ---------- Início ----------

  const salvas = lerJson(CHAVE_ESTATISTICAS) || {};
  for (const modo of C.MODOS) estatisticas[modo] = C.lerEstatisticas(salvas[modo]);
  const salva = lerJson(CHAVE_PARTIDA);
  const restaurada = salva && C.restaurar(salva.estado);
  medir();
  ultimaMedida = `${mesa.clientWidth}x${window.innerHeight}`;
  if (restaurada && !C.terminou(restaurada)) {
    estado = restaurada;
    desenhar({ animar: false });
    desenharEstatisticas();
    desenharPlacar();
    anunciar(`Partida anterior retomada. ${textoDaSituacao()}`);
    resumoMostrado = estado.fase !== "fim";
    esperar(600, () => proximoPasso());
  } else {
    const modo = C.MODOS.includes(lerJson(CHAVE_MODO)) ? lerJson(CHAVE_MODO) : C.MODO_PADRAO;
    novaPartida({ modo });
  }
})();
