"use strict";
// Casos de SimpleInterestTest.kt (Calculadora Multifunção). Rode: node _fonte/testes/juros-simples.test.js
const assert = require("node:assert/strict");
const J = require("../../assets/ferramentas/juros-simples-logica.js");

const perto = (real, esperado, tolerancia, msg) =>
  assert.ok(Math.abs(real - esperado) <= tolerancia, `${msg ?? ""} esperado ${esperado}, veio ${real}`);

function sucesso(entrada) {
  const r = J.resolver(entrada);
  assert.ok(r.resultado, `esperava sucesso, veio ${JSON.stringify(r)}`);
  return r.resultado;
}

const testes = {
  "juros e montante com mesma unidade"() {
    const r = sucesso({ alvo: "juros", capital: 1000, taxaPercentual: 2, prazo: 12 });
    perto(r.juros, 240, 1e-9);
    perto(r.montante, 1240, 1e-9);
  },
  "taxa anual com prazo em meses converte proporcionalmente"() {
    const r = sucesso({ alvo: "juros", capital: 1000, taxaPercentual: 24, unidadeTaxa: "ano", prazo: 6, unidadePrazo: "mes" });
    perto(r.juros, 120, 1e-9);
  },
  "taxa anual com prazo em dias usa ano comercial de 360 dias"() {
    const r = sucesso({ alvo: "juros", capital: 1000, taxaPercentual: 36, unidadeTaxa: "ano", prazo: 30, unidadePrazo: "dia" });
    perto(r.juros, 30, 1e-9);
    perto(J.prazoEm(r, "mes"), 1, 1e-12);
  },
  "capital a partir do montante ou dos juros"() {
    const doMontante = sucesso({ alvo: "capital", taxaPercentual: 2, prazo: 12, conhecido: "montante", valorConhecido: 1240 });
    perto(doMontante.capital, 1000, 1e-9);
    const dosJuros = sucesso({ alvo: "capital", taxaPercentual: 2, prazo: 12, conhecido: "juros", valorConhecido: 240 });
    perto(dosJuros.capital, 1000, 1e-9);
    perto(dosJuros.montante, 1240, 1e-9);
  },
  "taxa calculada com prazo em anos exibida ao mes"() {
    const r = sucesso({ alvo: "taxa", capital: 1000, prazo: 1, unidadePrazo: "ano", unidadeTaxa: "mes", conhecido: "montante", valorConhecido: 1240 });
    perto(r.taxa, 0.02, 1e-12);
    perto(J.taxaEm(r, "ano"), 0.24, 1e-12);
  },
  "prazo calculado em anos"() {
    const r = sucesso({ alvo: "prazo", capital: 1000, taxaPercentual: 2, unidadeTaxa: "mes", unidadePrazo: "ano", conhecido: "montante", valorConhecido: 1240 });
    perto(r.prazo, 1, 1e-12);
    perto(J.prazoEm(r, "mes"), 12, 1e-9);
    perto(J.prazoEm(r, "dia"), 360, 1e-9);
  },
  "erros e dados incompletos"() {
    assert.deepEqual(J.resolver({ alvo: "juros", capital: 1000 }), { incompleto: true });
    assert.deepEqual(J.resolver({ alvo: "taxa", capital: 1000, prazo: 1, valorConhecido: 900 }), { erro: "montanteMenor" });
    assert.deepEqual(J.resolver({ alvo: "prazo", capital: 1000, taxaPercentual: 0, valorConhecido: 1100 }), { erro: "taxa" });
    assert.deepEqual(J.resolver({ alvo: "juros", capital: 0, taxaPercentual: 1, prazo: 1 }), { erro: "capital" });
    assert.deepEqual(J.resolver({ alvo: "juros", capital: 100, taxaPercentual: -1, prazo: 1 }), { erro: "negativo" });
    assert.deepEqual(
      J.resolver({ alvo: "capital", taxaPercentual: 2, prazo: 0, conhecido: "juros", valorConhecido: 10 }),
      { erro: "prazo" },
    );
  },
  "evolucao inclui periodo fracionario final"() {
    const r = sucesso({ alvo: "juros", capital: 1000, taxaPercentual: 2, prazo: 2.5 });
    const linhas = J.evolucao(r);
    assert.deepEqual(linhas.map((l) => l.periodo), [0, 1, 2, 2.5]);
    perto(linhas[linhas.length - 1].montante, 1050, 1e-9);
  },
  "evolucao longa e agrupada"() {
    const r = sucesso({ alvo: "juros", capital: 1000, taxaPercentual: 0.1, unidadeTaxa: "dia", prazo: 1000, unidadePrazo: "dia" });
    const linhas = J.evolucao(r, 120);
    assert.ok(linhas.length <= 122);
    perto(linhas[linhas.length - 1].periodo, 1000, 1e-9);
    perto(linhas[linhas.length - 1].montante, 2000, 1e-9);
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
