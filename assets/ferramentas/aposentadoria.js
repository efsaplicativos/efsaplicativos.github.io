"use strict";
/*
 * Interface da calculadora de aposentadoria. A lógica fica em aposentadoria-logica.js (porte de
 * core/aposentadoria/RetirementCalculator.kt da Calculadora Multifunção); a tela segue
 * ui/tools/aposentadoria/AposentadoriaScreen.kt, com a projeção em tabela no lugar do gráfico.
 */
(() => {
  const form = document.querySelector("#aposentadoria");
  if (!form) return;

  const A = LogicaAposentadoria;
  const campos = {
    idadeAtual: form.querySelector("#idade-atual"),
    idadeAposentadoria: form.querySelector("#idade-aposentadoria"),
    expectativa: form.querySelector("#expectativa"),
    renda: form.querySelector("#renda"),
    patrimonio: form.querySelector("#patrimonio"),
    aporte: form.querySelector("#aporte"),
    outras: form.querySelector("#outras"),
    inflacao: form.querySelector("#inflacao"),
    antes: form.querySelector("#retorno-antes"),
    durante: form.querySelector("#retorno-durante"),
  };
  const IDADES = new Set(["idadeAtual", "idadeAposentadoria", "expectativa"]);
  const DINHEIRO = new Set(["renda", "patrimonio", "aporte", "outras"]);
  const dicaReal = form.querySelector("#real-dica");
  const dicaEstrategia = form.querySelector("#estrategia-dica");
  const botoesEstrategia = form.querySelectorAll("[data-estrategia]");
  const resultado = document.querySelector("#resultado");
  const projecao = document.querySelector("#projecao");
  const corpoProjecao = projecao.querySelector("tbody");

  const ERROS_IDADE = {
    faixa: "Informe idades entre 0 e 120 anos.",
    aposentadoria: "A idade de aposentadoria deve ser maior que a idade atual.",
    expectativa: "A expectativa de vida deve ser maior que a idade de aposentadoria.",
  };
  const DESCRICOES = {
    perpetuidade: "Você vive apenas dos rendimentos reais e o patrimônio é preservado.",
    consumir: "O patrimônio é usado aos poucos e se esgota na expectativa de vida.",
  };

  let estrategia = "perpetuidade";

  /** Número do campo; idades precisam ser inteiras. Null se vazio ou inválido. */
  function ler(nome) {
    const campo = campos[nome];
    let valor = Numeros.ler(campo.value, { milhar: DINHEIRO.has(nome) });
    if (IDADES.has(nome) && valor !== null && !Number.isInteger(valor)) valor = null;
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

  function elemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    el.textContent = texto;
    return el;
  }

  function lista(...linhas) {
    const dl = document.createElement("dl");
    dl.className = "result-list";
    dl.append(...linhas);
    return dl;
  }

  function mensagem(texto, erro = false) {
    resultado.replaceChildren(elemento("p", erro ? "result-message error" : "result-message", texto));
    projecao.hidden = true;
  }

  const anos = (n) => `${n} ${n === 1 ? "ano" : "anos"}`;

  function mostrar(r, idadeAposentadoria) {
    const suficiente = r.sobra >= -0.005;
    const partes = [
      elemento(
        "span",
        `level ${suficiente ? "level-ok" : "level-attention"}`,
        suficiente ? "O plano atual é suficiente" : "O plano atual não é suficiente",
      ),
      elemento("div", "result-label", "Aporte mensal necessário (valores de hoje)"),
      elemento("div", "result-value", Numeros.dinheiro(r.aporteNecessario)),
      elemento(
        "p",
        "result-message",
        `Faltam ${anos(r.anosAteAposentar)} para a aposentadoria e ela deve durar ${anos(r.anosAposentado)}.`,
      ),
    ];
    if (r.perpetuidadeImpossivel) {
      partes.push(
        elemento(
          "p",
          "result-message error",
          "Com rentabilidade real zero ou negativa não é possível viver só de renda; o cálculo considera o consumo do patrimônio até a expectativa de vida.",
        ),
      );
    }
    partes.push(
      elemento("div", "result-label", "Em valores de hoje"),
      lista(
        linha("Renda que o patrimônio precisa gerar", Numeros.dinheiro(r.rendaNecessaria)),
        linha("Patrimônio necessário", Numeros.dinheiro(r.capitalNecessario)),
        linha("Patrimônio projetado com o plano atual", Numeros.dinheiro(r.capitalProjetado)),
        linha(suficiente ? "Sobra em relação ao necessário" : "Falta para o necessário", Numeros.dinheiro(Math.abs(r.sobra))),
        linha("Renda mensal possível com o plano atual", Numeros.dinheiro(r.rendaSustentavel)),
        linha(
          "Com o plano atual, o dinheiro dura",
          r.idadeQueAcaba === null ? "não se esgota" : `até os ${Numeros.numero(r.idadeQueAcaba, 1)} anos`,
        ),
      ),
      elemento("div", "result-label", `Em valores nominais daqui a ${anos(r.anosAteAposentar)} (com inflação)`),
      lista(
        linha("Renda que o patrimônio precisa gerar", Numeros.dinheiro(r.rendaNominal)),
        linha("Patrimônio necessário", Numeros.dinheiro(r.capitalNecessarioNominal)),
        linha("Patrimônio projetado com o plano atual", Numeros.dinheiro(r.capitalProjetadoNominal)),
      ),
    );
    resultado.replaceChildren(...partes);

    corpoProjecao.replaceChildren(
      ...r.projecao.map((p) => {
        const tr = document.createElement("tr");
        if (p.idade === idadeAposentadoria) tr.className = "current";
        for (const texto of [anos(p.idade), Numeros.dinheiro(p.atual), Numeros.dinheiro(p.necessario)]) {
          tr.append(elemento("td", "", texto));
        }
        return tr;
      }),
    );
    projecao.hidden = false;
  }

  function calcular() {
    const v = Object.fromEntries(Object.keys(campos).map((nome) => [nome, ler(nome)]));

    if (v.inflacao !== null && v.antes !== null && v.durante !== null && v.inflacao > -100) {
      const antes = A.taxaReal(v.antes / 100, v.inflacao / 100);
      const durante = A.taxaReal(v.durante / 100, v.inflacao / 100);
      dicaReal.textContent =
        `Rentabilidade real (acima da inflação): ${Numeros.porcentagem(antes, 2)} ao ano antes e ` +
        `${Numeros.porcentagem(durante, 2)} ao ano durante a aposentadoria.`;
    } else {
      dicaReal.textContent = "Informe as taxas ao ano. O cálculo desconta a inflação da rentabilidade.";
    }

    const erroIdade = A.erroIdades(v.idadeAtual, v.idadeAposentadoria, v.expectativa);
    if (erroIdade) {
      mensagem(ERROS_IDADE[erroIdade], true);
      return;
    }
    const invalido = Object.values(campos).some((c) => c.getAttribute("aria-invalid") === "true");
    const completo =
      v.idadeAtual !== null &&
      v.idadeAposentadoria !== null &&
      v.expectativa !== null &&
      v.renda !== null &&
      v.renda > 0 &&
      v.inflacao !== null &&
      v.inflacao > -100 &&
      v.antes !== null &&
      v.antes > -100 &&
      v.durante !== null &&
      v.durante > -100;
    if (invalido || !completo) {
      mensagem("Preencha as idades, a renda desejada e as taxas para ver o resultado.");
      return;
    }
    if ([v.patrimonio, v.aporte, v.outras].some((x) => x !== null && x < 0)) {
      mensagem("Os valores não podem ser negativos.", true);
      return;
    }
    let r;
    try {
      r = A.calcular({
        idadeAtual: v.idadeAtual,
        idadeAposentadoria: v.idadeAposentadoria,
        expectativaVida: v.expectativa,
        patrimonioAtual: v.patrimonio ?? 0,
        aporteMensal: v.aporte ?? 0,
        rendaDesejada: v.renda,
        outrasRendas: v.outras ?? 0,
        inflacaoAnual: v.inflacao / 100,
        retornoAntes: v.antes / 100,
        retornoDurante: v.durante / 100,
        estrategia,
      });
    } catch {
      mensagem("Não foi possível calcular com esses valores. Confira os campos.", true);
      return;
    }
    if (![r.capitalNecessario, r.capitalProjetado, r.aporteNecessario].every(Number.isFinite)) {
      mensagem("O resultado é grande demais para ser calculado. Confira os valores.", true);
      return;
    }
    mostrar(r, v.idadeAposentadoria);
  }

  for (const botao of botoesEstrategia) {
    botao.addEventListener("click", () => {
      estrategia = botao.dataset.estrategia;
      for (const b of botoesEstrategia) {
        const ativo = b === botao;
        b.classList.toggle("active", ativo);
        b.setAttribute("aria-pressed", String(ativo));
      }
      dicaEstrategia.textContent = DESCRICOES[estrategia];
      calcular();
    });
  }
  form.addEventListener("input", calcular);
  form.addEventListener("submit", (evento) => evento.preventDefault());
  calcular();
})();
