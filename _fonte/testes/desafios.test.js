"use strict";
/*
 * Hub dos desafios do dia: cada jogo listado precisa marcar o dia em diario.js, e a página precisa
 * carregar o módulo. Também confere que a página tem os seis jogos e os ids que o script usa.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");

const JOGOS = ["sudoku", "campo-minado", "caca-palavras", "quebra-cabeca", "mahjong", "soletra"];
const pagina = fs.readFileSync("desafios/index.html", "utf8");
const script = fs.readFileSync("assets/jogos/desafios.js", "utf8");

const testes = {
  "a página carrega o diario.js e o script do hub"() {
    assert.ok(pagina.includes("/assets/jogos/diario.js"), "sem diario.js");
    assert.ok(pagina.includes("/assets/jogos/desafios.js"), "sem desafios.js");
    assert.ok(pagina.includes("/assets/jogos/desafios.css"), "sem desafios.css");
  },
  "a página lista os seis jogos do dia"() {
    const listados = [...pagina.matchAll(/data-jogo="([\w-]+)"/g)].map((m) => m[1]);
    assert.deepEqual(listados, JOGOS);
    for (const jogo of JOGOS) {
      assert.ok(pagina.includes(`href="/jogos/${jogo}/"`), `${jogo} sem link`);
      assert.ok(pagina.includes(`class="ds-selo" hidden`), "selo sempre visível");
    }
  },
  "os ids usados pelo script existem na página"() {
    const ids = [...new Set([...script.matchAll(/\$\("#([\w-]+)"\)/g)].map((m) => m[1]))];
    ids.push(...[...script.matchAll(/querySelector\("#([\w-]+)"\)/g)].map((m) => m[1]));
    assert.ok(ids.length >= 3, "poucos ids no script");
    for (const id of ids) assert.ok(pagina.includes(`id="${id}"`), `falta o id ${id}`);
  },
  "cada jogo da lista marca o dia concluído"() {
    for (const jogo of JOGOS) {
      const codigo = fs.readFileSync(`assets/jogos/${jogo}.js`, "utf8");
      assert.ok(codigo.includes(`D.marcarConcluido("${jogo}")`), `${jogo} não marca o dia`);
      assert.ok(codigo.includes(`id="${jogo === "quebra-cabeca" ? "qc" : jogo === "campo-minado" ? "cm" : jogo === "caca-palavras" ? "cz" : jogo === "mahjong" ? "mj" : jogo === "sudoku" ? "sd" : "sl"}-diario"`) || codigo.includes('-diario'), `${jogo} sem botão do dia`);
    }
  },
  "o hub oferece o botão de recomeçar o dia"() {
    assert.ok(pagina.includes('id="ds-limpar"'), "sem botão de recomeçar");
    assert.ok(script.includes("D.limpar("), "o script não apaga as marcas");
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
