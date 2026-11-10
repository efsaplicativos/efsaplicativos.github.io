"use strict";
/*
 * Interface do Lig 4. Regras e computador em lig-4-logica.js. O computador responde depois de
 * 500 ms, trocar de modo ou de nível começa outra partida e tudo fica no localStorage, no mesmo
 * molde do jogo da velha.
 */
(() => {
  const raiz = document.querySelector(".lig4");
  if (!raiz || typeof LogicaLig4 !== "object") return;
  const L = LogicaLig4;

  const CHAVE_PARTIDA = "efs-lig-4-partida";
  const CHAVE_HISTORICO = "efs-lig-4-historico";
  const HISTORICO_VISIVEL = 30;

  const colunasEl = raiz.querySelector("#l4-colunas");
  const gradeEl = raiz.querySelector("#l4-grade");
  const mensagem = raiz.querySelector("#l4-mensagem");
  const blocoNiveis = raiz.querySelector("#l4-niveis");
  const botoesModo = [...raiz.querySelectorAll("[data-modo]")];
  const botoesNivel = [...raiz.querySelectorAll("[data-nivel]")];
  const botaoNova = raiz.querySelector("#l4-nova");
  const botaoDesfazer = raiz.querySelector("#l4-desfazer");
  const cartaoPlacar = raiz.querySelector("#l4-placar");
  const botaoZerar = raiz.querySelector("#l4-zerar");
  const placarV = raiz.querySelector("#l4-placar-v");
  const placarA = raiz.querySelector("#l4-placar-a");
  const placarEmpates = raiz.querySelector("#l4-placar-empates");
  const cartaoDesempenho = raiz.querySelector("#l4-desempenho");
  const desempenhoNivel = raiz.querySelector("#l4-desempenho-nivel");
  const textoVitorias = raiz.querySelector("#l4-vitorias");
  const textoEmpates = raiz.querySelector("#l4-empates");
  const textoDerrotas = raiz.querySelector("#l4-derrotas");
  const historicoEl = raiz.querySelector("#l4-historico");
  const historicoTotal = raiz.querySelector("#l4-historico-total");
  const historicoLista = raiz.querySelector("#l4-historico-lista");
  const historicoVazio = raiz.querySelector("#l4-historico-vazio");
  const botaoLimpar = raiz.querySelector("#l4-limpar");
  // Sem a biblioteca de sons (script que não carregou), o jogo continua, só que mudo
  const som = typeof Sons === "object" ? Sons.criar("lig-4", raiz) : { tocar() {}, ligarBotao() {} };
  som.ligarBotao(raiz.querySelector("#l4-som"));

  /** Mesmo padrão do app: contra o computador, no nível Médio. */
  let estado = { modo: "computador", nivel: "medio", partida: L.NOVA, placar: { ...L.PLACAR_ZERO } };
  let historico = [];
  let jogadaComputador = null;
  let foco = 3;
  let ultimaMensagem = "";
  let animada = -1;

  const contraComputador = () => estado.modo === "computador";
  const vezDoComputador = () => contraComputador() && !estado.partida.terminada && estado.partida.vez === L.COMPUTADOR;
  const podeDesfazer = () => !estado.partida.terminada && estado.partida.jogadas.length > 0;

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
      /* Armazenamento indisponível: vale só enquanto a página estiver aberta */
    }
  }

  function salvar() {
    gravar(CHAVE_PARTIDA, {
      modo: estado.modo,
      nivel: estado.nivel,
      jogadas: [...estado.partida.jogadas],
      placar: L.placarParaLista(estado.placar),
    });
    gravar(CHAVE_HISTORICO, historico);
  }

  function carregar() {
    const salvo = lerJson(CHAVE_PARTIDA);
    historico = L.lerHistorico(lerJson(CHAVE_HISTORICO));
    if (!salvo || typeof salvo !== "object") return;
    if (salvo.modo && L.MODOS[salvo.modo]) estado.modo = salvo.modo;
    if (salvo.nivel && L.NIVEIS[salvo.nivel]) estado.nivel = salvo.nivel;
    estado.partida = L.restaurar(salvo.jogadas);
    estado.placar = L.placarDeLista(salvo.placar);
  }

  // ---------- Tabuleiro ----------

  const casasEl = [];
  for (let casa = 0; casa < L.TOTAL_CASAS; casa++) {
    const celula = document.createElement("div");
    celula.className = "l4-casa";
    casasEl.push(celula);
    gradeEl.append(celula);
  }

  /** Um botão por coluna, alinhado com a grade: é por ele que se joga, no mouse, no toque e no teclado. */
  const colunasBotao = [];
  for (let coluna = 0; coluna < L.COLUNAS; coluna++) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "l4-coluna";
    botao.dataset.coluna = String(coluna);
    botao.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
      '<path d="M12 4v10m0 0l-4-4m4 4l4-4" fill="none" stroke="currentColor" stroke-width="2.4" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';
    botao.addEventListener("click", () => jogarColuna(coluna));
    botao.addEventListener("keydown", (evento) => {
      const passo = evento.key === "ArrowRight" ? 1 : evento.key === "ArrowLeft" ? -1 : 0;
      if (!passo) return;
      evento.preventDefault();
      moverFoco((coluna + passo + L.COLUNAS) % L.COLUNAS);
    });
    colunasBotao.push(botao);
    colunasEl.append(botao);
  }

  function moverFoco(coluna) {
    foco = coluna;
    colunasBotao[foco].focus();
  }

  const nomeDaColuna = (coluna) => `Coluna ${coluna + 1}`;

  // ---------- Desenho ----------

  function desenharMensagem() {
    const { partida } = estado;
    const vencedor = partida.vitoria?.jogador;
    let tipo = "vez";
    let texto;
    if (vencedor) {
      tipo = !contraComputador() || vencedor === L.HUMANO ? "vitoria" : "derrota";
      if (contraComputador()) texto = vencedor === L.HUMANO ? "Você venceu!" : "O computador venceu!";
      else texto = `O ${vencedor === L.VERMELHO ? "vermelho" : "amarelo"} venceu!`;
    } else if (partida.empate) {
      tipo = "empate";
      texto = "Empate: o tabuleiro encheu.";
    } else if (vezDoComputador()) {
      tipo = "pensando";
      texto = "O computador está pensando…";
    } else {
      texto = contraComputador() ? "Sua vez" : `Vez do ${partida.vez === L.VERMELHO ? "vermelho" : "amarelo"}`;
    }
    const chave = `${tipo}|${texto}|${partida.jogadas.length}`;
    if (chave === ultimaMensagem) return;
    ultimaMensagem = chave;
    mensagem.dataset.tipo = tipo;
    const icone = document.createElement("span");
    icone.className = "l4-icone";
    icone.setAttribute("aria-hidden", "true");
    if (tipo === "vez") {
      const disco = document.createElement("span");
      disco.className = `l4-disco l4-${partida.vez === L.VERMELHO ? "vermelho" : "amarelo"}`;
      icone.append(disco);
    } else if (tipo === "pensando") {
      icone.classList.add("l4-girando");
    } else {
      icone.textContent = { vitoria: "🏆", derrota: "🤖", empate: "🤝" }[tipo];
    }
    const rotulo = document.createElement("span");
    rotulo.textContent = texto;
    mensagem.replaceChildren(icone, rotulo);
  }

  function desenhar() {
    const { partida } = estado;
    const vencedoras = new Set(partida.vitoria ? partida.vitoria.casas : []);
    partida.casas.forEach((jogador, casa) => {
      const celula = casasEl[casa];
      if ((celula.dataset.jogador || "") !== (jogador || "")) {
        celula.replaceChildren();
        if (jogador) {
          const disco = document.createElement("span");
          disco.className = `l4-disco l4-${jogador === L.VERMELHO ? "vermelho" : "amarelo"}`;
          if (casa === animada) disco.classList.add("l4-cai");
          celula.append(disco);
        }
        celula.dataset.jogador = jogador || "";
      }
      celula.classList.toggle("l4-vencedora", vencedoras.has(casa));
      celula.classList.toggle("l4-apagada", partida.vitoria !== null && !vencedoras.has(casa));
    });
    animada = -1;

    for (let coluna = 0; coluna < L.COLUNAS; coluna++) {
      const botao = colunasBotao[coluna];
      const livre = L.podeJogar(partida, coluna) && !vezDoComputador();
      const cheia = L.colunaCheia(partida.casas, coluna);
      botao.disabled = !livre;
      botao.setAttribute("aria-disabled", String(!livre));
      botao.setAttribute("aria-label", cheia ? `${nomeDaColuna(coluna)}, cheia` : nomeDaColuna(coluna));
      botao.tabIndex = coluna === foco ? 0 : -1;
      botao.dataset.jogador = partida.vez === L.VERMELHO ? "v" : "a";
    }

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
    botaoDesfazer.disabled = !podeDesfazer();

    cartaoPlacar.hidden = contraComputador();
    placarV.textContent = String(estado.placar.v);
    placarA.textContent = String(estado.placar.a);
    placarEmpates.textContent = String(estado.placar.empates);
    cartaoDesempenho.hidden = !contraComputador();
    desenharDesempenho();
  }

  function desenharDesempenho() {
    const nivel = L.NIVEIS[estado.nivel];
    const doNivel = historico.filter((r) => r.nivel === nivel.id);
    const numeros = L.estatisticas(doNivel);
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
      item.className = `l4-${r.desfecho}`;
      const desfecho = document.createElement("strong");
      desfecho.textContent = rotulos[r.desfecho];
      item.append(desfecho, ` · Nível ${L.NIVEIS[r.nivel].nome} · ${L.textoTempoDecorrido(r.momento, agora)}`);
      return item;
    });
    historicoLista.replaceChildren(...itens);
    historicoLista.hidden = itens.length === 0;
    historicoVazio.hidden = itens.length > 0;
    botaoLimpar.hidden = itens.length === 0;
  }

  // ---------- Partida ----------

  /** Um som por jogada: o do desfecho quando ela encerra a partida, senão o da peça caindo. */
  function somDaJogada(partida) {
    const vencedor = partida.vitoria?.jogador;
    if (vencedor) return !contraComputador() || vencedor === L.HUMANO ? "vitoria" : "derrota";
    if (partida.empate) return "desfazer";
    return "queda";
  }

  /** Aplica a jogada, anima a peça que caiu, toca o som e guarda o resultado quando a partida acaba. */
  function aplicarJogada(coluna) {
    const antes = estado.partida;
    const depois = L.jogar(antes, coluna);
    if (depois === antes) return false;
    animada = L.casaDaUltimaJogada(depois);
    estado = { ...estado, partida: depois };
    if (depois.terminada) registrarResultado(depois);
    salvar();
    desenhar();
    som.tocar(somDaJogada(depois));
    agendarJogadaComputador();
    return true;
  }

  function registrarResultado(partida) {
    const vencedor = partida.vitoria?.jogador ?? null;
    if (contraComputador()) {
      const nivel = L.NIVEIS[estado.nivel];
      historico = L.adicionarAoHistorico(historico, L.resultadoContraComputador(vencedor, L.HUMANO, nivel, Date.now()));
    } else {
      estado = { ...estado, placar: L.somar(estado.placar, vencedor) };
    }
  }

  function jogarColuna(coluna) {
    if (vezDoComputador() || !L.podeJogar(estado.partida, coluna)) return;
    foco = coluna;
    aplicarJogada(coluna);
  }

  function agendarJogadaComputador() {
    clearTimeout(jogadaComputador);
    jogadaComputador = null;
    if (!vezDoComputador()) return;
    jogadaComputador = setTimeout(() => {
      jogadaComputador = null;
      if (!vezDoComputador()) return;
      const nivel = L.NIVEIS[estado.nivel];
      const coluna = L.escolherJogada(estado.partida.casas, L.COMPUTADOR, nivel);
      aplicarJogada(coluna);
    }, L.ATRASO_COMPUTADOR_MS);
  }

  /** Começa outra partida. Trocar de modo ou de nível passa por aqui: o placar da sessão fica. */
  function novaPartida() {
    clearTimeout(jogadaComputador);
    jogadaComputador = null;
    estado = { ...estado, partida: L.NOVA };
    animada = -1;
    ultimaMensagem = "";
    salvar();
    desenhar();
    som.tocar("inicio");
  }

  function desfazer() {
    if (!podeDesfazer()) return;
    // Contra o computador, volta até a sua vez; a dois, volta uma jogada
    let partida = L.desfazer(estado.partida);
    if (contraComputador() && partida.vez !== L.HUMANO && partida.jogadas.length > 0) partida = L.desfazer(partida);
    estado = { ...estado, partida };
    ultimaMensagem = "";
    salvar();
    desenhar();
    som.tocar("desfazer");
  }

  // ---------- Controles ----------

  for (const botao of botoesModo) {
    botao.addEventListener("click", () => {
      if (botao.dataset.modo === estado.modo) return;
      estado = { ...estado, modo: botao.dataset.modo };
      novaPartida();
    });
  }

  for (const botao of botoesNivel) {
    botao.addEventListener("click", () => {
      if (botao.dataset.nivel === estado.nivel) return;
      estado = { ...estado, nivel: botao.dataset.nivel };
      novaPartida();
    });
  }

  botaoNova.addEventListener("click", novaPartida);
  botaoDesfazer.addEventListener("click", desfazer);

  botaoZerar.addEventListener("click", () => {
    estado = { ...estado, placar: { ...L.PLACAR_ZERO } };
    salvar();
    desenhar();
    som.tocar("toque");
  });

  historicoEl.addEventListener("toggle", () => {
    if (historicoEl.open) desenharHistorico();
  });

  botaoLimpar.addEventListener("click", () => {
    historico = [];
    salvar();
    desenhar();
    som.tocar("toque");
  });

  carregar();
  desenhar();
  agendarJogadaComputador();
})();
