"use strict";
/*
 * Interface do Mico. As regras, as jogadas dos computadores e as estatísticas ficam em
 * mico-logica.js.
 *
 * As 51 cartas são criadas uma vez e só mudam de lugar (propriedades CSS translate, rotate e
 * scale). Nenhum elemento traz o número da carta: cada partida sorteia que elemento faz o papel de
 * cada carta, e o desenho da frente só entra no elemento enquanto a carta está virada para cima.
 * Quando um computador embaralha a mão, as cartas dele se juntam e trocam de elemento antes de se
 * abrirem de novo, então nada na página diz onde ficou cada uma.
 *
 * Na sua vez, a mão do próximo jogador vem para o meio da mesa, virada para baixo: um toque (ou as
 * setas e Enter) tira uma carta. A sua mão fica em ordem de valor; o mico pode ser arrastado para
 * qualquer lugar (ou movido com Shift e as setas). A partida, o modo e as estatísticas ficam no
 * localStorage.
 */
(() => {
  const raiz = document.querySelector(".mico");
  if (!raiz || typeof LogicaMico !== "object") return;
  const M = LogicaMico;

  const CHAVE_PARTIDA = "efs-mico-partida";
  const CHAVE_ESTATISTICAS = "efs-mico-estatisticas";
  const CHAVE_MODO = "efs-mico-modo";
  const ARRASTO_MINIMO = 6;
  const TRAVA_DIALOGO_MS = 500;
  const MENSAGEM_MS = 3400;
  /** Duração do voo de uma carta (a mesma do --mi-voo do CSS). */
  const VOO_MS = 400;
  const EMBARALHAR_MS = 230;
  /** O computador "pensa" um pouco antes de tirar a carta. */
  const PAUSA_VEZ_MS = 600;
  /** A carta sua que o computador escolheu sobe um pouco antes de ir embora. */
  const ESCOLHA_MS = 420;
  const PAUSA_PAR_MS = 200;
  const PAUSA_ENTRE_MS = 300;
  const SAIDA_MS = 800;
  const PASSO_DISTRIBUICAO_MS = 16;
  /** Tamanho das cartas nas mãos dos computadores, no alto da mesa. */
  const MINI = 0.5;
  const reduzirMovimento = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  const mesa = raiz.querySelector("#mi-mesa");
  const textoPartida = raiz.querySelector("#mi-partida");
  const botaoEmbaralhar = raiz.querySelector("#mi-embaralhar");
  const botaoPular = raiz.querySelector("#mi-pular");
  const botaoNova = raiz.querySelector("#mi-nova");
  const botoesModo = [...raiz.querySelectorAll("[data-modo]")];
  const status = raiz.querySelector("#mi-status");
  const estLista = raiz.querySelector("#mi-est-lista");
  const estModo = raiz.querySelector("#mi-est-modo");
  const botaoZerar = raiz.querySelector("#mi-zerar");
  const dialogo = raiz.querySelector("#mi-dialogo");
  const dialogoArte = raiz.querySelector("#mi-dialogo-arte");
  const dialogoTitulo = raiz.querySelector("#mi-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#mi-dialogo-texto");
  const dialogoDados = raiz.querySelector("#mi-dialogo-dados");
  const dialogoBotoes = raiz.querySelector("#mi-dialogo-botoes");
  // Se sons.js não carregar, o jogo segue mudo e o botão some
  const som = typeof Sons === "object" ? Sons.criar("mico", raiz) : { tocar() {}, ligarBotao: (b) => b && (b.hidden = true) };

  /** O macaquinho do mico: um desenho próprio, feito só de círculos, num selo amarelo. */
  const MACACO =
    '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
    '<circle cx="50" cy="50" r="47" fill="#ffd54a" stroke="#c98a00" stroke-width="4"/>' +
    '<circle cx="21" cy="50" r="11" fill="#8a5a33"/><circle cx="79" cy="50" r="11" fill="#8a5a33"/>' +
    '<circle cx="21" cy="50" r="6" fill="#f3c9a1"/><circle cx="79" cy="50" r="6" fill="#f3c9a1"/>' +
    '<circle cx="50" cy="51" r="29" fill="#8a5a33"/>' +
    '<path d="M46 23c-2-8 6-13 12-9-5 1-7 5-5 9z" fill="#8a5a33"/>' +
    '<ellipse cx="41" cy="47" rx="10" ry="11" fill="#f3c9a1"/><ellipse cx="59" cy="47" rx="10" ry="11" fill="#f3c9a1"/>' +
    '<ellipse cx="50" cy="63" rx="19" ry="13" fill="#f3c9a1"/>' +
    '<circle cx="42" cy="48" r="4" fill="#2b1a10"/><circle cx="58" cy="48" r="4" fill="#2b1a10"/>' +
    '<circle cx="43.3" cy="46.6" r="1.3" fill="#fff"/><circle cx="59.3" cy="46.6" r="1.3" fill="#fff"/>' +
    '<circle cx="46.5" cy="58.5" r="1.6" fill="#2b1a10"/><circle cx="53.5" cy="58.5" r="1.6" fill="#2b1a10"/>' +
    '<path d="M42 65q8 7 16 0" fill="none" stroke="#2b1a10" stroke-width="2.6" stroke-linecap="round"/>' +
    '<ellipse cx="34" cy="59" rx="3.5" ry="2.2" fill="#f08c7c" opacity=".8"/>' +
    '<ellipse cx="66" cy="59" rx="3.5" ry="2.2" fill="#f08c7c" opacity=".8"/>' +
    "</svg>";

  // ---------- Elementos da mesa ----------

  const cartasEl = M.BARALHO.map(() => {
    const el = document.createElement("div");
    el.className = "mi-carta";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<span class="mi-giro"><span class="mi-frente"></span><span class="mi-verso"></span></span>';
    return el;
  });
  const frentesEl = cartasEl.map((el) => el.querySelector(".mi-frente"));
  /** Que carta está desenhada na frente de cada elemento (null: virada para baixo). */
  const faceDoEl = cartasEl.map(() => null);
  const zTimers = cartasEl.map(() => null);
  /** Que elemento faz o papel de cada carta, e o contrário; sorteados a cada partida. */
  const elDe = new Map();
  const idDoEl = cartasEl.map(() => null);

  const anel = document.createElement("div");
  anel.className = "mi-anel";
  anel.hidden = true;
  const faixa = document.createElement("p");
  faixa.className = "mi-faixa";
  faixa.setAttribute("aria-hidden", "true");
  const faixaTexto = document.createElement("span");
  faixa.append(faixaTexto);
  const pilhaRotulo = document.createElement("p");
  pilhaRotulo.className = "mi-pilha-rotulo";
  pilhaRotulo.setAttribute("aria-hidden", "true");
  // Aviso curto e visível sobre a mesa; o leitor de tela recebe o mesmo texto pelo status
  const mensagemEl = document.createElement("p");
  mensagemEl.className = "mi-mensagem";
  mensagemEl.setAttribute("aria-hidden", "true");
  mesa.replaceChildren(...cartasEl, faixa, pilhaRotulo, anel, mensagemEl);

  /** Alvos do teclado (invisíveis, sob as cartas): a mesa, as cartas oferecidas e as suas. */
  const vagasEl = [];
  function vaga(i) {
    while (vagasEl.length <= i) {
      const el = document.createElement("div");
      el.className = "mi-vaga";
      el.tabIndex = -1;
      el.setAttribute("role", "button");
      el.dataset.i = String(vagasEl.length);
      mesa.prepend(el);
      vagasEl.push(el);
    }
    return vagasEl[i];
  }

  let etiquetasEl = [];

  // ---------- Estado ----------

  let estado;
  /** O que está desenhado: durante uma animação, pode ser um passo intermediário da jogada. */
  let vista;
  let nomes = [];
  let estatisticas = {};
  let g = null;
  let posicoes = [];
  /** Cada partida, retomada ou pulo para o fim troca a geração; as animações antigas param sozinhas. */
  let geracao = 0;
  /** Há uma jogada em andamento: a mesa não aceita outra. */
  let ocupado = false;
  /** A sua mão está no meio de uma jogada (você tirando ou alguém tirando de você). */
  let maoEmJogo = false;
  /** O jogador cuja mão está aberta no meio da mesa para você escolher. */
  let ofertaDe = null;
  /** De quem a mesa mostra que é a vez. */
  let vezMostrada = null;
  /** A carta sua que um computador escolheu e que vai sair. */
  let levantada = null;
  let focoLevantado = null;
  const juntando = new Set();
  const embaralhando = new Set();
  let fechadasExtra = new Set();
  let previaMico = null;
  let pressao = null;
  let fimMostrado = false;
  let concluida = false;
  let foco = { grupo: "mesa", k: 0 };
  let alvos = [];

  const nomeDe = (j) => nomes[j].nome;
  const doNome = (j) => `${nomes[j].artigo === "a" ? "da" : "do"} ${nomes[j].nome}`;
  const oNome = (j) => `${nomes[j].artigo} ${nomes[j].nome}`;
  const ele = (j) => (nomes[j].artigo === "a" ? "ela" : "ele");
  const seu = (id) => (M.artigoCarta(id) === "a" ? "a sua" : "o seu");
  const plural = (n, um, varios) => `${M.formatarNumero(n)} ${n === 1 ? um : varios}`;
  const elDaCarta = (id) => cartasEl[elDe.get(id)];

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
    if (!estado || concluida || M.terminou(estado)) return;
    gravar(CHAVE_PARTIDA, { estado });
  }

  // ---------- Elementos e faces ----------

  function htmlDaFrente(id) {
    const naipe = M.NAIPES[M.naipe(id)].id;
    const mico = id === M.MICO;
    const canto =
      `<span class="mi-indice"><span class="mi-valor">${M.textoValor(id)}</span>` +
      `<i class="mi-naipe mi-naipe-${naipe}"></i>${mico ? `<span class="mi-macaco-mini">${MACACO}</span>` : ""}</span>`;
    if (mico) return `${canto}<span class="mi-centro mi-selo">${MACACO}</span>`;
    if (M.valor(id) > 10) return `${canto}<span class="mi-centro mi-figura">${M.textoValor(id)}</span>`;
    return `${canto}<span class="mi-centro"><i class="mi-naipe mi-naipe-${naipe}"></i></span>`;
  }

  /** Desenha a frente de uma carta no elemento [e], ou apaga (id null) quando ela fica virada. */
  function pintar(e, id) {
    if (faceDoEl[e] === id) return;
    faceDoEl[e] = id;
    cartasEl[e].classList.toggle("vermelha", id !== null && M.vermelha(id));
    frentesEl[e].innerHTML = id === null ? "" : htmlDaFrente(id);
  }

  /** Cada partida sorteia que elemento é cada carta. */
  function atribuirElementos() {
    const ordem = M.embaralhar([...cartasEl.keys()], Math.random);
    M.BARALHO.forEach((id, k) => {
      elDe.set(id, ordem[k]);
      idDoEl[ordem[k]] = id;
    });
    cartasEl.forEach((el, e) => {
      pintar(e, null);
      clearTimeout(zTimers[e]);
      el.classList.remove("aberta", "festa", "virando", "levantada", "escolhida", "oferta", "mico-meu", "no-ar");
    });
    posicoes = [];
  }

  /** As cartas de uma mão, já juntas num só lugar, trocam de elemento entre si. */
  function trocarElementos(ids) {
    const els = M.embaralhar(
      ids.map((id) => elDe.get(id)),
      Math.random,
    );
    ids.forEach((id, k) => {
      elDe.set(id, els[k]);
      idDoEl[els[k]] = id;
    });
  }

  function criarEtiquetas() {
    for (const el of etiquetasEl) el.remove();
    etiquetasEl = nomes.map((jogador, j) => {
      const el = document.createElement("div");
      el.className = `mi-etiqueta${j === 0 ? " mi-etiqueta-minha" : ""}`;
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = '<span class="mi-pilula"><span class="mi-nome"></span><span class="mi-conta"></span></span>';
      el.querySelector(".mi-nome").textContent = jogador.nome;
      mesa.append(el);
      return el;
    });
  }

  // ---------- Medidas da mesa ----------

  function medir() {
    const W = mesa.clientWidth;
    const estreita = W < 480;
    const m = Math.max(8, Math.round(W * 0.018));
    const cw = Math.round(Math.min(82, Math.max(48, W * 0.118)));
    const ch = Math.round(cw * 1.4);
    const nomeH = estreita ? 22 : 26;
    const levante = Math.round(ch * 0.12);
    const assentoY = m;
    const miniH = ch * MINI;
    const faixaY = assentoY + nomeH + 5 + miniH + 4;
    const faixaH = estreita ? 44 : 34;
    // Topo das cartas do meio (a mesa com os pares e a mão oferecida)
    const meioY = faixaY + faixaH + levante + 2;
    const sPilha = estreita ? 0.72 : 0.8;
    const pilhaW = Math.round(cw * sPilha);
    const minhaNomeY = meioY + ch + 10;
    const maoY = minhaNomeY + nomeH + 4 + levante;
    const arco = Math.round(ch * 0.06);
    const altura = Math.round(maoY + ch + arco + m);
    g = { W, estreita, m, cw, ch, nomeH, levante, assentoY, miniH, faixaY, faixaH, meioY, sPilha, pilhaW, minhaNomeY, maoY, arco, altura };
    mesa.style.setProperty("--cw", `${cw}px`);
    mesa.style.setProperty("--ch", `${ch}px`);
    mesa.style.height = `${altura}px`;
  }

  /** Posição de uma carta pelo centro dela (as cartas giram e encolhem em torno do centro). */
  const pelocentro = (cx, cy, resto) => ({ x: cx - g.cw / 2, y: cy - g.ch / 2, ...resto });
  const centroDaPilha = () => ({ x: g.m + g.pilhaW / 2 + 2, y: g.meioY + (g.ch * g.sPilha) / 2 });

  function retanguloDoAssento(j) {
    const c = vista.modo - 1;
    const espaco = g.estreita ? 4 : 8;
    const w = (g.W - 2 * g.m - (c - 1) * espaco) / c;
    return { x: g.m + (j - 1) * (w + espaco), y: g.assentoY, w };
  }

  function lequeDaMinha(n) {
    const disponivel = g.W - 2 * g.m;
    const passo = n > 1 ? Math.min(g.cw * 0.62, (disponivel - g.cw) / (n - 1)) : 0;
    const total = g.cw + passo * (n - 1);
    return { passo, x0: g.m + (disponivel - total) / 2, meio: (n - 1) / 2, angulo: n > 1 ? Math.min(2.4, 16 / (n - 1)) : 0 };
  }

  function lequeDaOferta(n) {
    const inicio = g.m + g.pilhaW + g.cw * g.sPilha * 0.3 + 12;
    const disponivel = g.W - g.m - inicio;
    const passo = n > 1 ? Math.min(g.cw * 0.7, (disponivel - g.cw) / (n - 1)) : 0;
    const total = g.cw + passo * (n - 1);
    return { passo, x0: inicio + (disponivel - total) / 2, meio: (n - 1) / 2, angulo: n > 1 ? Math.min(1.6, 10 / (n - 1)) : 0 };
  }

  /**
   * A ordem da sua mão. No meio de uma animação, a vista pode estar um passo atrás do estado; se as
   * cartas forem as mesmas, vale a ordem do estado (o mico pode ter mudado de lugar). Durante o
   * arrasto, o mico aparece no lugar em que vai ficar.
   */
  function ordemDaMinha() {
    let mao = vista.maos[0];
    const atual = estado.maos[0];
    if (mao !== atual && mao.length === atual.length && mao.every((id) => atual.includes(id))) mao = atual;
    if (previaMico !== null && mao.includes(M.MICO)) {
      mao = mao.filter((id) => id !== M.MICO);
      mao.splice(Math.min(previaMico, mao.length), 0, M.MICO);
    }
    return mao;
  }

  function calcularPosicoes() {
    const pos = [];
    const e = vista;
    // Mesa: os pares baixados, cada par meio aberto; só os dois últimos aparecem
    const pilha = centroDaPilha();
    e.mesa.forEach((id, i) => {
      const par = Math.floor(i / 2);
      const segunda = i % 2 === 1;
      const giro = ((par * 47) % 17) - 8 + (segunda ? 7 : -3);
      const dx = segunda ? g.cw * g.sPilha * 0.28 : 0;
      const dy = ((par * 29) % 5) - 2;
      pos[id] = pelocentro(pilha.x + dx, pilha.y + dy, { s: g.sPilha, r: giro, z: 50 + i, aberta: true, coberta: i < e.mesa.length - 4, onde: "mesa" });
    });
    e.maos.forEach((mao, j) => {
      const rapida = embaralhando.has(j);
      if (j === 0) {
        const minha = ordemDaMinha();
        const L = lequeDaMinha(minha.length);
        minha.forEach((id, k) => {
          const t = L.meio ? (k - L.meio) / L.meio : 0;
          pos[id] = juntando.has(0)
            ? { x: g.W / 2 - g.cw / 2, y: g.maoY, s: 1, r: 0, z: 600 + k, aberta: true, onde: "minha", rapida }
            : { x: L.x0 + k * L.passo, y: g.maoY + g.arco * t * t, s: 1, r: (k - L.meio) * L.angulo, z: 600 + k, aberta: true, onde: "minha", rapida };
        });
      } else if (j === ofertaDe) {
        const L = lequeDaOferta(mao.length);
        mao.forEach((id, k) => {
          const t = L.meio ? (k - L.meio) / L.meio : 0;
          pos[id] = { x: L.x0 + k * L.passo, y: g.meioY + g.arco * 0.6 * t * t, s: 1, r: (k - L.meio) * L.angulo, z: 400 + k, aberta: false, onde: "oferta" };
        });
      } else {
        const r = retanguloDoAssento(j);
        const cwm = g.cw * MINI;
        const n = mao.length;
        const passo = n > 1 ? Math.min(cwm * 0.42, (r.w - 6 - cwm) / (n - 1)) : 0;
        const total = cwm + passo * (n - 1);
        const cy = r.y + g.nomeH + 5 + g.miniH / 2;
        mao.forEach((id, k) => {
          const cx = juntando.has(j) ? r.x + r.w / 2 : r.x + (r.w - total) / 2 + cwm / 2 + k * passo;
          pos[id] = pelocentro(cx, cy, { s: MINI, r: 0, z: 100 + j * 30 + k, aberta: false, onde: "assento", rapida });
        });
      }
    });
    // No fim, o mico vai para o meio da mesa, aberto e maior
    if (fimMostrado) {
      // Um pouco abaixo do meio, para a carta aumentada não encostar na faixa de recado
      pos[M.MICO] = pelocentro(g.W / 2, g.meioY + g.ch * 0.68, { s: 1.2, r: -4, z: 1500, aberta: true, onde: "fim" });
    }
    return pos;
  }

  // ---------- Desenho ----------

  /** [atrasos]: espera, em milissegundos, antes de cada carta começar a andar. */
  function desenhar({ animar = true, atrasos = null } = {}) {
    if (!g) medir();
    const anteriores = posicoes;
    posicoes = calcularPosicoes();
    const semAnimacao = !animar || reduzirMovimento.matches;
    mesa.classList.toggle("sem-animacao", semAnimacao);
    const arrastado = pressao && pressao.ativo ? pressao.id : null;
    const podeTirar = ofertaDe !== null && !ocupado && estado.vez === 0;
    for (const id of M.BARALHO) {
      const p = posicoes[id];
      const e = elDe.get(id);
      const el = cartasEl[e];
      const antes = anteriores[id];
      const aberta = p.aberta && !fechadasExtra.has(id);
      p.aberta = aberta;
      pintar(e, aberta ? id : null);
      el.classList.toggle("aberta", aberta);
      el.classList.toggle("coberta", Boolean(p.coberta));
      el.classList.toggle("oferta", p.onde === "oferta" && podeTirar);
      el.classList.toggle("mico-meu", aberta && p.onde === "minha" && id === M.MICO);
      el.classList.toggle("escolhida", id === levantada);
      el.classList.toggle("levantada", id === levantada || id === focoLevantado);
      el.style.transitionDuration = p.rapida ? `${EMBARALHAR_MS}ms` : "";
      if (id === arrastado) continue;
      const mudou = !antes || antes.x !== p.x || antes.y !== p.y || antes.s !== p.s;
      const atraso = !semAnimacao && atrasos ? atrasos.get(id) || 0 : 0;
      el.style.transitionDelay = atraso ? `${atraso}ms` : "";
      el.style.translate = `${p.x}px ${p.y}px`;
      el.style.rotate = `${p.r}deg`;
      el.style.scale = String(p.s);
      // A carta que está indo para outro lugar passa por cima das outras durante o caminho
      const voando = mudou && antes && !semAnimacao;
      clearTimeout(zTimers[e]);
      el.style.zIndex = String(voando ? 1000 + p.z : p.z);
      if (voando) {
        zTimers[e] = setTimeout(() => {
          const atual = posicoes[idDoEl[e]];
          if (atual) el.style.zIndex = String(atual.z);
        }, VOO_MS + 30 + atraso);
      }
      if (antes && antes.aberta !== aberta && !semAnimacao) {
        el.classList.remove("virando");
        void el.offsetWidth;
        el.classList.add("virando");
      }
    }
    if (semAnimacao) requestAnimationFrame(() => mesa.classList.remove("sem-animacao"));
    desenharEtiquetas();
    desenharMeio();
    desenharControles();
    desenharVagas();
  }

  function desenharEtiquetas() {
    const fim = M.terminou(estado) && fimMostrado;
    etiquetasEl.forEach((el, j) => {
      const n = vista.maos[j].length;
      const lugar = M.colocacao(vista, j);
      const perdeu = fim && M.perdedor(estado) === j;
      el.querySelector(".mi-conta").textContent = perdeu ? "mico" : lugar ? M.textoPosicao(lugar) : String(n);
      el.classList.toggle("vez", vezMostrada === j && !fim);
      el.classList.toggle("saiu", Boolean(lugar));
      el.classList.toggle("perdeu", perdeu);
      if (j === 0) {
        el.style.translate = `${g.m}px ${g.minhaNomeY}px`;
        el.style.width = `${g.W - 2 * g.m}px`;
      } else {
        const r = retanguloDoAssento(j);
        el.style.translate = `${r.x}px ${r.y}px`;
        el.style.width = `${r.w}px`;
      }
      el.style.height = `${g.nomeH}px`;
    });
  }

  function desenharMeio() {
    faixa.style.translate = `0px ${g.faixaY}px`;
    faixa.style.width = `${g.W}px`;
    faixa.style.height = `${g.faixaH}px`;
    const pares = vista.mesa.length / 2;
    const pilha = centroDaPilha();
    pilhaRotulo.textContent = pares ? plural(pares, "par", "pares") : "Pares";
    pilhaRotulo.style.left = `${pilha.x + (pares ? g.cw * g.sPilha * 0.14 : 0)}px`;
    pilhaRotulo.style.top = `${g.meioY + g.ch * g.sPilha + 6}px`;
    pilhaRotulo.style.transform = "translateX(-50%)";
    mensagemEl.style.top = `${g.meioY + g.ch * 0.3}px`;
  }

  function desenharControles() {
    const fora = estado.maos[0].length === 0;
    const andando = !M.terminou(estado) && !concluida;
    botaoPular.hidden = !(fora && andando);
    botaoEmbaralhar.hidden = fora && andando;
    botaoEmbaralhar.disabled = !estado.maos[0].includes(M.MICO) || concluida;
    let texto = `Partida nº ${M.formatarNumero(estado.semente)} · ${M.textoModo(estado.modo)}`;
    if (!fora && andando) texto += ` · você tira ${doNome(M.alvoDe(estado, 0))}`;
    textoPartida.textContent = texto;
    for (const botao of botoesModo) {
      const ativo = Number(botao.dataset.modo) === estado.modo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
  }

  let mensagemTimer = null;

  function anunciar(texto) {
    status.textContent = texto;
    if (mensagemEl.classList.contains("visivel")) {
      clearTimeout(mensagemTimer);
      mensagemEl.classList.remove("visivel");
    }
  }

  /** Conta o que acontece na faixa da mesa e para o leitor de tela. */
  function narrar(texto) {
    faixaTexto.textContent = texto;
    anunciar(texto);
  }

  /** Explica, na tela e para o leitor de tela, por que algo não saiu. */
  function avisar(texto) {
    anunciar(texto);
    mensagemEl.textContent = texto;
    mensagemEl.classList.add("visivel");
    mensagemTimer = setTimeout(() => mensagemEl.classList.remove("visivel"), MENSAGEM_MS);
  }

  // ---------- Foco do teclado ----------

  /** Linha 0: a mesa e as cartas oferecidas; linha 1: a sua mão. */
  function listarAlvos() {
    const lista = [{ grupo: "mesa", k: 0, linha: 0 }];
    if (ofertaDe !== null && !fimMostrado) vista.maos[ofertaDe].forEach((_, k) => lista.push({ grupo: "oferta", k, linha: 0 }));
    if (!fimMostrado) ordemDaMinha().forEach((_, k) => lista.push({ grupo: "minha", k, linha: 1 }));
    return lista;
  }

  function idDoAlvo(a) {
    if (a.grupo === "oferta") return vista.maos[ofertaDe][a.k];
    if (a.grupo === "minha") return ordemDaMinha()[a.k];
    return null;
  }

  function retanguloDoAlvo(a) {
    if (a.grupo === "mesa") {
      return { x: g.m - 2, y: g.meioY - 4, w: g.pilhaW + g.cw * g.sPilha * 0.3 + 6, h: g.ch * g.sPilha + 26, r: 0, s: 1 };
    }
    const p = posicoes[idDoAlvo(a)];
    return { x: p.x, y: p.y, w: g.cw, h: g.ch, r: p.r, s: p.s };
  }

  function resumoDaMesa() {
    const pares = vista.mesa.length / 2;
    const partes = nomes.map((jogador, j) => {
      const quem = j === 0 ? "você" : jogador.nome;
      const lugar = M.colocacao(vista, j);
      if (lugar) return `${quem} saiu em ${M.textoPosicao(lugar)}`;
      const n = vista.maos[j].length;
      return `${quem}, ${plural(n, "carta", "cartas")}`;
    });
    const vez = vezMostrada === 0 ? " Sua vez." : vezMostrada !== null ? ` Vez ${doNome(vezMostrada)}.` : "";
    return `Mesa: ${pares ? plural(pares, "par baixado", "pares baixados") : "nenhum par baixado"}. ${partes.join("; ")}.${vez}`;
  }

  function rotuloDoAlvo(a) {
    if (a.grupo === "mesa") return resumoDaMesa();
    if (a.grupo === "oferta") {
      const n = vista.maos[ofertaDe].length;
      return `Carta ${a.k + 1} de ${n} ${doNome(ofertaDe)}, virada para baixo. Enter tira esta carta.`;
    }
    const mao = ordemDaMinha();
    const id = mao[a.k];
    const mico = id === M.MICO ? ", o mico. Shift e as setas mudam o mico de lugar" : "";
    return `Sua carta ${a.k + 1} de ${mao.length}: ${M.nomeCarta(id)}${mico}.`;
  }

  const indiceDoFoco = () => {
    const i = alvos.findIndex((a) => a.grupo === foco.grupo && a.k === foco.k);
    return i < 0 ? 0 : i;
  };

  /** O alvo com foco sumiu: o foco vai para o mais perto dele. */
  function corrigirFoco() {
    if (alvos.some((a) => a.grupo === foco.grupo && a.k === foco.k)) return;
    const mesmo = alvos.filter((a) => a.grupo === foco.grupo);
    if (mesmo.length) foco = { grupo: foco.grupo, k: Math.min(foco.k, mesmo.length - 1) };
    else if (foco.grupo === "oferta" && alvos.some((a) => a.grupo === "minha")) foco = { grupo: "minha", k: 0 };
    else foco = { grupo: "mesa", k: 0 };
  }

  function desenharVagas() {
    const tinhaFoco = mesa.contains(document.activeElement);
    alvos = listarAlvos();
    corrigirFoco();
    alvos.forEach((a, i) => {
      const el = vaga(i);
      const r = retanguloDoAlvo(a);
      el.hidden = false;
      el.style.translate = `${r.x}px ${r.y}px`;
      el.style.width = `${r.w}px`;
      el.style.height = `${r.h}px`;
      el.style.rotate = `${r.r}deg`;
      el.style.scale = String(r.s);
      el.setAttribute("aria-label", rotuloDoAlvo(a));
    });
    for (let i = alvos.length; i < vagasEl.length; i++) vagasEl[i].hidden = true;
    const i = indiceDoFoco();
    atualizarFoco(tinhaFoco && document.activeElement !== vagasEl[i]);
  }

  function atualizarFoco(mover = true) {
    const i = indiceDoFoco();
    vagasEl.forEach((el, k) => (el.tabIndex = k === i ? 0 : -1));
    const el = vagasEl[i];
    if (!el) return;
    if (mover) el.focus({ preventScroll: false });
    const ativo = document.activeElement === el && el.matches(":focus-visible");
    // A carta com foco sobe um pouco, como a carta sob o dedo
    const id = ativo ? idDoAlvo(alvos[i]) : null;
    if (id !== focoLevantado) {
      if (focoLevantado !== null && focoLevantado !== levantada) elDaCarta(focoLevantado).classList.remove("levantada");
      focoLevantado = id;
      if (id !== null) elDaCarta(id).classList.add("levantada");
    }
    anel.hidden = !ativo;
    if (!ativo) return;
    const r = retanguloDoAlvo(alvos[i]);
    anel.style.translate = `${r.x}px ${r.y}px`;
    anel.style.width = `${r.w}px`;
    anel.style.height = `${r.h}px`;
    anel.style.rotate = `${r.r}deg`;
    anel.style.scale = String(r.s);
    anel.style.top = id !== null ? `${-Math.round(g.ch * 0.12)}px` : "0px";
  }

  // ---------- Diálogo ----------

  let aoCancelarDialogo = null;

  function abrirDialogo({ titulo, texto, dados = [], botoes, aoCancelar, arte = false }) {
    dialogoArte.hidden = !arte;
    dialogoArte.innerHTML = arte ? MACACO : "";
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

  // ---------- Ritmo das jogadas ----------

  /** A partida espera com a página escondida, com um diálogo aberto ou com o mico sendo arrastado. */
  const bloqueado = () => document.visibilityState === "hidden" || dialogo.open || Boolean(pressao && pressao.ativo);

  /** Espera [ms] (e o que mais estiver bloqueando); devolve false se a partida mudou nesse meio-tempo. */
  async function aguardar(ms, minha) {
    await new Promise((r) => setTimeout(r, ms));
    while (minha === geracao && bloqueado()) await new Promise((r) => setTimeout(r, 150));
    return minha === geracao;
  }
  const voo = () => (reduzirMovimento.matches ? 60 : VOO_MS + 40);

  function proximaVez() {
    if (M.terminou(estado)) {
      concluir();
      return;
    }
    if (estado.vez === 0) comecarMinhaVez();
    else vezDoComputador(geracao);
  }

  /** Quem saiu nesta jogada, um por vez. */
  async function anunciarSaidas(saidas, minha) {
    for (const j of saidas) {
      const lugar = M.textoPosicao(M.colocacao(estado, j));
      narrar(j === 0 ? `Você saiu em ${lugar} lugar! Escapou do mico.` : `${nomeDe(j)} saiu em ${lugar} lugar.`);
      som.tocar("completo");
      desenhar();
      if (!(await aguardar(SAIDA_MS, minha))) return false;
    }
    return true;
  }

  /** As cartas de [j] se juntam, trocam de elemento e se abrem de novo na nova ordem (já no estado). */
  async function animarEmbaralhar(j, minha) {
    embaralhando.add(j);
    juntando.add(j);
    desenhar();
    som.tocar("embaralhar");
    const ok = await aguardar(reduzirMovimento.matches ? 60 : EMBARALHAR_MS + 40, minha);
    juntando.delete(j);
    if (!ok) {
      embaralhando.delete(j);
      return false;
    }
    if (j !== 0) {
      trocarElementos(estado.maos[j]);
      vista = estado;
    }
    desenhar();
    const fim = await aguardar(reduzirMovimento.matches ? 60 : EMBARALHAR_MS + 40, minha);
    embaralhando.delete(j);
    if (fim) desenhar();
    return fim;
  }

  // ---------- A sua vez ----------

  function comecarMinhaVez() {
    const alvo = M.alvoDe(estado, 0);
    vezMostrada = 0;
    ofertaDe = alvo;
    vista = estado;
    ocupado = false;
    foco = { grupo: "oferta", k: Math.floor((estado.maos[alvo].length - 1) / 2) };
    desenhar();
    narrar(`Sua vez: tire uma carta ${doNome(alvo)}.`);
    som.tocar("selecionar");
  }

  async function minhaJogada(posicao) {
    if (ocupado || ofertaDe === null || estado.vez !== 0 || M.terminou(estado)) return;
    const r = M.tirar(estado, posicao, Math.random);
    if (!r) return;
    const minha = geracao;
    ocupado = true;
    maoEmJogo = true;
    const alvo = r.de;
    estado = r.estado;
    // Quem deu a carta embaralha a mão depois que você tira dela
    const embaralha = estado.maos[alvo].length > 1;
    if (embaralha) estado = M.embaralharMao(estado, alvo, Math.random);
    salvar();
    vista = r.intermediario;
    foco = { grupo: "minha", k: ordemDaMinha().indexOf(r.carta) };
    desenhar();
    som.tocar("deslizar");
    narrar(
      r.carta === M.MICO
        ? `Você tirou o mico ${doNome(alvo)}!`
        : `Você tirou ${M.artigoCarta(r.carta)} ${M.nomeCarta(r.carta)} ${doNome(alvo)}.`,
    );
    if (!(await aguardar(voo(), minha))) return;
    if (r.par) {
      if (!(await aguardar(PAUSA_PAR_MS, minha))) return;
      vista = r.estado;
      desenhar();
      som.tocar("acerto");
      narrar(`Você formou um par: ${M.nomeCarta(r.par[0])} e ${M.nomeCarta(r.par[1])}.`);
      if (!(await aguardar(voo(), minha))) return;
    } else {
      som.tocar(r.carta === M.MICO ? "erro" : "pousar");
    }
    maoEmJogo = false;
    // A mão oferecida volta para o lugar de quem a deu
    ofertaDe = null;
    vista = r.estado;
    desenhar();
    if (!(await aguardar(voo(), minha))) return;
    if (!(await anunciarSaidas(r.saidas, minha))) return;
    if (embaralha && !M.terminou(estado)) {
      narrar(`${nomeDe(alvo)} embaralhou as cartas.`);
      if (!(await animarEmbaralhar(alvo, minha))) return;
    }
    vista = estado;
    desenhar();
    if (!(await aguardar(PAUSA_ENTRE_MS, minha))) return;
    proximaVez();
  }

  // ---------- A vez de um computador ----------

  async function vezDoComputador(minha) {
    ocupado = true;
    const quem = estado.vez;
    const alvo = M.alvoDe(estado, quem);
    vezMostrada = quem;
    ofertaDe = null;
    vista = estado;
    desenhar();
    narrar(`Vez ${doNome(quem)}: ${ele(quem)} tira uma carta ${alvo === 0 ? "sua" : doNome(alvo)}.`);
    if (!(await aguardar(PAUSA_VEZ_MS, minha))) return;
    let r;
    if (alvo === 0) {
      // A carta que o computador escolheu sobe na sua mão antes de ir embora
      maoEmJogo = true;
      const escolhida = estado.maos[0][M.escolhaDoComputador(estado, Math.random)];
      levantada = escolhida;
      desenhar();
      som.tocar("selecionar");
      if (!(await aguardar(ESCOLHA_MS, minha))) return;
      levantada = null;
      // Ela sai da sua mão já virada para baixo
      r = M.tirar(estado, estado.maos[0].indexOf(escolhida), Math.random);
    } else {
      r = M.tirar(estado, M.escolhaDoComputador(estado, Math.random), Math.random);
    }
    estado = r.estado;
    salvar();
    vista = r.intermediario;
    desenhar();
    som.tocar("deslizar");
    if (alvo === 0) {
      narrar(r.carta === M.MICO ? `${nomeDe(quem)} tirou o seu mico!` : `${nomeDe(quem)} tirou ${seu(r.carta)} ${M.nomeCarta(r.carta)}.`);
    } else {
      narrar(`${nomeDe(quem)} tirou uma carta ${doNome(alvo)}.`);
    }
    if (!(await aguardar(voo(), minha))) return;
    if (r.par) {
      vista = r.estado;
      desenhar();
      som.tocar("acerto");
      narrar(`${nomeDe(quem)} formou um par: ${M.nomeCarta(r.par[0])} e ${M.nomeCarta(r.par[1])}.`);
      if (!(await aguardar(voo(), minha))) return;
    } else {
      vista = r.estado;
      desenhar();
      if (alvo === 0) som.tocar(r.carta === M.MICO ? "acerto" : "virar");
    }
    maoEmJogo = false;
    if (!(await anunciarSaidas(r.saidas, minha))) return;
    // De vez em quando, o computador embaralha a própria mão depois da vez
    if (!M.terminou(estado) && estado.maos[quem].length > 1 && Math.random() < M.CHANCE_EMBARALHAR) {
      estado = M.embaralharMao(estado, quem, Math.random);
      salvar();
      narrar(`${nomeDe(quem)} embaralhou as cartas.`);
      if (!(await animarEmbaralhar(quem, minha))) return;
    }
    vista = estado;
    desenhar();
    if (!(await aguardar(PAUSA_ENTRE_MS, minha))) return;
    proximaVez();
  }

  // ---------- Fim ----------

  function concluir() {
    if (concluida) return;
    concluida = true;
    ocupado = true;
    ofertaDe = null;
    vezMostrada = null;
    levantada = null;
    maoEmJogo = false;
    gravar(CHAVE_PARTIDA, null);
    const perdedor = M.perdedor(estado);
    const escapou = perdedor !== 0;
    const posicao = M.colocacao(estado, 0);
    const { modo, semente } = estado;
    const { estatisticas: novas, recordes } = M.registrarResultado(estatisticas[modo], { escapou, posicao });
    estatisticas = { ...estatisticas, [modo]: novas };
    gravar(CHAVE_ESTATISTICAS, estatisticas);
    desenharEstatisticas();
    fimMostrado = true;
    vista = estado;
    desenhar();
    narrar(escapou ? `${nomeDe(perdedor)} ficou com o mico!` : "Você ficou com o mico!");
    som.tocar(escapou ? "vitoria" : "derrota");
    const minha = geracao;
    const micoEl = elDaCarta(M.MICO);
    setTimeout(() => minha === geracao && micoEl.classList.add("festa"), VOO_MS + 60);

    const dados = estado.saidas.map((j, k) => [M.textoPosicao(k + 1), j === 0 ? "Você" : nomeDe(j), j === 0]);
    dados.push(["Ficou com o mico", perdedor === 0 ? "Você" : nomeDe(perdedor), perdedor === 0]);
    if (recordes.sequencia) dados.push(["Nova maior sequência!", M.formatarNumero(novas.sequencia), true]);
    else dados.push(["Sequência sem pegar o mico", M.formatarNumero(novas.sequencia)]);
    setTimeout(() => {
      if (minha !== geracao) return;
      abrirDialogo({
        arte: true,
        titulo: escapou ? "Você escapou do mico!" : "Você ficou com o mico!",
        texto: escapou
          ? `Você saiu em ${M.textoPosicao(posicao)} lugar. Quem ficou com a Dama de espadas foi ${oNome(perdedor)}.`
          : "Todos os outros saíram antes, e a Dama de espadas ficou com você. Na próxima, a sorte muda!",
        dados,
        botoes: [
          { rotulo: "Nova partida", acao: () => novaPartida() },
          { rotulo: "Jogar esta de novo", acao: () => novaPartida({ semente }), secundario: true },
          { rotulo: "Fechar", acao: () => {}, secundario: true },
        ],
      });
    }, 1300);
  }

  /** Você já saiu: os computadores terminam a rodada de uma vez, sem animação. */
  function pularParaOFim() {
    if (concluida || M.terminou(estado) || estado.maos[0].length) return;
    geracao += 1;
    ocupado = true;
    ofertaDe = null;
    levantada = null;
    maoEmJogo = false;
    juntando.clear();
    embaralhando.clear();
    estado = M.jogarAteOFim(estado, Math.random);
    // As cartas trocaram de mão sem ninguém ver: os elementos são sorteados de novo
    atribuirElementos();
    vista = estado;
    desenhar({ animar: false });
    concluir();
  }

  // ---------- Estatísticas ----------

  function desenharEstatisticas() {
    const modo = estado ? estado.modo : M.MODO_PADRAO;
    const e = estatisticas[modo];
    estModo.textContent = M.textoModo(modo);
    const linhas = [
      ["Partidas", M.formatarNumero(e.partidas)],
      ["Escapou do mico", `${M.formatarNumero(e.escapou)} (${M.porcentagemEscapou(e)}%)`],
      ["Saiu em 1º", M.formatarNumero(e.primeiro)],
      ["Sequência sem pegar o mico", M.formatarNumero(e.sequencia)],
      ["Maior sequência", M.formatarNumero(e.melhorSequencia)],
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

  /**
   * Partida começada e abandonada conta como não terminada; se você já tinha saído da rodada, conta
   * como mico evitado, no lugar em que saiu.
   */
  function registrarAbandono() {
    if (!estado || !estado.iniciado || concluida || M.terminou(estado)) return;
    const posicao = M.colocacao(estado, 0);
    const resultado = posicao ? { escapou: true, posicao } : { escapou: false };
    estatisticas = { ...estatisticas, [estado.modo]: M.registrarResultado(estatisticas[estado.modo], resultado).estatisticas };
    gravar(CHAVE_ESTATISTICAS, estatisticas);
  }

  // ---------- Partida ----------

  /** Zera o que é da partida anterior na tela. */
  function limparMesa() {
    ocupado = true;
    maoEmJogo = false;
    ofertaDe = null;
    vezMostrada = null;
    levantada = null;
    focoLevantado = null;
    juntando.clear();
    embaralhando.clear();
    fechadasExtra = new Set();
    previaMico = null;
    pressao = null;
    fimMostrado = false;
    concluida = false;
    mesa.classList.remove("arrastando");
    faixaTexto.textContent = "";
  }

  /** As cartas saem do meio da mesa, uma por vez; depois a sua mão vira e todos baixam os pares. */
  async function animarInicio(dist, pares, minha) {
    vista = dist;
    fechadasExtra = new Set(M.BARALHO);
    narrar("Dando as cartas…");
    desenhar({ animar: false });
    if (!reduzirMovimento.matches) {
      const monte = pelocentro(g.W / 2, g.meioY + g.ch / 2, {});
      mesa.classList.add("sem-animacao");
      for (const id of M.BARALHO) {
        const el = elDaCarta(id);
        el.style.translate = `${monte.x}px ${monte.y}px`;
        el.style.rotate = "0deg";
        el.style.scale = "1";
      }
      void mesa.offsetWidth;
      mesa.classList.remove("sem-animacao");
      const n = dist.modo;
      dist.maos.forEach((mao, j) =>
        mao.forEach((id, k) => {
          const t = k * n + ((j - dist.vez + n) % n);
          const el = elDaCarta(id);
          const p = posicoes[id];
          el.style.transitionDelay = `${t * PASSO_DISTRIBUICAO_MS}ms`;
          el.style.zIndex = String(1000 + t);
          el.style.translate = `${p.x}px ${p.y}px`;
          el.style.rotate = `${p.r}deg`;
          el.style.scale = String(p.s);
        }),
      );
      som.tocar("embaralhar");
      if (!(await aguardar(M.CARTAS * PASSO_DISTRIBUICAO_MS + VOO_MS + 120, minha))) return;
      for (const id of M.BARALHO) {
        const el = elDaCarta(id);
        el.style.transitionDelay = "";
        el.style.zIndex = String(posicoes[id].z);
      }
    }
    // A sua mão vira para cima
    fechadasExtra = new Set();
    desenhar();
    som.tocar("virar");
    if (!(await aguardar(500, minha))) return;
    if (pares.length) {
      narrar("Todos baixam os pares que receberam.");
      vista = estado;
      const atrasos = new Map();
      pares.forEach((p, i) => p.cartas.forEach((id) => atrasos.set(id, i * 110)));
      desenhar({ atrasos });
      som.tocar("acerto");
      if (!(await aguardar(pares.length * 110 + VOO_MS + 250, minha))) return;
    }
    vista = estado;
    desenhar();
    if (!(await anunciarSaidas(estado.saidas, minha))) return;
    if (!M.terminou(estado)) {
      narrar(estado.vez === 0 ? "Você começa." : `${nomeDe(estado.vez)} começa.`);
      if (!(await aguardar(700, minha))) return;
    }
    proximaVez();
  }

  function novaPartida({ modo = estado ? estado.modo : M.MODO_PADRAO, semente = M.novaSemente() } = {}) {
    fecharDialogo();
    registrarAbandono();
    geracao += 1;
    const minha = geracao;
    limparMesa();
    const dist = M.distribuir(modo, semente);
    const { estado: novo, pares } = M.descartarIniciais(dist);
    estado = novo;
    vista = dist;
    nomes = M.jogadores(estado.modo, semente);
    criarEtiquetas();
    atribuirElementos();
    foco = { grupo: "mesa", k: 0 };
    gravar(CHAVE_MODO, estado.modo);
    salvar();
    desenharEstatisticas();
    anunciar(`Nova partida com ${M.textoModo(estado.modo)}. Partida número ${M.formatarNumero(semente)}.`);
    animarInicio(dist, pares, minha);
  }

  function confirmarNovaPartida(opcoes = {}) {
    // Sem jogada feita, com a partida terminada ou com você já fora da rodada, não há o que perder
    if (!estado.iniciado || concluida || M.terminou(estado) || M.colocacao(estado, 0)) {
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

  // ---------- A sua mão: o mico muda de lugar ----------

  const podeMexerNaMao = () =>
    !maoEmJogo && !juntando.has(0) && !concluida && !fimMostrado && levantada === null && estado.maos[0].includes(M.MICO);

  function colocarMico(k) {
    const n = estado.maos[0].length;
    const lugar = Math.max(0, Math.min(k, n - 1));
    estado = M.moverMico(estado, lugar);
    salvar();
    return lugar;
  }

  async function embaralharMinhaMao() {
    if (!podeMexerNaMao()) return;
    estado = M.embaralharMinha(estado, Math.random);
    salvar();
    const minha = geracao;
    embaralhando.add(0);
    juntando.add(0);
    desenhar();
    som.tocar("embaralhar");
    await new Promise((r) => setTimeout(r, reduzirMovimento.matches ? 30 : EMBARALHAR_MS + 40));
    juntando.delete(0);
    if (minha !== geracao) return;
    desenhar();
    await new Promise((r) => setTimeout(r, reduzirMovimento.matches ? 30 : EMBARALHAR_MS + 40));
    embaralhando.delete(0);
    if (minha !== geracao) return;
    desenhar();
    const k = estado.maos[0].indexOf(M.MICO);
    if (k >= 0) anunciar(`Você embaralhou a sua mão: o mico está na posição ${k + 1} de ${estado.maos[0].length}.`);
  }

  /** Em que lugar da sua mão fica uma carta cujo centro está em [cx]. */
  function lugarNaMao(cx) {
    const n = estado.maos[0].length;
    const L = lequeDaMinha(n);
    if (!L.passo) return 0;
    return Math.max(0, Math.min(n - 1, Math.round((cx - g.cw / 2 - L.x0) / L.passo)));
  }

  // ---------- Tocar e arrastar ----------

  mesa.addEventListener("pointerdown", (evento) => {
    if (evento.button > 0 || pressao) return;
    const cartaEl = evento.target.closest(".mi-carta");
    if (!cartaEl) return;
    const id = idDoEl[cartasEl.indexOf(cartaEl)];
    const p = posicoes[id];
    if (!p) return;
    if (p.onde === "oferta") {
      pressao = { id, tipo: "oferta", pointerId: evento.pointerId, x0: evento.clientX, y0: evento.clientY, ativo: false };
      return;
    }
    if (p.onde !== "minha") return;
    const mico = id === M.MICO && podeMexerNaMao();
    pressao = { id, tipo: mico ? "mico" : "minha", pointerId: evento.pointerId, x0: evento.clientX, y0: evento.clientY, bx: p.x, by: p.y, ativo: false, avisou: false };
    if (!mico) return;
    try {
      cartaEl.setPointerCapture(evento.pointerId);
    } catch (erro) {
      /* sem captura: o arrasto continua pelos eventos da mesa */
    }
  });

  mesa.addEventListener("pointermove", (evento) => {
    if (!pressao || evento.pointerId !== pressao.pointerId) return;
    const dx = evento.clientX - pressao.x0;
    const dy = evento.clientY - pressao.y0;
    if (pressao.tipo === "minha") {
      if (!pressao.avisou && Math.hypot(dx, dy) > 14) {
        pressao.avisou = true;
        avisar(estado.maos[0].includes(M.MICO) ? "Só o mico muda de lugar: as outras cartas ficam sempre em ordem." : "As suas cartas ficam sempre em ordem.");
      }
      return;
    }
    if (pressao.tipo !== "mico") return;
    const el = elDaCarta(M.MICO);
    if (!pressao.ativo) {
      if (Math.hypot(dx, dy) < ARRASTO_MINIMO) return;
      if (!podeMexerNaMao()) {
        pressao = null;
        return;
      }
      pressao.ativo = true;
      mesa.classList.add("arrastando");
      el.classList.add("no-ar");
      el.style.zIndex = "2000";
      el.style.rotate = "0deg";
    }
    evento.preventDefault();
    el.style.translate = `${pressao.bx + dx}px ${pressao.by + dy}px`;
    const k = lugarNaMao(pressao.bx + dx + g.cw / 2);
    if (k !== previaMico) {
      previaMico = k;
      desenhar();
    }
  });

  function terminarPressao(evento, cancelado = false) {
    if (!pressao || evento.pointerId !== pressao.pointerId) return;
    const atual = pressao;
    pressao = null;
    if (!atual.ativo) {
      if (cancelado) return;
      if (atual.tipo === "oferta" && ofertaDe !== null) {
        const k = vista.maos[ofertaDe].indexOf(atual.id);
        if (k >= 0) minhaJogada(k);
      } else if (atual.tipo === "mico") {
        avisar("Arraste o mico para escondê-lo em outro lugar da sua mão.");
      }
      return;
    }
    mesa.classList.remove("arrastando");
    elDaCarta(M.MICO).classList.remove("no-ar");
    const k = previaMico;
    previaMico = null;
    if (!cancelado && k !== null && podeMexerNaMao()) {
      const lugar = colocarMico(k);
      som.tocar("pousar");
      anunciar(`Mico na posição ${lugar + 1} de ${estado.maos[0].length}.`);
    }
    desenhar();
  }

  mesa.addEventListener("pointerup", (evento) => terminarPressao(evento));
  mesa.addEventListener("pointercancel", (evento) => terminarPressao(evento, true));
  // Sem isso, o navegador do celular pode tentar rolar a página no meio do arrasto
  mesa.addEventListener("touchmove", (evento) => pressao && pressao.ativo && evento.preventDefault(), { passive: false });
  mesa.addEventListener("contextmenu", (evento) => evento.target.closest(".mi-carta") && evento.preventDefault());

  // ---------- Teclado ----------

  function ativar(a) {
    if (a.grupo === "oferta") {
      if (ocupado) return;
      minhaJogada(a.k);
    } else {
      anunciar(rotuloDoAlvo(a));
    }
  }

  const centroX = (a) => {
    const r = retanguloDoAlvo(a);
    return r.x + r.w / 2;
  };

  mesa.addEventListener("keydown", (evento) => {
    const vagaEl = evento.target.closest?.(".mi-vaga");
    if (!vagaEl || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const a = alvos[Number(vagaEl.dataset.i)];
    if (!a) return;
    switch (evento.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        const sinal = evento.key === "ArrowRight" ? 1 : -1;
        if (evento.shiftKey && a.grupo === "minha" && idDoAlvo(a) === M.MICO) {
          if (!podeMexerNaMao()) break;
          const lugar = colocarMico(a.k + sinal);
          foco = { grupo: "minha", k: lugar };
          desenhar();
          som.tocar("pousar");
          anunciar(`Mico na posição ${lugar + 1} de ${estado.maos[0].length}.`);
          break;
        }
        const linha = alvos.filter((b) => b.linha === a.linha);
        const i = linha.indexOf(a);
        const proximo = linha[(i + sinal + linha.length) % linha.length];
        foco = { grupo: proximo.grupo, k: proximo.k };
        atualizarFoco();
        break;
      }
      case "ArrowUp":
      case "ArrowDown": {
        const destino = evento.key === "ArrowUp" ? 0 : 1;
        const linha = alvos.filter((b) => b.linha === destino);
        if (destino === a.linha || !linha.length) break;
        const x = centroX(a);
        const perto = linha.reduce((melhor, b) => (Math.abs(centroX(b) - x) < Math.abs(centroX(melhor) - x) ? b : melhor));
        foco = { grupo: perto.grupo, k: perto.k };
        atualizarFoco();
        break;
      }
      case "Enter":
      case " ":
        ativar(a);
        break;
      default:
        return;
    }
    evento.preventDefault();
  });

  mesa.addEventListener("focusin", (evento) => {
    const vagaEl = evento.target.closest?.(".mi-vaga");
    if (!vagaEl) return;
    const a = alvos[Number(vagaEl.dataset.i)];
    if (a) foco = { grupo: a.grupo, k: a.k };
    atualizarFoco(false);
  });
  mesa.addEventListener("focusout", () => setTimeout(() => atualizarFoco(false), 0));

  // Leitores de tela ativam o alvo com um clique sem ponteiro
  mesa.addEventListener("click", (evento) => {
    const vagaEl = evento.target.closest(".mi-vaga");
    if (!vagaEl || evento.detail !== 0) return;
    const a = alvos[Number(vagaEl.dataset.i)];
    if (!a) return;
    foco = { grupo: a.grupo, k: a.k };
    ativar(a);
  });

  // ---------- Botões ----------

  botaoEmbaralhar.addEventListener("click", embaralharMinhaMao);
  botaoPular.addEventListener("click", pularParaOFim);
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
      texto: `As estatísticas com ${M.textoModo(modo)} voltam para zero. Isso não pode ser desfeito.`,
      botoes: [
        {
          rotulo: "Sim, zerar",
          acao: () => {
            estatisticas = { ...estatisticas, [modo]: M.estatisticasVazias() };
            gravar(CHAVE_ESTATISTICAS, estatisticas);
            desenharEstatisticas();
            anunciar("Estatísticas zeradas.");
          },
        },
        { rotulo: "Não", acao: () => {}, secundario: true },
      ],
    });
  });
  som.ligarBotao(raiz.querySelector("#mi-som"));

  // ---------- Tamanho da tela e saída da página ----------

  // Só a largura da mesa e a altura da janela mudam as medidas
  let redesenho = null;
  let ultimaMedida = "";
  function aoMudarTamanho() {
    cancelAnimationFrame(redesenho);
    redesenho = requestAnimationFrame(() => {
      const medida = `${mesa.clientWidth}x${window.innerHeight}`;
      if (medida === ultimaMedida || pressao || !estado) return;
      ultimaMedida = medida;
      medir();
      desenhar({ animar: false });
    });
  }
  if (typeof ResizeObserver === "function") new ResizeObserver(aoMudarTamanho).observe(mesa);
  window.addEventListener("resize", aoMudarTamanho);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") salvar();
  });
  window.addEventListener("pagehide", salvar);

  // ---------- Início ----------

  const salvas = lerJson(CHAVE_ESTATISTICAS) || {};
  for (const modo of M.MODOS) estatisticas[modo] = M.lerEstatisticas(salvas[modo]);
  const salva = lerJson(CHAVE_PARTIDA);
  const restaurada = salva && M.restaurar(salva.estado);
  medir();
  ultimaMedida = `${mesa.clientWidth}x${window.innerHeight}`;
  if (restaurada && !M.terminou(restaurada)) {
    geracao += 1;
    const minha = geracao;
    limparMesa();
    estado = restaurada;
    vista = estado;
    nomes = M.jogadores(estado.modo, estado.semente);
    criarEtiquetas();
    atribuirElementos();
    desenhar({ animar: false });
    desenharEstatisticas();
    if (estado.vez === 0) {
      comecarMinhaVez();
      anunciar(`Partida anterior retomada. ${faixaTexto.textContent}`);
    } else {
      vezMostrada = estado.vez;
      narrar(`Partida retomada. Vez ${doNome(estado.vez)}.`);
      desenhar({ animar: false });
      aguardar(900, minha).then((ok) => ok && proximaVez());
    }
  } else {
    const modo = M.MODOS.includes(lerJson(CHAVE_MODO)) ? lerJson(CHAVE_MODO) : M.MODO_PADRAO;
    novaPartida({ modo });
  }
})();
