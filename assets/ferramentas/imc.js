"use strict";
/*
 * Calculadora de IMC com a classificação da OMS para adultos.
 * Mesma lógica de core/imc/BmiCalculator.kt da Calculadora Multifunção: faixas contínuas e
 * classificação pelo IMC arredondado a uma casa, o mesmo valor exibido.
 */
(() => {
  const form = document.querySelector("#imc");
  if (!form) return;

  const peso = form.querySelector("#peso");
  const altura = form.querySelector("#altura");
  const resultado = document.querySelector("#resultado");
  const linhasTabela = document.querySelectorAll("#tabela-imc [data-classe]");

  const FAIXA_MIN = 18.5;
  const FAIXA_MAX = 24.9;
  const IMC_REFERENCIA = 22;
  const CLASSES = [
    { nome: "Magreza grave", ate: 16, nivel: "alert" },
    { nome: "Magreza moderada", ate: 17, nivel: "attention" },
    { nome: "Magreza leve", ate: 18.5, nivel: "attention" },
    { nome: "Peso normal", ate: 25, nivel: "ok" },
    { nome: "Sobrepeso (pré-obesidade)", ate: 30, nivel: "attention" },
    { nome: "Obesidade grau I", ate: 35, nivel: "alert" },
    { nome: "Obesidade grau II", ate: 40, nivel: "alert" },
    { nome: "Obesidade grau III", ate: Infinity, nivel: "alert" },
  ];

  const classificar = (imc) => {
    const arredondado = Math.round(imc * 10) / 10;
    return CLASSES.findIndex((classe) => arredondado < classe.ate);
  };

  /** Até 3 é metro (1,75); acima disso, centímetro (175). */
  const emMetros = (valor) => (valor <= 3 ? valor : valor / 100);

  function mensagem(texto, erro = false) {
    const p = document.createElement("p");
    p.className = erro ? "result-message error" : "result-message";
    p.textContent = texto;
    resultado.replaceChildren(p);
    marcar(-1);
  }

  function marcar(indice) {
    for (const linha of linhasTabela) {
      linha.classList.toggle("current", Number(linha.dataset.classe) === indice);
    }
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

  const kg = (valor) => `${Numeros.numero(valor, 1, 1)} kg`;

  function calcular() {
    const p = Numeros.ler(peso.value);
    const a = Numeros.ler(altura.value);
    peso.setAttribute("aria-invalid", String(peso.value.trim() !== "" && p === null));
    altura.setAttribute("aria-invalid", String(altura.value.trim() !== "" && a === null));
    if (p === null || a === null) {
      mensagem("Preencha o peso e a altura para ver o resultado.");
      return;
    }
    const metros = emMetros(a);
    if (!(metros >= 0.5 && metros <= 2.75)) {
      mensagem("Confira a altura: use metros (1,75) ou centímetros (175).", true);
      return;
    }
    if (!(p >= 2 && p <= 650)) {
      mensagem("Confira o peso, em quilos.", true);
      return;
    }

    const quadrado = metros * metros;
    const imc = p / quadrado;
    const indice = classificar(imc);
    const classe = CLASSES[indice];
    const minimo = FAIXA_MIN * quadrado;
    const maximo = FAIXA_MAX * quadrado;

    const rotulo = document.createElement("div");
    rotulo.className = "result-label";
    rotulo.textContent = "Seu IMC";
    const valor = document.createElement("div");
    valor.className = "result-value";
    valor.textContent = Numeros.numero(imc, 1, 1);
    const nivel = document.createElement("span");
    nivel.className = `level level-${classe.nivel}`;
    nivel.textContent = classe.nome;

    const lista = document.createElement("dl");
    lista.className = "result-list";
    lista.append(linha("Peso saudável para a sua altura", `${kg(minimo)} a ${kg(maximo)}`));
    // Pela classificação (IMC arredondado), para "Peso normal" e "perder 0,0 kg" não aparecerem juntos
    if (classe.nivel === "ok") lista.append(linha("Faixa saudável", "você está dentro dela"));
    else if (p < minimo) lista.append(linha("Para chegar à faixa saudável", `ganhar ${kg(minimo - p)}`));
    else lista.append(linha("Para chegar à faixa saudável", `perder ${kg(p - maximo)}`));
    lista.append(
      linha("Peso de referência (IMC 22)", kg(IMC_REFERENCIA * quadrado)),
      linha("Altura considerada", `${Numeros.numero(metros, 2, 2)} m`),
    );

    resultado.replaceChildren(rotulo, valor, nivel, lista);
    marcar(indice);
  }

  form.addEventListener("input", calcular);
  form.addEventListener("submit", (evento) => evento.preventDefault());
  calcular();
})();
