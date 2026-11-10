"use strict";
/* Interface das férias e do 13º. Regras em ferias-e-decimo-terceiro-logica.js. */
(() => {
  const form = document.querySelector("#ferias-13");
  if (!form || typeof LogicaFerias13 !== "object") return;
  const F = LogicaFerias13;

  const campoSalario = form.querySelector("#salario");
  const campoDias = form.querySelector("#dias");
  const campoAbono = form.querySelector("#abono");
  const campoAvos = form.querySelector("#avos");
  const campoParcela = form.querySelector("#parcela");
  const resultado = document.querySelector("#resultado");

  const reais = (valor) => Numeros.dinheiro(valor);
  const desconto = (valor) => `− ${Numeros.dinheiro(valor)}`;

  function lerNumero(campo, dinheiro = false) {
    const valor = Numeros.ler(campo.value, { milhar: dinheiro });
    campo.setAttribute("aria-invalid", String(campo.value.trim() !== "" && valor === null));
    return valor;
  }

  function bloco(rotulo, valor, linhas) {
    const etiqueta = document.createElement("div");
    etiqueta.className = "result-label";
    etiqueta.textContent = rotulo;
    const numero = document.createElement("div");
    numero.className = "result-value";
    numero.textContent = valor;
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
    return [etiqueta, numero, lista];
  }

  function mostrarFerias(conta) {
    const linhas = [
      [`Férias (${conta.dias} dias)`, reais(conta.ferias)],
      ["Terço constitucional (1/3)", reais(conta.terco)],
    ];
    if (conta.abono > 0) {
      linhas.push(["Abono de 10 dias (sem desconto)", reais(conta.abono)]);
      linhas.push(["Terço do abono", reais(conta.tercoAbono)]);
    }
    linhas.push(["Total bruto", reais(conta.bruto)]);
    linhas.push(["INSS", desconto(conta.inss)]);
    linhas.push(["IRRF pela tabela", desconto(conta.irrfTabela)]);
    if (conta.reducao > 0) linhas.push([`Redução do imposto (${conta.referencia})`, `+ ${reais(conta.reducao)}`]);
    linhas.push(["Total de descontos", desconto(conta.descontos)]);
    return bloco(`Férias · líquido`, reais(conta.liquido), linhas);
  }

  function mostrarDecimo(conta) {
    const rotulos = { total: "13º · líquido", primeira: "13º · 1ª parcela", segunda: "13º · 2ª parcela" };
    const linhas = [
      [`13º bruto (${conta.avos}/12)`, reais(conta.bruto)],
      ["1ª parcela (metade, sem desconto)", reais(conta.primeira)],
      ["INSS", desconto(conta.inss)],
      ["IRRF pela tabela", desconto(conta.irrfTabela)],
    ];
    if (conta.reducao > 0) linhas.push([`Redução do imposto (${conta.referencia})`, `+ ${reais(conta.reducao)}`]);
    linhas.push(["Total de descontos", desconto(conta.descontos)]);
    return bloco(rotulos[conta.parcela] ?? rotulos.total, reais(conta.valor), linhas);
  }

  function mensagem(texto) {
    const p = document.createElement("p");
    p.className = "result-message";
    p.textContent = texto;
    resultado.replaceChildren(p);
  }

  function atualizar() {
    const salario = lerNumero(campoSalario, true);
    if (!salario || salario <= 0) {
      mensagem("Informe o salário para ver as férias e o 13º.");
      return;
    }
    const ferias = F.ferias({
      salario,
      dias: lerNumero(campoDias) ?? F.DIAS_DE_FERIAS,
      abonar: campoAbono.checked,
    });
    const decimo = F.decimoTerceiro({
      salario,
      avos: lerNumero(campoAvos) ?? F.MESES_DO_ANO,
      parcela: campoParcela.value,
    });
    const nota = document.createElement("p");
    nota.className = "note";
    nota.textContent = `INSS e IRRF pelas tabelas de ${ferias.referencia}. O abono de 10 dias é indenizatório: entra no valor a receber, mas não sofre desconto.`;
    resultado.replaceChildren(...mostrarFerias(ferias), ...mostrarDecimo(decimo), nota);
  }

  form.addEventListener("input", atualizar);
  form.addEventListener("change", atualizar);
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    atualizar();
  });
  const EXEMPLOS = {
    padrao: { salario: "3.000,00", dias: "30", abono: false, avos: "12", parcela: "total" },
  };

  for (const botao of document.querySelectorAll("[data-exemplo]")) {
    botao.addEventListener("click", () => {
      const exemplo = EXEMPLOS[botao.dataset.exemplo];
      if (!exemplo) return;
      campoSalario.value = exemplo.salario;
      campoDias.value = exemplo.dias;
      campoAbono.checked = exemplo.abono;
      campoAvos.value = exemplo.avos;
      campoParcela.value = exemplo.parcela;
      atualizar();
      form.scrollIntoView({ block: "start" });
    });
  }

  atualizar();
})();
