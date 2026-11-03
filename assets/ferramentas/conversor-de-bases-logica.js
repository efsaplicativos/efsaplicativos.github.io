"use strict";
/*
 * Conversor de bases numéricas (2 a 36) com precisão arbitrária (BigInt), parte fracionária
 * exata, agrupamento e complemento de dois; e conversão de texto ↔ bytes UTF-8.
 * Portado de core/bases/BaseConverter.kt e TextCodec.kt; textos de
 * ui/tools/bases/BasesScreen.kt (Calculadora Multifunção).
 */
const ConversorDeBases = (() => {
  const BASE_MIN = 2;
  const BASE_MAX = 36;
  const MAX_CASAS_FRACAO = 20;
  const DIGITOS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  const valorDigito = (c) => DIGITOS.indexOf(c.toUpperCase());

  function mdc(a, b) {
    let x = a < 0n ? -a : a;
    let y = b < 0n ? -b : b;
    while (y !== 0n) [x, y] = [y, x % y];
    return x;
  }

  function validarBase(base) {
    if (!Number.isInteger(base) || base < BASE_MIN || base > BASE_MAX) throw new RangeError(`Base inválida: ${base}`);
  }

  /** Inteiro não negativo escrito na base (dígitos já validados). */
  function inteiroDaBase(texto, base) {
    const b = BigInt(base);
    let valor = 0n;
    for (const c of texto) valor = valor * b + BigInt(valorDigito(c));
    return valor;
  }

  /**
   * Interpreta o texto na base. Aceita sinal, separador fracionário ("." ou ","),
   * maiúsculas/minúsculas e espaços/sublinhados como agrupadores.
   * Devolve null se o texto for vazio ou tiver dígitos inválidos para a base.
   * Resultado: { negativo, inteiro (BigInt), numerador, denominador } com 0 ≤ fração < 1.
   */
  function ler(entrada, base) {
    validarBase(base);
    let texto = String(entrada ?? "")
      .trim()
      .replace(/[ _  ]/g, "")
      .toUpperCase();
    if (!texto) return null;
    let negativo = false;
    if (texto.startsWith("-") || texto.startsWith("−")) {
      negativo = true;
      texto = texto.slice(1);
    } else if (texto.startsWith("+")) {
      texto = texto.slice(1);
    }
    const partes = texto.replace(/,/g, ".").split(".");
    if (partes.length > 2) return null;
    const parteInteira = partes[0];
    const parteFracao = partes[1] ?? "";
    if (!parteInteira && !parteFracao) return null;
    for (const c of parteInteira + parteFracao) {
      const v = valorDigito(c);
      if (v < 0 || v >= base) return null;
    }
    const b = BigInt(base);
    const inteiro = parteInteira ? inteiroDaBase(parteInteira, base) : 0n;
    let numerador = 0n;
    let denominador = 1n;
    for (const c of parteFracao) {
      numerador = numerador * b + BigInt(valorDigito(c));
      denominador *= b;
    }
    const divisor = mdc(numerador, denominador);
    if (divisor !== 0n && divisor !== 1n) {
      numerador /= divisor;
      denominador /= divisor;
    }
    const zero = inteiro === 0n && numerador === 0n;
    return { negativo: zero ? false : negativo, inteiro, numerador, denominador };
  }

  const temFracao = (n) => n.numerador !== 0n;
  const inteiroComSinal = (n) => (n.negativo ? -n.inteiro : n.inteiro);

  /** Escreve o número na base, com até maxCasas dígitos fracionários. */
  function paraDigitos(numero, base, maxCasas = MAX_CASAS_FRACAO) {
    validarBase(base);
    const b = BigInt(base);
    const digitosInteiros = numero.inteiro.toString(base).toUpperCase();
    let fracao = "";
    let numerador = numero.numerador;
    while (numerador !== 0n && fracao.length < maxCasas) {
      const produto = numerador * b;
      fracao += DIGITOS[Number(produto / numero.denominador)];
      numerador = produto % numero.denominador;
    }
    const zero = numero.inteiro === 0n && numero.numerador === 0n;
    return {
      negativo: numero.negativo && !zero,
      inteiros: digitosInteiros,
      fracao,
      truncado: numerador !== 0n,
    };
  }

  /** Forma simples: "-1010.101". */
  const simples = (d) => `${d.negativo ? "-" : ""}${d.inteiros}${d.fracao ? `.${d.fracao}` : ""}`;

  /** Atalho para ler + paraDigitos. */
  function converter(entrada, deBase, paraBase) {
    const n = ler(entrada, deBase);
    return n === null ? null : simples(paraDigitos(n, paraBase));
  }

  function agruparDaDireita(texto, tamanho, separador) {
    if (tamanho <= 0 || texto.length <= tamanho) return texto;
    const primeiro = texto.length % tamanho;
    const blocos = [];
    if (primeiro > 0) blocos.push(texto.slice(0, primeiro));
    for (let i = primeiro; i < texto.length; i += tamanho) blocos.push(texto.slice(i, i + tamanho));
    return blocos.join(separador);
  }

  /**
   * Agrupa dígitos para leitura: a parte inteira em blocos a partir da direita e a
   * fracionária a partir da esquerda (ex.: 1101 0110.1010 1).
   */
  function agrupar(d, tamanho, separador = " ") {
    let texto = (d.negativo ? "-" : "") + agruparDaDireita(d.inteiros, tamanho, separador);
    if (d.fracao) {
      const blocos = [];
      for (let i = 0; i < d.fracao.length; i += tamanho) blocos.push(d.fracao.slice(i, i + tamanho));
      texto += `.${blocos.join(separador)}`;
      if (d.truncado) texto += "…";
    }
    return texto;
  }

  /**
   * Complemento de dois em bits, ou null se o valor não couber
   * (faixa com sinal: −2^(bits−1) … 2^(bits−1) − 1). Só para inteiros (BigInt).
   */
  function complementoDeDois(valor, bits) {
    const min = -(1n << BigInt(bits - 1));
    const max = (1n << BigInt(bits - 1)) - 1n;
    if (valor < min || valor > max) return null;
    const modulo = 1n << BigInt(bits);
    return ((valor % modulo) + modulo) % modulo;
  }

  const binarioComZeros = (valor, bits) => valor.toString(2).padStart(bits, "0");
  const hexComZeros = (valor, bits) => valor.toString(16).toUpperCase().padStart(bits / 4, "0");

  /** Quantidade de bits do inteiro não negativo (0 para zero), como BigInteger.bitLength. */
  const quantidadeDeBits = (v) => (v === 0n ? 0 : v.toString(2).length);
  /** Bits com valor 1, como BigInteger.bitCount para valores não negativos. */
  const bitsLigados = (v) => [...v.toString(2)].filter((c) => c === "1").length;

  // ---------- Texto ↔ bytes (TextCodec.kt) ----------

  const FORMATOS = {
    binario: { base: 2, largura: 8 },
    hexadecimal: { base: 16, largura: 2 },
    decimal: { base: 10, largura: 3 },
  };

  const codificador = new TextEncoder();

  /** Texto → bytes UTF-8 formatados e separados por espaço. */
  function codificar(texto, formato) {
    const f = FORMATOS[formato];
    return [...codificador.encode(texto)]
      .map((byte) => (formato === "decimal" ? String(byte) : byte.toString(f.base).toUpperCase().padStart(f.largura, "0")))
      .join(" ");
  }

  const contarBytes = (texto) => codificador.encode(texto).length;

  /** Como String.toIntOrNull(radix) do Kotlin: sinal opcional e dígitos da base. */
  function inteiroOuNull(token, base) {
    let texto = token;
    let sinal = 1;
    if (texto.length > 1 && (texto[0] === "-" || texto[0] === "+")) {
      sinal = texto[0] === "-" ? -1 : 1;
      texto = texto.slice(1);
    }
    if (!texto) return null;
    let valor = 0;
    for (const c of texto) {
      const d = valorDigito(c);
      if (d < 0 || d >= base) return null;
      valor = valor * base + d;
      if (valor > 2147483647) return null;
    }
    return sinal * valor;
  }

  /**
   * Códigos → texto. Aceita bytes separados por espaços, vírgulas ou quebras de linha. Em
   * binário e hexadecimal, também aceita a sequência contínua (ex.: "48656C6C6F").
   * Prefixos "0x"/"0b" são ignorados.
   * Resultado: { tipo: "ok", texto, bytes } | { tipo: "codigoInvalido", codigo } | { tipo: "utf8Invalido" } | { tipo: "vazio" }.
   */
  function decodificar(entrada, formato) {
    const f = FORMATOS[formato];
    const limpo = String(entrada ?? "").trim();
    if (!limpo) return { tipo: "vazio" };
    // Em hexadecimal, "0B" é um byte válido (11), então ali só "0x" conta como prefixo
    // (no app, "0B" e "0x0B" viravam código vazio).
    const prefixos = formato === "hexadecimal" ? ["0x", "0X"] : ["0x", "0X", "0b", "0B"];
    const semPrefixo = (t) => {
      let s = t;
      for (const prefixo of prefixos) if (s.startsWith(prefixo)) s = s.slice(prefixo.length);
      return s;
    };
    let tokens = limpo
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map(semPrefixo);
    if (tokens.length === 1 && formato !== "decimal" && tokens[0].length > f.largura && tokens[0].length % f.largura === 0) {
      const unico = tokens[0];
      tokens = [];
      for (let i = 0; i < unico.length; i += f.largura) tokens.push(unico.slice(i, i + f.largura));
    }
    const bytes = new Uint8Array(tokens.length);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const valor = inteiroOuNull(token, f.base);
      if (valor === null || valor < 0 || valor > 255 || token.length > f.largura) return { tipo: "codigoInvalido", codigo: token };
      bytes[i] = valor;
    }
    try {
      // ignoreBOM: mantém um BOM no começo, como o decodificador do app
      const texto = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      return { tipo: "ok", texto, bytes: bytes.length };
    } catch (erro) {
      return { tipo: "utf8Invalido" };
    }
  }

  // ---------- Textos da tela ----------

  function nomeBase(base) {
    return { 2: "Binário (2)", 8: "Octal (8)", 10: "Decimal (10)", 16: "Hexadecimal (16)" }[base] || `Base ${base}`;
  }

  /** Base personalizada digitada: número inteiro de 2 a 36, ou null. */
  function lerBasePersonalizada(texto) {
    const t = String(texto ?? "").trim();
    if (!/^[+]?\d+$/.test(t)) return null;
    const v = Number(t);
    return v >= BASE_MIN && v <= BASE_MAX ? v : null;
  }

  /** Conversões mostradas: 2, 8, 10 e 16, mais a base de entrada se for outra. */
  function conversoes(numero, base) {
    const destinos = [2, 8, 10, 16];
    if (!destinos.includes(base)) destinos.push(base);
    return destinos.map((destino) => {
      const d = paraDigitos(numero, destino);
      return {
        base: destino,
        nome: nomeBase(destino),
        // Binário/hex em blocos de 4 dígitos; decimal por milhar
        agrupado: agrupar(d, destino === 10 ? 3 : 4),
        simples: simples(d) + (d.truncado ? "…" : ""),
        truncado: d.truncado,
      };
    });
  }

  const LARGURAS = [8, 16, 32, 64];

  /** Linhas do complemento de dois (só para inteiros que cabem). */
  function linhasComplemento(numero) {
    const valor = inteiroComSinal(numero);
    return LARGURAS.map((bits) => {
      const codificado = complementoDeDois(valor, bits);
      if (codificado === null) return null;
      const binario = binarioComZeros(codificado, bits);
      return {
        bits,
        binario,
        binarioAgrupado: agruparDaDireita(binario, 4, " "),
        hexAgrupado: `0x${agruparDaDireita(hexComZeros(codificado, bits), 4, " ")}`,
      };
    }).filter(Boolean);
  }

  /** Converte o texto da aba Texto: { tipo: "vazio" } | { tipo: "erro", mensagem } | { tipo: "ok", texto, bytes }. */
  function converterTexto(entrada, direcao, formato) {
    if (!entrada) return { tipo: "vazio" };
    if (direcao === "codificar") return { tipo: "ok", texto: codificar(entrada, formato), bytes: contarBytes(entrada) };
    const r = decodificar(entrada, formato);
    if (r.tipo === "vazio") return r;
    if (r.tipo === "codigoInvalido") return { tipo: "erro", mensagem: `Código inválido: ${r.codigo}` };
    if (r.tipo === "utf8Invalido") return { tipo: "erro", mensagem: "Os bytes não formam um texto UTF-8 válido." };
    return { tipo: "ok", texto: r.texto, bytes: r.bytes };
  }

  const textoBytes = (n) => `${n.toLocaleString("pt-BR")} ${n === 1 ? "byte" : "bytes"} (UTF-8)`;

  return {
    BASE_MIN,
    BASE_MAX,
    MAX_CASAS_FRACAO,
    ler,
    temFracao,
    inteiroComSinal,
    paraDigitos,
    simples,
    converter,
    agrupar,
    agruparDaDireita,
    complementoDeDois,
    binarioComZeros,
    hexComZeros,
    quantidadeDeBits,
    bitsLigados,
    FORMATOS,
    codificar,
    decodificar,
    nomeBase,
    lerBasePersonalizada,
    conversoes,
    linhasComplemento,
    converterTexto,
    textoBytes,
  };
})();
if (typeof module === "object") module.exports = ConversorDeBases;
