"use strict";
/*
 * Interface do Caça-palavras: grade com seleção por arrasto, por dois toques ou pelo teclado,
 * marcas coloridas, dica, cronômetro, recordes e partida salva. As regras ficam em
 * caca-palavras-logica.js.
 */
(() => {
  const raiz = document.querySelector("#caca-palavras");
  if (!raiz || typeof LogicaCacaPalavras === "undefined") return;
  const L = LogicaCacaPalavras;

  const CHAVE_PARTIDA = "efs-caca-palavras-partida";
  const CHAVE_NIVEL = "efs-caca-palavras-nivel";
  const CHAVE_TEMA = "efs-caca-palavras-tema";
  const CHAVE_RECORDES = "efs-caca-palavras-recordes";
  const CHAVE_VITORIAS = "efs-caca-palavras-vitorias";
  const CORES = 10;
  const SALVAR_A_CADA_MS = 5000;
  const TRAVA_DIALOGO_MS = 500;
  const SVG = "http://www.w3.org/2000/svg";

  const $ = (s) => raiz.querySelector(s);
  const grade = $("#cz-grade");
  const textoAchadas = $("#cz-achadas");
  const textoTempo = $("#cz-tempo");
  const textoRecorde = $("#cz-recorde");
  const titulo = $("#cz-titulo");
  const lista = $("#cz-lista");
  const mensagem = $("#cz-mensagem");
  const status = $("#cz-status");
  const botaoDica = $("#cz-dica");
  const botaoNovo = $("#cz-novo");
  const seletorTema = $("#cz-tema");
  const botoesNivel = [...raiz.querySelectorAll("[data-nivel]")];
  const recordesNivel = $("#cz-recordes-nivel");
  const recordesLista = $("#cz-recordes-lista");
  const recordesVazio = $("#cz-recordes-vazio");
  const textoVitorias = $("#cz-vitorias");
  const dialogo = $("#cz-dialogo");
  const dialogoTitulo = $("#cz-dialogo-titulo");
  const dialogoTexto = $("#cz-dialogo-texto");
  const dialogoDados = $("#cz-dialogo-dados");
  const dialogoBotoes = $("#cz-dialogo-botoes");
  const som =
    typeof Sons === "object" ? Sons.criar("caca-palavras", raiz) : { tocar() {}, ligarBotao: (b) => b && (b.hidden = true) };

  let partida = null;
  let celulas = [];
  let foco = 0;
  /** Primeira letra escolhida com um toque (ou Enter), esperando a última. */
  let pendente = null;
  let arrasto = null;
  let recordes = [];
  let vitorias = L.lerVitorias(null);
  let mensagemTimer = null;
  let erroTimer = null;
  // Cronômetro: partida.tempoMs guarda o tempo já fechado; o trecho que está correndo começa em inicioTrecho
  let iniciada = false;
  let inicioTrecho = null;
  let tique = null;
  let ultimoSalvo = 0;
  // Peças do desenho em SVG por cima da grade
  let svg = null;
  let grupoMarcas = null;
  let grupoPistas = null;
  let linhaSelecao = null;
  let circuloInicio = null;

  const movimentoReduzido = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const maiuscula = (p) => p.toLocaleUpperCase("pt-BR");
  const nomeTema = (id) => L.TEMAS[id]?.nome ?? "";
  const data = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  // ---------- Armazenamento ----------

  function ler(chave) {
    try {
      return localStorage.getItem(chave);
    } catch (erro) {
      return null;
    }
  }
  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, valor);
    } catch (erro) {
      /* Sem armazenamento: vale só enquanto a página estiver aberta. */
    }
  }
  function lerJson(chave) {
    try {
      return JSON.parse(ler(chave));
    } catch (erro) {
      return null;
    }
  }
  function salvarPartida() {
    if (!partida) return;
    gravar(CHAVE_PARTIDA, L.paraSalvar({ ...partida, tempoMs: Math.round(decorridoMs()) }));
    ultimoSalvo = performance.now();
  }

  // ---------- Cronômetro ----------

  const decorridoMs = () => partida.tempoMs + (inicioTrecho === null ? 0 : performance.now() - inicioTrecho);
  const segundos = () => Math.floor(decorridoMs() / 1000);
  const mostrarTempo = () => (textoTempo.textContent = L.formatarTempo(segundos()));

  /** Fecha o trecho que está correndo dentro de partida.tempoMs. */
  function pararTrecho() {
    if (inicioTrecho === null) return;
    partida = { ...partida, tempoMs: decorridoMs() };
    inicioTrecho = null;
    clearInterval(tique);
    tique = null;
  }

  /** O tempo só corre com a partida começada, ainda em jogo e com a página visível. */
  function atualizarCronometro() {
    const deveRodar = iniciada && !L.terminou(partida) && document.visibilityState === "visible";
    if (deveRodar && inicioTrecho === null) {
      inicioTrecho = performance.now();
      tique = setInterval(() => {
        mostrarTempo();
        // Grava de vez em quando, caso a página seja fechada sem aviso
        if (performance.now() - ultimoSalvo >= SALVAR_A_CADA_MS) salvarPartida();
      }, 250);
    } else if (!deveRodar) {
      pararTrecho();
    }
    mostrarTempo();
  }

  function comecar() {
    if (iniciada) return;
    iniciada = true;
    atualizarCronometro();
  }

  // ---------- Montagem ----------

  function svgEl(nome, atributos = {}) {
    const el = document.createElementNS(SVG, nome);
    for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
    return el;
  }
  const centro = (i) => [(i % partida.lado) + 0.5, Math.floor(i / partida.lado) + 0.5];

  function linhaEntre(a, b, classe) {
    const [x1, y1] = centro(a);
    const [x2, y2] = centro(b);
    return svgEl("line", { x1, y1, x2, y2, class: classe });
  }

  function montarGrade() {
    const { lado } = partida;
    raiz.style.setProperty("--cz-lado", lado);
    svg = svgEl("svg", { class: "cz-marcas", viewBox: `0 0 ${lado} ${lado}`, preserveAspectRatio: "none", "aria-hidden": "true" });
    grupoMarcas = svgEl("g");
    grupoPistas = svgEl("g");
    linhaSelecao = svgEl("line", { class: "cz-selecao" });
    circuloInicio = svgEl("circle", { class: "cz-inicio", r: "0.42" });
    linhaSelecao.style.display = "none";
    circuloInicio.style.display = "none";
    svg.append(grupoMarcas, grupoPistas, linhaSelecao, circuloInicio);
    foco = Math.min(foco, lado * lado - 1);
    celulas = [...partida.letras].map((letra, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cz-cel";
      b.textContent = letra;
      b.dataset.i = i;
      b.tabIndex = i === foco ? 0 : -1;
      b.setAttribute("aria-label", `${letra}, linha ${Math.floor(i / lado) + 1}, coluna ${(i % lado) + 1}`);
      // Atraso da onda da vitória, em diagonal
      b.style.setProperty("--cz-atraso", (Math.floor(i / lado) + (i % lado)) * 30);
      return b;
    });
    grade.classList.remove("terminada", "festa");
    grade.replaceChildren(svg, ...celulas);
  }

  // ---------- Desenho ----------

  const corDe = (palavra) => `var(--cz-c${(palavra.achada - 1) % CORES})`;

  function desenharMarcas(nova = -1) {
    const marcas = [];
    partida.palavras.forEach((p, i) => {
      if (!p.achada) return;
      const linha = linhaEntre(p.celulas[0], p.celulas.at(-1), `cz-marca${i === nova ? " nova" : ""}`);
      linha.style.stroke = corDe(p);
      marcas.push(linha);
    });
    grupoMarcas.replaceChildren(...marcas);
  }

  function desenharPistas(nova = -1) {
    const pistas = [];
    partida.palavras.forEach((p, i) => {
      if (!p.dica || p.achada) return;
      const [cx, cy] = centro(p.celulas[0]);
      pistas.push(svgEl("circle", { cx, cy, r: "0.4", class: `cz-pista${i === nova ? " nova" : ""}` }));
    });
    grupoPistas.replaceChildren(...pistas);
  }

  function desenharLista(nova = -1) {
    titulo.textContent = nomeTema(partida.tema);
    lista.replaceChildren(
      ...partida.palavras.map((p, i) => {
        const item = document.createElement("li");
        item.className = `cz-palavra${p.achada ? " achada" : ""}${i === nova ? " nova" : ""}`;
        item.textContent = maiuscula(p.texto);
        if (p.achada) {
          item.style.setProperty("--cz-cor", corDe(p));
          const oculto = document.createElement("span");
          oculto.className = "sr-only";
          oculto.textContent = " (achada)";
          item.append(oculto);
        }
        return item;
      }),
    );
  }

  function desenharPlacar() {
    textoAchadas.textContent = `${L.achadas(partida)}/${partida.palavras.length}`;
    const melhor = L.melhorTempo(recordes, partida.nivel);
    textoRecorde.textContent = melhor === null ? "--:--" : L.formatarTempo(melhor);
    botaoDica.disabled = L.terminou(partida);
    for (const b of botoesNivel) {
      const ativo = b.dataset.nivel === partida.nivel;
      b.classList.toggle("active", ativo);
      b.setAttribute("aria-pressed", String(ativo));
    }
    mostrarTempo();
  }

  function desenharRecordes() {
    const nivel = L.NIVEIS[partida.nivel];
    recordesNivel.textContent = nivel.nome;
    const itens = L.ranking(recordes, nivel.id)
      .slice(0, 5)
      .map((r) => {
        const item = document.createElement("li");
        const partes = [L.formatarTempo(r.tempo)];
        if (r.tema) partes.push(nomeTema(r.tema));
        if (r.dicas) partes.push(r.dicas === 1 ? "1 dica" : `${r.dicas} dicas`);
        partes.push(data.format(new Date(r.dataMs)));
        item.textContent = partes.join(" · ");
        return item;
      });
    recordesLista.replaceChildren(...itens);
    recordesLista.hidden = itens.length === 0;
    recordesVazio.hidden = itens.length > 0;
    const n = vitorias[nivel.id];
    textoVitorias.textContent = `Caça-palavras terminados neste nível: ${n}.`;
    textoVitorias.hidden = n === 0;
  }

  function desenhar({ nova = -1, pista = -1 } = {}) {
    desenharMarcas(nova);
    desenharPistas(pista);
    desenharLista(nova);
    desenharPlacar();
    desenharRecordes();
    desenharInicio();
    grade.classList.toggle("terminada", L.terminou(partida));
    if (modoDiario && partida && L.terminou(partida) && D) D.marcarConcluido("caca-palavras");
  }

  // ---------- Seleção na grade ----------

  function desenharInicio() {
    if (pendente === null) {
      circuloInicio.style.display = "none";
      return;
    }
    const [cx, cy] = centro(pendente);
    circuloInicio.setAttribute("cx", cx);
    circuloInicio.setAttribute("cy", cy);
    circuloInicio.style.display = "";
  }

  function mostrarSelecao(a, b) {
    clearTimeout(erroTimer);
    const casas = L.celulasEntre(partida.lado, a, b);
    if (!casas) {
      linhaSelecao.style.display = "none";
      return;
    }
    const [x1, y1] = centro(a);
    const [x2, y2] = centro(b);
    linhaSelecao.setAttribute("x1", x1);
    linhaSelecao.setAttribute("y1", y1);
    linhaSelecao.setAttribute("x2", x2);
    linhaSelecao.setAttribute("y2", y2);
    linhaSelecao.classList.remove("erro");
    linhaSelecao.style.display = "";
  }

  function limparSelecao() {
    clearTimeout(erroTimer);
    linhaSelecao.classList.remove("erro");
    linhaSelecao.style.display = "none";
  }

  /** A faixa da seleção errada fica vermelha e some aos poucos. */
  function mostrarErro(a, b) {
    mostrarSelecao(a, b);
    // Força o navegador a desenhar antes de começar a sumir
    void linhaSelecao.getBoundingClientRect();
    linhaSelecao.classList.add("erro");
    erroTimer = setTimeout(limparSelecao, 700);
  }

  function tentar(a, b) {
    const r = L.selecionar(partida, a, b);
    if (r.ok) {
      partida = r.partida;
      limparSelecao();
      const palavra = partida.palavras[r.indice];
      som.tocar("acerto");
      desenhar({ nova: r.indice });
      if (L.terminou(partida)) {
        terminar();
        return;
      }
      salvarPartida();
      const faltam = partida.palavras.length - L.achadas(partida);
      mostrarMensagem(`Achou ${maiuscula(palavra.texto)}!`, { duracao: 1800, falar: false });
      anunciar(`Achou ${palavra.texto}. ${faltam === 1 ? "Falta 1 palavra" : `Faltam ${faltam} palavras`}.`);
      return;
    }
    switch (r.motivo) {
      case "curta":
        limparSelecao();
        return;
      case "torta":
        limparSelecao();
        som.tocar("erro");
        mostrarMensagem("A palavra fica numa linha reta: na mesma linha, coluna ou diagonal.", { aviso: true, duracao: 2600 });
        return;
      case "repetida":
        mostrarErro(a, b);
        mostrarMensagem(`Você já achou ${maiuscula(partida.palavras[r.indice].texto)}.`, { duracao: 1800 });
        return;
      case "nada":
        mostrarErro(a, b);
        som.tocar("erro");
        mostrarMensagem("Essa não é uma das palavras.", { aviso: true, duracao: 1600 });
        return;
      default:
        limparSelecao();
    }
  }

  /** Toque (ou Enter) numa letra: a primeira marca o início; a segunda fecha a seleção. */
  function escolherLetra(i) {
    if (pendente === null) {
      pendente = i;
      desenharInicio();
      som.tocar("selecionar");
      anunciar(`Início na letra ${partida.letras[i]}. Agora escolha a última letra da palavra.`);
    } else if (pendente === i) {
      pendente = null;
      limparSelecao();
      desenharInicio();
      anunciar("Escolha desfeita.");
    } else {
      const a = pendente;
      pendente = null;
      desenharInicio();
      tentar(a, i);
    }
  }

  function pontoNaGrade(x, y) {
    const area = grade.getBoundingClientRect();
    const tamanho = area.width / partida.lado;
    return { linha: (y - area.top) / tamanho - 0.5, coluna: (x - area.left) / tamanho - 0.5 };
  }

  function indiceNoPonto(x, y) {
    const { linha, coluna } = pontoNaGrade(x, y);
    const l = Math.round(linha);
    const c = Math.round(coluna);
    if (l < 0 || c < 0 || l >= partida.lado || c >= partida.lado) return -1;
    return l * partida.lado + c;
  }

  function moverFoco(i, focar = true) {
    if (celulas[foco]) celulas[foco].tabIndex = -1;
    foco = i;
    celulas[i].tabIndex = 0;
    if (focar) celulas[i].focus({ preventScroll: false });
  }

  grade.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (L.terminou(partida) || dialogo.open) return;
    const i = indiceNoPonto(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    comecar();
    moverFoco(i, false);
    try {
      grade.setPointerCapture(e.pointerId);
    } catch (erro) {
      /* Sem captura, o arrasto ainda funciona dentro da grade. */
    }
    arrasto = { id: e.pointerId, inicio: i, fim: i, moveu: false };
    if (pendente !== null && pendente !== i) mostrarSelecao(pendente, i);
    else mostrarSelecao(i, i);
  });

  grade.addEventListener("pointermove", (e) => {
    if (!arrasto || e.pointerId !== arrasto.id) return;
    const { linha, coluna } = pontoNaGrade(e.clientX, e.clientY);
    const fim = L.fimAjustado(partida.lado, arrasto.inicio, linha, coluna);
    if (fim !== arrasto.inicio && !arrasto.moveu) {
      // Começou a arrastar: o toque anterior, se havia, deixa de valer
      arrasto.moveu = true;
      pendente = null;
      desenharInicio();
    }
    if (arrasto.moveu && fim !== arrasto.fim) {
      arrasto.fim = fim;
      mostrarSelecao(arrasto.inicio, fim);
    }
  });

  grade.addEventListener("pointerup", (e) => {
    if (!arrasto || e.pointerId !== arrasto.id) return;
    const { inicio, fim, moveu } = arrasto;
    arrasto = null;
    if (moveu) tentar(inicio, fim);
    else {
      if (pendente === null) limparSelecao();
      escolherLetra(inicio);
    }
  });

  grade.addEventListener("pointercancel", () => {
    arrasto = null;
    limparSelecao();
  });

  grade.addEventListener("keydown", (e) => {
    const celula = e.target.closest?.(".cz-cel");
    if (!celula || dialogo.open) return;
    const i = Number(celula.dataset.i);
    const { lado } = partida;
    const linha = Math.floor(i / lado);
    const coluna = i % lado;
    let novo = null;
    switch (e.key) {
      case "ArrowLeft":
        novo = coluna > 0 ? i - 1 : i;
        break;
      case "ArrowRight":
        novo = coluna < lado - 1 ? i + 1 : i;
        break;
      case "ArrowUp":
        novo = linha > 0 ? i - lado : i;
        break;
      case "ArrowDown":
        novo = linha < lado - 1 ? i + lado : i;
        break;
      case "Home":
        novo = linha * lado;
        break;
      case "End":
        novo = linha * lado + lado - 1;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (L.terminou(partida)) return;
        comecar();
        escolherLetra(i);
        return;
      case "Escape":
        if (pendente !== null) {
          e.preventDefault();
          pendente = null;
          limparSelecao();
          desenharInicio();
          anunciar("Escolha desfeita.");
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    moverFoco(novo);
    if (pendente !== null) mostrarSelecao(pendente, novo);
  });

  // ---------- Mensagens ----------

  function mostrarMensagem(texto, { aviso = false, falar = true, duracao = 0 } = {}) {
    clearTimeout(mensagemTimer);
    mensagem.textContent = texto;
    mensagem.classList.toggle("aviso", aviso);
    if (falar && texto) anunciar(texto);
    if (duracao) mensagemTimer = setTimeout(() => (mensagem.textContent = ""), duracao);
  }

  function anunciar(texto) {
    status.textContent = "";
    requestAnimationFrame(() => (status.textContent = texto));
  }

  // ---------- Dica ----------

  botaoDica.addEventListener("click", () => {
    if (L.terminou(partida)) return;
    comecar();
    const d = L.darDica(partida);
    if (!d) return;
    partida = d.partida;
    salvarPartida();
    som.tocar("dica");
    desenharPistas(d.indice);
    mostrarTempo();
    const lado = partida.lado;
    mostrarMensagem(`Uma palavra começa na letra destacada. +${L.PENALIDADE_DICA_S} s no tempo.`, {
      duracao: 3200,
      falar: false,
    });
    anunciar(
      `Dica: uma palavra que falta começa na linha ${Math.floor(d.celula / lado) + 1}, coluna ${(d.celula % lado) + 1}. ` +
        `Mais ${L.PENALIDADE_DICA_S} segundos no tempo.`,
    );
  });

  // ---------- Fim de jogo ----------

  function terminar() {
    pararTrecho();
    const tempo = Math.floor(partida.tempoMs / 1000);
    const anterior = L.melhorTempo(recordes, partida.nivel);
    recordes = L.adicionarRecorde(recordes, {
      nivel: partida.nivel,
      tempo,
      dicas: partida.dicas,
      dataMs: Date.now(),
      tema: partida.tema,
    });
    gravar(CHAVE_RECORDES, JSON.stringify(recordes));
    vitorias = { ...vitorias, [partida.nivel]: vitorias[partida.nivel] + 1 };
    gravar(CHAVE_VITORIAS, JSON.stringify(vitorias));
    salvarPartida();
    pendente = null;
    desenhar();
    if (!movimentoReduzido()) grade.classList.add("festa");
    som.tocar("vitoria");
    const recorde = anterior === null || tempo < anterior;
    mostrarMensagem(recorde && anterior !== null ? "Novo recorde!" : "Você achou todas!", { falar: false });
    setTimeout(() => abrirResultado(tempo, anterior), movimentoReduzido() ? 200 : 1100);
  }

  function botao(texto, acao, secundario = false) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = secundario ? "button secondary" : "button";
    b.textContent = texto;
    b.addEventListener("click", acao);
    return b;
  }

  function dado(rotulo, valor, destaque = false) {
    const div = document.createElement("div");
    if (destaque) div.className = "destaque";
    const dt = document.createElement("dt");
    dt.textContent = rotulo;
    const dd = document.createElement("dd");
    dd.textContent = valor;
    div.append(dt, dd);
    return div;
  }

  function abrirDialogo(focar = 0) {
    if (!dialogo.open) dialogo.showModal();
    // Trava rápida para um toque que já vinha não apertar um botão sem querer
    dialogo.classList.add("travado");
    setTimeout(() => dialogo.classList.remove("travado"), TRAVA_DIALOGO_MS);
    dialogoBotoes.children[focar]?.focus({ preventScroll: true });
  }

  function abrirResultado(tempo, anterior) {
    if (!L.terminou(partida)) return;
    const total = partida.palavras.length;
    const novoRecorde = anterior !== null && tempo < anterior;
    dialogoTitulo.textContent = novoRecorde ? "Novo recorde!" : "Parabéns!";
    dialogoTexto.textContent = `Você achou as ${total} palavras de ${nomeTema(partida.tema)} em ${L.formatarTempo(tempo)}.`;
    const dados = [dado("Tempo", L.formatarTempo(tempo), novoRecorde)];
    if (partida.dicas) {
      dados.push(dado("Dicas", `${partida.dicas} (+${partida.dicas * L.PENALIDADE_DICA_S} s)`));
    }
    dados.push(dado(`Recorde no ${L.NIVEIS[partida.nivel].nome}`, L.formatarTempo(L.melhorTempo(recordes, partida.nivel))));
    dados.push(dado("Terminados neste nível", String(vitorias[partida.nivel])));
    dialogoDados.replaceChildren(...dados);
    dialogoBotoes.replaceChildren(
      botao("Jogar de novo", () => {
        dialogo.close();
        iniciarJogo(partida.nivel, seletorTema.value);
      }),
      botao("Fechar", () => dialogo.close(), true),
    );
    abrirDialogo();
  }

  dialogo.addEventListener("click", (e) => {
    // Clique no fundo escurecido, fora do quadro, fecha
    if (e.target !== dialogo || dialogo.classList.contains("travado")) return;
    const r = dialogo.getBoundingClientRect();
    const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!dentro) dialogo.close();
  });

  // ---------- Novo jogo, nível e tema ----------

  /** Partida que daria pena perder: com palavra achada, dica ou mais de 20 s de procura. */
  const temProgresso = () =>
    !L.terminou(partida) && (L.achadas(partida) > 0 || partida.dicas > 0 || decorridoMs() > 20000);

  // Modo diário (assets/jogos/diario.js): a grade e as palavras saem da semente do dia
  const D = typeof Diario === "object" ? Diario : null;
  const botaoDiario = document.querySelector("#cz-diario");
  if (!D && botaoDiario) botaoDiario.hidden = true;
  let modoDiario = false;

  function iniciarJogo(nivel, tema, aleatorio) {
    pararTrecho();
    iniciada = false;
    pendente = null;
    arrasto = null;
    partida = L.novaPartida(nivel, tema, aleatorio);
    modoDiario = Boolean(aleatorio) && Boolean(D);
    gravar(CHAVE_NIVEL, partida.nivel);
    salvarPartida();
    montarGrade();
    limparSelecao();
    desenhar();
    mostrarMensagem("");
    atualizarCronometro();
  }

  botaoDiario?.addEventListener("click", () => {
    if (!D) return;
    iniciarJogo(partida ? partida.nivel : "facil", seletorTema.value, D.doDia("caca-palavras").gerador);
  });

  function pedirNovoJogo(nivel, tema) {
    if (!temProgresso()) {
      iniciarJogo(nivel, tema);
      return;
    }
    dialogoTitulo.textContent = "Começar outro caça-palavras?";
    dialogoTexto.textContent = "As palavras achadas e o tempo deste jogo serão perdidos.";
    dialogoDados.replaceChildren();
    dialogoBotoes.replaceChildren(
      botao("Sim, novo jogo", () => {
        dialogo.close();
        iniciarJogo(nivel, tema);
      }),
      botao("Continuar este", () => dialogo.close(), true),
    );
    abrirDialogo(1);
  }

  botaoNovo.addEventListener("click", () => pedirNovoJogo(partida.nivel, seletorTema.value));

  botoesNivel.forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.nivel === partida.nivel && !L.terminou(partida)) return;
      pedirNovoJogo(b.dataset.nivel, seletorTema.value);
    }),
  );

  seletorTema.addEventListener("change", () => {
    gravar(CHAVE_TEMA, seletorTema.value);
    if (temProgresso()) {
      mostrarMensagem("O tema novo entra quando você começar outro jogo.", { duracao: 2600 });
    } else {
      iniciarJogo(partida.nivel, seletorTema.value);
    }
  });

  som.ligarBotao($("#cz-som"));

  document.addEventListener("visibilitychange", () => {
    atualizarCronometro();
    if (document.visibilityState === "hidden") salvarPartida();
  });
  window.addEventListener("pagehide", salvarPartida);

  // ---------- Início ----------

  const sortear = document.createElement("option");
  sortear.value = "";
  sortear.textContent = "Sortear um tema";
  const opcoes = [...L.IDS_TEMAS]
    .sort((a, b) => nomeTema(a).localeCompare(nomeTema(b), "pt-BR"))
    .map((id) => {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = nomeTema(id);
      return o;
    });
  seletorTema.replaceChildren(sortear, ...opcoes);
  const temaSalvo = ler(CHAVE_TEMA);
  seletorTema.value = L.temaValido(temaSalvo) ? temaSalvo : "";

  recordes = L.lerRecordes(lerJson(CHAVE_RECORDES));
  vitorias = L.lerVitorias(lerJson(CHAVE_VITORIAS));
  const salva = L.restaurar(ler(CHAVE_PARTIDA));
  if (salva && !L.terminou(salva)) {
    // A partida volta parada: o tempo só corre de novo no próximo toque na grade
    partida = salva;
    montarGrade();
    desenhar();
    atualizarCronometro();
  } else {
    const nivelSalvo = ler(CHAVE_NIVEL);
    iniciarJogo(L.nivelValido(nivelSalvo) ? nivelSalvo : "facil", seletorTema.value);
  }
})();
