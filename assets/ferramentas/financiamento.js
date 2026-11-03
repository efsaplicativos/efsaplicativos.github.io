"use strict";
/*
 * Interface da calculadora de financiamento. A lógica fica em financiamento-logica.js (porte de
 * core/emprestimo/LoanCalculator.kt da Calculadora Multifunção); a tela segue
 * ui/tools/emprestimo/EmprestimoScreen.kt: resultado do sistema escolhido, comparativo entre
 * Price, SAC e SAM e tabela de amortização.
 */
(() => {
  const form = document.querySelector("#financiamento");
  if (!form) return;

  const F = LogicaFinanciamento;
  const campos = {
    valor: form.querySelector("#valor"),
    entrada: form.querySelector("#entrada"),
    taxa: form.querySelector("#taxa"),
    prazo: form.querySelector("#prazo"),
    custos: form.querySelector("#custos"),
  };
  const DINHEIRO = new Set(["valor", "entrada", "custos"]);
  const periodoTaxa = form.querySelector("#periodo-taxa");
  const unidadePrazo = form.querySelector("#unidade-prazo");
  const dicaEntrada = form.querySelector("#entrada-dica");
  const dicaTaxa = form.querySelector("#taxa-dica");
  const dicaPrazo = form.querySelector("#prazo-dica");
  const dicaSistema = form.querySelector("#sistema-dica");
  const botoesSistema = form.querySelectorAll("[data-sistema]");
  const resultado = document.querySelector("#resultado");
  const comparativo = document.querySelector("#comparativo");
  const tabelaComparativo = comparativo.querySelector("table");
  const amortizacao = document.querySelector("#amortizacao");
  const tituloAmortizacao = amortizacao.querySelector("#amortizacao-titulo");
  const cabecalhoAmortizacao = amortizacao.querySelector("thead tr");
  const corpoAmortizacao = amortizacao.querySelector("tbody");

  const NOMES = { price: "Price", sac: "SAC", sam: "SAM" };
  const DESCRICOES = {
    price: "Price: parcelas iguais do início ao fim.",
    sac: "SAC: amortização constante; as parcelas começam maiores e diminuem.",
    sam: "SAM: sistema misto, média entre Price e SAC.",
  };
  const ERROS = {
    entrada: "A entrada deve ser menor que o valor do bem.",
    taxa: "Informe uma taxa entre 0 e 100%.",
    prazo: "Informe um prazo entre 1 e 600 meses.",
  };

  let sistema = "price";

  function ler(nome) {
    const campo = campos[nome];
    const valor = Numeros.ler(campo.value, { milhar: DINHEIRO.has(nome) });
    campo.setAttribute("aria-invalid", String(campo.value.trim() !== "" && valor === null));
    return valor;
  }

  const parcelas = (n) => `${n} ${n === 1 ? "parcela" : "parcelas"}`;

  function linha(rotulo, valor) {
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = rotulo;
    dd.textContent = valor;
    div.append(dt, dd);
    return div;
  }

  function elemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    el.textContent = texto;
    return el;
  }

  function celulas(tr, textos, tag = "td") {
    for (const texto of textos) tr.append(elemento(tag, "", texto));
    return tr;
  }

  function mensagem(texto, erro = false) {
    resultado.replaceChildren(elemento("p", erro ? "result-message error" : "result-message", texto));
    comparativo.hidden = true;
    amortizacao.hidden = true;
  }

  function mostrarResultado(t) {
    const fixa = t.sistema === "price";
    const partes = [
      elemento("div", "result-label", fixa ? "Parcela" : "Primeira parcela"),
      elemento("div", "result-value", Numeros.dinheiro(t.primeiraParcela)),
    ];
    const lista = document.createElement("dl");
    lista.className = "result-list";
    lista.append(linha("Valor financiado", Numeros.dinheiro(t.principal)), linha("Prazo", parcelas(t.meses)));
    if (fixa) {
      lista.append(linha("Última parcela", Numeros.dinheiro(t.ultimaParcela)));
    } else {
      lista.append(
        linha("Última parcela", Numeros.dinheiro(t.ultimaParcela)),
        linha("Maior parcela", Numeros.dinheiro(t.maiorParcela)),
        linha("Menor parcela", Numeros.dinheiro(t.menorParcela)),
      );
    }
    lista.append(linha("Total pago", Numeros.dinheiro(t.totalPago)), linha("Total de juros", Numeros.dinheiro(t.totalJuros)));
    if (t.totalCustos > 0) lista.append(linha("Total de custos fixos", Numeros.dinheiro(t.totalCustos)));
    lista.append(linha("Juros sobre o valor financiado", Numeros.porcentagem(t.jurosSobrePrincipal, 2)));
    if (t.custosMensais > 0) {
      const cet = F.cetMensal(t);
      if (cet !== null) {
        lista.append(
          linha("CET mensal", Numeros.porcentagem(cet)),
          linha("CET anual", Numeros.porcentagem(F.anualDeMensal(cet), 2)),
        );
      }
    }
    partes.push(lista);
    if (t.custosMensais > 0) {
      partes.push(
        elemento("p", "hint", "O Custo Efetivo Total (CET) considera os juros e os custos fixos mensais."),
      );
    }
    resultado.replaceChildren(...partes);
  }

  function mostrarComparativo(tabelas) {
    const cabecalho = celulas(document.createElement("tr"), [""], "th");
    for (const s of F.SISTEMAS) {
      cabecalho.append(elemento("th", "", s === sistema ? `${NOMES[s]} (escolhido)` : NOMES[s]));
    }
    for (const th of cabecalho.children) th.scope = "col";
    const linhas = [
      ["Primeira parcela", "primeiraParcela"],
      ["Última parcela", "ultimaParcela"],
      ["Total de juros", "totalJuros"],
      ["Total pago", "totalPago"],
    ].map(([rotulo, campo]) => {
      const tr = document.createElement("tr");
      const th = elemento("th", "", rotulo);
      th.scope = "row";
      tr.append(th);
      return celulas(tr, F.SISTEMAS.map((s) => Numeros.dinheiro(tabelas[s][campo])));
    });
    tabelaComparativo.tHead.replaceChildren(cabecalho);
    tabelaComparativo.tBodies[0].replaceChildren(...linhas);
    comparativo.hidden = false;
  }

  function mostrarAmortizacao(t) {
    const comCustos = t.custosMensais > 0;
    tituloAmortizacao.textContent = `Tabela de amortização (${NOMES[t.sistema]})`;
    const titulos = ["Mês", "Parcela", "Juros", "Amortização", ...(comCustos ? ["Custos"] : []), "Saldo devedor"];
    cabecalhoAmortizacao.replaceChildren(
      ...titulos.map((texto) => {
        const th = elemento("th", "", texto);
        th.scope = "col";
        return th;
      }),
    );
    const real = (v) => Numeros.numero(v, 2, 2);
    corpoAmortizacao.replaceChildren(
      ...t.linhas.map((l) =>
        celulas(document.createElement("tr"), [
          String(l.mes),
          real(l.parcela),
          real(l.juros),
          real(l.amortizacao),
          ...(comCustos ? [real(l.custos)] : []),
          real(l.saldo),
        ]),
      ),
    );
    amortizacao.hidden = false;
  }

  function calcular() {
    const valor = ler("valor");
    const entrada = ler("entrada");
    const taxa = ler("taxa");
    const prazo = ler("prazo");
    const custos = ler("custos");
    const invalido = Object.values(campos).some((c) => c.getAttribute("aria-invalid") === "true");

    const s = F.simular({
      valor,
      entrada,
      taxaPercentual: taxa,
      periodo: periodoTaxa.value,
      prazo,
      unidade: unidadePrazo.value,
      custos,
    });

    // Dicas dos campos, como o texto de apoio dos campos do app
    const financiado = valor !== null && valor > 0 && !(s.erros && s.erros.entrada) ? valor - (entrada ?? 0) : null;
    dicaEntrada.textContent =
      financiado !== null && (entrada ?? 0) > 0
        ? `Valor financiado: ${Numeros.dinheiro(financiado)}`
        : "Deixe em branco se não houver entrada.";
    const mensal = taxa !== null && !(s.erros && s.erros.taxa) ? F.taxaMensal(taxa, periodoTaxa.value) : null;
    dicaTaxa.textContent =
      mensal !== null
        ? `Taxa equivalente: ${Numeros.porcentagem(mensal)} ao mês · ${Numeros.porcentagem(F.anualDeMensal(mensal), 2)} ao ano`
        : "Taxas anuais viram a taxa mensal equivalente, e não a taxa ÷ 12.";
    dicaPrazo.textContent =
      prazo !== null && unidadePrazo.value === "anos" && !(s.erros && s.erros.prazo)
        ? parcelas(Math.round(prazo * 12))
        : "Até 600 meses (50 anos).";

    if (s.erros) {
      for (const nome of Object.keys(s.erros)) campos[nome].setAttribute("aria-invalid", "true");
      mensagem(Object.keys(s.erros).map((nome) => ERROS[nome]).join(" "), true);
      return;
    }
    if (s.incompleto || invalido) {
      mensagem("Preencha o valor, a taxa e o prazo para ver o resultado.");
      return;
    }
    const t = s.tabelas[sistema];
    if (![t.primeiraParcela, t.totalPago].every(Number.isFinite)) {
      mensagem("O resultado é grande demais para ser calculado. Confira os valores.", true);
      return;
    }
    mostrarResultado(t);
    mostrarComparativo(s.tabelas);
    mostrarAmortizacao(t);
  }

  for (const botao of botoesSistema) {
    botao.addEventListener("click", () => {
      sistema = botao.dataset.sistema;
      for (const b of botoesSistema) {
        const ativo = b === botao;
        b.classList.toggle("active", ativo);
        b.setAttribute("aria-pressed", String(ativo));
      }
      dicaSistema.textContent = DESCRICOES[sistema];
      calcular();
    });
  }
  form.addEventListener("input", calcular);
  form.addEventListener("change", calcular);
  form.addEventListener("submit", (evento) => evento.preventDefault());
  calcular();
})();
