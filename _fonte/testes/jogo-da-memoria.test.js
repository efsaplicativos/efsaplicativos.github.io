"use strict";
// Mesmos casos de app/src/test/.../JogoDaMemoriaTest.kt e PontuacaoTest.kt do app Jogo da Memória.
const assert = require("node:assert/strict");
const M = require("../../assets/jogos/jogo-da-memoria-logica.js");

function semente(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tabuleiro fixo: 🐶 nas posições 0 e 3, 🐱 nas posições 1 e 2. */
const jogoFixo = () => ({
  nivel: "facil",
  cartas: ["🐶", "🐱", "🐱", "🐶"].map((emoji, id) => ({ id, emoji, virada: false, encontrada: false })),
  selecionadas: [],
  movimentos: 0,
  segundos: 0,
  iniciado: false,
});
const virarTodas = (estado, ids) => ids.reduce((e, id) => M.virar(e, id), estado);

const testes = {
  "cada nível tem o número certo de cartas e pares"() {
    for (const nivel of Object.values(M.NIVEIS)) {
      const cartas = M.gerarCartas(nivel, semente(7));
      assert.equal(cartas.length, nivel.colunas * nivel.linhas);
      const porEmoji = new Map();
      for (const c of cartas) porEmoji.set(c.emoji, (porEmoji.get(c.emoji) || 0) + 1);
      assert.equal(porEmoji.size, M.pares(nivel));
      assert.ok([...porEmoji.values()].every((n) => n === 2), "cada emoji aparece exatamente duas vezes");
      assert.equal(new Set(cartas.map((c) => c.id)).size, cartas.length, "ids únicos");
      assert.ok(cartas.every((c) => !c.virada && !c.encontrada));
    }
  },
  "embaralhamento muda entre partidas e é reproduzível com a mesma semente"() {
    const a = M.gerarCartas(M.NIVEIS.dificil, semente(1)).map((c) => c.emoji);
    const b = M.gerarCartas(M.NIVEIS.dificil, semente(1)).map((c) => c.emoji);
    const c = M.gerarCartas(M.NIVEIS.dificil, semente(2)).map((c) => c.emoji);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
  },
  "pares iguais não ficam sempre lado a lado"() {
    const cartas = M.gerarCartas(M.NIVEIS.medio, semente(3));
    let vizinhosIguais = 0;
    for (let i = 1; i < cartas.length; i++) if (cartas[i].emoji === cartas[i - 1].emoji) vizinhosIguais++;
    assert.ok(vizinhosIguais < M.pares(M.NIVEIS.medio));
  },
  "lista de emojis não tem repetidos e cobre o nível Difícil"() {
    assert.equal(new Set(M.EMOJIS).size, M.EMOJIS.length);
    assert.ok(M.EMOJIS.length >= M.pares(M.NIVEIS.dificil));
  },
  "primeira carta vira sem contar movimento e liga o cronômetro"() {
    const estado = M.virar(jogoFixo(), 0);
    assert.ok(estado.cartas[0].virada);
    assert.deepEqual(estado.selecionadas, [0]);
    assert.equal(estado.movimentos, 0);
    assert.ok(estado.iniciado);
  },
  "par certo fica encontrado e conta um movimento"() {
    const estado = virarTodas(jogoFixo(), [0, 3]);
    assert.ok(estado.cartas[0].encontrada && estado.cartas[3].encontrada);
    assert.deepEqual(estado.selecionadas, []);
    assert.equal(estado.movimentos, 1);
    assert.equal(M.paresEncontrados(estado), 1);
    assert.equal(M.concluido(estado), false);
  },
  "par errado fica à mostra até desvirar e bloqueia outras cartas"() {
    const errado = virarTodas(jogoFixo(), [0, 1]);
    assert.ok(M.aguardandoDesvirar(errado));
    assert.equal(errado.movimentos, 1);
    assert.equal(M.virar(errado, 2), null, "terceira carta é ignorada enquanto o par errado aparece");
    const desvirado = M.desvirar(errado);
    assert.equal(desvirado.cartas[0].virada, false);
    assert.equal(desvirado.cartas[1].virada, false);
    assert.deepEqual(desvirado.selecionadas, []);
    assert.equal(desvirado.movimentos, 1);
  },
  "toques inválidos são ignorados"() {
    const virada = M.virar(jogoFixo(), 0);
    assert.equal(M.virar(virada, 0), null, "mesma carta duas vezes");
    assert.equal(M.virar(virada, 99), null, "id inexistente");
    const comPar = M.virar(virada, 3);
    assert.equal(M.virar(comPar, 3), null, "carta já encontrada");
  },
  "jogo termina quando todos os pares são encontrados"() {
    const estado = virarTodas(jogoFixo(), [0, 3, 1, 2]);
    assert.ok(M.concluido(estado));
    assert.equal(estado.movimentos, 2);
    assert.equal(M.virar(estado, 0), null);
  },
  "jogo perfeito usa exatamente um movimento por par"() {
    let estado = M.novoJogo(M.NIVEIS.dificil, semente(11));
    const grupos = new Map();
    for (const c of estado.cartas) grupos.set(c.emoji, [...(grupos.get(c.emoji) || []), c.id]);
    for (const [a, b] of grupos.values()) estado = virarTodas(estado, [a, b]);
    assert.ok(M.concluido(estado));
    assert.equal(estado.movimentos, M.pares(M.NIVEIS.dificil));
  },
  "cronômetro só anda com o jogo iniciado e em andamento"() {
    assert.equal(M.avancarSegundo(jogoFixo()).segundos, 0);
    assert.equal(M.avancarSegundo(M.virar(jogoFixo(), 0)).segundos, 1);
    const fim = virarTodas(jogoFixo(), [0, 3, 1, 2]);
    assert.equal(M.avancarSegundo(fim).segundos, fim.segundos);
  },
  "restaurar partida salva desvira cartas sem par e valida os dados"() {
    const emojis = ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼"].flatMap((e) => [e, e]);
    const restaurado = M.restaurar("facil", emojis, emojis.map((_, i) => i < 2), 5, 40, true);
    assert.ok(restaurado);
    assert.equal(M.paresEncontrados(restaurado), 1);
    assert.ok(restaurado.cartas[0].virada && restaurado.cartas[1].virada);
    assert.equal(restaurado.cartas[2].virada, false);
    assert.equal(restaurado.movimentos, 5);
    assert.equal(restaurado.segundos, 40);
    assert.equal(M.restaurar("medio", ["🐶", "🐶"], [false, false], 0, 0, false), null, "quantidade não bate com o nível");
    assert.equal(M.restaurar("facil", emojis, emojis.map((_, i) => i === 0), 0, 0, true), null, "par pela metade");
    const salvo = M.paraSalvar(restaurado);
    assert.deepEqual(M.restaurar(salvo.nivel, salvo.emojis, salvo.encontradas, salvo.movimentos, salvo.segundos, salvo.iniciado), restaurado);
  },

  // ---------- PontuacaoTest.kt ----------
  "menor tempo vence, empate no tempo é decidido pelos movimentos e depois pela data"() {
    const r = (segundos, movimentos, dataMs) => ({ segundos, movimentos, dataMs });
    let tabela = [];
    for (const x of [r(60, 20, 300), r(59, 30, 100), r(60, 19, 500), r(60, 19, 200)]) tabela = M.inserirRecorde(tabela, x).tabela;
    assert.deepEqual(tabela, [r(59, 30, 100), r(60, 19, 200), r(60, 19, 500), r(60, 20, 300)]);
  },
  "primeira partida é recorde e entra em primeiro lugar"() {
    const insercao = M.inserirRecorde([], { segundos: 42, movimentos: 12, dataMs: 1 });
    assert.equal(insercao.posicao, 1);
    assert.equal(insercao.tabela.length, 1);
  },
  "resultado entra na posição certa e empate com o recorde não é novo recorde"() {
    const tabela = [
      { segundos: 30, movimentos: 10, dataMs: 1 },
      { segundos: 40, movimentos: 10, dataMs: 2 },
      { segundos: 50, movimentos: 10, dataMs: 3 },
    ];
    assert.equal(M.inserirRecorde(tabela, { segundos: 35, movimentos: 20, dataMs: 9 }).posicao, 2);
    assert.equal(M.inserirRecorde(tabela, { segundos: 30, movimentos: 9, dataMs: 9 }).posicao, 1);
    assert.equal(M.inserirRecorde(tabela, { segundos: 30, movimentos: 10, dataMs: 9 }).posicao, 2);
  },
  "tabela guarda só os 10 melhores"() {
    const cheia = Array.from({ length: 10 }, (_, k) => ({ segundos: (k + 1) * 10, movimentos: 5, dataMs: k + 1 }));
    const pior = M.inserirRecorde(cheia, { segundos: 500, movimentos: 5, dataMs: 99 });
    assert.equal(pior.posicao, null);
    assert.deepEqual(pior.tabela, cheia);
    const bom = M.inserirRecorde(cheia, { segundos: 15, movimentos: 5, dataMs: 99 });
    assert.equal(bom.posicao, 2);
    assert.equal(bom.tabela.length, M.LIMITE_RECORDES);
    assert.deepEqual(bom.tabela.at(-1), { segundos: 90, movimentos: 5, dataMs: 9 });
  },
  "formatação de tempo e movimentos"() {
    assert.equal(M.formatarTempo(0), "00:00");
    assert.equal(M.formatarTempo(65), "01:05");
    assert.equal(M.formatarTempo(3600), "60:00");
    assert.equal(M.formatarTempo(-3), "00:00");
    assert.equal(M.textoMovimentos(1), "1 movimento");
    assert.equal(M.textoMovimentos(12), "12 movimentos");
    assert.equal(M.resumoRecorde({ segundos: 42, movimentos: 12 }), "00:42 · 12 movimentos");
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
