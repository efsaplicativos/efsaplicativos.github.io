"use strict";
// Testes da estatística: casos de StatisticsTest.kt (Calculadora Multifunção) e da formatação.
// Rode com: node _fonte/testes/estatistica.test.js
const assert = require("node:assert/strict");
const S = require("../../assets/ferramentas/estatistica-logica.js");

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
const perto = (real, esperado, tol = 1e-12) =>
  assert.ok(Math.abs(real - esperado) <= tol, `esperado ${esperado}, veio ${real}`);

// ---------- Casos do StatisticsTest ----------

teste("vírgula decimal quando há espaços ou ponto e vírgula", () => {
  assert.deepEqual(S.lerDados("1,5; 2,5").valores, [1.5, 2.5]);
  assert.deepEqual(S.lerDados("1,5 2,5\n3").valores, [1.5, 2.5, 3]);
  assert.deepEqual(S.lerDados("1.5, 2.5").valores, [1.5, 2.5]);
});

teste("vírgula separa valores quando não há espaços", () => {
  assert.deepEqual(S.lerDados("1,2,3").valores, [1, 2, 3]);
  assert.deepEqual(S.lerDados("1, 2, 3").valores, [1, 2, 3]);
});

teste("trechos inválidos são listados", () => {
  const lido = S.lerDados("1 abc 2 x");
  assert.deepEqual(lido.valores, [1, 2]);
  assert.deepEqual(lido.invalidos, ["abc", "x"]);
  assert.equal(S.lerDados("   ").valores.length, 0);
});

teste("estatísticas descritivas", () => {
  const r = S.calcular([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(r.n, 8);
  perto(r.soma, 40);
  perto(r.media, 5);
  perto(r.mediana, 4.5);
  assert.deepEqual(r.modas, [4]);
  perto(r.desvioPopulacional, 2);
  perto(r.varianciaAmostral, 32 / 7);
  perto(r.q1, 4);
  perto(r.q3, 5.5);
  perto(r.iqr, 1.5);
  perto(r.amplitude, 7);
  perto(r.assimetria, 0.8184875533567997, 1e-9);
  perto(r.curtose, 0.940625, 1e-9);
  perto(r.mediaGeometrica, 4.603215596046737, 1e-9);
  perto(r.mediaHarmonica, 4.201750729470613, 1e-9);
  assert.deepEqual(r.atipicos, [9]); // cerca superior = 5,5 + 2,25 = 7,75
});

teste("sem moda quando todos aparecem igualmente", () => {
  assert.deepEqual(S.modas([1, 2, 3]), []);
  assert.deepEqual(S.modas([1, 1, 2, 2]), []);
  assert.deepEqual(S.modas([1, 1, 2, 3, 3]), [1, 3]);
});

teste("um único valor", () => {
  const r = S.calcular([7]);
  assert.equal(r.mediana, 7);
  assert.equal(r.desvioAmostral, null);
  assert.equal(r.assimetria, null);
  assert.equal(r.histograma.length, 1);
});

teste("percentil e escore-z", () => {
  const ordenados = [1, 2, 3, 4];
  perto(S.percentil(ordenados, 25), 1.75);
  perto(S.percentil(ordenados, 100), 4);
  const r = S.calcular(ordenados);
  perto(S.escoreZ(4, r), (4 - 2.5) / r.desvioAmostral);
});

teste("histograma de Sturges e frequências", () => {
  const valores = Array.from({ length: 16 }, (_, i) => i + 1);
  const classes = S.histograma(valores);
  assert.equal(classes.length, 5); // ceil(log2 16) + 1
  assert.equal(
    classes.reduce((acc, c) => acc + c.quantidade, 0),
    16,
  );
  const freq = S.frequencias([1, 1, 2, 3]);
  perto(freq[0].porcentagem, 50);
  perto(freq[freq.length - 1].acumulada, 100);
});

// ---------- Textos da tela ----------

teste("exemplo e formatação dos resultados", () => {
  assert.equal(S.textoExemplo(), "12; 15,5; 15,5; 18; 20; 21,5; 22; 25; 30; 45");
  const r = S.calcular(S.lerDados(S.textoExemplo()).valores);
  const central = Object.fromEntries(S.central(r).map((l) => [l.rotulo, l.valor]));
  assert.equal(central["Quantidade (n)"], "10");
  assert.equal(central["Soma"], "224,5");
  assert.equal(central["Média"], "22,45");
  assert.equal(central["Mediana"], "20,75");
  assert.equal(central["Moda"], "15,5");
  const quartis = Object.fromEntries(S.secoes(r)[1].linhas.map((l) => [l.rotulo, l.valor]));
  assert.equal(quartis["1º quartil (Q1)"], "16,125");
  assert.equal(quartis["3º quartil (Q3)"], "24,25");
  assert.equal(quartis["Valores atípicos (1,5 × IQR)"], "45");
  assert.equal(S.notaHistograma(r), "5 classes de largura 6,6 (regra de Sturges)");
  assert.equal(S.classesHistograma(r)[0].texto, "[12; 18,6[");
  assert.equal(S.classesHistograma(r)[4].texto, "[38,4; 45]");
  assert.equal(S.textoOrdenado(r), "12; 15,5; 15,5; 18; 20; 21,5; 22; 25; 30; 45");
});

teste("percentil e escore-z digitados", () => {
  const r = S.calcular([1, 2, 3, 4]);
  assert.deepEqual(S.percentilDigitado(r, "25"), { rotulo: "Valor no percentil 25", valor: "1,75" });
  assert.deepEqual(S.percentilDigitado(r, "120"), { erro: "Informe um percentil entre 0 e 100" });
  assert.equal(S.percentilDigitado(r, ""), null);
  assert.equal(S.escoreZDigitado(r, ""), null);
  assert.deepEqual(S.escoreZDigitado(S.calcular([5, 5]), "3"), { aviso: "Sem dispersão nos dados: escore-z indefinido" });
  assert.deepEqual(S.escoreZDigitado(r, "4"), { valor: "1,1619" });
});

teste("sem dispersão: CV, assimetria e curtose", () => {
  const r = S.calcular([3, 3, 3, 3]);
  const forma = Object.fromEntries(S.secoes(r)[2].linhas.map((l) => [l.rotulo, l.valor]));
  assert.equal(forma["Assimetria"], "Dados insuficientes");
  const comNegativo = S.calcular([-1, 2, 3]);
  const forma2 = Object.fromEntries(S.secoes(comNegativo)[2].linhas.map((l) => [l.rotulo, l.valor]));
  assert.equal(forma2["Média geométrica"], "Requer valores positivos");
  const cv = S.secoes(S.calcular([-1, 1]))[0].linhas.find((l) => l.rotulo === "Coeficiente de variação");
  assert.equal(cv.valor, "—");
});

if (falhas) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log("\nTodos os testes passaram");
