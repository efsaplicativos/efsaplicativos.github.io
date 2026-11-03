"use strict";
// Mesmos casos de app/src/test/.../core/agua/WaterCalculatorTest.kt.
const assert = require("node:assert/strict");
const A = require("../../assets/ferramentas/consumo-de-agua-logica.js");

function perto(esperado, obtido, tolerancia = 1e-9) {
  assert.ok(Math.abs(esperado - obtido) <= tolerancia, `esperado ${esperado}, obtido ${obtido}`);
}
const h = (hora, minuto) => hora * 60 + minuto;

// base de 35 ml por kg
let r = A.calcular(70);
perto(2450, r.totalMl);
perto(2100, r.faixaMinMl);
perto(2800, r.faixaMaxMl);

// acréscimos de exercício, clima e gestação
r = A.calcular(60, { minutosExercicio: 30, clima: "muito-quente", condicao: "amamentando" });
perto(2100 + 360 + 1000 + 700, r.totalMl);
perto(360, r.exercicioMl);
perto(2600, A.calcular(60, { clima: "quente" }).totalMl);
perto(2400, A.calcular(60, { condicao: "gestante" }).totalMl);
perto(2100, A.calcular(60, { minutosExercicio: -10 }).totalMl); // minutos negativos não descontam
assert.throws(() => A.calcular(0));

// número de copos arredonda para cima
assert.equal(A.copos(2450, 250), 10);
assert.equal(A.copos(2000, 250), 8);
assert.equal(A.copos(100, 500), 1);

// cronograma entre acordar e dormir
let horarios = A.horarios(h(7, 0), h(23, 0), 9);
assert.equal(horarios.length, 9);
assert.equal(horarios[0], h(7, 0));
assert.equal(horarios[8], h(22, 0)); // última 1 h antes de dormir
assert.ok(horarios.every((v, i) => i === 0 || horarios[i - 1] < v));

// cronograma quando dorme depois da meia-noite
horarios = A.horarios(h(10, 0), h(2, 0), 5);
assert.equal(horarios[0], h(10, 0));
assert.equal(horarios[4], h(1, 0));
assert.equal(horarios[1], h(13, 45));
assert.deepEqual(A.horarios(h(7, 0), h(23, 0), 1), [h(7, 0)]);
assert.deepEqual(A.horarios(h(7, 0), h(23, 0), 0), []);

// conversão e horas
perto(70 * 0.45359237, A.librasParaKg(70));
assert.equal(A.lerHora("07:05"), 425);
assert.equal(A.lerHora("23:59:00"), 1439);
assert.equal(A.lerHora("24:00"), null);
assert.equal(A.lerHora(""), null);
assert.equal(A.textoHora(425), "07:05");

console.log("consumo-de-agua: todos os testes passaram");
