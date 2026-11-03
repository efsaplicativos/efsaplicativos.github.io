"use strict";
// Mesmos casos de app/src/test/.../{Pontuacao,Jogo,Recordes,CodecPartida}Test.kt do app Cores da Memória.
const assert = require("node:assert/strict");
const C = require("../../assets/jogos/cores-da-memoria-logica.js");

const { NIVEIS: N, FASES: F, RESULTADOS: R } = C;

function semente(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const aguardando = (cores, nivel = N.normal) => ({
  ...C.estadoInicial(nivel),
  sequencia: cores,
  rodada: cores.length,
  fase: F.AGUARDANDO,
});

const testes = {
  // ---------- PontuacaoTest.kt ----------
  "sem bônus até o combo 3"() {
    for (let combo = 1; combo <= 3; combo++) {
      assert.equal(C.pontosDaRodada(combo, N.facil), 10);
      assert.equal(C.pontosDaRodada(combo, N.normal), 15);
      assert.equal(C.pontosDaRodada(combo, N.dificil), 20);
      assert.equal(C.pontosDaRodada(combo, N.expert), 30);
    }
  },
  "bônus de combo igual ao do app, com o mesmo arredondamento"() {
    assert.equal(C.pontosDaRodada(4, N.facil), 15);
    assert.equal(C.pontosDaRodada(4, N.normal), 23); // 22,5 arredonda para cima
    assert.equal(C.pontosDaRodada(5, N.normal), 23);
    assert.equal(C.pontosDaRodada(6, N.normal), 45);
    assert.equal(C.pontosDaRodada(6, N.dificil), 60);
    assert.equal(C.pontosDaRodada(9, N.expert), 135);
  },
  "soma de uma partida de 6 rodadas no Normal"() {
    let total = 0;
    for (let combo = 1; combo <= 6; combo++) total += C.pontosDaRodada(combo, N.normal);
    assert.equal(total, 15 + 15 + 15 + 23 + 23 + 45);
  },
  "sequência acelera a cada 5 rodadas até o mínimo do nível"() {
    assert.equal(C.atrasoSequencia(N.normal, 1), 600);
    assert.equal(C.atrasoSequencia(N.normal, 4), 600);
    assert.equal(C.atrasoSequencia(N.normal, 5), 580);
    assert.equal(C.atrasoSequencia(N.normal, 12), 560);
    assert.equal(C.atrasoSequencia(N.normal, 500), 300);
    assert.equal(C.atrasoSequencia(N.expert, 100), 150);
    assert.equal(C.atrasoSequencia(N.facil, 1000), 400);
  },
  "chaves dos níveis são as do app"() {
    assert.deepEqual(Object.values(N).map((n) => n.chave), ["easy", "normal", "hard", "expert"]);
  },

  // ---------- JogoTest.kt ----------
  "novo jogo começa com uma cor, rodada 1 e as vidas do nível"() {
    for (const nivel of Object.values(N)) {
      const jogo = C.novo(nivel, "azul");
      assert.deepEqual(jogo.sequencia, ["azul"]);
      assert.equal(jogo.rodada, 1);
      assert.equal(jogo.vidas, nivel.vidas);
      assert.equal(jogo.pontos, 0);
      assert.equal(jogo.fase, F.MOSTRANDO);
    }
  },
  "sorteio usa as quatro cores"() {
    const aleatorio = semente(7);
    const sorteadas = new Set(Array.from({ length: 400 }, () => C.sortear(aleatorio)));
    assert.deepEqual([...sorteadas].sort(), [...C.CORES].sort());
  },
  "toque fora da vez do jogador é ignorado"() {
    const mostrando = { ...aguardando(["vermelho"]), fase: F.MOSTRANDO };
    const { estado, resultado } = C.tocar(mostrando, "vermelho", () => "azul");
    assert.equal(resultado, R.IGNORADO);
    assert.equal(estado, mostrando);
    for (const fase of [F.PRONTO, F.ACERTOU, F.ERROU, F.TEMPO_ESGOTADO, F.NOVA_CHANCE, F.PAUSADO, F.FIM]) {
      assert.equal(C.tocar({ ...mostrando, fase }, "vermelho", () => "azul").resultado, R.IGNORADO);
    }
  },
  "acerto parcial avança na sequência sem pontuar"() {
    const { estado, resultado } = C.tocar(aguardando(["verde", "azul"]), "verde", () => "amarelo");
    assert.equal(resultado, R.ACERTO);
    assert.equal(estado.acertos, 1);
    assert.equal(estado.pontos, 0);
    assert.equal(estado.fase, F.AGUARDANDO);
  },
  "completar a rodada pontua, soma combo e acrescenta exatamente uma cor"() {
    const inicio = { ...aguardando(["verde", "azul"]), acertos: 1 };
    const { estado, resultado } = C.tocar(inicio, "azul", () => "amarelo");
    assert.equal(resultado, R.RODADA_COMPLETA);
    assert.deepEqual(estado.sequencia, ["verde", "azul", "amarelo"]);
    assert.equal(estado.acertos, 0);
    assert.equal(estado.rodada, 3);
    assert.equal(C.rodadasCompletas(estado), 2);
    assert.equal(estado.combo, 1);
    assert.equal(estado.maiorCombo, 1);
    assert.equal(estado.pontos, 15);
    assert.equal(estado.fase, F.ACERTOU);
  },
  "cor errada em qualquer posição é erro e zera o combo"() {
    const inicio = { ...aguardando(["verde", "azul", "azul"]), acertos: 2, combo: 4, maiorCombo: 4 };
    const { estado, resultado } = C.tocar(inicio, "vermelho", () => "amarelo");
    assert.equal(resultado, R.ERRO);
    assert.equal(estado.fase, F.ERROU);
    assert.equal(estado.combo, 0);
    assert.equal(estado.maiorCombo, 4);
    assert.equal(estado.sequencia.length, 3);
  },
  "perder vida repete a mesma sequência e a última vida encerra o jogo"() {
    const erro = { ...aguardando(["verde", "azul"]), fase: F.ERROU, vidas: 2, acertos: 1, pontos: 30 };
    const segunda = C.perderVida(erro);
    assert.equal(segunda.fase, F.NOVA_CHANCE);
    assert.equal(segunda.vidas, 1);
    assert.equal(segunda.acertos, 0);
    assert.deepEqual(segunda.sequencia, erro.sequencia);
    assert.equal(segunda.pontos, 30);
    const fim = C.perderVida({ ...segunda, fase: F.TEMPO_ESGOTADO });
    assert.equal(fim.fase, F.FIM);
    assert.equal(fim.vidas, 0);
    assert.equal(fim.pontos, 30);
  },
  "tempo esgotado só vale enquanto o jogador deveria responder"() {
    assert.equal(C.esgotarTempo(aguardando(["azul"])).fase, F.TEMPO_ESGOTADO);
    const mostrando = { ...aguardando(["azul"]), fase: F.MOSTRANDO };
    assert.equal(C.esgotarTempo(mostrando), mostrando);
  },
  "pausar durante a resposta guarda o progresso; durante a sequência, repete"() {
    const respondendo = C.pausar({ ...aguardando(["verde", "azul"]), acertos: 1 });
    assert.equal(respondendo.fase, F.PAUSADO);
    assert.ok(respondendo.retomarAguardando);
    assert.equal(respondendo.acertos, 1);
    const vendo = C.pausar({ ...aguardando(["verde", "azul"]), fase: F.MOSTRANDO });
    assert.equal(vendo.fase, F.PAUSADO);
    assert.equal(vendo.retomarAguardando, false);
    assert.equal(vendo.acertos, 0);
  },
  "pausar logo depois de errar ainda desconta a vida"() {
    const errou = { ...aguardando(["verde"]), fase: F.ERROU, vidas: 2 };
    const pausado = C.pausar(errou);
    assert.equal(pausado.fase, F.PAUSADO);
    assert.equal(pausado.vidas, 1);
    assert.equal(C.pausar({ ...errou, vidas: 1 }).fase, F.FIM);
  },
  "pausar fora da partida não muda nada"() {
    const pronto = C.estadoInicial(N.facil);
    assert.equal(C.pausar(pronto), pronto);
    const fim = { ...pronto, fase: F.FIM };
    assert.equal(C.pausar(fim), fim);
  },
  "partida repetindo sempre certo cresce uma cor por rodada"() {
    const aleatorio = semente(123);
    let jogo = C.aguardar(C.novo(N.facil, C.sortear(aleatorio)));
    for (let rodada = 0; rodada < 12; rodada++) {
      assert.equal(jogo.sequencia.length, rodada + 1);
      const anterior = jogo.sequencia;
      anterior.forEach((cor, i) => {
        const { estado, resultado } = C.tocar(jogo, cor, () => C.sortear(aleatorio));
        assert.equal(resultado, i === anterior.length - 1 ? R.RODADA_COMPLETA : R.ACERTO);
        jogo = estado;
      });
      assert.deepEqual(jogo.sequencia.slice(0, -1), anterior);
      jogo = C.aguardar(C.mostrar(jogo));
    }
    assert.equal(jogo.combo, 12);
    assert.equal(jogo.rodada, 13);
  },

  // ---------- RecordesTest.kt ----------
  "primeira partida com pontos é o recorde"() {
    const r = C.inserirRecorde([], { pontos: 30, rodadas: 2, maiorCombo: 2, dataMs: 100 });
    assert.equal(r.posicao, 1);
    assert.equal(C.melhor(r.tabela), 30);
  },
  "partida sem pontos não entra"() {
    const r = C.inserirRecorde([{ pontos: 10, dataMs: 1 }], { pontos: 0, rodadas: 0, maiorCombo: 0, dataMs: 2 });
    assert.equal(r.posicao, null);
    assert.equal(r.tabela.length, 1);
  },
  "ordena por pontos e, no empate, quem fez antes fica na frente"() {
    let tabela = [];
    for (const p of [{ pontos: 50, dataMs: 30 }, { pontos: 90, dataMs: 10 }, { pontos: 50, dataMs: 20 }]) {
      tabela = C.inserirRecorde(tabela, p).tabela;
    }
    assert.deepEqual(tabela.map((p) => p.dataMs), [10, 20, 30]);
    assert.equal(C.inserirRecorde(tabela, { pontos: 90, dataMs: 40 }).posicao, 2);
  },
  "guarda só as 10 melhores"() {
    let tabela = [];
    for (let k = 1; k <= 15; k++) tabela = C.inserirRecorde(tabela, { pontos: k * 10, dataMs: k }).tabela;
    assert.equal(tabela.length, 10);
    assert.equal(tabela[0].pontos, 150);
    assert.equal(tabela.at(-1).pontos, 60);
    const fraca = C.inserirRecorde(tabela, { pontos: 20, dataMs: 99 });
    assert.equal(fraca.posicao, null);
    assert.deepEqual(fraca.tabela, tabela);
    assert.equal(C.inserirRecorde(tabela, { pontos: 61, dataMs: 99 }).posicao, 10);
  },
  "recorde sem data vem antes no empate"() {
    const tabela = C.inserirRecorde([{ pontos: 40, dataMs: 5 }], { pontos: 40, dataMs: null }).tabela;
    assert.deepEqual(tabela.map((p) => p.dataMs), [null, 5]);
  },
  "recordes gravados com itens ruins são ignorados"() {
    assert.deepEqual(C.lerRecordes(null), []);
    assert.deepEqual(C.lerRecordes([{ pontos: 30, dataMs: 7 }, { pontos: 0 }, "x", { rodadas: 3 }]), [
      { pontos: 30, rodadas: null, maiorCombo: null, dataMs: 7 },
    ]);
  },

  // ---------- CodecPartidaTest.kt ----------
  "partida em andamento volta pausada com os mesmos dados"() {
    const jogo = {
      ...C.estadoInicial(N.facil),
      sequencia: ["azul", "vermelho", "amarelo", "verde"],
      acertos: 2,
      pontos: 45,
      vidas: 2,
      combo: 3,
      maiorCombo: 3,
      rodada: 4,
      fase: F.AGUARDANDO,
    };
    assert.equal(C.paraTexto(jogo), "4;45;2;3;3;3021");
    const restaurado = C.deTexto(C.paraTexto(jogo), N.facil);
    assert.equal(restaurado.fase, F.PAUSADO);
    assert.deepEqual(restaurado.sequencia, jogo.sequencia);
    assert.equal(restaurado.acertos, 0);
    assert.equal(restaurado.pontos, 45);
    assert.equal(restaurado.vidas, 2);
    assert.equal(restaurado.combo, 3);
    assert.equal(restaurado.rodada, 4);
  },
  "nada a guardar fora da partida"() {
    assert.equal(C.paraTexto(C.estadoInicial(N.normal)), null);
    assert.equal(C.paraTexto({ ...C.estadoInicial(N.normal), sequencia: ["azul"], rodada: 1, fase: F.FIM }), null);
  },
  "texto inválido é ignorado"() {
    for (const texto of [null, "", "a;b", "1;0;2;0;0;", "1;0;2;0;0;19", "0;0;2;0;0;01", "1;0;9;0;0;01", "1;-5;1;0;0;01"]) {
      assert.equal(C.deTexto(texto, N.normal), null, String(texto));
    }
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
