"use strict";
// Modo diário (assets/jogos/diario.js): a mesma partida para todos no mesmo dia.
const assert = require("node:assert/strict");

// O Node não tem localStorage: um mapa de mentira faz as vezes dele.
const memoria = new Map();
globalThis.localStorage = {
  getItem: (chave) => (memoria.has(chave) ? memoria.get(chave) : null),
  setItem: (chave, valor) => memoria.set(chave, String(valor)),
  removeItem: (chave) => memoria.delete(chave),
};

const D = require("../../assets/jogos/diario.js");

const testes = {
  "a data vira AAAA-MM-DD com dois dígitos"() {
    assert.equal(D.chave(new Date(2026, 0, 5)), "2026-01-05");
    assert.equal(D.chave(new Date(2026, 10, 9)), "2026-11-09");
    assert.equal(D.chave(new Date(2026, 11, 31)), "2026-12-31");
  },
  "data inválida cai em hoje, sem quebrar"() {
    const hoje = new Date();
    for (const entrada of [undefined, null, "2026-01-01", new Date("inválida"), 42]) {
      const valor = D.chave(entrada);
      assert.match(valor, /^\d{4}-\d{2}-\d{2}$/);
      if (entrada === undefined) assert.equal(valor, D.chave(hoje));
    }
  },
  "a semente é estável e cabe em 32 bits"() {
    const a = D.semente("sudoku|2026-11-09");
    assert.equal(a, D.semente("sudoku|2026-11-09"));
    assert.ok(Number.isInteger(a) && a >= 0 && a <= 0xffffffff);
    assert.notEqual(a, D.semente("sudoku|2026-11-10"));
    assert.notEqual(a, D.semente("campo-minado|2026-11-09"));
  },
  "o gerador devolve sempre valores em [0, 1)"() {
    const sortear = D.gerador(D.semente("teste"));
    for (let i = 0; i < 2000; i++) {
      const valor = sortear();
      assert.ok(valor >= 0 && valor < 1, `valor fora da faixa: ${valor}`);
    }
  },
  "a mesma semente repete a mesma sequência; outra semente muda"() {
    const primeira = Array.from({ length: 20 }, D.gerador(12345));
    const segunda = Array.from({ length: 20 }, D.gerador(12345));
    assert.deepEqual(primeira, segunda);
    assert.notDeepEqual(primeira, Array.from({ length: 20 }, D.gerador(12346)));
  },
  "o gerador é disputado o suficiente para não repetir"() {
    const sortear = D.gerador(7);
    const valores = new Set(Array.from({ length: 500 }, sortear));
    assert.ok(valores.size > 490, `só ${valores.size} valores diferentes em 500`);
  },
  "doDia é igual no mesmo dia e muda de um dia para o outro"() {
    const hoje = new Date(2026, 10, 9);
    const amanha = new Date(2026, 10, 10);
    const a = D.doDia("sudoku", hoje);
    const b = D.doDia("sudoku", hoje);
    assert.equal(a.data, "2026-11-09");
    assert.equal(a.semente, b.semente);
    assert.deepEqual(Array.from({ length: 10 }, a.gerador), Array.from({ length: 10 }, b.gerador));
    assert.notEqual(D.doDia("sudoku", amanha).semente, a.semente);
  },
  "cada jogo tem a sua partida do dia"() {
    const hoje = new Date(2026, 10, 9);
    assert.notEqual(D.doDia("sudoku", hoje).semente, D.doDia("campo-minado", hoje).semente);
  },
  "concluir hoje vale só para hoje"() {
    const hoje = new Date(2026, 10, 9);
    const amanha = new Date(2026, 10, 10);
    assert.equal(D.concluido("sudoku", hoje), false);
    D.marcarConcluido("sudoku", hoje);
    assert.equal(D.concluido("sudoku", hoje), true);
    assert.equal(D.concluido("sudoku", amanha), false, "amanhã é outra partida");
    assert.equal(D.concluido("campo-minado", hoje), false, "o registro é por jogo");
    assert.equal(D.ler("sudoku"), "2026-11-09");
  },
  "limpar apaga a marca do dia"() {
    const hoje = new Date(2026, 10, 9);
    D.marcarConcluido("quebra-cabeca", hoje);
    assert.equal(D.concluido("quebra-cabeca", hoje), true);
    D.limpar("quebra-cabeca");
    assert.equal(D.concluido("quebra-cabeca", hoje), false);
    assert.equal(D.ler("quebra-cabeca"), null);
    assert.doesNotThrow(() => D.limpar("jogo-que-nunca-existiu"));
  },
  "sem localStorage o módulo continua funcionando"() {
    const guardado = globalThis.localStorage;
    try {
      globalThis.localStorage = {
        getItem() {
          throw new Error("bloqueado");
        },
        setItem() {
          throw new Error("bloqueado");
        },
      };
      assert.equal(D.ler("sudoku"), null);
      assert.doesNotThrow(() => D.marcarConcluido("sudoku"));
      assert.equal(D.concluido("sudoku"), false);
    } finally {
      globalThis.localStorage = guardado;
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
