"use strict";
/*
 * Preço por quilo, por litro e por unidade: compara embalagens de tamanhos diferentes e diz qual
 * sai mais barata.
 *
 * As unidades são normalizadas antes da conta: grama e miligrama viram quilo, mililitro vira litro.
 * O custo é sempre por quilo (kg), por litro (L) ou por unidade (un), conforme a grandeza escolhida.
 */
const LogicaPrecoPorQuilo = (() => {
  const UNIDADES = {
    kg: { id: "kg", nome: "quilo", base: "kg", fator: 1 },
    g: { id: "g", nome: "grama", base: "kg", fator: 0.001 },
    mg: { id: "mg", nome: "miligrama", base: "kg", fator: 0.000001 },
    l: { id: "l", nome: "litro", base: "l", fator: 1 },
    ml: { id: "ml", nome: "mililitro", base: "l", fator: 0.001 },
    un: { id: "un", nome: "unidade", base: "un", fator: 1 },
  };
  const MELHOR = { kg: "kg", l: "L", un: "unidade" };
  const centavos = (valor) => Math.round(valor * 100) / 100;
  const vazio = (valor) => valor === null || valor === undefined || !Number.isFinite(valor);

  /** Custo por quilo, litro ou unidade de uma embalagem. */
  function item({ nome = "", preco = null, quantidade = null, unidade = "kg" } = {}) {
    if (vazio(preco) || vazio(quantidade)) return null;
    const u = UNIDADES[unidade];
    if (!u || preco < 0 || quantidade <= 0) return null;
    const total = quantidade * u.fator;
    return {
      nome: String(nome || "").trim() || `${quantidade} ${u.nome}`,
      preco,
      quantidade,
      unidade: u.id,
      base: u.base,
      total,
      custo: centavos(preco / total),
    };
  }

  /**
   * Compara as embalagens. Grandezas diferentes (peso e volume, por exemplo) não se comparam:
   * nesse caso devolve { erro: "grandezas" }.
   */
  function comparar(itens = []) {
    const validos = itens.map(item).filter(Boolean);
    if (validos.length < 2) return { incompleto: true };
    const base = validos[0].base;
    if (validos.some((i) => i.base !== base)) return { erro: "grandezas" };

    const ordenados = [...validos].sort((a, b) => a.custo - b.custo);
    const melhor = ordenados[0];
    const pior = ordenados[ordenados.length - 1];
    const economia = pior.custo > 0 ? centavos(((pior.custo - melhor.custo) / pior.custo) * 100) : 0;
    return {
      itens: ordenados,
      base,
      unidadeDaBase: MELHOR[base],
      melhor,
      economia,
      diferenca: centavos(pior.custo - melhor.custo),
    };
  }

  return { UNIDADES, item, comparar };
})();

if (typeof module === "object") module.exports = LogicaPrecoPorQuilo;
