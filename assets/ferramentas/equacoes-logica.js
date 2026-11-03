"use strict";
/*
 * Equações do 1º, 2º e 3º grau e sistemas lineares 2×2 e 3×3.
 * Portado de core/equacoes/EquationSolver.kt e PolynomialFormat.kt; os textos, o passo a passo
 * e a escolha do intervalo do gráfico vêm de ui/tools/equacoes/EquacoesScreen.kt e
 * FunctionPlot.kt (Calculadora Multifunção).
 */
const Equacoes = (() => {
  const M = typeof MatematicaComum === "object" ? MatematicaComum : require("./matematica-comum.js");

  const EPS = 1e-12;

  /** Zera resíduos numéricos (−0 e valores ~1e−15) para exibição. */
  const snap = (valor) => (Math.abs(valor) < 1e-12 ? 0 : valor);

  const complexo = (re, im = 0) => ({ re, im });
  const ehReal = (c) => c.im === 0;

  // ---------- 1º grau ----------

  function resolverLinear(a, b) {
    if (Math.abs(a) > 0) return { tipo: "raiz", x: snap(-b / a) };
    if (Math.abs(b) > 0) return { tipo: "impossivel" };
    return { tipo: "infinitas" };
  }

  // ---------- 2º grau ----------

  function resolverQuadratica(a, b, c) {
    if (a === 0) throw new RangeError("a deve ser diferente de zero");
    const delta = b * b - 4 * a * c;
    // Tolerância relativa à escala dos termos (evita comparar Δ == 0 exatamente)
    const escala = Math.max(b * b, Math.abs(4 * a * c));
    const deltaZero = Math.abs(delta) <= EPS * Math.max(escala, 1e-300);
    const verticeX = -b / (2 * a);
    let raizes;
    let natureza;
    if (deltaZero) {
      natureza = "dupla";
      raizes = [complexo(snap(verticeX)), complexo(snap(verticeX))];
    } else if (delta > 0) {
      natureza = "duasReais";
      // Fórmula numericamente estável (evita cancelamento catastrófico)
      const raizDelta = Math.sqrt(delta);
      const termo = -0.5 * (b + (b >= 0 ? raizDelta : -raizDelta));
      const x1 = termo / a;
      const x2 = termo !== 0 ? c / termo : -x1;
      raizes = [x1, x2].sort((p, q) => p - q).map((x) => complexo(snap(x)));
    } else {
      natureza = "complexas";
      const im = Math.sqrt(-delta) / (2 * Math.abs(a));
      raizes = [complexo(snap(verticeX), im), complexo(snap(verticeX), -im)];
    }
    return {
      delta: deltaZero ? 0 : delta,
      natureza,
      raizes,
      verticeX: snap(verticeX),
      verticeY: snap(c - (b * b) / (4 * a)),
      soma: snap(-b / a),
      produto: snap(c / a),
    };
  }

  // ---------- 3º grau ----------

  /** Refina uma raiz de x³ + bx² + cx + d pelo método de Newton. */
  function polirRaizCubica(b, c, d, chute) {
    let x = chute;
    for (let i = 0; i < 50; i++) {
      const f = ((x + b) * x + c) * x + d;
      const df = (3 * x + 2 * b) * x + c;
      if (df === 0 || !Number.isFinite(df)) return x;
      const proximo = x - f / df;
      if (!Number.isFinite(proximo)) return x;
      if (Math.abs(proximo - x) <= 1e-15 * Math.max(1, Math.abs(x))) return proximo;
      // Só aceita o passo se melhorar o resíduo (evita divergir perto de raízes múltiplas)
      const fProximo = ((proximo + b) * proximo + c) * proximo + d;
      if (Math.abs(fProximo) > Math.abs(f)) return x;
      x = proximo;
    }
    return x;
  }

  function resolverCubica(a, b, c, d) {
    if (a === 0) throw new RangeError("a deve ser diferente de zero");
    const bn = b / a;
    const cn = c / a;
    const dn = d / a;
    const p = cn - (bn * bn) / 3;
    const q = (2 * bn * bn * bn) / 27 - (bn * cn) / 3 + dn;
    const disc = (q / 2) * (q / 2) + (p / 3) * (p / 3) * (p / 3);
    const deslocamento = -bn / 3;

    // Uma raiz real pelo método de Cardano (Δ ≥ 0) ou trigonométrico (Δ < 0)
    let t;
    if (disc >= 0) {
      const raiz = Math.sqrt(disc);
      t = Math.cbrt(-q / 2 + raiz) + Math.cbrt(-q / 2 - raiz);
    } else {
      const r = Math.sqrt(-p / 3);
      const arg = Math.min(1, Math.max(-1, ((3 * q) / (2 * p)) * Math.sqrt(-3 / p)));
      t = 2 * r * Math.cos(Math.acos(arg) / 3);
    }
    const raiz = polirRaizCubica(bn, cn, dn, t + deslocamento);

    // Divide por (x − r): x² + (bn + r)x + (cn + (bn + r)r)
    const qb = bn + raiz;
    const qc = cn + qb * raiz;
    const restantes = resolverQuadratica(1, qb, qc).raizes;
    const raizes = [complexo(snap(raiz)), ...restantes]
      .map((z) => (ehReal(z) ? complexo(snap(polirRaizCubica(bn, cn, dn, z.re))) : z))
      .sort((u, v) => Number(!ehReal(u)) - Number(!ehReal(v)) || u.re - v.re || -u.im - -v.im);

    const reais = raizes.filter(ehReal);
    let natureza;
    if (reais.length < 3) natureza = "umaReal";
    else if (reais.slice(1).some((y, i) => Math.abs(reais[i].re - y.re) <= 1e-7 * Math.max(1, Math.abs(reais[i].re))))
      natureza = "multiplas";
    else natureza = "tresDistintas";

    // Pontos críticos: raízes de 3ax² + 2bx + c
    const criticos = [];
    const deltaDerivada = 4 * b * b - 12 * a * c;
    if (deltaDerivada > 0) {
      const s = Math.sqrt(deltaDerivada);
      criticos.push((-2 * b - s) / (6 * a), (-2 * b + s) / (6 * a));
      criticos.sort((u, v) => u - v);
    }

    return {
      normalizados: [1, bn, cn, dn],
      p: snap(p),
      q: snap(q),
      discriminante: snap(disc),
      natureza,
      primeiraRaiz: snap(raiz),
      reduzida: [1, snap(qb), snap(qc)],
      raizes,
      pontosCriticos: criticos,
    };
  }

  const avaliarPolinomio = (coeficientes, x) => coeficientes.reduce((acc, c) => acc * x + c, 0);

  // ---------- Sistemas ----------

  /** Determinante por cofatores (adequado para 2×2 e 3×3). */
  function determinante(m) {
    if (m.length === 1) return m[0][0];
    if (m.length === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
    let soma = 0;
    for (let j = 0; j < m[0].length; j++) {
      const menor = m.slice(1).map((linha) => linha.filter((_, k) => k !== j));
      soma += (j % 2 === 0 ? 1 : -1) * m[0][j] * determinante(menor);
    }
    return soma;
  }

  function resolverSistema(matriz, constantes) {
    const n = matriz.length;
    if (!(n > 0 && matriz.every((l) => l.length === n) && constantes.length === n)) {
      throw new RangeError("Matriz e termos independentes de tamanhos diferentes");
    }
    const det = determinante(matriz);
    const cramer = matriz[0].map((_, col) =>
      determinante(matriz.map((linha, i) => linha.map((v, j) => (j === col ? constantes[i] : v)))),
    );

    // Escalonamento (Gauss-Jordan) com pivotamento parcial
    const aum = matriz.map((linha, i) => [...linha, constantes[i]]);
    const maiorAbs = Math.max(...aum.map((linha) => Math.max(...linha.map(Math.abs))));
    const tol = 1e-10 * Math.max(1, maiorAbs);
    let linhaPivo = 0;
    const colunasPivo = [];
    for (let col = 0; col <= n; col++) {
      if (linhaPivo >= n) break;
      let melhor = linhaPivo;
      for (let r = linhaPivo + 1; r < n; r++) if (Math.abs(aum[r][col]) > Math.abs(aum[melhor][col])) melhor = r;
      if (Math.abs(aum[melhor][col]) <= tol) continue;
      [aum[melhor], aum[linhaPivo]] = [aum[linhaPivo], aum[melhor]];
      const pivo = aum[linhaPivo][col];
      for (let j = 0; j <= n; j++) aum[linhaPivo][j] /= pivo;
      for (let r = 0; r < n; r++) {
        if (r === linhaPivo) continue;
        const fator = aum[r][col];
        if (fator !== 0) for (let j = 0; j <= n; j++) aum[r][j] -= fator * aum[linhaPivo][j];
      }
      colunasPivo.push(col);
      linhaPivo++;
    }
    const postoA = colunasPivo.filter((c) => c < n).length;
    const postoAumentada = colunasPivo.length;
    let tipo;
    if (postoA < postoAumentada) tipo = "impossivel";
    else if (postoA < n) tipo = "indeterminado";
    else tipo = "unico";
    return {
      tipo,
      solucao: tipo === "unico" ? aum.map((linha) => snap(linha[n])) : null,
      determinante: snap(det),
      determinantesCramer: cramer.map(snap),
      postoA,
      postoAumentada,
      escalonada: aum.map((linha) => linha.map(snap)),
    };
  }

  // ---------- Formatação de polinômios (PolynomialFormat.kt) ----------

  const POTENCIAS = { 0: "", 1: "", 2: "²", 3: "³", 4: "⁴" };

  function juntarTermos(termos) {
    if (!termos.length) return "0";
    return termos
      .map(([valor, texto], i) => {
        if (i === 0) return valor < 0 ? `−${texto}` : texto;
        return valor < 0 ? ` − ${texto}` : ` + ${texto}`;
      })
      .join("");
  }

  function monomio(absoluto, potencia, variavel, numero) {
    if (potencia === 0) return numero(absoluto);
    const parteVariavel = variavel + (POTENCIAS[potencia] ?? `^${potencia}`);
    return absoluto === 1 ? parteVariavel : numero(absoluto) + parteVariavel;
  }

  /** Coeficientes do maior para o menor grau: [1, −3, 2] → "x² − 3x + 2". */
  function polinomio(coeficientes, numero, variavel = "x") {
    const grau = coeficientes.length - 1;
    const termos = [];
    coeficientes.forEach((c, i) => {
      if (c !== 0) termos.push([c, monomio(Math.abs(c), grau - i, variavel, numero)]);
    });
    return juntarTermos(termos);
  }

  const equacao = (coeficientes, numero, variavel = "x") => `${polinomio(coeficientes, numero, variavel)} = 0`;

  /** Equação linear com várias incógnitas: "2x + 3y − z = 5". */
  function linear(coeficientes, variaveis, constante, numero) {
    const termos = [];
    coeficientes.forEach((c, i) => {
      if (c !== 0) termos.push([c, Math.abs(c) === 1 ? variaveis[i] : numero(Math.abs(c)) + variaveis[i]]);
    });
    const direita = constante < 0 ? `−${numero(Math.abs(constante))}` : numero(constante);
    return `${juntarTermos(termos)} = ${direita}`;
  }

  const comSinal = (valor, numero) => (valor < 0 ? `−${numero(Math.abs(valor))}` : numero(valor));
  const entreParenteses = (valor, numero) => (valor < 0 ? `(−${numero(Math.abs(valor))})` : numero(valor));

  const Formato = { polinomio, equacao, linear, comSinal, entreParenteses };

  // ---------- Formatação das telas (EqFormat) ----------

  const numero = (v) => M.inteligente(v, 10);
  const n = (v) => numero(Math.abs(v));
  const s = (v) => comSinal(v, numero);
  const w = (v) => entreParenteses(v, numero);

  function textoComplexo(c) {
    if (ehReal(c)) return s(c.re);
    const imAbs = Math.abs(c.im);
    const imaginario = `${imAbs === 1 ? "" : n(imAbs)}i`;
    if (c.re === 0) return (c.im < 0 ? "−" : "") + imaginario;
    return s(c.re) + (c.im < 0 ? " − " : " + ") + imaginario;
  }

  /** Fator (x − r): "x", "(x − 2)", "(x + 3)". */
  function fator(raiz) {
    if (raiz === 0) return "x";
    return raiz > 0 ? `(x − ${n(raiz)})` : `(x + ${n(raiz)})`;
  }

  /** Coeficiente que antecede um produto: "", "−" ou "2". */
  function principalCoef(a) {
    if (a === 1) return "";
    if (a === -1) return "−";
    return s(a);
  }

  function formaCanonica(a, h, k) {
    const quadrado = h === 0 ? "x²" : `${fator(h)}²`;
    let constante = "";
    if (k > 0) constante = ` + ${n(k)}`;
    else if (k < 0) constante = ` − ${n(k)}`;
    return principalCoef(a) + quadrado + constante;
  }

  // ---------- Gráfico (FunctionPlot.kt) ----------

  /** Passo "redondo" (1, 2 ou 5 × 10ⁿ) próximo de bruto. */
  function passoRedondo(bruto) {
    if (bruto <= 0 || !Number.isFinite(bruto)) return 1;
    const expoente = Math.floor(Math.log10(bruto));
    const fracao = bruto / 10 ** expoente;
    let redondo = 10;
    if (fracao < 1.5) redondo = 1;
    else if (fracao < 3) redondo = 2;
    else if (fracao < 7) redondo = 5;
    return redondo * 10 ** expoente;
  }

  /** Evita rótulos como 0,30000000000000004 ou −0. */
  function marcaLimpa(valor, passo) {
    const arredondado = Math.round(valor / passo) * passo;
    return Math.abs(arredondado) < passo * 1e-6 ? 0 : arredondado;
  }

  /** Intervalo de x que mostra todos os pontos de interesse com folga. */
  function intervaloGrafico(xsChave, meiaLarguraMinima = 2) {
    const finitos = xsChave.filter(Number.isFinite);
    if (!finitos.length) return [-5, 5];
    const lo = Math.min(...finitos);
    const hi = Math.max(...finitos);
    const centro = (lo + hi) / 2;
    const meia = Math.max(((hi - lo) / 2) * 1.6, Math.max(meiaLarguraMinima, Math.abs(centro) * 0.05));
    return [Math.min(centro - meia, lo - 0.5), Math.max(centro + meia, hi + 0.5)];
  }

  /**
   * Amostra as funções (240 intervalos) e calcula a escala de y com 8% de folga e as marcas
   * da grade. O desenho em si fica na interface.
   */
  function escalaGrafico(funcoes, xMin, xMax, pontos) {
    const amostras = 240;
    const xs = Array.from({ length: amostras + 1 }, (_, i) => xMin + ((xMax - xMin) * i) / amostras);
    const curvas = funcoes.map((f) => xs.map(f));
    const valores = [...curvas.flat().filter(Number.isFinite), ...pontos.map((p) => p.y), 0];
    let yMin = Math.min(...valores);
    let yMax = Math.max(...valores);
    if (yMax - yMin < 1e-9) {
      yMin -= 1;
      yMax += 1;
    }
    const folga = (yMax - yMin) * 0.08;
    yMin -= folga;
    yMax += folga;

    const marcas = (min, max, divisoes) => {
      const passo = passoRedondo((max - min) / divisoes);
      const lista = [];
      for (let v = Math.ceil(min / passo) * passo; v <= max && lista.length < 100; v += passo) {
        lista.push({ valor: v, texto: s(marcaLimpa(v, passo)) });
      }
      return lista;
    };
    return { xs, curvas, xMin, xMax, yMin, yMax, marcasX: marcas(xMin, xMax, 6), marcasY: marcas(yMin, yMax, 5) };
  }

  // ---------- Leitura dos campos ----------

  /** Valores dos campos (vazio = 0) e quais são inválidos (ParsedFields). */
  function lerCampos(campos) {
    const erros = campos.map((t) => String(t ?? "").trim() !== "" && M.ler(t) === null);
    const algumPreenchido = campos.some((t) => String(t ?? "").trim() !== "");
    const valores = erros.some(Boolean) ? null : campos.map((t) => M.ler(t) ?? 0);
    return { erros, algumPreenchido, valores };
  }

  const TEXTOS = {
    vazioZero: "Campos vazios valem 0. Aceita números negativos e decimais.",
    numeroInvalido: "Número inválido",
    grauMenor: "O coeficiente principal é zero: a equação foi resolvida com grau menor.",
    impossivel: "Nenhuma solução: a = 0 e b ≠ 0 (equação impossível).",
    infinitas: "Infinitas soluções: 0 = 0 (identidade).",
    natureza2: {
      duasReais: "Duas raízes reais distintas (Δ > 0)",
      dupla: "Uma raiz real dupla (Δ = 0)",
      complexas: "Duas raízes complexas conjugadas (Δ < 0)",
    },
    natureza3: {
      tresDistintas: "Três raízes reais distintas (Δ < 0)",
      multiplas: "Raízes reais com multiplicidade (Δ = 0)",
      umaReal: "Uma raiz real e duas complexas conjugadas (Δ > 0)",
    },
    sistema: {
      unico: "Sistema possível e determinado (solução única)",
      indeterminado: "Sistema possível e indeterminado (infinitas soluções)",
      impossivel: "Sistema impossível (nenhuma solução)",
    },
  };

  const INDICES = "₁₂₃";

  // ---------- Relatórios (o que cada aba mostra) ----------

  function relatorioLinear(a, b) {
    const r = resolverLinear(a, b);
    const rel = { equacao: equacao([a, b], n), detalhes: [], destaque: [], passos: [] };
    if (r.tipo === "raiz") {
      rel.principal = { rotulo: "Raiz", valor: `x = ${s(r.x)}` };
      rel.detalhes.push({ rotulo: "Coeficiente angular", valor: s(a) }, { rotulo: "Corta o eixo y em", valor: s(b) });
      rel.passos = [
        `Equação: ${equacao([a, b], n)}`,
        `Isole o termo com x: ${polinomio([a, 0], n)} = ${s(-b)}`,
        `Divida pelo coeficiente de x: x = ${s(-b)} / ${w(a)} = ${s(r.x)}`,
      ];
    } else {
      rel.mensagem = r.tipo === "impossivel" ? TEXTOS.impossivel : TEXTOS.infinitas;
    }
    const raiz = r.tipo === "raiz" ? r.x : null;
    const [xMin, xMax] = intervaloGrafico(raiz === null ? [0] : [raiz, 0]);
    const pontos = [];
    if (raiz !== null) pontos.push({ x: raiz, y: 0, rotulo: `x = ${s(raiz)}` });
    pontos.push({ x: 0, y: b, rotulo: "" });
    rel.grafico = { funcoes: [(x) => a * x + b], xMin, xMax, pontos, nomes: [`y = ${polinomio([a, b], n)}`] };
    return rel;
  }

  function relatorioQuadratica(a, b, c) {
    const r = resolverQuadratica(a, b, c);
    const [x1, x2] = r.raizes;
    const rel = { equacao: equacao([a, b, c], n), mensagem: TEXTOS.natureza2[r.natureza], destaque: [], detalhes: [] };
    if (r.natureza === "dupla") rel.destaque.push({ rotulo: "x₁ = x₂", valor: textoComplexo(x1) });
    else rel.destaque.push({ rotulo: "x₁", valor: textoComplexo(x1) }, { rotulo: "x₂", valor: textoComplexo(x2) });
    rel.detalhes.push(
      { rotulo: "Discriminante (Δ)", valor: s(r.delta) },
      { rotulo: "Vértice", valor: `(${s(r.verticeX)}; ${s(r.verticeY)})` },
      { rotulo: "Eixo de simetria", valor: `x = ${s(r.verticeX)}` },
      { rotulo: "Concavidade", valor: a > 0 ? "Para cima (a > 0)" : "Para baixo (a < 0)" },
      { rotulo: a > 0 ? "Valor mínimo" : "Valor máximo", valor: s(r.verticeY) },
      { rotulo: "Soma das raízes (−b/a)", valor: s(r.soma) },
      { rotulo: "Produto das raízes (c/a)", valor: s(r.produto) },
      { rotulo: "Corta o eixo y em", valor: s(c) },
    );
    if (r.natureza !== "complexas") {
      let fatorada;
      if (r.natureza === "dupla") {
        const f = fator(x1.re);
        fatorada = principalCoef(a) + (f === "x" ? "x²" : `${f}²`);
      } else {
        fatorada = principalCoef(a) + fator(x1.re) + fator(x2.re);
      }
      rel.detalhes.push({ rotulo: "Forma fatorada", valor: fatorada });
    }
    rel.detalhes.push({ rotulo: "Forma canônica", valor: formaCanonica(a, r.verticeX, r.verticeY) });

    const xsChave = [r.verticeX, ...r.raizes.map((z) => z.re)];
    if (r.natureza === "complexas") xsChave.push(r.verticeX + Math.abs(x1.im), r.verticeX - Math.abs(x1.im));
    const [xMin, xMax] = intervaloGrafico(xsChave);
    const pontos = [];
    if (r.natureza !== "complexas") {
      const vistos = new Set();
      for (const z of r.raizes) {
        if (vistos.has(z.re)) continue;
        vistos.add(z.re);
        pontos.push({ x: z.re, y: 0, rotulo: s(z.re) });
      }
    }
    pontos.push({ x: r.verticeX, y: r.verticeY, rotulo: "V" });
    rel.grafico = { funcoes: [(x) => (a * x + b) * x + c], xMin, xMax, pontos, nomes: [`y = ${polinomio([a, b, c], n)}`] };

    rel.passos = [
      `Equação: ${equacao([a, b, c], n)}`,
      `Calcule o discriminante: Δ = b² − 4ac = ${w(b)}² − 4 · ${w(a)} · ${w(c)} = ${s(r.delta)}`,
      r.delta >= 0
        ? `Aplique a fórmula de Bhaskara: x = (−b ± √Δ) / 2a = (${s(-b)} ± ${n(Math.sqrt(r.delta))}) / ${s(2 * a)}`
        : `Como Δ < 0, use √Δ = i·√(−Δ): x = (${s(-b)} ± ${n(Math.sqrt(-r.delta))}i) / ${s(2 * a)}`,
      `x₁ = ${textoComplexo(x1)};  x₂ = ${textoComplexo(x2)}`,
      `Vértice: xᵥ = −b/2a = ${s(r.verticeX)};  yᵥ = −Δ/4a = ${s(r.verticeY)}`,
    ];
    return rel;
  }

  function relatorioCubica(a, b, c, d) {
    const r = resolverCubica(a, b, c, d);
    const coef = [a, b, c, d];
    const rel = { equacao: equacao(coef, n), mensagem: TEXTOS.natureza3[r.natureza], destaque: [], detalhes: [] };
    r.raizes.forEach((z, i) => rel.destaque.push({ rotulo: `x${INDICES[i]}`, valor: textoComplexo(z) }));
    rel.detalhes.push({ rotulo: "Discriminante (Δ)", valor: s(r.discriminante) });
    if (r.pontosCriticos.length) {
      rel.detalhes.push({
        rotulo: "Pontos críticos (máx./mín. locais)",
        valor: r.pontosCriticos.map((x) => `x = ${s(snap(x))}`).join("; "),
      });
    }
    rel.detalhes.push({ rotulo: "Corta o eixo y em", valor: s(d) });

    const reais = r.raizes.filter(ehReal).map((z) => z.re);
    const [xMin, xMax] = intervaloGrafico([...reais, ...r.pontosCriticos, 0]);
    const f = (x) => avaliarPolinomio(coef, x);
    const pontos = [...new Set(reais)].map((x) => ({ x, y: 0, rotulo: s(x) }));
    for (const x of r.pontosCriticos) pontos.push({ x, y: f(x), rotulo: "" });
    rel.grafico = { funcoes: [f], xMin, xMax, pontos, nomes: [`y = ${polinomio(coef, n)}`] };

    const restantes = resolverQuadratica(1, r.reduzida[1], r.reduzida[2]).raizes;
    rel.passos = [`Equação: ${equacao(coef, n)}`];
    if (a !== 1) rel.passos.push(`Divida tudo por a: ${equacao(r.normalizados, n)}`);
    rel.passos.push(
      `Com x = t − b/(3a), obtém-se a forma reduzida: ${equacao([1, 0, r.p, r.q], n, "t")}`,
      `Discriminante: Δ = (q/2)² + (p/3)³ = ${s(r.discriminante)}`,
      r.discriminante >= 0
        ? `Δ ≥ 0: a fórmula de Cardano dá a raiz real r = ${s(r.primeiraRaiz)}`
        : `Δ < 0: o método trigonométrico dá a raiz real r = ${s(r.primeiraRaiz)}`,
      `Divida o polinômio por (x − r): ${equacao(r.reduzida, n)}`,
      `Resolva a equação do 2º grau restante: ${restantes.map((z) => `x = ${textoComplexo(z)}`).join(";  ")}`,
    );
    return rel;
  }

  /**
   * Aba de polinômio (2, 3 ou 4 campos). Devolve null quando não há nada a mostrar,
   * { erros } quando algum campo é inválido, ou o relatório completo.
   */
  function relatorioPolinomio(campos) {
    const lidos = lerCampos(campos);
    if (!lidos.valores) return { erros: lidos.erros };
    if (!lidos.algumPreenchido) return null;
    // Se o coeficiente principal for zero, resolve com o grau imediatamente menor
    let coef = lidos.valores;
    let aviso = null;
    if (coef.length > 2 && coef[0] === 0) {
      aviso = TEXTOS.grauMenor;
      while (coef.length > 2 && coef[0] === 0) coef = coef.slice(1);
    }
    let rel;
    if (coef.length === 2) rel = relatorioLinear(coef[0], coef[1]);
    else if (coef.length === 3) rel = relatorioQuadratica(coef[0], coef[1], coef[2]);
    else rel = relatorioCubica(coef[0], coef[1], coef[2], coef[3]);
    return { ...rel, aviso, erros: lidos.erros };
  }

  /**
   * Aba de sistemas: 12 campos (linha i → colunas 0..tamanho−1 e 3 para o termo independente).
   */
  function relatorioSistema(tamanho, campos) {
    const variaveis = ["x", "y", "z"].slice(0, tamanho);
    const indicesLinha = (i) => [...variaveis.map((_, j) => i * 4 + j), i * 4 + 3];
    const usados = variaveis.flatMap((_, i) => indicesLinha(i));
    const lidos = lerCampos(campos);
    const erros = lidos.erros.map((e, i) => e && usados.includes(i));
    if (erros.some(Boolean)) return { erros };
    const linhasPreenchidas = variaveis.every((_, i) => indicesLinha(i).some((k) => String(campos[k] ?? "").trim() !== ""));
    if (!linhasPreenchidas) return null;
    const valor = (k) => M.ler(campos[k]) ?? 0;
    const matriz = variaveis.map((_, i) => variaveis.map((__, j) => valor(i * 4 + j)));
    const constantes = variaveis.map((_, i) => valor(i * 4 + 3));
    const r = resolverSistema(matriz, constantes);

    const rel = { erros, mensagem: TEXTOS.sistema[r.tipo], destaque: [], detalhes: [], aviso: null };
    if (r.solucao) r.solucao.forEach((v, i) => rel.destaque.push({ rotulo: variaveis[i], valor: s(v) }));
    rel.detalhes.push({ rotulo: "Determinante (D)", valor: s(r.determinante) });

    // Gráfico das duas retas no caso 2×2
    rel.grafico = null;
    if (tamanho === 2) {
      const linhas = [0, 1].filter((i) => matriz[i][1] !== 0);
      if (linhas.length) {
        const [xMin, xMax] = intervaloGrafico(r.solucao ? [r.solucao[0], 0] : [0]);
        rel.grafico = {
          funcoes: linhas.map((i) => (x) => (constantes[i] - matriz[i][0] * x) / matriz[i][1]),
          xMin,
          xMax,
          pontos: r.solucao ? [{ x: r.solucao[0], y: r.solucao[1], rotulo: `(${s(r.solucao[0])}; ${s(r.solucao[1])})` }] : [],
          nomes: linhas.map((i) => `Equação ${i + 1}: ${linear(matriz[i], variaveis, constantes[i], n)}`),
        };
      }
    }

    rel.passos = matriz.map((linha, i) => linear(linha, variaveis, constantes[i], n));
    rel.passos.push(`Determinante principal: D = ${s(r.determinante)}`);
    if (r.determinante !== 0 && r.solucao) {
      const cramer = variaveis
        .map((v, i) => `${v} = D${v}/D = ${w(r.determinantesCramer[i])}/${w(r.determinante)} = ${s(r.solucao[i])}`)
        .join(";  ");
      rel.passos.push(`Regra de Cramer: ${cramer}`);
    } else {
      rel.passos.push("D = 0: a regra de Cramer não se aplica; analisa-se o posto das matrizes.");
    }
    rel.passos.push("Escalonamento de Gauss-Jordan (com pivotamento parcial):");
    for (const linha of r.escalonada) {
      rel.passos.push(`[ ${linha.slice(0, -1).map(s).join("   ")}  |  ${s(linha[linha.length - 1])} ]`);
    }
    rel.passos.push(`Posto de A = ${r.postoA}, posto de [A|b] = ${r.postoAumentada}`);
    return rel;
  }

  return {
    snap,
    resolverLinear,
    resolverQuadratica,
    resolverCubica,
    avaliarPolinomio,
    resolverSistema,
    determinante,
    Formato,
    textoComplexo,
    formaCanonica,
    passoRedondo,
    marcaLimpa,
    intervaloGrafico,
    escalaGrafico,
    lerCampos,
    relatorioPolinomio,
    relatorioSistema,
    formatar: s,
    TEXTOS,
  };
})();
if (typeof module === "object") module.exports = Equacoes;
