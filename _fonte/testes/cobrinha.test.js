"use strict";
// Regras da cobrinha (assets/jogos/cobrinha-logica.js).
const assert = require("node:assert/strict");
const C = require("../../assets/jogos/cobrinha-logica.js");

const { NIVEIS: N } = C;
const casa = (nivel, linha, coluna) => C.indice(nivel, linha, coluna);

function semente(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Monta uma partida com o corpo, a direção e a comida que o teste precisar. */
function montar(nivel, corpo, direcao, comida, pontos = 0) {
  const estado = C.restaurar({ nivel: nivel.id, corpo, direcao, comida, pontos, comidas: pontos / 10 });
  assert.ok(estado, "não conseguiu montar a partida");
  return estado;
}

const testes = {
  // ---------- Tabuleiro ----------
  "cada nível tem tabuleiro e velocidade próprios"() {
    assert.equal(N.facil.colunas, 13);
    assert.equal(N.facil.linhas, 13);
    assert.equal(C.totalDeCasas(N.facil), 169);
    assert.equal(C.totalDeCasas(N.medio), 256);
    assert.equal(C.totalDeCasas(N.dificil), 400);
    assert.ok(N.facil.intervalo > N.medio.intervalo && N.medio.intervalo > N.dificil.intervalo);
  },
  "a casa vira linha e coluna e tem nome em português"() {
    assert.equal(C.linhaDaCasa(N.facil, casa(N.facil, 2, 3)), 2);
    assert.equal(C.colunaDaCasa(N.facil, casa(N.facil, 2, 3)), 3);
    assert.equal(C.nomeDaCasa(N.facil, casa(N.facil, 2, 3)), "linha 3, coluna 4");
  },
  "sortearComida só devolve casa livre e avisa quando o tabuleiro enche"() {
    const aleatorio = semente(3);
    for (let i = 0; i < 50; i++) {
      const comida = C.sortearComida(N.facil, [0, 1, 2], aleatorio);
      assert.ok(comida >= 0 && comida < 169);
      assert.ok(![0, 1, 2].includes(comida));
    }
    const cheio = [...Array(169).keys()];
    assert.equal(C.sortearComida(N.facil, cheio, aleatorio), -1);
  },

  // ---------- Começo ----------
  "a cobra começa com três casas no meio, indo para a direita"() {
    const partida = C.iniciar(N.facil, semente(1));
    assert.equal(partida.corpo.length, C.TAMANHO_INICIAL);
    assert.equal(partida.cabeca, casa(N.facil, 6, 6));
    assert.deepEqual([...partida.corpo], [casa(N.facil, 6, 6), casa(N.facil, 6, 5), casa(N.facil, 6, 4)]);
    assert.equal(partida.direcao.id, "direita");
    assert.equal(partida.pontos, 0);
    assert.equal(partida.terminada, false);
    assert.equal(partida.vitoria, false);
    assert.ok(!partida.corpo.includes(partida.comida), "a fruta não pode nascer na cobra");
  },

  // ---------- Passos ----------
  "avancar anda uma casa e o corpo mantém o tamanho"() {
    const partida = C.iniciar(N.facil, semente(2));
    const depois = C.avancar(partida, semente(2));
    assert.equal(depois.cabeca, casa(N.facil, 6, 7));
    assert.equal(depois.corpo.length, C.TAMANHO_INICIAL);
    assert.deepEqual([...depois.corpo], [casa(N.facil, 6, 7), casa(N.facil, 6, 6), casa(N.facil, 6, 5)]);
    assert.equal(depois.pontos, 0);
  },
  "girar guarda a próxima direção e o passo seguinte a usa"() {
    const partida = C.iniciar(N.facil, semente(4));
    const virada = C.girar(partida, "cima");
    assert.equal(virada.pendente.id, "cima");
    assert.equal(virada.direcao.id, "direita");
    assert.equal(partida.direcao.id, "direita", "a partida original não muda");
    const depois = C.avancar(virada, semente(4));
    assert.equal(depois.direcao.id, "cima");
    assert.equal(depois.cabeca, casa(N.facil, 5, 6));
  },
  "não dá para voltar para trás"() {
    const partida = C.iniciar(N.facil, semente(5));
    assert.equal(C.girar(partida, "esquerda"), partida);
  },
  "não dá para virar duas vezes no mesmo passo"() {
    const partida = C.iniciar(N.facil, semente(5));
    const subiu = C.girar(partida, "cima");
    // A segunda curva é comparada com a direção do último passo (direita), não com a pendente
    assert.equal(C.girar(subiu, "esquerda"), subiu);
    assert.equal(C.girar(subiu, "baixo").pendente.id, "baixo");
  },
  "girar ignora direção desconhecida e partida terminada"() {
    const partida = C.iniciar(N.facil, semente(6));
    assert.equal(C.girar(partida, "lado"), partida);
    assert.equal(C.girar(partida, null), partida);
    assert.equal(C.girar(partida, { id: "x" }), partida);
    const morta = montar(N.facil, [casa(N.facil, 0, 0), casa(N.facil, 0, 1), casa(N.facil, 0, 2)], "esquerda", casa(N.facil, 9, 9));
    const fim = C.avancar(morta, semente(6));
    assert.ok(fim.terminada);
    assert.equal(C.girar(fim, "cima"), fim);
    assert.equal(C.avancar(fim, semente(6)), fim);
  },

  // ---------- Fruta ----------
  "comer a fruta vale pontos, faz crescer e sorteia outra"() {
    const partida = montar(N.facil, [casa(N.facil, 6, 6), casa(N.facil, 6, 5), casa(N.facil, 6, 4)], "direita", casa(N.facil, 6, 7));
    const depois = C.avancar(partida, semente(8));
    assert.equal(depois.pontos, C.PONTOS_POR_COMIDA);
    assert.equal(depois.comidas, 1);
    assert.equal(depois.corpo.length, C.TAMANHO_INICIAL + 1);
    assert.equal(depois.cabeca, casa(N.facil, 6, 7));
    assert.notEqual(depois.comida, -1);
    assert.ok(!depois.corpo.includes(depois.comida), "a fruta nova não pode nascer na cobra");
  },
  "a fruta nunca nasce em cima da cobra durante o jogo"() {
    let partida = C.iniciar(N.facil, semente(9));
    const aleatorio = semente(9);
    for (let i = 0; i < 120 && !partida.terminada; i++) {
      if (i % 5 === 0) partida = C.girar(partida, ["cima", "direita", "baixo", "esquerda"][i % 4]);
      partida = C.avancar(partida, aleatorio);
      if (!partida.terminada && partida.comida >= 0) assert.ok(!partida.corpo.includes(partida.comida));
    }
  },

  // ---------- Fim de partida ----------
  "bater na parede termina a partida nos quatro lados"() {
    const casos = [
      { linha: 0, coluna: 5, direcao: "cima", corpo: [casa(N.facil, 0, 5), casa(N.facil, 0, 6), casa(N.facil, 0, 7)] },
      { linha: 12, coluna: 5, direcao: "baixo", corpo: [casa(N.facil, 12, 5), casa(N.facil, 12, 4), casa(N.facil, 12, 3)] },
      { linha: 5, coluna: 0, direcao: "esquerda", corpo: [casa(N.facil, 5, 0), casa(N.facil, 5, 1), casa(N.facil, 5, 2)] },
      { linha: 5, coluna: 12, direcao: "direita", corpo: [casa(N.facil, 5, 12), casa(N.facil, 5, 11), casa(N.facil, 5, 10)] },
    ];
    for (const caso of casos) {
      const partida = montar(N.facil, caso.corpo, caso.direcao, casa(N.facil, 1, 1));
      const fim = C.avancar(partida, semente(10));
      assert.ok(fim.terminada, `deveria terminar indo para ${caso.direcao}`);
      assert.equal(fim.motivo, C.MOTIVOS.PAREDE);
      assert.equal(fim.vitoria, false);
      assert.deepEqual([...fim.corpo], caso.corpo, "o corpo não muda quando bate na parede");
      assert.equal(fim.pontos, partida.pontos);
    }
  },
  "bater no próprio corpo termina a partida"() {
    const corpo = [
      casa(N.facil, 5, 5),
      casa(N.facil, 5, 4),
      casa(N.facil, 4, 4),
      casa(N.facil, 4, 5),
      casa(N.facil, 3, 5),
    ];
    const partida = montar(N.facil, corpo, "cima", casa(N.facil, 10, 10));
    const fim = C.avancar(partida, semente(11));
    assert.ok(fim.terminada);
    assert.equal(fim.motivo, C.MOTIVOS.CORPO);
    assert.equal(fim.cabeca, casa(N.facil, 5, 5));
  },
  "a casa que a cauda deixa conta como livre"() {
    const corpo = [casa(N.facil, 5, 5), casa(N.facil, 4, 5), casa(N.facil, 4, 4), casa(N.facil, 5, 4)];
    const partida = montar(N.facil, corpo, "esquerda", casa(N.facil, 10, 10));
    const depois = C.avancar(partida, semente(12));
    assert.equal(depois.terminada, false, "perseguir a cauda é permitido");
    assert.equal(depois.cabeca, casa(N.facil, 5, 4));
    assert.equal(depois.corpo.length, corpo.length);
  },
  "encher o tabuleiro é vitória"() {
    const livre = casa(N.facil, 6, 7);
    const corpo = [casa(N.facil, 6, 6)];
    for (let indice = 0; indice < C.totalDeCasas(N.facil); indice++) {
      if (indice !== livre && indice !== casa(N.facil, 6, 6)) corpo.push(indice);
    }
    const partida = montar(N.facil, corpo, "direita", livre);
    const fim = C.avancar(partida, semente(13));
    assert.equal(fim.motivo, C.MOTIVOS.CHEIO);
    assert.equal(fim.vitoria, true);
    assert.ok(fim.terminada);
    assert.equal(fim.corpo.length, C.totalDeCasas(N.facil));
    assert.equal(fim.comida, -1);
  },
  "a velocidade aumenta com as frutas até o limite"() {
    assert.equal(C.intervaloDo(N.facil, 0), N.facil.intervalo);
    assert.equal(C.intervaloDo(N.facil, 5), N.facil.intervalo - 20);
    assert.equal(C.intervaloDo(N.facil, 15), N.facil.intervalo - 60);
    assert.equal(C.intervaloDo(N.facil, 100), N.facil.intervalo - 60);
    assert.equal(C.intervaloDo(N.dificil, 100), C.INTERVALO_MINIMO);
  },

  // ---------- Salvar e restaurar ----------
  "paraSalvar e restaurar fazem a ida e a volta"() {
    const partida = montar(N.medio, [casa(N.medio, 7, 7), casa(N.medio, 7, 6), casa(N.medio, 7, 5)], "cima", casa(N.medio, 2, 2), 30);
    const salvo = JSON.parse(JSON.stringify(C.paraSalvar(partida)));
    assert.deepEqual(salvo, {
      nivel: "medio",
      corpo: [casa(N.medio, 7, 7), casa(N.medio, 7, 6), casa(N.medio, 7, 5)],
      direcao: "cima",
      comida: casa(N.medio, 2, 2),
      pontos: 30,
      comidas: 3,
    });
    const voltou = C.restaurar(salvo);
    assert.deepEqual([...voltou.corpo], [...partida.corpo]);
    assert.equal(voltou.comida, partida.comida);
    assert.equal(voltou.pontos, 30);
    assert.equal(voltou.comidas, 3);
    assert.equal(voltou.direcao.id, "cima");
    assert.equal(voltou.nivel, "medio");
    assert.equal(voltou.terminada, false);
  },
  "restaurar recusa dados inválidos"() {
    const bom = { nivel: "facil", corpo: [0, 1, 2], direcao: "direita", comida: 9, pontos: 0 };
    assert.ok(C.restaurar(bom));
    assert.equal(C.restaurar(null), null);
    assert.equal(C.restaurar("lixo"), null);
    assert.equal(C.restaurar({ ...bom, nivel: "enorme" }), null);
    assert.equal(C.restaurar({ ...bom, corpo: "lixo" }), null);
    assert.equal(C.restaurar({ ...bom, corpo: [0, 1] }), null);
    assert.equal(C.restaurar({ ...bom, corpo: [0, 1, 999] }), null);
    assert.equal(C.restaurar({ ...bom, corpo: [0, 1, 1] }), null);
    assert.equal(C.restaurar({ ...bom, comida: 1 }), null, "a fruta não pode estar na cobra");
    assert.equal(C.restaurar({ ...bom, comida: 999 }), null);
    assert.equal(C.restaurar({ ...bom, comida: -1 }), null);
    assert.equal(C.restaurar({ ...bom, pontos: -10 }), null);
    assert.equal(C.restaurar({ ...bom, pontos: "10" }), null);
  },
  "restaurar sem direção conhecida cai para a direita"() {
    const voltou = C.restaurar({ nivel: "facil", corpo: [0, 1, 2], direcao: "diagonal", comida: 9, pontos: 0 });
    assert.equal(voltou.direcao.id, "direita");
    assert.equal(voltou.comidas, 0);
  },

  // ---------- Recordes ----------
  "recordesDe lê o que é válido e zera o resto"() {
    assert.deepEqual(C.recordesDe(null), { facil: 0, medio: 0, dificil: 0 });
    assert.deepEqual(C.recordesDe("lixo"), { facil: 0, medio: 0, dificil: 0 });
    assert.deepEqual(C.recordesDe({ facil: 30, medio: -5, dificil: "x", outro: 9 }), { facil: 30, medio: 0, dificil: 0 });
    assert.deepEqual(C.recordesDe({ medio: 120 }), { facil: 0, medio: 120, dificil: 0 });
  },
  "atualizarRecorde só sobe e não mexe no objeto antigo"() {
    const recordes = { ...C.RECORDES_ZERO };
    const comFacil = C.atualizarRecorde(recordes, N.facil, 40);
    assert.deepEqual(comFacil, { facil: 40, medio: 0, dificil: 0 });
    assert.deepEqual(recordes, { facil: 0, medio: 0, dificil: 0 });
    assert.equal(C.atualizarRecorde(comFacil, N.facil, 40), comFacil);
    assert.equal(C.atualizarRecorde(comFacil, N.facil, 10), comFacil);
    assert.deepEqual(C.atualizarRecorde(comFacil, N.dificil, 10), { facil: 40, medio: 0, dificil: 10 });
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
