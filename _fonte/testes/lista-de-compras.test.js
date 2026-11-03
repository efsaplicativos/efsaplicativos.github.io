"use strict";
/*
 * Testes da lógica da Lista de Compras, com os mesmos casos de CalculosTest.kt, RegrasItensTest.kt
 * e NumerosTest.kt do app Android. Rode com: node _fonte/testes/lista-de-compras.test.js
 */
const assert = require("node:assert/strict");
const L = require("../../assets/ferramentas/lista-de-compras-logica.js");

let casos = 0;
function teste(nome, corpo) {
  corpo();
  casos++;
  console.log(`ok - ${nome}`);
}

const item = (id, { quantidade = null, preco = null, naLista = true, comprado = false } = {}) => ({
  id,
  nome: `Item ${id}`,
  naLista,
  quantidade,
  precoUnitario: preco,
  comprado,
});
const assertNumero = (esperado, texto) => {
  const valor = L.analisar(texto);
  assert.ok(valor !== null && Math.abs(valor - esperado) < 1e-9, `"${texto}" deveria ser ${esperado}, veio ${valor}`);
};

// ---------- CalculosTest ----------

teste("subtotal: quantidade vazia conta como uma unidade", () => {
  assert.equal(L.subtotal(item(1, { preco: 7.99 })), 799n);
});

teste("subtotal: quantidade zero dá zero", () => {
  assert.equal(L.subtotal(item(1, { quantidade: 0, preco: 7.99 })), 0n);
});

teste("subtotal: sem preço dá zero", () => {
  assert.equal(L.subtotal(item(1, { quantidade: 3 })), 0n);
});

teste("subtotal: arredonda para centavos", () => {
  assert.equal(L.subtotal(item(1, { quantidade: 0.5, preco: 12.99 })), 650n);
  assert.equal(L.subtotal(item(1, { quantidade: 3, preco: 3.49 })), 1047n);
  assert.equal(L.subtotal(item(1, { quantidade: 1.234, preco: 3.6 })), 444n);
});

teste("resumo: carrinho só com marcados e estimado com todos da lista", () => {
  const itens = [
    item(1, { quantidade: 2, preco: 5, comprado: true }),
    item(2, { preco: 3.5, comprado: true }),
    item(3, { quantidade: 4, preco: 1.25 }),
    item(4, { quantidade: 1 }),
    item(5, { quantidade: 10, preco: 100, naLista: false, comprado: true }),
  ];
  const r = L.resumo(itens);
  assert.equal(r.quantidadeItens, 4);
  assert.equal(r.quantidadeComprados, 2);
  assert.equal(r.totalCarrinho, 1350n);
  assert.equal(r.totalEstimado, 1850n);
  assert.equal(r.progresso, 0.5);
});

teste("resumo: não acumula erro de ponto flutuante", () => {
  const itens = Array.from({ length: 10 }, (_, i) => item(i, { preco: 0.1, comprado: true }));
  assert.equal(L.resumo(itens).totalCarrinho, 100n);
});

teste("resumo: lista vazia", () => {
  const r = L.resumo([]);
  assert.equal(r.quantidadeItens, 0);
  assert.equal(r.totalCarrinho, 0n);
  assert.equal(r.progresso, 0);
});

// ---------- RegrasItensTest ----------

teste("normalizarNome tira espaços sobrando", () => {
  assert.equal(L.normalizarNome("  Arroz   5\tkg "), "Arroz 5 kg");
});

teste("nomeJaExiste ignora maiúsculas, acentos e espaços", () => {
  const itens = [{ id: 1, nome: "Pão francês" }, { id: 2, nome: "Leite" }];
  assert.ok(L.nomeJaExiste("pao frances", itens));
  assert.ok(L.nomeJaExiste("  LEITE ", itens));
  assert.ok(!L.nomeJaExiste("Leite condensado", itens));
  // Renomear um item para ele mesmo não é duplicidade
  assert.ok(!L.nomeJaExiste("leite", itens, 2));
});

teste("ordenar usa a ordem alfabética do português", () => {
  const nomes = ["ovo", "Óleo", "banana", "Açúcar", "arroz", "Abacate"];
  const itens = nomes.map((nome, i) => ({ id: i, nome }));
  assert.deepEqual(
    L.ordenar(itens).map((i) => i.nome),
    ["Abacate", "Açúcar", "arroz", "banana", "Óleo", "ovo"],
  );
});

teste("novoId nunca repete, mesmo no mesmo milissegundo", () => {
  const itens = [{ id: 1000, nome: "A" }, { id: 1005, nome: "B" }];
  assert.equal(L.novoId(itens, 2000), 2000);
  assert.equal(L.novoId(itens, 1005), 1006);
  assert.equal(L.novoId([], 50), 50);
});

const listaDeCompras = [
  { id: 1, nome: "Arroz", naLista: true, quantidade: 2, precoUnitario: 25.9, comprado: true },
  { id: 2, nome: "Feijão", naLista: true, quantidade: 1, precoUnitario: 8.5, comprado: false },
  { id: 3, nome: "Sal", naLista: false, quantidade: 1, precoUnitario: 2, comprado: false },
];

teste("finalizarCompra tira todos da lista e apaga os valores", () => {
  const resultado = L.finalizarCompra(listaDeCompras, false);
  assert.deepEqual(resultado.map((i) => i.nome), ["Arroz", "Feijão", "Sal"]);
  for (const i of resultado.slice(0, 2)) {
    assert.equal(i.naLista, false);
    assert.equal(i.comprado, false);
    assert.equal(i.quantidade, null);
    assert.equal(i.precoUnitario, null);
  }
  // Itens fora da lista não são tocados
  assert.equal(resultado[2], listaDeCompras[2]);
});

teste("finalizarCompra pode manter os não comprados", () => {
  const resultado = L.finalizarCompra(listaDeCompras, true);
  assert.equal(resultado[0].naLista, false);
  assert.equal(resultado[1], listaDeCompras[1]);
});

// ---------- NumerosTest ----------

teste("analisar aceita vírgula ou ponto como decimal", () => {
  assertNumero(2, "2");
  assertNumero(1.5, "1,5");
  assertNumero(1.5, "1.5");
  assertNumero(0.5, ",5");
  assertNumero(3, "3,");
  assertNumero(12.9, "R$ 12,90");
  assertNumero(0, "0");
});

teste("analisar entende separador de milhar", () => {
  assertNumero(1234.56, "1.234,56");
  assertNumero(1234.56, "1,234.56");
  assertNumero(1234567, "1.234.567");
  assertNumero(1234567, "1,234,567");
});

teste("analisar recusa texto vazio ou inválido", () => {
  for (const texto of ["", "   ", ",", ".", "abc", "1,2,3", "1.234,5,6", "-5"]) {
    assert.equal(L.analisar(texto), null, `"${texto}"`);
  }
});

teste("limparEntrada mantém só dígitos e separadores, com limite", () => {
  assert.equal(L.limparEntrada("12a,3b"), "12,3");
  assert.equal(L.limparEntrada(" 1.5 kg"), "1.5");
  assert.equal(L.limparEntrada("12345678901234").length, L.TAMANHO_MAXIMO);
});

teste("formatarMoeda usa o padrão brasileiro", () => {
  assert.equal(L.formatarMoeda(0n), "R$ 0,00");
  assert.equal(L.formatarMoeda(1250n), "R$ 12,50");
  assert.equal(L.formatarMoeda(123456n), "R$ 1.234,56");
  assert.equal(L.formatarMoeda(100000000n), "R$ 1.000.000,00");
});

teste("formatarQuantidade e formatarPreco para preencher os campos", () => {
  assert.equal(L.formatarQuantidade(2), "2");
  assert.equal(L.formatarQuantidade(1.5), "1,5");
  assert.equal(L.formatarQuantidade(1 / 3), "0,333");
  assert.equal(L.formatarPreco(12.5), "12,50");
  assert.equal(L.formatarPreco(1234), "1234,00");
});

teste("formatar e analisar são inversos", () => {
  for (const valor of [0.25, 1, 2.5, 10.75, 999.99]) {
    assertNumero(valor, L.formatarQuantidade(valor));
    assertNumero(valor, L.formatarPreco(valor));
  }
});

teste("plural concorda com a quantidade", () => {
  assert.equal(L.plural(1, "item", "itens"), "1 item");
  assert.equal(L.plural(0, "item", "itens"), "0 itens");
  assert.equal(L.plural(3, "item", "itens"), "3 itens");
});

// ---------- Ações da tela (ListaViewModel.kt) ----------

teste("adicionar valida nome vazio e duplicado e mantém a ordem", () => {
  let r = L.adicionar([], "   ", 10);
  assert.equal(r.resultado, "vazio");
  r = L.adicionar([], "  Leite ", 10);
  assert.equal(r.resultado, "ok");
  r = L.adicionar(r.itens, "Arroz", 10);
  assert.deepEqual(r.itens.map((i) => i.nome), ["Arroz", "Leite"]);
  assert.deepEqual(r.itens.map((i) => i.id), [11, 10]);
  assert.equal(L.adicionar(r.itens, "LEITE", 20).resultado, "duplicado");
});

teste("renomear para o próprio nome é permitido; para outro existente, não", () => {
  const itens = [{ id: 1, nome: "Leite" }, { id: 2, nome: "Café" }];
  assert.equal(L.renomear(itens, 1, "leite").resultado, "ok");
  assert.equal(L.renomear(itens, 1, "café").resultado, "duplicado");
  assert.deepEqual(L.renomear(itens, 2, "Açúcar").itens.map((i) => i.nome), ["Açúcar", "Leite"]);
});

teste("tirar da lista desmarca, e restaurar devolve o item como estava", () => {
  const { item: removido, itens } = L.removerDaLista(listaDeCompras, 1);
  assert.equal(itens[0].naLista, false);
  assert.equal(itens[0].comprado, false);
  assert.equal(itens[0].quantidade, 2);
  assert.deepEqual(L.restaurar(itens, removido), L.ordenar(listaDeCompras));
  const excluido = L.excluir(listaDeCompras, 2);
  assert.equal(excluido.itens.length, 2);
  assert.deepEqual(L.restaurar(excluido.itens, excluido.item), L.ordenar(listaDeCompras));
});

teste("alternar na lista apaga a marcação do carrinho", () => {
  const fora = L.alternarNaLista(listaDeCompras, 1)[0];
  assert.equal(fora.naLista, false);
  assert.equal(fora.comprado, false);
  assert.equal(L.alternarNaLista([fora], 1)[0].naLista, true);
  assert.equal(L.alternarComprado(listaDeCompras, 2)[1].comprado, true);
});

teste("lerItens descarta itens corrompidos e ids repetidos", () => {
  const texto = JSON.stringify([
    { id: 2, nome: "Leite", naLista: true, quantidade: 2, precoUnitario: 4.5, comprado: true },
    { id: 2, nome: "Repetido" },
    { id: "x", nome: "Sem id" },
    { id: 3, nome: "   " },
    null,
    { id: 1, nome: " Arroz ", naLista: false, quantidade: -1, precoUnitario: "9", comprado: true },
  ]);
  const itens = L.lerItens(texto);
  assert.deepEqual(itens.map((i) => i.nome), ["Arroz", "Leite"]);
  assert.equal(itens[0].quantidade, null);
  assert.equal(itens[0].precoUnitario, null);
  assert.equal(itens[0].comprado, false);
  assert.equal(itens[1].comprado, true);
  assert.deepEqual(L.lerItens("{quebrado"), []);
  assert.deepEqual(L.lerItens("null"), []);
});

console.log(`\n${casos} casos passaram.`);
