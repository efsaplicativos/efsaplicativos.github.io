"use strict";
/* Testes do Caça-palavras: temas, grade, seleção, dica, partida salva e recordes. */
const assert = require("node:assert/strict");
const L = require("../../assets/jogos/caca-palavras-logica.js");

const testes = [];
const teste = (nome, fn) => testes.push([nome, fn]);

/** Monta uma partida com semente, para o teste ser sempre igual. */
const partidaCom = (nivel, tema, semente = 7) => L.novaPartida(nivel, tema, L.aleatorioComSemente(semente));

// ---------- Temas ----------

teste("temas: palavras só com letras, sem repetir e com 3 a 12 letras", () => {
  assert.ok(L.IDS_TEMAS.length >= 15);
  for (const id of L.IDS_TEMAS) {
    const palavras = L.palavrasDoTema(id);
    const chaves = palavras.map((p) => p.chave);
    assert.equal(new Set(chaves).size, chaves.length, `${id}: palavra repetida`);
    for (const p of palavras) {
      assert.match(p.chave, /^[A-Z]{3,12}$/, `${id}: ${p.texto}`);
      assert.equal(p.texto, p.texto.toLocaleLowerCase("pt-BR"), `${id}: ${p.texto} devia estar em minúsculas`);
    }
  }
});

teste("cada tema tem palavras suficientes para os três níveis", () => {
  for (const id of L.IDS_TEMAS) {
    const chaves = L.palavrasDoTema(id).map((p) => p.chave);
    for (const nivel of Object.values(L.NIVEIS)) {
      const cabem = chaves.filter((c) => c.length <= nivel.lado);
      assert.ok(cabem.length >= nivel.palavras + 6, `${id} no ${nivel.id}: só ${cabem.length}`);
    }
  }
});

teste("normalizar tira acento e cedilha", () => {
  assert.equal(L.normalizar("maçã"), "MACA");
  assert.equal(L.normalizar("pêssego"), "PESSEGO");
  assert.equal(L.normalizar("ônibus"), "ONIBUS");
  assert.equal(L.normalizar("constelação"), "CONSTELACAO");
});

// ---------- Grade ----------

teste("a grade tem o tamanho do nível e as palavras estão nas casas indicadas", () => {
  for (const nivel of L.ORDEM_NIVEIS) {
    const p = partidaCom(nivel, "frutas");
    const { lado, palavras } = L.NIVEIS[nivel];
    assert.equal(p.lado, lado);
    assert.equal(p.letras.length, lado * lado);
    assert.match(p.letras, /^[A-Z]+$/);
    assert.equal(p.palavras.length, palavras);
    for (const w of p.palavras) {
      assert.equal(w.celulas.map((c) => p.letras[c]).join(""), w.chave);
      assert.deepEqual(L.celulasEntre(lado, w.celulas[0], w.celulas.at(-1)), w.celulas);
    }
  }
});

teste("cada nível só usa as suas direções", () => {
  const direcao = (lado, w) => {
    const [a, b] = [w.celulas[0], w.celulas[1]];
    return [Math.floor(b / lado) - Math.floor(a / lado), (b % lado) - (a % lado)].join();
  };
  for (const nivel of L.ORDEM_NIVEIS) {
    const permitidas = new Set(L.NIVEIS[nivel].direcoes.map((d) => d.join()));
    const usadas = new Set();
    for (let s = 1; s <= 40; s++) {
      const p = partidaCom(nivel, L.IDS_TEMAS[s % L.IDS_TEMAS.length], s);
      for (const w of p.palavras) {
        const d = direcao(p.lado, w);
        assert.ok(permitidas.has(d), `${nivel}: direção ${d} não permitida`);
        usadas.add(d);
      }
    }
    // Com 40 grades, todas as direções do nível aparecem
    assert.equal(usadas.size, permitidas.size, `${nivel}: só ${[...usadas]}`);
  }
});

teste("toda palavra aparece uma vez só, em 300 grades de todos os temas e níveis", () => {
  for (let s = 1; s <= 300; s++) {
    const nivel = L.ORDEM_NIVEIS[s % 3];
    const tema = L.IDS_TEMAS[s % L.IDS_TEMAS.length];
    const p = partidaCom(nivel, tema, s);
    assert.equal(p.tema, tema);
    const chaves = p.palavras.map((w) => w.chave);
    assert.equal(new Set(chaves).size, chaves.length);
    for (const w of p.palavras) assert.equal(L.ocorrencias(p.letras, p.lado, w.chave), 1, `${tema} ${nivel} semente ${s}: ${w.chave}`);
    // Nenhuma palavra fica dentro de outra
    for (const a of chaves) for (const b of chaves) if (a !== b) assert.ok(!a.includes(b), `${b} dentro de ${a}`);
  }
});

teste("toda grade tem a mistura de direções do nível, em 300 grades de cada", () => {
  for (const nivel of L.ORDEM_NIVEIS) {
    const { minimos } = L.NIVEIS[nivel];
    for (let s = 1; s <= 300; s++) {
      const p = partidaCom(nivel, L.IDS_TEMAS[s % L.IDS_TEMAS.length], s * 13);
      const conta = L.contarTipos(p.lado, p.palavras);
      for (const [tipo, n] of Object.entries(minimos)) {
        assert.ok(conta[tipo] >= n, `${nivel} semente ${s}: ${conta[tipo]} ${tipo}, mínimo ${n}`);
      }
      if (nivel !== "dificil") assert.equal(conta.invertida, 0, `${nivel} não tem palavras invertidas`);
    }
  }
  // O difícil exige diagonais e invertidas
  assert.ok(L.NIVEIS.dificil.minimos.diagonal >= 3 && L.NIVEIS.dificil.minimos.invertida >= 3);
});

teste("contarTipos separa horizontal, vertical, diagonal e invertida", () => {
  const lado = 12;
  const em = (l, c) => l * lado + c;
  const palavras = [
    { celulas: [em(0, 0), em(0, 1)] }, // →
    { celulas: [em(0, 5), em(0, 4)] }, // ← invertida
    { celulas: [em(1, 0), em(2, 0)] }, // ↓
    { celulas: [em(5, 0), em(4, 0)] }, // ↑ invertida
    { celulas: [em(0, 0), em(1, 1)] }, // ↘
    { celulas: [em(5, 0), em(4, 1)] }, // ↗
    { celulas: [em(5, 5), em(4, 4)] }, // ↖ invertida
    { celulas: [em(0, 5), em(1, 4)] }, // ↙ invertida
  ];
  assert.deepEqual(L.contarTipos(lado, palavras), { horizontal: 2, vertical: 2, diagonal: 4, invertida: 4 });
});

teste("a mesma semente dá a mesma grade, e o tema vazio é sorteado", () => {
  assert.deepEqual(partidaCom("medio", "cores", 42), partidaCom("medio", "cores", 42));
  const p = partidaCom("facil", "", 5);
  assert.ok(L.temaValido(p.tema));
  assert.equal(p.temaEscolhido, false);
  assert.equal(partidaCom("facil", "cores").temaEscolhido, true);
  assert.equal(partidaCom("nivel-que-nao-existe", "cores").nivel, "facil");
});

teste("lista de palavras em ordem alfabética", () => {
  const p = partidaCom("dificil", "animais", 3);
  const chaves = p.palavras.map((w) => w.chave);
  assert.deepEqual(chaves, [...chaves].sort((a, b) => a.localeCompare(b)));
});

// ---------- Seleção ----------

teste("celulasEntre: horizontal, vertical, diagonal e torta", () => {
  assert.deepEqual(L.celulasEntre(8, 0, 3), [0, 1, 2, 3]);
  assert.deepEqual(L.celulasEntre(8, 3, 0), [3, 2, 1, 0]);
  assert.deepEqual(L.celulasEntre(8, 1, 25), [1, 9, 17, 25]);
  assert.deepEqual(L.celulasEntre(8, 0, 27), [0, 9, 18, 27]);
  assert.deepEqual(L.celulasEntre(8, 24, 3), [24, 17, 10, 3]);
  assert.equal(L.celulasEntre(8, 0, 10), null);
  assert.equal(L.celulasEntre(8, 0, 64), null);
  assert.deepEqual(L.celulasEntre(8, 5, 5), [5]);
});

teste("fimAjustado: puxa para a direção mais perto e não sai da grade", () => {
  // De (2,2) num 8×8
  const inicio = 2 * 8 + 2;
  assert.equal(L.fimAjustado(8, inicio, 2.2, 2.3), inicio);
  assert.equal(L.fimAjustado(8, inicio, 2.4, 5.1), 2 * 8 + 5); // quase na horizontal
  assert.equal(L.fimAjustado(8, inicio, 4.8, 5.2), 5 * 8 + 5); // diagonal ↘
  assert.equal(L.fimAjustado(8, inicio, 0.1, 4.1), 0 * 8 + 4); // diagonal ↗
  assert.equal(L.fimAjustado(8, inicio, 2, 30), 2 * 8 + 7); // muito para a direita: para na borda
  assert.equal(L.fimAjustado(8, inicio, 9, 9), 7 * 8 + 7); // diagonal para fora: para no canto
  assert.equal(L.fimAjustado(8, inicio, -3, 2.2), 0 * 8 + 2); // para cima
});

teste("achar palavra nos dois sentidos, recusar o resto", () => {
  let p = partidaCom("medio", "paises", 11);
  const w = p.palavras[2];
  const [a, b] = [w.celulas[0], w.celulas.at(-1)];
  // De trás para frente também vale
  let r = L.selecionar(p, b, a);
  assert.ok(r.ok);
  assert.equal(r.indice, 2);
  p = r.partida;
  assert.equal(p.palavras[2].achada, 1);
  assert.equal(L.achadas(p), 1);
  assert.deepEqual(L.selecionar(p, a, b), { ok: false, motivo: "repetida", indice: 2 });
  // Só um pedaço da palavra não conta
  assert.equal(L.selecionar(p, w.celulas[0], w.celulas.at(-2)).motivo, w.chave.length - 1 >= 3 ? "nada" : "curta");
  assert.equal(L.selecionar(p, 0, 1).motivo, "curta");
  assert.equal(L.selecionar(p, 0, p.lado + 2).motivo, "torta");
});

teste("achar todas termina a partida, com a ordem guardada", () => {
  let p = partidaCom("facil", "cores", 9);
  p.palavras.forEach((w, i) => {
    assert.ok(!L.terminou(p));
    const r = L.selecionar(p, w.celulas[0], w.celulas.at(-1));
    assert.ok(r.ok, w.chave);
    p = r.partida;
    assert.equal(p.palavras[i].achada, i + 1);
  });
  assert.ok(L.terminou(p));
  assert.equal(L.selecionar(p, 0, 2).motivo, "fim");
});

// ---------- Dica ----------

teste("dica mostra a primeira letra de uma palavra que falta e soma tempo", () => {
  let p = partidaCom("medio", "espaco", 4);
  p = { ...p, tempoMs: 10000 };
  const primeira = p.palavras[0];
  p = L.selecionar(p, primeira.celulas[0], primeira.celulas.at(-1)).partida;
  const vistas = new Set();
  for (let i = 0; i < p.palavras.length - 1; i++) {
    const d = L.darDica(p, L.aleatorioComSemente(i));
    assert.notEqual(d.indice, 0, "dica numa palavra já achada");
    assert.equal(d.celula, p.palavras[d.indice].celulas[0]);
    assert.ok(!vistas.has(d.indice), "repetiu a dica com palavras sem dica sobrando");
    vistas.add(d.indice);
    assert.equal(d.partida.dicas, p.dicas + 1);
    assert.equal(d.partida.tempoMs, p.tempoMs + L.PENALIDADE_DICA_S * 1000);
    p = d.partida;
  }
  // Todas já tiveram dica: ainda dá para pedir, numa que falta
  const d = L.darDica(p, Math.random);
  assert.ok(d && !p.palavras[d.indice].achada);
});

teste("sem dica com a partida terminada", () => {
  let p = partidaCom("facil", "frutas", 2);
  for (const w of p.palavras) p = L.selecionar(p, w.celulas[0], w.celulas.at(-1)).partida;
  assert.equal(L.darDica(p), null);
});

// ---------- Partida salva ----------

teste("salvar e restaurar devolve a mesma partida", () => {
  let p = partidaCom("dificil", "musica", 8);
  p = L.selecionar(p, p.palavras[1].celulas.at(-1), p.palavras[1].celulas[0]).partida;
  p = L.darDica(p, L.aleatorioComSemente(1)).partida;
  p = { ...p, tempoMs: 81234 };
  assert.deepEqual(L.restaurar(L.paraSalvar(p)), p);
});

teste("partida salva estragada ou adulterada volta null", () => {
  const p = partidaCom("medio", "casa", 6);
  const estragos = [
    "",
    "{",
    "null",
    JSON.stringify({ ...p, v: 2 }),
    JSON.stringify({ ...p, nivel: "impossivel" }),
    JSON.stringify({ ...p, tema: "dinossauros" }),
    JSON.stringify({ ...p, lado: 8 }),
    JSON.stringify({ ...p, letras: p.letras.slice(1) }),
    JSON.stringify({ ...p, letras: "a" + p.letras.slice(1) }),
    JSON.stringify({ ...p, palavras: p.palavras.slice(1) }),
    JSON.stringify({ ...p, dicas: -1 }),
    JSON.stringify({ ...p, tempoMs: "muito" }),
    JSON.stringify({ ...p, palavras: p.palavras.map((w, i) => (i ? w : { ...w, chave: "XYZ" })) }),
    JSON.stringify({ ...p, palavras: p.palavras.map((w, i) => (i ? w : { ...w, celulas: [...w.celulas].reverse() })) }),
    JSON.stringify({ ...p, palavras: p.palavras.map((w) => ({ ...w, achada: 1 })) }),
    JSON.stringify({ ...p, palavras: p.palavras.map((w, i) => (i ? w : { ...w, dica: "sim" })) }),
  ];
  for (const e of estragos) assert.equal(L.restaurar(e), null, e.slice(0, 60));
});

// ---------- Recordes ----------

teste("formatarTempo", () => {
  assert.equal(L.formatarTempo(0), "00:00");
  assert.equal(L.formatarTempo(75.9), "01:15");
  assert.equal(L.formatarTempo(3725), "1:02:05");
});

teste("recordes por nível, do menor tempo para o maior, até 20 por nível", () => {
  let lista = [];
  for (let i = 0; i < 25; i++) lista = L.adicionarRecorde(lista, { nivel: "facil", tempo: 100 - i, dicas: 0, dataMs: i, tema: "cores" });
  lista = L.adicionarRecorde(lista, { nivel: "dificil", tempo: 300, dicas: 2, dataMs: 1, tema: null });
  assert.equal(L.ranking(lista, "facil").length, 20);
  assert.equal(L.melhorTempo(lista, "facil"), 76);
  assert.equal(L.melhorTempo(lista, "medio"), null);
  assert.equal(L.melhorTempo(lista, "dificil"), 300);
  assert.deepEqual(L.lerRecordes(JSON.parse(JSON.stringify(lista))), lista);
  assert.deepEqual(
    L.lerRecordes([{ nivel: "x", tempo: 1, dicas: 0, dataMs: 1 }, { nivel: "facil", tempo: -1, dicas: 0, dataMs: 1 }, null, 5]),
    [],
  );
  assert.deepEqual(L.lerRecordes("lixo"), []);
});

teste("vitórias por nível ignoram valores estranhos", () => {
  assert.deepEqual(L.lerVitorias({ facil: 3, medio: -2, dificil: "9" }), { facil: 3, medio: 0, dificil: 0 });
  assert.deepEqual(L.lerVitorias(null), { facil: 0, medio: 0, dificil: 0 });
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
console.log(`caca-palavras: todos os testes passaram (${testes.length})`);
