"use strict";
/*
 * Churrasco: quantidade de carne, acompanhamento, bebida, carvão e sal pelo número de convidados.
 * As porções são as usuais de churrasco caseiro; criança conta meia porção de carne.
 */
const LogicaChurrasco = (() => {
  const PERFIS = {
    classico: { id: "classico", nome: "Clássico", adulto: 400, crianca: 200, bebida: 500, bebidaCrianca: 300 },
    comOsso: { id: "comOsso", nome: "Com osso (costela, asa)", adulto: 500, crianca: 250, bebida: 500, bebidaCrianca: 300 },
    leve: { id: "leve", nome: "Mais leve", adulto: 300, crianca: 150, bebida: 400, bebidaCrianca: 250 },
  };
  /** Acompanhamentos (farofa, maionese, pão) por pessoa, em gramas. */
  const ACOMPANHAMENTO_PESSOA = 150;
  /** Carvão: 1 kg para cada 2 kg de carne. Sal grosso: 10 g por kg de carne. */
  const CARVAO_POR_CARNE = 0.5;
  const SAL_POR_CARNE = 10;

  const centavos = (valor) => Math.round(valor * 100) / 100;
  const vazio = (valor) => valor === null || valor === undefined || !Number.isFinite(valor);

  /** Quantidades para o churrasco. Peso em gramas, bebida em mililitros. */
  function quantidades({ adultos = 0, criancas = 0, perfil = "classico" } = {}) {
    const qual = PERFIS[perfil] || PERFIS.classico;
    const quantosAdultos = Number.isFinite(adultos) && adultos > 0 ? Math.floor(adultos) : 0;
    const quantasCriancas = Number.isFinite(criancas) && criancas > 0 ? Math.floor(criancas) : 0;
    if (vazio(adultos) || vazio(criancas)) return { incompleto: true };
    if (quantosAdultos + quantasCriancas === 0) return { incompleto: true };

    const pessoas = quantosAdultos + quantasCriancas;
    const carne = quantosAdultos * qual.adulto + quantasCriancas * qual.crianca;
    const acompanhamento = pessoas * ACOMPANHAMENTO_PESSOA;
    const bebida = quantosAdultos * qual.bebida + quantasCriancas * qual.bebidaCrianca;
    const carvao = carne * CARVAO_POR_CARNE;

    return {
      perfil: qual.id,
      adultos: quantosAdultos,
      criancas: quantasCriancas,
      pessoas,
      carne,
      acompanhamento,
      bebida,
      carvao: Math.round(carvao),
      sal: Math.round((carne / 1000) * SAL_POR_CARNE),
      carneKg: centavos(carne / 1000),
      bebidaLitros: centavos(bebida / 1000),
      porPessoa: Math.round(carne / pessoas),
    };
  }

  return { PERFIS, ACOMPANHAMENTO_PESSOA, quantidades };
})();

if (typeof module === "object") module.exports = LogicaChurrasco;
