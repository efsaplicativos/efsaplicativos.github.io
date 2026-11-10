"use strict";
/*
 * Porcentagem: as quatro contas que as pessoas procuram.
 *  - quanto é X% de um valor;
 *  - aumentar ou diminuir um valor em X%;
 *  - variação percentual entre dois valores;
 *  - quantos por cento uma parte representa do total.
 * Aumentos e descontos em cadeia são aplicados um sobre o resultado do outro (não somam).
 */
const LogicaPorcentagem = (() => {
  const centavos = (valor) => Math.round(valor * 100) / 100;
  const vazio = (valor) => valor === null || valor === undefined || !Number.isFinite(valor);

  /** X% de um valor. */
  function parte({ percentual = null, valor = null } = {}) {
    if (vazio(percentual) || vazio(valor)) return { incompleto: true };
    if (valor < 0) return { erro: "negativo" };
    return { resultado: centavos((valor * percentual) / 100), percentual, valor };
  }

  /** Valor com aumento (sinal 1) ou desconto (sinal -1) de X%. */
  function ajuste({ valor = null, percentual = null, desconto: ehDesconto = false } = {}) {
    if (vazio(valor) || vazio(percentual)) return { incompleto: true };
    if (valor < 0 || percentual < 0) return { erro: "negativo" };
    if (!ehDesconto && percentual > 100) return { erro: "descontoGrande" };
    const diferenca = centavos((valor * percentual) / 100);
    const resultado = ehDesconto ? centavos(valor - diferenca) : centavos(valor + diferenca);
    return { resultado, diferenca, valor, percentual, desconto: ehDesconto };
  }

  /** Variação percentual de um valor para outro. */
  function variacao({ de = null, para = null } = {}) {
    if (vazio(de) || vazio(para)) return { incompleto: true };
    if (de === 0) return { erro: "zero" };
    if (de < 0 || para < 0) return { erro: "negativo" };
    const percentual = ((para - de) / de) * 100;
    return { percentual: centavos(percentual), de, para, subiu: para >= de };
  }

  /** Quantos por cento `parte` representa de `total`. */
  function proporcao({ parte: valorParte = null, total = null } = {}) {
    if (vazio(valorParte) || vazio(total)) return { incompleto: true };
    if (total === 0) return { erro: "zero" };
    if (valorParte < 0 || total < 0) return { erro: "negativo" };
    return { percentual: centavos((valorParte / total) * 100), parte: valorParte, total };
  }

  /** Aplica vários percentuais em cadeia, um sobre o resultado do anterior. */
  function cadeia({ valor = null, percentuais = [] } = {}) {
    if (vazio(valor) || valor < 0) return { incompleto: true };
    const lista = percentuais.filter((p) => Number.isFinite(p));
    if (!lista.length) return { incompleto: true };
    let atual = valor;
    for (const percentual of lista) atual = atual * (1 + percentual / 100);
    return { resultado: centavos(atual), valor, percentuais: lista, total: centavos(atual - valor) };
  }

  return { parte, ajuste, variacao, proporcao, cadeia };
})();

if (typeof module === "object") module.exports = LogicaPorcentagem;
