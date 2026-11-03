"use strict";
/* Os mesmos casos de RegrasBatalhaNavalTest e DadosBatalhaNavalTest do Multi-Game Strategy. */
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
const tab = (navios, tiros = []) => ({ navios, tiros });

teste("navio não sai do tabuleiro nem cruza outro e cada tipo entra uma vez", () => {
  const t = B.tabuleiroVazio();
  assert.equal(B.posicionar(t, "carrier", 0, 6, "horizontal"), null);
  assert.equal(B.posicionar(t, "carrier", 6, 0, "vertical"), null);
  const um = B.posicionar(t, "carrier", 0, 5, "horizontal");
  assert.deepEqual(um.navios[0].posicoes, [5, 6, 7, 8, 9].map((c) => p(0, c)));
  // Cruza o porta-aviões em (0,7)
  assert.equal(B.posicionar(um, "battleship", 0, 7, "vertical"), null);
  assert.equal(B.posicionar(um, "carrier", 5, 0, "horizontal"), null);
  const dois = B.posicionar(um, "battleship", 1, 7, "vertical");
  assert.equal(dois.navios.length, 2);
  assert.equal(B.remover(dois, "carrier").navios.length, 1);
});

teste("frota aleatória sempre completa e válida", () => {
  const aleatorio = semente(7);
  for (let i = 0; i < 300; i++) {
    const t = B.completarAleatorio(B.tabuleiroVazio(), aleatorio);
    assert.equal(B.tiposPosicionados(t).size, 5);
    assert.ok(B.frotaValida(t, true));
    assert.equal(t.navios.reduce((s, n) => s + n.posicoes.length, 0), 17);
  }
});

teste("completar respeita os navios já posicionados", () => {
  const parcial = B.posicionar(B.tabuleiroVazio(), "patrol", 9, 8, "horizontal");
  const completo = B.completarAleatorio(parcial, semente(3));
  assert.deepEqual(completo.navios.find((n) => n.tipo === "patrol"), parcial.navios[0]);
  assert.ok(B.frotaValida(completo, true));
});

teste("tiro repetido é ignorado e afundar marca todas as casas", () => {
  const t = tab([{ tipo: "patrol", posicoes: [p(2, 2), p(2, 3)] }]);
  const agua = B.atirar(t, p(0, 0));
  assert.equal(agua.atingido, null);
  assert.equal(B.atirar(agua.tabuleiro, p(0, 0)), null);
  assert.equal(B.atirar(t, 100), null);
  const acerto = B.atirar(agua.tabuleiro, p(2, 2));
  assert.equal(acerto.atingido, "patrol");
  assert.equal(acerto.afundou, false);
  assert.equal(B.estado(acerto.tabuleiro, p(2, 2)), "acerto");
  const afundou = B.atirar(acerto.tabuleiro, p(2, 3));
  assert.equal(afundou.afundou, true);
  assert.equal(B.estado(afundou.tabuleiro, p(2, 2)), "afundado");
  assert.equal(B.estado(afundou.tabuleiro, p(0, 0)), "erro");
  assert.ok(B.todosAfundados(afundou.tabuleiro));
});

teste("tabuleiro sem navios não conta como derrotado", () => {
  assert.equal(B.todosAfundados(B.tabuleiroVazio()), false);
});

teste("acertou joga de novo, errou passa a vez e a vitória encerra a partida", () => {
  const inimigo = tab([{ tipo: "patrol", posicoes: [p(0, 0), p(0, 1)] }]);
  const jogador = B.completarAleatorio(B.tabuleiroVazio(), semente(2));
  const partida = { jogador, inimigo, fase: "jogando", vez: "jogador", vencedor: null, dificuldade: "easy", orientacao: "horizontal" };

  const acerto = B.atirarJogador(partida, p(0, 0));
  assert.equal(acerto.partida.vez, "jogador");
  assert.equal(B.atirarJogador(acerto.partida, p(0, 0)), null, "mesma casa duas vezes");

  const erro = B.atirarJogador(acerto.partida, p(5, 5));
  assert.equal(erro.partida.vez, "ia");
  assert.equal(B.atirarJogador(erro.partida, p(0, 1)), null, "não é a vez do jogador");

  const vitoria = B.atirarJogador(acerto.partida, p(0, 1));
  assert.equal(vitoria.partida.fase, "fim");
  assert.equal(vitoria.partida.vencedor, "jogador");
  assert.equal(B.tiros(vitoria.partida), 2);
});

teste("só começa com a frota completa e a dificuldade escolhida", () => {
  const aleatorio = semente(5);
  const nova = B.novaPartida(null, aleatorio);
  assert.equal(B.iniciar(nova), null);
  const pronta = B.posicionarRestantes(nova, aleatorio);
  assert.ok(B.prontaParaComecar(pronta));
  assert.equal(B.iniciar(pronta), null);
  const jogando = B.iniciar(B.escolherDificuldade(pronta, "medium"));
  assert.equal(jogando.fase, "jogando");
  assert.equal(B.posicionarNavio(jogando, "patrol", 0, 0), null, "não posiciona depois de começar");
});

teste("girar troca a orientação usada no posicionamento", () => {
  let partida = B.escolherDificuldade(B.novaPartida(null, semente(1)), "easy");
  assert.equal(partida.orientacao, "horizontal");
  partida = B.girar(partida);
  const posta = B.posicionarNavio(partida, "battleship", 2, 3);
  assert.deepEqual(posta.jogador.navios[0].posicoes, [p(2, 3), p(3, 3), p(4, 3), p(5, 3)]);
  assert.ok(B.emAndamento(posta));
  assert.equal(B.emAndamento(partida), false);
  assert.deepEqual(B.naviosFaltando(B.removerNavio(posta, "battleship")), B.NAVIOS.map((n) => n.tipo));
});

teste("partida completa entre jogador e computador termina sem casas repetidas", () => {
  B.DIFICULDADES.forEach(({ chave }, i) => {
    const aleatorio = semente(i + 10);
    let partida = B.iniciar(B.posicionarRestantes(B.novaPartida(chave, aleatorio), aleatorio));
    const livres = Array.from({ length: 100 }, (_, k) => k).sort(() => aleatorio() - 0.5);
    let jogadas = 0;
    while (partida.fase !== "fim") {
      if (partida.vez === "jogador") {
        partida = B.atirarJogador(partida, livres.shift()).partida;
      } else {
        const antes = partida.jogador.tiros.length;
        const j = B.jogadaIa(partida, aleatorio);
        assert.equal(j.partida.jogador.tiros.length, antes + 1);
        partida = j.partida;
      }
      jogadas++;
      assert.ok(jogadas <= 200);
    }
    assert.ok(partida.vencedor);
  });
});

teste("computador nunca atira duas vezes na mesma casa", () => {
  B.DIFICULDADES.forEach(({ chave }, i) => {
    const aleatorio = semente(42 + i);
    let t = B.completarAleatorio(B.tabuleiroVazio(), aleatorio);
    let n = 0;
    while (!B.todosAfundados(t)) {
      const alvo = B.escolherAlvo(t, chave, aleatorio);
      assert.ok(!t.tiros.includes(alvo), `${chave} repetiu ${alvo}`);
      t = B.atirar(t, alvo).tabuleiro;
      n++;
    }
    assert.ok(n <= 100);
  });
});

teste("difícil caça ao redor do acerto e segue a linha", () => {
  const navio = { tipo: "battleship", posicoes: [p(5, 3), p(5, 4), p(5, 5), p(5, 6)] };
  const aleatorio = semente(9);
  const umAcerto = tab([navio], [p(5, 5)]);
  for (let i = 0; i < 20; i++) assert.ok(B.vizinhas(p(5, 5)).includes(B.escolherAlvo(umAcerto, "hard", aleatorio)));
  const doisAcertos = tab([navio], [p(5, 5), p(5, 4)]);
  for (let i = 0; i < 20; i++) assert.ok([p(5, 3), p(5, 6)].includes(B.escolherAlvo(doisAcertos, "hard", aleatorio)));
  // Ponta esquerda já tentada (água): só sobra a direita
  const comAgua = tab([navio], [p(5, 5), p(5, 4), p(5, 2), p(5, 3)]);
  assert.equal(B.escolherAlvo(comAgua, "hard", aleatorio), p(5, 6));
});

teste("depois de afundar um navio continua caçando o outro já atingido", () => {
  const patrulha = { tipo: "patrol", posicoes: [p(0, 0), p(0, 1)] };
  const submarino = { tipo: "submarine", posicoes: [p(1, 0), p(2, 0), p(3, 0)] };
  const t = tab([patrulha, submarino], [p(0, 0), p(0, 1), p(1, 0)]);
  assert.deepEqual(B.acertosAbertos(t), [p(1, 0)]);
  const aleatorio = semente(4);
  for (let i = 0; i < 20; i++) assert.ok([p(2, 0), p(1, 1)].includes(B.escolherAlvo(t, "hard", aleatorio)));
});

teste("difícil afunda a frota com menos tiros que o médio, e o médio que o fácil", () => {
  const media = (dificuldade) => {
    const aleatorio = semente(100);
    let soma = 0;
    for (let k = 0; k < 60; k++) {
      let t = B.completarAleatorio(B.tabuleiroVazio(), aleatorio);
      while (!B.todosAfundados(t)) {
        t = B.atirar(t, B.escolherAlvo(t, dificuldade, aleatorio)).tabuleiro;
        soma++;
      }
    }
    return soma / 60;
  };
  const facil = media("easy");
  const medio = media("medium");
  const dificil = media("hard");
  assert.ok(medio < facil, `fácil ${facil}, médio ${medio}`);
  assert.ok(dificil < medio, `médio ${medio}, difícil ${dificil}`);
});

teste("estatísticas guardam vitórias, média e o melhor jogo", () => {
  let e = B.estatisticasVazias();
  e = B.registrarEstatistica(e, true, 60);
  e = B.registrarEstatistica(e, false, 40);
  e = B.registrarEstatistica(e, true, 50);
  assert.deepEqual(e, { partidas: 3, vitorias: 2, derrotas: 1, mediaTiros: 50, melhorJogo: 50 });
  assert.equal(B.taxaVitoria(e), 67);
  assert.deepEqual(B.lerEstatisticas(JSON.stringify(e)), e);
  assert.deepEqual(B.lerEstatisticas('{"partidas":2,"vitorias":5}'), B.estatisticasVazias());
});

teste("recorde: menos tiros é melhor e empate não supera", () => {
  const lista = B.ordenarRecordes([
    { tiros: 60, momento: 1 },
    { tiros: 35, momento: 2 },
    { tiros: 48, momento: 3 },
  ]);
  assert.deepEqual(lista.map((r) => r.tiros), [35, 48, 60]);
  const r = B.inserirRecorde(lista, { tiros: 35, momento: 9 });
  assert.equal(r.novoRecorde, false, "empate não supera o recorde");
  assert.equal(r.posicao, 2);
  assert.equal(B.inserirRecorde([], { tiros: 80, momento: 1 }).novoRecorde, true);
  // Lista cheia: um resultado pior que o 10º não entra
  const cheia = Array.from({ length: 10 }, (_, i) => ({ tiros: 20 + i, momento: i }));
  const fora = B.inserirRecorde(cheia, { tiros: 99, momento: 50 });
  assert.equal(fora.posicao, null);
  assert.equal(fora.lista, cheia);
  assert.deepEqual(B.lerRecordes('{"easy":[{"tiros":0,"momento":1},{"tiros":40,"momento":2}],"hard":"x"}'), {
    easy: [{ tiros: 40, momento: 2 }],
    medium: [],
    hard: [],
  });
});

teste("partida salva volta igual e JSON corrompido ou incoerente é ignorado", () => {
  const aleatorio = semente(11);
  const pronta = B.posicionarRestantes(B.novaPartida("hard", aleatorio), aleatorio);
  const jogando = B.iniciar(pronta);
  const depois = B.atirarJogador(jogando, p(3, 4)).partida;
  assert.deepEqual(B.lerPartida(JSON.stringify(depois)), depois);
  assert.equal(B.lerPartida("{quebrado"), null);
  assert.equal(B.lerPartida(null), null);
  // Dois navios na mesma casa
  const navios = depois.jogador.navios;
  const sobreposto = {
    ...depois,
    jogador: { ...depois.jogador, navios: [...navios.filter((n) => n.tipo !== "patrol"), { tipo: "patrol", posicoes: navios[0].posicoes.slice(0, 2) }] },
  };
  assert.equal(B.lerPartida(JSON.stringify(sobreposto)), null);
  // Navio torto
  const torto = { ...depois, inimigo: { ...depois.inimigo, navios: depois.inimigo.navios.map((n) => (n.tipo === "patrol" ? { ...n, posicoes: [0, 11] } : n)) } };
  assert.equal(B.lerPartida(JSON.stringify(torto)), null);
  // Tiros durante o posicionamento
  assert.equal(B.lerPartida(JSON.stringify({ ...pronta, inimigo: { ...pronta.inimigo, tiros: [5] } })), null);
  // Em jogo sem dificuldade
  assert.equal(B.lerPartida(JSON.stringify({ ...depois, dificuldade: null })), null);
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
