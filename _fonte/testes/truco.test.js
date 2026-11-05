"use strict";
const assert = require("node:assert/strict");
const T = require("../../assets/jogos/truco-logica.js");

// Carta pelo nome: valor + naipe (o ouros, e espadas, c copas, p paus). Ex.: "4p", "Ae", "Qo", "7c".
const NAIPE = { o: 0, e: 1, c: 2, p: 3 };
function carta(nome) {
  const v = T.VALORES.indexOf(nome.slice(0, -1));
  assert.ok(v >= 0 && nome.slice(-1) in NAIPE, `carta ${nome}`);
  return NAIPE[nome.slice(-1)] * 10 + v;
}
const cs = (texto) => (texto ? texto.split(" ").map(carta) : []);

/**
 * Estado montado à mão: as mãos dos jogadores 0 a 3 por texto, a vira (Paulista), o placar e quem
 * começa. Não serve para restaurar (a mão não sai da semente), só para testar as regras.
 */
function montar({ modo = "paulista", maos, vira = "4o", placar = [0, 0], vez = 0, especial } = {}) {
  const e = T.novoJogo(modo, 7);
  e.placar = placar.slice();
  e.placarAntes = placar.slice();
  const m = e.mao;
  m.cartas = maos.map(cs);
  m.distribuidas = m.cartas.map((c) => c.slice());
  m.vira = modo === "paulista" ? carta(vira) : null;
  m.vez = vez;
  m.carteador = (vez + 3) % 4;
  const regras = T.REGRAS[modo];
  m.valor = regras.escada[0];
  m.especial = null;
  m.timeEspecial = null;
  m.decisao = false;
  if (especial === "onze") {
    m.especial = "onze";
    m.timeEspecial = placar[0] === regras.limiteEspecial ? 0 : 1;
    m.decisao = true;
    m.valor = regras.valorEspecial;
  } else if (especial === "ferro") {
    m.especial = "ferro";
    m.valor = T.PONTOS_JOGO - regras.limiteEspecial;
  }
  return e;
}

/** Joga em sequência: cada item é "carta" (do jogador da vez) ou "carta*" (coberta). */
function jogarVarias(e, lista) {
  for (const item of lista.split(" ")) {
    const coberta = item.endsWith("*");
    const id = carta(coberta ? item.slice(0, -1) : item);
    const n = T.jogar(e, e.mao.vez, id, coberta);
    assert.ok(n, `jogada ${item} do jogador ${e.mao.vez}`);
    e = n;
  }
  return e;
}

// ---------- Força das cartas: Paulista ----------
{
  const e = montar({ maos: ["4e 5e 6e", "7e Qe Je", "Ke Ae 2e", "3e 4c 5c"], vira: "4o" });
  const f = (nome) => T.forca(e, carta(nome));
  // Vira 4: manilha é o 5, e pelo naipe: paus > copas > espadas > ouros
  const ordem = "5p 5c 5e 5o 3o 2o Ao Ko Jo Qo 7o 6o 4o".split(" ");
  for (let i = 1; i < ordem.length; i++) assert.ok(f(ordem[i - 1]) > f(ordem[i]), `${ordem[i - 1]} > ${ordem[i]}`);
  assert.equal(f("3o"), f("3p"), "fora das manilhas, o naipe não importa");
  assert.equal(T.apelidoManilha(e, carta("5p")), "zap");
  assert.equal(T.apelidoManilha(e, carta("5o")), "pica-fumo");
  assert.equal(T.apelidoManilha(e, carta("3p")), null);
  assert.deepEqual(T.manilhasDaMao(e), cs("5p 5c 5e 5o"));
  // A manilha é o valor seguinte ao da vira, em ciclo: 4 5 6 7 Q J K A 2 3
  const seguinte = { "4o": "5", "7o": "Q", "Qo": "J", "Jo": "K", "Ko": "A", "Ao": "2", "2o": "3", "3o": "4" };
  for (const [vira, manilha] of Object.entries(seguinte)) assert.equal(T.VALORES[T.valorManilha(carta(vira))], manilha, `vira ${vira}`);
  // Com vira 3, o 4 de ouros vira manilha e passa o 3
  const v3 = montar({ maos: ["4e 5e 6e", "7e Qe Je", "Ke Ae 2e", "3e 4c 5c"], vira: "3o" });
  assert.ok(T.forca(v3, carta("4o")) > T.forca(v3, carta("3p")));
  assert.ok(T.ehManilha(v3, carta("4p")));
}

// ---------- Força das cartas: Mineiro ----------
{
  const e = montar({ modo: "mineiro", maos: ["4e 5e 6e", "7e Qe Je", "Ke Ae 2e", "3e 4c 5c"] });
  assert.equal(e.mao.vira, null, "o Mineiro não tem vira");
  const f = (nome) => T.forca(e, carta(nome));
  const ordem = "4p 7c Ae 7o 3o 2o Ac Ko Jo Qo 7e 6o 5o 4c".split(" ");
  for (let i = 1; i < ordem.length; i++) assert.ok(f(ordem[i - 1]) > f(ordem[i]), `${ordem[i - 1]} > ${ordem[i]}`);
  assert.equal(f("7e"), f("7p"), "os 7 pretos são cartas comuns");
  assert.equal(f("4c"), f("4o"), "os outros 4 são os mais fracos");
  assert.equal(f("Ac"), f("Ap"));
  assert.equal(T.apelidoManilha(e, carta("4p")), "zap");
  assert.equal(T.apelidoManilha(e, carta("Ae")), "espadilha");
  assert.equal(T.apelidoManilha(e, carta("7o")), "pica-fumo");
  assert.deepEqual(T.manilhasDaMao(e), cs("4p 7c Ae 7o"));
}

// ---------- Distribuição ----------
{
  for (const modo of T.MODOS) {
    const e = T.novoJogo(modo, 123);
    const m = e.mao;
    assert.equal(e.placar.join(), "0,0");
    for (const c of m.cartas) assert.equal(c.length, 3);
    const todas = [...m.cartas.flat(), ...(m.vira === null ? [] : [m.vira])];
    assert.equal(new Set(todas).size, todas.length, "nenhuma carta repetida");
    assert.ok(todas.every((id) => id >= 0 && id < 40));
    assert.equal(m.vira === null, modo === "mineiro");
    assert.equal(m.vez, (m.carteador + 1) % 4, "começa quem está à direita de quem deu");
    assert.equal(m.valor, T.valorBase(modo));
    assert.deepEqual(T.novoJogo(modo, 123).mao.cartas, m.cartas, "a mesma partida dá as mesmas cartas");
  }
  assert.notDeepEqual(T.novoJogo("paulista", 1).mao.cartas, T.novoJogo("paulista", 2).mao.cartas);
  // Quem dá as cartas passa para a direita a cada mão
  const c1 = T.carteadorDaMao(55, 1);
  assert.equal(T.carteadorDaMao(55, 2), (c1 + 1) % 4);
  assert.equal(T.carteadorDaMao(55, 5), c1);
  // Uma carta de cada vez, a partir de quem está à direita de quem dá
  const { maos } = T.distribuir("paulista", 9, 1, 2);
  assert.equal(maos.flat().length, 12);
}

// ---------- Vaza: quem ganha, empate e carta coberta ----------
{
  const jogadas = (lista) => lista.map(([jogador, nome, coberta]) => ({ jogador, carta: carta(nome), coberta: Boolean(coberta) }));
  const r1 = T.resolverVaza("paulista", carta("4o"), jogadas([[0, "3o"], [1, "2p"], [2, "Ae"], [3, "Kc"]]));
  assert.deepEqual(r1, { vencedor: 0, ganhador: 0, proximo: 0 });
  // Os dois maiores são da mesma dupla: a vaza é dela, e começa a próxima quem jogou primeiro
  const r2 = T.resolverVaza("paulista", carta("4o"), jogadas([[1, "3o"], [2, "Ke"], [3, "3p"], [0, "Ac"]]));
  assert.deepEqual(r2, { vencedor: 1, ganhador: 1, proximo: 1 });
  // Maiores iguais em duplas diferentes: empata; começa a próxima quem jogou primeiro a empatada
  const r3 = T.resolverVaza("paulista", carta("4o"), jogadas([[2, "Ko"], [3, "3e"], [0, "3c"], [1, "2p"]]));
  assert.deepEqual(r3, { vencedor: T.EMPATE, ganhador: null, proximo: 3 });
  // Manilha desempata pelo naipe
  const r4 = T.resolverVaza("paulista", carta("4o"), jogadas([[0, "5o"], [1, "5e"], [2, "3c"], [3, "2p"]]));
  assert.equal(r4.vencedor, 1);
  // Carta coberta não vale nada, nem empata
  const r5 = T.resolverVaza("paulista", carta("4o"), jogadas([[0, "3o", 1], [1, "4e"], [2, "6c"], [3, "7p"]]));
  assert.equal(r5.ganhador, 3);
  const r6 = T.resolverVaza("mineiro", null, jogadas([[0, "7o"], [1, "Ae"], [2, "7c"], [3, "3p"]]));
  assert.equal(r6.ganhador, 2, "no Mineiro, o 7 de copas ganha da espadilha");
}

// ---------- Mão: as regras de empate ----------
{
  const E = T.EMPATE;
  const casos = [
    [[0], null],
    [[0, 0], 0],
    [[1, 1], 1],
    [[0, 1], null],
    [[E, 1], 1, "empatou a 1ª: quem faz a 2ª leva"],
    [[E, 0], 0],
    [[1, E], 1, "empatou a 2ª: leva quem fez a 1ª"],
    [[E, E], null, "empatou a 1ª e a 2ª: a 3ª decide"],
    [[E, E, 0], 0],
    [[E, E, E], E, "as três empatadas: ninguém marca"],
    [[0, 1, 1], 1],
    [[1, 0, 0], 0],
    [[0, 1, E], 0, "empatou a 3ª: leva quem fez a 1ª"],
    [[1, 0, E], 1],
  ];
  for (const [vazas, esperado, texto] of casos) assert.equal(T.resultadoDasVazas(vazas), esperado, texto || JSON.stringify(vazas));
}

// ---------- Uma mão inteira, com a 2ª vaza empatada ----------
{
  // Vira 4 (manilha 5). Nós (0 e 2) contra Eles (1 e 3)
  let e = montar({ maos: ["3o Ko 6c", "2e Qe 7e", "Ae 7p 4c", "Ac 3p 4p"], vira: "4o" });
  e = jogarVarias(e, "3o 2e Ae Ac");
  assert.equal(e.mao.vazas[0].vencedor, 0, "o 3 ganha a 1ª");
  assert.equal(e.mao.vez, 0, "quem ganhou começa a próxima");
  e = jogarVarias(e, "Ko Qe 7p 3p");
  assert.equal(e.mao.vazas[1].vencedor, 1);
  assert.equal(e.mao.vez, 3);
  assert.equal(e.mao.resultado, null, "uma vaza para cada dupla: vai para a 3ª");
  e = jogarVarias(e, "4p 6c 7e 4c");
  assert.equal(e.mao.vazas[2].vencedor, 1, "o 7 de espadas de Eles ganha a 3ª");
  assert.deepEqual(e.mao.resultado, { vencedor: 1, pontos: 1, motivo: "vazas" });
  assert.deepEqual(e.placar, [0, 1]);
  assert.equal(T.jogar(e, e.mao.vez, e.mao.cartas[e.mao.vez][0]), null, "depois do fim da mão ninguém joga");

  // Fez a 1ª e empatou a 2ª: a mão acaba ali
  let f = montar({ maos: ["3o Ko 6c", "2e Kc 6e", "Ae 7p 4c", "Ac Ke 4p"], vira: "4o" });
  f = jogarVarias(f, "3o 2e Ae Ac");
  f = jogarVarias(f, "Ko Kc 7p Ke");
  assert.equal(f.mao.vazas[1].vencedor, T.EMPATE);
  assert.equal(f.mao.resultado.vencedor, 0, "quem fez a primeira ganha");
  assert.equal(f.mao.cartas[0].length, 1, "a 3ª vaza nem é jogada");

  // Empatou a 1ª: a 2ª decide, e começa quem jogou primeiro a carta empatada
  let g = montar({ maos: ["3o 6c 4c", "3e 7e 4e", "Ko 7p Qc", "Ac 6o Qe"], vira: "4o", vez: 0 });
  g = jogarVarias(g, "3o 3e Ko Ac");
  assert.equal(g.mao.vazas[0].vencedor, T.EMPATE);
  assert.equal(g.mao.vez, 0);
  g = jogarVarias(g, "6c 7e 7p 6o");
  assert.equal(g.mao.vazas[1].vencedor, T.EMPATE, "7 contra 7: empata de novo");
  assert.equal(g.mao.resultado, null, "empatou a 1ª e a 2ª: vai para a 3ª");
  assert.equal(g.mao.vez, 1, "quem jogou primeiro um dos 7 começa");
  g = jogarVarias(g, "4e Qc Qe 4c");
  assert.equal(g.mao.resultado.vencedor, T.EMPATE, "Q contra Q: as três empatadas");
  assert.equal(g.mao.resultado.pontos, 0);
  assert.deepEqual(g.placar, [0, 0], "ninguém marca");
  const seguinte = T.proximaMao(g);
  assert.equal(seguinte.numeroMao, 2);
  assert.equal(seguinte.mao.carteador, (T.carteadorDaMao(7, 1) + 1) % 4);
}

// ---------- Carta coberta ----------
{
  let e = montar({ maos: ["3o Ko 6c", "2e Qe 6e", "Ae 7p 4c", "Ac 3p 4p"], vira: "4o" });
  assert.equal(T.podeCobrir(e, 0), false, "na 1ª vaza não pode esconder");
  assert.equal(T.jogar(e, 0, carta("3o"), true), null);
  e = jogarVarias(e, "3o 2e Ae Ac");
  assert.equal(T.podeCobrir(e, 0), true, "da 2ª em diante pode");
  e = jogarVarias(e, "Ko* Qe 7p 3p");
  assert.equal(e.mao.vazas[1].vencedor, 1, "o Rei coberto não vale nada");
  const ferro = montar({ maos: ["3o Ko 6c", "2e Qe 6e", "Ae 7p 4c", "Ac 3p 4p"], placar: [11, 11], especial: "ferro" });
  const f2 = jogarVarias(ferro, "3o 2e Ae Ac");
  assert.equal(T.podeCobrir(f2, 0), false, "na mão de ferro não se esconde carta");
}

// ---------- Truco, seis, nove e doze (Paulista) ----------
{
  const base = montar({ maos: ["3o Ko 6c", "2e Qe 6e", "Ae 7p 4c", "Ac 3p 4p"], vira: "4o", vez: 0 });
  assert.equal(T.podePedir(base, 1), false, "só se pede truco na própria vez");
  assert.equal(T.podePedir(base, 0), true);
  let e = T.pedir(base, 0);
  assert.deepEqual(e.mao.pedido, { time: 0, jogador: 0, valor: 3, anterior: 1 });
  assert.equal(T.quemResponde(e), 1);
  assert.equal(T.jogar(e, 0, carta("3o")), null, "com pedido no ar ninguém joga");
  assert.equal(T.responder(e, 0, "aceitar"), null, "quem pediu não responde");
  // Correr do truco: quem pediu leva 1
  const correu = T.responder(e, 1, "correr");
  assert.deepEqual(correu.mao.resultado, { vencedor: 0, pontos: 1, motivo: "correu" });
  assert.deepEqual(correu.placar, [1, 0]);
  assert.equal(correu.trucosGanhos, 1, "mão trucada que Nós levou");
  // Aceitar: a mão vale 3 e a vez continua com quem pediu
  const aceitou = T.responder(e, 1, "aceitar");
  assert.equal(aceitou.mao.valor, 3);
  assert.equal(aceitou.mao.pedido, null);
  assert.equal(aceitou.mao.vez, 0);
  assert.equal(T.podePedir(aceitou, 0), false, "quem fez o último pedido não aumenta");
  let a2 = jogarVarias(aceitou, "3o");
  assert.equal(T.podePedir(a2, 1), true, "a outra dupla pode pedir seis na sua vez");
  a2 = T.pedir(a2, 1);
  assert.deepEqual(a2.mao.pedido, { time: 1, jogador: 1, valor: 6, anterior: 3 });
  // Aumentar: seis, nove, doze; correr dá o valor de antes do último pedido
  let s = T.responder(e, 1, "aumentar", 3);
  assert.deepEqual(s.mao.pedido, { time: 1, jogador: 3, valor: 6, anterior: 3 });
  assert.equal(s.mao.valor, 3, "aumentar já aceita o truco");
  assert.deepEqual(T.responder(s, 0, "correr").placar, [0, 3], "correu do seis: Eles levam 3");
  s = T.responder(s, 0, "aumentar", 2);
  assert.deepEqual(T.responder(s, 1, "correr").placar, [6, 0], "correu do nove: Nós levamos 6");
  s = T.responder(s, 1, "aumentar");
  assert.equal(s.mao.pedido.valor, 12);
  assert.equal(T.podeAumentar(s), false, "depois do doze não tem mais");
  assert.equal(T.responder(s, 0, "aumentar"), null);
  assert.deepEqual(T.responder(s, 0, "correr").placar, [0, 9], "correu do doze: Eles levam 9");
  const doze = T.responder(s, 0, "aceitar");
  assert.equal(doze.mao.valor, 12);
  assert.equal(T.podePedir(doze, 0), false);
  assert.equal(T.responder(e, 1, "aumentar", 2), null, "quem fala pelo aumento tem de ser da dupla");
  assert.equal(T.responder(e, 1, "talvez"), null);
  // Valendo 12, quem ganha a mão leva o jogo (a 3ª empata no 6 e a mão é de quem fez a 1ª)
  const fim = jogarVarias(doze, "3o 2e Ae Ac Ko Qe 7p 3p 4p 6c 6e 4c");
  assert.deepEqual(fim.mao.resultado, { vencedor: 0, pontos: 12, motivo: "vazas" });
  assert.deepEqual(fim.fim, { vencedor: 0 });
  assert.deepEqual(fim.placar, [12, 0]);
  assert.equal(T.proximaMao(fim), null, "acabou o jogo");
  assert.equal(T.pedir(fim, fim.mao.vez), null);
}

// ---------- Escada do Mineiro ----------
{
  const e = montar({ modo: "mineiro", maos: ["3o Ko 6c", "2e Qe 6e", "Ae 7p 4c", "Ac 3p 4p"], vez: 0 });
  assert.equal(e.mao.valor, 2, "a mão do Mineiro começa valendo 2");
  let s = T.pedir(e, 0);
  assert.deepEqual([s.mao.pedido.valor, s.mao.pedido.anterior], [4, 2]);
  assert.deepEqual(T.responder(s, 1, "correr").placar, [2, 0], "correu do truco: 2");
  s = T.responder(s, 1, "aumentar");
  assert.deepEqual([s.mao.pedido.valor, s.mao.pedido.anterior], [6, 4]);
  assert.deepEqual(T.responder(s, 0, "correr").placar, [0, 4]);
  s = T.responder(s, 0, "aumentar");
  assert.deepEqual([s.mao.pedido.valor, s.mao.pedido.anterior], [10, 6]);
  s = T.responder(s, 1, "aumentar");
  assert.deepEqual([s.mao.pedido.valor, s.mao.pedido.anterior], [12, 10]);
  assert.deepEqual(T.responder(s, 0, "correr").placar, [0, 10]);
  assert.deepEqual(["Truco", "Seis", "Dez", "Doze"], [4, 6, 10, 12].map((v) => T.nomePedido("mineiro", v)));
  assert.deepEqual(["Truco", "Seis", "Nove", "Doze"], [3, 6, 9, 12].map((v) => T.nomePedido("paulista", v)));
}

// ---------- Mão de onze, mão de dez e mão de ferro ----------
{
  // Paulista: Nós com 11
  const jogo = T.novoJogo("paulista", 31);
  const comOnze = { ...jogo, placar: [11, 7], placarAntes: [11, 7] };
  const mao = T.proximaMao({ ...comOnze, mao: { ...comOnze.mao, resultado: { vencedor: 0, pontos: 1, motivo: "vazas" } } }).mao;
  assert.equal(mao.especial, "onze");
  assert.equal(mao.timeEspecial, 0);
  assert.equal(mao.decisao, true);
  assert.equal(mao.valor, 3);
  const e = { ...comOnze, numeroMao: 2, mao };
  assert.equal(T.jogar(e, e.mao.vez, e.mao.cartas[e.mao.vez][0]), null, "antes de decidir ninguém joga");
  assert.equal(T.podePedir(e, e.mao.vez), false);
  const correu = T.decidirEspecial(e, false);
  assert.deepEqual(correu.placar, [11, 8], "correu da mão de onze: os outros ganham 1");
  assert.equal(correu.mao.resultado.motivo, "correu-especial");
  const jogou = T.decidirEspecial(e, true);
  assert.equal(jogou.mao.decisao, false);
  assert.equal(T.podePedir(jogou, jogou.mao.vez), false, "na mão de onze não tem truco");
  assert.equal(T.decidirEspecial(jogou, true), null);
  // Mão de onze jogada e ganha: 11 + 3 para em 12
  let m11 = montar({ maos: ["5p 5c 3o", "4e 6e 7e", "5e 3c 2o", "4c 6c 7o"], vira: "4o", placar: [11, 4], especial: "onze" });
  m11 = T.decidirEspecial(m11, true);
  m11 = jogarVarias(m11, "5p 4e 5e 4c 5c 6e 3c 6c");
  assert.deepEqual(m11.placar, [12, 4]);
  assert.deepEqual(m11.fim, { vencedor: 0 });
  // Perder a mão de onze dá 3 aos outros
  let p11 = montar({ maos: ["4e 6e 7e", "5p 5c 3o", "4c 6c 7o", "5e 3c 2o"], vira: "4o", placar: [11, 4], especial: "onze" });
  p11 = jogarVarias(T.decidirEspecial(p11, true), "4e 5p 4c 5e 5c 6c 3c 6e");
  assert.deepEqual(p11.placar, [11, 7]);

  // 11 x 11: mão de ferro, sem decisão e sem truco; quem ganhar leva o jogo
  const ferro = T.novoJogo("paulista", 40);
  const f = T.proximaMao({ ...ferro, placar: [11, 11], mao: { ...ferro.mao, resultado: { vencedor: 1, pontos: 1, motivo: "vazas" } } });
  assert.equal(f.mao.especial, "ferro");
  assert.equal(f.mao.decisao, false);
  assert.equal(T.podePedir(f, f.mao.vez), false);
  assert.equal(f.mao.valor, 1);
  let jf = f;
  while (!jf.mao.resultado) jf = T.jogar(jf, jf.mao.vez, T.escolherCarta(jf, jf.mao.vez).carta);
  if (jf.mao.resultado.vencedor === T.EMPATE) assert.equal(T.proximaMao(jf).mao.especial, "ferro", "empatou: outra mão de ferro");
  else assert.deepEqual(jf.fim, { vencedor: jf.mao.resultado.vencedor });

  // Mineiro: mão de dez vale 4; correr dá 2; 10 x 10 é mão de ferro
  const mj = T.novoJogo("mineiro", 50);
  const d = T.proximaMao({ ...mj, placar: [6, 10], mao: { ...mj.mao, resultado: { vencedor: 1, pontos: 2, motivo: "vazas" } } });
  assert.equal(d.mao.especial, "onze");
  assert.equal(d.mao.timeEspecial, 1);
  assert.equal(d.mao.valor, 4);
  assert.deepEqual(T.decidirEspecial(d, false).placar, [8, 10]);
  const d10 = T.proximaMao({ ...mj, placar: [10, 10], mao: { ...mj.mao, resultado: { vencedor: 1, pontos: 2, motivo: "vazas" } } });
  assert.equal(d10.mao.especial, "ferro");
  assert.equal(d10.mao.valor, 2);
  const d11 = T.proximaMao({ ...mj, placar: [8, 8], mao: { ...mj.mao, resultado: { vencedor: 1, pontos: 2, motivo: "vazas" } } });
  assert.equal(d11.mao.especial, null);
}

// ---------- Computador: escolha da carta ----------
{
  // Precisa ganhar: joga a menor que ganha
  let e = montar({ maos: ["2o Ko 5p", "3e Qe 6e", "Ae 7p 4c", "Jc 6p 4p"], vira: "4o", vez: 3 });
  e = jogarVarias(e, "Jc");
  assert.deepEqual(T.escolherCarta(e, 0), { carta: carta("Ko"), coberta: false }, "o Rei basta para ganhar do Valete");
  // O parceiro já ganha: descarta a mais fraca
  let p = montar({ maos: ["2o Ko 4o", "Qe 6e 7e", "3c 7p 4c", "Jc 6p 4p"], vira: "4o", vez: 2 });
  p = jogarVarias(p, "3c Jc");
  assert.deepEqual(T.escolherCarta(p, 0), { carta: carta("4o"), coberta: false });
  // Não dá para ganhar: empata se puder, senão descarta a mais fraca
  let n = montar({ maos: ["2o Ko 4o", "3e 6e 7e", "Ae 7p 4c", "Jc 6p 4p"], vira: "4o", vez: 1 });
  n = jogarVarias(n, "3e Ae Jc");
  assert.deepEqual(T.escolherCarta(n, 0), { carta: carta("4o"), coberta: false });
  let emp = montar({ maos: ["3o Ko 4o", "3e 6e 7e", "Ae 7p 4c", "Jc 6p 4p"], vira: "4o", vez: 1 });
  emp = jogarVarias(emp, "3e Ae Jc");
  assert.deepEqual(T.escolherCarta(emp, 0), { carta: carta("3o"), coberta: false }, "empatar a 1ª é melhor que perder");
  // Na mão de ferro, joga uma carta qualquer da mão
  const ferro = montar({ maos: ["3o Ko 4o", "3e 6e 7e", "Ae 7p 4c", "Jc 6p 4p"], placar: [11, 11], especial: "ferro" });
  assert.ok(T.podeJogar(ferro, 0, T.escolherCarta(ferro, 0).carta));
  // Mão fortíssima: pede truco; mão fraquíssima quase nunca pede
  const forte = montar({ maos: ["5p 5c 5e", "4e 6e 7e", "Ae 7p 4c", "Jc 6p 4p"], vira: "4o", vez: 0 });
  assert.ok(T.chanceDeGanhar(forte, 0) > 0.95);
  assert.equal(T.querPedir(forte, 0), true);
  const fraca = montar({ maos: ["4e 6e 7e", "5p 5c 5e", "Ae 7p 4c", "Jc 6p 4p"], vira: "4o", vez: 0 });
  assert.ok(T.chanceDeGanhar(fraca, 0) < 0.35);
  // E a resposta: com as três manilhas maiores, aumenta; sem nada, corre do truco
  const pedidoFraco = T.pedir(forte, 0);
  assert.equal(T.respostaDaIA(pedidoFraco, 1).resposta, "correr");
  const contra = montar({ maos: ["4e 6e 7e", "5p 5c 5e", "Ae 7p 4c", "Jc 6p 4p"], vira: "4o", vez: 0 });
  assert.equal(T.respostaDaIA(T.pedir(contra, 0), 1).resposta, "aumentar");
  // Quem pede não sabe as cartas dos outros: trocar as cartas escondidas não muda a decisão
  const a = montar({ maos: ["3o Ko 6c", "2e Qe 6e", "Ae 7p 4c", "Ac 3p 4p"], vira: "4o", vez: 0 });
  const b = montar({ maos: ["3o Ko 6c", "5p 5c 5e", "Ae 7p 4c", "Ac 3p 4p"], vira: "4o", vez: 0 });
  assert.equal(T.chanceDeGanhar(a, 0), T.chanceDeGanhar(b, 0));
  // Mão de onze do computador: com as seis cartas boas joga, com as seis ruins corre
  const boa = montar({ maos: ["4e 6e 7e", "5p 5c 3o", "4c 6c 7o", "5e 3c 2o"], vira: "4o", placar: [4, 11], especial: "onze" });
  assert.equal(T.decisaoEspecialDaIA(boa), true);
  const ruim = montar({ maos: ["5p 5c 3o", "4e 6e 7e", "5e 3c 2o", "4c 6c 7o"], vira: "4o", placar: [4, 11], especial: "onze" });
  assert.equal(T.decisaoEspecialDaIA(ruim), false);
}

// ---------- Partidas inteiras ----------

/** Jogador aleatório: carta qualquer, pede truco de vez em quando e responde no sorteio. */
function aleatorioJoga(e, aleatorio) {
  const m = e.mao;
  if (m.decisao) return T.decidirEspecial(e, aleatorio() < 0.5);
  if (m.pedido) {
    const opcoes = T.podeAumentar(e) ? ["aceitar", "correr", "aumentar"] : ["aceitar", "correr"];
    return T.responder(e, T.quemResponde(e), opcoes[Math.floor(aleatorio() * opcoes.length)]);
  }
  const j = m.vez;
  if (T.podePedir(e, j) && aleatorio() < 0.15) return T.pedir(e, j);
  const mao = m.cartas[j];
  const id = mao[Math.floor(aleatorio() * mao.length)];
  return T.jogar(e, j, id, T.podeCobrir(e, j) && aleatorio() < 0.1);
}

/** O computador joga pela dupla da vez. */
function computadorJoga(e) {
  const m = e.mao;
  if (m.decisao) return T.decidirEspecial(e, T.decisaoEspecialDaIA(e));
  if (m.pedido) {
    const { resposta, jogador } = T.respostaDaIA(e, T.quemResponde(e));
    return T.responder(e, T.quemResponde(e), resposta, resposta === "aumentar" ? jogador : null);
  }
  const j = m.vez;
  if (T.querPedir(e, j)) return T.pedir(e, j);
  const { carta: id, coberta } = T.escolherCarta(e, j);
  assert.ok(T.podeJogar(e, j, id, coberta), "o computador só faz jogada válida");
  return T.jogar(e, j, id, coberta);
}

/** Dupla que age agora: a da vez, a que responde ao pedido ou a da mão de onze. */
function timeQueAge(e) {
  const m = e.mao;
  if (m.decisao) return m.timeEspecial;
  if (m.pedido) return T.quemResponde(e);
  return T.timeDe(m.vez);
}

function conferirMao(e) {
  const m = e.mao;
  const jogadas = m.vazas.flatMap((v) => v.cartas.map((c) => c.carta));
  const todas = [...m.cartas.flat(), ...jogadas];
  assert.equal(todas.length, 12, "12 cartas na mão");
  assert.equal(new Set(todas).size, 12, "nenhuma carta repetida ou perdida");
  assert.deepEqual(new Set(todas), new Set(m.distribuidas.flat()));
  if (m.vira !== null) assert.ok(!todas.includes(m.vira), "a vira não vai para ninguém");
  for (let j = 0; j < 4; j++) {
    const deste = m.vazas.flatMap((v) => v.cartas.filter((c) => c.jogador === j).map((c) => c.carta));
    assert.deepEqual(new Set([...m.cartas[j], ...deste]), new Set(m.distribuidas[j]), "cada um só joga as próprias cartas");
  }
}

/** Uma partida até o fim; [jogadores][time] diz quem joga por cada dupla. */
function partida(modo, semente, jogadores, { conferir = false } = {}) {
  const aleatorio = T.aleatorioComSemente(semente * 7 + 1);
  let e = T.novoJogo(modo, semente);
  let somaPontos = [0, 0];
  let acoes = 0;
  let maos = 0;
  while (!e.fim) {
    if (e.mao.resultado) {
      const r = e.mao.resultado;
      if (r.vencedor !== T.EMPATE) somaPontos[r.vencedor] += r.pontos;
      e = T.proximaMao(e);
      maos += 1;
      continue;
    }
    const antes = e;
    e = jogadores[timeQueAge(e)] === "ia" ? computadorJoga(e) : aleatorioJoga(e, aleatorio);
    assert.ok(e, "jogada válida");
    if (conferir) {
      conferirMao(e);
      if (acoes % 7 === 0) assert.deepEqual(T.restaurar(JSON.parse(JSON.stringify(e))), e, "o estado salvo volta igual");
    }
    assert.ok(e.mao.acoes.length === antes.mao.acoes.length + 1, "cada jogada é uma ação");
    acoes += 1;
    assert.ok(acoes < 3000, "a partida termina");
  }
  const r = e.mao.resultado;
  somaPontos[r.vencedor] += r.pontos;
  assert.equal(Math.min(12, somaPontos[0]), e.placar[0], "os pontos das mãos somam o placar");
  assert.equal(Math.min(12, somaPontos[1]), e.placar[1]);
  assert.equal(e.placar[e.fim.vencedor], 12);
  assert.ok(e.placar[1 - e.fim.vencedor] < 12);
  if (modo === "mineiro") assert.ok(e.placar.every((p) => p % 2 === 0), "no Mineiro os pontos vêm de 2 em 2");
  return { vencedor: e.fim.vencedor, maos };
}

{
  const inicio = Date.now();
  // Computador contra computador, conferindo as cartas e o salvamento a cada passo
  for (const modo of T.MODOS) for (let s = 1; s <= 40; s++) partida(modo, s, ["ia", "ia"], { conferir: true });
  // Aleatório contra aleatório
  for (const modo of T.MODOS) for (let s = 1; s <= 150; s++) partida(modo, 1000 + s, ["rnd", "rnd"], { conferir: s <= 30 });
  // O computador contra um jogador aleatório, dos dois lados da mesa
  for (const modo of T.MODOS) {
    let vitorias = 0;
    const total = 200;
    for (let s = 1; s <= total / 2; s++) {
      if (partida(modo, 5000 + s, ["ia", "rnd"]).vencedor === 0) vitorias += 1;
      if (partida(modo, 6000 + s, ["rnd", "ia"]).vencedor === 1) vitorias += 1;
    }
    console.log(`${modo}: o computador ganhou ${vitorias} de ${total} partidas contra o jogador aleatório`);
    assert.ok(vitorias >= total * 0.75, "o computador ganha a maioria das partidas");
  }
  console.log(`partidas simuladas em ${Date.now() - inicio} ms`);
}

// ---------- Salvar e restaurar ----------
{
  let e = T.novoJogo("paulista", 777);
  // Avança até ter um pedido no ar no meio de uma mão
  const aleatorio = T.aleatorioComSemente(3);
  let guarda = 0;
  while (!(e.mao.pedido && e.mao.vazas.length) && guarda++ < 500) {
    if (e.mao.resultado) e = T.proximaMao(e);
    else e = aleatorioJoga(e, aleatorio);
    if (e.fim) e = T.novoJogo("paulista", 778 + guarda);
  }
  assert.ok(e.mao.pedido);
  e = { ...e, iniciado: true };
  const salvo = JSON.parse(JSON.stringify(e));
  assert.deepEqual(T.restaurar(salvo), e, "o estado volta igual");
  assert.equal(T.restaurar(salvo).iniciado, true);
  const estragar = (fn) => {
    const c = JSON.parse(JSON.stringify(e));
    fn(c);
    return T.restaurar(c);
  };
  assert.equal(estragar((c) => (c.mao.cartas[0][0] = (c.mao.cartas[0][0] + 1) % 40)), null, "carta trocada");
  assert.equal(estragar((c) => (c.placar[0] += 1)), null, "placar mexido");
  assert.equal(estragar((c) => (c.placarAntes = [12, 0])), null);
  assert.equal(estragar((c) => (c.mao.valor = 12)), null, "valor mexido");
  assert.equal(estragar((c) => c.mao.acoes.push(["jogar", 0, 5, 0])), null, "ação impossível");
  assert.equal(estragar((c) => c.mao.acoes.pop()), null, "ação faltando");
  assert.equal(estragar((c) => (c.mao.acoes[0] = ["voar"])), null);
  assert.equal(estragar((c) => (c.modo = "gaudério")), null);
  assert.equal(estragar((c) => (c.semente = 0)), null);
  assert.equal(estragar((c) => (c.numeroMao = 0)), null);
  assert.equal(estragar((c) => (c.mao.pedido = null)), null);
  assert.equal(estragar((c) => delete c.mao), null);
  assert.equal(T.restaurar(null), null);
  assert.equal(T.restaurar("texto"), null);
  // Um jogo recém-começado também volta
  const novo = T.novoJogo("mineiro", 12);
  assert.deepEqual(T.restaurar(JSON.parse(JSON.stringify(novo))), novo);
}

// ---------- Estatísticas ----------
{
  let est = T.estatisticasVazias();
  assert.deepEqual(est, { partidas: 0, vitorias: 0, sequencia: 0, melhorSequencia: 0, trucosGanhos: 0 });
  ({ estatisticas: est } = T.registrarResultado(est, { venceu: true, trucos: 2 }));
  let r = T.registrarResultado(est, { venceu: true, trucos: 1 });
  est = r.estatisticas;
  assert.equal(r.recordes.sequencia, true, "duas seguidas é nova maior sequência");
  assert.deepEqual(est, { partidas: 2, vitorias: 2, sequencia: 2, melhorSequencia: 2, trucosGanhos: 3 });
  ({ estatisticas: est } = T.registrarResultado(est, { venceu: false }));
  assert.deepEqual(est, { partidas: 3, vitorias: 2, sequencia: 0, melhorSequencia: 2, trucosGanhos: 3 });
  r = T.registrarResultado(est, { venceu: true });
  assert.equal(r.recordes.sequencia, false);
  assert.equal(T.porcentagemVitorias(r.estatisticas), 75);
  assert.equal(T.porcentagemVitorias(T.estatisticasVazias()), 0);
  assert.deepEqual(T.lerEstatisticas({ partidas: 2, vitorias: 9, sequencia: -1, melhorSequencia: "x", trucosGanhos: 4 }), {
    partidas: 2,
    vitorias: 2,
    sequencia: 0,
    melhorSequencia: 0,
    trucosGanhos: 4,
  });
  assert.deepEqual(T.lerEstatisticas(null), T.estatisticasVazias());
  assert.equal(T.formatarNumero(123456), "123.456");
}

console.log("truco: todos os testes passaram");
