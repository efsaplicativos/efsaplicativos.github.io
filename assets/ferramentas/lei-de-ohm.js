"use strict";
/*
 * Interface da página de Lei de Ohm (a lógica está em lei-de-ohm-logica.js).
 * As quatro abas de ui/tools/ohm da Calculadora Multifunção: Lei de Ohm com roda de
 * fórmulas, resistores em série e paralelo, divisor de tensão e código de cores.
 */
(() => {
  const raiz = document.querySelector(".ohm");
  if (!raiz) return;

  const O = LogicaOhm;
  const CHAVE_ABA = "efs-lei-de-ohm-aba";
  const MAX_RESISTORES = 20;
  const fmt = (valor, unidade) => O.formatar(valor, unidade);

  // --- Auxiliares ---------------------------------------------------------------------------

  function elemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function linha(rotulo, valor, destaque = false) {
    const div = document.createElement("div");
    if (destaque) div.className = "ohm-calculado";
    div.append(elemento("dt", "", rotulo), elemento("dd", "", valor));
    return div;
  }

  function lista(...linhas) {
    const dl = elemento("dl", "result-list");
    dl.append(...linhas);
    return dl;
  }

  function mensagem(alvo, texto, erro = false) {
    alvo.replaceChildren(elemento("p", erro ? "result-message error" : "result-message", texto));
  }

  function alternar(botoes, atributo, valor) {
    for (const botao of botoes) {
      const ativo = botao.dataset[atributo] === valor;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
  }

  /** Preenche um select com os prefixos da grandeza ("mV", "V", "kV"…). */
  function preencherPrefixos(select, grandeza, padrao = "nenhum") {
    const g = O.GRANDEZAS[grandeza];
    select.replaceChildren(
      ...g.prefixos.map((p) => {
        const opcao = new Option(`${O.PREFIXOS[p].simbolo}${g.unidade}`, p);
        opcao.selected = p === padrao;
        return opcao;
      }),
    );
  }

  /** Valor do campo × fator do prefixo; null se vazio; marca aria-invalid se não for número. */
  function lerComPrefixo(campo, select, { negativo = true } = {}) {
    const texto = campo.value.trim();
    const valor = Numeros.ler(texto);
    const invalido = (texto !== "" && valor === null) || (!negativo && valor !== null && valor < 0);
    campo.setAttribute("aria-invalid", String(invalido));
    if (valor === null) return { valor: null, invalido };
    return { valor: valor * O.PREFIXOS[select.value].fator, invalido };
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
    mostrarAba(localStorage.getItem(CHAVE_ABA) || "lei", false);
  } catch (erro) {
    mostrarAba("lei", false);
  }

  // --- Lei de Ohm ---------------------------------------------------------------------------

  const formLei = raiz.querySelector("#form-lei");
  const resultadoLei = raiz.querySelector("#resultado-lei");
  const ORDEM = ["tensao", "corrente", "resistencia", "potencia"];
  const camposLei = Object.fromEntries(
    ORDEM.map((g) => [g, { campo: raiz.querySelector(`#lei-${g}`), prefixo: raiz.querySelector(`#lei-${g}-prefixo`) }]),
  );
  for (const g of ORDEM) preencherPrefixos(camposLei[g].prefixo, g);

  const ERROS_LEI = {
    excesso: "Preencha apenas 2 grandezas. Apague as demais para recalcular.",
    "divisao-por-zero": "Divisão por zero: revise os valores informados.",
    invalido: "Combinação inválida: resistência e potência não podem ser negativas.",
  };

  function destacarRoda(usadas) {
    const alvos = new Set(usadas.map((f) => O.FORMULAS[f].alvo));
    for (const quadrante of raiz.querySelectorAll("[data-quadrante]")) {
      quadrante.classList.toggle("ohm-ativo", alvos.has(quadrante.dataset.quadrante));
    }
    for (const item of raiz.querySelectorAll("[data-formula]")) {
      const usada = usadas.includes(item.dataset.formula);
      item.classList.toggle("ohm-usada", usada);
      if (usada) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    }
  }

  function calcularLei() {
    const lidos = {};
    let algumInvalido = false;
    for (const g of ORDEM) {
      const negativo = g === "tensao" || g === "corrente";
      const { valor, invalido } = lerComPrefixo(camposLei[g].campo, camposLei[g].prefixo, { negativo });
      // Resistência ou potência negativas seguem para resolver(), que devolve "invalido".
      lidos[g] = valor;
      if (invalido && valor === null) algumInvalido = true;
    }
    if (algumInvalido) {
      destacarRoda([]);
      mensagem(resultadoLei, "Use apenas números, com vírgula ou ponto para decimais.", true);
      return;
    }
    const r = O.resolver(lidos.tensao, lidos.corrente, lidos.resistencia, lidos.potencia);
    if (r.erro) {
      destacarRoda([]);
      if (r.erro === "faltam") mensagem(resultadoLei, "Preencha duas grandezas.");
      else mensagem(resultadoLei, ERROS_LEI[r.erro], true);
      return;
    }
    destacarRoda(r.usadas);
    const calculadas = new Set(r.usadas.map((f) => O.FORMULAS[f].alvo));
    const destaques = elemento("div", "ohm-destaques");
    for (const g of ORDEM.filter((x) => calculadas.has(x))) {
      const caixa = elemento("div", "ohm-destaque");
      const G = O.GRANDEZAS[g];
      caixa.append(elemento("span", "result-label", `${G.nome} (${G.simbolo})`), elemento("span", "ohm-destaque-valor", fmt(r.valores[g], G.unidade)));
      destaques.append(caixa);
    }
    resultadoLei.replaceChildren(
      elemento("div", "result-label", "Calculado"),
      destaques,
      lista(
        ...ORDEM.map((g) => {
          const G = O.GRANDEZAS[g];
          return linha(`${G.nome} (${G.simbolo})`, fmt(r.valores[g], G.unidade), calculadas.has(g));
        }),
      ),
      elemento("p", "hint ohm-nota", `Fórmulas: ${r.usadas.map((f) => O.FORMULAS[f].texto).join(" e ")}`),
    );
  }

  raiz.querySelector("#lei-limpar").addEventListener("click", () => {
    for (const g of ORDEM) camposLei[g].campo.value = "";
    calcularLei();
    camposLei.tensao.campo.focus();
  });
  formLei.addEventListener("input", calcularLei);
  formLei.addEventListener("change", calcularLei);
  formLei.addEventListener("submit", (evento) => evento.preventDefault());
  calcularLei();

  // --- Série e paralelo ---------------------------------------------------------------------

  const formResistores = raiz.querySelector("#form-resistores");
  const listaResistores = raiz.querySelector("#lista-resistores");
  const botaoAdicionar = raiz.querySelector("#adicionar-resistor");
  const avisoLimite = raiz.querySelector("#limite-resistores");
  const resultadoResistores = raiz.querySelector("#resultado-resistores");
  /** Cada resistor: { valor: texto digitado, prefixo }. Como no app, começa com dois. */
  const resistores = [
    { valor: "", prefixo: "nenhum" },
    { valor: "", prefixo: "nenhum" },
  ];

  function desenharResistores(focar = null) {
    const linhas = resistores.map((r, i) => {
      const n = i + 1;
      const campo = elemento("div", "field ohm-resistor-linha");
      const rotulo = elemento("label", "", `R${n}`);
      rotulo.htmlFor = `res-${n}`;
      const fila = elemento("div", "input-row");
      const input = elemento("input", "input");
      input.id = `res-${n}`;
      input.inputMode = "decimal";
      input.autocomplete = "off";
      input.value = r.valor;
      input.dataset.indice = String(i);
      const select = elemento("select", "select");
      select.dataset.indice = String(i);
      select.setAttribute("aria-label", `Unidade de R${n}`);
      preencherPrefixos(select, "resistencia", r.prefixo);
      const remover = elemento("button", "button secondary ohm-remover");
      remover.type = "button";
      remover.dataset.remover = String(i);
      remover.setAttribute("aria-label", `Remover R${n}`);
      remover.title = `Remover R${n}`;
      remover.append(elemento("span", "", "×"));
      remover.firstChild.setAttribute("aria-hidden", "true");
      remover.disabled = resistores.length <= 1;
      fila.append(input, select, remover);
      campo.append(rotulo, fila);
      return campo;
    });
    listaResistores.replaceChildren(...linhas);
    botaoAdicionar.disabled = resistores.length >= MAX_RESISTORES;
    avisoLimite.hidden = resistores.length < MAX_RESISTORES;
    if (focar !== null) listaResistores.querySelector(`#res-${focar + 1}`)?.focus();
    calcularResistores();
  }

  function calcularResistores() {
    const ohms = [];
    let invalido = false;
    for (const input of listaResistores.querySelectorAll("input")) {
      const select = listaResistores.querySelector(`select[data-indice="${input.dataset.indice}"]`);
      const { valor, invalido: ruim } = lerComPrefixo(input, select, { negativo: false });
      if (ruim) invalido = true;
      else if (valor !== null) ohms.push(valor);
    }
    if (invalido) {
      mensagem(resultadoResistores, "Use valores numéricos positivos para os resistores.", true);
      return;
    }
    const serie = O.serie(ohms);
    const paralelo = O.paralelo(ohms);
    if (serie === null || paralelo === null) {
      mensagem(resultadoResistores, "Informe pelo menos um resistor.");
      return;
    }
    const destaques = elemento("div", "ohm-destaques");
    for (const [rotulo, valor] of [
      ["Em série", serie],
      ["Em paralelo", paralelo],
    ]) {
      const caixa = elemento("div", "ohm-destaque");
      caixa.append(elemento("span", "result-label", rotulo), elemento("span", "ohm-destaque-valor", fmt(valor, "Ω")));
      destaques.append(caixa);
    }
    const partes = [
      elemento("div", "result-label", "Resistência equivalente"),
      destaques,
      lista(
        linha("Resistores considerados", String(ohms.length)),
        linha("Equivalente em série", fmt(serie, "Ω")),
        linha("Equivalente em paralelo", fmt(paralelo, "Ω")),
      ),
      elemento("p", "ohm-formula", "Req = R1 + R2 + … + Rn"),
      elemento("p", "ohm-formula", "1/Req = 1/R1 + 1/R2 + … + 1/Rn"),
    ];
    if (ohms.includes(0) && ohms.length > 1) {
      partes.push(elemento("p", "hint ohm-nota", "Um resistor de 0 Ω em paralelo é um curto-circuito: o equivalente em paralelo é 0 Ω."));
    }
    resultadoResistores.replaceChildren(...partes);
  }

  listaResistores.addEventListener("input", (evento) => {
    const i = Number(evento.target.dataset.indice);
    if (evento.target.tagName === "INPUT" && resistores[i]) resistores[i].valor = evento.target.value;
    calcularResistores();
  });
  listaResistores.addEventListener("change", (evento) => {
    const i = Number(evento.target.dataset.indice);
    if (evento.target.tagName === "SELECT" && resistores[i]) resistores[i].prefixo = evento.target.value;
    calcularResistores();
  });
  listaResistores.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-remover]");
    if (!botao || resistores.length <= 1) return;
    const i = Number(botao.dataset.remover);
    resistores.splice(i, 1);
    desenharResistores(Math.min(i, resistores.length - 1));
  });
  botaoAdicionar.addEventListener("click", () => {
    if (resistores.length >= MAX_RESISTORES) return;
    // Como no app, o novo resistor herda o prefixo do último.
    resistores.push({ valor: "", prefixo: resistores.at(-1)?.prefixo ?? "nenhum" });
    desenharResistores(resistores.length - 1);
  });
  formResistores.addEventListener("submit", (evento) => evento.preventDefault());
  desenharResistores();

  // --- Divisor de tensão --------------------------------------------------------------------

  const formDivisor = raiz.querySelector("#form-divisor");
  const resultadoDivisor = raiz.querySelector("#resultado-divisor");
  const vin = raiz.querySelector("#div-vin");
  const r1 = raiz.querySelector("#div-r1");
  const r2 = raiz.querySelector("#div-r2");
  const vinPrefixo = raiz.querySelector("#div-vin-prefixo");
  const r1Prefixo = raiz.querySelector("#div-r1-prefixo");
  const r2Prefixo = raiz.querySelector("#div-r2-prefixo");
  preencherPrefixos(vinPrefixo, "tensao");
  preencherPrefixos(r1Prefixo, "resistencia", "quilo");
  preencherPrefixos(r2Prefixo, "resistencia", "quilo");

  function calcularDivisor() {
    const v = lerComPrefixo(vin, vinPrefixo);
    const a = lerComPrefixo(r1, r1Prefixo, { negativo: false });
    const b = lerComPrefixo(r2, r2Prefixo, { negativo: false });
    if (v.invalido || a.invalido || b.invalido) {
      mensagem(resultadoDivisor, "Os resistores não podem ser negativos. Use apenas números.", true);
      return;
    }
    if (v.valor === null || a.valor === null || b.valor === null) {
      mensagem(resultadoDivisor, "Preencha Vin, R1 e R2.");
      return;
    }
    const r = O.divisor(v.valor, a.valor, b.valor);
    if (!r) {
      mensagem(resultadoDivisor, "R1 + R2 deve ser maior que zero.", true);
      return;
    }
    resultadoDivisor.replaceChildren(
      elemento("div", "result-label", "Tensão de saída (Vout)"),
      elemento("div", "result-value", fmt(r.vout, "V")),
      lista(
        linha("Corrente no divisor", fmt(r.corrente, "A")),
        linha("Potência dissipada em R1", fmt(r.potenciaR1, "W")),
        linha("Potência dissipada em R2", fmt(r.potenciaR2, "W")),
        linha("Razão Vout/Vin", O.inteligente(r.razao, 6)),
      ),
      elemento("p", "ohm-formula", "Vout = Vin × R2 / (R1 + R2)"),
    );
  }

  formDivisor.addEventListener("input", calcularDivisor);
  formDivisor.addEventListener("change", calcularDivisor);
  formDivisor.addEventListener("submit", (evento) => evento.preventDefault());
  calcularDivisor();

  // --- Código de cores ----------------------------------------------------------------------

  const formCores = raiz.querySelector("#form-cores");
  const resultadoCores = raiz.querySelector("#resultado-cores");
  const desenho = raiz.querySelector("#desenho-resistor");
  const botoesFaixas = raiz.querySelectorAll("[data-faixas]");
  /** Cores iniciais do app: amarelo, violeta, (preto), vermelho, dourado = 4,7 kΩ ±5%. */
  const escolha = { d1: "amarelo", d2: "violeta", d3: "preto", mult: "vermelho", tol: "dourado" };
  let cincoFaixas = false;

  const OPCOES = {
    d1: O.CORES_DIGITO,
    d2: O.CORES_DIGITO,
    d3: O.CORES_DIGITO,
    mult: O.CORES_MULTIPLICADOR,
    tol: O.CORES_TOLERANCIA,
  };

  /** Texto do que a cor significa naquela posição, para a dica da amostra. */
  function significado(faixa, c) {
    if (faixa === "mult") return `× ${O.inteligente(c.multiplicador, 6)}`;
    if (faixa === "tol") return `±${Numeros.numero(c.tolerancia, 2)}%`;
    return String(c.digito);
  }

  for (const fieldset of formCores.querySelectorAll("[data-faixa]")) {
    const faixa = fieldset.dataset.faixa;
    const caixa = fieldset.querySelector(".ohm-amostras");
    caixa.replaceChildren(
      ...OPCOES[faixa].map((c) => {
        const rotulo = elemento("label", "ohm-amostra");
        rotulo.title = `${c.nome} (${significado(faixa, c)})`;
        const radio = elemento("input");
        radio.type = "radio";
        radio.name = `faixa-${faixa}`;
        radio.value = c.id;
        radio.checked = escolha[faixa] === c.id;
        const amostra = elemento("span", c.hex ? "ohm-amostra-cor" : "ohm-amostra-cor ohm-sem-cor");
        amostra.setAttribute("aria-hidden", "true");
        if (c.hex) amostra.style.setProperty("--cor", c.hex);
        rotulo.append(radio, amostra, elemento("span", "sr-only", `${c.nome}, ${significado(faixa, c)}`));
        return rotulo;
      }),
    );
  }

  const POSICOES = {
    4: { d1: 84, d2: 116, mult: 148, tol: 220 },
    5: { d1: 78, d2: 106, d3: 134, mult: 162, tol: 220 },
  };

  function desenhar() {
    const posicoes = POSICOES[cincoFaixas ? 5 : 4];
    for (const rect of desenho.querySelectorAll("[data-desenho]")) {
      const faixa = rect.dataset.desenho;
      const c = O.cor(escolha[faixa]);
      const visivel = faixa in posicoes && c && c.hex;
      rect.setAttribute("visibility", visivel ? "visible" : "hidden");
      if (!visivel) continue;
      rect.setAttribute("x", String(posicoes[faixa]));
      rect.setAttribute("fill", c.hex);
    }
  }

  function calcularCores() {
    for (const fieldset of formCores.querySelectorAll("[data-faixa]")) {
      const faixa = fieldset.dataset.faixa;
      fieldset.hidden = faixa === "d3" && !cincoFaixas;
      const c = O.cor(escolha[faixa]);
      fieldset.querySelector(".ohm-faixa-nome").textContent = c ? `${c.nome} (${significado(faixa, c)})` : "";
    }
    desenhar();
    const digitos = cincoFaixas ? [escolha.d1, escolha.d2, escolha.d3] : [escolha.d1, escolha.d2];
    const r = O.decodificar(digitos, escolha.mult, escolha.tol);
    const nomes = [...digitos, escolha.mult, escolha.tol].map((id) => O.cor(id).nome.toLowerCase());
    if (!r) {
      desenho.setAttribute("aria-label", "Resistor");
      mensagem(resultadoCores, "Combinação de cores inválida.", true);
      return;
    }
    const tolerancia = `±${Numeros.numero(r.tolerancia, 2)}%`;
    desenho.setAttribute("aria-label", `Resistor com faixas ${nomes.join(", ")}: ${fmt(r.ohms, "Ω")} ${tolerancia}`);
    const tol = elemento("span", "level level-ok", `Tolerância ${tolerancia}`);
    resultadoCores.replaceChildren(
      elemento("div", "result-label", "Resistência"),
      elemento("div", "result-value", fmt(r.ohms, "Ω")),
      tol,
      lista(
        linha("Cálculo", `${r.significativos} × ${O.inteligente(r.multiplicador, 6)} Ω`),
        linha("Em ohms", `${O.inteligente(r.ohms, 12)} Ω`),
        linha("Valor mínimo", fmt(r.minimo, "Ω")),
        linha("Valor máximo", fmt(r.maximo, "Ω")),
      ),
    );
  }

  formCores.addEventListener("change", (evento) => {
    const radio = evento.target;
    if (radio.type !== "radio") return;
    escolha[radio.name.replace("faixa-", "")] = radio.value;
    calcularCores();
  });
  for (const botao of botoesFaixas) {
    botao.addEventListener("click", () => {
      cincoFaixas = botao.dataset.faixas === "5";
      alternar(botoesFaixas, "faixas", cincoFaixas ? "5" : "4");
      calcularCores();
    });
  }
  formCores.addEventListener("submit", (evento) => evento.preventDefault());
  calcularCores();
})();
