"use strict";
const assert = require("node:assert/strict");
const G = require("../../assets/jogos/paciencia-golf-logica.js");

// Carta pelo nome: valor + naipe (e espadas, c copas, o ouros, p paus). Ex.: "Kc", "10e", "Ap".
const NAIPE = { e: 0, c: 1, o: 2, p: 3 };
const VALOR = { A: 1, J: 11, Q: 12, K: 13 };
function carta(nome) {
  const v = VALOR[nome.slice(0, -1)] || Number(nome.slice(0, -1));
  return NAIPE[nome.slice(-1)] * 13 + v - 1;
}
const cs = (texto) => (texto ? texto.split(" ").map(carta) : []);

/**
 * Estado montado à mão. Cada coluna vem por texto, de cima para baixo (a última é a que aparece
 * inteira); o monte e a fundação também, com a carta de cima no fim. As cartas que sobram vão para
 * baixo da fundação, para o estado ficar com as 52.
 */
function estado(partes = {}) {
  const colunas = [...Array(7).keys()].map((c) => cs((partes.colunas || [])[c] || ""));
  const monte = cs(partes.monte);
  const fundacao = cs(partes.fundacao || "");
  const usadas = new Set([...colunas.flat(), ...monte, ...fundacao]);
  const resto = [...Array(52).keys()].filter((id) => !usadas.has(id));
  return {
    modo: partes.modo || "classico",
    semente: 1,
    colunas,
    monte,
    fundacao: [...resto, ...fundacao],
    movimentos: 0,
    segundos: 0,
    iniciado: false,
  };
}

function conferirCartas(e) {
  const todas = [...e.colunas.flat(), ...e.monte, ...e.fundacao];
  assert.equal(todas.length, 52, "52 cartas no jogo");
  assert.equal(new Set(todas).size, 52, "nenhuma carta repetida");
  assert.ok(e.colunas.every((c) => c.length <= 5), "nenhuma coluna cresce");
}

// ---------- Distribuição ----------
{
  const e = G.novoJogo("classico", 42);
  assert.equal(e.colunas.length, 7);
  assert.ok(e.colunas.every((c) => c.length === 5), "7 colunas de 5");
  assert.equal(e.monte.length, 16, "16 no monte depois da primeira carta virada");
  assert.equal(e.fundacao.length, 1, "uma carta já na fundação");
  assert.equal(G.naColunas(e), 35);
  conferirCartas(e);
  assert.deepEqual(G.novoJogo("classico", 42), e, "a mesma semente dá a mesma partida");
  assert.notDeepEqual(G.novoJogo("classico", 43).colunas, e.colunas);
  assert.deepEqual(G.novoJogo("volta", 42).colunas, e.colunas, "o modo não muda as cartas");
  assert.equal(G.novoJogo("xyz", 1).modo, G.MODO_PADRAO, "modo inválido vira o padrão");
  assert.equal(G.MODO_PADRAO, "classico");
  assert.ok(!e.iniciado);
  assert.ok(!G.venceu(e) && !G.terminou(e));
  assert.equal(G.textoModo("classico"), "Clássico");
  assert.equal(G.textoModo("volta"), "Com volta");
  const s = G.novaSemente(() => 0.5);
  assert.ok(Number.isInteger(s) && s >= 1 && s <= 999999);
}

// ---------- Quais valores encaixam ----------
{
  const enc = (a, b, modo = "classico") => G.valoresEncaixam(a, b, modo);
  assert.ok(enc(5, 6) && enc(6, 5) && enc(5, 4), "um acima ou um abaixo");
  assert.ok(!enc(5, 7) && !enc(5, 5) && !enc(5, 3), "nem dois de distância nem o mesmo valor");
  assert.ok(enc(12, 13) && enc(13, 12), "Dama e Rei");
  assert.ok(enc(1, 2) && enc(2, 1), "Ás e 2");
  assert.ok(!enc(13, 1) && !enc(1, 13), "no Clássico, o Ás e o Rei não se ligam");
  assert.ok(enc(13, 1, "volta") && enc(1, 13, "volta"), "com volta, o Ás vai sobre o Rei e o Rei sobre o Ás");
  assert.ok(!enc(12, 1, "volta") && !enc(13, 2, "volta"), "a volta só liga o Ás e o Rei");
  assert.ok(!enc(13, 11, "volta"));
  assert.deepEqual(G.vizinhos(13, "classico"), [12], "o Rei só aceita a Dama");
  assert.deepEqual(G.vizinhos(1, "classico"), [2], "o Ás só aceita o 2");
  assert.deepEqual(G.vizinhos(13, "volta"), [1, 12]);
  assert.deepEqual(G.vizinhos(1, "volta"), [2, 13]);
  assert.deepEqual(G.vizinhos(7, "classico"), [6, 8]);
  // Naipe e cor não importam
  assert.ok(G.encaixa(carta("6c"), carta("7c"), "classico"), "mesmo naipe");
  assert.ok(G.encaixa(carta("6e"), carta("7p"), "classico"), "mesma cor");
  assert.ok(G.encaixa(carta("6o"), carta("5p"), "classico"), "cores diferentes");
  assert.ok(!G.encaixa(carta("6o"), null, "classico"), "sem fundação, nada encaixa");
  assert.equal(G.valorComArtigo(12), "a Dama");
  assert.equal(G.valorComArtigo(1), "o Ás");
  assert.equal(G.valorComArtigo(9), "o 9");
}

// ---------- Jogar uma carta das colunas ----------
{
  const e = estado({
    colunas: ["2e 9c", "4o 5p", "Kc", "", "Ac 3o", "8e 6e", "Qo"],
    monte: "Je 10p",
    fundacao: "7o",
  });
  conferirCartas(e);
  assert.deepEqual(G.colunasJogaveis(e), [5], "só o 6e encaixa no 7o");
  assert.ok(!G.podeJogar(e, 0), "o 9c fica a dois do 7");
  assert.ok(!G.podeJogar(e, 3), "coluna vazia não joga");
  assert.ok(!G.podeJogar(e, 9), "coluna que não existe");
  assert.equal(G.jogar(e, 0), null);
  const a = G.jogar(e, 5);
  assert.deepEqual(a.colunas[5], [carta("8e")], "a carta de baixo da coluna aparece inteira");
  assert.equal(G.topoDaFundacao(a), carta("6e"));
  assert.equal(a.movimentos, 1);
  assert.ok(a.iniciado);
  assert.equal(e.colunas[5].length, 2, "o estado de antes não muda");
  conferirCartas(a);
  // 6e: agora encaixam o 5p e o 7... o 8e, que ficou à mostra, não (dois acima)
  assert.deepEqual(G.colunasJogaveis(a), [1]);
  const b = G.jogar(a, 1);
  assert.deepEqual(b.colunas[1], [carta("4o")]);
  assert.deepEqual(G.colunasJogaveis(b), [1], "o 4o, que ficou à mostra, encaixa no 5; o 3o não");
  // O monte vira por cima de qualquer carta
  const c = G.virar(b);
  assert.equal(G.topoDaFundacao(c), carta("10p"));
  assert.deepEqual(c.monte, [carta("Je")]);
  assert.deepEqual(G.colunasJogaveis(c), [0], "o 9c encaixa no 10");
  const d = G.virar(c);
  assert.equal(G.topoDaFundacao(d), carta("Je"));
  assert.deepEqual(G.colunasJogaveis(d), [6], "a Dama encaixa no Valete");
  assert.equal(G.virar(d), null, "o monte acabou: não há segunda passagem");
  assert.ok(!G.terminou(d), "ainda há jogada nas colunas");
  const f = G.jogar(d, 6);
  assert.deepEqual(G.colunasJogaveis(f), [2], "o Rei encaixa na Dama");
  const g = G.jogar(f, 2);
  assert.deepEqual(G.colunasJogaveis(g), [], "no Clássico, nada vai sobre o Rei além da Dama");
  assert.ok(G.terminou(g) && !G.venceu(g));
  assert.equal(G.pontuacao(g), G.naColunas(g), "a pontuação são as cartas que sobraram nas colunas");
  assert.equal(G.pontuacao(g), 6);
  assert.deepEqual(G.jogadasPossiveis(g), []);
  // Com volta, o Ás da coluna 4? Ele está coberto pelo 3o: só a carta de baixo conta
  const gv = { ...g, modo: "volta" };
  assert.deepEqual(G.colunasJogaveis(gv), [], "o Ás está coberto pelo 3");
  const gv2 = { ...gv, colunas: gv.colunas.map((col, i) => (i === 4 ? [carta("3o"), carta("Ac")] : col)) };
  assert.deepEqual(G.colunasJogaveis(gv2), [4], "com volta, o Ás vai sobre o Rei");
  assert.deepEqual(G.colunasJogaveis({ ...gv2, modo: "classico" }), [], "no Clássico, não");
}

// ---------- Vitória e pontuação ----------
{
  const e = estado({ colunas: ["5c", "", "", "", "", "", "6p"], monte: "2e 9o 3c", fundacao: "4o" });
  const a = G.jogar(e, 0);
  assert.ok(!G.venceu(a));
  const b = G.jogar(a, 6);
  assert.ok(G.venceu(b) && G.terminou(b), "limpar as 7 colunas ganha");
  assert.equal(G.pontuacao(b), -3, "mesa limpa: menos as cartas que sobraram no monte");
  assert.ok(!Object.is(G.pontuacao({ ...b, monte: [] }), -0), "mesa limpa e monte vazio dá zero");
  assert.equal(G.pontuacao({ ...b, monte: [] }), 0);
  assert.equal(G.virar(b), null, "depois de ganhar, o monte não vira mais");
  assert.deepEqual(G.jogadasPossiveis(b), []);
  assert.equal(G.formatarPontuacao(-4), "−4");
  assert.equal(G.formatarPontuacao(0), "0");
  assert.equal(G.formatarPontuacao(7), "7");
  // Monte com cartas: a partida nunca acaba, mesmo sem jogada nas colunas
  const parado = estado({ colunas: ["9c"], monte: "2e", fundacao: "4o" });
  assert.ok(!G.terminou(parado));
  assert.deepEqual(G.jogadasPossiveis(parado), [{ monte: true }]);
  assert.ok(G.terminou(G.virar(parado)));
  assert.equal(G.pontuacao(G.virar(parado)), 1);
}

// ---------- Aplicar e dica simples ----------
{
  const e = estado({ colunas: ["2e 9c", "4o 8p", "Kc 8c 8o"], monte: "Je", fundacao: "7o" });
  assert.equal(G.aplicar(e, { coluna: 0 }), null, "jogada inválida");
  assert.equal(G.aplicar(e, null), null);
  assert.equal(G.aplicar(e, { coluna: "1" }), null);
  assert.deepEqual(G.aplicar(e, { coluna: 1 }), G.jogar(e, 1));
  assert.deepEqual(G.aplicar(e, { monte: true }), G.virar(e));
  assert.deepEqual(G.dica(e), { coluna: 2 }, "entre as que encaixam, a coluna mais alta");
  assert.deepEqual(G.dica(estado({ colunas: ["9c"], monte: "2e", fundacao: "4o" })), { monte: true });
  assert.equal(G.dica(estado({ colunas: ["9c"], fundacao: "4o" })), null, "partida acabada, sem dica");
}

// ---------- Salvar e restaurar ----------
{
  let e = G.novoJogo("classico", 9);
  for (let i = 0; i < 5; i++) e = G.aplicar(e, G.jogadasPossiveis(e)[0]);
  const json = JSON.parse(JSON.stringify(e));
  assert.deepEqual(G.restaurar(json), e, "o estado salvo volta igual");
  assert.equal(G.restaurar(null), null);
  assert.equal(G.restaurar("x"), null);
  assert.equal(G.restaurar({ ...json, modo: "outro" }), null, "modo inválido");
  assert.equal(G.restaurar({ ...json, semente: 0 }), null);
  assert.equal(G.restaurar({ ...json, semente: 10 }), null, "as cartas não são as daquela partida");
  assert.equal(G.restaurar({ ...json, movimentos: -1 }), null);
  assert.equal(G.restaurar({ ...json, segundos: 1.5 }), null);
  assert.equal(G.restaurar({ ...json, colunas: json.colunas.slice(1) }), null, "faltou uma coluna");
  assert.equal(G.restaurar({ ...json, monte: [...json.monte, json.monte[0]] }), null, "carta repetida");
  assert.equal(G.restaurar({ ...json, fundacao: [] }), null);
  const trocada = { ...json, colunas: json.colunas.map((c) => c.slice()) };
  const alta = trocada.colunas.findIndex((c) => c.length >= 2);
  trocada.colunas[alta] = trocada.colunas[alta].slice().reverse();
  assert.equal(G.restaurar(trocada), null, "coluna fora de ordem");
  // A fundação precisa ser uma sequência possível: uma carta de coluna que não encaixa não vale
  const inicio = G.novoJogo("classico", 9);
  const naoEncaixa = inicio.colunas.findIndex((c) => !G.encaixa(c[4], inicio.fundacao[0], "classico"));
  const falsa = JSON.parse(JSON.stringify(inicio));
  falsa.fundacao.push(falsa.colunas[naoEncaixa].pop());
  assert.equal(G.restaurar(falsa), null, "carta que não encaixa na fundação");
  // Do monte vale qualquer carta, mas só na ordem
  const doMonte = JSON.parse(JSON.stringify(inicio));
  doMonte.fundacao.push(doMonte.monte.shift());
  assert.equal(G.restaurar(doMonte), null, "carta do fundo do monte");
  assert.ok(G.restaurar(JSON.parse(JSON.stringify(G.virar(inicio)))), "a carta de cima do monte vale");
  // O mesmo jogo com volta aceita o Ás sobre o Rei
  assert.equal(G.restaurar({ ...JSON.parse(JSON.stringify(G.novoJogo("volta", 9))), iniciado: "sim" }).iniciado, false);
}

// ---------- Estatísticas ----------
{
  let est = G.estatisticasVazias();
  assert.equal(est.melhorPontuacao, null);
  let r = G.registrarResultado(est, { venceu: false, pontuacao: 6 });
  est = r.estatisticas;
  assert.equal(est.jogadas, 1);
  assert.equal(est.vitorias, 0);
  assert.equal(est.melhorPontuacao, 6, "partida terminada sem vitória também tem pontuação");
  assert.equal(r.recordes.pontuacao, false, "a primeira pontuação não é recorde");
  r = G.registrarResultado(est, { venceu: false, pontuacao: 9 });
  est = r.estatisticas;
  assert.equal(est.melhorPontuacao, 6, "pontuação pior não muda o recorde");
  assert.ok(!r.recordes.pontuacao);
  r = G.registrarResultado(est, { venceu: true, segundos: 200, pontuacao: -2 });
  est = r.estatisticas;
  assert.equal(est.melhorPontuacao, -2);
  assert.ok(r.recordes.pontuacao, "menos é melhor");
  assert.equal(est.melhorTempo, 200);
  assert.equal(r.recordes.tempo, false, "o primeiro tempo não é recorde");
  r = G.registrarResultado(est, { venceu: true, segundos: 150, pontuacao: 0 });
  est = r.estatisticas;
  assert.ok(r.recordes.tempo);
  assert.ok(!r.recordes.pontuacao);
  assert.equal(est.melhorSequencia, 2);
  assert.equal(est.sequencia, 2);
  // Abandonada no meio: conta, zera a sequência, sem pontuação
  r = G.registrarResultado(est, { venceu: false });
  est = r.estatisticas;
  assert.equal(est.jogadas, 5);
  assert.equal(est.sequencia, 0);
  assert.equal(est.melhorSequencia, 2);
  assert.equal(est.melhorPontuacao, -2);
  assert.equal(G.porcentagemVitorias(est), 40);
  assert.equal(G.porcentagemVitorias(G.estatisticasVazias()), 0);
  assert.deepEqual(G.lerEstatisticas({ jogadas: 2, vitorias: 5, melhorTempo: -3, melhorPontuacao: 99, sequencia: "x" }), {
    jogadas: 2,
    vitorias: 2,
    melhorPontuacao: null,
    melhorTempo: null,
    sequencia: 0,
    melhorSequencia: 0,
  });
  assert.equal(G.lerEstatisticas({ melhorPontuacao: -16 }).melhorPontuacao, -16);
  assert.equal(G.lerEstatisticas({ melhorPontuacao: -17 }).melhorPontuacao, null);
  assert.deepEqual(G.lerEstatisticas(null), G.estatisticasVazias());
  assert.equal(G.formatarTempo(65), "01:05");
  assert.equal(G.formatarTempo(3725), "1:02:05");
}

// ---------- Partidas ao acaso ----------
{
  const sorteio = G.aleatorioComSemente(7);
  let ganhas = 0;
  for (let partida = 1; partida <= 400; partida++) {
    const modo = G.MODOS[partida % 2];
    let e = G.novoJogo(modo, partida);
    let passos = 0;
    while (!G.terminou(e)) {
      const jogadas = G.jogadasPossiveis(e);
      assert.ok(jogadas.length > 0, "partida não terminada tem jogada");
      const jogada = jogadas[Math.floor(sorteio() * jogadas.length)];
      const antes = G.topoDaFundacao(e);
      const n = G.aplicar(e, jogada);
      assert.ok(n, "só jogadas válidas");
      if (jogada.coluna !== undefined) {
        assert.ok(G.valoresEncaixam(G.valor(G.topoDaFundacao(n)), G.valor(antes), modo), "a carta encaixou na de antes");
      }
      assert.equal(G.naColunas(n) + n.monte.length, G.naColunas(e) + e.monte.length - 1, "cada jogada tira uma carta");
      e = n;
      passos += 1;
      conferirCartas(e);
      assert.ok(passos <= 51, "a partida termina em no máximo 51 jogadas");
    }
    assert.equal(e.movimentos, passos);
    assert.equal(e.fundacao.length, 1 + passos, "tudo o que saiu está na fundação");
    assert.deepEqual(G.restaurar(JSON.parse(JSON.stringify(e))), e, "o estado final também se restaura");
    const p = G.pontuacao(e);
    if (G.venceu(e)) {
      ganhas += 1;
      assert.equal(p, -e.monte.length);
    } else {
      assert.equal(e.monte.length, 0, "sem vitória, o monte acabou");
      assert.equal(p, G.naColunas(e));
      assert.ok(p >= 1 && p <= 35);
    }
  }
  console.log(`jogando ao acaso: ${ganhas} de 400 partidas ganhas`);
}

// ---------- Busca da solução ----------

/** Melhor pontuação por força bruta, sem memória nenhuma (só para posições pequenas). */
function forcaBruta(e) {
  if (G.terminou(e)) return G.pontuacao(e);
  let melhor = Infinity;
  for (const j of G.jogadasPossiveis(e)) melhor = Math.min(melhor, forcaBruta(G.aplicar(e, j)));
  return melhor;
}

function seguir(e, caminho) {
  let x = e;
  for (const j of caminho) {
    x = G.aplicar(x, j);
    assert.ok(x, "o caminho da busca só tem jogadas válidas");
  }
  return x;
}

{
  // Posições pequenas tiradas de partidas de verdade: a busca concorda com a força bruta
  const sorteio = G.aleatorioComSemente(11);
  let vitorias = 0;
  let derrotas = 0;
  for (let s = 1; s <= 300; s++) {
    const modo = G.MODOS[s % 2];
    const e = G.novoJogo(modo, s);
    // Cada coluna fica com até 2 cartas e o monte com até 7; o resto vai para baixo da fundação
    const colunas = e.colunas.map((c) => c.slice(0, Math.floor(sorteio() * 3)));
    const monte = e.monte.slice(e.monte.length - Math.floor(sorteio() * 8));
    const topoF = G.topoDaFundacao(e);
    const usadas = new Set([...colunas.flat(), ...monte, topoF]);
    const fundacao = [...[...Array(52).keys()].filter((id) => !usadas.has(id)), topoF];
    const pequena = { ...e, colunas, monte, fundacao };
    conferirCartas(pequena);
    const certo = forcaBruta(pequena);
    const r = G.resolver(pequena);
    assert.ok(r, "a busca termina");
    const fim = seguir(pequena, r.caminho);
    if (certo <= 0 && G.naColunas(pequena) > 0) {
      assert.ok(r.vitoria, `partida pequena ${s}: há vitória e a busca acha`);
      assert.ok(G.venceu(fim), "o caminho termina com a mesa limpa");
      assert.equal(r.pontuacao, G.pontuacao(fim));
      assert.equal(r.pontuacao, certo, `partida pequena ${s}: a vitória guarda o máximo de cartas no monte`);
      vitorias += 1;
    } else if (G.naColunas(pequena) > 0) {
      assert.equal(r.vitoria, false, `partida pequena ${s}: sem vitória`);
      assert.equal(r.pontuacao, certo, `partida pequena ${s}: a melhor pontuação é exata`);
      assert.ok(G.terminou(fim), "o caminho vai até o fim da partida");
      assert.equal(G.pontuacao(fim), certo, "e chega à melhor pontuação");
      derrotas += 1;
    }
  }
  assert.ok(vitorias >= 15 && derrotas >= 100, `testou os dois casos (${vitorias} vitórias, ${derrotas} sem vitória)`);

  // Partidas inteiras: quando há vitória, o caminho limpa a mesa; quando não há, chega à pontuação dita
  const contagem = { classico: [0, 0], volta: [0, 0] };
  for (const modo of G.MODOS) {
    for (let s = 1; s <= 5; s++) {
      const e = G.novoJogo(modo, s);
      const r = G.resolver(e);
      assert.ok(r, `partida ${s} (${modo}) dentro do limite`);
      const fim = seguir(e, r.caminho);
      assert.ok(G.terminou(fim), "o caminho vai até o fim");
      assert.equal(G.pontuacao(fim), r.pontuacao);
      assert.equal(G.venceu(fim), r.vitoria);
      contagem[modo][r.vitoria ? 0 : 1] += 1;
    }
  }
  assert.ok(contagem.classico[0] > 0 && contagem.classico[1] > 0, "no Clássico, há partidas com e sem vitória");
  assert.ok(contagem.volta[0] >= contagem.classico[0], "com volta, ganha-se mais");

  // Achar a primeira partida com vitória e a primeira sem, no Clássico
  let comVitoria = 1;
  while (!G.resolver(G.novoJogo("classico", comVitoria)).vitoria) comVitoria += 1;
  let semVitoria = 1;
  while (G.resolver(G.novoJogo("classico", semVitoria)).vitoria) semVitoria += 1;

  // Aos pedaços, a busca dá o mesmo resultado
  for (const s of [comVitoria, semVitoria]) {
    const inteira = G.resolver(G.novoJogo("classico", s));
    const busca = G.criarBusca(G.novoJogo("classico", s));
    let r;
    let pedacos = 0;
    do {
      r = busca.continuar(50);
      pedacos += 1;
    } while (r === undefined);
    assert.deepEqual(r, inteira, `partida ${s}: aos pedaços, o mesmo resultado`);
    assert.ok(pedacos > 1, "precisou de mais de um pedaço");
    assert.deepEqual(busca.continuar(50), r, "depois de terminar, devolve sempre a mesma resposta");
  }

  // A memória de uma busca serve para as seguintes na mesma partida
  const e0 = G.novoJogo("classico", semVitoria);
  const primeira = G.criarBusca(e0);
  const r0 = primeira.continuar();
  const meio = seguir(e0, r0.caminho.slice(0, 5));
  const reaproveitada = G.criarBusca(meio, { memo: primeira.memo });
  const r1 = reaproveitada.continuar();
  assert.equal(reaproveitada.examinadas(), 0, "a posição já estava na memória");
  assert.equal(r1.pontuacao, r0.pontuacao, "seguindo o melhor caminho, a melhor pontuação não muda");
  assert.deepEqual(r1, G.resolver(meio), "com ou sem memória, a mesma resposta");
  // Do meio de uma partida com vitória, seguindo a solução, ainda há vitória
  const v0 = G.novoJogo("classico", comVitoria);
  const sol = G.resolver(v0);
  const vmeio = seguir(v0, sol.caminho.slice(0, Math.floor(sol.caminho.length / 2)));
  const resto = G.resolver(vmeio);
  assert.ok(resto.vitoria);
  assert.ok(G.venceu(seguir(vmeio, resto.caminho)));

  // Posições à mão
  assert.deepEqual(G.resolver(estado({ colunas: ["5c"], monte: "2e", fundacao: "4o" })), {
    vitoria: true,
    caminho: [{ coluna: 0 }],
    pontuacao: -1,
  });
  // Virar o monte primeiro é a única saída: o 9 não encaixa no 4, mas encaixa no 10 do monte
  assert.deepEqual(G.resolver(estado({ colunas: ["9c"], monte: "2e 10e", fundacao: "4o" })).caminho, [{ monte: true }, { coluna: 0 }]);
  // Entre duas vitórias, a que guarda mais cartas no monte: jogar o 5 e o 6 já, sem virar o 2
  const duas = G.resolver(estado({ colunas: ["6c 5c", "3p"], monte: "Ke 2e", fundacao: "4o" }));
  assert.equal(duas.pontuacao, -1, "vira só o 2 para pegar o 3 depois");
  assert.deepEqual(duas.caminho, [{ coluna: 0 }, { coluna: 0 }, { monte: true }, { coluna: 1 }]);
  // Sem vitória: o Rei bloqueia no Clássico; o melhor é jogar a Dama e o Rei e deixar o 5
  const bloqueio = estado({ colunas: ["5c Kp", "Qe"], fundacao: "Jo" });
  const rb = G.resolver(bloqueio);
  assert.equal(rb.vitoria, false);
  assert.equal(rb.pontuacao, 1);
  assert.deepEqual(rb.caminho, [{ coluna: 1 }, { coluna: 0 }]);
  const rv = G.resolver({ ...bloqueio, colunas: [[carta("5c"), carta("Kp")], [carta("Qe")], [carta("Ac")], [], [], [], []] });
  assert.equal(rv.vitoria, false, "o Ás não vai sobre o Rei no Clássico");
  assert.equal(rv.pontuacao, 2);
  const comVolta = G.resolver({
    ...bloqueio,
    modo: "volta",
    colunas: [[carta("5c"), carta("Kp")], [carta("Qe")], [carta("2c"), carta("Ac")], [], [], [], []],
  });
  assert.equal(comVolta.pontuacao, 1, "com volta, o Ás vai sobre o Rei e o 2 sobre o Ás");
  assert.deepEqual(G.resolver(estado({ colunas: [], monte: "2e 3e", fundacao: "4o" })), {
    vitoria: true,
    caminho: [],
    pontuacao: -2,
  });
  // Com o limite, a busca desiste
  const curta = G.criarBusca(G.novoJogo("classico", semVitoria), { limite: 3 });
  assert.equal(curta.continuar(), null);
  assert.equal(curta.examinadas(), 3);

  // A tabela de memória cresce sem perder nada
  const memo = G.criarMemo(4);
  for (let k = 0; k < 5000; k++) memo.set(k * 7919, (k % 50) - 16);
  assert.equal(memo.tamanho(), 5000);
  for (let k = 0; k < 5000; k++) assert.equal(memo.get(k * 7919), (k % 50) - 16);
  assert.equal(memo.get(3), -128, "chave ausente");
  memo.set(0, 5);
  assert.equal(memo.tamanho(), 5000, "regravar não duplica");
  assert.equal(memo.get(0), 5);
}

console.log("paciencia-golf: todos os testes passaram");
