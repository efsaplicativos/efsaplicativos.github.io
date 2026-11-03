"use strict";
/*
 * Interface do jogo da velha. Regras e computador em jogo-da-velha-logica.js; o fluxo segue
 * ui/telas/jogo/JogoViewModel.kt do app Tic Tac Toe: o computador responde depois de 500 ms,
 * trocar de modo ou de nível começa outra partida, Desfazer só existe no modo 2 jogadores e o
 * histórico guarda as últimas 200 partidas contra o computador. Tudo fica no localStorage.
 */
(() => {
  const raiz = document.querySelector(".jogo-velha");
  if (!raiz || typeof LogicaVelha !== "object") return;
  const V = LogicaVelha;

  const CHAVE_PARTIDA = "efs-jogo-da-velha-partida";
  const CHAVE_HISTORICO = "efs-jogo-da-velha-historico";
  const TRAVA_DIALOGO_MS = 500;
  const HISTORICO_VISIVEL = 30;
  const SVG = "http://www.w3.org/2000/svg";

  const grade = raiz.querySelector("#jv-grade");
  const mensagem = raiz.querySelector("#jv-mensagem");
  const blocoNiveis = raiz.querySelector("#jv-niveis");
  const botoesModo = [...raiz.querySelectorAll("[data-modo]")];
  const botoesNivel = [...raiz.querySelectorAll("[data-nivel]")];
  const botaoNova = raiz.querySelector("#jv-nova");
  const botaoDesfazer = raiz.querySelector("#jv-desfazer");
  const cartaoPlacar = raiz.querySelector("#jv-placar");
  const botaoZerar = raiz.querySelector("#jv-zerar");
  const placarX = raiz.querySelector("#jv-placar-x");
  const placarO = raiz.querySelector("#jv-placar-o");
  const placarEmpates = raiz.querySelector("#jv-placar-empates");
  const cartaoDesempenho = raiz.querySelector("#jv-desempenho");
  const desempenhoNivel = raiz.querySelector("#jv-desempenho-nivel");
  const textoVitorias = raiz.querySelector("#jv-vitorias");
  const textoEmpates = raiz.querySelector("#jv-empates");
  const textoDerrotas = raiz.querySelector("#jv-derrotas");
  const historicoEl = raiz.querySelector("#jv-historico");
  const historicoTotal = raiz.querySelector("#jv-historico-total");
  const historicoLista = raiz.querySelector("#jv-historico-lista");
  const historicoVazio = raiz.querySelector("#jv-historico-vazio");
  const botaoLimpar = raiz.querySelector("#jv-limpar");
  const dialogo = raiz.querySelector("#jv-dialogo");
  const dialogoTitulo = raiz.querySelector("#jv-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#jv-dialogo-texto");
  const dialogoBotoes = raiz.querySelector("#jv-dialogo-botoes");
  // Sem a biblioteca de sons (script que não carregou), o jogo continua, só que mudo
  const som = typeof Sons === "object" ? Sons.criar("jogo-da-velha", raiz) : { tocar() {}, ligarBotao() {} };
  som.ligarBotao(raiz.querySelector("#jv-som"));

  /** Mesmo padrão do app: modo 2 jogadores e nível Médio. */
  let estado = { modo: "dois", nivel: "medio", partida: V.NOVA, placar: { ...V.PLACAR_ZERO } };
  let historico = [];
  let jogadaComputador = null;
  let foco = 4;
  let ultimaMensagem = "";

  const contraComputador = () => estado.modo === "computador";
  const vezDoComputador = () => contraComputador() && !estado.partida.terminada && estado.partida.vez === V.COMPUTADOR;
  const podeDesfazer = () => estado.modo === "dois" && estado.partida.jogadas.length > 0;

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

  const salvar = () =>
    gravar(CHAVE_PARTIDA, {
      modo: estado.modo,
      nivel: estado.nivel,
      jogadas: [...estado.partida.jogadas],
      placar: V.placarParaLista(estado.placar),
    });

  // ---------- Casas e marcas ----------

  function desenharMarca(jogador) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("jv-marca", jogador === V.X ? "jv-x" : "jv-o");
    const tracos =
      jogador === V.X
        ? [
            ["line", { x1: 22, y1: 22, x2: 78, y2: 78 }],
            ["line", { x1: 78, y1: 22, x2: 22, y2: 78 }],
          ]
        : [["circle", { cx: 50, cy: 50, r: 29 }]];
    for (const [tipo, atributos] of tracos) {
      const traco = document.createElementNS(SVG, tipo);
      for (const [nome, valor] of Object.entries(atributos)) traco.setAttribute(nome, String(valor));
      traco.setAttribute("pathLength", "1");
      svg.append(traco);
    }
    return svg;
  }

  const casasEl = Array.from({ length: V.TOTAL_CASAS }, (_, i) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "jv-casa";
    botao.dataset.casa = String(i);
    botao.tabIndex = i === foco ? 0 : -1;
    return botao;
  });
  const linhaVitoria = document.createElementNS(SVG, "svg");
  linhaVitoria.setAttribute("viewBox", "0 0 300 300");
  linhaVitoria.setAttribute("aria-hidden", "true");
  linhaVitoria.classList.add("jv-linha");
  grade.replaceChildren(...casasEl, linhaVitoria);

  /** Linha do centro da primeira casa ao da última, um pouco além das duas pontas. */
  function desenharLinhaVitoria(vitoria) {
    if (!vitoria) {
      linhaVitoria.replaceChildren();
      linhaVitoria.dataset.chave = "";
      return;
    }
    const chave = vitoria.linhas.map((l) => l.join("")).join("-");
    if (linhaVitoria.dataset.chave === chave) return;
    linhaVitoria.dataset.chave = chave;
    linhaVitoria.classList.toggle("jv-x", vitoria.jogador === V.X);
    linhaVitoria.classList.toggle("jv-o", vitoria.jogador === V.O);
    const centro = (i) => [(i % 3) * 100 + 50, Math.floor(i / 3) * 100 + 50];
    linhaVitoria.replaceChildren(
      ...vitoria.linhas.map((linha) => {
        const [x1, y1] = centro(linha[0]);
        const [x2, y2] = centro(linha[2]);
        const dx = (x2 - x1) / 200;
        const dy = (y2 - y1) / 200;
        const traco = document.createElementNS(SVG, "line");
        traco.setAttribute("x1", String(x1 - dx * 30));
        traco.setAttribute("y1", String(y1 - dy * 30));
        traco.setAttribute("x2", String(x2 + dx * 30));
        traco.setAttribute("y2", String(y2 + dy * 30));
        traco.setAttribute("pathLength", "1");
        return traco;
      }),
    );
  }

  // ---------- Desenho ----------

  const nomeDaCasa = (i) => `linha ${Math.floor(i / 3) + 1}, coluna ${(i % 3) + 1}`;

  /** Para leitores de tela: onde o computador acabou de jogar. */
  function jogadaDoComputador() {
    const { jogadas } = estado.partida;
    if (!contraComputador() || jogadas.length === 0 || jogadas.length % 2 === 1) return "";
    return `O computador marcou ${nomeDaCasa(jogadas[jogadas.length - 1])}. `;
  }

  function textoStatus() {
    const { partida } = estado;
    const vencedor = partida.vitoria?.jogador;
    if (vencedor && !contraComputador()) return { tipo: "vitoria", texto: `Jogador ${vencedor} venceu!` };
    if (vencedor) {
      return vencedor === V.HUMANO
        ? { tipo: "vitoria", texto: "Você venceu!" }
        : { tipo: "derrota", texto: "O computador venceu!" };
    }
    if (partida.empate) return { tipo: "empate", texto: "Deu velha! Empate." };
    if (vezDoComputador()) return { tipo: "pensando", texto: "O computador está pensando…" };
    return { tipo: "vez", texto: contraComputador() ? "Sua vez" : `Vez do jogador ${partida.vez}`, jogador: partida.vez };
  }

  function desenharMensagem() {
    const status = textoStatus();
    const anuncio = jogadaDoComputador();
    const chave = `${status.tipo}|${anuncio}${status.texto}|${estado.partida.jogadas.length}`;
    if (chave === ultimaMensagem) return;
    ultimaMensagem = chave;
    mensagem.dataset.tipo = status.tipo;
    const icone = document.createElement("span");
    icone.className = "jv-icone";
    icone.setAttribute("aria-hidden", "true");
    if (status.tipo === "vez") icone.append(desenharMarca(status.jogador));
    else if (status.tipo === "pensando") icone.classList.add("jv-girando");
    else icone.textContent = { vitoria: "🏆", derrota: "🤖", empate: "🤝" }[status.tipo];
    const texto = document.createElement("span");
    texto.textContent = status.texto;
    const extra = document.createElement("span");
    extra.className = "sr-only";
    extra.textContent = anuncio;
    mensagem.replaceChildren(icone, extra, texto);
  }

  function desenhar() {
    const { partida } = estado;
    const vitoria = partida.vitoria;
    const vencedoras = new Set(vitoria ? vitoria.casas : []);
    const travado = vezDoComputador();
    partida.casas.forEach((valor, i) => {
      const casa = casasEl[i];
      const atual = casa.dataset.valor || "";
      if (atual !== (valor || "")) {
        casa.replaceChildren(...(valor ? [desenharMarca(valor)] : []));
        casa.dataset.valor = valor || "";
      }
      casa.classList.toggle("vencedora", vencedoras.has(i));
      casa.classList.toggle("apagada", vitoria !== null && !vencedoras.has(i));
      casa.setAttribute("aria-disabled", String(travado || !V.podeJogar(partida, i)));
      const nome = nomeDaCasa(i);
      casa.setAttribute("aria-label", `${nome[0].toUpperCase()}${nome.slice(1)}: ${valor || "vazia"}`);
      casa.tabIndex = i === foco ? 0 : -1;
    });
    grade.classList.toggle("travada", travado);
    desenharLinhaVitoria(vitoria);
    desenharMensagem();

    for (const botao of botoesModo) {
      const ativo = botao.dataset.modo === estado.modo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    for (const botao of botoesNivel) {
      const ativo = botao.dataset.nivel === estado.nivel;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    blocoNiveis.hidden = !contraComputador();
    botaoNova.textContent = partida.terminada ? "Jogar novamente" : "Reiniciar";
    botaoDesfazer.hidden = contraComputador();
    botaoDesfazer.disabled = !podeDesfazer();

    cartaoPlacar.hidden = contraComputador();
    placarX.textContent = String(estado.placar.x);
    placarO.textContent = String(estado.placar.o);
    placarEmpates.textContent = String(estado.placar.empates);
    cartaoDesempenho.hidden = !contraComputador();
    desenharDesempenho();
  }

  function desenharDesempenho() {
    const nivel = V.NIVEIS[estado.nivel];
    const doNivel = historico.filter((r) => r.nivel === nivel.id);
    const numeros = V.estatisticas(doNivel);
    desempenhoNivel.textContent = nivel.nome;
    textoVitorias.textContent = String(numeros.vitorias);
    textoEmpates.textContent = String(numeros.empates);
    textoDerrotas.textContent = String(numeros.derrotas);
    historicoTotal.textContent = historico.length === 1 ? "1 partida" : `${historico.length} partidas`;
    if (historicoEl.open) desenharHistorico();
  }

  function desenharHistorico() {
    const agora = Date.now();
    const rotulos = { vitoria: "Você venceu!", derrota: "O computador venceu", empate: "Empate" };
    const itens = historico.slice(0, HISTORICO_VISIVEL).map((r) => {
      const item = document.createElement("li");
      item.className = `jv-${r.desfecho}`;
      const desfecho = document.createElement("strong");
      desfecho.textContent = rotulos[r.desfecho];
      item.append(desfecho, ` · Nível ${V.NIVEIS[r.nivel].nome} · ${V.textoTempoDecorrido(r.momento, agora)}`);
      return item;
    });
    historicoLista.replaceChildren(...itens);
    historicoLista.hidden = itens.length === 0;
    historicoVazio.hidden = itens.length > 0;
    botaoLimpar.hidden = itens.length === 0;
  }

  // ---------- Diálogo ----------

  let aoCancelarDialogo = null;

  function abrirDialogo({ titulo, texto, botoes, aoCancelar }) {
    dialogoTitulo.textContent = titulo;
    dialogoTexto.textContent = texto;
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

  function atualizar(novo) {
    estado = novo;
    salvar();
    desenhar();
    agendarJogadaComputador();
  }

  /** Um som por jogada: o do desfecho quando ela encerra a partida, senão o da peça (X e O soam diferente). */
  function somDaJogada(partida, casa) {
    const vencedor = partida.vitoria?.jogador;
    if (vencedor) return !contraComputador() || vencedor === V.HUMANO ? "vitoria" : "derrota";
    if (partida.empate) return "desfazer";
    return partida.casas[casa] === V.X ? "peca" : "peca2";
  }

  function aplicarJogada(casa, { silenciosa = false } = {}) {
    const partida = V.jogar(estado.partida, casa);
    if (partida === estado.partida) return;
    if (!silenciosa) som.tocar(somDaJogada(partida, casa));
    let placar = estado.placar;
    if (partida.terminada) {
      const vencedor = partida.vitoria ? partida.vitoria.jogador : null;
      placar = V.somar(placar, vencedor);
      if (contraComputador()) {
        historico = V.adicionarAoHistorico(
          historico,
          V.resultadoContraComputador(vencedor, V.HUMANO, V.NIVEIS[estado.nivel], Date.now()),
        );
        gravar(CHAVE_HISTORICO, historico);
      }
    }
    atualizar({ ...estado, partida, placar });
  }

  /** `silenciosa`: a jogada não responde a nada que a pessoa fez agora (partida restaurada). */
  function agendarJogadaComputador({ silenciosa = false } = {}) {
    clearTimeout(jogadaComputador);
    jogadaComputador = null;
    if (!vezDoComputador()) return;
    const antes = estado;
    jogadaComputador = setTimeout(() => {
      jogadaComputador = null;
      if (estado !== antes) return;
      aplicarJogada(V.escolherJogada(estado.partida.casas, V.COMPUTADOR, V.NIVEIS[estado.nivel]), { silenciosa });
    }, V.ATRASO_COMPUTADOR_MS);
  }

  function tocarCasa(casa) {
    // Enquanto o computador "pensa", os toques não valem
    if (vezDoComputador()) return;
    aplicarJogada(casa);
  }

  function novaPartida() {
    atualizar({ ...estado, partida: V.NOVA });
    focar(4, false);
    som.tocar("inicio");
  }

  function desfazer() {
    if (!podeDesfazer()) return;
    const { partida } = estado;
    const placar = partida.terminada ? V.subtrair(estado.placar, partida.vitoria ? partida.vitoria.jogador : null) : estado.placar;
    atualizar({ ...estado, partida: V.desfazer(partida), placar });
    som.tocar("desfazer");
  }

  /** Trocar de modo começa outra partida e zera o placar; trocar de nível só começa outra partida. */
  function mudarModo(modo) {
    if (modo === estado.modo || !V.MODOS[modo]) return;
    atualizar({ ...estado, modo, partida: V.NOVA, placar: { ...V.PLACAR_ZERO } });
  }

  function mudarNivel(nivel) {
    if (nivel === estado.nivel || !V.NIVEIS[nivel]) return;
    atualizar({ ...estado, nivel, partida: V.NOVA });
  }

  function focar(i, mover = true) {
    foco = i;
    casasEl.forEach((c, j) => (c.tabIndex = j === foco ? 0 : -1));
    if (mover) casasEl[foco].focus();
  }

  // ---------- Controles ----------

  grade.addEventListener("click", (evento) => {
    const casa = evento.target.closest(".jv-casa");
    if (!casa) return;
    focar(Number(casa.dataset.casa), false);
    tocarCasa(foco);
  });

  grade.addEventListener("keydown", (evento) => {
    const casa = evento.target.closest?.(".jv-casa");
    if (!casa || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const i = Number(casa.dataset.casa);
    const linha = Math.floor(i / 3);
    const coluna = i % 3;
    const destino = {
      ArrowLeft: linha * 3 + Math.max(0, coluna - 1),
      ArrowRight: linha * 3 + Math.min(2, coluna + 1),
      ArrowUp: Math.max(0, linha - 1) * 3 + coluna,
      ArrowDown: Math.min(2, linha + 1) * 3 + coluna,
      Home: linha * 3,
      End: linha * 3 + 2,
    }[evento.key];
    if (destino === undefined) return;
    evento.preventDefault();
    focar(destino);
  });

  raiz.addEventListener("keydown", (evento) => {
    if (dialogo.open || !(evento.ctrlKey || evento.metaKey) || evento.altKey) return;
    if ((evento.key || "").toLowerCase() === "z" && podeDesfazer()) {
      evento.preventDefault();
      desfazer();
    }
  });

  botaoNova.addEventListener("click", novaPartida);
  botaoDesfazer.addEventListener("click", desfazer);
  for (const botao of botoesModo) botao.addEventListener("click", () => mudarModo(botao.dataset.modo));
  for (const botao of botoesNivel) botao.addEventListener("click", () => mudarNivel(botao.dataset.nivel));
  historicoEl.addEventListener("toggle", () => {
    if (historicoEl.open) desenharHistorico();
  });

  botaoZerar.addEventListener("click", () => {
    abrirDialogo({
      titulo: "Zerar o placar?",
      texto: "As vitórias de X, de O e os empates voltam para zero. A partida atual continua.",
      botoes: [
        { rotulo: "Zerar", acao: () => atualizar({ ...estado, placar: { ...V.PLACAR_ZERO } }) },
        { rotulo: "Cancelar", acao: () => {}, secundario: true },
      ],
    });
  });

  botaoLimpar.addEventListener("click", () => {
    abrirDialogo({
      titulo: "Limpar histórico?",
      texto: "Todas as partidas e estatísticas contra o computador serão apagadas.",
      botoes: [
        {
          rotulo: "Limpar",
          acao: () => {
            historico = [];
            gravar(CHAVE_HISTORICO, null);
            desenharDesempenho();
            desenharHistorico();
            historicoEl.querySelector("summary").focus();
          },
        },
        { rotulo: "Cancelar", acao: () => {}, secundario: true },
      ],
    });
  });

  window.addEventListener("pagehide", salvar);

  // ---------- Início ----------

  historico = V.lerHistorico(lerJson(CHAVE_HISTORICO));
  const salvo = lerJson(CHAVE_PARTIDA);
  if (salvo && typeof salvo === "object") {
    estado = {
      modo: V.MODOS[salvo.modo] ? salvo.modo : estado.modo,
      nivel: V.NIVEIS[salvo.nivel] ? salvo.nivel : estado.nivel,
      partida: V.restaurar(salvo.jogadas),
      placar: V.placarDeLista(salvo.placar),
    };
  }
  grade.classList.add("sem-animacao");
  desenhar();
  requestAnimationFrame(() => requestAnimationFrame(() => grade.classList.remove("sem-animacao")));
  // Se a página fechou na vez do computador, ele joga agora, sem som (ninguém tocou em nada ainda)
  agendarJogadaComputador({ silenciosa: true });
})();
