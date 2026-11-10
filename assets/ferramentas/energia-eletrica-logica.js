"use strict";
/*
 * Consumo de energia elétrica: da potência do aparelho ao custo em reais.
 * kWh no período = (potência em watts ÷ 1000) × horas por dia × dias.
 */
const LogicaEnergia = (() => {
  const centavos = (valor) => Math.round(valor * 100) / 100;
  const vazio = (valor) => valor === null || valor === undefined || !Number.isFinite(valor);

  /** Gasto do aparelho no período, em kWh e em reais. */
  function consumo({ potencia = null, horasDia = null, dias = 30, tarifa = null } = {}) {
    if (vazio(potencia) || vazio(horasDia) || vazio(tarifa)) return { incompleto: true };
    if (potencia <= 0) return { erro: "potencia" };
    if (horasDia <= 0 || horasDia > 24) return { erro: "horas" };
    if (tarifa <= 0) return { erro: "tarifa" };
    const quantosDias = Number.isFinite(dias) && dias > 0 ? Math.min(365, dias) : 30;

    const kwh = (potencia / 1000) * horasDia * quantosDias;
    const custo = kwh * tarifa;
    const porDia = (potencia / 1000) * horasDia;
    return {
      potencia,
      horasDia,
      dias: quantosDias,
      tarifa,
      kwh: centavos(kwh),
      custo: centavos(custo),
      porDia: centavos(porDia),
      custoPorDia: centavos(porDia * tarifa),
      custoAno: centavos(kwh * tarifa * (365 / quantosDias)),
    };
  }

  /**
   * Compara dois aparelhos: mostra quanto o mais econômico deixa de gastar por ano.
   * Cada aparelho é { nome, potencia, horasDia }.
   */
  function comparar({ a = null, b = null, tarifa = null, dias = 30 } = {}) {
    const primeiro = a ? consumo({ potencia: a.potencia, horasDia: a.horasDia, tarifa, dias }) : { incompleto: true };
    const segundo = b ? consumo({ potencia: b.potencia, horasDia: b.horasDia, tarifa, dias }) : { incompleto: true };
    if (primeiro.incompleto || segundo.incompleto) return { incompleto: true };
    if (primeiro.erro || segundo.erro) return { erro: primeiro.erro || segundo.erro };
    const economiaMes = Math.abs(primeiro.custo - segundo.custo);
    return {
      a: { ...primeiro, nome: a.nome || "Aparelho A" },
      b: { ...segundo, nome: b.nome || "Aparelho B" },
      melhor: primeiro.custo <= segundo.custo ? (a.nome || "Aparelho A") : b.nome || "Aparelho B",
      economiaMes: centavos(economiaMes),
      economiaAno: centavos(economiaMes * (365 / primeiro.dias)),
    };
  }

  return { consumo, comparar };
})();

if (typeof module === "object") module.exports = LogicaEnergia;
