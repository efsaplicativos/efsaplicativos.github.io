"use strict";
/*
 * Interface do Truco (Paulista e Mineiro). As regras e as jogadas do computador ficam em
 * truco-logica.js.
 *
 * Você (embaixo) joga com o Zé (em frente) contra o Tião (à direita) e a Cida (à esquerda). As 12
 * cartas da mão e a vira são elementos criados uma vez, um por lugar na distribuição (jogador e
 * ordem em que recebeu), e só mudam de lugar com a propriedade CSS translate. A face de uma carta
 * só é desenhada quando ela fica à vista: as cartas escondidas não aparecem no HTML nem nos
 * rótulos. Um toque (ou Enter) numa das suas cartas joga a carta; as setas andam entre elas.
 * A partida, o modo e as estatísticas ficam no localStorage.
 */
(() => {
  const raiz = document.querySelector("section.truco");
  if (!raiz || typeof LogicaTruco !== "object") return;
  const T = LogicaTruco;

  const CHAVE_PARTIDA = "efs-truco-partida";
  const CHAVE_ESTATISTICAS = "efs-truco-estatisticas";
  const CHAVE_MODO = "efs-truco-modo";
  const NOMES = ["Você", "Tião", "Zé", "Cida"];
  const PAUSA_JOGADA = 720;
  const PAUSA_RESPOSTA = 950;
  const PAUSA_VAZA = 1250;
  const PAUSA_RECOLHER = 420;
  const PAUSA_MAO = 1900;
  const PAUSA_FIM = 1300;
  const PASSO_DISTRIBUICAO = 65;
  const TRAVA_DIALOGO_MS = 500;
  const TRAVA_ACAO_MS = 400;
  const MENSAGEM_MS = 3200;
  const FALA_MS = 1800;
  const ESCALA = { outros: 0.56, parceiroAberto: 0.74, vaza: 0.86, vira: 0.62, recolhida: 0.4 };
  const VIRA = 12;
  const reduzirMovimento = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  const mesa = raiz.querySelector("#tr-mesa");
  const textoPlacar = raiz.querySelector("#tr-placar");
  const textoValor = raiz.querySelector("#tr-valor");
  const rotuloValor = raiz.querySelector("#tr-valor-rotulo");
  const textoVazas = raiz.querySelector("#tr-vazas");
  const legenda = raiz.querySelector("#tr-legenda");
  const textoPartida = raiz.querySelector("#tr-partida");
  const acao = raiz.querySelector("#tr-acao");
  const acaoTitulo = raiz.querySelector("#tr-acao-titulo");
  const acaoTexto = raiz.querySelector("#tr-acao-texto");
  const acaoBotoes = raiz.querySelector("#tr-acao-botoes");
  const botaoTruco = raiz.querySelector("#tr-truco");
  const botaoCobrir = raiz.querySelector("#tr-cobrir");
  const botaoNova = raiz.querySelector("#tr-nova");
  const botoesModo = [...raiz.querySelectorAll("[data-modo]")];
  const status = raiz.querySelector("#tr-status");
  const estLista = raiz.querySelector("#tr-est-lista");
  const estModo = raiz.querySelector("#tr-est-modo");
  const botaoZerar = raiz.querySelector("#tr-zerar");
  const dialogo = raiz.querySelector("#tr-dialogo");
  const dialogoTitulo = raiz.querySelector("#tr-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#tr-dialogo-texto");
  const dialogoDados = raiz.querySelector("#tr-dialogo-dados");
  const dialogoBotoes = raiz.querySelector("#tr-dialogo-botoes");
  const caixaValor = textoValor.closest(".tr-dado");
  // Se sons.js não carregar, o jogo segue mudo e o botão some
  const som = typeof Sons === "object" ? Sons.criar("truco", raiz) : { tocar() {}, ligarBotao: (b) => b && (b.hidden = true) };

  let estado;
  let estatisticas = {};
  let vazasRecolhidas = 0;
  let maoAnunciada = 0;
  let fimMostrado = false;
  let mostrarParceiro = false;
  let cobrir = false;
  let distribuindo = false;
  let timer = null;
  let adiado = null;
  let foco = 0;
  let g = null;
  let posicoes = [];
  let vezAnunciada = "";
  let recordeNovo = false;

  // ---------- Elementos da mesa ----------

  const vagasEl = [0, 1, 2].map((k) => {
    const el = document.createElement("div");
    el.className = "tr-vaga";
    el.dataset.k = String(k);
    el.tabIndex = k === 0 ? 0 : -1;
    el.setAttribute("role", "button");
    return el;
  });
  const cartasEl = [...Array(13).keys()].map(() => {
    const el = document.createElement("div");
    el.className = "tr-carta fora";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<span class="tr-frente"></span><span class="tr-verso"></span>';
    el._face = null;
    el._alvo = null;
    return el;
  });
  const etiquetasEl = NOMES.map((nome, j) => {
    const el = document.createElement("div");
    el.className = `tr-nome${T.timeDe(j) === T.ELES ? " eles" : ""}`;
    el.textContent = nome;
    el.setAttribute("aria-hidden", "true");
    return el;
  });
  const baloesEl = NOMES.map((_, j) => {
    const el = document.createElement("div");
    el.className = `tr-balao tr-balao-${j}`;
    el.setAttribute("aria-hidden", "true");
    return el;
  });
  const rotuloVira = document.createElement("div");
  rotuloVira.className = "tr-rotulo-vira";
  rotuloVira.setAttribute("aria-hidden", "true");
  const anel = document.createElement("div");
  anel.className = "tr-anel";
  anel.hidden = true;
  // Aviso curto e visível sobre a mesa; o leitor de tela recebe o mesmo texto pelo status
  const mensagemEl = document.createElement("p");
  mensagemEl.className = "tr-mensagem";
  mensagemEl.setAttribute("aria-hidden", "true");
  mesa.replaceChildren(...vagasEl, ...cartasEl, ...etiquetasEl, ...baloesEl, rotuloVira, anel, mensagemEl);

  const modoAtual = () => (estado ? estado.modo : T.MODO_PADRAO);
  const regras = () => T.REGRAS[modoAtual()];
  const SIMBOLO_TEXTO = "︎";

  /** Nome da carta com o apelido, se for manilha: "Ás de espadas (espadilha)". */
  function nomeComApelido(id) {
    const apelido = T.apelidoManilha(estado, id);
    return apelido ? `${T.nomeCarta(id)} (manilha, ${apelido})` : T.nomeCarta(id);
  }

  function faceHtml(id) {
    const naipe = T.NAIPES[T.naipe(id)].id;
    const v = T.textoValor(id);
    const figura = ["Q", "J", "K"].includes(v);
    const centro = figura
      ? `<span class="tr-centro tr-figura">${v}</span>`
      : `<span class="tr-centro"><i class="tr-naipe tr-naipe-${naipe}"></i></span>`;
    return `<span class="tr-valor">${v}</span><i class="tr-naipe tr-naipe-${naipe} tr-naipe-canto"></i>${centro}`;
  }

  function mostrarFace(el, id) {
    if (el._face !== id) {
      el.firstElementChild.innerHTML = faceHtml(id);
      el.classList.toggle("vermelha", T.vermelha(id));
      el._face = id;
    }
    // A vira não é manilha; nas outras, a borda dourada marca as manilhas da mão
    el.classList.toggle("manilha", el !== cartasEl[VIRA] && T.ehManilha(estado, id));
    el.classList.add("aberta");
  }

  function esconderFace(el) {
    el.classList.remove("aberta", "vermelha", "manilha");
    el.firstElementChild.innerHTML = "";
    el._face = null;
  }

  function virarAnimado(el) {
    if (reduzirMovimento.matches) return;
    el.classList.remove("virando");
    void el.offsetWidth;
    el.classList.add("virando");
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
    if (!estado || estado.fim) return;
    gravar(CHAVE_PARTIDA, estado);
  }

  // ---------- Medidas da mesa ----------

  function medir() {
    const W = mesa.clientWidth || 340;
    const estreita = W < 540;
    const janela = window.innerHeight || 800;
    const H = estreita ? Math.round(Math.min(Math.max(W * 1.18, 380), 480)) : Math.round(Math.min(Math.max(janela - 340, 360), 450));
    const cw = Math.round(Math.max(44, Math.min(estreita ? W * 0.185 : W * 0.1, 78, H * 0.165)));
    const ch = Math.round(cw * 1.4);
    const margem = Math.max(8, Math.round(W * 0.02));
    const pequena = { w: cw * ESCALA.outros, h: ch * ESCALA.outros };
    const vaza = { w: cw * ESCALA.vaza, h: ch * ESCALA.vaza };
    const etiquetaParceiro = margem + pequena.h + 14;
    const topoMao = H - margem - ch;
    const centro = { x: W / 2, y: Math.round((etiquetaParceiro + 12 + topoMao) / 2) };
    g = {
      W,
      H,
      cw,
      ch,
      margem,
      pequena,
      vaza,
      centro,
      passoMao: cw + Math.max(6, Math.round(cw * 0.12)),
      maoY: H - margem - ch / 2,
      topoMao,
      parceiroY: margem + pequena.h / 2,
      etiquetaParceiro,
      ladoY: centro.y - 6,
      ladoX: [0, W - margem - pequena.h / 2, 0, margem + pequena.h / 2],
      dx: vaza.w + 6,
      dy: Math.round(vaza.h * 0.55),
    };
    mesa.style.height = `${H}px`;
    mesa.style.setProperty("--cw", `${cw}px`);
    mesa.style.setProperty("--ch", `${ch}px`);
  }

  /** Centro da área de cada jogador: de onde as cartas saem e para onde a vaza ganha vai. */
  function ancora(j) {
    if (j === 0) return { x: g.W / 2, y: g.maoY };
    if (j === 2) return { x: g.W / 2, y: g.parceiroY };
    return { x: g.ladoX[j], y: g.ladoY };
  }

  /** Elementos das cartas que [j] ainda tem, na ordem em que aparecem (as suas, da mais fraca para a mais forte). */
  function naMao(j) {
    const m = estado.mao;
    const lista = m.distribuidas[j].map((id, k) => ({ id, i: j * 3 + k })).filter((c) => m.cartas[j].includes(c.id));
    if (j === 0 && m.especial !== "ferro") lista.sort((a, b) => T.forca(estado, a.id) - T.forca(estado, b.id) || a.id - b.id);
    return lista;
  }

  const OFFSET_VAZA = [
    [0, 1, -3],
    [1, 0, 5],
    [0, -1, 2],
    [-1, 0, -5],
  ];

  function calcularPosicoes() {
    const m = estado.mao;
    const pos = new Array(13);
    const suaVezAgora = podeAgir();
    const ferro = m.especial === "ferro";
    for (let j = 0; j < 4; j++) {
      const lista = naMao(j);
      const n = lista.length;
      lista.forEach(({ id, i }, idx) => {
        const meio = idx - (n - 1) / 2;
        if (j === 0) {
          pos[i] = { id, x: g.W / 2 + meio * g.passoMao, y: g.maoY, s: 1, r: 0, z: 300 + idx, aberta: !ferro, jogavel: suaVezAgora, aCobrir: suaVezAgora && cobrir };
        } else if (j === 2) {
          const aberto = mostrarParceiro;
          const s = aberto ? ESCALA.parceiroAberto : ESCALA.outros;
          const passo = aberto ? g.cw * s + 6 : g.pequena.w * 0.62;
          pos[i] = { id, x: g.W / 2 + meio * passo, y: g.margem + (g.ch * s) / 2, s, r: 0, z: 100 + idx, aberta: aberto };
        } else {
          pos[i] = { id, x: g.ladoX[j], y: g.ladoY + meio * g.pequena.w * 0.5, s: ESCALA.outros, r: 90, z: 100 + idx, aberta: false };
        }
      });
    }
    m.vazas.forEach((v, t) => {
      v.cartas.forEach((c, ordem) => {
        const i = c.jogador * 3 + m.distribuidas[c.jogador].indexOf(c.carta);
        if (t < vazasRecolhidas) {
          const alvo = v.vencedor === T.EMPATE ? g.centro : ancora(v.ganhador);
          pos[i] = { id: c.carta, x: alvo.x, y: alvo.y, s: ESCALA.recolhida, r: 0, z: 40 + ordem, aberta: false, recolhida: true };
        } else {
          const [ox, oy, rot] = OFFSET_VAZA[c.jogador];
          const vencedora = v.vencedor !== null && v.vencedor !== T.EMPATE && c.jogador === v.ganhador;
          pos[i] = {
            id: c.carta,
            x: g.centro.x + ox * g.dx,
            y: g.centro.y + oy * g.dy,
            s: ESCALA.vaza,
            r: rot,
            z: 500 + ordem,
            aberta: !c.coberta,
            vencedora,
          };
        }
      });
    });
    if (m.vira !== null) {
      const w = g.cw * ESCALA.vira;
      const h = g.ch * ESCALA.vira;
      pos[VIRA] = { id: m.vira, x: g.margem + 4 + w / 2, y: g.margem + h / 2, s: ESCALA.vira, r: 0, z: 20, aberta: true };
    } else {
      pos[VIRA] = { id: null, x: g.margem, y: g.margem, s: ESCALA.vira, r: 0, z: 20, aberta: false, fora: true };
    }
    return pos;
  }

  // ---------- Desenho ----------

  /** [atrasos]: espera, em milissegundos, antes de cada carta começar a andar. */
  function desenhar({ animar = true, atrasos = null } = {}) {
    if (!estado) return;
    if (!g) medir();
    const anteriores = posicoes;
    posicoes = calcularPosicoes();
    const semAnimacao = !animar || reduzirMovimento.matches;
    mesa.classList.toggle("sem-animacao", semAnimacao);
    posicoes.forEach((p, i) => {
      const el = cartasEl[i];
      const antes = anteriores[i];
      const mudou = !antes || antes.x !== p.x || antes.y !== p.y || antes.s !== p.s;
      const anda = mudou && Boolean(antes) && !semAnimacao;
      const atraso = !semAnimacao && atrasos ? atrasos.get(i) || 0 : 0;
      el.style.transitionDelay = atraso ? `${atraso}ms` : "";
      el.style.translate = `${Math.round(p.x - g.cw / 2)}px ${Math.round(p.y - g.ch / 2)}px`;
      el.style.scale = String(p.s);
      el.style.rotate = `${p.r}deg`;
      // A carta que anda passa por cima das outras durante o caminho
      el.style.zIndex = String(anda ? 1000 + p.z : p.z);
      clearTimeout(el._z);
      if (anda) el._z = setTimeout(() => (el.style.zIndex = String(posicoes[i].z)), 360 + atraso);
      el.classList.toggle("fora", Boolean(p.fora));
      el.classList.toggle("recolhida", Boolean(p.recolhida));
      el.classList.toggle("jogavel", Boolean(p.jogavel));
      el.classList.toggle("a-cobrir", Boolean(p.aCobrir));
      el.classList.toggle("vencedora", Boolean(p.vencedora));
      const alvo = p.aberta ? p.id : null;
      if (alvo === el._alvo && (alvo === null || el._face === alvo || el._pendente === alvo)) return;
      el._alvo = alvo;
      el._pendente = null;
      clearTimeout(el._v);
      if (alvo === null) {
        esconderFace(el);
        return;
      }
      // A carta que vai abrir mostra o verso no caminho e vira quando chega
      const abrir = () => {
        el._pendente = null;
        if (el._alvo !== alvo) return;
        mostrarFace(el, alvo);
        if (!semAnimacao) virarAnimado(el);
      };
      if (anda || atraso) {
        el._pendente = alvo;
        el._v = setTimeout(abrir, atraso + 170);
      } else {
        abrir();
      }
    });
    if (semAnimacao) requestAnimationFrame(() => mesa.classList.remove("sem-animacao"));
    posicionarEtiquetas();
    desenharPainel();
    desenharVagas();
  }

  function posicionarEtiquetas() {
    const m = estado.mao;
    const n0 = Math.max(1, m.cartas[0].length);
    const larguraMao = (n0 - 1) * g.passoMao + g.cw;
    const larguraNome = etiquetasEl[0].offsetWidth || 50;
    const xVoce = Math.max(g.margem + larguraNome / 2, g.W / 2 - larguraMao / 2 - 10 - larguraNome / 2);
    const altoParceiro = mostrarParceiro ? g.margem + g.ch * ESCALA.parceiroAberto + 14 : g.etiquetaParceiro;
    const lugares = [
      { x: xVoce, y: g.maoY },
      { x: g.ladoX[1], y: g.ladoY + g.pequena.w + 16 },
      { x: g.W / 2, y: altoParceiro },
      { x: g.ladoX[3], y: g.ladoY + g.pequena.w + 16 },
    ];
    const daVez = T.emAndamento(estado) && !distribuindo && vazasRecolhidas === T.vazasCompletas(m).length ? m.vez : -1;
    etiquetasEl.forEach((el, j) => {
      // Na borda, o nome não sai da mesa
      const meia = (el.offsetWidth || 50) / 2;
      const x = Math.min(Math.max(lugares[j].x, g.margem + meia), g.W - g.margem - meia);
      el.style.translate = `${Math.round(x)}px ${Math.round(lugares[j].y)}px`;
      el.classList.toggle("vez", j === daVez);
    });
    const balao = [
      { x: g.W / 2, y: g.topoMao - 8 },
      { x: g.W - g.margem, y: g.ladoY - g.pequena.w - 4 },
      { x: g.W / 2, y: altoParceiro + 14 },
      { x: g.margem, y: g.ladoY - g.pequena.w - 4 },
    ];
    baloesEl.forEach((el, j) => (el.style.translate = `${Math.round(balao[j].x)}px ${Math.round(balao[j].y)}px`));
    const vira = m.vira !== null;
    rotuloVira.hidden = !vira;
    if (vira) {
      const w = g.cw * ESCALA.vira;
      rotuloVira.textContent = "Vira";
      rotuloVira.style.translate = `${Math.round(g.margem + 4 + w / 2)}px ${Math.round(g.margem + g.ch * ESCALA.vira + 3)}px`;
    }
    mensagemEl.style.top = `${g.centro.y}px`;
  }

  function textoNaipe(id) {
    const n = T.NAIPES[T.naipe(id)];
    return `<span class="${n.vermelho ? "naipe-vermelho" : ""}">${n.simbolo}${SIMBOLO_TEXTO}</span>`;
  }
  const curta = (id) => `${T.textoValor(id)}${textoNaipe(id)}`;

  /** Placar, valor da mão, vazas, legenda das manilhas, número da partida e botões. */
  function desenharPainel() {
    const m = estado.mao;
    const r = regras();
    textoPlacar.textContent = `${estado.placar[0]} x ${estado.placar[1]}`;
    textoPlacar.setAttribute("aria-label", `Nós ${estado.placar[0]}, Eles ${estado.placar[1]}`);
    rotuloValor.textContent = m.especial === "ferro" ? "Mão de ferro" : m.especial === "onze" ? r.nomeEspecial : "A mão vale";
    textoValor.textContent = m.pedido ? `${m.valor} → ${m.pedido.valor}?` : String(m.valor);
    caixaValor.classList.toggle("pedindo", Boolean(m.pedido));
    const resultados = T.resultadosDasVazas(m);
    const marcas = [0, 1, 2].map((t) => {
      const v = resultados[t];
      const i = document.createElement("i");
      if (v === undefined) {
        i.className = "vazia";
        i.textContent = "·";
      } else if (v === T.EMPATE) {
        i.className = "empate";
        i.textContent = "=";
      } else {
        i.className = v === T.NOS ? "ganhou" : "perdeu";
        i.textContent = v === T.NOS ? "✓" : "✗";
      }
      return i;
    });
    textoVazas.replaceChildren(...marcas);
    const descricao = resultados.length
      ? resultados.map((v, t) => `${t + 1}ª ${v === T.EMPATE ? "empatada" : v === T.NOS ? "de Nós" : "de Eles"}`).join(", ")
      : "nenhuma vaza jogada";
    textoVazas.setAttribute("aria-label", `Vazas: ${descricao}`);
    if (estado.modo === "paulista") {
      legenda.innerHTML =
        `Vira: <strong>${curta(m.vira)}</strong> · manilhas: ` +
        T.manilhasDaMao(estado)
          .map((id) => `<strong>${curta(id)}</strong>`)
          .join(" > ");
    } else {
      legenda.innerHTML =
        "Manilhas fixas: " +
        T.manilhasDaMao(estado)
          .map((id) => `<strong>${curta(id)}</strong> ${T.apelidoManilha(estado, id)}`)
          .join(" · ");
    }
    textoPartida.textContent = `Partida nº ${T.formatarNumero(estado.semente)} · Truco ${T.textoModo(estado.modo)} · mão ${estado.numeroMao} · ${
      NOMES[m.carteador] === "Você" ? "você deu as cartas" : `${NOMES[m.carteador]} deu as cartas`
    }`;
    for (const botao of botoesModo) {
      const ativo = botao.dataset.modo === estado.modo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    desenharBotoes();
  }

  function desenharBotoes() {
    const pode = podeAgir();
    const pedir = pode && T.podePedir(estado, 0);
    const focado = document.activeElement;
    botaoTruco.classList.toggle("oculto", !pedir);
    botaoTruco.disabled = !pedir;
    if (pedir) {
      const novo = T.proximoValor(estado.modo, estado.mao.valor);
      botaoTruco.innerHTML = `${T.nomePedido(estado.modo, novo)}! <small>vale ${novo}</small>`;
      botaoTruco.setAttribute("aria-label", `Pedir ${T.nomePedido(estado.modo, novo).toLowerCase()}: a mão passa a valer ${novo}`);
    }
    const podeCobrir = pode && T.podeCobrir(estado, 0);
    if (!podeCobrir) cobrir = false;
    botaoCobrir.disabled = !podeCobrir;
    botaoCobrir.setAttribute("aria-pressed", String(cobrir));
    // O botão que sumiu levava o foco: ele volta para as suas cartas
    if ((focado === botaoTruco || focado === botaoCobrir) && focado.disabled) vagasEl[foco].focus({ preventScroll: true });
  }

  // ---------- Suas cartas e foco do teclado ----------

  function desenharVagas() {
    const lista = naMao(0);
    const ferro = estado.mao.especial === "ferro";
    const pode = podeAgir();
    if (foco >= Math.max(1, lista.length)) foco = Math.max(0, lista.length - 1);
    vagasEl.forEach((el, k) => {
      const c = lista[k];
      el.hidden = !c && !(k === 0 && !lista.length);
      el.tabIndex = k === foco ? 0 : -1;
      if (!c) {
        el.style.translate = `${Math.round(g.W / 2 - g.cw / 2)}px ${Math.round(g.topoMao)}px`;
        el.setAttribute("aria-label", "Você não tem mais cartas nesta mão.");
        return;
      }
      const p = posicoes[c.i];
      el.style.translate = `${Math.round(p.x - g.cw / 2)}px ${Math.round(p.y - g.ch / 2)}px`;
      const nome = ferro ? `carta ${k + 1} de ${lista.length}, virada para baixo (mão de ferro)` : nomeComApelido(c.id);
      el.setAttribute("aria-label", `Sua carta: ${nome}${pode ? (cobrir ? ". Enter joga coberta." : ". Enter joga.") : "."}`);
    });
    atualizarAnel();
  }

  function atualizarAnel(mover = false) {
    const el = vagasEl[foco];
    if (mover) el.focus({ preventScroll: true });
    const ativo = document.activeElement === el && el.matches(":focus-visible") && !el.hidden;
    anel.hidden = !ativo;
    if (!ativo) return;
    const lista = naMao(0);
    const c = lista[foco];
    const p = c ? posicoes[c.i] : { x: g.W / 2, y: g.maoY };
    anel.style.translate = `${Math.round(p.x - g.cw / 2)}px ${Math.round(p.y - g.ch / 2)}px`;
    anel.style.width = `${g.cw}px`;
    anel.style.height = `${g.ch}px`;
  }

  // ---------- Avisos ----------

  let mensagemTimer = null;

  function anunciar(texto) {
    status.textContent = texto;
  }

  /** Mostra um aviso sobre a mesa e manda o mesmo texto para o leitor de tela. */
  function avisar(texto, duracao = MENSAGEM_MS) {
    anunciar(texto);
    mensagemEl.textContent = texto;
    mensagemEl.classList.add("visivel");
    clearTimeout(mensagemTimer);
    mensagemTimer = setTimeout(() => mensagemEl.classList.remove("visivel"), duracao);
  }

  function esconderAviso() {
    clearTimeout(mensagemTimer);
    mensagemEl.classList.remove("visivel");
  }

  /** Balão de fala de um jogador ("Truco!", "Desce!", "Corri"). */
  function falar(j, texto) {
    const el = baloesEl[j];
    el.textContent = texto;
    el.classList.add("visivel");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("visivel"), FALA_MS);
  }

  function calarTodos() {
    for (const el of baloesEl) {
      clearTimeout(el._t);
      el.classList.remove("visivel");
    }
  }

  // ---------- Pedido de truco e mão de onze: o aviso com botões abaixo da mesa ----------

  function abrirAcao({ titulo, texto, botoes }) {
    acaoTitulo.textContent = titulo;
    acaoTexto.textContent = texto;
    acaoBotoes.replaceChildren(
      ...botoes.map(({ rotulo, rotuloLongo, funcao, secundario }) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = secundario ? "button secondary" : "button";
        botao.textContent = rotulo;
        if (rotuloLongo) botao.setAttribute("aria-label", rotuloLongo);
        botao.addEventListener("click", () => {
          // A trava vale também para o teclado (Enter repetido logo que o aviso aparece)
          if (acao.classList.contains("travado")) return;
          fecharAcao();
          funcao();
        });
        return botao;
      }),
    );
    const tinhaFoco = raiz.contains(document.activeElement) && document.activeElement !== document.body;
    acao.hidden = false;
    acao.classList.add("travado");
    setTimeout(() => acao.classList.remove("travado"), TRAVA_ACAO_MS);
    if (tinhaFoco) acaoBotoes.firstElementChild.focus({ preventScroll: true });
    // O aviso pode ficar abaixo da dobra: rola só o necessário para ele aparecer inteiro
    // (+6 px da animação de entrada, que começa um pouco acima da posição final).
    const falta = acao.getBoundingClientRect().bottom + 6 + 10 - window.innerHeight;
    if (falta > 0) window.scrollBy({ top: falta, behavior: reduzirMovimento.matches ? "auto" : "smooth" });
    anunciar(`${titulo} ${texto}`);
  }

  function fecharAcao() {
    const tinhaFoco = acao.contains(document.activeElement);
    acao.hidden = true;
    if (tinhaFoco) vagasEl[foco].focus({ preventScroll: true });
  }

  function abrirPedido() {
    const p = estado.mao.pedido;
    const nome = T.nomePedido(estado.modo, p.valor);
    const proximo = T.podeAumentar(estado) ? T.proximoValor(estado.modo, p.valor) : null;
    const botoes = [
      { rotulo: "Aceitar", rotuloLongo: `Aceitar: a mão vale ${p.valor}`, funcao: () => suaResposta("aceitar") },
      { rotulo: "Correr", rotuloLongo: `Correr: Eles ganham ${p.anterior}`, funcao: () => suaResposta("correr"), secundario: true },
    ];
    if (proximo !== null) {
      const nomeProximo = T.nomePedido(estado.modo, proximo);
      botoes.push({
        rotulo: `${nomeProximo}!`,
        rotuloLongo: `Pedir ${nomeProximo.toLowerCase()}: a mão passa a valer ${proximo}`,
        funcao: () => suaResposta("aumentar"),
      });
    }
    abrirAcao({
      titulo: `Eles pediram ${nome.toLowerCase()}!`,
      texto: `Aceitando, a mão vale ${p.valor}. Correndo, Eles ganham ${p.anterior} ${p.anterior === 1 ? "ponto" : "pontos"}.${
        proximo !== null ? ` Ou peça ${T.nomePedido(estado.modo, proximo).toLowerCase()}.` : ""
      }`,
      botoes,
    });
  }

  function abrirDecisaoEspecial() {
    const r = regras();
    mostrarParceiro = true;
    desenhar();
    const titulo = r.limiteEspecial === 11 ? "Mão de onze!" : "Mão de dez!";
    abrirAcao({
      titulo,
      texto: `Vocês têm ${r.limiteEspecial} pontos. Vejam as cartas do Zé, no alto, e decidam: jogando, a mão vale ${r.valorEspecial}; correndo, Eles ganham ${r.correrEspecial}.`,
      botoes: [
        { rotulo: "Jogar a mão", rotuloLongo: `Jogar a mão valendo ${r.valorEspecial}`, funcao: () => suaDecisaoEspecial(true) },
        { rotulo: "Correr", rotuloLongo: `Correr: Eles ganham ${r.correrEspecial}`, funcao: () => suaDecisaoEspecial(false), secundario: true },
      ],
    });
  }

  // ---------- Diálogo ----------

  let aoCancelarDialogo = null;

  function abrirDialogo({ titulo, texto, dados = [], botoes, aoCancelar }) {
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
    dialogoBotoes.replaceChildren(
      ...botoes.map(({ rotulo, funcao, secundario }) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = secundario ? "button secondary" : "button";
        botao.textContent = rotulo;
        botao.addEventListener("click", () => {
          if (dialogo.classList.contains("travado")) return;
          fecharDialogo();
          funcao();
        });
        return botao;
      }),
    );
    aoCancelarDialogo = aoCancelar || null;
    if (!dialogo.open) dialogo.showModal();
    dialogo.classList.add("travado");
    setTimeout(() => dialogo.classList.remove("travado"), TRAVA_DIALOGO_MS);
    anunciar(`${titulo}. ${texto}`);
  }

  function fecharDialogo() {
    aoCancelarDialogo = null;
    if (dialogo.open) dialogo.close();
  }

  dialogo.addEventListener("cancel", (evento) => {
    evento.preventDefault();
    const f = aoCancelarDialogo;
    fecharDialogo();
    f?.();
  });

  // ---------- Fluxo da partida ----------

  /** Você pode jogar ou pedir agora: é a sua vez e nada está andando na mesa. */
  function podeAgir() {
    if (!estado || distribuindo || !T.emAndamento(estado)) return false;
    return estado.mao.vez === 0 && vazasRecolhidas === T.vazasCompletas(estado.mao).length && !dialogo.open;
  }

  /** Espera [ms] e chama [fn]; com a aba escondida, a partida para e continua quando você voltar. */
  function agendar(fn, ms) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (document.visibilityState === "hidden") {
        adiado = fn;
        return;
      }
      fn();
    }, ms);
  }

  function pararFluxo() {
    clearTimeout(timer);
    timer = null;
    adiado = null;
  }

  /** Decide o próximo passo: recolher a vaza, fechar a mão, esperar você ou fazer o computador jogar. */
  function avancar() {
    if (!estado || dialogo.open) return;
    if (distribuindo) {
      // A espera do fim da distribuição foi cancelada (por um diálogo): as cartas já chegaram
      distribuindo = false;
      desenhar({ animar: false });
    }
    const m = estado.mao;
    if (vazasRecolhidas < T.vazasCompletas(m).length) {
      agendar(recolher, PAUSA_VAZA);
      return;
    }
    if (m.resultado) {
      if (maoAnunciada !== estado.numeroMao) {
        maoAnunciada = estado.numeroMao;
        anunciarResultado();
        agendar(avancar, estado.fim ? PAUSA_FIM : PAUSA_MAO);
        return;
      }
      if (estado.fim) {
        if (!fimMostrado) concluir();
        return;
      }
      agendar(novaMao, 0);
      return;
    }
    if (m.decisao) {
      if (m.timeEspecial === T.NOS) {
        if (acao.hidden) abrirDecisaoEspecial();
      } else {
        agendar(decisaoDoComputador, PAUSA_RESPOSTA);
      }
      return;
    }
    if (m.pedido) {
      if (T.quemResponde(estado) === T.NOS) {
        if (acao.hidden) abrirPedido();
      } else {
        agendar(respostaDoComputador, PAUSA_RESPOSTA);
      }
      return;
    }
    if (m.vez === 0) {
      suaVez();
      return;
    }
    agendar(() => jogadaDoComputador(m.vez), PAUSA_JOGADA);
  }

  function suaVez() {
    desenhar();
    const chave = `${estado.numeroMao}-${estado.mao.acoes.length}`;
    if (vezAnunciada === chave) return;
    vezAnunciada = chave;
    const m = estado.mao;
    const vaza = T.vazaAtual(m);
    const naMesa = vaza ? vaza.cartas.filter((c) => !c.coberta).map((c) => `${NOMES[c.jogador]}: ${T.nomeCarta(c.carta)}`) : [];
    anunciar(`Sua vez${naMesa.length ? `. Na mesa, ${naMesa.join("; ")}` : ""}.`);
  }

  /** Troca o estado pela jogada feita e segue a partida. */
  function aplicar(novo) {
    const completasAntes = T.vazasCompletas(estado.mao).length;
    const acabou = !estado.fim && novo.fim;
    estado = novo;
    if (acabou) registrarFim();
    else salvar();
    desenhar();
    const completas = T.vazasCompletas(estado.mao);
    if (completas.length > completasAntes) anunciarVaza(completas.length - 1);
    avancar();
  }

  function anunciarVaza(t) {
    const v = estado.mao.vazas[t];
    const ordem = `${t + 1}ª vaza`;
    if (v.vencedor === T.EMPATE) {
      anunciar(`A ${ordem} empatou.`);
    } else {
      const carta = v.cartas.find((c) => c.jogador === v.ganhador).carta;
      const quem = v.ganhador === 0 ? "Você fez" : `${NOMES[v.ganhador]} fez`;
      anunciar(`${quem} a ${ordem} com ${T.nomeCarta(carta)}: ${v.vencedor === T.NOS ? "ponto para Nós" : "ponto para Eles"}.`);
      if (v.vencedor === T.NOS) som.tocar("acerto");
    }
  }

  function recolher() {
    vazasRecolhidas = T.vazasCompletas(estado.mao).length;
    desenhar();
    som.tocar("deslizar");
    agendar(avancar, PAUSA_RECOLHER);
  }

  function anunciarResultado() {
    const r = estado.mao.resultado;
    const pts = (n) => `${n} ${n === 1 ? "ponto" : "pontos"}`;
    let texto;
    if (r.vencedor === T.EMPATE) texto = "As três vazas empataram: ninguém marca nesta mão.";
    else if (r.motivo === "correu") texto = r.vencedor === T.NOS ? `Eles correram: Nós ganhamos ${pts(r.pontos)}.` : `Nós corremos: Eles ganham ${pts(r.pontos)}.`;
    else if (r.motivo === "correu-especial")
      texto = r.vencedor === T.NOS ? `Eles correram da ${regras().nomeEspecial}: Nós ganhamos ${pts(r.pontos)}.` : `Nós corremos: Eles ganham ${pts(r.pontos)}.`;
    else texto = r.vencedor === T.NOS ? `Nós ganhamos a mão: +${pts(r.pontos)}.` : `Eles ganharam a mão: +${pts(r.pontos)}.`;
    avisar(`${texto} Placar: Nós ${estado.placar[0]} x ${estado.placar[1]} Eles.`, PAUSA_MAO + 200);
    if (r.vencedor === T.NOS && !estado.fim) som.tocar("completo");
  }

  /** Recolhe as cartas para quem vai dar e distribui a mão seguinte, uma a uma. */
  function novaMao() {
    const novo = T.proximaMao(estado);
    if (!novo) return;
    calarTodos();
    esconderAviso();
    estado = novo;
    vazasRecolhidas = 0;
    mostrarParceiro = false;
    cobrir = false;
    salvar();
    const espera = animarDistribuicao();
    som.tocar("embaralhar");
    const m = estado.mao;
    let texto = `Mão ${estado.numeroMao}: ${m.carteador === 0 ? "você deu as cartas" : `${NOMES[m.carteador]} deu as cartas`}.`;
    if (estado.modo === "paulista") texto += ` Vira ${T.nomeCarta(m.vira)}: manilha ${T.VALORES[T.valorManilha(m.vira)]}.`;
    anunciar(texto);
    agendar(() => {
      distribuindo = false;
      desenhar();
      if (m.especial === "ferro") {
        avisar("Mão de ferro: ninguém vê as próprias cartas. Quem ganhar esta mão vence a partida.", 4200);
        agendar(avancar, 1600);
        return;
      }
      if (m.especial === "onze" && m.timeEspecial === T.ELES) avisar(`Eles estão na ${regras().nomeEspecial} e vão decidir se jogam.`, 2400);
      avancar();
    }, espera);
  }

  /** As cartas saem de quem dá, uma por vez, no sentido do jogo; a vira vem por último. */
  function animarDistribuicao() {
    distribuindo = true;
    const m = estado.mao;
    if (reduzirMovimento.matches) {
      posicoes = [];
      desenhar({ animar: false });
      return 300;
    }
    const origem = ancora(m.carteador);
    mesa.classList.add("sem-animacao");
    for (const el of cartasEl) {
      el._alvo = null;
      clearTimeout(el._v);
      esconderFace(el);
      el.classList.remove("fora", "recolhida", "vencedora", "jogavel");
      el.style.transitionDelay = "";
      el.style.translate = `${Math.round(origem.x - g.cw / 2)}px ${Math.round(origem.y - g.ch / 2)}px`;
      el.style.scale = String(ESCALA.recolhida);
      el.style.rotate = "0deg";
    }
    void mesa.offsetWidth;
    mesa.classList.remove("sem-animacao");
    const atrasos = new Map();
    for (let i = 0; i < 12; i++) {
      const j = (m.carteador + 1 + i) % 4;
      atrasos.set(j * 3 + Math.floor(i / 4), i * PASSO_DISTRIBUICAO);
    }
    atrasos.set(VIRA, 12 * PASSO_DISTRIBUICAO);
    posicoes = cartasEl.map(() => ({ x: origem.x, y: origem.y, s: ESCALA.recolhida }));
    desenhar({ atrasos });
    return 13 * PASSO_DISTRIBUICAO + 380;
  }

  // ---------- Jogadas do computador ----------

  function jogadaDoComputador(j) {
    if (!estado || !T.emAndamento(estado) || estado.mao.vez !== j || j === 0) {
      avancar();
      return;
    }
    if (T.querPedir(estado, j)) {
      const novo = T.pedir(estado, j);
      const nome = T.nomePedido(estado.modo, novo.mao.pedido.valor);
      falar(j, `${nome}!`);
      som.tocar("dica");
      anunciar(`${NOMES[j]} pediu ${nome.toLowerCase()}.`);
      aplicar(novo);
      return;
    }
    const { carta, coberta } = T.escolherCarta(estado, j);
    const novo = T.jogar(estado, j, carta, coberta);
    if (!novo) return;
    som.tocar("pousar");
    anunciar(`${NOMES[j]} jogou ${coberta ? "uma carta coberta" : nomeComApelido(carta)}.`);
    aplicar(novo);
  }

  function respostaDoComputador() {
    const time = T.quemResponde(estado);
    if (time === null || time === T.NOS) {
      avancar();
      return;
    }
    const { resposta, jogador } = T.respostaDaIA(estado, time);
    const novo = T.responder(estado, time, resposta, resposta === "aumentar" ? jogador : null);
    if (!novo) return;
    if (resposta === "aceitar") {
      falar(jogador, "Desce!");
      anunciar(`${NOMES[jogador]}: desce! Eles aceitaram, e a mão vale ${novo.mao.valor}.`);
    } else if (resposta === "correr") {
      falar(jogador, "Corri");
      som.tocar("acerto");
      anunciar(`${NOMES[jogador]}: corri.`);
    } else {
      const nome = T.nomePedido(estado.modo, novo.mao.pedido.valor);
      falar(jogador, `${nome}!`);
      som.tocar("dica");
    }
    aplicar(novo);
  }

  function decisaoDoComputador() {
    if (!estado.mao.decisao || estado.mao.timeEspecial !== T.ELES) {
      avancar();
      return;
    }
    const jogar = T.decisaoEspecialDaIA(estado);
    const quem = estado.mao.vez % 2 === 1 ? estado.mao.vez : (estado.mao.vez + 1) % 4;
    falar(quem, jogar ? "Vamos jogar!" : "Corremos");
    const novo = T.decidirEspecial(estado, jogar);
    if (jogar) avisar(`Eles vão jogar a ${regras().nomeEspecial}: a mão vale ${regras().valorEspecial}.`, 2600);
    aplicar(novo);
  }

  // ---------- Suas jogadas ----------

  function marcarIniciado(novo) {
    return novo.iniciado ? novo : { ...novo, iniciado: true };
  }

  /** Explica por que a carta não saiu agora. */
  function porQueNao() {
    const m = estado.mao;
    if (estado.fim) return "A partida acabou. Toque em Nova partida para jogar outra.";
    if (m.resultado) return "A mão acabou. Espere as cartas da próxima.";
    if (m.decisao) return m.timeEspecial === T.NOS ? "Primeiro decida se vocês jogam esta mão." : "Espere Eles decidirem a mão.";
    if (m.pedido) return T.quemResponde(estado) === T.NOS ? "Primeiro responda ao pedido, abaixo da mesa." : "Espere a resposta deles ao pedido.";
    if (distribuindo) return "Espere as cartas chegarem.";
    if (m.vez !== 0) return `Espere a sua vez: agora joga ${NOMES[m.vez] === "Zé" ? "o Zé" : NOMES[m.vez] === "Cida" ? "a Cida" : "o Tião"}.`;
    return "Espere a vaza ser recolhida.";
  }

  function jogarSuaCarta(k) {
    if (!estado) return;
    const lista = naMao(0);
    const c = lista[k];
    if (!c) return;
    if (!podeAgir()) {
      som.tocar("erro");
      avisar(porQueNao());
      return;
    }
    const coberta = cobrir && T.podeCobrir(estado, 0);
    const novo = T.jogar(estado, 0, c.id, coberta);
    if (!novo) return;
    cobrir = false;
    som.tocar("pousar");
    esconderAviso();
    anunciar(`Você jogou ${coberta ? `${T.nomeCarta(c.id)}, coberta` : nomeComApelido(c.id)}.`);
    foco = Math.min(foco, Math.max(0, lista.length - 2));
    aplicar(marcarIniciado(novo));
  }

  function pedirTruco() {
    if (!podeAgir() || !T.podePedir(estado, 0)) return;
    const novo = T.pedir(estado, 0);
    const nome = T.nomePedido(estado.modo, novo.mao.pedido.valor);
    falar(0, `${nome}!`);
    som.tocar("dica");
    anunciar(`Você pediu ${nome.toLowerCase()}. Esperando a resposta deles.`);
    aplicar(marcarIniciado(novo));
  }

  function suaResposta(resposta) {
    if (!estado || T.quemResponde(estado) !== T.NOS) return;
    const novo = T.responder(estado, T.NOS, resposta, resposta === "aumentar" ? 0 : null);
    if (!novo) return;
    if (resposta === "aceitar") {
      falar(0, "Desce!");
      anunciar(`Você aceitou: a mão vale ${novo.mao.valor}.`);
    } else if (resposta === "correr") {
      falar(0, "Corri");
    } else {
      const nome = T.nomePedido(estado.modo, novo.mao.pedido.valor);
      falar(0, `${nome}!`);
      som.tocar("dica");
      anunciar(`Você pediu ${nome.toLowerCase()}.`);
    }
    aplicar(marcarIniciado(novo));
  }

  function suaDecisaoEspecial(jogar) {
    if (!estado || !estado.mao.decisao || estado.mao.timeEspecial !== T.NOS) return;
    const novo = T.decidirEspecial(estado, jogar);
    if (!novo) return;
    mostrarParceiro = false;
    falar(0, jogar ? "Vamos jogar!" : "Corremos");
    aplicar(marcarIniciado(novo));
  }

  // ---------- Fim da partida e estatísticas ----------

  /** A partida acabou: soma nas estatísticas na hora (o diálogo vem depois da última vaza). */
  function registrarFim() {
    gravar(CHAVE_PARTIDA, null);
    const venceu = estado.fim.vencedor === T.NOS;
    const { estatisticas: novas, recordes } = T.registrarResultado(estatisticas[estado.modo], { venceu, trucos: estado.trucosGanhos });
    estatisticas = { ...estatisticas, [estado.modo]: novas };
    gravar(CHAVE_ESTATISTICAS, estatisticas);
    desenharEstatisticas();
    recordeNovo = recordes.sequencia;
  }

  function concluir() {
    fimMostrado = true;
    const venceu = estado.fim.vencedor === T.NOS;
    const est = estatisticas[estado.modo];
    const dados = [
      ["Placar final", `Nós ${estado.placar[0]} x ${estado.placar[1]} Eles`],
      ["Mãos jogadas", T.formatarNumero(estado.numeroMao)],
      ["Trucos ganhos nesta partida", T.formatarNumero(estado.trucosGanhos)],
    ];
    if (venceu && recordeNovo) dados.push(["Nova maior sequência!", T.formatarNumero(est.sequencia), true]);
    dados.push(["Vitórias seguidas", T.formatarNumero(est.sequencia)]);
    const { semente, modo } = estado;
    if (venceu) {
      let k = 0;
      for (const el of cartasEl) el.style.setProperty("--k", String(k++ % 8));
      mesa.classList.add("tr-festa");
      setTimeout(() => mesa.classList.remove("tr-festa"), 2200);
    }
    som.tocar(venceu ? "vitoria" : "derrota");
    abrirDialogo({
      titulo: venceu ? "Vocês venceram!" : "Eles venceram",
      texto: venceu
        ? `Você e o Zé fizeram os 12 tentos no Truco ${T.textoModo(modo)}.`
        : `O Tião e a Cida chegaram aos 12 tentos no Truco ${T.textoModo(modo)}. Que tal a revanche?`,
      dados,
      botoes: [
        { rotulo: "Nova partida", funcao: () => novaPartida() },
        { rotulo: "Jogar esta de novo", funcao: () => novaPartida({ semente }), secundario: true },
        { rotulo: "Fechar", funcao: () => {}, secundario: true },
      ],
    });
  }

  function desenharEstatisticas() {
    const modo = modoAtual();
    const e = estatisticas[modo];
    estModo.textContent = T.textoModo(modo);
    const linhas = [
      ["Partidas", T.formatarNumero(e.partidas)],
      ["Vitórias", `${T.formatarNumero(e.vitorias)} (${T.porcentagemVitorias(e)}%)`],
      ["Vitórias seguidas", T.formatarNumero(e.sequencia)],
      ["Maior sequência", T.formatarNumero(e.melhorSequencia)],
      ["Trucos ganhos", T.formatarNumero(e.trucosGanhos)],
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

  /** Partida começada (você já jogou ou respondeu) e abandonada conta como não terminada. */
  function registrarAbandono() {
    if (!estado || !estado.iniciado || estado.fim) return;
    const { estatisticas: novas } = T.registrarResultado(estatisticas[estado.modo], { venceu: false, trucos: estado.trucosGanhos });
    estatisticas = { ...estatisticas, [estado.modo]: novas };
    gravar(CHAVE_ESTATISTICAS, estatisticas);
  }

  // ---------- Partida ----------

  function novaPartida({ modo = modoAtual(), semente = T.novaSemente() } = {}) {
    fecharDialogo();
    fecharAcao();
    pararFluxo();
    registrarAbandono();
    calarTodos();
    esconderAviso();
    mesa.classList.remove("tr-festa");
    vazasRecolhidas = 0;
    maoAnunciada = 0;
    fimMostrado = false;
    mostrarParceiro = false;
    cobrir = false;
    vezAnunciada = "";
    foco = 0;
    estado = T.novoJogo(modo, semente);
    gravar(CHAVE_MODO, estado.modo);
    salvar();
    desenharEstatisticas();
    const espera = animarDistribuicao();
    som.tocar("embaralhar");
    anunciar(
      `Nova partida de Truco ${T.textoModo(estado.modo)}, número ${T.formatarNumero(semente)}. ${
        estado.mao.carteador === 0 ? "Você deu as cartas" : `${NOMES[estado.mao.carteador]} deu as cartas`
      }.`,
    );
    agendar(() => {
      distribuindo = false;
      desenhar();
      avancar();
    }, espera);
  }

  function confirmarNovaPartida(opcoes = {}) {
    if (!estado.iniciado || estado.fim) {
      novaPartida(opcoes);
      return;
    }
    abrirDialogo({
      titulo: "Começar outra partida?",
      texto: "A partida atual vai contar como não terminada nas suas estatísticas.",
      botoes: [
        { rotulo: "Sim, começar", funcao: () => novaPartida(opcoes) },
        { rotulo: "Não", funcao: () => avancar(), secundario: true },
      ],
      aoCancelar: () => avancar(),
    });
  }

  // ---------- Toque e teclado ----------

  mesa.addEventListener("click", (evento) => {
    const cartaEl = evento.target.closest(".tr-carta");
    if (cartaEl) {
      const i = cartasEl.indexOf(cartaEl);
      if (i < 0 || i >= 3) return;
      const k = naMao(0).findIndex((c) => c.i === i);
      if (k >= 0) {
        foco = k;
        jogarSuaCarta(k);
      }
      return;
    }
    // Leitores de tela ativam a vaga com um clique sem ponteiro
    const vagaEl = evento.target.closest(".tr-vaga");
    if (vagaEl && evento.detail === 0) {
      foco = Number(vagaEl.dataset.k);
      jogarSuaCarta(foco);
    }
  });
  mesa.addEventListener("contextmenu", (evento) => evento.target.closest(".tr-carta") && evento.preventDefault());

  mesa.addEventListener("keydown", (evento) => {
    const vagaEl = evento.target.closest?.(".tr-vaga");
    if (!vagaEl || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const n = naMao(0).length;
    switch (evento.key) {
      case "ArrowLeft":
      case "ArrowUp":
        if (n) foco = (foco + n - 1) % n;
        desenharVagas();
        atualizarAnel(true);
        break;
      case "ArrowRight":
      case "ArrowDown":
        if (n) foco = (foco + 1) % n;
        desenharVagas();
        atualizarAnel(true);
        break;
      case "Home":
        foco = 0;
        desenharVagas();
        atualizarAnel(true);
        break;
      case "End":
        foco = Math.max(0, n - 1);
        desenharVagas();
        atualizarAnel(true);
        break;
      case "Enter":
      case " ":
        jogarSuaCarta(Number(vagaEl.dataset.k));
        break;
      default:
        return;
    }
    evento.preventDefault();
  });

  mesa.addEventListener("focusin", (evento) => {
    const vagaEl = evento.target.closest?.(".tr-vaga");
    if (!vagaEl) return;
    foco = Number(vagaEl.dataset.k);
    vagasEl.forEach((el, k) => (el.tabIndex = k === foco ? 0 : -1));
    atualizarAnel();
  });
  mesa.addEventListener("focusout", () => setTimeout(() => atualizarAnel(), 0));

  // ---------- Botões ----------

  botaoTruco.addEventListener("click", pedirTruco);
  botaoCobrir.addEventListener("click", () => {
    if (!podeAgir() || !T.podeCobrir(estado, 0)) return;
    cobrir = !cobrir;
    som.tocar("selecionar");
    desenhar();
    anunciar(cobrir ? "A próxima carta que você jogar vai coberta, virada para baixo." : "A próxima carta vai aberta.");
  });
  botaoNova.addEventListener("click", () => {
    pararFluxo();
    confirmarNovaPartida();
  });
  for (const botao of botoesModo) {
    botao.addEventListener("click", () => {
      const modo = botao.dataset.modo;
      if (modo === estado.modo) return;
      pararFluxo();
      confirmarNovaPartida({ modo });
    });
  }
  botaoZerar.addEventListener("click", () => {
    const modo = estado.modo;
    pararFluxo();
    abrirDialogo({
      titulo: "Zerar estatísticas?",
      texto: `As estatísticas do Truco ${T.textoModo(modo)} voltam para zero. Isso não pode ser desfeito.`,
      botoes: [
        {
          rotulo: "Sim, zerar",
          funcao: () => {
            estatisticas = { ...estatisticas, [modo]: T.estatisticasVazias() };
            gravar(CHAVE_ESTATISTICAS, estatisticas);
            desenharEstatisticas();
            anunciar("Estatísticas zeradas.");
            avancar();
          },
        },
        { rotulo: "Não", funcao: () => avancar(), secundario: true },
      ],
      aoCancelar: () => avancar(),
    });
  });
  som.ligarBotao(raiz.querySelector("#tr-som"));

  // ---------- Tamanho da tela e saída da página ----------

  let redesenho = null;
  let ultimaMedida = "";
  function aoMudarTamanho() {
    cancelAnimationFrame(redesenho);
    redesenho = requestAnimationFrame(() => {
      const medida = `${mesa.clientWidth}x${window.innerHeight}`;
      if (medida === ultimaMedida || !estado) return;
      ultimaMedida = medida;
      medir();
      desenhar({ animar: false });
    });
  }
  if (typeof ResizeObserver === "function") new ResizeObserver(aoMudarTamanho).observe(mesa);
  window.addEventListener("resize", aoMudarTamanho);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      salvar();
      return;
    }
    if (adiado) {
      const f = adiado;
      adiado = null;
      agendar(f, 400);
    }
  });
  window.addEventListener("pagehide", salvar);

  // ---------- Início ----------

  const salvas = lerJson(CHAVE_ESTATISTICAS) || {};
  for (const modo of T.MODOS) estatisticas[modo] = T.lerEstatisticas(salvas[modo]);
  const restaurada = T.restaurar(lerJson(CHAVE_PARTIDA));
  medir();
  ultimaMedida = `${mesa.clientWidth}x${window.innerHeight}`;
  if (restaurada && !restaurada.fim) {
    estado = restaurada;
    vazasRecolhidas = T.vazasCompletas(estado.mao).length;
    desenhar({ animar: false });
    desenharEstatisticas();
    anunciar("Partida anterior retomada.");
    agendar(avancar, 600);
  } else {
    const modo = T.MODOS.includes(lerJson(CHAVE_MODO)) ? lerJson(CHAVE_MODO) : T.MODO_PADRAO;
    novaPartida({ modo });
  }
})();
