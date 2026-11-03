"use strict";
/*
 * Interface do Color Sort do Multi-Game Strategy (jogos/colorsort/ui/ColorSortViewModel.kt,
 * TelaPartidaColorSort.kt, TabuleiroColorSort.kt, TelaDificuldadeColorSort.kt e TemaColorSort.kt):
 * toque escolhe o tubo e o segundo toque despeja; jogada recusada faz o tubo tremer; o relógio
 * começa no primeiro toque e para com a página escondida. A versão web acrescenta desfazer,
 * reiniciar o mesmo nível e símbolos nas bolas. Regras em color-sort-logica.js.
 */
(() => {
  const raiz = document.querySelector("#csort");
  if (!raiz || typeof LogicaColorSort === "undefined") return;
  const C = LogicaColorSort;

  const CHAVE_PARTIDA = "efs-color-sort-partida";
  const CHAVE_RECORDES = "efs-color-sort-recordes";
  const CHAVE_SIMBOLOS = "efs-color-sort-simbolos";
  const ESPACO_TUBOS = 12;
  const LARGURA_MINIMA = 56;
  const LARGURA_MAXIMA = 76;

  // Cores do app (TemaColorSort.kt), na mesma ordem, cada uma com um símbolo próprio
  const CORES = [
    { nome: "vermelho", simbolo: "quadrado", d: "M6 6h12v12H6z" },
    { nome: "azul", simbolo: "círculo", d: "M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14z" },
    { nome: "verde", simbolo: "triângulo", d: "M12 4l8.5 15h-17z" },
    { nome: "amarelo", simbolo: "estrela", d: "M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" },
    { nome: "magenta", simbolo: "losango", d: "M12 3l8 9-8 9-8-9z" },
    { nome: "ciano", simbolo: "cruz", d: "M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z" },
    { nome: "laranja", simbolo: "coração", d: "M12 20.3l-1.3-1.2C5.6 14.6 2.5 11.8 2.5 8.2 2.5 5.4 4.7 3.2 7.5 3.2c1.7 0 3.3.8 4.5 2.1 1.2-1.3 2.8-2.1 4.5-2.1 2.8 0 5 2.2 5 5 0 3.6-3.1 6.4-8.2 10.9z" },
  ];
  const SVG = "http://www.w3.org/2000/svg";

  const $ = (seletor) => raiz.querySelector(seletor);
  const mesa = $("#cs-mesa");
  const tabuleiroEl = $("#cs-tabuleiro");
  const botoesNivel = [...raiz.querySelectorAll("[data-dificuldade]")];
  const opcaoSimbolos = $("#cs-simbolos");
  const textoTempo = $("#cs-tempo");
  const textoMovimentos = $("#cs-movimentos");
  const textoMelhor = $("#cs-melhor");
  const dica = $("#cs-dica");
  const botaoDesfazer = $("#cs-desfazer");
  const botaoReiniciar = $("#cs-reiniciar");
  const botaoNovo = $("#cs-novo");
  const status = $("#cs-status");
  const abasRecordes = [...raiz.querySelectorAll("[data-recordes]")];
  const listaRecordes = $("#cs-lista-recordes");
  const semRecordes = $("#cs-sem-recordes");
  const dialogo = $("#cs-dialogo");
  const dialogoIcone = $("#cs-dialogo-icone");
  const dialogoTitulo = $("#cs-dialogo-titulo");
  const dialogoCorpo = $("#cs-dialogo-corpo");
  const dialogoBotoes = $("#cs-dialogo-botoes");
  // Sem sons.js o jogo funciona igual, só que mudo e sem o botão
  const som =
    typeof Sons === "object"
      ? Sons.criar("color-sort", raiz)
      : { tocar() {}, ligarBotao: (botao) => botao && (botao.hidden = true) };
  som.ligarBotao($("#cs-som"));

  let dificuldade = C.dificuldade("easy");
  let partida = null;
  let selecionado = null;
  let completo = false;
  let iniciado = false;
  let cronometro = C.criarCronometro(() => performance.now());
  let relogio = null;
  let recordes = { easy: [], medium: [], hard: [] };
  let abaRecordes = "easy";
  let tubos = [];

  // ---------- Armazenamento ----------

  function ler(chave) {
    try {
      return localStorage.getItem(chave);
    } catch (erro) {
      return null;
    }
  }

  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, valor);
    } catch (erro) {
      /* Armazenamento indisponível: vale só enquanto a página estiver aberta. */
    }
  }

  function salvar() {
    if (!partida) return;
    gravar(
      CHAVE_PARTIDA,
      JSON.stringify({
        dificuldade: dificuldade.chave,
        inicial: partida.inicial,
        tabuleiro: partida.tabuleiro,
        historico: partida.historico,
        movimentos: partida.movimentos,
        decorridoMs: Math.round(cronometro.decorridoMs()),
        completo,
      }),
    );
  }

  function carregar() {
    try {
      const salvo = JSON.parse(ler(CHAVE_PARTIDA));
      const d = C.dificuldade(salvo?.dificuldade);
      if (!d) return false;
      dificuldade = d;
      const p = !salvo.completo && C.partidaValida(salvo, d);
      if (!p) return false;
      const decorrido = Number.isFinite(salvo.decorridoMs) && salvo.decorridoMs >= 0 ? salvo.decorridoMs : 0;
      partida = p;
      cronometro = C.criarCronometro(() => performance.now(), decorrido);
      // O relógio volta a correr no próximo toque
      iniciado = false;
      return true;
    } catch (erro) {
      return false;
    }
  }

  // ---------- Relógio ----------

  function iniciarRelogio() {
    iniciado = true;
    if (document.hidden || completo) return;
    cronometro.iniciar();
    if (!relogio) relogio = setInterval(mostrarTempo, 250);
  }

  function pararRelogio() {
    cronometro.pausar();
    clearInterval(relogio);
    relogio = null;
    mostrarTempo();
  }

  function mostrarTempo() {
    textoTempo.textContent = C.formatarTempo(cronometro.segundos());
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pararRelogio();
      salvar();
    } else if (iniciado && !completo) {
      iniciarRelogio();
    }
  });
  window.addEventListener("pagehide", salvar);

  // ---------- Tubos ----------

  /** Uma casa do tubo; vira bola ou vaga em desenhar(), sem recriar o elemento. */
  function criarCasa() {
    const casa = document.createElement("span");
    casa.className = "cs-vaga";
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.append(document.createElementNS(SVG, "path"));
    casa.append(svg);
    casa.addEventListener("animationend", () => casa.classList.remove("cs-nova"));
    return casa;
  }

  /** Recria os botões dos tubos (quando muda o nível); o desenho do conteúdo fica em desenhar(). */
  function montarTubos() {
    tubos = partida.tabuleiro.tubos.map((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cs-tubo";
      b.dataset.indice = String(i);
      b.addEventListener("click", () => tocar(i));
      b.addEventListener("animationend", (evento) => {
        if (evento.target === b) b.classList.remove("cs-recusado");
      });
      // De cima para baixo: a primeira casa é a do topo
      for (let k = 0; k < partida.tabuleiro.altura; k++) b.append(criarCasa());
      return b;
    });
    distribuir(true);
  }

  /** Uma linha quando cabe; senão duas, como no app (7 = 3 + 4, 9 = 4 + 5). */
  function distribuir(refazer = false) {
    if (!tubos.length) return;
    const largura = tabuleiroEl.clientWidth || 320;
    const n = tubos.length;
    const umaLinha = n <= 5 || largura >= LARGURA_MINIMA * n + ESPACO_TUBOS * (n - 1);
    const grupos = umaLinha ? [tubos] : [tubos.slice(0, Math.floor(n / 2)), tubos.slice(Math.floor(n / 2))];
    const porLinha = Math.max(...grupos.map((g) => g.length));
    const larguraTubo = Math.min(LARGURA_MAXIMA, (largura - ESPACO_TUBOS * (porLinha - 1)) / porLinha);
    tabuleiroEl.style.setProperty("--largura-tubo", `${Math.floor(larguraTubo)}px`);
    const linhasAtuais = [...tabuleiroEl.children].map((linha) => linha.children.length).join();
    if (!refazer && linhasAtuais === grupos.map((g) => g.length).join()) return;
    // Mudar os tubos de linha não pode levar o foco embora
    const focado = document.activeElement;
    tabuleiroEl.replaceChildren(
      ...grupos.map((g) => {
        const linha = document.createElement("div");
        linha.className = "cs-linha";
        linha.append(...g);
        return linha;
      }),
    );
    if (tubos.includes(focado)) focado.focus({ preventScroll: true });
  }

  if (typeof ResizeObserver === "function") new ResizeObserver(() => distribuir()).observe(mesa);
  else window.addEventListener("resize", () => distribuir());

  function descreverTubo(i) {
    const tubo = partida.tabuleiro.tubos[i];
    const conteudo = tubo.length ? `${tubo.map((c) => CORES[c].nome).join(", ")} (de baixo para cima)` : "vazio";
    const pronto = C.tuboCompleto(partida.tabuleiro, i) ? ", completo" : "";
    return `Tubo ${i + 1}: ${conteudo}${pronto}`;
  }

  // ---------- Desenho ----------

  function desenhar(animar = true) {
    const t = partida.tabuleiro;
    tubos.forEach((b, i) => {
      const tubo = t.tubos[i];
      [...b.children].forEach((casa, k) => {
        const pos = t.altura - 1 - k;
        const cor = pos < tubo.length ? tubo[pos] : null;
        const era = casa.classList.contains("cs-bola") ? Number(casa.dataset.cor) : null;
        if (cor === era) return;
        if (cor === null) {
          casa.className = "cs-vaga";
          delete casa.dataset.cor;
          return;
        }
        // Bola que acabou de chegar entra com uma animação curta
        casa.className = `cs-bola${era === null && animar ? " cs-nova" : ""}`;
        casa.dataset.cor = String(cor);
        casa.querySelector("path").setAttribute("d", CORES[cor].d);
      });
      b.classList.toggle("cs-selecionado", i === selecionado);
      b.classList.toggle("cs-completo", C.tuboCompleto(t, i));
      b.setAttribute("aria-pressed", String(i === selecionado));
      b.setAttribute("aria-label", descreverTubo(i));
      b.setAttribute("aria-disabled", String(completo));
    });
    for (const b of botoesNivel) {
      const ativo = b.dataset.dificuldade === dificuldade.chave;
      b.classList.toggle("active", ativo);
      b.setAttribute("aria-pressed", String(ativo));
    }
    textoMovimentos.textContent = String(partida.movimentos);
    mostrarTempo();
    const melhor = recordes[dificuldade.chave][0];
    textoMelhor.textContent = melhor ? C.formatarTempo(melhor.tempo) : "—";
    textoMelhor.parentElement.title = melhor ? `Recorde no ${dificuldade.nome}: ${C.formatarTempo(melhor.tempo)}, ${melhor.movimentos} movimentos` : "";
    botaoDesfazer.disabled = completo || !partida.historico.length;
    botaoReiniciar.disabled = partida.movimentos === 0 && !completo && !iniciado && cronometro.decorridoMs() === 0;
    if (completo) dica.textContent = "Nível resolvido! Escolha “Novo nível” para jogar outro.";
    else if (selecionado !== null) dica.textContent = "Clique em outro tubo para despejar ou no mesmo para cancelar.";
    else dica.textContent = "Clique em um tubo para começar.";
    desenharRecordes();
  }

  function desenharRecordes() {
    for (const aba of abasRecordes) {
      const ativa = aba.dataset.recordes === abaRecordes;
      aba.classList.toggle("active", ativa);
      aba.setAttribute("aria-pressed", String(ativa));
    }
    const lista = recordes[abaRecordes];
    semRecordes.hidden = lista.length > 0;
    listaRecordes.replaceChildren(
      ...lista.map((r) => {
        const item = document.createElement("li");
        const tempo = document.createElement("strong");
        tempo.textContent = C.formatarTempo(r.tempo);
        const detalhe = document.createElement("span");
        detalhe.textContent = `${r.movimentos} movimentos · ${new Date(r.momento).toLocaleDateString("pt-BR")}`;
        item.append(tempo, " ", detalhe);
        return item;
      }),
    );
  }

  // ---------- Jogadas ----------

  /** Primeiro toque escolhe o tubo; o segundo despeja nele (ou cancela, se for o mesmo). */
  function tocar(i) {
    if (!partida || completo || dialogo.open) return;
    const t = partida.tabuleiro;
    const origem = selecionado;
    if (origem === null) {
      if (!t.tubos[i].length) return;
      // O relógio começa no primeiro toque
      iniciarRelogio();
      selecionado = i;
      status.textContent = `Tubo ${i + 1} escolhido.`;
      som.tocar("toque");
    } else if (origem === i) {
      selecionado = null;
      status.textContent = "Escolha cancelada.";
      som.tocar("toque");
    } else {
      const nova = C.jogar(partida, origem, i);
      if (!nova) {
        // Jogada inválida: o tubo de origem treme e a escolha passa para o tubo tocado (ou some, se vazio)
        selecionado = t.tubos[i].length ? i : null;
        tubos[origem].classList.remove("cs-recusado");
        void tubos[origem].offsetWidth;
        tubos[origem].classList.add("cs-recusado");
        status.textContent = `Não dá para despejar do tubo ${origem + 1} no tubo ${i + 1}.${selecionado !== null ? ` Tubo ${i + 1} escolhido.` : ""}`;
        som.tocar("erro");
      } else {
        const quantidade = nova.tabuleiro.tubos[i].length - t.tubos[i].length;
        partida = nova;
        selecionado = null;
        status.textContent = `Despejado no tubo ${i + 1}. ${descreverTubo(i)}.`;
        // Um som por jogada: resolver o nível (em terminar) vale mais que fechar um tubo, que vale mais que o despejo
        if (C.completo(partida.tabuleiro)) {
          terminar();
          return;
        }
        if (C.tuboCompleto(partida.tabuleiro, i)) som.tocar("completo");
        else som.tocar("despejar", quantidade);
        salvar();
      }
    }
    desenhar();
  }

  function desfazer() {
    if (!partida || completo) return;
    const anterior = C.desfazer(partida);
    if (!anterior) return;
    partida = anterior;
    selecionado = null;
    status.textContent = "Jogada desfeita.";
    som.tocar("desfazer");
    salvar();
    desenhar();
  }

  function terminar() {
    completo = true;
    pararRelogio();
    const tempo = cronometro.segundos();
    const registro = C.inserirRecorde(recordes[dificuldade.chave], { tempo, movimentos: partida.movimentos, momento: Date.now() });
    if (registro.posicao !== null) {
      recordes = { ...recordes, [dificuldade.chave]: registro.lista };
      gravar(CHAVE_RECORDES, JSON.stringify(recordes));
    }
    abaRecordes = dificuldade.chave;
    salvar();
    desenhar();
    som.tocar("vitoria");
    status.textContent = `Você organizou todas as cores em ${C.formatarTempo(tempo)} e ${partida.movimentos} movimentos.`;
    mostrarVitoria(tempo, registro);
  }

  /** Começa um nível: novo (gerado) ou o mesmo do começo; [silencioso] no nível que abre com a página. */
  function comecar(nivel, mesmo = false, silencioso = false) {
    fecharDialogo();
    pararRelogio();
    dificuldade = nivel;
    partida = mesmo && partida ? C.reiniciar(partida) : C.novaPartida(C.gerar(nivel));
    cronometro = C.criarCronometro(() => performance.now());
    selecionado = null;
    completo = false;
    iniciado = false;
    const focoNoJogo = tabuleiroEl.contains(document.activeElement);
    montarTubos();
    salvar();
    desenhar();
    // Os tubos antigos saíram da página: o foco do teclado vai para o primeiro tubo novo
    if (focoNoJogo) tubos[0].focus({ preventScroll: true });
    status.textContent = mesmo ? "Nível reiniciado." : `Novo nível ${nivel.nome.toLowerCase()} com ${nivel.cores} cores.`;
    // Nível sorteado embaralha; o mesmo nível desde o começo só recomeça
    if (!silencioso) som.tocar(mesmo ? "inicio" : "embaralhar");
  }

  /** Há progresso a perder: movimentos feitos num nível ainda não resolvido. */
  const temProgresso = () => !completo && partida.movimentos > 0;

  function confirmar(titulo, texto, rotulo, acao) {
    if (!temProgresso()) {
      acao();
      return;
    }
    const anterior = document.activeElement;
    abrirDialogo({
      icone: "↻",
      titulo,
      corpo: [paragrafo(texto)],
      botoes: [
        { rotulo, acao },
        { rotulo: "Cancelar", acao: () => { fecharDialogo(); anterior?.focus?.({ preventScroll: true }); }, secundario: true },
      ],
    });
  }

  // ---------- Diálogos ----------

  function paragrafo(texto, classe) {
    const p = document.createElement("p");
    p.textContent = texto;
    if (classe) p.className = classe;
    return p;
  }

  function abrirDialogo({ icone, titulo, corpo, botoes }) {
    dialogoIcone.textContent = icone;
    dialogoTitulo.textContent = titulo;
    dialogoCorpo.replaceChildren(...corpo);
    dialogoBotoes.replaceChildren(
      ...botoes.map(({ rotulo, acao, secundario }) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = secundario ? "button secondary" : "button";
        b.textContent = rotulo;
        b.addEventListener("click", acao);
        return b;
      }),
    );
    // Abre no mesmo toque da última jogada: os botões ignoram toques logo em seguida
    dialogo.classList.add("cs-travado");
    setTimeout(() => dialogo.classList.remove("cs-travado"), 600);
    if (typeof dialogo.showModal === "function") {
      if (!dialogo.open) dialogo.showModal();
    } else {
      dialogo.setAttribute("open", "");
    }
    dialogoBotoes.firstElementChild?.focus();
  }

  function fecharDialogo() {
    if (!dialogo.open) return;
    if (typeof dialogo.close === "function") dialogo.close();
    else dialogo.removeAttribute("open");
  }

  function mostrarVitoria(tempo, registro) {
    const resumo = document.createElement("div");
    resumo.className = "cs-dialogo-resumo";
    for (const [rotulo, valor] of [
      ["Tempo", C.formatarTempo(tempo)],
      ["Movimentos", String(partida.movimentos)],
    ]) {
      const caixa = document.createElement("div");
      caixa.append(paragrafo(rotulo), paragrafo(valor, "cs-dialogo-numero"));
      resumo.append(caixa);
    }
    const corpo = [paragrafo("Você organizou todas as cores!"), resumo];
    if (registro.novoRecorde) corpo.push(paragrafo(`🏆 Novo recorde (${dificuldade.nome})!`, "cs-selo-recorde"));
    else if (registro.posicao) corpo.push(paragrafo(`${registro.posicao}º lugar nos seus recordes (${dificuldade.nome})`, "cs-posicao-recorde"));
    abrirDialogo({
      icone: "🏆",
      titulo: "Parabéns!",
      corpo,
      botoes: [
        { rotulo: "Jogar novamente", acao: () => comecar(dificuldade) },
        {
          rotulo: "Mudar dificuldade",
          acao: () => {
            fecharDialogo();
            botoesNivel.find((b) => b.dataset.dificuldade !== dificuldade.chave)?.focus({ preventScroll: true });
          },
          secundario: true,
        },
      ],
    });
  }

  // ---------- Controles ----------

  botoesNivel.forEach((b) =>
    b.addEventListener("click", () => {
      const nivel = C.dificuldade(b.dataset.dificuldade);
      if (nivel.chave === dificuldade.chave && !completo && partida.movimentos === 0) return;
      confirmar("Reiniciar jogo", "Tem certeza que deseja começar um novo jogo? O progresso atual será perdido.", "Sim, reiniciar", () => comecar(nivel));
    }),
  );
  botaoNovo.addEventListener("click", () =>
    confirmar("Novo nível", "Tem certeza que deseja começar um novo jogo? O progresso atual será perdido.", "Sim, novo nível", () => comecar(dificuldade)),
  );
  botaoReiniciar.addEventListener("click", () =>
    confirmar("Reiniciar nível", "Voltar ao começo deste nível? O tempo e os movimentos voltam a zero.", "Sim, reiniciar", () => comecar(dificuldade, true)),
  );
  botaoDesfazer.addEventListener("click", desfazer);

  function aplicarSimbolos() {
    raiz.classList.toggle("cs-sem-simbolos", !opcaoSimbolos.checked);
  }
  opcaoSimbolos.addEventListener("change", () => {
    aplicarSimbolos();
    gravar(CHAVE_SIMBOLOS, opcaoSimbolos.checked ? "1" : "0");
  });

  abasRecordes.forEach((aba) =>
    aba.addEventListener("click", () => {
      abaRecordes = aba.dataset.recordes;
      desenharRecordes();
    }),
  );

  // Setas andam entre os tubos
  tabuleiroEl.addEventListener("keydown", (evento) => {
    const atual = tubos.indexOf(document.activeElement);
    if (atual < 0) return;
    const passo = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[evento.key];
    if (!passo) return;
    evento.preventDefault();
    tubos[(atual + passo + tubos.length) % tubos.length].focus();
  });

  // Atalhos só com o jogo à vista, para não atrapalhar quem está lendo o texto
  function jogoVisivel() {
    const area = mesa.getBoundingClientRect();
    return area.bottom > 0 && area.top < window.innerHeight;
  }

  document.addEventListener("keydown", (evento) => {
    if (evento.altKey || evento.ctrlKey || evento.metaKey || dialogo.open) return;
    if (evento.target.closest?.("input, textarea, select, [contenteditable]")) return;
    if (!jogoVisivel()) return;
    if (evento.key === "Escape" && selecionado !== null) {
      selecionado = null;
      status.textContent = "Escolha cancelada.";
      som.tocar("toque");
      desenhar();
      return;
    }
    if (evento.key === "z" || evento.key === "Z") {
      evento.preventDefault();
      desfazer();
      return;
    }
    const numero = Number(evento.key);
    if (Number.isInteger(numero) && numero >= 1 && numero <= tubos.length) {
      evento.preventDefault();
      tubos[numero - 1].focus({ preventScroll: true });
      tocar(numero - 1);
    }
  });

  // ---------- Início ----------

  recordes = C.lerRecordes(ler(CHAVE_RECORDES));
  opcaoSimbolos.checked = ler(CHAVE_SIMBOLOS) !== "0";
  aplicarSimbolos();
  if (carregar()) {
    abaRecordes = dificuldade.chave;
    montarTubos();
    desenhar(false);
  } else {
    abaRecordes = dificuldade.chave;
    comecar(dificuldade, false, true);
    status.textContent = "";
  }
})();
