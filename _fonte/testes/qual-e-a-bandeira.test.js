"use strict";
/* Os mesmos casos de GeradorPerguntasTest, PontuacaoTest e CatalogoPaisesTest do app Qual a Bandeira. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../../assets/jogos/qual-e-a-bandeira-logica.js");

const testes = [];
const teste = (nome, fn) => testes.push([nome, fn]);

// ---------- Catálogo ----------

teste("mesmos 193 países e dificuldades do app", () => {
  assert.equal(L.PAISES.length, 193);
  assert.equal(L.PAISES.filter((p) => p.dificuldade === 1).length, 34);
  assert.equal(L.PAISES.filter((p) => p.dificuldade === 2).length, 79);
  assert.equal(L.PAISES.filter((p) => p.dificuldade === 3).length, 80);
  assert.equal(new Set(L.PAISES.map((p) => p.codigo)).size, 193);
  assert.ok(L.PAISES.every((p) => /^[A-Z]{2}$/.test(p.codigo)));
});

teste("todo país tem nome em português, sem nomes repetidos", () => {
  const nomes = L.PAISES.map((p) => p.nome);
  assert.ok(nomes.every((n) => n.trim().length > 0));
  // Duas opções com o mesmo texto tornariam a pergunta impossível
  assert.equal(new Set(nomes).size, nomes.length);
  assert.equal(L.pais("BR").nome, "Brasil");
  assert.equal(L.pais("SZ").nome, "Essuatíni");
  assert.equal(L.pais("MG").nome, "Madagascar");
  assert.equal(L.pais("MK").nome, "Macedônia do Norte");
});

teste("cada país tem a imagem da bandeira", () => {
  const pasta = path.join(__dirname, "../../assets/jogos/qual-e-a-bandeira/bandeiras");
  for (const p of L.PAISES) {
    assert.ok(fs.existsSync(path.join(pasta, `${p.codigo.toLowerCase()}.webp`)), `falta bandeira de ${p.codigo}`);
  }
});

// ---------- Perguntas ----------

teste("opções são 4 países distintos e incluem a resposta certa", () => {
  for (let semente = 0; semente < 20; semente++) {
    const aleatorio = L.aleatorioComSemente(semente);
    for (let numero = 1; numero <= 60; numero++) {
      const p = L.gerarPergunta(numero, [], aleatorio);
      assert.equal(p.opcoes.length, 4);
      assert.equal(new Set(p.opcoes.map((o) => o.codigo)).size, 4);
      assert.ok(p.opcoes.includes(p.correta));
    }
  }
});

teste("nível segue o número da pergunta", () => {
  assert.equal(L.nivelDaPergunta(1), "facil");
  assert.equal(L.nivelDaPergunta(10), "facil");
  assert.equal(L.nivelDaPergunta(11), "medio");
  assert.equal(L.nivelDaPergunta(20), "medio");
  assert.equal(L.nivelDaPergunta(21), "dificil");
  assert.equal(L.nivelDaPergunta(30), "dificil");
  assert.equal(L.nivelDaPergunta(31), "misto");
});

teste("nas três primeiras faixas a bandeira e as opções erradas são da mesma dificuldade", () => {
  const aleatorio = L.aleatorioComSemente(7);
  for (let numero = 1; numero <= 30; numero++) {
    const esperado = Math.floor((numero - 1) / 10) + 1;
    for (let i = 0; i < 10; i++) {
      const p = L.gerarPergunta(numero, [], aleatorio);
      assert.equal(p.correta.dificuldade, esperado);
      assert.ok(p.opcoes.every((o) => o.dificuldade === esperado));
    }
  }
});

teste("depois da 30ª as erradas preferem a dificuldade da certa", () => {
  const aleatorio = L.aleatorioComSemente(3);
  for (let i = 0; i < 200; i++) {
    const p = L.gerarPergunta(40, [], aleatorio);
    assert.ok(p.opcoes.every((o) => o.dificuldade === p.correta.dificuldade));
  }
});

teste("a mesma bandeira não se repete numa partida enquanto houver países inéditos", () => {
  for (let semente = 0; semente < 10; semente++) {
    const aleatorio = L.aleatorioComSemente(semente);
    let partida = L.novaPartida();
    const vistas = [];
    // 193 perguntas: todos os países aparecem exatamente uma vez
    for (let i = 0; i < L.PAISES.length; i++) {
      const p = L.gerarPergunta(partida.numeroPergunta, partida.perguntadas, aleatorio);
      vistas.push(p.correta.codigo);
      partida = L.proximaRodada(L.comPergunta(partida, p));
    }
    assert.equal(new Set(vistas).size, L.PAISES.length);
  }
});

teste("quando todos já saíram continua gerando e evita os 20 mais recentes", () => {
  const embaralhar = L.aleatorioComSemente(1);
  const todas = L.PAISES.map((p) => p.codigo).sort(() => embaralhar() - 0.5);
  const aleatorio = L.aleatorioComSemente(11);
  for (let i = 0; i < 100; i++) {
    const p = L.gerarPergunta(250, todas, aleatorio);
    assert.ok(!todas.slice(-20).includes(p.correta.codigo));
    assert.ok(p.opcoes.includes(p.correta));
  }
});

teste("não repete as bandeiras já vistas ao retomar uma partida salva", () => {
  const vistas = L.PAISES.filter((p) => p.dificuldade === 1).slice(0, 9).map((p) => p.codigo);
  const aleatorio = L.aleatorioComSemente(5);
  for (let i = 0; i < 50; i++) {
    assert.ok(!vistas.includes(L.gerarPergunta(10, vistas, aleatorio).correta.codigo));
  }
});

// ---------- Pontuação e partida ----------

teste("pontos seguem 10 × dificuldade × multiplicador da sequência", () => {
  assert.equal(L.pontosDoAcerto(1, 0), 10);
  assert.equal(L.pontosDoAcerto(1, 1), 15);
  assert.equal(L.pontosDoAcerto(1, 2), 20);
  assert.equal(L.pontosDoAcerto(1, 3), 25);
  assert.equal(L.pontosDoAcerto(1, 4), 30);
  assert.equal(L.pontosDoAcerto(1, 50), 30);
  assert.equal(L.pontosDoAcerto(3, 1), 45);
  assert.equal(L.pontosDoAcerto(3, 4), 90);
  assert.equal(L.multiplicador(0), 1);
  assert.equal(L.multiplicador(3), 2.5);
  assert.equal(L.multiplicador(9), 3);
});

const brasil = { codigo: "BR", dificuldade: 1, nome: "Brasil" };
const chile = { codigo: "CL", dificuldade: 2, nome: "Chile" };
const pergunta = { correta: brasil, opcoes: [brasil, chile] };

teste("acerto soma pontos e aumenta a sequência sem tirar vida", () => {
  const r = L.responder({ ...L.novaPartida(), pontos: 40, sequencia: 2 }, pergunta, "BR");
  assert.ok(r.acertou);
  assert.equal(r.pontosGanhos, 20);
  assert.equal(r.partida.pontos, 60);
  assert.equal(r.partida.sequencia, 3);
  assert.equal(r.partida.vidas, 3);
});

teste("erro tira uma vida e zera a sequência sem mexer nos pontos", () => {
  const r = L.responder({ ...L.novaPartida(), pontos: 40, sequencia: 5, vidas: 2 }, pergunta, "CL");
  assert.ok(!r.acertou);
  assert.equal(r.pontosGanhos, 0);
  assert.equal(r.partida.pontos, 40);
  assert.equal(r.partida.sequencia, 0);
  assert.equal(r.partida.vidas, 1);
  assert.ok(!L.terminou(r.partida));
});

teste("terceiro erro termina a partida e as vidas nunca ficam negativas", () => {
  let partida = L.novaPartida();
  for (let i = 0; i < 3; i++) partida = L.responder(partida, pergunta, "CL").partida;
  assert.equal(partida.vidas, 0);
  assert.ok(L.terminou(partida));
  assert.equal(L.responder(partida, pergunta, "CL").partida.vidas, 0);
});

teste("partida nova começa zerada", () => {
  assert.deepEqual(L.novaPartida(), { pontos: 0, vidas: 3, sequencia: 0, numeroPergunta: 1, perguntadas: [] });
});

teste("o que se grava após responder retoma na pergunta seguinte", () => {
  const partida = { pontos: 70, vidas: 2, sequencia: 1, numeroPergunta: 8, perguntadas: ["BR", "FR"] };
  const salva = L.paraSalvar(partida);
  assert.equal(salva.questionNumber, 9);
  assert.deepEqual(L.lerSalva(JSON.stringify(salva)), { ...partida, numeroPergunta: 9 });
});

teste("partida gravada malformada ou impossível é ignorada", () => {
  assert.equal(L.lerSalva(null), null);
  assert.equal(L.lerSalva("{quebrado"), null);
  assert.equal(L.lerSalva('{"score":10,"lives":0,"questionNumber":3}'), null);
  assert.equal(L.lerSalva('{"score":-1,"lives":2,"questionNumber":3}'), null);
  assert.equal(L.lerSalva('{"score":10,"lives":4,"questionNumber":3}'), null);
  assert.equal(L.lerSalva('{"score":10,"lives":2,"questionNumber":0}'), null);
  // Sem sequência gravada vale 0; códigos desconhecidos são descartados
  assert.deepEqual(L.lerSalva('{"score":10,"lives":2,"questionNumber":3,"asked":["BR","XX",5]}'), {
    pontos: 10,
    vidas: 2,
    sequencia: 0,
    numeroPergunta: 3,
    perguntadas: ["BR"],
  });
});

let falhas = 0;
for (const [nome, fn] of testes) {
  try {
    fn();
    console.log(`ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`FALHA ${nome}\n${erro.stack}`);
  }
}
console.log(`\n${testes.length - falhas}/${testes.length} testes passaram`);
if (falhas) process.exit(1);
