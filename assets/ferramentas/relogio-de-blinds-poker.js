"use strict";
/*
 * Interface do relógio de blinds. A lógica fica em relogio-de-blinds-poker-logica.js; as telas
 * seguem ui/telas/torneio (TelaTorneio.kt, CartaoRelogio.kt, CartoesTorneio.kt), TelaEstrutura.kt
 * e ui/telas/configurar (TelaConfigurar.kt, Secoes.kt) do app Poker Manager, e o laço do relógio
 * e as ações seguem ui/TorneioViewModel.kt.
 */
(() => {
  const raiz = document.querySelector("#torneio-poker");
  if (!raiz || typeof LogicaPoker !== "object") return;
  const P = LogicaPoker;
  const R = P.Relogio;

  const CHAVE_CONFIG = "efs-relogio-de-blinds-poker-config";
  const CHAVE_TORNEIO = "efs-relogio-de-blinds-poker-torneio";
  const CHAVE_PREFERENCIAS = "efs-relogio-de-blinds-poker-preferencias";
  /** Ao voltar à página depois de muito tempo não toca um alerta velho. */
  const JANELA_ALERTA_MS = 60000;
  /** Último minuto do nível: tempo em vermelho. */
  const AVISO_MS = 60000;
  const VIBRACAO = [0, 400, 150, 400, 150, 600];
  const MAX_POSICOES = 99;

  const $ = (id) => document.getElementById(id);
  const agora = () => performance.now();
  const vibracaoDisponivel = typeof navigator.vibrate === "function";

  // ---------- Armazenamento ----------

  function ler(chave) {
    try {
      const texto = localStorage.getItem(chave);
      return texto ? JSON.parse(texto) : null;
    } catch {
      return null;
    }
  }

  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      // Armazenamento bloqueado ou cheio: o torneio continua, só não sobrevive a um recarregamento
    }
  }

  let config = P.lerConfig(ler(CHAVE_CONFIG)) || P.configPadrao();
  let estado = carregarEstado();
  const preferenciasSalvas = ler(CHAVE_PREFERENCIAS);
  const preferencias = {
    alerta: typeof preferenciasSalvas?.alerta === "boolean" ? preferenciasSalvas.alerta : true,
  };

  /** Estado salvo, com o fim do nível refeito pelo relógio de parede (a página foi recarregada). */
  function carregarEstado() {
    const salvo = P.lerEstado(ler(CHAVE_TORNEIO), config);
    if (!salvo) return P.estadoInicial(config);
    return { ...salvo, relogio: R.restaurar(salvo.relogio, config.niveis, agora(), Date.now(), false) };
  }

  const salvarEstado = () => gravar(CHAVE_TORNEIO, P.estadoParaSalvar(estado));

  // ---------- Som, vibração e tela acesa ----------

  let audio = null;

  /** O navegador só libera o áudio depois de um gesto do usuário. */
  function prepararAudio() {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    try {
      if (!audio) audio = new Contexto();
      if (audio.state === "suspended") audio.resume();
    } catch {
      audio = null;
    }
  }

  /** Três notas subindo, duas vezes (cerca de 1,4 s), geradas na hora. */
  function tocarSom() {
    if (!audio) return;
    try {
      const inicio = audio.currentTime + 0.02;
      [0, 0.75].forEach((atraso) => {
        [660, 880, 1100].forEach((frequencia, i) => {
          const t = inicio + atraso + i * 0.2;
          const oscilador = audio.createOscillator();
          const volume = audio.createGain();
          oscilador.type = "triangle";
          oscilador.frequency.value = frequencia;
          volume.gain.setValueAtTime(0.0001, t);
          volume.gain.exponentialRampToValueAtTime(0.3, t + 0.015);
          volume.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
          oscilador.connect(volume).connect(audio.destination);
          oscilador.start(t);
          oscilador.stop(t + 0.2);
        });
      });
    } catch {
      // Sem som disponível: fica o aviso na tela
    }
  }

  function alertarTroca() {
    if (!preferencias.alerta) return;
    tocarSom();
    if (vibracaoDisponivel) {
      try {
        navigator.vibrate(VIBRACAO);
      } catch {
        // Vibração é opcional
      }
    }
  }

  let travaTela = null;
  let pedindoTrava = false;

  /** Mantém a tela acesa só com o relógio rodando; sem a API (ou recusada), segue sem ela. */
  async function atualizarTravaTela() {
    const querTrava = estado.relogio.status === P.RODANDO && document.visibilityState === "visible";
    if (querTrava && !travaTela && !pedindoTrava && navigator.wakeLock) {
      pedindoTrava = true;
      try {
        travaTela = await navigator.wakeLock.request("screen");
        travaTela.addEventListener("release", () => {
          travaTela = null;
        });
      } catch {
        travaTela = null;
      }
      pedindoTrava = false;
      if (estado.relogio.status !== P.RODANDO) atualizarTravaTela();
    } else if (!querTrava && travaTela) {
      const trava = travaTela;
      travaTela = null;
      trava.release().catch(() => {});
    }
  }

  // ---------- Desenho ----------

  const el = {
    nomeTorneio: $("nome-torneio"),
    cartao: $("cartao-relogio"),
    nomeNivel: $("nome-nivel"),
    posicao: $("posicao-nivel"),
    tempo: $("tempo-nivel"),
    legenda: $("legenda-nivel"),
    barra: $("barra-progresso"),
    blocoBlinds: $("bloco-blinds"),
    valorBlinds: $("valor-blinds"),
    valorAnte: $("valor-ante"),
    textoIntervalo: $("texto-intervalo"),
    proximo: $("proximo-nivel"),
    linhaIntervalo: $("linha-intervalo"),
    intervaloEm: $("intervalo-em"),
    anterior: $("nivel-anterior"),
    principal: $("alternar-relogio"),
    seguinte: $("nivel-seguinte"),
    alerta: $("alternar-alerta"),
    telaCheia: $("tela-cheia"),
    aviso: $("aviso-poker"),
  };

  function definirTexto(elemento, texto) {
    if (elemento.textContent !== texto) elemento.textContent = texto;
  }

  const dinheiro = (centavos) => P.formatar(centavos, config.moeda);

  function desenharRelogio(t = agora()) {
    const r = estado.relogio;
    const niveis = config.niveis;
    const nivel = niveis[r.indice];
    const encerrado = r.status === P.ENCERRADO;
    const intervalo = P.ehIntervalo(nivel);
    const restante = R.restanteMs(r, t);
    const aviso = !encerrado && !intervalo && restante > 0 && restante <= AVISO_MS;

    el.cartao.dataset.tipo = intervalo ? "intervalo" : "blind";
    el.cartao.dataset.aviso = String(aviso);
    el.cartao.dataset.encerrado = String(encerrado);
    definirTexto(el.nomeNivel, P.nomeDoNivel(niveis, r.indice));
    definirTexto(el.posicao, `${r.indice + 1} / ${niveis.length}`);
    const tempo = P.tempo(restante);
    definirTexto(el.tempo, tempo);
    el.tempo.classList.toggle("longo", tempo.length > 5);
    definirTexto(el.legenda, encerrado ? "Torneio encerrado" : aviso ? "Último minuto!" : "");
    el.barra.style.transform = `scaleX(${R.progresso(r, niveis, t).toFixed(4)})`;

    el.blocoBlinds.hidden = intervalo;
    el.textoIntervalo.hidden = !intervalo;
    if (!intervalo) {
      definirTexto(el.valorBlinds, P.blinds(nivel));
      el.valorAnte.hidden = !(nivel.ante > 0);
      definirTexto(el.valorAnte, nivel.ante > 0 ? `Ante ${P.inteiro(nivel.ante)}` : "");
    }
    definirTexto(el.proximo, niveis[r.indice + 1] ? P.resumoNivel(niveis, r.indice + 1) : "Último nível");
    const ateIntervalo = R.msAteProximoIntervalo(r, niveis, t);
    el.linhaIntervalo.hidden = ateIntervalo === null;
    if (ateIntervalo !== null) definirTexto(el.intervaloEm, `Intervalo em ${P.tempo(ateIntervalo)}`);

    el.anterior.disabled = !(r.indice > 0 || encerrado);
    el.seguinte.disabled = encerrado;
    el.principal.disabled = encerrado;
    definirTexto(
      el.principal,
      r.status === P.RODANDO ? "Pausar" : r.status === P.PAUSADO ? "Continuar" : "Iniciar",
    );
    el.alerta.setAttribute("aria-pressed", String(preferencias.alerta));
  }

  function contador(acao, valor, podeMenos, podeMais) {
    const botoes = raiz.querySelectorAll(`[data-acao]`);
    for (const botao of botoes) {
      if (botao.dataset.acao === acao.menos) botao.disabled = !podeMenos;
      if (botao.dataset.acao === acao.mais) botao.disabled = !podeMais;
    }
    definirTexto($(acao.saida), String(valor));
  }

  function desenharPainel() {
    const c = config;
    const e = estado;
    const C = P.Calculos;
    definirTexto(el.nomeTorneio, c.nome);

    const medio = C.stackMedio(c, e);
    definirTexto($("stack-medio"), P.inteiro(medio));
    const bb = P.bigBlindDeReferencia(c, e.relogio.indice);
    definirTexto($("stack-medio-bb"), bb ? `≈ ${P.inteiro(P.proporcao(medio, 1, bb))} BB` : "");
    definirTexto($("fichas-em-jogo"), P.inteiro(C.fichasEmJogo(c, e)));

    contador(
      { menos: "eliminarJogador", mais: "corrigirEliminacao", saida: "valor-restantes" },
      e.restantes,
      e.restantes > 1,
      e.restantes < e.entradas,
    );
    contador(
      { menos: "removerEntrada", mais: "adicionarEntrada", saida: "valor-entradas" },
      e.entradas,
      e.entradas > 1,
      e.entradas < P.MAX_ENTRADAS,
    );
    const lateReg = P.situacaoLateReg(c, e.relogio.indice);
    const detalheEntradas = $("detalhe-entradas");
    detalheEntradas.hidden = !lateReg;
    definirTexto(detalheEntradas, lateReg ?? "");

    definirTexto($("prize-pool"), dinheiro(C.liquidoCentavos(c, e)));
    definirTexto($("valor-bruto"), dinheiro(C.brutoCentavos(c, e)));
    definirTexto($("rotulo-casa"), `Casa (${P.porcentagem(c.casaPontosBase)})`);
    definirTexto($("valor-casa"), dinheiro(C.rakeCentavos(c, e)));

    $("contador-rebuys").hidden = !c.rebuyPermitido;
    if (c.rebuyPermitido) {
      const limite = C.limiteRebuys(c, e);
      const maximo = c.maxRebuysPorJogador > 0 ? `máx. ${c.maxRebuysPorJogador}/jogador` : "ilimitado";
      definirTexto($("detalhe-rebuys"), `${dinheiro(c.rebuyCentavos)} cada · ${maximo}`);
      contador(
        { menos: "removerRebuy", mais: "adicionarRebuy", saida: "valor-rebuys" },
        e.rebuys,
        e.rebuys > 0,
        limite === null || e.rebuys < limite,
      );
    }
    $("contador-addons").hidden = !c.addOnPermitido;
    if (c.addOnPermitido) {
      definirTexto($("detalhe-addons"), `${dinheiro(c.addOnCentavos)} cada`);
      contador({ menos: "removerAddOn", mais: "adicionarAddOn", saida: "valor-addons" }, e.addOns, e.addOns > 0, true);
    }
    definirTexto($("valor-buyin"), `Buy-in: ${dinheiro(c.buyInCentavos)}`);

    const cartaoPremios = $("cartao-premios");
    cartaoPremios.hidden = !c.premiacao.length;
    const lista = $("lista-premios");
    const premios = C.premios(c, e);
    const itens = c.premiacao.map((pontosBase, i) => {
      const li = document.createElement("li");
      li.className = "poker-premio";
      if (i < 3) li.dataset.medalha = String(i + 1);
      const lugar = document.createElement("span");
      lugar.className = "poker-premio-lugar";
      lugar.textContent = `${i + 1}º lugar`;
      const parte = document.createElement("span");
      parte.className = "poker-premio-parte";
      parte.textContent = P.porcentagem(pontosBase);
      const valor = document.createElement("strong");
      valor.className = "poker-premio-valor";
      valor.textContent = dinheiro(premios[i]);
      li.append(lugar, parte, valor);
      return li;
    });
    lista.replaceChildren(...itens);
  }

  function desenhar(t = agora()) {
    desenharRelogio(t);
    desenharPainel();
  }

  function anunciar(texto) {
    el.aviso.textContent = texto;
  }

  function anunciarNivel() {
    const r = estado.relogio;
    anunciar(r.status === P.ENCERRADO ? "Torneio encerrado." : `${P.resumoNivel(config.niveis, r.indice)}.`);
  }

  // ---------- Laço do relógio ----------

  let temporizador = null;

  function publicar(novo, t = agora()) {
    estado = novo;
    salvarEstado();
    desenhar(t);
  }

  /** Coloca o relógio em dia; numa troca de nível salva, avisa e toca o alerta se for recente. */
  function atualizarRelogio() {
    const t = agora();
    const avanco = R.avancar(estado.relogio, config.niveis, t);
    if (avanco.transicoes > 0) {
      publicar({ ...estado, relogio: avanco.estado }, t);
      if (t - avanco.momentoUltimaTransicao <= JANELA_ALERTA_MS) alertarTroca();
      anunciarNivel();
      atualizarTravaTela();
    }
    return t;
  }

  /** Acorda logo depois de o segundo exibido mudar (a contagem não depende deste laço). */
  function agendar(t = agora()) {
    clearTimeout(temporizador);
    temporizador = null;
    if (estado.relogio.status !== P.RODANDO) return;
    const espera = R.msAteProximoSegundo(R.restanteMs(estado.relogio, t));
    temporizador = setTimeout(ciclo, espera + 4);
  }

  function ciclo() {
    temporizador = null;
    const t = atualizarRelogio();
    desenharRelogio(t);
    agendar(t);
  }

  function alterarRelogio(acao) {
    prepararAudio();
    const t = atualizarRelogio();
    const antes = estado.relogio;
    const depois = acao(antes, t, Date.now());
    publicar({ ...estado, relogio: depois }, t);
    if (depois.status !== antes.status) {
      const textos = {
        [P.RODANDO]: "Relógio rodando.",
        [P.PAUSADO]: "Relógio pausado.",
        [P.PARADO]: "Relógio parado.",
        [P.ENCERRADO]: "Torneio encerrado.",
      };
      anunciar(textos[depois.status]);
    }
    if (depois.indice !== antes.indice && depois.status !== P.ENCERRADO) anunciarNivel();
    atualizarTravaTela();
    agendar(t);
  }

  const alternar = () =>
    alterarRelogio((r, t, parede) =>
      r.status === P.RODANDO ? R.pausar(r, config.niveis, t) : R.iniciar(r, t, parede),
    );

  el.principal.addEventListener("click", alternar);
  el.seguinte.addEventListener("click", () =>
    alterarRelogio((r, t, parede) => R.proximo(r, config.niveis, t, parede)),
  );
  el.anterior.addEventListener("click", () =>
    alterarRelogio((r, t, parede) => R.anterior(r, config.niveis, t, parede)),
  );
  $("reiniciar-nivel").addEventListener("click", () => {
    alterarRelogio((r) => R.reiniciarNivel(r, config.niveis));
    anunciar("Nível reiniciado. Relógio parado.");
  });

  el.alerta.addEventListener("click", () => {
    prepararAudio();
    preferencias.alerta = !preferencias.alerta;
    gravar(CHAVE_PREFERENCIAS, preferencias);
    desenharRelogio();
  });

  // Contadores de jogadores e financeiro
  const ROTULOS_CONTADOR = {
    eliminarJogador: ["Restantes", "restantes"],
    corrigirEliminacao: ["Restantes", "restantes"],
    adicionarEntrada: ["Entradas", "entradas"],
    removerEntrada: ["Entradas", "entradas"],
    adicionarRebuy: ["Rebuys", "rebuys"],
    removerRebuy: ["Rebuys", "rebuys"],
    adicionarAddOn: ["Add-ons", "addOns"],
    removerAddOn: ["Add-ons", "addOns"],
  };
  raiz.querySelector(".poker-detalhes").addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-acao]");
    if (!botao || !P.Contadores[botao.dataset.acao]) return;
    const t = atualizarRelogio();
    const novo = P.Contadores[botao.dataset.acao](config, estado);
    if (JSON.stringify(novo) === JSON.stringify(estado)) return;
    publicar(novo, t);
    const [rotulo, campo] = ROTULOS_CONTADOR[botao.dataset.acao];
    anunciar(`${rotulo}: ${novo[campo]}.`);
  });

  $("reiniciar-torneio").addEventListener("click", () =>
    confirmar({
      titulo: "Reiniciar torneio",
      texto: "O relógio volta ao primeiro nível e as entradas, rebuys e add-ons são zerados.",
      ok: "Reiniciar torneio",
      acao: () => {
        publicar(P.estadoInicial(config));
        agendar();
        atualizarTravaTela();
        anunciar("Torneio reiniciado.");
      },
    }),
  );

  // ---------- Teclado, visibilidade e tela cheia ----------

  raiz.addEventListener("pointerdown", prepararAudio);

  function relogioVisivel() {
    const caixa = el.cartao.getBoundingClientRect();
    return caixa.bottom > 0 && caixa.top < window.innerHeight;
  }

  const dialogos = [$("dialogo-estrutura"), $("dialogo-config"), $("dialogo-confirmacao")];

  // Barra de espaço inicia ou pausa, como o botão principal
  document.addEventListener("keydown", (evento) => {
    if (evento.key !== " " || evento.repeat || evento.ctrlKey || evento.metaKey || evento.altKey) return;
    if (dialogos.some((d) => d.open) || !relogioVisivel()) return;
    if (evento.target.closest("input, textarea, select, button, a, [contenteditable]")) return;
    if (estado.relogio.status === P.ENCERRADO) return;
    evento.preventDefault();
    alternar();
  });

  // Timers ficam lentos com a aba escondida: ao voltar, põe o relógio em dia na hora
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") ciclo();
    atualizarTravaTela();
  });
  window.addEventListener("pagehide", salvarEstado);

  const palco = $("palco-poker");
  const elementoTelaCheia = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const podeTelaCheia =
    !!(palco.requestFullscreen || palco.webkitRequestFullscreen) &&
    (document.fullscreenEnabled || document.webkitFullscreenEnabled);

  if (podeTelaCheia) {
    el.telaCheia.hidden = false;
    el.telaCheia.addEventListener("click", () => {
      try {
        if (elementoTelaCheia()) {
          (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else {
          const pedido = (palco.requestFullscreen || palco.webkitRequestFullscreen).call(palco);
          if (pedido && pedido.catch) pedido.catch(() => {});
        }
      } catch {
        // Recusado pelo navegador: continua na página normal
      }
    });
    const aoMudarTelaCheia = () => {
      const ativa = elementoTelaCheia() === palco;
      const rotulo = ativa ? "Sair da tela cheia" : "Tela cheia";
      el.telaCheia.setAttribute("aria-pressed", String(ativa));
      el.telaCheia.setAttribute("aria-label", rotulo);
      el.telaCheia.title = rotulo;
    };
    document.addEventListener("fullscreenchange", aoMudarTelaCheia);
    document.addEventListener("webkitfullscreenchange", aoMudarTelaCheia);
  }

  // ---------- Diálogos ----------

  function abrirDialogo(dialogo, foco) {
    if (typeof dialogo.showModal === "function") {
      if (!dialogo.open) dialogo.showModal();
    } else {
      dialogo.setAttribute("open", "");
    }
    if (foco) foco.focus();
  }

  function fecharDialogo(dialogo) {
    if (typeof dialogo.close === "function") dialogo.close();
    else dialogo.removeAttribute("open");
  }

  const dialogoConfirmacao = $("dialogo-confirmacao");
  let acaoConfirmada = null;

  /** Confirmação na própria página (o app usa um AlertDialog); nunca confirm(). */
  function confirmar({ titulo, texto, ok, acao }) {
    definirTexto($("confirmacao-titulo"), titulo);
    const paragrafo = $("confirmacao-texto");
    paragrafo.textContent = texto || "";
    paragrafo.hidden = !texto;
    definirTexto($("confirmacao-ok"), ok);
    acaoConfirmada = acao;
    abrirDialogo(dialogoConfirmacao, $("confirmacao-cancelar"));
  }

  $("confirmacao-ok").addEventListener("click", () => {
    const acao = acaoConfirmada;
    acaoConfirmada = null;
    fecharDialogo(dialogoConfirmacao);
    if (acao) acao();
  });
  $("confirmacao-cancelar").addEventListener("click", () => {
    acaoConfirmada = null;
    fecharDialogo(dialogoConfirmacao);
  });
  // Esc ou clique fora também cancelam
  dialogoConfirmacao.addEventListener("close", () => {
    acaoConfirmada = null;
  });
  dialogoConfirmacao.addEventListener("click", (evento) => {
    if (evento.target === dialogoConfirmacao) {
      acaoConfirmada = null;
      fecharDialogo(dialogoConfirmacao);
    }
  });

  // ---------- Estrutura de blinds ----------

  const dialogoEstrutura = $("dialogo-estrutura");
  const ICONE_CAFE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Zm11 1.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11 3.5v2.5M14 3.5v2.5" /></svg>';

  function abrirEstrutura() {
    const niveis = config.niveis;
    const r = estado.relogio;
    const atual = r.status === P.ENCERRADO ? niveis.length : r.indice;
    let itemAtual = null;
    const itens = niveis.map((n, i) => {
      const intervalo = P.ehIntervalo(n);
      const li = document.createElement("li");
      li.className = "poker-estrutura-item";
      if (intervalo) li.classList.add("intervalo");
      if (i < atual) li.classList.add("passado");
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "poker-linha-nivel";
      const numero = document.createElement("span");
      numero.className = "poker-linha-numero";
      if (intervalo) numero.innerHTML = ICONE_CAFE;
      else numero.textContent = String(P.numeroDoNivel(niveis, i));
      const descricao = document.createElement("span");
      descricao.className = "poker-linha-blinds";
      if (intervalo) {
        descricao.textContent = "Intervalo";
      } else {
        const valor = document.createElement("strong");
        valor.textContent = P.blinds(n);
        descricao.append(valor);
        if (n.ante > 0) {
          const ante = document.createElement("small");
          ante.textContent = `Ante: ${P.inteiro(n.ante)}`;
          descricao.append(ante);
        }
      }
      const duracao = document.createElement("span");
      duracao.className = "poker-linha-duracao";
      duracao.textContent = P.duracao(n.duracaoSegundos);
      botao.append(numero, descricao, duracao);
      const resumo = `${P.resumoNivel(niveis, i)}${intervalo ? "" : ` · ${P.duracao(n.duracaoSegundos)}`}`;
      if (i === atual) {
        const selo = document.createElement("span");
        selo.className = "poker-selo-atual";
        selo.textContent = "ATUAL";
        duracao.append(selo);
        li.setAttribute("aria-current", "step");
        botao.disabled = true;
        botao.setAttribute("aria-label", `${resumo}, atual`);
        itemAtual = li;
      } else {
        botao.setAttribute("aria-label", resumo);
        botao.addEventListener("click", () =>
          confirmar({
            titulo: `Ir para ${P.nomeDoNivel(niveis, i)}?`,
            texto: "O tempo do nível recomeça do início.",
            ok: "Ir",
            acao: () => {
              fecharDialogo(dialogoEstrutura);
              alterarRelogio((rel, t, parede) => R.irPara(rel, config.niveis, i, t, parede));
            },
          }),
        );
      }
      li.append(botao);
      return li;
    });
    $("lista-estrutura").replaceChildren(...itens);
    abrirDialogo(dialogoEstrutura, $("fechar-estrutura"));
    if (itemAtual) itemAtual.scrollIntoView({ block: "center" });
  }

  $("abrir-estrutura").addEventListener("click", abrirEstrutura);
  $("fechar-estrutura").addEventListener("click", () => fecharDialogo(dialogoEstrutura));
  dialogoEstrutura.addEventListener("click", (evento) => {
    if (evento.target === dialogoEstrutura) fecharDialogo(dialogoEstrutura);
  });

  // ---------- Configuração ----------

  const dialogoConfig = $("dialogo-config");
  const formulario = $("form-config");
  const listaNiveis = $("lista-niveis-edicao");
  const listaPremios = $("lista-premios-edicao");
  const erroConfig = $("erro-config");
  let rascunho = null;
  let original = null;

  const novoId = () =>
    typeof crypto === "object" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `n${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

  const camposGerais = () => [...formulario.querySelectorAll("[data-campo]:not([data-nivel])")];

  /** Campo numérico com texto que não é número: aria-invalid enquanto digita. */
  function marcarInvalido(campo) {
    if (campo.dataset.casas === undefined) return;
    const texto = campo.value.trim();
    const invalido = texto !== "" && P.ler(texto, Number(campo.dataset.casas)) === null;
    campo.setAttribute("aria-invalid", String(invalido));
  }

  function criarCampo({ id, rotulo, valor, casas, dados }) {
    const caixa = document.createElement("div");
    caixa.className = "field";
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = rotulo;
    const input = document.createElement("input");
    input.className = "input";
    input.id = id;
    input.value = valor;
    input.autocomplete = "off";
    input.inputMode = casas > 0 ? "decimal" : "numeric";
    input.dataset.casas = String(casas);
    Object.assign(input.dataset, dados);
    marcarInvalido(input);
    caixa.append(label, input);
    return caixa;
  }

  function desenharNiveisEdicao() {
    const itens = rascunho.niveis.map((n, i) => {
      const intervalo = n.tipo === P.INTERVALO;
      const titulo = P.tituloNivel(rascunho, i);
      const li = document.createElement("li");
      li.className = "poker-nivel-edicao";
      if (intervalo) li.classList.add("intervalo");
      const cabecalho = document.createElement("div");
      cabecalho.className = "poker-nivel-cabecalho";
      const nome = document.createElement("span");
      nome.className = "poker-nivel-nome";
      nome.textContent = titulo;
      const remover = document.createElement("button");
      remover.type = "button";
      remover.className = "poker-botao poker-remover";
      remover.dataset.remover = n.id;
      remover.setAttribute("aria-label", `Remover nível: ${titulo}`);
      remover.title = "Remover nível";
      remover.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 12.5h10L18 7M9 7V4.5h6V7" /></svg>';
      cabecalho.append(nome, remover);
      const campos = document.createElement("div");
      campos.className = "poker-nivel-campos";
      if (!intervalo) {
        campos.append(
          criarCampo({ id: `nivel-${i}-sb`, rotulo: "SB", valor: n.sb, casas: 0, dados: { nivel: n.id, campo: "sb" } }),
          criarCampo({ id: `nivel-${i}-bb`, rotulo: "BB", valor: n.bb, casas: 0, dados: { nivel: n.id, campo: "bb" } }),
          criarCampo({
            id: `nivel-${i}-ante`,
            rotulo: "Ante",
            valor: n.ante,
            casas: 0,
            dados: { nivel: n.id, campo: "ante" },
          }),
        );
      }
      campos.append(
        criarCampo({
          id: `nivel-${i}-minutos`,
          rotulo: "Minutos",
          valor: n.minutos,
          casas: 2,
          dados: { nivel: n.id, campo: "minutos" },
        }),
      );
      li.append(cabecalho, campos);
      return li;
    });
    listaNiveis.replaceChildren(...itens);
  }

  function atualizarTotal() {
    const vazio = !rascunho.premios.length;
    const linha = $("linha-total");
    linha.hidden = vazio;
    const soma = P.somaPremios(rascunho);
    const certo = soma === P.PONTOS_BASE_TOTAL;
    linha.dataset.certo = String(certo);
    definirTexto($("total-premios"), soma === null ? "—" : P.porcentagem(soma));
    $("erro-total").hidden = vazio || certo;
  }

  function desenharPremiosEdicao() {
    const n = rascunho.premios.length;
    definirTexto($("valor-posicoes"), String(n));
    $("menos-posicoes").disabled = n === 0;
    $("mais-posicoes").disabled = n >= MAX_POSICOES;
    const itens = rascunho.premios.map((texto, i) => {
      const li = document.createElement("li");
      li.className = "poker-premio-edicao";
      const label = document.createElement("label");
      label.htmlFor = `premio-${i}`;
      label.textContent = `${i + 1}º lugar`;
      const grupo = document.createElement("span");
      grupo.className = "poker-campo-porcentagem";
      const input = document.createElement("input");
      input.className = "input";
      input.id = `premio-${i}`;
      input.value = texto;
      input.autocomplete = "off";
      input.inputMode = "decimal";
      input.dataset.casas = "2";
      input.dataset.premio = String(i);
      marcarInvalido(input);
      const sufixo = document.createElement("span");
      sufixo.setAttribute("aria-hidden", "true");
      sufixo.textContent = "%";
      grupo.append(input, sufixo);
      li.append(label, grupo);
      return li;
    });
    listaPremios.replaceChildren(...itens);
    atualizarTotal();
  }

  function atualizarOpcionais() {
    $("grupo-rebuy").hidden = !rascunho.rebuy;
    $("grupo-addon").hidden = !rascunho.addOn;
  }

  function esconderErro() {
    erroConfig.hidden = true;
    erroConfig.textContent = "";
  }

  function abrirConfiguracao() {
    original = P.rascunho(config);
    rascunho = P.rascunho(config);
    for (const campo of camposGerais()) {
      if (campo.type === "checkbox") campo.checked = !!rascunho[campo.dataset.campo];
      else campo.value = rascunho[campo.dataset.campo];
      campo.removeAttribute("aria-invalid");
    }
    atualizarOpcionais();
    desenharNiveisEdicao();
    desenharPremiosEdicao();
    esconderErro();
    abrirDialogo(dialogoConfig);
    dialogoConfig.scrollTop = 0;
  }

  function aoEditar(evento) {
    const campo = evento.target;
    if (!(campo instanceof HTMLInputElement)) return;
    if (campo.dataset.nivel) {
      const chave = campo.dataset.campo;
      rascunho = P.alterarNivel(rascunho, campo.dataset.nivel, (n) => ({ ...n, [chave]: campo.value }));
    } else if (campo.dataset.premio !== undefined) {
      const premios = rascunho.premios.slice();
      premios[Number(campo.dataset.premio)] = campo.value;
      rascunho = { ...rascunho, premios };
      atualizarTotal();
    } else if (campo.dataset.campo) {
      const valor = campo.type === "checkbox" ? campo.checked : campo.value;
      rascunho = { ...rascunho, [campo.dataset.campo]: valor };
      if (campo.type === "checkbox") atualizarOpcionais();
    }
    marcarInvalido(campo);
    esconderErro();
  }

  formulario.addEventListener("input", aoEditar);
  formulario.addEventListener("change", aoEditar);

  listaNiveis.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-remover]");
    if (!botao) return;
    const indice = rascunho.niveis.findIndex((n) => n.id === botao.dataset.remover);
    rascunho = P.removerNivel(rascunho, botao.dataset.remover);
    desenharNiveisEdicao();
    esconderErro();
    // O foco vai para o próximo botão de remover (ou para "+ Nível" se a lista acabou)
    const restantes = listaNiveis.querySelectorAll("[data-remover]");
    (restantes[Math.min(indice, restantes.length - 1)] || $("adicionar-nivel")).focus();
  });

  function focarNovoNivel() {
    const ultimo = listaNiveis.lastElementChild;
    const campo = ultimo && ultimo.querySelector("input");
    if (campo) campo.focus();
  }

  $("adicionar-nivel").addEventListener("click", () => {
    rascunho = P.adicionarNivel(rascunho, novoId());
    desenharNiveisEdicao();
    esconderErro();
    focarNovoNivel();
  });
  $("adicionar-intervalo").addEventListener("click", () => {
    rascunho = P.adicionarIntervalo(rascunho, novoId());
    desenharNiveisEdicao();
    esconderErro();
    focarNovoNivel();
  });

  $("menos-posicoes").addEventListener("click", () => {
    rascunho = P.definirPosicoes(rascunho, rascunho.premios.length - 1);
    desenharPremiosEdicao();
    esconderErro();
  });
  $("mais-posicoes").addEventListener("click", () => {
    rascunho = P.definirPosicoes(rascunho, rascunho.premios.length + 1);
    desenharPremiosEdicao();
    esconderErro();
  });

  const CAMPO_DO_ERRO = {
    nome: "campo-nome",
    stack: "campo-stack",
    jogadores: "campo-jogadores",
    buyIn: "campo-buyin",
    casa: "campo-casa",
    niveis: "adicionar-nivel",
    rebuy: "campo-rebuy-valor",
    addOn: "campo-addon-valor",
    premiacao: "premio-0",
  };

  function mostrarErro(validacao) {
    erroConfig.textContent = P.mensagemErro(validacao, rascunho);
    erroConfig.hidden = false;
    let alvo = null;
    if (validacao.erro === "nivel") {
      const item = listaNiveis.children[validacao.indiceNivel];
      alvo = item && item.querySelector("input");
    } else {
      alvo = $(CAMPO_DO_ERRO[validacao.erro]);
    }
    if (alvo) {
      if (alvo instanceof HTMLInputElement) alvo.setAttribute("aria-invalid", "true");
      alvo.focus();
    }
  }

  function salvarConfiguracao(nova) {
    config = nova;
    gravar(CHAVE_CONFIG, config);
    original = rascunho;
    fecharDialogo(dialogoConfig);
    publicar(P.estadoInicial(config));
    agendar();
    atualizarTravaTela();
    anunciar("Configuração salva. O torneio está pronto para começar.");
  }

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const validacao = P.validar(rascunho);
    if (!validacao.ok) {
      mostrarErro(validacao);
      return;
    }
    atualizarRelogio();
    if (P.emAndamento(config, estado)) {
      confirmar({
        titulo: "Salvar configuração",
        texto: "Salvar reinicia o torneio em andamento (relógio e contadores). Continuar?",
        ok: "Salvar configuração",
        acao: () => salvarConfiguracao(validacao.config),
      });
    } else {
      salvarConfiguracao(validacao.config);
    }
  });

  const alterado = () => JSON.stringify(rascunho) !== JSON.stringify(original);

  function pedirFecharConfiguracao() {
    if (!alterado()) {
      fecharDialogo(dialogoConfig);
      return;
    }
    confirmar({ titulo: "Descartar as alterações?", texto: "", ok: "Descartar", acao: () => fecharDialogo(dialogoConfig) });
  }

  $("abrir-config").addEventListener("click", abrirConfiguracao);
  $("cancelar-config").addEventListener("click", pedirFecharConfiguracao);
  // Esc com alterações pede confirmação, como o botão voltar do app
  dialogoConfig.addEventListener("cancel", (evento) => {
    evento.preventDefault();
    pedirFecharConfiguracao();
  });

  // ---------- Início ----------

  const t0 = atualizarRelogio();
  desenhar(t0);
  agendar(t0);
  atualizarTravaTela();
})();
