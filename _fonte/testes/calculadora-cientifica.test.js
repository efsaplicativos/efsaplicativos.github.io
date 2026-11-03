"use strict";
// Testes da calculadora científica: mesmos casos de
// app/src/test/.../core/cientifica/ScientificEvaluatorTest.kt.
// Rodar: node _fonte/testes/calculadora-cientifica.test.js
const assert = require("node:assert/strict");
const { Avaliador, Cientifica: C } = require("../../assets/ferramentas/expressao-logica.js");

let falhas = 0;
function teste(nome, fn) {
  try {
    fn();
    console.log(`ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`FALHOU ${nome}\n${erro.stack}`);
  }
}

const avaliar = (expr, modo = "DEG", ans = 0) => Avaliador.avaliar(expr, modo, ans);
const erro = (expr, modo = "DEG") => {
  const r = Avaliador.tentar(expr, modo, 0);
  return r.ok ? null : r.tipo;
};
const perto = (esperado, valor, tolerancia) =>
  assert.ok(Math.abs(esperado - valor) <= tolerancia, `esperado ${esperado}, veio ${valor}`);

const digito = (d) => ({ tipo: "digito", valor: d });
const op = (s) => ({ tipo: "operador", valor: s });

teste("operações e precedência", () => {
  assert.equal(avaliar("2+3×4"), 14);
  assert.equal(avaliar("(2+3)×4"), 20);
  assert.equal(avaliar("0.1+0.2"), 0.3);
  assert.equal(avaliar("2^3^2"), 512);
  assert.equal(avaliar("−2^2"), -4);
  assert.equal(avaliar("2^−3"), 0.125);
  assert.equal(avaliar("5×−3"), -15);
});

teste("modo DEG", () => {
  assert.equal(avaliar("sin(30)"), 0.5);
  assert.equal(avaliar("sin(180)"), 0);
  assert.equal(avaliar("tan(45)"), 1);
  assert.equal(avaliar("cos(90)"), 0);
  assert.equal(avaliar("sin⁻¹(0.5)"), 30);
  assert.equal(erro("tan(90)"), "dominio");
});

teste("modos RAD e GRAD", () => {
  assert.equal(avaliar("sin(π)", "RAD"), 0);
  assert.equal(avaliar("cos(π)", "RAD"), -1);
  assert.equal(avaliar("sin(100)", "GRAD"), 1);
  perto(Math.PI / 2, avaliar("sin⁻¹(1)", "RAD"), 1e-14);
  perto(1e-20, avaliar("sin(1E−20)", "RAD"), 1e-30);
});

teste("multiplicação implícita e parênteses automáticos", () => {
  perto(2 * Math.PI, avaliar("2π"), 1e-12);
  assert.equal(avaliar("3(4)"), 12);
  assert.equal(avaliar("(2)(3)"), 6);
  assert.equal(avaliar("2sin(30)"), 1);
  assert.equal(avaliar("√(9"), 3);
  assert.equal(avaliar("(3+4"), 7);
});

teste("funções e pós-fixos", () => {
  assert.equal(avaliar("5!"), 120);
  assert.equal(avaliar("0!"), 1);
  assert.equal(avaliar("25%"), 0.25);
  assert.equal(avaliar("5²"), 25);
  assert.equal(avaliar("3³"), 27);
  assert.equal(avaliar("2⁻¹"), 0.5);
  assert.equal(avaliar("∛(−8)"), -2);
  assert.equal(avaliar("log(1000)"), 3);
  assert.equal(avaliar("ln(e)"), 1);
  assert.equal(avaliar("log₂(1024)"), 10);
  assert.equal(avaliar("abs(−5)"), 5);
  assert.equal(avaliar("10^(3)"), 1000);
  assert.equal(avaliar("7mod5"), 2);
  assert.equal(avaliar("5P2"), 20);
  assert.equal(avaliar("5C2"), 10);
  assert.equal(avaliar("1.5E3"), 1500);
  assert.equal(avaliar("1.5E−3"), 0.0015);
  assert.equal(avaliar("Ans", "DEG", 42), 42);
  assert.equal(avaliar("tanh⁻¹(0)+cosh(0)"), 1);
  assert.equal(avaliar("e^(1)"), 2.71828182845905); // 15 algarismos, como clean()
  assert.equal(avaliar("−7mod3"), 2);
});

teste("erros tipados", () => {
  assert.equal(erro("5÷0"), "divisao");
  assert.equal(erro("0⁻¹"), "divisao");
  assert.equal(erro("√(−1)"), "dominio");
  assert.equal(erro("log(0)"), "dominio");
  assert.equal(erro("2.5!"), "dominio");
  assert.equal(erro("171!"), "estouro");
  assert.equal(erro("10^(400)"), "estouro");
  assert.equal(erro("2+"), "sintaxe");
  assert.equal(erro("()"), "sintaxe");
  assert.equal(erro("3)"), "sintaxe");
  assert.equal(erro("sin⁻¹(2)"), "dominio");
  assert.equal(erro("1000000000P900000000"), "estouro");
});

teste("parênteses no início não viram zero vezes", () => {
  let s = C.estado();
  s = C.pressionar(s, { tipo: "abre" });
  s = C.pressionar(s, digito("2"));
  s = C.pressionar(s, op("+"));
  s = C.pressionar(s, digito("3"));
  assert.equal(C.expressao(s), "(2+3");
  s = C.igual(s);
  assert.equal(s.resultado, 5);
  assert.equal(C.expressao(s), "(2+3)");
});

teste("depois de um erro a expressão é preservada e um dígito recomeça", () => {
  let s = C.estado();
  for (const c of "5÷0") s = C.pressionar(s, /\d/.test(c) ? digito(c) : op(c));
  s = C.igual(s);
  assert.equal(s.erro, "divisao");
  assert.equal(C.expressao(s), "5÷0");
  s = C.pressionar(s, digito("7"));
  assert.equal(s.erro, null);
  assert.equal(C.expressao(s), "7");
});

teste("operador após resultado usa Ans e operador repetido substitui", () => {
  let s = C.estado();
  s = C.pressionar(s, digito("4"));
  s = C.igual(s);
  s = C.pressionar(s, op("×"));
  assert.equal(C.expressao(s), "Ans×");
  s = C.pressionar(s, op("+"));
  assert.equal(C.expressao(s), "Ans+");
  s = C.pressionar(s, op("−"));
  assert.equal(C.expressao(s), "Ans−");
  s = C.pressionar(s, op("×"));
  s = C.pressionar(s, op("−"));
  assert.equal(C.expressao(s), "Ans×−");
  s = C.pressionar(s, digito("2"));
  assert.equal(C.igual(s).resultado, -8);
});

teste("apagar remove a função inteira e o ponto decimal é único", () => {
  let s = C.estado();
  s = C.pressionar(s, { tipo: "funcao", valor: "sin" });
  assert.equal(C.expressao(s), "sin(");
  s = C.apagar(s);
  assert.equal(C.expressao(s), "");
  s = C.pressionar(s, { tipo: "ponto" });
  s = C.pressionar(s, { tipo: "ponto" });
  s = C.pressionar(s, digito("5"));
  assert.equal(C.expressao(s), "0.5");
});

teste("insere valores do histórico", () => {
  assert.deepEqual(C.pecasDoValor(1e20), ["1", "E", "2", "0"]);
  assert.deepEqual(C.pecasDoValor(-0.5), ["−", "0", ".", "5"]);
  assert.deepEqual(C.pecasDoValor(1.5e-7), ["1", ".", "5", "E", "−", "7"]);
  let s = C.estado();
  s = C.pressionar(s, digito("2"));
  s = C.inserirValor(s, 3);
  assert.equal(C.expressao(s), "2×3");
  assert.equal(C.previa(s), 6);
});

teste("10ˣ depois de um número multiplica (correção)", () => {
  let s = C.estado();
  s = C.pressionar(s, digito("2"));
  s = C.pressionar(s, { tipo: "funcao", valor: "10^" });
  s = C.pressionar(s, digito("3"));
  assert.equal(C.expressao(s), "2×10^(3");
  assert.equal(C.igual(s).resultado, 2000);
});

teste("notação científica (EE) e modo de ângulo", () => {
  let s = C.estado();
  for (const k of [digito("1"), { tipo: "expoente" }, op("−"), digito("3")]) s = C.pressionar(s, k);
  assert.equal(C.expressao(s), "1E−3");
  assert.equal(C.igual(s).resultado, 0.001);
  assert.equal(C.proximoModo("DEG"), "RAD");
  assert.equal(C.proximoModo("GRAD"), "DEG");
  assert.equal(C.parentesesAbertos(["sin(", "(", "2", ")"]), 1);
  assert.equal(C.formatar(2 / 3), "0,666666666667");
  assert.equal(C.expressaoVisor("1.5+2"), "1,5+2");
});

if (falhas) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log("\nTodos os testes passaram");
