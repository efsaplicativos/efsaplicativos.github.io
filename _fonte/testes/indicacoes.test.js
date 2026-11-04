"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const I = require("../../assets/indicacoes.js");

// Só https e só os endereços da loja certa
assert.equal(I.linkValido("https://amzn.to/3AbCdEf", "amazon"), true);
assert.equal(I.linkValido("https://link.amazon/B03b6LpYl", "amazon"), true);
assert.equal(I.linkValido("https://www.amazon.com.br/dp/B000000000?tag=efs-20", "amazon"), true);
assert.equal(I.linkValido("https://mercadolivre.com/sec/1a2b3c", "mercadolivre"), true);
assert.equal(I.linkValido("https://produto.mercadolivre.com.br/MLB-123", "mercadolivre"), true);
assert.equal(I.linkValido("https://meli.la/abc", "mercadolivre"), true);
assert.equal(I.linkValido("http://amzn.to/3AbCdEf", "amazon"), false);
assert.equal(I.linkValido("https://amzn.to/3AbCdEf", "mercadolivre"), false);
assert.equal(I.linkValido("https://amazon.com.br.golpe.com/x", "amazon"), false);
assert.equal(I.linkValido("https://falsoamazon.com.br/x", "amazon"), false);
assert.equal(I.linkValido("https://link.amazon.golpe.com/x", "amazon"), false);
assert.equal(I.linkValido("https://link.amazon/x", "mercadolivre"), false);
assert.equal(I.linkValido("javascript:alert(1)", "amazon"), false);
assert.equal(I.linkValido("", "amazon"), false);
assert.equal(I.linkValido("https://amzn.to/x", "outra"), false);

const lista = {
  pagina: [
    { nome: "Com os dois", texto: "", amazon: "https://amzn.to/a", mercadolivre: "https://meli.la/b" },
    { nome: "Só Amazon", texto: "", amazon: "https://amzn.to/c", mercadolivre: "" },
    { nome: "Sem link", texto: "", amazon: "", mercadolivre: "" },
    { nome: "Link errado", texto: "", amazon: "http://amzn.to/d", mercadolivre: "" },
  ],
  vazia: [{ nome: "Sem link", texto: "", amazon: "", mercadolivre: "" }],
};

// Fora do teste, só aparecem produtos com pelo menos um link válido
const visiveis = I.produtosDaPagina("pagina", false, lista);
assert.deepEqual(visiveis.map((p) => p.nome), ["Com os dois", "Só Amazon"]);
assert.deepEqual(visiveis[0].links.map((l) => l.loja), ["amazon", "mercadolivre"]);
assert.deepEqual(visiveis[1].links.map((l) => l.loja), ["amazon"]);
assert.deepEqual(I.produtosDaPagina("vazia", false, lista), []);
assert.deepEqual(I.produtosDaPagina("nao-existe", false, lista), []);
assert.deepEqual(I.produtosDaPagina("constructor", false, lista), []);

// No modo de teste aparecem todos, com link vazio onde ainda não há link válido
const todos = I.produtosDaPagina("pagina", true, lista);
assert.equal(todos.length, 4);
assert.deepEqual(todos[2].links.map((l) => l.link), ["", ""]);
assert.deepEqual(todos[3].links.map((l) => l.link), ["", ""]);

assert.deepEqual(I.linksInvalidos(lista), ["pagina: Link errado (Amazon)"]);

// A lista do site não tem link recusado e cada página citada existe em _fonte/paginas
assert.deepEqual(I.linksInvalidos(), []);
const paginas = path.join(__dirname, "..", "paginas");
for (const pagina of Object.keys(I.INDICACOES)) {
  const existe = ["jogos", "ferramentas"].some((secao) => fs.existsSync(path.join(paginas, secao, `${pagina}.html`)));
  assert.ok(existe, `${pagina} não existe em _fonte/paginas`);
}

console.log("indicacoes: ok");
