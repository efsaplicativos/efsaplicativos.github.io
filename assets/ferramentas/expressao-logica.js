"use strict";
/*
 * Motores das calculadoras básica e científica da Calculadora Multifunção, sem DOM e sem eval:
 * - Basica: core/basica/BasicCalculator.kt. Conta em decimal exato (0,1 + 0,2 = 0,3), com
 *   precisão de trabalho de 34 dígitos (DECIMAL128) e resultado em 15 algarismos.
 * - Avaliador: core/cientifica/ScientificEvaluator.kt (analisador descendente recursivo).
 * - Cientifica: core/cientifica/ScientificCalculator.kt (edição da expressão em "peças").
 * - Visor: CalcDisplayFormat de ui/tools/basica/CalcKeypad.kt.
 * O estado é sempre um objeto novo: cada tecla devolve o próximo estado.
 */
const Expressao = (() => {
  const M = typeof MatematicaComum === "object" ? MatematicaComum : require("./matematica-comum.js");
  const { Decimal, DivisaoPorZero } = M;

  // =====================================================================
  // Calculadora básica
  // =====================================================================

  const MAX_DIGITOS = 15;
  const MAX_HISTORICO = 50;
  const PRECISAO_CONTA = 34;
  const PRECISAO_VISOR = 15;
  const ZERO = new Decimal(0n, 0);
  const CEM = Decimal.de("100");
  const LIMITE_ESTOURO = Decimal.de("1E100");
  const OPERADORES = ["+", "−", "×", "÷"];

  /**
   * tokens: parte confirmada (número, operador, número, operador...); entrada: número sendo
   * digitado, sempre com "." interno; resultado: valor depois do "=" (null enquanto se digita).
   */
  function estadoBasico(parcial = {}) {
    return {
      tokens: [],
      entrada: "",
      resultado: null,
      expressaoAvaliada: [],
      repetirOperador: null,
      repetirOperando: null,
      erro: null,
      memoria: null,
      historico: [],
      ...parcial,
    };
  }

  const com = (estado, mudancas) => ({ ...estado, ...mudancas });
  const tokenNumero = (valor) => ({ tipo: "numero", valor });
  const tokenOperador = (op) => ({ tipo: "operador", op });
  const ultimo = (lista) => lista[lista.length - 1];
  const entradaVazia = (e) => e.entrada === "" || e.entrada === "-";

  /** Depois do "=" ou de um erro, a próxima entrada numérica começa uma conta nova. */
  const recomecar = (e) =>
    e.erro !== null || e.resultado !== null ? estadoBasico({ memoria: e.memoria, historico: e.historico }) : e;
  /** Depois de um erro, qualquer tecla recomeça do zero (mantendo memória e histórico). */
  const semErro = (e) => (e.erro !== null ? estadoBasico({ memoria: e.memoria, historico: e.historico }) : e);

  /** true quando a tecla de limpar age como "C" (apaga só o número atual). */
  const limpaSoEntrada = (e) => e.erro === null && e.resultado === null && e.entrada !== "" && e.tokens.length > 0;

  /** 15 algarismos significativos, sem zeros à direita. */
  function arredondar(valor) {
    if (valor.sinal === 0) return ZERO;
    const r = valor.arredondar(PRECISAO_VISOR).semZeros();
    return r.sinal === 0 ? ZERO : r;
  }

  function lerEntrada(entrada) {
    if (entrada === "" || entrada === "-") return ZERO;
    return Decimal.de(entrada.endsWith(".") ? entrada.slice(0, -1) : entrada);
  }

  function simples(valor) {
    const r = arredondar(valor);
    return r.sinal === 0 ? "0" : r.paraTexto();
  }

  const dividir = (a, b) => a.dividir(b, PRECISAO_CONTA);

  function digito(e, d) {
    const s = recomecar(e);
    if ((s.entrada.match(/\d/g) || []).length >= MAX_DIGITOS) return s;
    let nova;
    if (s.entrada === "" || s.entrada === "0") nova = d;
    else if (s.entrada === "-0") nova = `-${d}`;
    else nova = s.entrada + d;
    return com(s, { entrada: nova });
  }

  function virgula(e) {
    const s = recomecar(e);
    if (s.entrada.includes(".")) return s;
    const nova = s.entrada === "" ? "0." : s.entrada === "-" ? "-0." : `${s.entrada}.`;
    return com(s, { entrada: nova });
  }

  function operador(e, op) {
    const s = semErro(e);
    if (s.resultado !== null) {
      return com(s, {
        tokens: [tokenNumero(s.resultado), tokenOperador(op)],
        entrada: "",
        resultado: null,
        expressaoAvaliada: [],
      });
    }
    if (entradaVazia(s)) {
      if (!s.tokens.length) return com(s, { tokens: [tokenNumero(ZERO), tokenOperador(op)], entrada: "" });
      // Operador repetido só troca o anterior (no app original, 5 + + dava 10)
      if (ultimo(s.tokens).tipo === "operador") {
        return com(s, { tokens: [...s.tokens.slice(0, -1), tokenOperador(op)], entrada: "" });
      }
      return com(s, { tokens: [...s.tokens, tokenOperador(op)] });
    }
    return com(s, { tokens: [...s.tokens, tokenNumero(lerEntrada(s.entrada)), tokenOperador(op)], entrada: "" });
  }

  function igual(e) {
    if (e.erro !== null) return semErro(e);
    // "=" repetido repete a última operação sobre o resultado
    if (e.resultado !== null) {
      if (e.repetirOperador === null || e.repetirOperando === null) return e;
      return finalizar(e, [tokenNumero(e.resultado), tokenOperador(e.repetirOperador), tokenNumero(e.repetirOperando)]);
    }
    let tokens = e.tokens;
    if (entradaVazia(e)) {
      if (!tokens.length) return e;
      if (ultimo(tokens).tipo === "operador") tokens = tokens.slice(0, -1);
    } else {
      tokens = [...tokens, tokenNumero(lerEntrada(e.entrada))];
    }
    if (tokens.length === 1) {
      return com(e, { tokens: [], entrada: "", resultado: arredondar(tokens[0].valor), expressaoAvaliada: tokens });
    }
    return finalizar(e, tokens);
  }

  /**
   * Porcentagem contextual: a + b% = a + a·b/100; a − b% = a − a·b/100; a × b% = a·b/100;
   * a ÷ b% = a ÷ (b/100); sozinho, n% = n/100.
   */
  function porcentagem(e) {
    const s = semErro(e);
    if (s.resultado !== null) {
      return com(s, { tokens: [], entrada: simples(dividir(s.resultado, CEM)), resultado: null, expressaoAvaliada: [] });
    }
    if (entradaVazia(s)) return s;
    const b = lerEntrada(s.entrada);
    const anterior = ultimo(s.tokens);
    const op = anterior && anterior.tipo === "operador" ? anterior.op : null;
    let valor;
    if (op === "+" || op === "−") {
      let base;
      try {
        base = avaliar(s.tokens.slice(0, -1));
      } catch (erro) {
        if (erro instanceof DivisaoPorZero) return com(s, { erro: "divisao" });
        throw erro;
      }
      valor = dividir(base.multiplicar(b, PRECISAO_CONTA), CEM);
    } else {
      valor = dividir(b, CEM);
    }
    return com(s, { entrada: simples(valor) });
  }

  function inverterSinal(e) {
    const s = semErro(e);
    if (s.resultado !== null) {
      return com(s, { tokens: [], entrada: simples(s.resultado.negar()), resultado: null, expressaoAvaliada: [] });
    }
    const atual = s.entrada;
    const nova = atual === "" ? "-0" : atual.startsWith("-") ? atual.slice(1) : `-${atual}`;
    return com(s, { entrada: nova });
  }

  function apagar(e) {
    if (e.erro !== null) return semErro(e);
    let s = e;
    // Permite editar o resultado
    if (s.resultado !== null) {
      s = com(s, { tokens: [], entrada: simples(s.resultado), resultado: null, expressaoAvaliada: [] });
    }
    if (s.entrada !== "") {
      const cortada = s.entrada.slice(0, -1);
      return com(s, { entrada: cortada === "-" ? "" : cortada });
    }
    if (s.tokens.length && ultimo(s.tokens).tipo === "operador") {
      const numero = s.tokens[s.tokens.length - 2];
      return com(s, { tokens: s.tokens.slice(0, -2), entrada: simples(numero.valor) });
    }
    return s;
  }

  /** "C" apaga o número atual; "AC" apaga tudo (memória e histórico ficam). */
  const limpar = (e) => (limpaSoEntrada(e) ? com(e, { entrada: "" }) : limparTudo(e));
  const limparTudo = (e) => estadoBasico({ memoria: e.memoria, historico: e.historico });
  const limparHistorico = (e) => com(e, { historico: [] });

  const memoriaLimpar = (e) => com(e, { memoria: null });
  const memoriaRecuperar = (e) => (e.memoria !== null ? usarValor(e, e.memoria) : e);
  const memoriaSomar = (e) => memoriaAplicar(e, false);
  const memoriaSubtrair = (e) => memoriaAplicar(e, true);

  function memoriaAplicar(e, subtrair) {
    const valor = valorAtual(e);
    if (valor === null) return e;
    const base = e.memoria ?? ZERO;
    const nova = subtrair ? base.subtrair(valor, PRECISAO_CONTA) : base.somar(valor, PRECISAO_CONTA);
    return com(e, { memoria: arredondar(nova) });
  }

  /** Usa um valor (memória ou histórico) como número atual. */
  const usarValor = (e, valor) => com(recomecar(e), { entrada: simples(valor) });

  /** Valor exibido no momento: número digitado, resultado ou prévia. */
  function valorAtual(e) {
    if (e.erro !== null) return null;
    if (e.resultado !== null) return e.resultado;
    if (!entradaVazia(e)) return arredondar(lerEntrada(e.entrada));
    return previa(e);
  }

  /** Prévia do resultado enquanto se digita (null sem operação ou com erro). */
  function previa(e) {
    if (e.erro !== null || e.resultado !== null) return null;
    let tokens = e.tokens;
    if (!entradaVazia(e)) tokens = [...tokens, tokenNumero(lerEntrada(e.entrada))];
    else if (tokens.length && ultimo(tokens).tipo === "operador") tokens = tokens.slice(0, -1);
    if (tokens.length < 3) return null;
    try {
      return avaliar(tokens);
    } catch (erro) {
      if (erro instanceof DivisaoPorZero) return null;
      throw erro;
    }
  }

  /** Avalia respeitando a precedência (× e ÷ antes de + e −). */
  function avaliar(tokens) {
    if (!tokens.length) return ZERO;
    const termos = [];
    const aditivos = [];
    let acumulado = tokens[0].valor;
    for (let i = 1; i + 1 < tokens.length; i += 2) {
      const op = tokens[i].op;
      const n = tokens[i + 1].valor;
      if (op === "×") acumulado = acumulado.multiplicar(n, PRECISAO_CONTA);
      else if (op === "÷") acumulado = dividir(acumulado, n);
      else {
        termos.push(acumulado);
        aditivos.push(op);
        acumulado = n;
      }
    }
    termos.push(acumulado);
    let resultado = termos[0];
    aditivos.forEach((op, k) => {
      resultado =
        op === "+" ? resultado.somar(termos[k + 1], PRECISAO_CONTA) : resultado.subtrair(termos[k + 1], PRECISAO_CONTA);
    });
    return arredondar(resultado);
  }

  function finalizar(s, expressao) {
    let valor;
    try {
      valor = avaliar(expressao);
    } catch (erro) {
      if (!(erro instanceof DivisaoPorZero)) throw erro;
      return com(s, { tokens: [], entrada: "", resultado: null, expressaoAvaliada: expressao, erro: "divisao" });
    }
    if (valor.abs().comparar(LIMITE_ESTOURO) >= 0) {
      return com(s, { tokens: [], entrada: "", resultado: null, expressaoAvaliada: expressao, erro: "estouro" });
    }
    return com(s, {
      tokens: [],
      entrada: "",
      resultado: valor,
      expressaoAvaliada: expressao,
      repetirOperador: expressao[expressao.length - 2].op,
      repetirOperando: ultimo(expressao).valor,
      erro: null,
      historico: [{ expressao, resultado: valor }, ...s.historico].slice(0, MAX_HISTORICO),
    });
  }

  // ---------- Visor (CalcDisplayFormat) ----------

  const UM_E15 = Decimal.de("1E15");
  const UM_E_9 = Decimal.de("1E-9");

  /** Texto digitado no padrão brasileiro: "-1234.5" → "−1.234,5", preservando a vírgula final. */
  function formatarEntrada(bruto) {
    const negativo = bruto.startsWith("-");
    const corpo = negativo ? bruto.slice(1) : bruto;
    const ponto = corpo.indexOf(".");
    const inteiro = ponto >= 0 ? corpo.slice(0, ponto) : corpo;
    const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${negativo ? "−" : ""}${agrupado || "0"}${ponto >= 0 ? `,${corpo.slice(ponto + 1)}` : ""}`;
  }

  /** Resultado no visor; notação científica para valores extremos. */
  function formatarNumero(valor) {
    const absoluto = valor.abs();
    if (absoluto.sinal !== 0 && (absoluto.comparar(UM_E15) >= 0 || absoluto.comparar(UM_E_9) < 0)) {
      return M.cientifico(valor.paraNumero(), 9);
    }
    return formatarEntrada(valor.semZeros().paraTexto());
  }

  const textoExpressao = (tokens) =>
    tokens
      .map((t) => {
        if (t.tipo === "operador") return t.op;
        return t.valor.sinal < 0 ? `(${formatarNumero(t.valor)})` : formatarNumero(t.valor);
      })
      .join(" ");

  const ERROS_BASICA = { divisao: "Divisão por zero", estouro: "Número grande demais" };

  /** Linhas do visor: acima (conta feita), principal e abaixo (prévia). */
  function visorBasico(e) {
    if (e.erro !== null) {
      return {
        acima: `${textoExpressao(e.expressaoAvaliada)} =`.trim(),
        principal: ERROS_BASICA[e.erro],
        abaixo: "",
        tipo: "erro",
      };
    }
    if (e.resultado !== null) {
      return {
        acima: `${textoExpressao(e.expressaoAvaliada)} =`,
        principal: formatarNumero(e.resultado),
        abaixo: "",
        tipo: "resultado",
      };
    }
    let digitando = textoExpressao(e.tokens);
    if (e.entrada !== "") digitando += (digitando ? " " : "") + formatarEntrada(e.entrada);
    const p = previa(e);
    return { acima: "", principal: digitando || "0", abaixo: p ? `= ${formatarNumero(p)}` : "", tipo: "digitando" };
  }

  const Basica = {
    MAX_DIGITOS,
    MAX_HISTORICO,
    OPERADORES,
    estado: estadoBasico,
    digito,
    virgula,
    operador,
    igual,
    porcentagem,
    inverterSinal,
    apagar,
    limpar,
    limparTudo,
    limparHistorico,
    limpaSoEntrada,
    memoriaLimpar,
    memoriaRecuperar,
    memoriaSomar,
    memoriaSubtrair,
    usarValor,
    valorAtual,
    previa,
    avaliar,
    arredondar,
    formatarEntrada,
    formatarNumero,
    textoExpressao,
    visor: visorBasico,
  };

  // =====================================================================
  // Avaliador da calculadora científica
  // =====================================================================

  /** Tipos de erro: "sintaxe", "dominio", "divisao" e "estouro". */
  class ErroCientifico extends Error {
    constructor(tipo) {
      super(tipo);
      this.tipo = tipo;
    }
  }
  const falhar = (tipo) => {
    throw new ErroCientifico(tipo);
  };

  const CONSTANTES = ["π", "e", "Ans"];
  const FUNCOES = [
    "sin⁻¹", "cos⁻¹", "tan⁻¹", "sinh⁻¹", "cosh⁻¹", "tanh⁻¹",
    "sinh", "cosh", "tanh", "sin", "cos", "tan",
    "log₂", "log", "ln", "√", "∛", "abs", "exp",
  ];
  /** Do maior para o menor ("exp" antes de "e"); o sort do JS é estável, como o do Kotlin. */
  const IDENTIFICADORES = [...FUNCOES, ...CONSTANTES, "mod", "P", "C"].sort((a, b) => b.length - a.length);

  const ehDigito = (c) => c >= "0" && c <= "9";

  /** Arredonda para o inteiro mais próximo, empate para o par (kotlin.math.round). */
  function arredondarPar(x) {
    const piso = Math.floor(x);
    const diferenca = x - piso;
    if (diferenca < 0.5) return piso;
    if (diferenca > 0.5) return piso + 1;
    return piso % 2 === 0 ? piso : piso + 1;
  }

  function finito(valor) {
    if (Number.isNaN(valor)) falhar("dominio");
    if (!Number.isFinite(valor)) falhar("estouro");
    return valor;
  }

  /** Remove o ruído de ponto flutuante: 15 algarismos (0,1 + 0,2 → 0,3; tan 45° → 1). */
  function limparRuido(valor) {
    if (valor === 0) return 0;
    if (!Number.isFinite(valor)) return valor;
    return Decimal.deNumero(valor).arredondar(15).paraNumero();
  }

  function tokenizar(texto) {
    const tokens = [];
    let pos = 0;

    function lerNumero() {
      const inicio = pos;
      let pontos = 0;
      while (pos < texto.length && (ehDigito(texto[pos]) || texto[pos] === ".")) {
        if (texto[pos] === ".") pontos++;
        pos++;
      }
      let literal = texto.slice(inicio, pos);
      if (pontos > 1 || literal === ".") falhar("sintaxe");
      if (texto[pos] === "E") {
        pos++;
        let expoente = "";
        if (texto[pos] === "-" || texto[pos] === "−" || texto[pos] === "+") {
          if (texto[pos] !== "+") expoente = "-";
          pos++;
        }
        const inicioExpoente = pos;
        while (pos < texto.length && ehDigito(texto[pos])) pos++;
        if (pos === inicioExpoente) falhar("sintaxe");
        expoente += texto.slice(inicioExpoente, pos);
        literal = `${literal}E${expoente}`;
      }
      const valor = Number(literal);
      if (Number.isNaN(valor)) falhar("sintaxe");
      if (!Number.isFinite(valor)) falhar("estouro");
      return { tipo: "numero", valor };
    }

    function lerIdentificador() {
      for (const nome of IDENTIFICADORES) {
        if (!texto.startsWith(nome, pos)) continue;
        pos += nome.length;
        if (CONSTANTES.includes(nome)) return { tipo: "constante", nome };
        if (nome === "mod" || nome === "P" || nome === "C") return { tipo: "operador", simbolo: nome };
        // Função: exige "(" logo em seguida
        if (texto[pos] !== "(") falhar("sintaxe");
        pos++;
        return { tipo: "funcao", nome };
      }
      return falhar("sintaxe");
    }

    while (pos < texto.length) {
      const c = texto[pos];
      if (/\s/.test(c)) pos++;
      else if (ehDigito(c) || c === ".") tokens.push(lerNumero());
      else if (c === "(" || c === ")") {
        tokens.push({ tipo: c });
        pos++;
      } else if (c === "+" || c === "^") {
        tokens.push({ tipo: "operador", simbolo: c });
        pos++;
      } else if (c === "-" || c === "−") {
        tokens.push({ tipo: "operador", simbolo: "−" });
        pos++;
      } else if (c === "×" || c === "*") {
        tokens.push({ tipo: "operador", simbolo: "×" });
        pos++;
      } else if (c === "÷" || c === "/") {
        tokens.push({ tipo: "operador", simbolo: "÷" });
        pos++;
      } else if (c === "!" || c === "%" || c === "²" || c === "³") {
        tokens.push({ tipo: "posfixo", simbolo: c });
        pos++;
      } else if (texto.startsWith("⁻¹", pos)) {
        tokens.push({ tipo: "posfixo", simbolo: "⁻¹" });
        pos += 2;
      } else tokens.push(lerIdentificador());
    }
    return tokens;
  }

  /** Parênteses que faltam fechar no fim da expressão. */
  function fechamentoAutomatico(tokens) {
    let profundidade = 0;
    for (const t of tokens) {
      if (t.tipo === "(" || t.tipo === "funcao") profundidade++;
      if (t.tipo === ")") {
        profundidade--;
        if (profundidade < 0) falhar("sintaxe");
      }
    }
    return Array.from({ length: profundidade }, () => ({ tipo: ")" }));
  }

  /** Avalia a expressão no modo de ângulo (DEG, RAD ou GRAD) com o valor de Ans. */
  function avaliarExpressao(expressao, modoAngulo = "DEG", ans = 0) {
    const meiaVolta = modoAngulo === "RAD" ? Math.PI : modoAngulo === "GRAD" ? 200 : 180;
    const paraRadianos = (x) => (x * Math.PI) / meiaVolta;
    const deRadianos = (r) => (r * meiaVolta) / Math.PI;

    /** true se x/meiaVolta está (quase) num inteiro diferente de zero. */
    function quaseMultiplo(x, deslocamento = 0) {
      const k = x / meiaVolta - deslocamento;
      const proximo = arredondarPar(k);
      if (proximo === 0 && deslocamento === 0) return false;
      return Math.abs(k - proximo) < 1e-12 * Math.max(1, Math.abs(k));
    }

    function aplicar(nome, x) {
      const limitar = (v) => Math.min(1, Math.max(-1, v));
      let r;
      switch (nome) {
        case "sin":
          r = x === 0 || quaseMultiplo(x) ? 0 : Math.sin(paraRadianos(x));
          break;
        case "cos":
          r = quaseMultiplo(x, 0.5) ? 0 : Math.cos(paraRadianos(x));
          break;
        case "tan":
          if (quaseMultiplo(x, 0.5)) falhar("dominio");
          r = x === 0 || quaseMultiplo(x) ? 0 : Math.tan(paraRadianos(x));
          break;
        case "sin⁻¹":
          if (Math.abs(x) > 1 + 1e-12) falhar("dominio");
          r = deRadianos(Math.asin(limitar(x)));
          break;
        case "cos⁻¹":
          if (Math.abs(x) > 1 + 1e-12) falhar("dominio");
          r = deRadianos(Math.acos(limitar(x)));
          break;
        case "tan⁻¹":
          r = deRadianos(Math.atan(x));
          break;
        case "sinh":
          r = Math.sinh(x);
          break;
        case "cosh":
          r = Math.cosh(x);
          break;
        case "tanh":
          r = Math.tanh(x);
          break;
        case "sinh⁻¹":
          r = Math.asinh(x);
          break;
        case "cosh⁻¹":
          if (x < 1) falhar("dominio");
          r = Math.acosh(x);
          break;
        case "tanh⁻¹":
          if (Math.abs(x) >= 1) falhar("dominio");
          r = Math.atanh(x);
          break;
        case "log":
          if (x <= 0) falhar("dominio");
          r = Math.log10(x);
          break;
        case "ln":
          if (x <= 0) falhar("dominio");
          r = Math.log(x);
          break;
        case "log₂":
          if (x <= 0) falhar("dominio");
          r = Math.log2(x);
          break;
        case "√":
          if (x < 0) falhar("dominio");
          r = Math.sqrt(x);
          break;
        case "∛":
          r = Math.cbrt(x);
          break;
        case "abs":
          r = Math.abs(x);
          break;
        case "exp":
          r = Math.exp(x);
          break;
        default:
          falhar("sintaxe");
      }
      return finito(r);
    }

    function potencia(base, expoente) {
      if (base === 0 && expoente < 0) falhar("divisao");
      return finito(base ** expoente);
    }

    function inteiroNaoNegativo(x) {
      if (x < 0 || Math.abs(x - arredondarPar(x)) > 1e-9) falhar("dominio");
      return arredondarPar(x);
    }

    function fatorial(x) {
      const n = inteiroNaoNegativo(x);
      if (n > 170) falhar("estouro");
      let r = 1;
      for (let i = 2; i <= n; i++) r *= i;
      return r;
    }

    // Arranjo e combinação: o laço para cedo quando já estourou (o resultado é o mesmo).
    function arranjos(nValor, rValor) {
      const n = inteiroNaoNegativo(nValor);
      const r = inteiroNaoNegativo(rValor);
      if (r > n) falhar("dominio");
      let resultado = 1;
      for (let i = 0; i < r && Number.isFinite(resultado); i++) resultado *= n - i;
      return finito(resultado);
    }

    function combinacoes(nValor, rValor) {
      const n = inteiroNaoNegativo(nValor);
      let r = inteiroNaoNegativo(rValor);
      if (r > n) falhar("dominio");
      r = Math.min(r, n - r);
      let resultado = 1;
      for (let i = 1; i <= r && Number.isFinite(resultado); i++) resultado = (resultado * (n - r + i)) / i;
      return finito(resultado < 1e15 ? arredondarPar(resultado) : resultado);
    }

    const tokens = tokenizar(expressao);
    if (!tokens.length) falhar("sintaxe");
    const lista = [...tokens, ...fechamentoAutomatico(tokens)];
    let indice = 0;
    const olhar = () => lista[indice];
    const proximo = () => lista[indice++] ?? falhar("sintaxe");
    const ehOperador = (t, ...simbolos) => t !== undefined && t.tipo === "operador" && simbolos.includes(t.simbolo);
    const iniciaPrimario = (t) =>
      t !== undefined && (t.tipo === "numero" || t.tipo === "constante" || t.tipo === "funcao" || t.tipo === "(");

    // expr := termo (('+'|'−') termo)*
    function expressaoInteira() {
      let valor = termo();
      for (;;) {
        const t = olhar();
        if (!ehOperador(t, "+", "−")) return valor;
        indice++;
        const direita = termo();
        valor = finito(t.simbolo === "+" ? valor + direita : valor - direita);
      }
    }

    // termo := unario (('×'|'÷'|'mod') unario | unario implícito)*
    function termo() {
      let valor = unario();
      for (;;) {
        const t = olhar();
        if (ehOperador(t, "×")) {
          indice++;
          valor = finito(valor * unario());
        } else if (ehOperador(t, "÷")) {
          indice++;
          const divisor = unario();
          if (divisor === 0) falhar("divisao");
          valor = finito(valor / divisor);
        } else if (ehOperador(t, "mod")) {
          indice++;
          const divisor = unario();
          if (divisor === 0) falhar("divisao");
          valor = finito(valor - divisor * Math.floor(valor / divisor));
        } else if (iniciaPrimario(t)) {
          valor = finito(valor * unario());
        } else {
          return valor;
        }
      }
    }

    // unario := ('−'|'+') unario | combinacao
    function unario() {
      const t = olhar();
      if (ehOperador(t, "−", "+")) {
        indice++;
        const v = unario();
        return t.simbolo === "−" ? -v : v;
      }
      return combinacao();
    }

    // combinacao := potencia (('P'|'C') potencia)*
    function combinacao() {
      let valor = potenciaExpr();
      for (;;) {
        const t = olhar();
        if (!ehOperador(t, "P", "C")) return valor;
        indice++;
        const r = potenciaExpr();
        valor = t.simbolo === "P" ? arranjos(valor, r) : combinacoes(valor, r);
      }
    }

    // potencia := posfixo ('^' unario)?   (associativa à direita)
    function potenciaExpr() {
      const base = posfixo();
      if (ehOperador(olhar(), "^")) {
        indice++;
        return potencia(base, unario());
      }
      return base;
    }

    // posfixo := primario ('!' | '%' | '²' | '³' | '⁻¹')*
    function posfixo() {
      let valor = primario();
      for (;;) {
        const t = olhar();
        if (t === undefined || t.tipo !== "posfixo") return valor;
        indice++;
        if (t.simbolo === "!") valor = fatorial(valor);
        else if (t.simbolo === "%") valor /= 100;
        else if (t.simbolo === "²") valor = finito(valor * valor);
        else if (t.simbolo === "³") valor = finito(valor * valor * valor);
        else {
          if (valor === 0) falhar("divisao");
          valor = 1 / valor;
        }
      }
    }

    function primario() {
      const t = proximo();
      if (t.tipo === "numero") return t.valor;
      if (t.tipo === "constante") return t.nome === "π" ? Math.PI : t.nome === "e" ? Math.E : ans;
      if (t.tipo === "(" || t.tipo === "funcao") {
        if (olhar() !== undefined && olhar().tipo === ")") falhar("sintaxe");
        const v = expressaoInteira();
        if (proximo().tipo !== ")") falhar("sintaxe");
        return t.tipo === "(" ? v : aplicar(t.nome, v);
      }
      return falhar("sintaxe");
    }

    const valor = expressaoInteira();
    if (indice < lista.length) falhar("sintaxe");
    return limparRuido(finito(valor));
  }

  /** { ok: true, valor } ou { ok: false, tipo }. */
  function tentarAvaliar(expressao, modoAngulo, ans) {
    try {
      return { ok: true, valor: avaliarExpressao(expressao, modoAngulo, ans) };
    } catch (erro) {
      if (erro instanceof ErroCientifico) return { ok: false, tipo: erro.tipo };
      throw erro;
    }
  }

  // =====================================================================
  // Edição da expressão científica
  // =====================================================================

  const MAX_PECAS = 300;
  const BINARIOS = new Set(["+", "−", "×", "÷", "^", "mod", "P", "C"]);
  const MODOS = ["DEG", "RAD", "GRAD"];

  /**
   * A expressão é uma lista de "peças" (cada tecla gera uma), o que permite apagar "sin(" de uma
   * vez. avaliado: true depois do "=", quando a próxima tecla decide se continua ou recomeça.
   */
  function estadoCientifico(parcial = {}) {
    return {
      pecas: [],
      modoAngulo: "DEG",
      ans: 0,
      temAns: false,
      avaliado: false,
      resultado: null,
      erro: null,
      historico: [],
      ...parcial,
    };
  }

  const expressaoDe = (e) => e.pecas.join("");

  /** Parênteses ainda abertos (fechados automaticamente ao calcular). */
  function parentesesAbertos(pecas) {
    let total = 0;
    for (const peca of pecas) {
      for (const c of peca) {
        if (c === "(") total++;
        else if (c === ")") total--;
      }
    }
    return Math.max(0, total);
  }

  const terminaAbrindo = (peca) => peca.endsWith("(");

  /** Peças do número sendo digitado no fim da expressão. */
  function numeroAtual(pecas) {
    let texto = "";
    for (let i = pecas.length - 1; i >= 0; i--) {
      const p = pecas[i];
      const ehPecaDeNumero =
        (p.length === 1 && (ehDigito(p) || p === "." || p === "E")) || (p === "−" && pecas[i - 1] === "E");
      if (!ehPecaDeNumero) break;
      texto = p + texto;
    }
    return texto;
  }

  function inserirOperador(s, op) {
    const pecas = s.pecas;
    const fim = ultimo(pecas);
    if (!pecas.length) return op === "−" ? [op] : [s.temAns ? "Ans" : "0", op];
    // Sinal do expoente em notação científica
    if (fim === "E" || terminaAbrindo(fim)) return op === "−" ? [...pecas, op] : pecas;
    if (BINARIOS.has(fim)) {
      const penultimo = pecas[pecas.length - 2];
      const menosUnario =
        penultimo === undefined || BINARIOS.has(penultimo) || terminaAbrindo(penultimo) || penultimo === "E";
      if (menosUnario) {
        // "5×−" seguido de "+" troca os dois operadores; "(−" ignora outro operador.
        if (op === "−") return pecas;
        if (penultimo !== undefined && BINARIOS.has(penultimo)) return [...pecas.slice(0, -2), op];
        return pecas;
      }
      // Permite número negativo depois de ×, ÷, ^ etc. (5 × −3)
      if (op === "−" && fim !== "−" && fim !== "+") return [...pecas, op];
      // Operador repetido só substitui o anterior
      return [...pecas.slice(0, -1), op];
    }
    return [...pecas, op];
  }

  /**
   * Teclas: { tipo: "digito", valor }, { tipo: "ponto" }, { tipo: "operador", valor },
   * { tipo: "posfixo", valor }, { tipo: "funcao", valor }, { tipo: "constante", valor },
   * { tipo: "abre" }, { tipo: "fecha" } e { tipo: "expoente" } (EE).
   */
  function pressionar(estado, tecla) {
    let s = estado;
    if (s.avaliado) {
      const continua = tecla.tipo === "operador" || tecla.tipo === "posfixo";
      s = { ...s, pecas: continua && s.temAns ? ["Ans"] : [], avaliado: false, resultado: null, erro: null };
      if (continua && !s.pecas.length && tecla.tipo === "operador" && tecla.valor !== "−") return s;
      if (continua && !s.pecas.length && tecla.tipo === "posfixo") return s;
    }
    if (s.pecas.length >= MAX_PECAS) return s;
    const pecas = s.pecas;
    const fim = ultimo(pecas);
    let novas;
    switch (tecla.tipo) {
      case "digito":
        novas = [...pecas, tecla.valor];
        break;
      case "ponto": {
        const numero = numeroAtual(pecas);
        if (numero.includes(".") || numero.includes("E")) novas = pecas;
        else if (!numero) novas = [...pecas, "0", "."];
        else novas = [...pecas, "."];
        break;
      }
      case "expoente": {
        const numero = numeroAtual(pecas);
        const podeExpoente = numero && fim !== undefined && ehDigito(fim[fim.length - 1]) && !numero.includes("E");
        novas = podeExpoente ? [...pecas, "E"] : pecas;
        break;
      }
      case "operador":
        novas = inserirOperador(s, tecla.valor);
        break;
      case "posfixo":
        if (!pecas.length) novas = [s.temAns ? "Ans" : "0", tecla.valor];
        else if (BINARIOS.has(fim) || terminaAbrindo(fim) || fim === "E") novas = pecas;
        else novas = [...pecas, tecla.valor];
        break;
      case "funcao":
        // "2" seguido de 10ˣ viraria "210^(": aqui entra um × (no app, a conta saía errada)
        if (tecla.valor === "10^" && fim !== undefined && (/[0-9.]$/.test(fim) || fim === "E")) {
          novas = [...pecas, "×", "10^("];
        } else {
          novas = [...pecas, `${tecla.valor}(`];
        }
        break;
      case "constante":
        novas = [...pecas, tecla.valor];
        break;
      case "abre":
        novas = [...pecas, "("];
        break;
      case "fecha":
        if (parentesesAbertos(pecas) <= 0) novas = pecas;
        else if (fim === undefined || BINARIOS.has(fim) || terminaAbrindo(fim) || fim === "E") novas = pecas;
        else novas = [...pecas, ")"];
        break;
      default:
        novas = pecas;
    }
    return { ...s, pecas: novas };
  }

  function apagarCientifica(e) {
    if (e.avaliado) return { ...e, pecas: e.pecas.slice(0, -1), avaliado: false, resultado: null, erro: null };
    return { ...e, pecas: e.pecas.slice(0, -1) };
  }

  const limparCientifica = (e) => ({ ...e, pecas: [], avaliado: false, resultado: null, erro: null });
  const limparHistoricoCientifica = (e) => ({ ...e, historico: [] });

  function definirModo(e, modo) {
    if (e.avaliado) return { ...e, modoAngulo: modo, avaliado: false, resultado: null, erro: null };
    return { ...e, modoAngulo: modo };
  }

  const proximoModo = (modo) => MODOS[(MODOS.indexOf(modo) + 1) % MODOS.length];

  /** "=": calcula a expressão, fechando os parênteses que faltam. */
  function igualCientifica(e) {
    if (!e.pecas.length) return e;
    if (e.avaliado && e.resultado !== null) return e;
    const fechadas = [...e.pecas, ...Array(parentesesAbertos(e.pecas)).fill(")")];
    const r = tentarAvaliar(fechadas.join(""), e.modoAngulo, e.ans);
    if (!r.ok) return { ...e, avaliado: true, resultado: null, erro: r.tipo };
    return {
      ...e,
      pecas: fechadas,
      avaliado: true,
      resultado: r.valor,
      erro: null,
      ans: r.valor,
      temAns: true,
      historico: [{ pecas: fechadas, valor: r.valor }, ...e.historico].slice(0, MAX_HISTORICO),
    };
  }

  /** Prévia ao vivo: só quando há alguma operação, não apenas um número. */
  function previaCientifica(e) {
    if (e.avaliado || !e.pecas.length) return null;
    if (e.pecas.every((p) => p.length === 1 && (ehDigito(p) || p === "."))) return null;
    const r = tentarAvaliar(expressaoDe(e), e.modoAngulo, e.ans);
    return r.ok ? r.valor : null;
  }

  /** Converte um número em peças digitáveis (notação "E" para valores extremos). */
  function pecasDoValor(valor) {
    const v = limparRuido(valor);
    const decimal = Decimal.deNumero(v).arredondar(15, true).semZeros();
    const extremo = v !== 0 && (Math.abs(v) >= 1e15 || Math.abs(v) < 1e-6);
    const texto = extremo ? decimal.paraTextoJava().replace("E+", "E") : decimal.paraTexto();
    return [...texto].map((c) => (c === "-" ? "−" : c));
  }

  /** Insere um valor (do histórico) na expressão, com × se vier logo depois de um número. */
  function inserirValor(estado, valor) {
    let s = estado;
    if (s.avaliado) s = { ...s, pecas: [], avaliado: false, resultado: null, erro: null };
    const fim = ultimo(s.pecas);
    const prefixo = fim !== undefined && (ehDigito(fim[fim.length - 1]) || fim === "." || fim === "E") ? ["×"] : [];
    return { ...s, pecas: [...s.pecas, ...prefixo, ...pecasDoValor(valor)] };
  }

  /** Carrega uma expressão do histórico para edição. */
  const carregarExpressao = (e, pecas) => ({ ...e, pecas: [...pecas], avaliado: false, resultado: null, erro: null });

  const ERROS_CIENTIFICA = {
    sintaxe: "Erro de sintaxe",
    dominio: "Erro de domínio: valor fora do permitido",
    divisao: "Divisão por zero",
    estouro: "Resultado grande demais",
  };

  /** Expressão para exibir: ponto decimal vira vírgula. */
  const expressaoVisor = (texto) => texto.replace(/\./g, ",");

  const Cientifica = {
    MAX_PECAS,
    MAX_HISTORICO,
    MODOS,
    ERROS: ERROS_CIENTIFICA,
    estado: estadoCientifico,
    expressao: expressaoDe,
    parentesesAbertos,
    pressionar,
    apagar: apagarCientifica,
    limpar: limparCientifica,
    limparHistorico: limparHistoricoCientifica,
    definirModo,
    proximoModo,
    igual: igualCientifica,
    previa: previaCientifica,
    inserirValor,
    carregarExpressao,
    pecasDoValor,
    expressaoVisor,
    formatar: (valor) => M.inteligente(valor, 12),
  };

  const Avaliador = { avaliar: avaliarExpressao, tentar: tentarAvaliar, limparRuido, ErroCientifico };

  return { Basica, Avaliador, Cientifica };
})();

if (typeof module === "object") module.exports = Expressao;
