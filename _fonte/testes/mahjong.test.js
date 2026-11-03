"use strict";
/*
 * Testes da lógica do Mahjong (assets/jogos/mahjong-logica.js), os mesmos casos de
 * PartidaTest.kt e TabuleirosTest.kt do app. Rodar com: node _fonte/testes/mahjong.test.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const M = require("../../assets/jogos/mahjong-logica.js");

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

const face = (nome) => {
  const f = M.FACES.find((item) => item.nome === nome);
  assert.ok(f, `face ${nome}`);
  return f.indice;
};
const indice = (t, x, y, z) => t.posicoes.findIndex((p) => p.x === x && p.y === y && p.z === z);
const por = (id) => M.tabuleiroPorId(id);

let total = 0;
function teste(nome, fn) {
  const inicio = Date.now();
  fn();
  total++;
  console.log(`ok - ${nome} (${Date.now() - inicio} ms)`);
}

// ---------- Regras (PartidaTest.kt) ----------

/** Fileira de 3 com uma peça em cima da do meio, e uma peça meio deslocada ao lado. */
const pequeno = M.criarTabuleiro(99, "teste", "Teste", "facil", [
  { x: 0, y: 0, z: 0 },
  { x: 2, y: 0, z: 0 },
  { x: 4, y: 0, z: 0 },
  { x: 2, y: 0, z: 1 },
  { x: 7, y: 1, z: 0 },
  { x: 0, y: 4, z: 0 },
]);

teste("regras de peça livre", () => {
  const p = M.criarPartida(pequeno, new Array(6).fill(face("1 de bambu")));
  assert.ok(M.pecaLivre(p, indice(pequeno, 0, 0, 0)), "ponta esquerda");
  assert.ok(M.pecaLivre(p, indice(pequeno, 4, 0, 0)), "ponta direita");
  assert.ok(!M.pecaLivre(p, indice(pequeno, 2, 0, 0)), "meio, coberta");
  assert.ok(M.pecaLivre(p, indice(pequeno, 2, 0, 1)), "em cima");
  // A peça em x=7 fica a meia peça de distância da fileira: não encosta
  assert.ok(M.pecaLivre(p, indice(pequeno, 7, 1, 0)), "deslocada");
  assert.ok(M.pecaLivre(p, indice(pequeno, 0, 4, 0)), "sozinha");
});

teste("peça do meio só solta quando um lado esvazia", () => {
  const t = M.criarTabuleiro(98, "fila", "Fila", "facil", [
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
    { x: 0, y: 6, z: 0 },
  ]);
  const esquerda = indice(t, 0, 0, 0);
  const meio = indice(t, 2, 0, 0);
  const direita = indice(t, 4, 0, 0);
  const sozinha = indice(t, 0, 6, 0);
  const faces = new Array(4).fill(face("Dragão verde"));
  faces[meio] = face("Vento sul");
  faces[sozinha] = face("Vento sul");
  let p = M.criarPartida(t, faces);
  assert.ok(!M.pecaLivre(p, meio));
  assert.ok(!M.formamPar(p, meio, sozinha));
  p = M.remover(p, esquerda, direita);
  assert.ok(M.pecaLivre(p, meio));
  p = M.remover(p, meio, sozinha);
  assert.ok(M.venceu(p));
});

teste("meia peça em cima também prende", () => {
  const t = M.criarTabuleiro(96, "meia", "Meia", "facil", [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 1, z: 1 },
  ]);
  const p = M.criarPartida(t, [face("Vento sul"), face("Vento sul")]);
  assert.ok(!M.pecaLivre(p, indice(t, 0, 0, 0)));
  assert.ok(M.pecaLivre(p, indice(t, 1, 1, 1)));
});

teste("estações e flores combinam entre si", () => {
  assert.ok(M.combinam(face("Primavera"), face("Inverno")));
  assert.ok(M.combinam(face("Flor de ameixa"), face("Flor de bambu")));
  assert.ok(!M.combinam(face("Primavera"), face("Flor de ameixa")));
  assert.ok(!M.combinam(face("1 de bambu"), face("2 de bambu")));
  assert.ok(M.combinam(face("9 de círculo"), face("9 de círculo")));
  assert.equal(M.FACES.length, 42);
});

teste("desfazer devolve as peças e conta a desfeita", () => {
  const t = M.TABULEIROS[0];
  const { faces, solucao } = M.distribuirComSolucao(t, semente(5));
  const inicio = M.criarPartida(t, faces);
  const depois = M.remover(inicio, solucao[0][0], solucao[0][1]);
  assert.equal(M.restantes(depois), t.totalPecas - 2);
  const desfeita = M.desfazer(depois);
  assert.deepEqual(desfeita.faces, inicio.faces);
  assert.equal(desfeita.desfeitas, 1);
  assert.equal(M.desfazer(inicio), null);
});

teste("dica mostra par válido e acaba", () => {
  let p = M.novaPartida(M.TABULEIROS[2], semente(3));
  for (let i = 0; i < M.DICAS_POR_PARTIDA; i++) {
    const { partida, par } = M.usarDica(p, semente(i));
    assert.ok(M.formamPar(partida, par[0], par[1]));
    p = partida;
  }
  assert.equal(M.dicasRestantes(p), 0);
  assert.equal(M.usarDica(p), null);
});

teste("embaralhar mantém as peças e deixa solução", () => {
  const ordenar = (faces) => faces.filter((f) => f !== null).sort((a, b) => a - b);
  for (const t of M.TABULEIROS) {
    const { faces, solucao } = M.distribuirComSolucao(t, semente(t.indice));
    let p = M.criarPartida(t, faces);
    // joga metade da solução e embaralha
    for (const [a, b] of solucao.slice(0, Math.floor(solucao.length / 2))) p = M.remover(p, a, b);
    const embaralhada = M.embaralhar(p, semente(11));
    assert.ok(embaralhada, `${t.id}: não embaralhou`);
    assert.deepEqual(ordenar(embaralhada.faces), ordenar(p.faces));
    assert.deepEqual(embaralhada.faces.map((f) => f === null), p.faces.map((f) => f === null));
    assert.equal(embaralhada.embaralhadasUsadas, 1);
    assert.ok(M.jogadasPossiveis(embaralhada).length > 0, `${t.id}: sem jogadas depois de embaralhar`);
    // Sempre que a forma da mesa permite, a nova arrumação tem solução: tenta resolver
    // com a ordem de remoção das posições ocupadas
    const ocupadas = embaralhada.faces.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
    assert.ok(M.ordemDeRemocao(t, ocupadas, semente(1)), `${t.id}: forma sem saída`);
  }
});

teste("embaralhar sem saída devolve null", () => {
  // Só sobrou uma pilha: nenhuma arrumação libera jogada
  const t = M.criarTabuleiro(97, "pilha", "Pilha", "facil", [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
  ]);
  const p = M.criarPartida(t, [face("2 de bambu"), face("2 de bambu")]);
  assert.equal(M.jogadasPossiveis(p).length, 0);
  assert.equal(M.embaralhar(p, semente(1)), null);
});

teste("embaralhadas acabam depois de duas", () => {
  let p = M.novaPartida(M.TABULEIROS[0], semente(4));
  p = M.embaralhar(p, semente(1));
  p = M.embaralhar(p, semente(2));
  assert.equal(M.embaralhadasRestantes(p), 0);
  assert.equal(M.embaralhar(p, semente(3)), null);
});

teste("recomeçar volta ao início zerado", () => {
  const t = M.TABULEIROS[4];
  const { faces, solucao } = M.distribuirComSolucao(t, semente(8));
  let p = M.remover(M.criarPartida(t, faces), solucao[0][0], solucao[0][1]);
  p = M.usarDica({ ...p, segundos: 90 }).partida;
  const r = M.recomecar(p);
  assert.deepEqual(r.faces, faces);
  assert.equal(r.segundos, 0);
  assert.equal(r.dicasUsadas, 0);
  assert.equal(r.historico.length, 0);
});

teste("pontuação e estrelas", () => {
  assert.equal(M.calcularPontos(24, 100, 0, 0, 0), 12 * 1000 + 2000 - 2 * 100);
  assert.equal(M.calcularPontos(24, 5000, 1, 1, 1), 12 * 1000 - 100 - 200 - 50);
  assert.equal(M.calcularPontos(0, 0, 50, 50, 50), 0);
  assert.equal(M.calcularEstrelas(0, 0, 0), 3);
  assert.equal(M.calcularEstrelas(1, 1, 1), 2);
  assert.equal(M.calcularEstrelas(2, 1, 1), 1);
  assert.equal(M.formatarTempo(125), "02:05");
  assert.equal(M.formatarTempo(3601), "1:00:01");
});

teste("partida salva: ida e volta e dados inválidos", () => {
  const t = por("templo-sagrado");
  const { faces, solucao } = M.distribuirComSolucao(t, semente(2));
  let p = M.criarPartida(t, faces);
  for (const [a, b] of solucao.slice(0, 5)) p = M.remover(p, a, b);
  p = M.embaralhar(M.desfazer(p), semente(4));
  p = { ...M.usarDica(p, semente(1)).partida, segundos: 321 };
  const texto = JSON.stringify(M.codificar(p));
  const volta = M.decodificar(JSON.parse(texto));
  assert.equal(volta.tabuleiro, t);
  for (const chave of ["inicial", "faces", "historico", "segundos", "dicasUsadas", "embaralhadasUsadas", "desfeitas"]) {
    assert.deepEqual(volta[chave], p[chave], chave);
  }
  assert.equal(M.decodificar(null), null);
  assert.equal(M.decodificar("lixo"), null);
  assert.equal(M.decodificar(JSON.parse(texto.replace("templo-sagrado", "nao-existe"))), null);
  const curto = JSON.parse(texto);
  curto.faces.pop();
  assert.equal(M.decodificar(curto), null);
  // Histórico apontando para uma peça que ainda está na mesa
  const errado = JSON.parse(texto);
  const presente = errado.faces.findIndex((f) => f !== null);
  errado.historico.push([presente, presente === 0 ? 1 : 0, 0, 0]);
  assert.equal(M.decodificar(errado), null);
  const negativo = JSON.parse(texto);
  negativo.segundos = -5;
  assert.equal(M.decodificar(negativo), null);
});

teste("recorde soma vitórias", () => {
  const r1 = M.somarRecorde(null, 300, 12000, 2);
  assert.deepEqual(r1, { vitorias: 1, melhorTempo: 300, melhorPontuacao: 12000, estrelas: 2 });
  const r2 = M.somarRecorde(r1, 250, 11000, 3);
  assert.deepEqual(r2, { vitorias: 2, melhorTempo: 250, melhorPontuacao: 12000, estrelas: 3 });
  assert.deepEqual(M.conquista(r1, 250, 11000), { primeiraVitoria: false, melhorTempo: true, melhorPontuacao: false });
  assert.deepEqual(M.conquista(null, 250, 11000), { primeiraVitoria: true, melhorTempo: false, melhorPontuacao: false });
  assert.deepEqual(M.validarRecordes({ "jardim-zen": r2, inexistente: r2, "ponte-simples": { vitorias: "1" } }), {
    "jardim-zen": r2,
  });
});

teste("sorteio não repete faces demais", () => {
  // Em 24 peças (12 pares de 72 possíveis) o esperado é ~0,9 face com as 4 cópias
  const t = M.TABULEIROS[0];
  let soma = 0;
  const rodadas = 1000;
  for (let s = 0; s < rodadas; s++) {
    const contagem = new Map();
    for (const f of M.distribuirComSolucao(t, semente(s)).faces) contagem.set(f, (contagem.get(f) || 0) + 1);
    soma += [...contagem.values()].filter((n) => n === 4).length;
  }
  const media = soma / rodadas;
  assert.ok(media >= 0.6 && media <= 1.2, `média ${media}`);
});

teste("partida nova tem jogada", () => {
  for (const t of M.TABULEIROS) {
    for (let s = 0; s < 20; s++) assert.ok(M.jogadasPossiveis(M.novaPartida(t, semente(s))).length > 0, t.id);
  }
});

// ---------- Tabuleiros (TabuleirosTest.kt) ----------

teste("cinco tabuleiros por dificuldade, com ids únicos", () => {
  assert.equal(M.TABULEIROS.length, 15);
  for (const d of M.DIFICULDADES) assert.equal(M.TABULEIROS.filter((t) => t.dificuldade === d.id).length, 5);
  assert.equal(new Set(M.TABULEIROS.map((t) => t.id)).size, 15);
  M.TABULEIROS.forEach((t, i) => assert.equal(t.indice, i));
  assert.equal(M.proximoTabuleiro(M.TABULEIROS[14]), M.TABULEIROS[0]);
});

teste("quantidade de peças par e crescente dentro de cada nível", () => {
  const faixas = { facil: [20, 40], medio: [50, 80], dificil: [84, 144] };
  for (const t of M.TABULEIROS) {
    assert.equal(t.totalPecas % 2, 0, `${t.id}: ${t.totalPecas} peças`);
    const [min, max] = faixas[t.dificuldade];
    assert.ok(t.totalPecas >= min && t.totalPecas <= max, `${t.id}: ${t.totalPecas}`);
  }
  for (const d of Object.keys(faixas)) {
    const contagens = M.TABULEIROS.filter((t) => t.dificuldade === d).map((t) => t.totalPecas);
    assert.deepEqual(contagens.slice().sort((a, b) => a - b), contagens, d);
  }
});

teste("cabem na tela em pé", () => {
  for (const t of M.TABULEIROS) {
    assert.ok(t.largura <= 16, `${t.id}: largura ${t.largura / 2}`);
    assert.ok(t.altura <= 20, `${t.id}: altura ${t.altura / 2}`);
  }
});

teste("peças não se sobrepõem na mesma camada", () => {
  for (const t of M.TABULEIROS) {
    const p = t.posicoes;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const sobrepoe = p[i].z === p[j].z && Math.abs(p[i].x - p[j].x) < 2 && Math.abs(p[i].y - p[j].y) < 2;
        assert.ok(!sobrepoe, `${t.id}: ${JSON.stringify(p[i])} e ${JSON.stringify(p[j])}`);
      }
    }
  }
});

teste("peças de cima estão apoiadas por inteiro", () => {
  for (const t of M.TABULEIROS) {
    const celulas = new Set();
    for (const p of t.posicoes) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) celulas.add(`${p.x + dx},${p.y + dy},${p.z}`);
    }
    for (const p of t.posicoes.filter((q) => q.z > 0)) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        assert.ok(celulas.has(`${p.x + dx},${p.y + dy},${p.z - 1}`), `${t.id}: ${JSON.stringify(p)} sem apoio`);
      }
    }
  }
});

teste("toda partida sorteada tem solução", () => {
  for (const t of M.TABULEIROS) {
    for (let s = 0; s < 25; s++) {
      const { faces, solucao } = M.distribuirComSolucao(t, semente(s * 31 + t.indice));
      let partida = M.criarPartida(t, faces);
      for (const [a, b] of solucao) partida = M.remover(partida, a, b);
      assert.ok(M.venceu(partida), `${t.id} semente ${s}`);
    }
  }
});

teste("cada face aparece no máximo quatro vezes (estações e flores, uma)", () => {
  for (const t of M.TABULEIROS) {
    const contagem = new Map();
    for (const f of M.distribuirComSolucao(t, semente(t.indice)).faces) contagem.set(f, (contagem.get(f) || 0) + 1);
    for (const [f, n] of contagem) {
      const naipe = M.FACES[f].naipe;
      const limite = naipe === "estacao" || naipe === "flor" ? 1 : 4;
      assert.ok(n <= limite, `${t.id}: ${M.FACES[f].nome} aparece ${n} vezes`);
    }
  }
});

teste("sorteio é rápido", () => {
  const inicio = Date.now();
  for (const t of M.TABULEIROS) for (let s = 0; s < 10; s++) M.distribuirComSolucao(t, semente(s));
  const ms = Date.now() - inicio;
  assert.ok(ms < 15000, `150 sorteios em ${ms} ms`);
});

teste("cada face tem a imagem do app em assets/jogos/mahjong", () => {
  const pasta = path.join(__dirname, "..", "..", "assets", "jogos", "mahjong");
  for (const f of M.FACES) assert.ok(fs.existsSync(path.join(pasta, `${f.arquivo}.webp`)), f.arquivo);
});

// Resumo, como o teste "resumo" do app
for (const t of M.TABULEIROS) {
  const p = M.novaPartida(t, semente(1));
  const livres = t.posicoes.filter((_, i) => M.pecaLivre(p, i)).length;
  console.log(
    `   ${t.id.padEnd(22)} ${t.dificuldade.padEnd(8)} ${String(t.totalPecas).padStart(3)} peças  ${t.camadas} camadas  ` +
      `livres no início: ${livres}  pares: ${M.jogadasPossiveis(p).length}`,
  );
}
console.log(`\n${total} testes passaram`);
