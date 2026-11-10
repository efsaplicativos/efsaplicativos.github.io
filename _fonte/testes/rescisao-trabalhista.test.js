"use strict";
// Regras da rescisão trabalhista (assets/ferramentas/rescisao-trabalhista-logica.js).
const assert = require("node:assert/strict");
const R = require("../../assets/ferramentas/rescisao-trabalhista-logica.js");

const data = (ano, mes, dia) => ({ ano, mes, dia });
const perto = (valor, esperado, tolerancia = 0.02) =>
  assert.ok(Math.abs(valor - esperado) <= tolerancia, `esperava ${esperado}, veio ${valor}`);

const testes = {
  // ---------- Datas e avos ----------
  "somarMeses respeita o fim do mês (inclusive fevereiro bissexto)"() {
    assert.deepEqual(R.somarMeses(data(2026, 1, 31), 1), data(2026, 2, 28));
    assert.deepEqual(R.somarMeses(data(2024, 1, 31), 1), data(2024, 2, 29));
    assert.deepEqual(R.somarMeses(data(2026, 11, 15), 2), data(2027, 1, 15));
    assert.deepEqual(R.somarMeses(data(2026, 3, 10), 0), data(2026, 3, 10));
  },
  "os avos contam mês fechado e fração de 15 dias ou mais"() {
    assert.equal(R.avos(data(2026, 1, 1), data(2026, 1, 20)), 1); // 20 dias
    assert.equal(R.avos(data(2026, 1, 1), data(2026, 1, 10)), 0); // 10 dias
    assert.equal(R.avos(data(2026, 1, 1), data(2026, 1, 15)), 1); // exatamente 15
    assert.equal(R.avos(data(2026, 1, 1), data(2026, 1, 14)), 0); // 14
    assert.equal(R.avos(data(2026, 3, 10), data(2026, 6, 20)), 3);
    assert.equal(R.avos(data(2026, 3, 10), data(2026, 6, 26)), 4);
    assert.equal(R.avos(data(2026, 1, 1), data(2026, 12, 31)), 12);
    assert.equal(R.avos(data(2026, 6, 1), data(2026, 1, 1)), 0, "data invertida");
    assert.equal(R.avos(null, data(2026, 1, 1)), 0);
  },
  "o período aquisitivo começa no último aniversário de admissão"() {
    assert.deepEqual(R.inicioDoPeriodoAquisitivo(data(2024, 3, 5), data(2026, 11, 20)), data(2026, 3, 5));
    assert.deepEqual(R.inicioDoPeriodoAquisitivo(data(2024, 3, 5), data(2026, 3, 4)), data(2025, 3, 5));
    assert.deepEqual(R.inicioDoPeriodoAquisitivo(data(2026, 1, 10), data(2026, 5, 1)), data(2026, 1, 10));
  },
  "o aviso prévio cresce 3 dias por ano completo, até 90"() {
    assert.equal(R.diasDeAviso(data(2024, 1, 10), data(2024, 12, 31)), 30);
    assert.equal(R.diasDeAviso(data(2024, 1, 10), data(2026, 1, 9)), 33); // 1 ano completo
    assert.equal(R.diasDeAviso(data(2020, 1, 10), data(2026, 1, 10)), 48); // 6 anos
    assert.equal(R.diasDeAviso(data(1980, 1, 1), data(2026, 1, 1)), 90); // teto
  },

  // ---------- Conta completa ----------
  "sem justa causa com aviso indenizado soma todas as verbas"() {
    const conta = R.calcular({
      salario: 3000,
      admissao: data(2024, 3, 5),
      afastamento: data(2026, 11, 20),
      tipo: "semJustaCausa",
      saldoFgts: 10000,
    });
    assert.equal(conta.diasAviso, 36); // 30 + 2 anos × 3
    assert.equal(conta.diasAvisoPagos, 36);
    assert.deepEqual(conta.dataProjetada, data(2026, 12, 26)); // 20/11 + 36 dias
    assert.equal(conta.diasTrabalhados, 20);
    perto(conta.verbas.saldo, 2000);
    perto(conta.verbas.aviso, 3600);
    assert.equal(conta.avos.ferias, 10); // 05/03 a 26/12
    perto(conta.verbas.feriasProporcionais, 2500);
    perto(conta.verbas.tercoFeriasProporcionais, 833.33);
    assert.equal(conta.avos.decimo, 12);
    perto(conta.verbas.decimo, 3000);
    perto(conta.verbas.multaFgts, 4000);
    const soma =
      conta.verbas.saldo +
      conta.verbas.aviso +
      conta.verbas.feriasProporcionais +
      conta.verbas.tercoFeriasProporcionais +
      conta.verbas.decimo +
      conta.verbas.multaFgts;
    perto(conta.verbas.total, soma);
    assert.equal(conta.descontos.estimativa, true);
    perto(conta.liquido, conta.verbas.total - conta.descontos.total);
  },
  "o pedido de demissão não tem aviso indenizado nem multa do FGTS"() {
    const conta = R.calcular({
      salario: 3000,
      admissao: data(2024, 3, 5),
      afastamento: data(2026, 11, 20),
      tipo: "pedido",
      saldoFgts: 10000,
    });
    assert.equal(conta.diasAviso, 0);
    assert.equal(conta.verbas.aviso, 0);
    assert.equal(conta.verbas.multaFgts, 0);
    assert.ok(conta.verbas.feriasProporcionais > 0, "férias proporcionais continuam devidas");
    assert.ok(conta.verbas.decimo > 0, "13º proporcional continua devido");
  },
  "na justa causa só cabem saldo de salário e férias vencidas"() {
    const conta = R.calcular({
      salario: 3000,
      admissao: data(2024, 3, 5),
      afastamento: data(2026, 11, 20),
      tipo: "justaCausa",
      feriasVencidas: 1,
      saldoFgts: 10000,
    });
    perto(conta.verbas.saldo, 2000);
    perto(conta.verbas.feriasVencidas, 3000);
    perto(conta.verbas.tercoFeriasVencidas, 1000);
    assert.equal(conta.verbas.aviso, 0);
    assert.equal(conta.verbas.feriasProporcionais, 0);
    assert.equal(conta.verbas.decimo, 0);
    assert.equal(conta.verbas.multaFgts, 0);
    perto(conta.verbas.total, 6000);
  },
  "no acordo o aviso é pela metade e a multa é de 20%"() {
    const conta = R.calcular({
      salario: 3000,
      admissao: data(2024, 3, 5),
      afastamento: data(2026, 11, 20),
      tipo: "acordo",
      saldoFgts: 10000,
    });
    assert.equal(conta.diasAviso, 36);
    assert.equal(conta.diasAvisoPagos, 18, "metade do aviso");
    perto(conta.verbas.aviso, 1800);
    perto(conta.verbas.multaFgts, 2000);
  },

  "férias vencidas são pagas por inteiro, com o terço"() {
    const conta = R.calcular({
      salario: 2400,
      admissao: data(2020, 1, 10),
      afastamento: data(2026, 6, 10),
      tipo: "semJustaCausa",
      feriasVencidas: 2,
    });
    perto(conta.verbas.feriasVencidas, 4800);
    perto(conta.verbas.tercoFeriasVencidas, 1600);
    assert.equal(conta.avos.feriasVencidas, 2);
    assert.ok(conta.avos.ferias > 0 && conta.avos.ferias <= 12, "o período em curso continua rendendo avos");
  },
  "aviso trabalhado não entra como verba nem projeta o contrato"() {
    const trabalhado = R.calcular({
      salario: 3000,
      admissao: data(2024, 3, 5),
      afastamento: data(2026, 11, 20),
      tipo: "semJustaCausa",
      avisoIndenizado: false,
    });
    assert.equal(trabalhado.verbas.aviso, 0);
    assert.deepEqual(trabalhado.dataProjetada, data(2026, 11, 20));
    assert.ok(trabalhado.avos.decimo < 12, "sem projeção o 13º tem menos avos");
  },
  "os descontos são estimativa e saem do líquido"() {
    const conta = R.calcular({ salario: 3000, admissao: data(2024, 3, 5), afastamento: data(2026, 11, 20) });
    assert.ok(conta.descontos.inss > 0);
    assert.ok(conta.descontos.irrf >= 0);
    perto(conta.descontos.total, conta.descontos.inss + conta.descontos.irrf);
    perto(conta.liquido, conta.verbas.total - conta.descontos.total);
    assert.ok(conta.liquido < conta.verbas.total);
  },
  "contrato curto também fecha"() {
    const conta = R.calcular({ salario: 1621, admissao: data(2026, 9, 1), afastamento: data(2026, 11, 15), tipo: "semJustaCausa" });
    assert.equal(conta.diasAviso, 30);
    perto(conta.verbas.saldo, 1621 / 2);
    assert.ok(conta.verbas.total > 0);
    assert.ok(conta.descontos.inss > 0);
  },
  "datas ou valores inválidos são recusados"() {
    assert.deepEqual(R.calcular({}), { incompleto: true });
    assert.deepEqual(R.calcular({ salario: 3000 }), { incompleto: true });
    assert.deepEqual(R.calcular({ salario: 0, admissao: data(2024, 1, 1), afastamento: data(2026, 1, 1) }), { incompleto: true });
    assert.deepEqual(R.calcular({ salario: 3000, admissao: data(2026, 1, 1), afastamento: data(2025, 1, 1) }), { erro: "datas" });
    assert.equal(R.calcular({ salario: 3000, admissao: data(2024, 1, 1), afastamento: data(2026, 1, 1), tipo: "outro" }).erro, "tipo");
  },
  "valores saem arredondados em centavos"() {
    for (const salario of [1621, 2500.5, 3000, 8123.45]) {
      const conta = R.calcular({ salario, admissao: data(2023, 7, 14), afastamento: data(2026, 11, 3), saldoFgts: 5432.1 });
      for (const valor of [conta.verbas.saldo, conta.verbas.total, conta.descontos.total, conta.liquido]) {
        assert.equal(Math.round(valor * 100) / 100, valor, `${salario}: ${valor}`);
      }
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
