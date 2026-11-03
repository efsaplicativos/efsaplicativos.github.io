"use strict";
/*
 * Quebra-cabeça deslizante portado de logica/Tabuleiro.kt, Embaralhador.kt, Direcao.kt,
 * Partida.kt e Recorde.kt do app Quebra-Cabeça Deslizante (com.emerson1981.quebracabeca).
 * O tabuleiro é uma lista com o número da peça em cada casa (0 = espaço vazio); a peça N
 * pertence à casa N - 1 e o vazio fica na última casa quando está montado. O embaralhamento
 * sorteia uniformemente entre as posições que têm solução.
 */
const LogicaQuebraCabeca = (() => {
  const VAZIO = 0;
  const TAMANHOS = [3, 4, 5];

  /** Fácil 3 × 3, Médio 4 × 4 e Difícil 5 × 5, como no app. */
  const NIVEIS = {
    facil: { id: "facil", nome: "Fácil", tamanho: 3 },
    medio: { id: "medio", nome: "Médio", tamanho: 4 },
    dificil: { id: "dificil", nome: "Difícil", tamanho: 5 },
  };

  /** Sentido em que a peça desliza (o gesto do dedo). */
  const DIRECOES = {
    cima: { dLinha: -1, dColuna: 0 },
    baixo: { dLinha: 1, dColuna: 0 },
    esquerda: { dLinha: 0, dColuna: -1 },
    direita: { dLinha: 0, dColuna: 1 },
  };

  const tamanhoDe = (pecas) => Math.round(Math.sqrt(pecas.length));
  const posicaoVazia = (pecas) => pecas.indexOf(VAZIO);

  function resolvido(tamanho) {
    if (!TAMANHOS.includes(tamanho)) throw new Error("Tamanho inválido");
    const total = tamanho * tamanho;
    return Array.from({ length: total }, (_, i) => (i === total - 1 ? VAZIO : i + 1));
  }

  /** Confere se a lista é uma permutação válida de um dos tamanhos do jogo. */
  function valido(tamanho, pecas) {
    if (!TAMANHOS.includes(tamanho) || !Array.isArray(pecas)) return false;
    const total = tamanho * tamanho;
    if (pecas.length !== total) return false;
    const ordenadas = pecas.slice().sort((a, b) => a - b);
    return ordenadas.every((p, i) => p === i);
  }

  const estaResolvido = (pecas) => pecas.slice(0, -1).every((p, i) => p === i + 1);

  /** Só a peça vizinha (em cima, embaixo ou ao lado) do espaço vazio pode deslizar. */
  function podeMover(pecas, posicao) {
    const tamanho = tamanhoDe(pecas);
    const vazio = posicaoVazia(pecas);
    if (!Number.isInteger(posicao) || posicao < 0 || posicao >= pecas.length || posicao === vazio) return false;
    const distancia =
      Math.abs(Math.floor(posicao / tamanho) - Math.floor(vazio / tamanho)) +
      Math.abs((posicao % tamanho) - (vazio % tamanho));
    return distancia === 1;
  }

  /** Desliza a peça da casa para o espaço vazio; null se o movimento não vale. */
  function mover(pecas, posicao) {
    if (!podeMover(pecas, posicao)) return null;
    const novas = pecas.slice();
    novas[posicaoVazia(pecas)] = novas[posicao];
    novas[posicao] = VAZIO;
    return novas;
  }

  /** Casa da peça que entra no espaço vazio ao deslizar para a direção, ou null na borda. */
  function posicaoParaDeslizar(pecas, direcao) {
    const tamanho = tamanhoDe(pecas);
    const vazio = posicaoVazia(pecas);
    const { dLinha, dColuna } = DIRECOES[direcao];
    const linha = Math.floor(vazio / tamanho) - dLinha;
    const coluna = (vazio % tamanho) - dColuna;
    if (linha < 0 || linha >= tamanho || coluna < 0 || coluna >= tamanho) return null;
    return linha * tamanho + coluna;
  }

  function deslizar(pecas, direcao) {
    const posicao = posicaoParaDeslizar(pecas, direcao);
    return posicao === null ? null : mover(pecas, posicao);
  }

  /** Direção predominante de um arrasto de (dx, dy) pixels. */
  function direcaoDoArrasto(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "direita" : "esquerda";
    return dy > 0 ? "baixo" : "cima";
  }

  /**
   * Regra clássica de paridade: conta as inversões entre as peças (lidas linha a linha, sem o
   * vazio). Em grade ímpar o total precisa ser par; em grade par, inversões + linha do vazio
   * (contada de cima, a partir de 0) precisa ser ímpar.
   */
  function ehSolucionavel(pecas) {
    const tamanho = tamanhoDe(pecas);
    const sequencia = pecas.filter((p) => p !== VAZIO);
    let inversoes = 0;
    for (let i = 0; i < sequencia.length; i++) {
      for (let j = i + 1; j < sequencia.length; j++) if (sequencia[i] > sequencia[j]) inversoes++;
    }
    if (tamanho % 2 === 1) return inversoes % 2 === 0;
    return (inversoes + Math.floor(posicaoVazia(pecas) / tamanho)) % 2 === 1;
  }

  /**
   * Metade das permutações não tem solução; trocar duas peças inverte a paridade, então um
   * sorteio sem solução vira um com solução sem precisar sortear de novo. Nunca começa montado.
   */
  function embaralhar(tamanho, aleatorio = Math.random) {
    const total = tamanho * tamanho;
    for (;;) {
      const pecas = Array.from({ length: total }, (_, i) => i);
      for (let i = total - 1; i > 0; i--) {
        const j = Math.floor(aleatorio() * (i + 1));
        [pecas[i], pecas[j]] = [pecas[j], pecas[i]];
      }
      if (!ehSolucionavel(pecas)) {
        const [a, b] = pecas.map((p, i) => (p === VAZIO ? -1 : i)).filter((i) => i >= 0);
        [pecas[a], pecas[b]] = [pecas[b], pecas[a]];
      }
      if (!estaResolvido(pecas)) return pecas;
    }
  }

  // ---------- Recordes ----------
  // Melhor resultado de cada imagem em cada tamanho: menor tempo vence; no empate, menos movimentos.

  const melhorQue = (novo, outro) =>
    !outro || novo.tempoMs < outro.tempoMs || (novo.tempoMs === outro.tempoMs && novo.movimentos < outro.movimentos);

  /** Registra um resultado; devolve a nova lista e se ele virou o recorde da categoria. */
  function registrarResultado(lista, resultado) {
    const atual = lista.find((r) => r.imagem === resultado.imagem && r.tamanho === resultado.tamanho);
    if (!melhorQue(resultado, atual)) return { lista, novoRecorde: false };
    return { lista: [...lista.filter((r) => r !== atual), resultado], novoRecorde: true };
  }

  const melhor = (lista, imagem, tamanho) =>
    lista.find((r) => r.imagem === imagem && r.tamanho === tamanho) || null;

  function lerRecordes(dados, imagensValidas) {
    if (!Array.isArray(dados)) return [];
    let lista = [];
    for (const r of dados) {
      if (!r || !imagensValidas.includes(r.imagem) || !TAMANHOS.includes(r.tamanho)) continue;
      if (!Number.isFinite(r.tempoMs) || r.tempoMs < 0 || !Number.isInteger(r.movimentos) || r.movimentos < 1) continue;
      lista = registrarResultado(lista, { imagem: r.imagem, tamanho: r.tamanho, tempoMs: r.tempoMs, movimentos: r.movimentos }).lista;
    }
    return lista;
  }

  /** "mm:ss", como no app (os minutos passam de 59 em partidas longas). */
  function formatarTempo(ms) {
    const segundos = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;
  }

  return {
    VAZIO,
    TAMANHOS,
    NIVEIS,
    DIRECOES,
    resolvido,
    valido,
    estaResolvido,
    posicaoVazia,
    podeMover,
    mover,
    posicaoParaDeslizar,
    deslizar,
    direcaoDoArrasto,
    ehSolucionavel,
    embaralhar,
    melhorQue,
    registrarResultado,
    melhor,
    lerRecordes,
    formatarTempo,
  };
})();

if (typeof module === "object") module.exports = LogicaQuebraCabeca;
