"use strict";
// Mesmos casos de app/src/test/.../core/cronometro/ChronoTest.kt.
const assert = require("node:assert/strict");
const L = require("../../assets/ferramentas/cronometro-e-timer-logica.js");

// cronômetro sem desvio, com pausa e retomada
let s = L.iniciarCronometro(L.cronometroInicial(), 1000);
assert.equal(L.decorrido(s, 3500), 2500);
s = L.pausarCronometro(s, 3500);
assert.equal(L.decorrido(s, 99999), 2500); // pausado não conta
s = L.iniciarCronometro(s, 10000);
assert.equal(L.decorrido(s, 10500), 3000);
assert.equal(s.rodando, true);
// iniciar duas vezes não reinicia a contagem
assert.equal(L.iniciarCronometro(s, 20000), s);

// voltas com tempo parcial e total
s = L.iniciarCronometro(L.cronometroInicial(), 0);
s = L.marcarVolta(s, 10000);
s = L.marcarVolta(s, 25000);
s = L.marcarVolta(s, 32000);
assert.deepEqual(s.voltas.map((v) => v.voltaMs), [10000, 15000, 7000]);
assert.deepEqual(s.voltas.map((v) => v.totalMs), [10000, 25000, 32000]);
assert.deepEqual(L.melhorEPiorVolta(s), { melhor: 2, pior: 1 });
assert.equal(L.cronometroZerado(L.cronometroInicial()), true);
assert.equal(L.cronometroZerado(s), false);

// melhor e pior volta exigem duas voltas diferentes
assert.equal(L.melhorEPiorVolta(L.marcarVolta(L.iniciarCronometro(L.cronometroInicial(), 0), 1000)), null);
assert.equal(
  L.melhorEPiorVolta(L.marcarVolta(L.marcarVolta(L.iniciarCronometro(L.cronometroInicial(), 0), 1000), 2000)),
  null,
);

// temporizador conta, pausa, soma minuto e termina
let t = L.iniciarTimer(L.definirDuracao(L.timerInicial(), 10000), 0);
assert.equal(L.restante(t, 6000), 4000);
t = L.pausarTimer(t, 6000);
assert.equal(L.restante(t, 50000), 4000);
t = L.iniciarTimer(t, 50000);
assert.equal(t.terminaEm, 54000);
t = L.somarTempo(t, 51000);
assert.equal(L.restante(t, 51000), 63000);
assert.equal(L.verificarFim(t, 113999).terminado, false);
t = L.verificarFim(t, 114000);
assert.equal(t.terminado, true);
assert.equal(t.rodando, false);
assert.equal(L.restante(t, 200000), 0);
// reiniciar depois de terminar usa a duração configurada
const denovo = L.iniciarTimer(t, 300000);
assert.equal(denovo.rodando, true);
assert.equal(L.restante(denovo, 300000), t.totalMs);

// estados ociosos, progresso e +1 min parado
const padrao = L.timerInicial();
assert.equal(padrao.totalMs, 300000);
assert.equal(L.timerOcioso(padrao), true);
assert.equal(L.progresso(padrao, 0), 1);
const somado = L.somarTempo(padrao, 0);
assert.equal(somado.restantePausadoMs, 360000);
assert.equal(somado.totalMs, 360000);
assert.deepEqual(L.somarTempo(t, 0), L.definirDuracao(null, 60000)); // depois de terminar: 1 min novo
assert.equal(L.iniciarTimer(L.definirDuracao(null, 0), 0).rodando, false); // duração zero não inicia
assert.equal(L.reiniciarTimer(L.pausarTimer(L.iniciarTimer(padrao, 0), 1000)).restantePausadoMs, 300000);

// formatação
assert.equal(L.formatarCronometro(0), "00:00.00");
assert.equal(L.formatarCronometro(62345), "01:02.34");
assert.equal(L.formatarCronometro(3600000), "1:00:00.00");
assert.equal(L.formatarTimer(1), "00:00:01");
assert.equal(L.formatarTimer(300000), "00:05:00");
assert.equal(L.formatarTimer(L.duracaoMs(1, 1, 1)), "01:01:01");
assert.equal(L.duracaoMs(200, 0, 0), L.DURACAO_MAXIMA_MS);

// validação do estado salvo
assert.deepEqual(L.validarCronometro(JSON.parse(JSON.stringify(s))), s);
assert.equal(L.validarCronometro({ rodando: "sim" }), null);
assert.equal(L.validarCronometro({ ...s, voltas: [{ numero: 2, voltaMs: 1, totalMs: 1 }] }), null);
assert.deepEqual(L.validarTimer(JSON.parse(JSON.stringify(t))), t);
assert.equal(L.validarTimer({ ...t, totalMs: -1 }), null);
assert.equal(L.validarTimer(null), null);

console.log("cronometro-e-timer: todos os testes passaram");
