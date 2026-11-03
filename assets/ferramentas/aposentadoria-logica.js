"use strict";
/*
 * Planejamento de aposentadoria em termos reais (descontada a inflação pela equação de Fisher),
 * com capitalização mensal em todas as etapas.
 * Porte de core/aposentadoria/RetirementCalculator.kt e core/finance/Rates.kt da Calculadora
 * Multifunção. Taxas em decimal (0,04 = 4%) e valores em dinheiro de hoje.
 */
const LogicaAposentadoria = (() => {
  const IDADE_MAXIMA = 120;

  /** Taxa real (Fisher): (1 + i) ÷ (1 + inflação) − 1. */
  const taxaReal = (nominal, inflacao) => (1 + nominal) / (1 + inflacao) - 1;

  /** Taxa real mensal a partir das taxas anuais nominais de retorno e de inflação. */
  const realMensal = (nominalAnual, inflacaoAnual) => (1 + taxaReal(nominalAnual, inflacaoAnual)) ** (1 / 12) - 1;

  /**
   * Capital que sustenta para sempre retiradas de [retirada] no início de cada mês:
   * W·(1+r)/r (o rendimento do saldo após a retirada repõe a próxima retirada).
   */
  const capitalPerpetuidade = (retirada, taxa) => (retirada * (1 + taxa)) / taxa;

  /** Fator de valor futuro de aportes no fim de cada mês: ((1+r)^n − 1)/r. */
  const fatorValorFuturo = (taxa, meses) => (Math.abs(taxa) < 1e-12 ? meses : ((1 + taxa) ** meses - 1) / taxa);

  /** Valor presente de [meses] retiradas de [retirada] no início de cada mês. */
  function valorPresenteAntecipado(retirada, taxa, meses) {
    if (meses <= 0) return 0;
    if (Math.abs(taxa) < 1e-12) return retirada * meses;
    return ((retirada * (1 - (1 + taxa) ** -meses)) / taxa) * (1 + taxa);
  }

  /** Retirada mensal (início do mês) que esgota [capital] em [meses] meses. */
  function retiradaAntecipada(capital, taxa, meses) {
    if (meses <= 0 || capital <= 0) return 0;
    if (Math.abs(taxa) < 1e-12) return capital / meses;
    return (capital * taxa) / ((1 - (1 + taxa) ** -meses) * (1 + taxa));
  }

  /**
   * Idade em que o capital acaba retirando [retirada] no início de cada mês, ou null se os
   * rendimentos cobrem a retirada (o dinheiro não acaba).
   */
  function idadeQueAcaba(capital, retirada, taxa, idadeInicial) {
    if (retirada <= 0) return null;
    if (capital <= 0) return idadeInicial;
    // Rendimento do saldo após a retirada cobre a próxima retirada → perpetuidade
    if (taxa > 0 && (capital - retirada) * taxa >= retirada * (1 - 1e-9)) return null;
    let meses;
    if (Math.abs(taxa) < 1e-12) {
      meses = capital / retirada;
    } else {
      // B_n = (C − W(1+r)/r)(1+r)^n + W(1+r)/r … resolve B_n = 0 para retiradas antecipadas
      const k = (retirada * (1 + taxa)) / taxa;
      const razao = k / (k - capital);
      if (razao <= 0) return null;
      meses = Math.log(razao) / Math.log(1 + taxa);
    }
    return idadeInicial + meses / 12;
  }

  /**
   * entrada: { idadeAtual, idadeAposentadoria, expectativaVida, patrimonioAtual, aporteMensal,
   * rendaDesejada, outrasRendas, inflacaoAnual, retornoAntes, retornoDurante,
   * estrategia: "perpetuidade" | "consumir" }.
   */
  function calcular(e) {
    if (!(e.idadeAtual >= 0 && e.idadeAtual < e.idadeAposentadoria)) {
      throw new RangeError("Idade de aposentadoria deve ser maior que a atual");
    }
    if (!(e.expectativaVida > e.idadeAposentadoria)) {
      throw new RangeError("Expectativa de vida deve ser maior que a idade de aposentadoria");
    }

    const anosAteAposentar = e.idadeAposentadoria - e.idadeAtual;
    const anosAposentado = e.expectativaVida - e.idadeAposentadoria;
    const mesesAcumulando = anosAteAposentar * 12;
    const mesesRetirando = anosAposentado * 12;

    const rAntes = realMensal(e.retornoAntes, e.inflacaoAnual);
    const rDurante = realMensal(e.retornoDurante, e.inflacaoAnual);
    const necessidade = Math.max(0, e.rendaDesejada - e.outrasRendas);

    const perpetuidadeImpossivel = e.estrategia === "perpetuidade" && rDurante <= 0 && necessidade > 0;
    let capitalNecessario;
    if (necessidade === 0) capitalNecessario = 0;
    else if (e.estrategia === "perpetuidade" && rDurante > 0) capitalNecessario = capitalPerpetuidade(necessidade, rDurante);
    // Sem rendimento real positivo não há perpetuidade: usa o consumo até a expectativa.
    else capitalNecessario = valorPresenteAntecipado(necessidade, rDurante, mesesRetirando);

    const crescimento = (1 + rAntes) ** mesesAcumulando;
    const fator = fatorValorFuturo(rAntes, mesesAcumulando);
    const capitalProjetado = e.patrimonioAtual * crescimento + e.aporteMensal * fator;
    const aporteNecessario = Math.max(0, (capitalNecessario - e.patrimonioAtual * crescimento) / fator);

    const sustentavel =
      e.estrategia === "perpetuidade"
        ? rDurante > 0
          ? (capitalProjetado * rDurante) / (1 + rDurante)
          : 0
        : retiradaAntecipada(capitalProjetado, rDurante, mesesRetirando);

    const fatorInflacao = (1 + e.inflacaoAnual) ** anosAteAposentar;

    return {
      anosAteAposentar,
      anosAposentado,
      realMensalAntes: rAntes,
      realMensalDurante: rDurante,
      /** Renda que precisa sair do patrimônio (desejada − outras rendas). */
      rendaNecessaria: necessidade,
      capitalNecessario,
      capitalProjetado,
      aporteNecessario,
      /** Projetado − necessário (positivo = sobra). */
      sobra: capitalProjetado - capitalNecessario,
      /** Renda mensal possível com o patrimônio projetado, já somando as outras rendas. */
      rendaSustentavel: sustentavel + e.outrasRendas,
      idadeQueAcaba: idadeQueAcaba(capitalProjetado, necessidade, rDurante, e.idadeAposentadoria),
      fatorInflacao,
      rendaNominal: necessidade * fatorInflacao,
      capitalNecessarioNominal: capitalNecessario * fatorInflacao,
      capitalProjetadoNominal: capitalProjetado * fatorInflacao,
      projecao: projecao(e, rAntes, rDurante, necessidade, aporteNecessario),
      perpetuidadeImpossivel,
    };
  }

  /** Projeção anual (valores de hoje) do plano atual e do plano com o aporte necessário. */
  function projecao(e, rAntes, rDurante, necessidade, aporteNecessario) {
    const idadeFinal = Math.min(IDADE_MAXIMA, Math.max(e.expectativaVida + 5, e.idadeAposentadoria + 1));
    let atual = e.patrimonioAtual;
    let necessario = e.patrimonioAtual;
    const pontos = [{ idade: e.idadeAtual, atual, necessario }];
    for (let idade = e.idadeAtual + 1; idade <= idadeFinal; idade++) {
      for (let m = 0; m < 12; m++) {
        if (idade <= e.idadeAposentadoria) {
          atual = atual * (1 + rAntes) + e.aporteMensal;
          necessario = necessario * (1 + rAntes) + aporteNecessario;
        } else {
          atual = Math.max(0, (atual - necessidade) * (1 + rDurante));
          necessario = Math.max(0, (necessario - necessidade) * (1 + rDurante));
        }
      }
      pontos.push({ idade, atual, necessario });
    }
    return pontos;
  }

  /** Validação das idades da tela: "faixa", "aposentadoria", "expectativa" ou null. */
  function erroIdades(atual, aposentadoria, expectativa) {
    const presentes = [atual, aposentadoria, expectativa].filter((v) => v !== null && v !== undefined);
    if (presentes.some((v) => v < 0 || v > IDADE_MAXIMA)) return "faixa";
    if (atual !== null && aposentadoria !== null && aposentadoria <= atual) return "aposentadoria";
    if (aposentadoria !== null && expectativa !== null && expectativa <= aposentadoria) return "expectativa";
    return null;
  }

  return {
    taxaReal,
    realMensal,
    capitalPerpetuidade,
    fatorValorFuturo,
    valorPresenteAntecipado,
    retiradaAntecipada,
    idadeQueAcaba,
    calcular,
    erroIdades,
  };
})();

if (typeof module === "object") module.exports = LogicaAposentadoria;
