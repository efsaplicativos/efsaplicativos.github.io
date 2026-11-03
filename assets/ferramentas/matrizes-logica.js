"use strict";
/*
 * Matrizes até 6 × 6: soma, subtração, produto, escalar, transposta, determinante, inversa,
 * posto, traço e potência inteira.
 * Portado de core/matrizes/Matrix.kt (Matrix e MatrixOps); textos e regras da tela de
 * ui/tools/matrizes/MatrizesScreen.kt (Calculadora Multifunção).
 * Uma matriz é um array de linhas: [[1, 2], [3, 4]].
 */
const Matrizes = (() => {
  const M = typeof MatematicaComum === "object" ? MatematicaComum : require("./matematica-comum.js");

  const MAX_DIM = 6;
  const MAX_POTENCIA = 1000;

  class ErroMatriz extends Error {
    constructor(tipo) {
      super(tipo);
      this.tipo = tipo;
    }
  }

  const criar = (linhas, colunas, f) =>
    Array.from({ length: linhas }, (_, r) => Array.from({ length: colunas }, (__, c) => f(r, c)));
  const identidade = (n) => criar(n, n, (r, c) => (r === c ? 1 : 0));
  const linhas = (a) => a.length;
  const colunas = (a) => a[0].length;
  const quadrada = (a) => a.length === a[0].length;
  const maiorAbs = (a) => Math.max(1, ...a.map((l) => Math.max(...l.map(Math.abs))));

  /** Zera resíduos de arredondamento (ex.: 4,4e-16 vira 0). */
  function limpar(a) {
    const escala = maiorAbs(a);
    return a.map((l) => l.map((v) => (Math.abs(v) < 1e-10 * escala ? 0 : v)));
  }

  function somar(a, b) {
    if (linhas(a) !== linhas(b) || colunas(a) !== colunas(b)) throw new ErroMatriz("dimensoesSoma");
    return criar(linhas(a), colunas(a), (r, c) => a[r][c] + b[r][c]);
  }

  function subtrair(a, b) {
    if (linhas(a) !== linhas(b) || colunas(a) !== colunas(b)) throw new ErroMatriz("dimensoesSoma");
    return criar(linhas(a), colunas(a), (r, c) => a[r][c] - b[r][c]);
  }

  function multiplicar(a, b) {
    if (colunas(a) !== linhas(b)) throw new ErroMatriz("dimensoesProduto");
    return criar(linhas(a), colunas(b), (r, c) => {
      let soma = 0;
      for (let k = 0; k < colunas(a); k++) soma += a[r][k] * b[k][c];
      return soma;
    });
  }

  const escalar = (a, k) => criar(linhas(a), colunas(a), (r, c) => a[r][c] * k);
  const transposta = (a) => criar(colunas(a), linhas(a), (r, c) => a[c][r]);

  function traco(a) {
    if (!quadrada(a)) throw new ErroMatriz("naoQuadrada");
    let soma = 0;
    for (let i = 0; i < linhas(a); i++) soma += a[i][i];
    return soma;
  }

  /** Linha (a partir de inicio) com o maior valor absoluto na coluna; a primeira em caso de empate. */
  function linhaPivo(m, inicio, coluna) {
    let melhor = inicio;
    for (let r = inicio + 1; r < m.length; r++) if (Math.abs(m[r][coluna]) > Math.abs(m[melhor][coluna])) melhor = r;
    return melhor;
  }

  /** Determinante por eliminação de Gauss com pivoteamento parcial. */
  function determinante(a) {
    if (!quadrada(a)) throw new ErroMatriz("naoQuadrada");
    const n = linhas(a);
    const m = a.map((l) => [...l]);
    let det = 1;
    for (let col = 0; col < n; col++) {
      const pivo = linhaPivo(m, col, col);
      if (m[pivo][col] === 0) return 0;
      if (pivo !== col) {
        [m[pivo], m[col]] = [m[col], m[pivo]];
        det = -det;
      }
      det *= m[col][col];
      for (let r = col + 1; r < n; r++) {
        const fator = m[r][col] / m[col][col];
        for (let c = col; c < n; c++) m[r][c] -= fator * m[col][c];
      }
    }
    return Math.abs(det) < 1e-12 * maiorAbs(a) ** n ? 0 : det;
  }

  /** Inversa por Gauss-Jordan; lança "singular" se não existir. */
  function inversa(a) {
    if (!quadrada(a)) throw new ErroMatriz("naoQuadrada");
    const n = linhas(a);
    const m = a.map((l, r) => [...l, ...Array.from({ length: n }, (_, c) => (c === r ? 1 : 0))]);
    const tolerancia = 1e-12 * maiorAbs(a);
    for (let col = 0; col < n; col++) {
      const pivo = linhaPivo(m, col, col);
      if (Math.abs(m[pivo][col]) < tolerancia) throw new ErroMatriz("singular");
      [m[pivo], m[col]] = [m[col], m[pivo]];
      const valorPivo = m[col][col];
      for (let c = 0; c < 2 * n; c++) m[col][c] /= valorPivo;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const fator = m[r][col];
        if (fator === 0) continue;
        for (let c = 0; c < 2 * n; c++) m[r][c] -= fator * m[col][c];
      }
    }
    return criar(n, n, (r, c) => m[r][c + n]);
  }

  /** Posto (número de linhas linearmente independentes) por escalonamento. */
  function posto(a) {
    const m = a.map((l) => [...l]);
    const tolerancia = 1e-10 * maiorAbs(a);
    let rank = 0;
    for (let col = 0; col < colunas(a); col++) {
      if (rank === linhas(a)) break;
      const pivo = linhaPivo(m, rank, col);
      if (Math.abs(m[pivo][col]) < tolerancia) continue;
      [m[pivo], m[rank]] = [m[rank], m[pivo]];
      for (let r = rank + 1; r < linhas(a); r++) {
        const fator = m[r][col] / m[rank][col];
        for (let c = col; c < colunas(a); c++) m[r][c] -= fator * m[rank][c];
      }
      rank++;
    }
    return rank;
  }

  /** Potência inteira (n negativo usa a inversa; n = 0 dá a identidade). */
  function potencia(a, n) {
    if (!quadrada(a)) throw new ErroMatriz("naoQuadrada");
    if (Math.abs(n) > MAX_POTENCIA) throw new ErroMatriz("potencia");
    let base = n < 0 ? inversa(a) : a;
    let expoente = Math.abs(n);
    let resultado = identidade(linhas(a));
    while (expoente > 0) {
      if (expoente % 2 === 1) resultado = multiplicar(resultado, base);
      base = multiplicar(base, base);
      expoente = Math.floor(expoente / 2);
    }
    return resultado;
  }

  // ---------- Tela (MatrizesScreen.kt) ----------

  /** Lê a matriz visível de 36 células (6 × 6); vazias valem 0, inválidas dão null. */
  function lerMatriz(celulas, nLinhas, nColunas) {
    const dados = [];
    for (let r = 0; r < nLinhas; r++) {
      const linha = [];
      for (let c = 0; c < nColunas; c++) {
        const texto = String(celulas[r * MAX_DIM + c] ?? "").trim();
        if (!texto) {
          linha.push(0);
          continue;
        }
        const v = M.ler(texto);
        if (v === null) return null;
        linha.push(v);
      }
      dados.push(linha);
    }
    return dados;
  }

  const ENTRE_AB = ["soma", "subtracao", "produtoAB", "produtoBA"];
  const UMA_MATRIZ = ["determinante", "inversa", "transposta", "posto", "traco", "escalar", "potencia"];

  function rotuloOperacao(op, alvo) {
    const x = alvo;
    return {
      soma: "A + B",
      subtracao: "A − B",
      produtoAB: "A × B",
      produtoBA: "B × A",
      escalar: `Multiplicar por k (k·${x})`,
      transposta: `Transposta (${x}ᵀ)`,
      determinante: `Determinante (det ${x})`,
      inversa: `Inversa (${x}⁻¹)`,
      posto: "Posto",
      traco: `Traço (tr ${x})`,
      potencia: `Potência (${x}ⁿ)`,
    }[op];
  }

  const NOTA_SINGULAR = "Determinante 0: a matriz é singular (não inversível).";

  /**
   * Resultado da operação escolhida: { tipo: "matriz", titulo, matriz }, { tipo: "escalar",
   * titulo, valor, nota } ou { tipo: "erro", mensagem }.
   * dados: { operacao, alvo ("A" | "B"), celulasA, celulasB, linhasA, colunasA, linhasB, colunasB, k, n }.
   */
  function calcular(dados) {
    const { operacao, alvo, linhasA, colunasA, linhasB, colunasB } = dados;
    const a = lerMatriz(dados.celulasA, linhasA, colunasA);
    const b = lerMatriz(dados.celulasB, linhasB, colunasB);
    const precisaB = ENTRE_AB.includes(operacao);
    const erro = (mensagem) => ({ tipo: "erro", mensagem });
    if (a === null && (precisaB || alvo === "A")) return erro("Há células com valores inválidos na Matriz A.");
    if (b === null && (precisaB || alvo === "B")) return erro("Há células com valores inválidos na Matriz B.");
    const x = alvo === "A" ? a : b;
    const matriz = (titulo, m) => ({ tipo: "matriz", titulo, matriz: m });

    try {
      switch (operacao) {
        case "soma":
          return matriz("A + B", somar(a, b));
        case "subtracao":
          return matriz("A − B", subtrair(a, b));
        case "produtoAB":
          return matriz("A × B", multiplicar(a, b));
        case "produtoBA":
          return matriz("B × A", multiplicar(b, a));
        case "escalar": {
          const k = M.ler(dados.k);
          if (k === null) return erro("Informe o escalar k.");
          return matriz(`k·${alvo}`, escalar(x, k));
        }
        case "transposta":
          return matriz(`${alvo}ᵀ`, transposta(x));
        case "determinante": {
          const det = determinante(x);
          return { tipo: "escalar", titulo: `det(${alvo})`, valor: det, nota: det === 0 ? NOTA_SINGULAR : null };
        }
        case "inversa":
          return matriz(`${alvo}⁻¹`, inversa(x));
        case "posto":
          return { tipo: "escalar", titulo: `Posto (${alvo})`, valor: posto(x), nota: null };
        case "traco":
          return { tipo: "escalar", titulo: `tr(${alvo})`, valor: traco(x), nota: null };
        case "potencia": {
          const n = M.lerInteiro(dados.n);
          if (n === null) return erro("Informe um expoente inteiro.");
          return matriz(`${alvo}${M.sobrescrito(n)}`, potencia(x, n));
        }
        default:
          return null;
      }
    } catch (e) {
      if (!(e instanceof ErroMatriz)) throw e;
      const mensagens = {
        dimensoesSoma: `Para somar ou subtrair, A e B precisam ter as mesmas dimensões (A é ${linhasA}×${colunasA} e B é ${linhasB}×${colunasB}).`,
        dimensoesProduto:
          operacao === "produtoBA"
            ? `Para multiplicar, o número de colunas da primeira matriz (${colunasB}) deve ser igual ao número de linhas da segunda (${linhasA}).`
            : `Para multiplicar, o número de colunas da primeira matriz (${colunasA}) deve ser igual ao número de linhas da segunda (${linhasB}).`,
        naoQuadrada: "Esta operação exige uma matriz quadrada (mesmo número de linhas e colunas).",
        singular: "A matriz é singular (determinante igual a 0) e não possui inversa.",
        potencia: "Expoente muito grande (máximo ±1000).",
      };
      return erro(mensagens[e.tipo]);
    }
  }

  /** Textos de uma matriz de resultado: células (8 algarismos) e cópia com tabulação. */
  const textoCelula = (v) => M.inteligente(v, 8);
  const textoEscalar = (v) => M.inteligente(v, 10);
  const textoCopia = (m) => limpar(m).map((l) => l.map((v) => M.inteligente(v, 10, false)).join("\t")).join("\n");
  /** Valor gravado nas células ao usar o resultado como A ou B. */
  const textoParaCelula = (v) => M.numero(v, 10, 0, false);
  const titulo = (r) => `${r.titulo} — Matriz ${r.matriz.length} × ${r.matriz[0].length}`;

  return {
    MAX_DIM,
    ErroMatriz,
    criar,
    identidade,
    limpar,
    somar,
    subtrair,
    multiplicar,
    escalar,
    transposta,
    traco,
    determinante,
    inversa,
    posto,
    potencia,
    lerMatriz,
    ENTRE_AB,
    UMA_MATRIZ,
    rotuloOperacao,
    calcular,
    textoCelula,
    textoEscalar,
    textoCopia,
    textoParaCelula,
    titulo,
  };
})();
if (typeof module === "object") module.exports = Matrizes;
