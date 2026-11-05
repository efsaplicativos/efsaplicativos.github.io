"use strict";
const assert = require("node:assert/strict");
const M = require("../../assets/jogos/mico-logica.js");

// Carta pelo nome: valor + naipe (e espadas, c copas, o ouros, p paus). Ex.: "7c", "Qe", "Ap", "10o".
const NAIPE = { e: 0, c: 1, o: 2, p: 3 };
const VALOR = { A: 1, J: 11, Q: 12, K: 13 };
function carta(nome) {
  const v = VALOR[nome.slice(0, -1)] || Number(nome.slice(0, -1));
  return NAIPE[nome.slice(-1)] * 13 + v - 1;
}
const cs = (texto) => (texto ? texto.split(" ").map(carta) : []);

/**
 * Estado montado à mão: as mãos vêm por texto, uma por jogador ("" para quem já saiu). As cartas
 * que não estão em nenhuma mão descem para a mesa, em pares; por isso, toda carta das mãos (menos o
 * mico) precisa ter o parceiro em outra mão.
 */
function estado({ maos, vez = 0, saidas = null, jogadas = 0 }) {
  const lista = maos.map(cs);
  const nasMaos = new Set(lista.flat());
  const mesa = [];
  for (const id of M.BARALHO) {
    if (nasMaos.has(id) || mesa.includes(id)) continue;
    mesa.push(id, M.parceiro(id));
  }
  const e = {
    modo: maos.length,
    semente: 1,
    maos: lista,
    mesa,
    saidas: saidas || lista.reduce((s, mao, j) => (mao.length ? s : [...s, j]), []),
    vez,
    jogadas,
    iniciado: jogadas > 0,
  };
  assert.ok(M.restaurar(e), "a posição montada à mão é válida");
  return e;
}

/** Uma sequência que sempre devolve os mesmos números, para decidir onde a carta entra. */
const fixo = (...valores) => {
  let k = 0;
  return () => valores[k++ % valores.length];
};

function conferirInvariantes(e) {
  const todas = [...e.maos.flat(), ...e.mesa];
  assert.equal(todas.length, 51, "51 cartas no jogo");
  assert.equal(new Set(todas).size, 51, "nenhuma carta repetida");
  assert.ok(!todas.includes(M.RETIRADA), "a Dama de paus nunca entra");
  assert.ok(!e.mesa.includes(M.MICO), "o mico nunca desce para a mesa");
  for (const mao of e.maos) assert.equal(M.separarPares(mao).pares.length, 0, "nenhum par esquecido numa mão");
  for (let k = 0; k < e.mesa.length; k += 2) assert.ok(M.formaPar(e.mesa[k], e.mesa[k + 1]), "a mesa só tem pares");
  assert.deepEqual(e.maos[0], M.ordenarMinha(e.maos[0]), "a sua mão fica em ordem");
  assert.deepEqual(M.restaurar(JSON.parse(JSON.stringify(e))), e, "o estado salvo volta igual");
}

// ---------- Baralho e pares ----------
{
  assert.equal(M.BARALHO.length, 51);
  assert.equal(M.CARTAS, 51);
  assert.ok(!M.BARALHO.includes(carta("Qp")), "sem a Dama de paus");
  assert.equal(M.MICO, carta("Qe"), "o mico é a Dama de espadas");
  assert.equal(M.nomeCarta(M.MICO), "Dama de espadas");
  assert.equal(M.nomeCarta(carta("7c")), "7 de copas");
  assert.equal(M.nomeCarta(carta("Ao")), "Ás de ouros");
  assert.equal(M.artigoCarta(carta("Qc")), "a");
  assert.equal(M.artigoCarta(carta("7c")), "o");

  assert.ok(M.formaPar(carta("7c"), carta("7o")), "7 de copas com 7 de ouros: mesma cor");
  assert.ok(M.formaPar(carta("7e"), carta("7p")), "7 de espadas com 7 de paus");
  assert.ok(M.formaPar(carta("Qc"), carta("Qo")), "as Damas vermelhas formam par");
  assert.ok(M.formaPar(carta("Ko"), carta("Kc")), "a ordem não importa");
  assert.ok(!M.formaPar(carta("7c"), carta("7e")), "cores diferentes não formam par");
  assert.ok(!M.formaPar(carta("7c"), carta("7p")));
  assert.ok(!M.formaPar(carta("7c"), carta("8o")), "valores diferentes não formam par");
  assert.ok(!M.formaPar(carta("7c"), carta("7c")), "a mesma carta não forma par");
  for (const id of M.BARALHO) assert.ok(!M.formaPar(M.MICO, id), "o mico nunca forma par");
  assert.equal(M.parceiro(M.MICO), M.RETIRADA, "o par do mico seria a Dama de paus, que saiu");
  for (const id of M.BARALHO) {
    const parceiros = M.BARALHO.filter((outra) => M.formaPar(id, outra));
    assert.equal(parceiros.length, id === M.MICO ? 0 : 1, "cada carta tem um só parceiro");
  }
  assert.equal(M.textoModo(4), "4 jogadores");
  assert.equal(M.textoPosicao(2), "2º");
}

// ---------- Jogadores ----------
{
  for (const modo of M.MODOS) {
    const js = M.jogadores(modo, 77);
    assert.equal(js.length, modo);
    assert.equal(js[0].nome, "Você");
    assert.equal(new Set(js.map((j) => j.nome)).size, modo, "nomes diferentes");
    assert.ok(js.slice(1).every((j) => j.nome.length <= 5 && (j.artigo === "o" || j.artigo === "a")), "nomes curtos, com artigo");
    assert.deepEqual(M.jogadores(modo, 77), js, "a mesma partida tem os mesmos nomes");
  }
  const variados = new Set();
  for (let s = 1; s <= 30; s++) variados.add(M.jogadores(4, s)[1].nome);
  assert.ok(variados.size > 3, "os nomes mudam de uma partida para outra");
}

// ---------- Distribuição ----------
{
  const tamanhos = { 3: [17, 17, 17], 4: [13, 13, 13, 12], 5: [11, 10, 10, 10, 10] };
  for (const modo of M.MODOS) {
    for (let s = 1; s <= 20; s++) {
      const e = M.distribuir(modo, s);
      assert.equal(e.modo, modo);
      assert.equal(e.maos.length, modo);
      assert.ok(e.vez >= 0 && e.vez < modo);
      const todas = e.maos.flat();
      assert.equal(todas.length, 51);
      assert.equal(new Set(todas).size, 51);
      // As cartas saem uma por vez a partir de quem começa: os primeiros podem ter uma a mais
      const porOrdem = [...Array(modo).keys()].map((k) => e.maos[(e.vez + k) % modo].length);
      assert.deepEqual(porOrdem, tamanhos[modo], `distribuição com ${modo} jogadores`);
      assert.deepEqual(e.maos[0], M.ordenarMinha(e.maos[0]), "a sua mão chega em ordem");
      assert.deepEqual(M.distribuir(modo, s), e, "a mesma semente dá a mesma distribuição");
    }
  }
  assert.notDeepEqual(M.distribuir(4, 1).maos, M.distribuir(4, 2).maos);
  assert.equal(M.distribuir(9, 1).modo, M.MODO_PADRAO, "modo inválido vira o padrão");
  const primeiros = new Set();
  for (let s = 1; s <= 40; s++) primeiros.add(M.distribuir(4, s).vez);
  assert.equal(primeiros.size, 4, "quem começa muda de partida para partida");
}

// ---------- Pares iniciais ----------
{
  for (let s = 1; s <= 60; s++) {
    const modo = M.MODOS[s % 3];
    const dist = M.distribuir(modo, s);
    const { estado: e, pares } = M.descartarIniciais(dist);
    conferirInvariantes(e);
    assert.equal(e.mesa.length, pares.length * 2);
    assert.deepEqual(e.mesa, pares.flatMap((p) => p.cartas), "a mesa recebe os pares na ordem");
    for (const p of pares) {
      assert.ok(M.formaPar(...p.cartas));
      assert.ok(p.cartas.every((id) => dist.maos[p.jogador].includes(id)), "cada um baixa os pares da própria mão");
    }
    for (let j = 0; j < modo; j++) {
      assert.equal(e.maos[j].length + pares.filter((p) => p.jogador === j).length * 2, dist.maos[j].length);
    }
    assert.ok(e.maos[e.vez].length > 0, "a vez fica com quem tem cartas");
    assert.equal(e.jogadas, 0);
    assert.ok(!e.iniciado);
    assert.deepEqual(M.novoJogo(modo, s), e);
  }

  // Quem só recebeu pares sai antes de começar; a ordem das saídas começa por quem joga primeiro
  const montado = {
    modo: 4,
    semente: 1,
    maos: [cs("7c 7o"), cs("Qe 2c"), cs("5e 5p"), cs("2o 9e 9p")],
    mesa: [],
    saidas: [],
    vez: 2,
    jogadas: 0,
    iniciado: false,
  };
  const { estado: e, pares } = M.descartarIniciais(montado);
  assert.deepEqual(e.saidas, [2, 0], "saem os dois que ficaram sem cartas, a partir de quem começa");
  assert.equal(e.vez, 3, "a vez passa para o próximo que ainda tem cartas");
  assert.deepEqual(e.maos[3], cs("2o"), "a ordem das cartas que sobram não muda");
  assert.deepEqual(
    pares.map((p) => p.jogador),
    [2, 3, 0],
  );
  assert.equal(montado.maos[0].length, 2, "o estado de antes não muda");
}

// ---------- Tirar cartas ----------
{
  // Você tira do próximo jogador e forma um par
  const e = estado({ maos: ["7c Qe", "7o 3e", "3p"], vez: 0 });
  assert.equal(M.alvoDe(e, 0), 1, "você tira do jogador seguinte");
  assert.equal(M.quemTiraDe(e, 0), 2, "quem tira de você é o anterior");
  assert.equal(M.alvoDe(e, 2), 0, "o último tira de você");
  const r = M.tirar(e, 0);
  assert.equal(r.carta, carta("7o"));
  assert.equal(r.de, 1);
  assert.equal(r.quem, 0);
  assert.deepEqual(r.par, [carta("7c"), carta("7o")]);
  assert.deepEqual(r.estado.maos[0], [M.MICO]);
  assert.deepEqual(r.estado.maos[1], cs("3e"));
  assert.deepEqual(r.estado.mesa.slice(-2), [carta("7c"), carta("7o")], "o par desce para a mesa");
  assert.deepEqual(r.intermediario.maos[0], cs("7c 7o Qe"), "antes de descer, a carta entra na sua mão pela ordem");
  assert.equal(r.estado.vez, 1, "a vez passa para quem deu a carta");
  assert.equal(r.estado.jogadas, 1);
  assert.ok(r.estado.iniciado);
  assert.deepEqual(r.saidas, []);
  conferirInvariantes(r.estado);
  assert.deepEqual(e.maos[1], cs("7o 3e"), "o estado de antes não muda");

  // Sem par, a carta fica; o mico, que estava na ponta da direita, continua lá
  const s = M.tirar(e, 1);
  assert.equal(s.par, null);
  assert.deepEqual(s.estado.maos[0], cs("3e 7c Qe"));
  assert.deepEqual(s.estado.maos[1], cs("7o"));
  conferirInvariantes(s.estado);

  // Jogadas que não valem
  assert.equal(M.tirar(e, 2), null, "posição fora da mão");
  assert.equal(M.tirar(e, -1), null);
  assert.equal(M.tirar(e, 0.5), null);
  assert.equal(M.tirar(e, "0"), null);
}
{
  // Quem deu a última carta sai primeiro; quem formou o último par sai logo depois
  const e = estado({ maos: ["5c", "5o", "Qe"], vez: 0 });
  const r = M.tirar(e, 0);
  assert.deepEqual(r.saidas, [1, 0]);
  assert.deepEqual(r.estado.saidas, [1, 0]);
  assert.ok(M.terminou(r.estado), "sobrou um só jogador");
  assert.equal(M.perdedor(r.estado), 2, "quem sobrou ficou com o mico");
  assert.deepEqual(r.estado.maos[2], [M.MICO]);
  assert.equal(M.colocacao(r.estado, 1), 1);
  assert.equal(M.colocacao(r.estado, 0), 2);
  assert.equal(M.colocacao(r.estado, 2), null);
  assert.equal(M.tirar(r.estado, 0), null, "partida terminada não tem mais jogada");
  conferirInvariantes(r.estado);
}
{
  // Quem já saiu é pulado: você tira do jogador 2, e o 3 tira de você
  const e = estado({ maos: ["4c 8e", "", "4o", "Qe 8p"], vez: 0 });
  assert.deepEqual(e.saidas, [1]);
  assert.equal(M.alvoDe(e, 0), 2);
  assert.equal(M.quemTiraDe(e, 2), 0);
  assert.equal(M.alvoDe(e, 3), 0);
  const r = M.tirar(e, 0);
  assert.deepEqual(r.saidas, [2]);
  assert.deepEqual(r.estado.saidas, [1, 2]);
  assert.equal(r.estado.vez, 3, "o 2 saiu: a vez pula para o 3");
  assert.ok(!M.terminou(r.estado));
  assert.equal(M.alvoDe(r.estado, 3), 0);
  assert.deepEqual(M.ativos(r.estado), [0, 3]);
  conferirInvariantes(r.estado);
}
{
  // Um computador tira de você e põe a carta num lugar qualquer da mão dele
  const e = estado({ maos: ["6e Qe", "6p 2c", "2o"], vez: 2 });
  assert.equal(M.alvoDe(e, 2), 0);
  const r = M.tirar(e, 1, fixo(0));
  assert.equal(r.carta, M.MICO);
  assert.deepEqual(r.estado.maos[2], [M.MICO, carta("2o")], "entrou na primeira posição");
  assert.deepEqual(r.estado.maos[0], cs("6e"));
  assert.equal(M.comMico(r.estado), 2, "agora o mico está com ele");
  assert.equal(r.estado.vez, 0);
  const noFim = M.tirar(e, 1, fixo(0.99));
  assert.deepEqual(noFim.estado.maos[2], [carta("2o"), M.MICO], "ou na última");
  conferirInvariantes(r.estado);

  // O computador tira uma posição qualquer da mão do alvo
  for (let k = 0; k < 20; k++) {
    const p = M.escolhaDoComputador(e, fixo(k / 20));
    assert.ok(p === 0 || p === 1);
  }
  assert.equal(M.escolhaDoComputador(e, fixo(0.99)), 1);
}
{
  // Fim de jogo: quem tirou a última carta que faltava sai, e você fica com o mico
  const e = estado({ maos: ["Kc Qe", "", "Ko"], vez: 2 });
  const r = M.tirar(e, 0);
  assert.deepEqual(r.par.slice().sort(), cs("Kc Ko").sort());
  assert.deepEqual(r.estado.saidas, [1, 2]);
  assert.ok(M.terminou(r.estado));
  assert.equal(M.perdedor(r.estado), 0, "você ficou com o mico");
  assert.equal(r.estado.vez, 0);
  conferirInvariantes(r.estado);

  // Mas se ele tirar o mico, a partida continua, e a vez volta para você
  const m = M.tirar(e, 1, fixo(0.99));
  assert.equal(m.par, null);
  assert.deepEqual(m.estado.maos[2], [carta("Ko"), M.MICO]);
  assert.deepEqual(m.estado.maos[0], cs("Kc"));
  assert.equal(m.estado.vez, 0);
  assert.equal(M.alvoDe(m.estado, 0), 2);
  assert.ok(!M.terminou(m.estado));
  conferirInvariantes(m.estado);
  // E você pode tirar o Rei (e sair) ou o mico de volta
  const sai = M.tirar(m.estado, 0);
  assert.deepEqual(sai.estado.saidas, [1, 0]);
  assert.equal(M.perdedor(sai.estado), 2);
  const volta = M.tirar(m.estado, 1);
  assert.deepEqual(volta.estado.maos[0], cs("Qe Kc"), "o mico volta pela ordem");
  assert.equal(volta.estado.vez, 2);
}

// ---------- A sua mão: em ordem, com o mico onde você quiser ----------
{
  assert.deepEqual(M.ordenarMinha(cs("9c Qe 2e Ko")), cs("2e Qe 9c Ko"), "o mico fica no lugar; o resto em ordem");
  assert.deepEqual(M.ordenarMinha(cs("7o 7e")), cs("7e 7o"), "no mesmo valor, a preta vem antes");
  assert.deepEqual(M.ordenarMinha(cs("Kp Ac Qc")), cs("Ac Qc Kp"));
  assert.deepEqual(M.inserirNaMinha(cs("2e Qe 9c Ko"), carta("Ac")), cs("Ac Qe 2e 9c Ko"), "o mico não sai do lugar");
  assert.deepEqual(M.inserirNaMinha(cs("2e 9c Qe"), carta("Kc")), cs("2e 9c Kc Qe"), "na ponta da direita, continua na ponta");
  assert.deepEqual(M.inserirNaMinha(cs("Qe 2e 9c"), carta("Kc")), cs("Qe 2e 9c Kc"), "na ponta da esquerda, também");
  assert.deepEqual(M.inserirNaMinha(cs("2e Kc"), M.MICO), cs("2e Qe Kc"), "o mico chega pela ordem");
  assert.deepEqual(M.inserirNaMinha([], carta("5o")), cs("5o"));

  const e = estado({ maos: ["2e 9c Qe Kp", "2p 9o", "Ke"], vez: 1 });
  const movido = M.moverMico(e, 0);
  assert.deepEqual(movido.maos[0], cs("Qe 2e 9c Kp"));
  assert.deepEqual(M.moverMico(e, 99).maos[0], cs("2e 9c Kp Qe"), "posição além da ponta fica na ponta");
  assert.equal(M.moverMico(estado({ maos: ["2e", "2p Qe", ""] }), 0), null, "sem o mico, não há o que mover");
  conferirInvariantes(movido);
  for (let k = 0; k < 4; k++) {
    const emb = M.embaralharMinha(e, fixo(k / 4 + 0.01));
    assert.equal(emb.maos[0].indexOf(M.MICO), k, "embaralhar põe o mico num lugar qualquer");
    assert.deepEqual(
      emb.maos[0].filter((id) => id !== M.MICO),
      cs("2e 9c Kp"),
      "as outras continuam em ordem",
    );
  }
  const semMico = estado({ maos: ["2e 9c", "2p Qe 9o", ""] });
  assert.deepEqual(M.embaralharMinha(semMico).maos, semMico.maos);
  const comp = M.embaralharMao(e, 1, fixo(0));
  assert.deepEqual(comp.maos[1].slice().sort(), e.maos[1].slice().sort(), "o computador só muda a ordem");
}

// ---------- Salvar e restaurar ----------
{
  let e = M.novoJogo(4, 31);
  const sorteio = M.aleatorioComSemente(5);
  for (let k = 0; k < 6; k++) e = M.jogadaAleatoria(e, sorteio).estado;
  assert.deepEqual(M.restaurar(JSON.parse(JSON.stringify(e))), e);
  assert.equal(M.restaurar(null), null);
  assert.equal(M.restaurar("x"), null);
  assert.equal(M.restaurar({ ...e, modo: 6 }), null, "modo inválido");
  assert.equal(M.restaurar({ ...e, modo: 3 }), null, "modo diferente do número de mãos");
  assert.equal(M.restaurar({ ...e, semente: 0 }), null);
  assert.equal(M.restaurar({ ...e, jogadas: -1 }), null);
  assert.equal(M.restaurar({ ...e, vez: 9 }), null);
  const quebrar = (fn) => {
    const c = JSON.parse(JSON.stringify(e));
    fn(c);
    return M.restaurar(c);
  };
  const comCartas = e.maos.findIndex((m, j) => j > 0 && m.length > 0);
  assert.equal(
    quebrar((c) => c.maos[comCartas].push(c.maos[comCartas][0])),
    null,
    "carta repetida",
  );
  assert.equal(
    quebrar((c) => (c.maos[comCartas][0] = M.RETIRADA)),
    null,
    "a Dama de paus não entra",
  );
  assert.equal(
    quebrar((c) => c.maos[comCartas].push(...c.mesa.splice(0, 2))),
    null,
    "par esquecido numa mão",
  );
  assert.equal(
    quebrar((c) => ([c.mesa[1], c.mesa[2]] = [c.mesa[2], c.mesa[1]])),
    null,
    "a mesa só tem pares",
  );
  assert.equal(
    quebrar((c) => c.maos[comCartas].push(c.mesa.pop())),
    null,
    "meio par na mesa",
  );
  assert.equal(
    quebrar((c) => c.saidas.push(comCartas)),
    null,
    "quem tem cartas não saiu",
  );
  // A sua mão é posta em ordem ao restaurar (o mico fica onde estava)
  const fora = JSON.parse(JSON.stringify(e));
  fora.maos[0].reverse();
  const r = M.restaurar(fora);
  assert.ok(r);
  assert.deepEqual(r.maos[0], M.ordenarMinha(fora.maos[0]));
  // Uma partida montada à mão com jogadores que já saíram
  const saiu = estado({ maos: ["Kc Qe", "", "Ko"], vez: 2 });
  assert.ok(M.restaurar(saiu));
  assert.equal(M.restaurar({ ...saiu, saidas: [] }), null, "quem ficou sem cartas tem de estar nas saídas");
  assert.equal(M.restaurar({ ...saiu, saidas: [1, 1] }), null, "ninguém sai duas vezes");
  assert.equal(M.restaurar({ ...saiu, vez: 1 }), null, "quem saiu não tem mais a vez");
}

// ---------- Estatísticas ----------
{
  let est = M.estatisticasVazias();
  let r = M.registrarResultado(est, { escapou: true, posicao: 1 });
  est = r.estatisticas;
  assert.deepEqual(est, { partidas: 1, escapou: 1, primeiro: 1, sequencia: 1, melhorSequencia: 1 });
  assert.equal(r.recordes.sequencia, false, "a primeira sequência não é recorde");
  est = M.registrarResultado(est, { escapou: true, posicao: 3 }).estatisticas;
  assert.equal(est.primeiro, 1, "só conta o 1º lugar");
  assert.equal(est.sequencia, 2);
  est = M.registrarResultado(est, { escapou: false }).estatisticas;
  assert.equal(est.sequencia, 0, "pegar o mico zera a sequência");
  assert.equal(est.melhorSequencia, 2);
  for (let k = 0; k < 2; k++) est = M.registrarResultado(est, { escapou: true, posicao: 2 }).estatisticas;
  r = M.registrarResultado(est, { escapou: true, posicao: 2 });
  assert.ok(r.recordes.sequencia, "passou a maior sequência");
  est = r.estatisticas;
  assert.equal(est.melhorSequencia, 3);
  assert.equal(est.partidas, 6);
  assert.equal(est.escapou, 5);
  assert.equal(M.porcentagemEscapou(est), 83);
  assert.equal(M.porcentagemEscapou(M.estatisticasVazias()), 0);
  assert.deepEqual(M.lerEstatisticas({ partidas: 2, escapou: 5, primeiro: 9, sequencia: "x", melhorSequencia: -1 }), {
    partidas: 2,
    escapou: 2,
    primeiro: 2,
    sequencia: 0,
    melhorSequencia: 0,
  });
  assert.deepEqual(M.lerEstatisticas(null), M.estatisticasVazias());
  assert.equal(M.formatarNumero(12345), (12345).toLocaleString("pt-BR"));
}

// ---------- Partidas ao acaso ----------
{
  const sorteio = M.aleatorioComSemente(2024);
  const perdeu = { 3: 0, 4: 0, 5: 0 };
  const partidas = 600;
  let tiradas = 0;
  for (let p = 1; p <= partidas; p++) {
    const modo = M.MODOS[p % 3];
    let e = M.novoJogo(modo, p);
    conferirInvariantes(e);
    let passos = 0;
    while (!M.terminou(e)) {
      const antes = e;
      const alvo = M.alvoDe(e, e.vez);
      assert.notEqual(alvo, null, "quem está na vez tem de quem tirar");
      assert.notEqual(alvo, e.vez);
      const r = M.jogadaAleatoria(e, sorteio);
      assert.ok(r, "sempre há jogada enquanto a partida não acaba");
      e = r.estado;
      // Só jogadas legais: uma carta passou do alvo para quem estava na vez
      assert.equal(r.de, alvo);
      assert.equal(r.quem, antes.vez);
      assert.ok(antes.maos[alvo].includes(r.carta));
      assert.ok(!e.maos[alvo].includes(r.carta));
      const cartas = (x) => x.maos.flat().length;
      assert.equal(cartas(e), cartas(antes) - (r.par ? 2 : 0), "só um par sai de cada vez");
      if (r.par) assert.ok(r.par.includes(r.carta) && M.formaPar(...r.par));
      else assert.ok(e.maos[r.quem].includes(r.carta));
      if (!M.terminou(e)) assert.ok(e.maos[e.vez].length > 0, "a vez fica com quem tem cartas");
      conferirInvariantes(e);
      passos += 1;
      assert.ok(passos < 5000, "a partida termina");
    }
    tiradas += passos;
    const ultimo = M.perdedor(e);
    assert.deepEqual(e.maos[ultimo], [M.MICO], "quem sobra fica só com o mico");
    assert.equal(e.saidas.length, modo - 1, "todos os outros saíram");
    assert.deepEqual([...e.saidas, ultimo].sort(), [...Array(modo).keys()], "cada jogador tem um lugar");
    assert.equal(e.mesa.length, 50, "os 25 pares estão na mesa");
    assert.equal(e.jogadas, passos);
    if (ultimo === 0) perdeu[modo] += 1;
  }
  // Jogando ao acaso, você fica com o mico mais ou menos uma vez a cada [modo] partidas
  for (const modo of M.MODOS) {
    const taxa = perdeu[modo] / (partidas / 3);
    assert.ok(taxa > 0.5 / modo && taxa < 1.8 / modo, `com ${modo} jogadores, você pega o mico ${perdeu[modo]} vezes`);
  }
  console.log(`partidas ao acaso: ${partidas}, média de ${Math.round(tiradas / partidas)} cartas tiradas por partida`);

  // Jogar até o fim de uma vez dá o mesmo tipo de final
  const fim = M.jogarAteOFim(M.novoJogo(5, 99), M.aleatorioComSemente(3));
  assert.ok(M.terminou(fim));
  assert.deepEqual(fim.maos[M.perdedor(fim)], [M.MICO]);
}

console.log("mico: todos os testes passaram");
