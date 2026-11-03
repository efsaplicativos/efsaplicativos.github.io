"use strict";
// Testes da geometria: casos de GeometryTest.kt (Calculadora Multifunção) e da formatação.
// Rode com: node _fonte/testes/geometria.test.js
const assert = require("node:assert/strict");
const G = require("../../assets/ferramentas/geometria-logica.js");

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
const perto = (real, esperado, tol) =>
  assert.ok(Math.abs(real - esperado) <= tol, `esperado ${esperado}, veio ${real}`);

function sucesso(forma, valores) {
  const r = G.calcular(forma, valores);
  assert.ok(r.ok, `esperado sucesso: ${JSON.stringify(r)}`);
  return r;
}
const valor = (r, medida) => r.medidas.find(([m]) => m === medida)[1];
const PI = Math.PI;

// ---------- Casos do GeometryTest ----------

teste("círculo não tem volume", () => {
  const r = sucesso("circulo", { raio: 2 });
  perto(valor(r, "area"), 4 * PI, 1e-12);
  perto(valor(r, "circunferencia"), 4 * PI, 1e-12);
  assert.ok(!r.medidas.some(([m]) => m === "volume"));
});

teste("retângulo usa base e altura", () => {
  const r = sucesso("retangulo", { base: 3, altura: 4 });
  perto(valor(r, "area"), 12, 1e-12);
  perto(valor(r, "perimetro"), 14, 1e-12);
  perto(valor(r, "diagonal"), 5, 1e-12);
  assert.ok(r.formulas.includes("A = b·h"));
});

teste("triângulo pelos lados", () => {
  const r = sucesso("trianguloLados", { ladoA: 3, ladoB: 4, ladoC: 5 });
  perto(valor(r, "area"), 6, 1e-9);
  perto(valor(r, "anguloC"), 90, 1e-9);
  assert.equal(r.triangulo.lados, "escaleno");
  assert.equal(r.triangulo.angulos, "retangulo");

  const eq = G.classificarTriangulo(2, 2, 2);
  assert.equal(eq.lados, "equilatero");
  assert.equal(eq.angulos, "acutangulo");
  assert.equal(G.classificarTriangulo(2, 2, 3.9).angulos, "obtusangulo");

  assert.deepEqual(G.calcular("trianguloLados", { ladoA: 1, ladoB: 2, ladoC: 3 }), { ok: false, erro: "triangulo" });
});

teste("polígono regular e setor", () => {
  const hex = sucesso("poligonoRegular", { numeroLados: 6, lado: 2 });
  perto(valor(hex, "area"), 6 * Math.sqrt(3), 1e-9);
  perto(valor(hex, "anguloInterno"), 120, 1e-9);
  perto(valor(hex, "raioCircunscrito"), 2, 1e-9);
  assert.deepEqual(G.calcular("poligonoRegular", { numeroLados: 2.5, lado: 1 }), { ok: false, erro: "poligono" });
  const setor = sucesso("setor", { raio: 2, angulo: 90 });
  perto(valor(setor, "area"), PI, 1e-12);
  perto(valor(setor, "arco"), PI, 1e-12);
});

teste("elipse de Ramanujan coincide com o círculo", () => {
  perto(G.perimetroElipse(3, 3), 2 * PI * 3, 1e-9);
});

teste("sólidos", () => {
  perto(valor(sucesso("esfera", { raio: 3 }), "volume"), 36 * PI, 1e-9);
  const cone = sucesso("cone", { raio: 3, altura: 4 });
  perto(valor(cone, "geratriz"), 5, 1e-12);
  perto(valor(cone, "volume"), 12 * PI, 1e-9);
  perto(valor(cone, "areaTotal"), 24 * PI, 1e-9);
  const piramide = sucesso("piramide", { lado: 6, altura: 4 });
  perto(valor(piramide, "volume"), 48, 1e-9);
  perto(valor(piramide, "geratriz"), 5, 1e-9);
  perto(valor(piramide, "areaTotal"), 96, 1e-9);
  const tronco = sucesso("troncoCone", { raioMaior: 2, raioMenor: 2, altura: 5 });
  perto(valor(tronco, "volume"), PI * 4 * 5, 1e-9); // vira cilindro
  const caixa = sucesso("paralelepipedo", { comprimento: 2, largura: 3, altura: 6 });
  perto(valor(caixa, "volume"), 36, 1e-12);
  perto(valor(caixa, "diagonalSolido"), 7, 1e-12);
});

teste("valores inválidos", () => {
  assert.deepEqual(G.calcular("quadrado", { lado: 0 }), { ok: false, erro: "valores" });
  assert.deepEqual(G.calcular("retangulo", { base: 2 }), { ok: false, erro: "valores" });
  assert.deepEqual(G.calcular("paralelogramo", { base: 2, altura: 5, ladoInclinado: 3 }), { ok: false, erro: "alturaLado" });
});

// ---------- Tela ----------

teste("formatação das medidas e classificação", () => {
  const r = G.resultadoDaTela("circulo", { raio: "2" }, "cm");
  assert.equal(r.estado, "ok");
  assert.deepEqual(r.linhas[0], { rotulo: "Área", valor: "12,566371 cm²", destaque: true });
  assert.equal(r.linhas[2].valor, "4 cm");
  const porDiametro = G.resultadoDaTela("circulo", { diametro: "4", raio: "99" }, "m", true);
  assert.equal(porDiametro.linhas[0].valor, "12,566371 m²");
  const tri = G.resultadoDaTela("trianguloLados", { ladoA: "3", ladoB: "4", ladoC: "5" }, "cm");
  assert.deepEqual(tri.linhas[0], { rotulo: "Classificação", valor: "Escaleno, retângulo", destaque: true });
  assert.equal(tri.linhas.find((l) => l.rotulo.startsWith("Ângulo γ")).valor, "90°");
  const cubo = G.resultadoDaTela("cubo", { lado: "1000" }, "mm");
  assert.equal(cubo.linhas[0].valor, "1.000.000.000 mm³");
  assert.equal(G.resultadoDaTela("piramide", { lado: "6", altura: "4" }, "cm").linhas[1].rotulo, "Apótema da pirâmide");
});

teste("campos vazios e mensagens de erro", () => {
  assert.equal(G.resultadoDaTela("retangulo", { base: "3" }, "cm").estado, "vazio");
  assert.equal(G.resultadoDaTela("retangulo", { base: "3", altura: "abc" }, "cm").estado, "vazio");
  const erro = G.resultadoDaTela("setor", { raio: "2", angulo: "400" }, "cm");
  assert.equal(erro.estado, "erro");
  assert.equal(erro.mensagem, "O ângulo central deve estar entre 0° e 360°.");
  assert.equal(G.resultadoDaTela("quadrado", { lado: "-1" }, "cm").mensagem, G.ERROS.valores);
});

if (falhas) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log("\nTodos os testes passaram");
