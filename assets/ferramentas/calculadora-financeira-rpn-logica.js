"use strict";
/*
 * Calculadora financeira RPN: pilha de 4 níveis, 20 registradores, juros compostos, fluxo de
 * caixa, amortização, títulos, depreciação, datas, estatística e programação de até 99 linhas.
 * Porte do motor do app da EFS Aplicativos (engine/Key.kt, Op.kt, EntryBuffer.kt,
 * NumberFormatter.kt, CalendarMath.kt, FinancialMath.kt e CalculatorEngine.kt).
 *
 * O app arredonda o visor com BigDecimal.valueOf(x) (meio para cima); aqui o mesmo é feito com
 * inteiros BigInt sobre a representação decimal curta do número.
 */
const LogicaRpn = (() => {
  // ---------------------------------------------------------------- teclas

  /** [nome, código, rótulo, rótulo f, rótulo g], na ordem do teclado (4 linhas x 10 colunas). */
  const DADOS_TECLAS = [
    ["N", 11, "n", "AMORT", "12×"], ["I", 12, "i", "INT", "12÷"], ["PV", 13, "PV", "NPV", "CFo"],
    ["PMT", 14, "PMT", "RND", "CFj"], ["FV", 15, "FV", "IRR", "Nj"], ["CHS", 16, "CHS", "", "DATE"],
    ["D7", 7, "7", "", "BEG"], ["D8", 8, "8", "", "END"], ["D9", 9, "9", "", "MEM"], ["DIV", 10, "÷", "", "◄"],

    ["YX", 21, "yˣ", "PRICE", "√x"], ["RECIP", 22, "1/x", "YTM", "eˣ"], ["PCT_T", 23, "%T", "SL", "LN"],
    ["DELTA_PCT", 24, "Δ%", "SOYD", "FRAC"], ["PCT", 25, "%", "DB", "INTG"], ["EEX", 26, "EEX", "", "ΔDYS"],
    ["D4", 4, "4", "", "D.MY"], ["D5", 5, "5", "", "M.DY"], ["D6", 6, "6", "", "x̄w"], ["MUL", 20, "×", "", "x²"],

    ["RS", 31, "R/S", "P/R", "PSE"], ["SST", 32, "SST", "CLR Σ", "BST"], ["RDN", 33, "R↓", "CLR PRGM", "GTO"],
    ["XY", 34, "x≷y", "CLR FIN", "x≤y"], ["CLX", 35, "CLx", "CLR REG", "x=0"], ["ENTER", 36, "ENTER", "CLR PREFIX", "LSTx"],
    ["D1", 1, "1", "", "x̂,r"], ["D2", 2, "2", "", "ŷ,r"], ["D3", 3, "3", "", "n!"], ["SUB", 30, "−", "", ""],

    ["ON", 41, "ON", "", ""], ["F", 42, "f", "", ""], ["G", 43, "g", "", ""], ["STO", 44, "STO", "", ""],
    ["RCL", 45, "RCL", "", ""], ["D0", 0, "0", "", "x̄"], ["DOT", 48, ".", "", "s"], ["SIGMA_PLUS", 49, "Σ+", "", "Σ−"],
    ["ADD", 40, "+", "", ""],
  ];

  const TECLAS = DADOS_TECLAS.map(([nome, codigo, rotulo, rotuloF, rotuloG]) =>
    Object.freeze({ nome, codigo, rotulo, rotuloF, rotuloG, digito: codigo >= 0 && codigo <= 9 ? codigo : -1 }),
  );
  /** Teclas por nome: Tecla.ENTER, Tecla.D7... */
  const Tecla = Object.freeze(Object.fromEntries(TECLAS.map((k) => [k.nome, k])));
  const PorCodigo = new Map(TECLAS.map((k) => [k.codigo, k]));
  const teclaPorCodigo = (codigo) => PorCodigo.get(codigo) ?? null;
  const teclaDoDigito = (d) => PorCodigo.get(d);

  /** Linhas do teclado; o ENTER aparece nas duas últimas porque ocupa duas linhas. */
  const LINHAS_TECLADO = [
    ["N", "I", "PV", "PMT", "FV", "CHS", "D7", "D8", "D9", "DIV"],
    ["YX", "RECIP", "PCT_T", "DELTA_PCT", "PCT", "EEX", "D4", "D5", "D6", "MUL"],
    ["RS", "SST", "RDN", "XY", "CLX", "ENTER", "D1", "D2", "D3", "SUB"],
    ["ON", "F", "G", "STO", "RCL", "ENTER", "D0", "DOT", "SIGMA_PLUS", "ADD"],
  ];

  // ---------------------------------------------------------------- erros

  /** Erro numerado (o visor mostra "Erro n"). */
  class ErroCalc extends Error {
    constructor(codigo) {
      super(`Erro ${codigo}`);
      this.codigo = codigo;
    }
  }

  // ---------------------------------------------------------------- decimais (BigDecimal mínimo)

  /** Valor = n × 10^−s, com n ≥ 0 inteiro (BigInt). Montado a partir da representação curta. */
  function decimal(v) {
    const [mantissa, expoente = "0"] = String(Math.abs(v)).split("e");
    const [inteiro, fracao = ""] = mantissa.split(".");
    return { n: BigInt(inteiro + fracao), s: fracao.length - Number(expoente) };
  }

  const pot10 = (k) => 10n ** BigInt(k);
  const qtdDigitos = (n) => n.toString().length;

  /** Divide n por 10^k arredondando meio para cima. */
  function dividirArredondando(n, k) {
    if (k <= 0) return n * pot10(-k);
    const divisor = pot10(k);
    const q = n / divisor;
    return (n % divisor) * 2n >= divisor ? q + 1n : q;
  }

  /** setScale(casas, HALF_UP). */
  const comEscala = (d, casas) => ({ n: casas >= d.s ? d.n * pot10(casas - d.s) : dividirArredondando(d.n, d.s - casas), s: casas });

  /** round(MathContext(p, HALF_UP)): p dígitos significativos. */
  function significativos(d, p) {
    const precisao = qtdDigitos(d.n);
    if (precisao <= p) return d;
    let n = dividirArredondando(d.n, precisao - p);
    let s = d.s - (precisao - p);
    if (qtdDigitos(n) > p) {
      n /= 10n;
      s -= 1;
    }
    return { n, s };
  }

  /** toPlainString de um decimal com s ≥ 0. */
  function textoSimples(d) {
    if (d.s <= 0) return d.n.toString() + "0".repeat(-d.s);
    const t = d.n.toString().padStart(d.s + 1, "0");
    return `${t.slice(0, -d.s)}.${t.slice(-d.s)}`;
  }

  const paraNumero = (d) => Number(textoSimples(d));

  // ---------------------------------------------------------------- visor

  const MAX_VALOR = 9.999999999e99;
  const DIGITOS_VISOR = 10;
  const CASAS_CIENTIFICA = 6;

  /** Agrupa a parte inteira em milhares ("1234567" → "1.234.567" com vírgula decimal). */
  function agrupar(digitos, virgula) {
    const sep = virgula ? "." : ",";
    let r = "";
    for (let i = 0; i < digitos.length; i++) {
      if (i > 0 && (digitos.length - i) % 3 === 0) r += sep;
      r += digitos[i];
    }
    return r;
  }

  const digitosInteiros = (d, casas) => {
    const c = comEscala(d, casas);
    return qtdDigitos(c.n / pot10(c.s));
  };

  /** Casas decimais que cabem no visor em FIX, ou null se o número precisar de notação científica. */
  function casasFix(v, digitos) {
    if (v === 0) return digitos;
    if (Math.abs(v) < 5e-10) return null;
    const d = decimal(v);
    let inteiros = digitosInteiros(d, digitos);
    if (inteiros > DIGITOS_VISOR) return null;
    const casas = Math.min(digitos, DIGITOS_VISOR - inteiros);
    inteiros = digitosInteiros(d, casas);
    if (inteiros > DIGITOS_VISOR) return null;
    return Math.min(casas, DIGITOS_VISOR - inteiros);
  }

  function fixo(v, casas, virgula) {
    const d = comEscala(decimal(v), casas);
    const simples = textoSimples(d);
    const [inteiro, fracao] = simples.split(".");
    let r = v < 0 && d.n !== 0n ? "-" : "";
    r += agrupar(inteiro, virgula);
    if (casas > 0) r += (virgula ? "," : ".") + fracao;
    return { texto: r, expoente: "" };
  }

  function cientifico(v, virgula) {
    const sep = virgula ? "," : ".";
    if (v === 0) return { texto: `0${sep}${"0".repeat(CASAS_CIENTIFICA)}`, expoente: " 00" };
    const d = significativos(decimal(v), CASAS_CIENTIFICA + 1);
    const exp = qtdDigitos(d.n) - d.s - 1;
    const digitos = d.n.toString().padEnd(CASAS_CIENTIFICA + 1, "0").slice(0, CASAS_CIENTIFICA + 1);
    const texto = (v < 0 ? "-" : "") + digitos[0] + sep + digitos.slice(1);
    const expTexto = (exp < 0 ? "-" : " ") + String(Math.abs(exp)).padStart(2, "0");
    return { texto, expoente: expTexto };
  }

  /** Texto do visor (FIX n ou científico) e o expoente, quando houver. */
  function formatar(v, digitos, sci, virgula) {
    const casas = sci ? null : casasFix(v, digitos);
    return casas !== null ? fixo(v, casas, virgula) : cientifico(v, virgula);
  }

  /** Arredonda v para exatamente o que aparece no visor (RND e AMORT). */
  function arredondarVisor(v, digitos, sci) {
    const casas = sci ? null : casasFix(v, digitos);
    const d = decimal(v);
    const r = casas !== null ? paraNumero(comEscala(d, casas)) : paraNumero(significativos(d, CASAS_CIENTIFICA + 1));
    return v < 0 ? -r : r;
  }

  /** Os 10 dígitos significativos de v, sem ponto decimal (CLEAR PREFIX). */
  function mantissa(v) {
    if (v === 0) return "0".repeat(DIGITOS_VISOR);
    const d = significativos(decimal(v), DIGITOS_VISOR);
    return (v < 0 ? "-" : "") + d.n.toString().padEnd(DIGITOS_VISOR, "0").slice(0, DIGITOS_VISOR);
  }

  // ---------------------------------------------------------------- número sendo digitado

  /** Até 10 dígitos de mantissa e 2 de expoente. */
  class Entrada {
    constructor() {
      this.mantissa = "";
      this.expoente = "";
      this.negativo = false;
      this.expNegativo = false;
      this.noExpoente = false;
    }

    get qtdDigitos() {
      return this.mantissa.replace(/\D/g, "").length;
    }

    digito(d) {
      if (this.noExpoente) {
        // O expoente rola: o dígito mais antigo sai pela esquerda.
        if (this.expoente.length === 2) this.expoente = this.expoente.slice(1);
        this.expoente += d;
      } else if (this.qtdDigitos < 10) {
        this.mantissa += d;
      }
    }

    ponto() {
      if (this.noExpoente || this.mantissa.includes(".")) return;
      if (!this.mantissa) this.mantissa = "0";
      this.mantissa += ".";
    }

    iniciarExpoente() {
      if (this.noExpoente) return;
      if (!/[1-9]/.test(this.mantissa)) this.mantissa = "1";
      this.noExpoente = true;
    }

    trocarSinal() {
      if (this.noExpoente) this.expNegativo = !this.expNegativo;
      else this.negativo = !this.negativo;
    }

    /** Apaga o último caractere. Devolve false quando não sobrou nada. */
    apagar() {
      if (this.noExpoente && this.expoente) {
        this.expoente = this.expoente.slice(0, -1);
      } else if (this.noExpoente) {
        this.noExpoente = false;
        this.expNegativo = false;
      } else if (this.mantissa) {
        this.mantissa = this.mantissa.slice(0, -1);
        if (this.mantissa === "0") this.mantissa = "";
      }
      return this.mantissa !== "" || this.noExpoente;
    }

    valor() {
      const m = this.mantissa || "0";
      const e = this.expoente || "0";
      const v = Number(`${m}e${this.expNegativo ? "-" : ""}${e}`);
      return this.negativo ? -v : v;
    }

    /** Texto do visor durante a digitação: mantissa agrupada e expoente com 2 dígitos. */
    visor(virgula) {
      const texto = this.mantissa || "0";
      const [inteiro, fracao] = texto.split(".");
      let r = (this.negativo ? "-" : "") + agrupar(inteiro, virgula);
      if (texto.includes(".")) r += (virgula ? "," : ".") + fracao;
      const exp = this.noExpoente ? (this.expNegativo ? "-" : " ") + this.expoente.padStart(2, "0") : "";
      return { texto: r, expoente: exp };
    }
  }

  // ---------------------------------------------------------------- datas

  /** Dias desde 1970-01-01 (calendário gregoriano proléptico). */
  function diaEpoca(a, m, d) {
    const y = m <= 2 ? a - 1 : a;
    const era = Math.floor(y / 400);
    const yoe = y - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  }

  function dataDoDia(z) {
    z += 719468;
    const era = Math.floor(z / 146097);
    const doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
    const m = mp + (mp < 10 ? 3 : -9);
    return { a: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
  }

  const bissexto = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  const diasNoMes = (a, m) => [31, bissexto(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

  /** Data como { a, m, d, dia } (dia = dias desde 1970-01-01). */
  function data(a, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > diasNoMes(a, m)) return null;
    return { a, m, d, dia: diaEpoca(a, m, d) };
  }
  const dataPorDia = (dia) => ({ ...dataDoDia(dia), dia });

  /** LocalDate.minusMonths: volta k meses e ajusta o dia ao tamanho do mês. */
  function menosMeses(dt, k) {
    const total = dt.a * 12 + (dt.m - 1) - k;
    const a = Math.floor(total / 12);
    const m = (total % 12 + 12) % 12 + 1;
    return data(a, m, Math.min(dt.d, diasNoMes(a, m)));
  }

  /** Dia da semana ISO: 1 = segunda ... 7 = domingo. */
  const diaDaSemana = (dt) => ((((dt.dia + 3) % 7) + 7) % 7) + 1;

  const PRIMEIRA = diaEpoca(1582, 10, 15);
  const ULTIMA = diaEpoca(4046, 11, 25);

  /** Datas no formato numérico DD.MMAAAA (D.MY) ou MM.DDAAAA (M.DY). */
  const Calendario = {
    ler(v, dmy) {
      if (v <= 0 || v >= 100) throw new ErroCalc(8);
      const [primeiro, fracao] = textoSimples(comEscala(decimal(v), 6)).split(".");
      const segundo = Number(fracao.slice(0, 2));
      const ano = Number(fracao.slice(2));
      const [dia, mes] = dmy ? [Number(primeiro), segundo] : [segundo, Number(primeiro)];
      const dt = data(ano, mes, dia);
      if (!dt || dt.dia < PRIMEIRA || dt.dia > ULTIMA) throw new ErroCalc(8);
      return dt;
    },
    paraNumero(dt, dmy) {
      if (dt.dia < PRIMEIRA || dt.dia > ULTIMA) throw new ErroCalc(8);
      const primeiro = dmy ? dt.d : dt.m;
      const segundo = dmy ? dt.m : dt.d;
      return Number(`${primeiro}.${String(segundo).padStart(2, "0")}${String(dt.a).padStart(4, "0")}`);
    },
    /** Data legível para o visor, ex.: "11/09/1955". */
    rotulo(dt, dmy) {
      const primeiro = dmy ? dt.d : dt.m;
      const segundo = dmy ? dt.m : dt.d;
      return `${String(primeiro).padStart(2, "0")}/${String(segundo).padStart(2, "0")}/${String(dt.a).padStart(4, "0")}`;
    },
    somarDias(dt, dias) {
      if (Math.abs(dias) > 1e7) throw new ErroCalc(8);
      return dataPorDia(dt.dia + Math.trunc(dias));
    },
    diasCorridos: (de, ate) => ate.dia - de.dia,
    /** Base 30/360. */
    dias30360(de, ate) {
      let d1 = de.d;
      let d2 = ate.d;
      if (d1 === 31) d1 = 30;
      if (d2 === 31 && d1 >= 30) d2 = 30;
      return (ate.a - de.a) * 360 + (ate.m - de.m) * 30 + (d2 - d1);
    },
  };

  // ---------------------------------------------------------------- matemática financeira

  /**
   * Fatores da equação  PV·A + (1 + i·S)·PMT·[1 − (1+i)^−N]/i + FV·(1+i)^−N = 0, onde N é a
   * parte inteira de n e A trata o período fracionário (juros simples, ou compostos com C ligado).
   */
  function termos(t, taxa) {
    if (taxa <= -1) return null;
    const inteiro = t.n >= 0 ? Math.floor(t.n) : t.n;
    const frac = t.n - inteiro;
    const impar = frac === 0 ? 1 : t.compound ? (1 + taxa) ** frac : 1 + taxa * frac;
    const lnv = Math.log1p(taxa);
    const vN = Math.exp(-inteiro * lnv);
    const anuidade = Math.abs(taxa) < 1e-12 ? inteiro : -Math.expm1(-inteiro * lnv) / taxa;
    const fatorInicio = t.begin ? 1 + taxa : 1;
    return { impar, vN, anuidade, fatorInicio };
  }

  function residuo(t, taxa) {
    const k = termos(t, taxa);
    if (!k) return NaN;
    return t.pv * k.impar + k.fatorInicio * t.pmt * k.anuidade + t.fv * k.vN;
  }

  function termosOuErro(t) {
    const k = termos(t, t.i / 100);
    if (!k) throw new ErroCalc(5);
    return k;
  }

  /** Newton a partir de cada palpite; se nada convergir, varre o intervalo e bissecta. */
  function acharRaiz(f, palpites, lo = -0.9999, hi = 10) {
    for (const g of palpites) {
      const r = newton(f, g, lo);
      if (r !== null) return r;
    }
    return varrer(f, lo, hi);
  }

  function newton(f, inicio, lo) {
    let r = inicio;
    for (let it = 0; it < 200; it++) {
      const fr = f(r);
      if (!Number.isFinite(fr)) return null;
      if (fr === 0) return r;
      const h = Math.max(Math.abs(r), 1) * 1e-7;
      const d = (f(r + h) - f(r - h)) / (2 * h);
      if (d === 0 || !Number.isFinite(d)) return null;
      let prox = r - fr / d;
      if (prox <= lo) prox = (r + lo) / 2;
      if (Math.abs(prox - r) <= 1e-12 * Math.max(1, Math.abs(r))) return prox;
      r = prox;
    }
    return null;
  }

  const MARCAS = [
    -0.99, -0.9, -0.75, -0.5, -0.25, -0.1, -0.05, -0.01, -0.001, 0, 0.0001,
    0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 50, 200, 1000,
  ];

  function varrer(f, lo, hi) {
    const pontos = [lo, ...MARCAS.filter((m) => m > lo && m < hi), hi];
    let reserva = null;
    for (let k = 0; k < pontos.length - 1; k++) {
      const a = pontos[k];
      const b = pontos[k + 1];
      const fa = f(a);
      const fb = f(b);
      if (!Number.isFinite(fa) || !Number.isFinite(fb) || Math.sign(fa) === Math.sign(fb)) continue;
      const raiz = bissectar(f, a, b, fa);
      if (raiz >= 0) return raiz;
      if (reserva === null) reserva = raiz;
    }
    return reserva;
  }

  function bissectar(f, a, b, fa) {
    for (let it = 0; it < 200; it++) {
      const m = (a + b) / 2;
      const fm = f(m);
      if (fm === 0) return m;
      if (Math.sign(fm) === Math.sign(fa)) {
        a = m;
        fa = fm;
      } else {
        b = m;
      }
    }
    return (a + b) / 2;
  }

  function npvNaTaxa(taxa, fluxos, contagens, ultimo) {
    if (taxa <= -1) return NaN;
    const lnv = Math.log1p(taxa);
    let soma = fluxos[0];
    let periodo = 0;
    for (let j = 1; j <= ultimo; j++) {
      for (let r = 0; r < contagens[j]; r++) {
        periodo++;
        soma += fluxos[j] * Math.exp(-periodo * lnv);
      }
    }
    return soma;
  }

  const sinais = (valores) => new Set(valores.filter((v) => v !== 0).map(Math.sign));

  function verificarDepreciacao(vida, ano) {
    if (vida <= 0 || ano <= 0 || ano !== Math.floor(ano) || ano > 10000) throw new ErroCalc(5);
  }

  /** Período de cupom (semestral) que contém a liquidação. */
  function periodoCupom(liquidacao, vencimento) {
    if (liquidacao.dia >= vencimento.dia) throw new ErroCalc(8);
    let k = 1;
    let prox = vencimento;
    let ant = menosMeses(vencimento, 6);
    while (ant.dia > liquidacao.dia) {
      prox = ant;
      k++;
      ant = menosMeses(vencimento, 6 * k);
    }
    return { ant, prox, cupons: k };
  }

  const Financeiro = {
    resolverPv(t) {
      const k = termosOuErro(t);
      if (k.impar === 0) throw new ErroCalc(5);
      return -(k.fatorInicio * t.pmt * k.anuidade + t.fv * k.vN) / k.impar;
    },
    resolverFv(t) {
      const k = termosOuErro(t);
      if (k.vN === 0) throw new ErroCalc(5);
      return -(t.pv * k.impar + k.fatorInicio * t.pmt * k.anuidade) / k.vN;
    },
    resolverPmt(t) {
      const k = termosOuErro(t);
      const d = k.fatorInicio * k.anuidade;
      if (d === 0) throw new ErroCalc(5);
      return -(t.pv * k.impar + t.fv * k.vN) / d;
    },
    /** n sempre sai inteiro: arredonda para cima, a não ser que a fração seja desprezível. */
    resolverN(t) {
      const r = t.i / 100;
      if (r <= -1) throw new ErroCalc(5);
      let n;
      if (Math.abs(r) < 1e-12) {
        if (t.pmt === 0) throw new ErroCalc(5);
        n = -(t.pv + t.fv) / t.pmt;
      } else {
        const p = ((t.begin ? 1 + r : 1) * t.pmt) / r;
        const razao = (p - t.fv) / (t.pv + p);
        if (!Number.isFinite(razao) || razao <= 0) throw new ErroCalc(5);
        n = Math.log(razao) / Math.log1p(r);
      }
      if (!Number.isFinite(n) || n <= 0 || n >= 1e10) throw new ErroCalc(5);
      const inteiro = Math.floor(n);
      return Math.max(n - inteiro < 0.005 ? inteiro : inteiro + 1, 1);
    },
    resolverI(t) {
      if (t.n <= 0) throw new ErroCalc(5);
      if (sinais([t.pv, t.pmt, t.fv]).size < 2) throw new ErroCalc(5);
      const taxa = acharRaiz((r) => residuo(t, r), [0.01, 0.1, 0.001, 0.5]);
      if (taxa === null) throw new ErroCalc(5);
      return taxa * 100;
    },
    npv(iPct, fluxos, contagens, ultimo) {
      const taxa = iPct / 100;
      if (taxa <= -1) throw new ErroCalc(5);
      return npvNaTaxa(taxa, fluxos, contagens, ultimo);
    },
    irr(fluxos, contagens, ultimo) {
      if (sinais(fluxos.slice(0, ultimo + 1)).size < 2) throw new ErroCalc(7);
      const taxa = acharRaiz((r) => npvNaTaxa(r, fluxos, contagens, ultimo), [0.1, 0.01, 0.5]);
      if (taxa === null) throw new ErroCalc(3);
      return taxa * 100;
    },
    /** Amortiza [qtd] parcelas a partir do saldo [pv]; os juros de cada parcela são arredondados para o visor. */
    amortizar(qtd, nInicial, iPct, pv, pmt, begin, arredondar) {
      if (qtd !== Math.floor(qtd) || qtd <= 0 || qtd > 10000) throw new ErroCalc(5);
      const taxa = iPct / 100;
      let saldo = pv;
      let totalJuros = 0;
      let totalPrincipal = 0;
      let n = nInicial;
      for (let k = 0; k < qtd; k++) {
        const juros = begin && n === 0 ? 0 : -arredondar(saldo * taxa);
        const principal = arredondar(pmt - juros);
        saldo = arredondar(saldo + principal);
        totalJuros = arredondar(totalJuros + juros);
        totalPrincipal = arredondar(totalPrincipal + principal);
        n += 1;
      }
      return { juros: totalJuros, principal: totalPrincipal, saldo, n };
    },
    linear(custo, residual, vida, ano) {
      verificarDepreciacao(vida, ano);
      const base = custo - residual;
      const porAno = base / vida;
      return { valor: ano <= vida ? porAno : 0, restante: ano >= vida ? 0 : base - porAno * ano };
    },
    somaDosDigitos(custo, residual, vida, ano) {
      verificarDepreciacao(vida, ano);
      const base = custo - residual;
      const soma = (vida * (vida + 1)) / 2;
      if (ano > vida) return { valor: 0, restante: 0 };
      const usado = ano * vida - (ano * (ano - 1)) / 2;
      return { valor: (base * (vida - ano + 1)) / soma, restante: base * (1 - usado / soma) };
    },
    saldoDecrescente(custo, residual, vida, fatorPct, ano) {
      verificarDepreciacao(vida, ano);
      const taxa = fatorPct / 100 / vida;
      let contabil = custo;
      let valor = 0;
      for (let k = 0; k < Math.trunc(ano); k++) {
        valor = contabil * taxa;
        if (contabil - valor < residual) valor = Math.max(contabil - residual, 0);
        contabil -= valor;
      }
      return { valor, restante: contabil - residual };
    },
    precoTitulo(liquidacao, vencimento, cupomPct, rendimentoPct) {
      const p = periodoCupom(liquidacao, vencimento);
      const e = p.prox.dia - p.ant.dia;
      const dsc = p.prox.dia - liquidacao.dia;
      const a = e - dsc;
      const cupom = cupomPct / 2;
      const y = rendimentoPct / 200;
      if (y <= -1) throw new ErroCalc(5);
      const corrido = (cupom * a) / e;
      let preco;
      if (p.cupons === 1) {
        const dsm = vencimento.dia - liquidacao.dia;
        preco = (100 + cupom) / (1 + (dsm / e) * y) - corrido;
      } else {
        const lnv = Math.log1p(y);
        let soma = 100 * Math.exp(-(p.cupons - 1 + dsc / e) * lnv);
        for (let k = 1; k <= p.cupons; k++) soma += cupom * Math.exp(-(k - 1 + dsc / e) * lnv);
        preco = soma - corrido;
      }
      return { preco, corrido };
    },
    rendimentoTitulo(liquidacao, vencimento, cupomPct, preco) {
      periodoCupom(liquidacao, vencimento);
      if (preco <= 0) throw new ErroCalc(5);
      const f = (y) => (y <= -200 ? NaN : Financeiro.precoTitulo(liquidacao, vencimento, cupomPct, y).preco - preco);
      const r = acharRaiz(f, [cupomPct, 5, 10], -199, 2000);
      if (r === null) throw new ErroCalc(5);
      return r;
    },
  };

  // ---------------------------------------------------------------- montagem das instruções

  const ARIT = new Set(["ADD", "SUB", "MUL", "DIV"]);
  const REG_FIN = { N: "N", I: "I", PV: "PV", PMT: "PMT", FV: "FV" };
  const REGS_FIN = ["N", "I", "PV", "PMT", "FV"];
  const ROTULOS_FIN = { N: "n", I: "i", PV: "PV", PMT: "PMT", FV: "FV" };

  const F_FUNCOES = {
    DOT: "SCI", N: "AMORT", I: "INT", PV: "NPV", PMT: "RND", FV: "IRR", YX: "PRICE", RECIP: "YTM",
    PCT_T: "SL", DELTA_PCT: "SOYD", PCT: "DB", RS: "PR", SST: "CLEAR_SIGMA", RDN: "CLEAR_PRGM",
    XY: "CLEAR_FIN", CLX: "CLEAR_REG", ENTER: "CLEAR_PREFIX",
  };
  const G_FUNCOES = {
    N: "TIMES12", I: "DIV12", PV: "CF0", PMT: "CFJ", FV: "NJ", CHS: "DATE", D7: "BEG", D8: "END",
    D9: "MEM", DIV: "BACKSPACE", YX: "SQRT", RECIP: "EXP", PCT_T: "LN", DELTA_PCT: "FRAC", PCT: "INTG",
    EEX: "DELTA_DAYS", D4: "DMY", D5: "MDY", D6: "MEAN_W", MUL: "SQUARE", RS: "PSE", SST: "BST",
    XY: "X_LE_Y", CLX: "X_EQ_0", ENTER: "LASTX", D1: "X_HAT", D2: "Y_HAT", D3: "FACTORIAL", D0: "MEAN",
    DOT: "STDDEV", SIGMA_PLUS: "SIGMA_MINUS",
  };
  const PRIMARIAS = {
    CHS: "CHS", DIV: "DIV", YX: "POWER", RECIP: "RECIP", PCT_T: "PCT_T", DELTA_PCT: "DELTA_PCT", PCT: "PCT",
    EEX: "EEX", MUL: "MUL", RS: "RS", SST: "SST", RDN: "RDN", XY: "SWAP", CLX: "CLX", ENTER: "ENTER",
    SUB: "SUB", ON: "ON", DOT: "DOT", SIGMA_PLUS: "SIGMA_PLUS", ADD: "ADD",
  };
  /** Instruções que não entram na memória de programa quando digitadas no modo PRGM. */
  const NAO_PROGRAMAVEIS = new Set(["PR", "CLEAR_PRGM", "CLEAR_PREFIX", "SST", "BST", "MEM", "BACKSPACE", "ON"]);

  const INCOMPLETO = { tipo: "incompleto" };
  const CANCELA = { tipo: "cancela" };
  const REINICIA = { tipo: "reinicia" };
  const pronto = (op) => ({ tipo: "pronto", op });
  const simples = (fn) => pronto({ tipo: "simples", fn });

  const programavel = (op) => (op.tipo === "irPara" ? false : op.tipo === "simples" ? !NAO_PROGRAMAVEIS.has(op.fn) : true);

  /** Lê "d" ou ". d": null se incompleto, -1 se inválido. */
  function registrador(args) {
    if (!args.length) return null;
    if (args[0] === Tecla.DOT) {
      if (args.length === 1) return null;
      return args[1].digito < 0 ? -1 : 10 + args[1].digito;
    }
    return args[0].digito < 0 ? -1 : args[0].digito;
  }

  function analisarF(teclas) {
    if (teclas.length === 1) return INCOMPLETO;
    const k = teclas[1];
    if (k === Tecla.F) return CANCELA;
    if (k.digito >= 0) return pronto({ tipo: "fix", casas: k.digito });
    const fn = F_FUNCOES[k.nome];
    return fn ? simples(fn) : REINICIA;
  }

  function analisarGto(teclas) {
    const args = teclas.slice(2);
    if (!args.length) return INCOMPLETO;
    const ponto = args[0] === Tecla.DOT;
    const digitos = ponto ? args.slice(1) : args;
    if (digitos.some((k) => k.digito < 0)) return REINICIA;
    if (digitos.length < 2) return INCOMPLETO;
    const linha = digitos[0].digito * 10 + digitos[1].digito;
    return pronto(ponto ? { tipo: "irPara", linha } : { tipo: "gto", linha });
  }

  function analisarG(teclas) {
    if (teclas.length === 1) return INCOMPLETO;
    const k = teclas[1];
    if (k === Tecla.G) return CANCELA;
    if (k === Tecla.RDN) return analisarGto(teclas);
    const fn = G_FUNCOES[k.nome];
    return fn ? simples(fn) : REINICIA;
  }

  function analisarSto(teclas) {
    if (teclas.length === 1) return INCOMPLETO;
    const k = teclas[1];
    if (REG_FIN[k.nome]) return pronto({ tipo: "stoFin", reg: k.nome });
    if (k === Tecla.EEX) return simples("STO_EEX");
    if (ARIT.has(k.nome)) {
      const reg = registrador(teclas.slice(2));
      if (reg === null) return INCOMPLETO;
      return reg < 0 ? REINICIA : pronto({ tipo: "stoArit", fn: k.nome, reg });
    }
    const reg = registrador(teclas.slice(1));
    if (reg === null) return INCOMPLETO;
    return reg < 0 ? REINICIA : pronto({ tipo: "sto", reg });
  }

  function analisarRcl(teclas) {
    if (teclas.length === 1) return INCOMPLETO;
    const k = teclas[1];
    if (REG_FIN[k.nome]) return pronto({ tipo: "rclFin", reg: k.nome });
    if (k === Tecla.G) {
      if (teclas.length === 2) return INCOMPLETO;
      if (teclas[2] === Tecla.PMT) return simples("RCL_CFJ");
      if (teclas[2] === Tecla.FV) return simples("RCL_NJ");
      return REINICIA;
    }
    const reg = registrador(teclas.slice(1));
    if (reg === null) return INCOMPLETO;
    return reg < 0 ? REINICIA : pronto({ tipo: "rcl", reg });
  }

  function primaria(k) {
    if (k.digito >= 0) return { tipo: "digito", d: k.digito };
    if (REG_FIN[k.nome]) return { tipo: "fin", reg: k.nome };
    return { tipo: "simples", fn: PRIMARIAS[k.nome] };
  }

  /** Converte sequências de teclas em instruções, seguindo as regras de prefixo. */
  function analisar(teclas) {
    switch (teclas[0]) {
      case Tecla.F:
        return analisarF(teclas);
      case Tecla.G:
        return analisarG(teclas);
      case Tecla.STO:
        return analisarSto(teclas);
      case Tecla.RCL:
        return analisarRcl(teclas);
      default:
        return pronto(primaria(teclas[0]));
    }
  }

  /** Texto do indicador de prefixo pendente ("f", "g", "STO"...). */
  function rotuloPrefixo(teclas) {
    if (!teclas.length) return "";
    const [a, b] = teclas;
    if (a === Tecla.F) return "f";
    if (a === Tecla.G && b === Tecla.RDN) return "GTO";
    if (a === Tecla.G) return "g";
    if (a === Tecla.STO && b && ARIT.has(b.nome)) return `STO ${b.rotulo}`;
    if (a === Tecla.STO) return "STO";
    if (a === Tecla.RCL && b === Tecla.G) return "RCL g";
    if (a === Tecla.RCL) return "RCL";
    return "";
  }

  // ---------------------------------------------------------------- motor

  const REGISTRADORES = 20;
  const MAX_LINHAS = 99;
  const DIAS_SEMANA = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];
  const LEGENDAS_ERRO = {
    0: "operação matemática inválida",
    1: "estouro no registrador",
    2: "dados estatísticos insuficientes",
    3: "IRR sem solução",
    4: "memória de programa",
    5: "dados financeiros inconsistentes",
    6: "registrador de fluxo inválido",
    7: "fluxos sem troca de sinal",
    8: "data inválida",
  };

  function limitar(v) {
    if (Number.isNaN(v)) throw new ErroCalc(0);
    if (Math.abs(v) > MAX_VALOR) return Math.sign(v) * MAX_VALOR;
    if (Math.abs(v) < 1e-99) return 0;
    return v;
  }

  function potencia(base, exp) {
    if (base === 0 && exp <= 0) throw new ErroCalc(0);
    if (base < 0 && exp !== Math.floor(exp)) throw new ErroCalc(0);
    return base ** exp;
  }

  function fatorial(v) {
    if (v < 0 || v !== Math.floor(v)) throw new ErroCalc(0);
    if (v > 69) return MAX_VALOR;
    let r = 1;
    for (let k = 2; k <= v; k++) r *= k;
    return r;
  }

  /**
   * Toda tecla passa por pressionar(). Instruções com prefixo (f, g, STO, RCL, GTO) são montadas
   * por analisar() e depois executadas ou, no modo PRGM, gravadas no programa.
   */
  class Motor {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.z = 0;
      this.t = 0;
      this.lastX = 0;
      this.elevar = true;
      this.entrada = null;
      /** R0..R9 e R.0..R.9; os fluxos CFj e os somatórios Σ (R1..R6) usam os mesmos registradores. */
      this.regs = new Array(REGISTRADORES).fill(0);
      this.contagens = new Array(REGISTRADORES).fill(1);
      this.fin = { N: 0, I: 0, PV: 0, PMT: 0, FV: 0 };
      this.begin = false;
      this.compound = false;
      this.dmy = true;
      this.fixDigitos = 2;
      this.sci = false;
      /** Vírgula como separador decimal (padrão brasileiro); ponto quando false. */
      this.virgula = true;
      this.erro = null;
      this.ultimaFoiFinanceira = false;
      this.programa = [];
      this.modoPrograma = false;
      this.pc = 0;
      this.executando = false;
      this.pausando = false;
      this.pendente = [];
      this.temporario = null;
    }

    /** Há uma mensagem passageira (mantissa, MEM, BST) que a interface deve apagar após um instante. */
    get temMensagemTemporaria() {
      return this.temporario !== null && (this.temporario.tipo === "mantissa" || this.temporario.tipo === "mensagem");
    }

    get temPrefixo() {
      return this.pendente.length > 0;
    }

    // ---------- teclas

    pressionar(tecla) {
      this.temporario = null;
      if (this.executando) {
        this.parar();
        return;
      }
      if (this.erro !== null) {
        this.erro = null;
        this.pendente = [];
        return;
      }
      this.pendente.push(tecla);
      let r = analisar(this.pendente);
      if (r === REINICIA) {
        this.pendente = [tecla];
        r = analisar(this.pendente);
      }
      if (r.tipo === "pronto") {
        const teclas = this.pendente.slice();
        this.pendente = [];
        if (this.modoPrograma) this.teclaPrograma(r.op, teclas);
        else this.executar(r.op, false);
      } else if (r.tipo !== "incompleto") {
        this.pendente = [];
      }
    }

    limparPrefixo() {
      this.pendente = [];
    }

    limparMensagem() {
      if (this.temMensagemTemporaria) this.temporario = null;
    }

    // ---------- programação

    /** Executa a próxima linha do programa em andamento: "continua", "pausa" ou "parado". */
    passo() {
      if (!this.executando) return "parado";
      this.pausando = false;
      if (this.pc >= this.programa.length) {
        this.pc = 0;
        this.parar();
        return "parado";
      }
      this.pc++;
      const r = this.executar(this.decodificar(this.programa[this.pc - 1]), true);
      if (r === "parado") this.parar();
      if (!this.executando) return "parado";
      if (r === "pausa") this.pausando = true;
      return r;
    }

    parar() {
      this.executando = false;
      this.pausando = false;
      this.entrada = null;
    }

    decodificar(teclas) {
      const r = analisar(teclas);
      return r.tipo === "pronto" ? r.op : { tipo: "simples", fn: "ON" };
    }

    teclaPrograma(op, teclas) {
      if (programavel(op)) {
        this.gravar(teclas);
      } else if (op.tipo === "irPara") {
        if (op.linha > this.programa.length) this.falhar(4);
        else this.pc = op.linha;
      } else if (op.tipo === "simples") {
        switch (op.fn) {
          case "PR":
            this.modoPrograma = false;
            this.pc = 0;
            break;
          case "CLEAR_PRGM":
            this.programa = [];
            this.pc = 0;
            break;
          case "SST":
            this.pc = this.pc >= this.programa.length ? 0 : this.pc + 1;
            break;
          case "BST":
            this.pc = this.pc > 0 ? this.pc - 1 : this.programa.length;
            break;
          case "BACKSPACE":
            if (this.pc > 0) {
              this.programa.splice(this.pc - 1, 1);
              this.pc--;
            }
            break;
          case "MEM":
            this.temporario = { tipo: "mensagem", texto: this.textoMemoria() };
            break;
          default:
            break;
        }
      }
    }

    gravar(teclas) {
      if (this.pc < this.programa.length) this.programa[this.pc] = teclas;
      else if (this.programa.length < MAX_LINHAS) this.programa.push(teclas);
      else return this.falhar(4);
      this.pc++;
    }

    /** SST fora do modo PRGM: executa uma única linha. */
    passoUnico() {
      if (this.pc >= this.programa.length) {
        this.pc = 0;
        return;
      }
      this.pc++;
      this.executar(this.decodificar(this.programa[this.pc - 1]), true);
      this.executando = false;
      this.pausando = false;
    }

    textoLinha(linha) {
      if (linha === 0) return "00-";
      const teclas = this.programa[linha - 1];
      let codigos;
      if (teclas.length >= 4 && teclas[0] === Tecla.G && teclas[1] === Tecla.RDN) {
        const digitos = teclas.slice(2).filter((k) => k.digito >= 0).map((k) => String(k.digito)).join("");
        codigos = [String(Tecla.G.codigo), String(Tecla.RDN.codigo), digitos];
      } else {
        codigos = teclas.map((k) => (k.digito >= 0 ? String(k.digito) : String(k.codigo)));
      }
      return `${String(linha).padStart(2, "0")}- ${codigos.map((c) => c.padStart(2)).join(" ")}`;
    }

    textoMemoria() {
      return `P-${String(MAX_LINHAS - this.programa.length).padStart(2, "0")} r-${String(REGISTRADORES).padStart(2, "0")}`;
    }

    // ---------- execução

    executar(op, emPrograma) {
      const eraFinanceira = this.ultimaFoiFinanceira;
      this.ultimaFoiFinanceira = false;
      try {
        switch (op.tipo) {
          case "digito":
            this.garantirEntrada().digito(op.d);
            this.sincronizar();
            break;
          case "fix":
            this.fimEntrada();
            this.fixDigitos = op.casas;
            this.sci = false;
            break;
          case "fin":
            this.teclaFinanceira(op.reg, eraFinanceira);
            break;
          case "sto":
            this.fimEntrada();
            this.regs[op.reg] = this.x;
            break;
          case "rcl":
            this.fimEntrada();
            this.empilhar(this.regs[op.reg]);
            break;
          case "stoArit":
            this.fimEntrada();
            this.regs[op.reg] = this.aritRegistrador(op.fn, this.regs[op.reg], this.x);
            break;
          case "stoFin":
            this.fimEntrada();
            this.fin[op.reg] = this.x;
            break;
          case "rclFin":
            this.fimEntrada();
            this.empilhar(this.fin[op.reg]);
            break;
          case "gto":
            if (op.linha > this.programa.length) throw new ErroCalc(4);
            this.pc = op.linha;
            if (emPrograma && op.linha === 0) return "parado";
            break;
          case "irPara":
            if (op.linha > this.programa.length) throw new ErroCalc(4);
            this.pc = op.linha;
            break;
          case "simples":
            return this.simples(op.fn, emPrograma);
          default:
            break;
        }
      } catch (e) {
        if (!(e instanceof ErroCalc)) throw e;
        this.falhar(e.codigo);
        return "parado";
      }
      return "continua";
    }

    simples(fn, emPrograma) {
      switch (fn) {
        case "DOT":
          this.garantirEntrada().ponto();
          this.sincronizar();
          break;
        case "EEX":
          this.garantirEntrada().iniciarExpoente();
          this.sincronizar();
          break;
        case "CHS":
          if (this.entrada) {
            this.entrada.trocarSinal();
            this.sincronizar();
          } else {
            this.x = -this.x;
          }
          break;
        case "ENTER":
          this.fimEntrada();
          this.subir();
          this.elevar = false;
          break;
        case "CLX":
          this.fimEntrada();
          this.x = 0;
          this.elevar = false;
          break;
        case "BACKSPACE":
          this.apagar();
          break;

        case "ADD":
          this.binaria((a, b) => a + b);
          break;
        case "SUB":
          this.binaria((a, b) => a - b);
          break;
        case "MUL":
          this.binaria((a, b) => a * b);
          break;
        case "DIV":
          this.binaria((a, b) => {
            if (b === 0) throw new ErroCalc(0);
            return a / b;
          });
          break;
        case "POWER":
          this.binaria(potencia);
          break;
        case "RECIP":
          this.unaria((v) => {
            if (v === 0) throw new ErroCalc(0);
            return 1 / v;
          });
          break;
        case "PCT_T":
          this.porcentagem((base, v) => {
            if (base === 0) throw new ErroCalc(0);
            return (100 * v) / base;
          });
          break;
        case "DELTA_PCT":
          this.porcentagem((base, v) => {
            if (base === 0) throw new ErroCalc(0);
            return (100 * (v - base)) / base;
          });
          break;
        case "PCT":
          this.porcentagem((base, v) => (base * v) / 100);
          break;
        case "SQRT":
          this.unaria((v) => {
            if (v < 0) throw new ErroCalc(0);
            return Math.sqrt(v);
          });
          break;
        case "EXP":
          this.unaria(Math.exp);
          break;
        case "LN":
          this.unaria((v) => {
            if (v <= 0) throw new ErroCalc(0);
            return Math.log(v);
          });
          break;
        case "FRAC":
          this.unaria((v) => v - Math.trunc(v));
          break;
        case "INTG":
          this.unaria(Math.trunc);
          break;
        case "SQUARE":
          this.unaria((v) => v * v);
          break;
        case "FACTORIAL":
          this.unaria(fatorial);
          break;

        case "TIMES12":
          this.unaria((v) => v * 12);
          this.fin.N = this.x;
          this.ultimaFoiFinanceira = true;
          break;
        case "DIV12":
          this.unaria((v) => v / 12);
          this.fin.I = this.x;
          this.ultimaFoiFinanceira = true;
          break;
        case "CF0":
          this.fimEntrada();
          this.regs[0] = this.x;
          this.contagens[0] = 1;
          this.fin.N = 0;
          break;
        case "CFJ":
          this.fluxo();
          break;
        case "NJ":
          this.repeticoesFluxo();
          break;
        case "AMORT":
          this.amortizar();
          break;
        case "INT":
          this.jurosSimples();
          break;
        case "NPV": {
          this.fimEntrada();
          const v = limitar(Financeiro.npv(this.fin.I, this.regs, this.contagens, this.ultimoFluxo()));
          this.fin.PV = v;
          this.empilhar(v);
          break;
        }
        case "RND":
          this.fimEntrada();
          this.x = this.arredondarVisor(this.x);
          this.elevar = true;
          break;
        case "IRR": {
          this.fimEntrada();
          const v = limitar(Financeiro.irr(this.regs, this.contagens, this.ultimoFluxo()));
          this.fin.I = v;
          this.empilhar(v);
          break;
        }
        case "PRICE":
          this.precoTitulo();
          break;
        case "YTM":
          this.rendimentoTitulo();
          break;
        case "SL":
        case "SOYD":
        case "DB":
          this.depreciacao(fn);
          break;

        case "DATE":
          this.somarData();
          break;
        case "DELTA_DAYS":
          this.diferencaDias();
          break;
        case "DMY":
          this.fimEntrada();
          this.dmy = true;
          break;
        case "MDY":
          this.fimEntrada();
          this.dmy = false;
          break;
        case "BEG":
          this.fimEntrada();
          this.begin = true;
          break;
        case "END":
          this.fimEntrada();
          this.begin = false;
          break;
        case "MEM":
          this.temporario = { tipo: "mensagem", texto: this.textoMemoria() };
          break;

        case "RS":
          this.fimEntrada();
          if (emPrograma) return "parado";
          this.executando = true;
          break;
        case "SST":
          this.passoUnico();
          break;
        case "BST":
          this.pc = this.pc > 0 ? this.pc - 1 : this.programa.length;
          this.temporario = { tipo: "mensagem", texto: this.textoLinha(this.pc) };
          break;
        case "PSE":
          if (emPrograma) return "pausa";
          break;
        case "RDN": {
          this.fimEntrada();
          const velho = this.x;
          this.x = this.y;
          this.y = this.z;
          this.z = this.t;
          this.t = velho;
          this.elevar = true;
          break;
        }
        case "SWAP": {
          this.fimEntrada();
          const velho = this.x;
          this.x = this.y;
          this.y = velho;
          this.elevar = true;
          break;
        }
        case "LASTX":
          this.fimEntrada();
          this.empilhar(this.lastX);
          break;
        case "X_LE_Y":
          this.fimEntrada();
          if (emPrograma && this.x > this.y) this.pc++;
          break;
        case "X_EQ_0":
          this.fimEntrada();
          if (emPrograma && this.x !== 0) this.pc++;
          break;

        case "SIGMA_PLUS":
          this.acumular(1);
          break;
        case "SIGMA_MINUS":
          this.acumular(-1);
          break;
        case "MEAN":
          this.media();
          break;
        case "STDDEV":
          this.desvioPadrao();
          break;
        case "MEAN_W":
          this.mediaPonderada();
          break;
        case "X_HAT":
          this.estimar(true);
          break;
        case "Y_HAT":
          this.estimar(false);
          break;

        case "SCI":
          this.fimEntrada();
          this.sci = true;
          break;
        case "CLEAR_SIGMA":
          this.fimEntrada();
          for (let k = 1; k <= 6; k++) this.regs[k] = 0;
          this.x = this.y = this.z = this.t = 0;
          this.elevar = false;
          break;
        case "CLEAR_PRGM":
          this.pc = 0;
          break;
        case "CLEAR_FIN":
          this.fimEntrada();
          for (const r of REGS_FIN) this.fin[r] = 0;
          break;
        case "CLEAR_REG":
          this.limparRegistradores();
          break;
        case "CLEAR_PREFIX":
          this.fimEntrada();
          this.temporario = { tipo: "mantissa" };
          break;
        case "PR":
          this.fimEntrada();
          this.modoPrograma = true;
          this.pc = 0;
          break;
        case "STO_EEX":
          this.fimEntrada();
          this.compound = !this.compound;
          break;
        case "RCL_CFJ": {
          this.fimEntrada();
          const j = this.ultimoFluxo();
          this.empilhar(this.regs[j]);
          this.fin.N = Math.max(j - 1, 0);
          break;
        }
        case "RCL_NJ":
          this.fimEntrada();
          this.empilhar(this.contagens[this.ultimoFluxo()]);
          break;
        default:
          break;
      }
      return "continua";
    }

    falhar(codigo) {
      this.entrada = null;
      this.erro = codigo;
      this.executando = false;
      this.pausando = false;
    }

    // ---------- pilha

    subir() {
      this.t = this.z;
      this.z = this.y;
      this.y = this.x;
    }

    empilhar(v) {
      if (this.elevar) this.subir();
      this.x = v;
      this.elevar = true;
    }

    garantirEntrada() {
      if (this.entrada) return this.entrada;
      if (this.elevar) this.subir();
      this.elevar = true;
      this.entrada = new Entrada();
      return this.entrada;
    }

    sincronizar() {
      this.x = limitar(this.entrada.valor());
    }

    fimEntrada() {
      this.entrada = null;
    }

    apagar() {
      if (this.entrada && this.entrada.apagar()) {
        this.sincronizar();
      } else {
        this.entrada = null;
        this.x = 0;
        this.elevar = false;
      }
    }

    binaria(f) {
      this.fimEntrada();
      const r = limitar(f(this.y, this.x));
      this.lastX = this.x;
      this.x = r;
      this.y = this.z;
      this.z = this.t;
      this.elevar = true;
    }

    unaria(f) {
      this.fimEntrada();
      const r = limitar(f(this.x));
      this.lastX = this.x;
      this.x = r;
      this.elevar = true;
    }

    /** %, Δ% e %T: usam Y como base e não derrubam a pilha. */
    porcentagem(f) {
      this.fimEntrada();
      const r = limitar(f(this.y, this.x));
      this.lastX = this.x;
      this.x = r;
      this.elevar = true;
    }

    aritRegistrador(fn, atual, v) {
      let r;
      if (fn === "ADD") r = atual + v;
      else if (fn === "SUB") r = atual - v;
      else if (fn === "MUL") r = atual * v;
      else if (v === 0) throw new ErroCalc(0);
      else r = atual / v;
      if (!Number.isFinite(r) || Math.abs(r) > MAX_VALOR) throw new ErroCalc(1);
      return r;
    }

    arredondarVisor(v) {
      return arredondarVisor(v, this.fixDigitos, this.sci);
    }

    limparRegistradores() {
      this.regs.fill(0);
      this.contagens.fill(1);
      for (const r of REGS_FIN) this.fin[r] = 0;
      this.x = this.y = this.z = this.t = this.lastX = 0;
      this.entrada = null;
      this.elevar = false;
    }

    /** Apaga toda a memória contínua: pilha, registradores, programa e modos. */
    apagarTudo() {
      this.limparRegistradores();
      this.programa = [];
      this.pc = 0;
      this.modoPrograma = false;
      this.executando = false;
      this.pausando = false;
      this.begin = false;
      this.compound = false;
      this.dmy = true;
      this.fixDigitos = 2;
      this.sci = false;
      this.erro = null;
      this.pendente = [];
      this.temporario = null;
      this.ultimaFoiFinanceira = false;
      this.elevar = true;
    }

    // ---------- financeiro

    tvm() {
      const f = this.fin;
      return { n: f.N, i: f.I, pv: f.PV, pmt: f.PMT, fv: f.FV, begin: this.begin, compound: this.compound };
    }

    /** Depois de digitar um número, a tecla guarda o valor; logo após outra tecla financeira, calcula. */
    teclaFinanceira(reg, eraFinanceira) {
      const digitando = this.entrada !== null;
      this.fimEntrada();
      if (digitando || !eraFinanceira) {
        this.fin[reg] = this.x;
        this.elevar = true;
      } else {
        const t = this.tvm();
        const resolver = {
          N: Financeiro.resolverN,
          I: Financeiro.resolverI,
          PV: Financeiro.resolverPv,
          PMT: Financeiro.resolverPmt,
          FV: Financeiro.resolverFv,
        }[reg];
        const v = limitar(resolver(t));
        this.fin[reg] = v;
        this.empilhar(v);
      }
      this.ultimaFoiFinanceira = true;
    }

    ultimoFluxo() {
      const j = this.fin.N;
      if (j < 0 || j >= REGISTRADORES) throw new ErroCalc(6);
      return Math.trunc(j);
    }

    fluxo() {
      this.fimEntrada();
      const j = this.ultimoFluxo() + 1;
      if (j >= REGISTRADORES) throw new ErroCalc(6);
      this.regs[j] = this.x;
      this.contagens[j] = 1;
      this.fin.N = j;
    }

    repeticoesFluxo() {
      this.fimEntrada();
      if (this.x !== Math.floor(this.x) || this.x < 1 || this.x > 99) throw new ErroCalc(6);
      this.contagens[this.ultimoFluxo()] = this.x;
    }

    amortizar() {
      this.fimEntrada();
      const qtd = this.x;
      const r = Financeiro.amortizar(qtd, this.fin.N, this.fin.I, this.fin.PV, this.fin.PMT, this.begin, (v) =>
        this.arredondarVisor(v),
      );
      this.fin.PV = r.saldo;
      this.fin.N = r.n;
      this.lastX = qtd;
      // X = juros, Y = amortização do principal, Z = número de parcelas
      this.t = this.y;
      this.z = qtd;
      this.y = limitar(r.principal);
      this.x = limitar(r.juros);
      this.elevar = true;
    }

    /** Juros simples: n = dias, i = taxa anual, PV = principal. */
    jurosSimples() {
      this.fimEntrada();
      const dias = this.fin.N;
      const taxa = this.fin.I / 100;
      const pv = this.fin.PV;
      this.empilhar(limitar((-pv * taxa * dias) / 365));
      this.empilhar(-pv);
      this.empilhar(limitar((-pv * taxa * dias) / 360));
    }

    /** Y = data de liquidação, X = vencimento, i = rendimento desejado, PMT = cupom anual (%). */
    precoTitulo() {
      this.fimEntrada();
      const liquidacao = Calendario.ler(this.y, this.dmy);
      const vencimento = Calendario.ler(this.x, this.dmy);
      const b = Financeiro.precoTitulo(liquidacao, vencimento, this.fin.PMT, this.fin.I);
      this.lastX = this.x;
      this.x = limitar(b.preco);
      this.y = limitar(b.corrido);
      this.elevar = true;
    }

    /** Y = data de liquidação, X = vencimento, PV = preço, PMT = cupom anual (%). */
    rendimentoTitulo() {
      this.fimEntrada();
      const liquidacao = Calendario.ler(this.y, this.dmy);
      const vencimento = Calendario.ler(this.x, this.dmy);
      const r = Financeiro.rendimentoTitulo(liquidacao, vencimento, this.fin.PMT, Math.abs(this.fin.PV));
      this.lastX = this.x;
      this.x = limitar(r);
      this.y = this.z;
      this.z = this.t;
      this.elevar = true;
    }

    /** PV = custo, FV = valor residual, n = vida útil, i = fator do DB (%), X = ano. */
    depreciacao(fn) {
      this.fimEntrada();
      const ano = this.x;
      const { PV: custo, FV: residual, N: vida } = this.fin;
      const d =
        fn === "SL"
          ? Financeiro.linear(custo, residual, vida, ano)
          : fn === "SOYD"
            ? Financeiro.somaDosDigitos(custo, residual, vida, ano)
            : Financeiro.saldoDecrescente(custo, residual, vida, this.fin.I, ano);
      this.lastX = ano;
      this.x = limitar(d.restante);
      this.subir();
      this.x = limitar(d.valor);
      this.elevar = true;
    }

    // ---------- calendário

    somarData() {
      this.fimEntrada();
      const inicio = Calendario.ler(this.y, this.dmy);
      const resultado = Calendario.somarDias(inicio, Math.trunc(this.x));
      const v = Calendario.paraNumero(resultado, this.dmy);
      this.lastX = this.x;
      this.x = v;
      this.y = this.z;
      this.z = this.t;
      this.elevar = true;
      this.temporario = { tipo: "data", rotulo: Calendario.rotulo(resultado, this.dmy), diaSemana: diaDaSemana(resultado) };
    }

    diferencaDias() {
      this.fimEntrada();
      const de = Calendario.ler(this.y, this.dmy);
      const ate = Calendario.ler(this.x, this.dmy);
      this.lastX = this.x;
      this.x = Calendario.diasCorridos(de, ate);
      this.y = Calendario.dias30360(de, ate);
      this.elevar = true;
    }

    // ---------- estatística

    acumular(sinal) {
      this.fimEntrada();
      const r = this.regs;
      r[1] += sinal;
      r[2] += sinal * this.x;
      r[3] += sinal * this.x * this.x;
      r[4] += sinal * this.y;
      r[5] += sinal * this.y * this.y;
      r[6] += sinal * this.x * this.y;
      this.lastX = this.x;
      this.x = r[1];
      this.elevar = false;
    }

    media() {
      this.fimEntrada();
      const n = this.regs[1];
      if (n === 0) throw new ErroCalc(2);
      this.empilhar(this.regs[4] / n);
      this.empilhar(this.regs[2] / n);
    }

    desvioPadrao() {
      this.fimEntrada();
      const r = this.regs;
      const n = r[1];
      if (n <= 1) throw new ErroCalc(2);
      const sx = Math.sqrt(Math.max(0, (n * r[3] - r[2] * r[2]) / (n * (n - 1))));
      const sy = Math.sqrt(Math.max(0, (n * r[5] - r[4] * r[4]) / (n * (n - 1))));
      this.empilhar(sy);
      this.empilhar(sx);
    }

    mediaPonderada() {
      this.fimEntrada();
      if (this.regs[2] === 0) throw new ErroCalc(2);
      this.empilhar(limitar(this.regs[6] / this.regs[2]));
    }

    /** Regressão linear y = A + Bx: a estimativa vai para X e o coeficiente r para Y. */
    estimar(estimarX) {
      this.fimEntrada();
      const r = this.regs;
      const n = r[1];
      if (n < 2) throw new ErroCalc(2);
      const m = n * r[3] - r[2] * r[2];
      const p = n * r[6] - r[2] * r[4];
      const q = n * r[5] - r[4] * r[4];
      if (m === 0 || m * q <= 0) throw new ErroCalc(2);
      const b = p / m;
      const a = (r[4] - b * r[2]) / n;
      const coef = p / Math.sqrt(m * q);
      const entrada = this.x;
      let est;
      if (estimarX) {
        if (b === 0) throw new ErroCalc(2);
        est = (entrada - a) / b;
      } else {
        est = a + b * entrada;
      }
      this.lastX = entrada;
      this.x = limitar(coef);
      this.subir();
      this.x = limitar(est);
      this.elevar = true;
    }

    // ---------- visor

    formatar(v) {
      return formatar(v, this.fixDigitos, this.sci, this.virgula);
    }

    formatarTexto(v) {
      const f = this.formatar(v);
      return f.expoente ? `${f.texto}e${f.expoente.trim()}` : f.texto;
    }

    /** Tudo o que a interface precisa para desenhar o visor e os painéis. */
    visor() {
      const tmp = this.temporario;
      let expoente = "";
      let legenda = "";
      let texto;
      if (this.erro !== null) {
        legenda = LEGENDAS_ERRO[this.erro] ?? "";
        texto = `Erro ${this.erro}`;
      } else if (this.executando && !this.pausando) {
        texto = "executando";
      } else if (this.modoPrograma) {
        texto = this.textoLinha(this.pc);
      } else if (tmp && tmp.tipo === "mantissa") {
        texto = mantissa(this.x);
      } else if (tmp && tmp.tipo === "mensagem") {
        texto = tmp.texto;
      } else if (tmp && tmp.tipo === "data") {
        legenda = `${DIAS_SEMANA[tmp.diaSemana - 1]} (${tmp.diaSemana})`;
        texto = tmp.rotulo;
      } else if (this.entrada) {
        const e = this.entrada.visor(this.virgula);
        texto = e.texto;
        expoente = e.expoente;
      } else {
        const f = this.formatar(this.x);
        texto = f.texto;
        expoente = f.expoente;
      }
      return {
        texto,
        expoente,
        legenda,
        prefixo: rotuloPrefixo(this.pendente),
        begin: this.begin,
        dmy: this.dmy,
        compound: this.compound,
        programa: this.modoPrograma,
        executando: this.executando && !this.pausando,
        erro: this.erro !== null,
        pilha: [["T", this.t], ["Z", this.z], ["Y", this.y], ["X", this.x]].map(([r, v]) => [r, this.formatarTexto(v)]),
        registros: REGS_FIN.map((r) => [ROTULOS_FIN[r], this.formatarTexto(this.fin[r])]),
      };
    }

    // ---------- memória contínua

    /** Serializa o estado para que a calculadora lembre de tudo na próxima visita. */
    salvar() {
      return [
        `stack=${[this.x, this.y, this.z, this.t, this.lastX].join(",")}`,
        `lift=${this.elevar}`,
        `regs=${this.regs.join(",")}`,
        `counts=${this.contagens.join(",")}`,
        `fin=${REGS_FIN.map((r) => this.fin[r]).join(",")}`,
        `flags=${this.begin},${this.compound},${this.dmy},${this.sci},${this.virgula}`,
        `fix=${this.fixDigitos}`,
        `prog=${this.programa.map((linha) => linha.map((k) => k.codigo).join(" ")).join("|")}`,
      ].join("\n");
    }

    /** Restaura o que salvar() gerou; valores inválidos são ignorados. */
    restaurar(dados) {
      if (typeof dados !== "string") return;
      const mapa = new Map();
      for (const linha of dados.split("\n")) {
        const i = linha.indexOf("=");
        if (i > 0) mapa.set(linha.slice(0, i), linha.slice(i + 1));
      }
      const numeros = (chave) => {
        const t = mapa.get(chave);
        if (t === undefined) return null;
        const v = t.split(",").filter((s) => s.trim() !== "").map(Number);
        return v.every(Number.isFinite) ? v : null;
      };
      const pilha = numeros("stack");
      if (pilha && pilha.length >= 5) [this.x, this.y, this.z, this.t, this.lastX] = pilha;
      if (mapa.has("lift")) this.elevar = mapa.get("lift") === "true";
      numeros("regs")?.forEach((v, k) => {
        if (k < REGISTRADORES) this.regs[k] = v;
      });
      numeros("counts")?.forEach((v, k) => {
        if (k < REGISTRADORES && Number.isInteger(v) && v >= 1 && v <= 99) this.contagens[k] = v;
      });
      numeros("fin")?.forEach((v, k) => {
        if (k < REGS_FIN.length) this.fin[REGS_FIN[k]] = v;
      });
      const flags = mapa.get("flags")?.split(",").map((s) => s === "true");
      if (flags && flags.length >= 5) [this.begin, this.compound, this.dmy, this.sci, this.virgula] = flags;
      const fix = Number(mapa.get("fix"));
      if (Number.isInteger(fix)) this.fixDigitos = Math.min(9, Math.max(0, fix));
      this.programa = [];
      const prog = mapa.get("prog");
      if (prog) {
        for (const linha of prog.split("|")) {
          const teclas = linha.split(" ").map((c) => teclaPorCodigo(Number(c))).filter(Boolean);
          if (teclas.length && this.programa.length < MAX_LINHAS) this.programa.push(teclas);
        }
      }
    }
  }

  return {
    TECLAS,
    Tecla,
    LINHAS_TECLADO,
    teclaPorCodigo,
    teclaDoDigito,
    ErroCalc,
    analisar,
    rotuloPrefixo,
    formatar,
    arredondarVisor,
    mantissa,
    agrupar,
    Calendario,
    Financeiro,
    data,
    Motor,
  };
})();

if (typeof module === "object") module.exports = LogicaRpn;
