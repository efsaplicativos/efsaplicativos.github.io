"use strict";
/*
 * Interface da Paciência Spider. As regras ficam em paciencia-spider-logica.js.
 *
 * As 104 cartas são criadas uma vez e só mudam de lugar (propriedade CSS translate); a face de
 * cada uma é refeita quando o modo muda, porque o naipe de cada carta depende do modo. Um toque
 * manda a carta para o melhor lugar; arrastando, o jogador escolhe a coluna. No teclado, as setas
 * escolhem a coluna (e a carta, dentro da sequência), Enter joga e Espaço pega e solta.
 * A partida, o histórico para desfazer e as estatísticas ficam no localStorage.
 */
(() => {
  const raiz = document.querySelector(".spider");
  if (!raiz || typeof LogicaSpider !== "object") return;
  const P = LogicaSpider;

  const CHAVE_PARTIDA = "efs-spider-partida";
  const CHAVE_ESTATISTICAS = "efs-spider-estatisticas";
  const CHAVE_MODO = "efs-spider-modo";
  const LIMITE_HISTORICO = 500;
  const HISTORICO_SALVO = 60;
  const ARRASTO_MINIMO = 6;
  const TRAVA_DIALOGO_MS = 500;
  const PASSO_RECOLHER_MS = 45;
  const PASSO_DISTRIBUIR_MS = 45;
  const reduzirMovimento = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  const mesa = raiz.querySelector("#sp-mesa");
  const textoTempo = raiz.querySelector("#sp-tempo");
  const textoMovimentos = raiz.querySelector("#sp-movimentos");
  const textoPontos = raiz.querySelector("#sp-pontos");
  const textoPartida = raiz.querySelector("#sp-partida");
  const botaoDesfazer = raiz.querySelector("#sp-desfazer");
  const botaoDica = raiz.querySelector("#sp-dica");
  const botaoNova = raiz.querySelector("#sp-nova");
  const botoesModo = [...raiz.querySelectorAll("[data-modo]")];
  const status = raiz.querySelector("#sp-status");
  const estModo = raiz.querySelector("#sp-est-modo");
  const estLista = raiz.querySelector("#sp-est-lista");
  const botaoZerar = raiz.querySelector("#sp-zerar");
  const dialogo = raiz.querySelector("#sp-dialogo");
  const dialogoTitulo = raiz.querySelector("#sp-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#sp-dialogo-texto");
  const dialogoDados = raiz.querySelector("#sp-dialogo-dados");
  const dialogoBotoes = raiz.querySelector("#sp-dialogo-botoes");
  // Se sons.js não carregar, o jogo segue mudo e o botão some
  const som =
    typeof Sons === "object"
      ? Sons.criar("paciencia-spider", raiz)
      : { tocar() {}, ligarBotao: (b) => b && (b.hidden = true) };

  let estado;
  let historico = [];
  let estatisticas = { 1: P.estatisticasVazias(), 2: P.estatisticasVazias(), 4: P.estatisticasVazias() };
  let retomada = false;
  let acumuladoMs = 0;
  let inicioTrecho = null;
  let tique = null;
  let avisouTravado = false;
  let pressao = null;
  let selecionada = null;
  let dicaTimer = null;
  let foco = { pilha: 2, profundidade: 0 };
  let g = null;
  let posicoes = [];
  let modoDasFaces = null;
  // Cartas de um naipe que acabou de se completar: ficam visíveis até chegarem ao canto
  const recemCompletas = new Set();
  let recolhendo = null;

  // ---------- Pilhas: 0 monte, 1 naipes completos, 2 a 11 colunas ----------

  const PILHAS = [
    { tipo: "monte", x: 9 },
    { tipo: "completos", x: 0 },
    ...[...Array(P.COLUNAS).keys()].map((indice) => ({ tipo: "coluna", indice, x: indice })),
  ];
  const pilhaDaColuna = (c) => 2 + c;

  const pilhasEl = PILHAS.map((pilha, i) => {
    const el = document.createElement("div");
    el.className = `sp-pilha sp-pilha-${pilha.tipo}`;
    el.dataset.i = String(i);
    el.tabIndex = -1;
    el.setAttribute("role", "button");
    return el;
  });

  const anel = document.createElement("div");
  anel.className = "sp-anel";
  anel.hidden = true;

  const cartasEl = [...Array(P.CARTAS).keys()].map((id) => {
    const el = document.createElement("div");
    el.className = "sp-carta";
    el.dataset.id = String(id);
    el.setAttribute("aria-hidden", "true");
    return el;
  });
  mesa.replaceChildren(...pilhasEl, ...cartasEl, anel);

  /** Desenha a face das cartas para o modo: o naipe de cada carta muda com ele. */
  function montarFaces(modo) {
    if (modoDasFaces === modo) return;
    modoDasFaces = modo;
    cartasEl.forEach((el, id) => {
      const naipe = P.NAIPES[P.naipe(id, modo)].id;
      const v = P.valor(id);
      const centro =
        v > 10
          ? `<span class="sp-centro sp-figura">${P.textoValor(id)}</span>`
          : `<span class="sp-centro"><i class="sp-naipe sp-naipe-${naipe}"></i></span>`;
      el.classList.toggle("vermelha", P.vermelha(id, modo));
      el.innerHTML =
        `<span class="sp-frente"><span class="sp-valor">${P.textoValor(id)}</span>` +
        `<i class="sp-naipe sp-naipe-${naipe} sp-naipe-canto"></i>${centro}</span><span class="sp-verso"></span>`;
    });
  }

  const nome = (id) => P.nomeCarta(id, estado.modo);

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
    const espaco = Math.max(3, Math.round(largura * 0.01));
    const margem = espaco;
    const cw = Math.floor((largura - 2 * margem - (P.COLUNAS - 1) * espaco) / P.COLUNAS);
    const ch = Math.round(cw * 1.4);
    const topoColunas = margem + ch + Math.round(espaco * 2.5);
    // A largura do jogo já é limitada pela altura da janela (no CSS); as colunas ganham 4,4 cartas
    // de altura e só passam disso numa coluna muito comprida. No celular em pé as cartas são
    // pequenas e sobra altura: as abertas ficam mais afastadas, para o valor aparecer inteiro
    const pequena = cw < 45;
    const alturaColunas = Math.round(ch * (pequena ? 6 : 4.4));
    const aberta = pequena ? 0.32 : 0.25;
    const abertaMinima = pequena ? 0.24 : 0.18;
    g = { espaco, margem, cw, ch, topoColunas, alturaColunas, aberta, abertaMinima };
    mesa.style.setProperty("--cw", `${cw}px`);
    mesa.style.setProperty("--ch", `${ch}px`);
  }

  const xDaColuna = (x) => g.margem + x * (g.cw + g.espaco);
  const distribuicoesRestantes = () => estado.monte.length / P.POR_DISTRIBUICAO;

  /** Distância entre as cartas fechadas e entre as abertas, apertando a coluna se ela não couber. */
  function espacamento(c) {
    const n = estado.colunas[c].length;
    const fechadas = estado.fechadas[c];
    const abertas = Math.max(0, n - fechadas - 1);
    let dFechada = g.ch * 0.1;
    let dAberta = g.ch * g.aberta;
    const altura = () => g.ch + fechadas * dFechada + abertas * dAberta;
    if (altura() > g.alturaColunas) dFechada = g.ch * 0.06;
    if (altura() > g.alturaColunas && abertas) {
      dAberta = Math.max(g.ch * g.abertaMinima, (g.alturaColunas - g.ch - fechadas * dFechada) / abertas);
    }
    return { dFechada, dAberta, altura: n ? altura() : g.ch };
  }

  function calcularPosicoes() {
    const pos = new Array(P.CARTAS);
    const y0 = g.margem;
    // O monte mostra um maço para cada distribuição que falta; [coberta] esconde as cartas
    // embaixo de outras na mesma posição (as sombras somadas fariam uma borda escura)
    const grupos = distribuicoesRestantes();
    estado.monte.forEach((id, i) => {
      const grupo = Math.floor(i / P.POR_DISTRIBUICAO);
      const x = xDaColuna(9) - (grupos - 1 - grupo) * g.cw * 0.2;
      pos[id] = { x, y: y0, z: 10 + i, aberta: false, pilha: 0, coberta: i % P.POR_DISTRIBUICAO !== P.POR_DISTRIBUICAO - 1 };
    });
    estado.completos.forEach((sequencia, k) => {
      sequencia.forEach((id, i) => {
        // O Rei fica por cima do seu naipe completo
        pos[id] = {
          x: xDaColuna(0) + k * g.cw * 0.42,
          y: y0,
          z: 200 + k * 13 + (12 - i),
          aberta: true,
          pilha: 1,
          coberta: i > 0 && !recemCompletas.has(id),
        };
      });
    });
    let maisAlta = 0;
    estado.colunas.forEach((coluna, c) => {
      const { dFechada, dAberta, altura } = espacamento(c);
      maisAlta = Math.max(maisAlta, altura);
      let y = g.topoColunas;
      coluna.forEach((id, i) => {
        pos[id] = { x: xDaColuna(c), y, z: 400 + i, aberta: i >= estado.fechadas[c], pilha: pilhaDaColuna(c) };
        y += i < estado.fechadas[c] ? dFechada : dAberta;
      });
    });
    mesa.style.height = `${Math.ceil(g.topoColunas + Math.max(g.alturaColunas, maisAlta) + g.margem)}px`;
    return pos;
  }

  /** Retângulo de cada pilha: o monte e os naipes completos na fileira de cima, ou a coluna inteira. */
  function retanguloDaPilha(i) {
    const pilha = PILHAS[i];
    if (pilha.tipo === "monte") {
      const extra = Math.max(0, distribuicoesRestantes() - 1) * g.cw * 0.2;
      return { x: xDaColuna(9) - extra, y: g.margem, w: g.cw + extra, h: g.ch };
    }
    if (pilha.tipo === "completos") return { x: xDaColuna(0), y: g.margem, w: g.cw, h: g.ch };
    const coluna = estado.colunas[pilha.indice];
    const ultima = coluna.length ? posicoes[coluna[coluna.length - 1]] : null;
    const fim = ultima ? ultima.y + g.ch : g.topoColunas + g.ch;
    return { x: xDaColuna(pilha.x), y: g.topoColunas, w: g.cw, h: fim - g.topoColunas };
  }

  // ---------- Desenho ----------

  /** Quantas cartas, do topo para baixo, formam a sequência do mesmo naipe que pode ser pega. */
  function tamanhoMovel(c) {
    const coluna = estado.colunas[c];
    if (!coluna.length) return 0;
    let k = coluna.length - 1;
    while (k > estado.fechadas[c] && P.sequenciaDoNaipe([coluna[k - 1], coluna[k]], estado.modo)) k--;
    return coluna.length - k;
  }

  function cartasMoveis() {
    const moveis = new Set();
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
    pilhasEl[0].classList.toggle("vazio", !estado.monte.length);
    for (const el of cartasEl) el.classList.remove("sp-selecionada");
    if (selecionada !== null) for (const id of P.cartasParaMover(estado, selecionada) || []) cartasEl[id].classList.add("sp-selecionada");

    textoMovimentos.textContent = P.formatarNumero(estado.movimentos);
    textoPontos.textContent = P.formatarNumero(P.pontuacao(estado));
    textoPartida.textContent = `Partida nº ${P.formatarNumero(estado.semente)} · ${P.textoModo(estado.modo)}`;
    botaoDesfazer.disabled = !historico.length || P.venceu(estado);
    botaoDica.disabled = P.venceu(estado);
    for (const botao of botoesModo) {
      const ativo = Number(botao.dataset.modo) === estado.modo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    atualizarFoco(false);
    atualizarCronometro();
  }

  /** Esconde as cartas de baixo dos naipes que acabaram de chegar ao canto. */
  function terminarRecolhimento() {
    clearTimeout(recolhendo);
    recolhendo = null;
    if (!recemCompletas.size) return;
    recemCompletas.clear();
    posicoes = calcularPosicoes();
    posicoes.forEach((p, id) => cartasEl[id].classList.toggle("coberta", Boolean(p.coberta)));
  }

  function rotuloDaPilha(i) {
    const pilha = PILHAS[i];
    if (pilha.tipo === "monte") {
      const grupos = distribuicoesRestantes();
      if (!grupos) return "Monte vazio: todas as cartas já foram distribuídas.";
      const texto = `Monte: ${grupos} ${grupos === 1 ? "distribuição" : "distribuições"} de 10 cartas.`;
      return P.podeDistribuir(estado) ? `${texto} Enter distribui.` : `${texto} Para distribuir, nenhuma coluna pode estar vazia.`;
    }
    if (pilha.tipo === "completos") return `Naipes completos: ${estado.completos.length} de ${P.CONJUNTOS}.`;
    const coluna = estado.colunas[pilha.indice];
    const fechadas = estado.fechadas[pilha.indice];
    if (!coluna.length) return `Coluna ${pilha.indice + 1}, vazia.`;
    const abertas = coluna.slice(fechadas).map(nome).join(", ");
    const textoFechadas = fechadas ? `${fechadas} ${fechadas === 1 ? "carta virada" : "cartas viradas"} para baixo; ` : "";
    return `Coluna ${pilha.indice + 1}: ${textoFechadas}${abertas}.`;
  }

  function anunciar(texto) {
    status.textContent = texto;
  }

  // ---------- Foco do teclado ----------

  /** Carta escolhida na coluna com foco: [profundidade] conta a partir da carta de cima. */
  function cartaEmFoco() {
    const pilha = PILHAS[foco.pilha];
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
    const r = id !== null && posicoes[id] ? { x: posicoes[id].x, y: posicoes[id].y, w: g.cw, h: g.ch } : retanguloDaPilha(foco.pilha);
    if (id !== null) {
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

  /**
   * Coloca o novo estado, guarda o anterior para desfazer e confere o fim da partida.
   * [distribuidas]: as cartas que saíram do monte, para chegarem uma de cada vez.
   */
  function aplicar(novo, { efeito, texto, distribuidas = null }) {
    sincronizarSegundos();
    const anterior = estado;
    historico.push(estado);
    if (historico.length > LIMITE_HISTORICO) historico.shift();
    estado = { ...novo, segundos: anterior.segundos };
    retomada = false;
    avisouTravado = false;
    selecionada = null;
    limparDica();
    terminarRecolhimento();

    const atrasos = new Map();
    if (distribuidas) distribuidas.forEach((id, k) => atrasos.set(id, k * PASSO_DISTRIBUIR_MS));
    // Naipes que se completaram: as cartas sobem do Ás ao Rei, uma de cada vez
    const novos = estado.completos.slice(anterior.completos.length);
    const espera = distribuidas ? distribuidas.length * PASSO_DISTRIBUIR_MS + 150 : 0;
    novos.forEach((sequencia) =>
      sequencia.forEach((id, i) => {
        recemCompletas.add(id);
        atrasos.set(id, espera + (12 - i) * PASSO_RECOLHER_MS);
      }),
    );
    if (novos.length) recolhendo = setTimeout(terminarRecolhimento, espera + 13 * PASSO_RECOLHER_MS + 350);

    // Cartas que ficaram abertas no topo de uma coluna
    const reveladas = [];
    estado.colunas.forEach((coluna, c) => {
      if (estado.fechadas[c] < anterior.fechadas[c] && coluna.length) reveladas.push(coluna[estado.fechadas[c]]);
    });
    desenhar({ atrasos });
    som.tocar(efeito);
    if (reveladas.length) setTimeout(() => som.tocar("virar"), 90);
    let mensagem = texto;
    if (novos.length) {
      const naipes = novos.map((s) => P.NAIPES[P.naipe(s[0], estado.modo)].nome).join(" e ");
      mensagem += ` Naipe de ${naipes} completo: ${estado.completos.length} de ${P.CONJUNTOS}.`;
      setTimeout(() => som.tocar("completo"), espera + 200);
    }
    if (reveladas.length) mensagem += ` Abriu ${reveladas.map(nome).join(" e ")}.`;
    anunciar(mensagem);
    if (P.venceu(estado)) {
      concluir(espera + 13 * PASSO_RECOLHER_MS + 400);
      return;
    }
    salvar();
    verificarTravado();
  }

  function jogar(id, destino) {
    const ids = P.cartasParaMover(estado, id) || [];
    const novo = P.mover(estado, id, destino);
    if (!novo) return false;
    const texto = ids.length > 1 ? `${nome(id)} e mais ${ids.length - 1}` : nome(id);
    aplicar(novo, { efeito: "deslizar", texto: `${texto} para a coluna ${destino.indice + 1}.` });
    return true;
  }

  function avisarColunaVazia() {
    limparDica();
    estado.colunas.forEach((coluna, c) => !coluna.length && pilhasEl[pilhaDaColuna(c)].classList.add("sp-dica"));
    dicaTimer = setTimeout(limparDica, 2200);
    som.tocar("erro");
    anunciar("Para distribuir, nenhuma coluna pode estar vazia. Ponha uma carta na coluna vazia primeiro.");
  }

  function acaoMonte() {
    if (!estado.monte.length) {
      anunciar("O monte acabou: todas as cartas já foram distribuídas.");
      return;
    }
    if (!P.podeDistribuir(estado)) {
      avisarColunaVazia();
      return;
    }
    const distribuidas = estado.monte.slice(-P.POR_DISTRIBUICAO).reverse();
    const novo = P.distribuir(estado);
    const faltam = novo.monte.length / P.POR_DISTRIBUICAO;
    aplicar(novo, {
      efeito: "pousar",
      texto: `Distribuiu 10 cartas. ${faltam ? faltam === 1 ? "Falta 1 distribuição." : `Faltam ${faltam} distribuições.` : "O monte acabou."}`,
      distribuidas,
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
    if (!local) return;
    if (local.tipo === "monte") {
      acaoMonte();
      return;
    }
    if (local.tipo === "completo" || !local.aberta) return;
    const ids = P.cartasParaMover(estado, id);
    if (!ids) {
      tremer(estado.colunas[local.indice].slice(local.posicao));
      som.tocar("erro");
      anunciar("Só uma sequência do mesmo naipe, em ordem, se move junta.");
      return;
    }
    const destino = P.melhorDestino(estado, id);
    if (!destino || !jogar(id, destino)) {
      tremer(ids);
      som.tocar("erro");
      anunciar(`${nome(id)} não tem para onde ir agora.`);
    }
  }

  function desfazer() {
    if (!historico.length || P.venceu(estado)) return;
    fecharDialogo();
    sincronizarSegundos();
    terminarRecolhimento();
    const segundos = estado.segundos;
    estado = { ...P.desfazer(estado, historico.pop()), segundos };
    retomada = false;
    selecionada = null;
    avisouTravado = false;
    limparDica();
    desenhar();
    salvar();
    som.tocar("desfazer");
    anunciar("Jogada desfeita. Desfazer também conta como jogada.");
  }

  // ---------- Dica e partida travada ----------

  function limparDica() {
    clearTimeout(dicaTimer);
    for (const el of [...cartasEl, ...pilhasEl]) el.classList.remove("sp-dica");
  }

  function mostrarDica() {
    if (P.venceu(estado)) return;
    limparDica();
    const d = P.dica(estado);
    if (!d) {
      abrirTravado();
      return;
    }
    som.tocar("dica");
    if (d.distribuir) {
      cartasEl[estado.monte[estado.monte.length - 1]].classList.add("sp-dica");
      anunciar("Dica: distribua mais 10 cartas do monte.");
    } else {
      for (const id of P.cartasParaMover(estado, d.id)) cartasEl[id].classList.add("sp-dica");
      const coluna = estado.colunas[d.destino.indice];
      if (coluna.length) cartasEl[coluna[coluna.length - 1]].classList.add("sp-dica");
      else pilhasEl[pilhaDaColuna(d.destino.indice)].classList.add("sp-dica");
      anunciar(`Dica: ${nome(d.id)} para a coluna ${d.destino.indice + 1}.`);
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
    if (!avisouTravado && !P.venceu(estado) && !P.dica(estado)) setTimeout(() => !dialogo.open && !P.venceu(estado) && !P.dica(estado) && abrirTravado(), 650);
  }

  // ---------- Vitória ----------

  function concluir(espera = 0) {
    acumuladoMs = decorridoMs();
    inicioTrecho = null;
    clearInterval(tique);
    sincronizarSegundos();
    gravar(CHAVE_PARTIDA, null);
    const pontos = P.pontuacao(estado);
    const anterior = estatisticas[estado.modo];
    const { estatisticas: novas, recordes } = P.registrarResultado(anterior, { venceu: true, segundos: estado.segundos, pontos });
    estatisticas = { ...estatisticas, [estado.modo]: novas };
    gravar(CHAVE_ESTATISTICAS, estatisticas);
    desenharEstatisticas();
    const dados = [
      ["Tempo", P.formatarTempo(estado.segundos)],
      ["Movimentos", P.formatarNumero(estado.movimentos)],
      ["Pontos", P.formatarNumero(pontos), true],
    ];
    if (recordes.pontos) dados.push(["Nova maior pontuação!", P.formatarNumero(pontos), true]);
    if (recordes.tempo) dados.push(["Novo melhor tempo!", P.formatarTempo(estado.segundos), true]);
    dados.push(["Vitórias seguidas", P.formatarNumero(novas.sequencia)]);
    const { semente, modo } = estado;
    setTimeout(() => {
      terminarRecolhimento();
      estado.completos.forEach((sequencia, k) => cartasEl[sequencia[0]].style.setProperty("--k", String(k)));
      mesa.classList.add("sp-festa");
      setTimeout(() => mesa.classList.remove("sp-festa"), 2200);
      som.tocar("vitoria");
    }, espera);
    setTimeout(() => {
      abrirDialogo({
        titulo: "Parabéns!",
        texto: `Você completou os 8 naipes da Paciência Spider com ${P.textoModo(modo)}.`,
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
    const modo = estado ? estado.modo : 1;
    const e = estatisticas[modo];
    estModo.textContent = P.textoModo(modo);
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

  /** Distribui as cartas saindo do monte, linha por linha. */
  function animarDistribuicao() {
    if (reduzirMovimento.matches) return;
    const ordem = [];
    for (let linha = 0; linha < 6; linha++) {
      estado.colunas.forEach((coluna) => linha < coluna.length && ordem.push(coluna[linha]));
    }
    mesa.classList.add("sem-animacao");
    for (const id of ordem) cartasEl[id].style.translate = `${xDaColuna(9)}px ${g.margem}px`;
    void mesa.offsetWidth;
    mesa.classList.remove("sem-animacao");
    ordem.forEach((id, k) => {
      const el = cartasEl[id];
      el.style.transitionDelay = `${k * 14}ms`;
      el.style.translate = `${posicoes[id].x}px ${posicoes[id].y}px`;
    });
  }

  function novaPartida({ modo = estado ? estado.modo : 1, semente = P.novaSemente() } = {}) {
    fecharDialogo();
    registrarAbandono();
    zerarCronometro();
    terminarRecolhimento();
    retomada = false;
    historico = [];
    selecionada = null;
    avisouTravado = false;
    limparDica();
    mesa.classList.remove("sp-festa");
    estado = P.novoJogo(modo, semente);
    montarFaces(estado.modo);
    gravar(CHAVE_MODO, estado.modo);
    posicoes = [];
    desenhar({ animar: false });
    animarDistribuicao();
    desenharEstatisticas();
    salvar();
    som.tocar("embaralhar");
    anunciar(`Nova partida com ${P.textoModo(estado.modo)}. Partida número ${semente}.`);
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

  /** A coluna válida que a carta arrastada mais cobre; vale também a coluna embaixo do dedo. */
  function destinoDoArrasto(arrasto, dx, dy, ponto) {
    const base = posicoes[arrasto.id];
    const carta = { x: base.x + dx, y: base.y + dy, w: g.cw, h: g.ch };
    let melhor = null;
    let maior = 0;
    for (let c = 0; c < P.COLUNAS; c++) {
      const destino = { tipo: "coluna", indice: c };
      if (!P.podeMover(estado, arrasto.id, destino)) continue;
      const r = retanguloDaPilha(pilhaDaColuna(c));
      const area = { x: r.x, y: r.y, w: r.w, h: Math.max(r.h, g.ch) + g.ch * 0.5 };
      const dentro = ponto.x >= area.x && ponto.x <= area.x + area.w && ponto.y >= area.y && ponto.y <= area.y + area.h;
      const s = sobreposicao(carta, area) + (dentro ? g.cw * g.ch : 0);
      if (s > maior) {
        maior = s;
        melhor = destino;
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
    const cartaEl = evento.target.closest(".sp-carta");
    const pilhaEl = evento.target.closest(".sp-pilha");
    if (cartaEl) {
      const id = Number(cartaEl.dataset.id);
      const local = P.localizar(estado, id);
      if (local.tipo === "monte") {
        pressao = { tipo: "monte", pointerId: evento.pointerId };
        return;
      }
      if (local.tipo !== "coluna" || !local.aberta) return;
      const ids = P.cartasParaMover(estado, id);
      pressao = { tipo: "carta", id, ids, x0: evento.clientX, y0: evento.clientY, pointerId: evento.pointerId, ativo: false };
      if (!ids) return;
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
    if (!pressao || pressao.tipo !== "carta" || !pressao.ids || evento.pointerId !== pressao.pointerId) return;
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
  mesa.addEventListener("contextmenu", (evento) => evento.target.closest(".sp-carta") && evento.preventDefault());

  // ---------- Teclado ----------

  function irParaPilha(i, profundidade = 0) {
    foco = { pilha: i, profundidade };
    atualizarFoco();
  }

  function pegarOuSoltar() {
    const pilha = PILHAS[foco.pilha];
    if (selecionada !== null) {
      const id = selecionada;
      if (pilha.tipo === "coluna" && jogar(id, { tipo: "coluna", indice: pilha.indice })) return;
      selecionada = id;
      som.tocar("erro");
      anunciar(`${nome(id)} não pode ir para lá. Escolha outra coluna ou aperte Esc para cancelar.`);
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
    anunciar(`${nome(id)} na mão. Escolha a coluna com as setas e aperte Espaço ou Enter para soltar.`);
  }

  mesa.addEventListener("keydown", (evento) => {
    const pilhaEl = evento.target.closest?.(".sp-pilha");
    if (!pilhaEl || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const i = Number(pilhaEl.dataset.i);
    const pilha = PILHAS[i];
    const naColuna = pilha.tipo === "coluna";
    switch (evento.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        const passo = evento.key === "ArrowLeft" ? -1 : 1;
        if (naColuna) irParaPilha(pilhaDaColuna((pilha.indice + passo + P.COLUNAS) % P.COLUNAS));
        else irParaPilha(i === 0 ? 1 : 0);
        break;
      }
      case "ArrowDown":
        if (!naColuna) irParaPilha(pilhaDaColuna(pilha.x));
        else if (foco.profundidade > 0) irParaPilha(i, foco.profundidade - 1);
        break;
      case "ArrowUp":
        if (naColuna) {
          if (foco.profundidade < tamanhoMovel(pilha.indice) - 1) {
            irParaPilha(i, foco.profundidade + 1);
            const id = cartaEmFoco();
            if (id !== null) anunciar(`${nome(id)} e as cartas em cima dela.`);
          } else {
            irParaPilha(pilha.indice < 5 ? 1 : 0);
          }
        }
        break;
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
    const pilhaEl = evento.target.closest?.(".sp-pilha");
    if (!pilhaEl) return;
    const i = Number(pilhaEl.dataset.i);
    if (i !== foco.pilha) foco = { pilha: i, profundidade: 0 };
    atualizarFoco(false);
  });
  mesa.addEventListener("focusout", () => setTimeout(() => atualizarFoco(false), 0));

  // Leitores de tela ativam a pilha com um clique sem ponteiro
  mesa.addEventListener("click", (evento) => {
    const pilhaEl = evento.target.closest(".sp-pilha");
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
  som.ligarBotao(raiz.querySelector("#sp-som"));

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
    estatisticas = { 1: P.lerEstatisticas(salvas[1]), 2: P.lerEstatisticas(salvas[2]), 4: P.lerEstatisticas(salvas[4]) };
  }
  const salva = lerJson(CHAVE_PARTIDA);
  const restaurada = salva && P.restaurar(salva.estado);
  medir();
  ultimaMedida = `${mesa.clientWidth}x${window.innerHeight}`;
  if (restaurada && !P.venceu(restaurada)) {
    estado = restaurada;
    montarFaces(estado.modo);
    historico = Array.isArray(salva.historico)
      ? salva.historico.map(P.restaurar).filter((h) => h && h.modo === estado.modo && h.semente === estado.semente)
      : [];
    acumuladoMs = estado.segundos * 1000;
    retomada = estado.iniciado;
    desenhar({ animar: false });
    desenharEstatisticas();
    anunciar("Partida anterior retomada.");
  } else {
    const modo = P.MODOS.includes(lerJson(CHAVE_MODO)) ? lerJson(CHAVE_MODO) : 1;
    novaPartida({ modo });
  }
})();
