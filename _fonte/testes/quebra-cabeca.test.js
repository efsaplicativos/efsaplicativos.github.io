"use strict";
// Mesmos casos de app/src/test/.../logica/TabuleiroTest.kt do app Quebra-Cabeça Deslizante.
const assert = require("node:assert/strict");
const Q = require("../../assets/jogos/quebra-cabeca-logica.js");

function semente(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const testes = {
  "tabuleiro montado tem as peças em ordem e o vazio no fim"() {
    const t = Q.resolvido(3);
    assert.deepEqual(t, [1, 2, 3, 4, 5, 6, 7, 8, 0]);
    assert.equal(Q.posicaoVazia(t), 8);
    assert.ok(Q.estaResolvido(t));
    assert.ok(Q.ehSolucionavel(t));
  },

  "rejeita listas que não são permutações"() {
    assert.equal(Q.valido(3, [1, 2, 3, 4, 5, 6, 7, 8]), false);
    assert.equal(Q.valido(3, [1, 1, 3, 4, 5, 6, 7, 8, 0]), false);
    assert.equal(Q.valido(3, [1, 2, 3, 4, 5, 6, 7, 9, 0]), false);
    assert.equal(Q.valido(2, [1, 2, 3, 0]), false);
    assert.equal(Q.valido(6, Array.from({ length: 36 }, (_, i) => i)), false);
    assert.ok(Q.valido(3, [0, 1, 2, 3, 4, 5, 6, 7, 8]));
  },

  "só peças vizinhas do vazio podem mover"() {
    const t = Q.resolvido(3);
    assert.ok(Q.podeMover(t, 5));
    assert.ok(Q.podeMover(t, 7));
    for (const p of [4, 2, 6, 8, -1, 9]) assert.equal(Q.podeMover(t, p), false, `casa ${p}`);
  },

  "não move entre linhas pelo fim da linha"() {
    const t = [1, 2, 3, 0, 4, 5, 6, 7, 8];
    assert.equal(Q.podeMover(t, 2), false);
    assert.equal(Q.mover(t, 2), null);
    assert.ok(Q.podeMover(t, 0));
    assert.ok(Q.podeMover(t, 4));
    assert.ok(Q.podeMover(t, 6));
  },

  "mover troca a peça com o vazio sem alterar o original"() {
    const t = Q.resolvido(3);
    const movido = Q.mover(t, 7);
    assert.deepEqual(movido, [1, 2, 3, 4, 5, 6, 7, 0, 8]);
    assert.equal(Q.posicaoVazia(movido), 7);
    assert.equal(Q.estaResolvido(movido), false);
    assert.ok(Q.estaResolvido(t));
    assert.equal(Q.mover(t, 0), null);
  },

  "deslizar move a peça do lado oposto ao gesto"() {
    const t = Q.resolvido(3);
    assert.deepEqual(Q.deslizar(t, "direita"), [1, 2, 3, 4, 5, 6, 7, 0, 8]);
    assert.deepEqual(Q.deslizar(t, "baixo"), [1, 2, 3, 4, 5, 0, 7, 8, 6]);
    assert.equal(Q.deslizar(t, "esquerda"), null);
    assert.equal(Q.deslizar(t, "cima"), null);
  },

  "direção do arrasto usa o eixo predominante"() {
    assert.equal(Q.direcaoDoArrasto(30, 10), "direita");
    assert.equal(Q.direcaoDoArrasto(-30, 29), "esquerda");
    assert.equal(Q.direcaoDoArrasto(5, 40), "baixo");
    assert.equal(Q.direcaoDoArrasto(-5, -40), "cima");
  },

  "vitória só quando todas as peças estão no lugar"() {
    const quase = [1, 2, 3, 4, 5, 6, 7, 0, 8];
    assert.equal(Q.estaResolvido(quase), false);
    assert.ok(Q.estaResolvido(Q.mover(quase, 8)));
    assert.equal(Q.estaResolvido([0, 1, 2, 3, 4, 5, 6, 7, 8]), false);
  },

  "paridade em grade ímpar"() {
    assert.equal(Q.ehSolucionavel([2, 1, 3, 4, 5, 6, 7, 8, 0]), false);
    assert.ok(Q.ehSolucionavel([1, 2, 3, 4, 5, 6, 0, 7, 8]));
  },

  "paridade em grade par"() {
    const montado = Q.resolvido(4);
    assert.ok(Q.ehSolucionavel(montado));
    const trocado = montado.slice();
    trocado[13] = 15;
    trocado[14] = 14;
    assert.equal(Q.ehSolucionavel(trocado), false);
    assert.ok(Q.ehSolucionavel(Q.mover(montado, 11)));
  },

  "movimentos válidos preservam a solução"() {
    const aleatorio = semente(42);
    for (const tamanho of Q.TAMANHOS) {
      let t = Q.resolvido(tamanho);
      for (let k = 0; k < 500; k++) {
        const opcoes = t.map((_, i) => i).filter((i) => Q.podeMover(t, i));
        t = Q.mover(t, opcoes[Math.floor(aleatorio() * opcoes.length)]);
        assert.ok(Q.ehSolucionavel(t));
      }
    }
  },

  "embaralhado tem solução e nunca começa montado"() {
    const aleatorio = semente(7);
    for (const tamanho of Q.TAMANHOS) {
      for (let k = 0; k < 300; k++) {
        const t = Q.embaralhar(tamanho, aleatorio);
        assert.ok(Q.valido(tamanho, t));
        assert.ok(Q.ehSolucionavel(t));
        assert.equal(Q.estaResolvido(t), false);
      }
    }
  },

  "embaralhado pode ser resolvido de verdade no 3 × 3"() {
    // Busca em largura a partir do tabuleiro montado: todo sorteio precisa estar entre os alcançáveis
    const inicio = Q.resolvido(3).join("");
    const alcancaveis = new Set([inicio]);
    const fila = [Q.resolvido(3)];
    for (let k = 0; k < fila.length; k++) {
      const atual = fila[k];
      for (let pos = 0; pos < 9; pos++) {
        const prox = Q.mover(atual, pos);
        if (!prox) continue;
        const chave = prox.join("");
        if (!alcancaveis.has(chave)) {
          alcancaveis.add(chave);
          fila.push(prox);
        }
      }
    }
    assert.equal(alcancaveis.size, 181440); // 9!/2
    const aleatorio = semente(1);
    for (let k = 0; k < 200; k++) assert.ok(alcancaveis.has(Q.embaralhar(3, aleatorio).join("")));
  },

  "embaralhar distribui o vazio pelo tabuleiro"() {
    const aleatorio = semente(3);
    const posicoes = new Set();
    for (let k = 0; k < 400; k++) posicoes.add(Q.posicaoVazia(Q.embaralhar(4, aleatorio)));
    assert.equal(posicoes.size, 16);
  },

  "recorde é o menor tempo e, no empate, menos movimentos"() {
    let { lista, novoRecorde } = Q.registrarResultado([], { imagem: "a", tamanho: 3, tempoMs: 60000, movimentos: 40 });
    assert.ok(novoRecorde);
    ({ lista, novoRecorde } = Q.registrarResultado(lista, { imagem: "a", tamanho: 3, tempoMs: 61000, movimentos: 10 }));
    assert.equal(novoRecorde, false);
    ({ lista, novoRecorde } = Q.registrarResultado(lista, { imagem: "a", tamanho: 3, tempoMs: 60000, movimentos: 39 }));
    assert.ok(novoRecorde);
    ({ lista } = Q.registrarResultado(lista, { imagem: "a", tamanho: 4, tempoMs: 90000, movimentos: 80 }));
    assert.equal(lista.length, 2);
    assert.equal(Q.melhor(lista, "a", 3).movimentos, 39);
    assert.equal(Q.melhor(lista, "b", 3), null);
  },

  "recordes gravados são validados"() {
    const lidos = Q.lerRecordes(
      [
        { imagem: "a", tamanho: 3, tempoMs: 5000, movimentos: 20 },
        { imagem: "a", tamanho: 3, tempoMs: 4000, movimentos: 30 },
        { imagem: "x", tamanho: 3, tempoMs: 1000, movimentos: 5 },
        { imagem: "a", tamanho: 7, tempoMs: 1000, movimentos: 5 },
        "lixo",
      ],
      ["a"],
    );
    assert.deepEqual(lidos, [{ imagem: "a", tamanho: 3, tempoMs: 4000, movimentos: 30 }]);
  },

  "formata o tempo em mm:ss"() {
    assert.equal(Q.formatarTempo(0), "00:00");
    assert.equal(Q.formatarTempo(65999), "01:05");
    assert.equal(Q.formatarTempo(3600000), "60:00");
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
