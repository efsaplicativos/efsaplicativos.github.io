"use strict";
// Mesmos casos de app/src/test/.../logica/RegrasCampoMinadoTest.kt e dados/RecordesTest.kt do app Campo Minado.
const assert = require("node:assert/strict");
const L = require("../../assets/jogos/campo-minado-logica.js");

/** Gerador com semente (mulberry32), para os sorteios serem repetíveis. */
function semente(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tabuleiro com minas em posições fixas ('*' = mina, '.' = livre). */
function tabuleiro(...linhas) {
  const minas = linhas.join("").split("").map((c) => c === "*");
  const base = L.vazio(linhas.length, linhas[0].length, minas.filter(Boolean).length);
  const celulas = minas.map((mina, i) => ({
    mina,
    vizinhas: L.vizinhos(base, i).filter((v) => minas[v]).length,
    estado: L.COBERTA,
  }));
  return { ...base, celulas, minasDistribuidas: true };
}
const estado = (t, l, c) => t.celulas[L.indice(t, l, c)].estado;

const testes = {
  "primeiro toque nunca cai em mina e abre uma área vazia em todos os níveis"() {
    for (const nivel of Object.values(L.NIVEIS)) {
      for (let s = 0; s < 200; s++) {
        const aleatorio = semente(s);
        const linha = Math.floor(aleatorio() * nivel.linhas);
        const coluna = Math.floor(aleatorio() * nivel.colunas);
        const depois = L.revelar(L.doNivel(nivel), linha, coluna, aleatorio);
        assert.ok(depois.minasDistribuidas);
        assert.equal(depois.celulas.filter((c) => c.mina).length, nivel.minas);
        const tocada = depois.celulas[L.indice(depois, linha, coluna)];
        assert.equal(tocada.mina, false, `${nivel.id} semente ${s}`);
        assert.equal(tocada.vizinhas, 0, "primeiro toque deve abrir área vazia");
        assert.ok(L.reveladas(depois) > 1 || depois.status === L.VENCEU);
        assert.notEqual(depois.status, L.PERDEU);
      }
    }
  },

  "contagem de vizinhas confere com as minas sorteadas"() {
    const t = L.distribuirMinas(L.doNivel(L.NIVEIS.dificil), 0, semente(7));
    t.celulas.forEach((c, i) => {
      assert.equal(c.vizinhas, L.vizinhos(t, i).filter((v) => t.celulas[v].mina).length);
    });
  },

  "sem espaço para proteger a vizinhança protege só a casa tocada"() {
    const t = L.distribuirMinas(L.vazio(3, 3, 8), 4, semente(1));
    assert.equal(t.celulas[4].mina, false);
    assert.equal(t.celulas.filter((c) => c.mina).length, 8);
  },

  "área vazia se espalha até as bordas numeradas e não abre minas"() {
    const t = tabuleiro("....", "....", "...*", "..*.");
    const depois = L.revelar(t, 0, 0);
    const cobertas = new Set([L.indice(t, 2, 3), L.indice(t, 3, 2), L.indice(t, 3, 3)]);
    depois.celulas.forEach((c, i) => assert.equal(c.estado, cobertas.has(i) ? L.COBERTA : L.REVELADA, `casa ${i}`));
    assert.equal(depois.status, L.JOGANDO);
  },

  "número revelado não espalha"() {
    assert.equal(L.reveladas(L.revelar(tabuleiro("*..", "...", "..."), 0, 1)), 1);
  },

  "área vazia não remove bandeiras"() {
    const t = L.alternarBandeira(tabuleiro("....", "....", "...*"), 0, 3);
    assert.equal(estado(L.revelar(t, 0, 0), 0, 3), L.MARCADA);
  },

  "vitória quando todas as casas seguras são abertas, mesmo sem bandeiras"() {
    let t = L.revelar(tabuleiro("*..", "...", "..."), 2, 2);
    for (let l = 0; l < 3; l++) for (let c = 0; c < 3; c++) if (l || c) t = L.revelar(t, l, c);
    assert.equal(t.status, L.VENCEU);
    assert.equal(estado(t, 0, 0), L.MARCADA);
    assert.equal(L.minasRestantes(t), 0);
  },

  "marcar todas as minas sem abrir as casas não vence"() {
    const t = L.alternarBandeira(tabuleiro("*..", "..."), 0, 0);
    assert.equal(t.status, L.JOGANDO);
    assert.equal(L.minasRestantes(t), 0);
  },

  "revelar mina perde, mostra as minas e guarda a explodida"() {
    const t = L.alternarBandeira(tabuleiro("*.*", "...", "..*"), 2, 2);
    const depois = L.revelar(t, 0, 0);
    assert.equal(depois.status, L.PERDEU);
    assert.equal(depois.explodida, L.indice(t, 0, 0));
    assert.equal(estado(depois, 0, 2), L.REVELADA);
    assert.equal(estado(depois, 2, 2), L.MARCADA);
    assert.equal(L.revelar(depois, 1, 1), depois);
    assert.equal(L.alternarBandeira(depois, 1, 1), depois);
  },

  "casa com bandeira não pode ser revelada e a bandeira alterna"() {
    const marcado = L.alternarBandeira(tabuleiro("*..", "..."), 0, 0);
    assert.equal(L.revelar(marcado, 0, 0), marcado);
    assert.equal(estado(L.alternarBandeira(marcado, 0, 0), 0, 0), L.COBERTA);
  },

  "não dá para marcar casa revelada"() {
    const t = L.revelar(tabuleiro("*..", "..."), 0, 2);
    assert.equal(L.alternarBandeira(t, 0, 2), t);
  },

  "contador de minas pode ficar negativo"() {
    let t = tabuleiro("*...", "....");
    t = L.alternarBandeira(t, 1, 2);
    t = L.alternarBandeira(t, 1, 3);
    assert.equal(L.minasRestantes(t), -1);
  },

  "tocar no número com as bandeiras certas abre as vizinhas"() {
    let t = L.revelar(tabuleiro("*..", "...", "..."), 1, 1);
    t = L.alternarBandeira(t, 0, 0);
    assert.ok(L.podeRevelarVizinhas(t, 1, 1));
    assert.equal(L.revelarVizinhas(t, 1, 1).status, L.VENCEU);
  },

  "tocar no número com bandeira errada explode"() {
    let t = L.revelar(tabuleiro("*..", "...", "..."), 1, 1);
    t = L.alternarBandeira(t, 0, 1);
    const depois = L.revelarVizinhas(t, 1, 1);
    assert.equal(depois.status, L.PERDEU);
    assert.equal(depois.explodida, L.indice(t, 0, 0));
  },

  "tocar no número sem bandeiras suficientes não faz nada"() {
    const t = L.revelar(tabuleiro("*..", "...", "..."), 1, 1);
    assert.equal(L.podeRevelarVizinhas(t, 1, 1), false);
    assert.equal(L.revelarVizinhas(t, 1, 1), t);
  },

  "partida sorteada sempre termina em vitória abrindo só casas seguras"() {
    for (let s = 0; s < 50; s++) {
      let t = L.revelar(L.doNivel(L.NIVEIS.medio), 7, 5, semente(s));
      for (let i = 0; i < t.celulas.length; i++) {
        if (!t.celulas[i].mina) t = L.revelar(t, Math.floor(i / t.colunas), i % t.colunas);
      }
      assert.equal(t.status, L.VENCEU);
      assert.equal(L.reveladas(t), L.seguras(t));
    }
  },

  "vizinhos respeitam as bordas"() {
    const t = L.vazio(3, 4, 1);
    assert.equal(L.vizinhos(t, 0).length, 3);
    assert.equal(L.vizinhos(t, L.indice(t, 0, 1)).length, 5);
    assert.equal(L.vizinhos(t, L.indice(t, 1, 1)).length, 8);
    assert.equal(L.vizinhos(t, L.indice(t, 2, 3)).length, 3);
  },

  "tabuleiro salvo é validado antes de continuar"() {
    const nivel = L.NIVEIS.facil;
    const jogando = L.revelar(L.doNivel(nivel), 4, 3, semente(3));
    assert.ok(L.valido(JSON.parse(JSON.stringify(jogando)), nivel));
    assert.ok(L.valido(L.doNivel(nivel), nivel));
    assert.equal(L.valido(jogando, L.NIVEIS.medio), false);
    const adulterado = JSON.parse(JSON.stringify(jogando));
    adulterado.celulas[0].vizinhas = 9;
    assert.equal(L.valido(adulterado, nivel), false);
    assert.equal(L.valido(null, nivel), false);
  },

  "ranking por nível do menor para o maior tempo"() {
    const lista = [
      { nivel: "facil", tempo: 50, dataMs: 3 },
      { nivel: "medio", tempo: 10, dataMs: 1 },
      { nivel: "facil", tempo: 20, dataMs: 2 },
      { nivel: "facil", tempo: 20, dataMs: 1 },
    ];
    assert.deepEqual(L.ranking(lista, "facil").map((r) => r.tempo), [20, 20, 50]);
    assert.equal(L.ranking(lista, "facil")[0].dataMs, 1);
    assert.equal(L.melhorTempo(lista, "facil"), 20);
    assert.equal(L.melhorTempo(lista, "dificil"), null);
  },

  "guarda no máximo os 50 melhores de cada nível"() {
    let lista = [];
    for (let t = 1; t <= 60; t++) lista = L.adicionarRecorde(lista, { nivel: "facil", tempo: t, dataMs: t });
    lista = L.adicionarRecorde(lista, { nivel: "medio", tempo: 99, dataMs: 0 });
    const facil = L.ranking(lista, "facil");
    assert.equal(facil.length, L.LIMITE_RECORDES);
    assert.equal(facil.at(-1).tempo, 50);
    assert.equal(L.ranking(lista, "medio").length, 1);
  },

  "recordes gravados com dados ruins são descartados"() {
    const lidos = L.lerRecordes([
      { nivel: "facil", tempo: 10, dataMs: 1 },
      { nivel: "impossivel", tempo: 3, dataMs: 1 },
      { nivel: "medio", tempo: -1, dataMs: 1 },
      "lixo",
      null,
    ]);
    assert.deepEqual(lidos, [{ nivel: "facil", tempo: 10, dataMs: 1 }]);
    assert.deepEqual(L.lerRecordes("corrompido"), []);
  },

  "formata o tempo como no app"() {
    assert.equal(L.formatarTempo(0), "00:00");
    assert.equal(L.formatarTempo(65), "01:05");
    assert.equal(L.formatarTempo(3725), "1:02:05");
    assert.equal(L.formatarTempo(-4), "00:00");
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
