"use strict";
/*
 * Interface do Quebra-Cabeça Deslizante. Regras em quebra-cabeca-logica.js; o fluxo segue
 * ui/jogo/JogoViewModel.kt do app: toque numa peça vizinha do vazio ou arrasto (uma peça por
 * gesto, na direção predominante), pausa que esconde o tabuleiro, "Ver imagem" e recorde por
 * imagem e tamanho. As fotos são as do próprio app (12 das 25), reduzidas para a web.
 */
(() => {
  const tabuleiro = document.querySelector("#qc-tabuleiro");
  if (!tabuleiro || typeof LogicaQuebraCabeca !== "object") return;
  const Q = LogicaQuebraCabeca;
  const raiz = tabuleiro.closest(".quebra-cabeca");

  const CHAVE_PARTIDA = "efs-quebra-cabeca-partida";
  const CHAVE_RECORDES = "efs-quebra-cabeca-recordes";
  const PASTA = "/assets/jogos/quebra-cabeca/";
  const DESLIZE_MINIMO_PX = 20;
  const ESPERA_VITORIA_MS = 700;
  const TRAVA_DIALOGO_MS = 500;

  /** Os ids são os mesmos do app ("numerico" e "quebraCabeca<N>"). */
  const IMAGENS = [
    { id: "numerico", nome: "Numérico" },
    { id: "quebraCabeca1", numero: 1, nome: "Ursinho" },
    { id: "quebraCabeca2", numero: 2, nome: "Monstrinho da floresta" },
    { id: "quebraCabeca4", numero: 4, nome: "Monstro no espaço" },
    { id: "quebraCabeca6", numero: 6, nome: "Monstro azul" },
    { id: "quebraCabeca10", numero: 10, nome: "Amigas" },
    { id: "quebraCabeca14", numero: 14, nome: "Paisagem" },
    { id: "quebraCabeca15", numero: 15, nome: "Flor" },
    { id: "quebraCabeca16", numero: 16, nome: "Turma de monstros" },
    { id: "quebraCabeca17", numero: 17, nome: "Peças voadoras" },
    { id: "quebraCabeca19", numero: 19, nome: "Jardim" },
    { id: "quebraCabeca23", numero: 23, nome: "Aventureiro" },
    { id: "quebraCabeca25", numero: 25, nome: "Castelo" },
  ];
  const NOMES_NIVEL = { 3: "Fácil", 4: "Médio", 5: "Difícil" };

  const camada = raiz.querySelector("#qc-pecas");
  const previa = raiz.querySelector("#qc-previa");
  const painelPausado = raiz.querySelector("#qc-pausado");
  const listaImagens = raiz.querySelector("#qc-imagens");
  const botoesTamanho = [...raiz.querySelectorAll("[data-tamanho]")];
  const textoMovimentos = raiz.querySelector("#qc-movimentos");
  const textoTempo = raiz.querySelector("#qc-tempo");
  const textoRecorde = raiz.querySelector("#qc-recorde");
  const botaoPausa = raiz.querySelector("#qc-pausa");
  const botaoContinuar = raiz.querySelector("#qc-continuar");
  const botaoVer = raiz.querySelector("#qc-ver");
  const botaoReiniciar = raiz.querySelector("#qc-reiniciar");
  const status = raiz.querySelector("#qc-status");
  const dialogo = raiz.querySelector("#qc-dialogo");
  const dialogoTitulo = raiz.querySelector("#qc-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#qc-dialogo-texto");
  const dialogoDados = raiz.querySelector("#qc-dialogo-dados");
  const dialogoBotoes = raiz.querySelector("#qc-dialogo-botoes");
  // Sem sons.js o jogo funciona igual, só que mudo e sem o botão
  const som =
    typeof Sons === "object"
      ? Sons.criar("quebra-cabeca", raiz)
      : { tocar() {}, ligarBotao: (botao) => botao && (botao.hidden = true) };
  som.ligarBotao(raiz.querySelector("#qc-som"));

  /** { imagem, tamanho, pecas, movimentos, tempoMs } */
  let partida;
  let recordes = [];
  let pausado = false;
  let vitoria = null;
  let modoDiario = false;
  let vendoImagem = false;
  /** O tempo só corre depois de um movimento feito nesta visita à página. */
  let aguardandoMovimento = true;
  let acumuladoMs = 0;
  let inicioTrecho = null;
  let tique = null;
  const elementos = new Map();

  const imagemDe = (id) => IMAGENS.find((i) => i.id === id) || IMAGENS[1];
  const caminhoFoto = (imagem) => `${PASTA}imagem-${imagem.numero}.jpg`;

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

  function salvar() {
    if (vitoria) return;
    gravar(CHAVE_PARTIDA, { ...partida, tempoMs: decorridoMs() });
  }

  function carregar() {
    recordes = Q.lerRecordes(lerJson(CHAVE_RECORDES), IMAGENS.map((i) => i.id));
    const salva = lerJson(CHAVE_PARTIDA);
    const valida =
      salva &&
      IMAGENS.some((i) => i.id === salva.imagem) &&
      Q.valido(salva.tamanho, salva.pecas) &&
      Q.ehSolucionavel(salva.pecas) &&
      !Q.estaResolvido(salva.pecas) &&
      Number.isInteger(salva.movimentos) &&
      salva.movimentos >= 0 &&
      Number.isFinite(salva.tempoMs) &&
      salva.tempoMs >= 0;
    if (valida) {
      partida = { imagem: salva.imagem, tamanho: salva.tamanho, pecas: salva.pecas, movimentos: salva.movimentos, tempoMs: salva.tempoMs };
      acumuladoMs = salva.tempoMs;
    } else {
      partida = nova("quebraCabeca1", 3);
    }
  }

  // Modo diário (assets/jogos/diario.js): as peças saem embaralhadas com a semente do dia
  const D = typeof Diario === "object" ? Diario : null;
  const botaoDiario = document.querySelector("#qc-diario");
  if (!D && botaoDiario) botaoDiario.hidden = true;
  botaoDiario?.addEventListener("click", () => {
    if (D && partida) comecar(partida.imagem, partida.tamanho, true);
  });

  const nova = (imagem, tamanho, aleatorio) => ({ imagem, tamanho, pecas: Q.embaralhar(tamanho, aleatorio), movimentos: 0, tempoMs: 0 });

  // ---------- Cronômetro ----------

  const decorridoMs = () => acumuladoMs + (inicioTrecho === null ? 0 : performance.now() - inicioTrecho);

  function atualizarCronometro() {
    const deveCorrer = !aguardandoMovimento && !pausado && !vitoria && document.visibilityState === "visible";
    if (deveCorrer && inicioTrecho === null) {
      inicioTrecho = performance.now();
      tique = setInterval(() => (textoTempo.textContent = Q.formatarTempo(decorridoMs())), 250);
    } else if (!deveCorrer && inicioTrecho !== null) {
      acumuladoMs = decorridoMs();
      inicioTrecho = null;
      clearInterval(tique);
    }
    textoTempo.textContent = Q.formatarTempo(decorridoMs());
  }

  // ---------- Desenho ----------

  function montarImagens() {
    listaImagens.replaceChildren(
      ...IMAGENS.map((imagem) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "qc-miniatura";
        botao.dataset.imagem = imagem.id;
        botao.setAttribute("aria-label", imagem.nome);
        botao.title = imagem.nome;
        if (imagem.numero) {
          const foto = document.createElement("img");
          foto.src = `${PASTA}miniatura-${imagem.numero}.jpg`;
          foto.alt = "";
          foto.width = 64;
          foto.height = 64;
          foto.loading = "lazy";
          botao.append(foto);
        } else {
          botao.classList.add("numerica");
          for (let n = 1; n <= 8; n++) {
            const numero = document.createElement("span");
            numero.textContent = String(n);
            botao.append(numero);
          }
          botao.append(document.createElement("span"));
        }
        botao.addEventListener("click", () => trocar(imagem.id, partida.tamanho));
        return botao;
      }),
    );
  }

  /** Recria as peças (outra imagem ou outro tamanho); depois só a posição muda. */
  function montarPecas() {
    for (const el of elementos.values()) el.remove();
    elementos.clear();
    const imagem = imagemDe(partida.imagem);
    const n = partida.tamanho;
    tabuleiro.style.setProperty("--n", n);
    tabuleiro.classList.toggle("numerico", !imagem.numero);
    for (let peca = 1; peca < n * n; peca++) {
      const el = document.createElement("div");
      el.className = "qc-peca";
      const linha = Math.floor((peca - 1) / n);
      const coluna = (peca - 1) % n;
      if (imagem.numero) {
        el.style.backgroundImage = `url("${caminhoFoto(imagem)}")`;
        el.style.backgroundPosition = `${(coluna / (n - 1)) * 100}% ${(linha / (n - 1)) * 100}%`;
      } else {
        el.textContent = String(peca);
        el.dataset.cor = String(linha % 5);
      }
      el.dataset.peca = String(peca);
      elementos.set(peca, el);
      camada.append(el);
    }
    // Prévia: a imagem montada (ou os números em ordem)
    previa.replaceChildren();
    if (imagem.numero) {
      const foto = document.createElement("img");
      foto.src = caminhoFoto(imagem);
      foto.alt = `Imagem montada: ${imagem.nome}`;
      previa.append(foto);
    } else {
      for (let peca = 1; peca < n * n; peca++) {
        const numero = document.createElement("span");
        numero.textContent = String(peca);
        previa.append(numero);
      }
    }
    previa.classList.toggle("numerica", !imagem.numero);
    camada.classList.add("sem-animacao");
    desenhar();
    void camada.offsetWidth;
    camada.classList.remove("sem-animacao");
  }

  function desenhar() {
    const n = partida.tamanho;
    partida.pecas.forEach((peca, posicao) => {
      if (peca === Q.VAZIO) return;
      const el = elementos.get(peca);
      el.style.setProperty("--x", posicao % n);
      el.style.setProperty("--y", Math.floor(posicao / n));
      el.classList.toggle("movel", !vitoria && Q.podeMover(partida.pecas, posicao));
    });
    tabuleiro.classList.toggle("montado", Boolean(vitoria));
    textoMovimentos.textContent = partida.movimentos.toLocaleString("pt-BR");
    const recorde = Q.melhor(recordes, partida.imagem, partida.tamanho);
    textoRecorde.textContent = recorde ? Q.formatarTempo(recorde.tempoMs) : "--:--";
    for (const botao of listaImagens.children) {
      const ativo = botao.dataset.imagem === partida.imagem;
      botao.classList.toggle("ativa", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    for (const botao of botoesTamanho) {
      const ativo = Number(botao.dataset.tamanho) === partida.tamanho;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    painelPausado.hidden = !pausado;
    camada.classList.toggle("oculta", pausado);
    // Montado, a imagem inteira aparece no lugar das peças
    previa.hidden = !(vendoImagem || vitoria) || pausado;
    botaoVer.disabled = Boolean(vitoria);
    botaoVer.setAttribute("aria-pressed", String(vendoImagem));
    botaoVer.textContent = vendoImagem ? "Ver peças" : imagemDe(partida.imagem).numero ? "Ver imagem" : "Ver ordem";
    botaoPausa.textContent = pausado ? "Continuar" : "Pausar";
    botaoPausa.setAttribute("aria-pressed", String(pausado));
    botaoPausa.disabled = Boolean(vitoria);
    atualizarCronometro();
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

  function comecar(imagem, tamanho, diario = false) {
    fecharDialogo();
    const mudouPecas = imagem !== partida.imagem || tamanho !== partida.tamanho;
    partida = nova(imagem, tamanho, diario && D ? D.doDia("quebra-cabeca").gerador : undefined);
    modoDiario = Boolean(diario) && Boolean(D);
    if (inicioTrecho !== null) clearInterval(tique);
    inicioTrecho = null;
    acumuladoMs = 0;
    aguardandoMovimento = true;
    pausado = false;
    vitoria = null;
    vendoImagem = false;
    if (mudouPecas) montarPecas();
    else desenhar();
    salvar();
    status.textContent = `Peças embaralhadas: ${imagemDe(imagem).nome}, ${tamanho} × ${tamanho}.`;
    // Só chega aqui por clique; a partida do carregamento da página sai de carregar(), muda
    som.tocar("embaralhar");
  }

  const emAndamento = () => !vitoria && partida.movimentos > 0;

  function trocar(imagem, tamanho) {
    if (imagem === partida.imagem && tamanho === partida.tamanho) return;
    if (!emAndamento()) {
      comecar(imagem, tamanho);
      return;
    }
    abrirDialogo({
      titulo: "Começar um novo jogo?",
      texto: "O jogo salvo será substituído e o progresso dele será perdido.",
      botoes: [
        { rotulo: "Começar", acao: () => comecar(imagem, tamanho) },
        { rotulo: "Cancelar", acao: () => {}, secundario: true },
      ],
    });
  }

  function reiniciar() {
    if (!emAndamento()) {
      comecar(partida.imagem, partida.tamanho);
      return;
    }
    abrirDialogo({
      titulo: "Reiniciar a partida?",
      texto: "As peças serão embaralhadas de novo e o progresso atual será perdido.",
      botoes: [
        { rotulo: "Reiniciar", acao: () => comecar(partida.imagem, partida.tamanho) },
        { rotulo: "Cancelar", acao: () => {}, secundario: true },
      ],
    });
  }

  function aplicarMovimento(pecas) {
    if (!pecas || vitoria || pausado) return;
    partida = { ...partida, pecas, movimentos: partida.movimentos + 1 };
    aguardandoMovimento = false;
    // A última peça toca a vitória (em concluir) no lugar do deslize
    if (Q.estaResolvido(pecas)) {
      concluir();
      return;
    }
    som.tocar("deslizar");
    desenhar();
    salvar();
  }

  function concluir() {
    acumuladoMs = decorridoMs();
    inicioTrecho = null;
    clearInterval(tique);
    const resultado = { imagem: partida.imagem, tamanho: partida.tamanho, tempoMs: acumuladoMs, movimentos: partida.movimentos };
    const registro = Q.registrarResultado(recordes, resultado);
    recordes = registro.lista;
    vitoria = { ...resultado, novoRecorde: registro.novoRecorde };
    // Modo diário: fica registrado que o quebra-cabeça de hoje já foi montado
    if (modoDiario && D) D.marcarConcluido("quebra-cabeca");
    vendoImagem = false;
    gravar(CHAVE_RECORDES, recordes);
    gravar(CHAVE_PARTIDA, null);
    desenhar();
    status.textContent = "Quebra-cabeça montado!";
    som.tocar("vitoria");
    // Dá tempo de ver a última peça deslizar e a imagem se completar antes do aviso
    setTimeout(() => {
      if (!vitoria) return;
      const dados = [];
      if (vitoria.novoRecorde) dados.push(["Novo recorde!", NOMES_NIVEL[vitoria.tamanho], true]);
      dados.push(
        ["Movimentos", vitoria.movimentos.toLocaleString("pt-BR")],
        ["Tempo", Q.formatarTempo(vitoria.tempoMs)],
        ["Dificuldade", `${NOMES_NIVEL[vitoria.tamanho]} (${vitoria.tamanho} × ${vitoria.tamanho})`],
      );
      abrirDialogo({
        titulo: "Parabéns!",
        texto: "Você completou o quebra-cabeça!",
        dados,
        botoes: [
          { rotulo: "Jogar novamente", acao: () => comecar(partida.imagem, partida.tamanho) },
          { rotulo: "Fechar", acao: () => tabuleiro.focus({ preventScroll: true }), secundario: true },
        ],
      });
    }, ESPERA_VITORIA_MS);
  }

  function alternarPausa() {
    if (vitoria) return;
    pausado = !pausado;
    desenhar();
    salvar();
    status.textContent = pausado ? "Jogo pausado." : "Jogo retomado.";
    if (!pausado) tabuleiro.focus({ preventScroll: true });
  }

  // ---------- Controles ----------

  const TECLAS = {
    ArrowLeft: "esquerda",
    ArrowRight: "direita",
    ArrowUp: "cima",
    ArrowDown: "baixo",
    a: "esquerda",
    d: "direita",
    w: "cima",
    s: "baixo",
  };

  // As setas só movem peças com metade do tabuleiro na tela, para não atrapalhar a rolagem do texto
  function tabuleiroVisivel() {
    const area = tabuleiro.getBoundingClientRect();
    const visivel = Math.min(area.bottom, window.innerHeight) - Math.max(area.top, 0);
    return visivel >= area.height / 2;
  }

  document.addEventListener("keydown", (evento) => {
    if (evento.altKey || evento.ctrlKey || evento.metaKey || dialogo.open) return;
    if (evento.target.closest?.("input, textarea, select, [contenteditable]")) return;
    const direcao = TECLAS[evento.key] ?? TECLAS[evento.key?.toLowerCase()];
    if (!direcao || !tabuleiroVisivel()) return;
    // Fora do tabuleiro, as setas só valem se o foco não estiver em outro controle
    if (evento.target !== tabuleiro && evento.target.closest?.("button, a, summary")) return;
    evento.preventDefault();
    aplicarMovimento(Q.deslizar(partida.pecas, direcao));
  });

  let inicio = null;
  tabuleiro.addEventListener("pointerdown", (evento) => {
    if (evento.target.closest("button") || pausado || vitoria) return;
    const pecaEl = evento.target.closest(".qc-peca");
    inicio = { x: evento.clientX, y: evento.clientY, id: evento.pointerId, peca: pecaEl ? Number(pecaEl.dataset.peca) : null };
    try {
      tabuleiro.setPointerCapture(evento.pointerId);
    } catch (erro) {
      /* Sem captura, o gesto ainda conta se o dedo terminar sobre o tabuleiro. */
    }
  });
  tabuleiro.addEventListener("pointerup", (evento) => {
    if (!inicio || evento.pointerId !== inicio.id) return;
    const dx = evento.clientX - inicio.x;
    const dy = evento.clientY - inicio.y;
    const { peca } = inicio;
    inicio = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= DESLIZE_MINIMO_PX) {
      aplicarMovimento(Q.deslizar(partida.pecas, Q.direcaoDoArrasto(dx, dy)));
    } else if (peca !== null) {
      aplicarMovimento(Q.mover(partida.pecas, partida.pecas.indexOf(peca)));
    }
  });
  tabuleiro.addEventListener("pointercancel", () => {
    inicio = null;
  });

  for (const botao of botoesTamanho) {
    botao.addEventListener("click", () => trocar(partida.imagem, Number(botao.dataset.tamanho)));
  }
  botaoPausa.addEventListener("click", alternarPausa);
  botaoContinuar.addEventListener("click", alternarPausa);
  botaoReiniciar.addEventListener("click", reiniciar);
  botaoVer.addEventListener("click", () => {
    vendoImagem = !vendoImagem;
    desenhar();
  });

  document.addEventListener("visibilitychange", () => {
    atualizarCronometro();
    if (document.visibilityState === "hidden") salvar();
  });
  window.addEventListener("pagehide", salvar);

  // ---------- Início ----------

  carregar();
  montarImagens();
  montarPecas();
})();
