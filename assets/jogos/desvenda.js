"use strict";
/*
 * Interface do Desvenda: grade 6 × 5, teclado na tela e do computador, dica, palavra do dia,
 * treino, estatísticas por modo e partida salva. As regras ficam em desvenda-logica.js e as
 * palavras, em desvenda-palavras.js.
 */
(() => {
  const raiz = document.querySelector("#desvenda");
  if (!raiz || typeof LogicaDesvenda === "undefined" || typeof PalavrasDesvenda === "undefined") return;
  const L = LogicaDesvenda;
  const dic = L.criarDicionario(PalavrasDesvenda);

  const CHAVE_MODO = "efs-desvenda-modo";
  const CHAVE_EST = "efs-desvenda-estatisticas";
  const chavePartida = (modo) => `efs-desvenda-partida-${modo}`;
  const PASSO_VIRADA_MS = 260;
  const VIRADA_MS = 460;
  const TRAVA_DIALOGO_MS = 500;
  const NOMES_MODO = { dia: "palavra do dia", treino: "treino" };
  const ELOGIOS = ["De primeira! Que faro!", "Impressionante!", "Muito bem!", "Boa!", "Ufa, deu certo!", "No último chute!"];
  const TECLAS = ["qwertyuiop", "asdfghjkl⌫", "zxcvbnm↵"];

  const $ = (s) => raiz.querySelector(s);
  const grade = $("#dv-grade");
  const teclado = $("#dv-teclado");
  const titulo = $("#dv-titulo");
  const mensagem = $("#dv-mensagem");
  const status = $("#dv-status");
  const botaoDica = $("#dv-dica");
  const textoDica = $("#dv-dica-texto");
  const botaoOutra = $("#dv-outra");
  const botoesModo = [...raiz.querySelectorAll("[data-modo]")];
  const estModo = $("#dv-est-modo");
  const estLista = $("#dv-est-lista");
  const estDist = $("#dv-est-dist");
  const dialogo = $("#dv-dialogo");
  const dialogoTitulo = $("#dv-dialogo-titulo");
  const dialogoTexto = $("#dv-dialogo-texto");
  const dialogoEst = $("#dv-dialogo-est");
  const dialogoDist = $("#dv-dialogo-dist");
  const proxima = $("#dv-proxima");
  const dialogoBotoes = $("#dv-dialogo-botoes");
  const som =
    typeof Sons === "object" ? Sons.criar("desvenda", raiz) : { tocar() {}, ligarBotao: (b) => b && (b.hidden = true) };

  let modo = "dia";
  let partida = null;
  let cursor = 0;
  let ocupado = false;
  let estatisticas = { dia: L.estatisticasVazias(), treino: L.estatisticasVazias() };
  let relogio = null;
  let mensagemTimer = null;

  const movimentoReduzido = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const formatar = (n) => n.toLocaleString("pt-BR");
  const maiuscula = (p) => p.toLocaleUpperCase("pt-BR");

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
      /* Sem armazenamento: vale só enquanto a página estiver aberta. */
    }
  }
  function carregarEstatisticas() {
    let obj = {};
    try {
      obj = JSON.parse(ler(CHAVE_EST)) || {};
    } catch (erro) {
      obj = {};
    }
    for (const m of L.MODOS) estatisticas[m] = L.lerEstatisticas(JSON.stringify(obj[m] ?? null));
  }
  function salvarEstatisticas() {
    gravar(CHAVE_EST, JSON.stringify(estatisticas));
  }
  function salvarPartida() {
    if (partida) gravar(chavePartida(partida.modo), L.paraSalvar(partida));
  }

  // ---------- Partidas ----------

  function partidaDoDia() {
    const numero = L.numeroDoDia();
    const salva = L.restaurar(ler(chavePartida("dia")), dic);
    if (salva && salva.modo === "dia" && salva.numero === numero) return salva;
    return L.novaPartida("dia", L.respostaDoDia(dic, numero), numero);
  }

  function novaPartidaTreino(evitar = []) {
    const hoje = L.respostaDoDia(dic, L.numeroDoDia());
    return L.novaPartida("treino", L.sortearTreino(dic, Math.random, [hoje, ...evitar]));
  }

  function partidaDoTreino() {
    const salva = L.restaurar(ler(chavePartida("treino")), dic);
    if (salva && salva.modo === "treino" && !salva.fim) return salva;
    return novaPartidaTreino(salva ? [salva.resposta] : []);
  }

  function carregarModo(novo, { falar = true } = {}) {
    modo = L.MODOS.includes(novo) ? novo : "dia";
    partida = modo === "dia" ? partidaDoDia() : partidaDoTreino();
    salvarPartida();
    cursor = proximaLivre(0);
    ocupado = false;
    // Quem volta à palavra do dia já terminada fica sabendo logo de cara
    if (modo === "dia" && partida.fim) {
      mostrarMensagem(
        partida.fim === "vitoria" ? "Você já desvendou a palavra de hoje!" : `A palavra de hoje era ${maiuscula(partida.resposta)}.`,
        { falar },
      );
    } else mostrarMensagem("");
    desenhar();
  }

  // ---------- Montagem ----------

  const linhas = [];
  for (let r = 0; r < L.TENTATIVAS; r++) {
    const linha = document.createElement("div");
    linha.className = "dv-linha";
    linha.setAttribute("role", "group");
    const quadrados = [];
    for (let i = 0; i < L.TAMANHO; i++) {
      const q = document.createElement("div");
      q.className = "dv-q";
      q.setAttribute("aria-hidden", "true");
      q.addEventListener("click", () => escolherQuadrado(r, i));
      linha.append(q);
      quadrados.push(q);
    }
    grade.append(linha);
    linhas.push({ linha, quadrados });
  }

  const teclas = new Map();
  for (const fileira of TECLAS) {
    const div = document.createElement("div");
    div.className = "dv-teclado-linha";
    for (const t of fileira) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dv-tecla";
      if (t === "⌫") {
        b.classList.add("larga");
        b.dataset.acao = "apagar";
        b.setAttribute("aria-label", "Apagar");
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 5H8.5a1.5 1.5 0 0 0-1.1.5L2 12l5.4 6.5a1.5 1.5 0 0 0 1.1.5H21a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Zm-3.3 10.3-1.4 1.4-2.8-2.8-2.8 2.8-1.4-1.4 2.8-2.8-2.8-2.8 1.4-1.4 2.8 2.8 2.8-2.8 1.4 1.4-2.8 2.8Z" /></svg>';
      } else if (t === "↵") {
        b.classList.add("larga");
        b.dataset.acao = "enviar";
        b.textContent = "Enviar";
      } else {
        b.dataset.letra = t;
        b.textContent = t;
        teclas.set(t, b);
      }
      div.append(b);
    }
    teclado.append(div);
  }

  // ---------- Desenho ----------

  /** Letras de uma linha enviada, com o acento da palavra (ou da resposta, se acertou). */
  function letrasComAcento(chave) {
    const forma = chave === L.normalizar(partida.resposta) ? partida.resposta : dic.forma(chave);
    return [...forma];
  }

  function descreverEstado(e) {
    return { certa: "no lugar certo", presente: "em outro lugar", ausente: "não está" }[e];
  }

  function desenhar({ semCores = -1 } = {}) {
    const fixas = L.posicoesFixas(partida);
    linhas.forEach(({ linha, quadrados }, r) => {
      const enviada = partida.linhas[r];
      const atual = !partida.fim && r === partida.linhas.length;
      linha.classList.toggle("atual", atual);
      if (enviada) {
        const letras = letrasComAcento(enviada);
        const aval = L.avaliar(enviada, partida.resposta);
        quadrados.forEach((q, i) => {
          q.textContent = letras[i];
          q.className = "dv-q";
          if (r === semCores) q.classList.add("preenchido");
          else q.dataset.estado = aval[i];
          if (r === semCores) delete q.dataset.estado;
        });
        if (r !== semCores) {
          const partes = aval.map((e, i) => `${maiuscula(letras[i])} ${descreverEstado(e)}`);
          linha.setAttribute("aria-label", `Tentativa ${r + 1}: ${maiuscula(letras.join(""))}. ${partes.join(", ")}.`);
        }
      } else if (atual) {
        quadrados.forEach((q, i) => {
          const l = partida.atual[i];
          q.textContent = l;
          q.className = "dv-q";
          delete q.dataset.estado;
          q.classList.toggle("preenchido", Boolean(l) && !fixas.has(i));
          q.classList.toggle("fixa", fixas.has(i));
          q.classList.toggle("cursor", i === cursor);
        });
        const escrito = partida.atual.map((l) => (l ? maiuscula(l) : "vazio")).join(", ");
        linha.setAttribute("aria-label", `Tentativa ${r + 1}, em edição: ${escrito}`);
      } else {
        quadrados.forEach((q) => {
          q.textContent = "";
          q.className = "dv-q";
          delete q.dataset.estado;
        });
        linha.setAttribute("aria-label", `Tentativa ${r + 1}: vazia`);
      }
    });
    if (semCores < 0) desenharTeclado();

    titulo.textContent =
      modo === "dia" ? `Palavra do dia n.º ${formatar(partida.numero)}` : "Treino: palavras sorteadas à vontade";
    botoesModo.forEach((b) => {
      const ativo = b.dataset.modo === modo;
      b.classList.toggle("active", ativo);
      b.setAttribute("aria-pressed", String(ativo));
    });
    const restantes = L.MAX_DICAS - partida.dicas.length;
    textoDica.textContent = `Dica (${restantes})`;
    botaoDica.disabled = Boolean(partida.fim) || restantes <= 0;
    botaoDica.setAttribute("aria-label", `Dica: põe uma letra certa no quadrado escolhido. Restam ${restantes}.`);
    if (modo === "treino") {
      botaoOutra.hidden = false;
      botaoOutra.textContent = "Nova palavra";
    } else {
      botaoOutra.hidden = !partida.fim;
      botaoOutra.textContent = "Ver resultado";
    }
    desenharEstatisticas(estLista, estDist, -1);
    estModo.textContent = NOMES_MODO[modo];
  }

  function desenharTeclado() {
    const estados = L.estadoDoTeclado(partida);
    for (const [letra, b] of teclas) {
      const e = estados.get(letra);
      if (e) b.dataset.estado = e;
      else delete b.dataset.estado;
      b.setAttribute("aria-label", e ? `${maiuscula(letra)}, ${descreverEstado(e)}` : maiuscula(letra));
    }
  }

  function desenharEstatisticas(lista, dist, destaque) {
    const est = estatisticas[modo];
    const pct = est.jogos ? Math.round((est.vitorias / est.jogos) * 100) : 0;
    const itens = [
      ["Jogos", formatar(est.jogos)],
      ["Vitórias", `${formatar(est.vitorias)} (${pct}%)`],
      ["Sequência", formatar(L.sequenciaAtual(est, modo, L.numeroDoDia()))],
      ["Melhor sequência", formatar(est.melhorSequencia)],
      ["Vitórias sem dica", formatar(est.semDica)],
    ];
    lista.replaceChildren(
      ...itens.map(([dt, dd]) => {
        const div = document.createElement("div");
        const t = document.createElement("dt");
        const d = document.createElement("dd");
        t.textContent = dt;
        d.textContent = dd;
        div.append(t, d);
        return div;
      }),
    );
    const maior = Math.max(1, ...est.distribuicao);
    dist.replaceChildren(
      ...est.distribuicao.map((n, i) => {
        const linha = document.createElement("div");
        linha.className = "dv-dist-linha";
        if (i === destaque) linha.classList.add("agora");
        const rotulo = document.createElement("span");
        rotulo.textContent = String(i + 1);
        const barra = document.createElement("span");
        barra.className = "dv-dist-barra";
        barra.style.width = `${Math.max(8, (n / maior) * 100)}%`;
        barra.textContent = formatar(n);
        linha.append(rotulo, barra);
        linha.setAttribute("aria-label", `Acertos na ${i + 1}ª tentativa: ${n}`);
        return linha;
      }),
    );
  }

  function mostrarMensagem(texto, { aviso = false, falar = true, duracao = 0 } = {}) {
    clearTimeout(mensagemTimer);
    mensagem.textContent = texto;
    mensagem.classList.toggle("aviso", aviso);
    if (falar && texto) anunciar(texto);
    if (duracao) mensagemTimer = setTimeout(() => (mensagem.textContent = ""), duracao);
  }

  function anunciar(texto) {
    status.textContent = "";
    requestAnimationFrame(() => (status.textContent = texto));
  }

  // ---------- Escrita ----------

  function livre(i) {
    return i >= 0 && i < L.TAMANHO && !L.posicoesFixas(partida).has(i);
  }

  /** Próximo quadrado livre e vazio a partir de [de]; -1 se a linha está cheia. */
  function proximaLivre(de) {
    for (let i = Math.max(0, de); i < L.TAMANHO; i++) if (livre(i) && !partida.atual[i]) return i;
    for (let i = 0; i < de && i < L.TAMANHO; i++) if (livre(i) && !partida.atual[i]) return i;
    return -1;
  }

  function podeEscrever() {
    return partida && !partida.fim && !ocupado && !dialogo.open;
  }

  function escreverLetra(letra) {
    if (!podeEscrever()) return;
    const pos = livre(cursor) ? cursor : proximaLivre(0);
    if (pos < 0) return;
    partida = L.escrever(partida, pos, letra);
    som.tocar("toque");
    cursor = proximaLivre(pos + 1);
    if (cursor < 0) cursor = -1;
    salvarPartida();
    desenhar();
    const q = linhas[partida.linhas.length].quadrados[pos];
    q.classList.add("pulo");
  }

  function apagarLetra() {
    if (!podeEscrever()) return;
    let alvo = -1;
    if (livre(cursor) && partida.atual[cursor]) alvo = cursor;
    else {
      const de = cursor < 0 ? L.TAMANHO - 1 : cursor - 1;
      for (let i = de; i >= 0; i--) {
        if (livre(i)) {
          alvo = i;
          break;
        }
      }
    }
    if (alvo < 0) return;
    if (partida.atual[alvo]) som.tocar("apagar");
    partida = L.apagar(partida, alvo);
    cursor = alvo;
    salvarPartida();
    desenhar();
  }

  function moverCursor(passo) {
    if (!podeEscrever()) return;
    let i = cursor < 0 ? (passo > 0 ? -1 : L.TAMANHO) : cursor;
    do i += passo;
    while (i >= 0 && i < L.TAMANHO && !livre(i));
    if (livre(i)) {
      cursor = i;
      desenhar();
    }
  }

  function escolherQuadrado(r, i) {
    if (!podeEscrever() || r !== partida.linhas.length || !livre(i)) return;
    cursor = i;
    som.tocar("selecionar");
    desenhar();
  }

  // ---------- Envio ----------

  function tremerLinha() {
    const { linha } = linhas[partida.linhas.length];
    linha.classList.remove("tremer");
    void linha.offsetWidth;
    linha.classList.add("tremer");
  }

  function enviarLinha() {
    if (!podeEscrever()) return;
    const r = L.enviar(partida, dic);
    if (!r.ok) {
      if (r.motivo === "incompleta") mostrarMensagem("Faltam letras: a palavra tem 5.", { aviso: true, duracao: 2200 });
      if (r.motivo === "invalida") {
        mostrarMensagem(`${maiuscula(r.chute)} não está na lista de palavras.`, { aviso: true, duracao: 2400 });
        som.tocar("erro");
      }
      tremerLinha();
      return;
    }
    const indice = partida.linhas.length;
    partida = r.partida;
    salvarPartida();
    mostrarMensagem("", { falar: false });
    if (partida.fim) registrar();
    revelar(indice, r.avaliacao, () => {
      cursor = proximaLivre(0);
      desenhar();
      anunciar(linhas[indice].linha.getAttribute("aria-label"));
      if (partida.fim) terminar(indice);
    });
  }

  /** Vira os quadrados um a um e só então mostra as cores no teclado. */
  function revelar(indice, avaliacao, depois) {
    ocupado = true;
    desenhar({ semCores: indice });
    const { quadrados } = linhas[indice];
    if (movimentoReduzido()) {
      ocupado = false;
      depois();
      return;
    }
    quadrados.forEach((q, i) => {
      setTimeout(() => {
        q.classList.add("virar");
        som.tocar("virar");
        setTimeout(() => {
          q.classList.remove("preenchido");
          q.dataset.estado = avaliacao[i];
        }, VIRADA_MS / 2);
      }, i * PASSO_VIRADA_MS);
    });
    setTimeout(() => {
      quadrados.forEach((q) => q.classList.remove("virar"));
      ocupado = false;
      depois();
    }, (L.TAMANHO - 1) * PASSO_VIRADA_MS + VIRADA_MS + 40);
  }

  function registrar() {
    estatisticas[partida.modo] = L.registrarResultado(estatisticas[partida.modo], partida, partida.fim === "vitoria");
    salvarEstatisticas();
  }

  function terminar(indice) {
    const venceu = partida.fim === "vitoria";
    if (venceu) {
      som.tocar("vitoria");
      mostrarMensagem(ELOGIOS[indice], { duracao: 0 });
      if (!movimentoReduzido()) {
        linhas[indice].quadrados.forEach((q, i) => setTimeout(() => q.classList.add("festa"), i * 90));
      }
    } else {
      som.tocar("derrota");
      mostrarMensagem(`A palavra era ${maiuscula(partida.resposta)}.`);
    }
    setTimeout(() => abrirResultado(), movimentoReduzido() ? 200 : 1300);
  }

  // ---------- Dica ----------

  function pedirDica() {
    if (!partida || partida.fim || ocupado) return;
    if (partida.dicas.length >= L.MAX_DICAS) {
      mostrarMensagem("Você já usou as 2 dicas desta palavra.", { aviso: true, duracao: 2400 });
      return;
    }
    if (!L.podeDica(partida)) {
      mostrarMensagem("Só falta uma letra: essa a dica não entrega!", { aviso: true, duracao: 2600 });
      som.tocar("erro");
      return;
    }
    const r = L.aplicarDica(partida, cursor);
    partida = r.partida;
    salvarPartida();
    som.tocar("dica");
    // Depois da dica, a escrita segue do primeiro quadrado vazio da linha
    if (cursor === r.pos || cursor < 0) cursor = proximaLivre(0);
    desenhar();
    linhas[partida.linhas.length].quadrados[r.pos].classList.add("revelada");
    mostrarMensagem(`Dica: a ${r.pos + 1}ª letra é ${maiuscula(r.partida.dicas.at(-1).letra)}.`, { duracao: 3000 });
  }

  // ---------- Resultado ----------

  function botao(rotulo, acao, secundario = false) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = secundario ? "button secondary" : "button";
    b.textContent = rotulo;
    b.addEventListener("click", acao);
    return b;
  }

  function abrirResultado() {
    if (!partida.fim) return;
    const venceu = partida.fim === "vitoria";
    const n = partida.linhas.length;
    dialogoTitulo.textContent = venceu ? ELOGIOS[n - 1] : "Não foi dessa vez";
    const dicas = partida.dicas.length;
    const textoDicas = dicas ? ` com ${dicas} dica${dicas > 1 ? "s" : ""}` : venceu ? " sem dica" : "";
    dialogoTexto.replaceChildren(
      venceu ? `Você desvendou ` : "A palavra era ",
      Object.assign(document.createElement("strong"), { textContent: partida.resposta }),
      venceu ? ` em ${n} tentativa${n > 1 ? "s" : ""}${textoDicas}.` : ".",
    );
    desenharEstatisticas(dialogoEst, dialogoDist, venceu ? n - 1 : -1);

    const botoes = [botao("Copiar resultado", copiarResultado)];
    if (modo === "dia") botoes.push(botao("Jogar o treino", () => trocarModo("treino"), true));
    else botoes.push(botao("Nova palavra", () => novaPalavraTreino(false), true));
    botoes.push(botao("Fechar", () => dialogo.close(), true));
    dialogoBotoes.replaceChildren(...botoes);

    proxima.hidden = modo !== "dia";
    atualizarRelogio();
    clearInterval(relogio);
    if (modo === "dia") relogio = setInterval(atualizarRelogio, 1000);
    if (!dialogo.open) dialogo.showModal();
    dialogo.classList.add("travado");
    setTimeout(() => dialogo.classList.remove("travado"), TRAVA_DIALOGO_MS);
    botoes[0].focus({ preventScroll: true });
  }

  function atualizarRelogio() {
    if (modo !== "dia") return;
    const s = Math.ceil(L.msAteProximaPalavra() / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    proxima.textContent = `Próxima palavra do dia em ${hh}:${mm}:${ss}`;
    if (s <= 0 && partida.modo === "dia" && L.numeroDoDia() !== partida.numero) {
      dialogo.close();
      carregarModo("dia");
    }
  }

  async function copiarResultado() {
    const texto = L.textoCompartilhar(partida);
    let ok = false;
    try {
      await navigator.clipboard.writeText(texto);
      ok = true;
    } catch (erro) {
      const area = document.createElement("textarea");
      area.value = texto;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      dialogo.append(area);
      area.select();
      try {
        ok = document.execCommand("copy");
      } catch (e) {
        ok = false;
      }
      area.remove();
    }
    const b = dialogoBotoes.firstElementChild;
    b.textContent = ok ? "Copiado!" : "Não deu para copiar";
    anunciar(ok ? "Resultado copiado. Agora é só colar." : "Não deu para copiar o resultado.");
    setTimeout(() => (b.textContent = "Copiar resultado"), 2200);
  }

  dialogo.addEventListener("close", () => clearInterval(relogio));
  // Clique no fundo escuro fecha o resultado
  dialogo.addEventListener("click", (e) => {
    if (e.target !== dialogo || dialogo.classList.contains("travado")) return;
    const caixa = dialogo.getBoundingClientRect();
    const fora = e.clientX < caixa.left || e.clientX > caixa.right || e.clientY < caixa.top || e.clientY > caixa.bottom;
    if (fora) dialogo.close();
  });

  // ---------- Modos e treino ----------

  function trocarModo(novo) {
    if (dialogo.open) dialogo.close();
    if (novo === modo) return;
    gravar(CHAVE_MODO, novo);
    carregarModo(novo);
  }

  /** Nova palavra no treino; abandonar uma começada pede confirmação e conta como derrota. */
  function novaPalavraTreino(perguntar = true) {
    if (ocupado) return;
    if (perguntar && L.comecou(partida)) {
      dialogoTitulo.textContent = "Começar outra palavra?";
      dialogoTexto.textContent = "A palavra atual vai contar como não acertada nas estatísticas do treino.";
      dialogoEst.replaceChildren();
      dialogoDist.replaceChildren();
      proxima.hidden = true;
      dialogoBotoes.replaceChildren(
        botao("Sim, outra palavra", () => {
          estatisticas.treino = L.registrarResultado(estatisticas.treino, partida, false);
          salvarEstatisticas();
          dialogo.close();
          novaPalavraTreino(false);
        }),
        botao("Continuar esta", () => dialogo.close(), true),
      );
      dialogo.showModal();
      dialogo.classList.add("travado");
      setTimeout(() => dialogo.classList.remove("travado"), TRAVA_DIALOGO_MS);
      dialogoBotoes.firstElementChild.focus({ preventScroll: true });
      return;
    }
    if (dialogo.open) dialogo.close();
    partida = novaPartidaTreino([partida.resposta]);
    salvarPartida();
    cursor = proximaLivre(0);
    mostrarMensagem("Nova palavra sorteada. Boa sorte!", { duracao: 2200 });
    desenhar();
  }

  botoesModo.forEach((b) => b.addEventListener("click", () => trocarModo(b.dataset.modo)));
  botaoDica.addEventListener("click", pedirDica);
  botaoOutra.addEventListener("click", () => (modo === "treino" ? novaPalavraTreino(true) : abrirResultado()));
  som.ligarBotao($("#dv-som"));

  teclado.addEventListener("click", (e) => {
    const b = e.target.closest(".dv-tecla");
    if (!b) return;
    if (b.dataset.letra) escreverLetra(b.dataset.letra);
    else if (b.dataset.acao === "apagar") apagarLetra();
    else if (b.dataset.acao === "enviar") enviarLinha();
  });

  $("#dv-zerar").addEventListener("click", () => {
    estatisticas[modo] = L.estatisticasVazias();
    salvarEstatisticas();
    desenhar();
    anunciar(`Estatísticas do ${NOMES_MODO[modo]} zeradas.`);
  });

  // ---------- Teclado do computador ----------

  /** As teclas só jogam com o jogo à vista, para não atrapalhar quem lê o texto da página. */
  function jogoVisivel() {
    const area = grade.getBoundingClientRect();
    return area.bottom > 0 && area.top < window.innerHeight;
  }

  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || dialogo.open) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    // Enter num botão fora do teclado do jogo (Dica, modos, Som...) aperta o botão
    const noTeclado = Boolean(e.target.closest?.(".dv-teclado"));
    if (e.key === "Enter" && e.target.closest?.("button, a, summary") && !noTeclado) return;
    if (!jogoVisivel()) return;
    const letra = L.normalizar(e.key);
    if (e.key.length === 1 && /^[a-z]$/.test(letra)) {
      e.preventDefault();
      escreverLetra(letra);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      apagarLetra();
    } else if (e.key === "Delete") {
      if (livre(cursor) && partida.atual[cursor] && podeEscrever()) {
        e.preventDefault();
        partida = L.apagar(partida, cursor);
        salvarPartida();
        desenhar();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      enviarLinha();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (e.target.closest?.("button, a, summary") && !noTeclado) return;
      e.preventDefault();
      moverCursor(e.key === "ArrowLeft" ? -1 : 1);
    }
  });

  // A palavra do dia muda à meia-noite: quem deixou a página aberta recebe a nova ao voltar
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && modo === "dia" && partida && L.numeroDoDia() !== partida.numero && !ocupado) {
      if (dialogo.open) dialogo.close();
      carregarModo("dia");
    }
  });

  // ---------- Início ----------

  carregarEstatisticas();
  carregarModo(ler(CHAVE_MODO), { falar: false });
})();
