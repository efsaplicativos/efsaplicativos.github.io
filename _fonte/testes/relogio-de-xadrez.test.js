"use strict";
// Mesmos casos de RelogioXadrezTest.kt, FormatoTempoTest.kt e ConfiguracaoTempoTest.kt do app Relógio Xadrez.
const assert = require("node:assert/strict");
const X = require("../../assets/ferramentas/relogio-de-xadrez-logica.js");

const { BRANCAS, PRETAS } = X;
let total = 0;
function teste(nome, corpo) {
  corpo();
  total++;
}

/** Relógio falso: o tempo só anda quando o teste manda. */
function tempoFalso() {
  const t = { agoraMs: 1_000_000, avancar: (ms) => (t.agoraMs += ms) };
  return t;
}

function relogio(tempo, minutos = 5, incrementoS = 0, sistema = "nenhum") {
  return new X.Relogio(X.deMinutos(minutos, incrementoS, sistema), () => tempo.agoraMs);
}

// ---------- RelogioXadrezTest ----------

teste("começa pronto com o tempo inicial para os dois", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo, 3);
  assert.equal(r.estado, "pronto");
  assert.equal(r.restanteMs(BRANCAS), 180_000);
  assert.equal(r.restanteMs(PRETAS), 180_000);
  tempo.avancar(10_000);
  assert.equal(r.restanteMs(BRANCAS), 180_000);
});

teste("primeiro toque em qualquer metade inicia o relógio das brancas", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo);
  assert.equal(r.tocar(PRETAS), true);
  assert.equal(r.estado, "ativo");
  assert.equal(r.vez, BRANCAS);
  const outro = relogio(tempo);
  outro.tocar(BRANCAS);
  assert.equal(outro.vez, BRANCAS);
  assert.equal(outro.lances(BRANCAS), 0);
});

teste("desconta exatamente o tempo decorrido de quem está na vez", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo);
  r.iniciar();
  tempo.avancar(1_234);
  assert.equal(r.restanteMs(BRANCAS), 300_000 - 1_234);
  assert.equal(r.restanteMs(PRETAS), 300_000);
});

teste("muitos lances com tempos quebrados não acumulam erro", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo, 10);
  r.iniciar();
  let gastoBrancas = 0;
  let gastoPretas = 0;
  for (let i = 0; i < 60; i++) {
    const lanceBrancas = 1_000 + i * 37 + 3;
    tempo.avancar(lanceBrancas);
    gastoBrancas += lanceBrancas;
    r.tocar(BRANCAS);
    const lancePretas = 777 + i * 11;
    tempo.avancar(lancePretas);
    gastoPretas += lancePretas;
    r.tocar(PRETAS);
  }
  assert.equal(r.restanteMs(BRANCAS), 600_000 - gastoBrancas);
  assert.equal(r.restanteMs(PRETAS), 600_000 - gastoPretas);
  assert.equal(r.lances(BRANCAS), 60);
  assert.equal(r.lances(PRETAS), 60);
});

teste("toque na metade de quem não está na vez é ignorado", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo);
  r.iniciar();
  tempo.avancar(500);
  assert.equal(r.tocar(PRETAS), false);
  assert.equal(r.vez, BRANCAS);
  assert.equal(r.lances(PRETAS), 0);
});

teste("Fischer soma o incremento depois do lance", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo, 5, 2, "fischer");
  r.iniciar();
  tempo.avancar(500);
  r.tocar(BRANCAS);
  assert.equal(r.restanteMs(BRANCAS), 300_000 - 500 + 2_000);
  assert.equal(r.vez, PRETAS);
});

teste("Bronstein desconta durante o lance e devolve no máximo o incremento", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo, 5, 3, "bronstein");
  r.iniciar();
  tempo.avancar(2_000);
  assert.equal(r.restanteMs(BRANCAS), 298_000);
  r.tocar(BRANCAS);
  assert.equal(r.restanteMs(BRANCAS), 300_000);
  tempo.avancar(5_000);
  r.tocar(PRETAS);
  assert.equal(r.restanteMs(PRETAS), 300_000 - 5_000 + 3_000);
});

teste("Bronstein não salva quem fica sem tempo durante o lance", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo, 1, 5, "bronstein");
  r.iniciar();
  tempo.avancar(60_000);
  assert.equal(r.verificarQueda(), true);
  assert.equal(r.perdedor, BRANCAS);
});

teste("atraso só começa a descontar depois do atraso", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo, 5, 3, "atraso");
  r.iniciar();
  tempo.avancar(2_000);
  assert.equal(r.restanteMs(BRANCAS), 300_000);
  assert.equal(r.atrasoRestanteMs(), 1_000);
  tempo.avancar(2_500);
  assert.equal(r.restanteMs(BRANCAS), 298_500);
  r.tocar(BRANCAS);
  assert.equal(r.restanteMs(BRANCAS), 298_500);
  assert.equal(r.atrasoRestanteMs(), 3_000);
});

teste("pausar e retomar não renova o atraso do lance", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo, 5, 3, "atraso");
  r.iniciar();
  tempo.avancar(2_000);
  r.pausar();
  tempo.avancar(60_000);
  r.retomar();
  tempo.avancar(2_000);
  assert.equal(r.restanteMs(BRANCAS), 299_000);
});

teste("pausa congela o tempo e retomar continua de onde parou", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo);
  r.iniciar();
  tempo.avancar(10_000);
  r.pausar();
  assert.equal(r.estado, "pausado");
  tempo.avancar(120_000);
  assert.equal(r.restanteMs(BRANCAS), 290_000);
  assert.equal(r.tocar(BRANCAS), false);
  r.retomar();
  tempo.avancar(5_000);
  assert.equal(r.restanteMs(BRANCAS), 285_000);
  assert.equal(r.vez, BRANCAS);
});

teste("queda da bandeira encerra a partida uma única vez", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo, 1);
  r.iniciar();
  tempo.avancar(59_999);
  assert.equal(r.verificarQueda(), false);
  tempo.avancar(1);
  assert.equal(r.verificarQueda(), true);
  assert.equal(r.verificarQueda(), false);
  assert.equal(r.estado, "encerrado");
  assert.equal(r.perdedor, BRANCAS);
  assert.equal(r.restanteMs(BRANCAS), 0);
  assert.equal(r.restanteMs(PRETAS), 60_000);
  assert.equal(r.tocar(BRANCAS), false);
});

teste("toque depois do tempo acabar não ganha incremento", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo, 1, 10, "fischer");
  r.iniciar();
  tempo.avancar(60_010);
  assert.equal(r.tocar(BRANCAS), true);
  assert.equal(r.estado, "encerrado");
  assert.equal(r.perdedor, BRANCAS);
  assert.equal(r.restanteMs(BRANCAS), 0);
  assert.equal(r.lances(BRANCAS), 0);
});

teste("pausar depois do tempo acabar encerra em vez de pausar", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo, 1);
  r.iniciar();
  tempo.avancar(61_000);
  r.pausar();
  assert.equal(r.estado, "encerrado");
});

teste("reiniciar volta ao início e configurar troca o ritmo", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo);
  r.iniciar();
  tempo.avancar(3_000);
  r.tocar(BRANCAS);
  r.reiniciar();
  assert.equal(r.estado, "pronto");
  assert.equal(r.vez, null);
  assert.equal(r.restanteMs(BRANCAS), 300_000);
  assert.equal(r.lances(BRANCAS), 0);
  r.configurar(X.deMinutos(3, 2, "fischer"));
  assert.equal(r.restanteMs(PRETAS), 180_000);
  assert.equal(r.estado, "pronto");
});

teste("instantâneo de relógio ativo volta pausado e sem perder tempo", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo, 5, 3, "atraso");
  r.iniciar();
  tempo.avancar(4_000);
  r.tocar(BRANCAS);
  tempo.avancar(1_500);
  const salvo = r.instantaneo();
  assert.equal(salvo.estado, "pausado");
  // Página recarregada bem depois: o tempo parado não pode ser cobrado
  tempo.avancar(600_000);
  const lido = X.lerInstantaneo(JSON.parse(JSON.stringify(salvo)));
  const restaurado = X.restaurar(lido, () => tempo.agoraMs);
  assert.equal(restaurado.estado, "pausado");
  assert.equal(restaurado.vez, PRETAS);
  assert.equal(restaurado.restanteMs(BRANCAS), 299_000);
  assert.equal(restaurado.atrasoRestanteMs(), 1_500);
  assert.equal(restaurado.lances(BRANCAS), 1);
  restaurado.retomar();
  tempo.avancar(2_500);
  assert.equal(restaurado.restanteMs(PRETAS), 299_000);
});

teste("instantâneo incoerente volta ao início", () => {
  const tempo = tempoFalso();
  const salvo = { ...relogio(tempo).instantaneo(), estado: "pausado", vez: null };
  const restaurado = X.restaurar(salvo, () => tempo.agoraMs);
  assert.equal(restaurado.estado, "pronto");
});

teste("instantâneo com formato errado é recusado", () => {
  const tempo = tempoFalso();
  const bom = relogio(tempo).instantaneo();
  assert.ok(X.lerInstantaneo(bom));
  assert.equal(X.lerInstantaneo(null), null);
  assert.equal(X.lerInstantaneo("x"), null);
  assert.equal(X.lerInstantaneo({ ...bom, estado: "voando" }), null);
  assert.equal(X.lerInstantaneo({ ...bom, vez: "azuis" }), null);
  assert.equal(X.lerInstantaneo({ ...bom, baseBrancasMs: -1 }), null);
  assert.equal(X.lerInstantaneo({ ...bom, lancesPretas: "3" }), null);
  assert.equal(X.lerInstantaneo({ ...bom, configuracao: { ...bom.configuracao, sistema: "outro" } }), null);
  assert.equal(X.lerInstantaneo({ ...bom, configuracao: { ...bom.configuracao, tempoInicialMs: 0 } }), null);
});

teste("espera até a próxima mudança segue os dígitos visíveis", () => {
  const tempo = tempoFalso();
  const r = relogio(tempo, 1);
  assert.equal(r.msAteProximaMudanca(), 250);
  r.iniciar();
  tempo.avancar(300);
  assert.equal(r.msAteProximaMudanca(), 250);
  tempo.avancar(500);
  assert.equal(r.msAteProximaMudanca(), 201);
  tempo.avancar(50_000);
  assert.equal(r.msAteProximaMudanca(), 10);
  tempo.avancar(50);
  assert.equal(r.msAteProximaMudanca(), 51);
});

// ---------- FormatoTempoTest ----------

teste("minutos e segundos acima de 10 segundos", () => {
  assert.equal(X.formatar(300_000), "5:00");
  assert.equal(X.formatar(299_999), "4:59");
  assert.equal(X.formatar(725_000), "12:05");
  assert.equal(X.formatar(10_000), "0:10");
});

teste("horas quando passa de 60 minutos", () => {
  assert.equal(X.formatar(90 * 60_000), "1:30:00");
  assert.equal(X.formatar(600 * 60_000), "10:00:00");
  assert.equal(X.formatar(3_599_999), "59:59");
});

teste("décimos abaixo de 10 segundos", () => {
  assert.equal(X.formatar(9_999), "0:09.9");
  assert.equal(X.formatar(9_850), "0:09.8");
  assert.equal(X.formatar(99), "0:00.0");
  assert.equal(X.formatar(0), "0:00.0");
  assert.equal(X.formatar(-500), "0:00.0");
});

teste("ritmo na notação do xadrez", () => {
  assert.equal(X.ritmo(X.PADRAO), "5 + 2");
  assert.equal(X.ritmo(X.deMinutos(10, 7, "nenhum")), "10 + 0");
});

// ---------- ConfiguracaoTempoTest ----------

teste("padrão é 5 mais 2 Fischer", () => {
  assert.equal(X.PADRAO.tempoInicialMs, 300_000);
  assert.equal(X.PADRAO.incrementoMs, 2_000);
  assert.equal(X.PADRAO.sistema, "fischer");
});

teste("sem incremento o valor digitado é ignorado", () => {
  assert.equal(X.deMinutos(3, 5, "nenhum").incrementoMs, 0);
});

teste("valores fora da faixa são limitados", () => {
  const c = X.deMinutos(0, 9_999, "fischer");
  assert.equal(X.minutos(c), 1);
  assert.equal(X.incrementoSegundos(c), X.INCREMENTO_MAX_S);
});

teste("leitura dos campos de texto", () => {
  assert.equal(X.lerMinutos(" 15 "), 15);
  assert.equal(X.lerMinutos(""), null);
  assert.equal(X.lerMinutos("0"), null);
  assert.equal(X.lerMinutos("601"), null);
  assert.equal(X.lerMinutos("abc"), null);
  assert.equal(X.lerMinutos("2,5"), null);
  assert.equal(X.lerIncremento("0"), 0);
  assert.equal(X.lerIncremento("600"), 600);
  assert.equal(X.lerIncremento("601"), null);
  assert.equal(X.lerIncremento(""), null);
});

teste("categorias das predefinições", () => {
  const porRitmo = Object.fromEntries(
    X.PREDEFINICOES.map((p) => [`${p.minutos}+${p.incrementoSegundos}`, p.categoria]),
  );
  assert.equal(porRitmo["1+0"], "bullet");
  assert.equal(porRitmo["2+1"], "bullet");
  assert.equal(porRitmo["3+0"], "blitz");
  assert.equal(porRitmo["5+3"], "blitz");
  assert.equal(porRitmo["10+0"], "rapida");
  assert.equal(porRitmo["15+10"], "rapida");
  assert.equal(porRitmo["30+0"], "classica");
  assert.equal(porRitmo["90+30"], "classica");
  for (const categoria of X.CATEGORIAS) {
    assert.ok(X.PREDEFINICOES.some((p) => p.categoria === categoria), `sem predefinição ${categoria}`);
  }
  assert.equal(X.PREDEFINICOES.length, 12);
});

teste("predefinição com incremento usa Fischer", () => {
  const tresMaisDois = X.PREDEFINICOES.find((p) => p.minutos === 3 && p.incrementoSegundos === 2);
  const cincoMaisZero = X.PREDEFINICOES.find((p) => p.minutos === 5 && p.incrementoSegundos === 0);
  assert.equal(tresMaisDois.configuracao.sistema, "fischer");
  assert.equal(cincoMaisZero.configuracao.sistema, "nenhum");
});

teste("configuração salva é validada", () => {
  assert.ok(X.configuracaoValida(X.PADRAO));
  assert.ok(X.configuracaoValida(X.deMinutos(600, 600, "atraso")));
  assert.equal(X.configuracaoValida({ ...X.PADRAO, sistema: "nenhum" }), false);
  assert.equal(X.configuracaoValida({ ...X.PADRAO, tempoInicialMs: 30_000 }), false);
  assert.equal(X.configuracaoValida(null), false);
});

console.log(`relogio-de-xadrez: ${total} testes passaram`);
