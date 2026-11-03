"use strict";
/*
 * Peças comuns às ferramentas de matemática (calculadoras, equações, estatística, geometria,
 * matrizes e bases), portadas da Calculadora Multifunção:
 * - Decimal: número decimal exato com BigInt, no papel do java.math.BigDecimal do app
 *   (arredondamento HALF_EVEN, como MathContext);
 * - ler/lerInteiro: util/NumberParsing.kt (parseDecimal aceita também "1,5e-3");
 * - numero/inteligente/cientifico: util/Formatters.kt (NumberFormatter.number, smart e scientific).
 */
const MatematicaComum = (() => {
  const NumerosBase = typeof Numeros === "object" ? Numeros : require("../numeros.js");

  const potencia10 = (n) => 10n ** BigInt(n);
  const digitos = (n) => (n < 0n ? -n : n).toString().length;

  /** Valor = inteiro × 10^(−escala). Imutável. */
  class Decimal {
    constructor(inteiro, escala = 0) {
      this.inteiro = inteiro;
      this.escala = escala;
    }

    /** Lê o formato interno, com ponto decimal: "-12.50", "0.", "1E100", "2e-3". */
    static de(texto) {
      const partes = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(String(texto).trim());
      if (!partes || (partes[2] === "" && !partes[3])) throw new SyntaxError(`Decimal inválido: ${texto}`);
      const fracao = partes[3] || "";
      let inteiro = BigInt((partes[2] || "0") + fracao);
      if (partes[1] === "-") inteiro = -inteiro;
      return new Decimal(inteiro, fracao.length - Number(partes[4] || 0));
    }

    /** Valor binário exato de um double, como new BigDecimal(double) no Java. */
    static deNumero(x) {
      if (!Number.isFinite(x)) throw new RangeError("Número não finito");
      if (x === 0) return new Decimal(0n, 0);
      const vista = new DataView(new ArrayBuffer(8));
      vista.setFloat64(0, x);
      const alto = vista.getUint32(0);
      const baixo = vista.getUint32(4);
      const bruto = (alto >>> 20) & 0x7ff;
      let mantissa = (BigInt(alto & 0xfffff) << 32n) | BigInt(baixo);
      let expoente2 = -1074;
      if (bruto !== 0) {
        mantissa |= 1n << 52n;
        expoente2 = bruto - 1075;
      }
      while ((mantissa & 1n) === 0n && expoente2 < 0) {
        mantissa >>= 1n;
        expoente2++;
      }
      const negativo = alto >>> 31 === 1;
      const valor = expoente2 >= 0 ? mantissa << BigInt(expoente2) : mantissa * 5n ** BigInt(-expoente2);
      return new Decimal(negativo ? -valor : valor, Math.max(0, -expoente2));
    }

    get sinal() {
      return this.inteiro > 0n ? 1 : this.inteiro < 0n ? -1 : 0;
    }

    negar() {
      return new Decimal(-this.inteiro, this.escala);
    }

    abs() {
      return this.inteiro < 0n ? this.negar() : this;
    }

    comparar(outro) {
      const [a, b] = alinhar(this, outro);
      return a < b ? -1 : a > b ? 1 : 0;
    }

    somar(outro, precisao) {
      const [a, b, escala] = alinhar(this, outro);
      return new Decimal(a + b, escala).arredondar(precisao);
    }

    subtrair(outro, precisao) {
      return this.somar(outro.negar(), precisao);
    }

    multiplicar(outro, precisao) {
      return new Decimal(this.inteiro * outro.inteiro, this.escala + outro.escala).arredondar(precisao);
    }

    /** Divisão com [precisao] algarismos significativos (HALF_EVEN), como divide(x, MathContext). */
    dividir(outro, precisao) {
      if (outro.inteiro === 0n) throw new DivisaoPorZero();
      if (this.inteiro === 0n) return new Decimal(0n, 0);
      const a = this.inteiro < 0n ? -this.inteiro : this.inteiro;
      const b = outro.inteiro < 0n ? -outro.inteiro : outro.inteiro;
      // Dígitos a mais no numerador garantem ao menos precisao + 1 dígitos no quociente.
      const extra = Math.max(0, precisao + digitos(b) - digitos(a) + 1);
      const numerador = a * potencia10(extra);
      const resultado = arredondarInteiro(
        numerador / b,
        this.escala - outro.escala + extra,
        precisao,
        numerador % b !== 0n,
      );
      return (this.inteiro < 0n) !== (outro.inteiro < 0n) ? resultado.negar() : resultado;
    }

    /**
     * Arredonda para [precisao] algarismos significativos: HALF_EVEN, ou HALF_UP com
     * [meioParaCima] (o padrão de new MathContext(n) no Java). Sem precisão, devolve igual.
     */
    arredondar(precisao, meioParaCima = false) {
      if (!precisao) return this;
      return arredondarInteiro(this.inteiro, this.escala, precisao, false, meioParaCima);
    }

    /** Arredonda para [casas] casas decimais (HALF_EVEN), como setScale. */
    comEscala(casas) {
      if (casas >= this.escala) {
        return new Decimal(this.inteiro * potencia10(casas - this.escala), casas);
      }
      const negativo = this.inteiro < 0n;
      const m = negativo ? -this.inteiro : this.inteiro;
      const divisor = potencia10(this.escala - casas);
      let q = m / divisor;
      const dobro = (m % divisor) * 2n;
      if (dobro > divisor || (dobro === divisor && (q & 1n) === 1n)) q += 1n;
      return new Decimal(negativo ? -q : q, casas);
    }

    /** Remove zeros à direita (stripTrailingZeros). */
    semZeros() {
      if (this.inteiro === 0n) return new Decimal(0n, 0);
      let inteiro = this.inteiro;
      let escala = this.escala;
      while (inteiro % 10n === 0n) {
        inteiro /= 10n;
        escala--;
      }
      return new Decimal(inteiro, escala);
    }

    /** Texto sem notação científica (toPlainString), com "." e "-". */
    paraTexto() {
      const negativo = this.inteiro < 0n;
      const corpo = (negativo ? -this.inteiro : this.inteiro).toString();
      if (this.escala <= 0) return (negativo ? "-" : "") + corpo + "0".repeat(-this.escala);
      const cheio = corpo.padStart(this.escala + 1, "0");
      return `${negativo ? "-" : ""}${cheio.slice(0, -this.escala)}.${cheio.slice(-this.escala)}`;
    }

    /** Texto como o BigDecimal.toString do Java (notação "1.5E-7" para expoentes extremos). */
    paraTextoJava() {
      const negativo = this.inteiro < 0n;
      const corpo = (negativo ? -this.inteiro : this.inteiro).toString();
      const ajustado = -this.escala + (corpo.length - 1);
      if (this.escala >= 0 && ajustado >= -6) return this.paraTexto();
      const mantissa = corpo.length > 1 ? `${corpo[0]}.${corpo.slice(1)}` : corpo;
      return `${negativo ? "-" : ""}${mantissa}E${ajustado >= 0 ? "+" : "-"}${Math.abs(ajustado)}`;
    }

    paraNumero() {
      return Number(`${this.inteiro}e${-this.escala}`);
    }
  }

  class DivisaoPorZero extends Error {
    constructor() {
      super("Divisão por zero");
      this.name = "DivisaoPorZero";
    }
  }

  function alinhar(a, b) {
    if (a.escala === b.escala) return [a.inteiro, b.inteiro, a.escala];
    if (a.escala > b.escala) return [a.inteiro, b.inteiro * potencia10(a.escala - b.escala), a.escala];
    return [a.inteiro * potencia10(b.escala - a.escala), b.inteiro, b.escala];
  }

  /** HALF_EVEN (ou HALF_UP) para [precisao] dígitos; [resto]: há dígitos não nulos já descartados. */
  function arredondarInteiro(inteiro, escala, precisao, resto, meioParaCima = false) {
    const negativo = inteiro < 0n;
    const m = negativo ? -inteiro : inteiro;
    const quantos = digitos(m);
    if (quantos <= precisao) return new Decimal(inteiro, escala);
    const corte = quantos - precisao;
    const divisor = potencia10(corte);
    let q = m / divisor;
    const dobro = (m % divisor) * 2n;
    if (dobro > divisor || (dobro === divisor && (resto || meioParaCima || (q & 1n) === 1n))) q += 1n;
    let novaEscala = escala - corte;
    if (digitos(q) > precisao) {
      q /= 10n;
      novaEscala--;
    }
    return new Decimal(negativo ? -q : q, novaEscala);
  }

  // ---------- Leitura ----------

  /**
   * Número digitado, com vírgula ou ponto decimal (regras de assets/numeros.js) e, como no
   * parseDecimal do app, notação científica opcional ("2,5E6", "1e-3"). Null se inválido.
   */
  function ler(entrada) {
    if (entrada === null || entrada === undefined) return null;
    let texto = String(entrada).trim().replace(/−/g, "-").replace(/[\s  ']/g, "");
    if (!texto) return null;
    const posicaoE = texto.search(/[eE]/);
    let expoente = null;
    if (posicaoE > 0) {
      expoente = texto.slice(posicaoE + 1);
      texto = texto.slice(0, posicaoE);
      if (!/^[+-]?\d+$/.test(expoente)) return null;
    }
    const base = NumerosBase.ler(texto);
    if (base === null || expoente === null) return base;
    const [mantissa, e1 = "0"] = String(base).split("e");
    const valor = Number(`${mantissa}e${Number(e1) + Number(expoente)}`);
    return Number.isFinite(valor) ? valor : null;
  }

  /** Versão inteira de [ler] (parseInteger): null se houver parte fracionária. */
  function lerInteiro(entrada) {
    const valor = ler(entrada);
    if (valor === null || !Number.isInteger(valor) || Math.abs(valor) > 9223372036854775807) return null;
    return valor;
  }

  // ---------- Formatação ----------

  const formatos = new Map();
  function formato(maximo, minimo, agrupar) {
    const chave = `${maximo}:${minimo}:${agrupar}`;
    if (!formatos.has(chave)) {
      formatos.set(
        chave,
        new Intl.NumberFormat("pt-BR", {
          minimumFractionDigits: minimo,
          maximumFractionDigits: maximo,
          useGrouping: agrupar,
        }),
      );
    }
    return formatos.get(chave);
  }

  /** "-0" vira "0" (fixNegativeZero). */
  function semZeroNegativo(texto) {
    const numeros = texto.replace(/\D/g, "");
    return numeros && /^0+$/.test(numeros) && /[-−]/.test(texto) ? texto.replace(/[-−]/g, "") : texto;
  }

  /** Até [maxCasas] casas (sem zeros à direita), arredondando para cima no empate (HALF_UP). */
  function numero(valor, maxCasas = 6, minCasas = 0, agrupar = true) {
    if (Number.isNaN(valor)) return "—";
    if (!Number.isFinite(valor)) return valor > 0 ? "∞" : "-∞";
    return semZeroNegativo(formato(maxCasas, Math.min(minCasas, maxCasas), agrupar).format(valor));
  }

  const SOBRESCRITOS = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "-": "⁻" };
  const sobrescrito = (n) => String(n).replace(/[0-9-]/g, (c) => SOBRESCRITOS[c]);

  /** Notação científica legível: 1,2345 × 10⁻⁷. */
  function cientifico(valor, casas = 6) {
    if (valor === 0) return "0";
    if (!Number.isFinite(valor)) return inteligente(valor);
    let expoente = Math.floor(Math.log10(Math.abs(valor)));
    let bruta = valor / 10 ** expoente;
    // Subnormais: 10^−324 já é 0 em double
    if (!Number.isFinite(bruta)) bruta = (valor * 1e300) / 10 ** (expoente + 300);
    let mantissa = Decimal.deNumero(bruta).comEscala(casas).paraNumero();
    // Corrige arredondamentos do tipo 9,9999999 → 10
    if (Math.abs(mantissa) >= 10) {
      mantissa /= 10;
      expoente += 1;
    }
    return `${numero(mantissa, casas, 0, false)} × 10${sobrescrito(expoente)}`;
  }

  /**
   * Formatação "inteligente" de conversores e calculadoras: até [significativos] algarismos
   * significativos e notação científica para valores muito grandes ou muito pequenos.
   */
  function inteligente(valor, significativos = 10, agrupar = true) {
    if (Number.isNaN(valor)) return "—";
    if (!Number.isFinite(valor)) return valor > 0 ? "∞" : "-∞";
    if (valor === 0) return "0";
    const absoluto = Math.abs(valor);
    if (absoluto >= 1e15 || absoluto < 1e-6) return cientifico(valor, significativos - 1);
    const arredondado = Decimal.deNumero(valor).arredondar(significativos);
    const casas = Math.min(12, Math.max(0, arredondado.semZeros().escala));
    return numero(arredondado.paraNumero(), casas, 0, agrupar);
  }

  /** Inteiro com separador de milhar. */
  const inteiro = (valor) => numero(valor, 0, 0, true);

  return { Decimal, DivisaoPorZero, ler, lerInteiro, numero, inteiro, inteligente, cientifico, sobrescrito };
})();

if (typeof module === "object") module.exports = MatematicaComum;
