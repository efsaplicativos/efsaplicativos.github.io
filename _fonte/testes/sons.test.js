"use strict";
// Sons dos jogos (assets/jogos/sons.js): liberação do áudio no gesto e falta de Web Audio.
const assert = require("node:assert/strict");

/** Contexto de áudio de mentira: conta os resume() e aceita os nós que os efeitos criam. */
class ContextoFalso {
  constructor() {
    ContextoFalso.criados++;
    this.state = "suspended";
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.destination = {};
    this.resumes = 0;
  }
  resume() {
    this.resumes++;
    return Promise.resolve();
  }
  no() {
    const param = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    return { connect() {}, start() {}, stop() {}, gain: param, frequency: param, Q: param, threshold: param, ratio: param };
  }
  createGain() { return this.no(); }
  createOscillator() { return this.no(); }
  createBiquadFilter() { return this.no(); }
  createBufferSource() { return this.no(); }
  createDynamicsCompressor() { return this.no(); }
  createBuffer(canais, tamanho) {
    return { getChannelData: () => new Float32Array(tamanho) };
  }
}
ContextoFalso.criados = 0;

/** Raiz de mentira que guarda os ouvintes de cada evento. */
function raizFalsa() {
  const ouvintes = {};
  return {
    ouvintes,
    addEventListener(tipo, fn) {
      (ouvintes[tipo] ||= []).push(fn);
    },
    disparar(tipo) {
      for (const fn of ouvintes[tipo] || []) fn();
    },
  };
}

const testes = {
  "o fim do toque (pointerup, touchend, clique) também libera o áudio"() {
    // No celular, o pointerdown do toque ainda não é gesto: o áudio só pode voltar no fim do toque
    let contexto = null;
    class Guardado extends ContextoFalso {
      constructor() {
        super();
        contexto = this;
      }
    }
    globalThis.window = { AudioContext: Guardado };
    delete require.cache[require.resolve("../../assets/jogos/sons.js")];
    const Sons = require("../../assets/jogos/sons.js");
    const raiz = raizFalsa();
    Sons.criar("teste-gesto", raiz);
    for (const tipo of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) {
      assert.ok(raiz.ouvintes[tipo]?.length, `sem ouvinte de ${tipo}`);
    }
    const criadosAntes = ContextoFalso.criados;
    raiz.disparar("pointerdown");
    assert.equal(ContextoFalso.criados, criadosAntes + 1);
    // O contexto nasceu suspenso (toque ainda não é gesto); o fim do toque pede resume()
    raiz.disparar("pointerup");
    raiz.disparar("touchend");
    raiz.disparar("click");
    assert.equal(ContextoFalso.criados, criadosAntes + 1, "o contexto é um só");
    assert.equal(contexto.resumes, 3);
  },
  "o contexto interrompido (Safari no iPhone) volta no próximo gesto"() {
    let contexto = null;
    class Guardado extends ContextoFalso {
      constructor() {
        super();
        contexto = this;
      }
    }
    globalThis.window = { AudioContext: Guardado };
    delete require.cache[require.resolve("../../assets/jogos/sons.js")];
    const Sons = require("../../assets/jogos/sons.js");
    const raiz = raizFalsa();
    const som = Sons.criar("teste-interrompido", raiz);
    raiz.disparar("touchend");
    contexto.state = "running";
    const antes = contexto.resumes;
    som.tocar("acerto");
    assert.equal(contexto.resumes, antes, "rodando, não pede resume()");
    contexto.state = "interrupted";
    raiz.disparar("touchend");
    assert.equal(contexto.resumes, antes + 1, "interrompido, pede resume() no gesto");
    contexto.state = "suspended";
    som.tocar("acerto");
    assert.equal(contexto.resumes, antes + 2);
  },
  "sem Web Audio nada quebra"() {
    globalThis.window = {};
    delete require.cache[require.resolve("../../assets/jogos/sons.js")];
    const Sons = require("../../assets/jogos/sons.js");
    const raiz = raizFalsa();
    const som = Sons.criar("teste-mudo", raiz);
    for (const tipo of Object.keys(raiz.ouvintes)) raiz.disparar(tipo);
    som.tocar("vitoria");
    som.tocar("efeito-que-nao-existe");
    som.ligarBotao(null);
    assert.equal(typeof som.ligado, "boolean");
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
