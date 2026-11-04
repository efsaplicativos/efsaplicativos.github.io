"use strict";
const assert = require("node:assert/strict");
const P = require("../../assets/jogos/paciencia-piramide-logica.js");

// Carta pelo nome: valor + naipe (e espadas, c copas, o ouros, p paus). Ex.: "Kc", "10e", "Ap".
const NAIPE = { e: 0, c: 1, o: 2, p: 3 };
const VALOR = { A: 1, J: 11, Q: 12, K: 13 };
function carta(nome) {
  const v = VALOR[nome.slice(0, -1)] || Number(nome.slice(0, -1));
  return NAIPE[nome.slice(-1)] * 13 + v - 1;
}
const cs = (texto) => (texto ? texto.split(" ").map(carta) : []);

/**
 * Estado montado à mão. A pirâmide vem por texto, da ponta para a base, com "-" onde a carta já
 * saiu (posições que faltarem no fim também ficam vazias). Monte e descarte vêm por texto, com a
 * carta de cima no fim. Todas as cartas que sobram entram nas tiradas, para o estado ficar completo.
 */
function estado(partes = {}) {
  const piramide = (partes.piramide ? partes.piramide.split(" ") : []).map((n) => (n === "-" ? null : carta(n)));
  while (piramide.length < 28) piramide.push(null);
  const monte = cs(partes.monte);
  const descarte = cs(partes.descarte);
  const usadas = new Set([...piramide.filter((id) => id !== null), ...monte, ...descarte]);
  const tiradas = [...Array(52).keys()].filter((id) => !usadas.has(id));
  return {
    modo: partes.modo === undefined ? 3 : partes.modo,
    semente: 1,
    piramide,
    monte,
    descarte,
    tiradas,
    volta: partes.volta || 1,
    movimentos: 0,
    segundos: 0,
    iniciado: false,
  };
}

/** As 21 posições acima da base, já vazias: depois dela vêm só as cartas da base. */
const ACIMA_VAZIO = "- - - - - - - - - - - - - - - - - - - - -";

function conferirInvariantes(e) {
  const todas = [...e.piramide.filter((id) => id !== null), ...e.monte, ...e.descarte, ...e.tiradas];
  assert.equal(todas.length, 52, "52 cartas no jogo");
  assert.equal(new Set(todas).size, 52, "nenhuma carta repetida");
  assert.ok(P.restaurar(JSON.parse(JSON.stringify(e))), "o estado salvo volta igual");
}

/** Todas as jogadas possíveis agora, no formato da busca. */
function jogadasPossiveis(e) {
  const jogadas = P.jogadasDeTirar(e).map((ids) => ({ tirar: ids }));
  if (P.podeVirar(e) || P.podeReciclar(e)) jogadas.push({ monte: true });
  return jogadas;
}

// ---------- Posições da pirâmide ----------
{
  assert.equal(P.LINHA_DE.length, 28);
  assert.equal(P.posicao(0, 0), 0);
  assert.equal(P.posicao(1, 1), 2);
  assert.equal(P.posicao(6, 0), 21);
  assert.equal(P.posicao(6, 6), 27);
  assert.deepEqual(P.cobertoras(0), [1, 2], "a ponta fica sob as duas cartas da segunda linha");
  assert.deepEqual(P.cobertoras(4), [7, 8]);
  assert.deepEqual(P.cobertoras(27), [], "a base não fica coberta");
  assert.deepEqual(P.cobertas(0), []);
  assert.deepEqual(P.cobertas(3), [1], "na ponta da linha, a carta cobre uma só");
  assert.deepEqual(P.cobertas(4), [1, 2], "no meio, cobre duas");
  for (let p = 0; p < 28; p++) for (const c of P.cobertoras(p)) assert.ok(P.cobertas(c).includes(p), "cobrir é recíproco");
}

// ---------- Distribuição ----------
{
  const e = P.novoJogo(3, 42);
  assert.equal(e.piramide.length, 28);
  assert.equal(e.monte.length, 24);
  assert.deepEqual(e.descarte, []);
  assert.equal(e.volta, 1);
  conferirInvariantes(e);
  assert.deepEqual(P.novoJogo(3, 42), e, "a mesma semente dá a mesma partida");
  assert.notDeepEqual(P.novoJogo(3, 43).piramide, e.piramide);
  assert.equal(P.novoJogo(7, 1).modo, P.MODO_PADRAO, "modo inválido vira o padrão");
  assert.equal(P.novoJogo(0, 1).modo, 0, "0 é sem limite de voltas");

  // No começo, só a base está livre
  const livres = P.cartasLivres(e);
  assert.deepEqual(livres, e.piramide.slice(21));
  assert.equal(P.naPiramide(e), 28);
  assert.ok(!P.venceu(e));
  assert.equal(P.textoModo(1), "1 volta");
  assert.equal(P.textoModo(3), "3 voltas");
  assert.equal(P.textoModo(0), "voltas sem limite");
}

// ---------- Tirar cartas ----------
{
  // Linha 5 (posições 15 a 20): 6o 6p 7c 7o 7p 8e. Base (21 a 27): 6c 7e Kp 5o 8o Qe Ac.
  const e = estado({
    piramide: "2e 2c 2o 2p 3e 3c 3o 3p 4e 4c 4o 4p 5e 5c 6e 6o 6p 7c 7o 7p 8e 6c 7e Kp 5o 8o Qe Ac",
    monte: "9e 9c",
    descarte: "8c Je",
  });
  conferirInvariantes(e);
  const id = (n) => carta(n);

  assert.ok(P.podeTirar(e, [id("Kp")]), "o Rei sai sozinho");
  assert.ok(!P.podeTirar(e, [id("Qe")]), "só o Rei sai sozinho");
  assert.ok(P.podeTirar(e, [id("6c"), id("7e")]), "6 + 7 = 13");
  assert.ok(P.podeTirar(e, [id("Qe"), id("Ac")]), "Dama (12) + Ás (1) = 13");
  assert.ok(P.podeTirar(e, [id("5o"), id("8o")]), "5 + 8 = 13, mesmo do mesmo naipe");
  assert.ok(!P.podeTirar(e, [id("6c"), id("8o")]), "6 + 8 não é 13");
  assert.ok(!P.podeTirar(e, [id("6c"), id("6c")]), "a mesma carta duas vezes não vale");
  assert.ok(!P.podeTirar(e, [id("Kp"), id("6c")]), "o Rei não faz par");
  assert.ok(!P.podeTirar(e, [id("8e"), id("5o")]), "carta coberta não sai (o 8e está sob a Qe e o Ac)");
  assert.ok(!P.podeTirar(e, [id("Je"), id("2e")]), "a ponta está coberta");
  assert.ok(!P.podeTirar(e, [id("8c"), id("5o")]), "só a carta de cima do descarte está livre");
  assert.ok(P.disponivel(e, id("Je")));
  assert.ok(!P.disponivel(e, id("9e")), "carta do monte não está livre");
  assert.deepEqual(P.parceiros(e, id("6c")), [id("7e")]);
  assert.deepEqual(P.parceiros(e, id("Kp")), []);

  // Tirar 6c e 7e libera o 6o; o 6p ainda está sob o Kp
  const a = P.tirar(e, [id("6c"), id("7e")]);
  assert.equal(a.piramide[21], null);
  assert.equal(a.piramide[22], null);
  assert.deepEqual(a.tiradas.slice(-2), [id("6c"), id("7e")]);
  assert.equal(a.movimentos, 1);
  assert.ok(a.iniciado);
  assert.ok(P.livreNaPiramide(a, 15), "o 6o ficou livre");
  assert.ok(!P.livreNaPiramide(a, 16), "o 6p ainda está sob o Kp");
  conferirInvariantes(a);
  const semDamaEAs = P.tirar(a, [id("Qe"), id("Ac")]);
  assert.ok(P.podeTirar(semDamaEAs, [id("8e"), id("5o")]), "sem a Qe e o Ac, o 8e fica livre");
  assert.equal(e.piramide[21], id("6c"), "o estado de antes não muda");

  // A carta de cima do descarte faz par com a pirâmide
  const comDescarte = estado({ piramide: `${ACIMA_VAZIO} - - - - - - 4c`, descarte: "2e 9o" });
  const b = P.tirar(comDescarte, [carta("9o"), carta("4c")]);
  assert.ok(b && P.venceu(b), "tirar a última carta da pirâmide ganha a partida");
  assert.deepEqual(b.descarte, [carta("2e")], "a carta de baixo do descarte fica livre");
  assert.equal(P.tirar(comDescarte, [carta("2e"), carta("Je")]), null);
}

// ---------- Monte e voltas ----------
{
  const e = estado({ piramide: `${ACIMA_VAZIO} - - - - - - 4c`, monte: "Ae 2e 3e" });
  const ordem = [];
  let x = e;
  for (let i = 0; i < 3; i++) {
    x = P.usarMonte(x);
    ordem.push(P.nomeCarta(x.descarte[x.descarte.length - 1]));
  }
  assert.deepEqual(ordem, ["3 de espadas", "2 de espadas", "Ás de espadas"], "o monte vira de cima para baixo");
  assert.ok(!P.podeVirar(x));
  assert.ok(P.podeReciclar(x), "com 3 voltas, o descarte volta para o monte");
  const segunda = P.usarMonte(x);
  assert.equal(segunda.volta, 2);
  assert.deepEqual(segunda.descarte, []);
  assert.deepEqual(segunda.monte, e.monte, "na volta seguinte as cartas saem na mesma ordem");
  assert.equal(P.voltasRestantes(segunda), 1);

  // Na última volta, o monte para
  const ultima = { ...x, volta: 3 };
  assert.ok(!P.podeReciclar(ultima));
  assert.equal(P.usarMonte(ultima), null);
  assert.ok(!P.podeReciclar({ ...x, modo: 1, volta: 1 }), "com 1 volta, não recicla");
  const semLimite = { ...x, modo: 0, volta: 57 };
  assert.ok(P.podeReciclar(semLimite), "sem limite, recicla sempre");
  assert.equal(P.usarMonte(semLimite).volta, 58);
  assert.equal(P.voltasRestantes(semLimite), Infinity);
  assert.equal(P.usarMonte(estado({ piramide: "Ac" })), null, "monte e descarte vazios");
}

// ---------- Fim de jogo ----------
{
  // Base 4c e 5c, livres; nada faz par entre elas
  const base = `${ACIMA_VAZIO} - - - - - 4c 5c`;
  assert.ok(!P.temJogada(estado({ piramide: base })), "nada para tirar e nada no monte");
  assert.ok(!P.podeProgredir(estado({ piramide: base })));

  // Um 9 no monte serve para o 4c
  assert.ok(P.podeProgredir(estado({ piramide: base, monte: "2e 9e" })));
  // Só cartas que não servem: dá para virar, mas não adianta
  const inutil = estado({ piramide: base, monte: "2e 3e", descarte: "Qe" });
  assert.ok(P.temJogada(inutil), "o monte ainda vira");
  assert.ok(!P.podeProgredir(inutil), "mas nenhuma carta vai sair");
  // Um Rei no monte ainda sai
  assert.ok(P.podeProgredir(estado({ piramide: base, monte: "Ke" })));
  // O 8 que serve para o 5c está embaixo no descarte: só com mais uma volta
  assert.ok(P.podeProgredir(estado({ piramide: base, descarte: "8e 2e", volta: 2 })));
  assert.ok(!P.podeProgredir(estado({ piramide: base, descarte: "8e 2e", volta: 3 })), "sem voltas, ficou preso");
  assert.ok(P.podeProgredir(estado({ piramide: base, descarte: "2e 8e", volta: 3 })), "a carta de cima ainda serve");
  assert.ok(!P.podeProgredir(estado({ piramide: "" })), "partida ganha não tem mais nada a fazer");
}

// ---------- Dica simples ----------
{
  const e = estado({
    piramide: "2e 2c 2o 2p 3e 3c 3o 3p 4e 4c 4o 4p 5e 5c 6e 6o 6p 7c 7o 7p 8e 6c 7e Kp 5o 8o Qe Ac",
    monte: "9e",
  });
  assert.deepEqual(P.dica(e), { tirar: [carta("Kp")] }, "primeiro o Rei");
  // Sem o Rei, 6c + 7e libera duas cartas (6o e 6p), 5o + 8o também (7c e 7o) e Qe + Ac só uma (8e)
  const semRei = P.tirar(e, [carta("Kp")]);
  assert.deepEqual(P.dica(semRei), { tirar: [carta("6c"), carta("7e")] }, "o par que libera mais cartas");

  assert.deepEqual(P.dica(estado({ piramide: `${ACIMA_VAZIO} - - - - - 4c 5c`, monte: "2e" })), { monte: true }, "sem par, vira o monte");
  assert.equal(P.dica(estado({ piramide: `${ACIMA_VAZIO} - - - - - 4c 5c` })), null, "sem nada, sem dica");

  // Com a carta do descarte, a dica prefere usá-la a gastar duas da pirâmide
  const descarte = estado({ piramide: `${ACIMA_VAZIO} - - - - 4c 9e 9c`, descarte: "4e" });
  const dd = P.dica(descarte);
  assert.ok(dd.tirar.includes(carta("4e")), "usa a carta do descarte");
}

// ---------- Salvar e restaurar ----------
{
  const e = P.usarMonte(P.novoJogo(3, 9));
  assert.deepEqual(P.restaurar(JSON.parse(JSON.stringify(e))), e);
  assert.equal(P.restaurar(null), null);
  assert.equal(P.restaurar({ ...e, modo: 2 }), null, "modo inválido");
  assert.equal(P.restaurar({ ...e, semente: 0 }), null);
  assert.equal(P.restaurar({ ...e, volta: 4 }), null, "mais voltas que o modo deixa");
  assert.ok(P.restaurar({ ...e, modo: 0, volta: 40 }), "sem limite aceita qualquer volta");
  assert.equal(P.restaurar({ ...e, piramide: e.piramide.slice(1) }), null);
  assert.equal(P.restaurar({ ...e, monte: [...e.monte, e.monte[0]] }), null, "carta repetida");
  const buraco = { ...e, piramide: e.piramide.slice(), tiradas: [...e.tiradas, e.piramide[0]] };
  buraco.piramide[0] = null;
  assert.equal(P.restaurar(buraco), null, "a ponta não pode sair antes das cartas que a cobrem");
  assert.equal(P.restaurar({ ...e, movimentos: -1 }), null);
}

// ---------- Estatísticas ----------
{
  let est = P.estatisticasVazias();
  let r = P.registrarResultado(est, { venceu: true, segundos: 200 });
  est = r.estatisticas;
  assert.equal(est.jogadas, 1);
  assert.equal(est.vitorias, 1);
  assert.equal(est.melhorTempo, 200);
  assert.equal(r.recordes.tempo, false, "o primeiro tempo não é recorde");
  r = P.registrarResultado(est, { venceu: true, segundos: 150 });
  est = r.estatisticas;
  assert.ok(r.recordes.tempo);
  assert.equal(est.melhorSequencia, 2);
  est = P.registrarResultado(est, { venceu: false }).estatisticas;
  assert.equal(est.sequencia, 0);
  assert.equal(est.melhorSequencia, 2);
  assert.equal(P.porcentagemVitorias(est), 67);
  assert.equal(P.porcentagemVitorias(P.estatisticasVazias()), 0);
  assert.deepEqual(P.lerEstatisticas({ jogadas: 2, vitorias: 5, melhorTempo: -3, sequencia: "x" }), {
    jogadas: 2,
    vitorias: 2,
    melhorTempo: null,
    sequencia: 0,
    melhorSequencia: 0,
  });
  assert.equal(P.formatarTempo(65), "01:05");
  assert.equal(P.formatarTempo(3725), "1:02:05");
}

// ---------- Partidas ao acaso ----------
{
  // Jogadas sorteadas, até a partida acabar: as cartas nunca se perdem nem se repetem
  const sorteio = P.aleatorioComSemente(7);
  for (let partida = 1; partida <= 150; partida++) {
    const modo = P.MODOS[partida % 3];
    let e = P.novoJogo(modo, partida);
    for (let passo = 0; passo < 400 && P.podeProgredir(e); passo++) {
      const jogadas = jogadasPossiveis(e);
      assert.ok(jogadas.length > 0, "quem ainda pode progredir tem jogada");
      e = P.aplicar(e, jogadas[Math.floor(sorteio() * jogadas.length)]);
      conferirInvariantes(e);
    }
  }

  // Seguir só a dica simples, sem a busca
  let vitorias = 0;
  for (let partida = 1; partida <= 200; partida++) {
    let e = P.novoJogo(3, partida);
    for (let passo = 0; passo < 500 && P.podeProgredir(e); passo++) e = P.aplicar(e, P.dica(e));
    if (P.venceu(e)) vitorias += 1;
  }
  console.log(`seguindo só a dica simples, sem a busca: ${vitorias} de 200`);
}

// ---------- Busca da solução ----------
{
  // As soluções levam mesmo à vitória
  let resolvidas = 0;
  let semSolucao = 0;
  const partidas = 40;
  for (let s = 1; s <= partidas; s++) {
    const inicio = P.novoJogo(3, s);
    const caminho = P.resolver(inicio);
    if (!caminho) {
      semSolucao += 1;
      continue;
    }
    resolvidas += 1;
    let e = inicio;
    for (const jogada of caminho) {
      e = P.aplicar(e, jogada);
      assert.ok(e, `jogada válida na partida ${s}`);
    }
    assert.ok(P.venceu(e), `a solução da partida ${s} termina na vitória`);
  }
  console.log(`busca, 3 voltas: ${resolvidas} de ${partidas} resolvidas`);
  assert.ok(resolvidas >= partidas / 2, "com 3 voltas, mais da metade tem solução");

  // Os cortes da busca não descartam partidas com solução: quando a busca com cortes diz que não
  // tem, a busca completa (sem cortes) concorda
  let conferidas = 0;
  for (let s = 1; s <= 24; s++) {
    const e = P.novoJogo(1, s);
    const podada = P.criarBusca(e, { limite: 200000 });
    if (podada.continuar() !== null || podada.examinadas() >= 200000) continue;
    const completa = P.criarBusca(e, { limite: 60000, podar: false });
    const r = completa.continuar();
    if (r === null && completa.examinadas() >= 60000) continue;
    assert.equal(r, null, `partida ${s}: sem solução também na busca completa`);
    conferidas += 1;
  }
  assert.ok(conferidas >= 10, `conferiu bastantes partidas sem solução (${conferidas})`);

  // Aos pedaços, a busca dá o mesmo resultado
  let numero = 1;
  while (!P.resolver(P.novoJogo(3, numero))) numero += 1;
  const inteira = P.resolver(P.novoJogo(3, numero));
  const busca = P.criarBusca(P.novoJogo(3, numero));
  let r;
  let pedacos = 0;
  do {
    r = busca.continuar(5);
    pedacos += 1;
  } while (r === undefined);
  assert.deepEqual(r, inteira);
  assert.ok(pedacos > 1, "precisou de mais de um pedaço");
  assert.deepEqual(busca.continuar(5), r, "depois de achar, devolve sempre a mesma resposta");

  // A busca também parte do meio da partida, com cartas no descarte e em outra volta
  let meio = P.novoJogo(3, numero);
  for (const jogada of inteira.slice(0, Math.floor(inteira.length / 2))) meio = P.aplicar(meio, jogada);
  const resto = P.resolver(meio);
  assert.ok(resto, "do meio da solução ainda há solução");
  let fim = meio;
  for (const jogada of resto) fim = P.aplicar(fim, jogada);
  assert.ok(P.venceu(fim));

  // Rei livre sai primeiro
  const comRei = estado({ piramide: `${ACIMA_VAZIO} - - - - - 6c Ke`, monte: "7e" });
  assert.deepEqual(P.resolver(comRei)[0], { tirar: [carta("Ke")] });
  assert.deepEqual(P.resolver(estado({ piramide: "" })), [], "partida ganha: nada a fazer");
  assert.equal(P.resolver(estado({ piramide: `${ACIMA_VAZIO} - - - - - 4c 5c`, monte: "2e" })), null);
  // Com o limite, a busca desiste
  const curta = P.criarBusca(P.novoJogo(3, numero), { limite: 1 });
  assert.equal(curta.continuar(), null);
  assert.equal(curta.examinadas(), 1);
}

console.log("paciencia-piramide: todos os testes passaram");
