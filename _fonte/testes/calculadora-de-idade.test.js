"use strict";
// Mesmos casos de app/src/test/.../core/idade/AgeCalculatorTest.kt.
const assert = require("node:assert/strict");
const D = require("../../assets/ferramentas/calculadora-de-datas-logica.js");
const I = require("../../assets/ferramentas/calculadora-de-idade-logica.js");

const d = (a, m, dia) => D.criar(a, m, dia);

// idade exata
let r = I.calcular(d(1990, 5, 15), d(2026, 10, 23));
assert.equal(r.anos, 36);
assert.equal(r.meses, 5);
assert.equal(r.dias, 8);
assert.equal(r.totalMeses, 36 * 12 + 5);
assert.equal(r.proximoAniversario, d(2027, 5, 15));
assert.equal(r.idadeNoProximo, 37);
assert.equal(r.diasAteAniversario, 204);
assert.equal(r.diaDaSemanaNascimento, 2); // terça-feira
assert.equal(r.aniversarioHoje, false);
assert.equal(r.totalHoras, r.totalDias * 24);
assert.equal(r.totalSemanas, Math.floor(r.totalDias / 7));

// aniversário hoje
r = I.calcular(d(2000, 10, 23), d(2026, 10, 23));
assert.equal(r.aniversarioHoje, true);
assert.equal(r.anos, 26);
assert.equal(r.meses, 0);
assert.equal(r.dias, 0);
assert.equal(r.proximoAniversario, d(2027, 10, 23));
assert.equal(r.diasAteAniversario, 365);
// no próprio dia do nascimento não é aniversário
assert.equal(I.calcular(d(2026, 1, 1), d(2026, 1, 1)).aniversarioHoje, false);

// nascido em 29 de fevereiro
const nascimento = d(2000, 2, 29);
const naoBissexto = I.calcular(nascimento, d(2001, 2, 28));
assert.equal(naoBissexto.anos, 1);
assert.equal(naoBissexto.aniversarioHoje, true);
assert.equal(naoBissexto.proximoAniversario, d(2002, 2, 28));
assert.equal(naoBissexto.proximoAjustado, true);
const vespera = I.calcular(nascimento, d(2004, 2, 28));
assert.equal(vespera.anos, 3);
assert.equal(vespera.meses, 11);
assert.equal(vespera.dias, 31);
assert.equal(vespera.proximoAniversario, d(2004, 2, 29));
assert.equal(vespera.proximoAjustado, false);
assert.equal(vespera.diasAteAniversario, 1);

// virada de ano
r = I.calcular(d(1999, 12, 31), d(2027, 1, 1));
assert.equal(r.anos, 27);
assert.equal(r.meses, 0);
assert.equal(r.dias, 1);
assert.equal(r.proximoAniversario, d(2027, 12, 31));

// nascimento no futuro
assert.throws(() => I.calcular(d(2030, 1, 1), d(2026, 10, 23)), RangeError);

// signos
assert.equal(I.signo(d(2000, 1, 19)).nome, "Capricórnio");
assert.equal(I.signo(d(2000, 1, 20)).nome, "Aquário");
assert.equal(I.signo(d(2000, 2, 29)).nome, "Peixes");
assert.equal(I.signo(d(2000, 3, 21)).nome, "Áries");
assert.equal(I.signo(d(2000, 12, 21)).nome, "Sagitário");
assert.equal(I.signo(d(2000, 12, 22)).nome, "Capricórnio");

// horóscopo chinês
assert.equal(I.signoChines(d(2020, 6, 1)).animal, "Rato");
assert.equal(I.signoChines(d(1990, 5, 15)).animal, "Cavalo");
const janeiro = I.signoChines(d(2020, 1, 10)); // antes de 21/01 é sempre o ano anterior
assert.equal(janeiro.animal, "Porco");
assert.equal(janeiro.incerto, false);
assert.equal(I.signoChines(d(2020, 2, 1)).incerto, true);

// gerações
assert.equal(I.geracao(1990).nome, "Millennials (Geração Y)");
assert.equal(I.geracao(2000).nome, "Geração Z");
assert.equal(I.geracao(1946).nome, "Baby Boomers");
assert.equal(I.geracao(1890), null);

console.log("calculadora-de-idade: todos os testes passaram");
