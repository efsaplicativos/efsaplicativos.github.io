"use strict";
/*
 * Modo diário nos jogos restantes: o botão do dia nas páginas, o diario.js carregado e o gerador
 * da data entregue ao gerador de cada jogo. A repetição do embaralhamento é conferida aqui com o
 * Quebra-Cabeça e, nos outros, pelo teste de cada lógica (que já usa um gerador com semente).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");

const D = require("../../assets/jogos/diario.js");
const Quebra = require("../../assets/jogos/quebra-cabeca-logica.js");

const hoje = new Date(2026, 10, 9);
const amanha = new Date(2026, 10, 10);
const JOGOS = {
  "campo-minado": "cm",
  "caca-palavras": "cz",
  "quebra-cabeca": "qc",
  mahjong: "mj",
};

const testes = {
  "quebra-cabeça: o embaralhamento do dia é o mesmo"() {
    const pecas = (data) => Quebra.embaralhar(4, D.doDia("quebra-cabeca", data).gerador).join(",");
    assert.equal(pecas(hoje), pecas(hoje));
    assert.notEqual(pecas(hoje), pecas(amanha));
  },
  "cada página carrega o diario.js e mostra o botão do dia"() {
    for (const [jogo, prefixo] of Object.entries(JOGOS)) {
      const pagina = fs.readFileSync(`jogos/${jogo}/index.html`, "utf8");
      assert.ok(pagina.includes("/assets/jogos/diario.js"), `${jogo} sem diario.js`);
      assert.ok(pagina.includes(`id="${prefixo}-diario"`), `${jogo} sem o botão do dia`);
    }
  },
  "cada interface entrega o gerador do dia ao jogo"() {
    for (const jogo of Object.keys(JOGOS)) {
      const codigo = fs.readFileSync(`assets/jogos/${jogo}.js`, "utf8");
      assert.ok(codigo.includes(`D.doDia("${jogo}").gerador`), `${jogo} não usa o gerador do dia`);
      assert.ok(codigo.includes('typeof Diario === "object"'), `${jogo} não protege contra o diario.js ausente`);
      assert.ok(codigo.includes(`botaoDiario.hidden = true`), `${jogo} não esconde o botão sem o script`);
    }
  },
  "o botão do dia fica escondido quando falta o diario.js"() {
    for (const jogo of Object.keys(JOGOS)) {
      const codigo = fs.readFileSync(`assets/jogos/${jogo}.js`, "utf8");
      assert.ok(/if \(!D && botaoDiario\) botaoDiario\.hidden = true;/.test(codigo), `${jogo} sem a guarda`);
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
