"use strict";
// Churrasco: quantidade por pessoa (assets/ferramentas/churrasco-logica.js).
const assert = require("node:assert/strict");
const C = require("../../assets/ferramentas/churrasco-logica.js");

const testes = {
  "10 adultos no perfil clássico"() {
    const conta = C.quantidades({ adultos: 10 });
    assert.equal(conta.pessoas, 10);
    assert.equal(conta.carne, 4000); // 400 g por adulto
    assert.equal(conta.carneKg, 4);
    assert.equal(conta.acompanhamento, 1500);
    assert.equal(conta.bebida, 5000);
    assert.equal(conta.bebidaLitros, 5);
    assert.equal(conta.carvao, 2000); // metade da carne
    assert.equal(conta.sal, 40); // 10 g por kg
    assert.equal(conta.porPessoa, 400);
  },
  "criança conta meia porção de carne"() {
    const conta = C.quantidades({ adultos: 4, criancas: 4 });
    assert.equal(conta.pessoas, 8);
    assert.equal(conta.carne, 4 * 400 + 4 * 200);
    assert.equal(conta.acompanhamento, 8 * 150);
    assert.equal(conta.bebida, 4 * 500 + 4 * 300);
  },
  "perfil com osso aumenta a carne"() {
    const classico = C.quantidades({ adultos: 6 });
    const comOsso = C.quantidades({ adultos: 6, perfil: "comOsso" });
    const leve = C.quantidades({ adultos: 6, perfil: "leve" });
    assert.equal(comOsso.carne, 3000);
    assert.equal(leve.carne, 1800);
    assert.ok(classico.carne > leve.carne && classico.carne < comOsso.carne);
  },
  "perfil desconhecido cai no clássico"() {
    assert.equal(C.quantidades({ adultos: 2, perfil: "inventado" }).carne, 800);
  },
  "só crianças também funciona"() {
    const conta = C.quantidades({ adultos: 0, criancas: 3 });
    assert.equal(conta.pessoas, 3);
    assert.equal(conta.carne, 600);
    assert.ok(conta.bebida > 0);
  },
  "entradas vazias ou zero pedem dados"() {
    assert.deepEqual(C.quantidades({}), { incompleto: true });
    assert.deepEqual(C.quantidades({ adultos: 0, criancas: 0 }), { incompleto: true });
    assert.deepEqual(C.quantidades({ adultos: null, criancas: 2 }), { incompleto: true });
  },
  "números fracionários são arredondados para baixo"() {
    assert.equal(C.quantidades({ adultos: 3.9 }).adultos, 3);
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
