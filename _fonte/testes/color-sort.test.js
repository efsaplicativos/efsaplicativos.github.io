"use strict";
/* Os mesmos casos de ColorSortTest do Multi-Game Strategy, mais o desfazer da versão web. */
const assert = require("node:assert/strict");
const C = require("../../assets/jogos/color-sort-logica.js");

const testes = [];
const teste = (nome, fn) => testes.push([nome, fn]);

/** Gerador previsível (mulberry32). */
function semente(n) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const tab = (...tubos) => ({ tubos, altura: 4 });
const reproduzir = (t, movimentos) =>
  movimentos.reduce((atual, [o, d]) => {
    const proximo = C.mover(atual, o, d);
    assert.ok(proximo, `jogada inválida ${o} → ${d}`);
    return proximo;
  }, t);

teste("só despeja sobre a mesma cor ou em tubo vazio e nunca em tubo cheio", () => {
  const t = tab([0, 1], [2, 1], [0, 0, 0, 2], []);
  assert.ok(C.podeMover(t, 0, 1));
  assert.ok(C.podeMover(t, 0, 3));
  assert.equal(C.podeMover(t, 0, 2), false, "cores diferentes");
  assert.equal(C.podeMover(t, 1, 2), false, "tubo cheio");
  assert.equal(C.podeMover(t, 3, 0), false, "origem vazia");
  assert.equal(C.podeMover(t, 0, 0), false, "mesmo tubo");
  assert.equal(C.mover(t, 0, 2), null);
});

teste("move todas as bolas iguais do topo que couberem", () => {
  const t = tab([2, 1, 1, 1], [0, 1], []);
  const parcial = C.mover(t, 0, 1);
  assert.deepEqual(parcial.tubos[0], [2, 1]);
  assert.deepEqual(parcial.tubos[1], [0, 1, 1, 1]);
  const tudo = C.mover(t, 0, 2);
  assert.deepEqual(tudo.tubos[0], [2]);
  assert.deepEqual(tudo.tubos[2], [1, 1, 1]);
  // O tabuleiro original não muda (o desfazer guarda os anteriores)
  assert.deepEqual(t.tubos, [[2, 1, 1, 1], [0, 1], []]);
});

teste("vitória só com cada tubo vazio ou cheio de uma cor", () => {
  assert.ok(C.completo(tab([0, 0, 0, 0], [1, 1, 1, 1], [])));
  assert.equal(C.completo(tab([0, 0, 0], [1, 1, 1, 1], [0])), false);
  assert.equal(C.completo(tab([0, 0, 0, 1], [1, 1, 1, 0], [])), false);
  assert.ok(C.tuboCompleto(tab([1, 1, 1, 1]), 0));
  assert.equal(C.tuboCompleto(tab([]), 0), false);
});

teste("níveis gerados têm o formato do app e sempre têm solução", () => {
  const aleatorio = semente(2024);
  for (const d of C.DIFICULDADES) {
    for (let i = 0; i < 25; i++) {
      const t = C.gerar(d, aleatorio);
      assert.equal(t.tubos.length, d.tubos);
      assert.equal(t.tubos.filter((tubo) => !tubo.length).length, d.vazios);
      const contagem = {};
      for (const cor of t.tubos.flat()) contagem[cor] = (contagem[cor] || 0) + 1;
      assert.deepEqual(Object.keys(contagem).map(Number).sort((a, b) => a - b), [...Array(d.cores).keys()]);
      assert.ok(Object.values(contagem).every((n) => n === d.altura));
      assert.ok(C.interessante(t), "sem tubo pronto no início");
      assert.ok(C.tabuleiroValido(t, d));
      const solucao = C.resolver(t);
      assert.ok(solucao, `nível sem solução: ${JSON.stringify(t.tubos)}`);
      assert.ok(C.completo(reproduzir(t, solucao)));
    }
  }
});

teste("resolvedor reconhece nível impossível", () => {
  // Sem tubo vazio e com cores trocadas não há jogada
  assert.equal(C.resolver(tab([0, 1, 0, 1], [1, 0, 1, 0])), null);
  const possivel = tab([0, 1, 0, 1], [1, 0, 1], [0]);
  const solucao = C.resolver(possivel);
  assert.ok(solucao);
  assert.ok(C.completo(reproduzir(possivel, solucao)));
  assert.deepEqual(C.resolver(tab([0, 0, 0, 0], [])), []);
});

teste("nível montado de trás para frente também tem solução", () => {
  const aleatorio = semente(77);
  for (const d of [C.dificuldade("easy"), C.dificuldade("medium")]) {
    for (let i = 0; i < 10; i++) {
      const t = C.desembaralhar(d, aleatorio);
      assert.equal(C.completo(t), false);
      assert.equal(t.tubos.flat().length, d.cores * d.altura);
      assert.ok(C.tabuleiroValido(t, d));
      assert.ok(C.resolver(t, 200000));
    }
  }
});

teste("validação recusa tabuleiro salvo incoerente", () => {
  const d = C.dificuldade("easy");
  const bom = C.gerar(d, semente(1));
  assert.ok(C.tabuleiroValido(bom, d));
  assert.equal(C.tabuleiroValido({ ...bom, tubos: bom.tubos.slice(1) }, d), false);
  assert.equal(C.tabuleiroValido({ ...bom, tubos: [[0, 0, 0, 0, 0], ...bom.tubos.slice(1)] }, d), false);
  assert.equal(C.tabuleiroValido({ ...bom, tubos: bom.tubos.map((t) => t.map(() => 0)) }, d), false);
  assert.equal(C.tabuleiroValido(bom, C.dificuldade("hard")), false);
});

teste("desfazer volta o tabuleiro e o contador; reiniciar volta ao começo do nível", () => {
  const inicial = tab([0, 1, 1, 1], [1, 0, 0, 0], []);
  let p = C.novaPartida(inicial);
  assert.equal(C.desfazer(p), null, "nada a desfazer");
  assert.equal(C.jogar(p, 2, 0), null, "origem vazia");
  p = C.jogar(p, 0, 2);
  p = C.jogar(p, 1, 0);
  assert.equal(p.movimentos, 2);
  assert.deepEqual(p.tabuleiro.tubos, [[0, 0, 0, 0], [1], [1, 1, 1]]);
  const volta = C.desfazer(p);
  assert.equal(volta.movimentos, 1);
  assert.deepEqual(volta.tabuleiro.tubos, [[0], [1, 0, 0, 0], [1, 1, 1]]);
  assert.deepEqual(C.desfazer(volta).tabuleiro.tubos, inicial.tubos);
  const reinicio = C.reiniciar(p);
  assert.equal(reinicio.movimentos, 0);
  assert.deepEqual(reinicio.tabuleiro, inicial);
  assert.equal(reinicio.historico.length, 0);
});

teste("partida salva só volta se for coerente", () => {
  const d = C.dificuldade("easy");
  let p = C.novaPartida(C.gerar(d, semente(9)));
  const [o, dest] = C.movimentosValidos(p.tabuleiro)[0];
  p = C.jogar(p, o, dest);
  const lida = C.partidaValida(JSON.parse(JSON.stringify(p)), d);
  assert.deepEqual(lida, p);
  assert.equal(C.partidaValida({ ...p, movimentos: 0 }, d), null);
  assert.equal(C.partidaValida({ ...p, historico: [[[0, 0]]] }, d), null);
  assert.equal(C.partidaValida(p, C.dificuldade("medium")), null);
});

teste("menor tempo vence e no empate menos movimentos", () => {
  const lista = C.ordenarRecordes([
    { tempo: 40, movimentos: 30, momento: 1 },
    { tempo: 35, movimentos: 50, momento: 2 },
    { tempo: 35, movimentos: 20, momento: 3 },
  ]);
  assert.deepEqual(lista.map((r) => [r.tempo, r.movimentos]), [[35, 20], [35, 50], [40, 30]]);
  const empate = C.inserirRecorde(lista, { tempo: 35, movimentos: 20, momento: 9 });
  assert.equal(empate.novoRecorde, false);
  assert.equal(empate.posicao, 2);
  assert.equal(C.inserirRecorde(lista, { tempo: 35, movimentos: 19, momento: 9 }).novoRecorde, true);
  const cheia = Array.from({ length: 10 }, (_, i) => ({ tempo: 10 + i, movimentos: 5, momento: i }));
  assert.equal(C.inserirRecorde(cheia, { tempo: 99, movimentos: 5, momento: 20 }).posicao, null);
  assert.deepEqual(C.lerRecordes('{"easy":[{"tempo":42,"movimentos":18,"momento":1},{"tempo":1,"movimentos":0,"momento":2}]}').easy, [
    { tempo: 42, movimentos: 18, momento: 1 },
  ]);
});

teste("cronômetro não conta o tempo pausado", () => {
  let agora = 0;
  const c = C.criarCronometro(() => agora);
  c.iniciar();
  agora = 5000;
  c.pausar();
  agora = 60000;
  assert.equal(c.segundos(), 5);
  c.iniciar();
  agora = 63500;
  assert.equal(c.segundos(), 8);
  const retomado = C.criarCronometro(() => agora, 12000);
  assert.equal(retomado.segundos(), 12);
});

teste("tempo no formato do app", () => {
  assert.equal(C.formatarTempo(0), "0:00");
  assert.equal(C.formatarTempo(65), "1:05");
  assert.equal(C.formatarTempo(3723), "1:02:03");
});

let falhas = 0;
for (const [nome, fn] of testes) {
  try {
    fn();
    console.log(`ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`FALHA ${nome}\n${erro.stack}`);
  }
}
console.log(`\n${testes.length - falhas}/${testes.length} testes passaram`);
if (falhas) process.exit(1);
