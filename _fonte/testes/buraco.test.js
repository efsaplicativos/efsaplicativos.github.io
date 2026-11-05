"use strict";
const assert = require("node:assert/strict");
const B = require("../../assets/jogos/buraco-logica.js");

// Carta pelo nome: valor + naipe (e espadas, c copas, o ouros, p paus) e um ' para a carta do
// segundo baralho. Ex.: "Kc", "10e", "Ap", "2o'".
const NAIPE = { e: 0, c: 1, o: 2, p: 3 };
const VALOR = { A: 1, J: 11, Q: 12, K: 13 };
function carta(nome) {
  const segundo = nome.endsWith("'");
  const n = segundo ? nome.slice(0, -1) : nome;
  const v = VALOR[n.slice(0, -1)] || Number(n.slice(0, -1));
  return (segundo ? 52 : 0) + NAIPE[n.slice(-1)] * 13 + v - 1;
}
const cs = (texto) => (texto ? texto.split(" ").map(carta) : []);
const ordenado = (ids) => ids.slice().sort((a, b) => a - b);

/**
 * Estado montado à mão. Mãos, jogos, lixo e o topo do monte vêm por texto (o topo é a última carta).
 * As cartas que sobram formam os mortos (2, ou [mortos]) e o resto vai para o fundo do monte, ou para a
 * mão do computador com sobra: "pc".
 */
function estado(p = {}) {
  const maos = [cs(p.voce), cs(p.pc)];
  const jogos = [(p.jogosVoce || []).map((t) => B.analisarJogo(cs(t)).ordem), (p.jogosPc || []).map((t) => B.analisarJogo(cs(t)).ordem)];
  const lixo = cs(p.lixo);
  const topoMonte = cs(p.monte);
  const usadas = new Set([...maos.flat(), ...jogos.flat(2), ...lixo, ...topoMonte]);
  let resto = [...Array(104).keys()].filter((id) => !usadas.has(id));
  const mortos = [];
  for (let i = 0; i < (p.mortos === undefined ? 2 : p.mortos); i++) {
    mortos.push(resto.slice(0, 11));
    resto = resto.slice(11);
  }
  let monte = [...resto, ...topoMonte];
  if (p.sobra === "pc") {
    maos[1].push(...resto);
    monte = topoMonte;
  }
  return {
    versao: 1,
    modo: p.modo || "aberto",
    alvo: p.alvo || 3000,
    semente: 1,
    rodada: p.rodada || 1,
    inicial: 0,
    vez: p.vez === undefined ? 0 : p.vez,
    fase: p.fase || "jogar",
    maos,
    jogos,
    mortos,
    lixo,
    monte,
    pegouMorto: p.pegouMorto || [false, false],
    mortoIntocado: p.mortoIntocado || [false, false],
    ultimaVolta: Boolean(p.ultimaVolta),
    conhecidas: p.conhecidas ? p.conhecidas.map(cs) : [[], []],
    descartes: p.descartes ? p.descartes.map(cs) : [[], []],
    novaCarta: null,
    turnos: 0,
    resumo: null,
    placar: p.placar || [],
    totais: p.totais || [0, 0],
    vencedor: null,
    iniciado: true,
  };
}

function todasAsCartas(e) {
  return [...e.maos[0], ...e.maos[1], ...e.jogos[0].flat(), ...e.jogos[1].flat(), ...e.monte, ...e.lixo, ...e.mortos.flat()];
}

function conferirInvariantes(e) {
  const todas = todasAsCartas(e);
  assert.equal(todas.length, 104, "104 cartas no jogo");
  assert.equal(new Set(todas).size, 104, "nenhuma carta repetida");
  for (const lado of e.jogos) for (const jg of lado) assert.ok(B.jogoValido(jg), "todo jogo na mesa é válido");
  const soma = [0, 1].map((j) => e.placar.reduce((t, p) => t + p[j], 0));
  assert.deepEqual(soma, e.totais, "os totais são a soma das rodadas");
  assert.ok(B.restaurar(JSON.parse(JSON.stringify(e))), "o estado salvo volta igual");
}

// ---------- Cartas ----------
{
  assert.equal(B.CARTAS, 104);
  assert.equal(B.valor(carta("Ac")), 1);
  assert.equal(B.naipe(carta("Ac")), 1);
  assert.equal(B.naipe(carta("Ko'")), 2);
  assert.equal(carta("Ko'") - carta("Ko"), 52, "o segundo baralho é igual ao primeiro, 52 depois");
  assert.equal(B.nomeCarta(carta("Qp")), "Dama de paus");
  assert.equal(B.nomeCarta(carta("2e'")), "2 de espadas");
  const pontos = (n) => B.pontosCarta(carta(n));
  assert.deepEqual(["3c", "5c", "7c"].map(pontos), [5, 5, 5], "3 a 7 valem 5");
  assert.deepEqual(["8c", "10c", "Jc", "Qc", "Kc"].map(pontos), [10, 10, 10, 10, 10], "8 a Rei valem 10");
  assert.equal(pontos("Ae"), 15, "o Ás vale 15");
  assert.equal(pontos("2o"), 10, "o 2 vale 10");
  assert.equal(B.listarCartas(cs("5c 6c 7c")), "5, 6 e 7 de copas");
  assert.equal(B.listarCartas(cs("5c 2p")), "5 de copas e 2 de paus");
}

// ---------- Jogos: sequências, Ás, curingas ----------
{
  const a = (t) => B.analisarJogo(cs(t));
  assert.ok(a("3c 4c 5c").valido && a("3c 4c 5c").limpo, "3 cartas seguidas do mesmo naipe");
  assert.ok(a("5c 3c 4c").valido, "a ordem em que são escolhidas não importa");
  assert.deepEqual(a("5c 3c 4c").ordem, cs("3c 4c 5c"), "o jogo fica em ordem");
  assert.equal(a("3c 4c").motivo, "Um jogo precisa de pelo menos 3 cartas.");
  assert.equal(a("3c 4c 6c").motivo, B.MSG_SEQUENCIA, "falta o 5");
  assert.equal(a("3c 4e 5c").motivo, B.MSG_SEQUENCIA, "naipes diferentes");
  assert.match(a("7c 7e 7o").motivo, /trincas/, "trinca não vale");
  assert.match(a("7c 7e 2o").motivo, /trincas/, "nem com curinga");
  assert.match(a("5c 5c' 6c").motivo, /duas cartas iguais/);

  // Ás embaixo ou em cima, sem dar a volta
  assert.ok(a("Ac 2c 3c").limpo, "Ás-2-3 com o 2 do naipe no lugar é limpo");
  assert.ok(a("Qc Kc Ac").limpo, "Dama-Rei-Ás");
  assert.equal(a("Qc Kc Ac").fim, 14);
  assert.ok(!a("Kc Ac 3c").valido, "Rei-Ás-3 não dá a volta");
  assert.ok(a("Kc Ac 2c").valido && !a("Kc Ac 2c").limpo, "Rei-Ás com o 2 de copas: o 2 vira curinga no lugar da Dama");
  assert.equal(a("Kc Ac 2c").posicaoCuringa, 12);

  // Curinga: um 2 fora do lugar
  const sujo = a("3c 4c 2e");
  assert.ok(sujo.valido && !sujo.limpo, "2 de outro naipe é curinga");
  assert.equal(sujo.curinga, carta("2e"));
  assert.equal(sujo.posicaoCuringa, 5, "o curinga estica a ponta de cima");
  assert.equal(a("3c 5c 2e").posicaoCuringa, 4, "o curinga tapa o buraco");
  assert.match(a("3c 5c 2e 2p").motivo, /um curinga/, "dois curingas não valem");
  assert.match(a("3c 6c 2e").motivo, /Falta carta/, "um curinga só tapa um buraco");
  assert.ok(a("2c 3c 4c 2e").valido, "um 2 natural e um curinga no mesmo jogo");
  assert.ok(!a("2c 3c 4c 2e").limpo);
  assert.ok(a("2c 2c' 3c").valido && !a("2c 2c' 3c").limpo, "dois 2 do naipe: um natural, o outro curinga");
  assert.ok(!a("4c 5c 2c").limpo, "o 2 de copas longe do lugar dele é curinga");
  assert.ok(a("4c 5c 2c 3c").limpo, "com o 3, o 2 de copas volta para o lugar e o jogo fica limpo");
  assert.match(a("2c 2e 2o").motivo, /um curinga/);

  // O curinga muda de lugar quando chega a carta que ele substituía
  const comBuraco = a("5c 6c 2e 8c");
  assert.equal(comBuraco.posicaoCuringa, 7);
  const tapado = a("5c 6c 2e 8c 7c");
  assert.ok(tapado.valido);
  assert.equal(tapado.posicaoCuringa, 9, "o curinga passou para a ponta");

  // Canastras
  assert.equal(a("3c 4c 5c 6c 7c 8c").bonus, 0, "6 cartas ainda não é canastra");
  assert.equal(a("3c 4c 5c 6c 7c 8c 9c").bonus, 200, "canastra limpa: 200");
  assert.equal(a("3c 4c 5c 6c 7c 8c 2e").bonus, 100, "canastra suja: 100");
  assert.equal(B.tipoCanastra(cs("3c 4c 5c 6c 7c 8c 2e")), "suja");
  assert.equal(a("Ac 2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc").bonus, 500, "13 cartas limpas, de Ás a Rei: 500");
  assert.equal(a("Ac 2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc Ac'").bonus, 1000, "de Ás a Ás, limpa: 1000");
  assert.equal(B.tipoCanastra(cs("Ac 2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc Ac'")), "mil");
  assert.equal(a("Ac 2p 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc").bonus, 100, "de Ás a Rei com curinga é suja");
  assert.ok(!a("Ac 2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc Ac' 2e").valido, "não cabem 15 cartas");
  assert.equal(B.descreverJogo(cs("5c 6c 2e 8c")), "5 a 8 de copas, com o 2 de espadas no lugar do 7");
  assert.equal(B.descreverJogo(cs("Qc Kc Ac")), "Dama a Ás de copas");
  assert.equal(B.pontosDoJogo(cs("3c 4c 5c 6c 7c 8c 9c")), 5 * 5 + 10 * 2 + 200);
}

// ---------- Distribuição ----------
{
  const e = B.novoJogo("aberto", 3000, 42);
  assert.equal(e.maos[0].length, 11);
  assert.equal(e.maos[1].length, 11);
  assert.equal(e.mortos.length, 2);
  assert.ok(e.mortos.every((m) => m.length === 11));
  assert.equal(e.lixo.length, 1, "uma carta abre o lixo");
  assert.equal(e.monte.length, 59);
  assert.equal(e.vez, 0, "na primeira rodada você começa");
  assert.equal(e.fase, "comprar");
  conferirInvariantes(e);
  assert.deepEqual(B.novoJogo("aberto", 3000, 42), e, "a mesma semente dá a mesma partida");
  assert.notDeepEqual(B.novoJogo("aberto", 3000, 43).maos, e.maos);
  assert.equal(B.novoJogo("xyz", 7, 1).modo, B.MODO_PADRAO);
  assert.equal(B.novoJogo("xyz", 7, 1).alvo, B.ALVO_PADRAO);
  assert.equal(B.novaRodada(e), null, "só há nova rodada depois do fim de uma");
}

// ---------- A vez: comprar, baixar, descartar ----------
{
  const e = estado({ voce: "3c 4c 5c 9e Kp", pc: "6o 7o 8o 9o 10o", lixo: "Jo", monte: "Qe", fase: "comprar" });
  assert.match(B.motivoBaixar(e, cs("3c 4c 5c")), /Primeiro compre/);
  assert.match(B.motivoDescartar(e, carta("Kp")), /Primeiro compre/);
  const a = B.comprarMonte(e);
  assert.deepEqual(a.maos[0].slice(-1), cs("Qe"), "a carta de cima do monte vem para a mão");
  assert.equal(a.novaCarta, carta("Qe"));
  assert.equal(a.fase, "jogar");
  assert.equal(a.monte.length, e.monte.length - 1);
  assert.equal(B.comprarMonte(a), null, "só uma compra por vez");
  assert.match(B.motivoPegarLixo(a), /já comprou/);

  const b = B.baixarJogo(a, cs("5c 3c 4c"));
  assert.deepEqual(b.jogos[0], [cs("3c 4c 5c")]);
  assert.equal(b.maos[0].length, 3);
  assert.equal(B.baixarJogo(b, cs("9e Kp Qe")), null, "cartas soltas não formam jogo");
  assert.equal(B.motivoBaixar(b, cs("9e Kp Qe")), B.MSG_SEQUENCIA);
  assert.equal(B.baixarJogo(b, cs("6o 7o 8o")), null, "as cartas precisam ser da sua mão");

  const c = B.descartar(b, carta("Kp"));
  assert.deepEqual(c.lixo.slice(-1), cs("Kp"));
  assert.equal(c.vez, 1);
  assert.equal(c.fase, "comprar");
  assert.deepEqual(c.descartes[0], cs("Kp"));
  assert.equal(B.descartar(c, carta("9e")), null, "não é a sua vez");
  conferirInvariantes(c);

  // Pôr cartas nos seus jogos
  const d = estado({ voce: "6c 7c 8e 9e", jogosVoce: ["3c 4c 5c"], jogosPc: ["8c 9c 10c"] });
  const d2 = B.adicionar(d, 0, cs("7c 6c"));
  assert.deepEqual(d2.jogos[0][0], cs("3c 4c 5c 6c 7c"));
  assert.match(B.motivoAdicionar(d, 0, cs("8e")), /só entram cartas de copas/);
  assert.match(B.motivoAdicionar(d, 0, cs("7c")), /não continuam a sequência/);
  assert.match(B.motivoAdicionar(d, 3, cs("6c")), /não existe/);
  assert.deepEqual(B.jogosOndeCabe(d, cs("6c")), [0]);
  assert.deepEqual(B.jogosOndeCabe(d, cs("8e")), []);
}

// ---------- O lixo: aberto e fechado ----------
{
  const base = { voce: "5c 6c Ke Qp", pc: "3o 4o 9o 10o", lixo: "9e 7c", fase: "comprar" };
  const aberto = estado(base);
  const a = B.pegarLixo(aberto);
  assert.equal(a.lixo.length, 0, "leva o lixo inteiro");
  assert.equal(a.maos[0].length, 6);
  assert.deepEqual(ordenado(a.conhecidas[0]), ordenado(cs("9e 7c")), "as cartas do lixo ficam conhecidas");
  assert.equal(a.fase, "jogar");
  const juntos = B.pegarLixo(aberto, { cartas: cs("5c 6c"), jogo: null });
  assert.deepEqual(juntos.jogos[0], [cs("5c 6c 7c")], "pegar e baixar de uma vez");
  assert.deepEqual(juntos.conhecidas[0], cs("9e"), "a carta que desceu deixa de ser conhecida na mão");

  const fechado = estado({ ...base, modo: "fechado" });
  assert.equal(B.motivoPegarLixo(fechado), B.MSG_FECHADO, "no Fechado, a carta de cima precisa descer");
  assert.equal(B.pegarLixo(fechado), null);
  assert.match(B.motivoPegarLixo(fechado, { cartas: cs("Ke Qp"), jogo: null }), /não forma jogo/);
  assert.match(B.motivoPegarLixo(fechado, { cartas: cs("5c"), jogo: null }), /mais 2 cartas/);
  const f = B.pegarLixo(fechado, { cartas: cs("6c 5c"), jogo: null });
  assert.deepEqual(f.jogos[0], [cs("5c 6c 7c")]);
  assert.ok(f.maos[0].includes(carta("9e")), "o resto do lixo vai para a mão");
  assert.equal(B.usosDoLixo(fechado, cs("5c 6c")).length, 1);
  assert.deepEqual(B.usosDoLixo(fechado, []), [], "sem cartas escolhidas nem jogo onde encaixe, não dá");

  // A carta de cima pode entrar num jogo seu
  const noJogo = estado({ ...base, modo: "fechado", jogosVoce: ["8c 9c 10c"] });
  assert.deepEqual(B.usosDoLixo(noJogo, []), [{ cartas: [], jogo: 0 }]);
  const n = B.pegarLixo(noJogo, { cartas: [], jogo: 0 });
  assert.deepEqual(n.jogos[0][0], cs("7c 8c 9c 10c"));
  const comMao = B.pegarLixo(noJogo, { cartas: cs("6c 5c"), jogo: 0 });
  assert.deepEqual(comMao.jogos[0][0], cs("5c 6c 7c 8c 9c 10c"), "com cartas da mão junto");
  assert.match(B.motivoPegarLixo(estado({ ...base, lixo: "" })), /vazio/);
}

// ---------- Morto: batida direta e indireta ----------
{
  // Direta: baixa todas as cartas, pega o morto e continua jogando
  const e = estado({ voce: "3c 4c 5c", pc: "6o 7o 8o 9o", lixo: "Ke" });
  const morto = e.mortos[e.mortos.length - 1];
  const a = B.baixarJogo(e, cs("3c 4c 5c"));
  assert.ok(a.pegouMorto[0]);
  assert.ok(!a.mortoIntocado[0]);
  assert.deepEqual(a.maos[0], morto, "as 11 cartas do morto vêm para a mão");
  assert.equal(a.mortos.length, 1);
  assert.equal(a.vez, 0, "a vez continua");
  assert.equal(a.fase, "jogar");
  conferirInvariantes(a);

  // Indireta: descarta a última carta, pega o morto, mas a vez passa
  const i = estado({ voce: "3c 4c 5c Kp", pc: "6o 7o 8o 9o" });
  const i1 = B.baixarJogo(i, cs("3c 4c 5c"));
  assert.equal(i1.maos[0].length, 1, "com o morto na mesa, dá para ficar com 1 carta");
  const i2 = B.descartar(i1, carta("Kp"));
  assert.ok(i2.pegouMorto[0] && i2.mortoIntocado[0]);
  assert.equal(i2.maos[0].length, 11);
  assert.equal(i2.vez, 1, "o morto só é usado na próxima vez");
  conferirInvariantes(i2);
  // Quando a vez volta, o morto já é seu
  const i3 = B.descartar(B.comprarMonte(i2), i2.maos[1][0]);
  assert.ok(!i3.mortoIntocado[0]);

  // Cada um pega um morto só; o segundo morto fica para o outro
  const segundo = estado({ voce: "3c 4c 5c 6c Kp", pc: "6o 7o 8o 9o", pegouMorto: [true, false], mortos: 1 });
  assert.equal(B.temMortoParaPegar(segundo, 0), false);
  assert.equal(B.temMortoParaPegar(segundo, 1), true);
}

// ---------- Bater ----------
{
  // Sem canastra limpa, quem já pegou o morto guarda 2 cartas
  const semLimpa = estado({ voce: "3c 4c 5c Kp", pc: "6o 7o 8o 9o", pegouMorto: [true, false], mortos: 1, jogosVoce: ["3e 4e 5e 6e 7e 8e 2o"] });
  assert.match(B.motivoBaixar(semLimpa, cs("3c 4c 5c")), /canastra limpa/);
  assert.equal(B.podeBater(semLimpa, 0), false, "canastra suja não basta");

  // Com canastra limpa, descartar a última carta bate
  const limpa = estado({ voce: "3c 4c 5c Kp", pc: "6o 7o 8o 9o", pegouMorto: [true, false], mortos: 1, jogosVoce: ["3e 4e 5e 6e 7e 8e 9e"] });
  const l1 = B.baixarJogo(limpa, cs("3c 4c 5c"));
  assert.ok(l1, "pode ficar com 1 carta para bater");
  const l2 = B.descartar(l1, carta("Kp"));
  assert.equal(l2.fase, "fim");
  assert.equal(l2.resumo.bateu, 0);
  assert.equal(l2.resumo.linhas[0].bater, 100, "bater vale 100");
  conferirInvariantes(l2);

  // Ou baixar todas as cartas
  const l3 = B.baixarJogo(estado({ voce: "3c 4c 5c", pc: "6o 7o 8o 9o", pegouMorto: [true, false], mortos: 1, jogosVoce: ["3e 4e 5e 6e 7e 8e 9e"] }), cs("3c 4c 5c"));
  assert.equal(l3.fase, "fim");
  assert.equal(l3.resumo.bateu, 0);

  // A canastra limpa pode sair na mesma jogada que esvazia a mão
  const junto = estado({ voce: "9e 10e", pc: "6o 7o 8o 9o", pegouMorto: [true, false], mortos: 1, jogosVoce: ["3e 4e 5e 6e 7e 8e 2o"] });
  assert.match(B.motivoAdicionar(junto, 0, cs("9e 10e")), /canastra limpa/, "a canastra suja não deixa bater");
  const limpaNova = estado({ voce: "9e 10e", pc: "6o 7o 8o 9o", pegouMorto: [true, false], mortos: 1, jogosVoce: ["4e 5e 6e 7e 8e"] });
  const bateu = B.adicionar(limpaNova, 0, cs("9e 10e"));
  assert.equal(bateu.fase, "fim", "fechou a canastra limpa e bateu na mesma jogada");
  assert.equal(B.adicionar(junto, 0, cs("9e 10e")), null, "a canastra continua suja: não bate");

  // Os mortos acabaram e você não pegou nenhum: não pode ficar sem cartas
  const semMorto = estado({ voce: "3c 4c 5c Kp", pc: "6o 7o 8o 9o", pegouMorto: [false, true], mortos: 0, sobra: "pc", monte: "Qe Qo" });
  assert.match(B.motivoBaixar(semMorto, cs("3c 4c 5c")), /mortos acabaram/);
  assert.equal(B.podeEsvaziar(semMorto, 0), null);
}

// ---------- Fim do monte ----------
{
  // O monte acaba com morto na mesa: o morto vira o monte
  const e = estado({ voce: "3c 4c Kp", pc: "6o 7o 8o 9o", fase: "comprar", mortos: 1, sobra: "pc", monte: "Qe" });
  const a = B.comprarMonte(e);
  assert.equal(a.monte.length, 11, "o morto virou o monte");
  assert.equal(a.mortos.length, 0);
  assert.equal(a.ultimaVolta, false);
  conferirInvariantes(a);

  // Sem morto, a rodada acaba no fim desta vez
  const f = estado({ voce: "3c 4c 5c Kp", pc: "6o 7o 8o 9o", fase: "comprar", mortos: 0, sobra: "pc", monte: "Qe", pegouMorto: [true, false] });
  const f1 = B.comprarMonte(f);
  assert.ok(f1.ultimaVolta);
  assert.equal(f1.fase, "jogar", "ainda dá para baixar e descartar");
  const f2 = B.descartar(B.baixarJogo(f1, cs("3c 4c 5c")), carta("Kp"));
  assert.equal(f2.fase, "fim");
  assert.equal(f2.resumo.bateu, null, "ninguém bateu");
  const [voce, pc] = f2.resumo.linhas;
  assert.equal(voce.bater, 0);
  assert.equal(voce.cartasMesa, 15);
  assert.equal(voce.mao, -10, "a Dama que ficou na mão desconta");
  assert.equal(pc.morto, -100, "quem não pegou o morto perde 100");
  assert.equal(voce.morto, 0);
  conferirInvariantes(f2);
}

// ---------- Pontuação ----------
{
  const e = estado({
    voce: "",
    pc: "Ae 2o 9p",
    pegouMorto: [true, false],
    mortos: 1,
    jogosVoce: ["3e 4e 5e 6e 7e 8e 9e", "Jc Qc Kc 2p"],
    jogosPc: ["3o 4o 5o 6o 7o 8o 9o 10o", "4p 5p 6p"],
  });
  const [voce, pc] = B.contarPontos(e, 0);
  assert.equal(voce.cartasMesa, 5 * 5 + 10 * 2 + 30 + 10);
  assert.equal(voce.canastras, 200);
  assert.equal(voce.limpas, 1);
  assert.equal(voce.bater, 100);
  assert.equal(voce.mao, 0);
  assert.equal(voce.morto, 0);
  assert.equal(voce.total, 85 + 200 + 100);
  assert.equal(pc.cartasMesa, 5 * 5 + 10 * 3 + 15);
  assert.equal(pc.canastras, 200);
  assert.equal(pc.mao, -(15 + 10 + 10), "Ás 15, 2 10 e 9 10");
  assert.equal(pc.morto, -100);
  assert.equal(pc.total, 70 + 200 - 35 - 100);

  // Ninguém pegou o morto: ninguém perde os 100
  const ninguem = B.contarPontos(estado({ voce: "3c", pc: "4c" }), null);
  assert.equal(ninguem[0].morto, 0);
  assert.equal(ninguem[1].morto, 0);

  // O morto pego ao descartar e não usado conta como não pego, e as cartas dele não descontam
  const intocado = estado({ voce: "3c 4c 5c Kp", pc: "", pegouMorto: [true, true], mortoIntocado: [true, false], mortos: 0, sobra: "pc" });
  intocado.maos[1] = [];
  intocado.jogos[1] = [];
  const pts = B.contarPontos(intocado, 1);
  assert.equal(pts[0].mao, 0);
  assert.equal(pts[0].morto, -100);
}

// ---------- Fim da partida ----------
{
  const perto = estado({ voce: "3c 4c 5c Kp", pc: "6o 7o 8o 9o", pegouMorto: [true, false], mortos: 1, jogosVoce: ["3e 4e 5e 6e 7e 8e 9e"], totais: [2800, 2500], placar: [[2800, 2500]], rodada: 2 });
  const fim = B.descartar(B.baixarJogo(perto, cs("3c 4c 5c")), carta("Kp"));
  assert.equal(fim.fase, "acabou", "passou de 3.000: acabou a partida");
  assert.equal(fim.vencedor, 0);
  assert.equal(fim.placar.length, 2);
  conferirInvariantes(fim);
  assert.equal(B.novaRodada(fim), null);

  const meio = B.descartar(B.baixarJogo({ ...perto, totais: [0, 0], placar: [[0, 0]] }, cs("3c 4c 5c")), carta("Kp"));
  assert.equal(meio.fase, "fim");
  const proxima = B.novaRodada(meio);
  assert.equal(proxima.rodada, 3);
  assert.equal(proxima.inicial, 1, "quem não começou a rodada anterior começa a próxima");
  assert.equal(proxima.vez, 1);
  assert.deepEqual(proxima.totais, meio.totais);
  assert.equal(proxima.maos[0].length, 11);
  conferirInvariantes(proxima);

  // Empate acima do alvo: joga-se mais uma rodada
  const empate = { ...perto, totais: [2500, 2990], placar: [[2500, 2990]] };
  const e2 = B.descartar(B.baixarJogo(empate, cs("3c 4c 5c")), carta("Kp"));
  assert.equal(e2.totais[0], e2.totais[1]);
  assert.equal(e2.fase, "fim", "empatados, a partida continua");
}

// ---------- Computador ----------
{
  // Pega o lixo quando a carta de cima completa uma sequência
  const lixoBom = estado({ voce: "Kp Qo", pc: "5c 6c Je 3p 9o", lixo: "8e 7c", vez: 1, fase: "comprar" });
  assert.deepEqual(B.proximaAcao(lixoBom), { tipo: "lixo", uso: null });
  // Lixo inútil: compra do monte
  const lixoRuim = estado({ voce: "Kp Qo", pc: "5c 6c Je 3p 9o", lixo: "Ke", vez: 1, fase: "comprar" });
  assert.deepEqual(B.proximaAcao(lixoRuim), { tipo: "monte" });
  // No Fechado, diz como vai usar a carta de cima
  const fechado = { ...lixoBom, modo: "fechado" };
  const f = B.proximaAcao(fechado);
  assert.equal(f.tipo, "lixo");
  assert.deepEqual(ordenado(f.uso.cartas), ordenado(cs("5c 6c")));

  // Baixa a sequência e continua o jogo para chegar à canastra
  const baixa = estado({ voce: "Kp Qo", pc: "5c 6c 7c Je 3p 9o 10o", vez: 1, jogosPc: ["Jo Qo Ko"] });
  const b1 = B.proximaAcao(baixa);
  assert.equal(b1.tipo, "adicionar", "primeiro continua o jogo da mesa");
  assert.deepEqual(ordenado(b1.cartas), ordenado(cs("9o 10o")));

  // Não descarta o que encaixa nos jogos do outro nem o curinga
  const descarte = estado({ voce: "Kp Qo", pc: "7e Kc 2o 9o 4p", vez: 1, jogosVoce: ["4e 5e 6e"] });
  const d = B.proximaAcao(descarte);
  assert.equal(d.tipo, "descartar");
  assert.notEqual(d.carta, carta("7e"), "o 7 de espadas serve para o seu jogo");
  assert.notEqual(d.carta, carta("2o"), "não joga fora o curinga");
  // Evita a carta que forma sequência com as que você pegou do lixo
  const conhecidas = estado({ voce: "8c 9c Qo Ko", pc: "10c Kp Je 3o", vez: 1, conhecidas: ["8c 9c", ""] });
  assert.notEqual(B.proximaAcao(conhecidas).carta, carta("10c"));

  // Curinga numa canastra de 6 cartas só depois de ter uma limpa
  const seis = estado({ voce: "Kp Qo", pc: "2o Kc Ke Qe 9o 5p Jp", vez: 1, jogosPc: ["3c 4c 5c 6c 7c 8c"] });
  assert.equal(B.proximaAcao(seis).tipo, "descartar", "guarda o curinga para não sujar a canastra");
  const seisComLimpa = estado({ voce: "Kp Qo", pc: "2o Kc Ke Qe 9o", vez: 1, jogosPc: ["3c 4c 5c 6c 7c 8c", "3p 4p 5p 6p 7p 8p 9p"] });
  assert.deepEqual(B.proximaAcao(seisComLimpa), { tipo: "adicionar", jogo: 0, cartas: cs("2o") }, "com uma limpa, fecha a suja");

  // Bate quando está na frente
  const frente = estado({ voce: "Kp Qo 9o Je 3p", pc: "3c 4c 5c Ke", vez: 1, pegouMorto: [false, true], mortos: 1, jogosPc: ["3e 4e 5e 6e 7e 8e 9e"] });
  assert.ok(B.querBater(frente, 1));
  let x = frente;
  while (x.fase === "jogar" && x.vez === 1) x = B.aplicar(x, B.proximaAcao(x));
  assert.equal(x.fase, "fim");
  assert.equal(x.resumo.bateu, 1);
  // Atrás e sem pressa: segura as cartas para montar mais canastras
  const atras = estado({
    voce: "Kp Qo Je 9c 10c Qc Ac",
    pc: "3c 4c 5c Ke",
    vez: 1,
    pegouMorto: [true, true],
    mortos: 0,
    jogosPc: ["3e 4e 5e 6e 7e 8e 9e"],
    jogosVoce: ["3p' 4p' 5p' 6p' 7p' 8p' 9p' 10p' Jp' Qp' Kp'", "3o 4o 5o 6o 7o 8o 9o"],
  });
  assert.equal(B.querBater(atras, 1), false, "atrás nos pontos da rodada, com o monte cheio, não bate");
  let y = atras;
  while (y.fase === "jogar" && y.vez === 1) y = B.aplicar(y, B.proximaAcao(y));
  assert.equal(y.fase, "comprar", "baixou o que deu e passou a vez sem bater");
  assert.ok(y.maos[1].length >= 1);

  // A dica não espia: trocar as cartas escondidas não muda a decisão
  const partida = B.novoJogo("aberto", 3000, 77);
  let s = partida;
  for (let k = 0; k < 30 && !B.terminouRodada(s); k++) {
    const acao = B.proximaAcao(s);
    const j = s.vez;
    const o = 1 - j;
    const desconhecidas = s.maos[o].filter((id) => !s.conhecidas[o].includes(id));
    const escondidas = [...desconhecidas, ...s.monte, ...s.mortos.flat()];
    const embaralhadas = escondidas.slice().reverse();
    const outro = JSON.parse(JSON.stringify(s));
    let k2 = 0;
    outro.maos[o] = s.maos[o].map((id) => (s.conhecidas[o].includes(id) ? id : embaralhadas[k2++]));
    outro.monte = s.monte.map(() => embaralhadas[k2++]);
    outro.mortos = s.mortos.map((m) => m.map(() => embaralhadas[k2++]));
    assert.deepEqual(B.proximaAcao(outro), acao, "a decisão só depende do que o jogador vê");
    s = B.aplicar(s, acao);
  }
}

// ---------- Salvar e restaurar ----------
{
  let e = B.novoJogo("fechado", 1500, 9);
  for (let k = 0; k < 25; k++) e = B.aplicar(e, B.proximaAcao(e));
  const copia = JSON.parse(JSON.stringify(e));
  assert.deepEqual(B.restaurar(copia), e);
  assert.equal(B.restaurar(null), null);
  assert.equal(B.restaurar({ ...copia, versao: 2 }), null);
  assert.equal(B.restaurar({ ...copia, modo: "meio" }), null, "modo inválido");
  assert.equal(B.restaurar({ ...copia, alvo: 2000 }), null, "alvo inválido");
  assert.equal(B.restaurar({ ...copia, semente: 0 }), null);
  assert.equal(B.restaurar({ ...copia, fase: "dormir" }), null);
  assert.equal(B.restaurar({ ...copia, monte: [...copia.monte, copia.monte[0]] }), null, "carta repetida");
  assert.equal(B.restaurar({ ...copia, monte: copia.monte.slice(1) }), null, "carta perdida");
  const jogoRuim = JSON.parse(JSON.stringify(copia));
  jogoRuim.jogos[0].push(jogoRuim.monte.splice(0, 3));
  assert.equal(B.restaurar(jogoRuim), null, "jogo inválido na mesa");
  assert.equal(B.restaurar({ ...copia, totais: [5, 0] }), null, "os totais não batem com o placar");
  assert.equal(B.restaurar({ ...copia, conhecidas: [[copia.monte[0]], []] }), null, "carta conhecida fora da mão");
  assert.equal(B.restaurar({ ...copia, pegouMorto: [false, false], mortoIntocado: [true, false] }), null);
  const mortoCurto = JSON.parse(JSON.stringify(copia));
  mortoCurto.monte.push(mortoCurto.mortos[0].pop());
  assert.equal(B.restaurar(mortoCurto), null, "morto com menos de 11 cartas");
}

// ---------- Estatísticas ----------
{
  let est = B.estatisticasVazias();
  let r = B.registrarResultado(est, { venceu: true, pontos: 3200 });
  est = r.estatisticas;
  assert.equal(est.jogadas, 1);
  assert.equal(est.vitorias, 1);
  assert.equal(est.maiorPontuacao, 3200);
  assert.equal(r.recordes.pontos, false, "a primeira pontuação não é recorde");
  r = B.registrarResultado(est, { venceu: false, pontos: 3500 });
  est = r.estatisticas;
  assert.ok(r.recordes.pontos, "a maior pontuação vale mesmo numa derrota");
  assert.equal(est.sequencia, 0);
  est = B.registrarResultado(est, { venceu: true, pontos: 3100 }).estatisticas;
  est = B.registrarResultado(est, { venceu: true, pontos: 3050 }).estatisticas;
  assert.equal(est.melhorSequencia, 2);
  est = B.registrarResultado(est, { venceu: false }).estatisticas;
  assert.equal(est.jogadas, 5, "partida abandonada conta como jogada");
  assert.equal(est.maiorPontuacao, 3500);
  assert.equal(B.porcentagemVitorias(est), 60);
  assert.equal(B.porcentagemVitorias(B.estatisticasVazias()), 0);
  assert.deepEqual(B.lerEstatisticas({ jogadas: 2, vitorias: 5, maiorPontuacao: "x", sequencia: -1 }), {
    jogadas: 2,
    vitorias: 2,
    maiorPontuacao: null,
    sequencia: 0,
    melhorSequencia: 0,
  });
  assert.equal(B.formatarNumero(3000), "3.000");
  assert.equal(B.chaveModo("fechado", 1500), "fechado-1500");
}

// ---------- Partidas inteiras ----------

/** Jogador ao acaso, mas sempre dentro das regras. */
function jogadaAleatoria(e, sorteio) {
  const pick = (lista) => lista[Math.floor(sorteio() * lista.length)];
  const j = e.vez;
  if (e.fase === "comprar") {
    const opcoes = [{ tipo: "monte" }];
    if (e.lixo.length) {
      if (e.modo === "aberto") opcoes.push({ tipo: "lixo", uso: null });
      else for (const uso of B.usosPossiveisDoLixo(e, j)) opcoes.push({ tipo: "lixo", uso });
    }
    return pick(opcoes);
  }
  if (sorteio() < 0.6) {
    const opcoes = [];
    for (const seq of B.acharSequencias(e.maos[j])) opcoes.push({ tipo: "baixar", cartas: seq });
    e.jogos[j].forEach((_, i) => {
      for (const id of e.maos[j]) opcoes.push({ tipo: "adicionar", jogo: i, cartas: [id] });
    });
    for (let t = 0; t < 12; t++) {
      const mao = e.maos[j];
      if (mao.length < 3) break;
      const tres = new Set();
      while (tres.size < 3) tres.add(pick(mao));
      opcoes.push({ tipo: "baixar", cartas: [...tres] });
    }
    const legais = opcoes.filter((a) => !B.motivoAcao(e, a));
    if (legais.length) return pick(legais);
  }
  const descartes = e.maos[j].filter((id) => !B.motivoDescartar(e, id));
  return { tipo: "descartar", carta: pick(descartes) };
}

/** Joga uma partida inteira conferindo tudo pelo caminho; devolve o estado final. */
function jogarPartida(e, jogadores, sorteio) {
  let rodadas = 0;
  while (e.fase !== "acabou") {
    if (e.fase === "fim") {
      e = B.novaRodada(e);
      conferirInvariantes(e);
      continue;
    }
    rodadas += 1;
    let passos = 0;
    while (!B.terminouRodada(e)) {
      const acao = jogadores[e.vez](e, sorteio);
      assert.equal(B.motivoAcao(e, acao), null, `jogada legal: ${JSON.stringify(acao)}`);
      const n = B.aplicar(e, acao);
      assert.ok(n, "a jogada legal sempre vale");
      e = n;
      if (passos % 7 === 0) conferirInvariantes(e);
      passos += 1;
      assert.ok(passos < 4000, "a rodada termina");
    }
    conferirInvariantes(e);
    // A pontuação de cada lado é a soma das partes
    const r = e.resumo;
    for (const l of r.linhas) assert.equal(l.cartasMesa + l.canastras + l.bater + l.mao + l.morto, l.total);
    assert.deepEqual(e.placar[e.placar.length - 1], [r.linhas[0].total, r.linhas[1].total]);
    if (r.bateu !== null) {
      assert.equal(e.maos[r.bateu].length, 0, "quem bateu ficou sem cartas");
      assert.ok(e.pegouMorto[r.bateu] && B.temCanastraLimpa(e.jogos[r.bateu]), "bateu com morto e canastra limpa");
    }
    assert.ok(rodadas < 60, "a partida termina");
  }
  return e;
}

const computador = (e) => B.proximaAcao(e);
{
  const sorteio = B.aleatorioComSemente(11);
  // Computador contra computador, nos dois modos
  let rodadas = 0;
  for (let s = 1; s <= 8; s++) {
    const fim = jogarPartida(B.novoJogo(s % 2 ? "aberto" : "fechado", 1500, s), [computador, computador], sorteio);
    rodadas += fim.placar.length;
    assert.ok(Math.max(...fim.totais) >= 1500);
    assert.equal(fim.vencedor, fim.totais[0] > fim.totais[1] ? 0 : 1);
  }
  console.log(`computador x computador: 8 partidas até 1.500 em ${rodadas} rodadas`);

  // Computador contra um jogador que joga ao acaso
  let vitorias = 0;
  const partidas = 16;
  for (let s = 1; s <= partidas; s++) {
    const comoVoce = s % 2 === 0;
    const jogadores = comoVoce ? [computador, jogadaAleatoria] : [jogadaAleatoria, computador];
    const fim = jogarPartida(B.novoJogo(s % 4 < 2 ? "aberto" : "fechado", 1500, 100 + s), jogadores, sorteio);
    if (fim.vencedor === (comoVoce ? 0 : 1)) vitorias += 1;
  }
  console.log(`computador x jogadas ao acaso: ${vitorias} de ${partidas}`);
  assert.ok(vitorias >= partidas * 0.8, "o computador ganha quase sempre de quem joga ao acaso");

  // Ao acaso contra ao acaso: as regras se sustentam mesmo com jogadas estranhas
  for (let s = 1; s <= 4; s++) jogarPartida(B.novoJogo(s % 2 ? "aberto" : "fechado", 1500, 300 + s), [jogadaAleatoria, jogadaAleatoria], sorteio);
}

console.log("buraco: todos os testes passaram");
