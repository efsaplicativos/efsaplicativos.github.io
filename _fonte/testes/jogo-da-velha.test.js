"use strict";
// Mesmos casos de app/src/test/.../{RegrasTest,InteligenciaArtificialTest,DadosTest}.kt do app Tic Tac Toe.
const assert = require("node:assert/strict");
const V = require("../../assets/jogos/jogo-da-velha-logica.js");

const { X, O, NIVEIS: N } = V;

function semente(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tabuleiro = (texto) => [...texto.replace(/\s/g, "")].map((c) => (c === "X" ? X : c === "O" ? O : null));
const partida = (...jogadas) => jogadas.reduce(V.jogar, V.NOVA);

/** Todas as respostas possíveis do adversário; na vez do computador, cada jogada ótima. */
function verificarQueNuncaPerde(p, ia) {
  if (p.terminada) {
    assert.notEqual(p.vitoria?.jogador, V.adversario(ia), `computador perdeu: ${p.jogadas}`);
    return 1;
  }
  const opcoes = p.vez === ia ? V.melhoresJogadas(p.casas, ia) : V.casasLivres(p.casas);
  assert.ok(opcoes.length > 0);
  return opcoes.reduce((soma, casa) => soma + verificarQueNuncaPerde(V.jogar(p, casa), ia), 0);
}

const testes = {
  // ---------- RegrasTest.kt ----------
  "detecta as oito linhas para os dois jogadores"() {
    for (const jogador of [X, O]) {
      for (const linha of V.LINHAS) {
        const casas = Array(9).fill(null);
        linha.forEach((i) => (casas[i] = jogador));
        const vitoria = V.vencedor(casas);
        assert.equal(vitoria.jogador, jogador);
        assert.deepEqual(vitoria.linhas, [linha]);
      }
    }
  },
  "tabuleiro vazio ou incompleto não tem vencedor"() {
    assert.equal(V.vencedor(Array(9).fill(null)), null);
    assert.equal(V.vencedor(tabuleiro("XX. OO. ...")), null);
    assert.equal(V.vencedor(tabuleiro("XOX XOO OXX")), null);
  },
  "vitória que fecha duas linhas devolve as duas"() {
    const vitoria = V.vencedor(tabuleiro("XXX XOO XOO"));
    assert.equal(vitoria.jogador, X);
    assert.deepEqual(vitoria.linhas, [[0, 1, 2], [0, 3, 6]]);
    assert.deepEqual([...vitoria.casas].sort(), [0, 1, 2, 3, 6]);
  },
  "empate só com tabuleiro cheio e sem vencedor"() {
    const empate = partida(0, 1, 2, 4, 3, 5, 7, 6, 8);
    assert.ok(empate.empate);
    assert.equal(empate.vitoria, null);
    assert.ok(empate.terminada);
    const incompleta = partida(0, 1, 2, 4, 3, 5, 7, 6);
    assert.equal(incompleta.empate, false);
    assert.equal(incompleta.terminada, false);
  },
  "vitória na última casa não conta como empate"() {
    const p = partida(0, 1, 2, 3, 4, 5, 7, 6, 8);
    assert.equal(p.jogadas.length, 9);
    assert.equal(p.vitoria.jogador, X);
    assert.equal(p.empate, false);
  },
  "X começa e os jogadores se alternam"() {
    assert.equal(V.NOVA.vez, X);
    const p = partida(4);
    assert.equal(p.casas[4], X);
    assert.equal(p.vez, O);
    assert.equal(V.jogar(p, 0).casas[0], O);
    assert.equal(V.jogar(p, 0).vez, X);
  },
  "jogada em casa ocupada ou fora do tabuleiro é ignorada"() {
    const p = partida(4);
    assert.equal(V.jogar(p, 4), p);
    assert.equal(V.jogar(p, -1), p);
    assert.equal(V.jogar(p, 9), p);
    assert.equal(V.jogar(p, 1.5), p);
  },
  "não dá para jogar depois que a partida terminou"() {
    const vencida = partida(0, 3, 1, 4, 2);
    assert.equal(vencida.vitoria.jogador, X);
    assert.deepEqual(vencida.vitoria.linhas, [[0, 1, 2]]);
    assert.equal(V.jogar(vencida, 8), vencida);
    assert.equal(V.podeJogar(vencida, 8), false);
  },
  "desfazer volta uma jogada e a vez"() {
    const desfeita = V.desfazer(partida(0, 3, 1, 4, 2));
    assert.deepEqual([...desfeita.jogadas], [0, 3, 1, 4]);
    assert.equal(desfeita.vitoria, null);
    assert.equal(desfeita.vez, X);
    assert.equal(desfeita.casas[2], null);
    assert.equal(V.desfazer(V.NOVA), V.NOVA);
  },
  "restaurar refaz a partida e rejeita dados inválidos"() {
    assert.ok(V.mesmaPartida(V.restaurar([4, 0, 8]), partida(4, 0, 8)));
    assert.equal(V.restaurar(null), V.NOVA);
    assert.equal(V.restaurar([4, 4]), V.NOVA);
    assert.equal(V.restaurar([10]), V.NOVA);
    assert.equal(V.restaurar(["4"]), V.NOVA);
    // Jogada depois da vitória de X
    assert.equal(V.restaurar([0, 3, 1, 4, 2, 8]), V.NOVA);
  },

  // ---------- InteligenciaArtificialTest.kt ----------
  "difícil nunca perde jogando com O"() {
    assert.ok(verificarQueNuncaPerde(V.NOVA, O) > 0);
  },
  "difícil nunca perde jogando com X"() {
    assert.ok(verificarQueNuncaPerde(V.NOVA, X) > 0);
  },
  "difícil sempre escolhe uma das melhores jogadas"() {
    const p = partida(0);
    // Contra abertura no canto, só o centro evita a derrota
    assert.deepEqual(V.melhoresJogadas(p.casas, O), [4]);
    for (let s = 0; s < 50; s++) assert.equal(V.escolherJogada(p.casas, O, N.dificil, semente(s)), 4);
  },
  "prefere ganhar agora a bloquear"() {
    // X X . / O O . / X . .  (vez de O): vencer em 5 é melhor que bloquear em 2
    const p = partida(0, 3, 1, 4, 6);
    assert.equal(p.vez, O);
    assert.deepEqual(V.melhoresJogadas(p.casas, O), [5]);
  },
  "bloqueia a ameaça do adversário"() {
    assert.deepEqual(V.melhoresJogadas(partida(0, 4, 1).casas, O), [2]);
  },
  "com a derrota garantida ainda bloqueia a ameaça imediata"() {
    // X O . / . X . / . . .  -> X ameaça 8 e já tem vitória forçada
    assert.deepEqual(V.melhoresJogadas(partida(0, 1, 4).casas, O), [8]);
  },
  "fácil e médio sempre jogam em casa livre"() {
    const p = partida(4, 0, 8);
    const livres = V.casasLivres(p.casas);
    for (const nivel of Object.values(N)) {
      for (let s = 0; s < 200; s++) assert.ok(livres.includes(V.escolherJogada(p.casas, O, nivel, semente(s))));
    }
  },
  "médio mistura jogadas aleatórias e ótimas"() {
    const p = partida(0);
    const aleatorio = semente(99);
    const escolhas = Array.from({ length: 300 }, () => V.escolherJogada(p.casas, O, N.medio, aleatorio));
    // Esperado ~56% no centro (metade ótima + 1/8 da metade aleatória)
    assert.ok(escolhas.filter((c) => c === 4).length > 120);
    assert.ok(escolhas.some((c) => c !== 4));
  },
  "fácil pode ser vencido"() {
    let vitoriasX = 0;
    for (let s = 0; s < 100; s++) {
      const aleatorio = semente(s);
      let p = V.NOVA;
      while (!p.terminada) {
        const casa =
          p.vez === X
            ? V.melhoresJogadas(p.casas, X)[Math.floor(aleatorio() * V.melhoresJogadas(p.casas, X).length)]
            : V.escolherJogada(p.casas, O, N.facil, aleatorio);
        p = V.jogar(p, casa);
      }
      if (p.vitoria?.jogador === X) vitoriasX++;
    }
    assert.ok(vitoriasX > 0);
  },
  "computador contra computador no difícil sempre empata"() {
    for (let s = 0; s < 20; s++) {
      const aleatorio = semente(s);
      let p = V.NOVA;
      while (!p.terminada) p = V.jogar(p, V.escolherJogada(p.casas, p.vez, N.dificil, aleatorio));
      assert.ok(p.empate, `semente ${s}: ${p.jogadas}`);
    }
  },
  "não escolhe jogada em partida encerrada"() {
    assert.throws(() => V.escolherJogada(partida(0, 3, 1, 4, 2).casas, O, N.dificil));
  },

  // ---------- DadosTest.kt ----------
  "placar soma e subtrai sem ficar negativo"() {
    const placar = V.somar(V.somar(V.somar(V.somar(V.PLACAR_ZERO, X), X), O), null);
    assert.deepEqual(placar, { x: 2, o: 1, empates: 1 });
    assert.deepEqual(V.subtrair(placar, X), { x: 1, o: 1, empates: 1 });
    assert.deepEqual(V.subtrair(V.subtrair(V.PLACAR_ZERO, O), null), { x: 0, o: 0, empates: 0 });
  },
  "placar ida e volta pela lista salva"() {
    const placar = { x: 3, o: 2, empates: 1 };
    assert.deepEqual(V.placarParaLista(placar), [3, 2, 1]);
    assert.deepEqual(V.placarDeLista(V.placarParaLista(placar)), placar);
    assert.deepEqual(V.placarDeLista(null), V.PLACAR_ZERO);
    assert.deepEqual(V.placarDeLista([1, 2]), V.PLACAR_ZERO);
    assert.deepEqual(V.placarDeLista([1, -2, 0]), V.PLACAR_ZERO);
  },
  "resultado do ponto de vista de quem joga"() {
    assert.equal(V.resultadoContraComputador(X, X, N.facil, 0).desfecho, V.DESFECHOS.VITORIA);
    assert.equal(V.resultadoContraComputador(O, X, N.facil, 0).desfecho, V.DESFECHOS.DERROTA);
    assert.equal(V.resultadoContraComputador(null, X, N.facil, 0).desfecho, V.DESFECHOS.EMPATE);
  },
  "estatísticas contam cada desfecho"() {
    const lista = ["vitoria", "vitoria", "derrota", "empate"].map((desfecho) => ({ desfecho, nivel: "medio", momento: 0 }));
    assert.deepEqual(V.estatisticas(lista), { vitorias: 2, derrotas: 1, empates: 1, total: 4 });
    assert.equal(V.estatisticas([]).total, 0);
  },
  "histórico guarda as 200 mais recentes primeiro e ignora itens ruins"() {
    let lista = [];
    for (let i = 0; i < 205; i++) lista = V.adicionarAoHistorico(lista, { desfecho: "empate", nivel: "facil", momento: i });
    assert.equal(lista.length, 200);
    assert.equal(lista[0].momento, 204);
    assert.equal(lista.at(-1).momento, 5);
    assert.deepEqual(
      V.lerHistorico([{ desfecho: "vitoria", nivel: "dificil", momento: 7 }, { desfecho: "x", nivel: "facil", momento: 1 }, { desfecho: "empate", nivel: "?", momento: 1 }, null]),
      [{ desfecho: "vitoria", nivel: "dificil", momento: 7 }],
    );
    assert.deepEqual(V.lerHistorico("lixo"), []);
  },
  "tempo decorrido em português com singular e plural"() {
    const agora = 1_000_000_000_000;
    const minuto = 60_000;
    assert.equal(V.textoTempoDecorrido(agora - 30_000, agora), "Agora mesmo");
    assert.equal(V.textoTempoDecorrido(agora + 5_000, agora), "Agora mesmo");
    assert.equal(V.textoTempoDecorrido(agora - minuto, agora), "Há 1 minuto");
    assert.equal(V.textoTempoDecorrido(agora - 59 * minuto, agora), "Há 59 minutos");
    assert.equal(V.textoTempoDecorrido(agora - 60 * minuto, agora), "Há 1 hora");
    assert.equal(V.textoTempoDecorrido(agora - 23 * 60 * minuto, agora), "Há 23 horas");
    assert.equal(V.textoTempoDecorrido(agora - 24 * 60 * minuto, agora), "Há 1 dia");
    assert.equal(V.textoTempoDecorrido(agora - 29 * 24 * 60 * minuto, agora), "Há 29 dias");
  },
  "depois de 30 dias mostra a data"() {
    // 01/01/2026 12:00 UTC
    const momento = 1_767_268_800_000;
    assert.equal(V.textoTempoDecorrido(momento, momento + 40 * 24 * 60 * 60_000, "UTC"), "01/01/2026");
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
