"use strict";
// Porcentagem (assets/ferramentas/porcentagem-logica.js).
const assert = require("node:assert/strict");
const P = require("../../assets/ferramentas/porcentagem-logica.js");

const perto = (valor, esperado, tolerancia = 0.005) =>
  assert.ok(Math.abs(valor - esperado) <= tolerancia, `esperava ${esperado}, veio ${valor}`);

const testes = {
  "X% de um valor"() {
    perto(P.parte({ percentual: 15, valor: 200 }).resultado, 30);
    perto(P.parte({ percentual: 7.5, valor: 1000 }).resultado, 75);
    perto(P.parte({ percentual: 100, valor: 250 }).resultado, 250);
    perto(P.parte({ percentual: 0, valor: 250 }).resultado, 0);
  },
  "aumento e desconto"() {
    const aumento = P.ajuste({ valor: 200, percentual: 10 });
    perto(aumento.resultado, 220);
    perto(aumento.diferenca, 20);
    const desconto = P.ajuste({ valor: 200, percentual: 10, desconto: true });
    perto(desconto.resultado, 180);
    perto(desconto.diferenca, 20);
    perto(P.ajuste({ valor: 100, percentual: 100, desconto: true }).resultado, 0);
  },
  "variação entre dois valores"() {
    perto(P.variacao({ de: 80, para: 100 }).percentual, 25);
    perto(P.variacao({ de: 100, para: 80 }).percentual, -20);
    assert.equal(P.variacao({ de: 100, para: 80 }).subiu, false);
    assert.equal(P.variacao({ de: 80, para: 100 }).subiu, true);
    perto(P.variacao({ de: 50, para: 50 }).percentual, 0);
  },
  "quantos por cento uma parte é do total"() {
    perto(P.proporcao({ parte: 25, total: 200 }).percentual, 12.5);
    perto(P.proporcao({ parte: 200, total: 200 }).percentual, 100);
    perto(P.proporcao({ parte: 0, total: 200 }).percentual, 0);
  },
  "percentuais em cadeia não somam"() {
    // 10% de aumento e depois 10% de desconto não voltam ao valor original
    const conta = P.cadeia({ valor: 100, percentuais: [10, -10] });
    perto(conta.resultado, 99);
    perto(conta.total, -1);
    // dois aumentos de 10% dão 21%
    perto(P.cadeia({ valor: 100, percentuais: [10, 10] }).resultado, 121);
  },
  "valores inválidos e limites"() {
    assert.deepEqual(P.parte({}), { incompleto: true });
    assert.deepEqual(P.parte({ percentual: 10, valor: -5 }), { erro: "negativo" });
    assert.deepEqual(P.ajuste({ valor: 100, percentual: 120 }), { erro: "descontoGrande" });
    assert.deepEqual(P.ajuste({ valor: 100, percentual: 120, desconto: true }).erro, undefined);
    assert.deepEqual(P.variacao({ de: 0, para: 10 }), { erro: "zero" });
    assert.deepEqual(P.proporcao({ parte: 1, total: 0 }), { erro: "zero" });
    assert.deepEqual(P.cadeia({ valor: 100, percentuais: [] }), { incompleto: true });
  },
  "resultados saem arredondados em centavos"() {
    const conta = P.parte({ percentual: 33, valor: 333.33 });
    assert.equal(Math.round(conta.resultado * 100) / 100, conta.resultado);
    const ajuste = P.ajuste({ valor: 199.99, percentual: 17.5 });
    assert.equal(Math.round(ajuste.resultado * 100) / 100, ajuste.resultado);
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
