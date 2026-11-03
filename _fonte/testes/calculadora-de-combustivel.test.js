"use strict";
// Mesmos casos de app/src/test/.../core/combustivel/FuelCalculatorTest.kt.
const assert = require("node:assert/strict");
const C = require("../../assets/ferramentas/calculadora-de-combustivel-logica.js");

function perto(esperado, obtido, tolerancia = 1e-9) {
  assert.ok(Math.abs(esperado - obtido) <= tolerancia, `esperado ${esperado}, obtido ${obtido}`);
}

// consumo médio
const c = C.consumo(500, 40, 6);
perto(12.5, c.kmPorLitro);
perto(8, c.litrosPor100Km);
perto(29.4018, c.mpg, 1e-3);
perto(0.48, c.custoPorKm);
perto(240, c.custoTotal);
assert.equal(C.consumo(100, 10).custoPorKm, null);
assert.throws(() => C.consumo(0, 10));

// custo de viagem ida e volta com pedágio
const t = C.viagem(300, 12, 6, { idaEVolta: true, pedagios: 25, pessoas: 4 });
perto(600, t.distanciaTotal);
perto(50, t.litros);
perto(300, t.custoCombustivel);
perto(50, t.pedagios);
perto(350, t.total);
perto(87.5, t.porPessoa);
perto(350 / 600, t.custoPorKm);
perto(25, C.viagem(100, 10, 2.5).total);

// regra dos 70%
const etanol = C.comparar(4, 6);
perto(66.6667, etanol.razaoPercentual, 1e-3);
assert.equal(etanol.recomendado, "etanol");
assert.equal(etanol.metodo, "regra-70");
perto(4.2, etanol.precoMaximoEtanol);
assert.equal(C.comparar(4.5, 6).recomendado, "gasolina");
assert.equal(C.comparar(4.2, 6).recomendado, "tanto-faz");
// economia por tanque: 50 L × |6 − 4/0,7|
perto(50 * Math.abs(6 - 4 / 0.7), etanol.economiaTanque);

// comparação pelo custo por km: etanol 4,50/8 = 0,5625/km; gasolina 6,00/12 = 0,50/km
const k = C.comparar(4.5, 6, { kmLEtanol: 8, kmLGasolina: 12, tanque: 50 });
assert.equal(k.metodo, "custo-por-km");
assert.equal(k.recomendado, "gasolina");
perto(0.5625, k.custoKmEtanol);
perto(0.5, k.custoKmGasolina);
perto(6.25, k.economia100Km);
perto(0.0625 * 600, k.economiaTanque);
perto(4, k.precoMaximoEtanol);
// só um consumo informado: volta para a regra dos 70%
assert.equal(C.comparar(4.5, 6, { kmLEtanol: 8 }).metodo, "regra-70");

console.log("calculadora-de-combustivel: todos os testes passaram");
