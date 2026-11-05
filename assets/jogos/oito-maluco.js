"use strict";
/*
 * Interface do Oito Maluco. As regras, as jogadas do computador e as estatísticas ficam em
 * oito-maluco-logica.js.
 *
 * As 52 cartas são criadas uma vez e só mudam de lugar (propriedade CSS translate); a escala deixa
 * pequenas as cartas dos adversários. A cada rodada (e cada vez que o descarte vira monte), os
 * elementos são sorteados de novo entre as cartas, e a frente só é desenhada quando a carta está à
 * vista: no DOM, uma carta virada para baixo é só o verso, sem número, naipe ou cor.
 *
 * Você joga tocando numa carta da mão (ou com Enter); o 8 abre a escolha do naipe. Tocar no monte
 * compra uma carta. O computador joga com pausas, uma compra por vez. No teclado, as setas andam
 * pelos adversários, pelo monte, pelo descarte e pela sua mão, e Enter ou Espaço age.
 * A partida, o modo, a ordem da mão e as estatísticas ficam no localStorage.
 */
(() => {
  const raiz = document.querySelector(".oito");
  if (!raiz || typeof LogicaOitoMaluco !== "object") return;
  const L = LogicaOitoMaluco;

  const CHAVE_PARTIDA = "efs-oito-maluco-partida";
  const CHAVE_ESTATISTICAS = "efs-oito-maluco-estatisticas";
  const CHAVE_MODO = "efs-oito-maluco-modo";
  const CHAVE_ORDEM = "efs-oito-maluco-ordem";
  const TRAVA_DIALOGO_MS = 500;
  const TRAVA_NAIPES_MS = 300;
  const MENSAGEM_MS = 3400;
  const AVISO_MINIMO_MS = 1300;
  const DURACAO = 320;
  /** Pausas do computador: antes de jogar, entre uma compra e outra e depois de jogar. */
  const PAUSA_PENSAR = 750;
  const PAUSA_COMPRA = 520;
  const PAUSA_DEPOIS = 600;
  const PAUSA_FIM = 1100;
  const PASSO_DISTRIBUIR = 70;
  const MAX_ADVERSARIOS = 3;
  const reduzirMovimento = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  const mesa = raiz.querySelector("#om-mesa");
  const textoRodada = raiz.querySelector("#om-rodada");
  const textoPontos = raiz.querySelector("#om-pontos");
  const textoMonte = raiz.querySelector("#om-monte");
  const textoPartida = raiz.querySelector("#om-partida");
  const botaoDica = raiz.querySelector("#om-dica");
  const botaoOrdem = raiz.querySelector("#om-ordem");
  const botaoProxima = raiz.querySelector("#om-proxima");
  const botaoNova = raiz.querySelector("#om-nova");
  const botoesModo = [...raiz.querySelectorAll("[data-modo]")];
  const status = raiz.querySelector("#om-status");
  const placar = raiz.querySelector("#om-placar");
  const estLista = raiz.querySelector("#om-est-lista");
  const estModo = raiz.querySelector("#om-est-modo");
  const botaoZerar = raiz.querySelector("#om-zerar");
  const dialogo = raiz.querySelector("#om-dialogo");
  const dialogoTitulo = raiz.querySelector("#om-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#om-dialogo-texto");
  const dialogoDados = raiz.querySelector("#om-dialogo-dados");
  const dialogoBotoes = raiz.querySelector("#om-dialogo-botoes");
  const dialogoNaipes = raiz.querySelector("#om-naipes");
  const naipesBotoes = raiz.querySelector("#om-naipes-botoes");
  const naipesCancelar = raiz.querySelector("#om-naipes-cancelar");
  // Se sons.js não carregar, o jogo segue mudo e o botão some
  const som = typeof Sons === "object" ? Sons.criar("oito-maluco", raiz) : { tocar() {}, ligarBotao: (b) => b && (b.hidden = true) };

  let estado;
  let estatisticas = {};
  let ordem = "naipe";
  let g = null;
  let foco = { tipo: "mao", indice: 0 };
  let ultimaComprada = null;
  let dicaTimer = null;
  let ocupadoAte = 0;
  let esperando = false;
  let oitoPendente = null;
  let alturaAtual = 0;

  // ---------- Elementos da mesa ----------

  function criar(tag, classe, atributos = {}) {
    const el = document.createElement(tag);
    el.className = classe;
    for (const [nome, valor] of Object.entries(atributos)) el.setAttribute(nome, valor);
    return el;
  }

  const assentosEl = [null];
  for (let j = 1; j <= MAX_ADVERSARIOS; j++) {
    const el = criar("div", "om-assento", { role: "button", tabindex: "-1" });
    el.dataset.j = String(j);
    el.innerHTML =
      '<span class="om-assento-topo"><span class="om-nome"></span><span class="om-ultima" hidden>Última carta!</span></span>' +
      '<span class="om-detalhe"></span>';
    assentosEl.push(el);
  }
  const monteEl = criar("div", "om-pilha om-pilha-monte", { role: "button", tabindex: "-1" });
  monteEl.innerHTML = '<span class="om-pilha-texto"></span>';
  const descarteEl = criar("div", "om-pilha om-pilha-descarte", { role: "button", tabindex: "-1" });
  const naipeEl = criar("div", "om-naipe-da-vez", { "aria-hidden": "true" });
  naipeEl.innerHTML = '<span>Naipe da vez</span><span class="om-naipe-da-vez-nome"><i class="om-naipe"></i><strong></strong></span>';
  const vezEl = criar("p", "om-vez", { "aria-hidden": "true" });
  const ultimaVoceEl = criar("span", "om-ultima om-ultima-voce", { "aria-hidden": "true" });
  ultimaVoceEl.textContent = "Última carta!";
  ultimaVoceEl.hidden = true;
  const vagasEl = [];
  const cartasEl = [...Array(L.CARTAS).keys()].map(() => {
    const el = criar("div", "om-carta", { "aria-hidden": "true" });
    el.appendChild(criar("div", "om-face"));
    return el;
  });
  const anel = criar("div", "om-anel");
  anel.hidden = true;
  // Aviso curto e visível sobre a mesa; o leitor de tela recebe o mesmo texto pelo status
  const mensagemEl = criar("p", "om-mensagem", { "aria-hidden": "true" });
  const camadaVagas = criar("div", "om-vagas");
  mesa.replaceChildren(...assentosEl.slice(1), monteEl, descarteEl, camadaVagas, naipeEl, vezEl, ultimaVoceEl, ...cartasEl, anel, mensagemEl);

  /** Que elemento mostra cada carta: sorteado a cada rodada, para a ordem no DOM não revelar nada. */
  let elementoDe = cartasEl.slice();

  function sortearElementos(ids) {
    const els = ids.map((id) => elementoDe[id]);
    for (let i = els.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [els[i], els[k]] = [els[k], els[i]];
    }
    ids.forEach((id, i) => (elementoDe[id] = els[i]));
  }
  const idDoElemento = (el) => elementoDe.indexOf(el);

  const VERSO = '<span class="om-verso"></span>';
  function frenteHtml(id) {
    const naipe = L.NAIPES[L.naipe(id)].id;
    const centro =
      L.valor(id) > 10
        ? `<span class="om-centro om-figura">${L.textoValor(id)}</span>`
        : `<span class="om-centro"><i class="om-naipe om-naipe-${naipe}"></i></span>`;
    return (
      `<span class="om-frente"><span class="om-valor">${L.textoValor(id)}</span>` +
      `<i class="om-naipe om-naipe-${naipe} om-naipe-canto"></i>${centro}</span>`
    );
  }

  /** Desenha a frente só da carta à vista; virada para baixo, o elemento fica só com o verso. */
  function mostrarFace(el, id, aberta) {
    const alvo = aberta ? id : null;
    if (el._face === alvo) return false;
    const tinha = el._face !== undefined;
    el._face = alvo;
    el.firstChild.innerHTML = aberta ? frenteHtml(id) : VERSO;
    el.classList.toggle("vermelha", aberta && L.vermelha(id));
    el.classList.toggle("aberta", aberta);
    return tinha;
  }

  function virar(el) {
    const face = el.firstChild;
    face.classList.remove("virando");
    void face.offsetWidth;
    face.classList.add("virando");
  }

  const nome = (j) => L.nomeJogador(j);
  const textoCartas = (n) => `${n} ${n === 1 ? "carta" : "cartas"}`;
  const textoPontosDe = (n) => `${L.formatarNumero(n)} ${n === 1 ? "ponto" : "pontos"}`;

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
    if (!estado) return;
    gravar(CHAVE_PARTIDA, estado.fase === "fimPartida" ? null : estado);
  }

  // ---------- Agenda do computador ----------

  let geracao = 0;
  const agendados = new Set();

  /** Chama [fn] depois de [ms], a menos que a partida mude antes (nova partida, nova rodada). */
  function agendar(fn, ms) {
    const minha = geracao;
    const t = setTimeout(() => {
      agendados.delete(t);
      if (minha === geracao) fn();
    }, ms);
    agendados.add(t);
  }

  function cancelarAgendados() {
    geracao += 1;
    for (const t of agendados) clearTimeout(t);
    agendados.clear();
    esperando = false;
  }

  const ocupado = () => performance.now() < ocupadoAte;
  const ocupar = (ms) => (ocupadoAte = Math.max(ocupadoAte, performance.now() + ms));

  // ---------- Medidas da mesa ----------

  function medir() {
    const largura = mesa.clientWidth;
    const estreita = largura < 520;
    const margem = Math.max(8, Math.round(largura * 0.02));
    // A mesa tem cerca de 130 px mais 3,7 larguras de carta de altura: limitar pela janela faz ela
    // caber inteira na tela do notebook
    const porAltura = Math.floor((window.innerHeight - 240) / 3.7);
    const cw = Math.max(48, Math.min(86, Math.round(largura * (estreita ? 0.15 : 0.118)), porAltura));
    const ch = Math.round(cw * 1.4);
    const esc = 0.5;
    const rotuloH = estreita ? 40 : 44;
    const k = estado.modo - 1;
    const vao = estreita ? 6 : 12;
    const w = Math.min(230, (largura - 2 * margem - (k - 1) * vao) / k);
    const x0 = (largura - (k * w + (k - 1) * vao)) / 2;
    const alturaAssento = Math.round(rotuloH + ch * esc + 10);
    const assentos = [null];
    for (let j = 1; j <= k; j++) assentos.push({ x: x0 + (j - 1) * (w + vao), y: margem, w, h: alturaAssento });
    const centroY = margem + alturaAssento + (estreita ? 12 : 18);
    const vaoCentro = Math.max(14, Math.round(cw * 0.3));
    const vezY = centroY + ch + (estreita ? 8 : 12);
    const vezH = 26;
    const sobe = Math.round(ch * 0.09);
    g = {
      largura,
      estreita,
      margem,
      cw,
      ch,
      esc,
      rotuloH,
      assentos,
      centroY,
      monteX: Math.round(largura / 2 - vaoCentro / 2 - cw),
      descarteX: Math.round(largura / 2 + vaoCentro / 2),
      vezY,
      vezH,
      sobe,
      maoY: vezY + vezH + sobe + 6,
      passoLinha: Math.round(ch * 0.46),
    };
    mesa.style.setProperty("--cw", `${cw}px`);
    mesa.style.setProperty("--ch", `${ch}px`);
    alturaAtual = 0;
  }

  /** As cartas da sua mão na ordem escolhida: por naipe (com os 8 no fim) ou por valor. */
  function maoOrdenada() {
    const mao = estado.maos[0].slice();
    const posNaipe = (id) => L.ORDEM_NAIPES.indexOf(L.naipe(id));
    const oito = (id) => (L.valor(id) === L.OITO ? 1 : 0);
    if (ordem === "valor") mao.sort((a, b) => L.valor(a) - L.valor(b) || posNaipe(a) - posNaipe(b));
    else mao.sort((a, b) => oito(a) - oito(b) || posNaipe(a) - posNaipe(b) || L.valor(a) - L.valor(b));
    return mao;
  }

  /** Leque da mão: uma fileira enquanto as cartas cabem com o canto à mostra; senão, duas ou mais. */
  function layoutMao(n) {
    const disponivel = g.largura - 2 * g.margem;
    const passoMax = g.cw * 0.62;
    const passoMin = g.cw * 0.36;
    const cabem = Math.max(1, Math.floor((disponivel - g.cw) / passoMin) + 1);
    const linhas = Math.max(1, Math.ceil(n / cabem));
    const porLinha = Math.ceil(n / linhas);
    const lista = [];
    for (let i = 0; i < n; i++) {
      const linha = Math.floor(i / porLinha);
      const k = i - linha * porLinha;
      const nessa = Math.min(porLinha, n - linha * porLinha);
      const passo = nessa > 1 ? Math.min(passoMax, (disponivel - g.cw) / (nessa - 1)) : 0;
      const largura = g.cw + passo * (nessa - 1);
      const meio = (nessa - 1) / 2;
      const rel = meio ? (k - meio) / meio : 0;
      const umaLinha = linhas === 1;
      lista.push({
        x: Math.round((g.largura - largura) / 2 + k * passo),
        y: Math.round(g.maoY + linha * g.passoLinha + (umaLinha ? rel * rel * g.ch * 0.05 : 0)),
        giro: umaLinha ? Math.round(rel * Math.min(8, nessa * 1.1) * 10) / 10 : 0,
        visivel: k < nessa - 1 ? Math.max(passo, 12) : g.cw,
        linha,
      });
    }
    return { lista, linhas };
  }

  const giroDoDescarte = (id) => ((id * 37) % 13) - 6;

  /** Onde fica cada carta agora: x, y do canto de cima à esquerda já na escala, z, aberta, giro. */
  function calcularPosicoes() {
    const pos = new Array(L.CARTAS);
    const rodadaAcabou = estado.fase !== "jogando";
    const vezSua = estado.fase === "jogando" && estado.vez === 0;
    estado.monte.forEach((id, i) => {
      pos[id] = { x: g.monteX, y: g.centroY, z: 10 + i, aberta: false, escala: 1, giro: 0, coberta: i < estado.monte.length - 2 };
    });
    estado.descarte.forEach((id, i) => {
      pos[id] = { x: g.descarteX, y: g.centroY, z: 60 + i, aberta: true, escala: 1, giro: giroDoDescarte(id), coberta: i < estado.descarte.length - 4 };
    });
    for (let j = 1; j < estado.modo; j++) {
      const a = g.assentos[j];
      const mao = estado.maos[j];
      const wp = g.cw * g.esc;
      const livre = a.w - 12;
      const passo = mao.length > 1 ? Math.min(wp * (rodadaAcabou ? 0.62 : 0.4), (livre - wp) / (mao.length - 1)) : 0;
      const x0 = a.x + (a.w - (wp + passo * (mao.length - 1))) / 2;
      mao.forEach((id, i) => {
        pos[id] = { x: Math.round(x0 + i * passo), y: a.y + g.rotuloH, z: 120 + i, aberta: rodadaAcabou, escala: g.esc, giro: 0 };
      });
    }
    const { lista, linhas } = layoutMao(estado.maos[0].length);
    maoOrdenada().forEach((id, i) => {
      const l = lista[i];
      const jogavel = vezSua && L.serve(estado, id);
      pos[id] = { x: l.x, y: l.y - (jogavel ? g.sobe : 0), z: 300 + i, aberta: true, escala: 1, giro: l.giro, mao: true, jogavel, visivel: l.visivel, indice: i };
    });
    return { pos, linhas };
  }

  // ---------- Desenho ----------

  /** [atrasos]: espera, em ms, antes de cada carta andar; [revelarDepois]: a frente aparece na chegada. */
  function desenhar({ animar = true, atrasos = null, revelarDepois = false } = {}) {
    if (!g) medir();
    const { pos, linhas } = calcularPosicoes();
    const semAnimacao = !animar || reduzirMovimento.matches;
    mesa.classList.toggle("sem-animacao", semAnimacao);
    const vezSua = estado.fase === "jogando" && estado.vez === 0;
    pos.forEach((p, id) => {
      const el = elementoDe[id];
      const antes = el._pos;
      const mudou = !antes || antes.x !== p.x || antes.y !== p.y || antes.escala !== p.escala;
      const atraso = !semAnimacao && atrasos ? atrasos.get(id) || 0 : 0;
      el.style.transitionDelay = atraso ? `${atraso}ms` : "";
      const dx = ((1 - p.escala) * g.cw) / 2;
      const dy = ((1 - p.escala) * g.ch) / 2;
      el.style.translate = `${Math.round(p.x - dx)}px ${Math.round(p.y - dy)}px`;
      el.style.scale = p.escala === 1 ? "" : String(p.escala);
      el.style.rotate = p.giro ? `${p.giro}deg` : "";
      // A carta que está indo para outro lugar passa por cima das outras durante o caminho
      const voando = mudou && antes && !semAnimacao;
      el.style.zIndex = String(voando ? 1000 + p.z : p.z);
      clearTimeout(el._z);
      if (voando) el._z = setTimeout(() => (el.style.zIndex = String(el._pos.z)), DURACAO + atraso + 40);
      clearTimeout(el._revela);
      if (p.aberta && revelarDepois && atraso && el._face !== id) {
        mostrarFace(el, id, false);
        el._revela = setTimeout(() => el._pos === p && mostrarFace(el, id, true) && virar(el), atraso + DURACAO * 0.55);
      } else if (mostrarFace(el, id, p.aberta) && !semAnimacao) {
        virar(el);
      }
      el.classList.toggle("coberta", Boolean(p.coberta));
      el.classList.toggle("om-da-mao", Boolean(p.mao));
      el.classList.toggle("jogavel", Boolean(p.jogavel));
      el.classList.toggle("apagada", Boolean(vezSua && p.mao && !p.jogavel));
      el.classList.toggle("om-nova", id === ultimaComprada && Boolean(p.mao));
      el._pos = p;
    });
    if (semAnimacao) requestAnimationFrame(() => mesa.classList.remove("sem-animacao"));

    const altura = g.maoY + g.ch + Math.max(0, linhas - 1) * g.passoLinha + Math.round(g.ch * 0.05) + g.margem;
    if (altura !== alturaAtual) {
      alturaAtual = altura;
      mesa.style.height = `${altura}px`;
    }
    desenharAssentos();
    desenharCentro();
    desenharVagas(pos);
    desenharPainel();
    const tinhaFoco = mesa.contains(document.activeElement) && document.activeElement !== mesa;
    atualizarFoco(tinhaFoco);
  }

  function rotuloAssento(j) {
    const n = estado.maos[j].length;
    const partes = [`${nome(j)}: ${textoCartas(n)}, ${textoPontosDe(estado.pontos[j])}`];
    if (n === 1 && estado.fase === "jogando") partes.push("última carta");
    // Ana e Lia, ou Beto
    if (estado.fase === "jogando" && estado.vez === j) partes.push(j === 2 ? "é a vez dele" : "é a vez dela");
    return `${partes.join(", ")}.`;
  }

  function desenharAssentos() {
    for (let j = 1; j <= MAX_ADVERSARIOS; j++) {
      const el = assentosEl[j];
      const existe = j < estado.modo;
      el.hidden = !existe;
      if (!existe) continue;
      const a = g.assentos[j];
      el.style.translate = `${Math.round(a.x)}px ${a.y}px`;
      el.style.width = `${Math.round(a.w)}px`;
      el.style.height = `${a.h}px`;
      const n = estado.maos[j].length;
      el.querySelector(".om-nome").textContent = nome(j);
      el.querySelector(".om-detalhe").textContent = `${textoCartas(n)} · ${L.formatarNumero(estado.pontos[j])} pts`;
      el.querySelector(".om-ultima").hidden = !(n === 1 && estado.fase === "jogando");
      const vez = estado.fase === "jogando" && estado.vez === j;
      el.classList.toggle("om-vez-dele", vez);
      const venceu = estado.fase !== "jogando" && estado.rodadas[estado.rodadas.length - 1].vencedor === j;
      el.classList.toggle("om-venceu", venceu);
      el.setAttribute("aria-label", rotuloAssento(j));
    }
  }

  function rotuloMonte() {
    const n = estado.monte.length;
    const suaVez = estado.fase === "jogando" && estado.vez === 0;
    if (n) return `Monte: ${textoCartas(n)}.${suaVez ? " Enter compra uma carta." : ""}`;
    if (estado.descarte.length > 1) return `Monte vazio.${suaVez ? " Enter embaralha o descarte e compra uma carta." : ""}`;
    if (suaVez && L.podePassar(estado)) return "Monte vazio e nada para comprar. Enter passa a vez.";
    return "Monte vazio e nada para comprar.";
  }

  function textoPedido() {
    const s = L.nomeNaipe(estado.naipe);
    if (L.naipePedido(estado)) return `O 8 pediu ${s}: jogue uma carta de ${s} ou outro 8.`;
    return `Jogue uma carta de ${s} ou ${L.umValor(L.valor(L.cartaDeCima(estado)))}.`;
  }

  function rotuloDescarte() {
    const cima = L.cartaDeCima(estado);
    const pedido = L.naipePedido(estado) ? ` O 8 pediu ${L.nomeNaipe(estado.naipe)}.` : "";
    return `Descarte: ${L.nomeCarta(cima)} por cima.${pedido}`;
  }

  function textoDaVez() {
    if (estado.fase !== "jogando") {
      const r = estado.rodadas[estado.rodadas.length - 1];
      const quem = r.vencedor === 0 ? "Você venceu" : `${nome(r.vencedor)} venceu`;
      return estado.fase === "fimPartida" ? `${quem} a partida!` : `${quem} a rodada`;
    }
    if (estado.vez !== 0) return estado.compradas ? `${nome(estado.vez)} está comprando…` : `Vez de ${nome(estado.vez)}`;
    if (L.cartasQueServem(estado).length) return "Sua vez";
    return L.podeComprar(estado) ? "Sua vez · compre do monte" : "Sua vez · passe a vez";
  }

  function desenharCentro() {
    for (const [el, x] of [
      [monteEl, g.monteX],
      [descarteEl, g.descarteX],
    ]) {
      el.style.translate = `${x}px ${g.centroY}px`;
      el.style.width = `${g.cw}px`;
      el.style.height = `${g.ch}px`;
    }
    const suaVez = estado.fase === "jogando" && estado.vez === 0;
    const vazio = !estado.monte.length;
    const podePassar = suaVez && L.podePassar(estado);
    monteEl.classList.toggle("vazio", vazio);
    monteEl.classList.toggle("cheio", estado.monte.length > 1);
    monteEl.classList.toggle("reciclar", vazio && estado.descarte.length > 1);
    monteEl.classList.toggle("passar", podePassar);
    monteEl.querySelector(".om-pilha-texto").textContent = podePassar ? "Passar a vez" : vazio && estado.descarte.length < 2 ? "Vazio" : "";
    // Sem carta que sirva, o monte chama a atenção
    const chamar = suaVez && !L.cartasQueServem(estado).length;
    monteEl.classList.toggle("om-chama", chamar && vazio);
    const topoMonte = estado.monte.length ? elementoDe[estado.monte[estado.monte.length - 1]] : null;
    for (const el of cartasEl) el.classList.toggle("om-chama", chamar && el === topoMonte);
    monteEl.setAttribute("aria-label", rotuloMonte());
    descarteEl.setAttribute("aria-label", rotuloDescarte());

    const pedido = estado.fase === "jogando" && L.naipePedido(estado);
    naipeEl.classList.toggle("visivel", pedido);
    if (pedido) {
      const n = L.NAIPES[estado.naipe];
      naipeEl.querySelector("i").className = `om-naipe om-naipe-${n.id}`;
      naipeEl.querySelector("strong").textContent = n.nome;
      naipeEl.classList.toggle("vermelho", n.vermelho);
    }
    const x = g.descarteX + g.cw + 14;
    naipeEl.style.translate = `${x}px ${Math.round(g.centroY + g.ch / 2)}px`;
    naipeEl.style.maxWidth = `${Math.max(60, g.largura - g.margem - x)}px`;

    vezEl.textContent = textoDaVez();
    vezEl.classList.toggle("om-sua-vez", suaVez);
    vezEl.style.top = `${g.vezY}px`;
    vezEl.style.height = `${g.vezH}px`;
    mensagemEl.style.top = `${g.vezY + g.vezH / 2}px`;

    // Só uma carta na mão: o selo aparece ao lado dela
    const sua = estado.maos[0];
    ultimaVoceEl.hidden = !(sua.length === 1 && estado.fase === "jogando");
    if (sua.length === 1) {
      const p = elementoDe[sua[0]]._pos;
      ultimaVoceEl.style.translate = `${p.x + g.cw + 12}px ${Math.round(g.maoY + g.ch / 2)}px`;
    }
  }

  function rotuloCartaDaMao(id) {
    const suaVez = estado.fase === "jogando" && estado.vez === 0;
    if (!suaVez) return `${L.nomeCarta(id)}.`;
    if (!L.serve(estado, id)) return `${L.nomeCarta(id)}, não serve agora.`;
    return `${L.nomeCarta(id)}, pode jogar${L.precisaNaipe(estado, id) ? " e escolher o naipe" : ""}.`;
  }

  /** Vagas do teclado sobre as cartas da sua mão (a parte que aparece de cada uma). */
  function desenharVagas(pos) {
    const mao = maoOrdenada();
    while (vagasEl.length < mao.length) {
      const el = criar("div", "om-vaga", { role: "button", tabindex: "-1" });
      el.dataset.i = String(vagasEl.length);
      vagasEl.push(el);
      camadaVagas.appendChild(el);
    }
    vagasEl.forEach((el, i) => {
      el.hidden = i >= mao.length;
      if (el.hidden) return;
      const p = pos[mao[i]];
      el.style.translate = `${p.x}px ${p.y}px`;
      el.style.width = `${Math.round(p.visivel)}px`;
      el.style.height = `${g.ch}px`;
      el.setAttribute("aria-label", rotuloCartaDaMao(mao[i]));
    });
  }

  function desenharPainel() {
    textoRodada.textContent = L.formatarNumero(estado.rodada);
    textoPontos.textContent = `${L.formatarNumero(estado.pontos[0])} / ${L.META}`;
    textoMonte.textContent = L.formatarNumero(estado.monte.length);
    textoPartida.textContent = `Partida nº ${L.formatarNumero(estado.semente)} · ${L.textoModo(estado.modo)} · até ${L.META} pontos`;
    const suaVez = estado.fase === "jogando" && estado.vez === 0;
    botaoDica.disabled = !suaVez;
    botaoProxima.hidden = estado.fase !== "fimRodada";
    botaoOrdem.textContent = ordem === "naipe" ? "Ordenar por valor" : "Ordenar por naipe";
    for (const botao of botoesModo) {
      const ativo = Number(botao.dataset.modo) === estado.modo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    desenharPlacar();
  }

  function desenharPlacar() {
    const jogadores = [...Array(estado.modo).keys()];
    const celula = (tag, texto, classe) => {
      const el = document.createElement(tag);
      el.textContent = texto;
      if (classe) el.className = classe;
      return el;
    };
    const cabeca = document.createElement("tr");
    cabeca.append(celula("th", "Rodada"), ...jogadores.map((j) => celula("th", nome(j))));
    for (const th of cabeca.children) th.scope = "col";
    const corpo = estado.rodadas.map((r, i) => {
      const tr = document.createElement("tr");
      const th = celula("th", String(i + 1));
      th.scope = "row";
      tr.append(th, ...jogadores.map((j) => (j === r.vencedor ? celula("td", `+${r.ganhos[j]}`, "ganhou") : celula("td", "–"))));
      return tr;
    });
    if (!corpo.length) {
      const tr = document.createElement("tr");
      const td = celula("td", "Nenhuma rodada terminada ainda.", "vazio");
      td.colSpan = jogadores.length + 1;
      tr.append(td);
      corpo.push(tr);
    }
    const lider = Math.max(...estado.pontos);
    const total = document.createElement("tr");
    const th = celula("th", "Total");
    th.scope = "row";
    total.append(th, ...jogadores.map((j) => celula("td", L.formatarNumero(estado.pontos[j]), lider > 0 && estado.pontos[j] === lider ? "lider" : "")));
    const thead = document.createElement("thead");
    thead.append(cabeca);
    const tbody = document.createElement("tbody");
    tbody.append(...corpo);
    const tfoot = document.createElement("tfoot");
    tfoot.append(total);
    placar.replaceChildren(thead, tbody, tfoot);
  }

  let mensagemTimer = null;

  /** Só para o leitor de tela. */
  function anunciar(texto) {
    status.textContent = texto;
  }

  let avisoDesde = 0;

  /** Tira o aviso que ficou velho; um aviso recente ainda fica um pouco, para dar tempo de ler. */
  function esconderAviso() {
    if (!mensagemEl.classList.contains("visivel")) return;
    clearTimeout(mensagemTimer);
    const falta = AVISO_MINIMO_MS - (performance.now() - avisoDesde);
    if (falta > 0) mensagemTimer = setTimeout(() => mensagemEl.classList.remove("visivel"), falta);
    else mensagemEl.classList.remove("visivel");
  }

  /** Mostra o texto sobre a mesa e o manda para o leitor de tela. */
  function avisar(texto) {
    anunciar(texto);
    clearTimeout(mensagemTimer);
    avisoDesde = performance.now();
    mensagemEl.textContent = texto;
    mensagemEl.classList.add("visivel");
    mensagemTimer = setTimeout(() => mensagemEl.classList.remove("visivel"), MENSAGEM_MS);
  }

  // ---------- Foco do teclado ----------

  /** As paradas do teclado: adversários (linha 0), monte e descarte (1) e sua mão (2). */
  function paradas() {
    const lista = [];
    for (let j = 1; j < estado.modo; j++) lista.push({ tipo: "assento", j, el: assentosEl[j], linha: 0 });
    lista.push({ tipo: "monte", el: monteEl, linha: 1 }, { tipo: "descarte", el: descarteEl, linha: 1 });
    maoOrdenada().forEach((id, i) => lista.push({ tipo: "mao", id, indice: i, el: vagasEl[i], linha: 2 }));
    return lista;
  }

  function retanguloDe(parada) {
    if (parada.tipo === "assento") return g.assentos[parada.j];
    if (parada.tipo === "monte") return { x: g.monteX, y: g.centroY, w: g.cw, h: g.ch };
    if (parada.tipo === "descarte") return { x: g.descarteX, y: g.centroY, w: g.cw, h: g.ch };
    const p = elementoDe[parada.id]._pos;
    return { x: p.x, y: p.y, w: g.cw, h: g.ch, giro: p.giro };
  }

  /** A parada com o foco; se a carta saiu da mão, a vizinha dela (ou o monte). */
  function paradaAtual(lista = paradas()) {
    if (foco.tipo === "mao") {
      const daMao = lista.filter((p) => p.tipo === "mao");
      if (!daMao.length) return lista.find((p) => p.tipo === "monte");
      const mesma = foco.id !== undefined && daMao.find((p) => p.id === foco.id);
      return mesma || daMao[Math.min(foco.indice || 0, daMao.length - 1)];
    }
    if (foco.tipo === "assento") return lista.find((p) => p.tipo === "assento" && p.j === foco.j) || lista.find((p) => p.tipo === "monte");
    return lista.find((p) => p.tipo === foco.tipo);
  }

  function focar(parada) {
    foco = { tipo: parada.tipo, j: parada.j, id: parada.id, indice: parada.indice };
  }

  function atualizarFoco(mover = true) {
    const lista = paradas();
    const atual = paradaAtual(lista);
    for (const p of lista) p.el.tabIndex = p === atual ? 0 : -1;
    for (const el of [...assentosEl.slice(1), ...vagasEl]) if (!lista.some((p) => p.el === el)) el.tabIndex = -1;
    for (const el of cartasEl) el.classList.remove("om-focada");
    if (!atual) return;
    if (mover) atual.el.focus({ preventScroll: true });
    const ativo = document.activeElement === atual.el && atual.el.matches(":focus-visible");
    anel.hidden = !ativo;
    if (!ativo) return;
    const r = retanguloDe(atual);
    if (atual.tipo === "mao") elementoDe[atual.id].classList.add("om-focada");
    const sobe = atual.tipo === "mao" ? Math.round(g.ch * 0.08) : 0;
    anel.style.translate = `${Math.round(r.x)}px ${Math.round(r.y - sobe)}px`;
    anel.style.width = `${Math.round(r.w)}px`;
    anel.style.height = `${Math.round(r.h)}px`;
    anel.style.rotate = r.giro ? `${r.giro}deg` : "";
    anel.classList.toggle("om-anel-assento", atual.tipo === "assento");
  }

  const centroX = (p) => {
    const r = retanguloDe(p);
    return r.x + r.w / 2;
  };

  function vizinha(atual, tecla) {
    const lista = paradas();
    const mesmaLinha = lista.filter((p) => p.linha === atual.linha).sort((a, b) => centroX(a) - centroX(b));
    if (tecla === "ArrowLeft" || tecla === "ArrowRight") {
      const i = mesmaLinha.findIndex((p) => p.el === atual.el);
      const passo = tecla === "ArrowRight" ? 1 : -1;
      return mesmaLinha[(i + passo + mesmaLinha.length) % mesmaLinha.length];
    }
    const linhas = [...new Set(lista.map((p) => p.linha))].sort((a, b) => a - b);
    const alvo = tecla === "ArrowDown" ? linhas.find((l) => l > atual.linha) : [...linhas].reverse().find((l) => l < atual.linha);
    if (alvo === undefined) return atual;
    const x = centroX(atual);
    return lista.filter((p) => p.linha === alvo).reduce((melhor, p) => (Math.abs(centroX(p) - x) < Math.abs(centroX(melhor) - x) ? p : melhor));
  }

  // ---------- Diálogos ----------

  let aoCancelarDialogo = null;

  function linhasDl(linhas) {
    const dl = document.createElement("dl");
    dl.className = "om-dialogo-dados";
    dl.append(
      ...linhas.map(([rotulo, valor, destaque]) => {
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
    return dl;
  }

  function abrirDialogo({ titulo, texto, secoes = [], botoes, aoCancelar }) {
    fecharNaipes();
    dialogoTitulo.textContent = titulo;
    dialogoTexto.textContent = texto;
    dialogoDados.replaceChildren(
      ...secoes.flatMap(({ titulo: t, linhas }) => {
        const partes = [];
        if (t) {
          const h = document.createElement("h3");
          h.textContent = t;
          partes.push(h);
        }
        partes.push(linhasDl(linhas));
        return partes;
      }),
    );
    dialogoDados.hidden = secoes.length === 0;
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
  }

  function fecharDialogo() {
    aoCancelarDialogo = null;
    if (dialogo.open) dialogo.close();
  }

  dialogo.addEventListener("cancel", (evento) => {
    evento.preventDefault();
    const acao = aoCancelarDialogo;
    fecharDialogo();
    acao?.();
  });
  dialogo.addEventListener("close", () => retomarComputador());

  // Escolha do naipe do 8: quatro botões, com as setas andando entre eles
  function abrirNaipes(id) {
    oitoPendente = id;
    const resto = estado.maos[0].filter((c) => c !== id && L.valor(c) !== L.OITO);
    const sugerido = L.melhorNaipe(estado, id);
    const botoes = L.ORDEM_NAIPES.map((s) => {
      const n = L.NAIPES[s];
      const quantas = resto.filter((c) => L.naipe(c) === s).length;
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = `om-naipe-botao${n.vermelho ? " vermelho" : ""}`;
      botao.dataset.naipe = String(s);
      botao.innerHTML = `<i class="om-naipe om-naipe-${n.id}" aria-hidden="true"></i><span></span><small></small>`;
      botao.querySelector("span").textContent = n.nome[0].toUpperCase() + n.nome.slice(1);
      botao.querySelector("small").textContent = quantas ? `${textoCartas(quantas)} na mão` : "nenhuma na mão";
      botao.setAttribute("aria-label", `${n.nome}: ${quantas ? `você tem ${textoCartas(quantas)}` : "você não tem nenhuma carta"} desse naipe`);
      botao.addEventListener("click", () => escolherNaipe(s));
      return botao;
    });
    naipesBotoes.replaceChildren(...botoes);
    if (!dialogoNaipes.open) dialogoNaipes.showModal();
    dialogoNaipes.classList.add("travado");
    setTimeout(() => dialogoNaipes.classList.remove("travado"), TRAVA_NAIPES_MS);
    botoes[L.ORDEM_NAIPES.indexOf(sugerido)].focus();
    som.tocar("selecionar");
    anunciar(`Escolha o naipe que o ${L.nomeCarta(id)} vai pedir.`);
  }

  function fecharNaipes() {
    oitoPendente = null;
    if (dialogoNaipes.open) dialogoNaipes.close();
  }

  function escolherNaipe(s) {
    if (dialogoNaipes.classList.contains("travado")) return;
    const id = oitoPendente;
    fecharNaipes();
    if (id !== null) jogarSua(id, s);
  }

  naipesBotoes.addEventListener("keydown", (evento) => {
    const botoes = [...naipesBotoes.querySelectorAll("button")];
    const i = botoes.indexOf(document.activeElement);
    if (i < 0) return;
    const passos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 };
    if (!(evento.key in passos)) return;
    evento.preventDefault();
    botoes[(i + passos[evento.key] + botoes.length) % botoes.length].focus();
  });
  function cancelarNaipes() {
    fecharNaipes();
    anunciar("O 8 continua na sua mão.");
    atualizarFoco(true);
  }
  naipesCancelar.addEventListener("click", cancelarNaipes);
  dialogoNaipes.addEventListener("cancel", (evento) => {
    evento.preventDefault();
    cancelarNaipes();
  });

  // ---------- Jogadas ----------

  function limparDica() {
    clearTimeout(dicaTimer);
    for (const el of [...cartasEl, monteEl]) el.classList.remove("om-dica");
  }

  function trocarEstado(novo) {
    estado = novo;
    limparDica();
  }

  /** Texto de uma jogada feita, para o aviso e o leitor de tela. */
  function textoJogada(j, id) {
    const quem = j === 0 ? "Você jogou" : `${nome(j)} jogou`;
    let texto = `${quem} ${L.comArtigo(id)}`;
    if (L.valor(id) === L.OITO && estado.maos[j].length) texto += ` e pediu ${L.nomeNaipe(estado.naipe)}`;
    texto += ".";
    if (estado.fase === "jogando" && estado.maos[j].length === 1) texto += ` ${j === 0 ? "Você está com a" : `${nome(j)} está com a`} última carta!`;
    return texto;
  }

  function tremer(id) {
    const face = elementoDe[id].firstChild;
    face.classList.remove("tremendo");
    void face.offsetWidth;
    face.classList.add("tremendo");
  }

  /** Um toque (ou Enter) numa carta da sua mão. */
  function tocarCarta(id) {
    if (ocupado()) return;
    if (estado.fase !== "jogando") {
      avisar(estado.fase === "fimRodada" ? "A rodada acabou: toque em Próxima rodada para continuar." : "A partida acabou: comece outra.");
      return;
    }
    if (estado.vez !== 0) {
      avisar(`Espere a sua vez: agora é a vez de ${nome(estado.vez)}.`);
      return;
    }
    if (!L.serve(estado, id)) {
      tremer(id);
      som.tocar("erro");
      const nenhuma = !L.cartasQueServem(estado).length;
      avisar(`${textoPedido()}${nenhuma ? (L.podeComprar(estado) ? " Nenhuma das suas serve: compre do monte." : " Nenhuma das suas serve: passe a vez.") : ""}`);
      return;
    }
    if (L.precisaNaipe(estado, id)) {
      abrirNaipes(id);
      return;
    }
    jogarSua(id);
  }

  function jogarSua(id, naipe) {
    const novo = L.jogar(estado, id, naipe);
    if (!novo) return;
    ultimaComprada = null;
    trocarEstado(novo);
    esconderAviso();
    desenhar();
    som.tocar(L.valor(id) === L.OITO && estado.fase === "jogando" ? "virar" : "pousar");
    const texto = textoJogada(0, id);
    if (L.valor(id) === L.OITO && estado.fase === "jogando") avisar(texto);
    else anunciar(texto);
    salvar();
    depoisDaJogada();
  }

  function depoisDaJogada() {
    if (estado.fase !== "jogando") {
      fimDaRodada();
      return;
    }
    seguir(PAUSA_DEPOIS);
  }

  /** Monte vazio: o descarte, menos a carta de cima, é embaralhado e vira o monte. */
  function refazerMonte() {
    const novo = L.reabastecer(estado);
    if (!novo) return false;
    trocarEstado(novo);
    // As cartas que estavam à vista no descarte trocam de elemento entre si
    sortearElementos(estado.monte);
    const atrasos = new Map(estado.monte.map((id, k) => [id, Math.min(k, 14) * 18]));
    desenhar({ atrasos });
    som.tocar("embaralhar");
    avisar("O monte acabou: o descarte foi embaralhado e virou o monte novo.");
    salvar();
    ocupar(DURACAO + 14 * 18 + 80);
    return true;
  }

  function comprarSua() {
    const novo = L.comprar(estado);
    if (!novo) return;
    trocarEstado(novo);
    const id = estado.maos[0][estado.maos[0].length - 1];
    ultimaComprada = id;
    esconderAviso();
    desenhar();
    som.tocar("deslizar");
    ocupar(DURACAO);
    const serve = L.serve(estado, id);
    let texto = `Você comprou ${L.comArtigo(id)}.`;
    if (serve) texto += " Ela serve: toque nela para jogar.";
    else if (L.cartasQueServem(estado).length) texto += " Ela não serve, mas outra carta sua serve.";
    else if (L.podeComprar(estado)) texto += " Não serve: compre outra.";
    else texto += " Não serve, e não há mais o que comprar: passe a vez.";
    anunciar(texto);
    salvar();
  }

  /** Um toque no monte: compra, embaralha o descarte quando o monte acabou ou passa a vez. */
  function acaoMonte() {
    if (ocupado()) return;
    if (estado.fase !== "jogando") return;
    if (estado.vez !== 0) {
      avisar(`Espere a sua vez: agora é a vez de ${nome(estado.vez)}.`);
      return;
    }
    if (L.podePassar(estado)) {
      trocarEstado(L.passar(estado));
      ultimaComprada = null;
      esconderAviso();
      desenhar();
      anunciar("Você passou a vez.");
      salvar();
      seguir(PAUSA_DEPOIS);
      return;
    }
    if (!L.podeComprar(estado)) {
      som.tocar("erro");
      avisar("Não há mais o que comprar: jogue uma das cartas que servem.");
      return;
    }
    if (!estado.monte.length) {
      refazerMonte();
      agendar(comprarSua, DURACAO + 14 * 18 + 100);
      return;
    }
    comprarSua();
  }

  // ---------- Vez do computador ----------

  /** Depois de cada jogada: se a vez é do computador, ele joga depois de uma pausa. */
  function seguir(espera = PAUSA_PENSAR) {
    if (estado.fase !== "jogando") return;
    if (estado.vez === 0) {
      informarSuaVez();
      return;
    }
    agendar(turnoComputador, espera);
  }

  function informarSuaVez() {
    const servem = L.cartasQueServem(estado).length;
    let texto;
    if (servem) texto = `Sua vez. ${textoPedido()}`;
    else if (L.podeComprar(estado)) texto = `Sua vez. ${textoPedido()} Nenhuma das suas serve: compre do monte.`;
    else texto = "Sua vez. Nenhuma carta serve e não há o que comprar: toque no monte para passar a vez.";
    // Não apaga o aviso da jogada anterior; só acrescenta, para o leitor de tela
    status.textContent = status.textContent && !status.textContent.startsWith("Sua vez") ? `${status.textContent} ${texto}` : texto;
  }

  /** Pausado enquanto um diálogo está aberto ou a página está escondida. */
  function retomarComputador() {
    if (!esperando || !estado || estado.fase !== "jogando" || estado.vez === 0) return;
    if (dialogo.open || dialogoNaipes.open || document.visibilityState === "hidden") return;
    esperando = false;
    agendar(turnoComputador, PAUSA_COMPRA);
  }

  function turnoComputador() {
    if (estado.fase !== "jogando" || estado.vez === 0) return;
    if (dialogo.open || dialogoNaipes.open || document.visibilityState === "hidden") {
      esperando = true;
      return;
    }
    const j = estado.vez;
    const jogada = L.escolherJogada(estado);
    // O aviso da jogada anterior já não vale
    esconderAviso();
    if (jogada.acao === "comprar") {
      if (!estado.monte.length) {
        refazerMonte();
        agendar(turnoComputador, DURACAO + 14 * 18 + PAUSA_COMPRA);
        return;
      }
      trocarEstado(L.comprar(estado));
      desenhar();
      som.tocar("deslizar");
      anunciar(`${nome(j)} comprou ${estado.compradas === 1 ? "uma carta" : `mais uma carta (${estado.compradas})`}.`);
      salvar();
      agendar(turnoComputador, PAUSA_COMPRA);
      return;
    }
    if (jogada.acao === "passar") {
      trocarEstado(L.passar(estado));
      desenhar();
      avisar(`${nome(j)} passou a vez: nada serve e não há o que comprar.`);
      salvar();
      seguir(PAUSA_DEPOIS);
      return;
    }
    trocarEstado(L.jogar(estado, jogada.carta, jogada.naipe));
    desenhar();
    const oito = L.valor(jogada.carta) === L.OITO && estado.fase === "jogando";
    som.tocar(oito ? "virar" : "pousar");
    const texto = textoJogada(j, jogada.carta);
    if (oito || (estado.fase === "jogando" && estado.maos[j].length === 1)) avisar(texto);
    else anunciar(texto);
    salvar();
    depoisDaJogada();
  }

  // ---------- Fim da rodada e da partida ----------

  /** Conta a rodada (e a partida) nas estatísticas na hora; o diálogo abre depois de uma pausa. */
  function fimDaRodada() {
    const r = estado.rodadas[estado.rodadas.length - 1];
    const modo = estado.modo;
    if (r.vencedor === 0) estatisticas = { ...estatisticas, [modo]: L.registrarRodada(estatisticas[modo]) };
    if (estado.fase === "fimPartida") {
      estatisticas = { ...estatisticas, [modo]: L.registrarResultado(estatisticas[modo], { venceu: estado.vencedor === 0 }) };
    }
    gravar(CHAVE_ESTATISTICAS, estatisticas);
    salvar();
    desenharEstatisticas();
    ocupar(PAUSA_FIM);
    if (estado.fase === "fimPartida") {
      som.tocar(estado.vencedor === 0 ? "vitoria" : "derrota");
      if (estado.vencedor === 0) festejar();
      agendar(abrirFimDaPartida, PAUSA_FIM + 300);
    } else {
      som.tocar(r.vencedor === 0 ? "completo" : "derrota");
      agendar(abrirFimDaRodada, PAUSA_FIM);
    }
  }

  function festejar() {
    let k = 0;
    for (const id of estado.descarte.slice(-6)) elementoDe[id].style.setProperty("--k", String(k++));
    mesa.classList.add("om-festa");
    setTimeout(() => mesa.classList.remove("om-festa"), 2200);
  }

  /** Quanto sobrou na mão de cada um e o placar até agora. */
  function secoesDaRodada() {
    const r = estado.rodadas[estado.rodadas.length - 1];
    const outros = [...Array(estado.modo).keys()].filter((j) => j !== r.vencedor);
    const sobras = outros.map((j) => [`${nome(j)} · ${textoCartas(estado.maos[j].length)}`, textoPontosDe(L.pontosDaMao(estado.maos[j]))]);
    sobras.push([r.vencedor === 0 ? "Você marcou" : `${nome(r.vencedor)} marcou`, `+${textoPontosDe(r.ganhos[r.vencedor])}`, true]);
    const placarAtual = L.classificacao(estado).map((j) => [nome(j), textoPontosDe(estado.pontos[j]), j === 0]);
    return [
      { titulo: "Cartas que sobraram", linhas: sobras },
      { titulo: `Placar (até ${L.META})`, linhas: placarAtual },
    ];
  }

  function abrirFimDaRodada() {
    if (estado.fase !== "fimRodada") return;
    const r = estado.rodadas[estado.rodadas.length - 1];
    const ganho = r.ganhos[r.vencedor];
    const voce = r.vencedor === 0;
    abrirDialogo({
      titulo: voce ? "Você venceu a rodada!" : `${nome(r.vencedor)} venceu a rodada`,
      texto: `${voce ? "Você ficou" : `${nome(r.vencedor)} ficou`} sem cartas e marcou ${textoPontosDe(ganho)}, a soma das cartas que sobraram nas outras mãos.`,
      secoes: secoesDaRodada(),
      botoes: [
        { rotulo: "Próxima rodada", acao: proximaRodada },
        { rotulo: "Ver a mesa", acao: () => anunciar("Toque em Próxima rodada quando quiser continuar."), secundario: true },
      ],
      aoCancelar: () => anunciar("Toque em Próxima rodada quando quiser continuar."),
    });
  }

  function abrirFimDaPartida() {
    if (estado.fase !== "fimPartida") return;
    const v = estado.vencedor;
    const voce = v === 0;
    const ranking = L.classificacao(estado).map((j, i) => [`${i + 1}º ${nome(j)}`, textoPontosDe(estado.pontos[j]), j === 0]);
    const secoes = [{ titulo: "Classificação", linhas: ranking }];
    const e = estatisticas[estado.modo];
    secoes.push({
      titulo: "Suas estatísticas",
      linhas: [
        ["Vitórias", `${L.formatarNumero(e.vitorias)} de ${L.formatarNumero(e.jogadas)}`],
        ["Vitórias seguidas", L.formatarNumero(e.sequencia)],
      ],
    });
    const { semente, modo } = estado;
    const rodadas = estado.rodadas.length;
    abrirDialogo({
      titulo: voce ? "Você venceu a partida!" : `${nome(v)} venceu a partida`,
      texto: `${voce ? "Você chegou" : `${nome(v)} chegou`} a ${textoPontosDe(estado.pontos[v])} em ${rodadas} ${rodadas === 1 ? "rodada" : "rodadas"}.`,
      secoes,
      botoes: [
        { rotulo: "Nova partida", acao: () => novaPartida({ modo }) },
        { rotulo: "Jogar esta de novo", acao: () => novaPartida({ modo, semente }), secundario: true },
        { rotulo: "Fechar", acao: () => {}, secundario: true },
      ],
    });
  }

  // ---------- Estatísticas ----------

  function desenharEstatisticas() {
    const modo = estado ? estado.modo : L.MODO_PADRAO;
    const e = estatisticas[modo];
    estModo.textContent = L.textoModo(modo);
    const linhas = [
      ["Partidas", L.formatarNumero(e.jogadas)],
      ["Vitórias", `${L.formatarNumero(e.vitorias)} (${L.porcentagemVitorias(e)}%)`],
      ["Rodadas vencidas", L.formatarNumero(e.rodadas)],
      ["Vitórias seguidas", L.formatarNumero(e.sequencia)],
      ["Maior sequência", L.formatarNumero(e.melhorSequencia)],
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
    if (!estado || !estado.iniciado || estado.fase === "fimPartida") return;
    estatisticas = { ...estatisticas, [estado.modo]: L.registrarResultado(estatisticas[estado.modo], { venceu: false }) };
    gravar(CHAVE_ESTATISTICAS, estatisticas);
  }

  // ---------- Partida e rodadas ----------

  /** Ordem em que as cartas saíram do monte: uma por jogador, a partir de quem começa, e o descarte. */
  function ordemDaDistribuicao() {
    const lista = [];
    const n = L.cartasPorJogador(estado.modo);
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < estado.modo; j++) {
        const mao = estado.maos[(estado.vez + j) % estado.modo];
        if (k < mao.length) lista.push(mao[k]);
      }
    }
    lista.push(estado.descarte[0]);
    return lista;
  }

  /** Todas as cartas no monte, viradas, e daí cada uma para o seu lugar. Devolve a duração. */
  function animarDistribuicao() {
    if (reduzirMovimento.matches) {
      desenhar({ animar: false });
      return 0;
    }
    mesa.classList.add("sem-animacao");
    for (const el of cartasEl) {
      clearTimeout(el._revela);
      el.style.transitionDelay = "";
      el.style.translate = `${g.monteX}px ${g.centroY}px`;
      el.style.scale = "";
      el.style.rotate = "";
      el.classList.remove("coberta", "jogavel", "apagada", "om-nova");
      el._face = undefined;
      mostrarFace(el, 0, false);
      el._pos = { x: g.monteX, y: g.centroY, escala: 1, z: 10 };
    }
    void mesa.offsetWidth;
    mesa.classList.remove("sem-animacao");
    const ordemIds = ordemDaDistribuicao();
    const atrasos = new Map(ordemIds.map((id, k) => [id, k * PASSO_DISTRIBUIR]));
    desenhar({ atrasos, revelarDepois: true });
    return ordemIds.length * PASSO_DISTRIBUIR + DURACAO;
  }

  /** Começa a rodada de [novo]: recolhe as cartas, sorteia os elementos e distribui. */
  function comecarRodada(novo, { recolher = true, aviso = "" } = {}) {
    cancelarAgendados();
    fecharDialogo();
    fecharNaipes();
    limparDica();
    ultimaComprada = null;
    mesa.classList.remove("om-festa");
    esconderAviso();
    const distribuir = () => {
      estado = novo;
      sortearElementos([...Array(L.CARTAS).keys()]);
      medir();
      foco = { tipo: "mao", indice: 0 };
      const duracao = animarDistribuicao();
      desenharEstatisticas();
      salvar();
      som.tocar("embaralhar");
      ocupar(duracao);
      anunciar(`${aviso}Rodada ${estado.rodada}. ${estado.vez === 0 ? "Você começa." : `${nome(estado.vez)} começa.`}`);
      agendar(() => seguir(estado.vez === 0 ? 0 : PAUSA_PENSAR), duracao);
    };
    if (!recolher || reduzirMovimento.matches || !estado) {
      distribuir();
      return;
    }
    // As cartas voltam para o monte antes da nova distribuição
    for (const el of cartasEl) {
      clearTimeout(el._revela);
      el.style.transitionDelay = "";
      el.style.translate = `${g.monteX}px ${g.centroY}px`;
      el.style.scale = "";
      el.style.rotate = "";
      if (el._face !== null && el._face !== undefined) {
        el._face = undefined;
        mostrarFace(el, 0, false);
        virar(el);
      }
    }
    ocupar(DURACAO + 200);
    agendar(distribuir, DURACAO + 120);
  }

  function proximaRodada() {
    if (estado.fase !== "fimRodada") return;
    comecarRodada(L.proximaRodada(estado));
  }

  function novaPartida({ modo = estado ? estado.modo : L.MODO_PADRAO, semente = L.novaSemente() } = {}) {
    registrarAbandono();
    const novo = L.novoJogo(modo, semente);
    gravar(CHAVE_MODO, novo.modo);
    const mudouModo = !estado || estado.modo !== novo.modo;
    comecarRodada(novo, {
      recolher: !mudouModo,
      aviso: `Nova partida com ${L.textoModo(novo.modo)}, número ${L.formatarNumero(semente)}. `,
    });
  }

  function confirmarNovaPartida(opcoes = {}) {
    if (!estado.iniciado || estado.fase === "fimPartida") {
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

  // ---------- Dica ----------

  function mostrarDica() {
    if (estado.fase !== "jogando" || estado.vez !== 0 || ocupado()) return;
    limparDica();
    const jogada = L.escolherJogada(estado);
    som.tocar("dica");
    if (jogada.acao === "jogar") {
      elementoDe[jogada.carta].classList.add("om-dica");
      const pedir = jogada.naipe !== undefined ? ` e peça ${L.nomeNaipe(jogada.naipe)}` : "";
      avisar(`Dica: jogue ${L.comArtigo(jogada.carta)}${pedir}.`);
    } else {
      const topoMonte = estado.monte.length ? elementoDe[estado.monte[estado.monte.length - 1]] : monteEl;
      topoMonte.classList.add("om-dica");
      if (jogada.acao === "passar") avisar("Dica: nada serve e não há o que comprar. Passe a vez tocando no monte.");
      else if (L.cartasQueServem(estado).length) avisar("Dica: guarde o 8 para depois e compre uma carta do monte.");
      else avisar("Dica: nenhuma carta serve. Compre do monte.");
    }
    dicaTimer = setTimeout(limparDica, 2600);
  }

  // ---------- Toque, clique e teclado ----------

  function ativar(parada) {
    if (!parada) return;
    if (parada.tipo === "mao") tocarCarta(parada.id);
    else if (parada.tipo === "monte") acaoMonte();
    else if (parada.tipo === "descarte") anunciar(`${rotuloDescarte()}${estado.fase === "jogando" && estado.vez === 0 ? ` ${textoPedido()}` : ""}`);
    else anunciar(rotuloAssento(parada.j));
  }

  mesa.addEventListener("click", (evento) => {
    const cartaEl = evento.target.closest(".om-carta");
    if (cartaEl) {
      const id = idDoElemento(cartaEl);
      if (id < 0) return;
      if (estado.maos[0].includes(id)) tocarCarta(id);
      else if (estado.monte.includes(id)) acaoMonte();
      return;
    }
    const alvo = evento.target.closest(".om-vaga, .om-pilha, .om-assento");
    if (!alvo) return;
    const parada = paradas().find((p) => p.el === alvo);
    if (!parada) return;
    // Leitores de tela ativam a vaga com um clique sem ponteiro; com o ponteiro, só o monte vazio
    // recebe o clique direto (com cartas, o toque cai na carta de cima)
    if (evento.detail === 0) {
      focar(parada);
      ativar(parada);
    } else if (parada.tipo === "monte") {
      acaoMonte();
    }
  });
  mesa.addEventListener("contextmenu", (evento) => evento.target.closest(".om-carta") && evento.preventDefault());

  mesa.addEventListener("keydown", (evento) => {
    if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const atual = paradas().find((p) => p.el === evento.target);
    if (!atual) return;
    switch (evento.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown":
        focar(vizinha(atual, evento.key));
        atualizarFoco();
        break;
      case "Enter":
      case " ":
        focar(atual);
        ativar(atual);
        break;
      default:
        return;
    }
    evento.preventDefault();
  });

  mesa.addEventListener("focusin", (evento) => {
    const atual = paradas().find((p) => p.el === evento.target);
    if (!atual) return;
    focar(atual);
    atualizarFoco(false);
  });
  mesa.addEventListener("focusout", () => setTimeout(() => atualizarFoco(false), 0));

  // ---------- Botões ----------

  botaoDica.addEventListener("click", mostrarDica);
  botaoOrdem.addEventListener("click", () => {
    ordem = ordem === "naipe" ? "valor" : "naipe";
    gravar(CHAVE_ORDEM, ordem);
    desenhar();
    anunciar(ordem === "naipe" ? "Mão ordenada por naipe, com os 8 no fim." : "Mão ordenada por valor.");
  });
  botaoProxima.addEventListener("click", proximaRodada);
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
      texto: `As estatísticas com ${L.textoModo(modo)} voltam para zero. Isso não pode ser desfeito.`,
      botoes: [
        {
          rotulo: "Sim, zerar",
          acao: () => {
            estatisticas = { ...estatisticas, [modo]: L.estatisticasVazias() };
            gravar(CHAVE_ESTATISTICAS, estatisticas);
            desenharEstatisticas();
            anunciar("Estatísticas zeradas.");
          },
        },
        { rotulo: "Não", acao: () => {}, secundario: true },
      ],
    });
  });
  som.ligarBotao(raiz.querySelector("#om-som"));

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
    if (document.visibilityState === "hidden") salvar();
    else retomarComputador();
  });
  window.addEventListener("pagehide", salvar);

  // ---------- Início ----------

  const salvas = lerJson(CHAVE_ESTATISTICAS) || {};
  for (const modo of L.MODOS) estatisticas[modo] = L.lerEstatisticas(salvas[modo]);
  if (lerJson(CHAVE_ORDEM) === "valor") ordem = "valor";
  const restaurada = L.restaurar(lerJson(CHAVE_PARTIDA));
  if (restaurada && restaurada.fase !== "fimPartida") {
    estado = restaurada;
    sortearElementos([...Array(L.CARTAS).keys()]);
    medir();
    ultimaMedida = `${mesa.clientWidth}x${window.innerHeight}`;
    desenhar({ animar: false });
    desenharEstatisticas();
    anunciar("Partida anterior retomada.");
    if (estado.fase === "fimRodada") agendar(abrirFimDaRodada, 500);
    else seguir(PAUSA_PENSAR + 300);
  } else {
    const modo = L.MODOS.includes(lerJson(CHAVE_MODO)) ? lerJson(CHAVE_MODO) : L.MODO_PADRAO;
    estado = null;
    novaPartida({ modo });
    ultimaMedida = `${mesa.clientWidth}x${window.innerHeight}`;
  }
})();
