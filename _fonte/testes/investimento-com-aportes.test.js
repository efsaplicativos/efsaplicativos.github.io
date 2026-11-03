"use strict";
// Casos de ContributionsTest.kt e RatesTest.kt (Calculadora Multifunção).
// Rode: node _fonte/testes/investimento-com-aportes.test.js
const assert = require("node:assert/strict");
const A = require("../../assets/ferramentas/investimento-com-aportes-logica.js");

const perto = (real, esperado, tolerancia) =>
  assert.ok(Math.abs(real - esperado) <= tolerancia, `esperado ${esperado}, veio ${real}`);

const base = { inicial: 0, aporte: 100, taxaMensal: 0.01, meses: 12 };

function sucesso(alvo, plano, meta = null) {
  const r = A.resolver(alvo, plano, meta);
  assert.ok(r.simulacao, `esperava sucesso, veio ${JSON.stringify(r)}`);
  return r;
}

const testes = {
  "taxa anual equivalente mensal"() {
    perto(A.taxaMensal(12, "ano"), 0.009488793, 1e-9);
    perto(A.anualDeMensal(0.01), 0.12682503, 1e-9);
    perto(A.taxaMensal(1, "mes"), 0.01, 1e-15);
  },
  "valor final com aportes no fim do mes"() {
    // FV = 100 · ((1,01^12 − 1) / 0,01)
    const s = A.simular(base);
    perto(s.valorFinal, 1268.250301, 1e-6);
    perto(s.totalInvestido, 1200, 1e-9);
    perto(s.totalJuros, 68.250301, 1e-6);
  },
  "aportes no inicio do mes rendem um mes a mais"() {
    const s = A.simular({ ...base, momento: "inicio" });
    perto(s.valorFinal, 1268.250301 * 1.01, 1e-6);
  },
  "capital inicial mais aportes"() {
    const s = A.simular({ ...base, inicial: 1000 });
    perto(s.valorFinal, 1000 * 1.12682503 + 1268.250301, 1e-5);
    perto(s.totalInvestido, 2200, 1e-9);
  },
  "aporte necessario e capital inicial necessario"() {
    const meta = 1000 * 1.126825030131 + 1268.250301313;
    const aporte = sucesso("aporte", { ...base, inicial: 1000, aporte: 0 }, meta);
    perto(aporte.resolvido, 100, 1e-6);
    const inicial = sucesso("inicial", base, meta);
    perto(inicial.resolvido, 1000, 1e-6);
  },
  "meta ja atingida pelo capital inicial"() {
    const s = sucesso("aporte", { ...base, inicial: 5000 }, 1000);
    assert.equal(s.jaAtingida, true);
    assert.equal(s.resolvido, 0);
  },
  "prazo necessario"() {
    const s = sucesso("prazo", { ...base, meses: 0 }, 1268.25);
    assert.equal(s.resolvido, 12);
    assert.equal(s.simulacao.linhas.length, 12);
    assert.deepEqual(
      A.resolver("prazo", { ...base, aporte: 0, inicial: 10, taxaMensal: 0 }, 1000),
      { erro: "inalcancavel" },
    );
  },
  "taxa necessaria por bissecao"() {
    const s = sucesso("taxa", { ...base, taxaMensal: 0 }, 1268.250301);
    perto(s.resolvido, 0.01, 1e-8);
  },
  "reajuste anual do aporte e valor real"() {
    const s = A.simular({ inicial: 0, aporte: 100, taxaMensal: 0, meses: 24, reajusteAnual: 0.1 });
    perto(s.totalInvestido, 1200 + 1320, 1e-9);
    perto(s.linhas[12].aporte, 110, 1e-9);
    const anos = A.anual(s);
    assert.equal(anos.length, 2);
    perto(anos[1].aportes, 1320, 1e-9);
    const real = A.valorReal(A.simular({ inicial: 2000, aporte: 0, taxaMensal: 0, meses: 24 }), 0.1);
    perto(real, 2000 / 1.21, 1e-9);
  },
  validacoes() {
    assert.deepEqual(A.resolver("final", { ...base, meses: 0 }, null), { erro: "prazo" });
    assert.deepEqual(A.resolver("final", { ...base, inicial: -1 }, null), { erro: "negativo" });
    assert.deepEqual(A.resolver("aporte", base, null), { incompleto: true });
    assert.deepEqual(A.resolver("final", { ...base, meses: 1201 }, null), { erro: "prazoLongo" });
    assert.deepEqual(A.resolver("prazo", { ...base, inicial: 0, aporte: 0 }, 100), { erro: "nada" });
    assert.deepEqual(A.resolver("aporte", base, 0), { erro: "meta" });
  },
};

let falhas = 0;
for (const [nome, teste] of Object.entries(testes)) {
  try {
    teste();
    console.log(`ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`FALHA ${nome}\n     ${erro.message}`);
  }
}
console.log(falhas ? `\n${falhas} teste(s) falharam` : `\n${Object.keys(testes).length} testes passaram`);
process.exitCode = falhas ? 1 : 0;
