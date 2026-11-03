"use strict";
/*
 * Juros simples: J = C · i · t e M = C + J = C · (1 + i · t).
 * Porte de core/jurossimples/SimpleInterest.kt da Calculadora Multifunção. Taxa e prazo em
 * unidades diferentes são convertidos de forma proporcional pelo ano comercial
 * (1 ano = 12 meses = 360 dias; 1 mês = 30 dias), o padrão da matemática financeira.
 */
const LogicaJurosSimples = (() => {
  /** Duração de cada unidade em dias comerciais. */
  const DIAS = { dia: 1, mes: 30, ano: 360 };
  const UNIDADES = Object.keys(DIAS);

  /** Converte uma quantidade de uma unidade para outra. Ex.: 2 anos → 24 meses. */
  const converter = (valor, de, para) => (valor * DIAS[de]) / DIAS[para];

  /** Taxa decimal por [unidadeTaxa] convertida para a unidade do prazo (proporcional). */
  const taxaNaUnidadeDoPrazo = (taxa, unidadeTaxa, unidadePrazo) =>
    (taxa * DIAS[unidadePrazo]) / DIAS[unidadeTaxa];

  const vazio = (v) => v === null || v === undefined;

  /**
   * alvo: "juros" | "capital" | "taxa" | "prazo".
   * conhecido: "montante" | "juros" — qual dos dois foi informado em valorConhecido.
   * taxaPercentual é a taxa em % por unidadeTaxa; prazo está em unidadePrazo.
   * Devolve { incompleto: true }, { erro } ou { resultado }. Campos não usados pelo alvo são
   * ignorados.
   */
  function resolver({
    alvo,
    capital = null,
    taxaPercentual = null,
    unidadeTaxa = "mes",
    prazo = null,
    unidadePrazo = "mes",
    conhecido = "montante",
    valorConhecido = null,
  }) {
    const sucesso = (c, j, taxa, t) => ({
      resultado: {
        capital: c,
        juros: j,
        montante: c + j,
        taxa,
        unidadeTaxa,
        prazo: t,
        unidadePrazo,
      },
    });

    switch (alvo) {
      case "juros": {
        if (vazio(capital) || vazio(taxaPercentual) || vazio(prazo)) return { incompleto: true };
        if (capital <= 0) return { erro: "capital" };
        if (taxaPercentual < 0 || prazo < 0) return { erro: "negativo" };
        const i = taxaNaUnidadeDoPrazo(taxaPercentual / 100, unidadeTaxa, unidadePrazo);
        return sucesso(capital, capital * i * prazo, taxaPercentual / 100, prazo);
      }
      case "capital": {
        if (vazio(valorConhecido) || vazio(taxaPercentual) || vazio(prazo)) return { incompleto: true };
        if (valorConhecido < 0 || taxaPercentual < 0 || prazo < 0) return { erro: "negativo" };
        const it = taxaNaUnidadeDoPrazo(taxaPercentual / 100, unidadeTaxa, unidadePrazo) * prazo;
        let c;
        if (conhecido === "montante") {
          c = valorConhecido / (1 + it);
        } else {
          if (it <= 0) return { erro: taxaPercentual === 0 ? "taxa" : "prazo" };
          c = valorConhecido / it;
        }
        if (c <= 0) return { erro: "capital" };
        return sucesso(c, c * it, taxaPercentual / 100, prazo);
      }
      case "taxa": {
        if (vazio(capital) || vazio(valorConhecido) || vazio(prazo)) return { incompleto: true };
        if (capital <= 0) return { erro: "capital" };
        if (prazo <= 0) return { erro: "prazo" };
        if (valorConhecido < 0) return { erro: "negativo" };
        const j = conhecido === "montante" ? valorConhecido - capital : valorConhecido;
        if (j < 0) return { erro: "montanteMenor" };
        // Taxa por unidade do prazo, convertida para a unidade escolhida para exibição.
        const taxaPorPrazo = j / (capital * prazo);
        return sucesso(capital, j, (taxaPorPrazo * DIAS[unidadeTaxa]) / DIAS[unidadePrazo], prazo);
      }
      case "prazo": {
        if (vazio(capital) || vazio(valorConhecido) || vazio(taxaPercentual)) return { incompleto: true };
        if (capital <= 0) return { erro: "capital" };
        if (taxaPercentual <= 0) return { erro: "taxa" };
        if (valorConhecido < 0) return { erro: "negativo" };
        const j = conhecido === "montante" ? valorConhecido - capital : valorConhecido;
        if (j < 0) return { erro: "montanteMenor" };
        const i = taxaNaUnidadeDoPrazo(taxaPercentual / 100, unidadeTaxa, unidadePrazo);
        return sucesso(capital, j, taxaPercentual / 100, j / (capital * i));
      }
      default:
        return { incompleto: true };
    }
  }

  /** Taxa (decimal) do resultado convertida proporcionalmente para outra unidade. */
  const taxaEm = (r, unidade) => (r.taxa * DIAS[unidade]) / DIAS[r.unidadeTaxa];

  /** Prazo do resultado convertido para outra unidade. */
  const prazoEm = (r, unidade) => converter(r.prazo, r.unidadePrazo, unidade);

  /** Taxa decimal por unidade do prazo (a usada na fórmula J = C·i·t). */
  const taxaPorUnidadeDoPrazo = (r) => taxaEm(r, r.unidadePrazo);

  /**
   * Evolução do montante na unidade do prazo. Prazos longos são agrupados em no máximo
   * [maxLinhas] linhas; o último período (mesmo fracionário) sempre aparece.
   */
  function evolucao(r, maxLinhas = 120) {
    const t = r.prazo;
    const linhas = [{ periodo: 0, juros: 0, montante: r.capital }];
    if (!(t > 0) || !Number.isFinite(t)) return linhas;
    const inteiro = Math.floor(t);
    const passo = Math.max(1, Math.ceil(inteiro / maxLinhas));
    const porPeriodo = r.capital * taxaPorUnidadeDoPrazo(r);
    for (let k = passo; k <= inteiro; k += passo) {
      linhas.push({ periodo: k, juros: porPeriodo * k, montante: r.capital + porPeriodo * k });
    }
    if (linhas[linhas.length - 1].periodo < t - 1e-9) {
      linhas.push({ periodo: t, juros: porPeriodo * t, montante: r.capital + porPeriodo * t });
    }
    return linhas;
  }

  return { DIAS, UNIDADES, converter, taxaNaUnidadeDoPrazo, resolver, taxaEm, prazoEm, taxaPorUnidadeDoPrazo, evolucao };
})();

if (typeof module === "object") module.exports = LogicaJurosSimples;
