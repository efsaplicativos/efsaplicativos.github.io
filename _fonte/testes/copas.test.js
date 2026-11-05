"use strict";
const assert = require("node:assert/strict");
const C = require("../../assets/jogos/copas-logica.js");

// Carta pelo nome: valor + naipe (e espadas, c copas, o ouros, p paus). Ex.: "Qe", "10c", "2p", "Ao".
const NAIPE = { e: 0, c: 1, o: 2, p: 3 };
const VALOR = { J: 11, Q: 12, K: 13, A: 14 };
function carta(nome) {
  const v = VALOR[nome.slice(0, -1)] || Number(nome.slice(0, -1));
  return NAIPE[nome.slice(-1)] * 13 + v - 2;
}
const cs = (texto) => (texto ? texto.trim().split(/\s+/).map(carta) : []);
const nomes = (ids) => ids.map(C.nomeCarta);

/**
 * Posição montada à mão, para testar regras e o computador. As mãos vêm por texto (podem ter
 * menos de 13 cartas), as vazas fechadas por [lider, "4 cartas"] e a vaza atual por [lider, "cartas"].
 */
function mesa({ maos = ["", "", "", ""], vazas = [], atual = [0, ""], rodada = 1, placar = [], modo = 100 } = {}) {
  return {
    modo,
    semente: 1,
    rodada,
    fase: "vaza",
    maos: maos.map((m) => C.ordenar(cs(m))),
    recebidas: [[], [], [], []],
    vazas: vazas.map(([lider, texto]) => ({ lider, cartas: cs(texto) })),
    atual: { lider: atual[0], cartas: cs(atual[1]) },
    placar,
    iniciado: true,
  };
}

/** Confere que as 52 cartas estão no jogo uma vez só e que a partida salva volta igual. */
function conferirInvariantes(e) {
  const todas = [...e.maos.flat(), ...e.vazas.flatMap((v) => v.cartas), ...e.atual.cartas];
  if (e.fase !== "fim") {
    assert.equal(todas.length, 52, "52 cartas no jogo");
    assert.equal(new Set(todas).size, 52, "nenhuma carta repetida");
  }
  const restaurado = C.restaurar(JSON.parse(JSON.stringify(e)));
  assert.ok(restaurado, "o estado salvo é aceito");
  assert.deepEqual(restaurado, e, "o estado salvo volta igual");
}

// ---------- Cartas e nomes ----------
{
  assert.equal(C.DOIS_DE_PAUS, carta("2p"));
  assert.equal(C.DAMA_DE_ESPADAS, carta("Qe"));
  assert.equal(C.nomeCarta(carta("Ae")), "Ás de espadas");
  assert.equal(C.nomeCarta(carta("10o")), "10 de ouros");
  assert.equal(C.oCarta(carta("Qc")), "a Dama de copas");
  assert.equal(C.daCarta(carta("Kp")), "do Rei de paus");
  assert.equal(C.posto(carta("Ac")), 14, "o Ás é a carta mais alta");
  assert.equal(C.pontosDaCarta(carta("2c")), 1);
  assert.equal(C.pontosDaCarta(carta("Ac")), 1);
  assert.equal(C.pontosDaCarta(carta("Qe")), 13);
  assert.equal(C.pontosDaCarta(carta("Ke")), 0);
  assert.equal(C.pontosDaCarta(carta("Qo")), 0);
  let total = 0;
  for (let c = 0; c < 52; c++) total += C.pontosDaCarta(c);
  assert.equal(total, 26, "o baralho tem 26 pontos");
  assert.deepEqual(nomes(C.ordenar(cs("Ac 2e 5p Ko 3c Qe 2p"))), [
    "2 de paus",
    "5 de paus",
    "Rei de ouros",
    "2 de espadas",
    "Dama de espadas",
    "3 de copas",
    "Ás de copas",
  ]);
  assert.equal(C.listar(["a", "b", "c"]), "a, b e c");
  assert.equal(C.textoModo(50), "até 50 pontos");
}

// ---------- Distribuição e troca ----------
{
  const e = C.novoJogo(100, 42);
  assert.equal(e.fase, "troca", "a primeira rodada começa com a troca");
  assert.equal(e.rodada, 1);
  for (const mao of e.maos) assert.equal(mao.length, 13);
  conferirInvariantes(e);
  assert.deepEqual(C.novoJogo(100, 42), e, "a mesma partida dá as mesmas cartas");
  assert.notDeepEqual(C.novoJogo(100, 43).maos, e.maos);
  assert.notDeepEqual(C.distribuir(42, 2), C.distribuir(42, 1), "cada rodada tem outras cartas");
  assert.deepEqual(C.distribuir(42, 2), C.distribuir(42, 2));
  assert.equal(C.novoJogo(77, 1).modo, C.MODO_PADRAO, "modo inválido vira o padrão");
  assert.equal(C.novoJogo(50, 1).modo, 50);
  assert.ok(e.maos[e.atual.lider].includes(C.DOIS_DE_PAUS));

  // A troca gira: esquerda, direita, frente, sem troca, e recomeça
  assert.deepEqual([1, 2, 3, 4, 5, 8].map((r) => C.direcao(r).id), ["esquerda", "direita", "frente", "sem-troca", "esquerda", "sem-troca"]);
  assert.deepEqual([0, 1, 2, 3].map((j) => C.destinoDaTroca(j, 1)), [1, 2, 3, 0], "para a esquerda");
  assert.deepEqual([0, 1, 2, 3].map((j) => C.destinoDaTroca(j, 2)), [3, 0, 1, 2], "para a direita");
  assert.deepEqual([0, 1, 2, 3].map((j) => C.destinoDaTroca(j, 3)), [2, 3, 0, 1], "para a frente");
  assert.deepEqual([0, 1, 2, 3].map((j) => C.destinoDaTroca(j, 4)), [0, 1, 2, 3], "sem troca");
  for (let r = 1; r <= 4; r++) for (let j = 0; j < 4; j++) assert.equal(C.origemDaTroca(C.destinoDaTroca(j, r), r), j);
  assert.ok(!C.temTroca(4));

  // Escolhas inválidas
  const tres = e.maos.map((m) => m.slice(0, 3));
  assert.equal(C.trocar(e, tres.slice(0, 3)), null, "todos passam ao mesmo tempo");
  assert.equal(C.trocar(e, [e.maos[0].slice(0, 2), ...tres.slice(1)]), null, "são 3 cartas");
  assert.equal(C.trocar(e, [[e.maos[0][0], e.maos[0][0], e.maos[0][1]], ...tres.slice(1)]), null, "3 cartas diferentes");
  assert.equal(C.trocar(e, [e.maos[1].slice(0, 3), ...tres.slice(1)]), null, "só as próprias cartas");
  assert.ok(!C.trocaValida(e.maos[0], null));

  // Troca para a esquerda: o que 0 passa vai para 1, e 0 recebe o que 3 passou
  const t = C.trocar(e, tres);
  assert.equal(t.fase, "vaza");
  assert.ok(t.iniciado);
  for (let j = 0; j < 4; j++) {
    assert.equal(t.maos[j].length, 13);
    for (const c of tres[j]) assert.ok(t.maos[(j + 1) % 4].includes(c));
    assert.deepEqual(t.recebidas[(j + 1) % 4], C.ordenar(tres[j]));
  }
  assert.ok(t.maos[t.atual.lider].includes(C.DOIS_DE_PAUS), "quem tem o 2 de paus depois da troca abre a vaza");
  assert.equal(C.vez(t), t.atual.lider);
  assert.equal(C.trocar(t, tres), null, "a troca só acontece uma vez");
  conferirInvariantes(t);

  // Na quarta rodada ninguém troca: a rodada começa direto nas vazas
  let x = C.novoJogo(100, 5);
  for (let r = 1; r < 4; r++) {
    x = { ...x, fase: "fim", placar: [...x.placar, { pontos: [6, 7, 6, 7], lua: null }] };
    x = C.proximaRodada(x);
  }
  assert.equal(x.rodada, 4);
  assert.equal(x.fase, "vaza", "sem troca na quarta rodada");
  assert.ok(x.maos[C.vez(x)].includes(C.DOIS_DE_PAUS));
  assert.deepEqual(x.maos, C.distribuir(5, 4));
}

// ---------- Primeira vaza ----------
{
  const e = mesa({
    maos: ["2p 9p Ae 3c", "Kp 4o 5c 6e", "Qe 2c 3o 7e", "Ac Kc Qc Jc"],
    atual: [0, ""],
  });
  assert.deepEqual(C.jogadasLegais(e), [carta("2p")], "o 2 de paus abre a primeira vaza");
  assert.equal(C.motivoIlegal(e, carta("9p")), "A primeira vaza começa com o 2 de paus.");
  assert.equal(C.motivoIlegal(e, carta("Kp")), "Essa carta não está na sua mão.");

  const a = C.jogar(e, carta("2p"));
  assert.equal(C.vez(a), 1);
  assert.deepEqual(C.jogadasLegais(a), [carta("Kp")], "quem tem paus segue paus");
  assert.equal(C.motivoIlegal(a, carta("4o")), "Você precisa seguir o naipe de paus.");
  assert.equal(C.jogar(a, carta("4o")), null, "carta ilegal não entra");

  const b = C.jogar(a, carta("Kp"));
  // Sem paus, na primeira vaza: nem copas nem a Dama de espadas
  assert.deepEqual(C.jogadasLegais(b), C.ordenar(cs("3o 7e")));
  assert.equal(C.motivoIlegal(b, carta("Qe")), "Na primeira vaza não vale jogar a Dama de espadas.");
  assert.equal(C.motivoIlegal(b, carta("2c")), "Na primeira vaza não vale jogar copas.");
  assert.equal(C.motivoIlegal(b, carta("3o")), null);

  const c = C.jogar(b, carta("3o"));
  // Só copas na mão: aí pode
  assert.deepEqual(C.jogadasLegais(c), C.ordenar(cs("Ac Kc Qc Jc")), "sem outra opção, copas valem na primeira vaza");
  const d = C.jogar(c, carta("Jc"));
  assert.equal(d.vazas.length, 1);
  assert.equal(d.atual.lider, 1, "o Rei de paus ganhou");
  assert.equal(C.vez(d), 1);
  assert.deepEqual(C.pontosNaRodada(d), [0, 1, 0, 0], "quem ganhou levou o ponto da copa");
  assert.ok(C.copasQuebradas(d), "a copa jogada quebrou as copas");
  assert.deepEqual(C.ultimaVaza(d), { lider: 0, cartas: cs("2p Kp 3o Jc"), vencedor: 1, pontos: 1 });

  // Mão só com copas e a Dama de espadas: tudo vale
  const f = mesa({ maos: ["", "", "", "Qe Ac 2c"], atual: [0, "2p 3p 4p"] });
  assert.deepEqual(C.jogadasLegais(f), C.ordenar(cs("Qe Ac 2c")));
}

// ---------- Quebrar copas e seguir o naipe ----------
{
  const umaVaza = [[0, "2p 3p 4p 5p"]];
  const e = mesa({ maos: ["3c 9c 4o Ke", "", "", ""], vazas: umaVaza, atual: [0, ""] });
  assert.deepEqual(C.jogadasLegais(e), C.ordenar(cs("4o Ke")), "copas não abrem a vaza antes de quebradas");
  assert.equal(C.motivoIlegal(e, carta("9c")), "As copas ainda não foram quebradas: comece a vaza com outro naipe.");

  const soCopas = mesa({ maos: ["3c 9c", "", "", ""], vazas: umaVaza, atual: [0, ""] });
  assert.deepEqual(C.jogadasLegais(soCopas), C.ordenar(cs("3c 9c")), "quem só tem copas pode abrir com copas");

  // A Dama de espadas descartada não quebra copas
  const comDama = mesa({ maos: ["3c 4o", "", "", ""], vazas: [[0, "2p 3p Qe 5p"]], atual: [0, ""] });
  assert.ok(!C.copasQuebradas(comDama));
  assert.deepEqual(C.jogadasLegais(comDama), [carta("4o")]);

  const quebradas = mesa({ maos: ["3c 4o", "", "", ""], vazas: [[0, "2p 3p 7c 5p"]], atual: [0, ""] });
  assert.ok(C.copasQuebradas(quebradas));
  assert.deepEqual(C.jogadasLegais(quebradas), C.ordenar(cs("3c 4o")), "depois de quebradas, copas abrem a vaza");

  const seguir = mesa({ maos: ["", "2o Ko 9e Ac", "", ""], vazas: umaVaza, atual: [0, "7o"] });
  assert.deepEqual(C.jogadasLegais(seguir), C.ordenar(cs("2o Ko")));
  assert.equal(C.motivoIlegal(seguir, carta("9e")), "Você precisa seguir o naipe de ouros.");
  const semOuros = mesa({ maos: ["", "9e Ac", "", ""], vazas: umaVaza, atual: [0, "7o"] });
  assert.deepEqual(C.jogadasLegais(semOuros), C.ordenar(cs("9e Ac")), "sem o naipe, depois da primeira vaza, vale tudo");
}

// ---------- Quem ganha a vaza ----------
{
  assert.equal(C.vencedorDaVaza(0, cs("5o Ae Ko 9o")), 2, "a carta mais alta do naipe que abriu");
  assert.equal(C.vencedorDaVaza(2, cs("5o Ae Ko 9o")), 0);
  assert.equal(C.vencedorDaVaza(1, cs("2c Ae Ao Ap")), 1, "carta de outro naipe não ganha, por mais alta que seja");
  assert.equal(C.vencedorDaVaza(3, cs("10e Je Qe Ke")), 2);

  const e = mesa({ maos: ["", "", "", "Ac"], vazas: [[0, "2p 3p 4p 5p"]], atual: [0, "4c 9c Qe"] });
  const n = C.jogar(e, carta("Ac"));
  assert.equal(n.atual.lider, 3, "quem ganha começa a próxima vaza");
  assert.equal(C.vez(n), 3);
  assert.deepEqual(C.pontosNaRodada(n), [0, 0, 0, 3 + 13]);
}

// ---------- Pontos, tiro na lua e fim da partida ----------
{
  // O resultado conta só as vazas: 19 pontos para quem levou a Dama e 6 copas
  const parcial = C.resultadoDaRodada([
    { lider: 0, cartas: cs("Ap 2p 3p Qe") },
    { lider: 0, cartas: cs("Ao 2c 3c 4c") },
    { lider: 0, cartas: cs("Ae 5c 6c 7c") },
  ]);
  assert.deepEqual(parcial, { pontos: [19, 0, 0, 0], lua: null }, "19 pontos não é tiro na lua");
  const tiro = C.resultadoDaRodada([
    { lider: 1, cartas: cs("Ap 2p 3p Qe") },
    { lider: 1, cartas: cs("Ao 2c 3c 4c") },
    { lider: 1, cartas: cs("Ae 5c 6c 7c") },
    { lider: 1, cartas: cs("Kp 8c 9c 10c") },
    { lider: 1, cartas: cs("Ko Jc Qc Kc") },
    { lider: 1, cartas: cs("Ke Ac 4p 5p") },
  ]);
  assert.deepEqual(tiro, { pontos: [26, 0, 26, 26], lua: 1 }, "tiro na lua: 0 para quem levou tudo e 26 para cada adversário");

  // Fim da partida: alguém chegou a 100 e o menor total é único
  const placar = (...linhas) => linhas.map((pontos) => ({ pontos, lua: null }));
  assert.ok(!C.encerraPartida(placar([10, 6, 5, 5], [20, 2, 2, 2]), 100), "ninguém chegou a 100");
  assert.ok(C.encerraPartida(placar([90, 0, 10, 0], [10, 6, 0, 10]), 100), "100 pontos encerram");
  assert.ok(C.encerraPartida(placar([50, 0, 0, 0]), 50) === false, "empate no menor total: mais uma rodada");
  assert.ok(C.encerraPartida(placar([50, 1, 0, 0]), 50) === false);
  assert.ok(C.encerraPartida(placar([40, 2, 1, 0], [10, 0, 0, 0]), 50));

  const fim = { ...C.novoJogo(50, 3), fase: "fim", placar: placar([20, 6, 0, 0], [20, 0, 6, 0], [13, 0, 0, 13]) };
  assert.ok(!C.terminou(fim), "53, 6, 6 e 13: empate no menor total, segue");
  assert.equal(C.vencedor(fim), null);
  const proxima = C.proximaRodada(fim);
  assert.equal(proxima.rodada, 2);
  assert.equal(proxima.fase, "troca");
  assert.deepEqual(C.totais(proxima), [53, 6, 6, 13], "a próxima rodada leva o placar");
  const acabou = { ...fim, placar: [...fim.placar, { pontos: [0, 26, 0, 0], lua: null }] };
  assert.ok(C.terminou(acabou));
  assert.equal(C.vencedor(acabou), 2);
  assert.equal(C.proximaRodada(acabou), null, "partida terminada não tem próxima rodada");
  assert.deepEqual(
    C.classificacao(acabou).map((l) => [l.jogador, l.total, l.posicao]),
    [
      [2, 6, 1],
      [3, 13, 2],
      [1, 32, 3],
      [0, 53, 4],
    ],
  );
  const empatados = { ...fim, placar: placar([10, 10, 3, 3]) };
  assert.deepEqual(
    C.classificacao(empatados).map((l) => l.posicao),
    [1, 1, 3, 3],
    "empate divide a colocação",
  );
  assert.equal(C.proximaRodada(C.novoJogo(100, 1)), null, "só depois do fim da rodada");
}

// ---------- Computador: jogadas ----------
{
  const abertura = [[0, "2p 3p 4p 5p"]];
  const jogada = (partes) => {
    const d = C.decidirJogada(mesa(partes));
    assert.ok(typeof d.motivo === "string" && d.motivo.length > 10, "a dica explica a jogada");
    return C.nomeCarta(d.carta);
  };

  // Fica abaixo da carta que está ganhando, com a mais alta que ainda perde
  assert.equal(jogada({ maos: ["", "3o 8o Qo Ao", "", ""], vazas: abertura, atual: [0, "10o"] }), "8 de ouros");
  // Último a jogar numa vaza com pontos: não ganha se dá para perder
  assert.equal(jogada({ maos: ["", "", "", "4e 9e Ke"], vazas: [[0, "2p 3p 7c 5p"]], atual: [0, "10e 3c 2e"] }), "9 de espadas");
  // Último numa vaza sem pontos: gasta a carta mais alta
  assert.equal(jogada({ maos: ["", "", "", "4o 9o Ko"], vazas: abertura, atual: [0, "10o 3o 2o"] }), "Rei de ouros");
  // Na primeira vaza, sem pontos possíveis, gasta o paus mais alto
  assert.equal(jogada({ maos: ["", "3p 9p Kp", "", ""], atual: [0, "2p"] }), "Rei de paus");
  // Rei de espadas ganhando: a Dama vai embaixo dele
  assert.equal(jogada({ maos: ["", "", "3e Qe 9o", ""], vazas: abertura, atual: [0, "5e Ke"] }), "Dama de espadas");
  // Sem poder ficar abaixo numa vaza de espadas com a Dama fora: não arrisca o Rei
  assert.equal(jogada({ maos: ["", "Je Ke", "", ""], vazas: [[0, "2p 3p 4p 5p"], [0, "2e 3e 4e 5e"]], atual: [0, "9e"] }), "Valete de espadas");

  // Sem o naipe: primeiro a Dama de espadas
  assert.equal(jogada({ maos: ["", "Qe Ac 9p", "", ""], vazas: [[0, "2o 3o 4o 5o"]], atual: [0, "6e"] }), "Dama de espadas");
  // ... depois copas altas
  assert.equal(jogada({ maos: ["", "Kc 2c 9p", "", ""], vazas: [[0, "2o 3o 4o 5o"]], atual: [0, "6e"] }), "Rei de copas");
  // ... o Rei e o Ás de espadas, com a Dama ainda fora
  assert.equal(jogada({ maos: ["", "Ae 4c Ko", "", ""], vazas: abertura, atual: [0, "6p"] }), "Ás de espadas");
  // ... e então a carta alta mais perigosa
  assert.equal(jogada({ maos: ["", "3o Ao 5e", "", ""], vazas: [[0, "2c 3c 4c 5c"]], atual: [0, "6p"] }), "Ás de ouros");
  // Na primeira vaza, sem paus, o descarte não pode ter pontos
  assert.equal(jogada({ maos: ["", "Qe Ac Ke 4o", "", ""], atual: [0, "2p"] }), "Rei de espadas");

  // Saída baixa num naipe seguro
  assert.equal(jogada({ maos: ["4o Ko 9p Jp Ke Ae", "", "", ""], vazas: abertura, atual: [0, ""] }), "4 de ouros");
  // Sem a Dama e só com espadas baixas: puxa espadas
  assert.equal(jogada({ maos: ["3e 8e 4o Kp", "", "", ""], vazas: abertura, atual: [0, ""] }), "3 de espadas");
  // Com o Rei de espadas na mão, não puxa espadas
  assert.notEqual(jogada({ maos: ["3e Ke 4o Kp", "", "", ""], vazas: abertura, atual: [0, ""] }), "3 de espadas");
  // Com a Dama na mão, também não
  assert.equal(jogada({ maos: ["3e Qe 5o 9p", "", "", ""], vazas: abertura, atual: [0, ""] }), "5 de ouros");
  // A Dama já saiu: espadas é um naipe como os outros
  assert.equal(jogada({ maos: ["3e 8e 4o", "", "", ""], vazas: [[0, "2p 3p Qe 5p"]], atual: [0, ""] }), "3 de espadas");
  // Nunca sai com a carta que certamente ganha quando há outra opção
  assert.equal(jogada({ maos: ["Ap 5o", "", "", ""], vazas: [[0, "2p 3p 4p 5p"], [0, "6p 7p 8p 9p"], [0, "10p Jp Qp Kp"]], atual: [0, ""] }), "5 de ouros");

  // Tiro na lua: Ana (1) levou a Dama e 6 copas, e ninguém mais tem pontos
  const luaVazas = [
    [0, "2p Ap 4p 5p"],
    [1, "Ae Qe 3e 4e"],
    [1, "Ac 2c 3c 4c"],
    [1, "Kc 5c 6c 7o"],
  ];
  const info = C.analisar(mesa({ vazas: luaVazas, atual: [1, ""] }));
  assert.deepEqual(info.pontos, [0, 20, 0, 0]);
  assert.equal(C.ameacaDeLua(info, 0), 1, "Ana pode estar tentando o tiro na lua");
  assert.equal(C.ameacaDeLua(info, 1), null, "não é ameaça para ela mesma");
  assert.equal(C.ameacaDeLua(C.analisar(mesa({ vazas: [[0, "2p Ap 4p 5p"], [1, "Ae Qe 3e 4e"]], atual: [1, ""] })), 0), null, "só a Dama ainda não é ameaça");
  // Ana está ganhando: quem não tem o naipe guarda as copas
  assert.equal(jogada({ maos: ["", "", "9c 4o Je", ""], vazas: luaVazas, atual: [1, "Kp"] }), "Valete de espadas");
  // Beto (2) está ganhando e Ana já jogou: Clara dá a copa para Beto
  assert.equal(jogada({ maos: ["", "", "", "9c 4o"], vazas: luaVazas, atual: [1, "9p Kp"] }), "9 de copas");
  // Com copas na vaza e Ana ganhando, quem pode passar por cima ganha a vaza
  assert.equal(jogada({ maos: ["", "", "", "9c Jc 4o"], vazas: luaVazas, atual: [1, "10c 8c"] }), "Valete de copas");
  // Abrindo a vaza com uma copa que certamente ganha
  assert.equal(jogada({ maos: ["Qc 3o", "", "", ""], vazas: luaVazas.slice(0, 3).concat([[1, "Kc 5c 6c 7o"]]), atual: [0, ""] }), "Dama de copas");

  // Uma carta só
  const unica = C.decidirJogada(mesa({ maos: ["2p 9o", "", "", ""], atual: [0, ""] }));
  assert.equal(unica.carta, carta("2p"));
  assert.equal(unica.motivo, "quem tem o 2 de paus abre a primeira vaza com ele");
  assert.equal(C.decidirJogada({ ...mesa(), fase: "troca" }), null);
  assert.equal(C.escolherJogada({ ...mesa(), fase: "fim" }), null);
}

// ---------- Computador: troca ----------
{
  const troca = (texto) => nomes(C.escolherTroca(C.ordenar(cs(texto))));
  // Dama de espadas com poucas espadas baixas: vai embora, com o Ás de espadas
  assert.deepEqual(troca("Qe Ae 3e 2p 5p 9p 4o 8o Jo 2c 5c 7c 9c").slice(0, 3).sort(), ["Dama de espadas", "Valete de ouros", "Ás de espadas"].sort());
  // Dama protegida por 4 espadas baixas: fica
  assert.ok(!troca("Qe 2e 4e 6e 8e 3p 5p 9p 4o 8o Jo 2c 5c").includes("Dama de espadas"), "Dama protegida fica na mão");
  // Copas altas saem
  assert.deepEqual(troca("Ac Kc 2c 3e 5e 8e 2p 4p 6p 3o 5o 7o 9o").sort(), ["Ás de copas", "Rei de copas", "9 de ouros"].sort());
  // Naipe curto: fica sem ele
  const curto = troca("Kp 7p 2e 4e 6e 8e 3c 4c 5c 2o 4o 6o 9o");
  assert.ok(curto.includes("Rei de paus") && curto.includes("7 de paus"), "passa os dois paus para ficar sem paus");
  assert.equal(new Set(C.escolherTroca(C.novoJogo(100, 8).maos[0])).size, 3);
  const mao = C.ordenar(cs("Qe Ae 3e 2p 5p 9p 4o 8o Jo 2c 5c 7c 9c"));
  assert.match(C.explicarTroca(mao, C.escolherTroca(mao)), /Dama de espadas/);
  assert.equal(C.explicarTroca(cs("2p 3p 4p 5o"), cs("2p 3p 4p")), "sem paus, você poderá descartar pontos quando esse naipe sair");
}

// ---------- Partidas simuladas ----------

const IA = { nome: "computador", troca: (mao) => C.escolherTroca(mao), jogada: (e) => C.escolherJogada(e) };
const ACASO = {
  nome: "ao acaso",
  troca: (mao, sorteio) => {
    const copia = mao.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(sorteio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia.slice(0, 3);
  },
  jogada: (e, legais, sorteio) => legais[Math.floor(sorteio() * legais.length)],
};

/** Joga uma partida inteira; [aCada] é chamada depois de cada passo. */
function jogarPartida(modo, semente, estrategias, sorteio, aCada = () => {}) {
  let e = C.novoJogo(modo, semente);
  for (let rodadas = 0; rodadas < 80; rodadas++) {
    if (e.fase === "troca") {
      e = C.trocar(
        e,
        [0, 1, 2, 3].map((j) => estrategias[j].troca(e.maos[j], sorteio)),
      );
      assert.ok(e, "a troca do computador é válida");
      aCada(e);
    }
    while (e.fase === "vaza") {
      const legais = C.jogadasLegais(e);
      assert.ok(legais.length > 0, "quem tem a vez sempre tem jogada");
      const c = estrategias[C.vez(e)].jogada(e, legais, sorteio);
      assert.ok(legais.includes(c), "o computador só faz jogadas válidas");
      e = C.jogar(e, c);
      aCada(e);
    }
    assert.equal(e.fase, "fim");
    if (C.terminou(e)) return e;
    e = C.proximaRodada(e);
    aCada(e);
  }
  assert.fail("a partida não terminou");
}

{
  // Partidas ao acaso: nada se perde, só jogadas válidas, o placar fecha
  const sorteio = C.aleatorioComSemente(11);
  let passos = 0;
  for (let p = 1; p <= 40; p++) {
    const modo = C.MODOS[p % 2];
    const fim = jogarPartida(modo, p, [ACASO, ACASO, ACASO, ACASO], sorteio, (e) => {
      passos += 1;
      if (e.fase === "vaza") {
        const todas = [...e.maos.flat(), ...e.vazas.flatMap((v) => v.cartas), ...e.atual.cartas];
        assert.equal(new Set(todas).size, 52);
        assert.equal(todas.length, 52);
        // Uma carta que não pode ser jogada é recusada
        const ilegal = e.maos[C.vez(e)].find((c) => !C.podeJogar(e, c));
        if (ilegal !== undefined) assert.equal(C.jogar(e, ilegal), null);
      }
      if (passos % 23 === 0) conferirInvariantes(e);
    });
    for (const linha of fim.placar) assert.equal(linha.pontos.reduce((a, b) => a + b, 0), linha.lua === null ? 26 : 78, "cada rodada distribui 26 pontos");
    const t = C.totais(fim);
    assert.ok(Math.max(...t) >= modo);
    assert.equal(t.filter((x) => x === Math.min(...t)).length, 1, "o vencedor é único");
    assert.equal(fim.vazas.length, 13);
    conferirInvariantes(fim);
  }
}

{
  // O computador joga bem melhor que jogadas ao acaso: com ele em dois lugares e jogadas ao acaso
  // nos outros dois (e depois trocando os lugares), os lugares do computador fazem muito menos pontos
  const sorteio = C.aleatorioComSemente(2024);
  const soma = { computador: 0, "ao acaso": 0 };
  const rodadas = { computador: 0, "ao acaso": 0 };
  const vitorias = { computador: 0, "ao acaso": 0 };
  let luas = 0;
  const partidas = 60;
  for (let p = 1; p <= partidas; p++) {
    const estrategias = p % 2 ? [IA, ACASO, IA, ACASO] : [ACASO, IA, ACASO, IA];
    const fim = jogarPartida(100, 1000 + p, estrategias, sorteio);
    for (const linha of fim.placar) {
      if (linha.lua !== null) luas += 1;
      linha.pontos.forEach((pontos, j) => {
        soma[estrategias[j].nome] += pontos;
        rodadas[estrategias[j].nome] += 1;
      });
    }
    vitorias[estrategias[C.vencedor(fim)].nome] += 1;
  }
  const media = (nome) => soma[nome] / rodadas[nome];
  console.log(
    `por rodada: computador ${media("computador").toFixed(2)} pontos, ao acaso ${media("ao acaso").toFixed(2)}; ` +
      `vitórias: computador ${vitorias.computador}, ao acaso ${vitorias["ao acaso"]} (${luas} tiros na lua)`,
  );
  assert.ok(media("computador") < 0.6 * media("ao acaso"), "o computador faz bem menos pontos por rodada");
  assert.ok(vitorias.computador >= partidas * 0.85, "e ganha quase todas as partidas");

  // Quatro computadores: as partidas terminam e o placar fecha
  for (let p = 1; p <= 12; p++) {
    const fim = jogarPartida(C.MODOS[p % 2], 500 + p, [IA, IA, IA, IA], sorteio, (e) => p === 1 && conferirInvariantes(e));
    assert.ok(C.terminou(fim));
  }
}

// ---------- Salvar e restaurar ----------
{
  const inicio = C.novoJogo(50, 77);
  assert.deepEqual(C.restaurar(JSON.parse(JSON.stringify(inicio))), inicio);
  let e = C.trocar(inicio, inicio.maos.map((m) => C.escolherTroca(m)));
  for (let i = 0; i < 9; i++) e = C.jogar(e, C.escolherJogada(e));
  assert.equal(e.vazas.length, 2);
  assert.equal(e.atual.cartas.length, 1);
  assert.deepEqual(C.restaurar(JSON.parse(JSON.stringify(e))), e);

  const copia = () => JSON.parse(JSON.stringify(e));
  assert.equal(C.restaurar(null), null);
  assert.equal(C.restaurar("x"), null);
  assert.equal(C.restaurar({ ...copia(), modo: 75 }), null, "modo inválido");
  assert.equal(C.restaurar({ ...copia(), semente: 0 }), null);
  assert.equal(C.restaurar({ ...copia(), semente: 78 }), null, "as cartas não são as desta partida");
  assert.equal(C.restaurar({ ...copia(), rodada: 2 }), null, "o placar não bate com a rodada");
  assert.equal(C.restaurar({ ...copia(), fase: "troca" }), null);
  assert.equal(C.restaurar({ ...copia(), fase: "jogo" }), null);

  const repetida = copia();
  repetida.maos[0][0] = repetida.maos[1][0];
  assert.equal(C.restaurar(repetida), null, "carta repetida");
  const trocada = copia();
  trocada.maos[0].push(trocada.maos[1].pop());
  assert.equal(C.restaurar(trocada), null, "carta que mudou de mão");
  const fora = copia();
  [fora.maos[0][0], fora.maos[1][0]] = [fora.maos[1][0], fora.maos[0][0]];
  assert.equal(C.restaurar(fora), null, "duas cartas trocadas entre as mãos");
  const recebida = copia();
  recebida.recebidas[0] = recebida.recebidas[0].slice(0, 2);
  assert.equal(C.restaurar(recebida), null, "a troca não bate");
  const lider = copia();
  lider.atual.lider = (lider.atual.lider + 1) % 4;
  assert.equal(C.restaurar(lider), null, "a vez não bate");
  const ordem = copia();
  ordem.vazas[0].cartas.reverse();
  assert.equal(C.restaurar(ordem), null, "a primeira vaza tem de começar com o 2 de paus");

  // Uma jogada ilegal no histórico é recusada: Clara não seguiu o naipe tendo ele na mão
  const legal = C.novoJogo(100, 4);
  let x = C.trocar(legal, legal.maos.map((m) => m.slice(0, 3)));
  let ilegal = null;
  for (let passo = 0; passo < 40 && !ilegal && x.fase === "vaza"; passo++) {
    const j = C.vez(x);
    const naoSegue = x.atual.cartas.length ? x.maos[j].find((c) => !C.podeJogar(x, c)) : undefined;
    if (naoSegue !== undefined) {
      // Monta à mão o estado como se ela tivesse jogado a carta proibida
      ilegal = JSON.parse(JSON.stringify(x));
      ilegal.maos[j] = ilegal.maos[j].filter((c) => c !== naoSegue);
      ilegal.atual.cartas.push(naoSegue);
    }
    x = C.jogar(x, C.escolherJogada(x));
  }
  assert.ok(ilegal, "achou uma jogada ilegal para testar");
  assert.equal(C.restaurar(ilegal), null, "jogada ilegal no histórico");

  // O placar tem de fechar 26 por rodada e a partida não pode ter acabado antes
  const fim = C.proximaRodada({ ...inicio, fase: "fim", placar: [{ pontos: [3, 10, 13, 0], lua: null }] });
  assert.deepEqual(C.restaurar(JSON.parse(JSON.stringify(fim))), fim);
  assert.equal(C.restaurar({ ...JSON.parse(JSON.stringify(fim)), placar: [{ pontos: [3, 10, 13, 1], lua: null }] }), null);
  assert.equal(C.restaurar({ ...JSON.parse(JSON.stringify(fim)), placar: [{ pontos: [26, 0, 26, 26], lua: 0 }] }), null, "lua de quem ficou com 26");
  assert.ok(C.restaurar({ ...JSON.parse(JSON.stringify(fim)), placar: [{ pontos: [26, 0, 26, 26], lua: 1 }] }));
  assert.equal(C.restaurar({ ...JSON.parse(JSON.stringify(fim)), placar: [{ pontos: [26, 0, 0, 0], lua: null }] }), null, "26 sem tiro na lua");
  assert.equal(C.restaurar({ ...JSON.parse(JSON.stringify(fim)), placar: [] }), null, "falta a linha da rodada 1");

  // A rodada terminada (antes da próxima) também volta
  let r = C.trocar(inicio, inicio.maos.map((m) => C.escolherTroca(m)));
  while (r.fase === "vaza") r = C.jogar(r, C.escolherJogada(r));
  assert.equal(r.fase, "fim");
  assert.deepEqual(C.restaurar(JSON.parse(JSON.stringify(r))), r);
  const placarErrado = JSON.parse(JSON.stringify(r));
  const linha = placarErrado.placar[0];
  placarErrado.placar[0] = { pontos: [...linha.pontos.slice(1), linha.pontos[0]], lua: linha.lua === null ? null : (linha.lua + 3) % 4 };
  assert.equal(C.restaurar(placarErrado), null, "o placar da rodada não bate com as vazas");
}

// ---------- Estatísticas ----------
{
  let est = C.estatisticasVazias();
  let r = C.registrarResultado(est, { venceu: true, pontos: 64 });
  est = r.estatisticas;
  assert.equal(est.jogadas, 1);
  assert.equal(est.vitorias, 1);
  assert.equal(est.melhorPontuacao, 64);
  assert.equal(r.recordes.pontuacao, false, "a primeira pontuação não é recorde");
  r = C.registrarResultado(est, { venceu: false, pontos: 51 });
  est = r.estatisticas;
  assert.ok(r.recordes.pontuacao, "menos pontos é recorde, mesmo sem vencer");
  assert.equal(est.melhorPontuacao, 51);
  assert.equal(est.sequencia, 0);
  est = C.registrarResultado(est, { venceu: true, pontos: 70 }).estatisticas;
  est = C.registrarResultado(est, { venceu: true, pontos: 60 }).estatisticas;
  assert.equal(est.sequencia, 2);
  assert.equal(est.melhorSequencia, 2);
  assert.equal(est.melhorPontuacao, 51);
  est = C.registrarResultado(est, { venceu: false }).estatisticas;
  assert.equal(est.jogadas, 5, "partida abandonada conta como jogada");
  assert.equal(est.sequencia, 0);
  assert.equal(est.melhorPontuacao, 51);
  assert.equal(C.porcentagemVitorias(est), 60);
  assert.equal(C.porcentagemVitorias(C.estatisticasVazias()), 0);
  est = C.registrarLua(C.registrarLua(est));
  assert.equal(est.luas, 2);
  assert.deepEqual(C.lerEstatisticas({ jogadas: 2, vitorias: 5, melhorPontuacao: -3, luas: "x", sequencia: 9 }), {
    jogadas: 2,
    vitorias: 2,
    melhorPontuacao: null,
    luas: 0,
    sequencia: 2,
    melhorSequencia: 2,
  });
  assert.deepEqual(C.lerEstatisticas(null), C.estatisticasVazias());
  assert.equal(C.formatarNumero(123456), "123.456");
}

console.log("copas: todos os testes passaram");
