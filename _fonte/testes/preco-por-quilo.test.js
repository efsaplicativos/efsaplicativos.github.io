"use strict";
// Preço por quilo, litro e unidade (assets/ferramentas/preco-por-quilo-logica.js).
const assert = require("node:assert/strict");
const P = require("../../assets/ferramentas/preco-por-quilo-logica.js");

const perto = (valor, esperado, tolerancia = 0.011) =>
  assert.ok(Math.abs(valor - esperado) <= tolerancia, `esperava ${esperado}, veio ${valor}`);

const testes = {
  "normaliza grama, miligrama e mililitro"() {
    assert.equal(P.item({ preco: 10, quantidade: 1000, unidade: "g" }).total, 1);
    assert.equal(P.item({ preco: 10, quantidade: 1000000, unidade: "mg" }).total, 1);
    assert.equal(P.item({ preco: 10, quantidade: 1000, unidade: "ml" }).total, 1);
    assert.equal(P.item({ preco: 10, quantidade: 2, unidade: "l" }).total, 2);
    assert.equal(P.item({ preco: 10, quantidade: 5, unidade: "un" }).total, 5);
  },
  "custo por quilo de cada embalagem"() {
    const cafe = P.comparar([
      { nome: "Pacote 500 g", preco: 18.9, quantidade: 500, unidade: "g" },
      { nome: "Pacote 1 kg", preco: 34.9, quantidade: 1, unidade: "kg" },
    ]);
    perto(cafe.itens.find((i) => i.nome === "Pacote 500 g").custo, 37.8);
    perto(cafe.itens.find((i) => i.nome === "Pacote 1 kg").custo, 34.9);
    assert.equal(cafe.melhor.nome, "Pacote 1 kg");
    assert.equal(cafe.unidadeDaBase, "kg");
    perto(cafe.diferenca, 2.9);
    perto(cafe.economia, ((37.8 - 34.9) / 37.8) * 100);
  },
  "compara litros com mililitros"() {
    const conta = P.comparar([
      { preco: 4.99, quantidade: 500, unidade: "ml" },
      { preco: 8.49, quantidade: 2, unidade: "l" },
    ]);
    // 500 ml a 4,99 = 9,98 por litro; 2 L a 8,49 = 4,245 por litro
    perto(conta.itens[0].custo, 4.245);
    assert.equal(conta.base, "l");
    assert.equal(conta.unidadeDaBase, "L");
    assert.ok(conta.economia > 0);
  },
  "compara unidades e ordena do mais barato ao mais caro"() {
    const conta = P.comparar([
      { nome: "A", preco: 12, quantidade: 3, unidade: "un" },
      { nome: "B", preco: 3.5, quantidade: 1, unidade: "un" },
      { nome: "C", preco: 20, quantidade: 6, unidade: "un" },
    ]);
    assert.deepEqual(conta.itens.map((i) => i.nome), ["C", "B", "A"]);
    assert.equal(conta.unidadeDaBase, "unidade");
    perto(conta.itens[0].custo, 3.33);
  },
  "empate: a economia é zero e a ordem é estável"() {
    const conta = P.comparar([
      { nome: "A", preco: 10, quantidade: 1, unidade: "kg" },
      { nome: "B", preco: 20, quantidade: 2, unidade: "kg" },
    ]);
    assert.equal(conta.economia, 0);
    assert.equal(conta.itens.length, 2);
  },
  "não compara grandezas diferentes"() {
    const conta = P.comparar([
      { preco: 10, quantidade: 1, unidade: "kg" },
      { preco: 5, quantidade: 1, unidade: "l" },
    ]);
    assert.deepEqual(conta, { erro: "grandezas" });
  },
  "dados inválidos são recusados"() {
    assert.deepEqual(P.comparar([]), { incompleto: true });
    assert.deepEqual(P.comparar([{ preco: 10, quantidade: 1, unidade: "kg" }]), { incompleto: true });
    assert.equal(P.item({ preco: null, quantidade: 1, unidade: "kg" }), null);
    assert.equal(P.item({ preco: 10, quantidade: 0, unidade: "kg" }), null);
    assert.equal(P.item({ preco: -1, quantidade: 1, unidade: "kg" }), null);
    assert.equal(P.item({ preco: 10, quantidade: 1, unidade: "tonelada" }), null);
  },
  "o nome padrão usa a quantidade e a unidade"() {
    assert.equal(P.item({ preco: 10, quantidade: 500, unidade: "g" }).nome, "500 grama");
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
