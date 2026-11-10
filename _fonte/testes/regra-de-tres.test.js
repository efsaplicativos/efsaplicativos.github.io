"use strict";
// Regra de três simples e composta (assets/ferramentas/regra-de-tres-logica.js).
const assert = require("node:assert/strict");
const R = require("../../assets/ferramentas/regra-de-tres-logica.js");

const perto = (valor, esperado, tolerancia = 1e-9) =>
  assert.ok(Math.abs(valor - esperado) <= tolerancia, `esperava ${esperado}, veio ${valor}`);

const testes = {
  "simples direta: a está para b assim como c está para x"() {
    // 2 operários fazem 10 peças; 5 operários fazem x
    const conta = R.simples({ a: 2, b: 10, c: 5 });
    perto(conta.x, 25);
    assert.equal(conta.inversa, false);
    // proporções com decimais
    perto(R.simples({ a: 3, b: 7.5, c: 4 }).x, 10);
  },
  "simples inversa: mais de um lado, menos do outro"() {
    // 4 torneiras enchem em 6 h; 8 torneiras enchem em x
    perto(R.simples({ a: 4, b: 6, c: 8, inversa: true }).x, 3);
    perto(R.simples({ a: 10, b: 2, c: 4, inversa: true }).x, 5);
  },
  "simples recusa dados faltando, zero e negativos"() {
    assert.deepEqual(R.simples({}), { incompleto: true });
    assert.deepEqual(R.simples({ a: 2, b: 10 }), { incompleto: true });
    assert.deepEqual(R.simples({ a: 0, b: 10, c: 5 }), { erro: "zero" });
    assert.deepEqual(R.simples({ a: 2, b: 0, c: 5 }), { erro: "zero" });
    assert.deepEqual(R.simples({ a: 2, b: 10, c: 0, inversa: true }), { erro: "zero" });
    assert.deepEqual(R.simples({ a: -2, b: 10, c: 5 }), { erro: "negativo" });
  },
  "composta com duas grandezas diretas"() {
    // 2 operários, 5 dias, 100 peças → 4 operários, 10 dias, x peças
    const conta = R.composta({
      alvo: 100,
      grandezas: [
        { conhecido: 2, novo: 4 },
        { conhecido: 5, novo: 10 },
      ],
    });
    perto(conta.x, 400);
    perto(conta.fator, 4);
  },
  "composta com grandezas inversas"() {
    // 2 operários, 6 h por dia, terminam em 10 dias. Quantos dias 4 operários, 5 h por dia?
    // Dobrar os operários reduz o prazo (inversa) e reduzir as horas aumenta o prazo (inversa)
    const conta = R.composta({
      alvo: 10,
      grandezas: [
        { conhecido: 2, novo: 4, inversa: true },
        { conhecido: 6, novo: 5, inversa: true },
      ],
    });
    perto(conta.x, 6);
    perto(conta.fator, 0.6);
  },
  "composta ignora linhas em branco e recusa tudo vazio"() {
    const conta = R.composta({
      alvo: 10,
      grandezas: [
        { conhecido: 2, novo: 4 },
        { conhecido: null, novo: null },
      ],
    });
    perto(conta.x, 20);
    assert.equal(conta.grandezas.length, 1);
    assert.deepEqual(R.composta({ alvo: 10, grandezas: [] }), { incompleto: true });
    assert.deepEqual(R.composta({ alvo: null, grandezas: [{ conhecido: 1, novo: 2 }] }), { incompleto: true });
  },
  "composta recusa zero e negativos"() {
    assert.deepEqual(R.composta({ alvo: 10, grandezas: [{ conhecido: 0, novo: 2 }] }), { erro: "zero" });
    assert.deepEqual(R.composta({ alvo: -10, grandezas: [{ conhecido: 1, novo: 2 }] }), { erro: "negativo" });
    assert.deepEqual(R.composta({ alvo: 10, grandezas: [{ conhecido: 1, novo: -2 }] }), { erro: "negativo" });
  },
  "a inversa de uma grandeza inverte o fator"() {
    const direta = R.composta({ alvo: 100, grandezas: [{ conhecido: 2, novo: 8 }] });
    const inversa = R.composta({ alvo: 100, grandezas: [{ conhecido: 2, novo: 8, inversa: true }] });
    perto(direta.x, 400);
    perto(inversa.x, 25);
    perto(direta.x * inversa.x, 100 * 100);
  },
};

let falhas = 0;
for (const [nome, teste] of Object.entries(testes)) {
  try {
    teste();
    console.log(`ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`FALHOU ${nome}\n${erro.stack}`);
  }
}
console.log(`\n${Object.keys(testes).length - falhas} de ${Object.keys(testes).length} testes passaram`);
if (falhas) process.exit(1);
