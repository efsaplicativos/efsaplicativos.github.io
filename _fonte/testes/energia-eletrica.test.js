"use strict";
// Consumo de energia elétrica (assets/ferramentas/energia-eletrica-logica.js).
const assert = require("node:assert/strict");
const E = require("../../assets/ferramentas/energia-eletrica-logica.js");

const perto = (valor, esperado, tolerancia = 0.011) =>
  assert.ok(Math.abs(valor - esperado) <= tolerancia, `esperava ${esperado}, veio ${valor}`);

const testes = {
  "kWh no mês a partir da potência"() {
    // 100 W por 5 h/dia em 30 dias = 15 kWh
    const conta = E.consumo({ potencia: 100, horasDia: 5, dias: 30, tarifa: 0.9 });
    perto(conta.kwh, 15);
    perto(conta.custo, 13.5);
    perto(conta.porDia, 0.5);
    perto(conta.custoPorDia, 0.45);
  },
  "o custo acompanha a tarifa"() {
    const barato = E.consumo({ potencia: 1000, horasDia: 1, tarifa: 0.5 });
    const caro = E.consumo({ potencia: 1000, horasDia: 1, tarifa: 1.2 });
    perto(barato.kwh, 30);
    perto(barato.custo, 15);
    perto(caro.custo, 36);
  },
  "o período pode ser diferente de 30 dias"() {
    const semana = E.consumo({ potencia: 2000, horasDia: 2, dias: 7, tarifa: 0.8 });
    perto(semana.kwh, 28);
    assert.equal(semana.dias, 7);
    // A projeção anual usa a mesma proporção
    perto(semana.custoAno, 28 * 0.8 * (365 / 7));
  },
  "valores inválidos são recusados"() {
    assert.deepEqual(E.consumo({}), { incompleto: true });
    assert.deepEqual(E.consumo({ potencia: 0, horasDia: 1, tarifa: 1 }), { erro: "potencia" });
    assert.deepEqual(E.consumo({ potencia: 100, horasDia: 0, tarifa: 1 }), { erro: "horas" });
    assert.deepEqual(E.consumo({ potencia: 100, horasDia: 25, tarifa: 1 }), { erro: "horas" });
    assert.deepEqual(E.consumo({ potencia: 100, horasDia: 1, tarifa: 0 }), { erro: "tarifa" });
  },
  "compara dois aparelhos e calcula a economia"() {
    const conta = E.comparar({
      a: { nome: "Chuveiro", potencia: 5500, horasDia: 0.5 },
      b: { nome: "Chuveiro novo", potencia: 3500, horasDia: 0.5 },
      tarifa: 0.9,
    });
    // A: 5,5 kW × 0,5 h × 30 = 82,5 kWh → R$ 74,25; B: 52,5 kWh → R$ 47,25
    perto(conta.a.custo, 74.25);
    perto(conta.b.custo, 47.25);
    assert.equal(conta.melhor, "Chuveiro novo");
    perto(conta.economiaMes, 27);
    assert.ok(conta.economiaAno > conta.economiaMes);
  },
  "comparação incompleta ou inválida"() {
    assert.deepEqual(E.comparar({}), { incompleto: true });
    assert.deepEqual(
      E.comparar({ a: { potencia: 0, horasDia: 1 }, b: { potencia: 100, horasDia: 1 }, tarifa: 1 }),
      { erro: "potencia" },
    );
  },
  "resultados saem arredondados em centavos"() {
    const conta = E.consumo({ potencia: 1234, horasDia: 3.3, dias: 30, tarifa: 0.7431 });
    for (const valor of [conta.kwh, conta.custo, conta.custoAno]) {
      assert.equal(Math.round(valor * 100) / 100, valor);
    }
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
