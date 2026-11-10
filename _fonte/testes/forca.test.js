"use strict";
// Jogo da forca (assets/jogos/forca-logica.js).
const assert = require("node:assert/strict");
const F = require("../../assets/jogos/forca-logica.js");

const sorteada = (tema = "animais", indice = 0) => F.iniciar({ tema, aleatorio: () => indice / 100 });

const testes = {
  "a partida começa com a palavra escondida e a dica"() {
    const partida = sorteada("animais", 0);
    assert.equal(partida.palavra, "JACARE");
    assert.equal(partida.dica, "réptil de rio com couro duro");
    assert.equal(partida.erros, 0);
    assert.deepEqual([...partida.letras], []);
    assert.equal(partida.terminada, false);
    assert.deepEqual(F.mascara(partida), ["_", "_", "_", "_", "_", "_"]);
  },
  "acertar uma letra revela todas as ocorrências"() {
    const partida = F.tentar(sorteada("animais", 0), "a");
    assert.deepEqual(F.mascara(partida), ["_", "A", "_", "A", "_", "_"]);
    assert.equal(partida.erros, 0);
    assert.ok(partida.letras.includes("A"));
  },
  "errar soma um erro sem revelar letra"() {
    const partida = F.tentar(sorteada("animais", 0), "z");
    assert.equal(partida.erros, 1);
    assert.deepEqual(F.mascara(partida), ["_", "_", "_", "_", "_", "_"]);
  },
  "a letra repetida não conta duas vezes"() {
    const uma = F.tentar(sorteada("animais", 0), "a");
    assert.equal(F.tentar(uma, "a"), uma);
    assert.equal(F.tentar(uma, "A"), uma);
  },
  "acentos digitados não atrapalham"() {
    const partida = F.tentar(sorteada("animais", 0), "á");
    assert.ok(partida.letras.includes("A"));
    assert.equal(partida.erros, 0);
  },
  "letra inválida é ignorada"() {
    const partida = sorteada("animais", 0);
    for (const entrada of ["", "1", "ab", null, undefined, "@"]) assert.equal(F.tentar(partida, entrada), partida);
  },
  "acertar todas as letras vence"() {
    let partida = sorteada("animais", 0);
    for (const letra of "jacare") partida = F.tentar(partida, letra);
    assert.equal(partida.vitoria, true);
    assert.ok(partida.terminada);
    assert.equal(partida.erros, 0);
    assert.deepEqual(F.mascara(partida), ["J", "A", "C", "A", "R", "E"]);
  },
  "seis erros encerram a partida"() {
    let partida = sorteada("animais", 0);
    for (const letra of "zbvnmk") partida = F.tentar(partida, letra);
    assert.equal(partida.erros, F.MAX_ERROS);
    assert.equal(partida.derrota, true);
    assert.ok(partida.terminada);
    assert.equal(partida.vitoria, false);
  },
  "depois de encerrar nenhuma tentativa muda a partida"() {
    let partida = sorteada("animais", 0);
    for (const letra of "zbvnmk") partida = F.tentar(partida, letra);
    assert.equal(F.tentar(partida, "a"), partida);
  },
  "todos os temas têm palavras e dicas"() {
    for (const tema of Object.keys(F.TEMAS)) {
      const dados = F.TEMAS[tema];
      assert.equal(dados[1].length > 0, true);
      assert.ok(dados[2].length >= 5, `${tema} tem poucas palavras`);
      for (const [palavra, dica] of dados[2]) {
        assert.ok(/^[A-Z]+$/.test(palavra), `${palavra} tem caractere estranho`);
        assert.ok(dica.length > 5, `${palavra} sem dica boa`);
      }
    }
  },
  "tema desconhecido cai em animais"() {
    assert.equal(F.iniciar({ tema: "inexistente", aleatorio: () => 0 }).tema, "animais");
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
