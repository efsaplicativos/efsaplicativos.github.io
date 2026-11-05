"use strict";
const assert = require("node:assert/strict");
const L = require("../../assets/jogos/oito-maluco-logica.js");

// Carta pelo nome: valor + naipe (e espadas, c copas, o ouros, p paus). Ex.: "Kc", "10e", "Ap".
const NAIPE = { e: 0, c: 1, o: 2, p: 3 };
const VALOR = { A: 1, J: 11, Q: 12, K: 13 };
function carta(nome) {
  const v = VALOR[nome.slice(0, -1)] || Number(nome.slice(0, -1));
  return NAIPE[nome.slice(-1)] * 13 + v - 1;
}
const cs = (texto) => (texto ? texto.split(" ").map(carta) : []);

/**
 * Estado montado à mão. As mãos, o descarte e o monte vêm por texto (no monte e no descarte, a carta
 * de cima no fim); as cartas que sobram vão para o fundo do monte, para o estado ficar completo.
 */
function estado(partes = {}) {
  const maos = partes.maos.map(cs);
  const modo = maos.length;
  const descarte = cs(partes.descarte);
  const topoDoMonte = cs(partes.monte);
  const usadas = new Set([...maos.flat(), ...descarte, ...topoDoMonte]);
  const resto = partes.semResto ? [] : [...Array(52).keys()].filter((id) => !usadas.has(id));
  const cima = descarte[descarte.length - 1];
  return {
    modo,
    semente: 1,
    rodada: partes.rodada || 1,
    maos,
    monte: [...resto, ...topoDoMonte],
    descarte,
    naipe: partes.naipe === undefined ? L.naipe(cima) : partes.naipe,
    vez: partes.vez || 0,
    compradas: partes.compradas || 0,
    embaralhamentos: 0,
    faltas: partes.faltas || Array.from({ length: modo }, () => [false, false, false, false]),
    pontos: partes.pontos || Array(modo).fill(0),
    rodadas: partes.rodadas || [],
    fase: "jogando",
    vencedor: null,
    movimentos: 0,
    iniciado: false,
  };
}

function conferirInvariantes(e) {
  const todas = [...e.maos.flat(), ...e.monte, ...e.descarte];
  assert.equal(todas.length, 52, "52 cartas no jogo");
  assert.equal(new Set(todas).size, 52, "nenhuma carta repetida");
  assert.ok(e.descarte.length >= 1, "o descarte nunca fica vazio");
  const somas = Array(e.modo).fill(0);
  for (const r of e.rodadas) r.ganhos.forEach((g, j) => (somas[j] += g));
  assert.deepEqual(somas, e.pontos, "os pontos somam as rodadas");
  assert.ok(L.restaurar(JSON.parse(JSON.stringify(e))), "o estado salvo volta igual");
}

// ---------- Cartas e pontos ----------
{
  assert.equal(L.valor(carta("Ae")), 1);
  assert.equal(L.naipe(carta("Kp")), 3);
  assert.equal(L.nomeCarta(carta("Qo")), "Dama de ouros");
  assert.equal(L.comArtigo(carta("Qo")), "a Dama de ouros");
  assert.equal(L.comArtigo(carta("7c")), "o 7 de copas");
  assert.equal(L.umValor(9), "um 9");
  assert.equal(L.umValor(12), "uma Dama");
  assert.equal(L.umValor(1), "um Ás");
  assert.equal(L.pontosDaCarta(carta("8e")), 50, "o 8 vale 50");
  for (const n of ["Kc", "Qo", "Jp"]) assert.equal(L.pontosDaCarta(carta(n)), 10, "figuras valem 10");
  assert.equal(L.pontosDaCarta(carta("Ac")), 1, "o Ás vale 1");
  assert.equal(L.pontosDaCarta(carta("7p")), 7);
  assert.equal(L.pontosDaCarta(carta("10o")), 10);
  assert.equal(L.pontosDaMao(cs("8e Kc Ao 7p")), 68);
  assert.equal(L.textoModo(3), "3 jogadores");
  assert.equal(L.nomeJogador(0), "Você");
}

// ---------- Distribuição ----------
{
  for (const modo of L.MODOS) {
    const e = L.novoJogo(modo, 42);
    const k = modo === 2 ? 7 : 5;
    assert.equal(e.maos.length, modo);
    for (const mao of e.maos) assert.equal(mao.length, k, `${k} cartas cada com ${modo} jogadores`);
    assert.equal(e.monte.length, 52 - modo * k - 1);
    assert.equal(e.descarte.length, 1);
    assert.notEqual(L.valor(e.descarte[0]), 8, "o descarte não começa com um 8");
    assert.equal(e.naipe, L.naipe(e.descarte[0]));
    assert.equal(e.vez, 0, "na primeira rodada você começa");
    assert.equal(e.fase, "jogando");
    assert.deepEqual(e.pontos, Array(modo).fill(0));
    conferirInvariantes(e);
    assert.deepEqual(L.novoJogo(modo, 42), e, "a mesma semente dá a mesma partida");
    assert.notDeepEqual(L.novoJogo(modo, 43).maos, e.maos);
  }
  assert.equal(L.novoJogo(7, 1).modo, L.MODO_PADRAO, "modo inválido vira o padrão");
  for (let s = 1; s <= 300; s++) assert.notEqual(L.valor(L.novoJogo(3, s).descarte[0]), 8);

  // Um 8 virado volta para o meio do monte e vira-se a carta seguinte
  const monte = cs("2e 3e 4e 5e 6e 7e 9e 8c");
  const inicio = L.virarInicial(monte);
  assert.equal(inicio, carta("9e"));
  assert.deepEqual(monte, cs("2e 3e 4e 8c 5e 6e 7e"), "o 8 foi para o meio");
  const doisOitos = cs("2e 3e 4e 5e 8o 8c");
  assert.equal(L.virarInicial(doisOitos), carta("5e"), "dois 8 seguidos voltam os dois");
  assert.equal(doisOitos.filter((id) => L.valor(id) === 8).length, 2);
}

// ---------- Que carta serve ----------
{
  const e = estado({ maos: ["9e 3c 8p Ke", "2o 3o"], descarte: "4o 9c" });
  assert.equal(e.naipe, 1, "naipe da vez é o da carta de cima: copas");
  assert.ok(L.serve(e, carta("9e")), "mesmo valor");
  assert.ok(L.serve(e, carta("3c")), "mesmo naipe");
  assert.ok(L.serve(e, carta("8p")), "o 8 serve sempre");
  assert.ok(!L.serve(e, carta("Ke")), "nem naipe nem valor");
  assert.deepEqual(L.cartasQueServem(e), cs("9e 3c 8p"));
  assert.ok(!L.naipePedido(e));

  // Depois de um 8 que pediu ouros, só ouros ou outro 8
  const pedido = estado({ maos: ["Ko 9c 8e 3c", "2p"], descarte: "9c 8p", naipe: 2 });
  assert.ok(L.naipePedido(pedido));
  assert.ok(L.serve(pedido, carta("Ko")), "ouros, o naipe pedido");
  assert.ok(!L.serve(pedido, carta("9c")), "copas não serve mais");
  assert.ok(!L.serve(pedido, carta("3c")));
  assert.ok(L.serve(pedido, carta("8e")), "outro 8 serve");
}

// ---------- Jogar ----------
{
  const e = estado({ maos: ["9e 3c 8p Ke", "2o 3o 4o", "5p 6p"], descarte: "9c" });
  const a = L.jogar(e, carta("9e"));
  assert.ok(a);
  assert.deepEqual(a.maos[0], cs("3c 8p Ke"));
  assert.equal(L.cartaDeCima(a), carta("9e"));
  assert.equal(a.naipe, 0, "o naipe da vez passa a ser espadas");
  assert.equal(a.vez, 1, "a vez passa para o próximo");
  assert.ok(a.iniciado);
  assert.equal(e.maos[0].length, 4, "o estado de antes não muda");
  conferirInvariantes(a);

  assert.equal(L.jogar(e, carta("Ke")), null, "carta que não serve");
  assert.equal(L.jogar(e, carta("2o")), null, "carta de outro jogador");
  assert.equal(L.jogar(e, carta("8p")), null, "o 8 precisa do naipe");
  assert.equal(L.jogar(e, carta("8p"), 7), null, "naipe inválido");
  assert.ok(L.precisaNaipe(e, carta("8p")));
  const oito = L.jogar(e, carta("8p"), 2);
  assert.equal(oito.naipe, 2, "o 8 pediu ouros");
  assert.ok(L.naipePedido(oito));
  assert.deepEqual(L.cartasQueServem(oito), cs("2o 3o 4o"), "o próximo joga ouros");

  // A vez dá a volta na mesa
  assert.equal(L.jogar(L.jogar(L.jogar(e, carta("3c")), carta("3o")), carta("6p")), null, "o 6p não serve sobre o 3o");
  const c = L.jogar(L.jogar(e, carta("3c")), carta("3o"));
  assert.equal(c.vez, 2);
  const d = L.comprar(c);
  assert.equal(d.vez, 2, "comprar não passa a vez");
}

// ---------- Comprar, embaralhar e passar ----------
{
  const e = estado({ maos: ["Ke 2e", "4p 5p"], descarte: "3c 9c", monte: "7o Jc" });
  assert.ok(L.podeComprar(e));
  assert.ok(!L.podePassar(e), "com o monte cheio, não passa");
  const a = L.comprar(e);
  assert.deepEqual(a.maos[0], cs("Ke 2e Jc"), "a carta de cima do monte vai para o fim da mão");
  assert.equal(a.compradas, 1);
  assert.equal(a.vez, 0);
  assert.ok(a.faltas[0][1], "todos viram você comprar em copas");
  assert.ok(L.serve(a, carta("Jc")));
  const b = L.jogar(a, carta("Jc"));
  assert.ok(b, "a carta comprada pode ser jogada já");
  assert.ok(!b.faltas[0][1], "jogou copas: a falta some");
  assert.equal(b.compradas, 0);
  // Também dá para comprar tendo carta que serve
  assert.ok(L.comprar(estado({ maos: ["3c", "4p"], descarte: "9c" })));

  // Monte vazio: o descarte, menos a de cima, vira o monte novo
  const vazio = estado({ maos: ["Ke 2e", "4p 5p"], descarte: "3o 5o 7o 9c", semResto: true, monte: "" });
  vazio.maos[0].push(...[...Array(52).keys()].filter((id) => !vazio.maos.flat().includes(id) && !vazio.descarte.includes(id)));
  conferirInvariantes(vazio);
  assert.equal(vazio.monte.length, 0);
  assert.ok(L.podeComprar(vazio));
  const novo = L.reabastecer(vazio);
  assert.deepEqual(novo.descarte, cs("9c"), "a carta de cima fica");
  assert.deepEqual([...novo.monte].sort((x, y) => x - y), cs("3o 5o 7o").sort((x, y) => x - y));
  assert.equal(novo.embaralhamentos, 1);
  assert.deepEqual(L.reabastecer(vazio), novo, "a embaralhada também segue a semente");
  assert.equal(L.reabastecer(novo), null, "com monte, não embaralha");
  const comprou = L.comprar(vazio);
  assert.equal(comprou.monte.length, 2, "comprar com o monte vazio embaralha e compra");
  assert.equal(comprou.descarte.length, 1);
  conferirInvariantes(comprou);

  // Nada para comprar e nenhuma carta serve: passa a vez
  const preso = estado({ maos: ["Ke 2e", "4p 5p"], descarte: "9c", semResto: true, monte: "" });
  preso.maos[1].push(...[...Array(52).keys()].filter((id) => !preso.maos.flat().includes(id) && !preso.descarte.includes(id)));
  conferirInvariantes(preso);
  assert.ok(!L.podeComprar(preso));
  assert.equal(L.comprar(preso), null);
  assert.ok(L.podePassar(preso));
  const passou = L.passar(preso);
  assert.equal(passou.vez, 1);
  assert.ok(passou.iniciado);
  // Quem tem carta que serve não passa
  const naoPassa = { ...passou };
  assert.ok(!L.podePassar(naoPassa), "o outro tem cartas de copas e 8");
  assert.equal(L.passar(naoPassa), null);
}

// ---------- Fim da rodada e da partida ----------
{
  // Você bate com o 4c; sobram 8e Kc Ao (61) com um e 7p com o outro (7)
  const e = estado({ maos: ["4c", "8e Kc Ao", "7p"], descarte: "9c", pontos: [10, 20, 0], rodadas: [{ vencedor: 1, ganhos: [0, 20, 0] }, { vencedor: 0, ganhos: [10, 0, 0] }], rodada: 3 });
  const a = L.jogar(e, carta("4c"));
  assert.equal(a.fase, "fimRodada");
  assert.deepEqual(a.rodadas[2], { vencedor: 0, ganhos: [68, 0, 0] }, "68 = 50 + 10 + 1 + 7");
  assert.deepEqual(a.pontos, [78, 20, 0]);
  assert.equal(a.vencedor, null);
  conferirInvariantes(a);
  assert.equal(L.jogar(a, carta("Kc")), null, "rodada encerrada não aceita jogadas");
  assert.equal(L.comprar(a), null);

  const b = L.proximaRodada(a);
  assert.equal(b.rodada, 4);
  assert.equal(b.vez, 0, "na rodada 4 com 3 jogadores, começa o jogador 0 de novo");
  assert.deepEqual(b.pontos, [78, 20, 0], "os pontos continuam");
  assert.equal(b.rodadas.length, 3);
  assert.ok(b.maos.every((m) => m.length === 5));
  conferirInvariantes(b);
  assert.equal(L.proximaRodada(b), null, "só depois do fim da rodada");
  const r2 = L.proximaRodada(L.jogar(estado({ maos: ["4c", "Kc", "Qc"], descarte: "9c" }), carta("4c")));
  assert.equal(r2.rodada, 2);
  assert.equal(r2.vez, 1, "a cada rodada, quem começa passa para o jogador seguinte");

  // Chegou a 100: fim da partida
  const fim = L.jogar(estado({ maos: ["4c", "Kc"], descarte: "9c", pontos: [95, 0], rodadas: [{ vencedor: 0, ganhos: [95, 0] }], rodada: 2 }), carta("4c"));
  assert.equal(fim.fase, "fimPartida");
  assert.equal(fim.vencedor, 0);
  assert.deepEqual(fim.pontos, [105, 0]);
  assert.equal(L.proximaRodada(fim), null, "a partida acabou");
  assert.deepEqual(L.classificacao({ modo: 3, pontos: [40, 105, 40] }), [1, 0, 2]);

  // O 8 como última carta bate sem pedir naipe
  const oito = estado({ maos: ["8e", "Kc"], descarte: "9c" });
  assert.ok(!L.precisaNaipe(oito, carta("8e")));
  const bateu = L.jogar(oito, carta("8e"));
  assert.equal(bateu.fase, "fimRodada");
  assert.deepEqual(bateu.rodadas[0].ganhos, [10, 0]);
}

// ---------- Computador ----------
{
  // Joga a carta do naipe em que tem mais cartas: o 9e (sobram 3 espadas), não o 9o
  const e = estado({ maos: ["9o 9e 2e 3e 4e Kp", "2c 3c 4c 5c 6c"], descarte: "9c" });
  assert.deepEqual(L.escolherJogada(e), { acao: "jogar", carta: carta("9e") });

  // Guarda o 8 enquanto outra carta serve
  const guarda = estado({ maos: ["8p 3c Ke 2e", "2o 3o 4o 5o 6o"], descarte: "9c" });
  assert.deepEqual(L.escolherJogada(guarda), { acao: "jogar", carta: carta("3c") });

  // Só o 8 serve e ninguém está perto de bater: compra uma carta antes de gastá-lo
  const soOito = estado({ maos: ["8p Ke 2e 3e Ko", "2o 3o 4o 5o 6o"], descarte: "9c" });
  assert.deepEqual(L.escolherJogada(soOito), { acao: "comprar" });
  // Já comprou: joga o 8 e pede o naipe mais comprido (espadas, com 3 cartas)
  assert.deepEqual(L.escolherJogada({ ...soOito, compradas: 1 }), { acao: "jogar", carta: carta("8p"), naipe: 0 });
  // Sem nenhuma carta que sirva, compra; sem monte, passa
  assert.deepEqual(L.escolherJogada(estado({ maos: ["Ke 2e", "2o"], descarte: "9c" })), { acao: "comprar" });

  // Com um adversário perto de bater, se livra das cartas que valem mais
  const calmo = estado({ maos: ["5p 2p Kc", "2o 3o 4o 5o 6o"], descarte: "5c" });
  assert.equal(L.escolherJogada(calmo).carta, carta("5p"), "sem pressa, fica no naipe mais comprido");
  const ameaca = estado({ maos: ["5p 2p Kc", "2o 3o"], descarte: "5c" });
  assert.equal(L.escolherJogada(ameaca).carta, carta("Kc"), "com o outro com 2 cartas, joga o Rei");
  // Adversário com a última carta: joga o 8 (50 pontos) e pede o naipe em que ele comprou
  const ultima = estado({
    maos: ["8p 3c 4c Qe", "2o"],
    descarte: "9c",
    faltas: [
      [false, false, false, false],
      [false, false, false, true],
    ],
  });
  assert.deepEqual(L.escolherJogada(ultima), { acao: "jogar", carta: carta("8p"), naipe: 3 });
  // Com só duas cartas, o 8 fica para bater na próxima
  const duas = estado({ maos: ["8p 3c", "2o"], descarte: "9c" });
  assert.deepEqual(L.escolherJogada(duas), { acao: "jogar", carta: carta("3c") });

  // Empate no tamanho dos naipes: o 8 pede o naipe em que o próximo jogador foi visto comprando
  const faltas = [
    [false, false, false, false],
    [false, false, true, false],
  ];
  const empate = estado({ maos: ["8p 2c 2o", "3p 4p 5p 6p 7p"], descarte: "9e", faltas, compradas: 1 });
  assert.equal(L.melhorNaipe(empate, carta("8p")), 2, "ouros: o outro não tem");
  assert.equal(L.melhorNaipe({ ...empate, faltas: [faltas[0], [false, false, false, false]] }, carta("8p")), 1, "sem pista, copas");
  const comprouEmOuros = L.comprar(estado({ maos: ["Kp", "2c 3c"], descarte: "9o" }));
  assert.ok(comprouEmOuros.faltas[0][2], "comprar marca a falta do naipe da vez");
}

// ---------- Partidas ao acaso ----------

/** Jogada sorteada entre as possíveis (às vezes compra mesmo tendo carta que serve). */
function jogadaAoAcaso(e, sorteio) {
  const servem = L.jogadasPossiveis(e).filter((j) => j.acao === "jogar");
  if (servem.length && (sorteio() < 0.9 || !L.podeComprar(e))) return servem[Math.floor(sorteio() * servem.length)];
  return L.podeComprar(e) ? { acao: "comprar" } : { acao: "passar" };
}

/** Joga uma partida inteira; [jogadores][j](estado) devolve a jogada. Confere tudo a cada passo. */
function partidaInteira(modo, semente, jogadores, conferir = false) {
  let e = L.novoJogo(modo, semente);
  let passos = 0;
  while (e.fase !== "fimPartida") {
    if (e.fase === "fimRodada") {
      const r = e.rodadas[e.rodadas.length - 1];
      assert.equal(e.maos[r.vencedor].length, 0, "quem venceu a rodada ficou sem cartas");
      const resto = e.maos.reduce((s, m, j) => (j === r.vencedor ? s : s + L.pontosDaMao(m)), 0);
      assert.equal(r.ganhos[r.vencedor], resto, "o vencedor marca as cartas dos outros");
      e = L.proximaRodada(e);
      if (conferir) conferirInvariantes(e);
      continue;
    }
    const jogada = jogadores[e.vez](e);
    const possiveis = L.jogadasPossiveis(e);
    assert.ok(
      possiveis.some((p) => p.acao === jogada.acao && p.carta === jogada.carta && (p.naipe === jogada.naipe || !L.precisaNaipe(e, p.carta))),
      "só jogadas legais",
    );
    const n = L.aplicar(e, jogada);
    assert.ok(n, "a jogada legal é aceita");
    if (jogada.acao === "jogar") assert.equal(L.cartaDeCima(n), jogada.carta);
    e = n;
    if (conferir) conferirInvariantes(e);
    passos += 1;
    assert.ok(passos < 60000, "a partida termina");
  }
  assert.ok(e.pontos[e.vencedor] >= 100, "o vencedor chegou a 100");
  assert.equal(Math.max(...e.pontos), e.pontos[e.vencedor]);
  return e;
}

{
  // Jogadas ao acaso: nenhuma carta se perde ou se repete, toda partida termina e os pontos fecham
  const sorteio = L.aleatorioComSemente(7);
  for (let s = 1; s <= 60; s++) {
    const modo = L.MODOS[s % 3];
    const jogadores = Array.from({ length: modo }, () => (e) => jogadaAoAcaso(e, sorteio));
    partidaInteira(modo, s, jogadores, true);
  }
  // Computador contra computador, nos três modos
  for (let s = 1; s <= 150; s++) {
    const modo = L.MODOS[s % 3];
    partidaInteira(modo, 1000 + s, Array.from({ length: modo }, () => (e) => L.escolherJogada(e)), s <= 15);
  }
}

// ---------- O computador contra jogadas ao acaso ----------
{
  /** Jogador ao acaso: uma carta que serve qualquer (e um naipe qualquer para o 8); sem nenhuma, compra. */
  const aoAcaso = (sorteio) => (e) => {
    const servem = L.cartasQueServem(e);
    if (!servem.length) return L.podeComprar(e) ? { acao: "comprar" } : { acao: "passar" };
    const id = servem[Math.floor(sorteio() * servem.length)];
    return L.precisaNaipe(e, id) ? { acao: "jogar", carta: id, naipe: Math.floor(sorteio() * 4) } : { acao: "jogar", carta: id };
  };
  const sorteio = L.aleatorioComSemente(11);
  const partidas = 240;
  for (const modo of L.MODOS) {
    let vitorias = 0;
    for (let s = 1; s <= partidas; s++) {
      const lugar = s % modo;
      const jogadores = Array.from({ length: modo }, (_, j) => (j === lugar ? (e) => L.escolherJogada(e) : aoAcaso(sorteio)));
      if (partidaInteira(modo, 5000 + s, jogadores).vencedor === lugar) vitorias += 1;
    }
    const taxa = vitorias / partidas;
    console.log(`computador contra ${modo - 1} ao acaso: venceu ${vitorias} de ${partidas} (${Math.round(100 * taxa)}%; o justo seria ${Math.round(100 / modo)}%)`);
    if (modo === 2) assert.ok(taxa >= 0.7, "contra um jogador ao acaso, o computador ganha a maioria das partidas");
    else assert.ok(taxa >= 1.2 / modo, "contra vários ao acaso, ganha mais que a sua parte justa");
  }
}

// ---------- Salvar e restaurar ----------
{
  let e = L.novoJogo(3, 9);
  e = L.comprar(e);
  e = L.aplicar(e, L.escolherJogada(e));
  const salvo = JSON.parse(JSON.stringify(e));
  assert.deepEqual(L.restaurar(salvo), e);
  assert.equal(L.restaurar(null), null);
  assert.equal(L.restaurar("x"), null);
  assert.equal(L.restaurar({ ...salvo, modo: 5 }), null, "modo inválido");
  assert.equal(L.restaurar({ ...salvo, semente: 0 }), null);
  assert.equal(L.restaurar({ ...salvo, vez: 3 }), null, "vez fora da mesa");
  assert.equal(L.restaurar({ ...salvo, naipe: 4 }), null);
  const inicio = L.novoJogo(3, 9);
  const outroNaipe = (inicio.naipe + 1) % 4;
  assert.equal(L.restaurar({ ...inicio, naipe: outroNaipe }), null, "sem 8 em cima, o naipe é o da carta");
  assert.equal(L.restaurar({ ...salvo, monte: [...salvo.monte, salvo.monte[0]] }), null, "carta repetida");
  assert.equal(L.restaurar({ ...salvo, monte: salvo.monte.slice(1) }), null, "carta faltando");
  assert.equal(L.restaurar({ ...salvo, maos: salvo.maos.slice(1) }), null);
  assert.equal(L.restaurar({ ...salvo, pontos: [5, 0, 0] }), null, "pontos que não batem com as rodadas");
  assert.equal(L.restaurar({ ...salvo, faltas: [[true], [], []] }), null);
  assert.equal(L.restaurar({ ...salvo, fase: "fimRodada" }), null, "fim de rodada sem a rodada registrada");
  assert.equal(L.restaurar({ ...salvo, compradas: -1 }), null);

  // Fim de rodada e fim de partida salvos
  const r = L.jogar(estado({ maos: ["4c", "Kc"], descarte: "9c" }), carta("4c"));
  assert.ok(L.restaurar(JSON.parse(JSON.stringify(r))));
  assert.equal(L.restaurar({ ...JSON.parse(JSON.stringify(r)), rodadas: [{ vencedor: 1, ganhos: [0, 10] }], pontos: [0, 10] }), null, "o vencedor tem de estar sem cartas");
  const p = L.jogar(estado({ maos: ["4c", "Kc"], descarte: "9c", pontos: [95, 0], rodadas: [{ vencedor: 0, ganhos: [95, 0] }], rodada: 2 }), carta("4c"));
  assert.ok(L.restaurar(JSON.parse(JSON.stringify(p))));
  assert.equal(L.restaurar({ ...JSON.parse(JSON.stringify(p)), vencedor: 1 }), null);
}

// ---------- Estatísticas ----------
{
  let est = L.estatisticasVazias();
  assert.deepEqual(est, { jogadas: 0, vitorias: 0, rodadas: 0, sequencia: 0, melhorSequencia: 0 });
  est = L.registrarRodada(est);
  est = L.registrarRodada(est);
  assert.equal(est.rodadas, 2);
  est = L.registrarResultado(est, { venceu: true });
  est = L.registrarResultado(est, { venceu: true });
  assert.equal(est.jogadas, 2);
  assert.equal(est.vitorias, 2);
  assert.equal(est.sequencia, 2);
  assert.equal(est.melhorSequencia, 2);
  est = L.registrarResultado(est, { venceu: false });
  assert.equal(est.sequencia, 0, "a derrota (ou o abandono) zera a sequência");
  assert.equal(est.melhorSequencia, 2);
  assert.equal(L.porcentagemVitorias(est), 67);
  assert.equal(L.porcentagemVitorias(L.estatisticasVazias()), 0);
  assert.deepEqual(L.lerEstatisticas({ jogadas: 2, vitorias: 5, rodadas: -1, sequencia: "x", melhorSequencia: 1 }), {
    jogadas: 2,
    vitorias: 2,
    rodadas: 0,
    sequencia: 0,
    melhorSequencia: 1,
  });
  assert.deepEqual(L.lerEstatisticas(null), L.estatisticasVazias());
  assert.equal(L.formatarNumero(123456), "123.456");
}

console.log("oito-maluco: todos os testes passaram");
