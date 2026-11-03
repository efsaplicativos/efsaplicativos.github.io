"use strict";
/* Batalha Naval: telas e turnos como no app em React Native (src/app/difficultyScreen.tsx,
   src/app/gameScreen.tsx, src/components/ e src/hooks/useBattleshipGame.ts). As regras e o
   computador estão em batalha-naval-logica.js. */
(() => {
  const raiz = document.querySelector("#bnaval");
  if (!raiz) return;
  const L = LogicaBatalhaNaval;
  const $ = (id) => document.getElementById(id);

  const CHAVE_ESTATISTICAS = "efs-batalha-naval-placar";
  const CHAVE_SOM = "efs-batalha-naval-som";
  // Dados da versão anterior desta página, que não servem mais
  const CHAVES_ANTIGAS = [
    "efs-batalha-naval-partida",
    "efs-batalha-naval-estatisticas",
    "efs-batalha-naval-recordes",
    "efs-batalha-naval-aba-recordes",
  ];
  const NOMES_DIFICULDADE = { facil: "Fácil", medio: "Médio", dificil: "Difícil" };
  const SONS = {
    agua: "/assets/jogos/batalha-naval/agua.wav",
    bomba: "/assets/jogos/batalha-naval/bomba.wav",
    vitoria: "/assets/jogos/batalha-naval/vitoria.mp3",
  };
  // Tempos do app: o resultado do tiro fica 1,5 s na tela antes de a vez passar, e o
  // computador espera 1 s antes de cada tiro
  const MOSTRAR_TIRO = 1500;
  const ESPERA_COMPUTADOR = 1000;

  const el = {
    telaDificuldade: $("bn-tela-dificuldade"),
    telaJogo: $("bn-tela-jogo"),
    dificuldade: $("bn-dificuldade"),
    trocar: $("bn-trocar"),
    som: $("bn-som"),
    vez: $("bn-vez"),
    tiros: $("bn-tiros"),
    corpo: $("bn-corpo"),
    seletor: $("bn-seletor"),
    frota: $("bn-frota"),
    orientacao: $("bn-orientacao"),
    girar: $("bn-girar"),
    iniciar: $("bn-iniciar"),
    rotulo: $("bn-rotulo"),
    grade: $("bn-grade"),
    novo: $("bn-novo"),
    instrucoes: $("bn-instrucoes"),
    aviso: $("bn-aviso"),
    apagar: $("bn-apagar"),
    dialogo: $("bn-dialogo"),
    dialogoTitulo: $("bn-dialogo-titulo"),
    dialogoTexto: $("bn-dialogo-texto"),
    dialogoNumero: $("bn-dialogo-numero"),
    dialogoTiros: $("bn-dialogo-tiros"),
    dialogoBotoes: $("bn-dialogo-botoes"),
  };

  // ---- Navegador ----
  function ler(chave) {
    try {
      return localStorage.getItem(chave);
    } catch (e) {
      return null;
    }
  }
  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, valor);
    } catch (e) {
      /* sem armazenamento: o jogo segue sem guardar */
    }
  }
  function apagarChave(chave) {
    try {
      localStorage.removeItem(chave);
    } catch (e) {
      /* idem */
    }
  }
  CHAVES_ANTIGAS.forEach(apagarChave);

  let estatisticas = (() => {
    try {
      return L.lerEstatisticas(JSON.parse(ler(CHAVE_ESTATISTICAS)));
    } catch (e) {
      return L.estatisticasVazias();
    }
  })();
  let somLigado = ler(CHAVE_SOM) !== "0";

  // ---- Sons (audioService) ----
  const audios = {};
  function prepararSons() {
    if (!somLigado) return;
    for (const nome of Object.keys(SONS)) {
      if (audios[nome]) continue;
      try {
        const audio = new Audio(SONS[nome]);
        audio.preload = "auto";
        audio.volume = 0.8;
        audios[nome] = audio;
      } catch (e) {
        /* navegador sem áudio */
      }
    }
  }
  function tocar(nome) {
    if (!somLigado) return;
    prepararSons();
    const audio = audios[nome];
    if (!audio) return;
    try {
      audio.currentTime = 0;
      const tocando = audio.play();
      if (tocando && tocando.catch) tocando.catch(() => {});
    } catch (e) {
      /* som silencioso em caso de erro, como no app */
    }
  }

  // ---- Estado da partida (useBattleshipGame) ----
  let dificuldade = null;
  let fase = "posicionamento"; // "posicionamento", "batalha" ou "fim"
  let vez = "jogador";
  let jogador;
  let computador;
  let caca;
  let tiros = 0;
  let vencedor = null;
  let orientacao = "horizontal";
  let selecionado = null;
  // Enquanto o resultado do tiro do jogador fica na tela, novos tiros são ignorados
  let bloqueado = false;
  let ultimoTiro = null; // { lado: "jogador" | "computador", casa }
  let mensagem = null; // aviso que troca a instrução até o próximo clique
  let foco = L.casa(0, 0);
  let timers = [];

  function agendar(fn, ms) {
    const id = setTimeout(() => {
      timers = timers.filter((t) => t !== id);
      fn();
    }, ms);
    timers.push(id);
  }
  function cancelarTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  const frotaCompleta = () => L.ORDEM.every((tipo) => jogador.navios.some((n) => n.tipo === tipo));
  const emAndamento = () => fase !== "fim" && (jogador.navios.length > 0 || tiros > 0);

  function novaPartida() {
    cancelarTimers();
    fecharDialogo();
    jogador = L.tabuleiroVazio();
    computador = L.tabuleiroAleatorio();
    caca = L.cacaInicial();
    fase = "posicionamento";
    vez = "jogador";
    tiros = 0;
    vencedor = null;
    orientacao = "horizontal";
    selecionado = null;
    bloqueado = false;
    ultimoTiro = null;
    mensagem = null;
    foco = L.casa(0, 0);
    desenhar();
  }

  function escolherDificuldade(nivel) {
    dificuldade = nivel;
    novaPartida();
    trazerParaVista();
    const primeiro = el.frota.querySelector(".bn-item:not(:disabled)");
    if (primeiro) primeiro.focus({ preventScroll: true });
  }

  function voltarParaDificuldade() {
    cancelarTimers();
    dificuldade = null;
    desenhar();
    trazerParaVista();
    raiz.querySelector(".bn-nivel").focus({ preventScroll: true });
  }

  // ---- Posicionamento ----
  function selecionar(tipo) {
    if (fase !== "posicionamento" || jogador.navios.some((n) => n.tipo === tipo)) return;
    selecionado = tipo;
    mensagem = null;
    desenhar();
  }

  function girar() {
    orientacao = orientacao === "horizontal" ? "vertical" : "horizontal";
    desenhar();
  }

  function colocar(p) {
    if (!selecionado) {
      mensagem = "Escolha primeiro um navio na lista.";
      desenhar();
      return;
    }
    const posicoes = L.posicoesDoNavio(p, selecionado, orientacao);
    if (!L.podePosicionar(jogador, posicoes)) {
      mensagem = "O navio não cabe aí. Escolha outra casa ou mude a orientação.";
      desenhar();
      return;
    }
    jogador = L.posicionar(jogador, selecionado, posicoes);
    avisar(`${L.NAVIOS[selecionado].nome} posicionado em ${L.nomeCasa(p)}.`);
    selecionado = null;
    mensagem = null;
    desenhar();
    // Sem navio escolhido, o foco volta para a lista (ou para o botão de iniciar)
    const proximo = frotaCompleta() ? el.iniciar : el.frota.querySelector(".bn-item:not(:disabled)");
    if (proximo && raiz.contains(document.activeElement)) proximo.focus({ preventScroll: true });
  }

  function iniciar() {
    if (fase !== "posicionamento" || !frotaCompleta()) return;
    fase = "batalha";
    vez = "jogador";
    prepararSons();
    desenhar();
    trazerParaVista();
    casaEm(foco).focus({ preventScroll: true });
  }

  // ---- Tiros ----
  function textoDoTiro(quem, r, p) {
    const nome = r.tipo ? L.NAVIOS[r.tipo].nome : "";
    if (quem === "jogador") {
      if (r.afundou) return `Você afundou o ${nome}!`;
      return r.acerto ? `Acertou em ${L.nomeCasa(p)}! Atire de novo.` : `Água em ${L.nomeCasa(p)}.`;
    }
    if (r.afundou) return `O adversário afundou seu ${nome}.`;
    return r.acerto
      ? `O adversário acertou seu ${nome} em ${L.nomeCasa(p)}.`
      : `O adversário atirou em ${L.nomeCasa(p)} e errou.`;
  }

  function atirar(p) {
    if (fase !== "batalha" || vez !== "jogador" || bloqueado || L.atacada(computador, p)) return;
    const r = L.atacar(computador, p);
    computador = r.tabuleiro;
    tiros++;
    ultimoTiro = { lado: "computador", casa: p };
    tocar(r.acerto ? "bomba" : "agua");
    avisar(textoDoTiro("jogador", r, p));
    if (L.todosAfundados(computador)) {
      terminar("jogador");
      return;
    }
    if (!r.acerto) {
      // Mostra onde o tiro caiu e só depois passa a vez
      bloqueado = true;
      agendar(() => {
        bloqueado = false;
        vez = "computador";
        desenhar();
        agendar(vezDoComputador, ESPERA_COMPUTADOR);
      }, MOSTRAR_TIRO);
    }
    desenhar();
  }

  function vezDoComputador() {
    if (fase !== "batalha" || vez !== "computador") return;
    const alvo = L.jogadaComputador(jogador, caca, dificuldade);
    const r = L.atacar(jogador, alvo);
    jogador = r.tabuleiro;
    caca = L.depoisDaJogada(caca, alvo, r);
    ultimoTiro = { lado: "jogador", casa: alvo };
    tocar(r.acerto ? "bomba" : "agua");
    avisar(textoDoTiro("computador", r, alvo));
    if (L.todosAfundados(jogador)) {
      terminar("computador");
      return;
    }
    desenhar();
    // Acertou: ele atira de novo. Errou: a vez volta depois de mostrar o tiro
    if (r.acerto) agendar(vezDoComputador, ESPERA_COMPUTADOR);
    else {
      agendar(() => {
        vez = "jogador";
        desenhar();
        if (raiz.contains(document.activeElement)) casaEm(foco).focus({ preventScroll: true });
      }, MOSTRAR_TIRO);
    }
  }

  function terminar(quemVenceu) {
    cancelarTimers();
    fase = "fim";
    vencedor = quemVenceu;
    bloqueado = false;
    const venceu = quemVenceu === "jogador";
    if (venceu) tocar("vitoria");
    estatisticas = L.registrarPartida(estatisticas, venceu, tiros);
    gravar(CHAVE_ESTATISTICAS, JSON.stringify(estatisticas));
    desenhar();
    desenharEstatisticas();
    // Um instante para ver o último tiro antes do aviso de fim
    agendar(() => {
      abrirDialogo({
        titulo: venceu ? "🎉 Vitória!" : "😔 Derrota",
        classe: venceu ? "bn-venceu" : "bn-perdeu",
        texto: venceu ? "Você afundou todos os navios inimigos!" : "Todos os seus navios foram afundados!",
        tiros,
        botoes: [
          { texto: "Novo jogo", classe: venceu ? "bn-botao-vitoria" : "bn-botao-derrota", acao: novaPartida },
          { texto: "Fechar", classe: "secondary" },
        ],
      });
    }, 700);
  }

  // ---- Diálogo ----
  function abrirDialogo({ titulo, classe = "", texto, tiros: numero = null, botoes }) {
    el.dialogoTitulo.textContent = titulo;
    el.dialogoTitulo.className = `bn-dialogo-titulo ${classe}`.trim();
    el.dialogoTexto.textContent = texto;
    el.dialogoNumero.hidden = numero === null;
    if (numero !== null) el.dialogoTiros.textContent = String(numero);
    el.dialogoBotoes.replaceChildren(
      ...botoes.map(({ texto: rotulo, classe: estilo = "", acao }) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = `button ${estilo}`.trim();
        botao.textContent = rotulo;
        botao.addEventListener("click", () => {
          fecharDialogo();
          if (acao) acao();
        });
        return botao;
      }),
    );
    if (typeof el.dialogo.showModal === "function") {
      if (!el.dialogo.open) el.dialogo.showModal();
    } else {
      el.dialogo.setAttribute("open", "");
    }
    el.dialogoBotoes.querySelector("button").focus();
  }
  function fecharDialogo() {
    if (!el.dialogo.open) return;
    if (typeof el.dialogo.close === "function") el.dialogo.close();
    else el.dialogo.removeAttribute("open");
  }
  function confirmar(titulo, texto, rotulo, acao) {
    abrirDialogo({
      titulo,
      texto,
      botoes: [{ texto: "Cancelar", classe: "secondary" }, { texto: rotulo, acao }],
    });
  }

  // ---- Desenho ----
  function avisar(texto) {
    el.aviso.textContent = texto;
  }

  // Leva o placar para a tela quando o conteúdo acima muda de altura
  function trazerParaVista() {
    const alvo = dificuldade ? el.telaJogo : el.telaDificuldade;
    const topo = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 72;
    const caixa = alvo.getBoundingClientRect();
    if (caixa.top < topo || caixa.top > window.innerHeight * 0.6) {
      window.scrollTo({ top: window.scrollY + caixa.top - topo - 12, behavior: "smooth" });
    }
  }

  // Lista de navios: criada uma vez, só o estado muda
  const itens = {};
  for (const tipo of L.ORDEM) {
    const navio = L.NAVIOS[tipo];
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "bn-item";
    botao.dataset.navio = tipo;
    const previa = document.createElement("span");
    previa.className = "bn-previa";
    previa.style.setProperty("--cor", navio.cor);
    const desenho = document.createElement("span");
    desenho.className = `bn-previa-navio bn-img-${tipo}`;
    previa.append(desenho);
    const textos = document.createElement("span");
    textos.className = "bn-item-textos";
    const nome = document.createElement("span");
    nome.className = "bn-item-nome";
    nome.textContent = navio.nome;
    const info = document.createElement("span");
    info.className = "bn-item-info";
    info.textContent = `Tamanho: ${navio.tamanho}`;
    const ok = document.createElement("span");
    ok.className = "bn-item-ok";
    ok.textContent = "✓ Posicionado";
    textos.append(nome, info, ok);
    botao.append(previa, textos);
    botao.addEventListener("click", () => selecionar(tipo));
    el.frota.append(botao);
    itens[tipo] = { botao, ok };
  }

  // Tabuleiro: 100 botões criados uma vez; o foco anda com as setas (um só fica na ordem do Tab)
  const casas = [];
  for (let l = 0; l < L.TAMANHO; l++) {
    for (let c = 0; c < L.TAMANHO; c++) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "bn-casa";
      botao.dataset.linha = String(l);
      botao.dataset.coluna = String(c);
      botao.tabIndex = -1;
      el.grade.append(botao);
      casas.push(botao);
    }
  }
  const casaEm = (p) => casas[p.linha * L.TAMANHO + p.coluna];
  const posicaoDe = (botao) => L.casa(Number(botao.dataset.linha), Number(botao.dataset.coluna));

  // Pedaço i do desenho do navio, girado quando ele está na vertical
  function fatia(tab, tipo, p) {
    const navio = tab.navios.find((n) => n.tipo === tipo);
    const indice = navio.posicoes.findIndex((q) => q.linha === p.linha && q.coluna === p.coluna);
    const vertical = navio.posicoes.every((q) => q.coluna === navio.posicoes[0].coluna);
    const span = document.createElement("span");
    span.className = `bn-fatia bn-img-${tipo}${vertical ? " bn-vertical" : ""}`;
    span.style.setProperty("--i", String(indice));
    return span;
  }

  function desenharGrade(tab, doJogador, clicavel) {
    el.grade.classList.toggle("bn-clicavel", clicavel);
    const lado = doJogador ? "jogador" : "computador";
    for (let l = 0; l < L.TAMANHO; l++) {
      for (let c = 0; c < L.TAMANHO; c++) {
        const p = L.casa(l, c);
        const cel = tab.grade[l][c];
        const botao = casaEm(p);
        // No tabuleiro inimigo, casa que não levou tiro é sempre água
        const estado = doJogador || cel.revelada ? cel.estado : "agua";
        const nomeNavio = cel.navio ? L.NAVIOS[cel.navio].nome : "";
        let descricao = doJogador ? "água" : "não atacada";
        botao.replaceChildren();
        if (estado === "navio") {
          botao.append(fatia(tab, cel.navio, p));
          descricao = `seu ${nomeNavio}`;
        } else if (estado === "afundado") {
          botao.append(fatia(tab, cel.navio, p));
          descricao = `${nomeNavio} afundado`;
        } else if (estado === "acerto") {
          botao.textContent = "💥";
          descricao = doJogador ? `seu ${nomeNavio} atingido` : "acerto";
        } else if (estado === "erro") {
          botao.textContent = "💧";
          descricao = "água, já atacada";
        }
        botao.className = `bn-casa${estado === "agua" ? "" : ` bn-${estado}`}`;
        if (ultimoTiro && ultimoTiro.lado === lado && ultimoTiro.casa.linha === l && ultimoTiro.casa.coluna === c) {
          botao.classList.add("bn-ultimo");
        }
        const desativada = !clicavel || (!doJogador && cel.revelada);
        botao.setAttribute("aria-disabled", desativada ? "true" : "false");
        botao.setAttribute("aria-label", `${L.nomeCasa(p)}: ${descricao}`);
        botao.tabIndex = l === foco.linha && c === foco.coluna ? 0 : -1;
      }
    }
  }

  function limparPrevia() {
    for (const botao of casas) botao.classList.remove("bn-previa-ok", "bn-previa-erro");
  }
  function mostrarPrevia(p) {
    limparPrevia();
    if (fase !== "posicionamento" || !selecionado) return;
    const posicoes = L.posicoesDoNavio(p, selecionado, orientacao);
    const cabe = L.podePosicionar(jogador, posicoes);
    for (const q of posicoes) {
      if (L.dentro(q)) casaEm(q).classList.add(cabe ? "bn-previa-ok" : "bn-previa-erro");
    }
  }

  function textoDasInstrucoes() {
    if (mensagem) return mensagem;
    if (fase === "posicionamento") {
      return frotaCompleta()
        ? "Toque em Iniciar jogo para começar."
        : "Toque em um navio, escolha entre horizontal e vertical e depois toque no tabuleiro para posicioná-lo.";
    }
    if (fase === "batalha") {
      return vez === "jogador"
        ? "Este é o tabuleiro do adversário: toque em uma casa para atacar."
        : "Este é o seu tabuleiro: veja onde o adversário atacou seus navios.";
    }
    return vencedor === "jogador"
      ? "Você afundou todos os navios inimigos! Toque em Novo jogo para jogar de novo."
      : "Todos os seus navios foram afundados. Toque em Novo jogo para tentar de novo.";
  }

  function desenhar() {
    el.telaDificuldade.hidden = dificuldade !== null;
    el.telaJogo.hidden = dificuldade === null;
    if (!dificuldade) return;

    el.dificuldade.textContent = NOMES_DIFICULDADE[dificuldade];
    el.tiros.textContent = String(tiros);
    if (fase === "posicionamento") el.vez.textContent = "Posicione seus navios";
    else if (fase === "batalha") el.vez.textContent = vez === "jogador" ? "Sua vez" : "Vez do adversário";
    else el.vez.textContent = vencedor === "jogador" ? "Vitória!" : "Derrota";
    el.vez.classList.toggle("bn-vez-adversario", fase === "batalha" && vez === "computador");

    const posicionando = fase === "posicionamento";
    el.seletor.hidden = !posicionando;
    el.corpo.classList.toggle("bn-com-seletor", posicionando);
    for (const tipo of L.ORDEM) {
      const colocado = jogador.navios.some((n) => n.tipo === tipo);
      const { botao, ok } = itens[tipo];
      botao.disabled = colocado;
      botao.classList.toggle("bn-colocado", colocado);
      botao.setAttribute("aria-pressed", String(selecionado === tipo));
      ok.hidden = !colocado;
    }
    el.orientacao.hidden = !selecionado;
    el.girar.textContent = orientacao === "horizontal" ? "↔️ Horizontal" : "↕️ Vertical";
    el.iniciar.hidden = !(posicionando && frotaCompleta());

    // Na vez do jogador aparece o tabuleiro inimigo; na do computador, o do jogador
    const inimigo = (fase === "batalha" && vez === "jogador") || (fase === "fim" && vencedor === "jogador");
    el.rotulo.textContent = inimigo ? "Tabuleiro inimigo" : "Seu tabuleiro";
    const clicavel = posicionando || (fase === "batalha" && vez === "jogador" && !bloqueado);
    desenharGrade(inimigo ? computador : jogador, !inimigo, clicavel);
    limparPrevia();

    el.instrucoes.textContent = textoDasInstrucoes();
    el.instrucoes.classList.toggle("bn-alerta", Boolean(mensagem));
  }

  function desenharEstatisticas() {
    const e = estatisticas;
    $("bn-est-partidas").textContent = String(e.partidas);
    $("bn-est-vitorias").textContent = String(e.vitorias);
    $("bn-est-derrotas").textContent = String(e.derrotas);
    $("bn-est-aproveitamento").textContent = `${Math.round(L.aproveitamento(e) * 100)}%`;
    $("bn-est-media").textContent = e.partidas ? String(e.mediaTiros) : "–";
    $("bn-est-melhor").textContent = e.melhor ? `${e.melhor} tiros` : "–";
    el.apagar.disabled = e.partidas === 0;
  }

  function desenharSom() {
    el.som.setAttribute("aria-pressed", String(somLigado));
    el.som.setAttribute("aria-label", somLigado ? "Som ligado" : "Som desligado");
    el.som.title = somLigado ? "Som ligado" : "Som desligado";
    el.som.firstElementChild.textContent = somLigado ? "🔊" : "🔇";
  }

  // ---- Eventos ----
  raiz.querySelectorAll(".bn-nivel").forEach((botao) => {
    botao.addEventListener("click", () => escolherDificuldade(botao.dataset.dificuldade));
  });
  el.girar.addEventListener("click", girar);
  el.iniciar.addEventListener("click", iniciar);
  el.novo.addEventListener("click", () => {
    if (!emAndamento()) {
      novaPartida();
      return;
    }
    confirmar("Novo jogo", "Tem certeza que deseja iniciar um novo jogo? O progresso atual será perdido.", "Novo jogo", novaPartida);
  });
  el.trocar.addEventListener("click", () => {
    if (!emAndamento()) {
      voltarParaDificuldade();
      return;
    }
    confirmar("Trocar dificuldade", "A partida atual será perdida. Deseja escolher outra dificuldade?", "Trocar", voltarParaDificuldade);
  });
  el.som.addEventListener("click", () => {
    somLigado = !somLigado;
    gravar(CHAVE_SOM, somLigado ? "1" : "0");
    desenharSom();
    if (somLigado) tocar("agua");
  });
  el.apagar.addEventListener("click", () => {
    confirmar(
      "Apagar estatísticas",
      "Tem certeza que deseja apagar todas as estatísticas salvas? Esta ação não pode ser desfeita.",
      "Apagar",
      () => {
        estatisticas = L.estatisticasVazias();
        apagarChave(CHAVE_ESTATISTICAS);
        desenharEstatisticas();
      },
    );
  });

  el.grade.addEventListener("click", (evento) => {
    const botao = evento.target.closest(".bn-casa");
    if (!botao || botao.getAttribute("aria-disabled") === "true") return;
    const p = posicaoDe(botao);
    foco = p;
    if (fase === "posicionamento") colocar(p);
    else if (fase === "batalha") atirar(p);
  });
  el.grade.addEventListener("pointerover", (evento) => {
    const botao = evento.target.closest(".bn-casa");
    if (botao && evento.pointerType === "mouse") mostrarPrevia(posicaoDe(botao));
  });
  el.grade.addEventListener("pointerleave", limparPrevia);
  el.grade.addEventListener("focusin", (evento) => {
    const botao = evento.target.closest(".bn-casa");
    if (!botao) return;
    foco = posicaoDe(botao);
    for (const outra of casas) outra.tabIndex = outra === botao ? 0 : -1;
    mostrarPrevia(foco);
  });
  el.grade.addEventListener("focusout", (evento) => {
    if (!el.grade.contains(evento.relatedTarget)) limparPrevia();
  });
  el.grade.addEventListener("keydown", (evento) => {
    const passo = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[evento.key];
    if (!passo) return;
    evento.preventDefault();
    const destino = L.casa(foco.linha + passo[0], foco.coluna + passo[1]);
    if (L.dentro(destino)) casaEm(destino).focus();
  });
  // R gira o navio durante o posicionamento
  raiz.addEventListener("keydown", (evento) => {
    if ((evento.key === "r" || evento.key === "R") && !evento.ctrlKey && !evento.metaKey && !evento.altKey
      && fase === "posicionamento" && dificuldade && !el.dialogo.open) {
      evento.preventDefault();
      girar();
      if (el.grade.contains(document.activeElement)) mostrarPrevia(foco);
    }
  });

  desenharSom();
  desenharEstatisticas();
  desenhar();
})();
