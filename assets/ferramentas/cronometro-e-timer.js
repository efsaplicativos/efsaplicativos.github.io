"use strict";
/*
 * Interface do cronômetro e do temporizador (a lógica está em cronometro-e-timer-logica.js).
 * Como ui/tools/cronometro/CronometroScreen.kt e ChronoHolder.kt da Calculadora Multifunção:
 * os dois contam ao mesmo tempo, bipes nos 3 últimos segundos, alarme e vibração no fim.
 *
 * O relógio é Date.now(): o estado guarda instantes (início, fim), e não tiques, então a
 * contagem fica certa com a aba em segundo plano e sobrevive a uma recarga (localStorage).
 * A tela é redesenhada por requestAnimationFrame; o fim do temporizador e os bipes são
 * agendados com setTimeout para o instante exato, que também roda com a aba em segundo plano.
 */
(() => {
  const raiz = document.querySelector(".cronometro");
  if (!raiz) return;

  const L = LogicaCronometro;
  const CHAVES = {
    cronometro: "efs-cronometro-e-timer-cronometro",
    timer: "efs-cronometro-e-timer-timer",
    opcoes: "efs-cronometro-e-timer-opcoes",
  };
  const agora = () => Date.now();
  const tituloOriginal = document.title;

  const $ = (seletor) => raiz.querySelector(seletor);
  const el = {
    abas: raiz.querySelectorAll("[data-aba]"),
    paineis: raiz.querySelectorAll("[data-painel]"),
    crTempo: $("#cr-tempo"),
    crVoltaAtual: $("#cr-volta-atual"),
    crPrincipal: $("#cr-principal"),
    crSecundario: $("#cr-secundario"),
    crStatus: $("#cr-status"),
    crVoltas: $("#cr-voltas"),
    crTabela: $("#cr-voltas tbody"),
    crCopiar: $("#cr-copiar"),
    tmTempo: $("#tm-tempo"),
    tmFim: $("#tm-fim"),
    tmAnel: $("#tm-anel"),
    tmPrincipal: $("#tm-principal"),
    tmZerar: $("#tm-zerar"),
    tmMais: $("#tm-mais"),
    tmStatus: $("#tm-status"),
    tmDefinir: $("#tm-definir"),
    tmBloqueado: $("#tm-bloqueado"),
    tmHoras: $("#tm-horas"),
    tmMinutos: $("#tm-minutos"),
    tmSegundos: $("#tm-segundos"),
    opSom: $("#op-som"),
    opVibracao: $("#op-vibracao"),
    opVibracaoRotulo: $("#op-vibracao-rotulo"),
  };
  const podeVibrar = typeof navigator.vibrate === "function";

  // --- Estado salvo -------------------------------------------------------------------------

  function lerJSON(chave) {
    try {
      return JSON.parse(localStorage.getItem(chave));
    } catch (erro) {
      return null;
    }
  }

  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (erro) {
      // sem armazenamento: a contagem só não sobrevive à recarga
    }
  }

  let cronometro = L.validarCronometro(lerJSON(CHAVES.cronometro)) || L.cronometroInicial();
  let timer = L.validarTimer(lerJSON(CHAVES.timer)) || L.timerInicial();
  // Terminou enquanto a página estava fechada: mostra como esgotado, sem tocar o alarme.
  timer = L.verificarFim(timer, agora());

  const opcoesSalvas = lerJSON(CHAVES.opcoes) || {};
  const opcoes = {
    som: opcoesSalvas.som !== false,
    vibracao: opcoesSalvas.vibracao !== false,
    aba: opcoesSalvas.aba === "timer" ? "timer" : "cronometro",
  };

  const salvarCronometro = () => gravar(CHAVES.cronometro, cronometro);
  const salvarTimer = () => gravar(CHAVES.timer, timer);
  const salvarOpcoes = () => gravar(CHAVES.opcoes, opcoes);

  // --- Som, vibração e tela acesa -------------------------------------------------------------

  let audio = null;

  /** Cria o contexto de áudio no primeiro toque (os navegadores exigem um gesto do usuário). */
  function contextoAudio() {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return null;
    if (!audio) audio = new Contexto();
    if (audio.state === "suspended") audio.resume().catch(() => {});
    return audio;
  }

  function bip(frequencia, inicio, duracao, volume = 0.25) {
    const ctx = contextoAudio();
    if (!ctx) return;
    const t = ctx.currentTime + inicio;
    const oscilador = ctx.createOscillator();
    const ganho = ctx.createGain();
    oscilador.type = "sine";
    oscilador.frequency.value = frequencia;
    ganho.gain.setValueAtTime(0.0001, t);
    ganho.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
    oscilador.connect(ganho).connect(ctx.destination);
    oscilador.start(t);
    oscilador.stop(t + duracao + 0.02);
  }

  const SONS = {
    inicio: () => {
      bip(660, 0, 0.08);
      bip(880, 0.09, 0.12);
    },
    pausa: () => {
      bip(880, 0, 0.08);
      bip(660, 0.09, 0.12);
    },
    bipe: () => bip(1000, 0, 0.12),
    fim: () => {
      for (let i = 0; i < 3; i++) {
        bip(1200, i * 0.6, 0.18, 0.35);
        bip(1200, i * 0.6 + 0.24, 0.18, 0.35);
      }
    },
  };

  function tocar(som) {
    if (!opcoes.som) return;
    try {
      SONS[som]();
    } catch (erro) {
      // sem áudio no navegador: segue em silêncio
    }
  }

  function vibrar() {
    if (!opcoes.vibracao || !podeVibrar) return;
    try {
      navigator.vibrate([500, 300, 500, 300, 500]);
    } catch (erro) {
      // vibração indisponível
    }
  }

  let travaTela = null;

  /** Mantém a tela acesa enquanto algo estiver contando, como o app (Screen Wake Lock). */
  async function atualizarTravaTela() {
    const rodando = cronometro.rodando || timer.rodando;
    if (!rodando) {
      if (travaTela) travaTela.release().catch(() => {});
      travaTela = null;
      return;
    }
    if (travaTela || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try {
      travaTela = await navigator.wakeLock.request("screen");
      travaTela.addEventListener("release", () => {
        travaTela = null;
      });
    } catch (erro) {
      travaTela = null;
    }
  }

  // --- Abas ---------------------------------------------------------------------------------

  function mostrarAba(aba) {
    opcoes.aba = aba;
    for (const botao of el.abas) {
      const ativo = botao.dataset.aba === aba;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    for (const painel of el.paineis) painel.hidden = painel.dataset.painel !== aba;
  }

  for (const botao of el.abas) {
    botao.addEventListener("click", () => {
      mostrarAba(botao.dataset.aba);
      salvarOpcoes();
    });
  }

  // --- Cronômetro ---------------------------------------------------------------------------

  function desenharCronometro(instante) {
    const decorrido = L.decorrido(cronometro, instante);
    el.crTempo.textContent = L.formatarCronometro(decorrido);
    el.crTempo.classList.toggle("cronometro-longo", decorrido >= 3600000);
    const ultima = cronometro.voltas[cronometro.voltas.length - 1];
    el.crVoltaAtual.hidden = !ultima;
    if (ultima) el.crVoltaAtual.textContent = `Volta atual: ${L.formatarCronometro(decorrido - ultima.totalMs)}`;
  }

  function atualizarBotoesCronometro() {
    const zerado = L.cronometroZerado(cronometro);
    el.crPrincipal.textContent = cronometro.rodando ? "Pausar" : zerado ? "Iniciar" : "Retomar";
    el.crSecundario.textContent = cronometro.rodando ? "Volta" : "Zerar";
    el.crSecundario.disabled = !cronometro.rodando && zerado;
  }

  function desenharVoltas() {
    const voltas = cronometro.voltas;
    el.crVoltas.hidden = voltas.length === 0;
    const extremos = L.melhorEPiorVolta(cronometro);
    const linhas = [];
    for (let i = voltas.length - 1; i >= 0; i--) {
      const v = voltas[i];
      const tr = document.createElement("tr");
      const numero = document.createElement("td");
      numero.textContent = `Volta ${v.numero}`;
      if (extremos && (i === extremos.melhor || i === extremos.pior)) {
        const melhor = i === extremos.melhor;
        tr.className = melhor ? "cronometro-melhor" : "cronometro-pior";
        const marca = document.createElement("span");
        marca.className = "cronometro-marca";
        marca.textContent = melhor ? "Mais rápida" : "Mais lenta";
        numero.append(" ", marca);
      }
      const parcial = document.createElement("td");
      parcial.textContent = L.formatarCronometro(v.voltaMs);
      const total = document.createElement("td");
      total.textContent = L.formatarCronometro(v.totalMs);
      tr.append(numero, parcial, total);
      linhas.push(tr);
    }
    el.crTabela.replaceChildren(...linhas);
  }

  function mudouCronometro() {
    salvarCronometro();
    atualizarBotoesCronometro();
    desenharCronometro(agora());
    atualizarTravaTela();
    animar();
  }

  el.crPrincipal.addEventListener("click", () => {
    const instante = agora();
    if (cronometro.rodando) {
      cronometro = L.pausarCronometro(cronometro, instante);
      tocar("pausa");
      el.crStatus.textContent = `Cronômetro pausado em ${L.formatarCronometro(L.decorrido(cronometro, instante))}.`;
    } else {
      contextoAudio();
      cronometro = L.iniciarCronometro(cronometro, instante);
      tocar("inicio");
      el.crStatus.textContent = "Cronômetro contando.";
    }
    mudouCronometro();
  });

  el.crSecundario.addEventListener("click", () => {
    if (cronometro.rodando) {
      cronometro = L.marcarVolta(cronometro, agora());
      const v = cronometro.voltas[cronometro.voltas.length - 1];
      el.crStatus.textContent = `Volta ${v.numero}: ${L.formatarCronometro(v.voltaMs)}.`;
      if (podeVibrar && opcoes.vibracao) navigator.vibrate(30);
    } else {
      cronometro = L.cronometroInicial();
      el.crStatus.textContent = "Cronômetro zerado.";
      el.crPrincipal.focus();
    }
    desenharVoltas();
    mudouCronometro();
  });

  el.crCopiar.addEventListener("click", async () => {
    const texto = [
      "Volta\tTempo da volta\tTotal",
      ...cronometro.voltas.map((v) => `${v.numero}\t${L.formatarCronometro(v.voltaMs)}\t${L.formatarCronometro(v.totalMs)}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      el.crStatus.textContent = "Voltas copiadas para a área de transferência.";
      el.crCopiar.textContent = "Copiado!";
      setTimeout(() => {
        el.crCopiar.textContent = "Copiar voltas";
      }, 2000);
    } catch (erro) {
      el.crStatus.textContent = "Não foi possível copiar. Selecione a tabela e copie manualmente.";
    }
  });

  // --- Temporizador -------------------------------------------------------------------------

  let agendados = [];

  function cancelarAgendados() {
    for (const id of agendados) clearTimeout(id);
    agendados = [];
  }

  /** Agenda os bipes dos 3 últimos segundos e o fim para os instantes exatos. */
  function agendarTimer() {
    cancelarAgendados();
    if (!timer.rodando) return;
    const instante = agora();
    for (const segundos of [3, 2, 1]) {
      const espera = timer.terminaEm - segundos * 1000 - instante;
      if (espera > 0) agendados.push(setTimeout(() => tocar("bipe"), espera));
    }
    agendados.push(setTimeout(verificarTimer, Math.max(timer.terminaEm - instante, 0)));
  }

  function verificarTimer() {
    const depois = L.verificarFim(timer, agora());
    if (depois === timer) {
      if (timer.rodando) agendarTimer(); // o navegador acordou cedo: reagenda
      return;
    }
    timer = depois;
    cancelarAgendados();
    tocar("fim");
    vibrar();
    el.tmStatus.textContent = "Tempo esgotado!";
    mudouTimer();
  }

  function camposDoTimer() {
    const ler = (campo) => {
      const texto = campo.value.trim();
      const valido = /^\d{1,2}$/.test(texto);
      campo.setAttribute("aria-invalid", String(texto !== "" && !valido));
      return valido ? Number(texto) : 0;
    };
    return L.duracaoMs(ler(el.tmHoras), ler(el.tmMinutos), ler(el.tmSegundos));
  }

  /** Mostra nos campos a duração configurada (se ela mudou por fora, como no +1 min). */
  function sincronizarCampos() {
    if (camposDoTimer() === timer.totalMs) return;
    el.tmHoras.value = String(Math.floor(timer.totalMs / 3600000));
    el.tmMinutos.value = String(Math.floor(timer.totalMs / 60000) % 60);
    el.tmSegundos.value = String(Math.floor(timer.totalMs / 1000) % 60);
    for (const campo of [el.tmHoras, el.tmMinutos, el.tmSegundos]) campo.setAttribute("aria-invalid", "false");
  }

  function desenharTimer(instante) {
    el.tmTempo.textContent = L.formatarTimer(L.restante(timer, instante));
    el.tmAnel.style.strokeDashoffset = String(100 * (1 - L.progresso(timer, instante)));
  }

  function atualizarBotoesTimer() {
    const ocioso = L.timerOcioso(timer);
    el.tmPrincipal.textContent = timer.rodando ? "Pausar" : ocioso ? "Iniciar" : "Retomar";
    el.tmPrincipal.disabled = !timer.rodando && timer.totalMs <= 0;
    el.tmZerar.disabled = ocioso && !timer.terminado;
    el.tmFim.hidden = !timer.terminado;
    raiz.classList.toggle("timer-terminado", timer.terminado);
    el.tmDefinir.disabled = !ocioso;
    el.tmBloqueado.hidden = ocioso;
  }

  let ultimoTitulo = "";
  function atualizarTitulo() {
    let titulo = tituloOriginal;
    if (timer.rodando) titulo = `${L.formatarTimer(L.restante(timer, agora()))} · ${tituloOriginal}`;
    else if (timer.terminado) titulo = `Tempo esgotado! · ${tituloOriginal}`;
    if (titulo !== ultimoTitulo) {
      document.title = titulo;
      ultimoTitulo = titulo;
    }
  }

  let relogioTitulo = null;
  /** [salvar] = false quando a mudança veio de outra aba (evita regravar o mesmo estado). */
  function mudouTimer(salvar = true) {
    if (salvar) salvarTimer();
    sincronizarCampos();
    atualizarBotoesTimer();
    desenharTimer(agora());
    atualizarTitulo();
    clearInterval(relogioTitulo);
    // O título também é visto com a aba em segundo plano, onde não há requestAnimationFrame.
    if (timer.rodando) relogioTitulo = setInterval(atualizarTitulo, 500);
    atualizarTravaTela();
    animar();
  }

  el.tmPrincipal.addEventListener("click", () => {
    const instante = agora();
    if (timer.rodando) {
      timer = L.pausarTimer(timer, instante);
      cancelarAgendados();
      tocar("pausa");
      el.tmStatus.textContent = `Temporizador pausado com ${L.formatarTimer(L.restante(timer, instante))} restantes.`;
    } else {
      const iniciado = L.iniciarTimer(timer, instante);
      if (!iniciado.rodando) return;
      contextoAudio();
      timer = iniciado;
      tocar("inicio");
      agendarTimer();
      el.tmStatus.textContent = "Temporizador contando.";
    }
    mudouTimer();
  });

  el.tmZerar.addEventListener("click", () => {
    timer = L.reiniciarTimer(timer);
    cancelarAgendados();
    el.tmStatus.textContent = "Temporizador reiniciado.";
    mudouTimer();
    el.tmPrincipal.focus();
  });

  el.tmMais.addEventListener("click", () => {
    timer = L.somarTempo(timer, agora());
    agendarTimer();
    el.tmStatus.textContent = "Mais um minuto.";
    mudouTimer();
  });

  for (const campo of [el.tmHoras, el.tmMinutos, el.tmSegundos]) {
    campo.addEventListener("input", () => {
      if (!L.timerOcioso(timer)) return;
      timer = L.definirDuracao(timer, camposDoTimer());
      salvarTimer();
      atualizarBotoesTimer();
      desenharTimer(agora());
    });
  }

  for (const botao of raiz.querySelectorAll("[data-minutos]")) {
    botao.addEventListener("click", () => {
      if (!L.timerOcioso(timer)) return;
      timer = L.definirDuracao(timer, Number(botao.dataset.minutos) * 60000);
      mudouTimer();
    });
  }

  // --- Opções -------------------------------------------------------------------------------

  el.opSom.checked = opcoes.som;
  el.opVibracao.checked = opcoes.vibracao;
  el.opVibracaoRotulo.hidden = !podeVibrar;
  el.opSom.addEventListener("change", () => {
    opcoes.som = el.opSom.checked;
    salvarOpcoes();
  });
  el.opVibracao.addEventListener("change", () => {
    opcoes.vibracao = el.opVibracao.checked;
    salvarOpcoes();
  });

  // --- Laço de desenho ----------------------------------------------------------------------

  let quadro = 0;
  function animar() {
    if (quadro || document.visibilityState !== "visible") return;
    if (!cronometro.rodando && !timer.rodando) return;
    quadro = requestAnimationFrame(() => {
      quadro = 0;
      const instante = agora();
      if (cronometro.rodando) desenharCronometro(instante);
      if (timer.rodando) {
        desenharTimer(instante);
        if (instante >= timer.terminaEm) verificarTimer();
      }
      animar();
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (timer.rodando) verificarTimer();
    desenharCronometro(agora());
    desenharTimer(agora());
    atualizarTravaTela();
    animar();
  });

  // Outra aba com a mesma página mudou o estado: acompanha.
  window.addEventListener("storage", (evento) => {
    if (evento.key === CHAVES.cronometro) {
      cronometro = L.validarCronometro(lerJSON(CHAVES.cronometro)) || L.cronometroInicial();
      desenharVoltas();
      atualizarBotoesCronometro();
      desenharCronometro(agora());
      atualizarTravaTela();
      animar();
    } else if (evento.key === CHAVES.timer) {
      timer = L.verificarFim(L.validarTimer(lerJSON(CHAVES.timer)) || L.timerInicial(), agora());
      agendarTimer();
      mudouTimer(false);
    }
  });

  mostrarAba(opcoes.aba);
  desenharVoltas();
  atualizarBotoesCronometro();
  desenharCronometro(agora());
  agendarTimer();
  mudouTimer();
})();
