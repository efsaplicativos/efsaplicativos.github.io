"use strict";
// Mesmos casos de app/src/test/.../core/medidas/UnitCatalogTest.kt da Calculadora Multifunção.
const assert = require("node:assert/strict");
const M = require("../../assets/ferramentas/conversor-de-medidas-logica.js");

const conv = (valor, de, para) => M.converter(valor, de, para);
function rel(esperado, obtido, tolerancia = 1e-9) {
  assert.ok(Math.abs(esperado - obtido) <= Math.abs(esperado) * tolerancia, `esperado ${esperado}, obtido ${obtido}`);
}
function abs(esperado, obtido, tolerancia) {
  assert.ok(Math.abs(esperado - obtido) <= tolerancia, `esperado ${esperado}, obtido ${obtido}`);
}

// ids únicos e todas as categorias com unidades
const ids = M.unidades.map((u) => u.id);
assert.equal(new Set(ids).size, ids.length);
for (const c of M.CATEGORIAS) assert.ok(M.daCategoria(c.id).length >= 3, c.id);
for (const id of ids) assert.match(id, /^[a-z][a-z0-9_]*$/);
assert.ok(M.unidades.every((u) => M.dadosCategoria(u.categoria)), "unidade sem categoria");

// pares padrão pertencem à categoria
for (const c of M.CATEGORIAS) {
  for (const id of c.par) assert.equal(M.unidade(id).categoria, c.id);
}

// comprimento
rel(1609.344, conv(1, "mile", "m"));
rel(12, conv(1, "foot", "inch"));
rel(3, conv(1, "yard", "foot"));
rel(1.852, conv(1, "nautical_mile", "km"));
rel(9.4607304725808e12, conv(1, "light_year", "km"));

// área
rel(10000, conv(1, "hectare", "m2"));
rel(2.42, conv(1, "alqueire_sp", "hectare"));
rel(4.84, conv(1, "alqueire_mg", "hectare"));
rel(640, conv(1, "mi2", "acre"));

// volume
rel(3.785411784, conv(1, "gallon_us", "liter"));
rel(128, conv(1, "gallon_us", "floz_us"));
rel(160, conv(1, "gallon_uk", "floz_uk"));
rel(1, conv(1000, "cm3", "liter"));
rel(3, conv(1, "tbsp", "tsp"));
rel(42, conv(1, "barrel", "gallon_us"));

// massa
rel(16, conv(1, "pound", "ounce"));
rel(14, conv(1, "stone", "pound"));
rel(15, conv(1, "arroba", "kg"));
rel(0.2, conv(1, "carat", "g"));
rel(2000, conv(1, "short_ton", "pound"));

// temperatura
abs(212, conv(100, "celsius", "fahrenheit"), 1e-9);
abs(0, conv(-273.15, "celsius", "kelvin"), 1e-9);
abs(491.67, conv(0, "celsius", "rankine"), 1e-9);
abs(80, conv(100, "celsius", "reaumur"), 1e-9);
abs(-40, conv(-40, "fahrenheit", "celsius"), 1e-9);

// velocidade e tempo
rel(3.6, conv(1, "mps", "kmh"));
rel(1.609344, conv(1, "mph", "kmh"));
rel(1.852, conv(1, "knot", "kmh"));
rel(1440, conv(1, "day", "minute"));
rel(365.2425, conv(1, "year", "day"));
rel(100, conv(1, "century", "year"));

// dados separam prefixos SI e IEC
rel(1000, conv(1, "kb", "byte"));
rel(1024, conv(1, "kib", "byte"));
rel(1000, conv(1, "mbit", "kbit"));
rel(8, conv(1, "mb", "mbit"));
rel(1e9 / 1073741824, conv(1, "gb", "gib"));

// pressão, energia, potência
rel(1.01325, conv(1, "atm", "bar"));
rel(760, conv(1, "atm", "torr"));
abs(14.6959, conv(1, "atm", "psi"), 1e-4);
abs(760, conv(1, "atm", "mmhg"), 1e-3);
rel(3600, conv(1, "kwh", "kj"));
rel(1000, conv(1, "kcal", "cal"));
abs(0.98632, conv(1, "cv", "hp"), 1e-5);

// frequência, ângulo, força, torque
rel(60, conv(1, "hz", "rpm"));
rel(Math.PI, conv(180, "degree", "radian"));
rel(400, conv(1, "turn", "gradian"));
rel(3600, conv(1, "degree", "arcsecond"));
rel(9.80665, conv(1, "kgf", "newton"));
abs(0.45359, conv(1, "lbf", "kgf"), 1e-5);
rel(12, conv(1, "lbfft", "lbfin"));

// consumo de combustível não linear
abs(10, conv(10, "kml", "l100km"), 1e-9);
abs(8, conv(12.5, "kml", "l100km"), 1e-9);
abs(12.5, conv(8, "l100km", "kml"), 1e-9);
abs(23.5215, conv(10, "l100km", "mpg_us"), 1e-4);
abs(28.2481, conv(10, "l100km", "mpg_uk"), 1e-4);

// categorias diferentes não convertem
assert.throws(() => conv(1, "m", "kg"));

// leitura com vírgula, ponto e notação científica
assert.equal(M.ler("1,5"), 1.5);
assert.equal(M.ler("1.234,5"), 1234.5);
assert.equal(M.ler("-2,5"), -2.5);
assert.equal(M.ler("1e-3"), 0.001);
assert.equal(M.ler("2,5E6"), 2500000);
assert.equal(M.ler("1e"), null);
assert.equal(M.ler(""), null);
assert.equal(M.ler("abc"), null);

// formatação inteligente (NumberFormatter.smart)
assert.equal(M.inteligente(0), "0");
assert.equal(M.inteligente(3.280839895013123), "3,280839895");
assert.equal(M.inteligente(1609.344), "1.609,344");
assert.equal(M.inteligente(-40), "-40");
assert.equal(M.inteligente(0.000001), "0,000001");
assert.equal(M.inteligente(1.234e-7), "1,234 × 10⁻⁷");
assert.equal(M.inteligente(9.4607304725808e15), "9,460730473 × 10¹⁵");
assert.equal(M.inteligente(Infinity), "∞");
assert.equal(M.inteligente(NaN), "—");
assert.equal(M.cientifica(99999999999.99, 2), "1 × 10¹¹");

console.log("conversor-de-medidas: todos os testes passaram");
