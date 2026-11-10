"use strict";
/*
 * Interface do Mahjong Solitário Clássico (app com.efsaplicativos.mahjong). As regras estão em
 * mahjong-logica.js; aqui ficam a mesa (ui/componentes/TabuleiroMahjong.kt), os botões e os
 * avisos da tela do jogo (ui/telas/jogo/TelaJogo.kt, Dialogos.kt e JogoViewModel.kt).
 * As imagens das peças são as do app, em /assets/jogos/mahjong/.
 */
(() => {
  const raiz = document.querySelector("#mahjong");
  if (!raiz || typeof LogicaMahjong !== "object") return;
  const M = LogicaMahjong;

  const CHAVE_PARTIDA = "efs-mahjong-partida";
  const CHAVE_RECORDES = "efs-mahjong-recordes";
  const CHAVE_PREFERENCIAS = "efs-mahjong-preferencias";
  const PASTA_IMAGENS = "/assets/jogos/mahjong/";
  const TEMAS = ["classico", "moderno", "natureza"];
  const SAIDA_MS = 260;
  const ESPERA_BOTOES_MS = 700;
  const MENSAGEM_MS = 4000;
  const SALVAR_A_CADA_S = 15;

  // Medidas das imagens (ImagensPecas.kt): a face ocupa FACE_X × FACE_Y da imagem e o resto é
  // a lateral 3D, à direita e embaixo. Cada camada sobe e vai para a esquerda quase uma lateral.
  const FACE_X = 503 / 568;
  const FACE_Y = 638 / 711;
  const PROPORCAO = 320 / 256;
  const DESLOCAMENTO_CAMADA = 0.9;

  const seletor = raiz.querySelector("#mj-tabuleiro");
  const info = raiz.querySelector("#mj-info");
  const linhaRecorde = raiz.querySelector("#mj-recorde");
  const botaoNova = raiz.querySelector("#mj-nova");
  const mesa = raiz.querySelector("#mj-mesa");
  const pecasEl = raiz.querySelector("#mj-pecas");
  const textoTempo = raiz.querySelector("#mj-tempo");
  const textoRestantes = raiz.querySelector("#mj-restantes");
  const textoPares = raiz.querySelector("#mj-pares");
  const rotuloPares = raiz.querySelector("#mj-pares-rotulo");
  const acoes = raiz.querySelector("#mj-acoes");
  const botaoDesfazer = raiz.querySelector("#mj-desfazer");
  const botaoDica = raiz.querySelector("#mj-dica");
  const botaoEmbaralhar = raiz.querySelector("#mj-embaralhar");
  const botaoRecomecar = raiz.querySelector("#mj-recomecar");
  const contadorDicas = raiz.querySelector("#mj-dicas");
  const contadorEmbaralhadas = raiz.querySelector("#mj-embaralhadas");
  const caixaMensagem = raiz.querySelector("#mj-mensagem");
  const aviso = raiz.querySelector("#mj-aviso");
  const avisoTitulo = raiz.querySelector("#mj-aviso-titulo");
  const avisoCorpo = raiz.querySelector("#mj-aviso-corpo");
  const avisoBotoes = raiz.querySelector("#mj-aviso-botoes");
  const botoesTema = [...raiz.querySelectorAll("[data-tema-mesa]")];
  const caixaEscurecer = raiz.querySelector("#mj-escurecer");
  const tabelaRecordes = raiz.querySelector("#mj-tabela-recordes");
  const botaoApagarRecordes = raiz.querySelector("#mj-apagar-recordes");
  const status = raiz.querySelector("#mj-status");
  const reduzirMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // Se sons.js não carregar, o jogo segue mudo e o botão some
  const som =
    typeof Sons === "object"
      ? Sons.criar("mahjong", raiz)
      : { tocar() {}, ligarBotao: (b) => b && (b.hidden = true) };

  let partida;
  let selecionada = null;
  let dica = null;
  let vitoria = null;
  let modoDiario = false;
  /** O jogador fechou o aviso de "sem jogadas" para olhar a mesa. */
  let avisoOculto = false;
  /** O relógio só corre depois do primeiro toque na partida, com a aba visível. */
  let relogioLigado = false;
  let paresAgora = 0;
  let foco = null;
  let botoes = [];
  let centros = [];
  const saindo = new Map();
  let recordes = {};
  let preferencias = { tema: "classico", escurecer: true, tabuleiro: M.TABULEIROS[0].id };
  let avisoAtual = null;
  let liberadoEm = 0;
  let relogioMensagem = 0;

  // ---------- Armazenamento ----------

  function lerJson(chave) {
    try {
      const texto = localStorage.getItem(chave);
      return texto ? JSON.parse(texto) : null;
    } catch (error) {
      return null;
    }
  }

  function gravar(chave, valor) {
    try {
      if (valor === null) localStorage.removeItem(chave);
      else localStorage.setItem(chave, JSON.stringify(valor));
    } catch (error) {
      /* Armazenamento indisponível: vale só enquanto a página estiver aberta. */
    }
  }

  function carregarPreferencias() {
    const salvo = lerJson(CHAVE_PREFERENCIAS);
    if (!salvo || typeof salvo !== "object") return;
    if (TEMAS.includes(salvo.tema)) preferencias.tema = salvo.tema;
    if (typeof salvo.escurecer === "boolean") preferencias.escurecer = salvo.escurecer;
    if (M.tabuleiroPorId(salvo.tabuleiro)) preferencias.tabuleiro = salvo.tabuleiro;
  }

  function salvarPreferencias() {
    gravar(CHAVE_PREFERENCIAS, preferencias);
  }

  function salvar() {
    // Partida vencida não fica guardada: ao voltar, começa outra no mesmo tabuleiro
    gravar(CHAVE_PARTIDA, vitoria || M.venceu(partida) ? null : M.codificar(partida));
  }

  // ---------- Mesa ----------

  /** Onde cada peça fica, em % da mesa (GeometriaTabuleiro do app, com a face de largura 1). */
  function geometria(tabuleiro) {
    const imgW = 1 / FACE_X;
    const imgH = imgW * PROPORCAO;
    const faceH = imgH * FACE_Y;
    const camadaX = (imgW - 1) * DESLOCAMENTO_CAMADA;
    const camadaY = (imgH - faceH) * DESLOCAMENTO_CAMADA;
    const esquerda = tabuleiro.posicoes.map((p) => p.x * 0.5 - p.z * camadaX);
    const topo = tabuleiro.posicoes.map((p) => (p.y * faceH) / 2 - p.z * camadaY);
    const minX = Math.min(...esquerda);
    const minY = Math.min(...topo);
    const largura = Math.max(...esquerda) + imgW - minX;
    const altura = Math.max(...topo) + imgH - minY;
    return {
      largura,
      altura,
      pecaL: (imgW / largura) * 100,
      pecaA: (imgH / altura) * 100,
      x: esquerda.map((v) => ((v - minX) / largura) * 100),
      y: topo.map((v) => ((v - minY) / altura) * 100),
    };
  }

  function montarMesa() {
    const tabuleiro = partida.tabuleiro;
    const geo = geometria(tabuleiro);
    for (const id of saindo.values()) clearTimeout(id);
    saindo.clear();
    pecasEl.style.setProperty("--aspecto", String(geo.largura / geo.altura));
    pecasEl.style.setProperty("--colunas", String(geo.largura));
    pecasEl.style.setProperty("--pw", geo.pecaL.toFixed(3));
    pecasEl.setAttribute(
      "aria-label",
      `Mesa do tabuleiro ${tabuleiro.nome}. Use as setas para andar entre as peças livres e Enter para escolher.`,
    );
    botoes = tabuleiro.posicoes.map((p, i) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = p.z > 0 ? "mj-peca mj-elevada" : "mj-peca";
      botao.dataset.i = String(i);
      botao.tabIndex = -1;
      botao.style.left = `${geo.x[i].toFixed(3)}%`;
      botao.style.top = `${geo.y[i].toFixed(3)}%`;
      botao.style.width = `${geo.pecaL.toFixed(3)}%`;
      botao.style.height = `${geo.pecaA.toFixed(3)}%`;
      return botao;
    });
    // Centro da face em meias peças, para andar com as setas
    centros = tabuleiro.posicoes.map((p) => ({ x: p.x + 1, y: p.y + 1 }));
    pecasEl.replaceChildren(...botoes);
    foco = null;
  }

  function imagem(indiceFace) {
    return `url("${PASTA_IMAGENS}${M.FACES[indiceFace].arquivo}.webp")`;
  }

  function esconderPeca(botao, i, animar) {
    if (botao.hidden) return;
    botao.classList.remove("mj-dica");
    if (!animar || reduzirMovimento) {
      clearTimeout(saindo.get(i));
      saindo.delete(i);
      botao.classList.remove("mj-saindo");
      botao.hidden = true;
      return;
    }
    if (saindo.has(i)) return;
    botao.tabIndex = -1;
    botao.classList.add("mj-saindo");
    saindo.set(
      i,
      setTimeout(() => {
        saindo.delete(i);
        botao.classList.remove("mj-saindo");
        botao.hidden = true;
      }, SAIDA_MS),
    );
  }

  function mostrarPeca(botao, i, animar) {
    if (saindo.has(i)) {
      clearTimeout(saindo.get(i));
      saindo.delete(i);
      botao.classList.remove("mj-saindo");
    }
    if (!botao.hidden) return;
    botao.hidden = false;
    if (animar && !reduzirMovimento) {
      botao.classList.remove("mj-voltando");
      void botao.offsetWidth; // reinicia a animação
      botao.classList.add("mj-voltando");
    }
  }

  /** Mantém o foco do teclado numa peça livre (perto da anterior, se ela saiu da mesa). */
  function ajustarFoco(livres) {
    if (foco !== null && livres[foco]) return;
    const candidatas = livres.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
    if (!candidatas.length) {
      foco = null;
      return;
    }
    const ref = foco !== null ? centros[foco] : { x: -1, y: -1 };
    const distancia = (i) => Math.abs(centros[i].x - ref.x) + 1.5 * Math.abs(centros[i].y - ref.y);
    foco = candidatas.reduce((melhor, i) => (distancia(i) < distancia(melhor) ? i : melhor));
  }

  /** A peça livre mais próxima na direção da seta, com peso maior para o desvio lateral. */
  function vizinhoNaDirecao(dx, dy) {
    if (foco === null) return null;
    const a = centros[foco];
    let melhor = null;
    let menor = Infinity;
    for (let i = 0; i < botoes.length; i++) {
      if (i === foco || !M.pecaLivre(partida, i)) continue;
      const vx = centros[i].x - a.x;
      const vy = centros[i].y - a.y;
      const avanco = vx * dx + vy * dy;
      if (avanco <= 0) continue;
      const desvio = Math.abs(vx * dy - vy * dx);
      const custo = avanco + 2 * desvio;
      if (custo < menor) {
        menor = custo;
        melhor = i;
      }
    }
    return melhor;
  }

  function desenhar({ animar = true } = {}) {
    const p = partida;
    const tecladoNaMesa = pecasEl.contains(document.activeElement);
    const livres = p.faces.map((_, i) => M.pecaLivre(p, i));
    paresAgora = M.jogadasPossiveis(p).length;
    ajustarFoco(livres);

    botoes.forEach((botao, i) => {
      const f = p.faces[i];
      if (f === null) {
        esconderPeca(botao, i, animar);
        return;
      }
      mostrarPeca(botao, i, animar);
      if (botao.dataset.face !== String(f)) {
        botao.dataset.face = String(f);
        botao.style.backgroundImage = imagem(f);
      }
      const nome = M.FACES[f].nome;
      botao.classList.toggle("mj-presa", !livres[i]);
      botao.classList.toggle("mj-selecionada", selecionada === i);
      botao.classList.toggle("mj-dica", Boolean(dica && (dica[0] === i || dica[1] === i)));
      botao.setAttribute("aria-label", livres[i] ? nome : `${nome}, presa`);
      botao.setAttribute("aria-pressed", selecionada === i ? "true" : "false");
      botao.tabIndex = i === foco ? 0 : -1;
    });
    if (tecladoNaMesa && foco !== null && aviso.hidden) botoes[foco].focus({ preventScroll: true });

    const total = p.tabuleiro.totalPecas;
    textoTempo.textContent = M.formatarTempo(p.segundos);
    textoRestantes.textContent = `${M.restantes(p)}/${total}`;
    textoPares.textContent = String(paresAgora);
    rotuloPares.textContent = paresAgora === 1 ? "par livre" : "pares livres";

    const dicas = M.dicasRestantes(p);
    const embaralhadas = M.embaralhadasRestantes(p);
    botaoDesfazer.disabled = p.historico.length === 0;
    botaoDica.disabled = dicas === 0;
    botaoEmbaralhar.disabled = embaralhadas === 0;
    botaoRecomecar.disabled = M.restantes(p) === total;
    contadorDicas.textContent = String(dicas);
    contadorEmbaralhadas.textContent = String(embaralhadas);
    botaoDica.setAttribute("aria-label", `Dica (${dicas} ${dicas === 1 ? "restante" : "restantes"})`);
    botaoEmbaralhar.setAttribute(
      "aria-label",
      `Embaralhar (${embaralhadas} ${embaralhadas === 1 ? "restante" : "restantes"})`,
    );

    if (!vitoria && !M.venceu(p) && paresAgora === 0 && !avisoOculto && !avisoAtual) mostrarSemJogadas();
  }

  // ---------- Avisos ----------

  function anunciar(texto) {
    status.textContent = "";
    // O leitor de tela só repete o aviso se o texto mudar de fato
    requestAnimationFrame(() => {
      status.textContent = texto;
    });
  }

  function mensagem(texto) {
    caixaMensagem.textContent = texto;
    clearTimeout(relogioMensagem);
    relogioMensagem = setTimeout(() => {
      caixaMensagem.textContent = "";
    }, MENSAGEM_MS);
    anunciar(texto);
  }

  function criar(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function estrelasSvg(quantidade) {
    const caixa = criar("div", "mj-estrelas");
    caixa.setAttribute("role", "img");
    caixa.setAttribute("aria-label", `${quantidade} de 3 estrelas`);
    for (let k = 0; k < 3; k++) {
      caixa.insertAdjacentHTML(
        "beforeend",
        `<svg viewBox="0 0 24 24" aria-hidden="true" class="${k < quantidade ? "cheia" : ""}">` +
          '<path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>',
      );
    }
    return caixa;
  }

  /**
   * Aviso por cima da mesa. [fechar] é a ação do Esc (sem ela, o aviso só sai pelos botões).
   * Com [travar], os botões ignoram toques logo depois de aparecer: o aviso abre no mesmo
   * toque que tirou o último par.
   */
  function mostrarAviso({ tipo, titulo, corpo = [], botoes: lista, fechar = null, travar = false }) {
    const vinhaDoTeclado = raiz.contains(document.activeElement);
    avisoAtual = { tipo, fechar };
    avisoTitulo.textContent = titulo;
    avisoCorpo.replaceChildren(...corpo);
    avisoBotoes.replaceChildren(
      ...lista.map(({ rotulo, acao, secundario }) => {
        const botao = criar("button", secundario ? "button secondary" : "button", rotulo);
        botao.type = "button";
        botao.addEventListener("click", () => {
          if (Date.now() < liberadoEm) return;
          acao();
        });
        return botao;
      }),
    );
    liberadoEm = travar ? Date.now() + ESPERA_BOTOES_MS : 0;
    aviso.hidden = false;
    pecasEl.inert = true;
    acoes.inert = true;
    anunciar(`${titulo}. ${corpo.map((el) => el.textContent).join(" ")}`);
    if (vinhaDoTeclado) avisoBotoes.querySelector("button")?.focus({ preventScroll: true });
  }

  function esconderAviso() {
    if (!avisoAtual) return;
    const estavaNoAviso = aviso.contains(document.activeElement);
    avisoAtual = null;
    aviso.hidden = true;
    pecasEl.inert = false;
    acoes.inert = false;
    if (estavaNoAviso) {
      if (foco !== null) botoes[foco].focus({ preventScroll: true });
      else pecasEl.focus({ preventScroll: true });
    }
  }

  function mostrarSemJogadas() {
    const p = partida;
    const embaralhadas = M.embaralhadasRestantes(p);
    const texto =
      embaralhadas > 0
        ? "Não há pares livres na mesa. Embaralhe as peças que sobraram ou desfaça as últimas jogadas."
        : "Não há pares livres e as embaralhadas acabaram. Desfaça jogadas ou comece de novo.";
    const lista = [];
    if (embaralhadas > 0) lista.push({ rotulo: `Embaralhar (${embaralhadas})`, acao: embaralhar });
    if (p.historico.length) lista.push({ rotulo: "Desfazer jogada", acao: desfazer, secundario: embaralhadas > 0 });
    lista.push({ rotulo: "Recomeçar esta partida", acao: recomecar, secundario: true });
    lista.push({ rotulo: "Nova distribuição", acao: () => novaPartida(partida.tabuleiro), secundario: true });
    lista.push({ rotulo: "Ver a mesa", acao: verMesa, secundario: true });
    mostrarAviso({ tipo: "sem-jogadas", titulo: "Sem jogadas", corpo: [criar("p", "", texto)], botoes: lista, fechar: verMesa });
  }

  function verMesa() {
    avisoOculto = true;
    esconderAviso();
  }

  function mostrarVitoria() {
    const v = vitoria;
    const corpo = [
      criar("p", "", `Você venceu o tabuleiro ${partida.tabuleiro.nome}.`),
      estrelasSvg(v.estrelas),
    ];
    const numeros = criar("div", "mj-numeros");
    for (const [valor, rotulo] of [
      [M.formatarTempo(v.segundos), "tempo"],
      [v.pontos.toLocaleString("pt-BR"), "pontos"],
    ]) {
      const item = criar("div");
      item.append(criar("strong", "", valor), criar("span", "", rotulo));
      numeros.append(item);
    }
    corpo.push(numeros);
    if (v.conquista.primeiraVitoria) corpo.push(criar("p", "mj-destaque", "Primeira vitória neste tabuleiro!"));
    if (v.conquista.melhorTempo) corpo.push(criar("p", "mj-destaque", "Novo recorde de tempo!"));
    if (v.conquista.melhorPontuacao) corpo.push(criar("p", "mj-destaque", "Nova melhor pontuação!"));
    if (v.anterior && !v.conquista.melhorTempo) {
      corpo.push(criar("p", "mj-nota", `Seu melhor tempo aqui: ${M.formatarTempo(v.anterior.melhorTempo)}`));
    }
    if (v.estrelas < 3) {
      corpo.push(criar("p", "mj-nota", "Vença sem dicas, embaralhar ou desfazer para ganhar 3 estrelas."));
    }
    mostrarAviso({
      tipo: "vitoria",
      titulo: "Mesa limpa!",
      corpo,
      travar: true,
      botoes: [
        { rotulo: "Próximo tabuleiro", acao: () => trocarTabuleiro(M.proximoTabuleiro(partida.tabuleiro), true) },
        { rotulo: "Jogar de novo", acao: () => novaPartida(partida.tabuleiro), secundario: true },
      ],
    });
  }

  /** Fecha uma pergunta e devolve o aviso que ela cobriu (vitória ou "sem jogadas"). */
  function voltarDaPergunta() {
    esconderAviso();
    if (vitoria) mostrarVitoria();
    else desenhar();
  }

  /** Pergunta antes de jogar fora uma partida com jogadas feitas. */
  function confirmarSeTiverJogadas(acao, aoCancelar = () => {}) {
    const p = partida;
    const temJogadas = p.historico.length > 0 || p.dicasUsadas > 0 || p.embaralhadasUsadas > 0 || p.desfeitas > 0;
    if (!temJogadas || vitoria || M.venceu(p)) {
      acao();
      return;
    }
    const cancelar = () => {
      voltarDaPergunta();
      aoCancelar();
    };
    mostrarAviso({
      tipo: "confirmar",
      titulo: "Começar outra partida?",
      corpo: [criar("p", "", "As jogadas feitas nesta partida serão perdidas.")],
      botoes: [
        { rotulo: "Sim, começar", acao },
        { rotulo: "Voltar ao jogo", acao: cancelar, secundario: true },
      ],
      fechar: cancelar,
    });
  }

  // ---------- Partida ----------

  function limparEstado() {
    selecionada = null;
    dica = null;
    vitoria = null;
    avisoOculto = false;
    relogioLigado = false;
  }

  function iniciar(nova, { remontar }) {
    partida = nova;
    limparEstado();
    if (remontar) montarMesa();
    esconderAviso();
    caixaMensagem.textContent = "";
    desenhar({ animar: !remontar });
    atualizarPainel();
    salvar();
  }

  // Modo diário (assets/jogos/diario.js): a distribuição sai da semente do dia
  const D = typeof Diario === "object" ? Diario : null;
  const botaoDiario = document.querySelector("#mj-diario");
  if (!D && botaoDiario) botaoDiario.hidden = true;
  botaoDiario?.addEventListener("click", () => {
    if (D && partida) novaPartida(partida.tabuleiro, D.doDia("mahjong").gerador);
  });

  function novaPartida(tabuleiro, aleatorio) {
    const remontar = !partida || tabuleiro !== partida.tabuleiro;
    modoDiario = Boolean(aleatorio) && Boolean(D);
    iniciar(M.novaPartida(tabuleiro, aleatorio), { remontar });
    anunciar(`Nova distribuição no tabuleiro ${tabuleiro.nome}: ${tabuleiro.totalPecas} peças.`);
  }

  function trocarTabuleiro(tabuleiro, semPerguntar = false) {
    const trocar = () => {
      preferencias.tabuleiro = tabuleiro.id;
      salvarPreferencias();
      seletor.value = tabuleiro.id;
      novaPartida(tabuleiro);
    };
    if (semPerguntar) trocar();
    else confirmarSeTiverJogadas(trocar, () => (seletor.value = partida.tabuleiro.id));
  }

  /** Mesma distribuição desde o começo. */
  function recomecar() {
    iniciar(M.recomecar(partida), { remontar: false });
    anunciar("Partida recomeçada com a mesma distribuição.");
  }

  /** Jogada que muda a mesa (par, embaralhar, desfazer); se ela deixou a mesa sem pares, o som é o de derrota. */
  function atualizar(nova, efeito) {
    partida = nova;
    selecionada = null;
    dica = null;
    avisoOculto = false;
    if (avisoAtual?.tipo === "sem-jogadas") esconderAviso();
    desenhar();
    som.tocar(avisoAtual?.tipo === "sem-jogadas" ? "derrota" : efeito);
    salvar();
  }

  function tremer(i) {
    const botao = botoes[i];
    botao.classList.remove("mj-tremer");
    void botao.offsetWidth; // reinicia a animação
    botao.classList.add("mj-tremer");
  }

  function tocar(i) {
    const p = partida;
    if (vitoria || avisoAtual || p.faces[i] === null) return;
    relogioLigado = true;
    const nome = M.FACES[p.faces[i]].nome;
    if (!M.pecaLivre(p, i)) {
      tremer(i);
      som.tocar("erro");
      anunciar(`${nome}: peça presa.`);
      return;
    }
    foco = i;
    if (selecionada === null) {
      selecionada = i;
      som.tocar("selecionar");
      anunciar(`${nome} escolhida.`);
    } else if (selecionada === i) {
      selecionada = null;
      som.tocar("toque");
      anunciar("Escolha desfeita.");
    } else if (M.formamPar(p, selecionada, i)) {
      remover(selecionada, i);
      return;
    } else {
      // Peças diferentes: a seleção passa para a peça tocada (como no app, não é erro)
      selecionada = i;
      som.tocar("selecionar");
      anunciar(`${nome} escolhida.`);
    }
    desenhar();
  }

  function remover(a, b) {
    const nova = M.remover(partida, a, b);
    if (M.venceu(nova)) {
      vencer(nova);
      return;
    }
    atualizar(nova, "acerto");
    anunciar(`Par removido. Restam ${M.restantes(nova)} peças e ${paresAgora} ${paresAgora === 1 ? "par livre" : "pares livres"}.`);
  }

  function vencer(final) {
    // Modo diário: fica registrado que o mahjong de hoje já foi terminado
    if (modoDiario && D) D.marcarConcluido("mahjong");
    partida = final;
    const id = final.tabuleiro.id;
    const anterior = recordes[id] || null;
    const pontos = M.pontos(final);
    const estrelas = M.estrelas(final);
    vitoria = {
      segundos: final.segundos,
      pontos,
      estrelas,
      anterior,
      conquista: M.conquista(anterior, final.segundos, pontos),
    };
    recordes = { ...recordes, [id]: M.somarRecorde(anterior, final.segundos, pontos, estrelas) };
    gravar(CHAVE_RECORDES, recordes);
    selecionada = null;
    dica = null;
    desenhar();
    salvar();
    atualizarPainel();
    // Aqui, e não em mostrarVitoria, que também reabre o aviso depois de uma pergunta
    som.tocar("vitoria");
    mostrarVitoria();
  }

  function pedirDica() {
    if (vitoria) return;
    relogioLigado = true;
    if (M.dicasRestantes(partida) === 0) {
      som.tocar("erro");
      mensagem(`Você já usou as ${M.DICAS_POR_PARTIDA} dicas desta partida`);
      return;
    }
    const resultado = M.usarDica(partida);
    if (!resultado) {
      som.tocar("erro");
      mensagem("Não há pares livres agora: embaralhe ou desfaça a última jogada");
      return;
    }
    partida = resultado.partida;
    dica = resultado.par;
    selecionada = null;
    foco = dica[0];
    desenhar();
    som.tocar("dica");
    salvar();
    const [a, b] = dica.map((i) => M.FACES[partida.faces[i]].nome);
    anunciar(`Dica: ${a} e ${b}.`);
  }

  function embaralhar() {
    if (vitoria) return;
    relogioLigado = true;
    if (M.embaralhadasRestantes(partida) === 0) {
      som.tocar("erro");
      mensagem("Não há mais embaralhadas nesta partida");
      return;
    }
    const nova = M.embaralhar(partida);
    if (!nova) {
      som.tocar("erro");
      mensagem("Não há como embaralhar: desfaça algumas jogadas");
      return;
    }
    atualizar(nova, "embaralhar");
    anunciar(`Peças embaralhadas. ${paresAgora} ${paresAgora === 1 ? "par livre" : "pares livres"}.`);
  }

  function desfazer() {
    if (vitoria) return;
    const nova = M.desfazer(partida);
    if (!nova) return;
    relogioLigado = true;
    atualizar(nova, "desfazer");
    anunciar("Jogada desfeita: o par voltou à mesa.");
  }

  // ---------- Painel, recordes e opções ----------

  function textoEstrelas(n) {
    return "★".repeat(n) + "☆".repeat(3 - n);
  }

  function preencherSeletor() {
    seletor.replaceChildren(
      ...M.DIFICULDADES.map((d) => {
        const grupo = document.createElement("optgroup");
        grupo.label = d.titulo;
        for (const t of M.TABULEIROS.filter((item) => item.dificuldade === d.id)) {
          const opcao = document.createElement("option");
          opcao.value = t.id;
          opcao.textContent = `${t.nome} — ${t.totalPecas} peças${recordes[t.id] ? " — vencido" : ""}`;
          grupo.append(opcao);
        }
        return grupo;
      }),
    );
    seletor.value = partida.tabuleiro.id;
  }

  function atualizarPainel() {
    const t = partida.tabuleiro;
    const d = M.DIFICULDADES.find((item) => item.id === t.dificuldade);
    info.textContent = `${d.titulo} · ${t.totalPecas} peças · ${t.camadas} ${t.camadas === 1 ? "camada" : "camadas"}. ${d.descricao}`;
    const r = recordes[t.id];
    if (r) {
      linhaRecorde.replaceChildren(
        "Seu recorde aqui: ",
        Object.assign(criar("span", "mj-estrelas-texto", textoEstrelas(r.estrelas)), {
          title: `${r.estrelas} de 3 estrelas`,
        }),
        ` · melhor tempo ${M.formatarTempo(r.melhorTempo)} · ${r.melhorPontuacao.toLocaleString("pt-BR")} pontos · ` +
          `${r.vitorias} ${r.vitorias === 1 ? "vitória" : "vitórias"}`,
      );
      linhaRecorde.firstElementChild.setAttribute("aria-label", `${r.estrelas} de 3 estrelas`);
    } else {
      linhaRecorde.textContent = "Ainda não vencido.";
    }
    preencherSeletor();
    tabelaRecordes.replaceChildren(
      ...M.TABULEIROS.map((tab) => {
        const rec = recordes[tab.id];
        const linha = document.createElement("tr");
        if (tab === t) linha.className = "current";
        const nivel = M.DIFICULDADES.find((item) => item.id === tab.dificuldade).titulo;
        const celulas = [
          `${tab.nome} (${nivel})`,
          rec ? String(rec.vitorias) : "—",
          rec ? M.formatarTempo(rec.melhorTempo) : "—",
          rec ? rec.melhorPontuacao.toLocaleString("pt-BR") : "—",
          rec ? textoEstrelas(rec.estrelas) : "—",
        ];
        celulas.forEach((texto, k) => {
          const td = criar("td", "", texto);
          if (k === 4 && rec) td.setAttribute("aria-label", `${rec.estrelas} de 3 estrelas`);
          linha.append(td);
        });
        return linha;
      }),
    );
    botaoApagarRecordes.disabled = Object.keys(recordes).length === 0;
  }

  function aplicarPreferencias() {
    raiz.dataset.tema = preferencias.tema;
    for (const botao of botoesTema) {
      const ativo = botao.dataset.temaMesa === preferencias.tema;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", ativo ? "true" : "false");
    }
    caixaEscurecer.checked = preferencias.escurecer;
    raiz.classList.toggle("mj-escurecer", preferencias.escurecer);
  }

  // ---------- Controles ----------

  pecasEl.addEventListener("click", (evento) => {
    const botao = evento.target.closest(".mj-peca");
    if (botao) tocar(Number(botao.dataset.i));
  });

  const SETAS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  pecasEl.addEventListener("keydown", (evento) => {
    if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
    if (evento.key === "Escape" && selecionada !== null) {
      evento.preventDefault();
      selecionada = null;
      som.tocar("toque");
      desenhar();
      anunciar("Escolha desfeita.");
      return;
    }
    const seta = SETAS[evento.key];
    if (!seta) return;
    evento.preventDefault();
    const proximo = vizinhoNaDirecao(seta[0], seta[1]);
    if (proximo === null) return;
    if (foco !== null) botoes[foco].tabIndex = -1;
    foco = proximo;
    botoes[foco].tabIndex = 0;
    botoes[foco].focus();
  });

  aviso.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && avisoAtual?.fechar) {
      evento.preventDefault();
      avisoAtual.fechar();
    }
  });

  som.ligarBotao(raiz.querySelector("#mj-som"));
  botaoDesfazer.addEventListener("click", desfazer);
  botaoDica.addEventListener("click", pedirDica);
  botaoEmbaralhar.addEventListener("click", embaralhar);
  botaoRecomecar.addEventListener("click", () => confirmarSeTiverJogadas(recomecar));
  botaoNova.addEventListener("click", () => confirmarSeTiverJogadas(() => novaPartida(partida.tabuleiro)));

  seletor.addEventListener("change", () => {
    const tabuleiro = M.tabuleiroPorId(seletor.value);
    if (tabuleiro && tabuleiro !== partida.tabuleiro) trocarTabuleiro(tabuleiro);
  });

  for (const botao of botoesTema) {
    botao.addEventListener("click", () => {
      preferencias.tema = botao.dataset.temaMesa;
      aplicarPreferencias();
      salvarPreferencias();
    });
  }

  caixaEscurecer.addEventListener("change", () => {
    preferencias.escurecer = caixaEscurecer.checked;
    aplicarPreferencias();
    salvarPreferencias();
  });

  botaoApagarRecordes.addEventListener("click", () => {
    mostrarAviso({
      tipo: "confirmar",
      titulo: "Apagar recordes?",
      corpo: [
        criar("p", "", "Vitórias, tempos, pontos e estrelas de todos os tabuleiros serão apagados. Não dá para desfazer."),
      ],
      botoes: [
        {
          rotulo: "Apagar",
          acao: () => {
            recordes = {};
            gravar(CHAVE_RECORDES, null);
            atualizarPainel();
            voltarDaPergunta();
            anunciar("Recordes apagados.");
          },
        },
        { rotulo: "Cancelar", acao: voltarDaPergunta, secundario: true },
      ],
      fechar: voltarDaPergunta,
    });
    mesa.scrollIntoView({ block: "nearest", behavior: reduzirMovimento ? "auto" : "smooth" });
  });

  // Relógio: só corre com a partida em andamento e a aba visível
  setInterval(() => {
    if (!relogioLigado || document.hidden || vitoria || paresAgora === 0) return;
    partida = { ...partida, segundos: partida.segundos + 1 };
    textoTempo.textContent = M.formatarTempo(partida.segundos);
    // Salva o tempo de vez em quando: se a aba for fechada, perde pouco
    if (partida.segundos % SALVAR_A_CADA_S === 0) salvar();
  }, 1000);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) salvar();
  });
  window.addEventListener("pagehide", salvar);

  // ---------- Início ----------

  carregarPreferencias();
  recordes = M.validarRecordes(lerJson(CHAVE_RECORDES));
  const salva = M.decodificar(lerJson(CHAVE_PARTIDA));
  partida = salva && !M.venceu(salva) ? salva : M.novaPartida(M.tabuleiroPorId(preferencias.tabuleiro));
  preferencias.tabuleiro = partida.tabuleiro.id;
  aplicarPreferencias();
  montarMesa();
  desenhar({ animar: false });
  atualizarPainel();
  salvar();
})();
