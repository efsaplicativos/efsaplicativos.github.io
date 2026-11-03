"use strict";
// Testes do conversor de bases: casos de BaseConverterTest.kt e TextCodecTest.kt
// (Calculadora Multifunção) e das regras da tela.
// Rode com: node _fonte/testes/conversor-de-bases.test.js
const assert = require("node:assert/strict");
const X = require("../../assets/ferramentas/conversor-de-bases-logica.js");

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

// ---------- BaseConverterTest ----------

teste("conversões inteiras básicas", () => {
  assert.equal(X.converter("255", 10, 16), "FF");
  assert.equal(X.converter("ff", 16, 2), "11111111");
  assert.equal(X.converter("11111111", 2, 8), "377");
  assert.equal(X.converter("377", 8, 10), "255");
  assert.equal(X.converter("35", 10, 36), "Z");
  assert.equal(X.converter("0", 10, 2), "0");
});

teste("números grandes sem perder precisão", () => {
  const grande = "123456789012345678901234567890";
  const hex = X.converter(grande, 10, 16);
  assert.equal(X.converter(hex, 16, 10), grande);
  // 2^53 + 1: o app original (parseInt do JavaScript) errava este
  assert.equal(X.converter("20000000000001", 16, 10), "9007199254740993");
});

teste("negativos e frações", () => {
  assert.equal(X.converter("-255", 10, 16), "-FF");
  assert.equal(X.converter("0.5", 10, 2), "0.1");
  assert.equal(X.converter("10,625", 10, 2), "1010.101");
  assert.equal(X.converter("1010.101", 2, 10), "10.625");
  assert.equal(X.converter("0.5", 10, 16), "0.8");
});

teste("fração periódica é truncada", () => {
  const d = X.paraDigitos(X.ler("0.1", 3), 10, 5); // 1/3
  assert.equal(d.fracao, "33333");
  assert.equal(d.truncado, true);
});

teste("entradas inválidas", () => {
  assert.equal(X.ler("102", 2), null);
  assert.equal(X.ler("G", 16), null);
  assert.equal(X.ler("1.2.3", 10), null);
  assert.equal(X.ler("", 10), null);
  assert.equal(X.ler("-", 10), null);
  assert.equal(X.converter("102", 3, 3), "102");
});

teste("agrupadores na entrada", () => {
  assert.equal(X.converter("1101 0110", 2, 10), "214");
  assert.equal(X.converter("FF_FF", 16, 10), "65535");
});

teste("agrupamento da saída", () => {
  const d = X.paraDigitos(X.ler("1234567", 10), 2);
  assert.equal(X.agrupar(d, 4), "1 0010 1101 0110 1000 0111");
  assert.equal(X.agruparDaDireita("1234567", 3, "."), "1.234.567");
});

teste("complemento de dois", () => {
  assert.equal(X.binarioComZeros(X.complementoDeDois(-1n, 8), 8), "11111111");
  assert.equal(X.hexComZeros(X.complementoDeDois(-128n, 16), 16), "FF80");
  assert.equal(X.binarioComZeros(X.complementoDeDois(127n, 8), 8), "01111111");
  assert.equal(X.complementoDeDois(128n, 8), null);
  assert.equal(X.complementoDeDois(-129n, 8), null);
});

teste("zero negativo vira zero", () => {
  assert.equal(X.ler("-0", 10).negativo, false);
  assert.equal(X.converter("-0.0", 10, 2), "0");
});

// ---------- TextCodecTest ----------

teste("texto para códigos", () => {
  assert.equal(X.codificar("Hi", "binario"), "01001000 01101001");
  assert.equal(X.codificar("Hi", "hexadecimal"), "48 69");
  assert.equal(X.codificar("Hi", "decimal"), "72 105");
  assert.equal(X.codificar("é", "hexadecimal"), "C3 A9");
});

teste("códigos para texto", () => {
  assert.deepEqual(X.decodificar("01001000 01101001", "binario"), { tipo: "ok", texto: "Hi", bytes: 2 });
  assert.deepEqual(X.decodificar("48656C6C6F", "hexadecimal"), { tipo: "ok", texto: "Hello", bytes: 5 });
  assert.deepEqual(X.decodificar("72, 105", "decimal"), { tipo: "ok", texto: "Hi", bytes: 2 });
  assert.deepEqual(X.decodificar("0xC3 0xA9", "hexadecimal"), { tipo: "ok", texto: "é", bytes: 2 });
});

teste("ida e volta com acentos", () => {
  const codigos = X.codificar("ação", "hexadecimal");
  const r = X.decodificar(codigos, "hexadecimal");
  assert.equal(r.tipo, "ok");
  assert.equal(r.texto, "ação");
  assert.equal(r.bytes, 6);
});

teste("erros de decodificação", () => {
  assert.deepEqual(X.decodificar("256", "decimal"), { tipo: "codigoInvalido", codigo: "256" });
  assert.deepEqual(X.decodificar("GG", "hexadecimal"), { tipo: "codigoInvalido", codigo: "GG" });
  assert.deepEqual(X.decodificar("C3", "hexadecimal"), { tipo: "utf8Invalido" });
  assert.deepEqual(X.decodificar("  ", "hexadecimal"), { tipo: "vazio" });
});

// ---------- Regras da versão web ----------

teste("byte 0B em hexadecimal não é confundido com o prefixo 0b", () => {
  assert.deepEqual(X.decodificar("0B 41", "hexadecimal"), { tipo: "ok", texto: "\u000bA", bytes: 2 });
  assert.deepEqual(X.decodificar("0x0B", "hexadecimal"), { tipo: "ok", texto: "\u000b", bytes: 1 });
  assert.deepEqual(X.decodificar("0b01001000", "binario"), { tipo: "ok", texto: "H", bytes: 1 });
});

teste("emoji usa 4 bytes", () => {
  assert.equal(X.codificar("😀", "hexadecimal"), "F0 9F 98 80");
  assert.equal(X.converterTexto("😀", "codificar", "decimal").bytes, 4);
  assert.equal(X.textoBytes(1), "1 byte (UTF-8)");
  assert.equal(X.textoBytes(1200), "1.200 bytes (UTF-8)");
});

teste("mensagens da aba Texto", () => {
  assert.deepEqual(X.converterTexto("", "decodificar", "hexadecimal"), { tipo: "vazio" });
  assert.equal(X.converterTexto("48 ZZ", "decodificar", "hexadecimal").mensagem, "Código inválido: ZZ");
  assert.equal(X.converterTexto("FF", "decodificar", "hexadecimal").mensagem, "Os bytes não formam um texto UTF-8 válido.");
  assert.equal(X.converterTexto("Oi", "codificar", "binario").texto, "01001111 01101001");
});

teste("conversões mostradas na tela", () => {
  const linhas = X.conversoes(X.ler("255", 10), 10);
  assert.deepEqual(
    linhas.map((l) => [l.base, l.agrupado]),
    [
      [2, "1111 1111"],
      [8, "377"],
      [10, "255"],
      [16, "FF"],
    ],
  );
  const base3 = X.conversoes(X.ler("120", 3), 3);
  assert.equal(base3.length, 5);
  assert.equal(base3[4].nome, "Base 3");
  assert.equal(base3[2].agrupado, "15");
  const dizima = X.conversoes(X.ler("0.1", 10), 10);
  assert.equal(dizima[0].truncado, true);
  assert.equal(dizima[0].simples, "0.00011001100110011001…");
  assert.equal(dizima[0].agrupado, "0.0001 1001 1001 1001 1001…");
  assert.equal(X.conversoes(X.ler("1000000", 10), 10)[2].agrupado, "1 000 000");
});

teste("complemento de dois na tela", () => {
  const linhas = X.linhasComplemento(X.ler("-1", 10));
  assert.deepEqual(
    linhas.map((l) => l.bits),
    [8, 16, 32, 64],
  );
  assert.equal(linhas[0].binarioAgrupado, "1111 1111");
  assert.equal(linhas[1].hexAgrupado, "0xFFFF");
  assert.equal(linhas[2].hexAgrupado, "0xFFFF FFFF");
  assert.deepEqual(
    X.linhasComplemento(X.ler("200", 10)).map((l) => l.bits),
    [16, 32, 64],
  );
  assert.equal(X.linhasComplemento(X.ler("10000000000000000000", 10)).length, 0);
  assert.equal(X.quantidadeDeBits(255n), 8);
  assert.equal(X.quantidadeDeBits(0n), 0);
  assert.equal(X.bitsLigados(255n), 8);
  assert.equal(X.bitsLigados(10n), 2);
});

teste("base personalizada", () => {
  assert.equal(X.lerBasePersonalizada("3"), 3);
  assert.equal(X.lerBasePersonalizada(" 36 "), 36);
  assert.equal(X.lerBasePersonalizada("1"), null);
  assert.equal(X.lerBasePersonalizada("37"), null);
  assert.equal(X.lerBasePersonalizada("2,5"), null);
  assert.equal(X.lerBasePersonalizada(""), null);
  assert.equal(X.nomeBase(16), "Hexadecimal (16)");
});

if (falhas) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log("\nTodos os testes passaram");
