"use strict";
// Mesmos casos de app/src/test/.../core/ohm/ElectronicsTest.kt.
const assert = require("node:assert/strict");
const O = require("../../assets/ferramentas/lei-de-ohm-logica.js");

function perto(esperado, obtido, tolerancia = 1e-12) {
  assert.ok(Math.abs(esperado - obtido) <= tolerancia, `esperado ${esperado}, obtido ${obtido}`);
}
function resolvido(v, i, r, p) {
  const resultado = O.resolver(v, i, r, p);
  assert.ok(resultado.valores, `esperado sucesso: ${JSON.stringify(resultado)}`);
  return resultado;
}

// qualquer par de grandezas resolve as outras duas
for (const r of [
  resolvido(12, 2, null, null),
  resolvido(12, null, 6, null),
  resolvido(null, 2, 6, null),
  resolvido(12, null, null, 24),
  resolvido(null, 2, null, 24),
  resolvido(null, null, 6, 24),
]) {
  perto(12, r.valores.tensao);
  perto(2, r.valores.corrente);
  perto(6, r.valores.resistencia);
  perto(24, r.valores.potencia);
  assert.equal(r.usadas.length, 2);
  for (const f of r.usadas) assert.ok(O.FORMULAS[f], f);
}

// fórmulas usadas
assert.deepEqual(resolvido(null, null, 6, 24).usadas, ["V_RAIZ_PR", "I_RAIZ_PR"]);

// erros de entrada
assert.deepEqual(O.resolver(12, null, null, null), { erro: "faltam" });
assert.deepEqual(O.resolver(12, 2, 6, 24), { erro: "excesso" });
assert.deepEqual(O.resolver(12, 0, null, null), { erro: "divisao-por-zero" });
assert.deepEqual(O.resolver(5, null, 0, null), { erro: "divisao-por-zero" });
assert.deepEqual(O.resolver(null, null, -6, 24), { erro: "invalido" });

// série, paralelo e divisor
perto(30, O.serie([10, 20]));
perto(20 / 3, O.paralelo([10, 20]));
assert.equal(O.paralelo([10, 0]), 0);
assert.equal(O.paralelo([]), null);
assert.equal(O.serie([]), null);
const d = O.divisor(12, 1000, 2000);
perto(8, d.vout);
perto(0.004, d.corrente);
perto(0.016, d.potenciaR1);
perto(2 / 3, d.razao);
assert.equal(O.divisor(12, 0, 0), null);

// código de cores
// Amarelo, violeta, vermelho, dourado = 4,7 kΩ ±5%
const r4 = O.decodificar(["amarelo", "violeta"], "vermelho", "dourado");
perto(4700, r4.ohms, 1e-9);
assert.equal(r4.tolerancia, 5);
perto(4465, r4.minimo, 1e-9);
// Marrom, preto, preto, laranja, marrom = 100 kΩ ±1%
perto(100000, O.decodificar(["marrom", "preto", "preto"], "laranja", "marrom").ohms, 1e-6);
// Dourado como multiplicador: 4,7 Ω
perto(4.7, O.decodificar(["amarelo", "violeta"], "dourado", "sem-faixa").ohms);
assert.equal(O.decodificar(["dourado", "preto"], "vermelho", "dourado"), null);
assert.equal(O.decodificar(["amarelo", "violeta"], "sem-faixa", "dourado"), null);
assert.equal(O.CORES_DIGITO.length, 10);
assert.equal(O.CORES_MULTIPLICADOR.length, 12);
assert.equal(O.CORES_TOLERANCIA.length, 11);

// prefixo de engenharia
const e = O.engenharia(0.0047);
perto(4.7, e.valor);
assert.equal(e.prefixo, "mili");
assert.equal(O.engenharia(4700).prefixo, "quilo");
assert.equal(O.engenharia(12).prefixo, "nenhum");
assert.equal(O.engenharia(2.2e6).prefixo, "mega");
assert.equal(O.formatar(0.0047, "A"), "4,7 mA");
assert.equal(O.formatar(4700, "Ω"), "4,7 kΩ");
assert.equal(O.formatar(20 / 3, "Ω"), "6,66667 Ω");
assert.equal(O.formatar(0, "W"), "0 W");
assert.equal(O.formatar(-12, "V"), "-12 V");

console.log("lei-de-ohm: todos os testes passaram");
