"use strict";
/*
 * Testes da lógica do Lumibricks (assets/jogos/lumibricks-logica.js), os mesmos casos de
 * MotorJogoTest.kt, PecasERotacaoTest.kt, PontuacaoEGeradorTest.kt, TabuleiroTest.kt e
 * RecordesTest.kt do app. Rodar com: node _fonte/testes/lumibricks.test.js
 */
const assert = require("node:assert/strict");
const L = require("../../assets/jogos/lumibricks-logica.js");

/** Sequência pseudoaleatória fixa (mulberry32), no lugar do Random(semente) do Kotlin. */
function semente(valor) {
  let a = valor >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let total = 0;
function teste(nome, fn) {
  fn();
  total++;
  console.log(`ok - ${nome}`);
}

const Z = L.codigoDoTipo("Z");
const P = (tipo, x, y, rotacao = 0) => L.peca(tipo, x, y, rotacao);
const conjunto = (lista) => new Set(lista.map((c) => `${c.x},${c.y}`));
const pontos = (...pares) => conjunto(pares.map(([x, y]) => ({ x, y })));

function celulas(...ocupadas) {
  const grade = new Array(200).fill(0);
  for (const [x, y] of ocupadas) grade[y * 10 + x] = Z;
  return grade;
}
const linha = (y, exceto = []) => [...Array(10).keys()].filter((x) => !exceto.includes(x)).map((x) => [x, y]);

/** Motor já jogando, com tabuleiro e peças escolhidos pelo teste. */
function motor(atual, { grade = new Array(200).fill(0), proxima = "O", guardada = null, podeGuardar = true, linhas = 0, nivel = 1 } = {}) {
  const m = new L.Motor(semente(1));
  const partida = { celulas: grade, pontos: 0, linhas, nivel, tempoMs: 0, atual, proxima, guardada, podeGuardar, saco: [] };
  assert.ok(m.restaurar(partida));
  assert.equal(m.status, "pausado");
  m.retomar();
  return m;
}

/** Avança o relógio em passos de 50 ms (como quadros de tela). */
function passar(m, ms) {
  for (let resto = ms; resto > 0; resto -= 50) m.avancar(Math.min(50, resto));
}

// ---------- Peças e giro (PecasERotacaoTest.kt) ----------

teste("peças de quatro blocos têm 4 células em todos os giros e o dourado tem 1", () => {
  for (const tipo of L.QUATRO_BLOCOS) {
    assert.equal(L.PECAS[tipo].rotacoes.length, 4);
    for (const r of L.PECAS[tipo].rotacoes) assert.equal(r.length, 4, tipo);
  }
  for (const r of L.PECAS.DOURADO.rotacoes) assert.equal(r.length, 1);
  assert.equal(L.QUATRO_BLOCOS.length, 7);
});

teste("estados de giro iguais aos do app", () => {
  assert.deepEqual(conjunto(L.PECAS.T.rotacoes[1]), pontos([1, 0], [1, 1], [2, 1], [1, 2]));
  assert.deepEqual(conjunto(L.PECAS.I.rotacoes[1]), pontos([2, 0], [2, 1], [2, 2], [2, 3]));
  assert.deepEqual(conjunto(L.PECAS.I.rotacoes[2]), pontos([0, 2], [1, 2], [2, 2], [3, 2]));
  assert.deepEqual(conjunto(L.PECAS.S.rotacoes[1]), pontos([1, 0], [1, 1], [2, 1], [2, 2]));
  assert.deepEqual(conjunto(L.PECAS.O.rotacoes[0]), conjunto(L.PECAS.O.rotacoes[1]));
});

teste("peças nascem centralizadas com a primeira linha no topo", () => {
  assert.deepEqual(L.novaPeca("T"), P("T", 3, 0));
  assert.deepEqual(L.novaPeca("I"), P("I", 3, -1));
  assert.deepEqual(L.novaPeca("O"), P("O", 4, 0));
  assert.deepEqual(L.novaPeca("DOURADO"), P("DOURADO", 4, 0));
  for (const tipo of L.TIPOS) assert.equal(Math.min(...L.celulas(L.novaPeca(tipo)).map((c) => c.y)), 0, tipo);
});

teste("quatro giros no espaço livre voltam ao início", () => {
  const tabuleiro = new L.Tabuleiro();
  for (const tipo of L.QUATRO_BLOCOS.filter((t) => t !== "O")) {
    const inicio = P(tipo, 4, 8);
    let p = inicio;
    for (let i = 0; i < 4; i++) p = L.girar(tabuleiro, p, true);
    assert.deepEqual(p, inicio);
    for (let i = 0; i < 4; i++) p = L.girar(tabuleiro, p, false);
    assert.deepEqual(p, inicio);
  }
});

teste("peça I em pé encostada na parede esquerda gira com deslocamento", () => {
  const tabuleiro = new L.Tabuleiro();
  const emPe = P("I", -2, 5, 1); // células na coluna 0
  assert.ok(tabuleiro.cabe(emPe));
  const horario = L.girar(tabuleiro, emPe, true);
  assert.ok(horario && tabuleiro.cabe(horario));
  assert.equal(horario.rotacao, 2);
  assert.equal(Math.min(...L.celulas(horario).map((c) => c.x)), 0);
  const antiHorario = L.girar(tabuleiro, emPe, false);
  assert.ok(antiHorario && tabuleiro.cabe(antiHorario));
  assert.equal(antiHorario.rotacao, 0);
});

teste("T na parede direita usa o deslocamento da tabela", () => {
  const tabuleiro = new L.Tabuleiro();
  const p = P("T", 8, 5, 3); // estado L, células nas colunas 8 e 9
  assert.deepEqual(L.girar(tabuleiro, p, true), P("T", 7, 5, 0));
});

teste("giro sem espaço não acontece", () => {
  const grade = new Array(200).fill(0);
  for (let y = 15; y <= 18; y++) for (let x = 0; x < 10; x++) grade[y * 10 + x] = 1;
  const tabuleiro = new L.Tabuleiro(10, 20, grade);
  const deitada = P("I", 3, 18); // ocupa a linha 19, presa embaixo da pilha
  assert.ok(tabuleiro.cabe(deitada));
  assert.equal(L.girar(tabuleiro, deitada, true), null);
  assert.equal(L.girar(tabuleiro, deitada, false), null);
});

teste("O e bloco dourado não giram", () => {
  const tabuleiro = new L.Tabuleiro();
  assert.equal(L.girar(tabuleiro, P("O", 4, 5), true), null);
  assert.equal(L.girar(tabuleiro, P("DOURADO", 4, 5), true), null);
});

teste("girar nunca coloca a peça dentro de paredes ou blocos", () => {
  const aleatorio = semente(7);
  const inteiro = (min, max) => min + Math.floor(aleatorio() * (max - min));
  for (let k = 0; k < 500; k++) {
    const grade = Array.from({ length: 200 }, (_, i) => (i >= 80 && inteiro(0, 100) < 45 ? 1 + inteiro(0, 7) : 0));
    const tabuleiro = new L.Tabuleiro(10, 20, grade);
    const tipo = L.QUATRO_BLOCOS[inteiro(0, 7)];
    const p = P(tipo, inteiro(-2, 9), inteiro(-1, 18), inteiro(0, 4));
    if (!tabuleiro.cabe(p)) continue;
    const girada = L.girar(tabuleiro, p, aleatorio() < 0.5);
    if (!girada) continue;
    assert.ok(tabuleiro.cabe(girada));
    assert.ok(L.celulas(girada).every((c) => c.x >= 0 && c.x < 10 && c.y < 20));
  }
});

// ---------- Tabuleiro (TabuleiroTest.kt) ----------

const tabuleiroCom = (...ocupadas) => new L.Tabuleiro(10, 20, celulas(...ocupadas));

teste("paredes e fundo colidem, acima do topo não", () => {
  const t = new L.Tabuleiro();
  assert.ok(t.ocupada(-1, 5));
  assert.ok(t.ocupada(10, 5));
  assert.ok(t.ocupada(3, 20));
  assert.ok(!t.ocupada(3, -2));
  assert.ok(!t.ocupada(0, 19));
});

teste("colisão com blocos", () => {
  const t = tabuleiroCom([4, 10]);
  assert.ok(!t.cabe(P("O", 3, 9)));
  assert.ok(t.cabe(P("O", 5, 9)));
  assert.ok(t.cabe(P("O", 3, 8)));
});

teste("linhas completas são removidas e o resto desce", () => {
  const t = tabuleiroCom(...linha(19), ...linha(17), [0, 18], [5, 16]);
  assert.deepEqual(t.linhasCompletas(), [17, 19]);
  t.limparLinhas(t.linhasCompletas());
  assert.equal(t.tipoEm(0, 19), "Z"); // antiga linha 18
  assert.equal(t.tipoEm(1, 19), null);
  assert.equal(t.tipoEm(5, 18), "Z"); // antiga linha 16
  assert.deepEqual(t.linhasCompletas(), []);
  assert.equal(t.copiaCelulas().filter((c) => c !== 0).length, 2);
});

teste("quatro linhas de uma vez", () => {
  const t = tabuleiroCom(...linha(16), ...linha(17), ...linha(18), ...linha(19), [2, 15]);
  t.limparLinhas(t.linhasCompletas());
  assert.equal(t.tipoEm(2, 19), "Z");
  assert.equal(t.copiaCelulas().filter((c) => c !== 0).length, 1);
});

teste("fixar acima do topo não grava nada", () => {
  const t = new L.Tabuleiro();
  assert.ok(!t.fixar(P("O", 4, -1)));
  assert.equal(t.copiaCelulas().filter((c) => c !== 0).length, 0);
  assert.ok(t.fixar(P("O", 4, 18)));
  assert.equal(t.tipoEm(5, 19), "O");
});

teste("destino do bloco dourado é o buraco mais fundo da coluna", () => {
  // Coluna 4: buraco na linha 19 coberto pelas linhas 15 a 18
  assert.equal(tabuleiroCom([4, 15], [4, 16], [4, 17], [4, 18]).destinoDourado(4, 0), 19);
  // Sem vazio abaixo: o vazio mais próximo acima
  const cheia = tabuleiroCom(...[...Array(15).keys()].map((k) => [4, k + 5]));
  assert.equal(cheia.destinoDourado(4, 10), 4);
  // Coluna toda cheia
  const lotada = tabuleiroCom(...[...Array(20).keys()].map((k) => [4, k]));
  assert.equal(lotada.destinoDourado(4, 0), -1);
});

// ---------- Pontuação e sorteio (PontuacaoEGeradorTest.kt) ----------

teste("pontos por linhas vezes o nível", () => {
  assert.equal(L.pontosPorLinhas(1, 1), 100);
  assert.equal(L.pontosPorLinhas(2, 1), 300);
  assert.equal(L.pontosPorLinhas(3, 1), 500);
  assert.equal(L.pontosPorLinhas(4, 1), 800);
  assert.equal(L.pontosPorLinhas(4, 3), 2400);
  assert.equal(L.pontosPorLinhas(0, 5), 0);
});

teste("nível sobe a cada 10 linhas", () => {
  assert.equal(L.nivelPorLinhas(0), 1);
  assert.equal(L.nivelPorLinhas(9), 1);
  assert.equal(L.nivelPorLinhas(10), 2);
  assert.equal(L.nivelPorLinhas(25), 3);
});

teste("velocidade 15% maior por nível, com mínimo de 70 ms", () => {
  assert.equal(L.intervaloQuedaMs(1), 1000);
  assert.equal(L.intervaloQuedaMs(2), 850);
  assert.equal(L.intervaloQuedaMs(3), 722);
  assert.equal(L.intervaloQuedaMs(10), 232);
  assert.equal(L.intervaloQuedaMs(30), 70);
  assert.equal(L.intervaloQuedaMs(0), 1000);
  for (let n = 1; n < 40; n++) assert.ok(L.intervaloQuedaMs(n + 1) <= L.intervaloQuedaMs(n));
});

teste("saco de 7 traz as sete peças em cada grupo", () => {
  const g = new L.GeradorPecas(semente(3), [], 0);
  for (let k = 0; k < 20; k++) {
    const grupo = Array.from({ length: 7 }, () => g.proxima());
    assert.deepEqual(new Set(grupo), new Set(L.QUATRO_BLOCOS));
  }
});

teste("bloco dourado aparece em cerca de 15% e não quebra o saco", () => {
  const g = new L.GeradorPecas(semente(42));
  const pecas = Array.from({ length: 21000 }, () => g.proxima());
  const proporcao = pecas.filter((t) => t === "DOURADO").length / pecas.length;
  assert.ok(proporcao >= 0.13 && proporcao <= 0.17, `proporção ${proporcao}`);
  const normais = pecas.filter((t) => t !== "DOURADO");
  for (let i = 0; i + 7 <= normais.length; i += 7) {
    assert.deepEqual(new Set(normais.slice(i, i + 7)), new Set(L.QUATRO_BLOCOS));
  }
});

teste("gerador continua do saco salvo", () => {
  const g = new L.GeradorPecas(semente(1), ["Z", "T"], 0);
  assert.equal(g.proxima(), "Z");
  assert.deepEqual(g.restantes(), ["T"]);
  assert.equal(g.proxima(), "T");
  assert.deepEqual(new Set(Array.from({ length: 7 }, () => g.proxima())), new Set(L.QUATRO_BLOCOS));
});

// ---------- Motor (MotorJogoTest.kt) ----------

teste("novo jogo começa com peça atual e próxima", () => {
  const m = new L.Motor(semente(5));
  m.novoJogo();
  assert.equal(m.status, "jogando");
  assert.ok(m.atual);
  assert.ok(m.proxima);
  assert.equal(m.nivel, 1);
  assert.equal(m.pontos, 0);
});

teste("gravidade desce uma linha por intervalo do nível", () => {
  const m = motor(P("T", 3, 0));
  passar(m, 950);
  assert.equal(m.atual.y, 0);
  passar(m, 50);
  assert.equal(m.atual.y, 1);
  const rapido = motor(P("T", 3, 0), { nivel: 10 }); // 232 ms por linha
  passar(rapido, 1000);
  assert.equal(rapido.atual.y, 4);
});

teste("queda instantânea vale 2 pontos por linha e trava", () => {
  const m = motor(P("T", 3, 0), { proxima: "O" });
  m.quedaInstantanea();
  assert.equal(m.pontos, 36); // desceu 18 linhas
  assert.equal(m.tipoEm(4, 18), "T");
  assert.equal(m.tipoEm(3, 19), "T");
  assert.equal(m.atual.tipo, "O");
});

teste("queda suave vale 1 ponto e no chão não trava na hora", () => {
  const m = motor(P("T", 3, 17));
  assert.ok(m.quedaSuave());
  assert.equal(m.pontos, 1);
  assert.ok(!m.quedaSuave());
  assert.deepEqual(m.atual, P("T", 3, 18));
  assert.equal(m.status, "jogando");
});

teste("atraso para travar: meio segundo no chão", () => {
  const m = motor(P("T", 3, 18), { proxima: "I" });
  passar(m, 450);
  assert.equal(m.atual.tipo, "T");
  assert.equal(m.tipoEm(4, 19), null);
  passar(m, 50);
  assert.equal(m.tipoEm(4, 19), "T");
  assert.equal(m.atual.tipo, "I");
});

teste("mexer no chão adia o travamento só até o limite", () => {
  const m = motor(P("T", 3, 18), { proxima: "I" });
  let direcao = 1;
  for (let k = 0; k < L.REINICIOS_MAXIMOS; k++) {
    passar(m, 400);
    assert.ok(m.mover(direcao));
    direcao = -direcao;
  }
  assert.equal(m.atual.tipo, "T");
  // Esgotados os adiamentos, mexer não ajuda mais
  passar(m, 400);
  m.mover(direcao);
  passar(m, 100);
  assert.equal(m.atual.tipo, "I");
});

teste("segurar só uma vez por peça e troca pela guardada", () => {
  const m = motor(P("T", 3, 5), { proxima: "S" });
  assert.ok(m.segurar());
  assert.equal(m.guardada, "T");
  assert.deepEqual(m.atual, L.novaPeca("S"));
  assert.ok(!m.segurar());
  assert.ok(!m.podeGuardar);
  m.quedaInstantanea();
  assert.ok(m.podeGuardar);
  const antes = m.atual.tipo;
  assert.ok(m.segurar());
  assert.deepEqual(m.atual, L.novaPeca("T"));
  assert.equal(m.guardada, antes);
});

teste("peça guardada volta sem o giro antigo", () => {
  const m = motor(P("J", 3, 5, 2), { proxima: "S", guardada: "L" });
  m.segurar();
  assert.deepEqual(m.atual, L.novaPeca("L"));
  assert.equal(m.guardada, "J");
});

teste("linha completa soma pontos pelo nível e sobe de nível", () => {
  const m = motor(P("I", 6, -1), { grade: celulas(...linha(19, [6, 7, 8, 9])), linhas: 9, nivel: 1 });
  m.quedaInstantanea();
  assert.equal(m.pontos, 1 * 100 + 19 * 2);
  assert.equal(m.linhas, 10);
  assert.equal(m.nivel, 2);
  assert.equal(m.estado().celulas.filter((c) => c !== 0).length, 0);
});

teste("quatro linhas valem 800 vezes o nível", () => {
  const ocupadas = [16, 17, 18, 19].flatMap((y) => linha(y, [9]));
  const m = motor(P("I", 7, 0, 1), { grade: celulas(...ocupadas), nivel: 3, linhas: 20 });
  m.quedaInstantanea();
  assert.equal(m.pontos, 800 * 3 + 16 * 2);
  assert.equal(m.linhas, 24);
  assert.deepEqual(m.estado().ultimaLimpeza, [16, 17, 18, 19]);
});

teste("fim de jogo quando a próxima peça nasce sobre blocos", () => {
  // Coluna 4 cheia da linha 1 para baixo: o T que vem depois não cabe ao nascer
  const grade = celulas(...[...Array(19).keys()].map((k) => [4, k + 1]));
  const m = motor(P("O", 0, 0), { grade, proxima: "T" });
  m.quedaInstantanea();
  assert.equal(m.status, "fim");
  assert.equal(m.atual, null);
  assert.equal(m.salvar(), null);
});

teste("travar acima do topo encerra o jogo", () => {
  const grade = celulas(...[...Array(20).keys()].flatMap((y) => [[0, y], [1, y]]));
  const m = motor(P("O", 0, -2), { grade });
  m.quedaInstantanea();
  assert.equal(m.status, "fim");
});

teste("bloco dourado cai no buraco mais fundo e pode completar a linha", () => {
  const ocupadas = [...linha(19, [4]), [4, 15], [4, 16], [4, 17], [4, 18]];
  const m = motor(P("DOURADO", 4, 0), { grade: celulas(...ocupadas) });
  assert.equal(m.estado().sombra.y, 19);
  m.quedaInstantanea();
  assert.equal(m.linhas, 1);
  // A linha 19 sumiu e a coluna 4 desceu uma linha
  assert.equal(m.tipoEm(4, 19), "Z");
  assert.equal(m.tipoEm(4, 15), null);
});

teste("bloco dourado atravessa blocos para os lados e para baixo", () => {
  const m = motor(P("DOURADO", 3, 10), { grade: celulas([4, 10], [4, 11], [4, 12]) });
  assert.ok(m.mover(1));
  assert.equal(m.atual.x, 4);
  assert.ok(m.quedaSuave());
  assert.equal(m.atual.y, 11);
  assert.ok(!m.girar(true));
});

teste("pausa congela relógio e gravidade", () => {
  const m = motor(P("T", 3, 0));
  passar(m, 300);
  m.pausar();
  passar(m, 5000);
  assert.equal(m.tempoMs, 300);
  assert.equal(m.atual.y, 0);
  assert.ok(!m.mover(1));
  m.retomar();
  passar(m, 1000);
  assert.equal(m.atual.y, 1);
});

teste("quadro muito longo não faz a peça pular várias linhas", () => {
  const m = motor(P("T", 3, 0));
  m.avancar(60000);
  assert.equal(m.tempoMs, 100);
  assert.equal(m.atual.y, 0);
});

teste("salvar e restaurar mantém a partida (também pelo JSON)", () => {
  const m = new L.Motor(semente(9));
  m.novoJogo();
  for (let k = 0; k < 5; k++) m.quedaInstantanea();
  m.segurar();
  const salva = m.salvar();
  const json = JSON.parse(JSON.stringify(L.partidaParaJson(salva)));
  for (const dados of [salva, L.partidaDeJson(json)]) {
    const outro = new L.Motor(semente(2));
    assert.ok(outro.restaurar(dados));
    assert.equal(outro.status, "pausado");
    assert.equal(outro.pontos, m.pontos);
    assert.deepEqual(outro.atual, m.atual);
    assert.equal(outro.proxima, m.proxima);
    assert.equal(outro.guardada, m.guardada);
    assert.equal(outro.podeGuardar, m.podeGuardar);
    assert.deepEqual(outro.estado().celulas, m.estado().celulas);
    assert.deepEqual(outro.gerador.restantes(), m.gerador.restantes());
  }
});

teste("restaurar recusa tabuleiro com tamanho errado e JSON com defeito", () => {
  const m = new L.Motor();
  assert.ok(!m.restaurar({ celulas: new Array(50).fill(0), pontos: 0, linhas: 0, nivel: 1, tempoMs: 0, atual: null, proxima: "T", guardada: null, podeGuardar: true }));
  assert.equal(m.status, "parado");
  assert.equal(L.partidaDeJson(null), null);
  assert.equal(L.partidaDeJson({ celulas: [1, 2] }), null);
  const lixo = L.partidaDeJson({ celulas: new Array(200).fill(99), atual: { tipo: "X" }, proxima: "Q", saco: ["T", "nada"] });
  assert.ok(lixo.celulas.every((c) => c === 0));
  assert.equal(lixo.atual, null);
  assert.equal(lixo.proxima, null);
  assert.deepEqual(lixo.saco, ["T"]);
});

teste("restaurar com linha já completa limpa a linha", () => {
  const m = motor(P("T", 3, 0), { grade: celulas(...linha(19)) });
  assert.equal(m.estado().celulas.filter((c) => c !== 0).length, 0);
});

teste("partida inteira com jogadas aleatórias termina sem erro", () => {
  for (let s = 0; s < 20; s++) {
    const aleatorio = semente(100 + s);
    const m = new L.Motor(aleatorio);
    m.novoJogo();
    let passos = 0;
    while (m.status === "jogando" && passos < 20000) {
      const acao = Math.floor(aleatorio() * 8);
      if (acao === 0) m.mover(-1);
      else if (acao === 1) m.mover(1);
      else if (acao === 2) m.girar(true);
      else if (acao === 3) m.girar(false);
      else if (acao === 4) m.quedaSuave();
      else if (acao === 5) m.segurar();
      else if (acao === 6) m.quedaInstantanea();
      else m.avancar(16);
      // Nenhuma célula fixa pode ficar embaixo da peça atual
      if (m.atual && m.atual.tipo !== "DOURADO") assert.ok(m.tabuleiro.cabe(m.atual));
      assert.ok(m.tabuleiro.linhasCompletas().length === 0);
      passos++;
    }
    assert.equal(m.status, "fim", `semente ${s}`);
    assert.equal(m.nivel, L.nivelPorLinhas(m.linhas));
  }
});

// ---------- Recordes (RecordesTest.kt) ----------

teste("lê o Top 5 com as chaves do app", () => {
  const json = [
    { score: 1200, level: 3, at: "2025-08-06T22:29:00.000" },
    { score: 5400, level: 6, at: "2025-08-07T10:00:00.000" },
    { score: 300, level: 1, at: "2025-08-01T08:00:00.000" },
  ];
  const lista = L.recordesDeJson(json);
  assert.deepEqual(lista.map((r) => r.pontos), [5400, 1200, 300]);
  assert.deepEqual(lista[1], { pontos: 1200, nivel: 3, data: "2025-08-06T22:29:00.000" });
});

teste("lê a versão antiga que guardava só números", () => {
  const lista = L.recordesDeJson([500, "300", 900]);
  assert.deepEqual(lista.map((r) => r.pontos), [900, 500, 300]);
  assert.ok(lista.every((r) => r.nivel === 0 && r.data === ""));
});

teste("ignora recordes com defeito", () => {
  assert.deepEqual(L.recordesDeJson(null), []);
  assert.deepEqual(L.recordesDeJson("abc"), []);
  assert.deepEqual(L.recordesDeJson({}), []);
  const lista = L.recordesDeJson([null, { level: 2 }, { score: "x" }, { score: "700", level: "2", at: 5 }, true]);
  assert.deepEqual(lista, [{ pontos: 700, nivel: 2, data: "" }]);
});

teste("mantém só os 5 melhores em ordem", () => {
  let lista = [];
  for (const p of [100, 900, 300, 700, 500, 200, 800]) lista = L.adicionarRecorde(lista, { pontos: p, nivel: 1, data: "" });
  assert.deepEqual(lista.map((r) => r.pontos), [900, 800, 700, 500, 300]);
  assert.equal(L.posicaoRecorde(lista, 1000), 0);
  assert.equal(L.posicaoRecorde(lista, 750), 2);
  assert.equal(L.posicaoRecorde(lista.slice(0, 4), 10), 4);
  assert.equal(L.posicaoRecorde(lista, 100), null);
});

teste("recordes em JSON de ida e volta", () => {
  const lista = [{ pontos: 900, nivel: 4, data: "2025-10-01T12:00:00.000" }, { pontos: 10, nivel: 1, data: "" }];
  assert.deepEqual(L.recordesDeJson(JSON.parse(JSON.stringify(L.recordesParaJson(lista)))), lista);
});

teste("formata data local e converte data em UTC", () => {
  const local = L.formatarData("2025-08-06T22:29:00.000", -180);
  assert.equal(local, "06/08/2025 22:29");
  assert.equal(L.formatarData("2025-08-06T22:29:00.000Z", -180), "06/08/2025 19:29");
  assert.equal(L.formatarData(""), "");
  assert.equal(L.formatarData("ontem"), "ontem");
  assert.match(L.dataAgora(new Date(2025, 0, 2, 3, 4, 5, 6)), /^2025-01-02T03:04:05\.006$/);
  assert.equal(L.formatarTempo(452000), "07:32");
});

console.log(`\n${total} testes passaram`);
