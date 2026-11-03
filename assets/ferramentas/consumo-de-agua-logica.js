"use strict";
/*
 * Lógica da estimativa de consumo de água, sem DOM.
 * Portada de core/agua/WaterCalculator.kt da Calculadora Multifunção: base de 35 ml por kg
 * (faixa usual de 30 a 40 ml/kg), acréscimos para atividade física, clima e
 * gestação/amamentação, número de copos e horários distribuídos ao longo do dia.
 */
const LogicaAgua = (() => {
  const ML_POR_KG = 35;
  const ML_POR_KG_MIN = 30;
  const ML_POR_KG_MAX = 40;
  const ML_POR_MINUTO_EXERCICIO = 12;

  const CLIMAS = {
    ameno: { nome: "Ameno", extraMl: 0 },
    quente: { nome: "Quente", extraMl: 500 },
    "muito-quente": { nome: "Muito quente", extraMl: 1000 },
  };

  const CONDICOES = {
    nenhuma: { nome: "Não se aplica", extraMl: 0 },
    gestante: { nome: "Gestante", extraMl: 300 },
    amamentando: { nome: "Amamentando", extraMl: 700 },
  };

  const TAMANHOS_COPO = [200, 250, 300, 500];

  function calcular(pesoKg, { minutosExercicio = 0, clima = "ameno", condicao = "nenhuma" } = {}) {
    if (!(pesoKg > 0)) throw new RangeError("Peso deve ser positivo");
    const extraClima = (CLIMAS[clima] || CLIMAS.ameno).extraMl;
    const extraCondicao = (CONDICOES[condicao] || CONDICOES.nenhuma).extraMl;
    const base = pesoKg * ML_POR_KG;
    const exercicio = Math.max(minutosExercicio, 0) * ML_POR_MINUTO_EXERCICIO;
    const extras = exercicio + extraClima + extraCondicao;
    return {
      baseMl: base,
      faixaMinMl: pesoKg * ML_POR_KG_MIN + extras,
      faixaMaxMl: pesoKg * ML_POR_KG_MAX + extras,
      exercicioMl: exercicio,
      climaMl: extraClima,
      condicaoMl: extraCondicao,
      totalMl: base + extras,
    };
  }

  /** Copos por dia, arredondando para cima (pelo menos 1). */
  const copos = (totalMl, copoMl) => (copoMl <= 0 ? 0 : Math.max(Math.ceil(totalMl / copoMl - 1e-9), 1));

  /**
   * Distribui [quantidade] copos entre a hora de acordar e uma hora antes de dormir (se a
   * janela permitir), em múltiplos de 5 minutos. Horários em minutos do dia (0 a 1439); se
   * dormir antes da hora de acordar, considera que a pessoa dorme depois da meia-noite.
   */
  function horarios(acordarMin, dormirMin, quantidade) {
    if (quantidade <= 0) return [];
    let fim = dormirMin;
    if (fim <= acordarMin) fim += 24 * 60;
    const janela = fim - acordarMin;
    const ultimo = janela > 120 ? fim - 60 : fim;
    const normalizar = (minuto) => ((minuto % 1440) + 1440) % 1440;
    if (quantidade === 1) return [normalizar(acordarMin)];
    return Array.from({ length: quantidade }, (_, i) => {
      const minuto = acordarMin + ((ultimo - acordarMin) * i) / (quantidade - 1);
      return normalizar(Math.round(minuto / 5) * 5);
    });
  }

  const librasParaKg = (lb) => lb * 0.45359237;

  /** "07:05" ↔ 425 minutos (valor de <input type="time">). */
  function lerHora(texto) {
    const m = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(texto ?? "").trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h < 24 && min < 60 ? h * 60 + min : null;
  }

  const textoHora = (minutos) =>
    `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;

  return {
    ML_POR_KG,
    ML_POR_KG_MIN,
    ML_POR_KG_MAX,
    ML_POR_MINUTO_EXERCICIO,
    CLIMAS,
    CONDICOES,
    TAMANHOS_COPO,
    calcular,
    copos,
    horarios,
    librasParaKg,
    lerHora,
    textoHora,
  };
})();

if (typeof module === "object") module.exports = LogicaAgua;
