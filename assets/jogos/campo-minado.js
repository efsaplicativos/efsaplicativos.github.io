"use strict";
/*
 * Interface do Campo Minado. Regras em campo-minado-logica.js; os controles seguem
 * ui/telas/jogo/JogoViewModel.kt do app: toque num número aberto abre as vizinhas, e o toque
 * longo (aqui também o botão direito e a tecla F) faz a ação contrária à do modo escolhido.
 * A partida em andamento, o modo e os recordes ficam no localStorage.
 */
(() => {
  const raiz = document.querySelector(".campo-minado");
  if (!raiz || typeof LogicaCampoMinado !== "object") return;
  const L = LogicaCampoMinado;

  const CHAVE_PARTIDA = "efs-campo-minado-partida";
  const CHAVE_RECORDES = "efs-campo-minado-recordes";
  const CHAVE_NIVEL = "efs-campo-minado-nivel";
  const TOQUE_LONGO_MS = 450;
  const FOLGA_TOQUE_PX = 10;
  const SALVAR_A_CADA_MS = 10_000;
  const TRAVA_DIALOGO_MS = 500;

  const tabuleiroEl = raiz.querySelector("#cm-tabuleiro");
  const textoMinas = raiz.querySelector("#cm-minas");
  const textoTempo = raiz.querySelector("#cm-tempo");
  const textoRecorde = raiz.querySelector("#cm-recorde");
  const status = raiz.querySelector("#cm-status");
  const botaoNovo = raiz.querySelector("#cm-novo");
  const botoesNivel = [...raiz.querySelectorAll("[data-nivel]")];
  const botoesModo = [...raiz.querySelectorAll("[data-modo]")];
  const recordesNivel = raiz.querySelector("#cm-recordes-nivel");
  const recordesLista = raiz.querySelector("#cm-recordes-lista");
  const recordesVazio = raiz.querySelector("#cm-recordes-vazio");
  const dialogo = raiz.querySelector("#cm-dialogo");
  const dialogoTitulo = raiz.querySelector("#cm-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#cm-dialogo-texto");
  const dialogoDados = raiz.querySelector("#cm-dialogo-dados");
  const dialogoBotoes = raiz.querySelector("#cm-dialogo-botoes");

  const SVG_BANDEIRA =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path class="cm-pano" d="M8 4h10l-2.6 3.8L18 11.6H8z"/></svg>';
  const SVG_MINA =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="6.2" fill="currentColor"/><circle cx="9.8" cy="9.8" r="1.7" fill="#fff" opacity=".75"/></svg>';

  let nivel = L.NIVEIS.facil;
  let tabuleiro = L.doNivel(nivel);
  /** Verdadeiro depois da primeira jogada (abrir ou marcar), quando o cronômetro começa. */
  let iniciada = false;
  /** Partida restaurada: o tempo só volta a correr na próxima jogada, não ao abrir a página. */
  let retomada = false;
  let modoBandeira = false;
  let recordes = [];
  let acumuladoMs = 0;
  let inicioTrecho = null;
  let tique = null;
  let ultimoSalvo = 0;
  let foco = 0;
  let botoes = [];

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

  function salvarPartida() {
    if (!iniciada || tabuleiro.status !== L.JOGANDO) return;
    ultimoSalvo = performance.now();
    gravar(CHAVE_PARTIDA, { nivel: nivel.id, tabuleiro, tempoMs: decorridoMs(), modoBandeira });
  }

  function carregar() {
    recordes = L.lerRecordes(lerJson(CHAVE_RECORDES));
    const preferido = lerJson(CHAVE_NIVEL);
    if (Object.hasOwn(L.NIVEIS, preferido)) nivel = L.NIVEIS[preferido];
    const salva = lerJson(CHAVE_PARTIDA);
    const nivelSalvo = salva && Object.hasOwn(L.NIVEIS, salva.nivel) ? L.NIVEIS[salva.nivel] : null;
    if (nivelSalvo && L.valido(salva.tabuleiro, nivelSalvo) && Number.isFinite(salva.tempoMs)) {
      nivel = nivelSalvo;
      tabuleiro = { ...salva.tabuleiro, explodida: -1 };
      acumuladoMs = Math.max(0, salva.tempoMs);
      modoBandeira = salva.modoBandeira === true;
      iniciada = true;
      retomada = true;
    } else {
      tabuleiro = L.doNivel(nivel);
    }
  }

  // ---------- Cronômetro ----------

  const decorridoMs = () => acumuladoMs + (inicioTrecho === null ? 0 : performance.now() - inicioTrecho);
  const segundos = () => Math.floor(decorridoMs() / 1000);

  /** O tempo só corre com a partida começada, ainda em jogo e com a página visível. */
  function atualizarCronometro() {
    const deveRodar =
      iniciada && !retomada && tabuleiro.status === L.JOGANDO && document.visibilityState === "visible";
    if (deveRodar && inicioTrecho === null) {
      inicioTrecho = performance.now();
      tique = setInterval(() => {
        textoTempo.textContent = L.formatarTempo(segundos());
        // Grava o tempo de vez em quando, caso a página seja fechada sem aviso
        if (performance.now() - ultimoSalvo >= SALVAR_A_CADA_MS) salvarPartida();
      }, 250);
    } else if (!deveRodar && inicioTrecho !== null) {
      acumuladoMs = decorridoMs();
      inicioTrecho = null;
      clearInterval(tique);
      tique = null;
    }
    textoTempo.textContent = L.formatarTempo(segundos());
  }

  // ---------- Desenho ----------

  function montarTabuleiro() {
    tabuleiroEl.style.setProperty("--linhas", nivel.linhas);
    tabuleiroEl.style.setProperty("--colunas", nivel.colunas);
    botoes = tabuleiro.celulas.map((_, i) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "cm-casa";
      botao.dataset.i = String(i);
      botao.tabIndex = -1;
      return botao;
    });
    tabuleiroEl.replaceChildren(...botoes);
    foco = Math.min(foco, botoes.length - 1);
  }

  function descrever(celula, i, fim) {
    const posicao = `Linha ${Math.floor(i / nivel.colunas) + 1}, coluna ${(i % nivel.colunas) + 1}`;
    if (celula.estado === L.MARCADA) return `${posicao}: ${fim && !celula.mina ? "bandeira errada" : "bandeira"}`;
    if (celula.estado === L.COBERTA) return `${posicao}: coberta`;
    if (celula.mina) return `${posicao}: mina`;
    if (celula.vizinhas === 0) return `${posicao}: vazia`;
    return `${posicao}: ${celula.vizinhas} ${celula.vizinhas === 1 ? "mina vizinha" : "minas vizinhas"}`;
  }

  function desenhar() {
    const fim = tabuleiro.status !== L.JOGANDO;
    tabuleiro.celulas.forEach((celula, i) => {
      const botao = botoes[i];
      let classe = `cm-casa ${celula.estado}`;
      let conteudo = "";
      if (celula.estado === L.MARCADA) {
        conteudo = SVG_BANDEIRA;
        if (fim && !celula.mina) classe += " errada";
      } else if (celula.estado === L.REVELADA) {
        if (celula.mina) {
          conteudo = SVG_MINA;
          classe += i === tabuleiro.explodida ? " mina explodida" : " mina";
        } else if (celula.vizinhas > 0) {
          conteudo = String(celula.vizinhas);
          classe += ` n${celula.vizinhas}`;
        }
      }
      if (botao.className !== classe) botao.className = classe;
      if (botao.dataset.conteudo !== conteudo) {
        botao.innerHTML = conteudo;
        botao.dataset.conteudo = conteudo;
      }
      botao.setAttribute("aria-label", descrever(celula, i, fim));
      botao.tabIndex = i === foco ? 0 : -1;
    });
    tabuleiroEl.classList.toggle("modo-bandeira", modoBandeira);
    tabuleiroEl.classList.toggle("encerrado", fim);
    textoMinas.textContent = String(L.minasRestantes(tabuleiro));
    atualizarCronometro();
  }

  function marcarBotoes(lista, atributo, valor) {
    for (const botao of lista) {
      const ativo = botao.dataset[atributo] === valor;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
  }

  function desenharRecordes() {
    const melhor = L.melhorTempo(recordes, nivel.id);
    textoRecorde.textContent = melhor === null ? "--:--" : L.formatarTempo(melhor);
    recordesNivel.textContent = nivel.nome;
    const data = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
    const itens = L.ranking(recordes, nivel.id)
      .slice(0, 10)
      .map((r) => {
        const item = document.createElement("li");
        item.textContent = `${L.formatarTempo(r.tempo)}${r.dataMs ? ` · ${data.format(new Date(r.dataMs))}` : ""}`;
        return item;
      });
    recordesLista.replaceChildren(...itens);
    recordesLista.hidden = itens.length === 0;
    recordesVazio.hidden = itens.length > 0;
  }

  function desenharTudo() {
    marcarBotoes(botoesNivel, "nivel", nivel.id);
    marcarBotoes(botoesModo, "modo", modoBandeira ? "bandeira" : "revelar");
    desenharRecordes();
    desenhar();
  }

  // ---------- Diálogo ----------

  let aoCancelarDialogo = null;

  function abrirDialogo({ titulo, texto, dados = [], botoes: acoes, aoCancelar }) {
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
      ...acoes.map(({ rotulo, acao, secundario }) => {
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
    // Um toque que já vinha da jogada não aperta um botão do diálogo por engano
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

  const partidaEmAndamento = () => iniciada && tabuleiro.status === L.JOGANDO;

  function novaPartida(novoNivel = nivel) {
    fecharDialogo();
    gravar(CHAVE_PARTIDA, null);
    if (inicioTrecho !== null) clearInterval(tique);
    inicioTrecho = null;
    tique = null;
    acumuladoMs = 0;
    iniciada = false;
    retomada = false;
    const mudouTamanho = novoNivel !== nivel;
    nivel = novoNivel;
    gravar(CHAVE_NIVEL, nivel.id);
    tabuleiro = L.doNivel(nivel);
    if (mudouTamanho || botoes.length !== tabuleiro.celulas.length) {
      foco = 0;
      montarTabuleiro();
    }
    desenharTudo();
    status.textContent = `Nova partida no nível ${nivel.nome}: ${nivel.minas} minas.`;
  }

  function confirmarNovaPartida(novoNivel = nivel) {
    if (!partidaEmAndamento()) {
      novaPartida(novoNivel);
      return;
    }
    abrirDialogo({
      titulo: "Reiniciar partida?",
      texto: "O progresso da partida atual será perdido.",
      botoes: [
        { rotulo: "Reiniciar", acao: () => novaPartida(novoNivel) },
        { rotulo: "Cancelar", acao: () => {}, secundario: true },
      ],
    });
  }

  function aplicar(novo, { bandeira = false } = {}) {
    if (novo === tabuleiro) return;
    const antes = L.minasRestantes(tabuleiro);
    tabuleiro = novo;
    iniciada = true;
    retomada = false;
    desenhar();
    if (tabuleiro.status === L.JOGANDO) {
      salvarPartida();
      if (bandeira) {
        const agora = L.minasRestantes(tabuleiro);
        status.textContent = `${agora < antes ? "Bandeira marcada" : "Bandeira retirada"}. Minas restantes: ${agora}.`;
      }
      return;
    }
    terminar(tabuleiro.status === L.VENCEU);
  }

  function terminar(venceu) {
    atualizarCronometro();
    const tempo = segundos();
    textoTempo.textContent = L.formatarTempo(tempo);
    gravar(CHAVE_PARTIDA, null);
    const anterior = L.melhorTempo(recordes, nivel.id);
    const dados = [["Tempo", L.formatarTempo(tempo)]];
    if (venceu) {
      recordes = L.adicionarRecorde(recordes, { nivel: nivel.id, tempo, dataMs: Date.now() });
      gravar(CHAVE_RECORDES, recordes);
      desenharRecordes();
      if (anterior === null || tempo < anterior) dados.push(["Novo recorde!", nivel.nome, true]);
      if (anterior !== null) dados.push(["Recorde anterior", L.formatarTempo(anterior)]);
    } else {
      dados.push(["Recorde", anterior === null ? "Sem recorde" : L.formatarTempo(anterior)]);
    }
    abrirDialogo({
      titulo: venceu ? "Parabéns!" : "Fim de jogo",
      texto: venceu
        ? "Você abriu todas as casas sem detonar nenhuma mina!"
        : "Você encontrou uma mina. Tente de novo!",
      dados,
      botoes: [
        { rotulo: "Jogar novamente", acao: () => novaPartida() },
        { rotulo: "Ver tabuleiro", acao: () => focarCasa(foco), secundario: true },
      ],
      aoCancelar: () => focarCasa(foco),
    });
  }

  const posicao = (i) => [Math.floor(i / nivel.colunas), i % nivel.colunas];

  /** Toque simples: num número aberto abre as vizinhas; numa casa coberta, segue o modo. */
  function tocar(i) {
    if (tabuleiro.status !== L.JOGANDO) return;
    const [linha, coluna] = posicao(i);
    if (tabuleiro.celulas[i].estado === L.REVELADA) aplicar(L.revelarVizinhas(tabuleiro, linha, coluna));
    else if (modoBandeira) aplicar(L.alternarBandeira(tabuleiro, linha, coluna), { bandeira: true });
    else aplicar(L.revelar(tabuleiro, linha, coluna));
  }

  /** Toque longo, botão direito ou F: a ação contrária à do modo atual. */
  function tocarLongo(i) {
    if (tabuleiro.status !== L.JOGANDO) return;
    const [linha, coluna] = posicao(i);
    if (tabuleiro.celulas[i].estado === L.REVELADA) aplicar(L.revelarVizinhas(tabuleiro, linha, coluna));
    else if (modoBandeira) aplicar(L.revelar(tabuleiro, linha, coluna));
    else aplicar(L.alternarBandeira(tabuleiro, linha, coluna), { bandeira: true });
  }

  function focarCasa(i) {
    foco = Math.max(0, Math.min(botoes.length - 1, i));
    botoes.forEach((botao, j) => (botao.tabIndex = j === foco ? 0 : -1));
    botoes[foco].focus({ preventScroll: false });
  }

  // ---------- Controles ----------

  const indiceDe = (evento) => {
    const botao = evento.target.closest?.(".cm-casa");
    return botao ? Number(botao.dataset.i) : null;
  };

  let pressao = null;
  let ultimoLongo = null;

  function cancelarPressao() {
    if (pressao) clearTimeout(pressao.timer);
    pressao = null;
  }

  function acaoLonga(i) {
    ultimoLongo = { i, quando: performance.now() };
    tocarLongo(i);
  }

  /** Depois de um toque longo, o clique (ou menu) que o navegador gera em seguida é ignorado. */
  const logoAposLongo = (i) => ultimoLongo && ultimoLongo.i === i && performance.now() - ultimoLongo.quando < 800;

  tabuleiroEl.addEventListener("pointerdown", (evento) => {
    const i = indiceDe(evento);
    if (i === null || evento.pointerType === "mouse" || !evento.isPrimary) return;
    cancelarPressao();
    pressao = {
      id: evento.pointerId,
      x: evento.clientX,
      y: evento.clientY,
      timer: setTimeout(() => {
        pressao = null;
        acaoLonga(i);
        navigator.vibrate?.(25);
      }, TOQUE_LONGO_MS),
    };
  });
  tabuleiroEl.addEventListener("pointermove", (evento) => {
    // Arrastar o dedo (para rolar o tabuleiro grande) cancela o toque longo
    if (pressao && evento.pointerId === pressao.id && Math.hypot(evento.clientX - pressao.x, evento.clientY - pressao.y) > FOLGA_TOQUE_PX) {
      cancelarPressao();
    }
  });
  for (const tipo of ["pointerup", "pointercancel", "pointerleave"]) tabuleiroEl.addEventListener(tipo, cancelarPressao);

  tabuleiroEl.addEventListener("click", (evento) => {
    const i = indiceDe(evento);
    if (i === null || logoAposLongo(i)) return;
    foco = i;
    tocar(i);
  });

  tabuleiroEl.addEventListener("contextmenu", (evento) => {
    const i = indiceDe(evento);
    if (i === null) return;
    evento.preventDefault();
    if (logoAposLongo(i)) return;
    cancelarPressao();
    foco = i;
    acaoLonga(i);
  });

  tabuleiroEl.addEventListener("keydown", (evento) => {
    const i = indiceDe(evento);
    if (i === null || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const [linha, coluna] = posicao(i);
    const destinos = {
      ArrowUp: linha > 0 ? i - nivel.colunas : i,
      ArrowDown: linha < nivel.linhas - 1 ? i + nivel.colunas : i,
      ArrowLeft: coluna > 0 ? i - 1 : i,
      ArrowRight: coluna < nivel.colunas - 1 ? i + 1 : i,
      Home: i - coluna,
      End: i - coluna + nivel.colunas - 1,
    };
    if (evento.key in destinos) {
      evento.preventDefault();
      focarCasa(destinos[evento.key]);
    } else if (evento.key === "f" || evento.key === "F") {
      evento.preventDefault();
      foco = i;
      tocarLongo(i);
    }
  });

  for (const botao of botoesNivel) {
    botao.addEventListener("click", () => {
      const escolhido = L.NIVEIS[botao.dataset.nivel];
      if (escolhido !== nivel) confirmarNovaPartida(escolhido);
    });
  }

  for (const botao of botoesModo) {
    botao.addEventListener("click", () => {
      modoBandeira = botao.dataset.modo === "bandeira";
      marcarBotoes(botoesModo, "modo", botao.dataset.modo);
      tabuleiroEl.classList.toggle("modo-bandeira", modoBandeira);
      salvarPartida();
      status.textContent = modoBandeira ? "Modo bandeira: o toque marca as casas." : "Modo revelar: o toque abre as casas.";
    });
  }

  botaoNovo.addEventListener("click", () => confirmarNovaPartida());

  document.addEventListener("visibilitychange", () => {
    atualizarCronometro();
    if (document.visibilityState === "hidden") salvarPartida();
  });
  window.addEventListener("pagehide", salvarPartida);

  // ---------- Início ----------

  carregar();
  montarTabuleiro();
  desenharTudo();
})();
