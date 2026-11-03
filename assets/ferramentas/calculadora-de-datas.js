"use strict";
/*
 * Interface da calculadora de datas (a lógica está em calculadora-de-datas-logica.js).
 * As três abas de ui/tools/datas/DatasScreen.kt da Calculadora Multifunção: diferença entre
 * datas, somar ou subtrair e informações de uma data. Os campos type="date" entregam
 * "AAAA-MM-DD", lido como data do calendário, sem passar por Date nem por fuso horário.
 */
(() => {
  const raiz = document.querySelector(".datas");
  if (!raiz) return;

  const D = LogicaDatas;
  const CHAVE_ABA = "efs-calculadora-de-datas-aba";
  const ANO_MINIMO = 1;
  const ANO_MAXIMO = 9999;
  const inteiro = (n) => Numeros.numero(n, 0);
  const plural = (n, um, varios) => `${inteiro(n)} ${Math.abs(n) === 1 ? um : varios}`;

  // --- Auxiliares ---------------------------------------------------------------------------

  function linha(rotulo, valor) {
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = rotulo;
    dd.textContent = valor;
    div.append(dt, dd);
    return div;
  }

  function lista(...linhas) {
    const dl = document.createElement("dl");
    dl.className = "result-list";
    dl.append(...linhas);
    return dl;
  }

  function mensagem(alvo, texto, erro = false) {
    const p = document.createElement("p");
    p.className = erro ? "result-message error" : "result-message";
    p.textContent = texto;
    alvo.replaceChildren(p);
  }

  function elemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function nota(texto) {
    return elemento("p", "hint datas-nota", texto);
  }

  function alternar(botoes, atributo, valor) {
    for (const botao of botoes) {
      const ativo = botao.dataset[atributo] === valor;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
  }

  const dentroDoIntervalo = (dias) => {
    const { ano } = D.partes(dias);
    return ano >= ANO_MINIMO && ano <= ANO_MAXIMO;
  };

  /** Lê um campo de data; vazio → null; texto incompleto ou fora de 0001–9999 → aria-invalid. */
  function lerData(campo) {
    const texto = campo.value.trim();
    const dias = D.lerISO(texto);
    const valida = dias !== null && dentroDoIntervalo(dias);
    // Navegadores sem seletor de data deixam digitar livremente: marca o texto que não serve.
    campo.setAttribute("aria-invalid", String((texto !== "" || campo.validity.badInput) && !valida));
    return valida ? dias : null;
  }

  function relativoAHoje(dias) {
    const diferenca = dias - D.hoje();
    if (diferenca === 0) return "Hoje";
    if (diferenca === 1) return "Amanhã";
    if (diferenca === -1) return "Ontem";
    return diferenca > 0 ? `Daqui a ${inteiro(diferenca)} dias` : `Há ${inteiro(-diferenca)} dias`;
  }

  /** Caixas "2 anos · 2 meses · 5 dias", como os PeriodBoxes do app. */
  function caixasPeriodo(anos, meses, dias) {
    const caixas = elemento("div", "datas-periodo");
    const itens = [
      [anos, "ano", "anos"],
      [meses, "mês", "meses"],
      [dias, "dia", "dias"],
    ];
    for (const [valor, um, varios] of itens) {
      const caixa = elemento("div", "datas-caixa");
      caixa.append(elemento("span", "datas-caixa-valor", inteiro(valor)), elemento("span", "datas-caixa-rotulo", Math.abs(valor) === 1 ? um : varios));
      caixas.append(caixa);
    }
    caixas.setAttribute("role", "group");
    caixas.setAttribute("aria-label", `${plural(anos, "ano", "anos")}, ${plural(meses, "mês", "meses")} e ${plural(dias, "dia", "dias")}`);
    return caixas;
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
    mostrarAba(localStorage.getItem(CHAVE_ABA) || "diferenca", false);
  } catch (erro) {
    mostrarAba("diferenca", false);
  }

  // --- Diferença entre datas ----------------------------------------------------------------

  const formDiferenca = raiz.querySelector("#form-diferenca");
  const resultadoDiferenca = raiz.querySelector("#resultado-diferenca");
  const difInicio = raiz.querySelector("#dif-inicio");
  const difFim = raiz.querySelector("#dif-fim");
  const difIncluir = raiz.querySelector("#dif-incluir");

  const DIRECOES = {
    futuro: "A data final vem depois da inicial.",
    passado: "A data final vem antes da inicial.",
    igual: "As duas datas são iguais.",
  };

  function calcularDiferenca() {
    const inicio = lerData(difInicio);
    const fim = lerData(difFim);
    if (inicio === null || fim === null) {
      const invalida = difInicio.getAttribute("aria-invalid") === "true" || difFim.getAttribute("aria-invalid") === "true";
      mensagem(
        resultadoDiferenca,
        invalida ? "Use datas completas entre o ano 1 e o ano 9999." : "Escolha as duas datas.",
        invalida,
      );
      return;
    }
    const r = D.diferenca(inicio, fim, difIncluir.checked);
    const semanas =
      r.diasRestantesSemana > 0
        ? `${plural(r.semanas, "semana", "semanas")} e ${plural(r.diasRestantesSemana, "dia", "dias")}`
        : plural(r.semanas, "semana", "semanas");
    resultadoDiferenca.replaceChildren(
      elemento("div", "result-label", "Total de dias"),
      elemento("div", "result-value", plural(r.totalDias, "dia", "dias")),
      caixasPeriodo(r.anos, r.meses, r.dias),
      elemento("p", "result-message datas-direcao", DIRECOES[r.direcao]),
      lista(
        linha("Em semanas", semanas),
        linha("Meses completos", inteiro(r.totalMeses)),
        linha("Total de horas", inteiro(r.totalHoras)),
        linha("Total de minutos", inteiro(r.totalMinutos)),
        linha("Dias úteis (seg. a sex.)", inteiro(r.diasUteis)),
        linha("Sábados e domingos", inteiro(r.diasFimDeSemana)),
      ),
      nota("Feriados não são descontados dos dias úteis."),
    );
  }

  raiz.querySelector("#dif-inverter").addEventListener("click", () => {
    [difInicio.value, difFim.value] = [difFim.value, difInicio.value];
    calcularDiferenca();
  });
  formDiferenca.addEventListener("input", calcularDiferenca);
  formDiferenca.addEventListener("change", calcularDiferenca);
  formDiferenca.addEventListener("submit", (evento) => evento.preventDefault());

  // --- Somar ou subtrair --------------------------------------------------------------------

  const formSomar = raiz.querySelector("#form-somar");
  const resultadoSomar = raiz.querySelector("#resultado-somar");
  const somBase = raiz.querySelector("#som-base");
  const somQuantidade = raiz.querySelector("#som-quantidade");
  const somUteis = raiz.querySelector("#som-uteis");
  const somUteisRotulo = raiz.querySelector("#som-uteis-rotulo");
  const botoesOperacao = formSomar.querySelectorAll("[data-operacao]");
  const botoesUnidade = formSomar.querySelectorAll("[data-unidade]");
  let operacao = "somar";
  let unidade = "dias";

  const NOMES_UNIDADE = {
    dias: ["dia", "dias"],
    semanas: ["semana", "semanas"],
    meses: ["mês", "meses"],
    anos: ["ano", "anos"],
  };

  function lerQuantidade() {
    const texto = somQuantidade.value.trim();
    const n = /^[+-]?\d+$/.test(texto) ? Number(texto) : null;
    somQuantidade.setAttribute("aria-invalid", String(texto !== "" && n === null));
    return n;
  }

  function calcularSoma() {
    const soDiasUteis = unidade === "dias" && somUteis.checked;
    somUteisRotulo.hidden = unidade !== "dias";
    const base = lerData(somBase);
    const quantidade = lerQuantidade();
    if (base === null || quantidade === null) {
      const invalida = somBase.getAttribute("aria-invalid") === "true" || somQuantidade.getAttribute("aria-invalid") === "true";
      mensagem(
        resultadoSomar,
        invalida ? "Use uma data completa e uma quantidade inteira, sem vírgula." : "Escolha a data e a quantidade.",
        invalida,
      );
      return;
    }
    const assinada = operacao === "somar" ? quantidade : -quantidade;
    const resultado = D.somar(base, assinada, unidade, soDiasUteis);
    if (!Number.isSafeInteger(resultado) || !dentroDoIntervalo(resultado)) {
      mensagem(resultadoSomar, "O resultado fica fora do intervalo do calendário (anos 1 a 9999).", true);
      return;
    }
    const [um, varios] = NOMES_UNIDADE[unidade];
    const descricao = `${operacao === "somar" ? "+" : "−"} ${plural(Math.abs(quantidade), soDiasUteis ? "dia útil" : um, soDiasUteis ? "dias úteis" : varios)}`;
    const corridos = Math.abs(resultado - base);
    const extras = [
      lista(
        linha("Operação", `${D.formatarCurta(base)} ${descricao}`),
        linha("Data no formato curto", D.formatarCurta(resultado)),
        linha("Dias corridos", inteiro(corridos)),
        linha("Em relação a hoje", relativoAHoje(resultado)),
      ),
    ];
    const antes = D.partes(base);
    const depois = D.partes(resultado);
    if ((unidade === "meses" || unidade === "anos") && depois.dia !== antes.dia) {
      extras.push(
        nota(
          `${D.MESES[depois.mes - 1].replace(/^./, (c) => c.toUpperCase())} de ${depois.ano} não tem dia ${antes.dia}, ` +
            "então o resultado é o último dia do mês.",
        ),
      );
    }
    if (soDiasUteis) extras.push(nota("Só sábados e domingos são pulados; feriados contam como dias úteis."));
    resultadoSomar.replaceChildren(
      elemento("div", "result-label", "Data resultante"),
      elemento("div", "result-value datas-data", D.formatarLonga(resultado)),
      elemento("span", "level level-ok", D.nomeDiaSemana(resultado)),
      ...extras,
    );
  }

  for (const botao of botoesOperacao) {
    botao.addEventListener("click", () => {
      operacao = botao.dataset.operacao;
      alternar(botoesOperacao, "operacao", operacao);
      calcularSoma();
    });
  }
  for (const botao of botoesUnidade) {
    botao.addEventListener("click", () => {
      unidade = botao.dataset.unidade;
      alternar(botoesUnidade, "unidade", unidade);
      calcularSoma();
    });
  }
  formSomar.addEventListener("input", calcularSoma);
  formSomar.addEventListener("change", calcularSoma);
  formSomar.addEventListener("submit", (evento) => evento.preventDefault());

  // --- Informações da data ------------------------------------------------------------------

  const formInfo = raiz.querySelector("#form-info");
  const resultadoInfo = raiz.querySelector("#resultado-info");
  const infoData = raiz.querySelector("#info-data");

  function calcularInfo() {
    const dias = lerData(infoData);
    if (dias === null) {
      const invalida = infoData.getAttribute("aria-invalid") === "true";
      mensagem(resultadoInfo, invalida ? "Use uma data completa entre o ano 1 e o ano 9999." : "Escolha uma data.", invalida);
      return;
    }
    const i = D.informacoes(dias, D.hoje());
    const { ano } = D.partes(dias);
    const semana =
      i.anoDaSemanaISO === ano ? `Semana ${i.semanaISO}` : `Semana ${i.semanaISO} de ${i.anoDaSemanaISO}`;
    resultadoInfo.replaceChildren(
      elemento("div", "result-label", "Dia da semana"),
      elemento("div", "result-value", D.nomeDiaSemana(dias)),
      elemento("p", "result-message datas-direcao", D.formatarLonga(dias)),
      lista(
        linha("Dia do ano", `${inteiro(i.diaDoAno)} de ${inteiro(D.diasNoAno(ano))}`),
        linha("Semana do ano (ISO)", semana),
        linha("Trimestre", `${i.trimestre}º trimestre`),
        linha("Ano bissexto", i.bissexto ? "Sim" : "Não"),
        linha("Dias no mês", inteiro(i.diasNoMes)),
        linha("Dias até o fim do ano", inteiro(i.diasRestantesNoAno)),
        linha("Em relação a hoje", relativoAHoje(dias)),
      ),
    );
  }

  formInfo.addEventListener("input", calcularInfo);
  formInfo.addEventListener("change", calcularInfo);
  formInfo.addEventListener("submit", (evento) => evento.preventDefault());

  // --- Botões "Hoje" e valores iniciais -----------------------------------------------------

  const CALCULOS = {
    "dif-inicio": calcularDiferenca,
    "dif-fim": calcularDiferenca,
    "som-base": calcularSoma,
    "info-data": calcularInfo,
  };

  for (const botao of raiz.querySelectorAll("[data-hoje]")) {
    botao.addEventListener("click", () => {
      const campo = raiz.querySelector(`#${botao.dataset.hoje}`);
      campo.value = D.paraISO(D.hoje());
      CALCULOS[campo.id]();
    });
  }

  // Como no app: a diferença começa de hoje até daqui a um mês; as outras abas, em hoje.
  const hoje = D.hoje();
  difInicio.value = D.paraISO(hoje);
  difFim.value = D.paraISO(D.somarMeses(hoje, 1));
  somBase.value = D.paraISO(hoje);
  infoData.value = D.paraISO(hoje);
  calcularDiferenca();
  calcularSoma();
  calcularInfo();
})();
