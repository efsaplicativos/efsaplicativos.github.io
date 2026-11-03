"use strict";
/*
 * Juros compostos com aportes mensais, simulados mês a mês.
 * Porte de core/aportes/Contributions.kt e core/finance/Rates.kt da Calculadora Multifunção:
 * taxa anual vira mensal pela taxa equivalente (não por taxa ÷ 12), o aporte pode ser no início
 * ou no fim do mês e ter reajuste anual, e taxa e prazo necessários são resolvidos numericamente.
 */
const LogicaAportes = (() => {
  /** Prazo máximo simulado (100 anos). */
  const MAX_MESES = 1200;

  /** Taxa efetiva mensal (decimal) a partir da taxa em % ao mês ou ao ano. */
  const taxaMensal = (taxaPercentual, periodo) =>
    periodo === "ano" ? (1 + taxaPercentual / 100) ** (1 / 12) - 1 : taxaPercentual / 100;

  const anualDeMensal = (mensal) => (1 + mensal) ** 12 - 1;

  /**
   * Plano: { inicial, aporte, taxaMensal, meses, momento: "inicio" | "fim", reajusteAnual }.
   * O reajuste anual (decimal) é aplicado ao aporte a cada 12 meses.
   */
  const plano = (p) => ({ inicial: 0, aporte: 0, taxaMensal: 0, meses: 0, momento: "fim", reajusteAnual: 0, ...p });

  /** Valor do aporte no mês [mes] (a partir de 1), com o reajuste anual. */
  const aporteNoMes = (p, mes) => p.aporte * (1 + p.reajusteAnual) ** Math.floor((mes - 1) / 12);

  function simular(entrada) {
    const p = plano(entrada);
    const linhas = [];
    let saldo = p.inicial;
    let investido = p.inicial;
    for (let m = 1; m <= p.meses; m++) {
      const aporte = aporteNoMes(p, m);
      let juros;
      if (p.momento === "inicio") {
        saldo += aporte;
        juros = saldo * p.taxaMensal;
        saldo += juros;
      } else {
        juros = saldo * p.taxaMensal;
        saldo += juros + aporte;
      }
      investido += aporte;
      linhas.push({ mes: m, aporte, juros, investido, saldo });
    }
    const ultima = linhas[linhas.length - 1];
    const valorFinal = ultima ? ultima.saldo : p.inicial;
    const totalInvestido = ultima ? ultima.investido : p.inicial;
    const totalJuros = valorFinal - totalInvestido;
    return {
      plano: p,
      linhas,
      valorFinal,
      totalInvestido,
      totalJuros,
      /** Participação dos juros no valor final, em %. */
      participacaoJuros: valorFinal > 0 ? (totalJuros / valorFinal) * 100 : 0,
    };
  }

  /** Valor final em poder de compra de hoje, descontando a inflação anual (decimal). */
  const valorReal = (sim, inflacaoAnual) => sim.valorFinal / (1 + inflacaoAnual) ** (sim.plano.meses / 12);

  /** Linhas agrupadas por ano (blocos de 12 meses; o último pode ser menor). */
  function anual(sim) {
    const anos = [];
    for (let i = 0; i < sim.linhas.length; i += 12) {
      const bloco = sim.linhas.slice(i, i + 12);
      const ultima = bloco[bloco.length - 1];
      anos.push({
        ano: anos.length + 1,
        aportes: bloco.reduce((s, l) => s + l.aporte, 0),
        juros: bloco.reduce((s, l) => s + l.juros, 0),
        investido: ultima.investido,
        saldo: ultima.saldo,
      });
    }
    return anos;
  }

  /** Valor final sem guardar as linhas (usado nos métodos numéricos). */
  function valorFinal(entrada) {
    const p = plano(entrada);
    let saldo = p.inicial;
    for (let m = 1; m <= p.meses; m++) {
      const aporte = aporteNoMes(p, m);
      saldo = p.momento === "inicio" ? (saldo + aporte) * (1 + p.taxaMensal) : saldo * (1 + p.taxaMensal) + aporte;
    }
    return saldo;
  }

  const sucesso = (p, resolvido, jaAtingida = false) => ({ simulacao: simular(p), resolvido, jaAtingida });

  /**
   * alvo: "final" | "aporte" | "prazo" | "taxa" | "inicial".
   * meta é o valor final desejado (todos os alvos exceto "final"). Os campos do plano
   * correspondentes ao alvo são ignorados. Devolve { incompleto }, { erro } ou
   * { simulacao, resolvido, jaAtingida }: resolvido é o aporte, o prazo em meses, a taxa mensal
   * ou o capital inicial calculado.
   */
  function resolver(alvo, entrada, meta) {
    const base = plano(entrada);
    if (base.inicial < 0 || base.aporte < 0 || base.reajusteAnual < -0.99) return { erro: "negativo" };
    if (alvo !== "prazo") {
      if (base.meses <= 0) return { erro: "prazo" };
      if (base.meses > MAX_MESES) return { erro: "prazoLongo" };
    }
    if (alvo !== "taxa" && base.taxaMensal <= -1) return { erro: "negativo" };
    if (alvo === "final") return sucesso(base, valorFinal(base));
    if (meta === null || meta === undefined) return { incompleto: true };
    if (meta <= 0) return { erro: "meta" };

    switch (alvo) {
      case "aporte": {
        // O valor final é linear no aporte: F = F(aporte 0) + aporte · F(aporte 1, sem capital).
        const semAporte = valorFinal({ ...base, aporte: 0 });
        const porUnidade = valorFinal({ ...base, inicial: 0, aporte: 1 });
        if (semAporte >= meta) return sucesso({ ...base, aporte: 0 }, 0, true);
        if (porUnidade <= 0) return { erro: "inalcancavel" };
        const a = (meta - semAporte) / porUnidade;
        return sucesso({ ...base, aporte: a }, a);
      }
      case "inicial": {
        const dosAportes = valorFinal({ ...base, inicial: 0 });
        const crescimento = (1 + base.taxaMensal) ** base.meses;
        if (dosAportes >= meta) return sucesso({ ...base, inicial: 0 }, 0, true);
        if (crescimento <= 0) return { erro: "inalcancavel" };
        const p0 = (meta - dosAportes) / crescimento;
        return sucesso({ ...base, inicial: p0 }, p0);
      }
      case "prazo": {
        if (base.inicial <= 0 && base.aporte <= 0) return { erro: "nada" };
        if (base.inicial >= meta) return sucesso({ ...base, meses: 0 }, 0, true);
        let saldo = base.inicial;
        for (let m = 1; m <= MAX_MESES; m++) {
          const aporte = aporteNoMes(base, m);
          saldo =
            base.momento === "inicio" ? (saldo + aporte) * (1 + base.taxaMensal) : saldo * (1 + base.taxaMensal) + aporte;
          if (saldo >= meta) return sucesso({ ...base, meses: m }, m);
        }
        return { erro: "inalcancavel" };
      }
      case "taxa":
        return resolverTaxa(base, meta);
      default:
        return { incompleto: true };
    }
  }

  function resolverTaxa(base, meta) {
    if (base.inicial <= 0 && base.aporte <= 0) return { erro: "nada" };
    const vf = (taxa) => valorFinal({ ...base, taxaMensal: taxa });
    // O valor final cresce com a taxa; procura por bisseção entre −50% e +100% ao mês.
    let baixo = -0.5;
    let alto = 1;
    if (vf(baixo) > meta || vf(alto) < meta) return { erro: "taxaNaoEncontrada" };
    for (let i = 0; Math.abs(alto - baixo) > 1e-14 && i < 200; i++) {
      const meio = (baixo + alto) / 2;
      if (vf(meio) < meta) baixo = meio;
      else alto = meio;
    }
    const taxa = (baixo + alto) / 2;
    return sucesso({ ...base, taxaMensal: taxa }, taxa);
  }

  return { MAX_MESES, taxaMensal, anualDeMensal, aporteNoMes, simular, valorReal, anual, valorFinal, resolver };
})();

if (typeof module === "object") module.exports = LogicaAportes;
