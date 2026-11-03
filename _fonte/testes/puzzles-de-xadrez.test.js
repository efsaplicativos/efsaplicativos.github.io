"use strict";
/*
 * Testes da lógica dos puzzles de xadrez: node _fonte/testes/puzzles-de-xadrez.test.js
 * Os números vêm dos testes dos apps: xadrez/PosicaoTest.kt (Puzzles de Xadrez) e core/chess/SanTest.kt,
 * core/puzzle/PuzzleSessionTest.kt, Glicko2Test.kt e PuzzleSelectionTest.kt (Lance Certo).
 * No fim, joga a solução de todos os puzzles dos blocos do site, como o ColecaoPuzzlesTest do app.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const X = require("../../assets/jogos/puzzles-de-xadrez-logica.js");

let falhas = 0;
let total = 0;
async function teste(nome, fn) {
  total++;
  try {
    await fn();
    console.log(`ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`FALHOU ${nome}\n${erro.stack}`);
  }
}

const casa = (nome) => X.casaDoNome(nome);
const fen = (texto) => X.lerFen(texto);
const uci = (pos, texto) => {
  const l = X.lanceUci(pos, texto);
  assert.ok(l, `lance ${texto} deveria ser legal em ${X.paraFen(pos)}`);
  return l;
};
const sanEn = (texto, lanceUci) => {
  const pos = fen(texto);
  return X.san(pos, uci(pos, lanceUci), X.LETRAS_EN);
};

/** Gerador pseudoaleatório com semente, para os testes repetirem sempre igual. */
function sorteador(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";

const HANGING_PIECE = X.lerPuzzle(
  "00008|r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24|f2g3 e6e7 b2b1 b3c1 b1c1 h6c1|1913|crushing hangingPiece long middlegame",
);
const ENDGAME_PIN = X.lerPuzzle(
  "0000D|5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27|d3d6 f8d8 d6d8 f6d8|1491|advantage endgame short",
);
const BACK_RANK = X.lerPuzzle("back1|6k1/2p2ppp/8/8/8/8/5PPP/RR4K1 b - - 0 1|c7c6 a1a8|800|backRankMate mate mateIn1 oneMove");

(async () => {
  // ---------- Regras (PosicaoTest.kt) ----------

  await teste("perft da posição inicial: 20, 400, 8902, 197281", () => {
    const pos = fen(X.FEN_INICIAL);
    assert.deepEqual([1, 2, 3, 4].map((d) => X.perft(pos, d)), [20, 400, 8902, 197281]);
  });

  await teste("perft Kiwipete (roques, en passant e promoções): 48, 2039, 97862", () => {
    const pos = fen(KIWIPETE);
    assert.deepEqual([1, 2, 3].map((d) => X.perft(pos, d)), [48, 2039, 97862]);
  });

  await teste("perft posição 3 (en passant com cravada): 14, 191, 2812, 43238", () => {
    const pos = fen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");
    assert.deepEqual([1, 2, 3, 4].map((d) => X.perft(pos, d)), [14, 191, 2812, 43238]);
  });

  await teste("perft posição 4: 6, 264, 9467", () => {
    const pos = fen("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1");
    assert.deepEqual([1, 2, 3].map((d) => X.perft(pos, d)), [6, 264, 9467]);
  });

  await teste("perft posição 5: 44, 1486, 62379", () => {
    const pos = fen("rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8");
    assert.deepEqual([1, 2, 3].map((d) => X.perft(pos, d)), [44, 1486, 62379]);
  });

  await teste("perft posição 6: 46, 2079, 89890", () => {
    const pos = fen("r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10");
    assert.deepEqual([1, 2, 3].map((d) => X.perft(pos, d)), [46, 2079, 89890]);
  });

  await teste("FEN volta igual depois de lido e escrito", () => {
    for (const texto of [X.FEN_INICIAL, KIWIPETE, "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 b - - 3 41"]) {
      assert.equal(X.paraFen(fen(texto)), texto);
    }
  });

  await teste("FEN inválido é recusado", () => {
    for (const texto of [
      "not a fen",
      "8/8/8/8/8/8/8/8 w - - 0 1", // sem reis
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1",
      "rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1",
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq z9 0 1",
    ]) {
      assert.throws(() => fen(texto), /FEN inválido/, texto);
    }
  });

  await teste("mate do pastor é xeque-mate", () => {
    let pos = fen(X.FEN_INICIAL);
    for (const l of ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"]) pos = X.aplicar(pos, uci(pos, l));
    assert.ok(X.emXeque(pos));
    assert.ok(X.xequeMate(pos));
    assert.ok(!X.afogado(pos));
  });

  await teste("afogamento não é mate", () => {
    const pos = fen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    assert.ok(X.afogado(pos));
    assert.ok(!X.xequeMate(pos));
  });

  await teste("roque move a torre e tira os direitos", () => {
    const pos = fen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const roque = uci(pos, "e1g1");
    assert.ok(roque.roque);
    assert.equal(X.paraFen(X.aplicar(pos, roque)), "r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1");
    const grande = X.aplicar(fen("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1"), uci(fen("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1"), "e8c8"));
    assert.equal(X.paraFen(grande), "2kr3r/8/8/8/8/8/8/R3K2R w KQ - 1 2");
  });

  await teste("não roca passando por casa atacada nem estando em xeque", () => {
    const pos = fen("4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1"); // a torre em f8 ataca f1
    assert.equal(X.lanceUci(pos, "e1g1"), null);
    assert.ok(X.lanceUci(pos, "e1c1"));
    const emXeque = fen("4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    assert.equal(X.lanceUci(emXeque, "e1g1"), null);
    assert.equal(X.lanceUci(emXeque, "e1c1"), null);
  });

  await teste("mover a torre tira só o roque daquele lado", () => {
    const pos = fen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    assert.equal(X.paraFen(X.aplicar(pos, uci(pos, "h1h2"))), "r3k2r/8/8/8/8/8/7R/R3K3 b Qkq - 1 1");
    // Capturar a torre de a8 tira o roque grande das pretas
    const captura = fen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    assert.equal(X.paraFen(X.aplicar(captura, uci(captura, "a1a8"))), "R3k2r/8/8/8/8/8/8/4K2R b Kk - 0 1");
  });

  await teste("en passant remove o peão capturado", () => {
    const pos = fen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    const l = uci(pos, "e5d6");
    assert.ok(l.enPassant && l.captura);
    assert.equal(X.paraFen(X.aplicar(pos, l)), "4k3/8/3P4/8/8/8/8/4K3 b - - 0 1");
  });

  await teste("en passant que deixaria o rei em xeque não é legal", () => {
    // Capturar em c6 tiraria os dois peões da quinta fileira e abriria a torre de h5 até o rei em a5
    const pos = fen("8/8/8/KPp4r/8/8/8/7k w - c6 0 1");
    assert.equal(X.lanceUci(pos, "b5c6"), null);
  });

  await teste("promoção exige a peça e aceita subpromoção", () => {
    const pos = fen("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    assert.equal(X.encontrarLance(pos, casa("a7"), casa("a8")), null, "sem peça, a promoção não casa");
    assert.ok(X.ehPromocao(pos, casa("a7"), casa("a8")));
    const cavalo = X.encontrarLance(pos, casa("a7"), casa("a8"), "n");
    assert.equal(X.aplicar(pos, cavalo).casas[casa("a8")], "N");
    assert.equal(X.lanceUci(pos, "a7a8"), null);
    assert.equal(X.lanceUci(pos, "a7a8k"), null);
    assert.equal(X.uciDe(uci(pos, "a7a8r")), "a7a8r");
  });

  await teste("peça da promoção é ignorada em lances comuns", () => {
    const pos = fen(X.FEN_INICIAL);
    assert.ok(X.encontrarLance(pos, casa("e2"), casa("e4"), "q"));
    assert.ok(!X.ehPromocao(pos, casa("e2"), casa("e4")));
  });

  await teste("peça cravada não pode sair da linha", () => {
    const pos = fen("4r1k1/8/8/8/8/8/4B3/4K3 w - - 0 1");
    assert.equal(X.lancesDaCasa(pos, casa("e2")).length, 0);
    assert.ok(!X.xequeMate(pos));
  });

  await teste("casas, nomes e peças", () => {
    assert.equal(X.casaDoNome("a1"), 0);
    assert.equal(X.casaDoNome("h8"), 63);
    assert.equal(X.casaDoNome("e4"), 28);
    assert.equal(X.nomeDaCasa(28), "e4");
    assert.equal(X.casaDoNome("i1"), null);
    assert.equal(X.casaDoNome("a9"), null);
    assert.equal(X.nomeDaPeca("N"), "cavalo branco");
    assert.equal(X.nomeDaPeca("q"), "dama preta");
    assert.equal(X.nomeDaPeca("R"), "torre branca");
    assert.equal(X.nomeDaPeca("k"), "rei preto");
  });

  await teste("UCI malformado não vira lance", () => {
    const pos = fen(X.FEN_INICIAL);
    for (const texto of ["", "e2", "e2e9", "e2e4x", "z2e4", "e2e5", null]) assert.equal(X.lanceUci(pos, texto), null, String(texto));
  });

  // ---------- SAN (SanTest.kt) ----------

  await teste("SAN desambigua pela coluna, depois pela fileira, depois pelas duas", () => {
    assert.equal(sanEn("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1", "b1d2"), "Nbd2");
    assert.equal(sanEn("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1", "f3d2"), "Nfd2");
    assert.equal(sanEn("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1", "a1a3"), "R1a3");
    assert.equal(sanEn("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1", "a5a3"), "R5a3");
    assert.equal(sanEn("4k3/8/8/8/8/Q7/8/Q1Q1K3 w - - 0 1", "a1b2"), "Qa1b2");
    assert.equal(sanEn("4k3/8/8/8/8/Q7/8/Q1Q1K3 w - - 0 1", "a3b2"), "Q3b2");
    assert.equal(sanEn("4k3/8/8/8/8/Q7/8/Q1Q1K3 w - - 0 1", "c1b2"), "Qcb2");
  });

  await teste("SAN: peça cravada não pede desambiguação", () => {
    assert.equal(sanEn("4k3/8/8/b7/8/2N5/8/4K1N1 w - - 0 1", "g1e2"), "Ne2");
  });

  await teste("SAN com letras em português, roque, promoção, en passant, xeque e mate", () => {
    const pos = fen("r3k2r/pPpp1ppp/8/8/8/8/PPPP1PPP/R3K1NR w KQkq - 0 1");
    assert.equal(X.san(pos, uci(pos, "g1f3")), "Cf3");
    assert.equal(X.san(pos, uci(pos, "b7a8q")), "bxa8=D+");
    assert.equal(X.san(pos, uci(pos, "b7b8n")), "b8=C");
    assert.equal(X.san(pos, uci(pos, "e1c1")), "O-O-O");
    const ep = fen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    assert.equal(X.san(ep, uci(ep, "e5d6")), "exd6");
    const mate = fen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
    assert.equal(X.san(mate, uci(mate, "a1a8")), "Ta8#");
    assert.equal(X.san(mate, uci(mate, "g1f2")), "Rf2");
  });

  await teste("SAN lido de volta, com variações comuns", () => {
    const pos = fen("r3k2r/pPpp1ppp/8/8/8/8/PPPP1PPP/R3K1NR w KQkq - 0 1");
    const L = X.LETRAS_EN;
    const deSan = (t) => {
      const l = X.lanceSan(pos, t, L);
      return l && X.uciDe(l);
    };
    assert.equal(deSan("Nf3"), "g1f3");
    assert.equal(deSan("Ngf3"), "g1f3");
    assert.equal(deSan("Ng1f3"), "g1f3");
    assert.equal(deSan("Nf3!?"), "g1f3");
    assert.equal(deSan("bxa8=Q+"), "b7a8q");
    assert.equal(deSan("bxa8N"), "b7a8n");
    assert.equal(deSan("b8=r"), "b7b8r");
    assert.equal(deSan("b8"), "b7b8q");
    assert.equal(deSan("0-0-0"), "e1c1");
    assert.equal(deSan("O-O"), null); // o cavalo de g1 bloqueia o roque pequeno
    assert.equal(deSan("Nxf3"), "g1f3");
    assert.equal(deSan("Qd4"), null);
    assert.equal(deSan(""), null);
    assert.equal(deSan("Nf3=Q"), null);
    assert.equal(X.uciDe(X.lanceSan(pos, "Cf3")), "g1f3");
    assert.equal(X.uciDe(X.lanceSan(pos, "bxa8=D")), "b7a8q");
    const cavalos = fen("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1");
    assert.equal(X.lanceSan(cavalos, "Nd2", L), null, "ambíguo");
    assert.equal(X.uciDe(X.lanceSan(cavalos, "Nbd2", L)), "b1d2");
  });

  await teste("SAN em partidas aleatórias: único em cada posição e lido de volta igual", () => {
    const aleatorio = sorteador(1981);
    for (let partida = 0; partida < 60; partida++) {
      let pos = fen(X.FEN_INICIAL);
      for (let meio = 0; meio < 160; meio++) {
        const legais = X.lancesLegais(pos);
        if (!legais.length) break;
        const vistos = new Set();
        for (const l of legais) {
          for (const letras of [X.LETRAS_PT, X.LETRAS_EN]) {
            const texto = X.san(pos, l, letras);
            const volta = X.lanceSan(pos, texto, letras);
            assert.ok(volta && X.uciDe(volta) === X.uciDe(l), `${texto} em ${X.paraFen(pos)}`);
            if (letras === X.LETRAS_PT) {
              assert.ok(!vistos.has(texto), `SAN repetido ${texto} em ${X.paraFen(pos)}`);
              vistos.add(texto);
            }
          }
        }
        pos = X.aplicar(pos, legais[Math.floor(aleatorio() * legais.length)]);
      }
    }
  });

  await teste("texto dos lances com números", () => {
    const pos = fen(X.FEN_INICIAL);
    const linha = X.criarLinha(pos, ["e2e4", "e7e5", "g1f3"].reduce((acc, t) => {
      const atual = acc.pos;
      const l = uci(atual, t);
      return { pos: X.aplicar(atual, l), lances: [...acc.lances, l] };
    }, { pos, lances: [] }).lances);
    assert.equal(X.textoDosLances(linha.lances), "1. e4 e5 2. Cf3");
    const pretas = X.criarLinha(fen("r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24"));
    pretas.jogar(uci(pretas.posicao, "f2g3"));
    pretas.jogar(uci(pretas.posicao, "e6e7"));
    assert.equal(X.textoDosLances(pretas.lances), "24... Bxg3 25. Txe7");
  });

  await teste("linha de lances: voltar, avançar e cortar com um lance novo", () => {
    const linha = X.criarLinha(fen(X.FEN_INICIAL));
    linha.jogar(uci(linha.posicao, "e2e4"));
    linha.jogar(uci(linha.posicao, "e7e5"));
    assert.equal(linha.total, 2);
    assert.ok(linha.voltar());
    assert.equal(linha.cursor, 1);
    assert.equal(X.uciDe(linha.ultimo.lance), "e2e4");
    assert.ok(linha.podeAvancar);
    linha.jogar(uci(linha.posicao, "c7c5"));
    assert.equal(linha.total, 2);
    assert.ok(!linha.podeAvancar);
    linha.inicio();
    assert.equal(X.paraFen(linha.posicao), X.FEN_INICIAL);
    assert.ok(!linha.voltar());
    linha.fim();
    assert.equal(linha.ultimo.san, "c5");
  });

  // ---------- Sessão do puzzle (PuzzleSessionTest.kt) ----------

  await teste("o adversário joga primeiro e quem resolve encontra a linha", () => {
    const s = X.criarSessao(HANGING_PIECE);
    assert.equal(s.lado, "w");
    assert.equal(s.etapa, "adversario");
    assert.equal(s.legais.length, 0);
    assert.equal(s.jogarAdversario().san, "Bxg3");
    assert.equal(s.etapa, "solucionador");
    assert.ok(s.legais.length > 0);
    assert.equal(s.enviar(uci(s.posicao, "e6e7")).tipo, "certo");
    assert.equal(s.lancesFeitos, 1);
    assert.equal(s.jogarAdversario().san, "Db1+");
    assert.equal(s.enviar(uci(s.posicao, "b3c1")).tipo, "certo");
    s.jogarAdversario();
    const ultimo = s.enviar(uci(s.posicao, "h6c1"));
    assert.equal(ultimo.tipo, "resolvido");
    assert.equal(ultimo.jogado.san, "Dxc1");
    assert.ok(s.terminou);
    assert.ok(!s.falhou);
    assert.equal(s.lancesFeitos, 3);
    assert.equal(s.lancesTotais, 3);
    assert.equal(s.jogados.length, 6);
    assert.equal(s.legais.length, 0);
  });

  await teste("um lance errado não fica no tabuleiro e a tentativa falha", () => {
    const s = X.criarSessao(ENDGAME_PIN);
    s.jogarAdversario();
    const antes = X.paraFen(s.posicao);
    const r = s.enviar(uci(s.posicao, "b6d6"));
    assert.equal(r.tipo, "errado");
    assert.equal(X.uciDe(r.lance), "b6d6");
    assert.equal(X.paraFen(s.posicao), antes);
    assert.equal(s.erros, 1);
    assert.ok(s.falhou);
    assert.equal(s.etapa, "solucionador");
    s.enviar(uci(s.posicao, "f8d8"));
    s.jogarAdversario();
    assert.equal(s.enviar(uci(s.posicao, "f6d8")).tipo, "resolvido");
    assert.ok(s.terminou);
    assert.ok(s.falhou);
  });

  await teste("outro xeque-mate também resolve", () => {
    const s = X.criarSessao(BACK_RANK);
    s.jogarAdversario();
    const r = s.enviar(uci(s.posicao, "b1b8"));
    assert.equal(r.tipo, "resolvido");
    assert.ok(r.jogado.san.endsWith("#"));
    assert.ok(s.terminou);
    assert.ok(!s.falhou);
  });

  await teste("num puzzle de mate, um lance que não dá mate está errado", () => {
    const s = X.criarSessao(BACK_RANK);
    s.jogarAdversario();
    assert.equal(s.enviar(uci(s.posicao, "a1a6")).tipo, "errado");
    assert.equal(s.enviar(uci(s.posicao, "a1a8")).tipo, "resolvido");
    assert.ok(s.falhou);
  });

  await teste("a dica aponta a peça e conta uma vez só", () => {
    const s = X.criarSessao(HANGING_PIECE);
    s.jogarAdversario();
    assert.equal(s.mostrarDica(), casa("e6"));
    assert.equal(s.mostrarDica(), casa("e6"));
    assert.equal(s.dica, casa("e6"));
    assert.ok(s.falhou);
    s.enviar(uci(s.posicao, "e6e7"));
    assert.equal(s.dica, null);
  });

  await teste("a solução joga o resto da linha", () => {
    const s = X.criarSessao(HANGING_PIECE);
    s.jogarAdversario();
    s.enviar(uci(s.posicao, "e6e7"));
    const sans = [];
    while (!s.terminou) sans.push(s.jogarSolucao().san);
    assert.deepEqual(sans, ["Db1+", "Cc1", "Dxc1+", "Dxc1"]);
    assert.ok(s.falhou);
    assert.throws(() => s.jogarSolucao());
  });

  await teste("lances só na vez de quem resolve", () => {
    const s = X.criarSessao(HANGING_PIECE);
    const pos = s.posicao;
    assert.throws(() => s.enviar(uci(X.aplicar(pos, uci(pos, "f2g3")), "e6e7")));
    assert.throws(() => s.mostrarDica());
    s.jogarAdversario();
    assert.throws(() => s.jogarAdversario());
    assert.throws(() => s.enviar({ de: casa("e6"), para: casa("e8"), promocao: null }), /ilegal/);
  });

  await teste("posicaoApos não mexe na sessão", () => {
    const s = X.criarSessao(ENDGAME_PIN);
    s.jogarAdversario();
    const antes = X.paraFen(s.posicao);
    const depois = s.posicaoApos(uci(s.posicao, "b6d6"));
    assert.equal(X.paraFen(s.posicao), antes);
    assert.equal(depois.casas[casa("b6")], null);
    assert.equal(s.etapa, "solucionador");
  });

  await teste("a linha do fim vai e volta pelos lances jogados", () => {
    const s = X.criarSessao(BACK_RANK);
    s.jogarAdversario();
    s.enviar(uci(s.posicao, "a1a8"));
    const linha = s.linha();
    assert.equal(linha.cursor, 2);
    linha.inicio();
    assert.equal(X.paraFen(linha.posicao), BACK_RANK.fen);
  });

  await teste("puzzles com defeito são recusados", () => {
    assert.throws(() => X.criarSessao(X.lerPuzzle("bad1|6k1/p4ppp/8/8/8/8/5PPP/RR4K1 b - - 0 1|a7a6 a1h8|800|mate")), /ilegal/);
    assert.throws(() => X.criarSessao(X.lerPuzzle("bad2|not a fen|a7a6 a1a8|800|mate")), /FEN/);
    assert.throws(() => X.lerPuzzle("bad3|6k1/8/8/8/8/8/8/6K1 w - - 0 1|g1g2|800|x"), /inválido/);
    assert.throws(() => X.lerPuzzle("só|três|campos"), /inválida/);
  });

  await teste("linha do app (com jogadas) também é lida", () => {
    const p = X.lerPuzzle("u03BB|rn2kbnr/ppp2ppp/1q2p3/5b2/3P4/1PN2N2/P1PB1PPP/R2QKB1R b KQkq - 0 7|b8c6 c3a4 b6d4 f3d4|1829|7596|crushing opening short trappedPiece");
    assert.equal(p.rating, 1829);
    assert.deepEqual(p.temas, ["crushing", "opening", "short", "trappedPiece"]);
    assert.equal(p.lances.length, 4);
  });

  // ---------- Glicko-2 (Glicko2Test.kt) ----------

  await teste("Glicko-2 bate com o exemplo do artigo de Glickman", () => {
    const jogador = { rating: 1500, desvio: 200, volatilidade: 0.06 };
    const jogos = [
      { adversario: { rating: 1400, desvio: 30 }, pontos: 1 },
      { adversario: { rating: 1550, desvio: 100 }, pontos: 0 },
      { adversario: { rating: 1700, desvio: 300 }, pontos: 0 },
    ];
    const r = X.atualizarGlicko(jogador, jogos, 0, 0.5);
    assert.ok(Math.abs(r.rating - 1464.06) < 0.05, r.rating);
    assert.ok(Math.abs(r.desvio - 151.52) < 0.05, r.desvio);
    assert.ok(Math.abs(r.volatilidade - 0.05999) < 0.00001, r.volatilidade);
  });

  await teste("um jogador novo anda rápido e fica menos provisório", () => {
    const inicio = X.novoRating();
    assert.ok(X.provisorio(inicio));
    const vitoria = X.ratingAposPuzzle(inicio, 1500, true);
    const derrota = X.ratingAposPuzzle(inicio, 1500, false);
    assert.ok(Math.abs(vitoria.rating - 1675) <= 10, vitoria.rating);
    assert.ok(Math.abs(derrota.rating - 1325) <= 10, derrota.rating);
    assert.ok(vitoria.desvio < inicio.desvio);
  });

  await teste("um rating estabelecido anda pouco", () => {
    let r = X.novoRating();
    for (let i = 0; i < 60; i++) r = X.ratingAposPuzzle(r, 1500, i % 2 === 0);
    assert.ok(!X.provisorio(r));
    const vitoria = X.ratingAposPuzzle(r, Math.trunc(r.rating), true);
    const variacao = vitoria.rating - r.rating;
    assert.ok(variacao >= 3 && variacao <= 20, variacao);
  });

  await teste("resolver um puzzle mais difícil vale mais", () => {
    const jogador = { rating: 1500, desvio: 80, volatilidade: 0.06 };
    const facil = X.ratingAposPuzzle(jogador, 1200, true).rating - jogador.rating;
    const dificil = X.ratingAposPuzzle(jogador, 1800, true).rating - jogador.rating;
    assert.ok(dificil > facil);
    assert.ok(facil > 0);
  });

  await teste("tempo parado alarga o desvio", () => {
    const jogador = { rating: 1500, desvio: 60, volatilidade: 0.06 };
    const logo = X.ratingAposPuzzle(jogador, 1500, true);
    const depois = X.ratingAposPuzzle(jogador, 1500, true, 365);
    assert.ok(depois.rating - jogador.rating > logo.rating - jogador.rating);
  });

  await teste("o desvio fica nos limites", () => {
    let r = { rating: 1500, desvio: 50, volatilidade: 0.03 };
    for (let i = 0; i < 200; i++) r = X.ratingAposPuzzle(r, 1500, i % 2 === 0);
    assert.ok(r.desvio >= X.GLICKO.DESVIO_MINIMO);
    const parado = X.atualizarGlicko({ rating: 1500, desvio: 340, volatilidade: 0.06 }, [], 10000);
    assert.equal(parado.desvio, X.GLICKO.DESVIO_MAXIMO);
  });

  await teste("pontuação esperada é meio a meio com ratings iguais", () => {
    const a = { rating: 1500, desvio: 100 };
    assert.ok(Math.abs(X.pontuacaoEsperada(a, a) - 0.5) < 1e-9);
    assert.ok(X.pontuacaoEsperada({ rating: 1800, desvio: 350 }, { rating: 1500, desvio: 75 }) > 0.8);
  });

  // ---------- Escolha do puzzle (PuzzleSelectionTest.kt) ----------

  await teste("o alvo segue a dificuldade e fica onde há puzzles", () => {
    assert.equal(X.ratingAlvo(1500.4, "normal"), 1500);
    assert.equal(X.ratingAlvo(1500, "mais-dificil"), 2100);
    assert.equal(X.ratingAlvo(1500, "facil"), 1200);
    assert.equal(X.ratingAlvo(500, "mais-facil"), X.ALVO_MINIMO);
    assert.equal(X.ratingAlvo(3000, "mais-dificil"), X.ALVO_MAXIMO);
    assert.equal(X.ratingAlvo(1500, "inexistente"), 1500);
  });

  await teste("as faixas se alargam até cobrir qualquer rating", () => {
    const faixas = X.faixasRating(1500);
    assert.deepEqual(faixas[0], [1400, 1600]);
    for (let i = 1; i < faixas.length; i++) {
      assert.ok(faixas[i][0] <= faixas[i - 1][0] && faixas[i][1] >= faixas[i - 1][1]);
    }
    const ultima = faixas[faixas.length - 1];
    assert.ok(ultima[0] <= 0 && ultima[1] >= 3500);
  });

  const indiceFalso = {
    blocos: [
      { arquivo: "a", min: 1000, max: 1099, temas: { fork: 1, mate: 1 } },
      { arquivo: "b", min: 1100, max: 1199, temas: { mate: 2 } },
      { arquivo: "c", min: 1500, max: 1599, temas: { fork: 1 } },
    ],
  };
  const puzzlesFalsos = {
    a: [{ id: "a1", rating: 1050, temas: ["fork", "mate"] }],
    b: [{ id: "b1", rating: 1110, temas: ["mate"] }, { id: "b2", rating: 1190, temas: ["mate"] }],
    c: [{ id: "c1", rating: 1550, temas: ["fork"] }],
  };
  const carregados = [];
  const carregar = async (b) => {
    carregados.push(b.arquivo);
    return puzzlesFalsos[b.arquivo];
  };

  await teste("blocos da faixa, do mais perto ao mais longe, só com o tema", () => {
    assert.deepEqual(X.blocosDaFaixa(indiceFalso, 1050, 1250).map((b) => b.arquivo), ["b", "a"]);
    assert.deepEqual(X.blocosDaFaixa(indiceFalso, 900, 1300, "fork").map((b) => b.arquivo), ["a"]);
    assert.deepEqual(X.blocosDaFaixa(indiceFalso, 0, Infinity, "fork").map((b) => b.arquivo), ["a", "c"]);
  });

  await teste("escolhe primeiro um puzzle não tentado perto do alvo", async () => {
    carregados.length = 0;
    const p = await X.escolherPuzzle({ indice: indiceFalso, carregar, alvo: 1150, tentativas: {}, aleatorio: () => 0 });
    assert.equal(p.id, "b1");
    assert.deepEqual(carregados, ["b", "a"]);
  });

  await teste("com os de perto tentados, alarga a faixa antes de repetir", async () => {
    const tentativas = { b1: { t: 5 }, b2: { t: 9 } };
    const p = await X.escolherPuzzle({ indice: indiceFalso, carregar, alvo: 1150, tema: "mate", tentativas, aleatorio: () => 0 });
    assert.equal(p.id, "a1");
  });

  await teste("com tudo tentado, repete o tentado há mais tempo", async () => {
    const tentativas = { a1: { t: 7 }, b1: { t: 5 }, b2: { t: 9 } };
    const p = await X.escolherPuzzle({ indice: indiceFalso, carregar, alvo: 1150, tema: "mate", tentativas });
    assert.equal(p.id, "b1");
    const semRepetir = await X.escolherPuzzle({ indice: indiceFalso, carregar, alvo: 1150, tema: "mate", tentativas, excluir: "b1" });
    assert.equal(semRepetir.id, "a1");
  });

  await teste("tema raro procura longe do alvo, e sem tema nenhum devolve null", async () => {
    const p = await X.escolherPuzzle({ indice: indiceFalso, carregar, alvo: 2000, tema: "fork", tentativas: {}, aleatorio: () => 0 });
    assert.equal(p.id, "c1");
    assert.equal(await X.escolherPuzzle({ indice: indiceFalso, carregar, alvo: 1500, tema: "zugzwang" }), null);
  });

  await teste("revisão: falhas cuja última tentativa falhou, da mais antiga para a mais nova", () => {
    const t = { x: { t: 30, ok: false, b: "r1" }, y: { t: 10, ok: false, b: "r2" }, z: { t: 20, ok: true, b: "r1" } };
    assert.deepEqual(X.errosParaRevisar(t).map((e) => e.id), ["y", "x"]);
    assert.deepEqual(X.errosParaRevisar(t, "y"), [{ id: "x", bloco: "r1" }]);
  });

  // ---------- Registro das tentativas ----------

  await teste("só a primeira tentativa no modo normal muda o rating", () => {
    const p = { id: "p1", rating: 1500 };
    let estado = { rating: X.novoRating(), tentativas: {}, estatisticas: X.estatisticasVazias(), historico: [] };
    const r1 = X.registrarTentativa(estado, { puzzle: p, bloco: "blocos/r1500.json", resolvido: true, agora: 1000 });
    assert.ok(r1.delta > 150 && r1.delta < 200, r1.delta);
    assert.equal(r1.rating.t, 1000);
    assert.equal(r1.estatisticas.sequencia, 1);
    assert.deepEqual(r1.tentativas.p1, { t: 1000, ok: true, b: "blocos/r1500.json" });
    estado = r1;
    const r2 = X.registrarTentativa(estado, { puzzle: p, bloco: "blocos/r1500.json", resolvido: false, agora: 2000 });
    assert.equal(r2.delta, null);
    assert.equal(r2.rating.rating, r1.rating.rating);
    assert.equal(r2.estatisticas.sequencia, 0);
    assert.equal(r2.estatisticas.melhor, 1);
    assert.equal(r2.estatisticas.tentados, 2);
    assert.equal(r2.estatisticas.resolvidos, 1);
    assert.equal(r2.historico.length, 2);
    assert.equal(r2.historico[0].ok, false);
    const revisao = X.registrarTentativa(r2, { puzzle: { id: "p2", rating: 900 }, bloco: "b", resolvido: false, modo: "revisao", agora: 3000 });
    assert.equal(revisao.delta, null);
  });

  await teste("a sequência conta os resolvidos seguidos e guarda o recorde", () => {
    let estado = {};
    for (const [i, ok] of [true, true, true, false, true].entries()) {
      estado = X.registrarTentativa(estado, { puzzle: { id: `q${i}`, rating: 1200 }, bloco: "b", resolvido: ok, agora: i * 1000 });
    }
    assert.deepEqual(estado.estatisticas, { tentados: 5, resolvidos: 4, sequencia: 1, melhor: 3 });
  });

  await teste("o tempo parado desde o último puzzle entra no cálculo", () => {
    const antes = { rating: 1500, desvio: 60, volatilidade: 0.06, t: 1 };
    const logo = X.registrarTentativa({ rating: antes }, { puzzle: { id: "a", rating: 1500 }, resolvido: true, agora: 1000 });
    const ano = X.registrarTentativa({ rating: antes }, { puzzle: { id: "a", rating: 1500 }, resolvido: true, agora: 365 * 86400000 });
    assert.ok(ano.rating.rating > logo.rating.rating);
  });

  await teste("o que vem do localStorage é validado", () => {
    assert.equal(X.validarRating(null), null);
    assert.equal(X.validarRating({ rating: "1500", desvio: 100, volatilidade: 0.06 }), null);
    assert.equal(X.validarRating({ rating: 1500, desvio: 1000, volatilidade: 0.06 }), null);
    assert.deepEqual(X.validarRating({ rating: 1600, desvio: 80, volatilidade: 0.05, t: 9, lixo: 1 }), { rating: 1600, desvio: 80, volatilidade: 0.05, t: 9 });
    assert.deepEqual(X.validarTentativas({ a: { t: 1, ok: true, b: "x" }, b: { t: "1", ok: true }, c: null }), { a: { t: 1, ok: true, b: "x" } });
    assert.deepEqual(X.validarTentativas([1, 2]), {});
    assert.deepEqual(X.validarEstatisticas({ tentados: 3, resolvidos: 9, sequencia: 2, melhor: 1 }), { tentados: 3, resolvidos: 3, sequencia: 2, melhor: 2 });
    assert.deepEqual(X.validarEstatisticas("x"), X.estatisticasVazias());
    assert.deepEqual(X.validarHistorico([{ id: "a", rating: 1000, ok: true, delta: 5, t: 1 }, { id: 3 }]), [{ id: "a", rating: 1000, ok: true, delta: 5, t: 1 }]);
  });

  // ---------- Temas ----------

  await teste("todo tema dos grupos tem nome, e os destaques estão nos grupos", () => {
    const dosGrupos = X.GRUPOS_TEMAS.flatMap((g) => g.temas);
    assert.equal(new Set(dosGrupos).size, dosGrupos.length, "tema repetido nos grupos");
    for (const tema of dosGrupos) assert.ok(X.NOMES_TEMAS[tema], tema);
    for (const tema of X.TEMAS_DESTAQUE) assert.ok(dosGrupos.includes(tema), tema);
    for (const tema of Object.keys(X.DESCRICOES_TEMAS)) assert.ok(dosGrupos.includes(tema), tema);
    assert.equal(X.nomeDoTema("fork"), "Garfo");
    assert.equal(X.nomeDoTema("newThemeIn2"), "New theme in 2");
  });

  // ---------- Os puzzles do site ----------

  const pasta = path.join(__dirname, "..", "..", "assets", "jogos", "puzzles-de-xadrez");
  const indice = JSON.parse(fs.readFileSync(path.join(pasta, "indice.json"), "utf8"));
  const blocos = new Map();
  for (const b of indice.blocos) {
    const conteudo = fs.readFileSync(path.join(pasta, b.arquivo));
    blocos.set(b.arquivo, { conteudo, linhas: JSON.parse(conteudo.toString("utf8")) });
  }

  await teste("o índice bate com os blocos (contagens, ratings, hash) e tudo cabe em 3 MB", () => {
    let total = 0;
    let bytes = fs.statSync(path.join(pasta, "indice.json")).size;
    const temas = {};
    for (const b of indice.blocos) {
      const { conteudo, linhas } = blocos.get(b.arquivo);
      bytes += conteudo.length;
      assert.equal(crypto.createHash("sha1").update(conteudo).digest("hex").slice(0, 10), b.v, b.arquivo);
      assert.equal(linhas.length, b.total, b.arquivo);
      const puzzles = linhas.map(X.lerPuzzle);
      assert.equal(Math.min(...puzzles.map((p) => p.rating)), b.min);
      assert.equal(Math.max(...puzzles.map((p) => p.rating)), b.max);
      const contagem = {};
      for (const p of puzzles) for (const t of p.temas) contagem[t] = (contagem[t] ?? 0) + 1;
      assert.deepEqual(contagem, b.temas, b.arquivo);
      for (const [t, n] of Object.entries(contagem)) temas[t] = (temas[t] ?? 0) + n;
      total += linhas.length;
    }
    assert.equal(total, indice.total);
    assert.deepEqual(temas, indice.temas);
    assert.ok(total >= 3000, `${total} puzzles`);
    assert.ok(bytes <= 3 * 1024 * 1024, `${bytes} bytes`);
    assert.equal(indice.licenca, "CC0-1.0");
  });

  await teste("todo tema dos puzzles tem nome e está num grupo, com puzzles em todos os temas oferecidos", () => {
    const dosGrupos = new Set(X.GRUPOS_TEMAS.flatMap((g) => g.temas));
    for (const tema of Object.keys(indice.temas)) {
      assert.ok(X.NOMES_TEMAS[tema], `sem nome: ${tema}`);
      assert.ok(dosGrupos.has(tema), `fora dos grupos: ${tema}`);
    }
    for (const tema of dosGrupos) assert.ok((indice.temas[tema] ?? 0) >= 20, `poucos puzzles de ${tema}`);
  });

  await teste("a solução de todos os puzzles do site é legal, e os de mate terminam em mate", () => {
    const ids = new Set();
    let puzzles = 0;
    for (const { linhas } of blocos.values()) {
      for (const linha of linhas) {
        const p = X.lerPuzzle(linha);
        assert.ok(!ids.has(p.id), `id repetido ${p.id}`);
        ids.add(p.id);
        const s = X.criarSessao(p); // confere cada lance
        while (!s.terminou) {
          if (s.etapa === "adversario") s.jogarAdversario();
          else assert.equal(s.enviar(X.lanceUci(s.posicao, s.solucao[s.jogados.length])).tipo === "errado", false, p.id);
        }
        assert.ok(!s.falhou, p.id);
        if (p.temas.includes("mate")) assert.ok(X.xequeMate(s.posicao), `${p.id} deveria terminar em mate`);
        const m = /^mateIn(\d)$/.exec(p.temas.find((t) => /^mateIn\d$/.test(t)) ?? "");
        if (m && m[1] !== "5") assert.equal(s.lancesTotais, Number(m[1]), p.id);
        puzzles++;
      }
    }
    assert.equal(puzzles, indice.total);
  });

  console.log(`\n${total - falhas} de ${total} testes passaram`);
  if (falhas) process.exit(1);
})();
