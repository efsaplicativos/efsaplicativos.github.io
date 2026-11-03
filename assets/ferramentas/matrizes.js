"use strict";
/*
 * Matrizes: interface de ui/tools/matrizes/MatrizesScreen.kt (editores de A e B com 6 × 6
 * células guardadas, trocar A ↔ B, operações, usar o resultado como A ou B, copiar).
 * As contas estão em matrizes-logica.js. O estado fica no localStorage.
 */
(() => {
  const raiz = document.querySelector("#matrizes");
  if (!raiz) return;

  const X = Matrizes;
  const N = X.MAX_DIM;
  const CELULAS = N * N;
  const CHAVE = "efs-matrizes-estado";
  const OPERACOES = [...X.ENTRE_AB, ...X.UMA_MATRIZ];

  const botoesOp = [...raiz.querySelectorAll("[data-op]")];
  const botoesAlvo = [...raiz.querySelectorAll("[data-alvo]")];
  const campoK = raiz.querySelector("#mat-k");
  const campoN = raiz.querySelector("#mat-n");
  const blocoK = raiz.querySelector("#mat-campo-k");
  const blocoN = raiz.querySelector("#mat-campo-n");
  const titulo = raiz.querySelector("#mat-titulo");
  const escalar = raiz.querySelector("#mat-escalar");
  const nota = raiz.querySelector("#mat-nota");
  const areaTabela = raiz.querySelector("#mat-tabela-area");
  const legendaTabela = raiz.querySelector("#mat-tabela-legenda");
  const corpoTabela = raiz.querySelector("#mat-tabela-corpo");
  const acoesResultado = raiz.querySelector("#mat-resultado-acoes");
  const mensagem = raiz.querySelector("#mat-mensagem");
  const anuncio = raiz.querySelector("#mat-anuncio");
  const botaoCopiar = raiz.querySelector("#mat-copiar");

  // ---------- Estado ----------

  function exemplo(m) {
    const lista = Array(CELULAS).fill("");
    m.forEach((linha, r) =>
      linha.forEach((v, c) => {
        lista[r * N + c] = v;
      }),
    );
    return lista;
  }

  // Primeira visita: o exemplo do texto da página
  const PADRAO = {
    A: { linhas: 2, colunas: 2, celulas: exemplo([["4", "7"], ["2", "6"]]) },
    B: { linhas: 2, colunas: 2, celulas: exemplo([["1", "2"], ["3", "4"]]) },
    alvo: "A",
    operacao: "inversa",
    k: "2",
    n: "2",
  };

  const dimensaoValida = (v) => Number.isInteger(v) && v >= 1 && v <= N;
  const celulasValidas = (v) => Array.isArray(v) && v.length === CELULAS && v.every((t) => typeof t === "string" && t.length <= 40);

  function carregar() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE));
      if (!salvo || typeof salvo !== "object") return JSON.parse(JSON.stringify(PADRAO));
      const matriz = (m, padrao) =>
        m && dimensaoValida(m.linhas) && dimensaoValida(m.colunas) && celulasValidas(m.celulas)
          ? { linhas: m.linhas, colunas: m.colunas, celulas: m.celulas }
          : JSON.parse(JSON.stringify(padrao));
      return {
        A: matriz(salvo.A, PADRAO.A),
        B: matriz(salvo.B, PADRAO.B),
        alvo: salvo.alvo === "B" ? "B" : "A",
        operacao: OPERACOES.includes(salvo.operacao) ? salvo.operacao : null,
        k: typeof salvo.k === "string" && salvo.k.length <= 40 ? salvo.k : "2",
        n: typeof salvo.n === "string" && salvo.n.length <= 40 ? salvo.n : "2",
      };
    } catch (erro) {
      return JSON.parse(JSON.stringify(PADRAO));
    }
  }

  function salvar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch (erro) {
      /* Armazenamento bloqueado: os valores valem só nesta visita. */
    }
  }

  const estado = carregar();
  let resultado = null;
  let ultimoCampo = null;

  // ---------- Editores ----------

  const editores = {};
  for (const nome of ["A", "B"]) {
    const caixa = raiz.querySelector(`.mat-editor[data-matriz="${nome}"]`);
    const grade = caixa.querySelector(`#mat-${nome}-grade`);
    const entradas = [];
    for (let i = 0; i < CELULAS; i++) {
      const r = Math.floor(i / N);
      const c = i % N;
      const id = `mat-${nome}-${r}-${c}`;
      const celula = document.createElement("div");
      celula.className = "mat-celula";
      const rotulo = document.createElement("label");
      rotulo.className = "sr-only";
      rotulo.htmlFor = id;
      rotulo.textContent = `Matriz ${nome}, linha ${r + 1}, coluna ${c + 1}`;
      const input = document.createElement("input");
      input.className = "input";
      input.id = id;
      input.inputMode = "decimal";
      input.autocomplete = "off";
      input.placeholder = "0";
      input.dataset.matriz = nome;
      input.dataset.indice = String(i);
      celula.append(rotulo, input);
      grade.append(celula);
      entradas.push({ celula, input });
    }
    editores[nome] = {
      caixa,
      grade,
      entradas,
      linhas: caixa.querySelector(`#mat-${nome}-linhas`),
      colunas: caixa.querySelector(`#mat-${nome}-colunas`),
    };
  }

  function desenharEditor(nome) {
    const m = estado[nome];
    const ed = editores[nome];
    ed.linhas.textContent = String(m.linhas);
    ed.colunas.textContent = String(m.colunas);
    ed.grade.style.setProperty("--mat-colunas", String(m.colunas));
    ed.entradas.forEach(({ celula, input }, i) => {
      const r = Math.floor(i / N);
      const c = i % N;
      celula.hidden = r >= m.linhas || c >= m.colunas;
      if (input.value !== m.celulas[i]) input.value = m.celulas[i];
      const texto = m.celulas[i].trim();
      input.setAttribute("aria-invalid", String(texto !== "" && MatematicaComum.ler(texto) === null));
    });
    for (const b of ed.caixa.querySelectorAll("[data-passo]")) {
      const valor = m[b.dataset.passo] + Number(b.dataset.delta);
      b.disabled = valor < 1 || valor > N;
    }
  }

  // ---------- Operações e resultado ----------

  function desenharOperacoes() {
    for (const b of botoesOp) {
      const ativo = b.dataset.op === estado.operacao;
      b.classList.toggle("active", ativo);
      b.setAttribute("aria-pressed", String(ativo));
      if (X.UMA_MATRIZ.includes(b.dataset.op)) b.textContent = X.rotuloOperacao(b.dataset.op, estado.alvo);
    }
    for (const b of botoesAlvo) {
      const ativo = b.dataset.alvo === estado.alvo;
      b.classList.toggle("active", ativo);
      b.setAttribute("aria-pressed", String(ativo));
    }
    blocoK.hidden = estado.operacao !== "escalar";
    blocoN.hidden = estado.operacao !== "potencia";
  }

  let ultimoAnuncio = "";
  function anunciar(texto) {
    if (texto === ultimoAnuncio) return;
    ultimoAnuncio = texto;
    anuncio.textContent = texto;
  }

  function calcular() {
    resultado = estado.operacao
      ? X.calcular({
          operacao: estado.operacao,
          alvo: estado.alvo,
          celulasA: estado.A.celulas,
          celulasB: estado.B.celulas,
          linhasA: estado.A.linhas,
          colunasA: estado.A.colunas,
          linhasB: estado.B.linhas,
          colunasB: estado.B.colunas,
          k: estado.k,
          n: estado.n,
        })
      : null;

    escalar.hidden = true;
    nota.hidden = true;
    areaTabela.hidden = true;
    acoesResultado.hidden = true;
    mensagem.hidden = true;
    mensagem.classList.remove("error");

    if (!resultado) {
      titulo.textContent = "Resultado";
      mensagem.hidden = false;
      mensagem.textContent = "Escolha uma operação para ver o resultado.";
      anunciar("");
      return;
    }
    if (resultado.tipo === "erro") {
      titulo.textContent = "Resultado";
      mensagem.hidden = false;
      mensagem.classList.add("error");
      mensagem.textContent = resultado.mensagem;
      anunciar(resultado.mensagem);
      return;
    }
    if (resultado.tipo === "escalar") {
      titulo.textContent = resultado.titulo;
      escalar.hidden = false;
      escalar.textContent = X.textoEscalar(resultado.valor);
      nota.hidden = !resultado.nota;
      nota.textContent = resultado.nota || "";
      anunciar(`${resultado.titulo} = ${escalar.textContent}`);
      return;
    }
    // Matriz: exibida já sem resíduos de arredondamento
    const limpa = X.limpar(resultado.matriz);
    titulo.textContent = X.titulo(resultado);
    legendaTabela.textContent = X.titulo(resultado);
    corpoTabela.replaceChildren(
      ...limpa.map((linha) => {
        const tr = document.createElement("tr");
        for (const v of linha) {
          const td = document.createElement("td");
          td.textContent = X.textoCelula(v);
          tr.append(td);
        }
        return tr;
      }),
    );
    areaTabela.hidden = false;
    acoesResultado.hidden = false;
    anunciar(`${X.titulo(resultado)} calculada`);
  }

  function atualizar() {
    desenharEditor("A");
    desenharEditor("B");
    desenharOperacoes();
    calcular();
  }

  /** Copia o resultado para A ou B, como "Usar como A/B" do app. */
  function carregarEm(nome) {
    if (!resultado || resultado.tipo !== "matriz") return;
    const m = resultado.matriz;
    const celulas = Array(CELULAS).fill("");
    m.forEach((linha, r) =>
      linha.forEach((v, c) => {
        celulas[r * N + c] = X.textoParaCelula(v);
      }),
    );
    estado[nome] = { linhas: m.length, colunas: m[0].length, celulas };
    salvar();
    atualizar();
    anunciar(`Resultado copiado para a matriz ${nome}`);
  }

  // ---------- Eventos ----------

  raiz.addEventListener("input", (evento) => {
    const alvo = evento.target;
    if (!(alvo instanceof HTMLInputElement)) return;
    ultimoCampo = alvo;
    if (alvo.dataset.matriz) {
      estado[alvo.dataset.matriz].celulas[Number(alvo.dataset.indice)] = alvo.value;
      const texto = alvo.value.trim();
      alvo.setAttribute("aria-invalid", String(texto !== "" && MatematicaComum.ler(texto) === null));
    } else if (alvo === campoK) {
      estado.k = alvo.value;
    } else if (alvo === campoN) {
      estado.n = alvo.value;
    }
    salvar();
    calcular();
  });
  raiz.addEventListener("focusin", (evento) => {
    if (evento.target instanceof HTMLInputElement) ultimoCampo = evento.target;
  });

  for (const nome of ["A", "B"]) {
    const ed = editores[nome];
    for (const b of ed.caixa.querySelectorAll("[data-passo]")) {
      b.addEventListener("click", () => {
        const m = estado[nome];
        const dim = b.dataset.passo;
        m[dim] = Math.min(N, Math.max(1, m[dim] + Number(b.dataset.delta)));
        salvar();
        atualizar();
      });
    }
    for (const b of ed.caixa.querySelectorAll("[data-preencher]")) {
      b.addEventListener("click", () => {
        const m = estado[nome];
        if (b.dataset.preencher === "zerar") {
          m.celulas = Array(CELULAS).fill("");
        } else {
          for (let r = 0; r < m.linhas; r++) for (let c = 0; c < m.colunas; c++) m.celulas[r * N + c] = r === c ? "1" : "0";
        }
        salvar();
        atualizar();
      });
    }
  }

  raiz.querySelector("#mat-trocar").addEventListener("click", () => {
    [estado.A, estado.B] = [estado.B, estado.A];
    salvar();
    atualizar();
    anunciar("Matrizes A e B trocadas");
  });

  for (const b of botoesOp) {
    b.addEventListener("click", () => {
      estado.operacao = b.dataset.op;
      salvar();
      desenharOperacoes();
      calcular();
    });
  }
  for (const b of botoesAlvo) {
    b.addEventListener("click", () => {
      estado.alvo = b.dataset.alvo;
      salvar();
      desenharOperacoes();
      calcular();
    });
  }

  raiz.querySelector("#mat-usar-a").addEventListener("click", () => carregarEm("A"));
  raiz.querySelector("#mat-usar-b").addEventListener("click", () => carregarEm("B"));

  botaoCopiar.addEventListener("click", async () => {
    if (!resultado || resultado.tipo !== "matriz") return;
    let copiou = false;
    try {
      await navigator.clipboard.writeText(X.textoCopia(resultado.matriz));
      copiou = true;
    } catch (erro) {
      copiou = false;
    }
    botaoCopiar.textContent = copiou ? "Copiado" : "Não foi possível copiar";
    setTimeout(() => {
      botaoCopiar.textContent = "Copiar";
    }, 1600);
  });

  const botaoSinal = raiz.querySelector("#mat-sinal");
  // Não tira o foco da célula ao tocar no botão (o teclado do celular continua aberto)
  botaoSinal.addEventListener("pointerdown", (evento) => evento.preventDefault());
  botaoSinal.addEventListener("click", () => {
    const campo = ultimoCampo && !ultimoCampo.closest("[hidden]") ? ultimoCampo : editores.A.entradas[0].input;
    const texto = campo.value.trim();
    campo.value = /^[-−]/.test(texto) ? texto.slice(1) : `-${texto}`;
    campo.focus();
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  });

  campoK.value = estado.k;
  campoN.value = estado.n;
  atualizar();
})();
