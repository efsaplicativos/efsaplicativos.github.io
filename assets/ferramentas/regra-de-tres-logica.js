"use strict";
/*
 * Regra de três simples e composta.
 *
 * Simples: com quatro valores e uma incógnita, x = b·c/a quando as grandezas são diretamente
 * proporcionais e x = a·b/c quando são inversamente proporcionais.
 *
 * Composta: a incógnita fica na grandeza alvo; cada grandeza auxiliar entra como razão
 * (novo ÷ conhecido) se for direta, ou (conhecido ÷ novo) se for inversa.
 */
const LogicaRegraDeTres = (() => {
  const vazio = (valor) => valor === null || valor === undefined || !Number.isFinite(valor);

  /** Simples: a está para b assim como c está para x. `inversa` troca a proporção. */
  function simples({ a = null, b = null, c = null, inversa = false } = {}) {
    if (vazio(a) || vazio(b) || vazio(c)) return { incompleto: true };
    if (a === 0 || (!inversa && b === 0) || (inversa && c === 0)) return { erro: "zero" };
    if (a < 0 || b < 0 || c < 0) return { erro: "negativo" };
    const x = inversa ? (a * b) / c : (b * c) / a;
    if (!Number.isFinite(x)) return { erro: "grande" };
    return { x, a, b, c, inversa };
  }

  /**
   * Composta: `alvo` é o valor conhecido da grandeza que tem a incógnita;
   * `grandezas` é a lista de { conhecido, novo, inversa }.
   */
  function composta({ alvo = null, grandezas = [] } = {}) {
    if (vazio(alvo)) return { incompleto: true };
    const validas = grandezas.filter((g) => g && !vazio(g.conhecido) && !vazio(g.novo));
    if (validas.length === 0) return { incompleto: true };
    if (validas.some((g) => g.conhecido === 0 || g.novo === 0)) return { erro: "zero" };
    if (alvo < 0 || validas.some((g) => g.conhecido < 0 || g.novo < 0)) return { erro: "negativo" };

    let fator = 1;
    for (const g of validas) fator *= g.inversa ? g.conhecido / g.novo : g.novo / g.conhecido;
    const x = alvo * fator;
    if (!Number.isFinite(x)) return { erro: "grande" };
    return { x, alvo, fator, grandezas: validas };
  }

  return { simples, composta };
})();

if (typeof module === "object") module.exports = LogicaRegraDeTres;
