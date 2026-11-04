"use strict";
const assert = require("node:assert/strict");
const P = require("../../assets/jogos/paciencia-logica.js");

// Carta pelo nome: valor + naipe (e espadas, c copas, o ouros, p paus). Ex.: "Ke", "10c", "Ap"
const NAIPE = { e: 0, c: 1, o: 2, p: 3 };
const VALOR = { A: 1, J: 11, Q: 12, K: 13 };
function c(nome) {
  const naipe = NAIPE[nome.slice(-1)];
  const v = nome.slice(0, -1);
  return naipe * 13 + (VALOR[v] || Number(v)) - 1;
}
const cs = (texto) => (texto ? texto.split(" ").map(c) : []);

/** Estado montado à mão; as listas que não forem passadas ficam vazias. */
function estado(partes = {}) {
  const colunas = partes.colunas ? partes.colunas.map(cs) : [[], [], [], [], [], [], []];
  while (colunas.length < 7) colunas.push([]);
  return {
    modo: partes.modo || 1,
    semente: 1,
    monte: cs(partes.monte),
    descarte: cs(partes.descarte),
    fundacoes: (partes.fundacoes || [0, 0, 0, 0]).map((n, f) => [...Array(n).keys()].map((i) => f * 13 + i)),
    colunas,
    fechadas: partes.fechadas || colunas.map(() => 0),
    pontos: partes.pontos || 0,
    movimentos: 0,
    segundos: 0,
    iniciado: false,
    passagens: 0,
  };
}

function conferirInvariantes(e) {
  const todas = [e.monte, e.descarte, ...e.fundacoes, ...e.colunas].flat();
  assert.equal(todas.length, 52);
  assert.equal(new Set(todas).size, 52);
  e.colunas.forEach((coluna, i) => {
    if (coluna.length) assert.ok(e.fechadas[i] < coluna.length, "a carta de cima da coluna está sempre aberta");
    else assert.equal(e.fechadas[i], 0);
    assert.ok(P.sequenciaValida(coluna.slice(e.fechadas[i])));
  });
  e.fundacoes.forEach((f, n) => f.forEach((id, p) => assert.equal(id, n * 13 + p)));
  assert.ok(e.pontos >= 0);
  assert.deepEqual(P.restaurar(JSON.parse(JSON.stringify(e))), e);
}

// ---------- Nomes e cores ----------
assert.equal(P.nomeCarta(c("Ae")), "Ás de espadas");
assert.equal(P.nomeCarta(c("Qc")), "Dama de copas");
assert.equal(P.nomeCarta(c("Ko")), "Rei de ouros");
assert.equal(P.nomeCarta(c("Jp")), "Valete de paus");
assert.equal(P.textoValor(c("10c")), "10");
assert.equal(P.vermelha(c("5c")), true);
assert.equal(P.vermelha(c("5o")), true);
assert.equal(P.vermelha(c("5e")), false);
assert.equal(P.vermelha(c("5p")), false);

// ---------- Distribuição ----------
{
  const e = P.novoJogo(1, 12345);
  conferirInvariantes(e);
  assert.deepEqual(e.colunas.map((col) => col.length), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(e.fechadas, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(e.monte.length, 24);
  assert.equal(e.descarte.length, 0);
  assert.deepEqual(P.novoJogo(1, 12345), e, "a mesma semente dá a mesma partida");
  assert.notDeepEqual(P.novoJogo(1, 12346).colunas, e.colunas);
  assert.equal(P.novoJogo(3, 1).modo, 3);
  assert.equal(P.novoJogo(2, 1).modo, 1, "modo inválido vira Virar 1");
  const s = P.novaSemente(() => 0.5);
  assert.ok(Number.isInteger(s) && s >= 1 && s <= 999999);
}

// ---------- Regras da mesa e da fundação ----------
{
  const e = estado({ colunas: ["7e", "6c", "6p", "", "Kc"], fechadas: [0, 0, 0, 0, 0] });
  assert.equal(P.aceitaNaColuna(e, [c("6c")], 0), true, "vermelho sobre preto, um a menos");
  assert.equal(P.aceitaNaColuna(e, [c("6p")], 0), false, "mesma cor não pode");
  assert.equal(P.aceitaNaColuna(e, [c("5e")], 0), false, "precisa ser exatamente um a menos");
  assert.equal(P.aceitaNaColuna(e, [c("Kc")], 3), true, "Rei vai para coluna vazia");
  assert.equal(P.aceitaNaColuna(e, [c("Qc")], 3), false, "só Rei vai para coluna vazia");
  assert.equal(P.podeMover(e, c("Kc"), { tipo: "coluna", indice: 3 }), true);
  assert.equal(P.melhorDestino(e, c("Kc")), null, "Rei no fundo de uma coluna não muda para outra vazia");
  assert.equal(P.melhorDestino(e, c("6c")).indice, 0);
}
{
  const e = estado({ fundacoes: [2, 0, 0, 0], descarte: "3e", colunas: ["Ac 2c"] });
  assert.equal(P.aceitaNaFundacao(e, c("3e")), true);
  assert.equal(P.aceitaNaFundacao(e, c("4e")), false);
  assert.equal(P.aceitaNaFundacao(e, c("Ac")), true);
  assert.equal(P.aceitaNaFundacao(e, c("2c")), false);
  assert.equal(P.podeMover(e, c("Ac"), { tipo: "fundacao" }), false, "só a carta de cima sai da coluna para a fundação");
}

// ---------- Mover, revelar e pontos ----------
{
  // Coluna 0: 9p fechada, 8c aberta; coluna 1: 9e aberta; descarte com 7p
  let e = estado({ colunas: ["9p 8c", "9e"], fechadas: [1, 0], descarte: "7p" });
  const sequencia = P.cartasParaMover(e, c("8c"));
  assert.deepEqual(sequencia, [c("8c")]);
  assert.equal(P.cartasParaMover(e, c("9p")), null, "carta fechada não sai");

  e = P.mover(e, c("8c"), { tipo: "coluna", indice: 1 });
  assert.deepEqual(e.colunas[1], cs("9e 8c"));
  assert.equal(e.fechadas[0], 0, "a carta de baixo vira sozinha");
  assert.equal(e.pontos, 5, "revelar vale 5");
  assert.equal(e.movimentos, 1);
  assert.equal(e.iniciado, true);

  e = P.mover(e, c("7p"), { tipo: "coluna", indice: 1 });
  assert.equal(e.pontos, 10, "do descarte para a mesa vale 5");
  assert.deepEqual(P.cartasParaMover(e, c("8c")), cs("8c 7p"), "a sequência sai junta");

  assert.equal(P.mover(e, c("8c"), { tipo: "coluna", indice: 1 }), null, "não move para a própria coluna");
  assert.equal(P.mover(e, c("8c"), { tipo: "fundacao" }), null);
}
{
  let e = estado({ colunas: ["5o Ae"], fechadas: [1], fundacoes: [0, 0, 0, 0] });
  e = P.mover(e, c("Ae"), { tipo: "fundacao" });
  assert.equal(e.pontos, 15, "fundação 10 + revelar 5");
  assert.deepEqual(e.fundacoes[0], [c("Ae")]);
  // Tirar da fundação custa 15 e os pontos nunca ficam negativos
  const volta = P.mover(estado({ colunas: ["2c"], fundacoes: [1, 0, 0, 0], pontos: 4 }), c("Ae"), { tipo: "coluna", indice: 0 });
  assert.deepEqual(volta.colunas[0], cs("2c Ae"));
  assert.equal(volta.pontos, 0);
}

// ---------- Virar o monte ----------
{
  let e = estado({ modo: 3, monte: "Ae 2e 3e 4e" }); // 4e é a de cima
  e = P.comprar(e);
  assert.deepEqual(e.descarte, cs("4e 3e 2e"), "virando 3, a terceira carta fica por cima");
  assert.deepEqual(e.monte, cs("Ae"));
  e = P.comprar(e);
  assert.deepEqual(e.descarte, cs("4e 3e 2e Ae"));
  assert.equal(e.monte.length, 0);
  const antes = { ...e, pontos: 50 };
  e = P.comprar(antes);
  assert.deepEqual(e.monte, cs("Ae 2e 3e 4e"), "o monte volta na ordem do começo");
  assert.equal(e.descarte.length, 0);
  assert.equal(e.passagens, 1);
  assert.equal(e.pontos, 30, "voltar o monte virando 3 custa 20");
  assert.equal(P.comprar(estado({ modo: 1, descarte: "Ae", pontos: 30 })).pontos, 0, "virando 1 custa 100, sem ficar negativo");
  assert.equal(P.comprar(estado()), null, "sem monte nem descarte não há o que virar");
  const um = P.comprar(estado({ modo: 1, monte: "Ae 2e" }));
  assert.deepEqual(um.descarte, cs("2e"));
}

// ---------- Dica ----------
{
  const paraFundacao = estado({ colunas: ["Ac"], descarte: "Kp" });
  assert.deepEqual(P.dica(paraFundacao), { id: c("Ac"), destino: { tipo: "fundacao" } });

  // Revelar uma carta fechada vale mais que jogar do descarte
  const revelar = estado({ colunas: ["3p 9c", "10e", "10p"], fechadas: [1, 0, 0], descarte: "9o" });
  const d = P.dica(revelar);
  assert.equal(d.id, c("9c"));
  assert.equal(d.destino.tipo, "coluna");

  const doDescarte = estado({ colunas: ["10e"], descarte: "9o" });
  assert.deepEqual(P.dica(doDescarte), { id: c("9o"), destino: { tipo: "coluna", indice: 0 } });

  // Mover o 8 libera o 9 de espadas para a fundação
  const liberar = estado({ colunas: ["9e 8c", "9p"], fundacoes: [8, 0, 0, 0] });
  assert.equal(P.dica(liberar).id, c("8c"));

  // Nada na mesa serve, mas há no monte uma carta que vai para a fundação
  const comprar = estado({ colunas: ["5e"], monte: "Ac 9p" });
  assert.deepEqual(P.dica(comprar), { comprar: true });

  // Nada serve em lugar nenhum
  const travado = estado({ colunas: ["5e", "5p"], monte: "9c 9o", descarte: "3c" });
  assert.equal(P.dica(travado), null);
  assert.deepEqual(P.alcancaveisNoMonte(travado).sort(), cs("9c 9o").sort());
}

// ---------- Final automático ----------
{
  // Todas as cartas da mesa abertas e o monte cheio, virando 1: a partida termina sozinha.
  // Duas colunas do Rei ao Ás alternando espadas e copas; ouros e paus ficam no monte.
  const nome = (v) => ({ 13: "K", 12: "Q", 11: "J", 1: "A" })[v] || String(v);
  const coluna1 = [];
  const coluna2 = [];
  for (let v = 13; v >= 1; v--) {
    const par = (13 - v) % 2 === 0;
    coluna1.push(c(nome(v) + (par ? "e" : "c")));
    coluna2.push(c(nome(v) + (par ? "c" : "e")));
  }
  let e = estado({ modo: 1 });
  e.colunas = [coluna1, coluna2, [], [], [], [], []];
  e.monte = [...Array(26).keys()].map((i) => 26 + i).reverse();
  conferirInvariantes(e);
  assert.equal(P.podeConcluirSozinho(e), true);
  assert.equal(P.podeConcluirSozinho({ ...e, modo: 3 }), false, "virando 3, só com monte e descarte vazios");
  let passos = 0;
  while (!P.venceu(e)) {
    const passo = P.passoAutomatico(e);
    assert.ok(passo, "o final automático nunca trava");
    e = passo.estado;
    passos++;
    assert.ok(passos <= 52);
  }
  assert.equal(passos, 52);
  assert.equal(e.pontos, 520);
  assert.equal(P.passoAutomatico(e), null);
  conferirInvariantes(e);
}

assert.equal(P.bonusTempo(29), 0);
assert.equal(P.bonusTempo(100), 7000);
assert.equal(P.formatarTempo(0), "00:00");
assert.equal(P.formatarTempo(75), "01:15");
assert.equal(P.formatarTempo(3725), "1:02:05");

// ---------- Restaurar ----------
{
  const e = P.novoJogo(3, 777);
  assert.deepEqual(P.restaurar(JSON.parse(JSON.stringify(e))), e);
  const repetida = JSON.parse(JSON.stringify(e));
  repetida.monte[0] = repetida.monte[1];
  assert.equal(P.restaurar(repetida), null, "carta repetida");
  const faltando = JSON.parse(JSON.stringify(e));
  faltando.monte.pop();
  assert.equal(P.restaurar(faltando), null, "carta faltando");
  const fundacaoErrada = JSON.parse(JSON.stringify(e));
  const dois = fundacaoErrada.colunas[0].pop();
  fundacaoErrada.fundacoes[0].push(dois);
  fundacaoErrada.colunas[0] = [];
  fundacaoErrada.fechadas[0] = 0;
  if (dois !== 0) assert.equal(P.restaurar(fundacaoErrada), null, "fundação fora de ordem");
  const fechadaNoTopo = JSON.parse(JSON.stringify(e));
  fechadaNoTopo.fechadas[1] = 2;
  assert.equal(P.restaurar(fechadaNoTopo), null, "a carta de cima precisa estar aberta");
  assert.equal(P.restaurar({ ...e, modo: 2 }), null);
  assert.equal(P.restaurar({ ...e, fundacoes: 5 }), null);
  assert.equal(P.restaurar(null), null);
  assert.equal(P.restaurar("x"), null);
}

// ---------- Estatísticas ----------
{
  let est = P.estatisticasVazias();
  let r = P.registrarResultado(est, { venceu: true, segundos: 200, pontos: 4000 });
  est = r.estatisticas;
  assert.deepEqual(r.recordes, { tempo: false, pontos: false }, "a primeira vitória não conta como recorde batido");
  assert.equal(est.vitorias, 1);
  assert.equal(est.melhorTempo, 200);
  r = P.registrarResultado(est, { venceu: true, segundos: 150, pontos: 5000 });
  assert.deepEqual(r.recordes, { tempo: true, pontos: true });
  est = r.estatisticas;
  assert.equal(est.sequencia, 2);
  est = P.registrarResultado(est, { venceu: false }).estatisticas;
  assert.equal(est.sequencia, 0);
  assert.equal(est.melhorSequencia, 2);
  assert.equal(est.jogadas, 3);
  assert.equal(P.porcentagemVitorias(est), 67);
  assert.deepEqual(P.lerEstatisticas({ jogadas: 2, vitorias: 9, melhorTempo: -1 }), { ...P.estatisticasVazias(), jogadas: 2, vitorias: 2 });
  assert.deepEqual(P.lerEstatisticas("lixo"), P.estatisticasVazias());
}

// ---------- Partidas inteiras ----------

/** Todas as jogadas possíveis, inclusive virar o monte. */
function todasAsJogadas(e) {
  const jogadas = [];
  const ids = [...e.colunas.flatMap((col, i) => col.slice(e.fechadas[i])), ...e.descarte.slice(-1), ...e.fundacoes.map((f) => f[f.length - 1]).filter((id) => id !== undefined)];
  for (const id of ids) {
    if (P.podeMover(e, id, { tipo: "fundacao" })) jogadas.push({ id, destino: { tipo: "fundacao" } });
    for (let d = 0; d < 7; d++) if (P.podeMover(e, id, { tipo: "coluna", indice: d })) jogadas.push({ id, destino: { tipo: "coluna", indice: d } });
  }
  if (e.monte.length || e.descarte.length) jogadas.push({ comprar: true });
  return jogadas;
}

{
  // Jogadas aleatórias: as regras nunca perdem nem duplicam cartas
  let aleatorio = P.aleatorioComSemente(99);
  for (let partida = 0; partida < 200; partida++) {
    let e = P.novoJogo(partida % 2 ? 3 : 1, 1 + partida);
    for (let passo = 0; passo < 300; passo++) {
      const jogadas = todasAsJogadas(e);
      if (!jogadas.length) break;
      const j = jogadas[Math.floor(aleatorio() * jogadas.length)];
      const novo = j.comprar ? P.comprar(e) : P.mover(e, j.id, j.destino);
      assert.ok(novo, "toda jogada listada é aceita");
      e = novo;
    }
    conferirInvariantes(e);
  }
}

{
  // Seguindo só as dicas: toda dica é uma jogada válida, nenhuma partida fica rodando para sempre
  // e uma parte das partidas termina ganha
  let vitorias = 0;
  const partidas = 300;
  for (let partida = 0; partida < partidas; partida++) {
    let e = P.novoJogo(1, 5000 + partida);
    let passos = 0;
    while (!P.venceu(e)) {
      if (P.podeConcluirSozinho(e)) {
        e = P.passoAutomatico(e).estado;
        continue;
      }
      const d = P.dica(e);
      if (!d) break;
      const novo = d.comprar ? P.comprar(e) : P.mover(e, d.id, d.destino);
      assert.ok(novo, "a dica é sempre uma jogada válida");
      e = novo;
      passos++;
      assert.ok(passos < 3000, `a partida ${partida} entrou num ciclo de dicas`);
    }
    conferirInvariantes(e);
    if (P.venceu(e)) vitorias++;
  }
  assert.ok(vitorias > partidas * 0.05, `poucas vitórias seguindo as dicas: ${vitorias}`);
  console.log(`seguindo só as dicas, virando 1: ${vitorias} de ${partidas} partidas ganhas`);
}

console.log("paciencia: todos os testes passaram");
