"use strict";
/*
 * Interface da Paciência Golf. As regras, a dica e a busca da solução ficam em
 * paciencia-golf-logica.js.
 *
 * As 52 cartas são criadas uma vez e só mudam de lugar (propriedade CSS translate). Um toque na
 * última carta de uma coluna leva a carta para a fundação, se ela for um valor acima ou abaixo da
 * carta de cima; também dá para arrastá-la até lá. Um toque no monte vira a próxima carta. No
 * teclado, as setas andam pelas colunas, pelo monte e pela fundação, Enter ou Espaço joga e Ctrl+Z
 * desfaz. A partida, o histórico inteiro para desfazer, o modo e as estatísticas ficam no localStorage.
 */
(() => {
  const raiz = document.querySelector(".golf");
  if (!raiz || typeof LogicaGolf !== "object") return;
  const G = LogicaGolf;

  const CHAVE_PARTIDA = "efs-paciencia-golf-partida";
  const CHAVE_ESTATISTICAS = "efs-paciencia-golf-estatisticas";
  const CHAVE_MODO = "efs-paciencia-golf-modo";
  const ARRASTO_MINIMO = 6;
  const TRAVA_DIALOGO_MS = 500;
  const MENSAGEM_MS = 3800;
  const LIMITE_BUSCA = 4000000;
  const POSICOES_POR_PEDACO = 25000;
  const LEQUE = 3;
  const reduzirMovimento = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  const mesa = raiz.querySelector("#gf-mesa");
  const textoTempo = raiz.querySelector("#gf-tempo");
  const textoColunas = raiz.querySelector("#gf-colunas");
  const textoMonte = raiz.querySelector("#gf-monte");
  const textoPartida = raiz.querySelector("#gf-partida");
  const botaoDesfazer = raiz.querySelector("#gf-desfazer");
  const botaoDica = raiz.querySelector("#gf-dica");
  const botaoNova = raiz.querySelector("#gf-nova");
  const botoesModo = [...raiz.querySelectorAll("[data-modo]")];
  const status = raiz.querySelector("#gf-status");
  const estLista = raiz.querySelector("#gf-est-lista");
  const estModo = raiz.querySelector("#gf-est-modo");
  const botaoZerar = raiz.querySelector("#gf-zerar");
  const dialogo = raiz.querySelector("#gf-dialogo");
  const dialogoTitulo = raiz.querySelector("#gf-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#gf-dialogo-texto");
  const dialogoDados = raiz.querySelector("#gf-dialogo-dados");
  const dialogoBotoes = raiz.querySelector("#gf-dialogo-botoes");
  const rotuloDica = botaoDica.textContent;
  // Se sons.js não carregar, o jogo segue mudo e o botão some
  const som = typeof Sons === "object" ? Sons.criar("paciencia-golf", raiz) : { tocar() {}, ligarBotao: (b) => b && (b.hidden = true) };

  let estado;
  let historico = [];
  let estatisticas = {};
  let retomada = false;
  let acumuladoMs = 0;
  let inicioTrecho = null;
  let tique = null;
  let avisouFim = false;
  let avisouSemSolucao = false;
  let pressao = null;
  let dicaTimer = null;
  let foco = 0;
  let g = null;
  let posicoes = [];
  // Caminho achado pela dica (para a vitória ou para a melhor pontuação), enquanto o jogador seguir por ele
  let plano = null;
  let busca = null;
  // Posições já examinadas pela busca nesta partida: a próxima dica aproveita
  let memoria = null;

  // ---------- Pilhas: 0 a 6 as colunas, 7 o monte, 8 a fundação ----------

  const MONTE = 7;
  const FUNDACAO = 8;
  const TOTAL_PILHAS = 9;
  const tipoDaPilha = (i) => (i < G.COLUNAS ? "coluna" : i === MONTE ? "monte" : "fundacao");
  const linhaDaPilha = (i) => (i < G.COLUNAS ? 0 : 1);

  const pilhasEl = [...Array(TOTAL_PILHAS).keys()].map((i) => {
    const el = document.createElement("div");
    el.className = `gf-pilha gf-pilha-${tipoDaPilha(i)}`;
    el.dataset.i = String(i);
    el.tabIndex = -1;
    el.setAttribute("role", "button");
    return el;
  });

  const anel = document.createElement("div");
  anel.className = "gf-anel";
  anel.hidden = true;

  const cartasEl = [...Array(G.CARTAS).keys()].map((id) => {
    const el = document.createElement("div");
    const naipe = G.NAIPES[G.naipe(id)].id;
    el.className = `gf-carta${G.vermelha(id) ? " vermelha" : ""}`;
    el.dataset.id = String(id);
    el.setAttribute("aria-hidden", "true");
    const centro =
      G.valor(id) > 10
        ? `<span class="gf-centro gf-figura">${G.textoValor(id)}</span>`
        : `<span class="gf-centro"><i class="gf-naipe gf-naipe-${naipe}"></i></span>`;
    el.innerHTML =
      `<span class="gf-frente"><span class="gf-valor">${G.textoValor(id)}</span>` +
      `<i class="gf-naipe gf-naipe-${naipe} gf-naipe-canto"></i>${centro}</span><span class="gf-verso"></span>`;
    return el;
  });
  // Aviso curto e visível sobre a mesa; o leitor de tela recebe o mesmo texto pelo status
  const mensagemEl = document.createElement("p");
  mensagemEl.className = "gf-mensagem";
  mensagemEl.setAttribute("aria-hidden", "true");
  mesa.replaceChildren(...pilhasEl, ...cartasEl, anel, mensagemEl);

  const nome = (id) => G.nomeCarta(id);
  /** "o 7 de copas", "a Dama de ouros". */
  const nomeComArtigo = (id) => `${G.valor(id) === 12 ? "a" : "o"} ${nome(id)}`;
  const maiuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
  /** "um 6", "uma Dama", "um Ás". */
  const umValor = (v) => `${v === 12 ? "uma" : "um"} ${G.nomeValor(v)}`;
  const textoCartas = (n) => (n === 1 ? "1 carta" : `${G.formatarNumero(n)} cartas`);
  /** O que vai sobre a carta de cima da fundação: "um 6 ou um 8", "uma Dama". */
  function quemEncaixa(id) {
    const lista = G.vizinhos(G.valor(id), estado.modo).map(umValor);
    return lista.length === 1 ? lista[0] : `${lista[0]} ou ${lista[1]}`;
  }

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

  // A partida tem no máximo 51 jogadas: o histórico vai inteiro, e o Desfazer não tem limite
  function salvar() {
    if (!estado || G.venceu(estado)) return;
    sincronizarSegundos();
    gravar(CHAVE_PARTIDA, { estado, historico });
  }

  // ---------- Cronômetro ----------

  const decorridoMs = () => acumuladoMs + (inicioTrecho === null ? 0 : performance.now() - inicioTrecho);

  function sincronizarSegundos() {
    if (!estado) return;
    const segundos = Math.floor(decorridoMs() / 1000);
    if (segundos !== estado.segundos) estado = { ...estado, segundos };
    textoTempo.textContent = G.formatarTempo(estado.segundos);
  }

  function atualizarCronometro() {
    const deveRodar = estado.iniciado && !retomada && !G.terminou(estado) && document.visibilityState === "visible";
    if (deveRodar && inicioTrecho === null) {
      inicioTrecho = performance.now();
      tique = setInterval(sincronizarSegundos, 250);
    } else if (!deveRodar && inicioTrecho !== null) {
      acumuladoMs = decorridoMs();
      inicioTrecho = null;
      clearInterval(tique);
      sincronizarSegundos();
    }
    textoTempo.textContent = G.formatarTempo(estado.segundos);
  }

  function zerarCronometro(segundos = 0) {
    if (inicioTrecho !== null) clearInterval(tique);
    inicioTrecho = null;
    acumuladoMs = segundos * 1000;
  }

  // ---------- Medidas da mesa ----------

  function medir() {
    const largura = mesa.clientWidth;
    const espaco = Math.max(4, Math.round(largura * 0.014));
    const margem = Math.max(6, Math.round(largura * 0.022));
    const cw = Math.floor((largura - 2 * margem - (G.COLUNAS - 1) * espaco) / G.COLUNAS);
    const ch = Math.round(cw * 1.4);
    // Cada carta da coluna mostra a faixa de cima, com o valor e o naipe do canto; nas cartas
    // pequenas (celular em pé) o valor fica maior e a faixa também
    const pequena = cw < 56;
    const passo = Math.round(ch * (pequena ? 0.34 : 0.29));
    const vao = Math.max(14, Math.round(ch * 0.26));
    const yBaixo = margem + ch + (G.POR_COLUNA - 1) * passo + vao;
    // Na fundação, as cartas de baixo ficam um pouco à esquerda: dá para ver o valor das últimas
    // que saíram (o "10" é o mais largo)
    const leque = Math.round(cw * (pequena ? 0.5 : 0.45));
    g = { espaco, margem, cw, ch, passo, yBaixo, leque };
    mesa.style.setProperty("--cw", `${cw}px`);
    mesa.style.setProperty("--ch", `${ch}px`);
    mesa.style.height = `${yBaixo + ch + margem}px`;
  }

  const xDaColuna = (x) => g.margem + x * (g.cw + g.espaco);

  /**
   * Retângulo de cada pilha: a vaga do alto de cada coluna e, na fileira de baixo, o monte e a
   * fundação, centrados na mesa, com espaço entre os dois para o leque da fundação.
   */
  function retanguloDaPilha(i) {
    if (i < G.COLUNAS) return { x: xDaColuna(i), y: g.margem, w: g.cw, h: g.ch };
    return { x: xDaColuna(i === MONTE ? 1.5 : 4.5), y: g.yBaixo, w: g.cw, h: g.ch };
  }

  /** Onde fica a última carta da coluna (ou a vaga, com a coluna vazia). */
  function retanguloDoTopo(c) {
    const n = estado.colunas[c].length;
    return { x: xDaColuna(c), y: g.margem + Math.max(0, n - 1) * g.passo, w: g.cw, h: g.ch };
  }

  function calcularPosicoes() {
    const pos = new Array(G.CARTAS);
    const livres = new Set();
    estado.colunas.forEach((coluna, c) => {
      coluna.forEach((id, k) => {
        pos[id] = { x: xDaColuna(c), y: g.margem + k * g.passo, z: 100 + c * 10 + k, aberta: true };
      });
      if (coluna.length) livres.add(coluna[coluna.length - 1]);
    });
    // No monte, só as cartas de cima aparecem; as de baixo ficam escondidas (as sombras somadas
    // fariam uma borda escura)
    const rm = retanguloDaPilha(MONTE);
    estado.monte.forEach((id, i) => {
      pos[id] = { x: rm.x, y: rm.y, z: 10 + i, aberta: false, coberta: i < estado.monte.length - 2 };
    });
    const rf = retanguloDaPilha(FUNDACAO);
    const n = estado.fundacao.length;
    estado.fundacao.forEach((id, i) => {
      const fundo = n - 1 - i;
      pos[id] = { x: rf.x - Math.min(fundo, LEQUE) * g.leque, y: rf.y, z: 200 + i, aberta: true, coberta: fundo > LEQUE };
    });
    return { pos, livres };
  }

  // ---------- Desenho ----------

  /** [atrasos]: espera, em milissegundos, antes de cada carta começar a andar. */
  function desenhar({ animar = true, atrasos = null } = {}) {
    if (!g) medir();
    const anteriores = posicoes;
    const calculo = calcularPosicoes();
    posicoes = calculo.pos;
    const semAnimacao = !animar || reduzirMovimento.matches;
    mesa.classList.toggle("sem-animacao", semAnimacao);
    const acabou = G.terminou(estado);
    posicoes.forEach((p, id) => {
      const el = cartasEl[id];
      const antes = anteriores[id];
      const mudou = !antes || antes.x !== p.x || antes.y !== p.y;
      const atraso = !semAnimacao && atrasos ? atrasos.get(id) || 0 : 0;
      el.style.transitionDelay = atraso ? `${atraso}ms` : "";
      el.style.translate = `${p.x}px ${p.y}px`;
      // A carta que está indo para outra pilha passa por cima das outras durante o caminho
      const voando = mudou && antes && !semAnimacao;
      el.style.zIndex = String(voando ? 1000 + p.z : p.z);
      if (voando) {
        clearTimeout(el._z);
        el._z = setTimeout(() => (el.style.zIndex = String(posicoes[id].z)), 300 + atraso);
      }
      const virou = antes && antes.aberta !== p.aberta;
      el.classList.toggle("aberta", p.aberta);
      el.classList.toggle("coberta", Boolean(p.coberta));
      el.classList.toggle("livre", !acabou && calculo.livres.has(id));
      if (virou && !semAnimacao) {
        el.classList.remove("virando");
        void el.offsetWidth;
        el.classList.add("virando");
      }
    });
    if (semAnimacao) requestAnimationFrame(() => mesa.classList.remove("sem-animacao"));

    pilhasEl.forEach((el, i) => {
      const r = retanguloDaPilha(i);
      el.style.translate = `${r.x}px ${r.y}px`;
      el.style.width = `${r.w}px`;
      el.style.height = `${r.h}px`;
      el.setAttribute("aria-label", rotuloDaPilha(i));
    });
    pilhasEl[MONTE].classList.toggle("vazio", !estado.monte.length);
    const topoMonte = estado.monte.length ? estado.monte[estado.monte.length - 1] : null;
    cartasEl.forEach((el, id) => el.classList.toggle("no-monte", id === topoMonte && !acabou));

    textoColunas.textContent = String(G.naColunas(estado));
    textoMonte.textContent = String(estado.monte.length);
    textoPartida.textContent = `Partida nº ${G.formatarNumero(estado.semente)} · ${G.textoModo(estado.modo)}`;
    botaoDesfazer.disabled = !historico.length || G.venceu(estado);
    botaoDica.disabled = acabou;
    for (const botao of botoesModo) {
      const ativo = botao.dataset.modo === estado.modo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    atualizarFoco(false);
    atualizarCronometro();
  }

  function rotuloDaPilha(i) {
    if (i < G.COLUNAS) {
      const coluna = estado.colunas[i];
      if (!coluna.length) return `Coluna ${i + 1}: vazia.`;
      const livre = nome(coluna[coluna.length - 1]);
      if (coluna.length === 1) return `Coluna ${i + 1}, 1 carta: ${livre}, livre.`;
      const presas = coluna.slice(0, -1).map(nome).join(", ");
      return `Coluna ${i + 1}, ${coluna.length} cartas: ${presas}; livre: ${livre}.`;
    }
    if (i === MONTE) {
      const n = estado.monte.length;
      return n ? `Monte: ${textoCartas(n)}. Enter vira uma carta para a fundação.` : "Monte vazio: ele passa uma vez só.";
    }
    const id = G.topoDaFundacao(estado);
    return `Fundação: ${nome(id)} por cima. Vai sobre ela ${quemEncaixa(id)}.`;
  }

  let mensagemTimer = null;

  function anunciar(texto) {
    status.textContent = texto;
    if (mensagemEl.classList.contains("visivel")) {
      clearTimeout(mensagemTimer);
      mensagemEl.classList.remove("visivel");
    }
  }

  /** Explica, na tela e para o leitor de tela, por que a jogada não saiu. */
  function avisar(texto) {
    anunciar(texto);
    mensagemEl.textContent = texto;
    mensagemEl.classList.add("visivel");
    mensagemTimer = setTimeout(() => mensagemEl.classList.remove("visivel"), MENSAGEM_MS);
  }

  // ---------- Foco do teclado ----------

  /** O anel contorna a carta que o Enter joga: a última da coluna, a de cima do monte ou da fundação. */
  function atualizarFoco(mover = true) {
    pilhasEl.forEach((el, i) => (el.tabIndex = i === foco ? 0 : -1));
    const el = pilhasEl[foco];
    if (mover) el.focus({ preventScroll: false });
    const ativo = document.activeElement === el && el.matches(":focus-visible");
    anel.hidden = !ativo;
    if (!ativo) return;
    const r = foco < G.COLUNAS ? retanguloDoTopo(foco) : retanguloDaPilha(foco);
    anel.style.translate = `${r.x}px ${r.y}px`;
    anel.style.width = `${r.w}px`;
    anel.style.height = `${r.h}px`;
  }

  const centroX = (i) => {
    const r = retanguloDaPilha(i);
    return r.x + r.w / 2;
  };

  /** A pilha vizinha de [i] na direção da seta, pela posição na tela. */
  function vizinha(i, tecla) {
    const linha = linhaDaPilha(i);
    const x = centroX(i);
    const todas = [...Array(TOTAL_PILHAS).keys()].filter((j) => j !== i);
    if (tecla === "ArrowLeft" || tecla === "ArrowRight") {
      const mesmaLinha = todas.filter((j) => linhaDaPilha(j) === linha);
      const sinal = tecla === "ArrowRight" ? 1 : -1;
      const naDirecao = mesmaLinha.filter((j) => sinal * (centroX(j) - x) > 0);
      // Sem mais nada naquele lado, dá a volta para a outra ponta da linha
      const lista = naDirecao.length ? naDirecao : mesmaLinha;
      const distancia = (j) => (naDirecao.length ? Math.abs(centroX(j) - x) : -Math.abs(centroX(j) - x));
      return lista.reduce((melhor, j) => (distancia(j) < distancia(melhor) ? j : melhor));
    }
    const alvo = tecla === "ArrowDown" ? linha + 1 : linha - 1;
    const naLinha = todas.filter((j) => linhaDaPilha(j) === alvo);
    if (!naLinha.length) return i;
    return naLinha.reduce((melhor, j) => (Math.abs(centroX(j) - x) < Math.abs(centroX(melhor) - x) ? j : melhor));
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
    anunciar(`${titulo}. ${texto}`);
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

  // ---------- Jogadas ----------

  const chaveDoEstado = (e) => JSON.stringify([e.colunas.map((c) => c.length), e.monte.length, G.topoDaFundacao(e)]);
  const mesmaJogada = (a, b) => Boolean(a && b) && (a.monte ? Boolean(b.monte) : !b.monte && a.coluna === b.coluna);

  /** Troca o estado pela jogada feita, guardando o anterior para desfazer. */
  function registrarJogada(novo, jogada) {
    pararBusca();
    sincronizarSegundos();
    const anterior = estado;
    historico.push(anterior);
    estado = { ...novo, segundos: anterior.segundos };
    // O caminho da dica continua valendo se o jogador fez a jogada que ela sugeria
    if (plano && mesmaJogada(plano.caminho[0], jogada)) {
      plano = { ...plano, caminho: plano.caminho.slice(1), chave: chaveDoEstado(estado) };
    } else {
      plano = null;
    }
    retomada = false;
    avisouFim = false;
    limparDica();
  }

  function tremer(ids) {
    for (const id of ids) {
      const el = cartasEl[id];
      el.classList.remove("tremendo");
      void el.offsetWidth;
      el.classList.add("tremendo");
    }
  }

  /** Por que a carta [id] não vai sobre a carta de cima da fundação. */
  function motivoRecusa(id) {
    const v = G.valor(id);
    const r = G.valor(G.topoDaFundacao(estado));
    if (estado.modo === "classico" && ((v === 1 && r === 13) || (v === 13 && r === 1))) {
      return `${maiuscula(G.valorComArtigo(v))} não vai sobre ${G.valorComArtigo(r)} no modo Clássico: o Ás e o Rei só se ligam no modo Com volta.`;
    }
    return `${maiuscula(G.valorComArtigo(v))} não vai sobre ${G.valorComArtigo(r)}: a carta precisa ser um valor acima ou abaixo.`;
  }

  function jogarColuna(c) {
    if (G.venceu(estado)) return false;
    const coluna = estado.colunas[c];
    if (!coluna.length) {
      avisar("Esta coluna já está vazia.");
      return false;
    }
    const id = coluna[coluna.length - 1];
    const novo = G.jogar(estado, c);
    if (!novo) {
      tremer([id]);
      som.tocar("erro");
      avisar(motivoRecusa(id));
      return false;
    }
    registrarJogada(novo, { coluna: c });
    desenhar();
    const faltam = G.naColunas(estado);
    if (G.venceu(estado)) {
      som.tocar("pousar");
      anunciar(`${nome(id)} na fundação. As 7 colunas estão limpas!`);
      concluir(350);
      return true;
    }
    som.tocar(estado.colunas[c].length ? "pousar" : "completo");
    anunciar(`${nome(id)} na fundação. ${faltam === 1 ? "Falta 1 carta" : `Faltam ${faltam} cartas`} nas colunas.`);
    salvar();
    verificarFim();
    return true;
  }

  function virarMonte() {
    if (G.venceu(estado)) return;
    const novo = G.virar(estado);
    if (!novo) {
      som.tocar("erro");
      avisar("O monte acabou: no Golf ele passa uma vez só.");
      return;
    }
    registrarJogada(novo, { monte: true });
    desenhar();
    som.tocar("virar");
    const id = G.topoDaFundacao(estado);
    const n = estado.monte.length;
    anunciar(`Virou ${nomeComArtigo(id)}. ${n ? `${textoCartas(n)} no monte` : "O monte acabou"}.`);
    salvar();
    verificarFim();
  }

  /** Um toque (ou Enter) numa carta: joga a última de uma coluna, vira o monte ou explica a fundação. */
  function tocarCarta(id) {
    if (G.terminou(estado) && !G.venceu(estado)) {
      avisar("A partida acabou: o monte está vazio e nenhuma carta das colunas encaixa.");
      return;
    }
    const c = estado.colunas.findIndex((coluna) => coluna.includes(id));
    if (c >= 0) {
      const coluna = estado.colunas[c];
      if (coluna[coluna.length - 1] === id) {
        jogarColuna(c);
        return;
      }
      tremer([id]);
      som.tocar("erro");
      avisar("Só a última carta de cada coluna, a que aparece inteira, pode ir para a fundação.");
      return;
    }
    if (estado.monte.includes(id)) {
      virarMonte();
      return;
    }
    explicarFundacao();
  }

  function explicarFundacao() {
    if (G.venceu(estado)) return;
    const id = G.topoDaFundacao(estado);
    const v = G.valor(id);
    avisar(`Na fundação está ${G.valorComArtigo(v)}: vai sobre ${v === 12 ? "ela" : "ele"} ${quemEncaixa(id)}.`);
  }

  function desfazer() {
    if (!historico.length || G.venceu(estado)) return;
    fecharDialogo();
    pararBusca();
    sincronizarSegundos();
    const segundos = estado.segundos;
    estado = { ...historico.pop(), segundos };
    plano = null;
    retomada = false;
    avisouFim = false;
    limparDica();
    desenhar();
    salvar();
    som.tocar("desfazer");
    anunciar("Jogada desfeita.");
  }

  // ---------- Dica e fim de jogo ----------

  function limparDica() {
    clearTimeout(dicaTimer);
    for (const el of [...cartasEl, ...pilhasEl]) el.classList.remove("gf-dica");
  }

  function pararBusca() {
    if (!busca) return;
    clearTimeout(busca.timer);
    clearTimeout(busca.aviso);
    busca = null;
    botaoDica.textContent = rotuloDica;
    botaoDica.removeAttribute("aria-busy");
  }

  /** Acende a jogada [j]; [semVitoria] traz a melhor pontuação possível quando não há como ganhar. */
  function exibirDica(j, semVitoria = null) {
    limparDica();
    som.tocar("dica");
    const fim = semVitoria === null ? "" : ` Daqui não dá para limpar a mesa; este caminho termina com ${textoCartas(semVitoria)} nas colunas.`;
    if (j.monte) {
      cartasEl[estado.monte[estado.monte.length - 1]].classList.add("gf-dica");
      (semVitoria === null ? anunciar : avisar)(`Dica: vire uma carta do monte.${fim}`);
    } else {
      const coluna = estado.colunas[j.coluna];
      cartasEl[coluna[coluna.length - 1]].classList.add("gf-dica");
      (semVitoria === null ? anunciar : avisar)(`Dica: leve ${nomeComArtigo(coluna[coluna.length - 1])}, da coluna ${j.coluna + 1}, para a fundação.${fim}`);
    }
    dicaTimer = setTimeout(limparDica, 2600);
  }

  /**
   * A dica procura, a partir da posição atual (aos pedaços, sem travar a tela), o caminho que limpa
   * as colunas guardando mais cartas no monte e acende a primeira jogada dele. Se provar que não há
   * vitória, avisa uma vez e passa a mostrar o caminho para a menor pontuação possível; se a busca
   * não terminar a tempo, usa a dica simples.
   */
  function mostrarDica() {
    if (G.terminou(estado)) {
      if (!G.venceu(estado)) abrirFim();
      return;
    }
    if (busca) return;
    limparDica();
    const chave = chaveDoEstado(estado);
    if (plano && plano.chave === chave && plano.caminho.length) {
      exibirDica(plano.caminho[0], plano.vitoria ? null : plano.pontuacao);
      return;
    }
    plano = null;
    const mesma = memoria && memoria.semente === estado.semente && memoria.modo === estado.modo;
    const procura = G.criarBusca(estado, { limite: LIMITE_BUSCA, memo: mesma ? memoria.tabela : null });
    memoria = { semente: estado.semente, modo: estado.modo, tabela: procura.memo };
    busca = { timer: null, aviso: null };
    busca.aviso = setTimeout(() => {
      if (!busca) return;
      botaoDica.textContent = "Pensando…";
      botaoDica.setAttribute("aria-busy", "true");
      anunciar("Procurando uma solução a partir daqui…");
    }, 150);
    const pedaco = () => {
      const r = procura.continuar(POSICOES_POR_PEDACO);
      if (r === undefined) {
        busca.timer = setTimeout(pedaco, 0);
        return;
      }
      pararBusca();
      if (r === null) {
        const simples = G.dica(estado);
        if (simples) exibirDica(simples);
        return;
      }
      plano = { caminho: r.caminho, chave, vitoria: r.vitoria, pontuacao: r.pontuacao };
      if (r.vitoria) {
        exibirDica(r.caminho[0]);
      } else if (!avisouSemSolucao) {
        abrirSemSolucao();
      } else {
        exibirDica(r.caminho[0], r.pontuacao);
      }
    };
    pedaco();
  }

  function botoesDeFim() {
    const botoes = [];
    if (historico.length) botoes.push({ rotulo: "Desfazer", acao: desfazer });
    botoes.push(
      { rotulo: "Recomeçar esta partida", acao: () => novaPartida({ semente: estado.semente }), secundario: historico.length > 0 },
      { rotulo: "Nova partida", acao: () => novaPartida(), secundario: true },
      { rotulo: "Continuar olhando", acao: () => {}, secundario: true },
    );
    return botoes;
  }

  /** A busca examinou tudo: daqui, nenhuma ordem de jogadas limpa as colunas. Vale a melhor pontuação. */
  function abrirSemSolucao() {
    avisouSemSolucao = true;
    const doComeco = !historico.length;
    const n = plano.pontuacao;
    const melhor = `O melhor possível é terminar com ${textoCartas(n)} nas colunas, e a Dica agora mostra o caminho para essa pontuação.`;
    const botoes = [{ rotulo: "Mostrar a dica", acao: () => plano && exibirDica(plano.caminho[0], plano.pontuacao) }];
    if (!doComeco) botoes.push({ rotulo: "Recomeçar esta partida", acao: () => novaPartida({ semente: estado.semente }), secundario: true });
    botoes.push(
      { rotulo: "Nova partida", acao: () => novaPartida(), secundario: true },
      { rotulo: "Fechar", acao: () => {}, secundario: true },
    );
    abrirDialogo({
      titulo: "Sem solução",
      texto: doComeco
        ? `Esta partida não tem solução: nenhuma ordem de jogadas limpa as 7 colunas. ${melhor}`
        : `Procurei todas as jogadas: daqui não dá mais para limpar as 7 colunas. ${melhor}`,
      botoes,
    });
    som.tocar("derrota");
  }

  /** O monte acabou e nenhuma carta das colunas encaixa. */
  function abrirFim() {
    avisouFim = true;
    const p = G.pontuacao(estado);
    const recorde = estatisticas[estado.modo].melhorPontuacao;
    const dados = [["Pontuação", `${textoCartas(p)} nas colunas`]];
    if (recorde !== null && p < recorde) dados.push(["Nova melhor pontuação!", G.formatarPontuacao(p), true]);
    else if (recorde !== null) dados.push(["Sua melhor pontuação", G.formatarPontuacao(recorde)]);
    dados.push(["Tempo", G.formatarTempo(estado.segundos)]);
    abrirDialogo({
      titulo: "Fim de jogo",
      texto: `O monte acabou e nenhuma carta das colunas encaixa sobre ${G.valorComArtigo(G.valor(G.topoDaFundacao(estado)))} da fundação. No Golf, quanto menos cartas sobrarem, melhor.`,
      dados,
      botoes: botoesDeFim(),
    });
    som.tocar("derrota");
  }

  function verificarFim() {
    if (avisouFim || !G.terminou(estado) || G.venceu(estado)) return;
    setTimeout(() => !dialogo.open && G.terminou(estado) && !G.venceu(estado) && !avisouFim && abrirFim(), 650);
  }

  // ---------- Vitória ----------

  function concluir(espera = 0) {
    acumuladoMs = decorridoMs();
    inicioTrecho = null;
    clearInterval(tique);
    sincronizarSegundos();
    gravar(CHAVE_PARTIDA, null);
    const pontos = G.pontuacao(estado);
    const { estatisticas: novas, recordes } = registrarNoModo({ venceu: true, segundos: estado.segundos, pontuacao: pontos });
    const dados = [
      ["Tempo", G.formatarTempo(estado.segundos)],
      ["Movimentos", G.formatarNumero(estado.movimentos)],
      ["Pontuação", G.formatarPontuacao(pontos)],
    ];
    if (recordes.pontuacao) dados.push(["Nova melhor pontuação!", G.formatarPontuacao(pontos), true]);
    if (recordes.tempo) dados.push(["Novo melhor tempo!", G.formatarTempo(estado.segundos), true]);
    dados.push(["Vitórias seguidas", G.formatarNumero(novas.sequencia)]);
    const { semente, modo } = estado;
    const sobra = estado.monte.length;
    setTimeout(() => {
      // As cartas que ficaram à vista pulam, uma depois da outra
      let k = 0;
      posicoes.forEach((p, id) => !p.coberta && cartasEl[id].style.setProperty("--k", String(k++ % 8)));
      mesa.classList.add("gf-festa");
      setTimeout(() => mesa.classList.remove("gf-festa"), 2200);
      som.tocar("vitoria");
    }, espera);
    setTimeout(() => {
      abrirDialogo({
        titulo: "Parabéns!",
        texto: `Você limpou as 7 colunas no modo ${G.textoModo(modo)}${
          sobra ? `, com ${textoCartas(sobra)} sobrando no monte` : ", usando o monte até a última carta"
        }.`,
        dados,
        botoes: [
          { rotulo: "Nova partida", acao: () => novaPartida() },
          { rotulo: "Jogar esta de novo", acao: () => novaPartida({ semente }), secundario: true },
          { rotulo: "Fechar", acao: () => {}, secundario: true },
        ],
      });
    }, espera + 900);
  }

  // ---------- Estatísticas ----------

  /** Soma uma partida às estatísticas do modo atual e grava. */
  function registrarNoModo(resultado) {
    const r = G.registrarResultado(estatisticas[estado.modo], resultado);
    estatisticas = { ...estatisticas, [estado.modo]: r.estatisticas };
    gravar(CHAVE_ESTATISTICAS, estatisticas);
    desenharEstatisticas();
    return r;
  }

  function desenharEstatisticas() {
    const modo = estado ? estado.modo : G.MODO_PADRAO;
    const e = estatisticas[modo];
    estModo.textContent = G.textoModo(modo);
    const linhas = [
      ["Partidas", G.formatarNumero(e.jogadas)],
      ["Vitórias", `${G.formatarNumero(e.vitorias)} (${G.porcentagemVitorias(e)}%)`],
      ["Melhor pontuação", e.melhorPontuacao === null ? "—" : G.formatarPontuacao(e.melhorPontuacao)],
      ["Melhor tempo", e.melhorTempo === null ? "—" : G.formatarTempo(e.melhorTempo)],
      ["Vitórias seguidas", G.formatarNumero(e.sequencia)],
      ["Maior sequência", G.formatarNumero(e.melhorSequencia)],
    ];
    estLista.replaceChildren(
      ...linhas.map(([rotulo, valor]) => {
        const linha = document.createElement("div");
        const dt = document.createElement("dt");
        dt.textContent = rotulo;
        const dd = document.createElement("dd");
        dd.textContent = valor;
        linha.append(dt, dd);
        return linha;
      }),
    );
  }

  /**
   * Ao sair de uma partida começada e não ganha: se ela já tinha acabado, conta com a pontuação;
   * se foi abandonada no meio, conta como não terminada, sem pontuação.
   */
  function registrarSaida() {
    if (!estado || !estado.iniciado || G.venceu(estado)) return;
    registrarNoModo(G.terminou(estado) ? { venceu: false, pontuacao: G.pontuacao(estado) } : { venceu: false });
  }

  // ---------- Partida ----------

  /** As cartas das colunas saem do monte, fileira por fileira, e a primeira do monte vira na fundação. */
  function animarDistribuicao() {
    if (reduzirMovimento.matches) return;
    const r = retanguloDaPilha(MONTE);
    const ids = [];
    for (let k = 0; k < G.POR_COLUNA; k++) estado.colunas.forEach((coluna) => coluna[k] !== undefined && ids.push(coluna[k]));
    ids.push(...estado.fundacao);
    mesa.classList.add("sem-animacao");
    for (const id of ids) {
      cartasEl[id].style.translate = `${r.x}px ${r.y}px`;
      cartasEl[id].classList.remove("aberta");
    }
    void mesa.offsetWidth;
    mesa.classList.remove("sem-animacao");
    ids.forEach((id, k) => {
      const el = cartasEl[id];
      el.style.transitionDelay = `${k * 20}ms`;
      el.style.translate = `${posicoes[id].x}px ${posicoes[id].y}px`;
      setTimeout(() => {
        el.classList.add("aberta");
        el.classList.remove("virando");
        void el.offsetWidth;
        el.classList.add("virando");
      }, k * 20 + 120);
    });
  }

  function novaPartida({ modo = estado ? estado.modo : G.MODO_PADRAO, semente = G.novaSemente() } = {}) {
    fecharDialogo();
    pararBusca();
    registrarSaida();
    zerarCronometro();
    retomada = false;
    historico = [];
    plano = null;
    memoria = null;
    avisouFim = false;
    avisouSemSolucao = false;
    limparDica();
    mesa.classList.remove("gf-festa");
    estado = G.novoJogo(modo, semente);
    gravar(CHAVE_MODO, estado.modo);
    posicoes = [];
    desenhar({ animar: false });
    animarDistribuicao();
    desenharEstatisticas();
    salvar();
    som.tocar("embaralhar");
    anunciar(`Nova partida no modo ${G.textoModo(estado.modo)}. Partida número ${G.formatarNumero(semente)}.`);
  }

  function confirmarNovaPartida(opcoes = {}) {
    if (!estado.iniciado || G.terminou(estado)) {
      novaPartida(opcoes);
      return;
    }
    abrirDialogo({
      titulo: "Começar outra partida?",
      texto: "A partida atual vai contar como não terminada nas suas estatísticas.",
      botoes: [
        { rotulo: "Sim, começar", acao: () => novaPartida(opcoes) },
        { rotulo: "Não", acao: () => {}, secundario: true },
      ],
    });
  }

  // ---------- Arrastar e tocar ----------

  function sobreposicao(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }

  /** A carta arrastada caiu sobre a fundação (o leque inteiro conta)? */
  function caiuNaFundacao(id, dx, dy, ponto) {
    const base = posicoes[id];
    const carta = { x: base.x + dx, y: base.y + dy, w: g.cw, h: g.ch };
    const rf = retanguloDaPilha(FUNDACAO);
    const alvo = { x: rf.x - LEQUE * g.leque, y: rf.y, w: rf.w + LEQUE * g.leque, h: rf.h };
    const dentro = ponto.x >= alvo.x && ponto.x <= alvo.x + alvo.w && ponto.y >= alvo.y && ponto.y <= alvo.y + alvo.h;
    return dentro || sobreposicao(carta, alvo) > 0.3 * g.cw * g.ch;
  }

  function pontoNaMesa(evento) {
    const r = mesa.getBoundingClientRect();
    return { x: evento.clientX - r.left, y: evento.clientY - r.top };
  }

  const colunaDaCartaLivre = (id) => estado.colunas.findIndex((coluna) => coluna.length && coluna[coluna.length - 1] === id);

  mesa.addEventListener("pointerdown", (evento) => {
    if (evento.button > 0 || pressao) return;
    const cartaEl = evento.target.closest(".gf-carta");
    if (!cartaEl) return;
    const id = Number(cartaEl.dataset.id);
    // Só a última carta de cada coluna pode ser arrastada
    const arrastavel = !G.terminou(estado) && colunaDaCartaLivre(id) >= 0;
    pressao = { id, arrastavel, x0: evento.clientX, y0: evento.clientY, pointerId: evento.pointerId, ativo: false };
    if (!arrastavel) return;
    try {
      cartaEl.setPointerCapture(evento.pointerId);
    } catch (erro) {
      /* sem captura: o arrasto continua pelos eventos da mesa */
    }
  });

  mesa.addEventListener("pointermove", (evento) => {
    if (!pressao || !pressao.arrastavel || evento.pointerId !== pressao.pointerId) return;
    const dx = evento.clientX - pressao.x0;
    const dy = evento.clientY - pressao.y0;
    if (!pressao.ativo) {
      if (Math.hypot(dx, dy) < ARRASTO_MINIMO) return;
      pressao.ativo = true;
      limparDica();
      mesa.classList.add("arrastando");
      cartasEl[pressao.id].classList.add("no-ar");
      cartasEl[pressao.id].style.zIndex = "2000";
    }
    evento.preventDefault();
    const p = posicoes[pressao.id];
    cartasEl[pressao.id].style.translate = `${p.x + dx}px ${p.y + dy}px`;
  });

  function terminarPressao(evento, cancelado = false) {
    if (!pressao || evento.pointerId !== pressao.pointerId) return;
    const atual = pressao;
    pressao = null;
    if (!atual.ativo) {
      if (!cancelado) tocarCarta(atual.id);
      return;
    }
    mesa.classList.remove("arrastando");
    cartasEl[atual.id].classList.remove("no-ar");
    const dx = evento.clientX - atual.x0;
    const dy = evento.clientY - atual.y0;
    const c = colunaDaCartaLivre(atual.id);
    if (!cancelado && c >= 0 && caiuNaFundacao(atual.id, dx, dy, pontoNaMesa(evento)) && jogarColuna(c)) return;
    // Volta para o lugar (também quando a carta não encaixa: jogarColuna já explicou o motivo)
    desenhar();
  }

  mesa.addEventListener("pointerup", (evento) => terminarPressao(evento));
  mesa.addEventListener("pointercancel", (evento) => terminarPressao(evento, true));
  // Sem isso, o navegador do celular pode tentar rolar a página ou selecionar texto no meio do arrasto
  mesa.addEventListener("touchmove", (evento) => pressao && pressao.ativo && evento.preventDefault(), { passive: false });
  mesa.addEventListener("contextmenu", (evento) => evento.target.closest(".gf-carta") && evento.preventDefault());

  // ---------- Teclado ----------

  /** Enter ou Espaço na pilha com foco (e o clique dos leitores de tela). */
  function ativarPilha(i) {
    if (G.terminou(estado) && !G.venceu(estado) && i !== FUNDACAO) {
      avisar("A partida acabou: o monte está vazio e nenhuma carta das colunas encaixa.");
      return;
    }
    if (i < G.COLUNAS) jogarColuna(i);
    else if (i === MONTE) virarMonte();
    else explicarFundacao();
  }

  mesa.addEventListener("keydown", (evento) => {
    const pilhaEl = evento.target.closest?.(".gf-pilha");
    if (!pilhaEl || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const i = Number(pilhaEl.dataset.i);
    switch (evento.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown":
        foco = vizinha(i, evento.key);
        atualizarFoco();
        break;
      case "Enter":
      case " ":
        ativarPilha(i);
        break;
      default:
        return;
    }
    evento.preventDefault();
  });

  mesa.addEventListener("focusin", (evento) => {
    const pilhaEl = evento.target.closest?.(".gf-pilha");
    if (!pilhaEl) return;
    foco = Number(pilhaEl.dataset.i);
    atualizarFoco(false);
  });
  mesa.addEventListener("focusout", () => setTimeout(() => atualizarFoco(false), 0));

  mesa.addEventListener("click", (evento) => {
    const pilhaEl = evento.target.closest(".gf-pilha");
    if (!pilhaEl) return;
    const i = Number(pilhaEl.dataset.i);
    // Leitores de tela ativam a pilha com um clique sem ponteiro; com o ponteiro, só as pilhas vazias
    // recebem o clique direto (com cartas, o toque cai na carta de cima)
    if (evento.detail === 0) {
      foco = i;
      ativarPilha(i);
    } else if (i === MONTE) {
      virarMonte();
    }
  });

  raiz.addEventListener("keydown", (evento) => {
    if ((evento.ctrlKey || evento.metaKey) && !evento.altKey && evento.key.toLowerCase() === "z" && !evento.target.closest("input, textarea")) {
      evento.preventDefault();
      desfazer();
    }
  });

  // ---------- Botões ----------

  botaoDesfazer.addEventListener("click", desfazer);
  botaoDica.addEventListener("click", mostrarDica);
  botaoNova.addEventListener("click", () => confirmarNovaPartida());
  for (const botao of botoesModo) {
    botao.addEventListener("click", () => {
      const modo = botao.dataset.modo;
      if (modo !== estado.modo) confirmarNovaPartida({ modo });
    });
  }
  botaoZerar.addEventListener("click", () => {
    const modo = estado.modo;
    abrirDialogo({
      titulo: "Zerar estatísticas?",
      texto: `As estatísticas do modo ${G.textoModo(modo)} voltam para zero. Isso não pode ser desfeito.`,
      botoes: [
        {
          rotulo: "Sim, zerar",
          acao: () => {
            estatisticas = { ...estatisticas, [modo]: G.estatisticasVazias() };
            gravar(CHAVE_ESTATISTICAS, estatisticas);
            desenharEstatisticas();
            anunciar("Estatísticas zeradas.");
          },
        },
        { rotulo: "Não", acao: () => {}, secundario: true },
      ],
    });
  });
  som.ligarBotao(raiz.querySelector("#gf-som"));

  // ---------- Tamanho da tela e saída da página ----------

  // Só a largura da mesa e a altura da janela mudam as medidas
  let redesenho = null;
  let ultimaMedida = "";
  function aoMudarTamanho() {
    cancelAnimationFrame(redesenho);
    redesenho = requestAnimationFrame(() => {
      const medida = `${mesa.clientWidth}x${window.innerHeight}`;
      if (medida === ultimaMedida || pressao) return;
      ultimaMedida = medida;
      medir();
      desenhar({ animar: false });
    });
  }
  if (typeof ResizeObserver === "function") new ResizeObserver(aoMudarTamanho).observe(mesa);
  window.addEventListener("resize", aoMudarTamanho);

  document.addEventListener("visibilitychange", () => {
    atualizarCronometro();
    if (document.visibilityState === "hidden") salvar();
  });
  window.addEventListener("pagehide", salvar);

  // ---------- Início ----------

  const salvas = lerJson(CHAVE_ESTATISTICAS) || {};
  for (const modo of G.MODOS) estatisticas[modo] = G.lerEstatisticas(salvas[modo]);
  const salva = lerJson(CHAVE_PARTIDA);
  const restaurada = salva && G.restaurar(salva.estado);
  medir();
  ultimaMedida = `${mesa.clientWidth}x${window.innerHeight}`;
  if (restaurada && !G.venceu(restaurada)) {
    estado = restaurada;
    historico = Array.isArray(salva.historico)
      ? salva.historico.map(G.restaurar).filter((h) => h && h.modo === estado.modo && h.semente === estado.semente)
      : [];
    acumuladoMs = estado.segundos * 1000;
    retomada = estado.iniciado;
    desenhar({ animar: false });
    desenharEstatisticas();
    anunciar("Partida anterior retomada.");
    verificarFim();
  } else {
    const modoSalvo = lerJson(CHAVE_MODO);
    novaPartida({ modo: G.MODOS.includes(modoSalvo) ? modoSalvo : G.MODO_PADRAO });
  }
})();
