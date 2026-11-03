"use strict";
/*
 * Interface do Jogo da Memória. Regras em jogo-da-memoria-logica.js; o fluxo segue
 * ui/telas/jogo/JogoViewModel.kt do app: o par errado volta para baixo depois de 1 segundo, o
 * tempo começa na primeira carta e os 10 melhores resultados de cada nível ficam guardados.
 * Partida e recordes ficam no localStorage.
 */
(() => {
  const raiz = document.querySelector(".jogo-memoria");
  if (!raiz || typeof LogicaMemoria !== "object") return;
  const M = LogicaMemoria;

  const CHAVE_PARTIDA = "efs-jogo-da-memoria-partida";
  const CHAVE_RECORDES = "efs-jogo-da-memoria-recordes";
  const TRAVA_DIALOGO_MS = 500;

  const tabuleiro = raiz.querySelector("#jm-tabuleiro");
  const textoTempo = raiz.querySelector("#jm-tempo");
  const textoMovimentos = raiz.querySelector("#jm-movimentos");
  const textoPares = raiz.querySelector("#jm-pares");
  const textoRecorde = raiz.querySelector("#jm-recorde");
  const botaoReiniciar = raiz.querySelector("#jm-reiniciar");
  const botoesNivel = [...raiz.querySelectorAll("[data-nivel]")];
  const status = raiz.querySelector("#jm-status");
  const recordesNivel = raiz.querySelector("#jm-recordes-nivel");
  const recordesLista = raiz.querySelector("#jm-recordes-lista");
  const recordesVazio = raiz.querySelector("#jm-recordes-vazio");
  const dialogo = raiz.querySelector("#jm-dialogo");
  const dialogoTitulo = raiz.querySelector("#jm-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#jm-dialogo-texto");
  const dialogoDados = raiz.querySelector("#jm-dialogo-dados");
  const dialogoBotoes = raiz.querySelector("#jm-dialogo-botoes");

  let estado;
  let recordes = { facil: [], medio: [], dificil: [] };
  /** Partida restaurada: o tempo só volta a correr na próxima carta virada. */
  let retomada = false;
  let acumuladoMs = 0;
  let inicioTrecho = null;
  let tique = null;
  let espera = null;
  let foco = 0;
  let cartasEl = [];

  const nivel = () => M.NIVEIS[estado.nivel];

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

  const salvar = () => {
    if (!M.concluido(estado)) gravar(CHAVE_PARTIDA, M.paraSalvar(estado));
  };

  // ---------- Cronômetro ----------

  const decorridoMs = () => acumuladoMs + (inicioTrecho === null ? 0 : performance.now() - inicioTrecho);

  function sincronizarSegundos() {
    const segundos = Math.floor(decorridoMs() / 1000);
    if (segundos !== estado.segundos) estado = { ...estado, segundos };
    textoTempo.textContent = M.formatarTempo(estado.segundos);
  }

  function atualizarCronometro() {
    const deveRodar = estado.iniciado && !retomada && !M.concluido(estado) && document.visibilityState === "visible";
    if (deveRodar && inicioTrecho === null) {
      inicioTrecho = performance.now();
      tique = setInterval(sincronizarSegundos, 250);
    } else if (!deveRodar && inicioTrecho !== null) {
      acumuladoMs = decorridoMs();
      inicioTrecho = null;
      clearInterval(tique);
      sincronizarSegundos();
    }
    textoTempo.textContent = M.formatarTempo(estado.segundos);
  }

  // ---------- Desenho ----------

  function montarCartas() {
    const n = nivel();
    tabuleiro.style.setProperty("--colunas", n.colunas);
    tabuleiro.dataset.nivel = n.id;
    cartasEl = estado.cartas.map((carta) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "jm-carta";
      botao.dataset.id = String(carta.id);
      botao.tabIndex = -1;
      const verso = document.createElement("span");
      verso.className = "jm-face jm-verso";
      verso.setAttribute("aria-hidden", "true");
      const frente = document.createElement("span");
      frente.className = "jm-face jm-frente";
      frente.setAttribute("aria-hidden", "true");
      frente.textContent = carta.emoji;
      botao.append(verso, frente);
      return botao;
    });
    tabuleiro.classList.add("sem-animacao");
    tabuleiro.replaceChildren(...cartasEl);
    foco = Math.min(foco, cartasEl.length - 1);
  }

  function desenhar() {
    const erro = M.aguardandoDesvirar(estado);
    estado.cartas.forEach((carta, i) => {
      const botao = cartasEl[i];
      botao.classList.toggle("virada", carta.virada);
      botao.classList.toggle("encontrada", carta.encontrada);
      botao.classList.toggle("erro", erro && estado.selecionadas.includes(carta.id));
      const numero = `Carta ${i + 1}`;
      botao.setAttribute(
        "aria-label",
        carta.encontrada ? `${numero}: ${carta.emoji}, par encontrado` : carta.virada ? `${numero}: ${carta.emoji}` : `${numero}, virada para baixo`,
      );
      botao.tabIndex = i === foco ? 0 : -1;
    });
    textoMovimentos.textContent = String(estado.movimentos);
    textoPares.textContent = `${M.paresEncontrados(estado)}/${M.pares(nivel())}`;
    for (const botao of botoesNivel) {
      const ativo = botao.dataset.nivel === estado.nivel;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    atualizarCronometro();
  }

  function desenharRecordes() {
    const tabela = recordes[estado.nivel];
    textoRecorde.textContent = tabela.length ? `Seu recorde: ${M.resumoRecorde(tabela[0])}` : "Sem recorde ainda";
    recordesNivel.textContent = nivel().nome;
    const data = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
    const itens = tabela.map((r) => {
      const item = document.createElement("li");
      item.textContent = `${M.resumoRecorde(r)}${r.dataMs ? ` · ${data.format(new Date(r.dataMs))}` : ""}`;
      return item;
    });
    recordesLista.replaceChildren(...itens);
    recordesLista.hidden = itens.length === 0;
    recordesVazio.hidden = itens.length > 0;
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
    status.textContent = `${titulo}. ${texto}`;
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

  function novaPartida(nivelId = estado.nivel) {
    fecharDialogo();
    clearTimeout(espera);
    espera = null;
    if (inicioTrecho !== null) clearInterval(tique);
    inicioTrecho = null;
    acumuladoMs = 0;
    retomada = false;
    foco = 0;
    estado = M.novoJogo(M.NIVEIS[nivelId]);
    montarCartas();
    desenhar();
    desenharRecordes();
    salvar();
    requestAnimationFrame(() => tabuleiro.classList.remove("sem-animacao"));
    status.textContent = `Nova partida no nível ${nivel().nome}: ${M.pares(nivel())} pares.`;
  }

  function confirmarNovaPartida(nivelId = estado.nivel) {
    if (!estado.iniciado || M.concluido(estado)) {
      novaPartida(nivelId);
      return;
    }
    abrirDialogo({
      titulo: "Reiniciar jogo",
      texto: "Tem certeza que deseja começar uma nova partida? O progresso desta partida será perdido.",
      botoes: [
        { rotulo: "Sim, reiniciar", acao: () => novaPartida(nivelId) },
        { rotulo: "Não", acao: () => {}, secundario: true },
      ],
    });
  }

  function virar(id) {
    const novo = M.virar(estado, id);
    if (!novo) return;
    const antes = estado;
    estado = novo;
    retomada = false;
    desenhar();
    if (M.concluido(estado)) {
      concluir();
      return;
    }
    salvar();
    const carta = estado.cartas[id];
    if (M.aguardandoDesvirar(estado)) {
      status.textContent = `${carta.emoji}. Não formou par.`;
      espera = setTimeout(() => {
        espera = null;
        estado = M.desvirar(estado);
        desenhar();
        salvar();
      }, M.ESPERA_DESVIRAR_MS);
    } else if (M.paresEncontrados(estado) > M.paresEncontrados(antes)) {
      status.textContent = `Par encontrado: ${carta.emoji}. ${M.paresEncontrados(estado)} de ${M.pares(nivel())} pares.`;
    } else {
      status.textContent = carta.emoji;
    }
  }

  function concluir() {
    acumuladoMs = decorridoMs();
    inicioTrecho = null;
    clearInterval(tique);
    sincronizarSegundos();
    gravar(CHAVE_PARTIDA, null);
    const anterior = recordes[estado.nivel][0];
    const resultado = { segundos: estado.segundos, movimentos: estado.movimentos, dataMs: Date.now() };
    const { tabela, posicao } = M.inserirRecorde(recordes[estado.nivel], resultado);
    recordes = { ...recordes, [estado.nivel]: tabela };
    gravar(CHAVE_RECORDES, recordes);
    desenharRecordes();
    const dados = [
      ["Tempo", M.formatarTempo(resultado.segundos)],
      ["Movimentos", String(resultado.movimentos)],
    ];
    if (posicao === 1) dados.push(["Novo recorde neste nível!", "1º lugar", true]);
    else if (posicao) dados.push(["Posição nos seus recordes", `${posicao}º lugar`, true]);
    if (posicao !== 1 && anterior) dados.push(["Seu recorde", M.resumoRecorde(anterior)]);
    setTimeout(() => {
      abrirDialogo({
        titulo: "Parabéns!",
        texto: `Você completou o nível ${nivel().nome}!`,
        dados,
        botoes: [
          { rotulo: "Jogar novamente", acao: () => novaPartida() },
          { rotulo: "Fechar", acao: () => cartasEl[foco]?.focus(), secundario: true },
        ],
      });
    }, 450);
  }

  // ---------- Controles ----------

  tabuleiro.addEventListener("click", (evento) => {
    const botao = evento.target.closest(".jm-carta");
    if (!botao) return;
    foco = Number(botao.dataset.id);
    virar(foco);
  });

  tabuleiro.addEventListener("keydown", (evento) => {
    const botao = evento.target.closest?.(".jm-carta");
    if (!botao || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const i = Number(botao.dataset.id);
    const { colunas } = nivel();
    const total = cartasEl.length;
    const destino = {
      ArrowLeft: i % colunas > 0 ? i - 1 : i,
      ArrowRight: i % colunas < colunas - 1 ? i + 1 : i,
      ArrowUp: i - colunas >= 0 ? i - colunas : i,
      ArrowDown: i + colunas < total ? i + colunas : i,
      Home: i - (i % colunas),
      End: i - (i % colunas) + colunas - 1,
    }[evento.key];
    if (destino === undefined) return;
    evento.preventDefault();
    foco = destino;
    cartasEl.forEach((el, j) => (el.tabIndex = j === foco ? 0 : -1));
    cartasEl[foco].focus();
  });

  for (const botao of botoesNivel) {
    botao.addEventListener("click", () => {
      if (botao.dataset.nivel !== estado.nivel) confirmarNovaPartida(botao.dataset.nivel);
    });
  }
  botaoReiniciar.addEventListener("click", () => confirmarNovaPartida());

  document.addEventListener("visibilitychange", () => {
    atualizarCronometro();
    if (document.visibilityState === "hidden") salvar();
  });
  window.addEventListener("pagehide", salvar);

  // ---------- Início ----------

  const salvos = lerJson(CHAVE_RECORDES);
  if (salvos && typeof salvos === "object") {
    for (const id of Object.keys(recordes)) recordes[id] = M.lerRecordes(salvos[id]);
  }
  const salva = lerJson(CHAVE_PARTIDA);
  const restaurada = salva && M.restaurar(salva.nivel, salva.emojis, salva.encontradas, salva.movimentos, salva.segundos, salva.iniciado);
  if (restaurada && !M.concluido(restaurada)) {
    estado = restaurada;
    acumuladoMs = estado.segundos * 1000;
    retomada = estado.iniciado;
    montarCartas();
    desenhar();
    desenharRecordes();
    requestAnimationFrame(() => tabuleiro.classList.remove("sem-animacao"));
  } else {
    estado = M.novoJogo(M.NIVEIS.facil);
    novaPartida("facil");
  }
})();
