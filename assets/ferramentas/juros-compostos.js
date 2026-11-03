"use strict";
/*
 * Calculadora de juros compostos: M = C · (1 + i)ⁿ.
 * Mesma lógica de core/juroscompostos/CompoundInterest.kt da Calculadora Multifunção: tudo é
 * convertido para taxa efetiva mensal e prazo em meses, e taxa anual vira mensal pela taxa
 * equivalente (1 + i)^(1/12) − 1, não por i/12.
 */
(() => {
  const form = document.querySelector("#juros");
  if (!form) return;

  const campos = {
    capital: form.querySelector("#capital"),
    montante: form.querySelector("#montante"),
    taxa: form.querySelector("#taxa"),
    prazo: form.querySelector("#prazo"),
  };
  const periodoTaxa = form.querySelector("#periodo-taxa");
  const unidadePrazo = form.querySelector("#unidade-prazo");
  const botoesAlvo = form.querySelectorAll("[data-alvo]");
  const resultado = document.querySelector("#resultado");
  const evolucao = document.querySelector("#evolucao");
  const tabela = evolucao.querySelector("tbody");
  const colunaPeriodo = evolucao.querySelector("#evolucao-periodo");

  const ERROS = {
    capital: "O capital inicial precisa ser maior que zero.",
    montante: "O valor final precisa ser maior que zero.",
    prazoNegativo: "O prazo não pode ser negativo.",
    prazo: "O prazo precisa ser maior que zero.",
    taxa: "Para calcular o prazo, a taxa precisa ser maior que zero.",
    taxaBaixa: "A taxa não pode ser de −100% ou menos.",
    montanteMenor: "Com juros positivos, o valor final precisa ser maior que o capital inicial.",
    grande: "O resultado é grande demais para ser calculado. Confira os valores.",
  };

  let alvo = "montante";
  let ultimo = null;

  /** Taxa efetiva mensal (decimal) a partir da taxa em % digitada. */
  const mensal = (taxaPercentual) =>
    periodoTaxa.value === "ano" ? (1 + taxaPercentual / 100) ** (1 / 12) - 1 : taxaPercentual / 100;
  const emMeses = (prazo) => (unidadePrazo.value === "anos" ? prazo * 12 : prazo);
  const anual = (taxaMensal) => (1 + taxaMensal) ** 12 - 1;

  function ler(nome) {
    const valor = Numeros.ler(campos[nome].value, { milhar: nome === "capital" || nome === "montante" });
    const vazio = campos[nome].value.trim() === "";
    campos[nome].setAttribute("aria-invalid", String(!vazio && valor === null));
    return valor;
  }

  /** Devolve { capital, montante, taxaMensal, meses }, { erro } ou null quando falta algum campo. */
  function resolver() {
    const c = alvo === "capital" ? null : ler("capital");
    const m = alvo === "montante" ? null : ler("montante");
    const r = alvo === "taxa" ? null : ler("taxa");
    const t = alvo === "prazo" ? null : ler("prazo");

    switch (alvo) {
      case "montante": {
        if (c === null || r === null || t === null) return null;
        if (c <= 0) return { erro: ERROS.capital };
        if (t < 0) return { erro: ERROS.prazoNegativo };
        if (r <= -100) return { erro: ERROS.taxaBaixa };
        const i = mensal(r);
        const n = emMeses(t);
        return { capital: c, montante: c * (1 + i) ** n, taxaMensal: i, meses: n };
      }
      case "capital": {
        if (m === null || r === null || t === null) return null;
        if (m <= 0) return { erro: ERROS.montante };
        if (t < 0) return { erro: ERROS.prazoNegativo };
        if (r <= -100) return { erro: ERROS.taxaBaixa };
        const i = mensal(r);
        const n = emMeses(t);
        return { capital: m / (1 + i) ** n, montante: m, taxaMensal: i, meses: n };
      }
      case "taxa": {
        if (c === null || m === null || t === null) return null;
        if (c <= 0) return { erro: ERROS.capital };
        if (m <= 0) return { erro: ERROS.montante };
        if (t <= 0) return { erro: ERROS.prazo };
        const n = emMeses(t);
        return { capital: c, montante: m, taxaMensal: (m / c) ** (1 / n) - 1, meses: n };
      }
      default: {
        if (c === null || m === null || r === null) return null;
        if (c <= 0) return { erro: ERROS.capital };
        if (m <= 0) return { erro: ERROS.montante };
        if (r <= 0) return { erro: ERROS.taxa };
        if (m < c) return { erro: ERROS.montanteMenor };
        const i = mensal(r);
        return { capital: c, montante: m, taxaMensal: i, meses: Math.log(m / c) / Math.log(1 + i) };
      }
    }
  }

  function textoPrazo(meses) {
    const m = Numeros.numero(meses, 2);
    if (meses < 12) return `${m} ${meses === 1 ? "mês" : "meses"}`;
    const anos = meses / 12;
    return `${m} meses (${Numeros.numero(anos, 2)} ${anos === 1 ? "ano" : "anos"})`;
  }

  function linha(rotulo, valor) {
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = rotulo;
    dd.textContent = valor;
    div.append(dt, dd);
    return div;
  }

  function mensagem(texto, erro = false) {
    const p = document.createElement("p");
    p.className = erro ? "result-message error" : "result-message";
    p.textContent = texto;
    resultado.replaceChildren(p);
    evolucao.hidden = true;
  }

  function mostrar(r) {
    const juros = r.montante - r.capital;
    const principal = {
      montante: ["Valor final", Numeros.dinheiro(r.montante)],
      capital: ["Capital inicial necessário", Numeros.dinheiro(r.capital)],
      taxa: [
        "Taxa de juros",
        periodoTaxa.value === "ano"
          ? `${Numeros.porcentagem(anual(r.taxaMensal))} ao ano`
          : `${Numeros.porcentagem(r.taxaMensal)} ao mês`,
      ],
      prazo: ["Prazo", textoPrazo(r.meses)],
    }[alvo];

    const rotulo = document.createElement("div");
    rotulo.className = "result-label";
    rotulo.textContent = principal[0];
    const valor = document.createElement("div");
    valor.className = "result-value";
    valor.textContent = principal[1];
    const lista = document.createElement("dl");
    lista.className = "result-list";
    lista.append(
      linha("Capital inicial", Numeros.dinheiro(r.capital)),
      linha("Juros", Numeros.dinheiro(juros)),
      linha("Valor final", Numeros.dinheiro(r.montante)),
      linha("Rendimento no período", Numeros.porcentagem(r.montante / r.capital - 1, 2)),
      linha("Taxa ao mês (equivalente)", Numeros.porcentagem(r.taxaMensal)),
      linha("Taxa ao ano (equivalente)", Numeros.porcentagem(anual(r.taxaMensal))),
      linha("Prazo", textoPrazo(r.meses)),
    );
    resultado.replaceChildren(rotulo, valor, lista);
    mostrarEvolucao(r);
  }

  /** Tabela mês a mês até 5 anos e ano a ano depois disso, como no app. */
  function mostrarEvolucao(r) {
    const porAno = r.meses > 60;
    const passo = porAno ? 12 : 1;
    const limite = porAno ? 200 : 1200;
    const periodos = Math.min(Math.floor(r.meses / passo + 1e-9), limite);
    colunaPeriodo.textContent = porAno ? "Ano" : "Mês";

    const linhas = [];
    let anterior = r.capital;
    const adicionar = (periodo, saldo) => {
      const tr = document.createElement("tr");
      for (const texto of [
        periodo,
        Numeros.dinheiro(saldo - anterior),
        Numeros.dinheiro(saldo - r.capital),
        Numeros.dinheiro(saldo),
      ]) {
        const td = document.createElement("td");
        td.textContent = texto;
        tr.append(td);
      }
      linhas.push(tr);
      anterior = saldo;
    };
    adicionar("0", r.capital);
    for (let k = 1; k <= periodos; k++) {
      adicionar(String(k), r.capital * (1 + r.taxaMensal) ** (k * passo));
    }
    // Prazo quebrado: a última linha mostra o valor no fim exato do prazo
    if (r.meses / passo - periodos > 1e-6 && periodos < limite) adicionar("Fim", r.montante);

    tabela.replaceChildren(...linhas);
    evolucao.hidden = false;
  }

  function calcular() {
    const r = resolver();
    if (r === null) {
      ultimo = null;
      mensagem("Preencha os campos para ver o resultado.");
      return;
    }
    if (r.erro) {
      ultimo = null;
      mensagem(r.erro, true);
      return;
    }
    if (![r.capital, r.montante, r.taxaMensal, r.meses].every(Number.isFinite)) {
      ultimo = null;
      mensagem(ERROS.grande, true);
      return;
    }
    ultimo = r;
    mostrar(r);
  }

  /** Ao trocar o que calcular, preenche o campo que volta a aparecer com o último resultado. */
  function trocarAlvo(novo) {
    if (novo === alvo) return;
    const anterior = alvo;
    alvo = novo;
    for (const botao of botoesAlvo) {
      const ativo = botao.dataset.alvo === novo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    for (const campo of form.querySelectorAll("[data-campo]")) {
      campo.hidden = campo.dataset.campo === novo;
    }
    if (ultimo && campos[anterior].value.trim() === "") {
      const valor = {
        capital: Numeros.numero(ultimo.capital, 2, 2),
        montante: Numeros.numero(ultimo.montante, 2, 2),
        taxa: Numeros.numero(
          (periodoTaxa.value === "ano" ? anual(ultimo.taxaMensal) : ultimo.taxaMensal) * 100,
          4,
        ),
        prazo: Numeros.numero(unidadePrazo.value === "anos" ? ultimo.meses / 12 : ultimo.meses, 2),
      }[anterior];
      campos[anterior].value = valor;
    }
    campos[novo].value = "";
    calcular();
  }

  for (const botao of botoesAlvo) {
    botao.addEventListener("click", () => trocarAlvo(botao.dataset.alvo));
  }
  form.addEventListener("input", calcular);
  form.addEventListener("change", calcular);
  form.addEventListener("submit", (evento) => evento.preventDefault());
  calcular();
})();
