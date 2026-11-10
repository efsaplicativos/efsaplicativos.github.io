"use strict";
// Regras, tabuleiro e computador do Lig 4 (assets/jogos/lig-4-logica.js).
const assert = require("node:assert/strict");
const L = require("../../assets/jogos/lig-4-logica.js");

const { VERMELHO: V, AMARELO: A } = L;
const casa = (linha, coluna) => L.indice(linha, coluna);
const vazias = () => Array(L.TOTAL_CASAS).fill(null);
const partida = (...colunas) => colunas.reduce(L.jogar, L.NOVA);

/** Tabuleiro com as peças nas casas indicadas: [linha, coluna, jogador]. */
function tabuleiro(pecas) {
  const casas = vazias();
  for (const [linha, coluna, jogador] of pecas) casas[casa(linha, coluna)] = jogador;
  return casas;
}

function semente(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** As quatro casas da janela estão na mesma linha, na mesma coluna ou em diagonal? */
function mesmaDirecao(sequencia) {
  const linhas = sequencia.map(L.linhaDaCasa);
  const colunas = sequencia.map(L.colunaDaCasa);
  const mesmaLinha = linhas.every((l) => l === linhas[0]);
  const mesmaColuna = colunas.every((c) => c === colunas[0]);
  const desce = linhas.every((l, i) => l - linhas[0] === i);
  const direita = colunas.every((c, i) => c - colunas[0] === i);
  const esquerda = colunas.every((c, i) => c - colunas[0] === -i);
  return mesmaLinha || mesmaColuna || (desce && (direita || esquerda));
}

/** Uma partida cheia (42 jogadas) que ninguém ganhou, jogando com cuidado dos dois lados. */
function partidaCheiaSemVencedor(aleatorio) {
  let p = L.NOVA;
  while (!p.terminada) {
    const semVitoriaAgora = L.colunasJogaveis(p.casas).filter((coluna) => L.jogar(p, coluna).vitoria === null);
    const semEntregar = semVitoriaAgora.filter((coluna) => {
      const depois = L.jogar(p, coluna);
      return !L.colunasJogaveis(depois.casas).some((c) => L.jogar(depois, c).vitoria !== null);
    });
    const opcoes = semEntregar.length ? semEntregar : semVitoriaAgora.length ? semVitoriaAgora : L.colunasJogaveis(p.casas);
    p = L.jogar(p, opcoes[Math.floor(aleatorio() * opcoes.length)]);
  }
  return p;
}

const testes = {
  // ---------- Tabuleiro ----------
  "são 42 casas em 7 colunas e 6 linhas"() {
    assert.equal(L.TOTAL_CASAS, 42);
    assert.equal(L.COLUNAS, 7);
    assert.equal(L.LINHAS, 6);
    assert.equal(L.indice(0, 0), 0);
    assert.equal(L.indice(5, 6), 41);
    assert.equal(L.linhaDaCasa(41), 5);
    assert.equal(L.colunaDaCasa(41), 6);
  },
  "as 69 janelas de quatro casas estão alinhadas"() {
    assert.equal(L.SEQUENCIAS.length, 69);
    for (const sequencia of L.SEQUENCIAS) {
      assert.equal(sequencia.length, 4);
      assert.ok(sequencia.every((c) => c >= 0 && c < L.TOTAL_CASAS));
      assert.ok(mesmaDirecao(sequencia));
    }
  },

  // ---------- Vitória ----------
  "tabuleiro vazio não tem vencedor"() {
    assert.equal(L.vencedor(vazias()), null);
  },
  "quatro na horizontal, na vertical e nas duas diagonais"() {
    const casos = [
      tabuleiro([[5, 0, V], [5, 1, V], [5, 2, V], [5, 3, V]]),
      tabuleiro([[2, 4, A], [3, 4, A], [4, 4, A], [5, 4, A]]),
      tabuleiro([[2, 0, V], [3, 1, V], [4, 2, V], [5, 3, V]]),
      tabuleiro([[2, 6, A], [3, 5, A], [4, 4, A], [5, 3, A]]),
    ];
    for (const casas of casos) {
      const vitoria = L.vencedor(casas);
      assert.ok(vitoria, "esperava vitória");
      assert.ok(vitoria.sequencias.length >= 1);
      assert.ok(vitoria.casas.length >= 4);
    }
    assert.equal(L.vencedor(casos[0]).jogador, V);
    assert.equal(L.vencedor(casos[1]).jogador, A);
  },
  "três seguidas não é vitória"() {
    assert.equal(L.vencedor(tabuleiro([[5, 0, V], [5, 1, V], [5, 2, V]])), null);
  },
  "quatro separados por uma peça do outro não conta"() {
    assert.equal(L.vencedor(tabuleiro([[5, 0, V], [5, 1, V], [5, 2, A], [5, 3, V], [5, 4, V]])), null);
  },
  "venceNaCasa concorda com vencedor"() {
    const casas = tabuleiro([[3, 2, V], [3, 3, V], [3, 4, V], [3, 5, V]]);
    assert.equal(L.venceNaCasa(casas, casa(3, 5), V), true);
    assert.equal(L.venceNaCasa(casas, casa(3, 5), A), false);
    assert.equal(L.venceNaCasa(casas, casa(0, 0), V), false);
  },

  // ---------- Partida ----------
  "a peça cai na primeira casa livre de baixo para cima"() {
    const p = partida(3);
    assert.equal(p.casas[casa(5, 3)], V);
    assert.equal(p.casas[casa(4, 3)], null);
    const p2 = L.jogar(p, 3);
    assert.equal(p2.casas[casa(4, 3)], A);
    assert.equal(L.casaDaUltimaJogada(p2), casa(4, 3));
    assert.equal(L.casaDaUltimaJogada(L.NOVA), -1);
  },
  "V começa e os jogadores se alternam"() {
    assert.equal(L.NOVA.vez, V);
    assert.equal(partida(0).vez, A);
    assert.equal(partida(0, 1).casas[casa(5, 0)], V);
    assert.equal(partida(0, 1).casas[casa(5, 1)], A);
  },
  "coluna cheia não aceita jogada"() {
    const cheia = partida(2, 2, 2, 2, 2, 2);
    assert.equal(L.colunaCheia(cheia.casas, 2), true);
    assert.equal(L.podeJogar(cheia, 2), false);
    assert.equal(L.jogar(cheia, 2), cheia);
    assert.deepEqual(L.colunasJogaveis(cheia.casas), [0, 1, 3, 4, 5, 6]);
  },
  "jogada fora do tabuleiro é ignorada"() {
    const p = partida(0);
    for (const coluna of [-1, 7, 1.5, "3", null, undefined, NaN]) assert.equal(L.jogar(p, coluna), p);
  },
  "não dá para jogar depois que a partida terminou"() {
    // O vermelho fecha quatro na linha de baixo
    const vencida = partida(0, 0, 1, 1, 2, 2, 3);
    assert.equal(vencida.vitoria.jogador, V);
    assert.ok(vencida.terminada);
    assert.equal(vencida.empate, false);
    assert.equal(L.jogar(vencida, 6), vencida);
  },
  "empate quando o tabuleiro enche sem quatro em linha"() {
    const aleatorio = semente(7);
    let cheia = null;
    for (let tentativa = 0; tentativa < 500 && !cheia; tentativa++) {
      const p = partidaCheiaSemVencedor(aleatorio);
      if (p.empate) cheia = p;
    }
    assert.ok(cheia, "não encontrou partida cheia sem vencedor");
    assert.equal(cheia.jogadas.length, L.TOTAL_CASAS);
    assert.equal(cheia.vitoria, null);
    assert.ok(cheia.terminada);
  },
  "desfazer volta a última jogada"() {
    const p = partida(0, 1, 2);
    const antes = L.desfazer(p);
    assert.equal(antes.jogadas.length, 2);
    assert.equal(antes.casas[casa(5, 2)], null);
    assert.equal(antes.vez, V);
    assert.equal(L.desfazer(L.NOVA), L.NOVA);
  },
  "restaurar refaz a partida e descarta dados inválidos"() {
    const p = partida(3, 3, 2, 4, 1);
    assert.ok(L.mesmaPartida(L.restaurar([...p.jogadas]), p));
    assert.ok(L.mesmaPartida(L.restaurar("lixo"), L.NOVA));
    assert.ok(L.mesmaPartida(L.restaurar([0, 0, 0, 0, 0, 0, 0]), L.NOVA));
    assert.ok(L.mesmaPartida(L.restaurar([9]), L.NOVA));
  },

  // ---------- Computador ----------
  "o computador fecha quatro quando pode"() {
    // Amarelo com três na linha de baixo (colunas 2, 3 e 4): as duas pontas fecham o jogo
    const p = partida(0, 2, 6, 3, 0, 4, 6);
    assert.equal(p.vez, A);
    assert.equal(p.vitoria, null);
    assert.deepEqual(L.melhoresJogadas(p.casas, A, 2), [1, 5]);
    const coluna = L.escolherJogada(p.casas, A, L.NIVEIS.dificil);
    assert.ok([1, 5].includes(coluna), `esperava 1 ou 5, veio ${coluna}`);
    assert.equal(L.jogar(p, coluna).vitoria.jogador, A);
  },
  "o computador bloqueia a vitória imediata do adversário"() {
    // Vermelho com três na linha de baixo (colunas 0, 1 e 2) e a coluna 3 livre
    const p = partida(0, 6, 1, 5, 2);
    assert.equal(p.vez, A);
    assert.deepEqual(L.melhoresJogadas(p.casas, A, 2), [3]);
    assert.equal(L.jogar(p, 3).vitoria, null);
    assert.equal(L.jogar(L.jogar(p, 3), 3).vitoria, null);
  },
  "o computador prefere o miolo quando tudo é igual"() {
    const melhores = L.melhoresJogadas(L.NOVA.casas, V, 1);
    assert.equal(melhores[0], 3);
    assert.ok(!melhores.includes(0));
  },
  "escolherJogada devolve sempre uma coluna válida"() {
    const aleatorio = semente(11);
    let p = L.NOVA;
    while (!p.terminada) {
      const nivel = [L.NIVEIS.facil, L.NIVEIS.medio, L.NIVEIS.dificil][p.jogadas.length % 3];
      const coluna = L.escolherJogada(p.casas, p.vez, nivel, aleatorio);
      assert.ok(L.podeJogar(p, coluna), `coluna inválida: ${coluna}`);
      p = L.jogar(p, coluna);
    }
    assert.ok(p.terminada);
  },
  "escolherJogada reclama de partida terminada"() {
    const vencida = partida(0, 0, 1, 1, 2, 2, 3);
    assert.throws(() => L.escolherJogada(vencida.casas, A, L.NIVEIS.dificil), /terminou/);
  },
  "o Médio às vezes joga ao acaso"() {
    // Com o sorteio em 0, o Médio cai no acaso e escolhe a primeira coluna livre
    assert.equal(L.escolherJogada(L.NOVA.casas, V, L.NIVEIS.medio, () => 0), 0);
    // Com o sorteio alto, ele pensa e escolhe o miolo
    assert.equal(L.escolherJogada(L.NOVA.casas, V, L.NIVEIS.medio, () => 0.999), 3);
    // O Fácil não pensa: com sorteio 0, também é a primeira coluna livre
    assert.equal(L.escolherJogada(L.NOVA.casas, V, L.NIVEIS.facil, () => 0), 0);
  },

  // ---------- Placar e histórico ----------
  "placar soma e subtrai sem ficar negativo"() {
    const placar = L.somar(L.somar(L.somar(L.somar(L.PLACAR_ZERO, V), V), A), null);
    assert.deepEqual(placar, { v: 2, a: 1, empates: 1 });
    assert.deepEqual(L.subtrair(placar, V), { v: 1, a: 1, empates: 1 });
    assert.deepEqual(L.subtrair(L.subtrair(L.PLACAR_ZERO, A), null), { v: 0, a: 0, empates: 0 });
  },
  "placar ida e volta pela lista salva"() {
    const placar = { v: 3, a: 2, empates: 1 };
    assert.deepEqual(L.placarParaLista(placar), [3, 2, 1]);
    assert.deepEqual(L.placarDeLista(L.placarParaLista(placar)), placar);
    assert.deepEqual(L.placarDeLista(null), L.PLACAR_ZERO);
    assert.deepEqual(L.placarDeLista([1, 2]), L.PLACAR_ZERO);
    assert.deepEqual(L.placarDeLista([1, -2, 0]), L.PLACAR_ZERO);
  },
  "resultado do ponto de vista de quem joga"() {
    assert.equal(L.resultadoContraComputador(V, L.HUMANO, L.NIVEIS.medio, 0).desfecho, L.DESFECHOS.VITORIA);
    assert.equal(L.resultadoContraComputador(A, L.HUMANO, L.NIVEIS.medio, 0).desfecho, L.DESFECHOS.DERROTA);
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
    assert.equal(L.textoTempoDecorrido(agora - 59 * minuto, agora), "Há 59 minutos");
    assert.equal(L.textoTempoDecorrido(agora - 60 * minuto, agora), "Há 1 hora");
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
