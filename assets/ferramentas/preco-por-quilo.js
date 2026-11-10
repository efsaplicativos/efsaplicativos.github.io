"use strict";
/* Interface do preço por quilo. Regras em preco-por-quilo-logica.js. */
(() => {
  const form = document.querySelector("#preco-por-quilo");
  if (!form || typeof LogicaPrecoPorQuilo !== "object") return;
  const P = LogicaPrecoPorQuilo;

  const itens = ["a", "b"].map((letra) => ({
    letra,
    nome: form.querySelector(`#nome-${letra}`),
    preco: form.querySelector(`#preco-${letra}`),
    quantidade: form.querySelector(`#quantidade-${letra}`),
    unidade: form.querySelector(`#unidade-${letra}`),
  }));
  const resultado = document.querySelector("#resultado");
  const dinheiro = (valor) => Numeros.dinheiro(valor);
  const numero = (valor, casas = 2) => Numeros.numero(valor, casas, 0);

  function ler(campo, milhar = false) {
    const valor = Numeros.ler(campo.value, { milhar });
    campo.setAttribute("aria-invalid", String(campo.value.trim() !== "" && valor === null));
    return valor;
  }

  function mensagem(texto, erro = false) {
    const p = document.createElement("p");
    p.className = erro ? "result-message error" : "result-message";
    p.textContent = texto;
    resultado.replaceChildren(p);
  }

  function mostrar(conta) {
    const rotulo = document.createElement("div");
    rotulo.className = "result-label";
    rotulo.textContent = `Mais barato: ${conta.melhor.nome}`;
    const valor = document.createElement("div");
    valor.className = "result-value";
    valor.textContent = `${dinheiro(conta.melhor.custo)} / ${conta.unidadeDaBase}`;

    const lista = document.createElement("dl");
    lista.className = "result-list";
    for (const item of conta.itens) {
      const linha = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = `${item.nome} (${numero(item.quantidade)} ${item.unidade})`;
      dd.textContent = `${dinheiro(item.preco)} → ${dinheiro(item.custo)} / ${conta.unidadeDaBase}`;
      linha.append(dt, dd);
      lista.append(linha);
    }

    const nota = document.createElement("p");
    nota.className = "note";
    nota.textContent =
      conta.economia > 0
        ? `A diferença é de ${dinheiro(conta.diferenca)} por ${conta.unidadeDaBase}, ou ${numero(conta.economia)}% a menos que a opção mais cara.`
        : "As duas opções custam o mesmo por unidade de medida.";
    resultado.replaceChildren(rotulo, valor, lista, nota);
  }

  function atualizar() {
    const conta = P.comparar(
      itens.map((item) => ({
        nome: item.nome.value,
        preco: ler(item.preco, true),
        quantidade: ler(item.quantidade),
        unidade: item.unidade.value,
      })),
    );
    if (conta.incompleto) return mensagem("Preencha o preço e a quantidade das duas embalagens.");
    if (conta.erro === "grandezas") {
      return mensagem("As duas embalagens precisam ser da mesma grandeza: peso com peso, volume com volume.", true);
    }
    mostrar(conta);
  }

  const EXEMPLOS = {
    cafe: {
      valores: { "nome-a": "Pacote 500 g", "preco-a": "18,90", "quantidade-a": "500", "unidade-a": "g", "nome-b": "Pacote 1 kg", "preco-b": "34,90", "quantidade-b": "1", "unidade-b": "kg" },
    },
  };

  for (const botao of document.querySelectorAll("[data-exemplo]")) {
    botao.addEventListener("click", () => {
      const exemplo = EXEMPLOS[botao.dataset.exemplo];
      if (!exemplo) return;
      for (const [id, valor] of Object.entries(exemplo.valores)) {
        const campo = form.querySelector(`#${id}`);
        if (campo) campo.value = valor;
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
