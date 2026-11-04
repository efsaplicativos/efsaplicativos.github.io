"use strict";
const assert = require("node:assert/strict");
const P = require("../../assets/jogos/freecell-logica.js");

// Carta pelo nome: valor + naipe (p paus, o ouros, c copas, e espadas). Ex.: "Ke", "10c", "Ap".
const NAIPE = { p: 0, o: 1, c: 2, e: 3 };
const VALOR = { A: 1, J: 11, Q: 12, K: 13 };
function carta(nome) {
  const v = VALOR[nome.slice(0, -1)] || Number(nome.slice(0, -1));
  return (v - 1) * 4 + NAIPE[nome.slice(-1)];
}
const cs = (texto) => (texto ? texto.split(" ").map(carta) : []);
const nomeCurto = (id) => "A23456789TJQK"[P.valor(id) - 1] + "CDHS"[P.naipe(id)];

/**
 * Estado montado à mão (sem as 52 cartas): colunas por texto, células por nome (ou null) e, nas
 * fundações, quantas cartas de cada naipe já subiram (paus, ouros, copas, espadas).
 */
function estado(partes = {}) {
  const colunas = (partes.colunas || []).map(cs);
  while (colunas.length < 8) colunas.push([]);
  const celulas = (partes.celulas || []).map((n) => (n ? carta(n) : null));
  while (celulas.length < 4) celulas.push(null);
  const fundacoes = (partes.fundacoes || [0, 0, 0, 0]).map((quantas, s) => [...Array(quantas).keys()].map((v) => v * 4 + s));
  return { semente: 1, colunas, celulas, fundacoes, movimentos: partes.movimentos || 0, segundos: 0, iniciado: false };
}

const col = (indice) => ({ tipo: "coluna", indice });
const cel = (indice) => ({ tipo: "celula", indice });
const fun = (indice) => ({ tipo: "fundacao", indice });

function conferirInvariantes(e) {
  const todas = [...e.colunas.flat(), ...e.celulas.filter((id) => id !== null), ...e.fundacoes.flat()];
  assert.equal(todas.length, 52, "52 cartas na mesa");
  assert.equal(new Set(todas).size, 52, "nenhuma carta repetida");
  e.fundacoes.forEach((f, s) => f.forEach((id, i) => assert.ok(P.naipe(id) === s && P.valor(id) === i + 1, "fundação em ordem")));
  assert.ok(P.restaurar(JSON.parse(JSON.stringify(e))), "o estado salvo volta igual");
}

/** Todas as jogadas válidas: [id, destino]. */
function jogadasPossiveis(e) {
  const destinos = [
    ...e.colunas.map((_, i) => col(i)),
    ...e.celulas.map((_, i) => cel(i)),
    ...e.fundacoes.map((_, i) => fun(i)),
  ];
  const ids = e.celulas.filter((id) => id !== null);
  e.colunas.forEach((coluna, c) => {
    for (let p = P.inicioDaSequencia(e, c); p < coluna.length; p++) ids.push(coluna[p]);
  });
  const jogadas = [];
  for (const id of ids) for (const d of destinos) if (P.podeMover(e, id, d)) jogadas.push([id, d]);
  return jogadas;
}

// ---------- Distribuição numerada ----------
{
  // As partidas 1 e 617 da numeração clássica, linha por linha (a primeira linha fica no fundo)
  const linhas = (n) => {
    const b = P.baralhoDaPartida(n).map(nomeCurto);
    return [...Array(7).keys()].map((r) => b.slice(r * 8, r * 8 + 8).join(" "));
  };
  assert.deepEqual(linhas(1), [
    "JD 2D 9H JC 5D 7H 7C 5H",
    "KD KC 9S 5S AD QC KH 3H",
    "2S KS 9D QD JS AS AH 3C",
    "4C 5C TS QH 4H AC 4D 7S",
    "3S TD 4S TH 8H 2C JH 7D",
    "6D 8S 8D QS 6C 3D 8C TC",
    "6S 9C 2H 6H",
  ]);
  assert.deepEqual(linhas(617), [
    "7D AD 5C 3S 5S 8C 2D AH",
    "TD 7S QD AC 6D 8H AS KH",
    "TH QC 3H 9D 6S 8D 3D TC",
    "KD 5H 9S 3C 8S 7H 4D JS",
    "4C QS 9C 9H 7C 6H 2C 2S",
    "4S TS 2H 5D JC 6C JH QH",
    "JD KS KC 4H",
  ]);

  const e = P.novoJogo(1);
  assert.deepEqual(e.colunas.map((c) => c.length), [7, 7, 7, 7, 6, 6, 6, 6]);
  assert.equal(nomeCurto(e.colunas[0][0]), "JD", "a primeira carta fica no fundo da coluna");
  assert.equal(nomeCurto(e.colunas[0][6]), "6S", "e a última, no alto");
  assert.deepEqual(e.celulas, [null, null, null, null]);
  assert.equal(P.naFundacao(e), 0);
  assert.equal(e.iniciado, false);
  conferirInvariantes(e);
  assert.deepEqual(P.novoJogo(1), P.novoJogo(1), "o mesmo número dá a mesma partida");
  assert.notDeepEqual(P.novoJogo(1).colunas, P.novoJogo(2).colunas);
  assert.equal(P.nomeCarta(carta("Qc")), "Dama de copas");
  assert.equal(P.nomeCarta(carta("Ap")), "Ás de paus");
  assert.ok(P.vermelha(carta("5o")) && P.vermelha(carta("5c")) && !P.vermelha(carta("5p")) && !P.vermelha(carta("5e")));

  assert.ok(P.partidaValida(1) && P.partidaValida(1000000));
  assert.ok(!P.partidaValida(0) && !P.partidaValida(1000001) && !P.partidaValida(2.5) && !P.partidaValida("7"));
  for (let i = 0; i < 200; i++) assert.ok(P.partidaValida(P.novaSemente()));
}

// ---------- Encaixe e capacidade ----------
{
  assert.ok(P.encaixa(carta("7p"), carta("6c")), "6 vermelho sobre 7 preto");
  assert.ok(!P.encaixa(carta("7o"), carta("6c")), "mesma cor não encaixa");
  assert.ok(!P.encaixa(carta("8p"), carta("6c")), "precisa ser um valor abaixo");

  const cheia = estado({ colunas: ["Kp", "Ko", "Kc", "Ke", "Qp", "Qo", "Qc", "Qe"] });
  assert.equal(P.capacidade(cheia), 5, "4 células livres e nenhuma coluna vazia: 5 cartas");
  const umaVazia = estado({ colunas: ["Kp", "Ko", "Kc", "Ke", "Qp", "Qo", "Qc", ""], celulas: ["2p", "2o"] });
  assert.equal(P.capacidade(umaVazia), 6, "2 células livres e 1 coluna vazia: 3 × 2");
  assert.equal(P.capacidade(umaVazia, true), 3, "indo para a coluna vazia, ela não conta");
  const duasVazias = estado({ colunas: ["Kp", "Ko", "Kc", "Ke", "Qp", "Qo", "", ""] });
  assert.equal(P.capacidade(duasVazias), 20);
  assert.equal(P.capacidade(duasVazias, true), 10);
  const semCelula = estado({ colunas: ["Kp", "Ko", "Kc", "Ke", "Qp", "Qo", "Qc", ""], celulas: ["2p", "2o", "2c", "2e"] });
  assert.equal(P.capacidade(semCelula), 2);
  assert.equal(P.capacidade(semCelula, true), 1);
}

// ---------- O que se move junto ----------
{
  const e = estado({ colunas: ["Kp 9c 8e 7o", "5p 4o 3e"], celulas: ["Jc"], fundacoes: [1, 0, 0, 0] });
  assert.deepEqual(P.cartasParaMover(e, carta("9c")), cs("9c 8e 7o"), "sequência alternada sai junta");
  assert.equal(P.cartasParaMover(e, carta("Kp")), null, "o Rei está sob um 9: fora de sequência");
  assert.deepEqual(P.cartasParaMover(e, carta("Jc")), [carta("Jc")], "carta da célula");
  assert.equal(P.cartasParaMover(e, carta("Ap")), null, "carta da fundação não volta");
  assert.equal(P.inicioDaSequencia(e, 0), 1);
  assert.equal(P.inicioDaSequencia(e, 1), 0);
  assert.equal(P.inicioDaSequencia(e, 2), 0, "coluna vazia");
  assert.deepEqual(P.localizar(e, carta("8e")), { tipo: "coluna", indice: 0, posicao: 2 });
  assert.deepEqual(P.localizar(e, carta("Jc")), { tipo: "celula", indice: 0 });
  assert.deepEqual(P.localizar(e, carta("Ap")), { tipo: "fundacao", indice: 0, posicao: 0 });
  assert.equal(P.localizar(e, carta("Ke")), null);
}

// ---------- Mover nas colunas ----------
{
  // 4 células livres e nenhuma coluna vazia: 5 cartas por vez
  const e = estado({ colunas: ["Jo 10p 9c 8e 7o 6p 5o", "Jc", "10e", "Kc", "Kp", "Ko", "Ke", "Qc"] });
  assert.ok(P.podeMover(e, carta("9c"), col(2)), "5 cartas, 9 vermelho sobre 10 preto");
  assert.ok(!P.podeMover(e, carta("10p"), col(1)), "6 cartas não cabem");
  assert.ok(!P.podeMover(e, carta("8e"), col(1)), "8 não vai sobre Valete");
  assert.ok(!P.podeMover(e, carta("9c"), col(0)), "nem para a própria coluna");
  assert.ok(!P.podeMover(e, carta("Kc"), col(4)), "Rei não vai sobre Rei");
  const vermelhas = estado({ colunas: ["10p 9c", "10o"] });
  assert.ok(!P.podeMover(vermelhas, carta("9c"), col(1)), "9 vermelho não vai sobre 10 vermelho");

  const comVazia = estado({ colunas: ["Jo 10p 9c 8e 7o 6p 5o", "Jc", "Kc", "Kp", "Ko", "Ke", "Qc", ""] });
  assert.ok(P.podeMover(comVazia, carta("10p"), col(1)), "com uma coluna vazia, cabem 10");
  assert.ok(!P.podeMover(comVazia, carta("10p"), col(7)), "para a própria coluna vazia, só 5");
  assert.ok(P.podeMover(comVazia, carta("9c"), col(7)), "5 cartas para a coluna vazia");
  assert.ok(P.podeMover(comVazia, carta("Qc"), col(7)), "coluna vazia aceita qualquer carta");

  const n = P.mover(comVazia, carta("10p"), col(1));
  assert.deepEqual(n.colunas[0], cs("Jo"));
  assert.deepEqual(n.colunas[1], cs("Jc 10p 9c 8e 7o 6p 5o"));
  assert.equal(n.movimentos, 1, "uma sequência conta como uma jogada");
  assert.equal(n.iniciado, true);
  assert.equal(comVazia.colunas[0].length, 7, "o estado anterior não muda");
  assert.equal(P.mover(comVazia, carta("Jo"), col(1)), null, "jogada inválida devolve null");
}

// ---------- Células e fundações ----------
{
  const e = estado({ colunas: ["Kp 2p Ap", "3o 2e", "Qc"], celulas: ["Ao", null, "5e", null] });
  assert.ok(P.podeMover(e, carta("Ap"), fun(0)));
  assert.ok(!P.podeMover(e, carta("Ap"), fun(1)), "cada naipe tem a sua fundação");
  assert.ok(!P.podeMover(e, carta("2p"), fun(0)), "o 2 está sob o Ás e só sobe depois dele");
  assert.ok(P.podeMover(e, carta("Ao"), fun(1)), "da célula para a fundação");
  assert.ok(P.podeMover(e, carta("Ap"), cel(1)), "carta de cima para a célula livre");
  assert.ok(!P.podeMover(e, carta("Ap"), cel(0)), "célula ocupada");
  assert.ok(!P.podeMover(e, carta("Ao"), cel(1)), "de uma célula para outra não vale");
  assert.ok(!P.podeMover(e, carta("3o"), cel(1)), "duas cartas não cabem numa célula");
  assert.ok(!P.podeMover(e, carta("3o"), fun(1)), "nem vão juntas para a fundação");
  assert.ok(P.podeMover(e, carta("5e"), col(3)), "da célula para a coluna vazia");

  let n = P.mover(e, carta("Ap"), fun(0));
  n = P.mover(n, carta("2p"), fun(0));
  assert.deepEqual(n.fundacoes[0], cs("Ap 2p"));
  n = P.mover(n, carta("Ao"), fun(1));
  assert.equal(n.celulas[0], null, "a célula ficou livre");
  n = P.mover(n, carta("Qc"), cel(1));
  assert.equal(n.celulas[1], carta("Qc"));
  assert.deepEqual(n.colunas[2], []);
  assert.equal(n.movimentos, 4);
  assert.ok(!P.podeMover(n, carta("2p"), col(2)), "carta que subiu não volta para a mesa");
  assert.ok(!P.podeMover(n, carta("2p"), cel(0)));
}

// ---------- Subir sozinha para a fundação ----------
{
  assert.ok(P.seguroSubir(estado(), carta("Ac")));
  assert.ok(P.seguroSubir(estado({ fundacoes: [0, 1, 0, 0] }), carta("2o")));
  assert.ok(!P.seguroSubir(estado({ fundacoes: [2, 2, 0, 1] }), carta("3o")), "o 2 de espadas ainda pode precisar do 3 de ouros");
  assert.ok(P.seguroSubir(estado({ fundacoes: [2, 2, 0, 2] }), carta("3o")), "os dois 2 pretos já subiram");
  assert.ok(!P.seguroSubir(estado({ fundacoes: [2, 2, 0, 2] }), carta("3p")), "o 2 de copas ainda está na mesa");

  const e = estado({ colunas: ["Kp Ae", "5o 2e", "3e", "4o 9p"], celulas: ["Ac"] });
  const r = P.subirSozinhas(e);
  assert.deepEqual(r.ids, cs("Ae Ac 2e"), "os Ases e o 2 sobem, em ordem");
  assert.equal(r.estado.movimentos, 0, "subir sozinha não conta jogada");
  assert.deepEqual(r.estado.colunas[2], cs("3e"), "o 3 de espadas fica: os 2 vermelhos ainda estão na mesa");
  assert.equal(r.estado.celulas[0], null);
  assert.deepEqual(e.fundacoes, [[], [], [], []], "o estado original não muda");
  assert.deepEqual(P.subirSozinhas(r.estado).ids, [], "nada mais sobe");

  const resolvida = estado({ colunas: ["4p 3p", "5o"], fundacoes: [2, 0, 0, 0] });
  assert.ok(P.podeTerminarSozinho(resolvida));
  assert.deepEqual(P.subirSozinhas(resolvida).ids, cs("3p 4p"), "colunas em ordem: sobe tudo o que der");
  const aberta = estado({ colunas: ["4p 3p", "2o 6o"], fundacoes: [2, 0, 0, 0] });
  assert.ok(!P.podeTerminarSozinho(aberta), "o 6 está sobre o 2");
  assert.deepEqual(P.subirSozinhas(aberta).ids, [], "o 3 de paus ainda pode receber o 2 de ouros");
  // Valores iguais um sobre o outro também se resolvem sozinhos
  assert.ok(P.podeTerminarSozinho(estado({ colunas: ["5p 5o 4c"] })));
}

// ---------- Para onde vai com um toque ----------
{
  const e = estado({ colunas: ["Kp Ap", "8e 7c", "8p", "", "Qc 6o"], celulas: ["7o"] });
  assert.deepEqual(P.melhorDestino(e, carta("Ap")), fun(0), "Ás vai para a fundação");
  assert.deepEqual(P.melhorDestino(e, carta("7c")), col(2), "7 vermelho vai sobre o 8 preto, antes da coluna vazia");
  assert.deepEqual(P.melhorDestino(e, carta("7o")), col(2), "da célula para a coluna");
  assert.deepEqual(P.melhorDestino(e, carta("6o")), col(5), "sem 7 preto livre: a próxima coluna vazia");
  assert.equal(P.melhorDestino(e, carta("Kp")), null, "o Rei está sob o Ás");

  const sozinha = estado({ colunas: ["9e", "Kp", "Ko", "Kc", "Ke", "Qp", "Qo", ""] });
  assert.deepEqual(P.melhorDestino(sozinha, carta("9e")), cel(0), "a coluna inteira não vai para outra coluna vazia; vai para a célula");
  const semLugar = estado({ colunas: ["9e", "Kp", "Ko", "Kc", "Ke", "Qp", "Qo", "Qe"], celulas: ["Jc", "Jo", "Jp", "Je"] });
  assert.equal(P.melhorDestino(semLugar, carta("9e")), null);
  // Sequência longa demais: nenhum destino
  const longa = estado({ colunas: ["Jo 10p 9c 8e 7o 6p 5o", "Jc", "Kc", "Kp", "Ko", "Ke", "Qc", "Qe"], celulas: ["2p"] });
  assert.equal(P.melhorDestino(longa, carta("10p")), null, "6 cartas, com espaço para 4");
  assert.equal(P.melhorDestino(longa, carta("8e")), null, "4 cartas sem 9 vermelho livre");
  assert.deepEqual(P.melhorDestino(longa, carta("5o")), cel(1), "a carta de cima vai para a primeira célula livre");
}

// ---------- Partida sem saída ----------
{
  const presa = estado({ colunas: ["Kp", "Ke", "Qp", "Qe", "10p", "10e", "8p", "8e"], celulas: ["2p", "2o", "2c", "2e"] });
  assert.ok(!P.temJogada(presa), "células cheias e nenhuma carta encaixa");
  assert.equal(P.dica(presa), null);
  const comCelula = estado({ colunas: ["Kp", "Ke", "Qp", "Qe", "10p", "10e", "8p", "8e"], celulas: ["2p", "2o", "2c", null] });
  assert.ok(P.temJogada(comCelula), "sobra a célula livre");
}

// ---------- Dica ----------
{
  const subir = estado({ colunas: ["Kp Ap", "8e", "7c"] });
  assert.deepEqual(P.dica(subir), { id: carta("Ap"), destino: fun(0) }, "subir o Ás vem antes");

  const daCelula = estado({ colunas: ["8e", "Kp 9c"], celulas: ["7o"] });
  assert.deepEqual(P.dica(daCelula), { id: carta("7o"), destino: col(0) }, "liberar a célula");

  const foraDeLugar = estado({ colunas: ["Qc 4e 8o 7p", "9e", "Kp"] });
  assert.deepEqual(P.dica(foraDeLugar), { id: carta("8o"), destino: col(1) }, "tirar a sequência de cima do 4");

  const esvaziar = estado({ colunas: ["Kp Qo", "Ke", "Kc", "Ko", "Qp", "Qe", "Qc", "Jp 10o"] });
  assert.deepEqual(P.dica(esvaziar), { id: carta("Qp"), destino: col(2) }, "esvaziar uma coluna pondo a Dama no Rei");

  // Nada que ajude: a única troca possível passaria o 8 de copas de um 9 preto para outro
  const nadaUtil = estado({ colunas: ["9e 8c", "9p"] });
  assert.equal(P.dica(nadaUtil), null);
  assert.ok(P.temJogada(nadaUtil), "mas ainda há jogadas possíveis");

  const paraCelula = estado({ colunas: ["Kp 5o", "Kc", "Ko", "Qc", "Qo", "Jc", "Jo", "10c"] });
  assert.deepEqual(P.dica(paraCelula), { id: carta("5o"), destino: cel(0) }, "guardar o 5 para chegar ao Rei");
}

// ---------- Salvar e restaurar ----------
{
  const e = P.novoJogo(42);
  assert.deepEqual(P.restaurar(JSON.parse(JSON.stringify(e))), e);
  const copia = (f) => {
    const c = JSON.parse(JSON.stringify(e));
    f(c);
    return c;
  };
  const tirarDaMesa = (c, id) => (c.colunas = c.colunas.map((coluna) => coluna.filter((x) => x !== id)));
  assert.equal(P.restaurar(copia((c) => (c.colunas[0][0] = c.colunas[1][0]))), null, "carta repetida");
  assert.equal(P.restaurar(copia((c) => c.colunas[0].pop())), null, "carta faltando");
  assert.equal(P.restaurar(copia((c) => (c.semente = 0))), null);
  assert.equal(P.restaurar(copia((c) => (c.celulas = [null, null, null]))), null);
  assert.equal(P.restaurar(copia((c) => (c.colunas = c.colunas.slice(1)))), null);
  assert.equal(P.restaurar(copia((c) => (c.movimentos = -1))), null);
  assert.equal(
    P.restaurar(copia((c) => (tirarDaMesa(c, carta("2p")), (c.fundacoes[0] = [carta("2p")])))),
    null,
    "fundação sem o Ás",
  );
  assert.equal(
    P.restaurar(copia((c) => (tirarDaMesa(c, carta("Ao")), (c.fundacoes[0] = [carta("Ao")])))),
    null,
    "Ás na fundação de outro naipe",
  );
  assert.ok(P.restaurar(copia((c) => (tirarDaMesa(c, carta("Ap")), (c.fundacoes[0] = [carta("Ap")])))));
  const naCelula = copia((c) => (c.celulas[2] = c.colunas[0].pop()));
  assert.equal(P.restaurar(naCelula).celulas[2], naCelula.celulas[2]);
  assert.equal(P.restaurar(null), null);
  assert.equal(P.restaurar("partida"), null);
}

// ---------- Estatísticas ----------
{
  let r = P.registrarResultado(P.estatisticasVazias(), { venceu: true, segundos: 300, movimentos: 90 });
  assert.deepEqual(r.recordes, { tempo: false, movimentos: false }, "a primeira vitória não bate recorde anterior");
  let s = r.estatisticas;
  assert.deepEqual(s, { jogadas: 1, vitorias: 1, melhorTempo: 300, menosMovimentos: 90, sequencia: 1, melhorSequencia: 1 });
  r = P.registrarResultado(s, { venceu: true, segundos: 250, movimentos: 95 });
  assert.deepEqual(r.recordes, { tempo: true, movimentos: false });
  s = r.estatisticas;
  assert.equal(s.melhorTempo, 250);
  assert.equal(s.menosMovimentos, 90);
  assert.equal(s.melhorSequencia, 2);
  s = P.registrarResultado(s, { venceu: false }).estatisticas;
  assert.equal(s.sequencia, 0);
  assert.equal(s.melhorSequencia, 2);
  assert.equal(P.porcentagemVitorias(s), 67);
  assert.equal(P.porcentagemVitorias(P.estatisticasVazias()), 0);
  assert.deepEqual(P.lerEstatisticas({ jogadas: 2, vitorias: 5, melhorTempo: 0, menosMovimentos: "x" }), {
    ...P.estatisticasVazias(),
    jogadas: 2,
    vitorias: 2,
  });
  assert.deepEqual(P.lerEstatisticas(null), P.estatisticasVazias());
  assert.equal(P.formatarTempo(65), "01:05");
  assert.equal(P.formatarTempo(3725), "1:02:05");
  assert.equal(P.formatarNumero(32000), "32.000");
}

// ---------- Partidas inteiras ----------
{
  // Jogadas ao acaso: as regras nunca perdem nem repetem cartas
  let a = 99;
  const aleatorio = () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let partida = 0; partida < 120; partida++) {
    let e = P.novoJogo(2000 + partida);
    for (let passo = 0; passo < 300; passo++) {
      const jogadas = jogadasPossiveis(e);
      if (!jogadas.length) {
        assert.ok(!P.temJogada(e), "temJogada concorda com a lista de jogadas");
        break;
      }
      assert.ok(P.temJogada(e) || jogadas.every(([id]) => P.localizar(e, id).tipo === "celula"));
      const [id, destino] = jogadas[Math.floor(aleatorio() * jogadas.length)];
      e = P.subirSozinhas(P.mover(e, id, destino)).estado;
      conferirInvariantes(e);
      if (P.venceu(e)) break;
    }
  }
}

{
  // Seguindo só a dica simples (e subindo sozinho o que for seguro), toda partida termina sem andar em
  // círculos, e uma parte é ganha
  let vitorias = 0;
  const partidas = 200;
  for (let numero = 1; numero <= partidas; numero++) {
    let e = P.novoJogo(numero);
    let passos = 0;
    for (;;) {
      const d = P.dica(e);
      if (!d) break;
      const n = P.mover(e, d.id, d.destino);
      assert.ok(n, "a dica sugere só jogadas válidas");
      e = P.subirSozinhas(n).estado;
      passos += 1;
      assert.ok(passos < 2000, `a dica andou em círculos na partida ${numero}`);
    }
    conferirInvariantes(e);
    if (P.venceu(e)) vitorias += 1;
  }
  console.log(`seguindo só a dica simples, sem o resolvedor: ${vitorias} de ${partidas} partidas ganhas`);
  assert.ok(vitorias > 0, "a dica sozinha ganha algumas partidas");
}

// ---------- Resolver ----------
{
  // A chave não depende da ordem das colunas nem das células
  const a = estado({ colunas: ["Kp Qo", "5e"], celulas: ["2c", null, "9p"] });
  const b = estado({ colunas: ["", "5e", "", "Kp Qo"], celulas: [null, "9p", null, "2c"] });
  assert.equal(P.chave(a), P.chave(b));
  assert.notEqual(P.chave(a), P.chave(estado({ colunas: ["Kp", "Qo 5e"], celulas: ["2c", "9p"] })));

  // O resolvedor acha a solução das primeiras partidas, e as jogadas dele valem no jogo
  let resolvidas = 0;
  const partidas = 25;
  for (let numero = 1; numero <= partidas; numero++) {
    const caminho = P.resolver(P.novoJogo(numero));
    if (!caminho) continue;
    resolvidas += 1;
    let e = P.novoJogo(numero);
    for (const j of caminho) {
      const n = P.mover(e, j.id, j.destino);
      assert.ok(n, `jogada válida na solução da partida ${numero}`);
      e = P.subirSozinhas(n).estado;
    }
    assert.ok(P.venceu(e), `a solução da partida ${numero} termina na vitória`);
  }
  console.log(`resolvedor: ${resolvidas} de ${partidas} partidas resolvidas`);
  assert.ok(resolvidas >= partidas - 1, "quase toda partida tem solução, e o resolvedor acha");

  // Aos pedaços, a busca dá o mesmo resultado
  const inteira = P.resolver(P.novoJogo(5));
  const busca = P.criarBusca(P.novoJogo(5));
  let r;
  let voltas = 0;
  do {
    r = busca.continuar(20);
    voltas += 1;
  } while (r === undefined);
  assert.deepEqual(r, inteira);
  assert.ok(voltas > 1, "precisou de mais de um pedaço");
  assert.deepEqual(busca.continuar(20), r, "depois de achar, devolve sempre a mesma resposta");

  // A partida 11.982 não tem solução: com um limite pequeno, a busca desiste
  assert.equal(P.resolver(P.novoJogo(11982), { limite: 1500 }), null);

  // Carta que já pode subir sozinha: subir a primeira delas é a primeira jogada
  let numero = 1;
  while (!P.subirSozinhas(P.novoJogo(numero)).ids.length) numero += 1;
  const comAs = P.novoJogo(numero);
  const primeira = P.subirSozinhas(comAs).ids[0];
  assert.deepEqual(P.resolver(comAs)[0], { id: primeira, destino: fun(P.naipe(primeira)) });
}

console.log("freecell: todos os testes passaram");
