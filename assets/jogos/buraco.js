"use strict";
/*
 * Interface do Buraco. As regras, a pontuação e a jogada do computador ficam em buraco-logica.js.
 *
 * As cartas à vista (a sua mão, os jogos, o lixo e as que o Zeca pegou do lixo) têm um elemento
 * cada, criado uma vez e só mudado de lugar; as escondidas (o monte, os mortos e o resto da mão do
 * Zeca) são só versos, sem a frente no DOM. A cada jogada a mesa é redesenhada, e cada carta que
 * mudou de lugar viaja numa cópia (propriedades CSS translate e scale) do lugar antigo até o novo.
 *
 * Toque nas cartas da mão para escolher várias; Baixar jogo forma um jogo novo, um toque num jogo
 * seu põe nele as escolhidas, e Descartar termina a vez. No teclado, as setas andam pela mesa,
 * Enter ou Espaço usa o que tem foco, Esc limpa a escolha e Ctrl+Z desfaz. A partida, o histórico
 * da vez, o modo e as estatísticas ficam no localStorage.
 */
(() => {
  const raiz = document.querySelector(".buraco");
  if (!raiz || typeof LogicaBuraco !== "object") return;
  const P = LogicaBuraco;
  const NOME = P.NOME_COMPUTADOR;

  const CHAVE_PARTIDA = "efs-buraco-partida";
  const CHAVE_ESTATISTICAS = "efs-buraco-estatisticas";
  const CHAVE_MODO = "efs-buraco-modo";
  const CHAVE_ORDEM = "efs-buraco-ordem";
  const TRAVA_DIALOGO_MS = 500;
  const MENSAGEM_MS = 3800;
  const PASSO_MS = 750;
  const VOO_MS = 320;
  const LIMITE_HISTORICO = 40;
  const reduzirMovimento = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  const $ = (id) => raiz.querySelector(`#${id}`);
  const mesa = $("bu-mesa");
  const maoEl = $("bu-mao-0");
  const maoPcEl = $("bu-mao-1");
  const jogosEl = [$("bu-jogos-0"), $("bu-jogos-1")];
  const monteEl = $("bu-monte");
  const mortosEl = $("bu-mortos");
  const lixoEl = $("bu-lixo");
  const faseEl = $("bu-fase");
  const infoEl = [$("bu-info-0"), $("bu-info-1")];
  const faixaEl = [$("bu-faixa-0"), $("bu-faixa-1")];
  const totalEl = [$("bu-total-0"), $("bu-total-1")];
  const naMesaEl = [$("bu-mesa-0"), $("bu-mesa-1")];
  const ladoEl = [$("bu-lado-0"), $("bu-lado-1")];
  const textoPartida = $("bu-partida");
  const placarLinhas = $("bu-placar-linhas");
  const botao = {
    comprar: $("bu-comprar"),
    pegar: $("bu-pegar"),
    baixar: $("bu-baixar"),
    descartar: $("bu-descartar"),
    proxima: $("bu-proxima"),
    desfazer: $("bu-desfazer"),
    dica: $("bu-dica"),
    nova: $("bu-nova"),
    ordenar: $("bu-ordenar"),
  };
  const botoesModo = [...raiz.querySelectorAll("[data-modo]")];
  const botoesAlvo = [...raiz.querySelectorAll("[data-meta]")];
  const status = $("bu-status");
  const estLista = $("bu-est-lista");
  const estModo = $("bu-est-modo");
  const botaoZerar = $("bu-zerar");
  const dialogo = $("bu-dialogo");
  const dialogoTitulo = $("bu-dialogo-titulo");
  const dialogoTexto = $("bu-dialogo-texto");
  const dialogoTabela = $("bu-dialogo-tabela");
  const dialogoDados = $("bu-dialogo-dados");
  const dialogoBotoes = $("bu-dialogo-botoes");
  // Se sons.js não carregar, o jogo segue mudo e o botão some
  const som = typeof Sons === "object" ? Sons.criar("buraco", raiz) : { tocar() {}, ligarBotao: (b) => b && (b.hidden = true) };

  // Camada das cartas em viagem e aviso curto sobre a mesa (o leitor de tela recebe o mesmo texto pelo status)
  const vooEl = document.createElement("div");
  vooEl.className = "bu-voo";
  vooEl.setAttribute("aria-hidden", "true");
  const mensagemEl = document.createElement("p");
  mensagemEl.className = "bu-mensagem";
  mensagemEl.setAttribute("aria-hidden", "true");
  mesa.append(vooEl, mensagemEl);

  let estado;
  let historico = [];
  let estatisticas = {};
  let selecionadas = new Set();
  let porValor = false;
  let foco = null;
  let ultimaDoPc = "";
  let escolhendoJogo = null;
  let timerComputador = null;
  let timerDialogo = null;
  let dicaTimer = null;
  let mensagemTimer = null;
  let g = null;

  const comArtigo = (id) => `${P.valor(id) === 12 ? "a" : "o"} ${P.nomeCarta(id)}`;
  const maiuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
  const plural = (n, um, varios) => `${P.formatarNumero(n)} ${n === 1 ? um : varios}`;
  const juntar = (partes) => (partes.length < 2 ? partes.join("") : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`);
  const chaveEstatisticas = (e = estado) => P.chaveModo(e.modo, e.alvo);
  const textoDoModo = (e = estado) => `${P.textoModo(e.modo)}, ${P.textoAlvo(e.alvo)}`;
  const minhaVez = () => estado && estado.vez === P.VOCE && !P.terminouRodada(estado);

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
    if (!estado || estado.fase === "acabou") return;
    gravar(CHAVE_PARTIDA, { estado, historico: historico.slice(-LIMITE_HISTORICO) });
  }

  // ---------- Medidas ----------

  function medir() {
    const largura = mesa.clientWidth || 360;
    const cw = Math.round(Math.max(44, Math.min(62, largura / 15)));
    const mw = Math.round(Math.max(32, Math.min(42, largura / 23)));
    const pw = largura < 640 ? 24 : 28;
    g = {
      cw,
      ch: Math.round(cw * 1.4),
      mw,
      mh: Math.round(mw * 1.4),
      passoJogo: Math.max(13, Math.round(mw * 0.42)),
      pw,
      ph: Math.round(pw * 1.4),
    };
    mesa.style.setProperty("--mw", `${g.mw}px`);
    mesa.style.setProperty("--mh", `${g.mh}px`);
    maoEl.style.setProperty("--cw", `${g.cw}px`);
    maoEl.style.setProperty("--ch", `${g.ch}px`);
    maoPcEl.style.setProperty("--cw", `${g.pw}px`);
    maoPcEl.style.setProperty("--ch", `${g.ph}px`);
  }

  // ---------- Cartas ----------

  /** Um elemento por carta que já apareceu; a frente só é criada quando a carta fica à vista. */
  const elementos = new Map();
  function elCarta(id) {
    let el = elementos.get(id);
    if (!el) {
      el = document.createElement("div");
      const naipe = P.NAIPES[P.naipe(id)].id;
      const centro =
        P.valor(id) > 10
          ? `<span class="bu-centro-carta bu-figura">${P.textoValor(id)}</span>`
          : `<span class="bu-centro-carta"><i class="bu-naipe bu-naipe-${naipe}"></i></span>`;
      el.innerHTML = `<span class="bu-frente"><span class="bu-valor">${P.textoValor(id)}</span><i class="bu-naipe bu-naipe-${naipe} bu-naipe-canto"></i>${centro}</span>`;
      el.dataset.id = String(id);
      elementos.set(id, el);
    }
    return el;
  }

  function prepararCarta(id, x, y, z) {
    const el = elCarta(id);
    el.className = `bu-carta${P.vermelha(id) ? " vermelha" : ""}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.zIndex = String(z);
    for (const nome of ["role", "tabindex", "aria-label", "aria-pressed", "data-alvo", "data-linha"]) el.removeAttribute(nome);
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  function costas(x = 0, y = 0, z = 1) {
    const el = document.createElement("div");
    el.className = "bu-carta bu-costas";
    el.innerHTML = '<span class="bu-verso"></span>';
    el.setAttribute("aria-hidden", "true");
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.zIndex = String(z);
    return el;
  }

  /** Marca um elemento como parada do teclado: linha 0 jogos do Zeca, 1 monte e lixo, 2 seus jogos, 3 a mão. */
  function alvo(el, chave, linha, rotulo) {
    el.dataset.alvo = chave;
    el.dataset.linha = String(linha);
    el.setAttribute("role", "button");
    el.tabIndex = -1;
    el.setAttribute("aria-label", rotulo);
    el.removeAttribute("aria-hidden");
  }

  function legenda(texto) {
    const el = document.createElement("span");
    el.className = "bu-legenda";
    el.setAttribute("aria-hidden", "true");
    el.textContent = texto;
    return el;
  }

  // ---------- Desenho ----------

  function desenhar() {
    if (!g) medir();
    const tinhaFoco = mesa.contains(document.activeElement);
    if (escolhendoJogo && !(minhaVez() && estado.fase === "comprar")) escolhendoJogo = null;
    selecionadas = new Set([...selecionadas].filter((id) => estado.maos[0].includes(id)));
    desenharPlacar();
    desenharOponente();
    desenharJogos(1);
    desenharCentro();
    desenharJogos(0);
    desenharMao();
    desenharFase();
    desenharBotoes();
    atualizarFoco(tinhaFoco, true);
  }

  function desenharPlacar() {
    for (const j of [0, 1]) {
      totalEl[j].textContent = P.formatarNumero(estado.totais[j]);
      naMesaEl[j].textContent = `${P.formatarNumero(P.pontosNaMesa(estado.jogos[j]))} na mesa`;
      ladoEl[j].classList.toggle("vez", estado.vez === j && !P.terminouRodada(estado));
      faixaEl[j].classList.toggle("ativa", estado.vez === j && !P.terminouRodada(estado));
    }
    textoPartida.textContent = `Partida nº ${P.formatarNumero(estado.semente)} · Rodada ${estado.rodada} · ${textoDoModo()}`;
    placarLinhas.replaceChildren(
      ...estado.placar.map((par, i) => linhaTabela([`${i + 1}ª`, P.formatarNumero(par[0]), P.formatarNumero(par[1])])),
      linhaTabela(["Total", P.formatarNumero(estado.totais[0]), P.formatarNumero(estado.totais[1])], "total"),
    );
    for (const b of botoesModo) marcarSegmento(b, b.dataset.modo === estado.modo);
    for (const b of botoesAlvo) marcarSegmento(b, Number(b.dataset.meta) === estado.alvo);
  }

  function marcarSegmento(b, ativo) {
    b.classList.toggle("active", ativo);
    b.setAttribute("aria-pressed", String(ativo));
  }

  function linhaTabela(celulas, classe) {
    const tr = document.createElement("tr");
    if (classe) tr.className = classe;
    celulas.forEach((texto, i) => {
      const td = document.createElement(i === 0 ? "th" : "td");
      if (i === 0) td.scope = "row";
      if (Array.isArray(texto)) {
        td.textContent = texto[0];
        const s = document.createElement("small");
        s.textContent = texto[1];
        td.append(s);
      } else {
        td.textContent = texto;
      }
      tr.append(td);
    });
    return tr;
  }

  function desenharOponente() {
    const n = estado.maos[1].length;
    const conhecidas = P.ordenarMao(estado.conhecidas[1]);
    const ocultas = n - conhecidas.length;
    const largura = maoPcEl.clientWidth || 200;
    let passoVerso = 6;
    let passoFace = Math.round(g.pw * 0.55);
    const total = () => Math.max(0, ocultas - 1) * passoVerso + conhecidas.length * passoFace + g.pw;
    if (total() > largura) {
      const f = (largura - g.pw) / Math.max(1, total() - g.pw);
      passoVerso = Math.max(2, passoVerso * f);
      passoFace = Math.max(10, passoFace * f);
    }
    const x0 = Math.max(0, largura - total());
    const filhos = [];
    let x = x0;
    for (let k = 0; k < ocultas; k++) {
      filhos.push(costas(x, 0, k + 1));
      x += passoVerso;
    }
    if (ocultas) x += g.pw - passoVerso;
    else x = x0;
    conhecidas.forEach((id, k) => {
      filhos.push(prepararCarta(id, x + k * passoFace - (ocultas ? g.pw - passoFace : 0), 0, 100 + k));
    });
    maoPcEl.replaceChildren(...filhos);
    const partes = [plural(n, "carta", "cartas")];
    if (estado.pegouMorto[1]) partes.push(estado.mortoIntocado[1] ? "pegou o morto agora" : "pegou o morto");
    if (P.podeBater(estado, 1)) partes.push("já pode bater");
    infoEl[1].textContent = `· ${partes.join(" · ")}`;
    maoPcEl.setAttribute("role", "img");
    maoPcEl.setAttribute(
      "aria-label",
      `Mão do ${NOME}: ${plural(n, "carta", "cartas")}${conhecidas.length ? `; você conhece ${plural(conhecidas.length, "delas", "delas")}, que ele pegou do lixo: ${P.listarCartas(conhecidas)}` : ""}.`,
    );
  }

  function textoCanastra(tipo) {
    if (tipo === "suja") return "Suja · 100";
    if (tipo === "mil") return "Ás a Ás · 1.000";
    if (tipo === "quinhentos") return "Limpa · 500";
    return "Limpa · 200";
  }
  const nomeCanastra = (tipo) => (tipo === "suja" ? "suja" : tipo === "mil" ? "de Ás a Ás" : "limpa");

  function rotuloJogo(lado, jg) {
    const tipo = P.tipoCanastra(jg);
    const dono = lado === 0 ? "Seu jogo" : `Jogo do ${NOME}`;
    let texto = `${dono}: ${P.descreverJogo(jg)}, ${plural(jg.length, "carta", "cartas")}`;
    if (tipo) texto += `, canastra ${nomeCanastra(tipo)} de ${P.formatarNumero(P.analisarJogo(jg).bonus)} pontos`;
    if (lado === 0 && minhaVez() && estado.fase === "jogar") texto += ". Enter põe nele as cartas escolhidas";
    return `${texto}.`;
  }

  /** Os seus jogos que recebem o que está escolhido agora (ou a carta de cima do lixo, no Fechado). */
  function jogosDestacados() {
    if (!minhaVez()) return [];
    const sel = [...selecionadas];
    if (estado.fase === "jogar") return P.jogosOndeCabe(estado, sel);
    if (estado.modo === "fechado" && estado.lixo.length) {
      return P.usosDoLixo(estado, sel)
        .filter((u) => u.jogo !== null)
        .map((u) => u.jogo);
    }
    return [];
  }

  function desenharJogos(lado) {
    const cont = jogosEl[lado];
    const largura = Math.max(120, cont.clientWidth - 18);
    const destaque = new Set(lado === 0 ? jogosDestacados() : []);
    const filhos = estado.jogos[lado].map((jg, i) => {
      const a = P.analisarJogo(jg);
      const n = jg.length;
      const passo = n > 1 ? Math.min(g.passoJogo, Math.max(8, (largura - g.mw) / (n - 1))) : 0;
      const bloco = document.createElement("div");
      const tipo = P.tipoCanastra(jg);
      bloco.className = `bu-jogo bu-jogo-${lado === 0 ? "voce" : "pc"}`;
      if (tipo) bloco.classList.add("canastra");
      if (tipo === "suja") bloco.classList.add("suja");
      if (destaque.has(i)) bloco.classList.add("encaixa");
      bloco.style.width = `${Math.round(g.mw + passo * (n - 1))}px`;
      const selo = document.createElement("span");
      selo.className = "bu-selo";
      selo.setAttribute("aria-hidden", "true");
      selo.textContent = tipo ? textoCanastra(tipo) : `${n}/7`;
      const cartas = document.createElement("span");
      cartas.className = "bu-jogo-cartas";
      a.ordem.forEach((id, k) => {
        const el = prepararCarta(id, Math.round(k * passo), 0, k + 1);
        if (id === a.curinga) el.classList.add("curinga");
        cartas.append(el);
      });
      bloco.append(selo, cartas);
      alvo(bloco, `jogo:${lado}:${i}`, lado === 0 ? 2 : 0, rotuloJogo(lado, jg));
      return bloco;
    });
    if (!filhos.length) {
      const p = document.createElement("p");
      p.className = "bu-vazio";
      p.textContent = lado === 0 ? "Seus jogos aparecem aqui." : `O ${NOME} ainda não baixou jogos.`;
      filhos.push(p);
    }
    cont.replaceChildren(...filhos);
  }

  function desenharCentro() {
    // Monte: até 3 versos empilhados e a contagem
    const n = estado.monte.length;
    const pilha = document.createElement("span");
    pilha.className = "bu-pilha-cartas";
    if (n) {
      for (let k = 0; k < Math.min(3, n); k++) pilha.append(costas(k * 1.5, -k * 1.5, k + 1));
      const c = document.createElement("span");
      c.className = "bu-contagem";
      c.setAttribute("aria-hidden", "true");
      c.textContent = String(n);
      pilha.append(c);
    } else {
      const v = document.createElement("span");
      v.className = "bu-vaga";
      pilha.append(v);
    }
    monteEl.replaceChildren(legenda("Monte"), pilha);
    const mortos = estado.mortos.length;
    const comprar = minhaVez() && estado.fase === "comprar";
    alvo(
      monteEl,
      "monte",
      1,
      `Monte: ${plural(n, "carta", "cartas")}. ${mortos ? `${plural(mortos, "morto", "mortos")} na mesa.` : "Nenhum morto na mesa."}${comprar ? " Enter compra uma carta." : ""}`,
    );

    // Mortos
    const mc = document.createElement("span");
    mc.className = "bu-mortos-cartas";
    for (let k = 0; k < mortos; k++) mc.append(costas());
    if (!mortos) {
      const s = document.createElement("span");
      s.className = "bu-sem";
      s.textContent = "nenhum";
      mc.append(s);
    }
    mortosEl.replaceChildren(legenda(mortos === 1 ? "Morto" : "Mortos"), mc);
    mortosEl.setAttribute("aria-hidden", "true");

    // Lixo em leque, em fileiras quando não cabe numa só
    const lixo = estado.lixo;
    const area = document.createElement("span");
    area.className = "bu-lixo-cartas";
    const largura = Math.max(g.mw, lixoEl.clientWidth || 200);
    const passoMin = Math.max(13, Math.round(g.mw * 0.36));
    const passoMax = Math.round(g.mw * 0.62);
    const porLinha = Math.max(1, Math.floor((largura - g.mw) / passoMin) + 1);
    const linhas = Math.max(1, Math.ceil(lixo.length / porLinha));
    const naLinha = Math.max(1, Math.ceil(lixo.length / linhas));
    const passo = naLinha > 1 ? Math.min(passoMax, (largura - g.mw) / (naLinha - 1)) : 0;
    const passoLinha = Math.round(g.mh * 0.52);
    lixo.forEach((id, k) => {
      area.append(prepararCarta(id, Math.round((k % naLinha) * passo), Math.floor(k / naLinha) * passoLinha, k + 1));
    });
    if (!lixo.length) {
      const v = document.createElement("span");
      v.className = "bu-vaga";
      area.append(v);
    }
    area.style.height = `${(linhas - 1) * passoLinha + g.mh}px`;
    lixoEl.replaceChildren(legenda(lixo.length ? `Lixo · ${lixo.length}` : "Lixo"), area);
    const pegar = minhaVez() && estado.fase === "comprar" && lixo.length;
    alvo(
      lixoEl,
      "lixo",
      1,
      lixo.length
        ? `Lixo com ${plural(lixo.length, "carta", "cartas")}; por cima, ${comArtigo(P.topo(lixo))}.${lixo.length > 1 ? ` De baixo para cima: ${P.listarCartas(lixo)}.` : ""}${pegar ? " Enter pega o lixo." : ""}`
        : "Lixo vazio.",
    );
  }

  function desenharMao() {
    const mao = P.ordenarMao(estado.maos[0], porValor);
    const largura = maoEl.clientWidth || 320;
    const { cw, ch } = g;
    const n = mao.length;
    const passoMax = Math.round(cw * 0.72);
    const passoMin = Math.max(22, Math.round(cw * 0.46));
    const porLinha = n > 1 ? Math.max(2, Math.floor((largura - cw) / passoMin) + 1) : 1;
    const linhas = Math.max(1, Math.ceil(n / porLinha));
    const naLinha = Math.max(1, Math.ceil(n / linhas));
    const passo = naLinha > 1 ? Math.min(passoMax, (largura - cw) / (naLinha - 1)) : 0;
    const passoLinha = Math.round(ch * 0.58);
    const levanta = 14;
    const nova = estado.vez === 0 && estado.fase === "jogar" ? estado.novaCarta : null;
    const filhos = mao.map((id, k) => {
      const linha = Math.floor(k / naLinha);
      const nessaLinha = Math.min(naLinha, n - linha * naLinha);
      const x0 = (largura - (cw + passo * (nessaLinha - 1))) / 2;
      const el = prepararCarta(id, Math.round(x0 + (k % naLinha) * passo), levanta + linha * passoLinha, 10 + k);
      const escolhida = selecionadas.has(id);
      el.classList.toggle("escolhida", escolhida);
      el.classList.toggle("nova", id === nova);
      alvo(el, `mao:${id}`, 3, `${P.nomeCarta(id)}${id === nova ? ", a carta que você acabou de comprar" : ""}`);
      el.setAttribute("aria-pressed", String(escolhida));
      return el;
    });
    maoEl.style.height = `${levanta + (linhas - 1) * passoLinha + ch + 4}px`;
    maoEl.replaceChildren(...filhos);
    const partes = [plural(n, "carta", "cartas")];
    if (selecionadas.size) partes.push(`${plural(selecionadas.size, "escolhida", "escolhidas")}`);
    if (estado.pegouMorto[0]) partes.push(estado.mortoIntocado[0] ? "o morto é seu na próxima vez" : "você pegou o morto");
    if (P.podeBater(estado, 0)) partes.push("já pode bater");
    infoEl[0].textContent = `· ${partes.join(" · ")}`;
    botao.ordenar.textContent = porValor ? "Ordenar: valor" : "Ordenar: naipe";
    botao.ordenar.setAttribute("aria-label", porValor ? "Mão em ordem de valor. Mudar para ordem de naipe" : "Mão em ordem de naipe. Mudar para ordem de valor");
  }

  function textoFase() {
    if (estado.fase === "acabou") return estado.vencedor === 0 ? "Fim da partida: você venceu!" : `Fim da partida: o ${NOME} venceu.`;
    if (estado.fase === "fim") return `Fim da rodada ${estado.rodada}`;
    if (estado.vez === 1) return ultimaDoPc ? `Vez do ${NOME}: ${ultimaDoPc}` : `Vez do ${NOME}…`;
    if (estado.fase === "comprar") {
      if (escolhendoJogo) return `Toque no jogo onde ${comArtigo(P.topo(estado.lixo))} vai entrar`;
      return "Sua vez: compre do monte ou pegue o lixo";
    }
    return P.podeBater(estado, 0) ? "Baixe jogos ou descarte: você já pode bater" : "Baixe jogos ou descarte uma carta";
  }

  function desenharFase() {
    faseEl.textContent = textoFase();
    faseEl.classList.toggle("sua-vez", minhaVez());
  }

  /** Motivo de cada botão de jogada não valer agora (null quando vale). */
  function motivosDosBotoes() {
    const sel = [...selecionadas];
    const esperar =
      estado.fase === "acabou"
        ? "A partida terminou: toque em Nova partida para jogar outra."
        : estado.fase === "fim"
          ? "A rodada terminou: toque em Próxima rodada."
          : `Espere: é a vez do ${NOME}.`;
    if (!minhaVez()) return { comprar: esperar, pegar: esperar, baixar: esperar, descartar: esperar };
    const jogar = estado.fase === "jogar";
    return {
      comprar: P.motivoComprar(estado),
      pegar: motivoDoLixo(sel),
      baixar: !jogar ? P.motivoBaixar(estado, sel) : sel.length < 3 ? "Escolha pelo menos 3 cartas da mão para baixar um jogo." : P.motivoBaixar(estado, sel),
      descartar: !jogar ? P.motivoDescartar(estado, sel[0]) : sel.length !== 1 ? "Escolha 1 carta da mão para descartar." : P.motivoDescartar(estado, sel[0]),
    };
  }

  function motivoDoLixo(sel) {
    if (estado.fase !== "comprar") return P.motivoComprar(estado);
    if (estado.modo === "aberto" || !estado.lixo.length) return P.motivoPegarLixo(estado, null);
    if (P.usosDoLixo(estado, sel).length) return null;
    if (sel.length >= 2) return P.motivoPegarLixo(estado, { cartas: sel, jogo: null });
    return P.MSG_FECHADO;
  }

  let motivos = {};
  function desenharBotoes() {
    motivos = motivosDosBotoes();
    for (const nome of ["comprar", "pegar", "baixar", "descartar"]) {
      botao[nome].setAttribute("aria-disabled", String(Boolean(motivos[nome])));
    }
    const fim = estado.fase === "fim";
    botao.proxima.hidden = !fim;
    for (const nome of ["comprar", "pegar", "baixar", "descartar"]) botao[nome].hidden = fim;
    botao.desfazer.disabled = !(minhaVez() && historico.length);
    botao.dica.disabled = !minhaVez();
  }

  // ---------- Avisos ----------

  function anunciar(texto) {
    status.textContent = texto;
  }

  /** Explica, na mesa e para o leitor de tela, o que aconteceu ou por que a jogada não vale. */
  function avisar(texto) {
    anunciar(texto);
    clearTimeout(mensagemTimer);
    mensagemEl.textContent = texto;
    mensagemEl.classList.add("visivel");
    mensagemTimer = setTimeout(() => mensagemEl.classList.remove("visivel"), MENSAGEM_MS);
  }

  function recusar(texto, ids = []) {
    som.tocar("erro");
    avisar(texto);
    for (const id of ids) {
      const el = elementos.get(id);
      if (!el || !el.isConnected) continue;
      el.classList.remove("tremendo");
      void el.offsetWidth;
      el.classList.add("tremendo");
      setTimeout(() => el.classList.remove("tremendo"), 360);
    }
  }

  // ---------- Foco do teclado ----------

  const alvos = () => [...mesa.querySelectorAll("[data-alvo]")];

  function atualizarFoco(mover, semRolar = false) {
    const lista = alvos();
    let el = lista.find((x) => x.dataset.alvo === foco);
    if (!el) el = lista.find((x) => x.dataset.linha === "3") || lista.find((x) => x.dataset.alvo === "monte") || lista[0];
    if (!el) return;
    foco = el.dataset.alvo;
    for (const x of lista) x.tabIndex = x === el ? 0 : -1;
    if (mover && document.activeElement !== el) el.focus({ preventScroll: semRolar });
  }

  function centroX(el) {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2;
  }

  function vizinho(el, tecla) {
    const lista = alvos();
    const linha = Number(el.dataset.linha);
    if (tecla === "ArrowLeft" || tecla === "ArrowRight") {
      const mesma = lista.filter((x) => Number(x.dataset.linha) === linha);
      const i = mesma.indexOf(el);
      const j = tecla === "ArrowRight" ? (i + 1) % mesma.length : (i - 1 + mesma.length) % mesma.length;
      return mesma[j] || el;
    }
    const linhas = [...new Set(lista.map((x) => Number(x.dataset.linha)))].sort((a, b) => a - b);
    const destino = tecla === "ArrowDown" ? linhas.find((l) => l > linha) : [...linhas].reverse().find((l) => l < linha);
    if (destino === undefined) return el;
    const x = centroX(el);
    const opcoes = lista.filter((y) => Number(y.dataset.linha) === destino);
    return opcoes.reduce((melhor, y) => (Math.abs(centroX(y) - x) < Math.abs(centroX(melhor) - x) ? y : melhor));
  }

  // ---------- Animação ----------

  function zonaDe(el) {
    const z = el.closest(".bu-mao, .bu-jogo, .bu-lixo, .bu-mao-pc");
    if (!z) return "";
    if (z.classList.contains("bu-jogo")) return `jogo:${z.dataset.alvo}`;
    return z.id || z.className;
  }

  function retanguloDaMaoDoPc() {
    const versos = maoPcEl.querySelectorAll(".bu-costas");
    if (versos.length) return versos[versos.length - 1].getBoundingClientRect();
    const r = maoPcEl.getBoundingClientRect();
    return { left: r.right - g.pw, top: r.top, width: g.pw, height: g.ph };
  }

  function capturar() {
    const rects = new Map();
    const zonas = new Map();
    for (const [id, el] of elementos) {
      if (!el.isConnected) continue;
      rects.set(id, el.getBoundingClientRect());
      zonas.set(id, zonaDe(el));
    }
    const pilha = (el) => {
      const c = el.querySelector(".bu-pilha-cartas, .bu-mortos-cartas .bu-carta, .bu-mortos-cartas");
      return (c || el).getBoundingClientRect();
    };
    return { rects, zonas, monte: pilha(monteEl), mortos: pilha(mortosEl), maoPc: retanguloDaMaoDoPc() };
  }

  function voar(el, de, para, base, { atraso = 0, virar = false } = {}) {
    const f = el.cloneNode(true);
    f.classList.remove("escolhida", "nova", "em-voo", "tremendo", "bu-dica");
    f.classList.add("bu-fantasma");
    for (const nome of ["role", "tabindex", "aria-label", "aria-pressed", "data-alvo", "data-linha", "data-id"]) f.removeAttribute(nome);
    f.setAttribute("aria-hidden", "true");
    f.style.setProperty("--cw", `${para.width}px`);
    f.style.setProperty("--ch", `${para.height}px`);
    f.style.left = `${para.left - base.left}px`;
    f.style.top = `${para.top - base.top}px`;
    f.style.zIndex = "";
    f.style.translate = `${de.left - para.left}px ${de.top - para.top}px`;
    f.style.scale = `${de.width / para.width} ${de.height / para.height}`;
    if (virar) {
      f.classList.add("de-costas");
      if (!f.querySelector(".bu-verso")) f.insertAdjacentHTML("beforeend", '<span class="bu-verso"></span>');
    }
    vooEl.append(f);
    el.classList.add("em-voo");
    void f.offsetWidth;
    f.style.transitionDelay = atraso ? `${atraso}ms` : "";
    f.classList.add("voando");
    f.style.translate = "0px 0px";
    f.style.scale = "1";
    if (virar) {
      setTimeout(() => {
        f.classList.remove("de-costas");
        f.classList.add("virando");
      }, atraso + VOO_MS * 0.55);
    }
    setTimeout(() => {
      f.remove();
      el.classList.remove("em-voo");
    }, atraso + VOO_MS + 40);
  }

  function voarVerso(de, para, base, atraso = 0) {
    if (!de || !para) return;
    const f = costas();
    f.classList.add("bu-fantasma");
    f.style.setProperty("--cw", `${para.width}px`);
    f.style.setProperty("--ch", `${para.height}px`);
    f.style.left = `${para.left - base.left}px`;
    f.style.top = `${para.top - base.top}px`;
    f.style.zIndex = "";
    f.style.translate = `${de.left - para.left}px ${de.top - para.top}px`;
    f.style.scale = `${de.width / para.width} ${de.height / para.height}`;
    vooEl.append(f);
    void f.offsetWidth;
    f.style.transitionDelay = atraso ? `${atraso}ms` : "";
    f.classList.add("voando");
    f.style.translate = "0px 0px";
    f.style.scale = "1";
    setTimeout(() => f.remove(), atraso + VOO_MS + 40);
  }

  /** Faz cada carta que mudou de lugar viajar do lugar antigo até o novo. */
  function animar(antes, anterior, acao) {
    if (reduzirMovimento.matches || !antes) return;
    const base = mesa.getBoundingClientRect();
    const morto0 = !anterior.pegouMorto[0] && estado.pegouMorto[0];
    let k = 0;
    for (const [id, el] of elementos) {
      if (!el.isConnected) continue;
      const para = el.getBoundingClientRect();
      if (!para.width) continue;
      let de = antes.rects.get(id);
      let virar = false;
      if (!de) {
        // Carta que estava escondida: veio do monte ou do morto (para a sua mão) ou da mão do Zeca
        de = estado.maos[0].includes(id) ? (morto0 ? antes.mortos : antes.monte) : antes.maoPc;
        virar = true;
      }
      const mudouDeZona = !antes.zonas.has(id) || antes.zonas.get(id) !== zonaDe(el);
      if (!mudouDeZona && Math.abs(de.left - para.left) < 2 && Math.abs(de.top - para.top) < 2) continue;
      const atraso = mudouDeZona ? Math.min(k++, 12) * 45 : 0;
      voar(el, de, para, base, { atraso, virar });
    }
    const maoPc = retanguloDaMaoDoPc();
    if (anterior.vez === 1 && acao.tipo === "monte") voarVerso(antes.monte, maoPc, base);
    if (!anterior.pegouMorto[1] && estado.pegouMorto[1]) for (let i = 0; i < 4; i++) voarVerso(antes.mortos, maoPc, base, i * 60);
    const virouMonte = anterior.mortos.length > estado.mortos.length && !morto0 && anterior.pegouMorto[1] === estado.pegouMorto[1];
    if (virouMonte) {
      const monte = monteEl.querySelector(".bu-pilha-cartas").getBoundingClientRect();
      for (let i = 0; i < 3; i++) voarVerso(antes.mortos, monte, base, VOO_MS + i * 60);
    }
  }

  /** Começo de rodada: as cartas saem do monte para as mãos e para o lixo. */
  function animarDistribuicao() {
    if (reduzirMovimento.matches) return;
    const base = mesa.getBoundingClientRect();
    const monte = monteEl.querySelector(".bu-pilha-cartas").getBoundingClientRect();
    const maoPc = retanguloDaMaoDoPc();
    let k = 0;
    for (const id of [...estado.maos[0], ...estado.lixo]) {
      const el = elementos.get(id);
      if (!el || !el.isConnected) continue;
      voar(el, monte, el.getBoundingClientRect(), base, { atraso: k++ * 35, virar: true });
    }
    for (let i = 0; i < 6; i++) voarVerso(monte, maoPc, base, i * 70);
  }

  /** Rola a área de jogos para que o jogo [i] fique à vista. */
  function mostrarJogo(lado, i) {
    const cont = jogosEl[lado];
    const el = cont.querySelector(`[data-alvo="jogo:${lado}:${i}"]`);
    if (!el) return;
    const rc = cont.getBoundingClientRect();
    const re = el.getBoundingClientRect();
    if (re.top < rc.top) cont.scrollTop += re.top - rc.top - 6;
    else if (re.bottom > rc.bottom) cont.scrollTop += re.bottom - rc.bottom + 6;
  }

  // ---------- Diálogo ----------

  let aoCancelarDialogo = null;

  function abrirDialogo({ titulo, texto, tabela = null, dados = [], botoes, aoCancelar }) {
    dialogoTitulo.textContent = titulo;
    dialogoTexto.textContent = texto;
    dialogoTabela.replaceChildren(...(tabela ? [tabela] : []));
    dialogoTabela.hidden = !tabela;
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
        const b = document.createElement("button");
        b.type = "button";
        b.className = secundario ? "button secondary" : "button";
        b.textContent = rotulo;
        b.addEventListener("click", () => {
          fecharDialogo();
          acao();
        });
        return b;
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
  dialogo.addEventListener("close", () => agendarComputador());

  // ---------- Jogadas ----------

  /** O que a jogada fez, para o aviso e para o leitor de tela. */
  function relatar(anterior, acao) {
    const j = anterior.vez;
    const pc = j === 1;
    const partes = [];
    const extras = [];
    switch (acao.tipo) {
      case "monte":
        partes.push(pc ? "comprou do monte" : `comprou ${comArtigo(estado.novaCarta ?? P.topo(anterior.monte))}`);
        break;
      case "lixo": {
        partes.push(`pegou o lixo (${plural(anterior.lixo.length, "carta", "cartas")})`);
        if (acao.uso) {
          const t = P.topo(anterior.lixo);
          if (acao.uso.jogo === null) partes.push(`baixou ${P.listarCartas(P.analisarJogo([t, ...acao.uso.cartas]).ordem)}`);
          else partes.push(`pôs ${comArtigo(t)} no jogo de ${P.descreverJogo(anterior.jogos[j][acao.uso.jogo])}`);
        }
        break;
      }
      case "baixar":
        partes.push(`baixou ${P.listarCartas(P.analisarJogo(acao.cartas).ordem)}`);
        break;
      case "adicionar":
        partes.push(`pôs ${acao.cartas.length === 1 ? comArtigo(acao.cartas[0]) : P.listarCartas(acao.cartas)} no jogo de ${P.descreverJogo(anterior.jogos[j][acao.jogo])}`);
        break;
      default:
        partes.push(`descartou ${comArtigo(acao.carta)}`);
    }
    const tiposAntes = anterior.jogos[j].map(P.tipoCanastra);
    const tiposDepois = estado.jogos[j].map(P.tipoCanastra);
    const novas = tiposDepois.filter((t, i) => t && t !== tiposAntes[i]);
    for (const t of novas) partes.push(`${t === "suja" ? "fechou uma canastra suja" : "fechou uma canastra limpa"}`);
    if (!anterior.pegouMorto[j] && estado.pegouMorto[j]) {
      partes.push("pegou o morto");
      if (estado.mortoIntocado[j]) extras.push(pc ? `O ${NOME} joga com as cartas do morto na próxima vez.` : "Você joga com as cartas do morto na próxima vez.");
      else if (!P.terminouRodada(estado)) extras.push(pc ? `O ${NOME} segue jogando com as cartas do morto.` : "Sua vez continua com as cartas do morto.");
    }
    if (P.terminouRodada(estado) && estado.resumo.bateu === j) partes.push("bateu");
    if (anterior.mortos.length > estado.mortos.length && anterior.pegouMorto.every((v, i) => v === estado.pegouMorto[i])) {
      extras.push("O monte acabou, e um morto virou o monte.");
    }
    if (!anterior.ultimaVolta && estado.ultimaVolta) extras.push("O monte acabou: esta é a última vez da rodada.");
    return { partes, extras, canastra: novas.length > 0 };
  }

  /** Troca o estado pela jogada feita, redesenha, anima, fala e salva. */
  function executar(novo, acao) {
    if (!novo) return false;
    const anterior = estado;
    const j = anterior.vez;
    const antes = capturar();
    if (j === 0) {
      // Comprar do monte e descartar não se desfazem; o morto também mostra cartas novas
      if (acao.tipo === "monte" || acao.tipo === "descartar" || (!anterior.pegouMorto[0] && novo.pegouMorto[0])) historico = [];
      else historico.push(anterior);
      if (historico.length > LIMITE_HISTORICO) historico.shift();
      selecionadas.clear();
    } else {
      historico = [];
    }
    escolhendoJogo = null;
    estado = novo;
    limparDica();
    if (j === 0) {
      // A dica ou o aviso de antes já não vale depois da sua jogada
      clearTimeout(mensagemTimer);
      mensagemEl.classList.remove("visivel");
      if (novo.vez === 1) ultimaDoPc = "";
    }
    const r = relatar(anterior, acao);
    if (j === 1) ultimaDoPc = juntar(r.partes);
    desenhar();
    const lado = acao.tipo === "lixo" ? (acao.uso ? acao.uso.jogo : null) : acao.jogo;
    if (acao.tipo === "baixar" || (acao.tipo === "lixo" && acao.uso && acao.uso.jogo === null)) mostrarJogo(j, estado.jogos[j].length - 1);
    else if (lado !== null && lado !== undefined) mostrarJogo(j, lado);
    animar(antes, anterior, acao);

    const frase = `${j === 0 ? "Você" : NOME} ${juntar(r.partes)}.`;
    const texto = [frase, ...r.extras].join(" ");
    if (j === 0 && (r.extras.length || estado.pegouMorto[0] !== anterior.pegouMorto[0] || r.canastra)) avisar(texto);
    else if (j === 1 && r.extras.length) avisar(r.extras.join(" "));
    else anunciar(texto);

    if (r.canastra) som.tocar("completo");
    else if (acao.tipo === "monte") som.tocar("virar");
    else if (acao.tipo === "descartar" || (acao.tipo === "lixo" && !acao.uso)) som.tocar("deslizar");
    else som.tocar("pousar");
    if (anterior.pegouMorto[j] !== estado.pegouMorto[j]) som.tocar("acerto");

    salvar();
    if (P.terminouRodada(estado)) terminarRodada();
    else agendarComputador();
    return true;
  }

  function agendarComputador(espera = PASSO_MS) {
    clearTimeout(timerComputador);
    timerComputador = null;
    if (!estado || estado.vez !== 1 || P.terminouRodada(estado)) return;
    timerComputador = setTimeout(passoDoComputador, espera);
  }

  function passoDoComputador() {
    timerComputador = null;
    if (!estado || estado.vez !== 1 || P.terminouRodada(estado)) return;
    if (dialogo.open) return;
    let acao = P.proximaAcao(estado);
    let novo = acao && P.aplicar(estado, acao);
    if (!novo) {
      // Nunca deveria acontecer; por segurança, compra ou descarta a primeira carta que puder
      acao = estado.fase === "comprar" ? { tipo: "monte" } : { tipo: "descartar", carta: estado.maos[1].find((id) => !P.motivoDescartar(estado, id)) };
      novo = P.aplicar(estado, acao);
      if (!novo) return;
    }
    executar(novo, acao);
  }

  function selecao() {
    return P.ordenarMao([...selecionadas], porValor);
  }

  function comprar() {
    if (motivos.comprar) return recusar(motivos.comprar);
    executar(P.comprarMonte(estado), { tipo: "monte" });
  }

  function pegarLixo() {
    if (motivos.pegar) return recusar(motivos.pegar);
    if (estado.modo === "aberto") {
      executar(P.pegarLixo(estado, null), { tipo: "lixo", uso: null });
      return;
    }
    const usos = P.usosDoLixo(estado, selecao());
    const uso = usos.find((u) => u.jogo === null) || (usos.length === 1 ? usos[0] : null);
    if (uso) {
      executar(P.pegarLixo(estado, uso), { tipo: "lixo", uso });
      return;
    }
    escolhendoJogo = usos.map((u) => u.jogo);
    desenhar();
    som.tocar("selecionar");
    avisar(`${maiuscula(comArtigo(P.topo(estado.lixo)))} encaixa em mais de um jogo seu: toque no jogo onde a carta deve entrar.`);
  }

  function baixar() {
    if (motivos.baixar) return recusar(motivos.baixar, motivos.baixar === P.MSG_SEQUENCIA ? [...selecionadas] : []);
    const cartas = selecao();
    executar(P.baixarJogo(estado, cartas), { tipo: "baixar", cartas });
  }

  function descartarEscolhida() {
    if (motivos.descartar) return recusar(motivos.descartar);
    const carta = [...selecionadas][0];
    executar(P.descartar(estado, carta), { tipo: "descartar", carta });
  }

  function tocarJogo(lado, i) {
    if (lado === 1) {
      avisar(`Esse jogo é do ${NOME}: você só pode pôr cartas nos seus jogos.`);
      return;
    }
    if (!minhaVez()) return recusar(motivos.comprar || `Espere: é a vez do ${NOME}.`);
    const sel = selecao();
    if (estado.fase === "comprar") {
      if (estado.modo === "aberto") return recusar("Primeiro compre do monte ou pegue o lixo.");
      const uso = { cartas: sel, jogo: i };
      const m = P.motivoPegarLixo(estado, uso);
      if (m) return recusar(m);
      executar(P.pegarLixo(estado, uso), { tipo: "lixo", uso });
      return;
    }
    if (!sel.length) {
      avisar("Escolha na mão as cartas que vão para este jogo e toque nele de novo.");
      return;
    }
    const m = P.motivoAdicionar(estado, i, sel);
    if (m) return recusar(m, sel);
    executar(P.adicionar(estado, i, sel), { tipo: "adicionar", jogo: i, cartas: sel });
  }

  function tocarCarta(id) {
    if (!estado.maos[0].includes(id)) return;
    if (selecionadas.has(id)) selecionadas.delete(id);
    else selecionadas.add(id);
    escolhendoJogo = null;
    limparDica();
    desenhar();
    som.tocar("selecionar");
    const n = selecionadas.size;
    anunciar(`${P.nomeCarta(id)} ${selecionadas.has(id) ? "escolhida" : "fora da escolha"}. ${n ? plural(n, "carta escolhida", "cartas escolhidas") : "Nenhuma carta escolhida"}.`);
  }

  function limparEscolha() {
    if (!selecionadas.size && !escolhendoJogo) return;
    selecionadas.clear();
    escolhendoJogo = null;
    desenhar();
    anunciar("Escolha desfeita.");
  }

  function ativar(chave) {
    if (!estado || dialogo.open) return;
    if (chave === "monte") comprar();
    else if (chave === "lixo") pegarLixo();
    else if (chave.startsWith("mao:")) tocarCarta(Number(chave.slice(4)));
    else if (chave.startsWith("jogo:")) {
      const [, lado, i] = chave.split(":").map(Number);
      tocarJogo(lado, i);
    }
  }

  function desfazer() {
    if (!historico.length || !minhaVez()) return;
    fecharDialogo();
    const antes = capturar();
    const anterior = estado;
    estado = historico.pop();
    selecionadas.clear();
    escolhendoJogo = null;
    limparDica();
    desenhar();
    animar(antes, anterior, { tipo: "desfazer" });
    salvar();
    som.tocar("desfazer");
    anunciar(estado.fase === "comprar" ? "Jogada desfeita: o lixo voltou para a mesa." : "Jogada desfeita.");
  }

  // ---------- Dica ----------

  function limparDica() {
    clearTimeout(dicaTimer);
    for (const el of raiz.querySelectorAll(".bu-dica")) el.classList.remove("bu-dica");
  }

  function marcar(...els) {
    for (const el of els) if (el) el.classList.add("bu-dica");
    dicaTimer = setTimeout(limparDica, 2600);
  }

  const elJogo = (lado, i) => jogosEl[lado].querySelector(`[data-alvo="jogo:${lado}:${i}"]`);

  /** A dica é a jogada que o Zeca faria no seu lugar, com as cartas já escolhidas. */
  function mostrarDica() {
    if (!minhaVez()) return;
    const a = P.proximaAcao(estado);
    if (!a) return;
    limparDica();
    som.tocar("dica");
    let texto;
    if (a.tipo === "monte") {
      selecionadas.clear();
      desenhar();
      marcar(monteEl, botao.comprar);
      texto = "Dica: compre do monte. O lixo não ajuda agora.";
    } else if (a.tipo === "lixo") {
      selecionadas = new Set(a.uso ? a.uso.cartas : []);
      desenhar();
      if (a.uso && a.uso.jogo !== null) {
        marcar(lixoEl, elJogo(0, a.uso.jogo));
        texto = `Dica: pegue o lixo e ponha ${comArtigo(P.topo(estado.lixo))} no jogo de ${P.descreverJogo(estado.jogos[0][a.uso.jogo])}${a.uso.cartas.length ? `, junto com ${P.listarCartas(a.uso.cartas)}` : ""}: toque no jogo.`;
      } else if (a.uso) {
        marcar(lixoEl, botao.pegar);
        texto = `Dica: pegue o lixo e baixe ${comArtigo(P.topo(estado.lixo))} com ${P.listarCartas(a.uso.cartas)}.`;
      } else {
        marcar(lixoEl, botao.pegar);
        texto = `Dica: pegue o lixo (${plural(estado.lixo.length, "carta", "cartas")}).`;
      }
    } else if (a.tipo === "baixar") {
      selecionadas = new Set(a.cartas);
      desenhar();
      marcar(botao.baixar);
      texto = `Dica: baixe ${P.listarCartas(P.analisarJogo(a.cartas).ordem)}.`;
    } else if (a.tipo === "adicionar") {
      selecionadas = new Set(a.cartas);
      desenhar();
      mostrarJogo(0, a.jogo);
      marcar(elJogo(0, a.jogo));
      texto = `Dica: ponha ${a.cartas.length === 1 ? comArtigo(a.cartas[0]) : P.listarCartas(a.cartas)} no seu jogo de ${P.descreverJogo(estado.jogos[0][a.jogo])}.`;
    } else {
      selecionadas = new Set([a.carta]);
      desenhar();
      marcar(botao.descartar);
      texto = `Dica: descarte ${comArtigo(a.carta)}.`;
    }
    for (const id of selecionadas) marcar(elementos.get(id));
    avisar(texto);
  }

  // ---------- Fim da rodada e da partida ----------

  function tabelaDoResumo(r) {
    const t = document.createElement("table");
    t.className = "bu-tabela";
    const cab = document.createElement("thead");
    const tr = document.createElement("tr");
    for (const texto of ["", "Você", NOME]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = texto;
      tr.append(th);
    }
    cab.append(tr);
    const corpo = document.createElement("tbody");
    const [a, b] = r.linhas;
    const num = (n) => (n === 0 ? "—" : `${n > 0 ? "" : "−"}${P.formatarNumero(Math.abs(n))}`);
    const canastras = (l) => {
      const partes = [];
      if (l.limpas) partes.push(plural(l.limpas, "limpa", "limpas"));
      if (l.sujas) partes.push(plural(l.sujas, "suja", "sujas"));
      return partes.length ? [num(l.canastras), partes.join(", ")] : "—";
    };
    corpo.append(
      linhaTabela(["Cartas na mesa", num(a.cartasMesa), num(b.cartasMesa)]),
      linhaTabela(["Canastras", canastras(a), canastras(b)]),
      linhaTabela(["Bater", num(a.bater), num(b.bater)]),
      linhaTabela(["Morto", num(a.morto), num(b.morto)]),
      linhaTabela(["Cartas na mão", num(a.mao), num(b.mao)]),
      linhaTabela(["Rodada", num(a.total), num(b.total)], "total"),
      linhaTabela(["Placar", P.formatarNumero(estado.totais[0]), P.formatarNumero(estado.totais[1])], "total"),
    );
    t.append(cab, corpo);
    return t;
  }

  function terminarRodada(espera = 900) {
    clearTimeout(timerComputador);
    if (estado.fase === "acabou") concluirPartida();
    clearTimeout(timerDialogo);
    timerDialogo = setTimeout(abrirFimDeRodada, espera);
  }

  function abrirFimDeRodada() {
    if (!P.terminouRodada(estado) || !estado.resumo) return;
    const r = estado.resumo;
    const quem = r.bateu === 0 ? "Você bateu." : r.bateu === 1 ? `O ${NOME} bateu.` : "O monte acabou e ninguém bateu.";
    if (estado.fase === "acabou") {
      const venceu = estado.vencedor === 0;
      const { semente, modo, alvo } = estado;
      abrirDialogo({
        titulo: venceu ? "Você venceu a partida!" : `O ${NOME} venceu a partida`,
        texto: `${quem} Placar final: você ${P.formatarNumero(estado.totais[0])} x ${P.formatarNumero(estado.totais[1])} ${NOME}.`,
        tabela: tabelaDoResumo(r),
        botoes: [
          { rotulo: "Nova partida", acao: () => novaPartida() },
          { rotulo: "Jogar esta de novo", acao: () => novaPartida({ modo, alvo, semente }), secundario: true },
          { rotulo: "Ver a mesa", acao: () => {}, secundario: true },
        ],
      });
      return;
    }
    abrirDialogo({
      titulo: `Fim da rodada ${r.rodada}`,
      texto: `${quem} Faltam ${P.formatarNumero(Math.max(0, estado.alvo - Math.max(...estado.totais)))} pontos para alguém chegar a ${P.formatarNumero(estado.alvo)}.`,
      tabela: tabelaDoResumo(r),
      botoes: [
        { rotulo: "Próxima rodada", acao: proximaRodada },
        { rotulo: "Ver a mesa", acao: () => {}, secundario: true },
      ],
    });
  }

  function proximaRodada() {
    if (estado.fase !== "fim") return;
    fecharDialogo();
    clearTimeout(timerDialogo);
    estado = P.novaRodada(estado);
    historico = [];
    selecionadas.clear();
    escolhendoJogo = null;
    ultimaDoPc = "";
    desenhar();
    for (const c of jogosEl) c.scrollTop = 0;
    animarDistribuicao();
    salvar();
    som.tocar("embaralhar");
    anunciar(
      `Rodada ${estado.rodada}. ${estado.vez === 0 ? "Sua vez: compre do monte ou pegue o lixo." : `O ${NOME} começa.`} Por cima do lixo, ${comArtigo(P.topo(estado.lixo))}.`,
    );
    agendarComputador(1100);
  }

  function concluirPartida() {
    gravar(CHAVE_PARTIDA, null);
    const chave = chaveEstatisticas();
    const venceu = estado.vencedor === 0;
    const { estatisticas: novas } = P.registrarResultado(estatisticas[chave], { venceu, pontos: estado.totais[0] });
    estatisticas = { ...estatisticas, [chave]: novas };
    gravar(CHAVE_ESTATISTICAS, estatisticas);
    desenharEstatisticas();
    som.tocar(venceu ? "vitoria" : "derrota");
  }

  // ---------- Estatísticas ----------

  function desenharEstatisticas() {
    const chave = chaveEstatisticas();
    const e = estatisticas[chave] || P.estatisticasVazias();
    estModo.textContent = textoDoModo();
    const linhas = [
      ["Partidas", P.formatarNumero(e.jogadas)],
      ["Vitórias", `${P.formatarNumero(e.vitorias)} (${P.porcentagemVitorias(e)}%)`],
      ["Maior pontuação numa partida", e.maiorPontuacao === null ? "—" : P.formatarNumero(e.maiorPontuacao)],
      ["Vitórias seguidas", P.formatarNumero(e.sequencia)],
      ["Maior sequência", P.formatarNumero(e.melhorSequencia)],
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
    if (!estado || !estado.iniciado || estado.fase === "acabou") return;
    const chave = chaveEstatisticas();
    estatisticas = { ...estatisticas, [chave]: P.registrarResultado(estatisticas[chave], { venceu: false }).estatisticas };
    gravar(CHAVE_ESTATISTICAS, estatisticas);
  }

  // ---------- Partida ----------

  function novaPartida({ modo = estado ? estado.modo : P.MODO_PADRAO, alvo = estado ? estado.alvo : P.ALVO_PADRAO, semente = P.novaSemente() } = {}) {
    fecharDialogo();
    clearTimeout(timerComputador);
    clearTimeout(timerDialogo);
    registrarAbandono();
    estado = P.novoJogo(modo, alvo, semente);
    gravar(CHAVE_MODO, { modo: estado.modo, alvo: estado.alvo });
    historico = [];
    selecionadas.clear();
    escolhendoJogo = null;
    ultimaDoPc = "";
    foco = null;
    limparDica();
    desenhar();
    for (const c of jogosEl) c.scrollTop = 0;
    animarDistribuicao();
    desenharEstatisticas();
    salvar();
    som.tocar("embaralhar");
    anunciar(
      `Nova partida de Buraco ${textoDoModo()}, número ${P.formatarNumero(semente)}. Sua vez: compre do monte ou pegue o lixo. Por cima do lixo, ${comArtigo(P.topo(estado.lixo))}.`,
    );
  }

  function confirmarNovaPartida(opcoes = {}) {
    if (!estado.iniciado || estado.fase === "acabou") {
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

  // ---------- Eventos ----------

  mesa.addEventListener("click", (evento) => {
    const el = evento.target.closest("[data-alvo]");
    if (!el || !mesa.contains(el)) return;
    foco = el.dataset.alvo;
    ativar(el.dataset.alvo);
  });

  mesa.addEventListener("keydown", (evento) => {
    const el = evento.target.closest?.("[data-alvo]");
    if (!el || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    switch (evento.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        const outro = vizinho(el, evento.key);
        foco = outro.dataset.alvo;
        atualizarFoco(true);
        break;
      }
      case "Enter":
      case " ":
        ativar(el.dataset.alvo);
        break;
      case "Escape":
        if (!selecionadas.size && !escolhendoJogo) return;
        limparEscolha();
        break;
      default:
        return;
    }
    evento.preventDefault();
  });

  mesa.addEventListener("focusin", (evento) => {
    const el = evento.target.closest?.("[data-alvo]");
    if (!el) return;
    foco = el.dataset.alvo;
    for (const x of alvos()) x.tabIndex = x === el ? 0 : -1;
  });
  mesa.addEventListener("contextmenu", (evento) => evento.target.closest(".bu-carta") && evento.preventDefault());

  raiz.addEventListener("keydown", (evento) => {
    if ((evento.ctrlKey || evento.metaKey) && !evento.altKey && evento.key.toLowerCase() === "z" && !evento.target.closest("input, textarea")) {
      evento.preventDefault();
      desfazer();
    }
  });

  botao.comprar.addEventListener("click", comprar);
  botao.pegar.addEventListener("click", pegarLixo);
  botao.baixar.addEventListener("click", baixar);
  botao.descartar.addEventListener("click", descartarEscolhida);
  botao.proxima.addEventListener("click", proximaRodada);
  botao.desfazer.addEventListener("click", desfazer);
  botao.dica.addEventListener("click", mostrarDica);
  botao.nova.addEventListener("click", () => confirmarNovaPartida());
  botao.ordenar.addEventListener("click", () => {
    const antes = capturar();
    porValor = !porValor;
    gravar(CHAVE_ORDEM, porValor ? "valor" : "naipe");
    desenhar();
    animar(antes, estado, { tipo: "ordenar" });
    anunciar(porValor ? "Mão em ordem de valor." : "Mão em ordem de naipe.");
  });
  for (const b of botoesModo) {
    b.addEventListener("click", () => {
      if (b.dataset.modo !== estado.modo) confirmarNovaPartida({ modo: b.dataset.modo, alvo: estado.alvo });
    });
  }
  for (const b of botoesAlvo) {
    b.addEventListener("click", () => {
      const alvo = Number(b.dataset.meta);
      if (alvo !== estado.alvo) confirmarNovaPartida({ modo: estado.modo, alvo });
    });
  }
  botaoZerar.addEventListener("click", () => {
    const chave = chaveEstatisticas();
    const texto = textoDoModo();
    abrirDialogo({
      titulo: "Zerar estatísticas?",
      texto: `As estatísticas do Buraco ${texto} voltam para zero. Isso não pode ser desfeito.`,
      botoes: [
        {
          rotulo: "Sim, zerar",
          acao: () => {
            estatisticas = { ...estatisticas, [chave]: P.estatisticasVazias() };
            gravar(CHAVE_ESTATISTICAS, estatisticas);
            desenharEstatisticas();
            anunciar("Estatísticas zeradas.");
          },
        },
        { rotulo: "Não", acao: () => {}, secundario: true },
      ],
    });
  });
  som.ligarBotao($("bu-som"));

  // ---------- Tamanho da tela e saída da página ----------

  let redesenho = null;
  let ultimaMedida = "";
  function aoMudarTamanho() {
    cancelAnimationFrame(redesenho);
    redesenho = requestAnimationFrame(() => {
      const medida = `${mesa.clientWidth}x${mesa.clientHeight}`;
      if (medida === ultimaMedida || !estado) return;
      ultimaMedida = medida;
      medir();
      desenhar();
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
  for (const modo of P.MODOS) {
    for (const alvo of P.ALVOS) {
      const chave = P.chaveModo(modo, alvo);
      estatisticas[chave] = P.lerEstatisticas(salvas[chave]);
    }
  }
  porValor = lerJson(CHAVE_ORDEM) === "valor";
  const salva = lerJson(CHAVE_PARTIDA);
  const restaurada = salva && P.restaurar(salva.estado);
  medir();
  if (restaurada && restaurada.fase !== "acabou") {
    estado = restaurada;
    historico = Array.isArray(salva.historico)
      ? salva.historico
          .map(P.restaurar)
          .filter((h) => h && h.semente === estado.semente && h.rodada === estado.rodada && h.turnos === estado.turnos && h.vez === 0)
      : [];
    if (estado.vez !== 0) historico = [];
    desenhar();
    desenharEstatisticas();
    anunciar(`Partida anterior retomada: rodada ${estado.rodada}, você ${P.formatarNumero(estado.totais[0])} x ${P.formatarNumero(estado.totais[1])} ${NOME}.`);
    if (estado.fase === "fim") terminarRodada(300);
    else agendarComputador(1200);
  } else {
    const preferencia = lerJson(CHAVE_MODO) || {};
    novaPartida({
      modo: P.MODOS.includes(preferencia.modo) ? preferencia.modo : P.MODO_PADRAO,
      alvo: P.ALVOS.includes(preferencia.alvo) ? preferencia.alvo : P.ALVO_PADRAO,
    });
  }
  ultimaMedida = `${mesa.clientWidth}x${mesa.clientHeight}`;
})();
