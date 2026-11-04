"use strict";
/*
 * Interface do FreeCell. As regras, a dica e o resolvedor ficam em freecell-logica.js.
 *
 * As 52 cartas são criadas uma vez e só mudam de lugar (propriedade CSS translate). Um toque
 * manda a carta para o melhor lugar; arrastando, o jogador escolhe o destino. No teclado, as
 * setas escolhem a pilha (e a carta, dentro da sequência), Enter joga e Espaço pega e solta.
 * Depois de cada jogada, as cartas que não fazem mais falta na mesa sobem sozinhas.
 * A partida, o histórico para desfazer e as estatísticas ficam no localStorage.
 */
(() => {
  const raiz = document.querySelector(".freecell");
  if (!raiz || typeof LogicaFreeCell !== "object") return;
  const P = LogicaFreeCell;

  const CHAVE_PARTIDA = "efs-freecell-partida";
  const CHAVE_ESTATISTICAS = "efs-freecell-estatisticas";
  const LIMITE_HISTORICO = 500;
  const HISTORICO_SALVO = 60;
  const ARRASTO_MINIMO = 6;
  const TRAVA_DIALOGO_MS = 500;
  const PASSO_SUBIR_MS = 70;
  const MENSAGEM_MS = 3400;
  const LIMITE_BUSCA = 30000;
  const POSICOES_POR_PEDACO = 1200;
  const reduzirMovimento = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  const mesa = raiz.querySelector("#fc-mesa");
  const textoTempo = raiz.querySelector("#fc-tempo");
  const textoMovimentos = raiz.querySelector("#fc-movimentos");
  const textoFundacao = raiz.querySelector("#fc-fundacao");
  const textoPartida = raiz.querySelector("#fc-partida");
  const botaoDesfazer = raiz.querySelector("#fc-desfazer");
  const botaoDica = raiz.querySelector("#fc-dica");
  const botaoNova = raiz.querySelector("#fc-nova");
  const formNumero = raiz.querySelector("#fc-escolher");
  const campoNumero = raiz.querySelector("#fc-numero");
  const status = raiz.querySelector("#fc-status");
  const estLista = raiz.querySelector("#fc-est-lista");
  const botaoZerar = raiz.querySelector("#fc-zerar");
  const dialogo = raiz.querySelector("#fc-dialogo");
  const dialogoTitulo = raiz.querySelector("#fc-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#fc-dialogo-texto");
  const dialogoDados = raiz.querySelector("#fc-dialogo-dados");
  const dialogoBotoes = raiz.querySelector("#fc-dialogo-botoes");
  const rotuloDica = botaoDica.textContent;
  // Se sons.js não carregar, o jogo segue mudo e o botão some
  const som =
    typeof Sons === "object" ? Sons.criar("freecell", raiz) : { tocar() {}, ligarBotao: (b) => b && (b.hidden = true) };

  let estado;
  let historico = [];
  let estatisticas = P.estatisticasVazias();
  let retomada = false;
  let acumuladoMs = 0;
  let inicioTrecho = null;
  let tique = null;
  let avisouTravado = false;
  let pressao = null;
  let selecionada = null;
  let dicaTimer = null;
  let foco = { pilha: 8, profundidade: 0 };
  let g = null;
  let posicoes = [];
  // Solução achada pela dica: as próximas jogadas, enquanto o jogador seguir por ela
  let plano = null;
  let busca = null;
  // Cartas que acabaram de subir: a de baixo delas fica visível até elas chegarem
  const recentes = new Set();
  let recolhendo = null;

  // ---------- Pilhas: 0 a 3 células, 4 a 7 fundações, 8 a 15 colunas ----------

  const PILHAS = [
    ...[...Array(P.CELULAS).keys()].map((indice) => ({ tipo: "celula", indice, x: indice })),
    ...P.NAIPES.map((naipe, indice) => ({ tipo: "fundacao", indice, x: 4 + indice, naipe: naipe.id })),
    ...[...Array(P.COLUNAS).keys()].map((indice) => ({ tipo: "coluna", indice, x: indice })),
  ];
  const pilhaDe = (destino) =>
    destino.tipo === "celula" ? destino.indice : destino.tipo === "fundacao" ? 4 + destino.indice : 8 + destino.indice;

  const pilhasEl = PILHAS.map((pilha, i) => {
    const el = document.createElement("div");
    el.className = `fc-pilha fc-pilha-${pilha.tipo}`;
    if (pilha.naipe) el.dataset.naipe = pilha.naipe;
    el.dataset.i = String(i);
    el.tabIndex = -1;
    el.setAttribute("role", "button");
    return el;
  });

  const anel = document.createElement("div");
  anel.className = "fc-anel";
  anel.hidden = true;

  const cartasEl = [...Array(P.CARTAS).keys()].map((id) => {
    const el = document.createElement("div");
    const naipe = P.NAIPES[P.naipe(id)].id;
    el.className = `fc-carta${P.vermelha(id) ? " vermelha" : ""}`;
    el.dataset.id = String(id);
    el.setAttribute("aria-hidden", "true");
    const centro =
      P.valor(id) > 10
        ? `<span class="fc-centro fc-figura">${P.textoValor(id)}</span>`
        : `<span class="fc-centro"><i class="fc-naipe fc-naipe-${naipe}"></i></span>`;
    el.innerHTML =
      `<span class="fc-frente"><span class="fc-valor">${P.textoValor(id)}</span>` +
      `<i class="fc-naipe fc-naipe-${naipe} fc-naipe-canto"></i>${centro}</span>`;
    return el;
  });
  // Aviso curto e visível sobre a mesa; o leitor de tela recebe o mesmo texto pelo status
  const mensagemEl = document.createElement("p");
  mensagemEl.className = "fc-mensagem";
  mensagemEl.setAttribute("aria-hidden", "true");
  mesa.replaceChildren(...pilhasEl, ...cartasEl, anel, mensagemEl);

  const nome = (id) => P.nomeCarta(id);

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
    const margem = espaco;
    const cw = Math.floor((largura - 2 * margem - (P.COLUNAS - 1) * espaco) / P.COLUNAS);
    const ch = Math.round(cw * 1.4);
    const topoColunas = margem + ch + Math.round(espaco * 3);
    // A largura do jogo já é limitada pela altura da janela (no CSS). No celular em pé as cartas
    // são pequenas e sobra altura: as colunas podem descer mais e as cartas ficam mais afastadas
    const pequena = cw < 50;
    const alturaColunas = Math.round(ch * (pequena ? 5.2 : 4.2));
    const aberta = pequena ? 0.3 : 0.26;
    const abertaMinima = pequena ? 0.22 : 0.17;
    g = { espaco, margem, cw, ch, topoColunas, alturaColunas, aberta, abertaMinima };
    mesa.style.setProperty("--cw", `${cw}px`);
    mesa.style.setProperty("--ch", `${ch}px`);
  }

  const xDaPilha = (x) => g.margem + x * (g.cw + g.espaco);

  /** Distância entre as cartas da coluna, apertando se ela não couber na altura das colunas. */
  function espacamento(c) {
    const n = estado.colunas[c].length;
    let d = g.ch * g.aberta;
    if (n > 1 && g.ch + (n - 1) * d > g.alturaColunas) d = Math.max(g.ch * g.abertaMinima, (g.alturaColunas - g.ch) / (n - 1));
    return { d, altura: n ? g.ch + (n - 1) * d : g.ch };
  }

  function calcularPosicoes() {
    const pos = new Array(P.CARTAS);
    const y0 = g.margem;
    estado.celulas.forEach((id, i) => {
      if (id !== null) pos[id] = { x: xDaPilha(i), y: y0, z: 300 + i, pilha: i };
    });
    estado.fundacoes.forEach((f, s) => {
      // [coberta] esconde as cartas de baixo da fundação (as sombras somadas fariam uma borda escura),
      // menos a que está sob uma carta que ainda está chegando
      f.forEach((id, i) => {
        pos[id] = {
          x: xDaPilha(4 + s),
          y: y0,
          z: 100 + i,
          pilha: 4 + s,
          coberta: i < f.length - 1 && !recentes.has(f[i + 1]),
        };
      });
    });
    let maisAlta = 0;
    estado.colunas.forEach((coluna, c) => {
      const { d, altura } = espacamento(c);
      maisAlta = Math.max(maisAlta, altura);
      coluna.forEach((id, i) => {
        pos[id] = { x: xDaPilha(c), y: g.topoColunas + i * d, z: 400 + i, pilha: 8 + c };
      });
    });
    mesa.style.height = `${Math.ceil(g.topoColunas + Math.max(g.alturaColunas, maisAlta) + g.margem)}px`;
    return pos;
  }

  /** Retângulo de cada pilha: as células e fundações na fileira de cima, ou a coluna inteira. */
  function retanguloDaPilha(i) {
    const pilha = PILHAS[i];
    if (pilha.tipo !== "coluna") return { x: xDaPilha(pilha.x), y: g.margem, w: g.cw, h: g.ch };
    const coluna = estado.colunas[pilha.indice];
    const ultima = coluna.length ? posicoes[coluna[coluna.length - 1]] : null;
    const fim = ultima ? ultima.y + g.ch : g.topoColunas + g.ch;
    return { x: xDaPilha(pilha.x), y: g.topoColunas, w: g.cw, h: fim - g.topoColunas };
  }

  // ---------- Desenho ----------

  /** Quantas cartas, do topo para baixo, formam a sequência que pode ser pega. */
  const tamanhoMovel = (c) => estado.colunas[c].length - P.inicioDaSequencia(estado, c);

  function cartasMoveis() {
    const moveis = new Set(estado.celulas.filter((id) => id !== null));
    estado.colunas.forEach((coluna, c) => coluna.slice(coluna.length - tamanhoMovel(c)).forEach((id) => moveis.add(id)));
    return moveis;
  }

  /** [atrasos]: espera, em milissegundos, antes de cada carta começar a andar. */
  function desenhar({ animar = true, atrasos = null } = {}) {
    if (!g) medir();
    const anteriores = posicoes;
    posicoes = calcularPosicoes();
    const moveis = cartasMoveis();
    const semAnimacao = !animar || reduzirMovimento.matches;
    mesa.classList.toggle("sem-animacao", semAnimacao);
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
        el._z = setTimeout(() => (el.style.zIndex = String(posicoes[id].z)), 200 + atraso);
      }
      el.classList.toggle("coberta", Boolean(p.coberta));
      el.classList.toggle("movel", moveis.has(id));
    });
    if (semAnimacao) requestAnimationFrame(() => mesa.classList.remove("sem-animacao"));

    PILHAS.forEach((pilha, i) => {
      const el = pilhasEl[i];
      const r = retanguloDaPilha(i);
      el.style.translate = `${r.x}px ${r.y}px`;
      el.style.width = `${r.w}px`;
      el.style.height = `${g.ch}px`;
      el.setAttribute("aria-label", rotuloDaPilha(i));
    });
    for (const el of cartasEl) el.classList.remove("fc-selecionada");
    if (selecionada !== null) for (const id of P.cartasParaMover(estado, selecionada) || []) cartasEl[id].classList.add("fc-selecionada");

    textoMovimentos.textContent = P.formatarNumero(estado.movimentos);
    textoFundacao.textContent = `${P.naFundacao(estado)}/${P.CARTAS}`;
    textoPartida.textContent = `Partida nº ${P.formatarNumero(estado.semente)}`;
    botaoDesfazer.disabled = !historico.length || P.venceu(estado);
    botaoDica.disabled = P.venceu(estado);
    atualizarFoco(false);
    atualizarCronometro();
  }

  /** Esconde as cartas de baixo das fundações depois que as que subiram chegaram. */
  function terminarRecolhimento() {
    clearTimeout(recolhendo);
    recolhendo = null;
    if (!recentes.size) return;
    recentes.clear();
    posicoes = calcularPosicoes();
    posicoes.forEach((p, id) => cartasEl[id].classList.toggle("coberta", Boolean(p.coberta)));
  }

  function textoDestino(destino) {
    if (destino.tipo === "fundacao") return "para a fundação";
    if (destino.tipo === "celula") return `para a célula ${destino.indice + 1}`;
    return `para a coluna ${destino.indice + 1}`;
  }

  function rotuloDaPilha(i) {
    const pilha = PILHAS[i];
    if (pilha.tipo === "celula") {
      const id = estado.celulas[pilha.indice];
      return id === null ? `Célula ${pilha.indice + 1}, livre.` : `Célula ${pilha.indice + 1}: ${nome(id)}.`;
    }
    if (pilha.tipo === "fundacao") {
      const f = estado.fundacoes[pilha.indice];
      const naipe = P.NAIPES[pilha.indice].nome;
      return f.length ? `Fundação de ${naipe}: até ${nome(f[f.length - 1])}.` : `Fundação de ${naipe}, vazia.`;
    }
    const coluna = estado.colunas[pilha.indice];
    if (!coluna.length) return `Coluna ${pilha.indice + 1}, vazia.`;
    return `Coluna ${pilha.indice + 1}: ${coluna.map(nome).join(", ")}.`;
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

  /** Carta escolhida na pilha com foco: na coluna, [profundidade] conta a partir da carta de cima. */
  function cartaEmFoco() {
    const pilha = PILHAS[foco.pilha];
    if (pilha.tipo === "celula") return estado.celulas[pilha.indice];
    if (pilha.tipo !== "coluna") return null;
    const coluna = estado.colunas[pilha.indice];
    if (!coluna.length) return null;
    foco.profundidade = Math.min(foco.profundidade, tamanhoMovel(pilha.indice) - 1);
    return coluna[coluna.length - 1 - foco.profundidade];
  }

  function atualizarFoco(mover = true) {
    pilhasEl.forEach((el, i) => (el.tabIndex = i === foco.pilha ? 0 : -1));
    const el = pilhasEl[foco.pilha];
    if (mover) el.focus({ preventScroll: false });
    const ativo = document.activeElement === el && el.matches(":focus-visible");
    anel.hidden = !ativo;
    if (!ativo) return;
    const id = cartaEmFoco();
    const r = retanguloDaPilha(foco.pilha);
    if (id !== null && PILHAS[foco.pilha].tipo === "coluna") r.y = posicoes[id].y;
    if (PILHAS[foco.pilha].tipo === "coluna") {
      const coluna = estado.colunas[PILHAS[foco.pilha].indice];
      r.h = coluna.length ? posicoes[coluna[coluna.length - 1]].y + g.ch - r.y : g.ch;
    }
    anel.style.translate = `${r.x}px ${r.y}px`;
    anel.style.width = `${r.w}px`;
    anel.style.height = `${Math.max(r.h, g.ch)}px`;
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

  const mesmaJogada = (a, b) => a && b && a.id === b.id && a.destino.tipo === b.destino.tipo && a.destino.indice === b.destino.indice;

  /**
   * Faz a jogada, sobe sozinhas as cartas que não fazem mais falta, guarda o estado anterior para
   * desfazer e confere o fim da partida.
   */
  function jogar(id, destino) {
    const movido = P.mover(estado, id, destino);
    if (!movido) return false;
    const ids = P.cartasParaMover(estado, id) || [id];
    const { estado: novo, ids: subiram } = P.subirSozinhas(movido);
    pararBusca();
    sincronizarSegundos();
    const anterior = estado;
    historico.push(estado);
    if (historico.length > LIMITE_HISTORICO) historico.shift();
    estado = { ...novo, segundos: anterior.segundos };
    // A solução da dica continua valendo se o jogador fez a jogada que ela sugeria
    if (plano && mesmaJogada(plano.caminho[0], { id, destino })) {
      plano = { caminho: plano.caminho.slice(1), chave: P.chave(estado) };
    } else {
      plano = null;
    }
    retomada = false;
    avisouTravado = false;
    selecionada = null;
    limparDica();
    terminarRecolhimento();

    const atrasos = new Map();
    if (destino.tipo === "fundacao") recentes.add(id);
    const espera = destino.tipo === "fundacao" ? 0 : 140;
    subiram.forEach((carta, k) => {
      recentes.add(carta);
      atrasos.set(carta, espera + k * PASSO_SUBIR_MS);
    });
    if (recentes.size) recolhendo = setTimeout(terminarRecolhimento, espera + subiram.length * PASSO_SUBIR_MS + 400);
    desenhar({ atrasos });

    som.tocar(destino.tipo === "fundacao" ? "acerto" : "deslizar");
    subiram.forEach((carta, k) => k < 8 && setTimeout(() => som.tocar("virar"), espera + 120 + k * PASSO_SUBIR_MS));
    const texto = ids.length > 1 ? `${nome(id)} e mais ${ids.length - 1}` : nome(id);
    let mensagem = `${texto} ${textoDestino(destino)}.`;
    if (subiram.length) mensagem += ` Subiram para a fundação: ${subiram.map(nome).join(", ")}.`;
    anunciar(mensagem);
    if (P.venceu(estado)) {
      concluir(espera + subiram.length * PASSO_SUBIR_MS + 400);
      return true;
    }
    salvar();
    verificarTravado();
    return true;
  }

  function tremer(ids) {
    for (const id of ids) {
      const el = cartasEl[id];
      el.classList.remove("tremendo");
      void el.offsetWidth;
      el.classList.add("tremendo");
    }
  }

  /** Por que a carta (ou sequência) não pode sair agora. */
  function explicarErro(id, paraColunaVazia = false) {
    const ids = P.cartasParaMover(estado, id);
    if (!ids) return "Só uma sequência em ordem, alternando as cores, se move junta.";
    const cabem = P.capacidade(estado, paraColunaVazia);
    if (ids.length > 1 && ids.length > cabem) {
      return `Para mover ${ids.length} cartas juntas, libere mais células ou esvazie uma coluna: agora cabem ${cabem}.`;
    }
    return `${nome(id)} não tem para onde ir agora.`;
  }

  /** Um toque (ou Enter) na carta: vai para o melhor lugar, se houver. */
  function tocarCarta(id) {
    const local = P.localizar(estado, id);
    if (!local) return;
    if (local.tipo === "fundacao") {
      avisar("Carta que subiu para a fundação não volta para a mesa.");
      return;
    }
    const destino = P.melhorDestino(estado, id);
    if (!destino || !jogar(id, destino)) {
      const coluna = local.tipo === "coluna" ? estado.colunas[local.indice] : null;
      tremer(coluna ? coluna.slice(local.posicao) : [id]);
      som.tocar("erro");
      avisar(explicarErro(id));
    }
  }

  function desfazer() {
    if (!historico.length || P.venceu(estado)) return;
    fecharDialogo();
    pararBusca();
    sincronizarSegundos();
    terminarRecolhimento();
    const segundos = estado.segundos;
    estado = { ...historico.pop(), segundos };
    plano = null;
    retomada = false;
    selecionada = null;
    avisouTravado = false;
    limparDica();
    desenhar();
    salvar();
    som.tocar("desfazer");
    anunciar("Jogada desfeita.");
  }

  // ---------- Dica e partida travada ----------

  function limparDica() {
    clearTimeout(dicaTimer);
    for (const el of [...cartasEl, ...pilhasEl]) el.classList.remove("fc-dica");
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
    som.tocar("dica");
    for (const id of P.cartasParaMover(estado, d.id) || [d.id]) cartasEl[id].classList.add("fc-dica");
    const alvo =
      d.destino.tipo === "coluna" ? estado.colunas[d.destino.indice] : d.destino.tipo === "fundacao" ? estado.fundacoes[d.destino.indice] : [];
    if (alvo.length) cartasEl[alvo[alvo.length - 1]].classList.add("fc-dica");
    else pilhasEl[pilhaDe(d.destino)].classList.add("fc-dica");
    anunciar(`Dica: ${nome(d.id)} ${textoDestino(d.destino)}.`);
    dicaTimer = setTimeout(limparDica, 2200);
  }

  /**
   * A dica procura uma solução a partir da posição atual (aos pedaços, sem travar a tela) e mostra
   * a primeira jogada dela. Se não achar, usa a dica simples; se nem ela tiver jogada, avisa.
   */
  function mostrarDica() {
    if (P.venceu(estado) || busca) return;
    limparDica();
    const chave = P.chave(estado);
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
      const simples = P.dica(estado);
      if (simples) exibirDica(simples);
      else abrirTravado(false);
    };
    pedaco();
  }

  /** [semJogada]: nenhuma jogada é possível; senão, há jogadas, mas nenhuma que ajude. */
  function abrirTravado(semJogada) {
    avisouTravado = true;
    const botoes = [];
    if (historico.length) botoes.push({ rotulo: "Desfazer jogada", acao: desfazer });
    botoes.push(
      { rotulo: "Recomeçar esta partida", acao: () => novaPartida({ semente: estado.semente }), secundario: historico.length > 0 },
      { rotulo: "Nova partida", acao: () => novaPartida(), secundario: true },
      { rotulo: "Continuar olhando", acao: () => {}, secundario: true },
    );
    abrirDialogo({
      titulo: semJogada ? "Sem jogadas" : "Sem jogadas úteis",
      texto: semJogada
        ? "As células estão cheias e nenhuma carta encaixa em outra. Desfaça algumas jogadas para abrir espaço, recomece a mesma partida ou comece outra."
        : "Não encontrei uma solução a partir daqui. Desfazer algumas jogadas costuma abrir caminho: quase toda partida de FreeCell tem solução.",
      botoes,
    });
    som.tocar("derrota");
  }

  function verificarTravado() {
    if (!avisouTravado && !P.temJogada(estado)) setTimeout(() => !dialogo.open && !P.venceu(estado) && !P.temJogada(estado) && abrirTravado(true), 650);
  }

  // ---------- Vitória ----------

  function concluir(espera = 0) {
    acumuladoMs = decorridoMs();
    inicioTrecho = null;
    clearInterval(tique);
    sincronizarSegundos();
    gravar(CHAVE_PARTIDA, null);
    const { estatisticas: novas, recordes } = P.registrarResultado(estatisticas, {
      venceu: true,
      segundos: estado.segundos,
      movimentos: estado.movimentos,
    });
    estatisticas = novas;
    gravar(CHAVE_ESTATISTICAS, estatisticas);
    desenharEstatisticas();
    const dados = [
      ["Tempo", P.formatarTempo(estado.segundos)],
      ["Movimentos", P.formatarNumero(estado.movimentos)],
    ];
    if (recordes.tempo) dados.push(["Novo melhor tempo!", P.formatarTempo(estado.segundos), true]);
    if (recordes.movimentos) dados.push(["Menos movimentos!", P.formatarNumero(estado.movimentos), true]);
    dados.push(["Vitórias seguidas", P.formatarNumero(novas.sequencia)]);
    const { semente } = estado;
    setTimeout(() => {
      terminarRecolhimento();
      estado.fundacoes.forEach((f, k) => cartasEl[f[f.length - 1]].style.setProperty("--k", String(k)));
      mesa.classList.add("fc-festa");
      setTimeout(() => mesa.classList.remove("fc-festa"), 2200);
      som.tocar("vitoria");
    }, espera);
    setTimeout(() => {
      abrirDialogo({
        titulo: "Parabéns!",
        texto: `Você venceu a partida nº ${P.formatarNumero(semente)} do FreeCell.`,
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
    const e = estatisticas;
    const linhas = [
      ["Partidas", P.formatarNumero(e.jogadas)],
      ["Vitórias", `${P.formatarNumero(e.vitorias)} (${P.porcentagemVitorias(e)}%)`],
      ["Melhor tempo", e.melhorTempo === null ? "—" : P.formatarTempo(e.melhorTempo)],
      ["Menos movimentos", e.menosMovimentos === null ? "—" : P.formatarNumero(e.menosMovimentos)],
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
    estatisticas = P.registrarResultado(estatisticas, { venceu: false }).estatisticas;
    gravar(CHAVE_ESTATISTICAS, estatisticas);
  }

  // ---------- Partida ----------

  /** Distribui as cartas saindo do meio da fileira de cima, linha por linha. */
  function animarDistribuicao() {
    if (reduzirMovimento.matches) return;
    const ordem = P.baralhoDaPartida(estado.semente);
    const x = (mesa.clientWidth - g.cw) / 2;
    mesa.classList.add("sem-animacao");
    for (const id of ordem) cartasEl[id].style.translate = `${x}px ${g.margem}px`;
    void mesa.offsetWidth;
    mesa.classList.remove("sem-animacao");
    ordem.forEach((id, k) => {
      const el = cartasEl[id];
      el.style.transitionDelay = `${k * 12}ms`;
      el.style.translate = `${posicoes[id].x}px ${posicoes[id].y}px`;
    });
  }

  function novaPartida({ semente = P.novaSemente() } = {}) {
    fecharDialogo();
    pararBusca();
    registrarAbandono();
    zerarCronometro();
    terminarRecolhimento();
    retomada = false;
    historico = [];
    plano = null;
    selecionada = null;
    avisouTravado = false;
    limparDica();
    mesa.classList.remove("fc-festa");
    estado = P.novoJogo(semente);
    posicoes = [];
    desenhar({ animar: false });
    animarDistribuicao();
    desenharEstatisticas();
    salvar();
    som.tocar("embaralhar");
    anunciar(`Nova partida: número ${P.formatarNumero(semente)}.`);
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

  /** A pilha válida que a carta arrastada mais cobre; vale também a pilha embaixo do dedo. */
  function destinoDoArrasto(arrasto, dx, dy, ponto) {
    const base = posicoes[arrasto.id];
    const carta = { x: base.x + dx, y: base.y + dy, w: g.cw, h: g.ch };
    let melhor = null;
    let maior = 0;
    PILHAS.forEach((pilha, i) => {
      const destino = { tipo: pilha.tipo, indice: pilha.indice };
      if (!P.podeMover(estado, arrasto.id, destino)) return;
      const r = retanguloDaPilha(i);
      const area = { x: r.x, y: r.y, w: r.w, h: Math.max(r.h, g.ch) + (pilha.tipo === "coluna" ? g.ch * 0.5 : 0) };
      const dentro = ponto.x >= area.x && ponto.x <= area.x + area.w && ponto.y >= area.y && ponto.y <= area.y + area.h;
      const s = sobreposicao(carta, area) + (dentro ? g.cw * g.ch : 0);
      if (s > maior) {
        maior = s;
        melhor = destino;
      }
    });
    return melhor;
  }

  function pontoNaMesa(evento) {
    const r = mesa.getBoundingClientRect();
    return { x: evento.clientX - r.left, y: evento.clientY - r.top };
  }

  mesa.addEventListener("pointerdown", (evento) => {
    if (evento.button > 0 || pressao) return;
    const cartaEl = evento.target.closest(".fc-carta");
    if (!cartaEl) return;
    const id = Number(cartaEl.dataset.id);
    const local = P.localizar(estado, id);
    if (!local || local.tipo === "fundacao") return;
    const ids = P.cartasParaMover(estado, id);
    pressao = { id, ids, x0: evento.clientX, y0: evento.clientY, pointerId: evento.pointerId, ativo: false };
    if (!ids) return;
    try {
      cartaEl.setPointerCapture(evento.pointerId);
    } catch (erro) {
      /* sem captura: o arrasto continua pelos eventos da mesa */
    }
  });

  mesa.addEventListener("pointermove", (evento) => {
    if (!pressao || !pressao.ids || evento.pointerId !== pressao.pointerId) return;
    const dx = evento.clientX - pressao.x0;
    const dy = evento.clientY - pressao.y0;
    if (!pressao.ativo) {
      if (Math.hypot(dx, dy) < ARRASTO_MINIMO) return;
      pressao.ativo = true;
      limparDica();
      selecionada = null;
      mesa.classList.add("arrastando");
      pressao.ids.forEach((id, i) => {
        cartasEl[id].classList.add("no-ar");
        cartasEl[id].style.zIndex = String(2000 + i);
      });
    }
    evento.preventDefault();
    for (const id of pressao.ids) {
      const p = posicoes[id];
      cartasEl[id].style.translate = `${p.x + dx}px ${p.y + dy}px`;
    }
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
    for (const id of atual.ids) cartasEl[id].classList.remove("no-ar");
    const dx = evento.clientX - atual.x0;
    const dy = evento.clientY - atual.y0;
    const destino = cancelado ? null : destinoDoArrasto(atual, dx, dy, pontoNaMesa(evento));
    if (destino && jogar(atual.id, destino)) return;
    desenhar();
    // Soltou longe de qualquer pilha válida: se foi uma sequência grande demais, explica
    const ids = atual.ids;
    if (!cancelado && ids.length > 1 && ids.length > P.capacidade(estado)) avisar(explicarErro(atual.id));
  }

  mesa.addEventListener("pointerup", (evento) => terminarPressao(evento));
  mesa.addEventListener("pointercancel", (evento) => terminarPressao(evento, true));
  // Sem isso, o navegador do celular pode tentar rolar a página ou selecionar texto no meio do arrasto
  mesa.addEventListener("touchmove", (evento) => pressao && pressao.ativo && evento.preventDefault(), { passive: false });
  mesa.addEventListener("contextmenu", (evento) => evento.target.closest(".fc-carta") && evento.preventDefault());

  // ---------- Teclado ----------

  function irParaPilha(i, profundidade = 0) {
    foco = { pilha: i, profundidade };
    atualizarFoco();
  }

  function pegarOuSoltar() {
    const pilha = PILHAS[foco.pilha];
    if (selecionada !== null) {
      const id = selecionada;
      if (jogar(id, { tipo: pilha.tipo, indice: pilha.indice })) return;
      if (P.localizar(estado, id).tipo !== "fundacao") selecionada = id;
      som.tocar("erro");
      // Se as cartas encaixam ali pela regra, o que faltou foi espaço para mover todas juntas
      const coluna = pilha.tipo === "coluna" ? estado.colunas[pilha.indice] : null;
      const vazia = coluna !== null && !coluna.length;
      const encaixa = coluna !== null && (vazia || P.encaixa(coluna[coluna.length - 1], id));
      const ids = P.cartasParaMover(estado, id) || [id];
      if (encaixa && ids.length > P.capacidade(estado, vazia)) avisar(`${explicarErro(id, vazia)} Aperte Esc para cancelar.`);
      else avisar(`${nome(id)} não pode ir para lá. Escolha outra pilha ou aperte Esc para cancelar.`);
      return;
    }
    const id = cartaEmFoco();
    if (id === null) return;
    if (!P.cartasParaMover(estado, id)) {
      avisar(explicarErro(id));
      return;
    }
    selecionada = id;
    desenhar();
    som.tocar("selecionar");
    anunciar(`${nome(id)} na mão. Escolha a pilha com as setas e aperte Espaço ou Enter para soltar.`);
  }

  mesa.addEventListener("keydown", (evento) => {
    const pilhaEl = evento.target.closest?.(".fc-pilha");
    if (!pilhaEl || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const i = Number(pilhaEl.dataset.i);
    const pilha = PILHAS[i];
    const naColuna = pilha.tipo === "coluna";
    switch (evento.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        const passo = evento.key === "ArrowLeft" ? -1 : 1;
        const x = (pilha.x + passo + 8) % 8;
        irParaPilha(naColuna ? 8 + x : x);
        break;
      }
      case "ArrowDown":
        if (!naColuna) irParaPilha(8 + pilha.x);
        else if (foco.profundidade > 0) irParaPilha(i, foco.profundidade - 1);
        break;
      case "ArrowUp":
        if (naColuna) {
          if (foco.profundidade < tamanhoMovel(pilha.indice) - 1) {
            irParaPilha(i, foco.profundidade + 1);
            const id = cartaEmFoco();
            if (id !== null) anunciar(`${nome(id)} e as cartas em cima dela.`);
          } else {
            irParaPilha(pilha.x);
          }
        }
        break;
      case "Enter":
        if (selecionada !== null) pegarOuSoltar();
        else {
          const id = cartaEmFoco();
          if (id !== null) tocarCarta(id);
        }
        break;
      case " ":
        pegarOuSoltar();
        break;
      case "Escape":
        if (selecionada === null) return;
        selecionada = null;
        desenhar();
        anunciar("Cancelado.");
        break;
      default:
        return;
    }
    evento.preventDefault();
  });

  mesa.addEventListener("focusin", (evento) => {
    const pilhaEl = evento.target.closest?.(".fc-pilha");
    if (!pilhaEl) return;
    const i = Number(pilhaEl.dataset.i);
    if (i !== foco.pilha) foco = { pilha: i, profundidade: 0 };
    atualizarFoco(false);
  });
  mesa.addEventListener("focusout", () => setTimeout(() => atualizarFoco(false), 0));

  // Leitores de tela ativam a pilha com um clique sem ponteiro
  mesa.addEventListener("click", (evento) => {
    const pilhaEl = evento.target.closest(".fc-pilha");
    if (!pilhaEl || evento.detail !== 0) return;
    foco = { pilha: Number(pilhaEl.dataset.i), profundidade: 0 };
    const id = cartaEmFoco();
    if (id !== null) tocarCarta(id);
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
  // A mensagem própria vale já ao digitar: o navegador confere min e max antes do envio
  const textoNumeroInvalido = `Escolha um número de 1 a ${P.formatarNumero(P.MAIOR_PARTIDA)}.`;
  const conferirNumero = () => {
    const texto = campoNumero.value;
    campoNumero.setCustomValidity(texto === "" || P.partidaValida(Number(texto)) ? "" : textoNumeroInvalido);
  };
  formNumero.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const numero = Number(campoNumero.value);
    if (!P.partidaValida(numero)) {
      campoNumero.setCustomValidity(textoNumeroInvalido);
      campoNumero.reportValidity();
      return;
    }
    campoNumero.value = "";
    confirmarNovaPartida({ semente: numero });
  });
  campoNumero.addEventListener("input", conferirNumero);
  botaoZerar.addEventListener("click", () => {
    abrirDialogo({
      titulo: "Zerar estatísticas?",
      texto: "As suas estatísticas do FreeCell voltam para zero. Isso não pode ser desfeito.",
      botoes: [
        {
          rotulo: "Sim, zerar",
          acao: () => {
            estatisticas = P.estatisticasVazias();
            gravar(CHAVE_ESTATISTICAS, estatisticas);
            desenharEstatisticas();
            anunciar("Estatísticas zeradas.");
          },
        },
        { rotulo: "Não", acao: () => {}, secundario: true },
      ],
    });
  });
  som.ligarBotao(raiz.querySelector("#fc-som"));

  // ---------- Tamanho da tela e saída da página ----------

  // Só a largura da mesa e a altura da janela mudam as medidas; a altura da própria mesa muda a
  // cada jogada e não deve redesenhar nada (cortaria as animações)
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

  estatisticas = P.lerEstatisticas(lerJson(CHAVE_ESTATISTICAS));
  const salva = lerJson(CHAVE_PARTIDA);
  const restaurada = salva && P.restaurar(salva.estado);
  medir();
  ultimaMedida = `${mesa.clientWidth}x${window.innerHeight}`;
  if (restaurada && !P.venceu(restaurada)) {
    estado = restaurada;
    historico = Array.isArray(salva.historico)
      ? salva.historico.map(P.restaurar).filter((h) => h && h.semente === estado.semente)
      : [];
    acumuladoMs = estado.segundos * 1000;
    retomada = estado.iniciado;
    desenhar({ animar: false });
    desenharEstatisticas();
    anunciar("Partida anterior retomada.");
  } else {
    novaPartida();
  }
})();
