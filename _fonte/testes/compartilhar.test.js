"use strict";
// Compartilhar em texto (assets/jogos/compartilhar.js): resumo, marcas e cópia.
const assert = require("node:assert/strict");
const C = require("../../assets/jogos/compartilhar.js");

const testes = {
  "a data sai curta, com dois dígitos"() {
    assert.equal(C.dataCurta(new Date(2026, 10, 9)), "09/11/2026");
    assert.equal(C.dataCurta(new Date(2027, 0, 1)), "01/01/2027");
    assert.match(C.dataCurta(new Date("inválida")), /^\d{2}\/\d{2}\/\d{4}$/);
    assert.match(C.dataCurta(), /^\d{2}\/\d{2}\/\d{4}$/);
  },
  "as marcas mostram feito e faltando"() {
    assert.equal(C.marcas([true, true, false, false, true, false]), "✅✅⬜⬜✅⬜");
    assert.equal(C.marcas([]), "");
    assert.equal(C.marcas([false]), "⬜");
  },
  "o resumo junta título, placar, detalhes e assinatura"() {
    const texto = C.resumo({
      titulo: "Desafios do dia 09/11/2026",
      placar: "✅✅⬜ 2 de 3",
      detalhes: ["Sudoku ✅", "Soletra ✅", "Mahjong ⬜"],
      endereco: "efsaplicativos.com.br/desafios/",
    });
    const linhas = texto.split("\n");
    assert.equal(linhas[0], "Desafios do dia 09/11/2026");
    assert.equal(linhas[1], "✅✅⬜ 2 de 3");
    assert.equal(linhas[4], "Mahjong ⬜");
    assert.ok(linhas[5].includes("efsaplicativos.com.br/desafios/"));
    assert.ok(!texto.endsWith("\n"), "sem linha vazia no fim");
  },
  "o resumo dispensa o que está vazio"() {
    const texto = C.resumo({ titulo: "Soletra do dia", detalhes: ["", null, "24 palavras"] });
    assert.deepEqual(texto.split("\n"), ["Soletra do dia", "24 palavras", C.ASSINATURA]);
  },
  "copiar devolve false sem texto ou sem navegador"() {
    assert.equal(typeof C.copiar("x").then, "function", "copiar é assíncrono");
    return Promise.all([C.copiar(""), C.copiar(null), C.copiar("texto")]).then(([vazio, nulo, semNavegador]) => {
      assert.equal(vazio, false);
      assert.equal(nulo, false);
      assert.equal(semNavegador, false, "sem DOM e sem clipboard não há como copiar");
    });
  },
  "copiar usa o clipboard quando existe"() {
    return (async () => {
      let guardado = null;
      Object.defineProperty(globalThis, "navigator", {
        value: { clipboard: { writeText: async (t) => { guardado = t; } } },
        configurable: true,
      });
      try {
        assert.equal(await C.copiar("olá"), true);
        assert.equal(guardado, "olá");
      } finally {
        delete globalThis.navigator;
      }
    })();
  },
  "copiar cai no plano B quando o clipboard falha"() {
    return (async () => {
      const criados = [];
      Object.defineProperty(globalThis, "navigator", {
        value: { clipboard: { writeText: async () => { throw new Error("bloqueado"); } } },
        configurable: true,
      });
      globalThis.document = {
        createElement: () => {
          const area = { style: {}, value: "", setAttribute() {}, select() {}, remove() { area.removido = true; } };
          criados.push(area);
          return area;
        },
        body: { append() {} },
        execCommand: () => true,
      };
      try {
        assert.equal(await C.copiar("texto longo"), true);
        assert.equal(criados.length, 1);
        assert.equal(criados[0].removido, true, "a área temporária é removida");
      } finally {
        delete globalThis.navigator;
        delete globalThis.document;
      }
    })();
  },
};

(async () => {
  let falhas = 0;
  for (const [nome, teste] of Object.entries(testes)) {
    try {
      await teste();
      console.log(`ok   ${nome}`);
    } catch (erro) {
      falhas++;
      console.error(`FALHOU ${nome}\n${erro.stack}`);
    }
  }
  console.log(`\n${Object.keys(testes).length - falhas} de ${Object.keys(testes).length} testes passaram`);
  if (falhas) process.exit(1);
})();
