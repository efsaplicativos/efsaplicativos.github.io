"use strict";
// Testes das matrizes: casos de MatrixTest.kt (Calculadora Multifunção) e das regras da tela.
// Rode com: node _fonte/testes/matrizes.test.js
const assert = require("node:assert/strict");
const X = require("../../assets/ferramentas/matrizes-logica.js");

let falhas = 0;
function teste(nome, fn) {
  try {
    fn();
    console.log(`ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`FALHOU ${nome}\n     ${erro.message}`);
  }
}
function matrizPerto(esperada, real, eps = 1e-9) {
  assert.equal(real.length, esperada.length, "linhas");
  assert.equal(real[0].length, esperada[0].length, "colunas");
  esperada.forEach((linha, r) =>
    linha.forEach((v, c) => assert.ok(Math.abs(real[r][c] - v) <= eps, `[${r},${c}] esperado ${v}, veio ${real[r][c]}`)),
  );
}
const erroDe = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.tipo;
  }
  return null;
};

/** 36 células a partir de uma matriz pequena (o resto fica vazio). */
function celulas(m) {
  const lista = Array(36).fill("");
  m.forEach((linha, r) =>
    linha.forEach((v, c) => {
      lista[r * 6 + c] = String(v);
    }),
  );
  return lista;
}

// ---------- Casos do MatrixTest ----------

teste("soma e subtração", () => {
  const a = [
    [1, 2],
    [3, 4],
  ];
  const b = [
    [0.5, -1],
    [2, 0],
  ];
  matrizPerto(
    [
      [1.5, 1],
      [5, 4],
    ],
    X.somar(a, b),
  );
  matrizPerto(
    [
      [0.5, 3],
      [1, 4],
    ],
    X.subtrair(a, b),
  );
  assert.equal(
    erroDe(() => X.somar(a, [[1, 2, 3]])),
    "dimensoesSoma",
  );
});

teste("produto de matrizes retangulares", () => {
  const a = [
    [1, 2, 3],
    [4, 5, 6],
  ];
  const b = [
    [7, 8],
    [9, 10],
    [11, 12],
  ];
  matrizPerto(
    [
      [58, 64],
      [139, 154],
    ],
    X.multiplicar(a, b),
  );
  assert.equal(X.multiplicar(b, a).length, 3);
  assert.equal(
    erroDe(() => X.multiplicar(a, a)),
    "dimensoesProduto",
  );
});

teste("determinante", () => {
  assert.ok(
    Math.abs(
      X.determinante([
        [1, 2],
        [3, 4],
      ]) + 2,
    ) <= 1e-12,
  );
  const a3 = [
    [2, -3, 1],
    [2, 0, -1],
    [1, 4, 5],
  ];
  assert.ok(Math.abs(X.determinante(a3) - 49) <= 1e-9);
  assert.equal(
    X.determinante([
      [1, 2],
      [2, 4],
    ]),
    0,
  );
  assert.equal(X.determinante([[5]]), 5);
});

teste("inversa e singular", () => {
  const a = [
    [4, 7],
    [2, 6],
  ];
  matrizPerto(
    [
      [0.6, -0.7],
      [-0.2, 0.4],
    ],
    X.inversa(a),
  );
  matrizPerto(X.identidade(2), X.limpar(X.multiplicar(a, X.inversa(a))));
  assert.equal(
    erroDe(() =>
      X.inversa([
        [1, 2],
        [2, 4],
      ]),
    ),
    "singular",
  );
});

teste("posto, traço e transposta", () => {
  assert.equal(
    X.posto([
      [1, 2],
      [2, 4],
    ]),
    1,
  );
  assert.equal(
    X.posto([
      [1, 2, 3],
      [4, 5, 6],
    ]),
    2,
  );
  assert.equal(X.posto([[0, 0]]), 0);
  assert.equal(
    X.traco([
      [1, 2],
      [3, 4],
    ]),
    5,
  );
  const t = X.transposta([[1, 2, 3]]);
  assert.equal(t.length, 3);
  assert.equal(t[0].length, 1);
});

teste("potências", () => {
  const a = [
    [1, 1],
    [1, 0],
  ];
  matrizPerto(
    [
      [8, 5],
      [5, 3],
    ],
    X.potencia(a, 5),
  ); // Fibonacci
  matrizPerto(X.identidade(2), X.potencia(a, 0));
  const b = [
    [2, 0],
    [0, 4],
  ];
  matrizPerto(
    [
      [0.25, 0],
      [0, 0.0625],
    ],
    X.potencia(b, -2),
  );
  matrizPerto([[3, -6]], X.escalar([[-1, 2]], -3));
});

// ---------- Tela ----------

const base = (extra) => ({
  alvo: "A",
  celulasA: celulas([
    [4, 7],
    [2, 6],
  ]),
  celulasB: celulas([
    [1, 2],
    [3, 4],
  ]),
  linhasA: 2,
  colunasA: 2,
  linhasB: 2,
  colunasB: 2,
  k: "2",
  n: "2",
  ...extra,
});

teste("operações da tela e títulos", () => {
  const produto = X.calcular(base({ operacao: "produtoAB" }));
  assert.equal(X.titulo(produto), "A × B — Matriz 2 × 2");
  matrizPerto(
    [
      [25, 36],
      [20, 28],
    ],
    produto.matriz,
  );
  const det = X.calcular(base({ operacao: "determinante" }));
  assert.equal(det.titulo, "det(A)");
  assert.equal(X.textoEscalar(det.valor), "10");
  const singular = X.calcular(base({ operacao: "determinante", alvo: "B", celulasB: celulas([[1, 2], [2, 4]]) }));
  assert.equal(singular.nota, "Determinante 0: a matriz é singular (não inversível).");
  assert.equal(X.calcular(base({ operacao: "potencia", n: "-1" })).titulo, "A⁻¹");
  assert.equal(X.calcular(base({ operacao: "posto", alvo: "B" })).titulo, "Posto (B)");
  const inversa = X.calcular(base({ operacao: "inversa" }));
  assert.deepEqual(
    inversa.matriz.map((l) => l.map(X.textoCelula)),
    [
      ["0,6", "-0,7"],
      ["-0,2", "0,4"],
    ],
  );
  assert.equal(X.textoCopia(inversa.matriz), "0,6\t-0,7\n-0,2\t0,4");
  assert.equal(X.textoParaCelula(inversa.matriz[0][1]), "-0,7");
});

teste("mensagens de erro da tela", () => {
  assert.equal(
    X.calcular(base({ operacao: "soma", linhasB: 3 })).mensagem,
    "Para somar ou subtrair, A e B precisam ter as mesmas dimensões (A é 2×2 e B é 3×2).",
  );
  assert.equal(
    X.calcular(base({ operacao: "produtoBA", colunasB: 3 })).mensagem,
    "Para multiplicar, o número de colunas da primeira matriz (3) deve ser igual ao número de linhas da segunda (2).",
  );
  assert.equal(
    X.calcular(base({ operacao: "traco", colunasA: 3 })).mensagem,
    "Esta operação exige uma matriz quadrada (mesmo número de linhas e colunas).",
  );
  assert.equal(X.calcular(base({ operacao: "escalar", k: "" })).mensagem, "Informe o escalar k.");
  assert.equal(X.calcular(base({ operacao: "potencia", n: "1,5" })).mensagem, "Informe um expoente inteiro.");
  assert.equal(X.calcular(base({ operacao: "potencia", n: "1001" })).mensagem, "Expoente muito grande (máximo ±1000).");
  const invalida = base({ operacao: "transposta", alvo: "B" });
  invalida.celulasA[0] = "abc";
  assert.equal(X.calcular(invalida).tipo, "matriz"); // A inválida não importa se a operação é só com B
  invalida.operacao = "soma";
  assert.equal(X.calcular(invalida).mensagem, "Há células com valores inválidos na Matriz A.");
  assert.equal(
    X.calcular(base({ operacao: "inversa", celulasA: celulas([[1, 2], [2, 4]]) })).mensagem,
    "A matriz é singular (determinante igual a 0) e não possui inversa.",
  );
});

if (falhas) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log("\nTodos os testes passaram");
