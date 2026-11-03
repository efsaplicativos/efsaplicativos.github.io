"use strict";
// Testes do Marcador de Truco: os mesmos casos de RegrasTrucoTest.kt e EstadoJsonTest.kt do app.
// Rode com: node _fonte/testes/marcador-de-truco.test.js
const assert = require("node:assert/strict");
const T = require("../../assets/ferramentas/marcador-de-truco-logica.js");

let total = 0;
function teste(nome, corpo) {
  corpo();
  total++;
  console.log(`ok - ${nome}`);
}

const inicio = (formato = "MELHOR_DE_3") => T.iniciar(T.estadoInicial(), "mesa-1", ["Nós", "Eles"], formato);
const marcar = (e, dupla, pontos) => T.marcar(e, dupla, pontos, 1000);
const ajustar = (e, dupla, delta) => T.ajustar(e, dupla, delta, 1000);
const valor = (e, v) => T.escolherValor(e, v);
const marcarMao = (e, dupla) => T.marcarMao(e, dupla, 1000);
const progresso = (e) => e.mesa.progresso;

function partidasConcluidas(quantidade) {
  let estado = inicio("LIVRE");
  for (let partida = 1; partida <= quantidade; partida++) {
    estado = marcar(estado, 0, 12);
    if (partida < quantidade) estado = T.proximaPartida(estado);
  }
  return estado;
}

// ---------- RegrasTrucoTest ----------

teste("placar nunca passa de 12 e a vitória é registrada uma vez só", () => {
  const nove = marcar(inicio(), 0, 9);
  const venceu = marcar(nove, 0, 6);
  assert.deepEqual(progresso(venceu).placar, [12, 0]);
  assert.deepEqual(progresso(venceu).vitorias, [1, 0]);
  assert.equal(progresso(venceu).vencedor, 0);
  assert.equal(venceu.historico.length, 1);
  assert.equal(marcar(venceu, 0, 1), venceu);
  assert.equal(marcar(venceu, 1, 3), venceu);
  assert.equal(ajustar(venceu, 1, 1), venceu);
});

teste("truco aos 11 fecha em 12", () => {
  const onze = ajustar(marcar(marcar(inicio(), 1, 9), 1, 1), 1, 1);
  assert.equal(progresso(onze).placar[1], 11);
  const fim = marcarMao(valor(onze, 3), 1);
  assert.equal(progresso(fim).placar[1], 12);
  assert.equal(progresso(fim).vencedor, 1);
});

teste("não permite pontuação negativa nem valores inválidos", () => {
  const estado = inicio();
  assert.equal(ajustar(estado, 0, -1), estado);
  assert.equal(marcar(estado, 0, 100), estado);
  assert.equal(marcar(estado, 0, 2), estado);
  assert.equal(marcar(estado, 0, -1), estado);
  assert.equal(ajustar(estado, 0, 3), estado);
  assert.equal(marcar(estado, 2, 3), estado);
  assert.equal(valor(estado, 4), estado);
  assert.deepEqual(progresso(ajustar(marcar(estado, 0, 3), 0, -1)).placar, [2, 0]);
});

teste("marcar mão usa o valor selecionado e volta para mão simples", () => {
  const estado = marcarMao(valor(inicio(), 6), 0);
  assert.deepEqual(progresso(estado).placar, [6, 0]);
  assert.equal(progresso(estado).valorMao, 1);
});

teste("ajuste de um ponto mantém o valor da mão selecionado", () => {
  const estado = ajustar(ajustar(ajustar(valor(inicio(), 3), 0, 1), 1, 1), 1, -1);
  assert.deepEqual(progresso(estado).placar, [1, 0]);
  assert.equal(progresso(estado).valorMao, 3);
});

teste("valor da mão não muda depois da vitória", () => {
  const venceu = marcar(inicio(), 0, 12);
  assert.equal(valor(venceu, 3), venceu);
});

teste("desfazer vitória restaura placar, valor da mão e histórico", () => {
  const estado = valor(marcar(inicio(), 1, 9), 6);
  const desfeito = T.desfazer(marcarMao(estado, 1));
  assert.deepEqual(progresso(desfeito).placar, [0, 9]);
  assert.deepEqual(progresso(desfeito).vitorias, [0, 0]);
  assert.equal(progresso(desfeito).valorMao, 6);
  assert.equal(progresso(desfeito).vencedor, null);
  assert.equal(desfeito.historico.length, 0);
});

teste("desfazer volta uma jogada por vez e, sem jogadas, não faz nada", () => {
  const estado = inicio();
  const tres = ajustar(marcar(marcar(estado, 0, 3), 1, 1), 0, 1);
  assert.deepEqual(progresso(T.desfazer(tres)).placar, [3, 1]);
  assert.deepEqual(progresso(T.desfazer(T.desfazer(tres))).placar, [3, 0]);
  assert.deepEqual(progresso(T.desfazer(T.desfazer(T.desfazer(tres)))).placar, [0, 0]);
  assert.equal(T.desfazer(estado), estado);
});

teste("pilha de desfazer tem limite", () => {
  let estado = inicio();
  for (let i = 0; i < T.LIMITE_DESFAZER + 30; i++) estado = ajustar(ajustar(estado, 0, 1), 0, -1);
  assert.equal(estado.mesa.desfazer.length, T.LIMITE_DESFAZER);
});

teste("próxima partida mantém vitórias e pode ser desfeita", () => {
  const venceu = marcar(inicio(), 0, 12);
  const proxima = T.proximaPartida(venceu);
  assert.deepEqual(progresso(proxima).placar, [0, 0]);
  assert.deepEqual(progresso(proxima).vitorias, [1, 0]);
  assert.equal(progresso(proxima).numeroPartida, 2);
  assert.equal(progresso(proxima).valorMao, 1);
  assert.deepEqual(progresso(T.desfazer(proxima)), progresso(venceu));
  // Só depois de alguém vencer
  assert.equal(T.proximaPartida(proxima), proxima);
});

teste("disputa termina com o número certo de vitórias", () => {
  for (const [formato, vitorias] of [["UNICA", 1], ["MELHOR_DE_3", 2], ["MELHOR_DE_5", 3]]) {
    let estado = inicio(formato);
    for (let indice = 0; indice < vitorias; indice++) {
      estado = marcar(estado, 1, 12);
      if (indice < vitorias - 1) {
        assert.equal(T.campeao(estado.mesa), null, formato);
        estado = T.proximaPartida(estado);
      }
    }
    assert.equal(T.campeao(estado.mesa), 1, formato);
    assert.equal(T.proximaPartida(estado), estado, formato);
    assert.equal(estado.historico.length, vitorias, formato);
  }
});

teste("jogo livre não tem campeão e os resultados guardam os nomes da época", () => {
  const venceu = marcar(inicio("LIVRE"), 0, 12);
  const renomeado = T.renomear(venceu, ["  Zap  ", ""]);
  assert.deepEqual(renomeado.mesa.duplas, ["Zap", "Eles"]);
  assert.deepEqual(renomeado.historico[0].duplas, ["Nós", "Eles"]);
  assert.equal(T.campeao(renomeado.mesa), null);
  assert.deepEqual(progresso(T.proximaPartida(renomeado)).placar, [0, 0]);
});

teste("zerar é reversível e não apaga resultados", () => {
  let estado = T.proximaPartida(marcar(inicio(), 0, 12));
  estado = marcar(estado, 1, 6);
  const zerado = T.zerarPlacar(estado);
  assert.deepEqual(progresso(zerado).placar, [0, 0]);
  assert.equal(zerado.historico.length, 1);
  assert.deepEqual(progresso(T.desfazer(zerado)), progresso(estado));
  assert.equal(T.zerarPlacar(zerado), zerado);
  const terminada = marcar(inicio(), 0, 12);
  assert.equal(T.zerarPlacar(terminada), terminada);
});

teste("mão de 11 e mão de ferro", () => {
  const onze = ajustar(marcar(marcar(inicio(), 0, 9), 0, 1), 0, 1);
  assert.equal(T.duplaNaMaoDeOnze(progresso(onze)), 0);
  assert.equal(T.emMaoDeFerro(progresso(onze)), false);

  const ferro = ajustar(marcar(marcar(onze, 1, 9), 1, 1), 1, 1);
  assert.equal(T.duplaNaMaoDeOnze(progresso(ferro)), null);
  assert.equal(T.emMaoDeFerro(progresso(ferro)), true);

  // Correram da mão de 11: o adversário ganha 1 ponto
  const correram = marcar(onze, 1, 1);
  assert.deepEqual(progresso(correram).placar, [11, 1]);
  const fim = marcar(ferro, 0, 1);
  assert.equal(T.duplaNaMaoDeOnze(progresso(fim)), null);
  assert.equal(T.emMaoDeFerro(progresso(fim)), false);
});

teste("histórico guarda no máximo 50 e o desfazer recupera o que saiu", () => {
  const estado = partidasConcluidas(51);
  assert.equal(estado.historico.length, T.LIMITE_HISTORICO);
  assert.equal(estado.historico[0].id, "mesa-1-51");
  assert.equal(estado.historico.at(-1).id, "mesa-1-2");
  const desfeito = T.desfazer(estado);
  assert.deepEqual(progresso(desfeito).vitorias, [50, 0]);
  assert.equal(desfeito.historico.length, T.LIMITE_HISTORICO);
  assert.equal(desfeito.historico[0].id, "mesa-1-50");
  assert.equal(desfeito.historico.at(-1).id, "mesa-1-1");
});

teste("excluir um resultado preserva placar e vitórias", () => {
  const estado = partidasConcluidas(3);
  const excluido = T.excluirResultado(estado, "mesa-1-2");
  assert.deepEqual(excluido.historico.map((r) => r.id), ["mesa-1-3", "mesa-1-1"]);
  assert.deepEqual(progresso(excluido), progresso(estado));
});

teste("excluir funciona sem mesa ativa", () => {
  const estado = { ...partidasConcluidas(2), mesa: null };
  assert.deepEqual(T.excluirResultado(estado, "mesa-1-1").historico.map((r) => r.id), ["mesa-1-2"]);
  assert.equal(T.limparHistorico(estado).historico.length, 0);
});

teste("limpar o histórico não traz registros de volta ao desfazer", () => {
  const estado = partidasConcluidas(52);
  let limpo = T.limparHistorico(estado);
  assert.equal(limpo.historico.length, 0);
  assert.deepEqual(progresso(limpo), progresso(estado));
  while (limpo.mesa.desfazer.length > 0) {
    limpo = T.desfazer(limpo);
    assert.equal(limpo.historico.length, 0);
  }
});

teste("a exclusão remove também a cópia guardada para o desfazer", () => {
  const estado = partidasConcluidas(51);
  const desfeito = T.desfazer(T.excluirResultado(estado, "mesa-1-1"));
  assert.equal(desfeito.historico.some((r) => r.id === "mesa-1-1"), false);
  assert.deepEqual(progresso(desfeito).vitorias, [50, 0]);
});

teste("restaurar resultado excluído volta para a mesma posição", () => {
  const estado = partidasConcluidas(3);
  const resultado = estado.historico[1];
  const excluido = T.excluirResultado(estado, resultado.id);
  const restaurado = T.restaurarResultado(excluido, resultado, 1);
  assert.deepEqual(restaurado.historico, estado.historico);
  assert.equal(T.restaurarResultado(restaurado, resultado, 0), restaurado);
});

teste("não restaura vitória que foi desfeita no placar", () => {
  const venceu = marcar(inicio(), 0, 12);
  const resultado = venceu.historico[0];
  const desfeito = T.desfazer(T.excluirResultado(venceu, resultado.id));
  assert.equal(T.restaurarResultado(desfeito, resultado, 0).historico.length, 0);
});

teste("nova mesa começa do zero mas mantém o histórico", () => {
  const antiga = marcar(inicio(), 0, 12);
  const nova = T.iniciar(antiga, "mesa-2", ["A", "B"], "UNICA");
  assert.deepEqual(progresso(nova), T.progressoInicial());
  assert.equal(nova.mesa.desfazer.length, 0);
  assert.equal(nova.historico.length, 1);
});

teste("nomes são limpos e cortados sem partir emoji", () => {
  assert.equal(T.normalizarNome("   ", "Nós"), "Nós");
  assert.equal(T.normalizarNome("  Os   Reis ", "Nós"), "Os Reis");
  assert.equal(T.normalizarNome("a".repeat(30), "Nós"), "a".repeat(20));
  const cortado = T.normalizarNome("🃏".repeat(25), "Nós");
  assert.equal(Array.from(cortado).length, 20);
  assert.equal(cortado, "🃏".repeat(20));
});

teste("textos do placar", () => {
  assert.equal(T.pontos(1), "1 ponto");
  assert.equal(T.pontos(3), "3 pontos");
  assert.equal(T.nomeDoValor(3), "Truco!");
  assert.equal(T.metaDaDisputa("MELHOR_DE_3"), "Quem vencer 2 partidas leva");
  assert.equal(T.metaDaDisputa("UNICA"), "Quem vencer 1 partida leva");
  assert.equal(T.metaDaDisputa("LIVRE"), "A resenha não tem fim");
});

teste("data mostra o ano só quando não é o atual", () => {
  const fuso = "America/Sao_Paulo";
  const dia = 1_761_480_000_000; // 26/10/2025 09:00 em Brasília
  const umAnoDepois = dia + 365 * 24 * 60 * 60 * 1000;
  const mesmoAno = T.data(dia, dia, fuso);
  const outroAno = T.data(dia, umAnoDepois, fuso);
  assert.ok(mesmoAno.startsWith("26 de "), mesmoAno);
  assert.ok(!mesmoAno.includes("2025"), mesmoAno);
  assert.ok(outroAno.endsWith("de 2025"), outroAno);
});

// ---------- EstadoJsonTest ----------

const jsonReactNative = JSON.stringify({
  version: 1,
  active: {
    id: "1759600000000-ab12cd",
    teams: ["Nós", "Os Zap"],
    format: "best3",
    progress: { scores: [3, 11], wins: [1, 0], stake: 1, winner: null, gameNumber: 2 },
    undo: [
      { progress: { scores: [9, 0], wins: [0, 0], stake: 3, winner: null, gameNumber: 1 }, addedResultId: "1759600000000-ab12cd-1" },
      { progress: { scores: [12, 0], wins: [1, 0], stake: 1, winner: 0, gameNumber: 1 } },
      { progress: { scores: [0, 0], wins: [1, 0], stake: 1, winner: null, gameNumber: 2 } },
      { progress: { scores: [0, 9], wins: [1, 0], stake: 1, winner: null, gameNumber: 2 } },
      { progress: { scores: [0, 10], wins: [1, 0], stake: 1, winner: null, gameNumber: 2 } },
    ],
  },
  history: [
    {
      id: "1759600000000-ab12cd-1",
      matchId: "1759600000000-ab12cd",
      teams: ["Nós", "Os Zap"],
      scores: [12, 0],
      winner: 0,
      finishedAt: 1759600123456,
      format: "best3",
      gameNumber: 1,
    },
    {
      id: "1759000000000-zz99yy-3",
      matchId: "1759000000000-zz99yy",
      teams: ["Pai", "Filho"],
      scores: [7, 12],
      winner: 1,
      finishedAt: 1759000999000,
      format: "free",
      gameNumber: 3,
    },
  ],
  haptics: false,
});
const copiaJson = () => JSON.parse(jsonReactNative);

teste("lê o estado gravado pelo app", () => {
  const estado = T.deJson(jsonReactNative);
  const mesa = estado.mesa;
  assert.equal(mesa.id, "1759600000000-ab12cd");
  assert.deepEqual(mesa.duplas, ["Nós", "Os Zap"]);
  assert.equal(mesa.formato, "MELHOR_DE_3");
  assert.deepEqual(mesa.progresso, { placar: [3, 11], vitorias: [1, 0], valorMao: 1, vencedor: null, numeroPartida: 2 });
  assert.equal(mesa.desfazer.length, 5);
  assert.equal(mesa.desfazer[0].resultadoAdicionadoId, "1759600000000-ab12cd-1");
  assert.equal(mesa.desfazer[0].progresso.valorMao, 3);
  assert.equal(mesa.desfazer[1].resultadoAdicionadoId, null);
  assert.equal(mesa.desfazer[1].progresso.vencedor, 0);

  assert.equal(estado.vibracao, false);
  assert.equal(estado.historico.length, 2);
  const antigo = estado.historico[1];
  assert.deepEqual(antigo.duplas, ["Pai", "Filho"]);
  assert.deepEqual(antigo.placar, [7, 12]);
  assert.equal(antigo.vencedor, 1);
  assert.equal(antigo.terminouEm, 1759000999000);
  assert.equal(antigo.formato, "LIVRE");
  assert.equal(antigo.numeroPartida, 3);
});

teste("estado lido continua jogável e o desfazer corrige o histórico", () => {
  let estado = T.deJson(jsonReactNative);
  assert.equal(T.duplaNaMaoDeOnze(estado.mesa.progresso), 1);
  while (estado.mesa.desfazer.length > 0) estado = T.desfazer(estado);
  assert.deepEqual(estado.mesa.progresso.placar, [9, 0]);
  assert.deepEqual(estado.historico.map((r) => r.id), ["1759000000000-zz99yy-3"]);
});

teste("gravar e ler devolve o mesmo estado", () => {
  let estado = T.iniciar(T.estadoInicial(false), "mesa-x", ["Zap 🃏", "Eles"], "LIVRE");
  for (let i = 0; i < 52; i++) {
    estado = T.marcar(estado, i % 2, 12, 1000 + i);
    estado = T.proximaPartida(estado);
  }
  estado = T.marcar(T.escolherValor(estado, 9), 0, 3, 99);
  estado = T.escolherValor(estado, 12);
  const lido = T.deJson(T.paraJson(estado));
  assert.deepEqual(lido, estado);
  assert.ok(estado.mesa.desfazer.some((e) => e.resultadoRetirado !== null));
});

teste("formato gravado é o mesmo do app", () => {
  const estado = T.marcar(T.iniciar(T.estadoInicial(), "m", ["A", "B"], "MELHOR_DE_5"), 1, 12, 5);
  const json = JSON.parse(T.paraJson(estado));
  assert.equal(json.version, 1);
  assert.equal(json.haptics, true);
  assert.equal(json.active.format, "best5");
  assert.equal(json.active.progress.winner, 1);
  assert.equal(json.active.progress.scores[1], 12);
  assert.equal(json.active.undo[0].progress.winner, null);
  assert.equal(json.history[0].id, "m-1");
  assert.equal(JSON.parse(T.paraJson(T.estadoInicial())).active, null);
});

teste("texto ilegível ou de outra versão não é aceito", () => {
  for (const texto of ["", "{", "null", "[]", "{}", '{"version":99}', '{"version":"1"}']) {
    assert.equal(T.deJson(texto), null, texto);
  }
});

teste("itens corrompidos são ignorados sem perder o restante", () => {
  const json = copiaJson();
  json.history[0] = {}; // primeiro resultado inválido
  json.history.push("texto solto");
  json.active.undo.push({ progress: "x" });
  delete json.haptics;
  const estado = T.deJson(JSON.stringify(json));
  assert.deepEqual(estado.historico.map((r) => r.id), ["1759000000000-zz99yy-3"]);
  assert.equal(estado.mesa.desfazer.length, 5);
  assert.equal(estado.vibracao, true);
});

teste("mesa com placar impossível é descartada, mas o histórico fica", () => {
  const json = copiaJson();
  json.active.progress.scores = [-1, 999];
  const estado = T.deJson(JSON.stringify(json));
  assert.equal(estado.mesa, null);
  assert.equal(estado.historico.length, 2);
});

teste("vencedor precisa combinar com o placar", () => {
  const json = copiaJson();
  json.active.progress.winner = 0; // 3 a 11 não tem vencedor
  assert.equal(T.deJson(JSON.stringify(json)).mesa, null);

  const resultado = copiaJson();
  resultado.history[0].winner = 1;
  assert.equal(T.deJson(JSON.stringify(resultado)).historico.length, 1);
});

teste("nomes vazios ou longos são corrigidos", () => {
  const json = copiaJson();
  json.active.teams = ["  ", "x".repeat(40)];
  const mesa = T.deJson(JSON.stringify(json)).mesa;
  assert.notEqual(mesa, null);
  assert.deepEqual(mesa.duplas, ["Nós", "x".repeat(20)]);
});

console.log(`\n${total} testes passaram.`);
