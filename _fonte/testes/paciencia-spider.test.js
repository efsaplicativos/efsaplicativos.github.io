"use strict";
const assert = require("node:assert/strict");
const P = require("../../assets/jogos/paciencia-spider-logica.js");

// Carta pelo nome: valor + naipe (e espadas, c copas, o ouros, p paus). Ex.: "Ke", "10c", "Ap".
// Como há duas ou mais cartas iguais, cada estado tem a sua fábrica, que não repete o mesmo id.
const NAIPE = { e: 0, c: 1, o: 2, p: 3 };
const VALOR = { A: 1, J: 11, Q: 12, K: 13 };
function fabrica(modo) {
  const usados = new Set();
  return (nome) => {
    const naipe = NAIPE[nome.slice(-1)];
    const v = VALOR[nome.slice(0, -1)] || Number(nome.slice(0, -1));
    for (let s = 0; s < 8; s++) {
      const id = s * 13 + v - 1;
      if (!usados.has(id) && P.naipe(id, modo) === naipe) {
        usados.add(id);
        return id;
      }
    }
    throw new Error(`não sobrou carta ${nome} no modo ${modo}`);
  };
}

/** Estado montado à mão (sem as 104 cartas): as listas que não forem passadas ficam vazias. */
function estado(partes = {}) {
  const modo = partes.modo || 4;
  const carta = fabrica(modo);
  const cs = (texto) => (texto ? texto.split(" ").map(carta) : []);
  const colunas = (partes.colunas || []).map(cs);
  while (colunas.length < 10) colunas.push([]);
  return {
    modo,
    semente: 1,
    monte: cs(partes.monte),
    colunas,
    fechadas: partes.fechadas || colunas.map(() => 0),
    completos: [],
    movimentos: partes.movimentos || 0,
    segundos: 0,
    iniciado: false,
  };
}
const nomes = (e, ids) => ids.map((id) => P.nomeCarta(id, e.modo));
const nomesDaColuna = (e, c) => nomes(e, e.colunas[c]);

function conferirInvariantes(e) {
  const todas = [e.monte, ...e.colunas, ...e.completos].flat();
  assert.equal(todas.length, 104);
  assert.equal(new Set(todas).size, 104);
  e.colunas.forEach((coluna, i) => {
    if (coluna.length) assert.ok(e.fechadas[i] < coluna.length, "a carta de cima da coluna está sempre aberta");
    else assert.equal(e.fechadas[i], 0);
  });
  for (const s of e.completos) {
    assert.equal(s.length, 13);
    assert.equal(P.valor(s[0]), 13);
    assert.ok(P.sequenciaDoNaipe(s, e.modo));
  }
  assert.equal(e.monte.length % 10, 0);
  assert.ok(P.pontuacao(e) >= 0);
  assert.deepEqual(P.restaurar(JSON.parse(JSON.stringify(e))), e);
}

// ---------- Naipes de cada modo ----------
assert.equal(P.nomeCarta(12, 1), "Rei de espadas");
assert.equal(P.nomeCarta(13 * 7, 1), "Ás de espadas");
assert.equal(P.nomeCarta(13, 2), "Ás de copas");
assert.equal(P.nomeCarta(26 + 10, 2), "Valete de espadas");
assert.equal(P.nomeCarta(13 * 6 + 11, 4), "Dama de ouros");
assert.equal(P.nomeCarta(13 * 3 + 9, 4), "10 de paus");
assert.equal(P.textoValor(13 * 5 + 12), "K");
assert.equal(P.vermelha(13, 2), true);
assert.equal(P.vermelha(13, 1), false);
assert.equal(P.textoModo(1), "1 naipe");
assert.equal(P.textoModo(4), "4 naipes");
for (const modo of P.MODOS) {
  const contagem = [0, 0, 0, 0];
  for (let id = 0; id < 104; id++) contagem[P.naipe(id, modo)] += 1;
  assert.deepEqual(contagem.filter(Boolean), Array(modo).fill(104 / modo), `cada naipe tem o mesmo número de cartas no modo ${modo}`);
}

// ---------- Distribuição ----------
{
  const e = P.novoJogo(2, 4242);
  assert.deepEqual(e.colunas.map((c) => c.length), [6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
  assert.deepEqual(e.fechadas, [5, 5, 5, 5, 4, 4, 4, 4, 4, 4]);
  assert.equal(e.monte.length, 50);
  assert.equal(P.pontuacao(e), 500);
  conferirInvariantes(e);
  assert.deepEqual(P.novoJogo(2, 4242), e, "a mesma semente dá a mesma partida");
  assert.notDeepEqual(P.novoJogo(2, 4243).colunas, e.colunas);
  assert.equal(P.novoJogo(3, 1).modo, 1, "modo desconhecido vira 1 naipe");
  const semente = P.novaSemente(() => 0.5);
  assert.ok(semente >= 1 && semente <= 999999);
}

// ---------- O que se move junto ----------
{
  const e = estado({ colunas: ["Ke 9c 8c 7e", "10p 9c 8c 7c"], fechadas: [1, 1] });
  const [ke, nc, oc, se] = e.colunas[0];
  assert.equal(P.cartasParaMover(e, ke), null, "carta fechada não se move");
  assert.equal(P.cartasParaMover(e, nc), null, "8 de copas e 7 de espadas não são do mesmo naipe");
  assert.deepEqual(P.cartasParaMover(e, se), [se]);
  assert.deepEqual(nomes(e, P.cartasParaMover(e, e.colunas[1][1])), ["9 de copas", "8 de copas", "7 de copas"]);
  assert.equal(P.cartasParaMover(e, oc), null);
}

// ---------- Mover e abrir a carta de baixo ----------
{
  const e = estado({ colunas: ["Ko 5p 9c", "10e", "", "9p"], fechadas: [2, 0, 0, 0] });
  const nove = e.colunas[0][2];
  assert.equal(P.podeMover(e, nove, { tipo: "coluna", indice: 1 }), true, "qualquer naipe, um valor acima");
  assert.equal(P.podeMover(e, nove, { tipo: "coluna", indice: 2 }), true, "coluna vazia aceita qualquer carta");
  assert.equal(P.podeMover(e, nove, { tipo: "coluna", indice: 3 }), false, "9 sobre 9 não vale");
  assert.equal(P.podeMover(e, nove, { tipo: "coluna", indice: 0 }), false, "para a própria coluna não vale");
  assert.equal(P.podeMover(e, nove, { tipo: "fundacao" }), false);
  const n = P.mover(e, nove, { tipo: "coluna", indice: 1 });
  assert.deepEqual(nomesDaColuna(n, 1), ["10 de espadas", "9 de copas"]);
  assert.deepEqual(nomesDaColuna(n, 0), ["Rei de ouros", "5 de paus"]);
  assert.equal(n.fechadas[0], 1, "o 5 de paus ficou aberto");
  assert.equal(n.movimentos, 1);
  assert.equal(n.iniciado, true);
  assert.equal(P.pontuacao(n), 499);
  assert.equal(P.mover(e, nove, { tipo: "coluna", indice: 3 }), null);
  assert.equal(e.colunas[0].length, 3, "o estado antigo não muda");
}

// ---------- Naipe completo sai da mesa ----------
{
  const e = estado({
    colunas: ["9o Ke Qe Je 10e 9e 8e 7e 6e 5e 4e 3e 2e", "4c Ae"],
    fechadas: [1, 1],
    movimentos: 20,
  });
  const as = e.colunas[1][1];
  assert.equal(P.completaNaipe(e, [as], 0), true);
  const n = P.mover(e, as, { tipo: "coluna", indice: 0 });
  assert.equal(n.completos.length, 1);
  assert.deepEqual(nomes(n, n.completos[0]).slice(0, 2), ["Rei de espadas", "Dama de espadas"]);
  assert.equal(P.valor(n.completos[0][12]), 1);
  assert.deepEqual(nomesDaColuna(n, 0), ["9 de ouros"]);
  assert.equal(n.fechadas[0], 0, "a carta embaixo do naipe completo fica aberta");
  assert.equal(n.fechadas[1], 0, "o 4 de copas também abriu");
  assert.equal(P.pontuacao(n), 500 + 100 - 21);
}
{
  // Sequência de outro naipe no meio não completa
  const e = estado({ colunas: ["Ke Qe Je 10e 9c 8e 7e 6e 5e 4e 3e 2e", "Ae"] });
  assert.equal(P.completaNaipe(e, [e.colunas[1][0]], 0), false);
  assert.equal(P.mover(e, e.colunas[1][0], { tipo: "coluna", indice: 0 }).completos.length, 0);
}

// ---------- Distribuir ----------
{
  const cheia = ["2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "10p", "Jp"];
  const e = estado({ colunas: cheia, monte: "Ae 2e 3e 4e 5e 6e 7e 8e 9e 10e Jc Qc Kc 2c 3c 4c 5c 6c 7c 8c" });
  const n = P.distribuir(e);
  assert.equal(n.monte.length, 10);
  assert.deepEqual(n.colunas.map((c) => c.length), Array(10).fill(2));
  assert.deepEqual(nomes(n, n.colunas.map((c) => c[1])).slice(0, 2), ["8 de copas", "7 de copas"], "a coluna 1 recebe a última carta do monte");
  assert.deepEqual(n.fechadas, Array(10).fill(0), "as cartas distribuídas vêm abertas");
  assert.equal(n.movimentos, 1);
  const comVazia = estado({ colunas: cheia.slice(0, 9), monte: "Ae 2e 3e 4e 5e 6e 7e 8e 9e 10e" });
  assert.equal(P.podeDistribuir(comVazia), false, "não distribui com coluna vazia");
  assert.equal(P.distribuir(comVazia), null);
  assert.equal(P.distribuir(estado({ colunas: cheia })), null, "monte vazio");
}
{
  // A distribuição também pode completar um naipe
  const colunas = ["Kc Qc Jc 10c 9c 8c 7c 6c 5c 4c 3c 2c", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "10p", "Jp"];
  const e = estado({ colunas, monte: "2e 3e 4e 5e 6e 7e 8e 9e 10e Ac" });
  const n = P.distribuir(e);
  assert.equal(n.completos.length, 1);
  assert.equal(n.colunas[0].length, 0);
}

// ---------- Desfazer custa uma jogada ----------
{
  const e = estado({ colunas: ["Ko 9c", "10e"], fechadas: [1, 0] });
  const n = P.mover(e, e.colunas[0][1], { tipo: "coluna", indice: 1 });
  const volta = P.desfazer(n, e);
  assert.deepEqual(volta.colunas, e.colunas);
  assert.deepEqual(volta.fechadas, e.fechadas);
  assert.equal(volta.movimentos, 2);
  assert.equal(P.pontuacao(volta), 498);
}

// ---------- Para onde vai com um toque ----------
{
  const e = estado({ colunas: ["Kp 8c", "9e", "9c", "", "9o"], fechadas: [1, 0, 0, 0, 0] });
  const oito = e.colunas[0][1];
  assert.deepEqual(P.melhorDestino(e, oito), { tipo: "coluna", indice: 2 }, "primeiro sobre o mesmo naipe");
  const semCopas = estado({ colunas: ["Kp 8c", "9e", "", "", "9o"], fechadas: [1, 0, 0, 0, 0] });
  assert.deepEqual(P.melhorDestino(semCopas, semCopas.colunas[0][1]), { tipo: "coluna", indice: 1 });
  const soVazia = estado({ colunas: ["Kp 8c", "5e", ""], fechadas: [1, 0, 0] });
  assert.deepEqual(P.melhorDestino(soVazia, soVazia.colunas[0][1]), { tipo: "coluna", indice: 2 });
  const colunaInteira = estado({ colunas: ["8c", "5e", ""] });
  assert.equal(P.melhorDestino(colunaInteira, colunaInteira.colunas[0][0]), null, "a coluna inteira não vai para outra vazia");
}

// ---------- Dica ----------
{
  // Fechar um naipe vem antes de tudo
  const e = estado({ colunas: ["Ke Qe Je 10e 9e 8e 7e 6e 5e 4e 3e 2e", "5o Ae", "3c 2p"], fechadas: [0, 1, 1] });
  assert.deepEqual(P.dica(e), { id: e.colunas[1][1], destino: { tipo: "coluna", indice: 0 } });
}
{
  // Abrir uma carta fechada, de preferência sobre o mesmo naipe
  const e = estado({ colunas: ["Kp Qo 7c", "8e", "8c", "Jp 10o"], fechadas: [2, 0, 0, 1] });
  assert.deepEqual(P.dica(e), { id: e.colunas[0][2], destino: { tipo: "coluna", indice: 2 } });
}
{
  // Carta já sobre a do mesmo naipe não é sugerida; a dica distribui
  const colunas = ["9c 8c", "5e", "5p", "5o", "5c", "3e", "3p", "3o", "3c", "9e"];
  const e = estado({ colunas, monte: "Ae 2e 4e 6e 7e 8e 10e Je Qe Ke" });
  assert.deepEqual(P.dica(e), { distribuir: true });
  // Sem monte, não sobra jogada útil
  assert.equal(P.dica(estado({ colunas })), null);
}
{
  // Tirar uma sequência de cima de outro naipe para cima do mesmo naipe
  const e = estado({ colunas: ["9e 8c", "9c", "4o"] });
  assert.deepEqual(P.dica(e), { id: e.colunas[0][1], destino: { tipo: "coluna", indice: 1 } });
  // A volta não é sugerida (o 8 já está sobre o 9 de copas)
  const n = P.mover(e, e.colunas[0][1], { tipo: "coluna", indice: 1 });
  assert.equal(P.dica(n), null);
}
{
  // Com monte, esvaziar uma coluna não é sugerido; sem monte, é
  const colunas = ["7c", "8e", "Kp", "Kp", "Ko", "Ko", "Kc", "Kc", "Ke", "Ke"];
  const comMonte = estado({ colunas, monte: "Ae 2e 3e 4e 5e 6e 7e 9e 10e Je" });
  assert.deepEqual(P.dica(comMonte), { distribuir: true });
  const semMonte = estado({ colunas });
  assert.deepEqual(P.dica(semMonte), { id: semMonte.colunas[0][0], destino: { tipo: "coluna", indice: 1 } });
}
{
  // Coluna vazia impede a distribuição: a dica põe nela uma carta que não esteja presa ao naipe
  const colunas = ["4c 3c", "4e 3c", "Kp", "Kp", "Ko", "Ko", "Kc", "Kc", "Ke", ""];
  const e = estado({ colunas, monte: "Ae 2e 3e 5e 6e 7e 8e 9e 10e Je" });
  assert.deepEqual(P.dica(e), { id: e.colunas[1][1], destino: { tipo: "coluna", indice: 9 } }, "o 3 de copas da coluna 1 está preso ao 4 de copas");
}

// ---------- Restaurar ----------
{
  const e = P.novoJogo(4, 99);
  conferirInvariantes(e);
  const ruim = (mudar) => {
    const copia = JSON.parse(JSON.stringify(e));
    mudar(copia);
    return P.restaurar(copia);
  };
  assert.equal(P.restaurar(null), null);
  assert.equal(ruim((s) => (s.modo = 3)), null);
  assert.equal(ruim((s) => s.colunas[0].pop()), null, "falta uma carta");
  assert.equal(ruim((s) => (s.colunas[0][0] = s.colunas[1][0])), null, "carta repetida");
  assert.equal(ruim((s) => (s.fechadas[0] = 6)), null, "a carta de cima precisa estar aberta");
  assert.equal(ruim((s) => s.monte.splice(0, 1)), null, "o monte vai de 10 em 10");
  assert.equal(ruim((s) => (s.movimentos = -1)), null);
  assert.equal(ruim((s) => (s.semente = 0)), null);
  assert.equal(
    ruim((s) => {
      s.completos.push(s.monte.splice(0, 13));
      s.monte.splice(0, 0, ...s.colunas[9].splice(0, 3));
    }),
    null,
    "naipe completo fora de ordem",
  );
  assert.equal(ruim((s) => s.colunas.push([])), null);
}

// ---------- Estatísticas ----------
{
  let est = P.estatisticasVazias();
  ({ estatisticas: est } = P.registrarResultado(est, { venceu: true, segundos: 600, pontos: 1100 }));
  let r = P.registrarResultado(est, { venceu: true, segundos: 500, pontos: 1150 });
  assert.deepEqual(r.recordes, { tempo: true, pontos: true });
  est = r.estatisticas;
  assert.equal(est.melhorSequencia, 2);
  ({ estatisticas: est } = P.registrarResultado(est, { venceu: false }));
  assert.equal(est.sequencia, 0);
  assert.equal(est.jogadas, 3);
  assert.equal(P.porcentagemVitorias(est), 67);
  assert.deepEqual(P.lerEstatisticas({ jogadas: 1, vitorias: 5, melhorTempo: 0 }), { ...P.estatisticasVazias(), jogadas: 1, vitorias: 1 });
  assert.equal(P.formatarTempo(3725), "1:02:05");
  assert.equal(P.formatarNumero(1234), "1.234");
}

// ---------- Partidas inteiras ----------
function jogadasPossiveis(e) {
  const lista = [];
  e.colunas.forEach((coluna, c) => {
    for (let p = e.fechadas[c]; p < coluna.length; p++) {
      for (let d = 0; d < 10; d++) if (P.podeMover(e, coluna[p], { tipo: "coluna", indice: d })) lista.push([coluna[p], d]);
    }
  });
  return lista;
}

{
  // Jogadas ao acaso nunca quebram a mesa
  const aleatorio = P.aleatorioComSemente(7);
  for (let partida = 0; partida < 150; partida++) {
    let e = P.novoJogo(P.MODOS[partida % 3], 1000 + partida);
    for (let passo = 0; passo < 250; passo++) {
      const jogadas = jogadasPossiveis(e);
      if (P.podeDistribuir(e) && (aleatorio() < 0.15 || !jogadas.length)) e = P.distribuir(e);
      else if (jogadas.length) {
        const [id, d] = jogadas[Math.floor(aleatorio() * jogadas.length)];
        e = P.mover(e, id, { tipo: "coluna", indice: d });
      } else break;
      conferirInvariantes(e);
    }
  }
}

{
  // Seguindo só a dica, toda partida termina (sem andar em círculos), e algumas são ganhas
  for (const modo of P.MODOS) {
    let vitorias = 0;
    const partidas = 60;
    for (let partida = 0; partida < partidas; partida++) {
      let e = P.novoJogo(modo, 5000 + partida);
      let passos = 0;
      for (;;) {
        const d = P.dica(e);
        if (!d) break;
        e = d.distribuir ? P.distribuir(e) : P.mover(e, d.id, d.destino);
        assert.ok(e, "a dica sugere só jogadas válidas");
        passos += 1;
        assert.ok(passos < 3000, `a dica andou em círculos na partida ${5000 + partida}, modo ${modo}`);
      }
      conferirInvariantes(e);
      if (P.venceu(e)) vitorias += 1;
    }
    console.log(`seguindo só as dicas, ${P.textoModo(modo)}: ${vitorias} de ${partidas} partidas ganhas`);
    if (modo === 1) assert.ok(vitorias > 0, "com 1 naipe, a dica sozinha ganha algumas partidas");
  }
}

console.log("paciencia-spider: todos os testes passaram");
