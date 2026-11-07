"use strict";
/* Testes do Desvenda: palavras, cores, dica, palavra do dia, partida salva e estatísticas. */
const assert = require("node:assert/strict");
const L = require("../../assets/jogos/desvenda-logica.js");
const dados = require("../../assets/jogos/desvenda-palavras.js");

const testes = [];
const teste = (nome, fn) => testes.push([nome, fn]);
const dic = L.criarDicionario(dados);

// ---------- Palavras ----------

teste("respostas: mais de mil palavras de 5 letras, sem repetir sem acento", () => {
  assert.ok(dic.respostas.length >= 1000, `só ${dic.respostas.length} respostas`);
  const chaves = dic.respostas.map(L.normalizar);
  assert.ok(chaves.every((c) => /^[a-z]{5}$/.test(c)), "resposta com letra estranha");
  assert.equal(new Set(chaves).size, chaves.length);
});

teste("toda resposta é aceita como chute e mantém o acento", () => {
  for (const r of dic.respostas) {
    assert.ok(dic.aceita(L.normalizar(r)), r);
  }
  assert.ok(dic.respostas.includes("limão"));
  assert.equal(dic.forma("limao"), "limão");
});

teste("aceita plurais, verbos e palavras com acento digitadas sem acento", () => {
  for (const p of ["casas", "gatos", "mesas", "falar", "comia", "fomos", "tenis", "album", "acoes", "leoes", "vozes", "carne", "areia", "teias", "reino"]) {
    assert.ok(dic.aceita(p), `${p} devia ser aceita`);
  }
  assert.equal(dic.forma("tenis"), "tênis");
  assert.equal(dic.forma("acoes"), "ações");
  assert.ok(dic.total > 9000);
});

teste("recusa o que não é palavra", () => {
  for (const p of ["aeiou", "xxxxx", "qwert", "abcde"]) assert.ok(!dic.aceita(p), p);
});

teste("normalizar tira acento e cedilha", () => {
  assert.equal(L.normalizar("Ação"), "acao");
  assert.equal(L.normalizar("ÓTICA"), "otica");
  assert.equal(L.normalizar("pêssego"), "pessego");
});

// ---------- Cores ----------

teste("cores simples: certa, presente e ausente", () => {
  assert.deepEqual(L.avaliar("certo", "certo"), ["certa", "certa", "certa", "certa", "certa"]);
  assert.deepEqual(L.avaliar("trapo", "porta"), ["presente", "presente", "presente", "presente", "presente"]);
  assert.deepEqual(L.avaliar("fundo", "pedra"), ["ausente", "ausente", "ausente", "presente", "ausente"]);
});

teste("letra repetida no chute só fica colorida quantas vezes existe na resposta", () => {
  // "arara" contra "carta": o último A está no lugar; sobram 1 A e 1 R, que pintam só o 1º A e o 1º R
  assert.deepEqual(L.avaliar("arara", "carta"), ["presente", "presente", "ausente", "ausente", "certa"]);
  // A posição certa tem prioridade sobre a presente
  // "sossa" contra "massa": os dois S da resposta já estão verdes, então o 1º S fica ausente
  assert.deepEqual(L.avaliar("sossa", "massa"), ["ausente", "ausente", "certa", "certa", "certa"]);
  // "ovovo" contra "povos": a resposta tem 2 O e 1 V, então só os 2 primeiros O e o 1º V acendem
  assert.deepEqual(L.avaliar("ovovo", "povos"), ["presente", "presente", "presente", "ausente", "ausente"]);
});

teste("acento não muda a cor", () => {
  assert.deepEqual(L.avaliar("limao", "limão"), Array(5).fill("certa"));
  assert.deepEqual(L.avaliar("acoes", "ações"), Array(5).fill("certa"));
});

// ---------- Partida e dica ----------

function digitar(partida, palavra) {
  let p = partida;
  [...palavra].forEach((l, i) => {
    p = L.escrever(p, i, l);
  });
  return p;
}

teste("vitória, derrota e chutes inválidos", () => {
  let p = L.novaPartida("treino", "carta");
  assert.equal(L.enviar(p, dic).motivo, "incompleta");
  p = digitar(p, "xxxxx");
  assert.equal(L.enviar(p, dic).motivo, "invalida");
  p = digitar(p, "porta");
  let r = L.enviar(p, dic);
  assert.ok(r.ok);
  assert.equal(r.partida.fim, null);
  assert.deepEqual(r.partida.atual, ["", "", "", "", ""]);
  p = digitar(r.partida, "carta");
  r = L.enviar(p, dic);
  assert.equal(r.partida.fim, "vitoria");
  assert.equal(L.enviar(r.partida, dic).motivo, "fim");

  let q = L.novaPartida("treino", "carta");
  for (let i = 0; i < 6; i++) q = L.enviar(digitar(q, "porta"), dic).partida;
  assert.equal(q.fim, "derrota");
  assert.equal(q.linhas.length, 6);
});

teste("dica põe a letra certa na posição escolhida se ela não foi descoberta", () => {
  let p = L.novaPartida("treino", "carta");
  const r = L.aplicarDica(p, 3);
  assert.equal(r.pos, 3);
  assert.equal(r.partida.atual[3], "t");
  assert.deepEqual(r.partida.dicas, [{ pos: 3, letra: "t" }]);
  // A letra da dica fica presa: não dá para apagar nem trocar
  assert.equal(L.apagar(r.partida, 3).atual[3], "t");
  assert.equal(L.escrever(r.partida, 3, "x").atual[3], "t");
});

teste("dica numa posição já descoberta vai para a primeira não descoberta", () => {
  let p = L.novaPartida("treino", "carta");
  // "parto": A, R e T ficam verdes
  p = L.enviar(digitar(p, "parto"), dic).partida;
  assert.deepEqual([...L.posicoesDescobertas(p)].sort(), [1, 2, 3]);
  const r = L.aplicarDica(p, 1);
  assert.equal(r.pos, 0);
  assert.equal(r.partida.atual[0], "c");
});

teste("a letra da dica volta sozinha nas linhas seguintes", () => {
  let p = L.aplicarDica(L.novaPartida("treino", "carta"), 4).partida;
  p = digitar(p, "port");
  assert.equal(p.atual.join(""), "porta");
  p = L.enviar(p, dic).partida;
  assert.deepEqual(p.atual, ["", "", "", "", "a"]);
});

teste("no máximo 2 dicas, e a dica nunca entrega a última letra", () => {
  let p = L.novaPartida("treino", "carta");
  p = L.aplicarDica(p, 0).partida;
  p = L.aplicarDica(p, 1).partida;
  assert.equal(L.podeDica(p), false);
  assert.equal(L.aplicarDica(p, 2), null);

  // Com 4 letras verdes, sobra 1 posição: a dica não pode
  let q = L.novaPartida("treino", "carta");
  q = L.enviar(digitar(q, "certa"), dic).partida;
  assert.equal(L.posicoesDesconhecidas(q).length, 1);
  assert.equal(L.podeDica(q), false);
});

teste("teclado mostra a melhor cor de cada letra", () => {
  let p = L.novaPartida("treino", "carta");
  p = L.enviar(digitar(p, "trapo"), dic).partida;
  p = L.enviar(digitar(p, "parto"), dic).partida;
  const t = L.estadoDoTeclado(p);
  assert.equal(t.get("a"), "certa");
  assert.equal(t.get("t"), "certa");
  assert.equal(t.get("p"), "ausente");
  assert.equal(t.get("o"), "ausente");
});

teste("simulação: partidas aleatórias terminam e as dicas são sempre letras certas", () => {
  const aleatorio = L.aleatorioComSemente(7);
  const chutes = dic.respostas.slice(0, 300).map(L.normalizar);
  for (let jogo = 0; jogo < 400; jogo++) {
    let p = L.novaPartida("treino", L.sortearTreino(dic, aleatorio));
    let passos = 0;
    while (!p.fim && passos++ < 30) {
      if (aleatorio() < 0.2 && L.podeDica(p)) {
        const pos = Math.floor(aleatorio() * 5);
        const r = L.aplicarDica(p, pos);
        assert.equal(r.partida.atual[r.pos], L.normalizar(p.resposta)[r.pos]);
        p = r.partida;
      }
      // Chuta uma resposta qualquer que combine com as letras presas pela dica
      const fixas = L.posicoesFixas(p);
      const combinam = chutes.filter((c) => [...fixas].every((i) => c[i] === p.atual[i]));
      const chute = combinam.length ? combinam[Math.floor(aleatorio() * combinam.length)] : L.normalizar(p.resposta);
      [...chute].forEach((l, i) => {
        p = L.escrever(p, i, l);
      });
      const r = L.enviar(p, dic);
      assert.ok(r.ok, `chute recusado: ${r.motivo}`);
      assert.equal(r.avaliacao.filter((e) => e === "certa").length >= fixas.size, true);
      p = r.partida;
    }
    assert.ok(p.fim, "partida não terminou");
    assert.ok(p.dicas.length <= L.MAX_DICAS);
    assert.ok(p.linhas.length <= L.TENTATIVAS);
  }
});

// ---------- Palavra do dia ----------

teste("palavra do dia: n.º 1 em 7/11/2026 e muda à meia-noite de Brasília", () => {
  assert.equal(L.numeroDoDia(new Date("2026-11-07T12:00:00-03:00")), 1);
  assert.equal(L.numeroDoDia(new Date("2026-11-07T23:59:00-03:00")), 1);
  assert.equal(L.numeroDoDia(new Date("2026-11-08T00:00:30-03:00")), 2);
  // 01:00 UTC do dia 8 ainda é dia 7 em Brasília
  assert.equal(L.numeroDoDia(new Date("2026-11-08T01:00:00Z")), 1);
  assert.equal(L.numeroDoDia(new Date("2027-11-07T12:00:00-03:00")), 366);
  assert.equal(L.numeroDoDia(new Date("2026-01-01T12:00:00-03:00")), 1);
  assert.equal(L.msAteProximaPalavra(new Date("2026-11-07T23:00:00-03:00")), 3600000);
});

teste("palavra do dia é a mesma para todos e dá a volta na lista", () => {
  assert.equal(L.respostaDoDia(dic, 1), dic.respostas[0]);
  assert.equal(L.respostaDoDia(dic, 2), dic.respostas[1]);
  assert.equal(L.respostaDoDia(dic, dic.respostas.length + 1), dic.respostas[0]);
});

teste("treino evita a palavra pedida", () => {
  const aleatorio = L.aleatorioComSemente(3);
  for (let i = 0; i < 200; i++) assert.notEqual(L.sortearTreino(dic, aleatorio, [dic.respostas[0]]), dic.respostas[0]);
});

// ---------- Compartilhar e partida salva ----------

teste("texto para compartilhar com quadrados e dicas, sem revelar letras", () => {
  // A dica prende o C na 1ª posição: digitar "porta" por cima dá "corta"
  let q = L.aplicarDica(L.novaPartida("dia", "carta", 12), 0).partida;
  q = digitar(q, "porta");
  assert.equal(q.atual.join(""), "corta");
  q = L.enviar(q, dic).partida;
  q = L.enviar(digitar(q, "carta"), dic).partida;
  const texto = L.textoCompartilhar(q);
  assert.equal(texto.split("\n")[0], "Desvenda n.º 12 · 2/6 · 💡 1 dica");
  assert.equal(texto.split("\n")[1], "🟩⬛🟩🟩🟩");
  assert.equal(texto.split("\n")[2], "🟩🟩🟩🟩🟩");
  assert.ok(!/carta|corta/i.test(texto));
});

teste("partida salva volta igual; corrompida é recusada", () => {
  // "carta" é uma das respostas; dica no T e um chute aceito ("corta")
  assert.ok(dic.respostas.includes("carta"));
  let base = L.aplicarDica(L.novaPartida("dia", "carta", 1), 3).partida;
  base = L.enviar(digitar(base, "corta"), dic).partida;
  assert.deepEqual(base.atual, ["", "", "", "t", ""]);
  assert.deepEqual(L.restaurar(L.paraSalvar(base), dic), base);

  const bom = JSON.parse(L.paraSalvar(base));
  const ruins = [
    "{quebrado",
    JSON.stringify({ ...bom, modo: "outro" }),
    JSON.stringify({ ...bom, resposta: "zzzzz" }),
    JSON.stringify({ ...bom, linhas: ["xxxxx"] }),
    JSON.stringify({ ...bom, dicas: [{ pos: 2, letra: "#" }] }),
    JSON.stringify({ ...bom, dicas: [{ pos: 0, letra: "a" }, { pos: 1, letra: "b" }, { pos: 2, letra: "c" }] }),
    JSON.stringify({ ...bom, linhas: Array(7).fill("porta") }),
  ];
  for (const r of ruins) assert.equal(L.restaurar(r, dic), null, r);
  assert.equal(L.restaurar(null, dic), null);
});

teste("partida salva já terminada volta terminada", () => {
  let p = L.novaPartida("treino", "carta");
  p = L.enviar(digitar(p, "carta"), dic).partida;
  assert.equal(L.restaurar(L.paraSalvar(p), dic).fim, "vitoria");
  // Chute depois do acerto é impossível
  const errado = JSON.stringify({ modo: "treino", numero: 0, resposta: "carta", linhas: ["carta", "porta"], dicas: [] });
  assert.equal(L.restaurar(errado, dic), null);
});

// ---------- Estatísticas ----------

teste("estatísticas: vitórias, distribuição, sem dica e sequência", () => {
  let est = L.estatisticasVazias();
  const ganha = (modo, numero, linhas, dicas = 0) => ({ modo, numero, linhas: Array(linhas).fill("x"), dicas: Array(dicas).fill({}) });
  est = L.registrarResultado(est, ganha("dia", 1, 3), true);
  est = L.registrarResultado(est, ganha("dia", 2, 4, 1), true);
  assert.equal(est.sequencia, 2);
  assert.equal(est.semDica, 1);
  assert.deepEqual(est.distribuicao, [0, 0, 1, 1, 0, 0]);
  // Pulou o dia 3: a sequência recomeça
  est = L.registrarResultado(est, ganha("dia", 4, 2), true);
  assert.equal(est.sequencia, 1);
  assert.equal(est.melhorSequencia, 2);
  est = L.registrarResultado(est, ganha("dia", 5, 6), false);
  assert.equal(est.sequencia, 0);
  assert.equal(est.jogos, 4);
  assert.equal(est.vitorias, 3);
  assert.equal(L.sequenciaAtual({ ...est, sequencia: 3, ultimoNumero: 5 }, "dia", 7), 0);
  assert.equal(L.sequenciaAtual({ ...est, sequencia: 3, ultimoNumero: 6 }, "dia", 7), 3);
  // Lida de volta igual; valores impossíveis viram estatística vazia
  assert.deepEqual(L.lerEstatisticas(JSON.stringify(est)), est);
  assert.deepEqual(L.lerEstatisticas('{"jogos":1,"vitorias":5}'), L.estatisticasVazias());
  assert.deepEqual(L.lerEstatisticas("lixo"), L.estatisticasVazias());
});

let falhas = 0;
for (const [nome, fn] of testes) {
  try {
    fn();
  } catch (erro) {
    falhas++;
    console.error(`FALHA ${nome}\n${erro.stack}`);
  }
}
if (falhas) {
  console.error(`\n${testes.length - falhas}/${testes.length} testes passaram`);
  process.exit(1);
}
console.log(`desvenda: todos os testes passaram (${testes.length})`);
