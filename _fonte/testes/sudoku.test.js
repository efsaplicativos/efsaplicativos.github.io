"use strict";
// Mesmos casos de app/src/test/.../logica/{Resolvedor,Gerador,Validador,Jogo}Test.kt do app Sudoku Master.
const assert = require("node:assert/strict");
const S = require("../../assets/jogos/sudoku-logica.js");

function semente(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Exemplos.kt
const ENUNCIADO = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const SOLUCAO = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
const DIFICIL = "800000000003600000070090200050007000000045700000100030001000068008500010090000400";
const SOLUCAO_DIFICIL = "812753649943682175675491283154237896369845721287169534521974368438526917796318452";
const exemplo = (nivel = S.NIVEIS.facil) =>
  S.novoJogo(nivel, { enunciado: S.deTexto(ENUNCIADO), solucao: S.deTexto(SOLUCAO) });

const vazia = S.indice(0, 2); // solução: 4
const solucao = S.deTexto(SOLUCAO);

function acharRetanguloTrocavel(g) {
  for (let l1 = 0; l1 < 9; l1++)
    for (let l2 = l1 + 1; l2 < 9; l2++) {
      if (Math.floor(l1 / 3) !== Math.floor(l2 / 3)) continue;
      for (let c1 = 0; c1 < 9; c1++)
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          const a = g[S.indice(l1, c1)];
          const b = g[S.indice(l1, c2)];
          if (g[S.indice(l2, c1)] === b && g[S.indice(l2, c2)] === a) {
            return [S.indice(l1, c1), S.indice(l1, c2), S.indice(l2, c1), S.indice(l2, c2)];
          }
        }
    }
  throw new Error("Nenhum retângulo trocável");
}

const testes = {
  // ---------- Resolvedor ----------
  "resolve jogo conhecido"() {
    assert.equal(S.paraTexto(S.resolver(S.deTexto(ENUNCIADO))), SOLUCAO);
  },
  "resolve jogo muito difícil e confirma solução única"() {
    assert.equal(S.paraTexto(S.resolver(S.deTexto(DIFICIL))), SOLUCAO_DIFICIL);
    assert.ok(S.temSolucaoUnica(S.deTexto(DIFICIL)));
  },
  "não altera a grade recebida"() {
    const grade = S.deTexto(ENUNCIADO);
    S.resolver(grade);
    S.contarSolucoes(grade);
    assert.equal(S.paraTexto(grade), ENUNCIADO);
  },
  "grade vazia tem várias soluções"() {
    assert.equal(S.contarSolucoes(new Array(81).fill(0), 2), 2);
    assert.equal(S.temSolucaoUnica(new Array(81).fill(0)), false);
  },
  "retângulo trocável vazio dá duas soluções"() {
    const grade = S.deTexto(SOLUCAO);
    for (const i of acharRetanguloTrocavel(grade)) grade[i] = 0;
    assert.equal(S.contarSolucoes(grade, 5), 2);
  },
  "números repetidos no enunciado não têm solução"() {
    const grade = S.deTexto(ENUNCIADO);
    grade[2] = 5;
    assert.equal(S.resolver(grade), null);
    assert.equal(S.contarSolucoes(grade), 0);
  },
  "jogo sem saída não tem solução"() {
    const grade = new Array(81).fill(0);
    for (let c = 0; c < 8; c++) grade[c] = c + 1;
    grade[S.indice(5, 8)] = 9;
    assert.equal(S.resolver(grade), null);
  },
  "grade completa aleatória é válida e varia"() {
    const aleatorio = semente(42);
    const a = S.gradeCompletaAleatoria(aleatorio);
    const b = S.gradeCompletaAleatoria(aleatorio);
    assert.ok(S.estaResolvido(a));
    assert.ok(S.estaResolvido(b));
    assert.notEqual(S.paraTexto(a), S.paraTexto(b));
  },

  // ---------- Gerador ----------
  "todos os níveis geram jogos com solução única"() {
    for (const nivel of Object.values(S.NIVEIS)) {
      for (let s = 0; s < 5; s++) {
        const puzzle = S.gerar(nivel, semente(s * 31 + nivel.casasVazias));
        const id = `${nivel.id}/${s}`;
        assert.ok(S.estaResolvido(puzzle.solucao), `${id}: solução inválida`);
        assert.equal(S.contarSolucoes(puzzle.enunciado, 2), 1, `${id}: mais de uma solução`);
        puzzle.enunciado.forEach((pista, i) => assert.ok(pista === 0 || pista === puzzle.solucao[i]));
        assert.equal(puzzle.enunciado.filter((v) => v === 0).length, nivel.casasVazias, `${id}: casas vazias`);
      }
    }
  },
  "a solução guardada é a que o resolvedor encontra"() {
    const puzzle = S.gerar(S.NIVEIS.dificil, semente(7));
    assert.deepEqual(S.resolver(puzzle.enunciado), puzzle.solucao);
  },
  "sementes diferentes geram jogos diferentes"() {
    const a = S.gerar(S.NIVEIS.medio, semente(1));
    const b = S.gerar(S.NIVEIS.medio, semente(2));
    assert.notEqual(S.paraTexto(a.enunciado), S.paraTexto(b.enunciado));
  },
  "geração do Difícil é rápida"() {
    const inicio = performance.now();
    for (let s = 0; s < 10; s++) S.gerar(S.NIVEIS.dificil, semente(100 + s));
    const media = (performance.now() - inicio) / 10;
    console.log(`     geração difícil: média de ${media.toFixed(0)} ms`);
    assert.ok(media < 2000, `geração lenta demais: ${media} ms`);
  },

  // ---------- Validador ----------
  "enunciado e solução não têm conflitos"() {
    assert.equal(S.conflitos(S.deTexto(ENUNCIADO)).size, 0);
    assert.equal(S.conflitos(solucao).size, 0);
  },
  "detecta repetição na linha, na coluna e no bloco"() {
    const casos = [
      [S.indice(0, 2), 7, S.indice(0, 4)],
      [S.indice(2, 0), 4, S.indice(4, 0)],
      [S.indice(1, 2), 3, S.indice(0, 1)],
    ];
    for (const [casa, valor, outra] of casos) {
      const g = S.deTexto(ENUNCIADO);
      g[casa] = valor;
      assert.deepEqual([...S.conflitos(g)].sort((a, b) => a - b), [casa, outra].sort((a, b) => a - b));
    }
  },
  "pode colocar respeita linha, coluna e bloco"() {
    const g = S.deTexto(ENUNCIADO);
    assert.ok(S.podeColocar(g, vazia, 4));
    assert.equal(S.podeColocar(g, vazia, 5), false);
    assert.equal(S.podeColocar(g, vazia, 8), false);
    assert.equal(S.podeColocar(g, vazia, 9), false);
  },
  "está resolvido só com grade completa e válida"() {
    assert.ok(S.estaResolvido(solucao));
    assert.equal(S.estaResolvido(S.deTexto(ENUNCIADO)), false);
    const trocada = solucao.slice();
    [trocada[0], trocada[1]] = [solucao[1], solucao[0]];
    assert.equal(S.estaResolvido(trocada), false);
  },
  "cada casa tem 20 vizinhas"() {
    S.VIZINHAS.forEach((v) => assert.equal(v.length, 20));
    assert.equal(S.saoVizinhas(0, 80), false);
    assert.ok(S.saoVizinhas(0, 20));
    assert.equal(S.saoVizinhas(5, 5), false);
  },

  // ---------- Partida ----------
  "número certo não conta erro e trava a casa"() {
    const jogo = S.colocar(exemplo(), vazia, 4);
    assert.equal(jogo.erros, 0);
    assert.ok(S.correta(jogo, vazia));
    assert.equal(S.editavel(jogo, vazia), false);
    assert.equal(S.apagar(jogo, vazia), jogo);
    assert.equal(S.colocar(jogo, vazia, 1), jogo);
  },
  "número errado conta erro uma vez e pode ser trocado"() {
    let jogo = S.colocar(exemplo(), vazia, 1);
    assert.equal(jogo.erros, 1);
    assert.ok(S.errada(jogo, vazia));
    jogo = S.colocar(jogo, vazia, 1);
    assert.equal(jogo.erros, 1);
    jogo = S.colocar(jogo, vazia, 2);
    assert.equal(jogo.erros, 2);
    jogo = S.apagar(jogo, vazia);
    assert.equal(jogo.valores[vazia], 0);
    assert.equal(jogo.erros, 2);
  },
  "casa do enunciado não muda"() {
    const jogo = exemplo();
    assert.equal(S.colocar(jogo, 0, 1), jogo);
    assert.equal(S.alternarNota(jogo, 0, 1), jogo);
    assert.equal(S.apagar(jogo, 0), jogo);
    assert.equal(S.aplicarDica(jogo, 0), jogo);
  },
  "notas ligam, desligam e são apagadas"() {
    let jogo = S.alternarNota(S.alternarNota(exemplo(), vazia, 1), vazia, 4);
    assert.ok(S.temNota(jogo, vazia, 1));
    assert.ok(S.temNota(jogo, vazia, 4));
    jogo = S.alternarNota(jogo, vazia, 1);
    assert.equal(S.temNota(jogo, vazia, 1), false);
    jogo = S.apagar(jogo, vazia);
    assert.equal(jogo.notas[vazia], 0);
  },
  "colocar número certo tira a nota das vizinhas"() {
    const vizinha = S.indice(0, 3);
    const longe = S.indice(8, 6);
    let jogo = S.alternarNota(S.alternarNota(exemplo(), vizinha, 4), vizinha, 2);
    jogo = { ...jogo, notas: jogo.notas.map((n, i) => (i === longe ? 1 << 4 : n)) };
    jogo = S.colocar(jogo, vazia, 4);
    assert.equal(S.temNota(jogo, vizinha, 4), false);
    assert.ok(S.temNota(jogo, vizinha, 2));
    assert.ok(S.temNota(jogo, longe, 4));
  },
  "número errado não mexe nas notas das vizinhas"() {
    const vizinha = S.indice(0, 3);
    const jogo = S.colocar(S.alternarNota(exemplo(), vizinha, 1), vazia, 1);
    assert.ok(S.temNota(jogo, vizinha, 1));
  },
  "dica revela a casa e acaba depois de três"() {
    let jogo = exemplo();
    const casas = S.casasParaDica(jogo).slice(0, 4);
    jogo = S.aplicarDica(S.aplicarDica(S.aplicarDica(jogo, casas[0]), casas[1]), casas[2]);
    assert.equal(jogo.dicasUsadas, 3);
    assert.equal(S.dicasRestantes(jogo), 0);
    casas.slice(0, 3).forEach((i) => assert.equal(jogo.valores[i], solucao[i]));
    assert.equal(S.aplicarDica(jogo, casas[3]), jogo);
    assert.equal(jogo.erros, 0);
  },
  "dica corrige casa errada"() {
    const jogo = S.aplicarDica(S.colocar(exemplo(), vazia, 1), vazia);
    assert.equal(jogo.valores[vazia], 4);
    assert.equal(S.casasParaDica(jogo).includes(vazia), false);
  },
  "conclui quando todas as casas estão certas"() {
    let jogo = exemplo();
    assert.equal(S.concluido(jogo), false);
    for (const i of S.casasParaDica(jogo)) jogo = S.colocar(jogo, i, solucao[i]);
    assert.ok(S.concluido(jogo));
    assert.deepEqual([...S.numerosCompletos(jogo)], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  },
  "números completos ignoram números errados"() {
    let jogo = exemplo();
    const casasDo4 = S.casasParaDica(jogo).filter((i) => solucao[i] === 4);
    for (const i of casasDo4.slice(1)) jogo = S.colocar(jogo, i, 4);
    const outra = S.casasParaDica(jogo).find((i) => solucao[i] !== 4 && i !== casasDo4[0]);
    jogo = S.colocar(jogo, outra, 4);
    assert.equal(S.numerosCompletos(jogo).has(4), false);
    jogo = S.colocar(jogo, casasDo4[0], 4);
    assert.ok(S.numerosCompletos(jogo).has(4));
  },
  "partida salva é validada"() {
    const jogo = S.colocar(exemplo(), vazia, 1);
    assert.ok(S.jogoValido(JSON.parse(JSON.stringify(jogo))));
    assert.equal(S.jogoValido({ ...jogo, nivel: "insano" }), false);
    assert.equal(S.jogoValido({ ...jogo, valores: jogo.valores.map((v, i) => (i === 0 ? 9 : v)) }), false);
    assert.equal(S.jogoValido({ ...jogo, solucao: jogo.enunciado }), false);
    assert.equal(S.jogoValido(null), false);
  },

  // ---------- Recordes ----------
  "recordes guardam os 10 melhores tempos e dizem a posição"() {
    let lista = [];
    for (let s = 1; s <= 10; s++) lista = S.inserirRecorde(lista, { segundos: s * 10, data: s }).lista;
    const melhor = S.inserirRecorde(lista, { segundos: 5, data: 99 });
    assert.equal(melhor.posicao, 0);
    assert.equal(melhor.lista.length, 10);
    assert.equal(melhor.lista.at(-1).segundos, 90);
    assert.equal(S.inserirRecorde(lista, { segundos: 500, data: 99 }).posicao, -1);
    // Empate com o recorde: o mais antigo fica na frente
    assert.equal(S.inserirRecorde(lista, { segundos: 10, data: 99 }).posicao, 1);
    assert.deepEqual(S.lerRecordes([{ segundos: 0, data: 1 }, { segundos: 30, data: 2 }, "x"]), [{ segundos: 30, data: 2 }]);
  },
  "formata o tempo"() {
    assert.equal(S.formatarTempo(307), "05:07");
    assert.equal(S.formatarTempo(3723), "1:02:03");
  },
};

let falhas = 0;
for (const [nome, teste] of Object.entries(testes)) {
  try {
    teste();
    console.log(`ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`FALHOU ${nome}\n${erro.stack}`);
  }
}
console.log(`\n${Object.keys(testes).length - falhas} de ${Object.keys(testes).length} testes passaram`);
if (falhas) process.exit(1);
