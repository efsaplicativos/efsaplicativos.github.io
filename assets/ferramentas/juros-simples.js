"use strict";
/*
 * Interface da calculadora de juros simples. A lógica fica em juros-simples-logica.js, porte de
 * core/jurossimples/SimpleInterest.kt da Calculadora Multifunção; a tela segue
 * ui/tools/jurossimples/JurosSimplesScreen.kt (alvos, passo a passo e evolução do montante).
 */
(() => {
  const form = document.querySelector("#juros-simples");
  if (!form) return;

  const J = LogicaJurosSimples;
  const campos = {
    capital: form.querySelector("#capital"),
    valorConhecido: form.querySelector("#valor-conhecido"),
    taxa: form.querySelector("#taxa"),
    prazo: form.querySelector("#prazo"),
  };
  const unidadeTaxa = form.querySelector("#unidade-taxa");
  const unidadeTaxaSaida = form.querySelector("#unidade-taxa-saida");
  const unidadePrazo = form.querySelector("#unidade-prazo");
  const unidadePrazoSaida = form.querySelector("#unidade-prazo-saida");
  const rotuloConhecido = form.querySelector("#rotulo-conhecido");
  const botoesAlvo = form.querySelectorAll("[data-alvo]");
  const botoesConhecido = form.querySelectorAll("[data-conhecido]");
  const resultado = document.querySelector("#resultado");
  const passos = document.querySelector("#passos");
  const listaPassos = passos.querySelector("#passos-lista");
  const evolucao = document.querySelector("#evolucao");
  const tabela = evolucao.querySelector("tbody");
  const colunaPeriodo = evolucao.querySelector("#evolucao-periodo");

  const ERROS = {
    capital: "O capital deve ser maior que zero.",
    taxa: "A taxa deve ser maior que zero.",
    prazo: "O prazo deve ser maior que zero.",
    negativo: "Os valores não podem ser negativos.",
    montanteMenor: "O montante não pode ser menor que o capital.",
    grande: "O resultado é grande demais para ser calculado. Confira os valores.",
  };
  const POR_UNIDADE = { dia: "ao dia", mes: "ao mês", ano: "ao ano" };
  const NOME_UNIDADE = { dia: ["dia", "dias"], mes: ["mês", "meses"], ano: ["ano", "anos"] };
  const COLUNA_UNIDADE = { dia: "Dia", mes: "Mês", ano: "Ano" };

  let alvo = "juros";
  let conhecido = "montante";
  let ultimo = null;

  const unidade = (valor, u) => NOME_UNIDADE[u][valor === 1 ? 0 : 1];
  const prazoTexto = (valor, u, casas = 4) => `${Numeros.numero(valor, casas)} ${unidade(valor, u)}`;
  const reais = (v) => Numeros.numero(v, 2, 2);

  function ler(nome) {
    const campo = campos[nome];
    const dinheiro = nome === "capital" || nome === "valorConhecido";
    const valor = Numeros.ler(campo.value, { milhar: dinheiro });
    campo.setAttribute("aria-invalid", String(campo.value.trim() !== "" && valor === null));
    return valor;
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
    passos.hidden = true;
    evolucao.hidden = true;
  }

  function mostrar(r) {
    const principal = {
      juros: ["Juros", Numeros.dinheiro(r.juros)],
      capital: ["Capital necessário", Numeros.dinheiro(r.capital)],
      taxa: ["Taxa de juros", `${Numeros.porcentagem(r.taxa)} ${POR_UNIDADE[r.unidadeTaxa]}`],
      prazo: ["Prazo", prazoTexto(r.prazo, r.unidadePrazo, 2)],
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
      linha("Capital (C)", Numeros.dinheiro(r.capital)),
      linha("Juros (J)", Numeros.dinheiro(r.juros)),
      linha("Montante (M)", Numeros.dinheiro(r.montante)),
    );
    for (const u of J.UNIDADES) {
      lista.append(linha(`Taxa ${POR_UNIDADE[u]} (proporcional)`, Numeros.porcentagem(J.taxaEm(r, u), 6)));
    }
    lista.append(linha("Prazo equivalente", J.UNIDADES.map((u) => prazoTexto(J.prazoEm(r, u), u)).join(" · ")));

    resultado.replaceChildren(rotulo, valor, lista);
    mostrarPassos(r);
    mostrarEvolucao(r);
  }

  /** Passo a passo com os números substituídos nas fórmulas, como no app. */
  function mostrarPassos(r) {
    const taxaPrazo = `${Numeros.porcentagem(J.taxaPorUnidadeDoPrazo(r), 6)}`;
    const t = Numeros.numero(r.prazo, 4);
    const conversao =
      `Taxa na mesma unidade do prazo: ${Numeros.porcentagem(r.taxa, 6)} ${POR_UNIDADE[r.unidadeTaxa]} = ` +
      `${taxaPrazo} ${POR_UNIDADE[r.unidadePrazo]}`;
    const diferentes = r.unidadeTaxa !== r.unidadePrazo;
    const lista = [];
    switch (alvo) {
      case "juros":
        if (diferentes) lista.push(conversao);
        lista.push(`J = C · i · t = ${reais(r.capital)} · ${taxaPrazo} · ${t} = ${reais(r.juros)}`);
        lista.push(`M = C + J = ${reais(r.capital)} + ${reais(r.juros)} = ${reais(r.montante)}`);
        break;
      case "capital":
        if (diferentes) lista.push(conversao);
        if (conhecido === "montante") {
          lista.push(`C = M ÷ (1 + i · t) = ${reais(r.montante)} ÷ (1 + ${taxaPrazo} · ${t}) = ${reais(r.capital)}`);
          lista.push(`J = M − C = ${reais(r.montante)} − ${reais(r.capital)} = ${reais(r.juros)}`);
        } else {
          lista.push(`C = J ÷ (i · t) = ${reais(r.juros)} ÷ (${taxaPrazo} · ${t}) = ${reais(r.capital)}`);
          lista.push(`M = C + J = ${reais(r.capital)} + ${reais(r.juros)} = ${reais(r.montante)}`);
        }
        break;
      case "taxa":
        if (conhecido === "montante") {
          lista.push(`J = M − C = ${reais(r.montante)} − ${reais(r.capital)} = ${reais(r.juros)}`);
        }
        lista.push(
          `i = J ÷ (C · t) = ${reais(r.juros)} ÷ (${reais(r.capital)} · ${t}) = ${taxaPrazo} ${POR_UNIDADE[r.unidadePrazo]}`,
        );
        if (diferentes) {
          lista.push(
            `${taxaPrazo} ${POR_UNIDADE[r.unidadePrazo]} = ${Numeros.porcentagem(r.taxa, 6)} ${POR_UNIDADE[r.unidadeTaxa]}`,
          );
        }
        break;
      default:
        if (diferentes) lista.push(conversao);
        if (conhecido === "montante") {
          lista.push(`J = M − C = ${reais(r.montante)} − ${reais(r.capital)} = ${reais(r.juros)}`);
        }
        lista.push(
          `t = J ÷ (C · i) = ${reais(r.juros)} ÷ (${reais(r.capital)} · ${taxaPrazo}) = ${t} ${unidade(r.prazo, r.unidadePrazo)}`,
        );
    }
    listaPassos.replaceChildren(
      ...lista.map((texto) => {
        const p = document.createElement("p");
        p.className = "formula";
        p.textContent = texto;
        return p;
      }),
    );
    passos.hidden = false;
  }

  function mostrarEvolucao(r) {
    const linhas = J.evolucao(r);
    if (linhas.length < 2) {
      evolucao.hidden = true;
      return;
    }
    colunaPeriodo.textContent = COLUNA_UNIDADE[r.unidadePrazo];
    tabela.replaceChildren(
      ...linhas.map((l) => {
        const tr = document.createElement("tr");
        for (const texto of [Numeros.numero(l.periodo, 2), Numeros.dinheiro(l.juros), Numeros.dinheiro(l.montante)]) {
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
    const saida = J.resolver({
      alvo,
      capital: alvo === "capital" ? null : ler("capital"),
      taxaPercentual: alvo === "taxa" ? null : ler("taxa"),
      unidadeTaxa: unidadeTaxa.value,
      prazo: alvo === "prazo" ? null : ler("prazo"),
      unidadePrazo: unidadePrazo.value,
      conhecido,
      valorConhecido: alvo === "juros" ? null : ler("valorConhecido"),
    });
    ultimo = null;
    if (saida.incompleto) {
      mensagem("Preencha os campos para ver o resultado.");
      return;
    }
    if (saida.erro) {
      mensagem(ERROS[saida.erro], true);
      return;
    }
    const r = saida.resultado;
    if (![r.capital, r.juros, r.montante, r.taxa, r.prazo].every(Number.isFinite)) {
      mensagem(ERROS.grande, true);
      return;
    }
    ultimo = r;
    mostrar(r);
  }

  function marcar(botoes, atributo, valor) {
    for (const botao of botoes) {
      const ativo = botao.dataset[atributo] === valor;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
  }

  /** Mostra só os campos que o alvo usa. */
  function atualizarCampos() {
    const visivel = {
      conhecido: alvo !== "juros",
      capital: alvo !== "capital",
      "valor-conhecido": alvo !== "juros",
      taxa: alvo !== "taxa",
      "saida-taxa": alvo === "taxa",
      prazo: alvo !== "prazo",
      "saida-prazo": alvo === "prazo",
    };
    for (const campo of form.querySelectorAll("[data-campo]")) {
      campo.hidden = !visivel[campo.dataset.campo];
    }
    rotuloConhecido.textContent = conhecido === "montante" ? "Montante (R$)" : "Juros (R$)";
  }

  /** Ao trocar o alvo, o campo que volta a aparecer recebe o último resultado, se estiver vazio. */
  function trocarAlvo(novo) {
    if (novo === alvo) return;
    const anterior = alvo;
    alvo = novo;
    marcar(botoesAlvo, "alvo", novo);
    if (ultimo) {
      const preencher = (campo, valor) => {
        if (campo.value.trim() === "") campo.value = valor;
      };
      if (anterior === "capital") preencher(campos.capital, Numeros.numero(ultimo.capital, 2, 2));
      if (anterior === "taxa") preencher(campos.taxa, Numeros.numero(ultimo.taxa * 100, 6));
      if (anterior === "prazo") preencher(campos.prazo, Numeros.numero(ultimo.prazo, 4));
      if (anterior === "juros") {
        preencher(campos.valorConhecido, Numeros.numero(conhecido === "montante" ? ultimo.montante : ultimo.juros, 2, 2));
      }
    }
    if (novo === "capital") campos.capital.value = "";
    if (novo === "taxa") campos.taxa.value = "";
    if (novo === "prazo") campos.prazo.value = "";
    atualizarCampos();
    calcular();
  }

  function trocarConhecido(novo) {
    if (novo === conhecido) return;
    // Converte o valor digitado para continuar coerente com o último resultado
    if (ultimo && campos.valorConhecido.value.trim() !== "") {
      campos.valorConhecido.value = Numeros.numero(novo === "montante" ? ultimo.montante : ultimo.juros, 2, 2);
    }
    conhecido = novo;
    marcar(botoesConhecido, "conhecido", novo);
    atualizarCampos();
    calcular();
  }

  /** Os seletores "Mostrar a taxa/o prazo em" são a mesma escolha de unidade, vista de outro lugar. */
  function sincronizar(origem, destino) {
    origem.addEventListener("change", () => {
      destino.value = origem.value;
    });
  }
  sincronizar(unidadeTaxa, unidadeTaxaSaida);
  sincronizar(unidadeTaxaSaida, unidadeTaxa);
  sincronizar(unidadePrazo, unidadePrazoSaida);
  sincronizar(unidadePrazoSaida, unidadePrazo);

  for (const botao of botoesAlvo) botao.addEventListener("click", () => trocarAlvo(botao.dataset.alvo));
  for (const botao of botoesConhecido) botao.addEventListener("click", () => trocarConhecido(botao.dataset.conhecido));
  form.addEventListener("input", calcular);
  form.addEventListener("change", calcular);
  form.addEventListener("submit", (evento) => evento.preventDefault());
  atualizarCampos();
  calcular();
})();
