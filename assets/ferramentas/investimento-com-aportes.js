"use strict";
/*
 * Interface da simulação de investimento com aportes mensais. A lógica fica em
 * investimento-com-aportes-logica.js (porte de core/aportes/Contributions.kt da Calculadora
 * Multifunção); a tela segue ui/tools/aportes/AportesScreen.kt.
 */
(() => {
  const form = document.querySelector("#aportes");
  if (!form) return;

  const A = LogicaAportes;
  const campos = {
    meta: form.querySelector("#meta"),
    inicial: form.querySelector("#inicial"),
    aporte: form.querySelector("#aporte"),
    taxa: form.querySelector("#taxa"),
    prazo: form.querySelector("#prazo"),
    reajuste: form.querySelector("#reajuste"),
    inflacao: form.querySelector("#inflacao"),
  };
  const DINHEIRO = new Set(["meta", "inicial", "aporte"]);
  const periodoTaxa = form.querySelector("#periodo-taxa");
  const unidadePrazo = form.querySelector("#unidade-prazo");
  const botoesAlvo = form.querySelectorAll("[data-alvo]");
  const botoesMomento = form.querySelectorAll("[data-momento]");
  const resultado = document.querySelector("#resultado");
  const evolucao = document.querySelector("#evolucao");
  const botoesTabela = evolucao.querySelectorAll("[data-tabela]");
  const seletorTabela = evolucao.querySelector("#modo-tabela");
  const tabela = evolucao.querySelector("tbody");
  const colunaPeriodo = evolucao.querySelector("#evolucao-periodo");

  const ERROS = {
    negativo: "Os valores não podem ser negativos.",
    prazo: "O prazo deve ser de pelo menos 1 mês.",
    prazoLongo: "O prazo máximo é de 100 anos.",
    meta: "Informe uma meta maior que zero.",
    nada: "Informe um capital inicial ou um aporte maior que zero.",
    inalcancavel: "Com esses valores a meta não é atingida em 100 anos.",
    taxaNaoEncontrada: "Não há taxa entre −50% e 100% ao mês que atinja a meta.",
    grande: "O resultado é grande demais para ser calculado. Confira os valores.",
  };
  const JA_ATINGIDA = {
    aporte: "O capital inicial sozinho já atinge a meta: não é preciso aportar.",
    inicial: "Os aportes sozinhos já atingem a meta: não é preciso capital inicial.",
    prazo: "O capital inicial já é maior ou igual à meta.",
  };
  /** Campo que guarda o valor de cada alvo (o do valor final é a meta). */
  const CAMPO_DO_ALVO = { final: "meta", aporte: "aporte", prazo: "prazo", taxa: "taxa", inicial: "inicial" };

  let alvo = "final";
  let momento = "fim";
  let modoTabela = null; // null: escolhe pelo prazo (anual acima de 24 meses), como no app
  let ultimo = null;

  /** Número do campo: null se vazio ou inválido (e marca o inválido). */
  function ler(nome) {
    const campo = campos[nome];
    const valor = Numeros.ler(campo.value, { milhar: DINHEIRO.has(nome) });
    campo.setAttribute("aria-invalid", String(campo.value.trim() !== "" && valor === null));
    return valor;
  }
  const preenchido = (nome) => campos[nome].value.trim() !== "";

  function textoMeses(meses) {
    const anos = Math.floor(meses / 12);
    const resto = meses % 12;
    const m = `${resto} ${resto === 1 ? "mês" : "meses"}`;
    if (anos === 0) return m;
    const a = `${anos} ${anos === 1 ? "ano" : "anos"}`;
    return resto === 0 ? a : `${a} e ${m}`;
  }

  const taxaTexto = (mensal) =>
    `${Numeros.porcentagem(mensal)} ao mês · ${Numeros.porcentagem(A.anualDeMensal(mensal))} ao ano`;

  /** Lê os campos e resolve o alvo. Mesma ordem de validação de computeOutcome no app. */
  function resolver() {
    const inicial = alvo === "inicial" ? 0 : ler("inicial");
    const aporte = alvo === "aporte" ? 0 : ler("aporte");
    if (inicial === null && preenchido("inicial")) return { incompleto: true };
    if (aporte === null && preenchido("aporte")) return { incompleto: true };
    if (alvo === "final" && !preenchido("inicial") && !preenchido("aporte")) return { incompleto: true };

    let taxaMensal = 0;
    if (alvo !== "taxa") {
      const r = ler("taxa");
      if (r === null) return { incompleto: true };
      if (r <= -100) return { erro: "negativo" };
      taxaMensal = A.taxaMensal(r, periodoTaxa.value);
    }
    let meses = 0;
    if (alvo !== "prazo") {
      const t = ler("prazo");
      if (t === null) return { incompleto: true };
      meses = Math.round(unidadePrazo.value === "anos" ? t * 12 : t);
    }
    let meta = null;
    if (alvo !== "final") {
      meta = ler("meta");
      if (meta === null) return { incompleto: true };
    }
    const reajuste = ler("reajuste");
    if (reajuste === null && preenchido("reajuste")) return { incompleto: true };

    return A.resolver(
      alvo,
      {
        inicial: inicial ?? 0,
        aporte: aporte ?? 0,
        taxaMensal,
        meses,
        momento,
        reajusteAnual: (reajuste ?? 0) / 100,
      },
      meta,
    );
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

  function elemento(tag, classe, texto) {
    const el = document.createElement(tag);
    el.className = classe;
    el.textContent = texto;
    return el;
  }

  function mensagem(texto, erro = false) {
    resultado.replaceChildren(elemento("p", erro ? "result-message error" : "result-message", texto));
    evolucao.hidden = true;
  }

  function mostrar(saida) {
    const sim = saida.simulacao;
    const p = sim.plano;
    const principal = {
      final: ["Valor final", Numeros.dinheiro(sim.valorFinal)],
      aporte: ["Aporte mensal necessário", Numeros.dinheiro(saida.resolvido)],
      inicial: ["Capital inicial necessário", Numeros.dinheiro(saida.resolvido)],
      prazo: ["Prazo necessário", textoMeses(p.meses)],
      taxa: ["Taxa necessária", `${Numeros.porcentagem(saida.resolvido)} ao mês`],
    }[alvo];

    const partes = [elemento("div", "result-label", principal[0]), elemento("div", "result-value", principal[1])];
    if (saida.jaAtingida) partes.push(elemento("p", "result-message", JA_ATINGIDA[alvo]));

    const lista = document.createElement("dl");
    lista.className = "result-list";
    lista.append(
      linha("Valor final", Numeros.dinheiro(sim.valorFinal)),
      linha("Total investido", Numeros.dinheiro(sim.totalInvestido)),
      linha("Total em juros", Numeros.dinheiro(sim.totalJuros)),
      linha("Juros no valor final", Numeros.porcentagem(sim.participacaoJuros / 100, 2)),
    );
    const inflacao = ler("inflacao");
    if (inflacao !== null && inflacao > -100 && p.meses > 0) {
      lista.append(linha("Valor final em dinheiro de hoje", Numeros.dinheiro(A.valorReal(sim, inflacao / 100))));
    }
    if (p.reajusteAnual !== 0 && p.meses > 12) {
      lista.append(linha("Último aporte (com reajuste)", Numeros.dinheiro(A.aporteNoMes(p, p.meses))));
    }
    lista.append(linha("Taxa", taxaTexto(p.taxaMensal)));
    lista.append(linha("Prazo", alvo === "prazo" ? `${p.meses} ${p.meses === 1 ? "mês" : "meses"}` : textoMeses(p.meses)));
    partes.push(lista);
    resultado.replaceChildren(...partes);
    mostrarTabela(sim);
  }

  function mostrarTabela(sim) {
    if (sim.plano.meses <= 0) {
      evolucao.hidden = true;
      return;
    }
    const anos = A.anual(sim);
    const podeAnual = anos.length > 1;
    const modo = podeAnual ? (modoTabela ?? (sim.plano.meses > 24 ? "anual" : "mensal")) : "mensal";
    seletorTabela.hidden = !podeAnual;
    for (const botao of botoesTabela) {
      const ativo = botao.dataset.tabela === modo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    colunaPeriodo.textContent = modo === "anual" ? "Ano" : "Mês";
    const linhas =
      modo === "anual"
        ? anos.map((l) => [l.ano, l.aportes, l.juros, l.investido, l.saldo])
        : sim.linhas.map((l) => [l.mes, l.aporte, l.juros, l.investido, l.saldo]);
    tabela.replaceChildren(
      ...linhas.map(([periodo, ...valores]) => {
        const tr = document.createElement("tr");
        for (const texto of [String(periodo), ...valores.map(Numeros.dinheiro)]) {
          const td = document.createElement("td");
          td.textContent = texto;
          tr.append(td);
        }
        return tr;
      }),
    );
    evolucao.hidden = false;
  }

  function calcular() {
    const saida = resolver();
    ultimo = null;
    if (saida.incompleto) {
      mensagem("Preencha os campos para ver o resultado.");
      return;
    }
    if (saida.erro) {
      mensagem(ERROS[saida.erro], true);
      return;
    }
    const sim = saida.simulacao;
    if (![sim.valorFinal, sim.totalInvestido, saida.resolvido].every(Number.isFinite)) {
      mensagem(ERROS.grande, true);
      return;
    }
    ultimo = saida;
    mostrar(saida);
  }

  function marcar(botoes, atributo, valor) {
    for (const botao of botoes) {
      const ativo = botao.dataset[atributo] === valor;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
  }

  function atualizarCampos() {
    for (const campo of form.querySelectorAll("[data-campo]")) {
      campo.hidden = campo.dataset.campo === CAMPO_DO_ALVO[alvo];
    }
  }

  /** Valor do último resultado para o campo de um alvo, no formato digitado. */
  function valorDoAlvo(alvoAnterior, saida) {
    const sim = saida.simulacao;
    switch (alvoAnterior) {
      case "final":
        return Numeros.numero(sim.valorFinal, 2, 2);
      case "aporte":
        return Numeros.numero(saida.resolvido, 2, 2);
      case "inicial":
        return Numeros.numero(saida.resolvido, 2, 2);
      case "prazo":
        return unidadePrazo.value === "anos" ? Numeros.numero(sim.plano.meses / 12, 4) : String(sim.plano.meses);
      default: {
        const mensal = saida.resolvido;
        return Numeros.numero((periodoTaxa.value === "ano" ? A.anualDeMensal(mensal) : mensal) * 100, 4);
      }
    }
  }

  /** Ao trocar o alvo, o campo que volta a aparecer recebe o último resultado, se estiver vazio. */
  function trocarAlvo(novo) {
    if (novo === alvo) return;
    const anterior = alvo;
    alvo = novo;
    marcar(botoesAlvo, "alvo", novo);
    const campoAnterior = campos[CAMPO_DO_ALVO[anterior]];
    if (ultimo && campoAnterior.value.trim() === "") campoAnterior.value = valorDoAlvo(anterior, ultimo);
    campos[CAMPO_DO_ALVO[novo]].value = "";
    atualizarCampos();
    calcular();
  }

  for (const botao of botoesAlvo) botao.addEventListener("click", () => trocarAlvo(botao.dataset.alvo));
  for (const botao of botoesMomento) {
    botao.addEventListener("click", () => {
      momento = botao.dataset.momento;
      marcar(botoesMomento, "momento", momento);
      calcular();
    });
  }
  for (const botao of botoesTabela) {
    botao.addEventListener("click", () => {
      modoTabela = botao.dataset.tabela;
      if (ultimo) mostrarTabela(ultimo.simulacao);
    });
  }
  form.addEventListener("input", calcular);
  form.addEventListener("change", calcular);
  form.addEventListener("submit", (evento) => evento.preventDefault());
  atualizarCampos();
  calcular();
})();
