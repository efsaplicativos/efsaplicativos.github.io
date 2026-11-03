"use strict";
/*
 * Calculadora básica: interface de ui/tools/basica/BasicaScreen.kt (visor, teclado, memória e
 * histórico). As regras da conta estão em Expressao.Basica (expressao-logica.js).
 * Memória e histórico ficam no sessionStorage: valem enquanto a aba estiver aberta, como "na
 * sessão" do app, e sobrevivem a um recarregamento.
 */
(() => {
  const raiz = document.querySelector("#calculadora");
  if (!raiz) return;

  const B = Expressao.Basica;
  const { Decimal } = MatematicaComum;
  const CHAVE = "efs-calculadora-sessao";

  const memoria = raiz.querySelector("#calc-memoria");
  const acima = raiz.querySelector("#calc-acima");
  const principal = raiz.querySelector("#calc-principal");
  const abaixo = raiz.querySelector("#calc-abaixo");
  const anuncio = raiz.querySelector("#calc-anuncio");
  const teclado = raiz.querySelector("#calc-teclado");
  const botaoLimpar = raiz.querySelector("#calc-limpar");
  const botaoCopiar = raiz.querySelector("#calc-copiar");
  const lista = raiz.querySelector("#calc-historico-lista");
  const vazio = raiz.querySelector("#calc-historico-vazio");
  const dica = raiz.querySelector("#calc-historico-dica");
  const botaoLimparHistorico = raiz.querySelector("#calc-limpar-historico");

  // ---------- Sessão ----------

  const NUMERO = /^-?\d+(\.\d+)?$/;
  const decimal = (texto) => (typeof texto === "string" && NUMERO.test(texto) ? Decimal.de(texto) : null);

  function carregar() {
    try {
      const salvo = JSON.parse(sessionStorage.getItem(CHAVE));
      if (!salvo || typeof salvo !== "object") return {};
      const historico = [];
      for (const item of Array.isArray(salvo.historico) ? salvo.historico.slice(0, B.MAX_HISTORICO) : []) {
        const resultado = decimal(item && item.resultado);
        const partes = item && Array.isArray(item.expressao) ? item.expressao : [];
        const expressao = partes.map((p, i) =>
          i % 2 === 0 ? decimal(p) && { tipo: "numero", valor: decimal(p) } : B.OPERADORES.includes(p) && { tipo: "operador", op: p },
        );
        if (resultado && expressao.length % 2 === 1 && expressao.every(Boolean)) historico.push({ expressao, resultado });
      }
      return { memoria: decimal(salvo.memoria), historico };
    } catch (erro) {
      return {}; // Sem armazenamento ou dado corrompido: começa vazio.
    }
  }

  function salvar() {
    try {
      sessionStorage.setItem(
        CHAVE,
        JSON.stringify({
          memoria: estado.memoria ? estado.memoria.paraTexto() : null,
          historico: estado.historico.map((h) => ({
            expressao: h.expressao.map((t) => (t.tipo === "numero" ? t.valor.paraTexto() : t.op)),
            resultado: h.resultado.paraTexto(),
          })),
        }),
      );
    } catch (erro) {
      /* Armazenamento indisponível: o histórico vale só enquanto a página estiver aberta. */
    }
  }

  let estado = B.estado(carregar());
  let historicoDesenhado = null;

  // ---------- Desenho ----------

  function desenhar() {
    const v = B.visor(estado);
    acima.textContent = v.acima;
    principal.textContent = v.principal;
    abaixo.textContent = v.abaixo;
    principal.dataset.tipo = v.tipo;
    principal.dataset.tamanho = v.principal.length > 24 ? "p" : v.principal.length > 13 ? "m" : "g";

    memoria.hidden = estado.memoria === null;
    memoria.textContent = estado.memoria === null ? "" : `Memória: ${B.formatarNumero(estado.memoria)}`;

    const soEntrada = B.limpaSoEntrada(estado);
    botaoLimpar.textContent = soEntrada ? "C" : "AC";
    botaoLimpar.setAttribute("aria-label", soEntrada ? "Apagar o número atual" : "Apagar tudo");

    if (historicoDesenhado !== estado.historico) desenharHistorico();
  }

  function desenharHistorico() {
    historicoDesenhado = estado.historico;
    const itens = estado.historico.map((item) => {
      const li = document.createElement("li");
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "calc-item";
      const conta = document.createElement("span");
      conta.className = "calc-item-conta";
      conta.textContent = `${B.textoExpressao(item.expressao)} =`;
      const valor = document.createElement("span");
      valor.className = "calc-item-valor";
      valor.textContent = B.formatarNumero(item.resultado);
      botao.append(conta, valor);
      botao.setAttribute("aria-label", `${conta.textContent} ${valor.textContent}. Usar este resultado`);
      botao.addEventListener("click", () => {
        estado = B.usarValor(estado, item.resultado);
        anunciar(`${valor.textContent} inserido`);
        desenhar();
      });
      li.append(botao);
      return li;
    });
    lista.replaceChildren(...itens);
    const temItens = itens.length > 0;
    vazio.hidden = temItens;
    dica.hidden = !temItens;
    botaoLimparHistorico.hidden = !temItens;
  }

  function anunciar(texto) {
    anuncio.textContent = "";
    // Um quadro depois, para o leitor de tela perceber a mudança mesmo com texto repetido
    requestAnimationFrame(() => {
      anuncio.textContent = texto;
    });
  }

  // ---------- Teclas ----------

  const ACOES = {
    mc: B.memoriaLimpar,
    mr: B.memoriaRecuperar,
    "m+": B.memoriaSomar,
    "m-": B.memoriaSubtrair,
    limpar: B.limpar,
    limparTudo: B.limparTudo,
    apagar: B.apagar,
    porcentagem: B.porcentagem,
    sinal: B.inverterSinal,
    virgula: B.virgula,
    igual: B.igual,
  };

  function executar(acao, valor) {
    if (acao === "digito") estado = B.digito(estado, valor);
    else if (acao === "operador") estado = B.operador(estado, valor);
    else if (ACOES[acao]) estado = ACOES[acao](estado);
    else return;
    const v = B.visor(estado);
    if (v.tipo === "erro") anunciar(v.principal);
    else if (acao === "igual" && v.tipo === "resultado") anunciar(`Resultado: ${v.principal}`);
    else if (acao === "mc") anunciar("Memória apagada");
    else if (acao.startsWith("m") && estado.memoria !== null) anunciar(`Memória: ${B.formatarNumero(estado.memoria)}`);
    salvar();
    desenhar();
  }

  teclado.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button[data-acao]");
    if (botao) executar(botao.dataset.acao, botao.dataset.valor);
  });
  // Clique com o mouse não deixa o foco na tecla: assim o Enter do teclado continua sendo "="
  teclado.addEventListener("mousedown", (evento) => {
    if (evento.target.closest("button")) evento.preventDefault();
  });

  const ATALHOS = {
    "+": ["operador", "+"],
    "-": ["operador", "−"],
    "−": ["operador", "−"],
    "*": ["operador", "×"],
    x: ["operador", "×"],
    X: ["operador", "×"],
    "×": ["operador", "×"],
    "/": ["operador", "÷"],
    "÷": ["operador", "÷"],
    ",": ["virgula"],
    ".": ["virgula"],
    "%": ["porcentagem"],
    "=": ["igual"],
    Enter: ["igual"],
    Backspace: ["apagar"],
    Delete: ["limpar"],
    Escape: ["limparTudo"],
    F9: ["sinal"],
  };

  function piscar(acao, valor) {
    const seletor = acao === "limparTudo" ? '[data-acao="limpar"]' : `[data-acao="${acao}"]${valor ? `[data-valor="${valor}"]` : ""}`;
    const botao = teclado.querySelector(seletor);
    if (!botao) return;
    botao.classList.add("pressionada");
    setTimeout(() => botao.classList.remove("pressionada"), 120);
  }

  document.addEventListener("keydown", (evento) => {
    if (evento.ctrlKey || evento.metaKey || evento.altKey || evento.defaultPrevented) return;
    const alvo = evento.target instanceof Element ? evento.target : document.body;
    if (alvo.closest("input, textarea, select, [contenteditable]")) return;
    const comando = /^[0-9]$/.test(evento.key) ? ["digito", evento.key] : ATALHOS[evento.key];
    if (!comando) return;
    // Enter num botão ou link mantém o comportamento normal (acionar o que está em foco)
    if (evento.key === "Enter" && alvo.closest("button, a, summary")) return;
    evento.preventDefault();
    executar(...comando);
    piscar(...comando);
  });

  // ---------- Copiar e histórico ----------

  botaoCopiar.addEventListener("click", async () => {
    const valor = B.valorAtual(estado);
    const texto = valor === null ? principal.textContent : B.formatarNumero(valor);
    let copiou = false;
    try {
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
    estado = B.limparHistorico(estado);
    salvar();
    desenhar();
    anunciar("Histórico apagado");
    teclado.querySelector('[data-acao="igual"]').focus();
  });

  desenhar();
})();
