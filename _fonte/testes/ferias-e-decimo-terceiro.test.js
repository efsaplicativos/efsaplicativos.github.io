"use strict";
// Férias e 13º (assets/ferramentas/ferias-e-decimo-terceiro-logica.js).
const assert = require("node:assert/strict");
const F = require("../../assets/ferramentas/ferias-e-decimo-terceiro-logica.js");
const S = require("../../assets/ferramentas/salario-liquido-logica.js");

const perto = (valor, esperado, tolerancia = 0.02) =>
  assert.ok(Math.abs(valor - esperado) <= tolerancia, `esperava ${esperado}, veio ${valor}`);

const testes = {
  // ---------- Férias ----------
  "30 dias: valor, terço e descontos"() {
    const conta = F.ferias({ salario: 3000 });
    assert.equal(conta.dias, 30);
    perto(conta.ferias, 3000);
    perto(conta.terco, 1000);
    perto(conta.tributavel, 4000);
    perto(conta.bruto, 4000);
    perto(conta.inss, S.inss(4000).total); // 368,60
    // Base do imposto: férias + terço menos INSS
    perto(conta.irrfTabela, S.irrf(4000 - conta.inss).valor);
    // A redução de 2026 zera o imposto de quem tem rendimento até 5.000
    perto(conta.reducao, 312.89);
    assert.equal(conta.irrf, 0);
    perto(conta.liquido, 4000 - conta.inss);
  },
  "15 dias é metade do valor e tem menos desconto"() {
    const conta = F.ferias({ salario: 3000, dias: 15 });
    assert.equal(conta.dias, 15);
    perto(conta.ferias, 1500);
    perto(conta.terco, 500);
    perto(conta.tributavel, 2000);
    perto(conta.inss, S.inss(2000).total); // 155,69
    assert.equal(conta.irrf, 0);
    perto(conta.liquido, 2000 - conta.inss);
  },
  "os dias ficam presos entre 1 e 30"() {
    assert.equal(F.ferias({ salario: 3000, dias: 0 }).dias, 1);
    assert.equal(F.ferias({ salario: 3000, dias: 45 }).dias, 30);
    assert.equal(F.ferias({ salario: 3000, dias: 20.4 }).dias, 20);
  },
  "o abono de 10 dias entra no bruto e não sofre desconto"() {
    const semAbono = F.ferias({ salario: 3000 });
    const comAbono = F.ferias({ salario: 3000, abonar: true });
    perto(comAbono.abono, 1000);
    perto(comAbono.tercoAbono, 333.33);
    perto(comAbono.bruto, semAbono.bruto + 1333.33);
    // O abono é indenizatório: a base tributável e os descontos não mudam
    perto(comAbono.tributavel, semAbono.tributavel);
    assert.equal(comAbono.inss, semAbono.inss);
    assert.equal(comAbono.irrf, semAbono.irrf);
    perto(comAbono.liquido, semAbono.liquido + 1333.33);
  },
  "férias de salário alto pagam imposto"() {
    const conta = F.ferias({ salario: 12000 });
    perto(conta.tributavel, 16000);
    perto(conta.inss, S.inss(16000).total); // travado no teto
    assert.equal(conta.reducao, 0, "acima de 7.350 não há redução");
    assert.ok(conta.irrf > 0);
    perto(conta.irrf, S.irrf(16000 - conta.inss).valor);
  },
  "sem salário a conta fica incompleta"() {
    assert.deepEqual(F.ferias({}), { incompleto: true });
    assert.deepEqual(F.ferias({ salario: 0 }), { incompleto: true });
    assert.deepEqual(F.ferias({ salario: -100 }), { incompleto: true });
  },

  // ---------- 13º ----------
  "13º de 12 avos com salário de 3.000"() {
    const conta = F.decimoTerceiro({ salario: 3000 });
    assert.equal(conta.avos, 12);
    perto(conta.bruto, 3000);
    perto(conta.inss, S.inss(3000).total); // 248,60
    perto(conta.irrfTabela, S.irrf(3000 - conta.inss).valor);
    perto(conta.reducao, 312.89);
    assert.equal(conta.irrf, 0, "o 13º também usa a redução de 2026 (§ 3º da lei)");
    perto(conta.liquido, 3000 - conta.inss);
    perto(conta.valor, conta.liquido);
  },
  "13º proporcional usa os avos"() {
    const conta = F.decimoTerceiro({ salario: 3000, avos: 6 });
    perto(conta.bruto, 1500);
    perto(conta.inss, S.inss(1500).total); // 112,50
    assert.equal(conta.irrf, 0);
    perto(conta.liquido, 1500 - conta.inss);
  },
  "os avos ficam presos entre 1 e 12"() {
    assert.equal(F.decimoTerceiro({ salario: 3000, avos: 0 }).avos, 1);
    assert.equal(F.decimoTerceiro({ salario: 3000, avos: 20 }).avos, 12);
    assert.equal(F.decimoTerceiro({ salario: 3000, avos: 7.6 }).avos, 8);
  },
  "a primeira parcela é metade, sem descontos"() {
    const conta = F.decimoTerceiro({ salario: 3000, parcela: "primeira" });
    perto(conta.primeira, 1500);
    perto(conta.valor, 1500);
    assert.ok(conta.descontos > 0, "os descontos aparecem na conta do total");
  },
  "a segunda parcela desconta INSS e IRRF da metade que falta"() {
    const conta = F.decimoTerceiro({ salario: 3000, parcela: "segunda" });
    perto(conta.valor, 3000 - 1500 - conta.inss - conta.irrf);
    perto(conta.valor + 1500, conta.liquido);
  },
  "13º alto paga imposto e não tem redução"() {
    const conta = F.decimoTerceiro({ salario: 12000 });
    perto(conta.bruto, 12000);
    perto(conta.inss, S.inss(12000).total); // teto
    assert.equal(conta.reducao, 0);
    assert.ok(conta.irrf > 0);
    perto(conta.irrf, S.irrf(12000 - conta.inss).valor);
  },
  "sem salário o 13º fica incompleto"() {
    assert.deepEqual(F.decimoTerceiro({}), { incompleto: true });
    assert.deepEqual(F.decimoTerceiro({ salario: null }), { incompleto: true });
  },
  "valores saem arredondados em centavos"() {
    for (const salario of [1621, 2500.5, 3000, 12000]) {
      for (const conta of [F.ferias({ salario, abonar: true }), F.decimoTerceiro({ salario, avos: 7 })]) {
        for (const valor of [conta.bruto, conta.inss, conta.irrf, conta.liquido]) {
          assert.equal(Math.round(valor * 100) / 100, valor, `${salario}: ${valor}`);
        }
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
