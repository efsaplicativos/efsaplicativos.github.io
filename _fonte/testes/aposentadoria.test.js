"use strict";
// Casos de RetirementCalculatorTest.kt e RatesTest.kt (Calculadora Multifunção).
// Rode: node _fonte/testes/aposentadoria.test.js
const assert = require("node:assert/strict");
const A = require("../../assets/ferramentas/aposentadoria-logica.js");

const perto = (real, esperado, tolerancia) =>
  assert.ok(Math.abs(real - esperado) <= tolerancia, `esperado ${esperado}, veio ${real}`);

// 1% ao mês efetivo = 12,6825% ao ano
const umPorCentoAoMes = 1.01 ** 12 - 1;

const entrada = (p = {}) => ({
  idadeAtual: 30,
  idadeAposentadoria: 31,
  expectativaVida: 41,
  patrimonioAtual: 0,
  aporteMensal: 0,
  rendaDesejada: 5000,
  outrasRendas: 0,
  inflacaoAnual: 0,
  retornoAntes: umPorCentoAoMes,
  retornoDurante: umPorCentoAoMes,
  estrategia: "perpetuidade",
  ...p,
});

const testes = {
  "taxa real pela equacao de fisher"() {
    perto(A.taxaReal(0.1, 0.04), 0.0576923, 1e-6);
    perto(A.realMensal(umPorCentoAoMes, 0), 0.01, 1e-12);
    perto(A.realMensal(0.1, 0.04), (1.1 / 1.04) ** (1 / 12) - 1, 1e-12);
  },
  "perpetuidade preserva o patrimonio"() {
    const r = A.calcular(entrada());
    // Retiradas no início do mês: W(1+r)/r = 5000 × 1,01 / 0,01
    perto(r.capitalNecessario, 505000, 1e-6);
    assert.equal(A.idadeQueAcaba(r.capitalNecessario, 5000, 0.01, 31), null);
  },
  "outras rendas reduzem o capital necessario"() {
    const r = A.calcular(entrada({ outrasRendas: 2000 }));
    assert.equal(r.rendaNecessaria, 3000);
    perto(r.capitalNecessario, 303000, 1e-6);
    perto(r.rendaSustentavel, 2000, 1e-9);
  },
  "aporte necessario atinge o capital necessario"() {
    const r = A.calcular(entrada({ patrimonioAtual: 100000 }));
    const vf = 100000 * 1.01 ** 12 + r.aporteNecessario * ((1.01 ** 12 - 1) / 0.01);
    perto(vf, r.capitalNecessario, 1e-6);
  },
  "consumir patrimonio com taxa zero"() {
    const r = A.calcular(entrada({ estrategia: "consumir", retornoAntes: 0, retornoDurante: 0 }));
    perto(r.capitalNecessario, 5000 * 120, 1e-6); // 10 anos de retiradas
  },
  "patrimonio projetado e sobra"() {
    const r = A.calcular(entrada({ patrimonioAtual: 600000 }));
    perto(r.capitalProjetado, 600000 * 1.01 ** 12, 1e-6);
    assert.ok(r.sobra > 0);
    assert.equal(r.aporteNecessario, 0);
    assert.equal(r.idadeQueAcaba, null);
  },
  "idade em que o dinheiro acaba confere com simulacao"() {
    const capital = 300000;
    const retirada = 5000;
    const taxa = 0.005;
    const idade = A.idadeQueAcaba(capital, retirada, taxa, 65);
    assert.notEqual(idade, null);
    let saldo = capital;
    let meses = 0;
    while (saldo >= retirada) {
      saldo = (saldo - retirada) * (1 + taxa);
      meses++;
    }
    // A fórmula contínua fica entre o último mês inteiro e o seguinte
    const mesesFormula = (idade - 65) * 12;
    assert.ok(mesesFormula >= meses && mesesFormula <= meses + 1);
  },
  "perpetuidade impossivel com rentabilidade real negativa"() {
    const r = A.calcular(entrada({ inflacaoAnual: 0.2, retornoDurante: 0.05 }));
    assert.equal(r.perpetuidadeImpossivel, true);
    assert.ok(r.capitalNecessario > 0);
  },
  "valores nominais na aposentadoria aplicam a inflacao"() {
    const r = A.calcular(entrada({ inflacaoAnual: 0.05 }));
    perto(r.fatorInflacao, 1.05, 1e-12);
    perto(r.rendaNominal, 5000 * 1.05, 1e-9);
  },
  "idade de aposentadoria invalida"() {
    assert.throws(() => A.calcular(entrada({ idadeAposentadoria: 30 })), RangeError);
  },
  "validacao das idades da tela"() {
    assert.equal(A.erroIdades(30, 65, 85), null);
    assert.equal(A.erroIdades(30, 30, 85), "aposentadoria");
    assert.equal(A.erroIdades(30, 65, 65), "expectativa");
    assert.equal(A.erroIdades(30, 65, 130), "faixa");
    assert.equal(A.erroIdades(null, 65, null), null);
  },
  "projecao anual comeca na idade atual e vai alem da expectativa"() {
    const r = A.calcular(entrada({ patrimonioAtual: 1000 }));
    assert.equal(r.projecao[0].idade, 30);
    assert.equal(r.projecao[r.projecao.length - 1].idade, 46);
    perto(r.projecao[1].necessario, r.capitalNecessario, 1e-6);
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
