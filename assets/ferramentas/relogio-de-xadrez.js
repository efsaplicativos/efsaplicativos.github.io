"use strict";
/*
 * Interface do relógio de xadrez. A contagem fica em relogio-de-xadrez-logica.js; as telas
 * seguem ui/telas/relogio (TelaRelogio.kt, MetadeJogador.kt, BarraControles.kt,
 * AlertaFimDeTempo.kt) e ui/telas/configuracao/TelaConfiguracao.kt do app Relógio Xadrez.
 */
(() => {
  const raiz = document.querySelector("#relogio-xadrez");
  if (!raiz || typeof LogicaXadrez !== "object") return;
  const L = LogicaXadrez;

  const CHAVE_PREFERENCIAS = "efs-relogio-de-xadrez-preferencias";
  const CHAVE_PARTIDA = "efs-relogio-de-xadrez-partida";
  const VIBRACAO_FIM = [0, 400, 150, 400, 150, 700];
  const NOMES = { brancas: "Brancas", pretas: "Pretas" };
  const NOMES_SISTEMA = { nenhum: "Nenhum", fischer: "Fischer", bronstein: "Bronstein", atraso: "Atraso" };
  const DESCRICOES_SISTEMA = {
    nenhum: "Cada jogador tem apenas o tempo inicial.",
    fischer: "O incremento é somado ao seu tempo depois de cada lance.",
    bronstein: "Depois de cada lance você recupera o tempo gasto, até o limite do incremento.",
    atraso: "Seu relógio só começa a descontar depois dos segundos de atraso de cada lance.",
  };
  const NOMES_CATEGORIA = { bullet: "Bullet", blitz: "Blitz", rapida: "Rápida", classica: "Clássica" };

  const $ = (id) => document.getElementById(id);
  const palco = $("palco");
  const areaRelogio = $("relogio");
  const metades = { distante: $("metade-distante"), proxima: $("metade-proxima") };
  const botaoTrocar = $("trocar-lados");
  const botaoReiniciar = $("reiniciar");
  const botaoPrincipal = $("iniciar-pausar");
  const botaoConfig = $("abrir-config");
  const botaoSom = $("alternar-som");
  const botaoTelaCheia = $("tela-cheia");
  const aviso = $("aviso-relogio");
  const ritmoAtual = $("ritmo-atual");
  const sistemaAtual = $("sistema-atual");
  const dialogoConfig = $("config-xadrez");
  const dialogoReinicio = $("confirmar-reinicio");

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
      // Armazenamento bloqueado ou cheio: o relógio continua funcionando sem salvar
    }
  }

  const salvas = ler(CHAVE_PREFERENCIAS) || {};
  const booleano = (valor, padrao) => (typeof valor === "boolean" ? valor : padrao);
  const preferencias = {
    configuracao: L.configuracaoValida(salvas.configuracao) ? { ...salvas.configuracao } : { ...L.PADRAO },
    som: booleano(salvas.som, true),
    vibracao: booleano(salvas.vibracao, true),
    brancasEmBaixo: booleano(salvas.brancasEmBaixo, true),
  };

  const partidaSalva = L.lerInstantaneo(ler(CHAVE_PARTIDA));
  let relogio = partidaSalva
    ? L.restaurar(partidaSalva, agora)
    : new L.Relogio({ ...preferencias.configuracao }, agora);
  preferencias.configuracao = { ...relogio.configuracao };

  const salvarPreferencias = () => gravar(CHAVE_PREFERENCIAS, preferencias);
  const salvarPartida = () => gravar(CHAVE_PARTIDA, relogio.instantaneo());

  // ---------- Som, vibração e tela acesa ----------

  let audio = null;

  /** O navegador só libera o áudio depois de um gesto do usuário; chamado a cada toque. */
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

  /** Alerta de cerca de 1,2 s em bipes alternados, gerado na hora (sem arquivo de som). */
  function tocarAlerta() {
    if (!audio) return;
    try {
      const inicio = audio.currentTime + 0.02;
      for (let i = 0; i < 4; i++) {
        const t = inicio + i * 0.3;
        const oscilador = audio.createOscillator();
        const volume = audio.createGain();
        oscilador.type = "square";
        oscilador.frequency.value = i % 2 ? 880 : 1175;
        volume.gain.setValueAtTime(0.0001, t);
        volume.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
        volume.gain.setValueAtTime(0.18, t + 0.19);
        volume.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        oscilador.connect(volume).connect(audio.destination);
        oscilador.start(t);
        oscilador.stop(t + 0.24);
      }
    } catch {
      // Sem som disponível: o aviso visual continua
    }
  }

  function vibrar(padrao) {
    if (!vibracaoDisponivel || !preferencias.vibracao) return;
    try {
      navigator.vibrate(padrao);
    } catch {
      // Ignorado: vibração é opcional
    }
  }

  let travaTela = null;
  let pedindoTrava = false;

  /** Mantém a tela acesa só com o relógio correndo; sem a API (ou recusada), segue sem ela. */
  async function atualizarTravaTela() {
    const querTrava = relogio.estado === "ativo" && document.visibilityState === "visible";
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
      if (relogio.estado !== "ativo") atualizarTravaTela();
    } else if (!querTrava && travaTela) {
      const trava = travaTela;
      travaTela = null;
      trava.release().catch(() => {});
    }
  }

  // ---------- Desenho ----------

  /** Metade de cima (ou da esquerda) fica com as pretas, a não ser que os lados tenham sido trocados. */
  const jogadorDa = (metade) =>
    (metade === "proxima") === preferencias.brancasEmBaixo ? L.BRANCAS : L.PRETAS;

  function aparencia(jogador) {
    const critico = relogio.restanteMs(jogador) < L.LIMITE_DECIMOS_MS;
    const daVez = relogio.vez === jogador;
    switch (true) {
      case relogio.estado === "encerrado":
        return relogio.perdedor === jogador ? "derrota" : "vitoria";
      case relogio.estado === "ativo" && daVez:
        return critico ? "critica" : "ativa";
      case relogio.estado === "pausado" && daVez:
        return "pausada";
      case critico:
        return "critica-inativa";
      default:
        return "inativa";
    }
  }

  function status(jogador) {
    switch (relogio.estado) {
      case "pronto":
        return "Toque para iniciar";
      case "ativo":
        return relogio.vez === jogador ? "Sua vez" : "Aguardando";
      case "pausado":
        return "Pausado";
      default:
        return relogio.perdedor === jogador ? "Tempo esgotado" : "Vencedor";
    }
  }

  /** Largura do texto em "em" (algarismos ~0,57; ":" e "." ~0,3), como em MetadeJogador.kt. */
  const larguraEstimada = (texto) => [...texto].reduce((soma, c) => soma + (/\d/.test(c) ? 0.57 : 0.3), 0);
  const LARGURA_MINIMA = larguraEstimada("0:00.0");

  const elementos = {};
  for (const metade of Object.keys(metades)) {
    const botao = metades[metade];
    elementos[metade] = {
      nome: botao.querySelector(".xadrez-nome"),
      lances: botao.querySelector(".xadrez-lances"),
      tempo: botao.querySelector(".xadrez-tempo"),
      status: botao.querySelector(".xadrez-status"),
      atraso: botao.querySelector(".xadrez-atraso"),
      barra: botao.querySelector(".xadrez-atraso-barra"),
    };
  }

  // Só mexe no DOM quando o valor muda: o laço redesenha várias vezes por segundo
  function definirTexto(elemento, texto) {
    if (elemento.textContent !== texto) elemento.textContent = texto;
  }

  function definirAtributo(elemento, nome, valor) {
    if (elemento.getAttribute(nome) !== valor) elemento.setAttribute(nome, valor);
  }

  function desenharMetade(metade) {
    const jogador = jogadorDa(metade);
    const botao = metades[metade];
    const el = elementos[metade];
    const tempo = L.formatar(relogio.restanteMs(jogador));
    const textoStatus = status(jogador);
    definirTexto(el.nome, NOMES[jogador]);
    definirTexto(el.lances, `Lances: ${relogio.lances(jogador)}`);
    definirTexto(el.tempo, tempo);
    definirTexto(el.status, textoStatus);
    definirAtributo(botao, "data-aparencia", aparencia(jogador));
    definirAtributo(botao, "data-jogador", jogador);
    definirAtributo(botao, "aria-label", `${NOMES[jogador]}, ${tempo}, ${textoStatus}`);
    const largura = Math.max(larguraEstimada(tempo), LARGURA_MINIMA) * 1.1;
    botao.style.setProperty("--largura-tempo", largura.toFixed(2));

    const incremento = relogio.configuracao.incrementoMs;
    const fracao =
      relogio.configuracao.sistema === "atraso" && incremento > 0 && relogio.vez === jogador
        ? relogio.atrasoRestanteMs() / incremento
        : 0;
    el.atraso.hidden = fracao <= 0;
    if (fracao > 0) el.barra.style.transform = `scaleX(${fracao.toFixed(3)})`;
  }

  function desenharControles() {
    const estado = relogio.estado;
    const ativo = estado === "ativo";
    const rotulo = ativo ? "Pausar" : estado === "pausado" ? "Retomar" : "Iniciar";
    definirAtributo(botaoPrincipal, "aria-label", rotulo);
    definirAtributo(botaoPrincipal, "title", rotulo);
    botaoPrincipal.classList.toggle("pausar", ativo);
    botaoPrincipal.disabled = estado === "encerrado";
    botaoTrocar.disabled = ativo;
    botaoReiniciar.disabled = estado === "pronto";
    botaoConfig.disabled = ativo;
    definirAtributo(botaoSom, "aria-pressed", String(preferencias.som));
    areaRelogio.dataset.estado = estado;
    definirTexto(ritmoAtual, L.ritmo(relogio.configuracao));
    definirTexto(sistemaAtual, NOMES_SISTEMA[relogio.configuracao.sistema]);
  }

  function desenhar() {
    desenharMetade("distante");
    desenharMetade("proxima");
    desenharControles();
  }

  /** Anuncia só mudanças de estado (não cada segundo) para leitores de tela. */
  function anunciar() {
    let texto = "";
    switch (relogio.estado) {
      case "ativo":
        texto = `Vez das ${NOMES[relogio.vez].toLowerCase()}.`;
        break;
      case "pausado":
        texto = "Relógio pausado.";
        break;
      case "encerrado":
        texto = `Tempo esgotado para as ${NOMES[relogio.perdedor].toLowerCase()}. ${NOMES[L.oponente(relogio.perdedor)]} vencem.`;
        break;
      default:
        texto = "Relógio pronto. Toque em uma metade para iniciar.";
    }
    aviso.textContent = texto;
  }

  // ---------- Laço de atualização ----------

  let temporizador = null;

  function agendar() {
    clearTimeout(temporizador);
    temporizador = null;
    if (relogio.estado === "ativo") temporizador = setTimeout(atualizar, relogio.msAteProximaMudanca());
  }

  function atualizar() {
    const antes = relogio.estado;
    relogio.verificarQueda();
    aposMudanca(antes, false);
  }

  /** Depois de qualquer ação: dispara o alerta na queda da bandeira, salva e redesenha. */
  function aposMudanca(estadoAnterior, salvar = true) {
    const mudouEstado = estadoAnterior !== relogio.estado;
    if (estadoAnterior !== "encerrado" && relogio.estado === "encerrado") {
      if (preferencias.som) tocarAlerta();
      vibrar(VIBRACAO_FIM);
    }
    if (salvar || mudouEstado) salvarPartida();
    desenhar();
    if (mudouEstado) {
      anunciar();
      atualizarTravaTela();
    }
    agendar();
  }

  function executar(acao) {
    const antes = relogio.estado;
    const vezAntes = relogio.vez;
    acao();
    aposMudanca(antes);
    if (relogio.estado === "ativo" && relogio.vez !== vezAntes && antes === "ativo") anunciar();
  }

  // ---------- Ações ----------

  function tocarMetade(metade) {
    prepararAudio();
    const jogador = jogadorDa(metade);
    const antes = relogio.estado;
    const lancesAntes = relogio.lances(jogador);
    executar(() => relogio.tocar(jogador));
    // Um toque curto confirma o lance, como no app
    if (antes === "pronto" || relogio.lances(jogador) !== lancesAntes) vibrar(15);
  }

  function iniciarOuPausar() {
    prepararAudio();
    if (relogio.estado === "ativo") executar(() => relogio.pausar());
    else if (relogio.estado === "pronto") executar(() => relogio.iniciar());
    else executar(() => relogio.retomar());
  }

  function pedirReinicio() {
    if (relogio.estado === "pronto") return;
    if (!relogio.partidaEmAndamento) {
      executar(() => relogio.reiniciar());
      return;
    }
    // Como no app: o relógio pausa enquanto a confirmação está aberta
    executar(() => relogio.pausar());
    abrirDialogo(dialogoReinicio, $("cancelar-reinicio"));
  }

  function trocarLados() {
    if (relogio.estado === "ativo") return;
    preferencias.brancasEmBaixo = !preferencias.brancasEmBaixo;
    salvarPreferencias();
    desenhar();
    aviso.textContent = `Brancas ${preferencias.brancasEmBaixo ? "embaixo" : "em cima"}.`;
  }

  function alternarSom() {
    prepararAudio();
    preferencias.som = !preferencias.som;
    salvarPreferencias();
    desenharControles();
  }

  for (const metade of Object.keys(metades)) {
    const botao = metades[metade];
    // Reage ao encostar o dedo, não ao soltar: o lance termina no instante do toque
    botao.addEventListener("pointerdown", (evento) => {
      // Sem filtrar isPrimary: o dedo do adversário ainda na tela não pode bloquear o toque
      if (evento.button > 0) return;
      evento.preventDefault();
      tocarMetade(metade);
    });
    // Enter ou espaço com a metade em foco (o clique do ponteiro já foi tratado no pointerdown)
    botao.addEventListener("click", (evento) => {
      if (evento.detail === 0) tocarMetade(metade);
    });
    botao.addEventListener("contextmenu", (evento) => evento.preventDefault());
  }

  // Botões da barra não guardam o foco do mouse ou do toque: assim a barra de espaço continua
  // encerrando o lance em vez de repetir o último botão clicado
  areaRelogio.querySelector(".xadrez-controles").addEventListener("pointerdown", (evento) => {
    if (evento.target.closest("button")) evento.preventDefault();
  });

  botaoPrincipal.addEventListener("click", iniciarOuPausar);
  botaoReiniciar.addEventListener("click", pedirReinicio);
  botaoTrocar.addEventListener("click", trocarLados);
  botaoSom.addEventListener("click", alternarSom);
  botaoConfig.addEventListener("click", abrirConfiguracao);

  $("cancelar-reinicio").addEventListener("click", () => fecharDialogo(dialogoReinicio));
  $("confirmar-reinicio-botao").addEventListener("click", () => {
    fecharDialogo(dialogoReinicio);
    executar(() => relogio.reiniciar());
  });

  function relogioVisivel() {
    const caixa = areaRelogio.getBoundingClientRect();
    return caixa.bottom > 0 && caixa.top < window.innerHeight;
  }

  const algumDialogoAberto = () => dialogoConfig.open || dialogoReinicio.open;

  // Atalhos: espaço encerra o lance de quem está na vez; P pausa ou retoma
  document.addEventListener("keydown", (evento) => {
    if (evento.ctrlKey || evento.metaKey || evento.altKey || evento.repeat) return;
    if (algumDialogoAberto() || !relogioVisivel()) return;
    if (evento.target.closest("input, textarea, select, button, a, [contenteditable]")) return;
    if (evento.key === " " || evento.code === "Space") {
      if (relogio.estado !== "pronto" && relogio.estado !== "ativo") return;
      evento.preventDefault();
      prepararAudio();
      const jogador = relogio.vez ?? L.BRANCAS;
      executar(() => relogio.tocar(jogador));
    } else if (evento.key === "p" || evento.key === "P") {
      if (relogio.estado === "encerrado") return;
      evento.preventDefault();
      iniciarOuPausar();
    }
  });

  // O navegador pode suspender a página escondida: pausa e salva, como o app faz em ON_STOP
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (relogio.estado === "ativo") executar(() => relogio.pausar());
      else salvarPartida();
    }
    atualizarTravaTela();
  });
  window.addEventListener("pagehide", salvarPartida);

  // ---------- Tela cheia ----------

  const elementoTelaCheia = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const podeTelaCheia =
    !!(palco.requestFullscreen || palco.webkitRequestFullscreen) &&
    (document.fullscreenEnabled || document.webkitFullscreenEnabled);

  if (podeTelaCheia) {
    botaoTelaCheia.hidden = false;
    botaoTelaCheia.addEventListener("click", () => {
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
      botaoTelaCheia.setAttribute("aria-pressed", String(ativa));
      const rotulo = ativa ? "Sair da tela cheia" : "Tela cheia";
      botaoTelaCheia.setAttribute("aria-label", rotulo);
      botaoTelaCheia.title = rotulo;
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

  // Clique no fundo escurecido fecha o diálogo, como Cancelar
  for (const dialogo of [dialogoConfig, dialogoReinicio]) {
    dialogo.addEventListener("click", (evento) => {
      if (evento.target === dialogo) fecharDialogo(dialogo);
    });
  }

  // ---------- Configuração ----------

  const formulario = $("form-config");
  const campoMinutos = $("campo-minutos");
  const campoIncremento = $("campo-incremento");
  const botoesSistema = [...formulario.querySelectorAll("[data-sistema]")];
  const opcaoSom = $("opcao-som");
  const opcaoVibracao = $("opcao-vibracao");
  const botaoSalvar = $("salvar-config");
  const listaPredefinicoes = $("lista-predefinicoes");
  let sistemaRascunho = "fischer";

  $("linha-vibracao").hidden = !vibracaoDisponivel;

  // Predefinições agrupadas por categoria, como na tela de configuração do app
  const botoesPredefinicao = [];
  for (const categoria of L.CATEGORIAS) {
    const itens = L.PREDEFINICOES.filter((p) => p.categoria === categoria);
    if (!itens.length) continue;
    const grupo = document.createElement("div");
    grupo.className = "xadrez-categoria";
    const titulo = document.createElement("span");
    titulo.className = "xadrez-categoria-nome";
    titulo.id = `categoria-${categoria}`;
    titulo.textContent = NOMES_CATEGORIA[categoria];
    const botoes = document.createElement("div");
    botoes.className = "segmented";
    botoes.setAttribute("role", "group");
    botoes.setAttribute("aria-labelledby", titulo.id);
    for (const predefinicao of itens) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "filter";
      botao.textContent = L.ritmo(predefinicao.configuracao);
      botao.setAttribute("aria-pressed", "false");
      botao.addEventListener("click", () => {
        campoMinutos.value = String(predefinicao.minutos);
        campoIncremento.value = String(predefinicao.incrementoSegundos);
        sistemaRascunho = predefinicao.sistema;
        atualizarRascunho();
      });
      botoesPredefinicao.push({ botao, configuracao: predefinicao.configuracao });
      botoes.append(botao);
    }
    grupo.append(titulo, botoes);
    listaPredefinicoes.append(grupo);
  }

  for (const botao of botoesSistema) {
    botao.addEventListener("click", () => {
      sistemaRascunho = botao.dataset.sistema;
      // Ao sair de "Nenhum" com incremento zerado, sugere 2 s para o campo não ficar sem efeito
      if (sistemaRascunho !== "nenhum" && L.lerIncremento(campoIncremento.value) === 0) campoIncremento.value = "2";
      atualizarRascunho();
    });
  }

  /** Configuração descrita pelo formulário, ou null se algum campo for inválido. */
  function rascunho() {
    const minutos = L.lerMinutos(campoMinutos.value);
    const incremento = sistemaRascunho === "nenhum" ? 0 : L.lerIncremento(campoIncremento.value);
    if (minutos === null || incremento === null) return null;
    return L.deMinutos(minutos, incremento, sistemaRascunho);
  }

  function atualizarRascunho() {
    const semIncremento = sistemaRascunho === "nenhum";
    campoIncremento.disabled = semIncremento;
    const minutosOk = L.lerMinutos(campoMinutos.value) !== null;
    const incrementoOk = semIncremento || L.lerIncremento(campoIncremento.value) !== null;
    campoMinutos.setAttribute("aria-invalid", String(!minutosOk));
    campoIncremento.setAttribute("aria-invalid", String(!incrementoOk));
    for (const botao of botoesSistema) {
      const ativo = botao.dataset.sistema === sistemaRascunho;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    $("descricao-sistema").textContent = DESCRICOES_SISTEMA[sistemaRascunho];
    const atual = rascunho();
    for (const { botao, configuracao } of botoesPredefinicao) {
      const escolhido = !!atual && L.mesmaConfiguracao(atual, configuracao);
      botao.classList.toggle("active", escolhido);
      botao.setAttribute("aria-pressed", String(escolhido));
    }
    botaoSalvar.disabled = !atual;
  }

  function abrirConfiguracao() {
    if (relogio.estado === "ativo") return;
    const c = relogio.configuracao;
    campoMinutos.value = String(L.minutos(c));
    campoIncremento.value = String(L.incrementoSegundos(c));
    sistemaRascunho = c.sistema;
    opcaoSom.checked = preferencias.som;
    opcaoVibracao.checked = preferencias.vibracao;
    $("aviso-reinicio").hidden = !relogio.partidaEmAndamento;
    atualizarRascunho();
    abrirDialogo(dialogoConfig);
  }

  campoMinutos.addEventListener("input", atualizarRascunho);
  campoIncremento.addEventListener("input", atualizarRascunho);
  $("cancelar-config").addEventListener("click", () => fecharDialogo(dialogoConfig));

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const nova = rascunho();
    if (!nova) return;
    preferencias.configuracao = { ...nova };
    preferencias.som = opcaoSom.checked;
    preferencias.vibracao = opcaoVibracao.checked;
    salvarPreferencias();
    fecharDialogo(dialogoConfig);
    executar(() => relogio.configurar({ ...nova }));
    aviso.textContent = `Ritmo ${L.ritmo(nova)}, ${NOMES_SISTEMA[nova.sistema]}. Relógio pronto.`;
  });

  desenhar();
  anunciar();
  agendar();
})();
