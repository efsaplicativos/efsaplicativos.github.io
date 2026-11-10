"use strict";
/* Interface do consumo de energia. Regras em energia-eletrica-logica.js. */
(() => {
  const form = document.querySelector("#energia");
  if (!form || typeof LogicaEnergia !== "object") return;
  const E = LogicaEnergia;

  const campos = {
    potencia: form.querySelector("#potencia"),
    horas: form.querySelector("#horas"),
    dias: form.querySelector("#dias"),
    tarifa: form.querySelector("#tarifa"),
  };
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

  const ERROS = {
    potencia: "A potência precisa ser maior que zero (veja na etiqueta do aparelho).",
    horas: "Informe as horas por dia, entre 0 e 24.",
    tarifa: "Informe o valor do kWh, que aparece na conta de luz.",
  };

  function atualizar() {
    const conta = E.consumo({
      potencia: ler(campos.potencia),
      horasDia: ler(campos.horas),
      dias: ler(campos.dias) ?? 30,
      tarifa: ler(campos.tarifa),
    });
    if (conta.incompleto) return mensagem("Informe a potência, as horas por dia e o preço do kWh.");
    if (conta.erro) return mensagem(ERROS[conta.erro], true);

    const rotulo = document.createElement("div");
    rotulo.className = "result-label";
    rotulo.textContent = "Custo estimado no período";
    const valor = document.createElement("div");
    valor.className = "result-value";
    valor.textContent = dinheiro(conta.custo);
    const lista = document.createElement("dl");
    lista.className = "result-list";
    for (const [nome, texto] of [
      ["Consumo", `${numero(conta.kwh)} kWh em ${conta.dias} dias`],
      ["Por dia", `${numero(conta.porDia)} kWh · ${dinheiro(conta.custoPorDia)}`],
      ["No ano (projeção)", dinheiro(conta.custoAno)],
      ["Tarifa usada", `${dinheiro(conta.tarifa)} por kWh`],
    ]) {
      const item = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = nome;
      dd.textContent = texto;
      item.append(dt, dd);
      lista.append(item);
    }
    const nota = document.createElement("p");
    nota.className = "note";
    nota.textContent = `A conta é ${numero(conta.potencia)} W ÷ 1000 × ${numero(conta.horasDia)} h × ${conta.dias} dias = ${numero(conta.kwh)} kWh.`;
    resultado.replaceChildren(rotulo, valor, lista, nota);
  }

  const EXEMPLOS = { chuveiro: { potencia: "5500", horas: "0,5", dias: "30", tarifa: "0,90" } };

  for (const botao of document.querySelectorAll("[data-exemplo]")) {
    botao.addEventListener("click", () => {
      const exemplo = EXEMPLOS[botao.dataset.exemplo];
      if (!exemplo) return;
      for (const [campo, valor] of Object.entries(exemplo)) campos[campo].value = valor;
      atualizar();
      form.scrollIntoView({ block: "start" });
    });
  }

  form.addEventListener("input", atualizar);
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    atualizar();
  });
  atualizar();
})();
