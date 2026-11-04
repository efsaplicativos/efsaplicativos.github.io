"use strict";
/*
 * Interface da Paciência Pirâmide. As regras, a dica e a busca da solução ficam em
 * paciencia-piramide-logica.js.
 *
 * As 52 cartas são criadas uma vez e só mudam de lugar (propriedade CSS translate). Um toque
 * escolhe a carta e outro, numa carta que some 13 com ela, tira o par; o Rei sai com um toque só.
 * Também dá para arrastar uma carta sobre a outra. No teclado, as setas andam pela pirâmide e pela
 * fileira do monte, Enter ou Espaço escolhe, Esc desfaz a escolha e Ctrl+Z desfaz a jogada.
 * A partida, o histórico para desfazer, o modo e as estatísticas ficam no localStorage.
 */
(() => {
  const raiz = document.querySelector(".piramide");
  if (!raiz || typeof LogicaPiramide !== "object") return;
  const P = LogicaPiramide;

  const CHAVE_PARTIDA = "efs-piramide-partida";
  const CHAVE_ESTATISTICAS = "efs-piramide-estatisticas";
  const CHAVE_MODO = "efs-piramide-modo";
  const LIMITE_HISTORICO = 500;
  const HISTORICO_SALVO = 60;
  const ARRASTO_MINIMO = 6;
  const TRAVA_DIALOGO_MS = 500;
  const MENSAGEM_MS = 3400;
  const LIMITE_BUSCA = 200000;
  const POSICOES_POR_PEDACO = 4000;
  const reduzirMovimento = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  const mesa = raiz.querySelector("#pr-mesa");
  const textoTempo = raiz.querySelector("#pr-tempo");
  const textoPiramide = raiz.querySelector("#pr-piramide");
  const textoMonte = raiz.querySelector("#pr-monte");
  const textoPartida = raiz.querySelector("#pr-partida");
  const botaoDesfazer = raiz.querySelector("#pr-desfazer");
  const botaoDica = raiz.querySelector("#pr-dica");
  const botaoNova = raiz.querySelector("#pr-nova");
  const botoesModo = [...raiz.querySelectorAll("[data-modo]")];
  const status = raiz.querySelector("#pr-status");
  const estLista = raiz.querySelector("#pr-est-lista");
  const estModo = raiz.querySelector("#pr-est-modo");
  const botaoZerar = raiz.querySelector("#pr-zerar");
  const dialogo = raiz.querySelector("#pr-dialogo");
  const dialogoTitulo = raiz.querySelector("#pr-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#pr-dialogo-texto");
  const dialogoDados = raiz.querySelector("#pr-dialogo-dados");
  const dialogoBotoes = raiz.querySelector("#pr-dialogo-botoes");
  const rotuloDica = botaoDica.textContent;
  // Se sons.js não carregar, o jogo segue mudo e o botão some
  const som =
    typeof Sons === "object" ? Sons.criar("paciencia-piramide", raiz) : { tocar() {}, ligarBotao: (b) => b && (b.hidden = true) };

  let estado;
  let historico = [];
  let estatisticas = {};
  let retomada = false;
  let acumuladoMs = 0;
  let inicioTrecho = null;
  let tique = null;
  let avisouFim = false;
  let pressao = null;
  let selecionada = null;
  let dicaTimer = null;
  let foco = 21;
  let g = null;
  let posicoes = [];
  // Solução achada pela dica: as próximas jogadas, enquanto o jogador seguir por ela
  let plano = null;
  let busca = null;

  // ---------- Pilhas: 0 a 27 posições da pirâmide, 28 monte, 29 descarte, 30 cartas tiradas ----------

  const MONTE = 28;
  const DESCARTE = 29;
  const TIRADAS = 30;
  const TOTAL_PILHAS = 31;
  const tipoDaPilha = (i) => (i < P.POSICOES ? "vaga" : i === MONTE ? "monte" : i === DESCARTE ? "descarte" : "tiradas");
  const linhaDaPilha = (i) => (i < P.POSICOES ? P.LINHA_DE[i] : -1);

  const pilhasEl = [...Array(TOTAL_PILHAS).keys()].map((i) => {
    const el = document.createElement("div");
    el.className = `pr-pilha pr-pilha-${tipoDaPilha(i)}`;
    el.dataset.i = String(i);
    el.tabIndex = -1;
    el.setAttribute("role", "button");
    return el;
  });

  const anel = document.createElement("div");
  anel.className = "pr-anel";
  anel.hidden = true;

  const cartasEl = [...Array(P.CARTAS).keys()].map((id) => {
    const el = document.createElement("div");
    const naipe = P.NAIPES[P.naipe(id)].id;
    el.className = `pr-carta${P.vermelha(id) ? " vermelha" : ""}`;
    el.dataset.id = String(id);
    el.setAttribute("aria-hidden", "true");
    const centro =
      P.valor(id) > 10
        ? `<span class="pr-centro pr-figura">${P.textoValor(id)}</span>`
        : `<span class="pr-centro"><i class="pr-naipe pr-naipe-${naipe}"></i></span>`;
    el.innerHTML =
      `<span class="pr-frente"><span class="pr-valor">${P.textoValor(id)}</span>` +
      `<i class="pr-naipe pr-naipe-${naipe} pr-naipe-canto"></i>${centro}</span><span class="pr-verso"></span>`;
    return el;
  });
  // Aviso curto e visível sobre a mesa; o leitor de tela recebe o mesmo texto pelo status
  const mensagemEl = document.createElement("p");
  mensagemEl.className = "pr-mensagem";
  mensagemEl.setAttribute("aria-hidden", "true");
  mesa.replaceChildren(...pilhasEl, ...cartasEl, anel, mensagemEl);

  const nome = (id) => P.nomeCarta(id);
  const NOMES_COM_NUMERO = { 1: "Ás (1)", 11: "Valete (11)", 12: "Dama (12)", 13: "Rei (13)" };
  const valorComNumero = (id) => NOMES_COM_NUMERO[P.valor(id)] || String(P.valor(id));
  const textoVolta = (e) => (e.modo === 0 ? `volta ${e.volta}` : `volta ${e.volta} de ${e.modo}`);

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
    if (!estado || P.venceu(estado)) return;
    sincronizarSegundos();
    gravar(CHAVE_PARTIDA, { estado, historico: historico.slice(-HISTORICO_SALVO) });
  }

  // ---------- Cronômetro ----------

  const decorridoMs = () => acumuladoMs + (inicioTrecho === null ? 0 : performance.now() - inicioTrecho);

  function sincronizarSegundos() {
    if (!estado) return;
    const segundos = Math.floor(decorridoMs() / 1000);
    if (segundos !== estado.segundos) estado = { ...estado, segundos };
    textoTempo.textContent = P.formatarTempo(estado.segundos);
  }

  function atualizarCronometro() {
    const deveRodar = estado.iniciado && !retomada && !P.venceu(estado) && document.visibilityState === "visible";
    if (deveRodar && inicioTrecho === null) {
      inicioTrecho = performance.now();
      tique = setInterval(sincronizarSegundos, 250);
    } else if (!deveRodar && inicioTrecho !== null) {
      acumuladoMs = decorridoMs();
      inicioTrecho = null;
      clearInterval(tique);
      sincronizarSegundos();
    }
    textoTempo.textContent = P.formatarTempo(estado.segundos);
  }

  function zerarCronometro(segundos = 0) {
    if (inicioTrecho !== null) clearInterval(tique);
    inicioTrecho = null;
    acumuladoMs = segundos * 1000;
  }

  // ---------- Medidas da mesa ----------

  function medir() {
    const largura = mesa.clientWidth;
    const espaco = Math.max(4, Math.round(largura * 0.012));
    const margem = Math.max(6, Math.round(largura * 0.02));
    const cw = Math.floor((largura - 2 * margem - (P.LINHAS - 1) * espaco) / P.LINHAS);
    const ch = Math.round(cw * 1.4);
    // Cada linha da pirâmide cobre a metade de baixo das cartas da linha de cima
    const passoLinha = Math.round(ch * 0.5);
    g = { espaco, margem, cw, ch, passoLinha };
    mesa.style.setProperty("--cw", `${cw}px`);
    mesa.style.setProperty("--ch", `${ch}px`);
    mesa.style.height = `${2 * margem + (P.LINHAS - 1) * passoLinha + ch}px`;
  }

  const xDaColuna = (x) => g.margem + x * (g.cw + g.espaco);

  /** Retângulo de cada pilha: as posições da pirâmide e, na fileira de cima, o monte, o descarte e as tiradas. */
  function retanguloDaPilha(i) {
    if (i < P.POSICOES) {
      const r = P.LINHA_DE[i];
      return { x: xDaColuna((P.LINHAS - 1 - r) / 2 + P.COLUNA_DE[i]), y: g.margem + r * g.passoLinha, w: g.cw, h: g.ch };
    }
    const x = i === MONTE ? 0 : i === DESCARTE ? 1 : P.LINHAS - 1;
    return { x: xDaColuna(x), y: g.margem, w: g.cw, h: g.ch };
  }

  /** Coberta por alguma carta ainda presente: só a metade de cima dela aparece. */
  const posicaoCoberta = (p) => P.cobertoras(p).some((c) => estado.piramide[c] !== null);

  function calcularPosicoes() {
    const pos = new Array(P.CARTAS);
    estado.piramide.forEach((id, p) => {
      if (id === null) return;
      const r = retanguloDaPilha(p);
      pos[id] = { x: r.x, y: r.y, z: 100 + P.LINHA_DE[p] * 10 + P.COLUNA_DE[p], aberta: true, presa: !P.livreNaPiramide(estado, p) };
    });
    // Nas pilhas, só as cartas de cima aparecem; as de baixo ficam escondidas (as sombras somadas
    // fariam uma borda escura), menos as que ainda podem aparecer durante uma animação
    const empilhar = (lista, pilha, z0, aberta, visiveis) => {
      const r = retanguloDaPilha(pilha);
      lista.forEach((id, i) => {
        pos[id] = { x: r.x, y: r.y, z: z0 + i, aberta, coberta: i < lista.length - visiveis };
      });
    };
    empilhar(estado.monte, MONTE, 10, false, 2);
    empilhar(estado.descarte, DESCARTE, 40, true, 3);
    empilhar(estado.tiradas, TIRADAS, 200, true, 4);
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
    const livres = new Set(P.cartasLivres(estado));
    posicoes.forEach((p, id) => {
      const el = cartasEl[id];
      const antes = anteriores[id];
      const mudou = !antes || antes.x !== p.x || antes.y !== p.y;
      const atraso = !semAnimacao && atrasos ? atrasos.get(id) || 0 : 0;
      el.style.transitionDelay = atraso ? `${atraso}ms` : "";
      el.style.translate = `${p.x}px ${p.y}px`;
      // A carta que está indo para outra pilha passa por cima das outras durante o caminho
      el.style.zIndex = String(mudou && antes && !semAnimacao ? 1000 + p.z : p.z);
      if (mudou && antes && !semAnimacao) {
        clearTimeout(el._z);
        el._z = setTimeout(() => (el.style.zIndex = String(posicoes[id].z)), 260 + atraso);
      }
      const virou = antes && antes.aberta !== p.aberta;
      el.classList.toggle("aberta", p.aberta);
      el.classList.toggle("coberta", Boolean(p.coberta));
      el.classList.toggle("presa", Boolean(p.presa));
      el.classList.toggle("livre", livres.has(id));
      if (virou && !semAnimacao) {
        el.classList.remove("virando");
        void el.offsetWidth;
        el.classList.add("virando");
      }
    });
    if (semAnimacao) requestAnimationFrame(() => mesa.classList.remove("sem-animacao"));

    pilhasEl.forEach((el, i) => {
      const r = retanguloDaPilha(i);
      el.style.translate = `${r.x}px ${r.y}px`;
      el.style.width = `${r.w}px`;
      el.style.height = `${r.h}px`;
      el.setAttribute("aria-label", rotuloDaPilha(i));
    });
    const monteVazio = !estado.monte.length;
    pilhasEl[MONTE].classList.toggle("vazio", monteVazio);
    pilhasEl[MONTE].classList.toggle("reciclar", monteVazio && P.podeReciclar(estado));
    for (const el of cartasEl) el.classList.remove("pr-escolhida");
    if (selecionada !== null) cartasEl[selecionada].classList.add("pr-escolhida");

    textoPiramide.textContent = String(P.naPiramide(estado));
    textoMonte.textContent = String(estado.monte.length);
    textoPartida.textContent = `Partida nº ${P.formatarNumero(estado.semente)} · ${P.textoModo(estado.modo)} · ${textoVolta(estado)}`;
    botaoDesfazer.disabled = !historico.length || P.venceu(estado);
    botaoDica.disabled = P.venceu(estado);
    for (const botao of botoesModo) {
      const ativo = Number(botao.dataset.modo) === estado.modo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    const tinhaFoco = mesa.contains(document.activeElement);
    atualizarFoco(corrigirFoco() && tinhaFoco);
    atualizarCronometro();
  }

  function rotuloDaPilha(i) {
    if (i < P.POSICOES) {
      const id = estado.piramide[i];
      const linha = `Linha ${P.LINHA_DE[i] + 1}, carta ${P.COLUNA_DE[i] + 1}`;
      if (id === null) return `${linha}: vazia.`;
      const situacao = P.livreNaPiramide(estado, i) ? "livre" : "coberta";
      return `${linha}: ${nome(id)}, ${situacao}${id === selecionada ? ", escolhida" : ""}.`;
    }
    if (i === MONTE) {
      const n = estado.monte.length;
      if (n) return `Monte: ${n} ${n === 1 ? "carta" : "cartas"}, ${textoVolta(estado)}. Enter vira uma carta.`;
      if (P.podeReciclar(estado)) return `Monte vazio. Enter devolve as ${estado.descarte.length} cartas do descarte para mais uma volta.`;
      return "Monte vazio, sem mais voltas.";
    }
    if (i === DESCARTE) {
      if (!estado.descarte.length) return "Descarte vazio.";
      const id = estado.descarte[estado.descarte.length - 1];
      return `Descarte: ${nome(id)} por cima${id === selecionada ? ", escolhida" : ""}.`;
    }
    const n = estado.tiradas.length;
    return n ? `Cartas tiradas: ${n}.` : "Nenhuma carta tirada ainda.";
  }

  let mensagemTimer = null;

  function anunciar(texto) {
    status.textContent = texto;
    if (mensagemEl.classList.contains("visivel")) {
      clearTimeout(mensagemTimer);
      mensagemEl.classList.remove("visivel");
    }
  }

  /** Explica, na tela e para o leitor de tela, por que a jogada não saiu. */
  function avisar(texto) {
    anunciar(texto);
    mensagemEl.textContent = texto;
    mensagemEl.classList.add("visivel");
    mensagemTimer = setTimeout(() => mensagemEl.classList.remove("visivel"), MENSAGEM_MS);
  }

  // ---------- Foco do teclado ----------

  function atualizarFoco(mover = true) {
    pilhasEl.forEach((el, i) => (el.tabIndex = i === foco ? 0 : -1));
    const el = pilhasEl[foco];
    if (mover) el.focus({ preventScroll: false });
    const ativo = document.activeElement === el && el.matches(":focus-visible");
    anel.hidden = !ativo;
    if (!ativo) return;
    const r = retanguloDaPilha(foco);
    // Carta coberta: o anel contorna só a parte que aparece
    const h = foco < P.POSICOES && estado.piramide[foco] !== null && posicaoCoberta(foco) ? g.passoLinha : r.h;
    anel.style.translate = `${r.x}px ${r.y}px`;
    anel.style.width = `${r.w}px`;
    anel.style.height = `${h}px`;
  }

  /** Pilhas que o teclado alcança: as posições da pirâmide com carta e a fileira de cima inteira. */
  const alcancavel = (i) => i >= P.POSICOES || estado.piramide[i] !== null;
  const centroX = (i) => {
    const r = retanguloDaPilha(i);
    return r.x + r.w / 2;
  };

  /** A pilha vizinha de [i] na direção da seta, pela posição na tela. */
  function vizinha(i, tecla) {
    const linha = linhaDaPilha(i);
    const x = centroX(i);
    const todas = [...Array(TOTAL_PILHAS).keys()].filter((j) => j !== i && alcancavel(j));
    if (tecla === "ArrowLeft" || tecla === "ArrowRight") {
      const mesmaLinha = todas.filter((j) => linhaDaPilha(j) === linha);
      if (!mesmaLinha.length) return i;
      const sinal = tecla === "ArrowRight" ? 1 : -1;
      const naDirecao = mesmaLinha.filter((j) => sinal * (centroX(j) - x) > 0);
      // Sem mais nada naquele lado, dá a volta para a outra ponta da linha
      const lista = naDirecao.length ? naDirecao : mesmaLinha;
      const distancia = (j) => (naDirecao.length ? Math.abs(centroX(j) - x) : -Math.abs(centroX(j) - x));
      return lista.reduce((melhor, j) => (distancia(j) < distancia(melhor) ? j : melhor));
    }
    const linhas = [...new Set(todas.map(linhaDaPilha))].sort((a, b) => a - b);
    const alvo = tecla === "ArrowDown" ? linhas.find((l) => l > linha) : [...linhas].reverse().find((l) => l < linha);
    if (alvo === undefined) return i;
    const naLinha = todas.filter((j) => linhaDaPilha(j) === alvo);
    // Empate entre as duas cartas de baixo (ou de cima): descendo fica a da esquerda e subindo a
    // da direita, para que descer e subir volte à mesma carta
    const subindo = tecla === "ArrowUp";
    return naLinha.reduce((melhor, j) => {
      const dj = Math.abs(centroX(j) - x);
      const dm = Math.abs(centroX(melhor) - x);
      return dj < dm - 0.5 || (subindo && Math.abs(dj - dm) <= 0.5) ? j : melhor;
    });
  }

  /** A carta com foco saiu: o foco passa para a pilha alcançável mais perto dela. */
  function corrigirFoco() {
    if (alcancavel(foco)) return false;
    const r0 = retanguloDaPilha(foco);
    const distancia = (j) => {
      const r = retanguloDaPilha(j);
      return Math.hypot(r.x - r0.x, (r.y - r0.y) * 1.5);
    };
    const opcoes = [...Array(TOTAL_PILHAS).keys()].filter(alcancavel);
    foco = opcoes.reduce((melhor, j) => (distancia(j) < distancia(melhor) ? j : melhor));
    return true;
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

  // ---------- Jogadas ----------

  const chaveDoEstado = (e) => JSON.stringify([e.piramide, e.monte, e.descarte, e.volta]);
  const mesmaJogada = (a, b) =>
    Boolean(a && b) &&
    (a.monte ? Boolean(b.monte) : Boolean(b.tirar) && a.tirar.length === b.tirar.length && a.tirar.every((id) => b.tirar.includes(id)));

  /** Troca o estado pela jogada feita, guardando o anterior para desfazer. */
  function registrarJogada(novo, jogada) {
    pararBusca();
    sincronizarSegundos();
    const anterior = estado;
    historico.push(anterior);
    if (historico.length > LIMITE_HISTORICO) historico.shift();
    estado = { ...novo, segundos: anterior.segundos };
    // A solução da dica continua valendo se o jogador fez a jogada que ela sugeria
    if (plano && mesmaJogada(plano.caminho[0], jogada)) {
      plano = { caminho: plano.caminho.slice(1), chave: chaveDoEstado(estado) };
    } else {
      plano = null;
    }
    retomada = false;
    avisouFim = false;
    limparDica();
  }

  function tirarCartas(ids) {
    const novo = P.tirar(estado, ids);
    if (!novo) return false;
    registrarJogada(novo, { tirar: ids });
    selecionada = null;
    const atrasos = new Map(ids.map((id, k) => [id, k * 60]));
    desenhar({ atrasos });
    som.tocar("acerto");
    const texto = ids.length === 1 ? `${nome(ids[0])} saiu.` : `${nome(ids[0])} e ${nome(ids[1])} saíram.`;
    const faltam = P.naPiramide(estado);
    anunciar(faltam ? `${texto} ${faltam === 1 ? "Falta 1 carta" : `Faltam ${faltam} cartas`} na pirâmide.` : texto);
    if (P.venceu(estado)) {
      concluir(400);
      return true;
    }
    salvar();
    verificarFim();
    return true;
  }

  function acaoMonte() {
    const novo = P.usarMonte(estado);
    if (!novo) {
      som.tocar("erro");
      if (!estado.monte.length && !estado.descarte.length) avisar("O monte e o descarte já acabaram.");
      else avisar(`O monte já deu ${estado.modo === 1 ? "a sua única volta" : `as ${estado.modo} voltas`} deste modo.`);
      return;
    }
    const reciclou = novo.volta > estado.volta;
    // A carta escolhida na pirâmide continua escolhida; a do descarte, não (ela fica embaixo)
    const escolhida = selecionada;
    registrarJogada(novo, { monte: true });
    selecionada = escolhida !== null && P.localizar(estado, escolhida).tipo === "piramide" ? escolhida : null;
    if (reciclou) {
      const atrasos = new Map(estado.monte.map((id, k) => [id, Math.min(k, 12) * 15]));
      desenhar({ atrasos });
      som.tocar("embaralhar");
      anunciar(`O descarte voltou para o monte: ${textoVolta(estado)}.`);
    } else {
      desenhar();
      som.tocar("virar");
      anunciar(`Virou ${nome(estado.descarte[estado.descarte.length - 1])}. ${estado.monte.length} no monte.`);
    }
    salvar();
    verificarFim();
  }

  function tremer(ids) {
    for (const id of ids) {
      const el = cartasEl[id];
      el.classList.remove("tremendo");
      void el.offsetWidth;
      el.classList.add("tremendo");
    }
  }

  function escolher(id) {
    selecionada = id;
    desenhar();
    som.tocar("selecionar");
    const comPar = P.parceiros(estado, id).length > 0;
    anunciar(
      `${nome(id)} escolhida. ${comPar ? "Agora escolha uma carta livre que some 13 com ela." : "Nenhuma carta livre soma 13 com ela agora."}`,
    );
  }

  /** Um toque (ou Enter) numa carta: escolhe, forma o par com a escolhida ou tira o Rei. */
  function tocarCarta(id) {
    const local = P.localizar(estado, id);
    if (!local) return;
    if (local.tipo === "monte") {
      acaoMonte();
      return;
    }
    if (local.tipo === "tirada") {
      avisar("Essas cartas já saíram do jogo.");
      return;
    }
    if (!local.livre) {
      tremer([id]);
      som.tocar("erro");
      avisar(
        local.tipo === "descarte"
          ? "Só a carta de cima do descarte pode ser usada."
          : `${nome(id)} ainda está coberta: tire antes as cartas que estão sobre ela.`,
      );
      return;
    }
    if (P.valor(id) === 13) {
      tirarCartas([id]);
      return;
    }
    if (selecionada === null || !P.disponivel(estado, selecionada)) {
      escolher(id);
      return;
    }
    if (selecionada === id) {
      selecionada = null;
      desenhar();
      anunciar("Escolha desfeita.");
      return;
    }
    if (P.formaPar(selecionada, id)) {
      tirarCartas([selecionada, id]);
      return;
    }
    const soma = P.valor(selecionada) + P.valor(id);
    tremer([selecionada, id]);
    som.tocar("erro");
    const outra = selecionada;
    selecionada = id;
    desenhar();
    avisar(`${valorComNumero(outra)} + ${valorComNumero(id)} = ${soma}: o par precisa somar 13. Agora ${nome(id)} está escolhida.`);
  }

  function desfazer() {
    if (!historico.length || P.venceu(estado)) return;
    fecharDialogo();
    pararBusca();
    sincronizarSegundos();
    const segundos = estado.segundos;
    estado = { ...historico.pop(), segundos };
    plano = null;
    retomada = false;
    selecionada = null;
    avisouFim = false;
    limparDica();
    desenhar();
    salvar();
    som.tocar("desfazer");
    anunciar("Jogada desfeita.");
  }

  // ---------- Dica e fim de jogo ----------

  function limparDica() {
    clearTimeout(dicaTimer);
    for (const el of [...cartasEl, ...pilhasEl]) el.classList.remove("pr-dica");
  }

  function pararBusca() {
    if (!busca) return;
    clearTimeout(busca.timer);
    busca = null;
    botaoDica.textContent = rotuloDica;
    botaoDica.removeAttribute("aria-busy");
  }

  function exibirDica(d) {
    limparDica();
    // Uma carta escolhida fora da dica confundiria os dois destaques amarelos
    if (selecionada !== null && !(d.tirar && d.tirar.includes(selecionada))) {
      selecionada = null;
      desenhar();
    }
    som.tocar("dica");
    if (d.monte) {
      const vira = estado.monte.length > 0;
      (vira ? cartasEl[estado.monte[estado.monte.length - 1]] : pilhasEl[MONTE]).classList.add("pr-dica");
      anunciar(vira ? "Dica: vire uma carta do monte." : "Dica: devolva o descarte para o monte e comece outra volta.");
    } else {
      for (const id of d.tirar) cartasEl[id].classList.add("pr-dica");
      anunciar(d.tirar.length === 1 ? `Dica: tire o ${nome(d.tirar[0])}.` : `Dica: tire ${nome(d.tirar[0])} e ${nome(d.tirar[1])}.`);
    }
    dicaTimer = setTimeout(limparDica, 2400);
  }

  /**
   * A dica procura uma solução a partir da posição atual (aos pedaços, sem travar a tela) e mostra
   * a primeira jogada dela. Se a busca provar que não há solução, avisa; se ela não terminar a
   * tempo, usa a dica simples.
   */
  function mostrarDica() {
    if (P.venceu(estado) || busca) return;
    limparDica();
    const chave = chaveDoEstado(estado);
    if (plano && plano.chave === chave && plano.caminho.length) {
      exibirDica(plano.caminho[0]);
      return;
    }
    plano = null;
    const procura = P.criarBusca(estado, { limite: LIMITE_BUSCA });
    busca = { timer: null };
    const avisoPensando = setTimeout(() => {
      if (!busca) return;
      botaoDica.textContent = "Pensando…";
      botaoDica.setAttribute("aria-busy", "true");
      anunciar("Procurando uma solução a partir daqui…");
    }, 150);
    const pedaco = () => {
      const caminho = procura.continuar(POSICOES_POR_PEDACO);
      if (caminho === undefined) {
        busca.timer = setTimeout(pedaco, 0);
        return;
      }
      clearTimeout(avisoPensando);
      pararBusca();
      if (caminho && caminho.length) {
        plano = { caminho, chave };
        exibirDica(caminho[0]);
        return;
      }
      if (procura.examinadas() < LIMITE_BUSCA) {
        abrirSemSolucao();
        return;
      }
      const simples = P.dica(estado);
      if (simples) exibirDica(simples);
      else abrirFim();
    };
    pedaco();
  }

  function botoesDeFim() {
    const botoes = [];
    if (historico.length) botoes.push({ rotulo: "Desfazer jogada", acao: desfazer });
    botoes.push(
      { rotulo: "Recomeçar esta partida", acao: () => novaPartida({ semente: estado.semente }), secundario: historico.length > 0 },
      { rotulo: "Nova partida", acao: () => novaPartida(), secundario: true },
      { rotulo: "Continuar olhando", acao: () => {}, secundario: true },
    );
    return botoes;
  }

  /** A busca examinou tudo: daqui, nenhuma ordem de jogadas limpa a pirâmide. */
  function abrirSemSolucao() {
    avisouFim = true;
    const doComeco = !historico.length;
    abrirDialogo({
      titulo: "Sem solução",
      texto: doComeco
        ? `Esta partida não tem solução: nenhuma ordem de jogadas limpa a pirâmide. ${
            estado.modo === 1
              ? "Com 1 volta, isso acontece na maioria das partidas; comece outra ou experimente 3 voltas."
              : "Acontece com algumas distribuições; comece outra."
          }`
        : "Procurei todas as jogadas: a partir daqui não dá mais para limpar a pirâmide. Desfaça algumas jogadas, recomece a mesma partida ou comece outra.",
      botoes: doComeco
        ? [
            { rotulo: "Nova partida", acao: () => novaPartida() },
            { rotulo: "Continuar olhando", acao: () => {}, secundario: true },
          ]
        : botoesDeFim(),
    });
    som.tocar("derrota");
  }

  /** Nenhuma carta sai mais: ou o monte acabou, ou nada do que resta forma par com as cartas livres. */
  function abrirFim() {
    avisouFim = true;
    abrirDialogo({
      titulo: "Fim de jogo",
      texto: P.temJogada(estado)
        ? "Nenhuma carta que resta no monte e no descarte soma 13 com as cartas livres da pirâmide, então ela não sai mais."
        : "Não sobrou jogada: nada mais soma 13 e o monte já deu todas as voltas.",
      botoes: botoesDeFim(),
    });
    som.tocar("derrota");
  }

  function verificarFim() {
    if (avisouFim || P.podeProgredir(estado)) return;
    setTimeout(() => !dialogo.open && !P.venceu(estado) && !P.podeProgredir(estado) && !avisouFim && abrirFim(), 650);
  }

  // ---------- Vitória ----------

  function concluir(espera = 0) {
    acumuladoMs = decorridoMs();
    inicioTrecho = null;
    clearInterval(tique);
    sincronizarSegundos();
    gravar(CHAVE_PARTIDA, null);
    const { estatisticas: novas, recordes } = P.registrarResultado(estatisticas[estado.modo], {
      venceu: true,
      segundos: estado.segundos,
    });
    estatisticas = { ...estatisticas, [estado.modo]: novas };
    gravar(CHAVE_ESTATISTICAS, estatisticas);
    desenharEstatisticas();
    const dados = [
      ["Tempo", P.formatarTempo(estado.segundos)],
      ["Movimentos", P.formatarNumero(estado.movimentos)],
    ];
    if (recordes.tempo) dados.push(["Novo melhor tempo!", P.formatarTempo(estado.segundos), true]);
    dados.push(["Vitórias seguidas", P.formatarNumero(novas.sequencia)]);
    const { semente, modo } = estado;
    setTimeout(() => {
      // As cartas que ficaram à vista pulam, uma depois da outra
      let k = 0;
      posicoes.forEach((p, id) => !p.coberta && cartasEl[id].style.setProperty("--k", String(k++ % 8)));
      mesa.classList.add("pr-festa");
      setTimeout(() => mesa.classList.remove("pr-festa"), 2200);
      som.tocar("vitoria");
    }, espera);
    setTimeout(() => {
      abrirDialogo({
        titulo: "Parabéns!",
        texto: `Você limpou a pirâmide com ${P.textoModo(modo)}.`,
        dados,
        botoes: [
          { rotulo: "Nova partida", acao: () => novaPartida() },
          { rotulo: "Jogar esta de novo", acao: () => novaPartida({ semente }), secundario: true },
          { rotulo: "Fechar", acao: () => {}, secundario: true },
        ],
      });
    }, espera + 900);
  }

  // ---------- Estatísticas ----------

  function desenharEstatisticas() {
    const modo = estado ? estado.modo : P.MODO_PADRAO;
    const e = estatisticas[modo];
    estModo.textContent = P.textoModo(modo);
    const linhas = [
      ["Partidas", P.formatarNumero(e.jogadas)],
      ["Vitórias", `${P.formatarNumero(e.vitorias)} (${P.porcentagemVitorias(e)}%)`],
      ["Melhor tempo", e.melhorTempo === null ? "—" : P.formatarTempo(e.melhorTempo)],
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
    if (!estado || !estado.iniciado || P.venceu(estado)) return;
    estatisticas = { ...estatisticas, [estado.modo]: P.registrarResultado(estatisticas[estado.modo], { venceu: false }).estatisticas };
    gravar(CHAVE_ESTATISTICAS, estatisticas);
  }

  // ---------- Partida ----------

  /** As cartas da pirâmide saem do monte, da ponta para a base. */
  function animarDistribuicao() {
    if (reduzirMovimento.matches) return;
    const r = retanguloDaPilha(MONTE);
    const ids = estado.piramide.filter((id) => id !== null);
    mesa.classList.add("sem-animacao");
    for (const id of ids) {
      cartasEl[id].style.translate = `${r.x}px ${r.y}px`;
      cartasEl[id].classList.remove("aberta");
    }
    void mesa.offsetWidth;
    mesa.classList.remove("sem-animacao");
    ids.forEach((id, k) => {
      const el = cartasEl[id];
      el.style.transitionDelay = `${k * 22}ms`;
      el.style.translate = `${posicoes[id].x}px ${posicoes[id].y}px`;
      setTimeout(() => {
        el.classList.add("aberta");
        el.classList.remove("virando");
        void el.offsetWidth;
        el.classList.add("virando");
      }, k * 22 + 120);
    });
  }

  function novaPartida({ modo = estado ? estado.modo : P.MODO_PADRAO, semente = P.novaSemente() } = {}) {
    fecharDialogo();
    pararBusca();
    registrarAbandono();
    zerarCronometro();
    retomada = false;
    historico = [];
    plano = null;
    selecionada = null;
    avisouFim = false;
    limparDica();
    mesa.classList.remove("pr-festa");
    estado = P.novoJogo(modo, semente);
    gravar(CHAVE_MODO, estado.modo);
    posicoes = [];
    desenhar({ animar: false });
    animarDistribuicao();
    desenharEstatisticas();
    salvar();
    som.tocar("embaralhar");
    anunciar(`Nova partida com ${P.textoModo(estado.modo)}. Partida número ${P.formatarNumero(semente)}.`);
  }

  function confirmarNovaPartida(opcoes = {}) {
    if (!estado.iniciado || P.venceu(estado)) {
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

  // ---------- Arrastar e tocar ----------

  function sobreposicao(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }

  /** Parte visível de uma carta livre: na pirâmide, a carta inteira; no descarte também. */
  function retanguloDaCarta(id) {
    const p = posicoes[id];
    return { x: p.x, y: p.y, w: g.cw, h: g.ch };
  }

  /** A carta livre que a carta arrastada mais cobre (ou a que está sob o dedo). */
  function alvoDoArrasto(id, dx, dy, ponto) {
    const base = posicoes[id];
    const carta = { x: base.x + dx, y: base.y + dy, w: g.cw, h: g.ch };
    let melhor = null;
    let maior = 0;
    for (const outra of P.cartasLivres(estado)) {
      if (outra === id) continue;
      const r = retanguloDaCarta(outra);
      const dentro = ponto.x >= r.x && ponto.x <= r.x + r.w && ponto.y >= r.y && ponto.y <= r.y + r.h;
      const s = sobreposicao(carta, r) + (dentro ? g.cw * g.ch : 0);
      if (s > maior) {
        maior = s;
        melhor = outra;
      }
    }
    return melhor;
  }

  function pontoNaMesa(evento) {
    const r = mesa.getBoundingClientRect();
    return { x: evento.clientX - r.left, y: evento.clientY - r.top };
  }

  mesa.addEventListener("pointerdown", (evento) => {
    if (evento.button > 0 || pressao) return;
    const cartaEl = evento.target.closest(".pr-carta");
    if (!cartaEl) return;
    const id = Number(cartaEl.dataset.id);
    // Só as cartas livres (menos o Rei, que sai com um toque) podem ser arrastadas
    const arrastavel = P.disponivel(estado, id) && P.valor(id) !== 13;
    pressao = { id, arrastavel, x0: evento.clientX, y0: evento.clientY, pointerId: evento.pointerId, ativo: false };
    if (!arrastavel) return;
    try {
      cartaEl.setPointerCapture(evento.pointerId);
    } catch (erro) {
      /* sem captura: o arrasto continua pelos eventos da mesa */
    }
  });

  mesa.addEventListener("pointermove", (evento) => {
    if (!pressao || !pressao.arrastavel || evento.pointerId !== pressao.pointerId) return;
    const dx = evento.clientX - pressao.x0;
    const dy = evento.clientY - pressao.y0;
    if (!pressao.ativo) {
      if (Math.hypot(dx, dy) < ARRASTO_MINIMO) return;
      pressao.ativo = true;
      limparDica();
      mesa.classList.add("arrastando");
      cartasEl[pressao.id].classList.add("no-ar");
      cartasEl[pressao.id].style.zIndex = "2000";
    }
    evento.preventDefault();
    const p = posicoes[pressao.id];
    cartasEl[pressao.id].style.translate = `${p.x + dx}px ${p.y + dy}px`;
  });

  function terminarPressao(evento, cancelado = false) {
    if (!pressao || evento.pointerId !== pressao.pointerId) return;
    const atual = pressao;
    pressao = null;
    if (!atual.ativo) {
      if (!cancelado) tocarCarta(atual.id);
      return;
    }
    mesa.classList.remove("arrastando");
    cartasEl[atual.id].classList.remove("no-ar");
    const dx = evento.clientX - atual.x0;
    const dy = evento.clientY - atual.y0;
    const alvo = cancelado ? null : alvoDoArrasto(atual.id, dx, dy, pontoNaMesa(evento));
    if (alvo !== null && P.formaPar(atual.id, alvo) && tirarCartas([atual.id, alvo])) return;
    desenhar();
    if (alvo !== null) {
      som.tocar("erro");
      avisar(`${valorComNumero(atual.id)} + ${valorComNumero(alvo)} = ${P.valor(atual.id) + P.valor(alvo)}: o par precisa somar 13.`);
    }
  }

  mesa.addEventListener("pointerup", (evento) => terminarPressao(evento));
  mesa.addEventListener("pointercancel", (evento) => terminarPressao(evento, true));
  // Sem isso, o navegador do celular pode tentar rolar a página ou selecionar texto no meio do arrasto
  mesa.addEventListener("touchmove", (evento) => pressao && pressao.ativo && evento.preventDefault(), { passive: false });
  mesa.addEventListener("contextmenu", (evento) => evento.target.closest(".pr-carta") && evento.preventDefault());

  // ---------- Teclado ----------

  /** Enter ou Espaço na pilha com foco (e o clique dos leitores de tela). */
  function ativarPilha(i) {
    if (i < P.POSICOES) {
      const id = estado.piramide[i];
      if (id !== null) tocarCarta(id);
      return;
    }
    if (i === MONTE) acaoMonte();
    else if (i === DESCARTE) {
      if (estado.descarte.length) tocarCarta(estado.descarte[estado.descarte.length - 1]);
    } else {
      anunciar(rotuloDaPilha(TIRADAS));
    }
  }

  mesa.addEventListener("keydown", (evento) => {
    const pilhaEl = evento.target.closest?.(".pr-pilha");
    if (!pilhaEl || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const i = Number(pilhaEl.dataset.i);
    switch (evento.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown":
        foco = vizinha(i, evento.key);
        atualizarFoco();
        break;
      case "Enter":
      case " ":
        ativarPilha(i);
        break;
      case "Escape":
        if (selecionada === null) return;
        selecionada = null;
        desenhar();
        anunciar("Escolha desfeita.");
        break;
      default:
        return;
    }
    evento.preventDefault();
  });

  mesa.addEventListener("focusin", (evento) => {
    const pilhaEl = evento.target.closest?.(".pr-pilha");
    if (!pilhaEl) return;
    foco = Number(pilhaEl.dataset.i);
    atualizarFoco(false);
  });
  mesa.addEventListener("focusout", () => setTimeout(() => atualizarFoco(false), 0));

  mesa.addEventListener("click", (evento) => {
    const pilhaEl = evento.target.closest(".pr-pilha");
    if (!pilhaEl) return;
    const i = Number(pilhaEl.dataset.i);
    // Leitores de tela ativam a pilha com um clique sem ponteiro; com o ponteiro, só o monte vazio
    // recebe o clique direto (com cartas, o toque cai na carta de cima)
    if (evento.detail === 0) {
      foco = i;
      ativarPilha(i);
    } else if (i === MONTE) {
      acaoMonte();
    }
  });

  raiz.addEventListener("keydown", (evento) => {
    if ((evento.ctrlKey || evento.metaKey) && !evento.altKey && evento.key.toLowerCase() === "z" && !evento.target.closest("input, textarea")) {
      evento.preventDefault();
      desfazer();
    }
  });

  // ---------- Botões ----------

  botaoDesfazer.addEventListener("click", desfazer);
  botaoDica.addEventListener("click", mostrarDica);
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
      texto: `As estatísticas com ${P.textoModo(modo)} voltam para zero. Isso não pode ser desfeito.`,
      botoes: [
        {
          rotulo: "Sim, zerar",
          acao: () => {
            estatisticas = { ...estatisticas, [modo]: P.estatisticasVazias() };
            gravar(CHAVE_ESTATISTICAS, estatisticas);
            desenharEstatisticas();
            anunciar("Estatísticas zeradas.");
          },
        },
        { rotulo: "Não", acao: () => {}, secundario: true },
      ],
    });
  });
  som.ligarBotao(raiz.querySelector("#pr-som"));

  // ---------- Tamanho da tela e saída da página ----------

  // Só a largura da mesa e a altura da janela mudam as medidas
  let redesenho = null;
  let ultimaMedida = "";
  function aoMudarTamanho() {
    cancelAnimationFrame(redesenho);
    redesenho = requestAnimationFrame(() => {
      const medida = `${mesa.clientWidth}x${window.innerHeight}`;
      if (medida === ultimaMedida || pressao) return;
      ultimaMedida = medida;
      medir();
      desenhar({ animar: false });
    });
  }
  if (typeof ResizeObserver === "function") new ResizeObserver(aoMudarTamanho).observe(mesa);
  window.addEventListener("resize", aoMudarTamanho);

  document.addEventListener("visibilitychange", () => {
    atualizarCronometro();
    if (document.visibilityState === "hidden") salvar();
  });
  window.addEventListener("pagehide", salvar);

  // ---------- Início ----------

  const salvas = lerJson(CHAVE_ESTATISTICAS) || {};
  for (const modo of P.MODOS) estatisticas[modo] = P.lerEstatisticas(salvas[modo]);
  const salva = lerJson(CHAVE_PARTIDA);
  const restaurada = salva && P.restaurar(salva.estado);
  medir();
  ultimaMedida = `${mesa.clientWidth}x${window.innerHeight}`;
  if (restaurada && !P.venceu(restaurada)) {
    estado = restaurada;
    historico = Array.isArray(salva.historico)
      ? salva.historico.map(P.restaurar).filter((h) => h && h.modo === estado.modo && h.semente === estado.semente)
      : [];
    acumuladoMs = estado.segundos * 1000;
    retomada = estado.iniciado;
    desenhar({ animar: false });
    desenharEstatisticas();
    anunciar("Partida anterior retomada.");
    verificarFim();
  } else {
    const modo = P.MODOS.includes(lerJson(CHAVE_MODO)) ? lerJson(CHAVE_MODO) : P.MODO_PADRAO;
    novaPartida({ modo });
  }
})();
