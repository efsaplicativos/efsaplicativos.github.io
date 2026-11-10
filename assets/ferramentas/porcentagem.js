"use strict";
/* Interface da porcentagem. Regras em porcentagem-logica.js. */
(() => {
  const form = document.querySelector("#porcentagem");
  if (!form || typeof LogicaPorcentagem !== "object") return;
  const P = LogicaPorcentagem;

  const botoesModo = [...form.querySelectorAll("[data-modo]")];
  const blocos = [...form.querySelectorAll("[data-bloco]")];
  const campos = {
    percentual: form.querySelector("#percentual"),
    valor: form.querySelector("#valor"),
    ajusteValor: form.querySelector("#ajuste-valor"),
    ajustePercentual: form.querySelector("#ajuste-percentual"),
    ajusteTipo: form.querySelector("#ajuste-tipo"),
    de: form.querySelector("#de"),
    para: form.querySelector("#para"),
    parte: form.querySelector("#parte"),
    total: form.querySelector("#total"),
  };
  const resultado = document.querySelector("#resultado");
  let modo = "parte";

  const numero = (valor, casas = 2) => Numeros.numero(valor, casas, 0);
  const dinheiro = (valor) => Numeros.dinheiro(valor);

  function ler(campo) {
    const valor = Numeros.ler(campo.value, { milhar: true });
    campo.setAttribute("aria-invalid", String(campo.value.trim() !== "" && valor === null));
    return valor;
  }

  function mensagem(texto, erro = false) {
    const p = document.createElement("p");
    p.className = erro ? "result-message error" : "result-message";
    p.textContent = texto;
    resultado.replaceChildren(p);
  }

  function mostrar(rotulo, valor, linhas, nota) {
    const etiqueta = document.createElement("div");
    etiqueta.className = "result-label";
    etiqueta.textContent = rotulo;
    const numeroEl = document.createElement("div");
    numeroEl.className = "result-value";
    numeroEl.textContent = valor;
    const lista = document.createElement("dl");
    lista.className = "result-list";
    for (const [nome, texto] of linhas) {
      const item = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = nome;
      dd.textContent = texto;
      item.append(dt, dd);
      lista.append(item);
    }
    const aviso = document.createElement("p");
    aviso.className = "note";
    aviso.textContent = nota;
    resultado.replaceChildren(etiqueta, numeroEl, lista, aviso);
  }

  const ERROS = {
    negativo: "Use apenas números positivos.",
    zero: "O valor de referência não pode ser zero.",
    descontoGrande: "Um aumento acima de 100% não é permitido aqui — use o modo de variação.",
  };

  function calcularParte() {
    const conta = P.parte({ percentual: ler(campos.percentual), valor: ler(campos.valor) });
    if (conta.incompleto) return mensagem("Informe o percentual e o valor.");
    if (conta.erro) return mensagem(ERROS[conta.erro], true);
    mostrar(
      `${numero(conta.percentual)}% do valor`,
      dinheiro(conta.resultado),
      [
        ["Valor", dinheiro(conta.valor)],
        ["Percentual", `${numero(conta.percentual)}%`],
      ],
      `A conta é ${dinheiro(conta.valor)} × ${numero(conta.percentual)} ÷ 100 = ${dinheiro(conta.resultado)}.`,
    );
  }

  function calcularAjuste() {
    const desconto = campos.ajusteTipo.value === "desconto";
    const conta = P.ajuste({ valor: ler(campos.ajusteValor), percentual: ler(campos.ajustePercentual), desconto });
    if (conta.incompleto) return mensagem("Informe o valor e o percentual.");
    if (conta.erro) return mensagem(ERROS[conta.erro], true);
    mostrar(
      desconto ? "Valor com desconto" : "Valor com aumento",
      dinheiro(conta.resultado),
      [
        ["Valor original", dinheiro(conta.valor)],
        [desconto ? "Desconto" : "Aumento", dinheiro(conta.diferenca)],
        ["Percentual", `${numero(conta.percentual)}%`],
      ],
      desconto
        ? `${numero(conta.percentual)}% de ${dinheiro(conta.valor)} são ${dinheiro(conta.diferenca)}, que saem do valor.`
        : `${numero(conta.percentual)}% de ${dinheiro(conta.valor)} são ${dinheiro(conta.diferenca)}, que entram no valor.`,
    );
  }

  function calcularVariacao() {
    const conta = P.variacao({ de: ler(campos.de), para: ler(campos.para) });
    if (conta.incompleto) return mensagem("Informe o valor inicial e o final.");
    if (conta.erro) return mensagem(ERROS[conta.erro], true);
    const sinal = conta.percentual > 0 ? "+" : "";
    mostrar(
      conta.subiu ? "Variação (aumento)" : "Variação (queda)",
      `${sinal}${numero(conta.percentual)}%`,
      [
        ["Valor inicial", dinheiro(conta.de)],
        ["Valor final", dinheiro(conta.para)],
        ["Diferença", dinheiro(conta.para - conta.de)],
      ],
      `A conta é (${dinheiro(conta.para)} − ${dinheiro(conta.de)}) ÷ ${dinheiro(conta.de)} × 100.`,
    );
  }

  function calcularProporcao() {
    const conta = P.proporcao({ parte: ler(campos.parte), total: ler(campos.total) });
    if (conta.incompleto) return mensagem("Informe a parte e o total.");
    if (conta.erro) return mensagem(ERROS[conta.erro], true);
    mostrar(
      "A parte representa",
      `${numero(conta.percentual)}%`,
      [
        ["Parte", dinheiro(conta.parte)],
        ["Total", dinheiro(conta.total)],
      ],
      `A conta é ${dinheiro(conta.parte)} ÷ ${dinheiro(conta.total)} × 100 = ${numero(conta.percentual)}%.`,
    );
  }

  function atualizar() {
    for (const botao of botoesModo) {
      const ativo = botao.dataset.modo === modo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    for (const bloco of blocos) bloco.hidden = bloco.dataset.bloco !== modo;
    if (modo === "parte") calcularParte();
    else if (modo === "ajuste") calcularAjuste();
    else if (modo === "variacao") calcularVariacao();
    else calcularProporcao();
  }

  for (const botao of botoesModo) {
    botao.addEventListener("click", () => {
      modo = botao.dataset.modo;
      atualizar();
    });
  }

  const EXEMPLOS = {
    desconto: { modo: "ajuste", valores: { ajusteValor: "200", ajustePercentual: "10", ajusteTipo: "desconto" } },
  };

  for (const botao of document.querySelectorAll("[data-exemplo]")) {
    botao.addEventListener("click", () => {
      const exemplo = EXEMPLOS[botao.dataset.exemplo];
      if (!exemplo) return;
      modo = exemplo.modo;
      for (const [campo, valor] of Object.entries(exemplo.valores)) {
        if (campos[campo]) campos[campo].value = valor;
      }
      atualizar();
      form.scrollIntoView({ block: "start" });
    });
  }

  form.addEventListener("input", atualizar);
  form.addEventListener("change", atualizar);
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    atualizar();
  });
  atualizar();
})();
