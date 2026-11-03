"use strict";
// Mesmos casos de app/src/test/.../core/temperatura/TemperatureConverterTest.kt.
const assert = require("node:assert/strict");
const T = require("../../assets/ferramentas/conversor-de-temperatura-logica.js");

function perto(esperado, obtido, tolerancia = 1e-9) {
  assert.ok(Math.abs(esperado - obtido) <= tolerancia, `esperado ${esperado}, obtido ${obtido}`);
}

// ebulição da água em todas as escalas
let todas = T.converterTodas(100, "celsius");
perto(212, todas.fahrenheit);
perto(373.15, todas.kelvin);
perto(671.67, todas.rankine);
perto(80, todas.reaumur);
perto(33, todas.newton);
perto(0, todas.delisle);
perto(60, todas.romer);

// congelamento da água
todas = T.converterTodas(0, "celsius");
perto(32, todas.fahrenheit);
perto(273.15, todas.kelvin);
perto(491.67, todas.rankine);
perto(150, todas.delisle);
perto(7.5, todas.romer);

// qualquer escala pode ser a origem
const deF = T.converterTodas(98.6, "fahrenheit");
perto(37, deF.celsius);
assert.equal(deF.fahrenheit, 98.6);
const deK = T.converterTodas(0, "kelvin");
perto(-459.67, deK.fahrenheit);
perto(0, deK.rankine);

// ida e volta em todas as escalas
for (const e of T.ESCALAS) {
  for (const c of [-40, 0, 36.6, 1000]) perto(c, e.paraCelsius(e.deCelsius(c)));
}
perto(-40, T.converter(-40, "celsius", "fahrenheit"));

// zero absoluto
assert.equal(T.abaixoDoZeroAbsoluto(0, "kelvin"), false);
assert.equal(T.abaixoDoZeroAbsoluto(-1, "kelvin"), true);
assert.equal(T.abaixoDoZeroAbsoluto(-300, "celsius"), true);
assert.equal(T.abaixoDoZeroAbsoluto(560, "delisle"), true);
assert.equal(T.abaixoDoZeroAbsoluto(-459.67, "fahrenheit"), false);

// texto dos campos: vírgula, até 4 casas, sem milhar e sem "-0"
assert.equal(T.textoCampo(373.15), "373,15");
assert.equal(T.textoCampo(1234.56789), "1234,5679");
assert.equal(T.textoCampo(-0.00001), "0");
assert.equal(T.textoCampo(-459.67), "-459,67");

console.log("conversor-de-temperatura: todos os testes passaram");
