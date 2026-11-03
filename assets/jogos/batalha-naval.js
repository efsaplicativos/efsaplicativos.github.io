"use strict";
/*
 * Interface da Batalha Naval do Multi-Game Strategy (jogos/batalhanaval/ui/BatalhaNavalViewModel.kt,
 * TelaPartidaBatalhaNaval.kt, SeletorNavios.kt, PainelDificuldade.kt, GradeNaval.kt,
 * DialogoFimBatalha.kt e TelaMenuBatalhaNaval.kt): dificuldade, posicionamento manual ou
 * aleatório, batalha com o computador pensando 1 s antes de cada tiro, fim de partida,
 * estatísticas e recordes. As regras ficam em batalha-naval-logica.js; tudo é salvo no localStorage.
 */
(() => {
  const raiz = document.querySelector("#bnaval");
  if (!raiz || typeof LogicaBatalhaNaval === "undefined") return;
  const B = LogicaBatalhaNaval;

  const ESPERA_IA_MS = 1000;
  const DURACAO_AVISO_MS = 2500;
  const CHAVE_PARTIDA = "efs-batalha-naval-partida";
  const CHAVE_ESTATISTICAS = "efs-batalha-naval-estatisticas";
  const CHAVE_RECORDES = "efs-batalha-naval-recordes";
  const CHAVE_ABA = "efs-batalha-naval-aba-recordes";

  const $ = (seletor) => raiz.querySelector(seletor);
  const telaDificuldade = $("#bn-tela-dificuldade");
  const telaPosicao = $("#bn-tela-posicionamento");
  const telaBatalha = $("#bn-tela-batalha");
  const resumo = $("#bn-resumo");
  const botaoNovo = $("#bn-novo");
  const posicaoTitulo = $("#bn-posicao-titulo");
  const posicaoTexto = $("#bn-posicao-texto");
  const cartaoPosicao = $("#bn-cartao-posicao");
  const seloDificuldade = $("#bn-posicao-dificuldade");
  const frota = $("#bn-frota");
  const botoesOrientacao = [...raiz.querySelectorAll("[data-orientacao]")];
  const botaoAleatorio = $("#bn-aleatorio");
  const botaoIniciar = $("#bn-iniciar");
  const vezTitulo = $("#bn-vez-titulo");
  const vezTexto = $("#bn-vez-texto");
  const pensando = $("#bn-pensando");
  const textoTiros = $("#bn-tiros");
  const textoAfundados = $("#bn-afundados");
  const ultimo = $("#bn-ultimo");
  const botaoNovoFim = $("#bn-novo-fim");
  const meuResumo = $("#bn-meu-resumo");
  const listaRecordes = $("#bn-lista-recordes");
  const semRecordes = $("#bn-sem-recordes");
  const abasRecordes = [...raiz.querySelectorAll("[data-recordes]")];
  const dialogo = $("#bn-dialogo");
  const dialogoIcone = $("#bn-dialogo-icone");
  const dialogoTitulo = $("#bn-dialogo-titulo");
  const dialogoCorpo = $("#bn-dialogo-corpo");
  const dialogoBotoes = $("#bn-dialogo-botoes");

  const NOME_DIFICULDADE = Object.fromEntries(B.DIFICULDADES.map((d) => [d.chave, d.nome]));
  const ROTULO_CASA = { agua: "água", navio: "navio", acerto: "acerto", erro: "tiro na água", afundado: "navio afundado" };

  let partida;
  let estatisticas = B.estatisticasVazias();
  let recordes = { easy: [], medium: [], hard: [] };
  let selecionado = null;
  let ultimoTiroIa = null;
  let previa = null; // casa sob o cursor ou o foco no posicionamento
  let aviso = null;
  let temporizadorAviso = null;
  let turnoIa = null;
  let abaRecordes = "easy";

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
      /* Armazenamento indisponível: vale só enquanto a página estiver aberta. */
    }
  }

  const salvarPartida = () => gravar(CHAVE_PARTIDA, JSON.stringify(partida));

  // ---------- Tabuleiros ----------

  /** Cria as 100 casas; nos tabuleiros em que se toca, cada casa é um botão (só uma recebe Tab). */
  function criarGrade(el, interativa) {
    const casas = [];
    for (let i = 0; i < B.TAMANHO * B.TAMANHO; i++) {
      const casa = document.createElement(interativa ? "button" : "span");
      casa.className = "bn-casa";
      casa.dataset.casa = String(i);
      if (interativa) {
        casa.type = "button";
        casa.tabIndex = i === 0 ? 0 : -1;
      }
      el.append(casa);
      casas.push(casa);
    }
    if (interativa) {
      el.addEventListener("keydown", (evento) => moverFoco(evento, casas));
      el.addEventListener("focusin", (evento) => {
        const alvo = evento.target.closest(".bn-casa");
        if (!alvo) return;
        casas.forEach((c) => (c.tabIndex = c === alvo ? 0 : -1));
      });
    }
    return casas;
  }

  /** Setas andam pelo tabuleiro; Home/End vão ao começo/fim da linha. */
  function moverFoco(evento, casas) {
    const atual = casas.indexOf(document.activeElement);
    if (atual < 0) return;
    const l = B.linhaDe(atual);
    const c = B.colunaDe(atual);
    const destino = {
      ArrowUp: l > 0 ? atual - B.TAMANHO : null,
      ArrowDown: l < B.TAMANHO - 1 ? atual + B.TAMANHO : null,
      ArrowLeft: c > 0 ? atual - 1 : null,
      ArrowRight: c < B.TAMANHO - 1 ? atual + 1 : null,
      Home: atual - c,
      End: atual - c + B.TAMANHO - 1,
    }[evento.key];
    if (destino === undefined) return;
    evento.preventDefault();
    if (destino !== null) casas[destino].focus();
  }

  const casasPosicao = criarGrade($("#bn-grade-posicao"), true);
  const casasInimigo = criarGrade($("#bn-grade-inimigo"), true);
  const casasMeu = criarGrade($("#bn-grade-meu"), false);

  const descreverCasa = (i, estado) => `Linha ${B.linhaDe(i) + 1}, coluna ${B.colunaDe(i) + 1}: ${ROTULO_CASA[estado]}`;
  const ondeFoi = (i) => `linha ${B.linhaDe(i) + 1}, coluna ${B.colunaDe(i) + 1}`;

  /** Desenha um tabuleiro. No inimigo, os navios intactos aparecem como água até o fim. */
  function pintar(casas, tabuleiro, { mostrarNavios, destaque = null, tocavel = () => false, rotular = true }) {
    casas.forEach((el, i) => {
      let estado = B.estado(tabuleiro, i);
      if (estado === "navio" && !mostrarNavios) estado = "agua";
      el.className = `bn-casa bn-${estado}`;
      // A cor do navio só aparece quando ele está à vista (intacto e mostrado, ou já afundado)
      const navio = estado === "navio" || estado === "afundado" ? B.navioEm(tabuleiro, i) : null;
      if (navio) el.style.setProperty("--cor", B.navio(navio.tipo).cor);
      else el.style.removeProperty("--cor");
      if (i === destaque) el.classList.add("bn-destaque");
      if (rotular) {
        el.setAttribute("aria-label", descreverCasa(i, estado));
        el.setAttribute("aria-disabled", String(!tocavel(i)));
      }
    });
  }

  // ---------- Desenho ----------

  function desenhar() {
    const fase = partida.fase;
    botaoNovo.hidden = !partida.dificuldade;
    telaDificuldade.hidden = !(fase === "posicionando" && !partida.dificuldade);
    telaPosicao.hidden = !(fase === "posicionando" && partida.dificuldade);
    telaBatalha.hidden = fase === "posicionando";
    desenharResumo();
    if (!telaPosicao.hidden) desenharPosicionamento();
    if (!telaBatalha.hidden) desenharBatalha();
    desenharRecordes();
  }

  function desenharResumo() {
    const e = estatisticas;
    if (e.partidas === 0) {
      resumo.textContent = "Posicione sua frota e afunde os navios do computador com o menor número de tiros.";
      return;
    }
    const partes = [`Partidas: ${e.partidas}`, `Vitórias: ${e.vitorias} (${B.taxaVitoria(e)}%)`];
    if (e.melhorJogo > 0) partes.push(`Melhor: ${e.melhorJogo} tiros`);
    resumo.textContent = partes.join(" · ");
  }

  function dicaPosicionamento() {
    if (B.prontaParaComecar(partida)) return "Clique em “Iniciar jogo” para começar. Clique num navio do tabuleiro para mudá-lo de lugar.";
    if (selecionado) {
      const n = B.navio(selecionado);
      return `Clique na casa onde o ${n.nome} (${n.tamanho} casas) deve começar.`;
    }
    return "Escolha um navio da lista e depois clique no tabuleiro.";
  }

  function desenharPosicionamento() {
    const pronta = B.prontaParaComecar(partida);
    posicaoTitulo.textContent = pronta ? "Frota pronta!" : "Posicione seus navios";
    posicaoTexto.textContent = aviso || dicaPosicionamento();
    cartaoPosicao.classList.toggle("bn-alerta", !!aviso);
    seloDificuldade.textContent = NOME_DIFICULDADE[partida.dificuldade];
    seloDificuldade.dataset.dificuldade = partida.dificuldade;

    const postos = B.tiposPosicionados(partida.jogador);
    for (const botao of frota.children) {
      const tipo = botao.dataset.tipo;
      const posto = postos.has(tipo);
      botao.disabled = posto;
      botao.classList.toggle("bn-posto", posto);
      botao.setAttribute("aria-pressed", String(tipo === selecionado));
    }
    for (const b of botoesOrientacao) {
      const ativo = b.dataset.orientacao === partida.orientacao;
      b.classList.toggle("active", ativo);
      b.setAttribute("aria-pressed", String(ativo));
    }
    botaoAleatorio.disabled = pronta;
    botaoIniciar.hidden = !pronta;

    pintar(casasPosicao, partida.jogador, { mostrarNavios: true, tocavel: () => true });
    desenharPrevia();
  }

  /** Mostra onde o navio escolhido ficaria a partir da casa sob o cursor (verde se cabe, vermelho se não). */
  function desenharPrevia() {
    for (const el of casasPosicao) el.classList.remove("bn-previa", "bn-previa-ruim");
    if (previa === null || !selecionado || B.navioEm(partida.jogador, previa)) return;
    const l = B.linhaDe(previa);
    const c = B.colunaDe(previa);
    const tamanho = B.navio(selecionado).tamanho;
    const cabe = !!B.posicionar(partida.jogador, selecionado, l, c, partida.orientacao);
    for (let k = 0; k < tamanho; k++) {
      const pl = partida.orientacao === "horizontal" ? l : l + k;
      const pc = partida.orientacao === "horizontal" ? c + k : c;
      if (pl >= B.TAMANHO || pc >= B.TAMANHO) break;
      const el = casasPosicao[B.casa(pl, pc)];
      el.classList.add(cabe ? "bn-previa" : "bn-previa-ruim");
      el.style.setProperty("--cor-previa", B.navio(selecionado).cor);
    }
  }

  function desenharBatalha() {
    const fim = partida.fase === "fim";
    const podeAtirar = partida.fase === "jogando" && partida.vez === "jogador";
    let titulo;
    let texto;
    if (partida.vencedor === "jogador") [titulo, texto] = ["🎉 Vitória!", "Você afundou todos os navios inimigos."];
    else if (partida.vencedor === "ia") [titulo, texto] = ["😔 Derrota", "Todos os seus navios foram afundados."];
    else if (partida.vez === "jogador") [titulo, texto] = ["Seu turno", "Clique no tabuleiro inimigo para atirar. Acertou? Atire de novo!"];
    else [titulo, texto] = ["Vez do computador…", "Ele está mirando no seu tabuleiro."];
    vezTitulo.textContent = titulo;
    vezTexto.textContent = texto;
    pensando.hidden = !B.vezDaIa(partida);
    textoTiros.textContent = String(B.tiros(partida));
    const afundadosInimigo = B.afundados(partida.inimigo).length;
    textoAfundados.textContent = `${afundadosInimigo}/${B.NAVIOS.length}`;
    botaoNovoFim.hidden = !fim;
    telaBatalha.classList.toggle("bn-vez-ia", B.vezDaIa(partida));

    pintar(casasInimigo, partida.inimigo, {
      // No fim, mostra onde estavam os navios que sobraram
      mostrarNavios: fim,
      tocavel: (i) => podeAtirar && !partida.inimigo.tiros.includes(i),
    });
    pintar(casasMeu, partida.jogador, { mostrarNavios: true, destaque: ultimoTiroIa, rotular: false });
    const perdidos = B.afundados(partida.jogador).length;
    meuResumo.textContent = `: ${perdidos} de ${B.NAVIOS.length} navios afundados, ${partida.jogador.tiros.length} tiros do computador.`;
  }

  function desenharRecordes() {
    for (const aba of abasRecordes) {
      const ativa = aba.dataset.recordes === abaRecordes;
      aba.classList.toggle("active", ativa);
      aba.setAttribute("aria-pressed", String(ativa));
    }
    const lista = recordes[abaRecordes];
    semRecordes.hidden = lista.length > 0;
    listaRecordes.replaceChildren(
      ...lista.map((r) => {
        const item = document.createElement("li");
        const tiros = document.createElement("strong");
        tiros.textContent = `${r.tiros} tiros`;
        const data = document.createElement("span");
        data.textContent = new Date(r.momento).toLocaleDateString("pt-BR");
        item.append(tiros, data);
        return item;
      }),
    );
  }

  function avisar(texto) {
    aviso = texto;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => {
      aviso = null;
      if (!telaPosicao.hidden) desenharPosicionamento();
    }, DURACAO_AVISO_MS);
    desenhar();
  }

  // ---------- Ações ----------

  function atualizar(nova) {
    partida = nova;
    salvarPartida();
    desenhar();
  }

  function escolherDificuldade(chave) {
    atualizar(B.escolherDificuldade(partida, chave));
    selecionado = B.naviosFaltando(partida)[0] || null;
    desenhar();
    frota.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
  }

  function selecionar(tipo) {
    selecionado = selecionado === tipo ? null : tipo;
    desenhar();
  }

  function girar() {
    if (partida.fase !== "posicionando") return;
    atualizar(B.girar(partida));
  }

  /** Clique no próprio tabuleiro: posiciona o navio escolhido ou recolhe um já posicionado. */
  function tocarMeuTabuleiro(i) {
    if (partida.fase !== "posicionando") return;
    const existente = B.navioEm(partida.jogador, i);
    if (existente) {
      selecionado = existente.tipo;
      atualizar(B.removerNavio(partida, existente.tipo));
      return;
    }
    if (!selecionado) {
      avisar("Escolha um navio na lista acima.");
      return;
    }
    const nova = B.posicionarNavio(partida, selecionado, B.linhaDe(i), B.colunaDe(i));
    if (!nova) {
      avisar(`O ${B.navio(selecionado).nome} não cabe nessa posição.`);
      return;
    }
    selecionado = B.naviosFaltando(nova)[0] || null;
    aviso = null;
    atualizar(nova);
    if (B.prontaParaComecar(partida)) botaoIniciar.focus({ preventScroll: true });
  }

  function posicionarRestantes() {
    const nova = B.posicionarRestantes(partida);
    if (!nova) {
      avisar("Não há espaço para os navios que faltam.");
      return;
    }
    selecionado = null;
    atualizar(nova);
    botaoIniciar.focus({ preventScroll: true });
  }

  function iniciar() {
    const nova = B.iniciar(partida);
    if (!nova) return;
    ultimoTiroIa = null;
    ultimo.textContent = "";
    atualizar(nova);
    casasInimigo.find((c) => c.tabIndex === 0)?.focus({ preventScroll: true });
  }

  function atirar(i) {
    const jogada = B.atirarJogador(partida, i);
    if (!jogada) return;
    const { tiro } = jogada;
    let resultado = "água.";
    if (tiro.afundou) resultado = `afundou o ${B.navio(tiro.atingido).nome}!`;
    else if (tiro.atingido) resultado = "acertou um navio! Atire de novo.";
    ultimo.textContent = `Seu tiro na ${ondeFoi(i)}: ${resultado}`;
    aplicar(jogada);
    if (B.vezDaIa(partida)) agendarIa();
  }

  /** O computador pensa um pouco antes de cada tiro e continua enquanto acertar. */
  function agendarIa() {
    if (turnoIa) return;
    turnoIa = setTimeout(() => {
      turnoIa = null;
      const jogada = B.jogadaIa(partida);
      if (!jogada) return;
      const { tiro } = jogada;
      ultimoTiroIa = tiro.posicao;
      let resultado = "água.";
      if (tiro.afundou) resultado = `afundou seu ${B.navio(tiro.atingido).nome}.`;
      else if (tiro.atingido) resultado = `acertou seu ${B.navio(tiro.atingido).nome}.`;
      ultimo.textContent = `O computador atirou na ${ondeFoi(tiro.posicao)}: ${resultado}`;
      aplicar(jogada);
      if (B.vezDaIa(partida)) agendarIa();
    }, ESPERA_IA_MS);
  }

  function aplicar(jogada) {
    atualizar(jogada.partida);
    if (jogada.partida.fase === "fim") terminar();
  }

  function terminar() {
    const venceu = partida.vencedor === "jogador";
    const n = B.tiros(partida);
    estatisticas = B.registrarEstatistica(estatisticas, venceu, n);
    gravar(CHAVE_ESTATISTICAS, JSON.stringify(estatisticas));
    let registro = null;
    if (venceu && partida.dificuldade) {
      registro = B.inserirRecorde(recordes[partida.dificuldade], { tiros: n, momento: Date.now() });
      if (registro.posicao !== null) {
        recordes = { ...recordes, [partida.dificuldade]: registro.lista };
        gravar(CHAVE_RECORDES, JSON.stringify(recordes));
      }
      abaRecordes = partida.dificuldade;
    }
    desenhar();
    mostrarFim(venceu, n, registro);
  }

  function novoJogo() {
    clearTimeout(turnoIa);
    turnoIa = null;
    clearTimeout(temporizadorAviso);
    aviso = null;
    selecionado = null;
    ultimoTiroIa = null;
    previa = null;
    ultimo.textContent = "";
    fecharDialogo();
    atualizar(B.novaPartida());
    telaDificuldade.querySelector("button")?.focus({ preventScroll: true });
  }

  // ---------- Diálogos ----------

  function botao(rotulo, acao, secundario) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = secundario ? "button secondary" : "button";
    el.textContent = rotulo;
    el.addEventListener("click", acao);
    return el;
  }

  function abrirDialogo({ icone, titulo, corpo, botoes }) {
    dialogoIcone.textContent = icone;
    dialogoTitulo.textContent = titulo;
    dialogoCorpo.replaceChildren(...corpo);
    dialogoBotoes.replaceChildren(...botoes.map((b) => botao(b.rotulo, b.acao, b.secundario)));
    // Abre no mesmo clique do último tiro: os botões ignoram cliques logo em seguida
    dialogo.classList.add("bn-travado");
    setTimeout(() => dialogo.classList.remove("bn-travado"), 600);
    if (typeof dialogo.showModal === "function") {
      if (!dialogo.open) dialogo.showModal();
    } else {
      dialogo.setAttribute("open", "");
    }
    dialogoBotoes.firstElementChild?.focus();
  }

  function fecharDialogo() {
    if (!dialogo.open) return;
    if (typeof dialogo.close === "function") dialogo.close();
    else dialogo.removeAttribute("open");
  }

  function paragrafo(texto, classe) {
    const p = document.createElement("p");
    p.textContent = texto;
    if (classe) p.className = classe;
    return p;
  }

  function mostrarFim(venceu, n, registro) {
    const caixa = document.createElement("div");
    caixa.className = "bn-dialogo-tiros";
    caixa.append(paragrafo("Tiros disparados"), paragrafo(String(n), "bn-dialogo-numero"));
    const corpo = [
      paragrafo(venceu ? "Você afundou todos os navios inimigos!" : "Todos os seus navios foram afundados. Tente novamente!"),
      caixa,
    ];
    const nivel = partida.dificuldade ? ` (${NOME_DIFICULDADE[partida.dificuldade]})` : "";
    if (registro?.novoRecorde) corpo.push(paragrafo(`🏆 Novo recorde${nivel}!`, "bn-selo-recorde"));
    else if (registro?.posicao) corpo.push(paragrafo(`${registro.posicao}º lugar nos seus recordes${nivel}`, "bn-posicao-recorde"));
    abrirDialogo({
      icone: venceu ? "🎉" : "😔",
      titulo: venceu ? "Vitória!" : "Derrota",
      corpo,
      botoes: [
        { rotulo: "Novo jogo", acao: novoJogo },
        { rotulo: "Ver tabuleiros", acao: () => { fecharDialogo(); botaoNovoFim.focus({ preventScroll: true }); }, secundario: true },
      ],
    });
    dialogoTitulo.classList.toggle("bn-venceu", venceu);
  }

  function pedirNovoJogo() {
    if (!B.emAndamento(partida)) {
      novoJogo();
      return;
    }
    abrirDialogo({
      icone: "⚓",
      titulo: "Novo jogo",
      corpo: [paragrafo("Tem certeza que deseja iniciar um novo jogo? O progresso atual será perdido.")],
      botoes: [
        { rotulo: "Novo jogo", acao: novoJogo },
        { rotulo: "Cancelar", acao: () => { fecharDialogo(); botaoNovo.focus({ preventScroll: true }); }, secundario: true },
      ],
    });
  }

  // ---------- Controles ----------

  for (const navio of B.NAVIOS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bn-escolha";
    b.dataset.tipo = navio.tipo;
    b.style.setProperty("--cor", navio.cor);
    const nome = document.createElement("span");
    nome.className = "bn-escolha-nome";
    nome.textContent = navio.nome;
    const desenho = document.createElement("span");
    desenho.className = "bn-escolha-desenho";
    desenho.setAttribute("aria-hidden", "true");
    for (let k = 0; k < navio.tamanho; k++) desenho.append(document.createElement("i"));
    const casas = document.createElement("span");
    casas.className = "sr-only";
    casas.textContent = `, ${navio.tamanho} casas`;
    const posto = document.createElement("span");
    posto.className = "bn-escolha-posto";
    posto.textContent = "✓";
    posto.title = "Posicionado";
    b.append(nome, casas, desenho, posto);
    b.addEventListener("click", () => selecionar(navio.tipo));
    frota.append(b);
  }

  telaDificuldade.querySelectorAll("[data-dificuldade]").forEach((b) => {
    b.addEventListener("click", () => escolherDificuldade(b.dataset.dificuldade));
  });

  botoesOrientacao.forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.orientacao !== partida.orientacao) girar();
    }),
  );
  botaoAleatorio.addEventListener("click", posicionarRestantes);
  botaoIniciar.addEventListener("click", iniciar);
  botaoNovo.addEventListener("click", pedirNovoJogo);
  botaoNovoFim.addEventListener("click", novoJogo);

  casasPosicao.forEach((el, i) => {
    el.addEventListener("click", () => tocarMeuTabuleiro(i));
    el.addEventListener("pointerenter", () => {
      previa = i;
      desenharPrevia();
    });
    el.addEventListener("focus", () => {
      previa = i;
      desenharPrevia();
    });
  });
  $("#bn-grade-posicao").addEventListener("pointerleave", () => {
    previa = null;
    desenharPrevia();
  });

  casasInimigo.forEach((el, i) => el.addEventListener("click", () => atirar(i)));

  abasRecordes.forEach((aba) =>
    aba.addEventListener("click", () => {
      abaRecordes = aba.dataset.recordes;
      gravar(CHAVE_ABA, abaRecordes);
      desenharRecordes();
    }),
  );

  document.addEventListener("keydown", (evento) => {
    if (evento.altKey || evento.ctrlKey || evento.metaKey || dialogo.open) return;
    if (evento.target.closest?.("input, textarea, select, [contenteditable]")) return;
    const focoLivre = document.activeElement === document.body || telaPosicao.contains(document.activeElement);
    if ((evento.key === "r" || evento.key === "R") && !telaPosicao.hidden && focoLivre) {
      evento.preventDefault();
      girar();
    }
  });

  // ---------- Início ----------

  estatisticas = B.lerEstatisticas(ler(CHAVE_ESTATISTICAS));
  recordes = B.lerRecordes(ler(CHAVE_RECORDES));
  const aba = ler(CHAVE_ABA);
  if (aba && recordes[aba]) abaRecordes = aba;
  // Partida terminada não volta: começa outra
  const salva = B.lerPartida(ler(CHAVE_PARTIDA));
  partida = salva && salva.fase !== "fim" ? salva : B.novaPartida();
  selecionado = B.naviosFaltando(partida)[0] || null;
  salvarPartida();
  desenhar();
  if (B.vezDaIa(partida)) agendarIa();
})();
