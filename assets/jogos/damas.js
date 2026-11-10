"use strict";
/*
 * Interface das Damas. Regras e computador em damas-logica.js. A pessoa escolhe a peça, as casas
 * possíveis acendem e o lance sai no segundo toque. A partida, o placar e o histórico ficam no
 * localStorage, no mesmo molde dos outros jogos.
 */
(() => {
  const raiz = document.querySelector(".damas");
  if (!raiz || typeof LogicaDamas !== "object") return;
  const L = LogicaDamas;

  const CHAVE_PARTIDA = "efs-damas-partida";
  const CHAVE_HISTORICO = "efs-damas-historico";
  const HISTORICO_VISIVEL = 30;

  const tabuleiroEl = raiz.querySelector("#dm-tabuleiro");
  const mensagem = raiz.querySelector("#dm-mensagem");
  const ultimoLanceEl = raiz.querySelector("#dm-ultimo");
  const contagemBrancas = raiz.querySelector("#dm-brancas");
  const contagemPretas = raiz.querySelector("#dm-pretas");
  const blocoNiveis = raiz.querySelector("#dm-niveis");
  const botoesModo = [...raiz.querySelectorAll("[data-modo]")];
  const botoesNivel = [...raiz.querySelectorAll("[data-nivel]")];
  const botaoNova = raiz.querySelector("#dm-nova");
  const botaoDesfazer = raiz.querySelector("#dm-desfazer");
  const cartaoPlacar = raiz.querySelector("#dm-placar");
  const botaoZerar = raiz.querySelector("#dm-zerar");
  const placarB = raiz.querySelector("#dm-placar-b");
  const placarP = raiz.querySelector("#dm-placar-p");
  const placarEmpates = raiz.querySelector("#dm-placar-empates");
  const cartaoDesempenho = raiz.querySelector("#dm-desempenho");
  const desempenhoNivel = raiz.querySelector("#dm-desempenho-nivel");
  const textoVitorias = raiz.querySelector("#dm-vitorias");
  const textoEmpates = raiz.querySelector("#dm-empates");
  const textoDerrotas = raiz.querySelector("#dm-derrotas");
  const historicoEl = raiz.querySelector("#dm-historico");
  const historicoTotal = raiz.querySelector("#dm-historico-total");
  const historicoLista = raiz.querySelector("#dm-historico-lista");
  const historicoVazio = raiz.querySelector("#dm-historico-vazio");
  const botaoLimpar = raiz.querySelector("#dm-limpar");
  // Sem a biblioteca de sons (script que não carregou), o jogo continua, só que mudo
  const som = typeof Sons === "object" ? Sons.criar("damas", raiz) : { tocar() {}, ligarBotao() {} };
  som.ligarBotao(raiz.querySelector("#dm-som"));

  /** Mesmo padrão dos outros jogos: contra o computador, no nível Médio. */
  let estado = { modo: "computador", nivel: "medio", partida: L.NOVA, placar: { ...L.PLACAR_ZERO } };
  let historico = [];
  let jogadaComputador = null;
  let selecionada = -1;
  let destinos = [];
  let ultimaMensagem = "";

  const contraComputador = () => estado.modo === "computador";
  const vezDoComputador = () => contraComputador() && !estado.partida.terminada && estado.partida.vez === L.COMPUTADOR;
  const podeDesfazer = () => !estado.partida.terminada && estado.partida.jogadas.length > 0;
  const vezDoJogador = () => !estado.partida.terminada && !vezDoComputador();

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
    const linha = L.linhaDaCasa(casa);
    const coluna = L.colunaDaCasa(casa);
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = `dm-casa ${L.casaEscura(linha, coluna) ? "dm-escura" : "dm-clara"}`;
    botao.dataset.casa = String(casa);
    botao.addEventListener("click", () => clicarCasa(casa));
    casasEl.push(botao);
    tabuleiroEl.append(botao);
  }

  const descreverCasa = (casa) => `linha ${L.linhaDaCasa(casa) + 1}, coluna ${L.colunaDaCasa(casa) + 1}`;
  const nomeDoJogador = (jogador) => (jogador === L.BRANCO ? "branca" : "preta");

  /** A coroa da dama é desenhada no CSS, a partir de um elemento vazio. */
  function desenharPeca(p) {
    const pecaEl = document.createElement("span");
    pecaEl.className = `dm-peca dm-${p.jogador === L.BRANCO ? "branca" : "preta"}`;
    if (p.dama) {
      pecaEl.classList.add("dm-dama");
      const coroa = document.createElement("span");
      coroa.className = "dm-coroa";
      coroa.setAttribute("aria-hidden", "true");
      pecaEl.append(coroa);
    }
    return pecaEl;
  }

  function desenharMensagem() {
    const { partida } = estado;
    const vencedor = partida.vitoria?.jogador;
    let tipo = "vez";
    let texto;
    if (vencedor) {
      tipo = !contraComputador() || vencedor === L.HUMANO ? "vitoria" : "derrota";
      if (contraComputador()) texto = vencedor === L.HUMANO ? "Você venceu!" : "O computador venceu!";
      else texto = `As ${vencedor === L.BRANCO ? "brancas" : "pretas"} venceram!`;
    } else if (partida.empate) {
      tipo = "empate";
      texto = "Empate: 40 lances sem captura.";
    } else if (vezDoComputador()) {
      tipo = "pensando";
      texto = "O computador está pensando…";
    } else if (!contraComputador()) {
      texto = `Vez das ${partida.vez === L.BRANCO ? "brancas" : "pretas"}`;
    } else {
      texto = selecionada >= 0 ? "Escolha para onde ir" : "Sua vez: escolha uma peça";
    }
    const chave = `${tipo}|${texto}|${partida.jogadas.length}`;
    if (chave === ultimaMensagem) return;
    ultimaMensagem = chave;
    mensagem.dataset.tipo = tipo;
    const icone = document.createElement("span");
    icone.className = "dm-icone";
    icone.setAttribute("aria-hidden", "true");
    if (tipo === "vez") {
      const ponto = document.createElement("span");
      ponto.className = `dm-peca dm-mini dm-${partida.vez === L.BRANCO ? "branca" : "preta"}`;
      icone.append(ponto);
    } else if (tipo === "pensando") {
      icone.classList.add("dm-girando");
    } else {
      icone.textContent = { vitoria: "🏆", derrota: "🤖", empate: "🤝" }[tipo];
    }
    const rotulo = document.createElement("span");
    rotulo.textContent = texto;
    mensagem.replaceChildren(icone, rotulo);
  }

  /** Texto do último lance, para a tela e para os leitores de tela. */
  function desenharUltimoLance() {
    const lance = estado.partida.jogadas.at(-1);
    if (!lance) {
      ultimoLanceEl.textContent = "";
      return;
    }
    const jogador = estado.partida.vez === L.BRANCO ? L.PRETO : L.BRANCO;
    const comidas = L.capturadasDoLance(lance).length;
    const de = descreverCasa(lance.passos[0].de);
    const para = descreverCasa(lance.passos.at(-1).para);
    const comeu = comidas === 0 ? "" : ` · ${comidas} ${comidas === 1 ? "peça comida" : "peças comidas"}`;
    ultimoLanceEl.textContent = `Último lance (${nomeDoJogador(jogador)}): ${de} → ${para}${comeu}`;
  }

  function desenhar() {
    const { partida } = estado;
    const ultimo = partida.jogadas.at(-1);
    const ultimaOrigem = ultimo ? ultimo.passos[0].de : -1;
    const ultimoDestino = ultimo ? ultimo.passos.at(-1).para : -1;
    const destacados = new Set(destinos);

    partida.casas.forEach((p, casa) => {
      const celula = casasEl[casa];
      const antes = celula.dataset.peca || "";
      const agora = p ? `${p.jogador}${p.dama ? "D" : ""}` : "";
      if (antes !== agora) {
        celula.replaceChildren(...(p ? [desenharPeca(p)] : []));
        celula.dataset.peca = agora;
      }
      celula.classList.toggle("dm-selecionada", casa === selecionada);
      celula.classList.toggle("dm-destino", destacados.has(casa));
      celula.classList.toggle("dm-origem", casa === ultimaOrigem);
      celula.classList.toggle("dm-chegada", casa === ultimoDestino);
      const clicavel =
        destacados.has(casa) || (vezDoJogador() && p !== null && p.jogador === partida.vez && L.lancesDe(partida.casas, partida.vez, casa).length > 0);
      celula.disabled = !clicavel;
      const descricao = p
        ? `${descreverCasa(casa)}: peça ${nomeDoJogador(p.jogador)}${p.dama ? " (dama)" : ""}`
        : `${descreverCasa(casa)}: vazia`;
      celula.setAttribute("aria-label", destacados.has(casa) ? `${descricao}. Toque para jogar aqui` : descricao);
      if (destacados.has(casa)) celula.setAttribute("aria-describedby", "dm-ajuda");
      else celula.removeAttribute("aria-describedby");
      celula.setAttribute("aria-pressed", String(casa === selecionada));
    });

    contagemBrancas.textContent = String(partida.pecas[L.BRANCO]);
    contagemPretas.textContent = String(partida.pecas[L.PRETO]);
    desenharMensagem();
    desenharUltimoLance();

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
    placarB.textContent = String(estado.placar.b);
    placarP.textContent = String(estado.placar.p);
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
      item.className = `dm-${r.desfecho}`;
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

  // ---------- Jogadas ----------

  /** Um som por lance: o do desfecho, o da captura ou o da peça deslizando. */
  function somDoLance(partida, lance) {
    const vencedor = partida.vitoria?.jogador;
    if (vencedor) return !contraComputador() || vencedor === L.HUMANO ? "vitoria" : "derrota";
    if (partida.empate) return "desfazer";
    if (lance && lance.passos.some((passo) => passo.capturada !== null)) return "captura";
    return "deslizar";
  }

  /** Aplica o lance, guarda o resultado quando a partida acaba e agenda o computador. */
  function aplicarLance(lance) {
    const antes = estado.partida;
    const depois = L.jogar(antes, lance);
    if (depois === antes) return false;
    estado = { ...estado, partida: depois };
    selecionada = -1;
    destinos = [];
    if (depois.terminada) registrarResultado(depois);
    salvar();
    desenhar();
    som.tocar(somDoLance(depois, lance));
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

  /** Seleciona a peça (e mostra as casas possíveis) ou conclui o lance no destino escolhido. */
  function clicarCasa(casa) {
    if (!vezDoJogador()) return;
    const { partida } = estado;
    if (destinos.includes(casa)) {
      const lance = L.lancePara(partida.casas, partida.vez, selecionada, casa);
      if (lance) aplicarLance(lance);
      return;
    }
    const p = partida.casas[casa];
    if (!p || p.jogador !== partida.vez) return;
    const lances = L.lancesDe(partida.casas, partida.vez, casa);
    if (lances.length === 0) return;
    if (selecionada === casa) {
      selecionada = -1;
      destinos = [];
    } else {
      selecionada = casa;
      destinos = [...new Set(lances.map((lance) => lance.passos.at(-1).para))];
      som.tocar("selecionar");
    }
    desenhar();
  }

  /** Quando só uma peça pode jogar (o caso de captura obrigatória), ela já vem escolhida. */
  function selecionarUnica() {
    if (!vezDoJogador() || selecionada >= 0) return;
    const lances = L.lancesLegais(estado.partida.casas, estado.partida.vez);
    const origens = [...new Set(lances.map((lance) => lance.passos[0].de))];
    if (origens.length !== 1) return;
    selecionada = origens[0];
    destinos = [...new Set(lances.map((lance) => lance.passos.at(-1).para))];
  }

  function agendarJogadaComputador() {
    clearTimeout(jogadaComputador);
    jogadaComputador = null;
    if (!vezDoComputador()) return;
    jogadaComputador = setTimeout(() => {
      jogadaComputador = null;
      if (!vezDoComputador()) return;
      const lance = L.escolherJogada(estado.partida.casas, L.COMPUTADOR, L.NIVEIS[estado.nivel]);
      aplicarLance(lance);
    }, L.ATRASO_COMPUTADOR_MS);
  }

  /** Começa outra partida. Trocar de modo ou de nível passa por aqui: o placar da sessão fica. */
  function novaPartida() {
    clearTimeout(jogadaComputador);
    jogadaComputador = null;
    estado = { ...estado, partida: L.NOVA };
    selecionada = -1;
    destinos = [];
    ultimaMensagem = "";
    salvar();
    desenhar();
    som.tocar("inicio");
  }

  function desfazer() {
    if (!podeDesfazer()) return;
    // Contra o computador, volta até a sua vez; a dois, volta um lance
    let partida = L.desfazer(estado.partida);
    if (contraComputador() && partida.vez !== L.HUMANO && partida.jogadas.length > 0) partida = L.desfazer(partida);
    estado = { ...estado, partida };
    selecionada = -1;
    destinos = [];
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
  selecionarUnica();
  desenhar();
  agendarJogadaComputador();
})();
