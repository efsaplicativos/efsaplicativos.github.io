"use strict";
/*
 * Interface da Paciência. As regras ficam em paciencia-logica.js.
 *
 * As 52 cartas são criadas uma vez e só mudam de lugar (propriedade CSS translate), por isso a
 * mesa é toda calculada aqui: largura das cartas, espaçamento das colunas e posição de cada pilha.
 * Um toque manda a carta para o melhor lugar; arrastando, o jogador escolhe o destino. No teclado,
 * as setas escolhem a pilha (e a carta, dentro da coluna), Enter joga e Espaço pega e solta.
 * A partida, o histórico para desfazer e as estatísticas ficam no localStorage.
 */
(() => {
  const raiz = document.querySelector(".paciencia");
  if (!raiz || typeof LogicaPaciencia !== "object") return;
  const P = LogicaPaciencia;

  const CHAVE_PARTIDA = "efs-paciencia-partida";
  const CHAVE_ESTATISTICAS = "efs-paciencia-estatisticas";
  const CHAVE_MODO = "efs-paciencia-modo";
  const LIMITE_HISTORICO = 500;
  const HISTORICO_SALVO = 80;
  const ARRASTO_MINIMO = 6;
  const TRAVA_DIALOGO_MS = 500;
  const reduzirMovimento = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  const mesa = raiz.querySelector("#pc-mesa");
  const textoTempo = raiz.querySelector("#pc-tempo");
  const textoMovimentos = raiz.querySelector("#pc-movimentos");
  const textoPontos = raiz.querySelector("#pc-pontos");
  const textoPartida = raiz.querySelector("#pc-partida");
  const botaoDesfazer = raiz.querySelector("#pc-desfazer");
  const botaoDica = raiz.querySelector("#pc-dica");
  const botaoNova = raiz.querySelector("#pc-nova");
  const botoesModo = [...raiz.querySelectorAll("[data-modo]")];
  const status = raiz.querySelector("#pc-status");
  const estModo = raiz.querySelector("#pc-est-modo");
  const estLista = raiz.querySelector("#pc-est-lista");
  const botaoZerar = raiz.querySelector("#pc-zerar");
  const dialogo = raiz.querySelector("#pc-dialogo");
  const dialogoTitulo = raiz.querySelector("#pc-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#pc-dialogo-texto");
  const dialogoDados = raiz.querySelector("#pc-dialogo-dados");
  const dialogoBotoes = raiz.querySelector("#pc-dialogo-botoes");
  // Se sons.js não carregar, o jogo segue mudo e o botão some
  const som =
    typeof Sons === "object"
      ? Sons.criar("paciencia", raiz)
      : { tocar() {}, ligarBotao: (b) => b && (b.hidden = true) };

  let estado;
  let historico = [];
  let estatisticas = { 1: P.estatisticasVazias(), 3: P.estatisticasVazias() };
  let retomada = false;
  let acumuladoMs = 0;
  let inicioTrecho = null;
  let tique = null;
  let automatico = null;
  let avisouTravado = false;
  let pressao = null;
  let selecionada = null;
  let dicaTimer = null;
  let foco = { pilha: 6, profundidade: 0 };
  let g = null;
  let posicoes = [];

  // ---------- Pilhas: 0 monte, 1 descarte, 2 a 5 fundações, 6 a 12 colunas ----------

  const PILHAS = [
    { tipo: "monte", x: 0 },
    { tipo: "descarte", x: 1 },
    ...[0, 1, 2, 3].map((indice) => ({ tipo: "fundacao", indice, x: 3 + indice })),
    ...[0, 1, 2, 3, 4, 5, 6].map((indice) => ({ tipo: "coluna", indice, x: indice })),
  ];
  const pilhaDaColuna = (c) => 6 + c;
  const pilhaDaFundacao = (f) => 2 + f;

  const pilhasEl = PILHAS.map((pilha, i) => {
    const el = document.createElement("div");
    el.className = `pc-pilha pc-pilha-${pilha.tipo}`;
    if (pilha.tipo === "fundacao") el.dataset.naipe = P.NAIPES[pilha.indice].id;
    el.dataset.i = String(i);
    el.tabIndex = -1;
    el.setAttribute("role", "button");
    return el;
  });

  const anel = document.createElement("div");
  anel.className = "pc-anel";
  anel.hidden = true;

  const cartasEl = [...Array(52).keys()].map((id) => {
    const el = document.createElement("div");
    el.className = `pc-carta${P.vermelha(id) ? " vermelha" : ""}`;
    el.dataset.id = String(id);
    el.setAttribute("aria-hidden", "true");
    const naipe = P.NAIPES[P.naipe(id)].id;
    const v = P.valor(id);
    const centro =
      v > 10
        ? `<span class="pc-centro pc-figura">${P.textoValor(id)}</span>`
        : `<span class="pc-centro"><i class="pc-naipe pc-naipe-${naipe}"></i></span>`;
    el.innerHTML =
      `<span class="pc-frente"><span class="pc-valor">${P.textoValor(id)}</span>` +
      `<i class="pc-naipe pc-naipe-${naipe} pc-naipe-canto"></i>${centro}</span><span class="pc-verso"></span>`;
    return el;
  });
  mesa.replaceChildren(...pilhasEl, ...cartasEl, anel);

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
    const espaco = Math.max(4, Math.round(largura * 0.014));
    const margem = espaco;
    const cw = Math.floor((largura - 2 * margem - 6 * espaco) / 7);
    const ch = Math.round(cw * 1.4);
    const topoColunas = margem + ch + Math.round(espaco * 2.5);
    // A largura do jogo já é limitada pela altura da janela (no CSS); as colunas ganham 3,6 cartas
    // de altura e só passam disso numa coluna muito comprida
    const alturaColunas = Math.round(ch * 3.6);
    g = { espaco, margem, cw, ch, topoColunas, alturaColunas };
    mesa.style.setProperty("--cw", `${cw}px`);
    mesa.style.setProperty("--ch", `${ch}px`);
  }

  const xDaColuna = (x) => g.margem + x * (g.cw + g.espaco);

  /** Distância entre as cartas fechadas e entre as abertas, apertando a coluna se ela não couber. */
  function espacamento(c) {
    const n = estado.colunas[c].length;
    const fechadas = estado.fechadas[c];
    const abertas = Math.max(0, n - fechadas - 1);
    let dFechada = g.ch * 0.12;
    let dAberta = g.ch * 0.28;
    const altura = () => g.ch + fechadas * dFechada + abertas * dAberta;
    if (altura() > g.alturaColunas) dFechada = g.ch * 0.07;
    if (altura() > g.alturaColunas && abertas) {
      dAberta = Math.max(g.ch * 0.2, (g.alturaColunas - g.ch - fechadas * dFechada) / abertas);
    }
    return { dFechada, dAberta, altura: n ? altura() : g.ch };
  }

  function calcularPosicoes() {
    const pos = new Array(52);
    const y0 = g.margem;
    // [coberta]: carta escondida embaixo de outras na mesma posição (as sombras somadas de 24
    // cartas fariam uma borda escura no monte)
    estado.monte.forEach((id, i) => {
      pos[id] = { x: xDaColuna(0), y: y0, z: 10 + i, aberta: false, pilha: 0, coberta: i < estado.monte.length - 2 };
    });
    const visiveis = estado.modo === 3 ? Math.min(3, estado.descarte.length) : 1;
    estado.descarte.forEach((id, i) => {
      const k = i - (estado.descarte.length - visiveis);
      const desloc = estado.modo === 3 && k > 0 ? k * g.cw * 0.3 : 0;
      pos[id] = { x: xDaColuna(1) + desloc, y: y0, z: 100 + i, aberta: true, pilha: 1, coberta: k < -1 };
    });
    estado.fundacoes.forEach((f, n) =>
      f.forEach((id, i) => {
        pos[id] = { x: xDaColuna(3 + n), y: y0, z: 200 + i, aberta: true, pilha: pilhaDaFundacao(n), coberta: i < f.length - 2 };
      }),
    );
    let maisAlta = 0;
    estado.colunas.forEach((coluna, c) => {
      const { dFechada, dAberta, altura } = espacamento(c);
      maisAlta = Math.max(maisAlta, altura);
      let y = g.topoColunas;
      coluna.forEach((id, i) => {
        pos[id] = { x: xDaColuna(c), y, z: 300 + i, aberta: i >= estado.fechadas[c], pilha: pilhaDaColuna(c) };
        y += i < estado.fechadas[c] ? dFechada : dAberta;
      });
    });
    mesa.style.height = `${Math.ceil(g.topoColunas + Math.max(g.alturaColunas, maisAlta) + g.margem)}px`;
    return pos;
  }

  /** Retângulo de cada pilha: o lugar da carta na fileira de cima, ou a coluna inteira. */
  function retanguloDaPilha(i) {
    const pilha = PILHAS[i];
    if (pilha.tipo !== "coluna") return { x: xDaColuna(pilha.x), y: g.margem, w: g.cw, h: g.ch };
    const coluna = estado.colunas[pilha.indice];
    const ultima = coluna.length ? posicoes[coluna[coluna.length - 1]] : null;
    const fim = ultima ? ultima.y + g.ch : g.topoColunas + g.ch;
    return { x: xDaColuna(pilha.x), y: g.topoColunas, w: g.cw, h: fim - g.topoColunas };
  }

  // ---------- Desenho ----------

  function cartasMoveis() {
    const moveis = new Set();
    estado.colunas.forEach((coluna, c) => coluna.slice(estado.fechadas[c]).forEach((id) => moveis.add(id)));
    const topos = [estado.descarte[estado.descarte.length - 1], ...estado.fundacoes.map((f) => f[f.length - 1])];
    topos.forEach((id) => id !== undefined && moveis.add(id));
    return moveis;
  }

  function desenhar({ animar = true } = {}) {
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
      el.style.translate = `${p.x}px ${p.y}px`;
      // A carta que está indo para outra pilha passa por cima das outras durante o caminho
      el.style.zIndex = String(mudou && antes && !semAnimacao ? 1000 + p.z : p.z);
      if (mudou && antes && !semAnimacao) {
        clearTimeout(el._z);
        el._z = setTimeout(() => (el.style.zIndex = String(posicoes[id].z)), 200);
      }
      const abriu = antes && !antes.aberta && p.aberta;
      el.classList.toggle("aberta", p.aberta);
      el.classList.toggle("coberta", Boolean(p.coberta));
      el.classList.toggle("movel", moveis.has(id));
      if (abriu && !semAnimacao) {
        el.classList.remove("virando");
        void el.offsetWidth;
        el.classList.add("virando");
      }
    });
    if (semAnimacao) requestAnimationFrame(() => mesa.classList.remove("sem-animacao"));

    PILHAS.forEach((pilha, i) => {
      const el = pilhasEl[i];
      const r = retanguloDaPilha(i);
      el.style.translate = `${r.x}px ${r.y}px`;
      el.style.width = `${r.w}px`;
      el.style.height = `${pilha.tipo === "coluna" ? g.ch : r.h}px`;
      el.setAttribute("aria-label", rotuloDaPilha(i));
    });
    pilhasEl[0].classList.toggle("pode-voltar", !estado.monte.length && estado.descarte.length > 0);
    pilhasEl[0].classList.toggle("vazio", !estado.monte.length && !estado.descarte.length);
    for (const el of cartasEl) el.classList.remove("pc-selecionada");
    if (selecionada !== null) for (const id of P.cartasParaMover(estado, selecionada) || []) cartasEl[id].classList.add("pc-selecionada");

    textoMovimentos.textContent = P.formatarNumero(estado.movimentos);
    textoPontos.textContent = P.formatarNumero(estado.pontos);
    textoPartida.textContent = `Partida nº ${P.formatarNumero(estado.semente)} · virando ${estado.modo === 1 ? "1 carta" : "3 cartas"}`;
    botaoDesfazer.disabled = !historico.length || P.venceu(estado) || automatico !== null;
    botaoDica.disabled = P.venceu(estado) || automatico !== null;
    for (const botao of botoesModo) {
      const ativo = Number(botao.dataset.modo) === estado.modo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    atualizarFoco(false);
    atualizarCronometro();
  }

  function rotuloDaPilha(i) {
    const pilha = PILHAS[i];
    if (pilha.tipo === "monte") {
      if (estado.monte.length) return `Monte: ${estado.monte.length} cartas. Enter vira ${estado.modo === 1 ? "uma carta" : "três cartas"}.`;
      return estado.descarte.length ? "Monte vazio. Enter volta o descarte para o monte." : "Monte vazio.";
    }
    if (pilha.tipo === "descarte") {
      const deCima = estado.descarte[estado.descarte.length - 1];
      return deCima === undefined ? "Descarte vazio." : `Descarte: ${P.nomeCarta(deCima)} por cima.`;
    }
    if (pilha.tipo === "fundacao") {
      const f = estado.fundacoes[pilha.indice];
      const nome = P.NAIPES[pilha.indice].nome;
      return f.length ? `Fundação de ${nome}: até ${P.nomeCarta(f[f.length - 1])}.` : `Fundação de ${nome}, vazia.`;
    }
    const coluna = estado.colunas[pilha.indice];
    const fechadas = estado.fechadas[pilha.indice];
    if (!coluna.length) return `Coluna ${pilha.indice + 1}, vazia.`;
    const abertas = coluna.slice(fechadas).map(P.nomeCarta).join(", ");
    const textoFechadas = fechadas ? `${fechadas} ${fechadas === 1 ? "carta virada" : "cartas viradas"} para baixo; ` : "";
    return `Coluna ${pilha.indice + 1}: ${textoFechadas}${abertas}.`;
  }

  function anunciar(texto) {
    status.textContent = texto;
  }

  // ---------- Foco do teclado ----------

  /** Carta escolhida na pilha com foco: na coluna, [profundidade] conta a partir da carta de cima. */
  function cartaEmFoco() {
    const pilha = PILHAS[foco.pilha];
    if (pilha.tipo === "descarte") return estado.descarte[estado.descarte.length - 1] ?? null;
    if (pilha.tipo === "fundacao") {
      const f = estado.fundacoes[pilha.indice];
      return f[f.length - 1] ?? null;
    }
    if (pilha.tipo !== "coluna") return null;
    const coluna = estado.colunas[pilha.indice];
    if (!coluna.length) return null;
    const abertas = coluna.length - estado.fechadas[pilha.indice];
    foco.profundidade = Math.min(foco.profundidade, abertas - 1);
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
    const r = id !== null && posicoes[id] ? { x: posicoes[id].x, y: posicoes[id].y, w: g.cw, h: g.ch } : retanguloDaPilha(foco.pilha);
    if (id !== null && PILHAS[foco.pilha].tipo === "coluna") {
      const coluna = estado.colunas[PILHAS[foco.pilha].indice];
      const ultima = posicoes[coluna[coluna.length - 1]];
      r.h = ultima.y + g.ch - r.y;
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

  function textoDestino(destino) {
    return destino.tipo === "fundacao" ? "para a fundação" : `para a coluna ${destino.indice + 1}`;
  }

  /** Coloca o novo estado, guarda o anterior para desfazer e confere o fim da partida. */
  function aplicar(novo, { efeito, texto }) {
    sincronizarSegundos();
    const anterior = estado;
    historico.push(estado);
    if (historico.length > LIMITE_HISTORICO) historico.shift();
    estado = { ...novo, segundos: anterior.segundos };
    retomada = false;
    avisouTravado = false;
    selecionada = null;
    limparDica();
    // Carta que ficou aberta no topo de uma coluna
    let revelada = null;
    estado.colunas.forEach((coluna, c) => {
      if (estado.fechadas[c] < anterior.fechadas[c] && coluna.length) revelada = coluna[estado.fechadas[c]];
    });
    desenhar();
    som.tocar(efeito);
    if (revelada !== null) setTimeout(() => som.tocar("virar"), 90);
    anunciar(revelada !== null ? `${texto} Abriu ${P.nomeCarta(revelada)}.` : texto);
    if (P.venceu(estado)) {
      concluir();
      return;
    }
    salvar();
    if (P.podeConcluirSozinho(estado)) iniciarAutomatico();
    else verificarTravado();
  }

  function jogar(id, destino) {
    const novo = P.mover(estado, id, destino);
    if (!novo) return false;
    const varias = (P.cartasParaMover(estado, id) || []).length;
    const nome = varias > 1 ? `${P.nomeCarta(id)} e mais ${varias - 1}` : P.nomeCarta(id);
    aplicar(novo, { efeito: destino.tipo === "fundacao" ? "acerto" : "deslizar", texto: `${nome} ${textoDestino(destino)}.` });
    return true;
  }

  function acaoMonte() {
    if (automatico !== null) return;
    const novo = P.comprar(estado);
    if (!novo) {
      anunciar("O monte e o descarte estão vazios.");
      return;
    }
    const voltou = !estado.monte.length;
    const custo = -P.PONTOS.reciclar[estado.modo];
    const deCima = novo.descarte[novo.descarte.length - 1];
    aplicar(novo, {
      efeito: voltou ? "embaralhar" : "virar",
      texto: voltou ? `O descarte voltou para o monte (menos ${custo} pontos).` : `Virou ${P.nomeCarta(deCima)}.`,
    });
  }

  function tremer(ids) {
    for (const id of ids) {
      const el = cartasEl[id];
      el.classList.remove("tremendo");
      void el.offsetWidth;
      el.classList.add("tremendo");
    }
  }

  /** Um toque (ou Enter) na carta: vai para o melhor lugar, se houver. */
  function tocarCarta(id) {
    const local = P.localizar(estado, id);
    if (!local || automatico !== null) return;
    if (local.tipo === "monte") {
      acaoMonte();
      return;
    }
    if (local.tipo === "fundacao") {
      anunciar("Para tirar uma carta da fundação, arraste a carta ou use Espaço no teclado.");
      return;
    }
    const ids = P.cartasParaMover(estado, id);
    if (!ids) return;
    const destino = P.melhorDestino(estado, id);
    if (!destino || !jogar(id, destino)) {
      tremer(ids);
      som.tocar("erro");
      anunciar(`${P.nomeCarta(id)} não tem para onde ir agora.`);
    }
  }

  function desfazer() {
    if (automatico !== null || !historico.length || P.venceu(estado)) return;
    fecharDialogo();
    sincronizarSegundos();
    const segundos = estado.segundos;
    estado = { ...historico.pop(), segundos };
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
    for (const el of [...cartasEl, ...pilhasEl]) el.classList.remove("pc-dica");
  }

  function mostrarDica() {
    if (automatico !== null || P.venceu(estado)) return;
    limparDica();
    const d = P.dica(estado);
    if (!d) {
      abrirTravado();
      return;
    }
    som.tocar("dica");
    if (d.comprar) {
      (estado.monte.length ? cartasEl[estado.monte[estado.monte.length - 1]] : pilhasEl[0]).classList.add("pc-dica");
      anunciar(estado.monte.length ? "Dica: vire uma carta do monte." : "Dica: volte o descarte para o monte.");
    } else {
      for (const id of P.cartasParaMover(estado, d.id)) cartasEl[id].classList.add("pc-dica");
      const alvo = d.destino.tipo === "fundacao" ? pilhaDaFundacao(P.naipe(d.id)) : pilhaDaColuna(d.destino.indice);
      const coluna = d.destino.tipo === "coluna" ? estado.colunas[d.destino.indice] : null;
      if (coluna && coluna.length) cartasEl[coluna[coluna.length - 1]].classList.add("pc-dica");
      else if (d.destino.tipo === "fundacao" && estado.fundacoes[P.naipe(d.id)].length) {
        const f = estado.fundacoes[P.naipe(d.id)];
        cartasEl[f[f.length - 1]].classList.add("pc-dica");
      } else pilhasEl[alvo].classList.add("pc-dica");
      anunciar(`Dica: ${P.nomeCarta(d.id)} ${textoDestino(d.destino)}.`);
    }
    dicaTimer = setTimeout(limparDica, 2200);
  }

  function abrirTravado() {
    avisouTravado = true;
    const botoes = [];
    if (historico.length) botoes.push({ rotulo: "Desfazer jogada", acao: desfazer });
    botoes.push(
      { rotulo: "Recomeçar esta partida", acao: () => novaPartida({ semente: estado.semente }), secundario: historico.length > 0 },
      { rotulo: "Nova partida", acao: () => novaPartida(), secundario: true },
      { rotulo: "Continuar olhando", acao: () => {}, secundario: true },
    );
    abrirDialogo({
      titulo: "Sem jogadas úteis",
      texto: "Não encontrei mais jogadas que ajudem nesta partida. Você pode desfazer algumas jogadas, recomeçar a mesma partida ou começar outra.",
      botoes,
    });
    som.tocar("derrota");
  }

  function verificarTravado() {
    if (!avisouTravado && !P.venceu(estado) && !P.dica(estado)) setTimeout(() => !dialogo.open && !P.dica(estado) && abrirTravado(), 450);
  }

  // ---------- Final automático e vitória ----------

  function iniciarAutomatico() {
    if (automatico !== null) return;
    anunciar("Todas as cartas estão abertas: a partida termina sozinha.");
    const passo = () => {
      const r = P.passoAutomatico(estado);
      if (!r) {
        automatico = null;
        desenhar();
        return;
      }
      estado = { ...r.estado, segundos: estado.segundos };
      desenhar();
      som.tocar("virar");
      if (P.venceu(estado)) {
        automatico = null;
        concluir();
        return;
      }
      automatico = setTimeout(passo, reduzirMovimento.matches ? 30 : 80);
    };
    automatico = setTimeout(passo, 350);
    desenhar();
  }

  function pararAutomatico() {
    if (automatico !== null) clearTimeout(automatico);
    automatico = null;
  }

  function concluir() {
    acumuladoMs = decorridoMs();
    inicioTrecho = null;
    clearInterval(tique);
    sincronizarSegundos();
    gravar(CHAVE_PARTIDA, null);
    const bonus = P.bonusTempo(estado.segundos);
    const total = estado.pontos + bonus;
    const anterior = estatisticas[estado.modo];
    const { estatisticas: novas, recordes } = P.registrarResultado(anterior, { venceu: true, segundos: estado.segundos, pontos: total });
    estatisticas = { ...estatisticas, [estado.modo]: novas };
    gravar(CHAVE_ESTATISTICAS, estatisticas);
    desenharEstatisticas();
    desenhar();
    estado.fundacoes.forEach((f, n) => f.forEach((id, i) => cartasEl[id].style.setProperty("--k", String(n * 3 + (12 - i)))));
    mesa.classList.add("pc-festa");
    setTimeout(() => mesa.classList.remove("pc-festa"), 2600);
    som.tocar("vitoria");
    const dados = [
      ["Tempo", P.formatarTempo(estado.segundos)],
      ["Movimentos", P.formatarNumero(estado.movimentos)],
      ["Pontos da partida", P.formatarNumero(estado.pontos)],
      ["Bônus de tempo", P.formatarNumero(bonus)],
      ["Total", P.formatarNumero(total), true],
    ];
    if (recordes.pontos) dados.push(["Nova maior pontuação!", P.formatarNumero(total), true]);
    if (recordes.tempo) dados.push(["Novo melhor tempo!", P.formatarTempo(estado.segundos), true]);
    dados.push(["Vitórias seguidas", P.formatarNumero(novas.sequencia)]);
    const semente = estado.semente;
    setTimeout(() => {
      abrirDialogo({
        titulo: "Parabéns!",
        texto: `Você terminou a paciência virando ${estado.modo === 1 ? "1 carta" : "3 cartas"}.`,
        dados,
        botoes: [
          { rotulo: "Nova partida", acao: () => novaPartida() },
          { rotulo: "Jogar esta de novo", acao: () => novaPartida({ semente }), secundario: true },
          { rotulo: "Fechar", acao: () => {}, secundario: true },
        ],
      });
    }, 700);
  }

  // ---------- Estatísticas ----------

  function desenharEstatisticas() {
    const modo = estado ? estado.modo : 1;
    const e = estatisticas[modo];
    estModo.textContent = modo === 1 ? "Virar 1" : "Virar 3";
    const linhas = [
      ["Partidas", P.formatarNumero(e.jogadas)],
      ["Vitórias", `${P.formatarNumero(e.vitorias)} (${P.porcentagemVitorias(e)}%)`],
      ["Melhor tempo", e.melhorTempo === null ? "—" : P.formatarTempo(e.melhorTempo)],
      ["Maior pontuação", e.melhorPontuacao ? P.formatarNumero(e.melhorPontuacao) : "—"],
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

  /** Distribui as cartas saindo do monte, uma de cada vez. */
  function animarDistribuicao() {
    if (reduzirMovimento.matches) return;
    const ordem = [];
    for (let linha = 0; linha < 7; linha++) {
      for (let c = linha; c < 7; c++) ordem.push(estado.colunas[c][linha]);
    }
    mesa.classList.add("sem-animacao");
    for (const id of ordem) cartasEl[id].style.translate = `${xDaColuna(0)}px ${g.margem}px`;
    void mesa.offsetWidth;
    mesa.classList.remove("sem-animacao");
    ordem.forEach((id, k) => {
      const el = cartasEl[id];
      el.style.transitionDelay = `${k * 22}ms`;
      el.style.translate = `${posicoes[id].x}px ${posicoes[id].y}px`;
      setTimeout(() => (el.style.transitionDelay = ""), k * 22 + 400);
    });
  }

  function novaPartida({ modo = estado ? estado.modo : 1, semente = P.novaSemente() } = {}) {
    fecharDialogo();
    pararAutomatico();
    registrarAbandono();
    zerarCronometro();
    retomada = false;
    historico = [];
    selecionada = null;
    avisouTravado = false;
    limparDica();
    mesa.classList.remove("pc-festa");
    estado = P.novoJogo(modo, semente);
    gravar(CHAVE_MODO, modo);
    posicoes = [];
    desenhar({ animar: false });
    animarDistribuicao();
    desenharEstatisticas();
    salvar();
    som.tocar("embaralhar");
    anunciar(`Nova partida, virando ${modo === 1 ? "1 carta" : "3 cartas"}. Partida número ${semente}.`);
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
    const testar = (destino, area) => {
      if (!P.podeMover(estado, arrasto.id, destino)) return;
      const s = sobreposicao(carta, area) + (ponto.x >= area.x && ponto.x <= area.x + area.w && ponto.y >= area.y && ponto.y <= area.y + area.h ? g.cw * g.ch : 0);
      if (s > maior) {
        maior = s;
        melhor = destino;
      }
    };
    if (arrasto.ids.length === 1) {
      testar({ tipo: "fundacao" }, { x: xDaColuna(3), y: g.margem, w: xDaColuna(6) + g.cw - xDaColuna(3), h: g.ch });
    }
    for (let c = 0; c < 7; c++) {
      const r = retanguloDaPilha(pilhaDaColuna(c));
      testar({ tipo: "coluna", indice: c }, { x: r.x, y: r.y, w: r.w, h: Math.max(r.h, g.ch) + g.ch * 0.5 });
    }
    return melhor;
  }

  function pontoNaMesa(evento) {
    const r = mesa.getBoundingClientRect();
    return { x: evento.clientX - r.left, y: evento.clientY - r.top };
  }

  mesa.addEventListener("pointerdown", (evento) => {
    if (automatico !== null || evento.button > 0 || pressao) return;
    const cartaEl = evento.target.closest(".pc-carta");
    const pilhaEl = evento.target.closest(".pc-pilha");
    if (cartaEl) {
      const id = Number(cartaEl.dataset.id);
      const local = P.localizar(estado, id);
      if (local.tipo === "monte") {
        pressao = { tipo: "monte", pointerId: evento.pointerId };
        return;
      }
      const ids = P.cartasParaMover(estado, id);
      if (!ids) return;
      pressao = { tipo: "carta", id, ids, x0: evento.clientX, y0: evento.clientY, pointerId: evento.pointerId, ativo: false };
      try {
        cartaEl.setPointerCapture(evento.pointerId);
      } catch (erro) {
        /* sem captura: o arrasto continua pelos eventos da mesa */
      }
    } else if (pilhaEl && pilhaEl.dataset.i === "0") {
      pressao = { tipo: "monte", pointerId: evento.pointerId };
    }
  });

  mesa.addEventListener("pointermove", (evento) => {
    if (!pressao || pressao.tipo !== "carta" || evento.pointerId !== pressao.pointerId) return;
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
    if (atual.tipo === "monte") {
      if (!cancelado) acaoMonte();
      return;
    }
    if (!atual.ativo) {
      if (!cancelado) tocarCarta(atual.id);
      return;
    }
    mesa.classList.remove("arrastando");
    for (const id of atual.ids) cartasEl[id].classList.remove("no-ar");
    const dx = evento.clientX - atual.x0;
    const dy = evento.clientY - atual.y0;
    const destino = cancelado ? null : destinoDoArrasto(atual, dx, dy, pontoNaMesa(evento));
    if (!destino || !jogar(atual.id, destino)) desenhar();
  }

  mesa.addEventListener("pointerup", (evento) => terminarPressao(evento));
  mesa.addEventListener("pointercancel", (evento) => terminarPressao(evento, true));
  // Sem isso, o navegador do celular pode tentar rolar a página ou selecionar texto no meio do arrasto
  mesa.addEventListener("touchmove", (evento) => pressao && pressao.ativo && evento.preventDefault(), { passive: false });
  mesa.addEventListener("contextmenu", (evento) => evento.target.closest(".pc-carta") && evento.preventDefault());

  // ---------- Teclado ----------

  const FILEIRA_DE_CIMA = [0, 1, 2, 3, 4, 5];

  function irParaPilha(i, profundidade = 0) {
    foco = { pilha: i, profundidade };
    atualizarFoco();
  }

  function pegarOuSoltar() {
    const pilha = PILHAS[foco.pilha];
    if (selecionada !== null) {
      const destino = pilha.tipo === "coluna" ? { tipo: "coluna", indice: pilha.indice } : pilha.tipo === "fundacao" ? { tipo: "fundacao" } : null;
      const id = selecionada;
      if (destino && jogar(id, destino)) return;
      selecionada = id;
      som.tocar("erro");
      anunciar(`${P.nomeCarta(id)} não pode ir para lá. Escolha outra pilha ou aperte Esc para cancelar.`);
      return;
    }
    if (pilha.tipo === "monte") {
      acaoMonte();
      return;
    }
    const id = cartaEmFoco();
    if (id === null || !P.cartasParaMover(estado, id)) return;
    selecionada = id;
    desenhar();
    som.tocar("selecionar");
    anunciar(`${P.nomeCarta(id)} na mão. Escolha a pilha com as setas e aperte Espaço ou Enter para soltar.`);
  }

  mesa.addEventListener("keydown", (evento) => {
    const pilhaEl = evento.target.closest?.(".pc-pilha");
    if (!pilhaEl || evento.altKey || evento.ctrlKey || evento.metaKey || automatico !== null) return;
    const i = Number(pilhaEl.dataset.i);
    const pilha = PILHAS[i];
    const naColuna = pilha.tipo === "coluna";
    switch (evento.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        const passo = evento.key === "ArrowLeft" ? -1 : 1;
        if (naColuna) irParaPilha(pilhaDaColuna((pilha.indice + passo + 7) % 7));
        else irParaPilha(FILEIRA_DE_CIMA[(FILEIRA_DE_CIMA.indexOf(i) + passo + 6) % 6]);
        break;
      }
      case "ArrowDown":
        if (!naColuna) irParaPilha(pilhaDaColuna(pilha.x));
        else if (foco.profundidade > 0) irParaPilha(i, foco.profundidade - 1);
        break;
      case "ArrowUp": {
        if (naColuna) {
          const coluna = estado.colunas[pilha.indice];
          const abertas = coluna.length - estado.fechadas[pilha.indice];
          if (foco.profundidade < abertas - 1) {
            irParaPilha(i, foco.profundidade + 1);
            const id = cartaEmFoco();
            if (id !== null) anunciar(`${P.nomeCarta(id)} e as cartas em cima dela.`);
          } else {
            const x = pilha.indice === 2 ? 1 : pilha.indice;
            irParaPilha(PILHAS.findIndex((p) => p.tipo !== "coluna" && p.x === x));
          }
        }
        break;
      }
      case "Enter":
        if (selecionada !== null) pegarOuSoltar();
        else if (pilha.tipo === "monte") acaoMonte();
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
    const pilhaEl = evento.target.closest?.(".pc-pilha");
    if (!pilhaEl) return;
    const i = Number(pilhaEl.dataset.i);
    if (i !== foco.pilha) foco = { pilha: i, profundidade: 0 };
    atualizarFoco(false);
  });
  mesa.addEventListener("focusout", () => setTimeout(() => atualizarFoco(false), 0));

  // Leitores de tela ativam a pilha com um clique sem ponteiro
  mesa.addEventListener("click", (evento) => {
    const pilhaEl = evento.target.closest(".pc-pilha");
    if (!pilhaEl || evento.detail !== 0) return;
    foco = { pilha: Number(pilhaEl.dataset.i), profundidade: 0 };
    if (PILHAS[foco.pilha].tipo === "monte") acaoMonte();
    else {
      const id = cartaEmFoco();
      if (id !== null) tocarCarta(id);
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
      texto: `As estatísticas do ${modo === 1 ? "Virar 1" : "Virar 3"} voltam para zero. Isso não pode ser desfeito.`,
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
  som.ligarBotao(raiz.querySelector("#pc-som"));

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

  const salvas = lerJson(CHAVE_ESTATISTICAS);
  if (salvas && typeof salvas === "object") {
    estatisticas = { 1: P.lerEstatisticas(salvas[1]), 3: P.lerEstatisticas(salvas[3]) };
  }
  const salva = lerJson(CHAVE_PARTIDA);
  const restaurada = salva && P.restaurar(salva.estado);
  medir();
  ultimaMedida = `${mesa.clientWidth}x${window.innerHeight}`;
  if (restaurada && !P.venceu(restaurada)) {
    estado = restaurada;
    historico = Array.isArray(salva.historico) ? salva.historico.map(P.restaurar).filter(Boolean) : [];
    acumuladoMs = estado.segundos * 1000;
    retomada = estado.iniciado;
    desenhar({ animar: false });
    desenharEstatisticas();
    anunciar("Partida anterior retomada.");
    if (P.podeConcluirSozinho(estado)) iniciarAutomatico();
  } else {
    const modo = lerJson(CHAVE_MODO) === 3 ? 3 : 1;
    novaPartida({ modo });
  }
})();
