"use strict";
/* Regras da Batalha Naval portadas do app em React Native (src/utils/gameLogic.ts). */
const assert = require("node:assert/strict");
const B = require("../../assets/jogos/batalha-naval-logica.js");

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
const p = (l, c) => B.casa(l, c);
const sempre = (v) => () => v;
function colocar(tab, tipo, l, c, orientacao) {
  const posicoes = B.posicoesDoNavio(p(l, c), tipo, orientacao);
  assert.ok(B.podePosicionar(tab, posicoes), `${tipo} deveria caber`);
  return B.posicionar(tab, tipo, posicoes);
}
function atirar(tab, pontos) {
  let r;
  for (const [l, c] of pontos) {
    r = B.atacar(tab, p(l, c));
    tab = r.tabuleiro;
  }
  return { tab, r };
}

teste("navio ocupa as casas para a direita ou para baixo e não sai do tabuleiro", () => {
  assert.deepEqual(B.posicoesDoNavio(p(2, 3), "submarine", "horizontal"), [p(2, 3), p(2, 4), p(2, 5)]);
  assert.deepEqual(B.posicoesDoNavio(p(2, 3), "patrol", "vertical"), [p(2, 3), p(3, 3)]);
  const vazio = B.tabuleiroVazio();
  assert.equal(B.podePosicionar(vazio, B.posicoesDoNavio(p(0, 6), "carrier", "horizontal")), false);
  assert.equal(B.podePosicionar(vazio, B.posicoesDoNavio(p(0, 5), "carrier", "horizontal")), true);
  assert.equal(B.podePosicionar(vazio, B.posicoesDoNavio(p(6, 0), "carrier", "vertical")), false);
});

teste("navios podem encostar, mas não se cruzar", () => {
  const tab = colocar(B.tabuleiroVazio(), "carrier", 0, 0, "horizontal");
  assert.equal(B.podePosicionar(tab, B.posicoesDoNavio(p(0, 4), "battleship", "vertical")), false);
  assert.equal(B.podePosicionar(tab, B.posicoesDoNavio(p(1, 0), "battleship", "horizontal")), true);
  assert.equal(tab.grade[0][4].estado, "navio");
  assert.equal(tab.grade[0][4].navio, "carrier");
  assert.equal(tab.grade[0][5].estado, "agua");
});

teste("tiro na água, acerto e navio afundado", () => {
  const tab = colocar(B.tabuleiroVazio(), "patrol", 4, 4, "vertical");
  const agua = B.atacar(tab, p(0, 0));
  assert.equal(agua.acerto, false);
  assert.equal(agua.tabuleiro.grade[0][0].estado, "erro");
  assert.equal(agua.tabuleiro.grade[0][0].revelada, true);
  // O tabuleiro original não muda
  assert.equal(tab.grade[0][0].revelada, false);

  const acerto = B.atacar(agua.tabuleiro, p(4, 4));
  assert.deepEqual([acerto.acerto, acerto.afundou, acerto.tipo], [true, false, "patrol"]);
  assert.equal(acerto.tabuleiro.grade[4][4].estado, "acerto");
  assert.equal(B.todosAfundados(acerto.tabuleiro), false);

  const afundou = B.atacar(acerto.tabuleiro, p(5, 4));
  assert.deepEqual([afundou.acerto, afundou.afundou, afundou.tipo], [true, true, "patrol"]);
  assert.equal(afundou.tabuleiro.grade[4][4].estado, "afundado");
  assert.equal(afundou.tabuleiro.grade[5][4].estado, "afundado");
  assert.equal(B.todosAfundados(afundou.tabuleiro), true);

  const repetido = B.atacar(afundou.tabuleiro, p(5, 4));
  assert.equal(repetido.repetido, true);
  assert.equal(repetido.tabuleiro, afundou.tabuleiro);
});

teste("frota do computador sai sempre completa, com 17 casas e sem cruzar", () => {
  const aleatorio = semente(7);
  for (let i = 0; i < 500; i++) {
    const tab = B.tabuleiroAleatorio(aleatorio);
    assert.deepEqual(tab.navios.map((n) => n.tipo), B.ORDEM);
    const ocupadas = tab.grade.flat().filter((c) => c.estado === "navio");
    assert.equal(ocupadas.length, 17);
    for (const navio of tab.navios) {
      assert.equal(navio.posicoes.length, B.NAVIOS[navio.tipo].tamanho);
      for (const q of navio.posicoes) assert.equal(tab.grade[q.linha][q.coluna].navio, navio.tipo);
    }
  }
});

teste("fácil atira sempre ao acaso, mesmo caçando", () => {
  const tab = colocar(B.tabuleiroVazio(), "carrier", 5, 2, "horizontal");
  const { tab: atingido } = atirar(tab, [[5, 4]]);
  const caca = { ultimoAlvo: p(5, 4), cacando: true, direcao: "horizontal", acertos: [p(5, 4)] };
  // Com o sorteio em 0, a primeira casa livre é (0, 0), longe do acerto
  assert.deepEqual(B.jogadaComputador(atingido, caca, "facil", sempre(0)), p(0, 0));
});

teste("médio tenta ao lado do último acerto em 60% das vezes", () => {
  const tab = colocar(B.tabuleiroVazio(), "carrier", 5, 2, "horizontal");
  const { tab: atingido } = atirar(tab, [[5, 4]]);
  const caca = { ultimoAlvo: p(5, 4), cacando: true, direcao: "vertical", acertos: [p(5, 4)] };
  // Sorteio abaixo de 0,6: vizinho na direção atual (vertical, primeiro para cima)
  assert.deepEqual(B.jogadaComputador(atingido, caca, "medio", sempre(0.1)), p(4, 4));
  // Sorteio acima: tiro ao acaso (a 70ª das 99 casas livres, pulando a (5, 4))
  assert.deepEqual(B.jogadaComputador(atingido, caca, "medio", sempre(0.7)), p(7, 0));
  // Sem vizinho livre na direção, tenta a outra só quando não há direção definida
  assert.deepEqual(B.alvoCaca(atingido, p(5, 4), null), p(5, 3));
});

teste("difícil segue a linha dos acertos pelas pontas", () => {
  const tab = colocar(B.tabuleiroVazio(), "carrier", 3, 2, "horizontal");
  const { tab: atingido } = atirar(tab, [[3, 4], [3, 5]]);
  const caca = { ultimoAlvo: p(3, 5), cacando: true, direcao: "horizontal", acertos: [p(3, 4), p(3, 5)] };
  assert.equal(B.orientacaoDosAcertos(caca.acertos), "horizontal");
  assert.deepEqual(B.jogadaComputador(atingido, caca, "dificil", sempre(0.99)), p(3, 3));
  // Com a ponta esquerda já atacada, vai para a direita
  const { tab: semEsquerda } = atirar(atingido, [[3, 3]]);
  const caca2 = { ...caca, acertos: [p(3, 4), p(3, 5), p(3, 3)] };
  assert.deepEqual(B.jogadaComputador(semEsquerda, caca2, "dificil", sempre(0.99)), p(3, 2));
  // Um acerto só: vizinhos na ordem esquerda, direita, cima, baixo
  assert.deepEqual(B.alvoInteligente(tab, [p(0, 0)]), p(0, 1));
  assert.deepEqual(B.alvoInteligente(tab, [p(4, 4)]), p(4, 3));
});

teste("memória do computador: liga a caça no acerto, troca a direção no erro e zera ao afundar", () => {
  const inicio = B.cacaInicial();
  const acerto = B.depoisDaJogada(inicio, p(2, 2), { acerto: true, afundou: false }, sempre(0.1));
  assert.deepEqual(acerto, { ultimoAlvo: p(2, 2), cacando: true, direcao: "horizontal", acertos: [p(2, 2)] });
  const erro = B.depoisDaJogada(acerto, p(2, 3), { acerto: false, afundou: false });
  assert.equal(erro.direcao, "vertical");
  assert.deepEqual(erro.acertos, [p(2, 2)]);
  const outro = B.depoisDaJogada(erro, p(3, 2), { acerto: true, afundou: false }, sempre(0.9));
  assert.equal(outro.direcao, "vertical");
  assert.equal(outro.acertos.length, 2);
  assert.deepEqual(B.depoisDaJogada(outro, p(4, 2), { acerto: true, afundou: true }), B.cacaInicial());
  // Errar fora da caça não muda nada
  assert.equal(B.depoisDaJogada(inicio, p(0, 0), { acerto: false, afundou: false }), inicio);
});

teste("computador nunca repete casa e sempre termina em até 100 tiros", () => {
  const aleatorio = semente(42);
  for (const nivel of B.DIFICULDADES) {
    for (let i = 0; i < 150; i++) {
      let tab = B.tabuleiroAleatorio(aleatorio);
      let caca = B.cacaInicial();
      let tiros = 0;
      while (!B.todosAfundados(tab)) {
        const alvo = B.jogadaComputador(tab, caca, nivel, aleatorio);
        assert.equal(B.atacada(tab, alvo), false, `${nivel} repetiu ${B.nomeCasa(alvo)}`);
        const r = B.atacar(tab, alvo);
        tab = r.tabuleiro;
        caca = B.depoisDaJogada(caca, alvo, r, aleatorio);
        tiros++;
      }
      assert.ok(tiros >= 17 && tiros <= 100);
    }
  }
});

teste("estatísticas: média de todas as partidas e melhor vitória com menos tiros", () => {
  let e = B.estatisticasVazias();
  e = B.registrarPartida(e, true, 60);
  assert.deepEqual(e, { partidas: 1, vitorias: 1, derrotas: 0, mediaTiros: 60, melhor: 60 });
  e = B.registrarPartida(e, false, 75);
  assert.deepEqual(e, { partidas: 2, vitorias: 1, derrotas: 1, mediaTiros: 68, melhor: 60 });
  e = B.registrarPartida(e, true, 48);
  assert.equal(e.melhor, 48);
  e = B.registrarPartida(e, true, 55);
  assert.equal(e.melhor, 48);
  assert.equal(B.aproveitamento(e), 0.75);
  assert.equal(B.aproveitamento(B.estatisticasVazias()), 0);
});

teste("estatísticas lidas do navegador são validadas", () => {
  const boa = { partidas: 3, vitorias: 2, derrotas: 1, mediaTiros: 61, melhor: 50 };
  assert.deepEqual(B.lerEstatisticas(boa), boa);
  assert.deepEqual(B.lerEstatisticas(null), B.estatisticasVazias());
  assert.deepEqual(B.lerEstatisticas({ ...boa, vitorias: 5 }), B.estatisticasVazias());
  assert.deepEqual(B.lerEstatisticas({ ...boa, melhor: -1 }), B.estatisticasVazias());
  assert.deepEqual(B.lerEstatisticas({ partidas: "3" }), B.estatisticasVazias());
});

teste("nome da casa: letra da coluna e número da linha", () => {
  assert.equal(B.nomeCasa(p(0, 0)), "A1");
  assert.equal(B.nomeCasa(p(9, 9)), "J10");
  assert.equal(B.nomeCasa(p(4, 1)), "B5");
});

let falhas = 0;
for (const [nome, fn] of testes) {
  try {
    fn();
    console.log(`ok - ${nome}`);
  } catch (erro) {
    falhas++;
    console.log(`FALHOU - ${nome}\n${erro.stack}`);
  }
}
if (falhas) process.exit(1);
console.log(`${testes.length} testes passaram`);
