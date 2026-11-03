"use strict";
/*
 * Lógica da calculadora de combustível, sem DOM.
 * Portada de core/combustivel/FuelCalculator.kt da Calculadora Multifunção: consumo médio,
 * custo da viagem e a comparação etanol × gasolina (regra dos 70% ou custo por km).
 */
const LogicaCombustivel = (() => {
  /** 1 km/L = 2,352145833 mpg (galão americano). */
  const KM_POR_L_PARA_MPG = 2.352145833;
  /** Regra prática: etanol compensa se custar até 70% do preço da gasolina. */
  const LIMITE_ETANOL = 0.7;
  const TANQUE_PADRAO = 50;

  function consumo(distanciaKm, litros, precoLitro = null) {
    if (!(distanciaKm > 0 && litros > 0)) throw new RangeError("Distância e litros devem ser positivos");
    const kmPorLitro = distanciaKm / litros;
    return {
      kmPorLitro,
      litrosPor100Km: 100 / kmPorLitro,
      mpg: kmPorLitro * KM_POR_L_PARA_MPG,
      custoPorKm: precoLitro === null ? null : precoLitro / kmPorLitro,
      custoTotal: precoLitro === null ? null : precoLitro * litros,
    };
  }

  /** Pedágios são por trecho: na ida e volta, contam duas vezes. */
  function viagem(distanciaKm, kmPorLitro, precoLitro, { idaEVolta = false, pedagios = 0, pessoas = 1 } = {}) {
    if (!(distanciaKm > 0 && kmPorLitro > 0 && precoLitro >= 0)) throw new RangeError("Valores inválidos");
    const multiplicador = idaEVolta ? 2 : 1;
    const distanciaTotal = distanciaKm * multiplicador;
    const pedagiosTotal = Math.max(pedagios, 0) * multiplicador;
    const litros = distanciaTotal / kmPorLitro;
    const custoCombustivel = litros * precoLitro;
    const total = custoCombustivel + pedagiosTotal;
    return {
      distanciaTotal,
      litros,
      custoCombustivel,
      pedagios: pedagiosTotal,
      total,
      porPessoa: total / Math.max(pessoas, 1),
      custoPorKm: total / distanciaTotal,
    };
  }

  /**
   * Compara etanol e gasolina. Com o consumo dos dois informado, usa o custo por km;
   * senão, a regra dos 70%. recomendado: "etanol", "gasolina" ou "tanto-faz".
   */
  function comparar(precoEtanol, precoGasolina, { kmLEtanol = null, kmLGasolina = null, tanque = TANQUE_PADRAO } = {}) {
    if (!(precoEtanol > 0 && precoGasolina > 0)) throw new RangeError("Preços devem ser positivos");
    const razao = precoEtanol / precoGasolina;
    const peloConsumo = kmLEtanol !== null && kmLGasolina !== null && kmLEtanol > 0 && kmLGasolina > 0;
    if (peloConsumo) {
      const etanolKm = precoEtanol / kmLEtanol;
      const gasolinaKm = precoGasolina / kmLGasolina;
      const recomendado =
        Math.abs(etanolKm - gasolinaKm) < 1e-9 ? "tanto-faz" : etanolKm < gasolinaKm ? "etanol" : "gasolina";
      const kmTanque = tanque * (recomendado === "etanol" ? kmLEtanol : kmLGasolina);
      return {
        razaoPercentual: razao * 100,
        recomendado,
        metodo: "custo-por-km",
        custoKmEtanol: etanolKm,
        custoKmGasolina: gasolinaKm,
        precoMaximoEtanol: (precoGasolina * kmLEtanol) / kmLGasolina,
        economiaTanque: Math.abs(gasolinaKm - etanolKm) * kmTanque,
        economia100Km: Math.abs(gasolinaKm - etanolKm) * 100,
      };
    }
    const recomendado =
      Math.abs(razao - LIMITE_ETANOL) < 1e-9 ? "tanto-faz" : razao < LIMITE_ETANOL ? "etanol" : "gasolina";
    // Na regra dos 70%, 1 litro de gasolina equivale a 1/0,7 litro de etanol.
    const etanolEquivalente = precoEtanol / LIMITE_ETANOL;
    return {
      razaoPercentual: razao * 100,
      recomendado,
      metodo: "regra-70",
      custoKmEtanol: null,
      custoKmGasolina: null,
      precoMaximoEtanol: precoGasolina * LIMITE_ETANOL,
      economiaTanque: Math.abs(precoGasolina - etanolEquivalente) * tanque,
      economia100Km: null,
    };
  }

  return { KM_POR_L_PARA_MPG, LIMITE_ETANOL, TANQUE_PADRAO, consumo, viagem, comparar };
})();

if (typeof module === "object") module.exports = LogicaCombustivel;
