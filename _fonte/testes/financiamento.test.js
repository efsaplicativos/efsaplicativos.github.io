"use strict";
// Casos de LoanCalculatorTest.kt (Calculadora Multifunção). Rode: node _fonte/testes/financiamento.test.js
const assert = require("node:assert/strict");
const F = require("../../assets/ferramentas/financiamento-logica.js");

const perto = (real, esperado, tolerancia, msg = "") =>
  assert.ok(Math.abs(real - esperado) <= tolerancia, `${msg} esperado ${esperado}, veio ${real}`);
const soma = (linhas, campo) => linhas.reduce((s, l) => s + l[campo], 0);

const testes = {
  "parcela price conhecida"() {
    perto(F.parcelaPrice(100000, 0.01, 360), 1028.61, 0.005);
    const t = F.tabela(100000, 0.01, 360, "price");
    assert.equal(t.primeiraParcela, 1028.61);
    assert.equal(t.linhas[t.linhas.length - 1].saldo, 0);
    // Parcelas constantes: diferenças só de centavos de arredondamento, inclusive na última
    for (const l of t.linhas) perto(l.parcela, 1028.61, 0.021, `mês ${l.mes}`);
    perto(soma(t.linhas, "amortizacao"), 100000, 1e-6);
  },
  "price com taxa zero divide igualmente"() {
    const t = F.tabela(1200, 0, 12, "price");
    for (const l of t.linhas) assert.equal(l.parcela, 100);
    assert.equal(t.totalJuros, 0);
  },
  "sac tem amortizacao constante e juros totais conhecidos"() {
    const t = F.tabela(120000, 0.01, 120, "sac");
    assert.equal(t.linhas[0].amortizacao, 1000);
    assert.equal(t.primeiraParcela, 2200); // 1.000 + 1% de 120.000
    assert.equal(t.ultimaParcela, 1010); // 1.000 + 1% de 1.000
    // Juros SAC = P·i·(n+1)/2
    perto(t.totalJuros, (120000 * 0.01 * 121) / 2, 0.01);
    assert.equal(t.linhas[t.linhas.length - 1].saldo, 0);
  },
  "sam e a media entre price e sac"() {
    const price = F.tabela(50000, 0.015, 48, "price");
    const sac = F.tabela(50000, 0.015, 48, "sac");
    const sam = F.tabela(50000, 0.015, 48, "sam");
    perto(sam.primeiraParcela, (price.primeiraParcela + sac.primeiraParcela) / 2, 0.02);
    perto(sam.totalJuros, (price.totalJuros + sac.totalJuros) / 2, 0.5);
    assert.equal(sam.linhas[sam.linhas.length - 1].saldo, 0);
    assert.ok(sac.totalJuros < sam.totalJuros && sam.totalJuros < price.totalJuros);
  },
  "saldo zera mesmo com valores quebrados"() {
    for (const sistema of F.SISTEMAS) {
      const t = F.tabela(12345.67, 0.0237, 37, sistema);
      assert.equal(t.linhas[t.linhas.length - 1].saldo, 0, sistema);
      perto(soma(t.linhas, "amortizacao"), 12345.67, 1e-6, sistema);
    }
  },
  "taxa anual usa equivalente e nao anual dividido por 12"() {
    const mensal = F.taxaMensal(12, "ano");
    const t = F.tabela(10000, mensal, 12, "price");
    // Com 12% a.a. efetivo a parcela é menor que com 1% a.m. (12,68% a.a.)
    const errada = F.tabela(10000, 0.01, 12, "price");
    assert.ok(t.primeiraParcela < errada.primeiraParcela);
    perto(t.primeiraParcela, 885.62, 0.01);
  },
  "cet sem custos e igual a taxa e com custos e maior"() {
    const t = F.tabela(10000, 0.02, 24, "price");
    const cet = F.cetMensal(t);
    assert.notEqual(cet, null);
    perto(cet, 0.02, 1e-5);
    const comCustos = F.tabela(10000, 0.02, 24, "price", 25);
    assert.ok(F.cetMensal(comCustos) > 0.02);
    perto(comCustos.totalCustos, 25 * 24, 1e-9);
  },
  "tir conhecida"() {
    // Recebe 1000, paga 1100 em um mês: 10%
    perto(F.tir(1000, [1100]), 0.1, 1e-9);
    perto(F.anualDeMensal(0.02), 0.26824, 1e-5);
  },
  "anos para meses"() {
    assert.equal(F.anosParaMeses(2.5), 30);
    assert.equal(F.anosParaMeses(0.01), 1);
  },
  "validacoes da tela"() {
    assert.deepEqual(F.simular({ valor: 1000, entrada: 1000, taxaPercentual: 1, prazo: 12 }), { erros: { entrada: true } });
    assert.deepEqual(F.simular({ valor: 1000, taxaPercentual: 101, prazo: 12 }), { erros: { taxa: true } });
    assert.deepEqual(F.simular({ valor: 1000, taxaPercentual: 1, prazo: 601 }), { erros: { prazo: true } });
    assert.deepEqual(F.simular({ valor: 1000, taxaPercentual: 1, prazo: 0 }), { erros: { prazo: true } });
    assert.deepEqual(F.simular({ valor: null, taxaPercentual: 1, prazo: 12 }), { incompleto: true });
    const r = F.simular({ valor: 150000, entrada: 30000, taxaPercentual: 1, prazo: 10, unidade: "anos" });
    assert.equal(r.financiado, 120000);
    assert.equal(r.meses, 120);
    assert.equal(r.tabelas.sac.primeiraParcela, 2200);
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
