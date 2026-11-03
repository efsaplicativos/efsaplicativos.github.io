"use strict";
/*
 * Interface da calculadora de combustível (a lógica está em calculadora-de-combustivel-logica.js).
 * As três abas de ui/tools/combustivel/CombustivelScreen.kt da Calculadora Multifunção:
 * álcool ou gasolina, consumo médio (por distância ou odômetro) e custo da viagem.
 */
(() => {
  const raiz = document.querySelector(".combustivel");
  if (!raiz) return;

  const C = LogicaCombustivel;
  const CHAVE_ABA = "efs-calculadora-de-combustivel-aba";
  const dinheiro3 = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  const reais3 = (v) => dinheiro3.format(v);

  // --- Auxiliares ---------------------------------------------------------------------------

  /** Lê um campo, marcando aria-invalid quando o texto não é número. milhar: "35.200" = 35200. */
  function ler(campo, opcoes) {
    const valor = Numeros.ler(campo.value, opcoes);
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

  function mensagem(alvo, texto, erro = false) {
    const p = document.createElement("p");
    p.className = erro ? "result-message error" : "result-message";
    p.textContent = texto;
    alvo.replaceChildren(p);
  }

  function principal(alvo, rotulo, valor, extras) {
    const r = document.createElement("div");
    r.className = "result-label";
    r.textContent = rotulo;
    const v = document.createElement("div");
    v.className = "result-value";
    v.textContent = valor;
    alvo.replaceChildren(r, v, ...extras);
  }

  function lista(...linhas) {
    const dl = document.createElement("dl");
    dl.className = "result-list";
    dl.append(...linhas);
    return dl;
  }

  function alternar(botoes, atributo, valor) {
    for (const botao of botoes) {
      const ativo = botao.dataset[atributo] === valor;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
  }

  // --- Abas ---------------------------------------------------------------------------------

  const botoesAba = raiz.querySelectorAll("[data-aba]");
  const paineis = raiz.querySelectorAll("[data-painel]");

  function mostrarAba(aba, guardar = true) {
    if (![...paineis].some((p) => p.dataset.painel === aba)) return;
    alternar(botoesAba, "aba", aba);
    for (const painel of paineis) painel.hidden = painel.dataset.painel !== aba;
    if (!guardar) return;
    try {
      localStorage.setItem(CHAVE_ABA, aba);
    } catch (erro) {
      // sem armazenamento, só não lembra a aba
    }
  }

  for (const botao of botoesAba) botao.addEventListener("click", () => mostrarAba(botao.dataset.aba));
  try {
    mostrarAba(localStorage.getItem(CHAVE_ABA) || "comparar", false);
  } catch (erro) {
    mostrarAba("comparar", false);
  }

  // --- Álcool ou gasolina -------------------------------------------------------------------

  const formComparar = raiz.querySelector("#form-comparar");
  const resultadoComparar = raiz.querySelector("#resultado-comparar");
  const precoEtanol = formComparar.querySelector("#preco-etanol");
  const precoGasolina = formComparar.querySelector("#preco-gasolina");
  const kmEtanol = formComparar.querySelector("#km-etanol");
  const kmGasolina = formComparar.querySelector("#km-gasolina");
  const tanque = formComparar.querySelector("#tanque");

  const RECOMENDACOES = {
    etanol: { texto: "Abasteça com etanol", nivel: "ok", resumo: "O etanol sai mais barato" },
    gasolina: { texto: "Abasteça com gasolina", nivel: "attention", resumo: "A gasolina sai mais barata" },
    "tanto-faz": { texto: "Tanto faz", nivel: "info", resumo: "Os custos são equivalentes" },
  };

  function comparar() {
    const e = ler(precoEtanol);
    const g = ler(precoGasolina);
    const ke = ler(kmEtanol);
    const kg = ler(kmGasolina);
    const t = ler(tanque);
    if (e === null || g === null) {
      mensagem(resultadoComparar, "Preencha os preços do etanol e da gasolina.");
      return;
    }
    if (e <= 0 || g <= 0) {
      mensagem(resultadoComparar, "Os preços precisam ser maiores que zero.", true);
      return;
    }
    const r = C.comparar(e, g, {
      kmLEtanol: ke !== null && ke > 0 ? ke : null,
      kmLGasolina: kg !== null && kg > 0 ? kg : null,
      tanque: t !== null && t > 0 ? t : C.TANQUE_PADRAO,
    });
    const recomendacao = RECOMENDACOES[r.recomendado];
    const nivel = document.createElement("span");
    nivel.className = `level level-${recomendacao.nivel}`;
    nivel.textContent = recomendacao.resumo;

    const linhas = [
      linha("Relação etanol/gasolina", `${Numeros.numero(r.razaoPercentual, 1)}%`),
      linha("Etanol compensa até", reais3(r.precoMaximoEtanol)),
    ];
    if (r.custoKmEtanol !== null) linhas.push(linha("Custo por km com etanol", reais3(r.custoKmEtanol)));
    if (r.custoKmGasolina !== null) linhas.push(linha("Custo por km com gasolina", reais3(r.custoKmGasolina)));
    if (r.recomendado !== "tanto-faz") {
      if (r.economia100Km !== null) linhas.push(linha("Economia a cada 100 km", Numeros.dinheiro(r.economia100Km)));
      linhas.push(linha("Economia estimada por tanque", Numeros.dinheiro(r.economiaTanque)));
    }
    const metodo =
      r.metodo === "regra-70" ? "Pela regra dos 70%" : "Pelo custo por km, com o consumo informado";
    principal(resultadoComparar, metodo, recomendacao.texto, [nivel, lista(...linhas)]);
  }

  formComparar.addEventListener("input", comparar);
  formComparar.addEventListener("submit", (evento) => evento.preventDefault());
  comparar();

  // --- Consumo médio ------------------------------------------------------------------------

  const formConsumo = raiz.querySelector("#form-consumo");
  const resultadoConsumo = raiz.querySelector("#resultado-consumo");
  const botoesModo = formConsumo.querySelectorAll("[data-modo]");
  const camposModo = formConsumo.querySelectorAll("[data-modo-campo]");
  const distancia = formConsumo.querySelector("#distancia");
  const odoInicial = formConsumo.querySelector("#odometro-inicial");
  const odoFinal = formConsumo.querySelector("#odometro-final");
  const litros = formConsumo.querySelector("#litros");
  const precoConsumo = formConsumo.querySelector("#preco-consumo");
  let modo = "distancia";

  function consumo() {
    let km;
    if (modo === "distancia") {
      km = ler(distancia, { milhar: true });
    } else {
      const inicio = ler(odoInicial, { milhar: true });
      const fim = ler(odoFinal, { milhar: true });
      if (inicio !== null && fim !== null && fim <= inicio) {
        odoFinal.setAttribute("aria-invalid", "true");
        mensagem(resultadoConsumo, "O odômetro final deve ser maior que o inicial.", true);
        return;
      }
      km = inicio !== null && fim !== null ? fim - inicio : null;
    }
    const l = ler(litros);
    const preco = ler(precoConsumo);
    if (km === null || l === null) {
      mensagem(resultadoConsumo, "Preencha a distância e os litros abastecidos.");
      return;
    }
    if (km <= 0 || l <= 0) {
      mensagem(resultadoConsumo, "A distância e os litros precisam ser maiores que zero.", true);
      return;
    }
    const r = C.consumo(km, l, preco !== null && preco > 0 ? preco : null);
    const linhas = [
      linha("Litros a cada 100 km", `${Numeros.numero(r.litrosPor100Km, 2, 2)} L`),
      linha("Milhas por galão (EUA)", `${Numeros.numero(r.mpg, 1, 1)} mpg`),
    ];
    if (modo === "odometro") linhas.push(linha("Distância percorrida", `${Numeros.numero(km, 1)} km`));
    if (r.custoPorKm !== null) linhas.push(linha("Custo por km", reais3(r.custoPorKm)));
    if (r.custoTotal !== null) linhas.push(linha("Valor do abastecimento", Numeros.dinheiro(r.custoTotal)));
    principal(resultadoConsumo, "Consumo médio", `${Numeros.numero(r.kmPorLitro, 2, 2)} km/L`, [lista(...linhas)]);
  }

  for (const botao of botoesModo) {
    botao.addEventListener("click", () => {
      modo = botao.dataset.modo;
      alternar(botoesModo, "modo", modo);
      for (const campo of camposModo) campo.hidden = campo.dataset.modoCampo !== modo;
      consumo();
    });
  }
  formConsumo.addEventListener("input", consumo);
  formConsumo.addEventListener("submit", (evento) => evento.preventDefault());
  consumo();

  // --- Custo da viagem ----------------------------------------------------------------------

  const formViagem = raiz.querySelector("#form-viagem");
  const resultadoViagem = raiz.querySelector("#resultado-viagem");
  const distanciaViagem = formViagem.querySelector("#distancia-viagem");
  const consumoViagem = formViagem.querySelector("#consumo-viagem");
  const precoViagem = formViagem.querySelector("#preco-viagem");
  const idaEVolta = formViagem.querySelector("#ida-e-volta");
  const pedagios = formViagem.querySelector("#pedagios");
  const pessoas = formViagem.querySelector("#pessoas");

  function viagem() {
    const km = ler(distanciaViagem, { milhar: true });
    const kmL = ler(consumoViagem);
    const preco = ler(precoViagem);
    const pedagio = ler(pedagios, { milhar: true });
    const textoPessoas = pessoas.value.trim();
    const n = Numeros.ler(textoPessoas);
    const inteiro = n !== null && Number.isInteger(n);
    pessoas.setAttribute("aria-invalid", String(textoPessoas !== "" && !inteiro));
    const quantas = inteiro ? Math.min(Math.max(n, 1), 999) : 1;

    if (km === null || kmL === null || preco === null) {
      mensagem(resultadoViagem, "Preencha a distância, o consumo e o preço do litro.");
      return;
    }
    if (km <= 0 || kmL <= 0 || preco < 0) {
      mensagem(resultadoViagem, "A distância e o consumo precisam ser maiores que zero.", true);
      return;
    }
    const r = C.viagem(km, kmL, preco, { idaEVolta: idaEVolta.checked, pedagios: pedagio ?? 0, pessoas: quantas });
    const extras = [];
    if (quantas > 1) {
      const porPessoa = document.createElement("span");
      porPessoa.className = "level level-ok";
      porPessoa.textContent = `${Numeros.dinheiro(r.porPessoa)} por pessoa`;
      extras.push(porPessoa);
    }
    const linhas = [
      linha("Distância total", `${Numeros.numero(r.distanciaTotal, 1)} km`),
      linha("Combustível necessário", `${Numeros.numero(r.litros, 2, 2)} L`),
      linha("Custo do combustível", Numeros.dinheiro(r.custoCombustivel)),
    ];
    if (r.pedagios > 0) linhas.push(linha("Pedágios", Numeros.dinheiro(r.pedagios)));
    linhas.push(linha("Custo por km", reais3(r.custoPorKm)));
    if (quantas > 1) linhas.push(linha(`Dividido por ${quantas} pessoas`, Numeros.dinheiro(r.porPessoa)));
    extras.push(lista(...linhas));
    principal(resultadoViagem, "Custo total da viagem", Numeros.dinheiro(r.total), extras);
  }

  formViagem.addEventListener("input", viagem);
  formViagem.addEventListener("change", viagem);
  formViagem.addEventListener("submit", (evento) => evento.preventDefault());
  viagem();
})();
