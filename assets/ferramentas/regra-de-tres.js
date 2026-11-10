"use strict";
/* Interface da regra de três. Regras em regra-de-tres-logica.js. */
(() => {
  const form = document.querySelector("#regra-de-tres");
  if (!form || typeof LogicaRegraDeTres !== "object") return;
  const R = LogicaRegraDeTres;

  const botoesModo = [...form.querySelectorAll("[data-modo]")];
  const blocos = [...form.querySelectorAll("[data-bloco]")];
  const campos = {
    a: form.querySelector("#a"),
    b: form.querySelector("#b"),
    c: form.querySelector("#c"),
    inversa: form.querySelector("#inversa"),
    alvo: form.querySelector("#alvo"),
    conhecido1: form.querySelector("#conhecido-1"),
    novo1: form.querySelector("#novo-1"),
    inversa1: form.querySelector("#inversa-1"),
    conhecido2: form.querySelector("#conhecido-2"),
    novo2: form.querySelector("#novo-2"),
    inversa2: form.querySelector("#inversa-2"),
  };
  const resultado = document.querySelector("#resultado");
  let modo = "simples";

  const numero = (valor) => Numeros.numero(valor, 6);
  const conta = (valor) => Numeros.ler(valor, { milhar: true });

  function ler(nome) {
    const campo = campos[nome];
    const valor = conta(campo.value);
    campo.setAttribute("aria-invalid", String(campo.value.trim() !== "" && valor === null));
    return valor;
  }

  function mensagem(texto, erro = false) {
    const p = document.createElement("p");
    p.className = erro ? "result-message error" : "result-message";
    p.textContent = texto;
    resultado.replaceChildren(p);
  }

  function mostrar(valor, linhas, nota) {
    const rotulo = document.createElement("div");
    rotulo.className = "result-label";
    rotulo.textContent = "x vale";
    const numeroEl = document.createElement("div");
    numeroEl.className = "result-value";
    numeroEl.textContent = numero(valor);
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
    resultado.replaceChildren(rotulo, numeroEl, lista, aviso);
  }

  const ERROS = {
    zero: "Nenhum valor pode ser zero.",
    negativo: "Use apenas números positivos.",
    grande: "O resultado é grande demais. Confira os valores.",
  };

  function calcularSimples() {
    const contaSimples = R.simples({ a: ler("a"), b: ler("b"), c: ler("c"), inversa: campos.inversa.value === "inversa" });
    if (contaSimples.incompleto) return mensagem("Preencha os três valores para achar o x.");
    if (contaSimples.erro) return mensagem(ERROS[contaSimples.erro], true);
    const { a, b, c, x, inversa } = contaSimples;
    const proporcao = inversa ? `${numero(a)} × ${numero(b)} = ${numero(c)} × x` : `${numero(a)} × x = ${numero(b)} × ${numero(c)}`;
    mostrar(
      x,
      [[inversa ? "Proporção inversa" : "Proporção direta", proporcao]],
      inversa
        ? "Grandezas inversas: quando uma cresce, a outra cai na mesma proporção. Por isso a multiplicação é cruzada."
        : "Grandezas diretas: quando uma cresce, a outra cresce na mesma proporção. Multiplique em cruz e divida pelo valor que sobra.",
    );
  }

  function calcularComposta() {
    const grandezas = [
      { conhecido: ler("conhecido1"), novo: ler("novo1"), inversa: campos.inversa1.value === "inversa" },
      { conhecido: ler("conhecido2"), novo: ler("novo2"), inversa: campos.inversa2.value === "inversa" },
    ];
    const contaComposta = R.composta({ alvo: ler("alvo"), grandezas });
    if (contaComposta.incompleto) return mensagem("Preencha o valor da grandeza do x e pelo menos uma linha completa.");
    if (contaComposta.erro) return mensagem(ERROS[contaComposta.erro], true);
    const linhas = contaComposta.grandezas.map((g, indice) => {
      const razao = g.inversa ? g.conhecido / g.novo : g.novo / g.conhecido;
      return [`Linha ${indice + 1} (${g.inversa ? "inversa" : "direta"})`, `${numero(g.conhecido)} → ${numero(g.novo)} = × ${numero(razao)}`];
    });
    linhas.push(["Fator total", `× ${numero(contaComposta.fator)}`]);
    mostrar(
      contaComposta.x,
      linhas,
      "Na regra de três composta, cada grandeza auxiliar multiplica (direta) ou divide (inversa) o valor da grandeza do x.",
    );
  }

  function atualizar() {
    for (const botao of botoesModo) {
      const ativo = botao.dataset.modo === modo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    for (const bloco of blocos) bloco.hidden = bloco.dataset.bloco !== modo;
    if (modo === "simples") calcularSimples();
    else calcularComposta();
  }

  for (const botao of botoesModo) {
    botao.addEventListener("click", () => {
      modo = botao.dataset.modo;
      atualizar();
    });
  }

  form.addEventListener("input", atualizar);
  form.addEventListener("change", atualizar);
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    atualizar();
  });
  const EXEMPLOS = {
    racao: {
      modo: "simples",
      valores: { a: "15", b: "10", c: "7", inversa: "direta" },
    },
    operarios: {
      modo: "composta",
      valores: { alvo: "100", conhecido1: "2", novo1: "4", conhecido2: "5", novo2: "10", inversa1: "direta", inversa2: "direta" },
    },
  };

  /** Preenche os campos com um exemplo pronto e volta para o topo da calculadora. */
  function aplicarExemplo(nome) {
    const exemplo = EXEMPLOS[nome];
    if (!exemplo) return;
    modo = exemplo.modo;
    for (const [campo, valor] of Object.entries(exemplo.valores)) {
      if (campos[campo]) campos[campo].value = valor;
    }
    atualizar();
    form.scrollIntoView({ block: "start" });
  }

  for (const botao of document.querySelectorAll("[data-exemplo]")) {
    botao.addEventListener("click", () => aplicarExemplo(botao.dataset.exemplo));
  }

  atualizar();
})();
