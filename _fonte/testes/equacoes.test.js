"use strict";
// Testes das equações: casos de EquationSolverTest.kt (Calculadora Multifunção) e dos relatórios.
// Rode com: node _fonte/testes/equacoes.test.js
const assert = require("node:assert/strict");
const E = require("../../assets/ferramentas/equacoes-logica.js");

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
const perto = (real, esperado, tol, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol, `${msg || ""} esperado ${esperado}, veio ${real}`);
const num = (v) => String(v);

// ---------- Casos do EquationSolverTest ----------

teste("primeiro grau", () => {
  assert.deepEqual(E.resolverLinear(2, -5), { tipo: "raiz", x: 2.5 });
  assert.deepEqual(E.resolverLinear(0, 3), { tipo: "impossivel" });
  assert.deepEqual(E.resolverLinear(0, 0), { tipo: "infinitas" });
});

teste("segundo grau com duas raízes reais", () => {
  const r = E.resolverQuadratica(1, -3, 2);
  assert.equal(r.natureza, "duasReais");
  perto(r.raizes[0].re, 1, 1e-12);
  perto(r.raizes[1].re, 2, 1e-12);
  perto(r.verticeX, 1.5, 1e-12);
  perto(r.verticeY, -0.25, 1e-12);
  perto(r.soma, 3, 1e-12);
  perto(r.produto, 2, 1e-12);
});

teste("delta zero com tolerância", () => {
  const r = E.resolverQuadratica(0.1, 0.2, 0.1);
  assert.equal(r.natureza, "dupla");
  perto(r.raizes[0].re, -1, 1e-9);
});

teste("raízes complexas", () => {
  const r = E.resolverQuadratica(1, 2, 5);
  assert.equal(r.natureza, "complexas");
  perto(r.raizes[0].re, -1, 1e-12);
  perto(r.raizes[0].im, 2, 1e-12);
  perto(r.raizes[1].im, -2, 1e-12);
});

teste("fórmula estável evita cancelamento", () => {
  const r = E.resolverQuadratica(1, -1e8, 1);
  perto(r.raizes[0].re, 1e-8, 1e-20);
  perto(r.raizes[1].re, 1e8, 1e-4);
});

teste("terceiro grau com três raízes reais", () => {
  const r = E.resolverCubica(1, -6, 11, -6);
  assert.equal(r.natureza, "tresDistintas");
  assert.deepEqual(
    r.raizes.map((z) => Math.round(z.re * 1e9) / 1e9),
    [1, 2, 3],
  );
  assert.ok(r.raizes.every((z) => z.im === 0));
  assert.equal(r.pontosCriticos.length, 2);
});

teste("terceiro grau com raízes complexas", () => {
  const r = E.resolverCubica(1, 0, 0, -1);
  assert.equal(r.natureza, "umaReal");
  perto(r.raizes[0].re, 1, 1e-12);
  perto(r.raizes[1].re, -0.5, 1e-12);
  perto(r.raizes[1].im, Math.sqrt(3) / 2, 1e-12);
  perto(r.raizes[2].im, -Math.sqrt(3) / 2, 1e-12);
});

teste("terceiro grau com raiz múltipla", () => {
  const r = E.resolverCubica(1, -4, 5, -2);
  assert.equal(r.natureza, "multiplas");
  perto(r.raizes[0].re, 1, 1e-6);
  perto(r.raizes[1].re, 1, 1e-6);
  perto(r.raizes[2].re, 2, 1e-9);
  const tripla = E.resolverCubica(1, 6, 12, 8);
  assert.ok(tripla.raizes.every((z) => z.im === 0 && Math.abs(z.re + 2) < 1e-5));
});

teste("sistemas 2×2 e 3×3", () => {
  const s2 = E.resolverSistema(
    [
      [2, 1],
      [1, -1],
    ],
    [5, 1],
  );
  assert.equal(s2.tipo, "unico");
  perto(s2.solucao[0], 2, 1e-12);
  perto(s2.solucao[1], 1, 1e-12);
  perto(s2.determinante, -3, 1e-12);

  const s3 = E.resolverSistema(
    [
      [1, 1, 1],
      [0, 2, 5],
      [2, 5, -1],
    ],
    [6, -4, 27],
  );
  assert.equal(s3.tipo, "unico");
  assert.deepEqual(
    s3.solucao.map((v) => Math.round(v * 1e9) / 1e9),
    [5, 3, -2],
  );
  perto(s3.determinantesCramer[0], s3.determinante * 5, 1e-9);
});

teste("sistema indeterminado e impossível", () => {
  const infinito = E.resolverSistema(
    [
      [1, 2],
      [2, 4],
    ],
    [3, 6],
  );
  assert.equal(infinito.tipo, "indeterminado");
  assert.equal(infinito.solucao, null);
  assert.equal(infinito.postoA, 1);

  const impossivel = E.resolverSistema(
    [
      [1, 2],
      [2, 4],
    ],
    [3, 7],
  );
  assert.equal(impossivel.tipo, "impossivel");
  assert.equal(impossivel.postoA, 1);
  assert.equal(impossivel.postoAumentada, 2);
});

teste("formatação elegante, sem 1x e sem + −", () => {
  const F = E.Formato;
  assert.equal(F.equacao([1, -3, 2], num), "x² − 3x + 2 = 0");
  assert.equal(F.equacao([-1, -5], num), "−x − 5 = 0");
  assert.equal(F.equacao([2, 0, 0, 1], num), "2x³ + 1 = 0");
  assert.equal(F.linear([2, -1], ["x", "y"], -4, num), "2x − y = −4");
  assert.equal(F.equacao([0, 0], num), "0 = 0");
});

// ---------- Relatórios das telas ----------

teste("relatório do 1º grau com passos", () => {
  const r = E.relatorioPolinomio(["2", "-5"]);
  assert.equal(r.equacao, "2x − 5 = 0");
  assert.deepEqual(r.principal, { rotulo: "Raiz", valor: "x = 2,5" });
  assert.deepEqual(r.passos, [
    "Equação: 2x − 5 = 0",
    "Isole o termo com x: 2x = 5",
    "Divida pelo coeficiente de x: x = 5 / 2 = 2,5",
  ]);
  assert.equal(E.relatorioPolinomio(["0", "3"]).mensagem, E.TEXTOS.impossivel);
  assert.equal(E.relatorioPolinomio(["0", ""]).mensagem, E.TEXTOS.infinitas);
});

teste("campos vazios, inválidos e grau menor", () => {
  assert.equal(E.relatorioPolinomio(["", "", ""]), null);
  assert.deepEqual(E.relatorioPolinomio(["1", "abc", ""]).erros, [false, true, false]);
  const r = E.relatorioPolinomio(["0", "2", "-8"]);
  assert.equal(r.aviso, E.TEXTOS.grauMenor);
  assert.equal(r.principal.valor, "x = 4");
  const r2 = E.relatorioPolinomio(["", "1", "-3", "2"]);
  assert.equal(r2.aviso, E.TEXTOS.grauMenor);
  assert.equal(r2.equacao, "x² − 3x + 2 = 0");
});

teste("relatório do 2º grau: raízes, vértice e formas", () => {
  const r = E.relatorioPolinomio(["1", "-5", "6"]);
  assert.equal(r.mensagem, "Duas raízes reais distintas (Δ > 0)");
  assert.deepEqual(r.destaque, [
    { rotulo: "x₁", valor: "2" },
    { rotulo: "x₂", valor: "3" },
  ]);
  const det = Object.fromEntries(r.detalhes.map((d) => [d.rotulo, d.valor]));
  assert.equal(det["Discriminante (Δ)"], "1");
  assert.equal(det["Vértice"], "(2,5; −0,25)");
  assert.equal(det["Forma fatorada"], "(x − 2)(x − 3)");
  assert.equal(det["Forma canônica"], "(x − 2,5)² − 0,25");
  assert.equal(det["Valor mínimo"], "−0,25");
  assert.equal(r.passos[1], "Calcule o discriminante: Δ = b² − 4ac = (−5)² − 4 · 1 · 6 = 1");
  assert.equal(r.passos[2], "Aplique a fórmula de Bhaskara: x = (−b ± √Δ) / 2a = (5 ± 1) / 2");

  const dupla = E.relatorioPolinomio(["2", "-4", "2"]);
  assert.deepEqual(dupla.destaque, [{ rotulo: "x₁ = x₂", valor: "1" }]);
  assert.equal(Object.fromEntries(dupla.detalhes.map((d) => [d.rotulo, d.valor]))["Forma fatorada"], "2(x − 1)²");

  const complexas = E.relatorioPolinomio(["1", "2", "5"]);
  assert.deepEqual(
    complexas.destaque.map((d) => d.valor),
    ["−1 + 2i", "−1 − 2i"],
  );
  assert.ok(!complexas.detalhes.some((d) => d.rotulo === "Forma fatorada"));
  assert.equal(complexas.passos[2], "Como Δ < 0, use √Δ = i·√(−Δ): x = (−2 ± 4i) / 2");
});

teste("relatório do 3º grau", () => {
  const r = E.relatorioPolinomio(["1", "0", "0", "-1"]);
  assert.equal(r.mensagem, "Uma raiz real e duas complexas conjugadas (Δ > 0)");
  assert.deepEqual(
    r.destaque.map((d) => d.valor),
    ["1", "−0,5 + 0,8660254038i", "−0,5 − 0,8660254038i"],
  );
  assert.equal(r.passos[1], "Com x = t − b/(3a), obtém-se a forma reduzida: t³ − 1 = 0");
  const r2 = E.relatorioPolinomio(["2", "-12", "22", "-12"]);
  assert.equal(r2.passos[1], "Divida tudo por a: x³ − 6x² + 11x − 6 = 0");
});

teste("relatório de sistema 2×2 com Cramer e escalonamento", () => {
  const campos = ["2", "1", "", "5", "1", "-1", "", "1", "", "", "", ""];
  const r = E.relatorioSistema(2, campos);
  assert.equal(r.mensagem, "Sistema possível e determinado (solução única)");
  assert.deepEqual(r.destaque, [
    { rotulo: "x", valor: "2" },
    { rotulo: "y", valor: "1" },
  ]);
  assert.equal(r.passos[0], "2x + y = 5");
  assert.equal(r.passos[1], "x − y = 1");
  assert.equal(r.passos[3], "Regra de Cramer: x = Dx/D = (−6)/(−3) = 2;  y = Dy/D = (−3)/(−3) = 1");
  assert.equal(r.passos[5], "[ 1   0  |  2 ]");
  assert.equal(r.passos[r.passos.length - 1], "Posto de A = 2, posto de [A|b] = 2");
  assert.equal(r.grafico.funcoes.length, 2);
  // linha sem nada preenchido: ainda não resolve
  assert.equal(E.relatorioSistema(2, ["1", "1", "", "2", "", "", "", "", "", "", "", ""]), null);
  // campo inválido fora do 2×2 é ignorado
  const ignorado = E.relatorioSistema(2, ["1", "1", "x", "2", "1", "-1", "", "0", "", "", "", ""]);
  assert.equal(ignorado.mensagem, "Sistema possível e determinado (solução única)");
  // campo inválido dentro do 2×2 bloqueia o resultado
  assert.deepEqual(E.relatorioSistema(2, ["1", "x", "", "2", "", "", "", "", "", "", "", ""]).erros.slice(0, 2), [false, true]);
});

teste("gráfico: intervalo, passos redondos e marcas limpas", () => {
  assert.deepEqual(E.intervaloGrafico([]), [-5, 5]);
  const [lo, hi] = E.intervaloGrafico([1, 2]);
  assert.ok(lo <= 0.5 && hi >= 2.5);
  assert.equal(E.passoRedondo(0.7), 0.5);
  assert.equal(E.passoRedondo(12), 10);
  assert.equal(E.passoRedondo(2.5), 2);
  assert.equal(E.marcaLimpa(0.9999999, 0.5), 1);
  assert.equal(E.marcaLimpa(-1e-17, 0.5), 0);
  const g = E.escalaGrafico([(x) => x * x], -2, 2, []);
  assert.equal(g.xs.length, 241);
  assert.ok(g.yMin < 0 && g.yMax > 4);
  assert.ok(g.marcasX.some((m) => m.texto === "0"));
});

if (falhas) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log("\nTodos os testes passaram");
