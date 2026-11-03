"use strict";
/*
 * Lógica do conversor de temperatura, sem DOM.
 * Portada de core/temperatura/TemperatureConverter.kt da Calculadora Multifunção: oito
 * escalas, todas as conversões passam por Celsius e qualquer escala pode ser a origem.
 */
const LogicaTemperatura = (() => {
  /** Escalas na ordem do app, com as fórmulas de ida e volta a partir de Celsius. */
  const ESCALAS = [
    {
      id: "celsius",
      nome: "Celsius",
      simbolo: "°C",
      paraCelsius: (v) => v,
      deCelsius: (c) => c,
      formulaDe: "°C = °C",
      formulaPara: "°C = °C",
    },
    {
      id: "fahrenheit",
      nome: "Fahrenheit",
      simbolo: "°F",
      paraCelsius: (v) => ((v - 32) * 5) / 9,
      deCelsius: (c) => (c * 9) / 5 + 32,
      formulaDe: "°F = °C × 9/5 + 32",
      formulaPara: "°C = (°F − 32) × 5/9",
    },
    {
      id: "kelvin",
      nome: "Kelvin",
      simbolo: "K",
      paraCelsius: (v) => v - 273.15,
      deCelsius: (c) => c + 273.15,
      formulaDe: "K = °C + 273,15",
      formulaPara: "°C = K − 273,15",
    },
    {
      id: "rankine",
      nome: "Rankine",
      simbolo: "°R",
      paraCelsius: (v) => (v * 5) / 9 - 273.15,
      deCelsius: (c) => ((c + 273.15) * 9) / 5,
      formulaDe: "°R = (°C + 273,15) × 9/5",
      formulaPara: "°C = °R × 5/9 − 273,15",
    },
    {
      id: "reaumur",
      nome: "Réaumur",
      simbolo: "°Ré",
      paraCelsius: (v) => (v * 5) / 4,
      deCelsius: (c) => (c * 4) / 5,
      formulaDe: "°Ré = °C × 4/5",
      formulaPara: "°C = °Ré × 5/4",
    },
    {
      id: "newton",
      nome: "Newton",
      simbolo: "°N",
      paraCelsius: (v) => (v * 100) / 33,
      deCelsius: (c) => (c * 33) / 100,
      formulaDe: "°N = °C × 33/100",
      formulaPara: "°C = °N × 100/33",
    },
    {
      id: "delisle",
      nome: "Delisle",
      simbolo: "°De",
      paraCelsius: (v) => 100 - (v * 2) / 3,
      deCelsius: (c) => ((100 - c) * 3) / 2,
      formulaDe: "°De = (100 − °C) × 3/2",
      formulaPara: "°C = 100 − °De × 2/3",
    },
    {
      id: "romer",
      nome: "Rømer",
      simbolo: "°Rø",
      paraCelsius: (v) => ((v - 7.5) * 40) / 21,
      deCelsius: (c) => (c * 21) / 40 + 7.5,
      formulaDe: "°Rø = °C × 21/40 + 7,5",
      formulaPara: "°C = (°Rø − 7,5) × 40/21",
    },
  ];

  /** Pontos de referência (em Celsius) dos botões "Preencher com". */
  const REFERENCIAS = [
    { id: "zero-absoluto", nome: "Zero absoluto", celsius: -273.15 },
    { id: "congelamento", nome: "Congelamento da água", celsius: 0 },
    { id: "ambiente", nome: "Temperatura ambiente", celsius: 20 },
    { id: "corpo", nome: "Corpo humano", celsius: 37 },
    { id: "ebulicao", nome: "Ebulição da água", celsius: 100 },
  ];

  const ZERO_ABSOLUTO_CELSIUS = -273.15;
  const porId = new Map(ESCALAS.map((e) => [e.id, e]));

  function escala(id) {
    const e = porId.get(id);
    if (!e) throw new Error(`Escala desconhecida: ${id}`);
    return e;
  }

  const converter = (valor, de, para) =>
    de === para ? valor : escala(para).deCelsius(escala(de).paraCelsius(valor));

  /** Converte [valor] (na escala [de]) para todas as escalas: { celsius: …, fahrenheit: … }. */
  function converterTodas(valor, de) {
    const celsius = escala(de).paraCelsius(valor);
    const todas = {};
    for (const e of ESCALAS) todas[e.id] = e.id === de ? valor : e.deCelsius(celsius);
    return todas;
  }

  /** true quando a temperatura é fisicamente impossível (abaixo de 0 K). */
  const abaixoDoZeroAbsoluto = (valor, de) => escala(de).paraCelsius(valor) < ZERO_ABSOLUTO_CELSIUS - 1e-9;

  // Texto que vai nos campos: até 4 casas e sem separador de milhar, para editar com facilidade.
  const formatoCampo = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4, useGrouping: false });
  function textoCampo(valor) {
    const texto = formatoCampo.format(valor);
    return /^-[0,]*$/.test(texto) ? texto.slice(1) : texto;
  }

  return { ESCALAS, REFERENCIAS, ZERO_ABSOLUTO_CELSIUS, escala, converter, converterTodas, abaixoDoZeroAbsoluto, textoCampo };
})();

if (typeof module === "object") module.exports = LogicaTemperatura;
