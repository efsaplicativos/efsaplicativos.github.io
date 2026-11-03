"use strict";
// Testes da calculadora básica: mesmos casos de app/src/test/.../core/basica/BasicCalculatorTest.kt,
// mais o Decimal e a formatação de assets/ferramentas/matematica-comum.js.
// Rodar: node _fonte/testes/calculadora.test.js
const assert = require("node:assert/strict");
const M = require("../../assets/ferramentas/matematica-comum.js");
const { Basica: B } = require("../../assets/ferramentas/expressao-logica.js");
const { Decimal } = M;

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

/** Teclas: dígitos, '.', + - * /, '=', '%', 'n' (±), '<' (apagar), 'c' (C/AC). */
function teclar(teclas, inicio = B.estado()) {
  let s = inicio;
  for (const k of teclas) {
    if (/\d/.test(k)) s = B.digito(s, k);
    else if (k === ".") s = B.virgula(s);
    else if (k === "+") s = B.operador(s, "+");
    else if (k === "-") s = B.operador(s, "−");
    else if (k === "*") s = B.operador(s, "×");
    else if (k === "/") s = B.operador(s, "÷");
    else if (k === "=") s = B.igual(s);
    else if (k === "%") s = B.porcentagem(s);
    else if (k === "n") s = B.inverterSinal(s);
    else if (k === "<") s = B.apagar(s);
    else if (k === "c") s = B.limpar(s);
    else if (k !== " ") throw new Error(`tecla desconhecida ${k}`);
  }
  return s;
}

function resultado(esperado, s) {
  assert.notEqual(s.resultado, null, "sem resultado");
  assert.equal(s.resultado.comparar(Decimal.de(esperado)), 0, `esperado ${esperado}, veio ${s.resultado.paraTexto()}`);
}

teste("precisão decimal sem ruído de ponto flutuante", () => {
  resultado("0.3", teclar("0.1+0.2="));
  resultado("1", teclar("1/3*3="));
});

teste("respeita precedência", () => {
  resultado("14", teclar("2+3*4="));
  resultado("2.5", teclar("10-15/2="));
});

teste("operador repetido apenas troca o operador", () => {
  resultado("5", teclar("5++="));
  resultado("2", teclar("5+-3="));
  resultado("15", teclar("5+*3="));
});

teste("dígito após igual inicia novo número", () => {
  const s = teclar("2+3=7");
  assert.equal(s.resultado, null);
  assert.equal(s.entrada, "7");
  resultado("9", teclar("+2=", s));
});

teste("operador após resultado continua a conta", () => {
  resultado("10", teclar("2+3=*2="));
});

teste("igual repetido repete a última operação", () => {
  resultado("11", teclar("5+3=="));
  resultado("14", teclar("5+3==="));
  resultado("56", teclar("2+3*4=="));
});

teste("divisão por zero mostra erro e a próxima tecla recomeça", () => {
  const erro = teclar("8/0=");
  assert.equal(erro.erro, "divisao");
  const depois = B.digito(erro, "4");
  assert.equal(depois.erro, null);
  assert.equal(depois.entrada, "4");
  resultado("6", teclar("+2=", depois));
});

teste("porcentagem contextual", () => {
  resultado("110", teclar("100+10%="));
  resultado("90", teclar("100-10%="));
  resultado("5", teclar("50*10%="));
  resultado("500", teclar("50/10%="));
  assert.equal(teclar("25%").entrada, "0.25");
});

teste("inverte sinal e apaga", () => {
  assert.equal(teclar("12n").entrada, "-12");
  resultado("-7", teclar("n7="));
  assert.equal(teclar("123<").entrada, "12");
  const s = teclar("12+<");
  assert.equal(s.entrada, "12");
  assert.equal(s.tokens.length, 0);
});

teste("limite de dígitos", () => {
  const s = teclar("12345678901234567890");
  assert.equal(s.entrada.replace(/\D/g, "").length, B.MAX_DIGITOS);
});

teste("C apaga o número atual e AC apaga tudo", () => {
  const s = teclar("5+3c");
  assert.equal(s.entrada, "");
  assert.equal(s.tokens.length, 2);
  assert.equal(teclar("c", s).tokens.length, 0);
});

teste("memória", () => {
  let s = teclar("10=");
  s = B.memoriaSomar(s);
  s = teclar("5=", s);
  s = B.memoriaSubtrair(s);
  assert.equal(s.memoria.comparar(Decimal.de("5")), 0);
  s = B.memoriaRecuperar(teclar("2*", s));
  resultado("10", teclar("=", s));
  assert.equal(B.memoriaLimpar(s).memoria, null);
});

teste("prévia e histórico", () => {
  const s = teclar("2+3*4");
  assert.equal(B.previa(s).comparar(Decimal.de("14")), 0);
  const feito = teclar("=", s);
  assert.equal(feito.historico.length, 1);
  assert.equal(feito.historico[0].resultado.comparar(Decimal.de("14")), 0);
});

teste("estouro acima de 10^100", () => {
  let s = teclar("999999999999999*999999999999999=");
  for (let i = 0; i < 5; i++) s = B.igual(s);
  assert.equal(s.erro, "estouro");
});

teste("visor no padrão brasileiro", () => {
  assert.equal(B.formatarEntrada("-1234.5"), "−1.234,5");
  assert.equal(B.formatarEntrada("1000."), "1.000,");
  assert.equal(B.formatarEntrada("0.05"), "0,05");
  const v = B.visor(teclar("1234.5*2"));
  assert.equal(v.principal, "1.234,5 × 2");
  assert.equal(v.abaixo, "= 2.469");
  const r = B.visor(teclar("8-10="));
  assert.equal(r.acima, "8 − 10 =");
  assert.equal(r.principal, "−2");
  assert.equal(B.visor(teclar("8/0=")).principal, "Divisão por zero");
  assert.equal(B.formatarNumero(Decimal.de("1E15")), "1 × 10¹⁵");
  assert.equal(B.formatarNumero(Decimal.de("123456789012345678")), "1,23456789 × 10¹⁷");
  assert.equal(B.textoExpressao([{ tipo: "numero", valor: Decimal.de("-3") }, { tipo: "operador", op: "+" }]), "(−3) +");
});

teste("Decimal: divisão com 34 dígitos e arredondamento HALF_EVEN", () => {
  assert.equal(Decimal.de("1").dividir(Decimal.de("3"), 34).paraTexto(), "0." + "3".repeat(34));
  assert.equal(Decimal.de("2").dividir(Decimal.de("3"), 5).paraTexto(), "0.66667");
  assert.equal(Decimal.de("2.5").arredondar(1).paraTexto(), "2");
  assert.equal(Decimal.de("3.5").arredondar(1).paraTexto(), "4");
  assert.equal(Decimal.de("2.5").arredondar(1, true).paraTexto(), "3");
  assert.equal(Decimal.de("-0.125").comEscala(2).paraTexto(), "-0.12");
  assert.equal(Decimal.de("99.96").arredondar(3).semZeros().paraTexto(), "100");
  assert.equal(Decimal.deNumero(0.1).paraTexto(), "0.1000000000000000055511151231257827021181583404541015625");
  assert.equal(Decimal.de("1.5E-7").paraTextoJava(), "1.5E-7");
  assert.equal(Decimal.de("1E20").semZeros().paraTextoJava(), "1E+20");
  assert.throws(() => Decimal.de("1").dividir(Decimal.de("0"), 34), M.DivisaoPorZero);
});

teste("formatação inteligente e científica (Formatters.kt)", () => {
  assert.equal(M.inteligente(1234.5678, 7), "1.234,568");
  assert.equal(M.inteligente(0.1 + 0.2, 10), "0,3");
  assert.equal(M.inteligente(-2.5, 10), "-2,5");
  assert.equal(M.inteligente(1e20, 10), "1 × 10²⁰");
  assert.equal(M.inteligente(1.5e-7, 10), "1,5 × 10⁻⁷");
  assert.equal(M.inteligente(0, 10), "0");
  assert.equal(M.cientifico(9.9999999999, 3), "1 × 10¹");
  assert.equal(M.numero(-0.0001, 2), "0");
  assert.equal(M.numero(12345.678, 2, 0, false), "12345,68");
  assert.equal(M.sobrescrito(-12), "⁻¹²");
});

teste("leitura de números (parseDecimal)", () => {
  assert.equal(M.ler("1,5"), 1.5);
  assert.equal(M.ler("1.234,56"), 1234.56);
  assert.equal(M.ler("−3"), -3);
  assert.equal(M.ler("2,5E6"), 2.5e6);
  assert.equal(M.ler("1e-3"), 0.001);
  assert.equal(M.ler("abc"), null);
  assert.equal(M.ler("1e"), null);
  assert.equal(M.ler(""), null);
  assert.equal(M.lerInteiro("3"), 3);
  assert.equal(M.lerInteiro("3,5"), null);
});

if (falhas) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log("\nTodos os testes passaram");
