"use strict";
// Regras da dama brasileira e computador (assets/jogos/damas-logica.js).
const assert = require("node:assert/strict");
const L = require("../../assets/jogos/damas-logica.js");

const { BRANCO: B, PRETO: P } = L;
const casa = (linha, coluna) => L.indice(linha, coluna);
const vazias = () => Array(L.TOTAL_CASAS).fill(null);

/** Tabuleiro com as peças indicadas: [linha, coluna, jogador, dama?]. */
function tabuleiro(pecas) {
  const casas = vazias();
  for (const [linha, coluna, jogador, dama = false] of pecas) casas[casa(linha, coluna)] = { jogador, dama };
  return casas;
}

/** Lance simples de mentira, só para dar vez ao outro jogador em `criar`. */
const LANCE_NEUTRO = { passos: [{ de: 0, para: 0, capturada: null }] };

const destinos = (lances) => lances.map((lance) => lance.passos.at(-1).para).sort((a, b) => a - b);

const testes = {
  // ---------- Tabuleiro ----------
  "o tabuleiro começa com 12 peças de cada lado, só nas casas escuras"() {
    assert.equal(L.TOTAL_CASAS, 64);
    assert.equal(L.NOVA.pecas[B], 12);
    assert.equal(L.NOVA.pecas[P], 12);
    assert.equal(L.NOVA.vez, B);
    assert.equal(L.NOVA.casas.filter(Boolean).length, L.PECAS_POR_LADO * 2);
    L.NOVA.casas.forEach((p, indice) => {
      if (!p) return;
      assert.ok(L.casaEscura(L.linhaDaCasa(indice), L.colunaDaCasa(indice)), `peça em casa clara: ${indice}`);
      assert.equal(p.dama, false);
    });
  },
  "no início as brancas têm 7 lances simples e nenhuma captura"() {
    const lances = L.lancesLegais(L.NOVA.casas, B);
    assert.equal(lances.length, 7);
    assert.ok(lances.every((lance) => !L.ehCaptura(lance)));
    assert.equal(L.lancesLegais(L.NOVA.casas, P).length, 7);
  },

  // ---------- Peão e dama ----------
  "o peão anda uma casa na diagonal, só para a frente"() {
    const casas = tabuleiro([[4, 3, B]]);
    assert.deepEqual(destinos(L.lancesLegais(casas, B)), [casa(3, 2), casa(3, 4)]);
    // As pretas descem
    const pretas = tabuleiro([[3, 4, P]]);
    assert.deepEqual(destinos(L.lancesLegais(pretas, P)), [casa(4, 3), casa(4, 5)]);
  },
  "a dama anda a qualquer distância na diagonal"() {
    const casas = tabuleiro([[4, 3, B, true]]);
    const lances = L.lancesLegais(casas, B);
    assert.equal(lances.length, 13);
    assert.ok(destinos(lances).includes(casa(0, 7)));
    assert.ok(destinos(lances).includes(casa(7, 0)));
  },
  "o peão come para os dois lados e para trás"() {
    const casas = tabuleiro([
      [4, 3, B],
      [3, 2, P],
      [5, 4, P],
    ]);
    const lances = L.lancesLegais(casas, B);
    assert.equal(lances.length, 2);
    assert.ok(lances.every((lance) => L.ehCaptura(lance)));
    assert.deepEqual(destinos(lances), [casa(2, 1), casa(6, 5)]);
  },

  "comer é obrigatório"() {
    const casas = tabuleiro([
      [4, 3, B],
      [3, 2, P],
      [5, 6, B],
    ]);
    // A peça de (4,3) tem jogada simples e captura; a de (5,6) só tem jogada simples
    assert.ok(L.movimentosDePasso(casas, casa(4, 3)).length > 0);
    const lances = L.lancesLegais(casas, B);
    assert.equal(lances.length, 1);
    assert.ok(L.ehCaptura(lances[0]));
  },
  "a captura continua em cadeia"() {
    const casas = tabuleiro([
      [5, 0, B],
      [4, 1, P],
      [2, 3, P],
    ]);
    const lances = L.capturasDe(casas, casa(5, 0));
    assert.equal(lances.length, 1);
    assert.equal(lances[0].passos.length, 2);
    assert.deepEqual(L.capturadasDoLance(lances[0]), [casa(4, 1), casa(2, 3)]);
    assert.deepEqual(
      lances[0].passos.map((passo) => [passo.de, passo.para]),
      [
        [casa(5, 0), casa(3, 2)],
        [casa(3, 2), casa(1, 4)],
      ],
    );
  },
  "a dama voa e come a distância"() {
    const casas = tabuleiro([
      [1, 0, B, true],
      [4, 3, P],
    ]);
    const lances = L.capturasDe(casas, casa(1, 0));
    assert.equal(lances.length, 3);
    assert.ok(lances.every((lance) => lance.passos.length === 1 && lance.passos[0].capturada === casa(4, 3)));
    assert.deepEqual(destinos(lances), [casa(5, 4), casa(6, 5), casa(7, 6)]);
  },
  "o peão vira dama ao chegar na última linha e para ali"() {
    const casas = tabuleiro([
      [2, 1, B],
      [1, 2, P],
      [1, 4, P],
    ]);
    const lances = L.capturasDe(casas, casa(2, 1));
    assert.equal(lances.length, 1);
    // Sem a regra da promoção, ainda comeria a peça de (1,4)
    assert.equal(lances[0].passos.length, 1);
    const depois = L.aplicarLance(casas, lances[0]);
    assert.equal(depois[casa(0, 3)].jogador, B);
    assert.equal(depois[casa(0, 3)].dama, true);
  },
  "o peão também vira dama numa jogada simples"() {
    const casas = tabuleiro([[1, 2, B]]);
    const lance = L.lancePara(casas, B, casa(1, 2), casa(0, 1));
    assert.ok(lance);
    assert.equal(L.aplicarLance(casas, lance)[casa(0, 1)].dama, true);
  },

  // ---------- Partida ----------
  "jogar move a peça e passa a vez"() {
    const lance = L.lancePara(L.NOVA.casas, B, casa(5, 0), casa(4, 1));
    const depois = L.jogar(L.NOVA, lance);
    assert.notEqual(depois, L.NOVA);
    assert.equal(depois.casas[casa(4, 1)].jogador, B);
    assert.equal(depois.casas[casa(5, 0)], null);
    assert.equal(depois.vez, P);
    assert.equal(depois.jogadas.length, 1);
    // jogarDe é o atalho da tela
    assert.ok(L.mesmaPartida(L.jogarDe(L.NOVA, casa(5, 0), casa(4, 1)), depois));
  },
  "lance inválido devolve a mesma partida"() {
    const invalido = { passos: [{ de: casa(5, 0), para: casa(3, 2), capturada: null }] };
    assert.equal(L.jogar(L.NOVA, invalido), L.NOVA);
    assert.equal(L.jogar(L.NOVA, null), L.NOVA);
    assert.equal(L.jogar(L.NOVA, { passos: [] }), L.NOVA);
    assert.equal(L.jogarDe(L.NOVA, casa(5, 0), casa(0, 0)), L.NOVA);
  },
  "quem fica sem peças ou sem lance perde"() {
    const semPretas = L.criar([LANCE_NEUTRO], tabuleiro([[5, 0, B]]));
    assert.equal(semPretas.vez, P);
    assert.equal(semPretas.vitoria.jogador, B);
    assert.ok(semPretas.terminada);
    const semBrancas = L.criar([], tabuleiro([[3, 4, P]]));
    assert.equal(semBrancas.vitoria.jogador, P);
  },
  "empate depois de muitos lances sem captura"() {
    const muitos = Array(L.LANCES_ATE_EMPATE).fill(LANCE_NEUTRO);
    const empatada = L.criar(muitos, L.NOVA.casas);
    assert.equal(empatada.empate, true);
    assert.equal(empatada.vitoria, null);
    assert.ok(empatada.terminada);
    const quase = L.criar(muitos.slice(1), L.NOVA.casas);
    assert.equal(quase.empate, false);
  },
  "desfazer volta o lance"() {
    const um = L.jogarDe(L.NOVA, casa(5, 0), casa(4, 1));
    const dois = L.jogarDe(um, casa(2, 1), casa(3, 2));
    assert.equal(dois.jogadas.length, 2);
    const voltou = L.desfazer(dois);
    assert.equal(voltou.jogadas.length, 1);
    assert.ok(L.mesmaPartida(voltou, um));
    assert.equal(L.desfazer(L.NOVA), L.NOVA);
  },
  "restaurar refaz a partida salva e descarta dados inválidos"() {
    const partida = L.jogarDe(L.jogarDe(L.NOVA, casa(5, 0), casa(4, 1)), casa(2, 1), casa(3, 2));
    const salvo = JSON.parse(JSON.stringify(partida.jogadas));
    assert.ok(L.mesmaPartida(L.restaurar(salvo), partida));
    assert.ok(L.mesmaPartida(L.restaurar("lixo"), L.NOVA));
    assert.ok(L.mesmaPartida(L.restaurar([{ passos: [] }]), L.NOVA));
    assert.ok(L.mesmaPartida(L.restaurar([{ passos: [{ de: 0, para: 7, capturada: null }] }]), L.NOVA));
  },

  // ---------- Computador ----------
  "o computador come quando pode"() {
    const casas = tabuleiro([
      [4, 3, B],
      [3, 2, P],
    ]);
    const lance = L.escolherJogada(casas, P, L.NIVEIS.dificil);
    assert.ok(L.ehCaptura(lance));
    assert.deepEqual(L.capturadasDoLance(lance), [casa(4, 3)]);
    // A peça preta de (3,2) salta por cima da branca e cai em (5,4)
    assert.equal(L.aplicarLance(casas, lance)[casa(5, 4)].jogador, P);
    assert.equal(L.aplicarLance(casas, lance)[casa(4, 3)], null);
  },
  "o computador devolve sempre um lance legal"() {
    let partida = L.NOVA;
    let lances = 0;
    while (!partida.terminada && lances < 30) {
      const nivel = [L.NIVEIS.facil, L.NIVEIS.medio, L.NIVEIS.dificil][lances % 3];
      const lance = L.escolherJogada(partida.casas, partida.vez, nivel);
      const legais = L.lancesLegais(partida.casas, partida.vez);
      assert.ok(legais.some((opcao) => L.mesmoLance(opcao, lance)), `lance fora da lista: ${JSON.stringify(lance)}`);
      const depois = L.jogar(partida, lance);
      assert.notEqual(depois, partida);
      partida = depois;
      lances++;
    }
    assert.ok(lances > 0);
  },
  "o computador reclama de partida terminada"() {
    const terminada = L.criar([LANCE_NEUTRO], tabuleiro([[5, 0, B]]));
    assert.throws(() => L.escolherJogada(terminada.casas, P, L.NIVEIS.dificil), /terminou/);
  },
  "o Difícil pensa rápido o bastante"() {
    const inicio = Date.now();
    const lances = L.melhoresJogadas(L.NOVA.casas, P, L.PROFUNDIDADE.dificil);
    const gasto = Date.now() - inicio;
    assert.ok(lances.length > 0);
    assert.ok(gasto < 5000, `demorou ${gasto} ms`);
  },

  // ---------- Placar e histórico ----------
  "placar soma e subtrai sem ficar negativo"() {
    const placar = L.somar(L.somar(L.somar(L.somar(L.PLACAR_ZERO, B), B), P), null);
    assert.deepEqual(placar, { b: 2, p: 1, empates: 1 });
    assert.deepEqual(L.subtrair(placar, B), { b: 1, p: 1, empates: 1 });
    assert.deepEqual(L.subtrair(L.subtrair(L.PLACAR_ZERO, P), null), { b: 0, p: 0, empates: 0 });
  },
  "placar ida e volta pela lista salva"() {
    const placar = { b: 3, p: 2, empates: 1 };
    assert.deepEqual(L.placarParaLista(placar), [3, 2, 1]);
    assert.deepEqual(L.placarDeLista(L.placarParaLista(placar)), placar);
    assert.deepEqual(L.placarDeLista(null), L.PLACAR_ZERO);
    assert.deepEqual(L.placarDeLista([1, 2]), L.PLACAR_ZERO);
    assert.deepEqual(L.placarDeLista([1, -2, 0]), L.PLACAR_ZERO);
  },
  "resultado do ponto de vista de quem joga"() {
    assert.equal(L.resultadoContraComputador(B, L.HUMANO, L.NIVEIS.medio, 0).desfecho, L.DESFECHOS.VITORIA);
    assert.equal(L.resultadoContraComputador(P, L.HUMANO, L.NIVEIS.medio, 0).desfecho, L.DESFECHOS.DERROTA);
    assert.equal(L.resultadoContraComputador(null, L.HUMANO, L.NIVEIS.medio, 0).desfecho, L.DESFECHOS.EMPATE);
  },
  "estatísticas contam cada desfecho"() {
    const lista = ["vitoria", "vitoria", "derrota", "empate"].map((desfecho) => ({ desfecho, nivel: "medio", momento: 0 }));
    assert.deepEqual(L.estatisticas(lista), { vitorias: 2, derrotas: 1, empates: 1, total: 4 });
    assert.equal(L.estatisticas([]).total, 0);
  },
  "histórico guarda as 200 mais recentes e ignora itens ruins"() {
    let lista = [];
    for (let i = 0; i < 205; i++) lista = L.adicionarAoHistorico(lista, { desfecho: "empate", nivel: "facil", momento: i });
    assert.equal(lista.length, 200);
    assert.equal(lista[0].momento, 204);
    assert.equal(lista.at(-1).momento, 5);
    assert.deepEqual(
      L.lerHistorico([
        { desfecho: "vitoria", nivel: "dificil", momento: 7 },
        { desfecho: "x", nivel: "facil", momento: 1 },
        { desfecho: "empate", nivel: "?", momento: 1 },
        null,
      ]),
      [{ desfecho: "vitoria", nivel: "dificil", momento: 7 }],
    );
    assert.deepEqual(L.lerHistorico("lixo"), []);
  },
  "tempo decorrido em português com singular e plural"() {
    const agora = 1_000_000_000_000;
    const minuto = 60_000;
    assert.equal(L.textoTempoDecorrido(agora - 30_000, agora), "Agora mesmo");
    assert.equal(L.textoTempoDecorrido(agora - minuto, agora), "Há 1 minuto");
    assert.equal(L.textoTempoDecorrido(agora - 24 * 60 * minuto, agora), "Há 1 dia");
    // 01/01/2026 12:00 UTC
    const momento = 1_767_268_800_000;
    assert.equal(L.textoTempoDecorrido(momento, momento + 40 * 24 * 60 * 60_000, "UTC"), "01/01/2026");
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
