"use strict";
/*
 * Interface da calculadora de salário líquido. A lógica (tabelas de INSS e IRRF e a comparação
 * entre deduções legais e desconto simplificado) fica em salario-liquido-logica.js.
 */
(() => {
  const form = document.querySelector("#salario-liquido");
  if (!form || typeof LogicaSalarioLiquido !== "object") return;
  const S = LogicaSalarioLiquido;

  const campos = {
    bruto: form.querySelector("#bruto"),
    dependentes: form.querySelector("#dependentes"),
    pensao: form.querySelector("#pensao"),
    outros: form.querySelector("#outros"),
  };
  const resultado = document.querySelector("#resultado");

  const reais = (valor) => Numeros.dinheiro(valor);
  const desconto = (valor) => `− ${Numeros.dinheiro(valor)}`;
  const porcento = (valor) => Numeros.porcentagem(valor, 2);

  function ler(nome, dinheiro) {
    const campo = campos[nome];
    const valor = Numeros.ler(campo.value, { milhar: dinheiro });
    campo.setAttribute("aria-invalid", String(campo.value.trim() !== "" && valor === null));
    return valor;
  }

  function mensagem(texto, erro = false) {
    const p = document.createElement("p");
    p.className = erro ? "result-message error" : "result-message";
    p.textContent = texto;
    resultado.replaceChildren(p);
  }

  function linha(rotulo, valor) {
    const item = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = rotulo;
    dd.textContent = valor;
    item.append(dt, dd);
    return item;
  }

  function mostrar(conta) {
    const rotulo = document.createElement("div");
    rotulo.className = "result-label";
    rotulo.textContent = "Salário líquido";
    const valor = document.createElement("div");
    valor.className = "result-value";
    valor.textContent = reais(conta.liquido);

    const lista = document.createElement("dl");
    lista.className = "result-list";
    lista.append(linha("Salário bruto", reais(conta.bruto)));
    lista.append(linha(`INSS (${porcento(conta.inss.total / conta.bruto)})`, desconto(conta.inss.total)));
    lista.append(linha("Base do imposto de renda", reais(conta.irrf.base)));
    lista.append(linha(`IRRF pela tabela (${porcento(conta.irrf.aliquota)})`, desconto(conta.irrf.antesDaReducao)));
    if (conta.irrf.reducao > 0) {
      lista.append(linha(`Redução do imposto (${conta.referencia})`, `+ ${Numeros.dinheiro(conta.irrf.reducao)}`));
      lista.append(linha("IRRF descontado", desconto(conta.irrf.valor)));
    }
    if (conta.dependentes > 0) {
      lista.append(linha(`Dedução por dependentes (${conta.dependentes})`, reais(conta.deducaoDependentes)));
    }
    if (conta.pensao > 0) lista.append(linha("Pensão alimentícia", desconto(conta.pensao)));
    if (conta.outros > 0) lista.append(linha("Outros descontos", desconto(conta.outros)));
    lista.append(linha("Total de descontos", desconto(conta.totalDescontos)));

    const nota = document.createElement("p");
    nota.className = "note";
    const regime = conta.irrf.usaSimplificado
      ? `desconto simplificado de ${reais(S.TABELA.simplificado)}`
      : "deduções legais (INSS" +
        (conta.dependentes > 0 ? ", dependentes" : "") +
        (conta.pensao > 0 ? " e pensão" : "") +
        ")";
    const reducao =
      conta.irrf.reducao > 0
        ? ` Com a redução do imposto de ${conta.referencia}, o IRRF caiu ${reais(conta.irrf.reducao)}.`
        : "";
    nota.textContent = `Tributação pelo ${regime}. Tabelas de ${conta.referencia}.${reducao}`;

    resultado.replaceChildren(rotulo, valor, lista, nota);
  }

  function atualizar() {
    const bruto = ler("bruto", true);
    if (bruto === null || bruto <= 0) {
      mensagem("Digite o salário bruto para ver o desconto e o líquido.");
      return;
    }
    mostrar(
      S.calcular({
        bruto,
        dependentes: ler("dependentes") ?? 0,
        pensao: ler("pensao", true) ?? 0,
        outros: ler("outros", true) ?? 0,
      }),
    );
  }

  form.addEventListener("input", atualizar);
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    atualizar();
  });
  const EXEMPLOS = {
    basico: { bruto: "3.000,00", dependentes: "0", pensao: "", outros: "" },
  };

  for (const botao of document.querySelectorAll("[data-exemplo]")) {
    botao.addEventListener("click", () => {
      const exemplo = EXEMPLOS[botao.dataset.exemplo];
      if (!exemplo) return;
      for (const [campo, valor] of Object.entries(exemplo)) {
        if (campos[campo]) campos[campo].value = valor;
      }
      atualizar();
      form.scrollIntoView({ block: "start" });
    });
  }

  atualizar();
})();
