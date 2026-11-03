"use strict";
/*
 * Lógica da página de Lei de Ohm e eletrônica, sem DOM.
 * Portada de core/ohm/Electronics.kt da Calculadora Multifunção: Lei de Ohm com qualquer
 * par de grandezas, resistores em série e paralelo, divisor de tensão, código de cores
 * (IEC 60062) e prefixos SI. Formatação de engenharia como formatEngineering (OhmScreen.kt).
 */
const LogicaOhm = (() => {
  const N = typeof Numeros === "object" ? Numeros : require("../numeros.js");

  /** Prefixos SI em ordem crescente. */
  const PREFIXOS = {
    pico: { simbolo: "p", fator: 1e-12 },
    nano: { simbolo: "n", fator: 1e-9 },
    micro: { simbolo: "µ", fator: 1e-6 },
    mili: { simbolo: "m", fator: 1e-3 },
    nenhum: { simbolo: "", fator: 1 },
    quilo: { simbolo: "k", fator: 1e3 },
    mega: { simbolo: "M", fator: 1e6 },
    giga: { simbolo: "G", fator: 1e9 },
  };

  /** Grandezas, com os prefixos oferecidos nos campos (os mesmos do app). */
  const GRANDEZAS = {
    tensao: { simbolo: "V", unidade: "V", nome: "Tensão", prefixos: ["mili", "nenhum", "quilo"] },
    corrente: { simbolo: "I", unidade: "A", nome: "Corrente", prefixos: ["micro", "mili", "nenhum"] },
    resistencia: { simbolo: "R", unidade: "Ω", nome: "Resistência", prefixos: ["mili", "nenhum", "quilo", "mega"] },
    potencia: { simbolo: "P", unidade: "W", nome: "Potência", prefixos: ["mili", "nenhum", "quilo"] },
  };

  /** As 12 fórmulas da roda da Lei de Ohm, agrupadas pela grandeza calculada. */
  const FORMULAS = {
    V_IR: { alvo: "tensao", texto: "V = I·R" },
    V_PI: { alvo: "tensao", texto: "V = P / I" },
    V_RAIZ_PR: { alvo: "tensao", texto: "V = √(P·R)" },
    I_VR: { alvo: "corrente", texto: "I = V / R" },
    I_PV: { alvo: "corrente", texto: "I = P / V" },
    I_RAIZ_PR: { alvo: "corrente", texto: "I = √(P / R)" },
    R_VI: { alvo: "resistencia", texto: "R = V / I" },
    R_V2P: { alvo: "resistencia", texto: "R = V² / P" },
    R_PI2: { alvo: "resistencia", texto: "R = P / I²" },
    P_VI: { alvo: "potencia", texto: "P = V·I" },
    P_I2R: { alvo: "potencia", texto: "P = I²·R" },
    P_V2R: { alvo: "potencia", texto: "P = V² / R" },
  };

  /**
   * Resolve as duas grandezas desconhecidas a partir de exatamente duas conhecidas (em V, A,
   * Ω e W; null = vazio). Devolve { valores, usadas } ou { erro } com "faltam", "excesso",
   * "divisao-por-zero" ou "invalido".
   */
  function resolver(v, i, r, p) {
    const conhecidas = [v, i, r, p].filter((x) => x !== null).length;
    if (conhecidas < 2) return { erro: "faltam" };
    if (conhecidas > 2) return { erro: "excesso" };
    if ((r !== null && r < 0) || (p !== null && p < 0)) return { erro: "invalido" };
    const falha = (erro) => ({ erro });
    const sucesso = (tensao, corrente, resistencia, potencia, ...usadas) => {
      if (![tensao, corrente, resistencia, potencia].every(Number.isFinite)) return falha("invalido");
      return { valores: { tensao, corrente, resistencia, potencia }, usadas };
    };
    if (v !== null && i !== null) {
      return i === 0 ? falha("divisao-por-zero") : sucesso(v, i, v / i, v * i, "R_VI", "P_VI");
    }
    if (v !== null && r !== null) {
      return r === 0 ? falha("divisao-por-zero") : sucesso(v, v / r, r, (v * v) / r, "I_VR", "P_V2R");
    }
    if (i !== null && r !== null) return sucesso(i * r, i, r, i * i * r, "V_IR", "P_I2R");
    if (v !== null && p !== null) {
      return v === 0 || p === 0 ? falha("divisao-por-zero") : sucesso(v, p / v, (v * v) / p, p, "I_PV", "R_V2P");
    }
    if (i !== null && p !== null) {
      return i === 0 ? falha("divisao-por-zero") : sucesso(p / i, i, p / (i * i), p, "V_PI", "R_PI2");
    }
    if (r !== null && p !== null) {
      return r === 0
        ? falha("divisao-por-zero")
        : sucesso(Math.sqrt(p * r), Math.sqrt(p / r), r, p, "V_RAIZ_PR", "I_RAIZ_PR");
    }
    return falha("faltam");
  }

  /** Resistência equivalente em série (soma); null sem resistores. */
  const serie = (valores) => (valores.length ? valores.reduce((a, b) => a + b, 0) : null);

  /** Em paralelo; um resistor de 0 Ω curto-circuita o conjunto. */
  function paralelo(valores) {
    if (!valores.length) return null;
    if (valores.some((x) => x === 0)) return 0;
    return 1 / valores.reduce((soma, x) => soma + 1 / x, 0);
  }

  /** Divisor de tensão: Vout = Vin · R2 / (R1 + R2). null para resistores inválidos. */
  function divisor(vin, r1, r2) {
    if (r1 < 0 || r2 < 0 || r1 + r2 <= 0) return null;
    const corrente = vin / (r1 + r2);
    return {
      vout: (vin * r2) / (r1 + r2),
      corrente,
      potenciaR1: corrente * corrente * r1,
      potenciaR2: corrente * corrente * r2,
      razao: r2 / (r1 + r2),
    };
  }

  /** Cores do código de resistores (IEC 60062); tolerância em %. */
  const CORES = [
    { id: "preto", nome: "Preto", digito: 0, multiplicador: 1, tolerancia: null, hex: "#000000" },
    { id: "marrom", nome: "Marrom", digito: 1, multiplicador: 10, tolerancia: 1, hex: "#795548" },
    { id: "vermelho", nome: "Vermelho", digito: 2, multiplicador: 100, tolerancia: 2, hex: "#e53935" },
    { id: "laranja", nome: "Laranja", digito: 3, multiplicador: 1e3, tolerancia: 0.05, hex: "#fb8c00" },
    { id: "amarelo", nome: "Amarelo", digito: 4, multiplicador: 1e4, tolerancia: 0.02, hex: "#fdd835" },
    { id: "verde", nome: "Verde", digito: 5, multiplicador: 1e5, tolerancia: 0.5, hex: "#43a047" },
    { id: "azul", nome: "Azul", digito: 6, multiplicador: 1e6, tolerancia: 0.25, hex: "#1e88e5" },
    { id: "violeta", nome: "Violeta", digito: 7, multiplicador: 1e7, tolerancia: 0.1, hex: "#8e24aa" },
    { id: "cinza", nome: "Cinza", digito: 8, multiplicador: 1e8, tolerancia: 0.01, hex: "#9e9e9e" },
    { id: "branco", nome: "Branco", digito: 9, multiplicador: 1e9, tolerancia: null, hex: "#ffffff" },
    { id: "dourado", nome: "Dourado", digito: null, multiplicador: 0.1, tolerancia: 5, hex: "#d4af37" },
    { id: "prateado", nome: "Prateado", digito: null, multiplicador: 0.01, tolerancia: 10, hex: "#c0c0c0" },
    { id: "sem-faixa", nome: "Sem faixa", digito: null, multiplicador: null, tolerancia: 20, hex: null },
  ];
  const corPorId = new Map(CORES.map((c) => [c.id, c]));
  const cor = (id) => corPorId.get(id) || null;
  const CORES_DIGITO = CORES.filter((c) => c.digito !== null);
  const CORES_MULTIPLICADOR = CORES.filter((c) => c.multiplicador !== null);
  const CORES_TOLERANCIA = CORES.filter((c) => c.tolerancia !== null);

  /**
   * Resistor de 4 faixas (2 dígitos) ou 5 faixas (3 dígitos): ids das cores dos dígitos,
   * do multiplicador e da tolerância. null se alguma cor não servir para a posição.
   */
  function decodificar(digitos, multiplicador, tolerancia) {
    const cores = digitos.map(cor);
    if (cores.length < 2 || cores.length > 3 || cores.some((c) => !c || c.digito === null)) return null;
    const mult = cor(multiplicador)?.multiplicador ?? null;
    const tol = cor(tolerancia)?.tolerancia ?? null;
    if (mult === null || tol === null) return null;
    const significativos = cores.reduce((acc, c) => acc * 10 + c.digito, 0);
    // Arredonda para tirar o ruído de ponto flutuante (47 × 0,1 = 4,7000000000000002).
    const ohms = Number((significativos * mult).toPrecision(12));
    const delta = (ohms * tol) / 100;
    return { ohms, significativos, multiplicador: mult, tolerancia: tol, minimo: ohms - delta, maximo: ohms + delta };
  }

  const ORDEM_PREFIXOS = Object.keys(PREFIXOS);

  /** Prefixo SI que deixa a mantissa entre 1 e 1000 (0,0047 A → 4,7 mA). */
  function engenharia(valor) {
    if (valor === 0 || !Number.isFinite(valor)) return { valor, prefixo: "nenhum" };
    const expoente = Math.floor(Math.log10(Math.abs(valor)) / 3) * 3;
    const prefixo =
      ORDEM_PREFIXOS.find((p) => Math.abs(Math.log10(PREFIXOS[p].fator) - expoente) < 1e-9) ||
      (expoente < 0 ? "pico" : "giga");
    return { valor: valor / PREFIXOS[prefixo].fator, prefixo };
  }

  const semZeroNegativo = (texto) => (/^-[0,.]*$/.test(texto) ? texto.slice(1) : texto);

  /** Até [significativos] algarismos significativos, como NumberFormatter.smart. */
  function inteligente(valor, significativos = 6) {
    if (Number.isNaN(valor)) return "—";
    if (!Number.isFinite(valor)) return valor > 0 ? "∞" : "-∞";
    if (valor === 0) return "0";
    const absoluto = Math.abs(valor);
    if (absoluto >= 1e15 || absoluto < 1e-6) {
      let expoente = Math.floor(Math.log10(absoluto));
      let mantissa = Number((valor / 10 ** expoente).toFixed(significativos - 1));
      if (Math.abs(mantissa) >= 10) {
        mantissa /= 10;
        expoente += 1;
      }
      const sobrescrito = [...String(expoente)].map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c] ?? "⁻").join("");
      return `${N.numero(mantissa, significativos - 1)} × 10${sobrescrito}`;
    }
    return semZeroNegativo(N.numero(Number(valor.toPrecision(significativos)), 12));
  }

  /** "4,7 mA", "100 kΩ", "12 V". */
  function formatar(valor, unidade) {
    const { valor: escalado, prefixo } = engenharia(valor);
    return `${inteligente(escalado, 6)} ${PREFIXOS[prefixo].simbolo}${unidade}`;
  }

  return {
    PREFIXOS,
    GRANDEZAS,
    FORMULAS,
    CORES,
    CORES_DIGITO,
    CORES_MULTIPLICADOR,
    CORES_TOLERANCIA,
    cor,
    resolver,
    serie,
    paralelo,
    divisor,
    decodificar,
    engenharia,
    inteligente,
    formatar,
  };
})();

if (typeof module === "object") module.exports = LogicaOhm;
