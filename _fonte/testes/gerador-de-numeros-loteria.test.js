"use strict";
/*
 * Testes da lógica do gerador de números da loteria.
 * Os primeiros repetem GeradoresTest.kt do app Gerar Números Loteria com os mesmos números;
 * os outros cobrem o sorteio sem viés, a quantidade digitada e a chance exibida.
 * Uso: node _fonte/testes/gerador-de-numeros-loteria.test.js
 */
const assert = require("node:assert/strict");
const L = require("../../assets/ferramentas/gerador-de-numeros-loteria-logica.js");

let casos = 0;
function caso(nome, teste) {
  try {
    teste();
    casos++;
  } catch (erro) {
    console.error(`FALHOU: ${nome}`);
    throw erro;
  }
}

/** Fonte determinística (xorshift32) para repetir os mesmos sorteios. */
function fonteFixa(semente = 42) {
  let x = semente >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

const m = (id) => L.modalidade(id);

// ---------- GeradoresTest.kt ----------

caso("numerosUnicos respeita quantidade, faixa e ordem em todas as loterias padrão", () => {
  for (const fonte of [undefined, fonteFixa(42)]) {
    for (const loteria of L.MODALIDADES.filter((x) => x.tipo === "padrao")) {
      for (let quantidade = loteria.min; quantidade <= loteria.max; quantidade++) {
        for (let i = 0; i < 50; i++) {
          const numeros = L.numerosUnicos(quantidade, loteria.maxValor, fonte);
          assert.equal(numeros.length, quantidade, loteria.id);
          assert.equal(new Set(numeros).size, quantidade, loteria.id);
          assert.deepEqual([...numeros].sort((a, b) => a - b), numeros, loteria.id);
          assert.ok(numeros.every((n) => Number.isInteger(n) && n >= 1 && n <= loteria.maxValor), loteria.id);
        }
      }
    }
  }
});

caso("numerosUnicos recusa quantidade maior que a faixa", () => {
  assert.throws(() => L.numerosUnicos(7, 6), RangeError);
  assert.throws(() => L.numerosUnicos(-1, 6), RangeError);
  assert.throws(() => L.numerosUnicos(2.5, 6), RangeError);
  assert.deepEqual(L.numerosUnicos(6, 6), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(L.numerosUnicos(0, 6), []);
});

caso("+Milionária gera seis números e dois trevos distintos", () => {
  const trevosVistos = new Set();
  for (let i = 0; i < 500; i++) {
    const numeros = L.maisMilionariaNumeros();
    const trevos = L.maisMilionariaTrevos();
    assert.equal(new Set(numeros).size, 6);
    assert.ok(numeros.every((n) => n >= 1 && n <= 50));
    assert.equal(new Set(trevos).size, 2);
    assert.ok(trevos.every((n) => n >= 1 && n <= 6));
    trevos.forEach((t) => trevosVistos.add(t));
  }
  assert.deepEqual([...trevosVistos].sort(), [1, 2, 3, 4, 5, 6]);
});

caso("Super Sete gera sete dígitos", () => {
  for (let i = 0; i < 200; i++) {
    const numeros = L.superSete();
    assert.equal(numeros.length, 7);
    assert.ok(numeros.every((n) => Number.isInteger(n) && n >= 0 && n <= 9));
  }
});

caso("Loteca gera palpite para os quatorze jogos", () => {
  for (let i = 0; i < 200; i++) {
    const palpites = L.loteca();
    assert.equal(palpites.length, 14);
    assert.ok(palpites.every((p) => ["1", "X", "2"].includes(p)));
  }
});

caso("Time do coração pode sortear qualquer um dos oitenta times", () => {
  assert.equal(L.TIMES.length, 80);
  assert.equal(new Set(L.TIMES).size, 80);
  const sorteados = new Set(Array.from({ length: 5000 }, () => L.timeDoCoracao()));
  assert.deepEqual([...sorteados].sort(), [...L.TIMES].sort());
});

caso("Mês da sorte pode sortear os doze meses", () => {
  const sorteados = new Set(Array.from({ length: 1000 }, () => L.mesDaSorte()));
  assert.equal(sorteados.size, 12);
});

// ---------- Sorteio sem viés ----------

caso("inteiroAte descarta a sobra do fim da faixa (rejeição)", () => {
  // 2³² % 3 = 1: o último valor (2³² − 1) daria mais chance ao 0 e é descartado
  const valores = [2 ** 32 - 1, 7];
  let chamadas = 0;
  const fonte = () => valores[chamadas++];
  assert.equal(L.inteiroAte(3, fonte), 1);
  assert.equal(chamadas, 2);
  // Potência de 2 não precisa de rejeição
  assert.equal(L.inteiroAte(4, () => 2 ** 32 - 1), 3);
  assert.equal(L.inteiroAte(1, () => 123), 0);
  assert.throws(() => L.inteiroAte(0), RangeError);
  assert.throws(() => L.inteiroAte(1.5), RangeError);
});

caso("inteiroAte com o gerador do sistema fica uniforme", () => {
  const contagem = new Array(6).fill(0);
  const total = 60000;
  for (let i = 0; i < total; i++) contagem[L.inteiroAte(6)]++;
  // Desvio-padrão ≈ 91 por face; 600 é mais de 6 desvios
  for (const c of contagem) assert.ok(Math.abs(c - total / 6) < 600, String(contagem));
});

caso("cada número da faixa sai com frequência parecida no jogo da Mega-Sena", () => {
  const contagem = new Array(61).fill(0);
  const jogos = 20000;
  for (let i = 0; i < jogos; i++) for (const n of L.numerosUnicos(6, 60)) contagem[n]++;
  const esperado = (jogos * 6) / 60; // 2000 por número
  for (let n = 1; n <= 60; n++) assert.ok(Math.abs(contagem[n] - esperado) < 300, `${n}: ${contagem[n]}`);
});

caso("gerar monta o jogo de cada tipo, com mês e time quando a modalidade tem", () => {
  const fonte = fonteFixa(7);
  const mega = L.gerar(m("mega-sena"), 8, fonte);
  assert.equal(mega.numeros.length, 8);
  assert.equal(mega.mes, undefined);
  const dia = L.gerar(m("dia-de-sorte"), 7, fonte);
  assert.ok(L.MESES.includes(dia.mes));
  const time = L.gerar(m("timemania"), 10, fonte);
  assert.equal(time.numeros.length, 10);
  assert.ok(L.TIMES.includes(time.time));
  const mais = L.gerar(m("mais-milionaria"), 6, fonte);
  assert.equal(mais.numeros.length, 6);
  assert.equal(mais.trevos.length, 2);
  assert.equal(L.gerar(m("super-sete"), 7, fonte).colunas.length, 7);
  assert.equal(L.gerar(m("loteca"), 14, fonte).palpites.length, 14);
  // Mesma semente, mesmo jogo
  assert.deepEqual(L.gerar(m("quina"), 5, fonteFixa(9)), L.gerar(m("quina"), 5, fonteFixa(9)));
});

// ---------- Modalidades (Loteria.kt) ----------

caso("modalidades com as faixas do app", () => {
  const faixas = Object.fromEntries(L.MODALIDADES.map((x) => [x.id, [x.padrao, x.min, x.max, x.maxValor]]));
  assert.deepEqual(faixas, {
    "mega-sena": [6, 6, 20, 60],
    quina: [5, 5, 15, 80],
    lotofacil: [15, 15, 20, 25],
    lotomania: [50, 50, 50, 100],
    timemania: [10, 10, 10, 80],
    "dupla-sena": [6, 6, 15, 50],
    "dia-de-sorte": [7, 7, 15, 31],
    "mais-milionaria": [6, 6, 6, 50],
    "super-sete": [7, 7, 7, 9],
    loteca: [14, 14, 14, 14],
  });
  assert.equal(L.modalidade("inexistente"), null);
});

// ---------- Quantidade (CampoQuantidade.kt / JogoPadrao) ----------

caso("campo de quantidade aceita só algarismos e corrige ao sair, como no app", () => {
  const mega = m("mega-sena");
  assert.equal(L.limparQuantidade("1a2b34"), "123");
  assert.equal(L.limparQuantidade(null), "");
  assert.equal(L.lerQuantidade("12", mega), 12);
  assert.equal(L.lerQuantidade("3", mega), null);
  assert.equal(L.lerQuantidade("25", mega), null);
  assert.equal(L.lerQuantidade("", mega), null);
  assert.equal(L.corrigirQuantidade("", mega), 6);
  assert.equal(L.corrigirQuantidade("3", mega), 6);
  assert.equal(L.corrigirQuantidade("25", mega), 20);
  assert.equal(L.corrigirQuantidade("999", mega), 20);
  assert.equal(L.corrigirQuantidade("12", mega), 12);
  assert.equal(L.corrigirQuantidade("x", m("lotofacil")), 15);
});

// ---------- Chance ----------

caso("combinações exatas", () => {
  assert.equal(L.combinacoes(60, 6), 50063860n);
  assert.equal(L.combinacoes(100, 20), 535983370403809682970n);
  assert.equal(L.combinacoes(5, 7), 0n);
  assert.equal(L.combinacoes(7, 0), 1n);
});

caso("chance da faixa principal confere com as probabilidades oficiais", () => {
  const chance = (id, q) => L.chancePrincipal(m(id), q);
  assert.equal(chance("mega-sena", 6), 50063860);
  assert.equal(chance("mega-sena", 7), 7151980);
  assert.equal(chance("mega-sena", 8), 1787995);
  assert.equal(chance("mega-sena", 15), 10003);
  assert.equal(chance("quina", 5), 24040016);
  assert.equal(chance("lotofacil", 15), 3268760);
  assert.equal(chance("lotofacil", 20), 211);
  assert.equal(chance("lotomania", 50), 11372636); // 11.372.635,89 arredondado
  assert.equal(chance("timemania", 10), 26472637);
  assert.equal(chance("dupla-sena", 6), 15890700);
  assert.equal(chance("dia-de-sorte", 7), 2629575);
  assert.equal(chance("mais-milionaria", 6), 238360500);
  assert.equal(chance("super-sete", 7), 10000000);
  assert.equal(chance("loteca", 14), null);
  assert.equal(L.combinacoesLoteca(), 4782969);
});

caso("texto da chance", () => {
  assert.equal(
    L.textoChance(m("mega-sena"), 6),
    "Chance de acertar os 6 números sorteados com esta aposta: 1 em 50.063.860.",
  );
  assert.equal(L.textoChance(m("super-sete"), 7), "Chance de acertar as 7 colunas: 1 em 10.000.000.");
  assert.ok(L.textoChance(m("loteca"), 14).startsWith("Há 4.782.969 combinações"));
  assert.ok(L.textoChance(m("dia-de-sorte"), 7).includes("sem contar o mês da sorte"));
});

// ---------- Exibição ----------

caso("dezenas com dois algarismos e 00 na Lotomania", () => {
  assert.equal(L.formatarNumero(m("mega-sena"), 5), "05");
  assert.equal(L.formatarNumero(m("mega-sena"), 60), "60");
  assert.equal(L.formatarNumero(m("lotomania"), 100), "00");
  assert.equal(L.formatarNumero(m("lotomania"), 1), "01");
});

caso("texto para copiar", () => {
  assert.equal(
    L.textoDoJogo(m("mega-sena"), { numeros: [3, 15, 27, 33, 41, 60] }),
    "Mega-Sena: 03 15 27 33 41 60",
  );
  assert.equal(
    L.textoDoJogo(m("mais-milionaria"), { numeros: [1, 2, 3, 4, 5, 6], trevos: [2, 5] }),
    "+Milionária: 01 02 03 04 05 06 · trevos 2 5",
  );
  assert.equal(
    L.textoDoJogo(m("dia-de-sorte"), { numeros: [1, 2, 3, 4, 5, 6, 7], mes: "Março" }),
    "Dia de Sorte: 01 02 03 04 05 06 07 · mês da sorte Março",
  );
  assert.ok(L.textoDoJogo(m("loteca"), { palpites: ["1", "X"] }).includes("jogo 2: X"));
});

// ---------- Preferências salvas ----------

caso("preferências salvas são validadas", () => {
  assert.equal(L.validarPreferencias(null), null);
  assert.equal(L.validarPreferencias("texto"), null);
  assert.deepEqual(L.validarPreferencias({ modalidade: "quina", quantidades: { quina: 9, "mega-sena": 99, x: 3 } }), {
    modalidade: "quina",
    quantidades: { quina: 9 },
  });
  assert.equal(L.validarPreferencias({ modalidade: "bingo" }).modalidade, "mega-sena");
});

console.log(`gerador-de-numeros-loteria: ${casos} casos passaram`);
