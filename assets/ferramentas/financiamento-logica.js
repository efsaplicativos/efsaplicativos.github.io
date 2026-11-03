"use strict";
/*
 * Financiamento pelas tabelas Price, SAC e SAM, com custos mensais fixos e CET.
 * Porte de core/emprestimo/LoanCalculator.kt e core/finance/Rates.kt da Calculadora
 * Multifunção: taxa anual vira mensal pela taxa equivalente, os valores são arredondados em
 * centavos mês a mês e a última parcela é ajustada para o saldo devedor zerar exatamente.
 */
const LogicaFinanciamento = (() => {
  const SISTEMAS = ["price", "sac", "sam"];
  const MAX_MESES = 600;

  /** Taxa efetiva mensal (decimal) a partir da taxa em % ao mês ou ao ano. */
  const taxaMensal = (taxaPercentual, periodo) =>
    periodo === "ano" ? (1 + taxaPercentual / 100) ** (1 / 12) - 1 : taxaPercentual / 100;

  const anualDeMensal = (mensal) => (1 + mensal) ** 12 - 1;

  /** Arredondamento com empate para o par, como kotlin.math.round. */
  function arredondarPar(x) {
    const r = Math.round(x);
    return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
  }

  /** Arredonda para centavos (meio para cima, com a mesma folga de 1e-9 do app). */
  function centavos(valor) {
    const sinal = valor < 0 ? -1 : 1;
    return (sinal * arredondarPar(Math.abs(valor) * 100 + 1e-9)) / 100;
  }

  /** Parcela da Tabela Price, sem arredondamento. */
  function parcelaPrice(principal, taxa, meses) {
    if (!(meses > 0)) throw new RangeError("Prazo deve ser positivo");
    if (taxa === 0) return principal / meses;
    return (principal * taxa) / (1 - (1 + taxa) ** -meses);
  }

  /**
   * Tabela de amortização. Cada linha: { mes, parcela, juros, amortizacao, custos, saldo }.
   * A parcela inclui os custos fixos do mês (seguro, tarifas).
   */
  function tabela(principal, taxa, meses, sistema, custosMensais = 0) {
    if (!(principal > 0)) throw new RangeError("Valor financiado deve ser positivo");
    if (!(meses > 0)) throw new RangeError("Prazo deve ser positivo");
    if (!(taxa >= 0)) throw new RangeError("Taxa não pode ser negativa");

    const pmtExata = parcelaPrice(principal, taxa, meses);
    const amortizacaoSac = principal / meses;
    // Amortização exata do mês k na Price: (PMT − P·i)·(1+i)^(k−1)
    const primeiraAmortizacaoPrice = pmtExata - principal * taxa;

    const linhas = [];
    let saldo = centavos(principal);
    for (let k = 1; k <= meses; k++) {
      const juros = centavos(saldo * taxa);
      // Amortização exata de cada sistema arredondada em centavos. Na Price isso mantém a
      // parcela constante (±1 centavo) sem acumular diferença para a última parcela.
      const amortizacaoPrice = primeiraAmortizacaoPrice * (1 + taxa) ** (k - 1);
      let amortizacao =
        sistema === "price"
          ? centavos(amortizacaoPrice)
          : sistema === "sac"
            ? centavos(amortizacaoSac)
            : centavos((amortizacaoPrice + amortizacaoSac) / 2);
      // Última parcela (ou excesso por arredondamento) quita exatamente o saldo.
      if (k === meses || amortizacao > saldo) amortizacao = saldo;
      amortizacao = Math.max(0, amortizacao);
      saldo = centavos(saldo - amortizacao);
      linhas.push({
        mes: k,
        parcela: centavos(amortizacao + juros + custosMensais),
        juros,
        amortizacao,
        custos: custosMensais,
        saldo: Math.abs(saldo),
      });
    }
    return resumo({ sistema, principal, taxa, meses, custosMensais, linhas });
  }

  function resumo(t) {
    const parcelas = t.linhas.map((l) => l.parcela);
    const soma = (campo) => t.linhas.reduce((s, l) => s + l[campo], 0);
    const totalJuros = soma("juros");
    return {
      ...t,
      primeiraParcela: parcelas[0],
      ultimaParcela: parcelas[parcelas.length - 1],
      maiorParcela: Math.max(...parcelas),
      menorParcela: Math.min(...parcelas),
      totalPago: soma("parcela"),
      totalJuros,
      totalCustos: soma("custos"),
      /** Juros totais como fração do valor financiado. */
      jurosSobrePrincipal: t.principal > 0 ? totalJuros / t.principal : 0,
    };
  }

  /**
   * TIR mensal de um fluxo "recebe [recebido] hoje e paga [pagamentos] nos meses 1..n", por
   * bisseção (o VPL é monotônico nesse fluxo). Devolve null se não houver solução.
   */
  function tir(recebido, pagamentos) {
    if (!(recebido > 0) || pagamentos.length === 0) return null;
    const vpl = (taxa) => {
      let total = recebido;
      let fator = 1;
      for (const p of pagamentos) {
        fator /= 1 + taxa;
        total -= p * fator;
      }
      return total;
    };
    let baixo = -0.99;
    let alto = 1;
    let vplBaixo = vpl(baixo);
    let vplAlto = vpl(alto);
    // Amplia o intervalo superior se necessário (taxas muito altas).
    for (let i = 0; vplBaixo * vplAlto > 0 && i < 20; i++) {
      alto *= 2;
      vplAlto = vpl(alto);
    }
    if (vplBaixo * vplAlto > 0) return null;
    for (let i = 0; i < 300; i++) {
      const meio = (baixo + alto) / 2;
      const vplMeio = vpl(meio);
      if (Math.abs(vplMeio) < 1e-10) return meio;
      if (vplBaixo * vplMeio < 0) {
        alto = meio;
        vplAlto = vplMeio;
      } else {
        baixo = meio;
        vplBaixo = vplMeio;
      }
    }
    return (baixo + alto) / 2;
  }

  /** CET mensal: TIR do fluxo com as parcelas, incluindo os custos fixos. */
  const cetMensal = (t) => tir(t.principal, t.linhas.map((l) => l.parcela));

  /** Prazo em anos para meses inteiros, entre 1 e [maxMeses]. */
  const anosParaMeses = (anos, maxMeses = 1200) => Math.min(maxMeses, Math.max(1, arredondarPar(anos * 12)));

  /**
   * Lê as entradas da tela (já como números ou null) e devolve { incompleto }, { erros } ou
   * { financiado, taxa, meses, custos, tabelas } com as três tabelas, como EmprestimoScreen.kt.
   */
  function simular({ valor, entrada, taxaPercentual, periodo = "mes", prazo, unidade = "meses", custos }) {
    const erros = {};
    const e = entrada ?? 0;
    if (valor !== null && valor !== undefined && e > 0 && e >= valor) erros.entrada = true;
    if (taxaPercentual !== null && taxaPercentual !== undefined && (taxaPercentual > 100 || taxaPercentual < 0)) {
      erros.taxa = true;
    }
    let meses = null;
    if (prazo !== null && prazo !== undefined) {
      meses = arredondarPar(unidade === "anos" ? prazo * 12 : prazo);
      if (meses < 1 || meses > MAX_MESES) erros.prazo = true;
    }
    if (Object.keys(erros).length) return { erros };
    if (!(valor > 0) || taxaPercentual === null || taxaPercentual === undefined || meses === null) {
      return { incompleto: true };
    }
    const financiado = valor - e;
    const taxa = taxaMensal(taxaPercentual, periodo);
    const c = custos ?? 0;
    const tabelas = {};
    for (const s of SISTEMAS) tabelas[s] = tabela(financiado, taxa, meses, s, c);
    return { financiado, taxa, meses, custos: c, tabelas };
  }

  return {
    SISTEMAS,
    MAX_MESES,
    taxaMensal,
    anualDeMensal,
    centavos,
    parcelaPrice,
    tabela,
    tir,
    cetMensal,
    anosParaMeses,
    simular,
  };
})();

if (typeof module === "object") module.exports = LogicaFinanciamento;
