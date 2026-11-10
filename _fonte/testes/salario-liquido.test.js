"use strict";
// INSS progressivo, IRRF e salário líquido (assets/ferramentas/salario-liquido-logica.js).
const assert = require("node:assert/strict");
const S = require("../../assets/ferramentas/salario-liquido-logica.js");

const perto = (valor, esperado, tolerancia = 0.02) =>
  assert.ok(Math.abs(valor - esperado) <= tolerancia, `esperava ${esperado}, veio ${valor}`);

const testes = {
  // ---------- Tabelas ----------
  "as tabelas estão na ordem e com o teto certo"() {
    assert.equal(S.TABELA.referencia, "2026");
    assert.equal(S.tetoInss(), 8475.55);
    assert.equal(S.TABELA.dependente, 189.59);
    assert.equal(S.TABELA.simplificado, 607.2);
    let anterior = 0;
    for (const faixa of S.TABELA.inss) {
      assert.ok(faixa.ate > anterior, "faixas do INSS em ordem");
      anterior = faixa.ate;
    }
    anterior = 0;
    for (const faixa of S.TABELA.irrf) {
      assert.ok(faixa.ate > anterior, "faixas do IRRF em ordem");
      anterior = faixa.ate;
    }
    assert.equal(S.TABELA.irrf.at(-1).aliquota, 0.275);
    assert.deepEqual(S.TABELA.reducao, { isencao: 5000, valor: 312.89, ate: 7350, base: 978.62, coeficiente: 0.133145 });
  },

  // ---------- INSS ----------
  "INSS de uma faixa só"() {
    perto(S.inss(1000).total, 75);
    perto(S.inss(1621).total, 121.58);
    assert.equal(S.inss(1621).faixas.length, 1);
  },
  "INSS progressivo em várias faixas"() {
    // 1621·7,5% + 1281,84·9% + 97,16·12%
    perto(S.inss(3000).total, 248.6);
    assert.equal(S.inss(3000).faixas.length, 3);
    // as quatro faixas até o teto
    perto(S.inss(8475.55).total, 988.09);
    assert.equal(S.inss(8475.55).faixas.length, 4);
  },
  "o INSS bate com a fórmula do site (salário × alíquota − dedução)"() {
    // Mesma conta que a tabela do ecalculos.com.br publica, com a coluna "dedução"
    for (const faixa of S.TABELA.inss) {
      const dentro = faixa.ate - 100;
      if (dentro > 0) perto(S.inss(dentro).total, dentro * faixa.aliquota - faixa.deducao);
      perto(S.inss(faixa.ate).total, faixa.ate * faixa.aliquota - faixa.deducao);
    }
    perto(S.inss(3000).total, 3000 * 0.12 - 111.4);
  },
  "INSS para no teto"() {
    perto(S.inss(20000).total, S.inss(8475.55).total, 0.001);
    assert.equal(S.inss(20000).faixas.at(-1).ate, 8475.55);
  },
  "INSS de zero ou negativo é zero"() {
    assert.equal(S.inss(0).total, 0);
    assert.equal(S.inss(-500).total, 0);
    assert.deepEqual(S.inss(0).faixas, []);
  },

  // ---------- IRRF ----------
  "IRRF isento até a primeira faixa"() {
    assert.equal(S.irrf(2000).valor, 0);
    assert.equal(S.irrf(2428.8).valor, 0);
    assert.equal(S.irrf(2428.8).aliquota, 0);
  },
  "IRRF desconta a parcela da faixa"() {
    perto(S.irrf(2500).valor, 2500 * 0.075 - 182.16); // 5,34
    perto(S.irrf(3000).valor, 3000 * 0.15 - 394.16); // 55,84
    perto(S.irrf(5000).valor, 5000 * 0.275 - 908.73); // 466,27
    assert.equal(S.irrf(5000).aliquota, 0.275);
  },
  "IRRF nunca é negativo"() {
    perto(S.irrf(2440).valor, 2440 * 0.075 - 182.16); // 0,84: ainda positivo, mas pequeno
    assert.equal(S.irrf(1).valor, 0, "abaixo da faixa isenta o imposto é zero");
    assert.equal(S.irrf(0).valor, 0);
  },

  // ---------- Redução mensal de 2026 (Lei 15.270/2025, art. 3º-A da Lei 9.250/95) ----------
  "a redução isenta até 5.000 e zera em 7.350"() {
    assert.equal(S.reducaoMensal(3000), 312.89);
    assert.equal(S.reducaoMensal(5000), 312.89);
    // No limite da primeira faixa a fórmula da segunda começa exatamente em 312,89
    perto(S.reducaoMensal(5000.01), 312.89);
    perto(S.reducaoMensal(6000), 978.62 - 0.133145 * 6000); // 179,75
    perto(S.reducaoMensal(7350), 0);
    // § 2º: acima de 7.350 não há redução nenhuma
    assert.equal(S.reducaoMensal(7350.01), 0);
    assert.equal(S.reducaoMensal(8000), 0);
    assert.equal(S.reducaoMensal(20000), 0);
    assert.equal(S.reducaoMensal(0), 0);
  },
  "a redução fica limitada ao imposto apurado (§ 1º)"() {
    // Renda baixa: o imposto é zero, então a redução não pode deixar nada negativo
    for (const bruto of [1200, 2000, 3000]) {
      const conta = S.calcular({ bruto });
      assert.ok(conta.irrf.valor >= 0, `bruto ${bruto}: ${conta.irrf.valor}`);
      assert.ok(conta.irrf.valor <= conta.irrf.antesDaReducao, `bruto ${bruto}`);
    }
    // E mesmo quando a redução é maior que o imposto, o desconto no líquido é só o imposto
    const conta = S.calcular({ bruto: 3000 });
    assert.equal(conta.irrf.valor, 0);
  },
  "a redução é a mesma nos dois regimes e não muda quem paga menos"() {
    // A função é monótona: escolher o menor imposto antes ou depois da redução dá o mesmo regime
    const conta = S.calcular({ bruto: 6000 });
    const legal = S.irrf(conta.baseLegal).valor;
    const simplificado = S.irrf(conta.baseSimplificada).valor;
    assert.equal(conta.irrf.usaSimplificado, simplificado < legal);
    perto(conta.irrf.antesDaReducao, Math.min(legal, simplificado));
  },

  // ---------- Conta completa ----------
  "salário de 3.000 fica isento de imposto em 2026"() {
    const conta = S.calcular({ bruto: 3000 });
    perto(conta.inss.total, 248.6);
    assert.equal(conta.irrf.valor, 0);
    assert.equal(conta.irrf.reducao, 312.89);
    perto(conta.liquido, 2751.4);
    perto(conta.totalDescontos, 248.6);
  },
  "salário de 5.000 também fica isento"() {
    const conta = S.calcular({ bruto: 5000 });
    perto(conta.inss.total, 501.51);
    assert.equal(conta.irrf.valor, 0, "a redução de 312,89 zera o imposto do simplificado");
    assert.equal(conta.irrf.usaSimplificado, true);
    perto(conta.liquido, 4498.49);
  },
  "acima de 5.000 o imposto volta, já com a redução aplicada"() {
    const conta = S.calcular({ bruto: 6000 });
    perto(conta.inss.total, 641.51);
    perto(conta.irrf.reducao, 179.75);
    perto(conta.irrf.antesDaReducao, S.irrf(conta.baseLegal).valor);
    perto(conta.irrf.valor, conta.irrf.antesDaReducao - conta.irrf.reducao);
    perto(conta.liquido, 6000 - conta.inss.total - conta.irrf.valor);
  },
  "salário alto tributa pela tabela legal, sem redução"() {
    const conta = S.calcular({ bruto: 8000 });
    perto(conta.inss.total, 921.51);
    assert.equal(conta.irrf.reducao, 0);
    assert.equal(conta.irrf.usaSimplificado, false);
    perto(conta.irrf.valor, S.irrf(conta.baseLegal).valor);
    perto(conta.liquido, 8000 - conta.inss.total - conta.irrf.valor);
  },
  "dependentes e pensão entram na base legal"() {
    const sem = S.calcular({ bruto: 9000 });
    const com = S.calcular({ bruto: 9000, dependentes: 2, pensao: 500 });
    assert.equal(com.dependentes, 2);
    perto(com.deducaoDependentes, 379.18);
    perto(com.baseLegal, 9000 - com.inss.total - 379.18 - 500);
    assert.ok(com.irrf.valor < sem.irrf.valor, "as deduções baixam o imposto");
    assert.ok(com.liquido < sem.liquido, "mas a pensão também sai do líquido");
  },
  "outros descontos saem do líquido sem mexer no imposto"() {
    const sem = S.calcular({ bruto: 8000 });
    const com = S.calcular({ bruto: 8000, outros: 120 });
    assert.equal(com.irrf.valor, sem.irrf.valor);
    perto(com.liquido, sem.liquido - 120);
  },
  "salário baixo só tem INSS"() {
    const conta = S.calcular({ bruto: 1200 });
    perto(conta.inss.total, 90);
    assert.equal(conta.irrf.valor, 0);
    perto(conta.liquido, 1110);
  },
  "valores inválidos devolvem incompleto"() {
    assert.deepEqual(S.calcular({}), { incompleto: true });
    assert.deepEqual(S.calcular({ bruto: 0 }), { incompleto: true });
    assert.deepEqual(S.calcular({ bruto: -100 }), { incompleto: true });
    assert.deepEqual(S.calcular({ bruto: null }), { incompleto: true });
    assert.deepEqual(S.calcular({ bruto: NaN }), { incompleto: true });
  },
  "dependentes fracionários ou negativos são corrigidos"() {
    assert.equal(S.calcular({ bruto: 9000, dependentes: 2.7 }).dependentes, 2);
    assert.equal(S.calcular({ bruto: 9000, dependentes: -3 }).dependentes, 0);
    assert.equal(S.calcular({ bruto: 9000, pensao: -50 }).pensao, 0);
  },
  "todos os valores saem arredondados em centavos"() {
    for (const bruto of [1200, 3000, 5000, 6000, 8000, 12000]) {
      const conta = S.calcular({ bruto, dependentes: 1 });
      for (const valor of [conta.inss.total, conta.irrf.valor, conta.irrf.reducao, conta.totalDescontos, conta.liquido]) {
        assert.equal(Math.round(valor * 100) / 100, valor, `bruto ${bruto}: ${valor}`);
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
