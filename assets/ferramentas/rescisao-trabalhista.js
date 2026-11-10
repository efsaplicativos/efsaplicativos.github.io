"use strict";
/*
 * Interface da calculadora de rescisão. Regras em rescisao-trabalhista-logica.js.
 */
(() => {
  const form = document.querySelector("#rescisao");
  if (!form || typeof LogicaRescisao !== "object") return;
  const R = LogicaRescisao;

  const campos = {
    salario: form.querySelector("#salario"),
    admissao: form.querySelector("#admissao"),
    afastamento: form.querySelector("#afastamento"),
    tipo: form.querySelector("#tipo"),
    aviso: form.querySelector("#aviso"),
    feriasVencidas: form.querySelector("#ferias-vencidas"),
    fgts: form.querySelector("#fgts"),
  };
  const campoAviso = form.querySelector("[data-campo='aviso']");
  const resultado = document.querySelector("#resultado");

  const reais = (valor) => Numeros.dinheiro(valor);
  const desconto = (valor) => `− ${Numeros.dinheiro(valor)}`;
  const avos = (n) => `${n}/12`;

  function ler(nome, dinheiro) {
    const campo = campos[nome];
    const valor = Numeros.ler(campo.value, { milhar: dinheiro });
    campo.setAttribute("aria-invalid", String(campo.value.trim() !== "" && valor === null));
    return valor;
  }

  function lerData(nome) {
    const valor = campos[nome].value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
    const [ano, mes, dia] = valor.split("-").map(Number);
    return { ano, mes, dia };
  }

  function mensagem(texto, erro = false) {
    const p = document.createElement("p");
    p.className = erro ? "result-message error" : "result-message";
    p.textContent = texto;
    resultado.replaceChildren(p);
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

  function mostrar(conta) {
    const v = conta.verbas;
    const d = conta.descontos;
    const linhasVerbas = [
      ["Saldo de salário", `${reais(v.saldo)} (${conta.diasTrabalhados} dias)`],
      ["Aviso prévio", v.aviso > 0 ? `${reais(v.aviso)} (${conta.diasAvisoPagos} dias)` : "—"],
      ["Férias vencidas", v.feriasVencidas > 0 ? `${reais(v.feriasVencidas)} (${conta.avos.feriasVencidas} ${conta.avos.feriasVencidas === 1 ? "período" : "períodos"})` : "—"],
      ["1/3 das férias vencidas", reais(v.tercoFeriasVencidas)],
      ["Férias proporcionais", `${reais(v.feriasProporcionais)} (${avos(conta.avos.ferias)})`],
      ["1/3 das férias proporcionais", reais(v.tercoFeriasProporcionais)],
      ["13º proporcional", `${reais(v.decimo)} (${avos(conta.avos.decimo)})`],
      ["Multa do FGTS", v.multaFgts > 0 ? reais(v.multaFgts) : "—"],
    ];
    const linhasDescontos = d.estimativa
      ? [
          ["INSS (estimativa)", desconto(d.inss)],
          ["IRRF na fonte (estimativa)", desconto(d.irrf)],
          ["Total de descontos", desconto(d.total)],
        ]
      : [["Descontos", "não calculados"]];

    const nota = document.createElement("p");
    nota.className = "note";
    nota.textContent = `Projeção do contrato: ${conta.dataProjetada.dia}/${conta.dataProjetada.mes}/${conta.dataProjetada.ano}. Os descontos são uma estimativa pelas tabelas de ${conta.referencia}; o TRCT oficial é calculado pelo empregador e pode incluir férias gozadas, adiantamentos e benefícios.`;

    resultado.replaceChildren(
      ...bloco("Total bruto das verbas", reais(v.total), linhasVerbas),
      ...bloco("Líquido estimado", reais(conta.liquido), linhasDescontos),
      nota,
    );
  }

  function atualizar() {
    const tipo = campos.tipo.value;
    campoAviso.hidden = !(tipo === "semJustaCausa" || tipo === "acordo");

    const salario = ler("salario", true);
    const admissao = lerData("admissao");
    const afastamento = lerData("afastamento");
    if (!salario || salario <= 0 || !admissao || !afastamento) {
      mensagem("Informe o salário e as duas datas para ver a rescisão.");
      return;
    }

    const conta = R.calcular({
      salario,
      admissao,
      afastamento,
      tipo,
      avisoIndenizado: campos.aviso.value !== "trabalhado",
      feriasVencidas: ler("feriasVencidas") ?? 0,
      saldoFgts: ler("fgts", true) ?? 0,
    });
    if (conta.erro === "datas") {
      mensagem("A data de afastamento não pode ser anterior à de admissão.", true);
      return;
    }
    if (conta.incompleto || conta.erro) {
      mensagem("Confira os dados informados.", true);
      return;
    }
    mostrar(conta);
  }

  form.addEventListener("input", atualizar);
  form.addEventListener("change", atualizar);
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    atualizar();
  });
  const EXEMPLOS = {
    demissao: {
      salario: "3.000,00",
      admissao: "2024-03-05",
      afastamento: "2026-11-20",
      tipo: "semJustaCausa",
      aviso: "indenizado",
      feriasVencidas: "0",
      fgts: "10.000,00",
    },
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
