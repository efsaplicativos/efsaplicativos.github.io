"use strict";
// Soletra: dicionário, rodadas sorteadas, pontuação, pangrama e recusas (assets/jogos/soletra-logica.js).
const assert = require("node:assert/strict");

// O dicionário do jogo soma a lista do Desvenda (5 letras, MIT) e os dados do gerador (lexico + icf)
globalThis.PalavrasDesvenda = require("../../assets/jogos/desvenda-palavras.js");
globalThis.SoletraDados = require("../../assets/jogos/soletra-dados.js");
const S = require("../../assets/jogos/soletra-logica.js");

/** Gerador determinístico (mulberry32), para as rodadas serem repetíveis. */
function sorteador(semente) {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rodada = S.iniciar({ aleatorio: sorteador(2026) });

const testes = {
  "o dicionário é só A-Z, sem acento e sem repetição"() {
    assert.ok(S.DICIONARIO.length > 150, `dicionário pequeno: ${S.DICIONARIO.length}`);
    assert.equal(new Set(S.DICIONARIO).size, S.DICIONARIO.length);
    for (const palavra of S.DICIONARIO) {
      assert.match(palavra, /^[A-Z]{3,}$/, `palavra estranha: ${palavra}`);
      assert.equal(S.semAcento(palavra), palavra);
    }
  },
  "a rodada tem sete letras distintas e uma letra do meio entre elas"() {
    assert.equal(rodada.letras.length, S.TOTAL_LETRAS);
    assert.equal(new Set(rodada.letras).size, S.TOTAL_LETRAS);
    assert.ok(rodada.letras.includes(rodada.meio));
  },
  "toda rodada nasce com pelo menos o mínimo de palavras"() {
    for (let semente = 1; semente <= 12; semente++) {
      const r = S.iniciar({ aleatorio: sorteador(semente) });
      assert.ok(r.possiveis.length >= S.MIN_PALAVRAS, `rodada ${semente} com ${r.possiveis.length} palavras`);
      assert.ok(r.possiveis.length <= S.MAX_PALAVRAS, `rodada ${semente} com palavras demais`);
    }
  },
  "o dicionário soma a lista do Desvenda e os dados do gerador"() {
    assert.ok(S.DICIONARIO.length > 8000, `dicionário com ${S.DICIONARIO.length} palavras`);
    // Palavra que só existe nos dados gerados (lexico + icf) e outra da lista curada
    assert.ok(S.DICIONARIO.includes("CASA"));
    assert.ok(S.DICIONARIO.some((p) => p.length === 7 || p.length === 8), "sem palavra longa no dicionário");
  },
  "as rodadas prontas são válidas e rendem entre o mínimo e o máximo"() {
    assert.equal(S.RODADAS.length, 220);
    for (const rodada of S.RODADAS) {
      assert.equal(rodada.letras.length, 7);
      assert.equal(new Set(rodada.letras).size, 7);
      assert.ok(rodada.letras.includes(rodada.meio));
      const possiveis = S.solucoes(rodada.letras, rodada.meio);
      assert.ok(possiveis.length >= S.MIN_PALAVRAS, `${rodada.letras.join("")}/${rodada.meio}: ${possiveis.length} palavras`);
      assert.ok(possiveis.length <= S.MAX_PALAVRAS, `${rodada.letras.join("")}/${rodada.meio}: palavras demais`);
    }
  },
  "as rodadas prontas dão variedade de letras e de letra do meio"() {
    assert.ok(new Set(S.RODADAS.map((r) => r.meio)).size >= 5, "pouca variedade de letra central");
    assert.ok(new Set(S.RODADAS.map((r) => r.letras.join(""))).size === S.RODADAS.length, "rodada repetida");
  },
  "sem as listas externas o jogo continua com o dicionário curado"() {
    const guardado = [globalThis.PalavrasDesvenda, globalThis.SoletraDados];
    const caminho = require.resolve("../../assets/jogos/soletra-logica.js");
    try {
      delete require.cache[caminho];
      delete globalThis.PalavrasDesvenda;
      delete globalThis.SoletraDados;
      const sozinho = require("../../assets/jogos/soletra-logica.js");
      assert.ok(sozinho.DICIONARIO.length >= 150, "o dicionário curado sozinho não basta");
      assert.ok(sozinho.DICIONARIO.length < S.DICIONARIO.length);
      assert.equal(sozinho.RODADAS.length, 0, "sem os dados, as rodadas são sorteadas na hora");
      const r = sozinho.iniciar({ aleatorio: () => 0.5 });
      assert.ok(r.possiveis.length >= sozinho.MIN_PALAVRAS);
      assert.equal(r.letras.length, 7);
    } finally {
      delete require.cache[caminho];
      [globalThis.PalavrasDesvenda, globalThis.SoletraDados] = guardado;
    }
  },
  "todas as palavras possíveis usam só as letras da rodada e a do meio"() {
    const disponiveis = new Set(rodada.letras);
    for (const palavra of rodada.possiveis) {
      assert.ok(palavra.includes(rodada.meio), `${palavra} sem a letra do meio`);
      for (const letra of palavra) assert.ok(disponiveis.has(letra), `${palavra} usa ${letra}, que não está na rodada`);
    }
  },
  "a mesma semente dá a mesma rodada"() {
    const a = S.iniciar({ aleatorio: sorteador(99) });
    const b = S.iniciar({ aleatorio: sorteador(99) });
    assert.deepEqual(a.letras, b.letras);
    assert.equal(a.meio, b.meio);
    assert.deepEqual(a.possiveis, b.possiveis);
  },
  "acertar soma pontos pelo tamanho"() {
    const palavra = rodada.possiveis[0];
    const depois = S.tentar(rodada, palavra);
    assert.equal(depois.achadas.length, 1);
    assert.equal(depois.achadas[0].palavra, palavra);
    assert.equal(depois.pontos, S.pontosDe(palavra) + (S.pangrama(palavra, rodada.letras) ? S.BONUS_PANGRAMA : 0));
    assert.equal(S.jaAchou(depois, palavra), true);
  },
  "acento e minúscula não atrapalham"() {
    const palavra = rodada.possiveis.find((p) => p.length >= 4) || rodada.possiveis[0];
    const depois = S.tentar(rodada, palavra.toLowerCase());
    assert.equal(depois.achadas.length, 1);
    assert.equal(depois.achadas[0].palavra, palavra);
  },
  "palavra repetida, sem a letra do meio ou fora da lista não muda a rodada"() {
    const palavra = rodada.possiveis[0];
    const uma = S.tentar(rodada, palavra);
    assert.equal(S.tentar(uma, palavra), uma);
    assert.equal(S.tentar(rodada, "AB"), rodada, "curta demais");
    assert.equal(S.tentar(rodada, ""), rodada);
    // Uma palavra com letra que não está na rodada
    const fora = "QWXYZ".split("").find((l) => !rodada.letras.includes(l));
    assert.equal(S.tentar(rodada, `${rodada.meio}${fora}${fora}`), rodada, "letra de fora");
    // Uma palavra válida em português que não usa a letra do meio
    const semMeio = ["CASA", "BOLA", "MALA"].find((p) => !p.includes(rodada.meio));
    if (semMeio) assert.equal(S.tentar(rodada, semMeio), rodada, "sem a letra do meio");
  },
  "o motivo da recusa explica cada caso"() {
    assert.match(S.motivo(rodada, "AB"), /3 letras/);
    assert.match(S.motivo(rodada, "ZZZZ"), /letra [A-Z]/);
    const fora = "QWXYZ".split("").find((l) => !rodada.letras.includes(l));
    assert.match(S.motivo(rodada, `${rodada.meio}${fora}${fora}`), /não está na rodada/);
    const achada = S.tentar(rodada, rodada.possiveis[0]);
    assert.match(S.motivo(achada, rodada.possiveis[0]), /já achou/);
    assert.equal(S.motivo(rodada, rodada.possiveis[0]), "");
  },
  "o pangrama vale o bônus e a rodada completa quando tudo é achado"() {
    const pangrama = rodada.possiveis.find((p) => S.pangrama(p, rodada.letras));
    if (pangrama) {
      const depois = S.tentar(rodada, pangrama);
      assert.ok(depois.achadas[0].pangrama);
      assert.equal(depois.pangramas, 1);
      assert.equal(depois.pontos, S.pontosDe(pangrama) + S.BONUS_PANGRAMA);
    }
    let cheia = rodada;
    for (const palavra of rodada.possiveis) cheia = S.tentar(cheia, palavra);
    assert.equal(cheia.achadas.length, rodada.possiveis.length);
    assert.equal(S.completa(cheia), true);
    assert.equal(S.completa(rodada), false);
    assert.equal(cheia.pontos, S.pontosTotais(rodada));
  },
  "a rodada é imutável: tentar não altera a anterior"() {
    const antes = JSON.stringify(rodada);
    S.tentar(rodada, rodada.possiveis[0]);
    assert.equal(JSON.stringify(rodada), antes);
    assert.equal(Object.isFrozen(rodada.achadas), true);
    assert.equal(Object.isFrozen(rodada.letras), true);
  },
};

let falhas = 0;
for (const [nome, teste] of Object.entries(testes)) {
  try {
    teste();
    console.log(`ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`FALHOU ${nome}\n${erro.stack}`);
  }
}
console.log(`\n${Object.keys(testes).length - falhas} de ${Object.keys(testes).length} testes passaram`);
if (falhas) process.exit(1);
