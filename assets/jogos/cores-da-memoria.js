"use strict";
/*
 * Interface do Cores da Memória. Regras em cores-da-memoria-logica.js; os tempos e o roteiro de
 * cada rodada seguem ui/telas/jogo/JogoViewModel.kt do app (com.emerson1981.coresmemoria).
 * Toda espera roda numa "tarefa" que é cancelada ao pausar, trocar de nível ou recomeçar, para
 * nenhum som ou vida perdida acontecer fora de hora. Os sons são sintetizados com Web Audio e o
 * AudioContext só é criado depois do primeiro clique ou tecla.
 */
(() => {
  const raiz = document.querySelector(".jogo-cores");
  if (!raiz || typeof LogicaCores !== "object") return;
  const C = LogicaCores;
  const F = C.FASES;
  const R = C.RESULTADOS;

  const CHAVE_PARTIDA = "efs-cores-da-memoria-partida";
  const CHAVE_RECORDES = "efs-cores-da-memoria-recordes";
  const CHAVE_NIVEL = "efs-cores-da-memoria-nivel";
  const CHAVE_SOM = "efs-cores-da-memoria-som";

  // Tempos do JogoViewModel.kt
  const ESPERA_OBSERVE_MS = 500;
  const ESPERA_RETOMAR_MS = 800;
  const DURACAO_ACESO_MS = 400;
  const ESPERA_APOS_SEQUENCIA_MS = 300;
  const DURACAO_BRILHO_TOQUE_MS = 200;
  const ATRASO_SOM_ACERTO_MS = 250;
  const FEEDBACK_ACERTO_MS = 800;
  const FEEDBACK_ERRO_MS = 600;
  const AVISO_VIDA_PERDIDA_MS = 1000;
  const ESPERA_TELA_FIM_MS = 500;
  const TRAVA_DIALOGO_MS = 500;

  const tabuleiro = raiz.querySelector("#cr-tabuleiro");
  const pads = [...tabuleiro.querySelectorAll(".cr-pad")];
  const textoPontos = raiz.querySelector("#cr-pontos");
  const textoRodada = raiz.querySelector("#cr-rodada");
  const textoRecorde = raiz.querySelector("#cr-recorde");
  const vidasEl = raiz.querySelector("#cr-vidas");
  const comboEl = raiz.querySelector("#cr-combo");
  const botaoSom = raiz.querySelector("#cr-som");
  const mensagem = raiz.querySelector("#cr-mensagem");
  const barra = raiz.querySelector("#cr-barra");
  const botaoIniciar = raiz.querySelector("#cr-iniciar");
  const botaoContinuar = raiz.querySelector("#cr-continuar");
  const botaoPausar = raiz.querySelector("#cr-pausar");
  const botoesNivel = [...raiz.querySelectorAll("[data-nivel]")];
  const status = raiz.querySelector("#cr-status");
  const recordesNivel = raiz.querySelector("#cr-recordes-nivel");
  const recordesLista = raiz.querySelector("#cr-recordes-lista");
  const recordesVazio = raiz.querySelector("#cr-recordes-vazio");
  const dialogo = raiz.querySelector("#cr-dialogo");
  const dialogoTitulo = raiz.querySelector("#cr-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#cr-dialogo-texto");
  const dialogoDados = raiz.querySelector("#cr-dialogo-dados");
  const dialogoBotoes = raiz.querySelector("#cr-dialogo-botoes");

  let nivelId = "normal";
  let jogo = C.estadoInicial(C.NIVEIS[nivelId]);
  let recordes = { facil: [], normal: [], dificil: [], expert: [] };
  let padAceso = null;
  let pontosDaUltimaRodada = 0;
  let somLigado = true;
  let foco = 0;

  const nivel = () => C.NIVEIS[nivelId];
  const recordeExibido = () => Math.max(C.melhor(recordes[nivelId]), jogo.pontos);

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
    const texto = C.paraTexto(jogo);
    gravar(CHAVE_PARTIDA, texto === null ? null : { nivel: nivelId, texto });
  }

  // ---------- Tarefas canceláveis ----------

  /** Cada tarefa equivale a um Job do ViewModel: rodar() cancela a anterior. */
  function criarTarefa() {
    let geracao = 0;
    const relogios = new Set();
    const tarefa = {
      cancelar() {
        geracao++;
        for (const id of relogios) clearTimeout(id);
        relogios.clear();
      },
      rodar(roteiro) {
        tarefa.cancelar();
        const minha = geracao;
        // Uma espera de tarefa cancelada nunca termina: o roteiro antigo simplesmente para ali.
        const esperar = (ms) =>
          new Promise((continuar) => {
            if (minha !== geracao) return;
            const id = setTimeout(() => {
              relogios.delete(id);
              if (minha === geracao) continuar();
            }, ms);
            relogios.add(id);
          });
        roteiro(esperar);
      },
    };
    return tarefa;
  }

  const roteiro = criarTarefa();
  const prazo = criarTarefa();
  const brilho = criarTarefa();

  function cancelarTudo() {
    roteiro.cancelar();
    prazo.cancelar();
    brilho.cancelar();
  }

  // ---------- Sons (Web Audio) ----------

  /** Uma nota por cor, da mais aguda (verde) à mais grave (azul). */
  const NOTAS = { verde: 392.0, vermelho: 329.63, amarelo: 261.63, azul: 196.0 };
  let audio = null;
  let saidaTom = null;

  /** Só depois de um gesto do usuário: antes disso os navegadores bloqueiam o áudio. */
  function prepararAudio() {
    if (!somLigado) return;
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    try {
      if (!audio) audio = new Contexto();
      if (audio.state === "suspended") audio.resume();
    } catch (erro) {
      audio = null;
    }
  }

  function nota(frequencia, inicio, duracao, { tipo = "sine", volume = 0.22, destino = null } = {}) {
    const osc = audio.createOscillator();
    const ganho = audio.createGain();
    osc.type = tipo;
    osc.frequency.value = frequencia;
    ganho.gain.setValueAtTime(0, inicio);
    ganho.gain.linearRampToValueAtTime(volume, inicio + 0.012);
    ganho.gain.setValueAtTime(volume, inicio + Math.max(0.02, duracao - 0.06));
    ganho.gain.linearRampToValueAtTime(0, inicio + duracao);
    osc.connect(ganho).connect(destino || audio.destination);
    osc.start(inicio);
    osc.stop(inicio + duracao + 0.02);
    return osc;
  }

  const podeTocar = () => somLigado && audio && audio.state === "running";

  /** Como no app, um tom novo corta o anterior e nenhum passa de 0,45 s. */
  function tom(cor, duracaoMs = 380) {
    if (!podeTocar()) return;
    pararTom();
    saidaTom = audio.createGain();
    saidaTom.connect(audio.destination);
    const agora = audio.currentTime;
    nota(NOTAS[cor], agora, Math.min(duracaoMs, 450) / 1000, { tipo: "triangle", volume: 0.3, destino: saidaTom });
  }

  function pararTom() {
    if (!saidaTom || !audio) return;
    const saida = saidaTom;
    saidaTom = null;
    saida.gain.setTargetAtTime(0, audio.currentTime, 0.01);
    setTimeout(() => saida.disconnect(), 80);
  }

  function somAcerto() {
    if (!podeTocar()) return;
    const agora = audio.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => nota(f, agora + i * 0.07, 0.12, { volume: 0.16 }));
  }

  function somErro() {
    if (!podeTocar()) return;
    pararTom();
    const agora = audio.currentTime;
    nota(140, agora, 0.32, { tipo: "sawtooth", volume: 0.12 });
    nota(104, agora + 0.04, 0.34, { tipo: "square", volume: 0.07 });
  }

  function somFim() {
    if (!podeTocar()) return;
    pararTom();
    const agora = audio.currentTime;
    [392.0, 329.63, 261.63, 196.0].forEach((f, i) => nota(f, agora + i * 0.16, 0.2, { tipo: "triangle", volume: 0.2 }));
  }

  function alternarSom() {
    somLigado = !somLigado;
    gravar(CHAVE_SOM, somLigado);
    if (somLigado) prepararAudio();
    else pararTom();
    desenharSom();
    status.textContent = somLigado ? "Som ligado." : "Som desligado.";
  }

  function desenharSom() {
    botaoSom.setAttribute("aria-pressed", String(somLigado));
    botaoSom.classList.toggle("mudo", !somLigado);
  }

  // ---------- Desenho ----------

  /** Durante a sequência só a cor acesa fica forte (esmaecer() de Tabuleiro.kt). */
  function esmaecido(cor) {
    switch (jogo.fase) {
      case F.AGUARDANDO:
      case F.ACERTOU:
        return false;
      case F.MOSTRANDO:
      case F.ERROU:
        return padAceso !== cor;
      default:
        return true;
    }
  }

  function textoDaFase() {
    switch (jogo.fase) {
      case F.MOSTRANDO:
        return ["👀", "Observe…"];
      case F.AGUARDANDO:
        return ["🎮", `Sua vez!  ${jogo.acertos}/${jogo.sequencia.length}`];
      case F.ACERTOU:
        return ["✅", `Correto!  +${pontosDaUltimaRodada}`];
      case F.ERROU:
        return ["❌", "Ops! Cor errada"];
      case F.TEMPO_ESGOTADO:
        return ["⏱️", "Tempo esgotado!"];
      case F.NOVA_CHANCE:
        return ["💔", jogo.vidas === 1 ? "Última vida!" : `Restam ${jogo.vidas} vidas`];
      case F.PAUSADO:
        return ["", "Jogo pausado"];
      case F.FIM:
        return ["", "Fim de jogo"];
      default:
        return ["", `Nível ${nivel().nome}: ${textoVidas(nivel().vidas)} e ${nivel().tempoRespostaMs / 1000} s por toque`];
    }
  }

  const textoVidas = (n) => (n === 1 ? "1 vida" : `${n} vidas`);

  function desenharPads() {
    const vez = jogo.fase === F.AGUARDANDO;
    tabuleiro.classList.toggle("vez", vez);
    for (const pad of pads) {
      const cor = pad.dataset.cor;
      pad.classList.toggle("aceso", padAceso === cor);
      pad.classList.toggle("esmaecido", esmaecido(cor));
      pad.setAttribute("aria-disabled", String(!vez));
    }
  }

  function desenhar() {
    textoPontos.textContent = String(jogo.pontos);
    textoRodada.textContent = String(jogo.rodada);
    textoRecorde.textContent = String(recordeExibido());

    const total = nivel().vidas;
    const vidas = Math.min(jogo.vidas, total);
    vidasEl.replaceChildren(
      ...Array.from({ length: total }, (_, i) => {
        const coracao = document.createElement("span");
        coracao.className = i < vidas ? "cheio" : "vazio";
        coracao.textContent = "♥";
        return coracao;
      }),
    );
    vidasEl.setAttribute("aria-label", textoVidas(vidas));

    comboEl.hidden = jogo.combo <= 1;
    comboEl.textContent = `🔥 x${jogo.combo}`;
    comboEl.setAttribute("aria-label", `Combo de ${jogo.combo}`);

    const [icone, texto] = textoDaFase();
    const iconeEl = document.createElement("span");
    iconeEl.setAttribute("aria-hidden", "true");
    iconeEl.textContent = icone ? `${icone} ` : "";
    mensagem.replaceChildren(iconeEl, texto);
    mensagem.dataset.fase = jogo.fase;

    const andamento = C.emAndamento(jogo.fase);
    botaoIniciar.hidden = andamento;
    botaoIniciar.textContent = jogo.fase === F.FIM ? "Jogar novamente" : "Iniciar jogo";
    botaoContinuar.hidden = jogo.fase !== F.PAUSADO;
    botaoPausar.hidden = !andamento || jogo.fase === F.PAUSADO;

    for (const botao of botoesNivel) {
      const ativo = botao.dataset.nivel === nivelId;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    desenharPads();
  }

  function desenharRecordes() {
    const tabela = recordes[nivelId];
    recordesNivel.textContent = nivel().nome;
    const data = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
    const itens = tabela.map((r) => {
      const item = document.createElement("li");
      const partes = [`${r.pontos} pontos`];
      if (r.rodadas !== null) partes.push(r.rodadas === 1 ? "1 rodada" : `${r.rodadas} rodadas`);
      if (r.maiorCombo !== null) partes.push(`combo ${r.maiorCombo}`);
      if (r.dataMs !== null) partes.push(data.format(new Date(r.dataMs)));
      item.textContent = partes.join(" · ");
      return item;
    });
    recordesLista.replaceChildren(...itens);
    recordesLista.hidden = itens.length === 0;
    recordesVazio.hidden = itens.length > 0;
  }

  function acender(cor) {
    padAceso = cor;
    desenharPads();
  }

  function iniciarBarra() {
    barra.classList.remove("correndo");
    void barra.offsetWidth; // reinicia a animação
    barra.style.setProperty("--prazo", `${nivel().tempoRespostaMs}ms`);
    barra.classList.add("correndo");
  }

  function pararBarra() {
    barra.classList.remove("correndo");
  }

  function tremer() {
    tabuleiro.classList.remove("tremendo");
    void tabuleiro.offsetWidth;
    tabuleiro.classList.add("tremendo");
  }

  function atualizar(novo) {
    jogo = novo;
    if (jogo.fase !== F.AGUARDANDO) pararBarra();
    desenhar();
    salvar();
  }

  // ---------- Diálogo ----------

  let aoCancelarDialogo = null;

  function abrirDialogo({ titulo, texto, dados = [], botoes, aoCancelar }) {
    dialogoTitulo.textContent = titulo;
    dialogoTexto.textContent = texto;
    dialogoTexto.hidden = !texto;
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
    status.textContent = texto ? `${titulo}. ${texto}` : titulo;
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

  // ---------- Partida ----------

  function iniciar() {
    if (C.emAndamento(jogo.fase)) return;
    fecharDialogo();
    cancelarTudo();
    pararTom();
    padAceso = null;
    jogo = C.novo(nivel(), C.sortear());
    desenhar();
    salvar();
    mostrarSequencia(0, ESPERA_OBSERVE_MS);
  }

  function mostrarSequencia(antesMs, observarMs) {
    cancelarTudo();
    roteiro.rodar(async (esperar) => {
      await esperar(antesMs);
      await exibirSequencia(esperar, observarMs);
    });
  }

  async function exibirSequencia(esperar, observarMs) {
    brilho.cancelar();
    padAceso = null;
    atualizar(C.mostrar(jogo));
    const total = jogo.sequencia.length;
    status.textContent = total === 1 ? "Observe a cor." : `Observe as ${total} cores.`;
    await esperar(observarMs);
    const atraso = C.atrasoSequencia(nivel(), jogo.rodada);
    for (const [indice, cor] of jogo.sequencia.entries()) {
      await esperar(atraso);
      acender(cor);
      tom(cor, DURACAO_ACESO_MS);
      status.textContent = `${indice + 1}: ${C.NOMES_CORES[cor]}`;
      await esperar(DURACAO_ACESO_MS);
      acender(null);
    }
    await esperar(ESPERA_APOS_SEQUENCIA_MS);
    // Só agora os toques passam a valer
    atualizar(C.aguardar(jogo));
    status.textContent = `Sua vez: repita ${total === 1 ? "a cor" : `as ${total} cores`}.`;
    iniciarPrazo();
  }

  function iniciarPrazo() {
    iniciarBarra();
    prazo.rodar(async (esperar) => {
      await esperar(nivel().tempoRespostaMs);
      const esgotado = C.esgotarTempo(jogo);
      if (esgotado.fase !== F.TEMPO_ESGOTADO) return;
      brilho.cancelar();
      padAceso = null;
      atualizar(esgotado);
      tremer();
      somErro();
      status.textContent = "Tempo esgotado!";
      roteiro.rodar(async (esperarRoteiro) => {
        await esperarRoteiro(FEEDBACK_ERRO_MS);
        perderVida();
      });
    });
  }

  function piscar(cor) {
    acender(cor);
    brilho.rodar(async (esperar) => {
      await esperar(DURACAO_BRILHO_TOQUE_MS);
      if (padAceso === cor) acender(null);
    });
  }

  function tocar(cor) {
    const { estado: novo, resultado } = C.tocar(jogo, cor, () => C.sortear());
    if (resultado === R.IGNORADO) return;
    prazo.cancelar();
    if (resultado === R.ACERTO) {
      atualizar(novo);
      piscar(cor);
      tom(cor, 300);
      iniciarPrazo();
    } else if (resultado === R.RODADA_COMPLETA) {
      pontosDaUltimaRodada = C.pontosDaRodada(novo.combo, nivel());
      atualizar(novo);
      piscar(cor);
      tom(cor, 300);
      status.textContent = `Correto! Mais ${pontosDaUltimaRodada} pontos.${novo.combo > 1 ? ` Combo de ${novo.combo}.` : ""}`;
      roteiro.rodar(async (esperar) => {
        // O som de acerto vem logo depois do tom da cor, em vez de por cima dele
        await esperar(ATRASO_SOM_ACERTO_MS);
        somAcerto();
        await esperar(FEEDBACK_ACERTO_MS - ATRASO_SOM_ACERTO_MS);
        await exibirSequencia(esperar, ESPERA_OBSERVE_MS);
      });
    } else {
      brilho.cancelar();
      padAceso = cor;
      atualizar(novo);
      tremer();
      somErro();
      status.textContent = "Ops! Cor errada.";
      roteiro.rodar(async (esperar) => {
        await esperar(FEEDBACK_ERRO_MS);
        acender(null);
        perderVida();
      });
    }
  }

  function perderVida() {
    const depois = C.perderVida(jogo);
    if (depois.fase === F.FIM) {
      finalizar(depois);
      return;
    }
    atualizar(depois);
    status.textContent = depois.vidas === 1 ? "Última vida! A sequência vai se repetir." : `Restam ${depois.vidas} vidas. A sequência vai se repetir.`;
    mostrarSequencia(AVISO_VIDA_PERDIDA_MS, ESPERA_OBSERVE_MS);
  }

  function finalizar(fim) {
    cancelarTudo();
    somFim();
    padAceso = null;
    const anterior = C.melhor(recordes[nivelId]);
    const partida = { pontos: fim.pontos, rodadas: C.rodadasCompletas(fim), maiorCombo: fim.maiorCombo, dataMs: Date.now() };
    const { tabela, posicao } = C.inserirRecorde(recordes[nivelId], partida);
    recordes = { ...recordes, [nivelId]: tabela };
    gravar(CHAVE_RECORDES, recordes);
    // Comparação com o recorde de antes da partida (no app antigo nunca dava verdadeiro)
    const novoRecorde = fim.pontos > anterior;
    atualizar(fim);
    desenharRecordes();
    const dados = [
      ["Pontuação final", String(fim.pontos), true],
      [`Recorde (${nivel().nome})`, String(C.melhor(recordes[nivelId])), novoRecorde],
      ["Rodadas completadas", String(partida.rodadas)],
      ["Maior combo", String(fim.maiorCombo)],
    ];
    roteiro.rodar(async (esperar) => {
      await esperar(ESPERA_TELA_FIM_MS);
      abrirDialogo({
        titulo: novoRecorde ? "🎉 Novo recorde!" : "Fim de jogo",
        texto: posicao > 1 ? `🏅 ${posicao}º lugar nos seus recordes do nível ${nivel().nome}` : "",
        dados,
        botoes: [
          { rotulo: "Jogar novamente", acao: iniciar },
          { rotulo: "Fechar", acao: () => botaoIniciar.focus(), secundario: true },
        ],
      });
    });
  }

  /** Troca de aba, botão Pausar ou troca de nível: nada corre enquanto o jogo está pausado. */
  function pausar(anunciar = true) {
    if (!C.emAndamento(jogo.fase) || jogo.fase === F.PAUSADO) return;
    cancelarTudo();
    pararTom();
    padAceso = null;
    const pausado = C.pausar(jogo);
    if (pausado.fase === F.FIM) {
      finalizar(pausado);
      return;
    }
    atualizar(pausado);
    if (anunciar) status.textContent = "Jogo pausado.";
    if (document.activeElement === botaoPausar || pads.includes(document.activeElement)) botaoContinuar.focus();
  }

  function continuar() {
    if (jogo.fase !== F.PAUSADO) return;
    if (jogo.retomarAguardando) {
      atualizar(C.aguardar(jogo));
      status.textContent = `Continue de onde parou: ${jogo.acertos} de ${jogo.sequencia.length} cores.`;
      iniciarPrazo();
    } else {
      mostrarSequencia(0, ESPERA_RETOMAR_MS);
    }
    if (document.activeElement === botaoContinuar) botaoPausar.focus();
  }

  function trocarNivel(id) {
    if (id === nivelId || !C.NIVEIS[id]) return;
    const aplicar = () => {
      cancelarTudo();
      pararTom();
      nivelId = id;
      gravar(CHAVE_NIVEL, id);
      jogo = C.estadoInicial(nivel());
      padAceso = null;
      gravar(CHAVE_PARTIDA, null);
      desenhar();
      desenharRecordes();
      status.textContent = `Nível ${nivel().nome}.`;
    };
    if (!C.emAndamento(jogo.fase)) {
      aplicar();
      return;
    }
    pausar(false);
    if (!C.emAndamento(jogo.fase)) {
      // Pausar logo depois de um erro na última vida já encerrou a partida
      return;
    }
    abrirDialogo({
      titulo: "Trocar de nível?",
      texto: `A partida em andamento será perdida e um jogo no nível ${C.NIVEIS[id].nome} poderá começar.`,
      botoes: [
        { rotulo: "Trocar", acao: aplicar },
        { rotulo: "Continuar jogando", acao: continuar, secundario: true },
      ],
      aoCancelar: continuar,
    });
  }

  // ---------- Controles ----------

  // pointerdown adianta o áudio no mouse; no toque, só o click conta como gesto para o navegador
  for (const tipo of ["pointerdown", "click", "keydown"]) raiz.addEventListener(tipo, prepararAudio, { capture: true });

  tabuleiro.addEventListener("click", (evento) => {
    const pad = evento.target.closest(".cr-pad");
    if (!pad) return;
    foco = pads.indexOf(pad);
    tocar(pad.dataset.cor);
  });

  // Teclas na posição das cores: 1 2 / 3 4 e Q W / A S
  const TECLAS = { 1: 0, 2: 1, 3: 2, 4: 3, q: 0, w: 1, a: 2, s: 3 };

  tabuleiro.addEventListener("keydown", (evento) => {
    const pad = evento.target.closest?.(".cr-pad");
    if (!pad || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const i = pads.indexOf(pad);
    const destino = { ArrowLeft: i - (i % 2), ArrowRight: i - (i % 2) + 1, ArrowUp: i % 2, ArrowDown: 2 + (i % 2) }[evento.key];
    if (destino === undefined) return;
    evento.preventDefault();
    focar(destino);
  });

  function focar(i) {
    foco = i;
    pads.forEach((p, j) => (p.tabIndex = j === foco ? 0 : -1));
    pads[foco].focus();
  }

  document.addEventListener("keydown", (evento) => {
    if (evento.altKey || evento.ctrlKey || evento.metaKey || dialogo.open || evento.repeat) return;
    const alvo = evento.target;
    if (alvo instanceof HTMLElement && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
    // Só quando o jogo está na tela ou o foco está dentro dele
    const dentro = raiz.contains(alvo);
    const caixa = tabuleiro.getBoundingClientRect();
    const visivel = caixa.bottom > 0 && caixa.top < window.innerHeight;
    if (!dentro && !visivel) return;
    const tecla = (evento.key || "").toLowerCase();
    if (tecla in TECLAS) {
      if (jogo.fase !== F.AGUARDANDO) return;
      evento.preventDefault();
      prepararAudio();
      const pad = pads[TECLAS[tecla]];
      foco = TECLAS[tecla];
      pads.forEach((p, j) => (p.tabIndex = j === foco ? 0 : -1));
      pad.classList.add("pressionado");
      setTimeout(() => pad.classList.remove("pressionado"), 120);
      tocar(pad.dataset.cor);
    } else if (tecla === "p") {
      if (jogo.fase === F.PAUSADO) continuar();
      else if (C.emAndamento(jogo.fase)) pausar();
      else return;
      evento.preventDefault();
    }
  });

  botaoIniciar.addEventListener("click", () => {
    iniciar();
    focar(foco);
  });
  botaoContinuar.addEventListener("click", continuar);
  botaoPausar.addEventListener("click", () => pausar());
  botaoSom.addEventListener("click", alternarSom);
  for (const botao of botoesNivel) botao.addEventListener("click", () => trocarNivel(botao.dataset.nivel));

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      pausar();
      salvar();
    }
  });
  window.addEventListener("pagehide", salvar);

  // ---------- Início ----------

  const somSalvo = lerJson(CHAVE_SOM);
  if (typeof somSalvo === "boolean") somLigado = somSalvo;
  const salvos = lerJson(CHAVE_RECORDES);
  if (salvos && typeof salvos === "object") {
    for (const id of Object.keys(recordes)) recordes[id] = C.lerRecordes(salvos[id]);
  }
  const nivelSalvo = lerJson(CHAVE_NIVEL);
  if (typeof nivelSalvo === "string" && C.NIVEIS[nivelSalvo]) nivelId = nivelSalvo;
  const salva = lerJson(CHAVE_PARTIDA);
  const restaurada = salva && C.NIVEIS[salva.nivel] ? C.deTexto(salva.texto, C.NIVEIS[salva.nivel]) : null;
  if (restaurada) {
    nivelId = salva.nivel;
    jogo = restaurada;
  } else {
    jogo = C.estadoInicial(nivel());
    gravar(CHAVE_PARTIDA, null);
  }
  desenharSom();
  desenhar();
  desenharRecordes();
  if (restaurada) status.textContent = "Partida salva carregada. Aperte Continuar para seguir.";
})();
