"use strict";
/*
 * Calculadora científica: interface de ui/tools/cientifica/CientificaScreen.kt (2nd vale para
 * uma tecla, hyp fica ligado, DEG/RAD/GRAD, histórico). A expressão é montada e avaliada por
 * Expressao.Cientifica e Expressao.Avaliador (expressao-logica.js), sem eval.
 * Histórico, Ans e unidade de ângulo ficam no sessionStorage (valem enquanto a aba estiver aberta).
 */
(() => {
  const raiz = document.querySelector("#cientifica");
  if (!raiz) return;

  const C = Expressao.Cientifica;
  const CHAVE = "efs-calculadora-cientifica-sessao";

  const indModo = raiz.querySelector("#sci-ind-modo");
  const indSegunda = raiz.querySelector("#sci-ind-segunda");
  const indHyp = raiz.querySelector("#sci-ind-hyp");
  const recentes = raiz.querySelector("#sci-recentes");
  const visorExpressao = raiz.querySelector("#sci-expressao");
  const visorResultado = raiz.querySelector("#sci-resultado");
  const anuncio = raiz.querySelector("#sci-anuncio");
  const funcoes = raiz.querySelector("#sci-funcoes");
  const numeros = raiz.querySelector("#sci-numeros");
  const botaoCopiar = raiz.querySelector("#sci-copiar");
  const lista = raiz.querySelector("#sci-historico-lista");
  const vazio = raiz.querySelector("#sci-historico-vazio");
  const dica = raiz.querySelector("#sci-historico-dica");
  const botaoLimparHistorico = raiz.querySelector("#sci-limpar-historico");
  const botao = (f) => raiz.querySelector(`[data-f="${f}"]`);

  const fn = (valor) => ({ tipo: "funcao", valor });
  const op = (valor) => ({ tipo: "operador", valor });
  const pos = (valor) => ({ tipo: "posfixo", valor });
  const cte = (valor) => ({ tipo: "constante", valor });

  // Linhas 3 e 4 do teclado de funções: normal e com 2nd (como no app)
  const VARIAVEIS = {
    "l3-0": [["ln", fn("ln"), "Logaritmo natural"], ["eˣ", fn("e^"), "e elevado a x"]],
    "l3-1": [["log", fn("log"), "Logaritmo na base 10"], ["10ˣ", fn("10^"), "10 elevado a x"]],
    "l3-2": [["√", fn("√"), "Raiz quadrada"], ["∛", fn("∛"), "Raiz cúbica"]],
    "l3-3": [["x²", pos("²"), "Ao quadrado"], ["x³", pos("³"), "Ao cubo"]],
    "l3-4": [["xʸ", op("^"), "Potência"], ["log₂", fn("log₂"), "Logaritmo na base 2"]],
    "l4-0": [["x⁻¹", pos("⁻¹"), "Inverso (1 sobre x)"], ["|x|", fn("abs"), "Valor absoluto"]],
    "l4-1": [["n!", pos("!"), "Fatorial"], ["nPr", op("P"), "Arranjo nPr"]],
    "l4-2": [["%", pos("%"), "Porcentagem"], ["nCr", op("C"), "Combinação nCr"]],
    "l4-3": [["Ans", cte("Ans"), "Último resultado (Ans)"], ["mod", op("mod"), "Resto da divisão (mod)"]],
  };
  const TRIG = { sin: "Seno", cos: "Cosseno", tan: "Tangente" };
  const FIXAS = {
    pi: cte("π"),
    e: cte("e"),
    abre: { tipo: "abre" },
    fecha: { tipo: "fecha" },
    ee: { tipo: "expoente" },
    ponto: { tipo: "ponto" },
    vezes: op("×"),
    dividir: op("÷"),
    mais: op("+"),
    menos: op("−"),
  };
  const NOMES_MODO = { DEG: "graus", RAD: "radianos", GRAD: "grados" };

  // ---------- Sessão ----------

  function carregar() {
    try {
      const salvo = JSON.parse(sessionStorage.getItem(CHAVE));
      if (!salvo || typeof salvo !== "object") return {};
      const historico = (Array.isArray(salvo.historico) ? salvo.historico : [])
        .filter(
          (h) =>
            h &&
            Number.isFinite(h.valor) &&
            Array.isArray(h.pecas) &&
            h.pecas.length <= C.MAX_PECAS + 50 &&
            h.pecas.every((p) => typeof p === "string" && p.length <= 8),
        )
        .slice(0, C.MAX_HISTORICO)
        .map((h) => ({ pecas: h.pecas, valor: h.valor }));
      const temAns = salvo.temAns === true && Number.isFinite(salvo.ans);
      return {
        modoAngulo: C.MODOS.includes(salvo.modoAngulo) ? salvo.modoAngulo : "DEG",
        ans: temAns ? salvo.ans : 0,
        temAns,
        historico,
      };
    } catch (erro) {
      return {}; // Sem armazenamento ou dado corrompido: começa vazio.
    }
  }

  function salvar() {
    try {
      const { modoAngulo, ans, temAns, historico } = estado;
      sessionStorage.setItem(CHAVE, JSON.stringify({ modoAngulo, ans, temAns, historico }));
    } catch (erro) {
      /* Armazenamento indisponível: o histórico vale só enquanto a página estiver aberta. */
    }
  }

  let estado = C.estado(carregar());
  let segunda = false;
  let hiperbolica = false;
  let historicoDesenhado = null;

  // ---------- Desenho ----------

  const formatar = C.formatar;
  const textoPecas = (pecas) => C.expressaoVisor(pecas.join(""));

  function desenhar() {
    indModo.textContent = estado.modoAngulo;
    indSegunda.classList.toggle("ligado", segunda);
    indHyp.classList.toggle("ligado", hiperbolica);

    const expressao = textoPecas(estado.pecas) || "0";
    const abertos = estado.avaliado ? 0 : C.parentesesAbertos(estado.pecas);
    visorExpressao.replaceChildren(document.createTextNode(expressao));
    if (abertos > 0) {
      const fantasma = document.createElement("span");
      fantasma.className = "calc-fantasma";
      fantasma.textContent = ")".repeat(abertos);
      visorExpressao.append(fantasma);
    }
    visorExpressao.dataset.tamanho = expressao.length + abertos > 28 ? "p" : "g";

    const previa = C.previa(estado);
    if (estado.erro) {
      visorResultado.textContent = C.ERROS[estado.erro];
      visorResultado.dataset.tipo = "erro";
    } else if (estado.resultado !== null) {
      visorResultado.textContent = `= ${formatar(estado.resultado)}`;
      visorResultado.dataset.tipo = "resultado";
    } else if (previa !== null) {
      visorResultado.textContent = `= ${formatar(previa)}`;
      visorResultado.dataset.tipo = "previa";
    } else {
      visorResultado.textContent = "";
      visorResultado.dataset.tipo = "vazio";
    }

    desenharTeclas();
    if (historicoDesenhado !== estado.historico) desenharHistorico();
  }

  function desenharTeclas() {
    const bSegunda = botao("segunda");
    bSegunda.classList.toggle("ativa", segunda);
    bSegunda.setAttribute("aria-pressed", String(segunda));
    const bHyp = botao("hyp");
    bHyp.classList.toggle("ativa", hiperbolica);
    bHyp.setAttribute("aria-pressed", String(hiperbolica));
    const bModo = botao("modo");
    bModo.textContent = estado.modoAngulo;
    bModo.setAttribute("aria-label", `Unidade de ângulo: ${NOMES_MODO[estado.modoAngulo]}. Trocar`);

    for (const nome of Object.keys(TRIG)) {
      const b = botao(nome);
      const h = hiperbolica ? "h" : "";
      b.textContent = segunda ? `${nome}${h}⁻¹` : `${nome}${h}`;
      const descricao = `${TRIG[nome]}${hiperbolica ? " hiperbólico" : ""}`;
      b.setAttribute("aria-label", segunda ? `Inverso do ${descricao.toLowerCase()}` : descricao);
    }
    for (const [f, opcoes] of Object.entries(VARIAVEIS)) {
      const [rotulo, , descricao] = opcoes[segunda ? 1 : 0];
      const b = botao(f);
      b.textContent = rotulo;
      b.setAttribute("aria-label", descricao);
    }
  }

  function itemHistorico(entrada) {
    const conta = textoPecas(entrada.pecas);
    const valor = formatar(entrada.valor);
    const li = document.createElement("li");
    const editar = document.createElement("button");
    editar.type = "button";
    editar.className = "calc-item";
    const spanConta = document.createElement("span");
    spanConta.className = "calc-item-conta";
    spanConta.textContent = conta;
    editar.append(spanConta);
    editar.setAttribute("aria-label", `Editar a expressão ${conta}`);
    editar.addEventListener("click", () => {
      estado = C.carregarExpressao(estado, entrada.pecas);
      anunciar("Expressão carregada para edição");
      desenhar();
    });
    const inserir = document.createElement("button");
    inserir.type = "button";
    inserir.className = "calc-item";
    const spanValor = document.createElement("span");
    spanValor.className = "calc-item-valor destaque";
    spanValor.textContent = `= ${valor}`;
    inserir.append(spanValor);
    inserir.setAttribute("aria-label", `Inserir o resultado ${valor}`);
    inserir.addEventListener("click", () => inserirValor(entrada.valor));
    li.append(editar, inserir);
    return li;
  }

  function desenharHistorico() {
    historicoDesenhado = estado.historico;
    lista.replaceChildren(...estado.historico.map((h) => itemHistorico(h)));
    const temItens = estado.historico.length > 0;
    vazio.hidden = temItens;
    dica.hidden = !temItens;
    botaoLimparHistorico.hidden = !temItens;

    // Últimos dois cálculos no visor (toque para inserir o resultado)
    recentes.replaceChildren(
      ...estado.historico
        .slice(0, 2)
        .reverse()
        .map((h) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "calc-recente";
          b.textContent = `${textoPecas(h.pecas)} = ${formatar(h.valor)}`;
          b.setAttribute("aria-label", `${b.textContent}. Inserir o resultado`);
          b.addEventListener("click", () => inserirValor(h.valor));
          return b;
        }),
    );
  }

  function inserirValor(valor) {
    estado = C.inserirValor(estado, valor);
    anunciar(`${formatar(valor)} inserido`);
    desenhar();
  }

  function anunciar(texto) {
    anuncio.textContent = "";
    requestAnimationFrame(() => {
      anuncio.textContent = texto;
    });
  }

  // ---------- Teclas ----------

  /** Mesma regra do app: as funções secundárias valem para uma tecla (menos dígitos). */
  function pressionar(tecla) {
    estado = C.pressionar(estado, tecla);
    if (segunda && tecla.tipo !== "digito") segunda = false;
    desenhar();
  }

  function trig(nome) {
    const h = hiperbolica ? "h" : "";
    return fn(segunda ? `${nome}${h}⁻¹` : `${nome}${h}`);
  }

  function executar(f) {
    if (/^d\d$/.test(f)) return pressionar({ tipo: "digito", valor: f[1] });
    if (FIXAS[f]) return pressionar(FIXAS[f]);
    if (TRIG[f]) return pressionar(trig(f));
    if (VARIAVEIS[f]) return pressionar(VARIAVEIS[f][segunda ? 1 : 0][1]);
    switch (f) {
      case "segunda":
        segunda = !segunda;
        break;
      case "hyp":
        hiperbolica = !hiperbolica;
        break;
      case "modo":
        estado = C.definirModo(estado, C.proximoModo(estado.modoAngulo));
        anunciar(`Ângulos em ${NOMES_MODO[estado.modoAngulo]}`);
        salvar();
        break;
      case "apagar":
        estado = C.apagar(estado);
        break;
      case "limpar":
        estado = C.limpar(estado);
        break;
      case "igual":
        estado = C.igual(estado);
        if (estado.erro) anunciar(C.ERROS[estado.erro]);
        else if (estado.resultado !== null) anunciar(`Resultado: ${formatar(estado.resultado)}`);
        salvar();
        break;
      default:
        return undefined;
    }
    desenhar();
    return undefined;
  }

  for (const grupo of [funcoes, numeros]) {
    grupo.addEventListener("click", (evento) => {
      const b = evento.target.closest("button[data-f]");
      if (b) executar(b.dataset.f);
    });
    // Clique com o mouse não deixa o foco na tecla: o Enter do teclado continua sendo "="
    grupo.addEventListener("mousedown", (evento) => {
      if (evento.target.closest("button")) evento.preventDefault();
    });
  }

  const ATALHOS = {
    "+": "mais",
    "-": "menos",
    "−": "menos",
    "*": "vezes",
    x: "vezes",
    "×": "vezes",
    "/": "dividir",
    "÷": "dividir",
    ",": "ponto",
    ".": "ponto",
    "(": "abre",
    ")": "fecha",
    "=": "igual",
    Enter: "igual",
    Backspace: "apagar",
    Escape: "limpar",
    Delete: "limpar",
    E: "ee",
    p: "pi",
    e: "e",
    s: "sin",
    c: "cos",
    t: "tan",
  };
  // Teclas que não dependem do 2nd: ^ ! % e as letras de funções
  const DIRETAS = {
    "^": op("^"),
    "!": pos("!"),
    "%": pos("%"),
    l: fn("ln"),
    g: fn("log"),
    r: fn("√"),
    a: cte("Ans"),
    m: op("mod"),
  };

  function piscar(f) {
    const b = f && botao(f);
    if (!b) return;
    b.classList.add("pressionada");
    setTimeout(() => b.classList.remove("pressionada"), 120);
  }

  document.addEventListener("keydown", (evento) => {
    if (evento.ctrlKey || evento.metaKey || evento.altKey || evento.defaultPrevented) return;
    const alvo = evento.target instanceof Element ? evento.target : document.body;
    if (alvo.closest("input, textarea, select, [contenteditable]")) return;
    const f = /^[0-9]$/.test(evento.key) ? `d${evento.key}` : ATALHOS[evento.key];
    const direta = DIRETAS[evento.key];
    if (!f && !direta) return;
    if (evento.key === "Enter" && alvo.closest("button, a, summary")) return;
    evento.preventDefault();
    if (f) {
      executar(f);
      piscar(f);
    } else {
      pressionar(direta);
    }
  });

  // ---------- Copiar e histórico ----------

  botaoCopiar.addEventListener("click", async () => {
    const valor = estado.resultado ?? C.previa(estado);
    const texto = valor === null ? textoPecas(estado.pecas) : formatar(valor);
    let copiou = false;
    try {
      if (!texto) throw new Error("vazio");
      await navigator.clipboard.writeText(texto);
      copiou = true;
    } catch (erro) {
      copiou = false;
    }
    botaoCopiar.textContent = copiou ? "Copiado" : "Não foi possível copiar";
    anunciar(copiou ? `${texto} copiado` : "Não foi possível copiar");
    setTimeout(() => {
      botaoCopiar.textContent = "Copiar";
    }, 1600);
  });

  botaoLimparHistorico.addEventListener("click", () => {
    estado = C.limparHistorico(estado);
    salvar();
    desenhar();
    anunciar("Histórico apagado");
    botao("igual").focus();
  });

  desenhar();
})();
