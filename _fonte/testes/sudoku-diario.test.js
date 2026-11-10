"use strict";
// Modo diário no Sudoku: a data gera sempre o mesmo tabuleiro (assets/jogos/diario.js + sudoku-logica.js).
const assert = require("node:assert/strict");

const memoria = new Map();
globalThis.localStorage = {
  getItem: (chave) => (memoria.has(chave) ? memoria.get(chave) : null),
  setItem: (chave, valor) => memoria.set(chave, String(valor)),
};

const D = require("../../assets/jogos/diario.js");
const S = require("../../assets/jogos/sudoku-logica.js");

const jogar = (nivelId, data) => S.gerar(S.NIVEIS[nivelId], D.doDia("sudoku", data).gerador);

const testes = {
  "a mesma data gera o mesmo tabuleiro"() {
    const hoje = new Date(2026, 10, 9);
    const a = jogar("facil", hoje);
    const b = jogar("facil", hoje);
    assert.deepEqual(a.enunciado, b.enunciado);
    assert.deepEqual(a.solucao, b.solucao);
  },
  "outro dia gera outro tabuleiro"() {
    const a = jogar("facil", new Date(2026, 10, 9));
    const b = jogar("facil", new Date(2026, 10, 10));
    assert.notDeepEqual(a.enunciado, b.enunciado);
  },
  "o tabuleiro do dia respeita o nível escolhido"() {
    const hoje = new Date(2026, 10, 9);
    const facil = jogar("facil", hoje);
    const dificil = jogar("dificil", hoje);
    const vazias = (p) => p.enunciado.filter((n) => n === S.VAZIA).length;
    assert.equal(vazias(facil), S.NIVEIS.facil.casasVazias);
    assert.equal(vazias(dificil), S.NIVEIS.dificil.casasVazias);
  },
  "o tabuleiro do dia segue as regras do Sudoku"() {
    const puzzle = jogar("medio", new Date(2026, 10, 9));
    assert.equal(puzzle.enunciado.length, S.CASAS);
    assert.ok(S.estaResolvido(puzzle.solucao), "a solução está completa e sem conflito");
    for (let i = 0; i < S.CASAS; i++) {
      if (puzzle.enunciado[i] !== S.VAZIA) assert.equal(puzzle.enunciado[i], puzzle.solucao[i]);
    }
    const jogo = S.novoJogo(S.NIVEIS.medio, puzzle);
    assert.ok(S.jogoValido(jogo), "o jogo montado passa na validação do app");
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
