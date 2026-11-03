"use strict";
/*
 * Testes da lógica do relógio de blinds. Mesmos casos e números de RelogioTest.kt,
 * DinheiroTest.kt e EditorConfigTest.kt do app Poker Manager (app/src/test), mais a leitura
 * dos dados salvos. Rode com: node _fonte/testes/relogio-de-blinds-poker.test.js
 */
const assert = require("node:assert/strict");
const P = require("../../assets/ferramentas/relogio-de-blinds-poker-logica.js");

const { Relogio, Calculos } = P;
let total = 0;

function teste(nome, corpo) {
  try {
    corpo();
    total++;
  } catch (erro) {
    console.error(`FALHOU: ${nome}`);
    throw erro;
  }
}

// ---------- RelogioTest ----------

// 3 níveis de 10 min, intervalo de 5 min, mais 1 nível de 10 min
const niveis = [
  { id: "1", tipo: P.BLIND, smallBlind: 25, bigBlind: 50, ante: 0, duracaoSegundos: 600 },
  { id: "2", tipo: P.BLIND, smallBlind: 50, bigBlind: 100, ante: 0, duracaoSegundos: 600 },
  { id: "3", tipo: P.BLIND, smallBlind: 75, bigBlind: 150, ante: 25, duracaoSegundos: 600 },
  { id: "i", tipo: P.INTERVALO, smallBlind: 0, bigBlind: 0, ante: 0, duracaoSegundos: 300 },
  { id: "4", tipo: P.BLIND, smallBlind: 100, bigBlind: 200, ante: 25, duracaoSegundos: 600 },
];
const ultimoIndice = niveis.length - 1;
const inicio = 1_000_000;
const parede = 1_700_000_000_000;
const rodando = () => Relogio.iniciar(Relogio.inicial(niveis), inicio, parede);

teste("inicia com a duração cheia do primeiro nível", () => {
  const e = rodando();
  assert.equal(e.status, P.RODANDO);
  assert.equal(Relogio.restanteMs(e, inicio), 600_000);
  assert.equal(Relogio.restanteMs(e, inicio + 599_000), 1_000);
});

teste("pausa guarda o restante exato e continua de onde parou", () => {
  const pausado = Relogio.pausar(rodando(), niveis, inicio + 123_456);
  assert.equal(pausado.status, P.PAUSADO);
  assert.equal(pausado.restanteMs, 600_000 - 123_456);
  // Tempo parado não conta
  const retomado = Relogio.iniciar(pausado, inicio + 999_999, parede);
  assert.equal(Relogio.restanteMs(retomado, inicio + 999_999), 600_000 - 123_456);
  assert.equal(Relogio.restanteMs(retomado, inicio + 1_004_999), 600_000 - 123_456 - 5_000);
});

teste("troca de nível sem perder tempo", () => {
  const avanco = Relogio.avancar(rodando(), niveis, inicio + 600_250);
  assert.equal(avanco.transicoes, 1);
  assert.equal(avanco.estado.indice, 1);
  assert.equal(avanco.momentoUltimaTransicao, inicio + 600_000);
  assert.equal(Relogio.restanteMs(avanco.estado, inicio + 600_250), 599_750);
});

teste("recupera vários níveis depois de tempo em segundo plano", () => {
  const avanco = Relogio.avancar(rodando(), niveis, inicio + 25 * 60_000);
  assert.equal(avanco.transicoes, 2);
  assert.equal(avanco.estado.indice, 2);
  assert.equal(Relogio.restanteMs(avanco.estado, inicio + 25 * 60_000), 300_000);
  assert.equal(avanco.estado.fimNivelParedeMs, parede + 30 * 60_000);
});

teste("encerra no fim do último nível", () => {
  const duracaoTotal = niveis.reduce((s, n) => s + P.duracaoMs(n), 0);
  const avanco = Relogio.avancar(rodando(), niveis, inicio + duracaoTotal + 10_000);
  assert.equal(avanco.estado.status, P.ENCERRADO);
  assert.equal(avanco.estado.indice, ultimoIndice);
  assert.equal(avanco.transicoes, niveis.length);
  assert.equal(Relogio.restanteMs(avanco.estado, inicio + duracaoTotal + 20_000), 0);
  // Iniciar não "ressuscita" um torneio encerrado
  assert.deepEqual(Relogio.iniciar(avanco.estado, inicio + duracaoTotal + 30_000, parede), avanco.estado);
});

teste("sem transição quando não roda", () => {
  const parado = Relogio.inicial(niveis);
  const avanco = Relogio.avancar(parado, niveis, inicio + 10_000_000);
  assert.equal(avanco.transicoes, 0);
  assert.deepEqual(avanco.estado, parado);
});

teste("próximo e anterior mantêm o relógio rodando", () => {
  const agora = inicio + 100_000;
  const proximo = Relogio.proximo(rodando(), niveis, agora, parede);
  assert.equal(proximo.indice, 1);
  assert.equal(proximo.status, P.RODANDO);
  assert.equal(Relogio.restanteMs(proximo, agora), 600_000);
  const anterior = Relogio.anterior(proximo, niveis, agora + 1_000, parede);
  assert.equal(anterior.indice, 0);
  assert.equal(Relogio.restanteMs(anterior, agora + 1_000), 600_000);
  // Não passa do primeiro nível
  assert.equal(Relogio.anterior(anterior, niveis, agora + 2_000, parede).indice, 0);
});

teste("próximo no último nível encerra", () => {
  const ultimo = Relogio.irPara(Relogio.inicial(niveis), niveis, ultimoIndice, inicio, parede);
  const fim = Relogio.proximo(ultimo, niveis, inicio, parede);
  assert.equal(fim.status, P.ENCERRADO);
  // Voltar de um torneio encerrado reabre pausado
  const volta = Relogio.anterior(fim, niveis, inicio, parede);
  assert.equal(volta.status, P.PAUSADO);
  assert.equal(volta.indice, ultimoIndice - 1);
});

teste("reiniciar nível para o relógio com tempo cheio", () => {
  const r = Relogio.reiniciarNivel(Relogio.avancar(rodando(), niveis, inicio + 700_000).estado, niveis);
  assert.equal(r.indice, 1);
  assert.equal(r.status, P.PARADO);
  assert.equal(r.restanteMs, 600_000);
});

teste("restaura pelo relógio de parede depois de reiniciar", () => {
  const e = rodando(); // termina em parede + 10 min
  // O relógio monotônico recomeçou em 5 s, e passaram 4 min no relógio de parede
  const restaurado = Relogio.restaurar(e, niveis, 5_000, parede + 240_000, false);
  assert.equal(Relogio.restanteMs(restaurado, 5_000), 360_000);
  // No mesmo boot nada muda
  assert.deepEqual(Relogio.restaurar(e, niveis, inicio + 1, parede + 1, true), e);
});

teste("restaurar com índice inválido volta ao início", () => {
  const invalido = P.estadoRelogio(42, P.PAUSADO, 1_000);
  assert.deepEqual(Relogio.restaurar(invalido, niveis, 0, 0, true), Relogio.inicial(niveis));
});

teste("tempo até o próximo intervalo", () => {
  const agora = inicio + 60_000;
  // 9 min do nível 1 + 10 + 10 = 29 min
  assert.equal(Relogio.msAteProximoIntervalo(rodando(), niveis, agora), 29 * 60_000);
  const noIntervalo = Relogio.irPara(rodando(), niveis, 3, agora, parede);
  assert.equal(Relogio.msAteProximoIntervalo(noIntervalo, niveis, agora), null);
  const depois = Relogio.irPara(rodando(), niveis, 4, agora, parede);
  assert.equal(Relogio.msAteProximoIntervalo(depois, niveis, agora), null);
});

teste("progresso do nível", () => {
  assert.ok(Math.abs(Relogio.progresso(rodando(), niveis, inicio + 150_000) - 0.25) < 0.0001);
});

teste("espera até o próximo segundo exibido", () => {
  assert.equal(Relogio.msAteProximoSegundo(5_001), 1);
  assert.equal(Relogio.msAteProximoSegundo(5_000), 1_000);
  assert.equal(Relogio.msAteProximoSegundo(4_500), 500);
  // Milissegundos fracionados (performance.now): o número muda daqui a 0,5 ms
  assert.ok(Math.abs(Relogio.msAteProximoSegundo(5_000.5) - 0.5) < 1e-9);
});

teste("numeração dos níveis ignora intervalos", () => {
  assert.equal(P.numeroDoNivel(niveis, 0), 1);
  assert.equal(P.numeroDoNivel(niveis, 2), 3);
  assert.equal(P.numeroDoNivel(niveis, 3), 0);
  assert.equal(P.numeroDoNivel(niveis, 4), 4);
  // Estrutura padrão: o nível depois do primeiro intervalo é o 4
  assert.equal(P.numeroDoNivel(P.NIVEIS_PADRAO, 4), 4);
});

teste("formato do tempo", () => {
  assert.equal(P.tempo(1_200_000), "20:00");
  assert.equal(P.tempo(1), "00:01");
  assert.equal(P.tempo(0), "00:00");
  assert.equal(P.tempo(3_900_000), "1:05:00");
  assert.equal(P.duracao(1200, "min"), "20 min");
  assert.equal(P.duracao(90, "min"), "1:30");
});

teste("nomes e resumos dos níveis", () => {
  assert.equal(P.nomeDoNivel(P.NIVEIS_PADRAO, 4), "Nível 4");
  assert.equal(P.nomeDoNivel(P.NIVEIS_PADRAO, 3), "Intervalo");
  assert.equal(P.resumoNivel(P.NIVEIS_PADRAO, 4), "Nível 4 · 100 / 200 · Ante 25");
  assert.equal(P.resumoNivel(P.NIVEIS_PADRAO, 0), "Nível 1 · 25 / 50");
  assert.equal(P.resumoNivel(P.NIVEIS_PADRAO, 3), "Intervalo · 10 min");
  assert.equal(P.blinds(P.NIVEIS_PADRAO[11]), "600 / 1.200");
});

// ---------- DinheiroTest ----------

teste("lê valores com vírgula ou ponto", () => {
  assert.equal(P.lerCentavos("12,50"), 1250);
  assert.equal(P.lerCentavos("12.50"), 1250);
  assert.equal(P.lerCentavos("12,05"), 1205);
  assert.equal(P.lerCentavos("12,5"), 1250);
  assert.equal(P.lerCentavos("50"), 5000);
  assert.equal(P.lerCentavos(" 50 "), 5000);
  assert.equal(P.lerCentavos("12,"), 1200);
  assert.equal(P.lerCentavos(",5"), 50);
  assert.equal(P.lerCentavos("1.234,56"), 123456);
  assert.equal(P.lerCentavos("1,234.56"), 123456);
  assert.equal(P.lerCentavos("1.000"), 100000);
  assert.equal(P.lerCentavos("1.000.000"), 100000000);
  assert.equal(P.lerCentavos("0"), 0);
});

teste("recusa valores inválidos", () => {
  for (const texto of ["", "abc", "-5", "1,2345", "12,345,6", ",", "1.2.3,4", "9999999999999999999"]) {
    assert.equal(P.lerCentavos(texto), null, texto);
  }
});

teste("inteiros e porcentagens", () => {
  assert.equal(P.lerInteiro("10000"), 10_000);
  assert.equal(P.lerInteiro("10.000"), 10_000);
  assert.equal(P.lerInteiro("10,5"), null);
  assert.equal(P.ler("12,5", 2), 1250);
  assert.equal(P.ler("100", 2), 10_000);
  assert.equal(P.porcentagem(1250), "12,5%");
  assert.equal(P.porcentagem(1000), "10%");
  assert.equal(P.inteiro(1250), "1.250");
  assert.equal(P.paraCampo(1250, 2), "12,5");
  assert.equal(P.paraCampo(123456, 2), "1234,56");
});

teste("formata com centavos e moeda", () => {
  assert.equal(P.formatar(123456, "R$"), "R$ 1.234,56");
  assert.equal(P.formatar(5, ""), "0,05");
});

teste("rake arredonda ao centavo", () => {
  assert.equal(P.rake(13_500, 1_000), 1350n);
  assert.equal(P.rake(13_505, 1_000), 1351n); // 1350,5 → 1351
  assert.equal(P.rake(13_500, 0), 0n);
  assert.equal(P.rake(13_500, 10_000), 13_500n);
  assert.equal(P.rake(13_500, 1_250), 1688n); // 12,5% de 135,00 = 16,875
});

teste("prêmios somam exatamente o prize pool", () => {
  // 50/30/20 de R$ 121,50: 60,75 + 36,45 + 24,30
  assert.deepEqual(P.distribuir(12_150, [5000, 3000, 2000]), [6075n, 3645n, 2430n]);
  // Centavo que sobra vai para a maior fração; empate favorece a melhor colocação
  assert.deepEqual(P.distribuir(100, [3334, 3333, 3333]), [34n, 33n, 33n]);
  assert.deepEqual(P.distribuir(1, [3334, 3333, 3333]), [1n, 0n, 0n]);
  assert.deepEqual(P.distribuir(100, [3333, 3334, 3333]), [33n, 34n, 33n]);
});

teste("prêmios aleatórios sempre fecham", () => {
  // Gerador determinístico (o Random(42) do Kotlin não existe aqui; o que importa é a propriedade)
  let semente = 42;
  const aleatorio = () => {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente / 2147483648;
  };
  for (let k = 0; k < 2000; k++) {
    const posicoes = 1 + Math.floor(aleatorio() * 20);
    const pesos = P.premiacaoPara(posicoes);
    const totalCentavos = BigInt(Math.floor(aleatorio() * 10_000_000_000));
    const premios = P.distribuir(totalCentavos, pesos);
    assert.equal(
      premios.reduce((a, b) => a + b, 0n),
      totalCentavos,
    );
    premios.forEach((p, i) => {
      assert.ok(p >= 0n);
      // Cada prêmio fica a menos de 1 centavo do valor exato: |p × 10000 − total × peso| < 10000
      const diferenca = p * 10_000n - totalCentavos * BigInt(pesos[i]);
      assert.ok(diferenca < 10_000n && diferenca > -10_000n);
    });
  }
});

teste("presets somam 100%", () => {
  for (let n = 1; n <= P.MAX_POSICOES_COM_PRESET; n++) {
    const p = P.premiacaoPara(n);
    assert.equal(p.length, n);
    assert.equal(
      p.reduce((a, b) => a + b, 0),
      10_000,
      `preset ${n}`,
    );
  }
  assert.deepEqual(P.premiacaoPara(0), []);
  assert.deepEqual(P.premiacaoPara(21), []);
});

teste("cálculos do torneio padrão", () => {
  const config = P.configPadrao("Teste", "R$");
  const estado = { ...P.estadoInicial(config), rebuys: 3, addOns: 2, restantes: 6 };
  // 9 × 50 + 3 × 50 + 2 × 50 = R$ 700,00; casa 10% = R$ 70,00
  assert.equal(Calculos.brutoCentavos(config, estado), 70_000n);
  assert.equal(Calculos.rakeCentavos(config, estado), 7_000n);
  assert.equal(Calculos.liquidoCentavos(config, estado), 63_000n);
  assert.deepEqual(Calculos.premios(config, estado), [31_500n, 18_900n, 12_600n]);
  // (9 + 3 + 2) × 10.000 fichas / 6 jogadores
  assert.equal(Calculos.fichasEmJogo(config, estado), 140_000n);
  assert.equal(Calculos.stackMedio(config, estado), 23_333n);
  assert.equal(Calculos.limiteRebuys(config, estado), 18);
});

teste("rebuy e add-on desligados não contam", () => {
  const config = { ...P.configPadrao("Teste", "R$"), rebuyPermitido: false, addOnPermitido: false };
  const estado = { ...P.estadoInicial(config), rebuys: 3, addOns: 2 };
  assert.equal(Calculos.brutoCentavos(config, estado), 45_000n);
  assert.equal(Calculos.fichasEmJogo(config, estado), 90_000n);
});

teste("valores grandes não perdem precisão", () => {
  const config = { ...P.configPadrao(), stackInicial: 1e12, buyInCentavos: 1e11 };
  const estado = { ...P.estadoInicial(config), entradas: 100_000, restantes: 3 };
  assert.equal(Calculos.fichasEmJogo(config, estado), 100_000_000_000_000_000n);
  assert.equal(Calculos.brutoCentavos(config, estado), 10_000_000_000_000_000n);
  assert.equal(Calculos.stackMedio(config, estado), 33_333_333_333_333_333n);
});

// ---------- Contadores (TorneioViewModel) ----------

teste("contadores respeitam os limites do app", () => {
  const config = P.configPadrao();
  let e = P.estadoInicial(config);
  const C = P.Contadores;
  assert.equal(C.corrigirEliminacao(config, e).restantes, 9); // não passa das entradas
  for (let i = 0; i < 20; i++) e = C.eliminarJogador(config, e);
  assert.equal(e.restantes, 1); // sempre sobra um jogador
  e = C.adicionarEntrada(config, e);
  assert.equal(e.entradas, 10);
  assert.equal(e.restantes, 2);
  for (let i = 0; i < 25; i++) e = C.adicionarRebuy(config, e);
  assert.equal(e.rebuys, 20); // 2 por jogador × 10 entradas
  e = C.removerEntrada(config, e);
  assert.equal(e.entradas, 9);
  assert.equal(e.rebuys, 18);
  assert.equal(C.removerAddOn(config, e).addOns, 0);
  // Ilimitado com máximo 0
  const livre = { ...config, maxRebuysPorJogador: 0 };
  assert.equal(P.Calculos.limiteRebuys(livre, e), null);
  assert.equal(C.adicionarRebuy(livre, e).rebuys, 19);
});

teste("torneio em andamento e textos do painel", () => {
  const config = P.configPadrao();
  const e = P.estadoInicial(config);
  assert.equal(P.emAndamento(config, e), false);
  assert.equal(P.emAndamento(config, { ...e, rebuys: 1 }), true);
  assert.equal(P.emAndamento(config, { ...e, relogio: Relogio.iniciar(e.relogio, 0, 0) }), true);
  assert.equal(P.bigBlindDeReferencia(config, 3), 150); // no intervalo, o BB do nível 3
  assert.equal(P.situacaoLateReg(config, 3), "Late reg. até o nível 3");
  assert.equal(P.situacaoLateReg(config, 4), "Late reg. encerrado");
  assert.equal(P.situacaoLateReg({ ...config, lateRegAteNivel: 0 }, 4), null);
});

// ---------- EditorConfigTest ----------

const padrao = P.configPadrao("Torneio Poker", "R$");
const rascunho = P.rascunho(padrao);
const erro = (r) => {
  const v = P.validar(r);
  return v.ok ? null : v.erro;
};

teste("rascunho da config padrão volta igual", () => {
  const v = P.validar(rascunho);
  assert.ok(v.ok);
  assert.deepEqual(v.config, padrao);
});

teste("campos em formato brasileiro", () => {
  assert.equal(rascunho.buyIn, "50");
  assert.equal(rascunho.casa, "10");
  assert.equal(rascunho.niveis[0].minutos, "20");
  const config = P.validar({ ...rascunho, buyIn: "12,50", casa: "12,5", rebuyValor: "7,25" }).config;
  assert.equal(config.buyInCentavos, 1250);
  assert.equal(config.casaPontosBase, 1250);
  assert.equal(config.rebuyCentavos, 725);
});

teste("minutos fracionados", () => {
  assert.equal(P.segundosDosMinutos("1,5"), 90);
  assert.equal(P.segundosDosMinutos("0,1"), 6);
  assert.equal(P.segundosDosMinutos("20"), 1200);
});

teste("erros de validação", () => {
  assert.equal(erro({ ...rascunho, nome: "  " }), "nome");
  assert.equal(erro({ ...rascunho, stack: "0" }), "stack");
  assert.equal(erro({ ...rascunho, jogadores: "" }), "jogadores");
  assert.equal(erro({ ...rascunho, buyIn: "abc" }), "buyIn");
  assert.equal(erro({ ...rascunho, casa: "101" }), "casa");
  assert.equal(erro({ ...rascunho, niveis: rascunho.niveis.filter((n) => n.tipo === P.INTERVALO) }), "niveis");
  assert.equal(erro({ ...rascunho, rebuyValor: "" }), "rebuy");
  assert.equal(erro({ ...rascunho, addOnValor: "x" }), "addOn");
  // Desligado, o valor do rebuy não importa
  assert.ok(P.validar({ ...rascunho, rebuy: false, rebuyValor: "" }).ok);
  // A soma das porcentagens precisa dar 100%
  assert.equal(erro({ ...rascunho, premios: ["50", "30", "10"] }), "premiacao");
  assert.ok(P.validar({ ...rascunho, premios: [] }).ok);
});

teste("nível inválido informa o índice", () => {
  const niveisRascunho = rascunho.niveis.slice();
  niveisRascunho[2] = { ...niveisRascunho[2], bb: "10" }; // BB menor que o SB
  const e = P.validar({ ...rascunho, niveis: niveisRascunho });
  assert.equal(e.erro, "nivel");
  assert.equal(e.indiceNivel, 2);
  assert.equal(
    P.mensagemErro(e, { ...rascunho, niveis: niveisRascunho }),
    'Confira os valores de "Nível 3": o BB não pode ser menor que o SB e a duração precisa ser maior que zero.',
  );

  niveisRascunho[2] = { ...rascunho.niveis[2], minutos: "0" };
  assert.equal(erro({ ...rascunho, niveis: niveisRascunho }), "nivel");
});

teste("adicionar nível dobra o big blind", () => {
  const r = P.adicionarNivel(rascunho, "novo");
  const novo = r.niveis[r.niveis.length - 1];
  assert.equal(novo.sb, "1200");
  assert.equal(novo.bb, "2400");
  assert.equal(novo.ante, "200");
  // Sem níveis, começa em 25/50
  const vazio = P.adicionarNivel({ ...rascunho, niveis: [] }, "a");
  assert.equal(vazio.niveis.length, 1);
  assert.equal(vazio.niveis[0].sb, "25");
  assert.equal(vazio.niveis[0].bb, "50");
});

teste("intervalo e remoção", () => {
  const r = P.adicionarIntervalo(rascunho, "pausa");
  assert.equal(r.niveis[r.niveis.length - 1].tipo, P.INTERVALO);
  assert.equal(r.niveis[r.niveis.length - 1].minutos, "10");
  assert.deepEqual(P.removerNivel(r, "pausa").niveis, rascunho.niveis);
  assert.equal(P.tituloNivel(r, 3), "Intervalo");
  assert.equal(P.tituloNivel(r, 4), "Nível 4");
});

teste("posições premiadas usam os presets", () => {
  const cinco = P.definirPosicoes(rascunho, 5);
  assert.deepEqual(cinco.premios, ["40", "23", "15", "12", "10"]);
  assert.equal(P.somaPremios(cinco), 10_000);
  assert.deepEqual(P.definirPosicoes(rascunho, 0).premios, []);
  const vinteEUm = P.definirPosicoes(P.definirPosicoes(rascunho, 20), 21);
  assert.equal(vinteEUm.premios.length, 21);
  assert.equal(vinteEUm.premios[20], "0");
  assert.equal(P.somaPremios({ ...rascunho, premios: ["50", "x"] }), null);
});

// ---------- Dados salvos (JsonTorneio) ----------

teste("lê a configuração e o estado salvos e recusa dados estragados", () => {
  const json = JSON.parse(JSON.stringify(padrao));
  assert.deepEqual(P.lerConfig(json), padrao);
  assert.equal(P.lerConfig(null), null);
  assert.equal(P.lerConfig({ ...json, niveis: [] }), null);
  assert.equal(P.lerConfig({ ...json, stackInicial: "10000" }), null);
  assert.equal(P.lerConfig({ ...json, premiacao: [5000, 3000] }), null); // soma 80%

  const estado = { ...P.estadoInicial(padrao), relogio: Relogio.iniciar(P.estadoInicial(padrao).relogio, 5, parede) };
  const salvo = JSON.parse(JSON.stringify(P.estadoParaSalvar(estado)));
  const lido = P.lerEstado(salvo, padrao);
  assert.equal(lido.relogio.status, P.RODANDO);
  assert.equal(lido.relogio.fimNivelParedeMs, parede + 1_200_000);
  assert.equal(lido.entradas, 9);
  assert.equal(P.lerEstado({ ...salvo, indice: 99 }, padrao), null);
  assert.equal(P.lerEstado({ ...salvo, status: "x" }, padrao), null);
  assert.equal(P.lerEstado({ ...salvo, entradas: 0 }, padrao), null);
  // Ao abrir a página 4 min depois, o fim do nível vem do relógio de parede
  const restaurado = Relogio.restaurar(lido.relogio, padrao.niveis, 10, parede + 240_000, false);
  assert.equal(Relogio.restanteMs(restaurado, 10), 960_000);
});

console.log(`relogio-de-blinds-poker: ${total} testes passaram`);
