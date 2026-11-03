"use strict";
/*
 * Geometria: áreas, perímetros e volumes de 11 figuras planas e 7 sólidos, com fórmulas,
 * classificação de triângulos e validação das medidas.
 * Portado de core/geometria/Geometry.kt; nomes, rótulos e formatação de
 * ui/tools/geometria/GeometriaScreen.kt (Calculadora Multifunção).
 */
const Geometria = (() => {
  const M = typeof MatematicaComum === "object" ? MatematicaComum : require("./matematica-comum.js");
  const { PI } = Math;

  /** Medidas de entrada: símbolo usado nas fórmulas e no desenho, tipo e rótulo. */
  const ENTRADAS = {
    raio: { simbolo: "r", rotulo: "Raio" },
    lado: { simbolo: "a", rotulo: "Lado" },
    base: { simbolo: "b", rotulo: "Base" },
    altura: { simbolo: "h", rotulo: "Altura" },
    comprimento: { simbolo: "c", rotulo: "Comprimento" },
    largura: { simbolo: "l", rotulo: "Largura" },
    ladoA: { simbolo: "a", rotulo: "Lado a" },
    ladoB: { simbolo: "b", rotulo: "Lado b" },
    ladoC: { simbolo: "c", rotulo: "Lado c" },
    baseMaior: { simbolo: "B", rotulo: "Base maior" },
    baseMenor: { simbolo: "b", rotulo: "Base menor" },
    ladoInclinado: { simbolo: "s", rotulo: "Lado inclinado" },
    diagonalMaior: { simbolo: "D", rotulo: "Diagonal maior" },
    diagonalMenor: { simbolo: "d", rotulo: "Diagonal menor" },
    semieixoA: { simbolo: "a", rotulo: "Semieixo horizontal" },
    semieixoB: { simbolo: "b", rotulo: "Semieixo vertical" },
    numeroLados: { simbolo: "n", tipo: "contagem", rotulo: "Número de lados" },
    angulo: { simbolo: "θ", tipo: "angulo", rotulo: "Ângulo central" },
    raioMaior: { simbolo: "R", rotulo: "Raio maior" },
    raioMenor: { simbolo: "r", rotulo: "Raio menor" },
  };

  const FORMAS = [
    { id: "circulo", nome: "Círculo", dimensao: "plana", entradas: ["raio"] },
    { id: "quadrado", nome: "Quadrado", dimensao: "plana", entradas: ["lado"] },
    { id: "retangulo", nome: "Retângulo", dimensao: "plana", entradas: ["base", "altura"] },
    { id: "trianguloBaseAltura", nome: "Triângulo (base e altura)", dimensao: "plana", entradas: ["base", "altura"] },
    { id: "trianguloLados", nome: "Triângulo (3 lados)", dimensao: "plana", entradas: ["ladoA", "ladoB", "ladoC"] },
    { id: "trapezio", nome: "Trapézio", dimensao: "plana", entradas: ["baseMaior", "baseMenor", "altura"] },
    { id: "paralelogramo", nome: "Paralelogramo", dimensao: "plana", entradas: ["base", "altura", "ladoInclinado"] },
    { id: "losango", nome: "Losango", dimensao: "plana", entradas: ["diagonalMaior", "diagonalMenor"] },
    { id: "elipse", nome: "Elipse", dimensao: "plana", entradas: ["semieixoA", "semieixoB"] },
    { id: "poligonoRegular", nome: "Polígono regular", dimensao: "plana", entradas: ["numeroLados", "lado"] },
    { id: "setor", nome: "Setor circular", dimensao: "plana", entradas: ["raio", "angulo"] },
    { id: "cubo", nome: "Cubo", dimensao: "solida", entradas: ["lado"] },
    { id: "paralelepipedo", nome: "Paralelepípedo", dimensao: "solida", entradas: ["comprimento", "largura", "altura"] },
    { id: "esfera", nome: "Esfera", dimensao: "solida", entradas: ["raio"] },
    { id: "cilindro", nome: "Cilindro", dimensao: "solida", entradas: ["raio", "altura"] },
    { id: "cone", nome: "Cone", dimensao: "solida", entradas: ["raio", "altura"] },
    { id: "piramide", nome: "Pirâmide de base quadrada", dimensao: "solida", entradas: ["lado", "altura"] },
    { id: "troncoCone", nome: "Tronco de cone", dimensao: "solida", entradas: ["raioMaior", "raioMenor", "altura"] },
  ];
  const forma = (id) => FORMAS.find((f) => f.id === id);

  /** potencia define a unidade exibida (u, u², u³); 0 = ângulo em graus. */
  const MEDIDAS = {
    area: { potencia: 2, rotulo: "Área" },
    perimetro: { potencia: 1, rotulo: "Perímetro" },
    circunferencia: { potencia: 1, rotulo: "Circunferência (comprimento)" },
    diametro: { potencia: 1, rotulo: "Diâmetro" },
    diagonal: { potencia: 1, rotulo: "Diagonal" },
    lado: { potencia: 1, rotulo: "Lado" },
    ladoTrapezio: { potencia: 1, rotulo: "Lado inclinado (trapézio isósceles)" },
    apotema: { potencia: 1, rotulo: "Apótema" },
    raioCircunscrito: { potencia: 1, rotulo: "Raio da circunferência circunscrita" },
    arco: { potencia: 1, rotulo: "Comprimento do arco" },
    altura: { potencia: 1, rotulo: "Altura relativa ao maior lado" },
    anguloInterno: { potencia: 0, rotulo: "Ângulo interno" },
    anguloA: { potencia: 0, rotulo: "Ângulo α (oposto a a)" },
    anguloB: { potencia: 0, rotulo: "Ângulo β (oposto a b)" },
    anguloC: { potencia: 0, rotulo: "Ângulo γ (oposto a c)" },
    volume: { potencia: 3, rotulo: "Volume" },
    areaSuperficie: { potencia: 2, rotulo: "Área da superfície" },
    areaLateral: { potencia: 2, rotulo: "Área lateral" },
    areaBase: { potencia: 2, rotulo: "Área da base" },
    areaTotal: { potencia: 2, rotulo: "Área total" },
    geratriz: { potencia: 1, rotulo: "Geratriz" },
    arestaLateral: { potencia: 1, rotulo: "Aresta lateral" },
    diagonalFace: { potencia: 1, rotulo: "Diagonal da face" },
    diagonalSolido: { potencia: 1, rotulo: "Diagonal do sólido" },
  };

  const ERROS = {
    valores: "Preencha todas as medidas com valores maiores que zero.",
    triangulo: "Esses lados não formam um triângulo: cada lado deve ser menor que a soma dos outros dois.",
    poligono: "O polígono regular precisa de um número inteiro de lados, no mínimo 3.",
    setor: "O ângulo central deve estar entre 0° e 360°.",
    alturaLado: "A altura não pode ser maior que o lado inclinado.",
  };

  const UNIDADES = ["mm", "cm", "m", "km", "in", "ft"];

  const ok = (medidas, formulas, triangulo = null) => ({ ok: true, medidas, formulas, triangulo });
  const falha = (erro) => ({ ok: false, erro });
  const graus = (rad) => rad * (180 / PI);
  const limitar = (x, min, max) => Math.min(max, Math.max(min, x));

  /** Perímetro aproximado da elipse (segunda fórmula de Ramanujan). */
  const perimetroElipse = (a, b) => PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));

  function classificarTriangulo(a, b, c) {
    const igual = (x, y) => Math.abs(x - y) <= 1e-9 * Math.max(x, y);
    let lados = "escaleno";
    if (igual(a, b) && igual(b, c)) lados = "equilatero";
    else if (igual(a, b) || igual(b, c) || igual(a, c)) lados = "isosceles";
    const [p, q, r] = [a, b, c].sort((x, y) => x - y);
    const maior2 = r * r;
    const outros = p * p + q * q;
    let angulos = "acutangulo";
    if (Math.abs(maior2 - outros) <= 1e-9 * maior2) angulos = "retangulo";
    else if (maior2 > outros) angulos = "obtusangulo";
    return { lados, angulos };
  }

  function trianguloPorLados(a, b, c) {
    if (a + b <= c || a + c <= b || b + c <= a) return falha("triangulo");
    const s = (a + b + c) / 2;
    const area = Math.sqrt(s * (s - a) * (s - b) * (s - c));
    const anguloA = graus(Math.acos(limitar((b * b + c * c - a * a) / (2 * b * c), -1, 1)));
    const anguloB = graus(Math.acos(limitar((a * a + c * c - b * b) / (2 * a * c), -1, 1)));
    const anguloC = 180 - anguloA - anguloB;
    return ok(
      [
        ["area", area],
        ["perimetro", a + b + c],
        ["altura", (2 * area) / Math.max(a, Math.max(b, c))],
        ["anguloA", anguloA],
        ["anguloB", anguloB],
        ["anguloC", anguloC],
      ],
      ["s = (a + b + c) / 2", "A = √(s·(s − a)·(s − b)·(s − c))", "cos α = (b² + c² − a²) / (2·b·c)"],
      classificarTriangulo(a, b, c),
    );
  }

  /** valores: { raio: 2, ... }. Devolve { ok, medidas: [[medida, valor]], formulas, triangulo } ou { ok: false, erro }. */
  function calcular(idForma, valores) {
    const f = forma(idForma);
    if (!f) throw new RangeError(`Figura desconhecida: ${idForma}`);
    if (f.entradas.some((k) => typeof valores[k] !== "number" || !Number.isFinite(valores[k]) || valores[k] <= 0)) {
      return falha("valores");
    }
    const x = (k) => valores[k];

    switch (idForma) {
      case "circulo": {
        const r = x("raio");
        return ok(
          [
            ["area", PI * r * r],
            ["circunferencia", 2 * PI * r],
            ["diametro", 2 * r],
          ],
          ["A = π·r²", "C = 2·π·r", "d = 2·r"],
        );
      }
      case "quadrado": {
        const a = x("lado");
        return ok(
          [
            ["area", a * a],
            ["perimetro", 4 * a],
            ["diagonal", a * Math.sqrt(2)],
          ],
          ["A = a²", "P = 4·a", "d = a·√2"],
        );
      }
      case "retangulo": {
        const b = x("base");
        const h = x("altura");
        return ok(
          [
            ["area", b * h],
            ["perimetro", 2 * (b + h)],
            ["diagonal", Math.sqrt(b * b + h * h)],
          ],
          ["A = b·h", "P = 2·(b + h)", "d = √(b² + h²)"],
        );
      }
      case "trianguloBaseAltura":
        return ok([["area", (x("base") * x("altura")) / 2]], ["A = b·h / 2"]);
      case "trianguloLados":
        return trianguloPorLados(x("ladoA"), x("ladoB"), x("ladoC"));
      case "trapezio": {
        const maior = x("baseMaior");
        const menor = x("baseMenor");
        const h = x("altura");
        const meia = (maior - menor) / 2;
        const lado = Math.sqrt(h * h + meia * meia);
        return ok(
          [
            ["area", ((maior + menor) * h) / 2],
            ["ladoTrapezio", lado],
            ["perimetro", maior + menor + 2 * lado],
          ],
          ["A = (B + b)·h / 2", "s = √(h² + ((B − b)/2)²)", "P = B + b + 2·s"],
        );
      }
      case "paralelogramo": {
        const b = x("base");
        const h = x("altura");
        const s = x("ladoInclinado");
        if (h > s) return falha("alturaLado");
        return ok(
          [
            ["area", b * h],
            ["perimetro", 2 * (b + s)],
          ],
          ["A = b·h", "P = 2·(b + s)"],
        );
      }
      case "losango": {
        const dMaior = x("diagonalMaior");
        const dMenor = x("diagonalMenor");
        const lado = Math.sqrt((dMaior / 2) * (dMaior / 2) + (dMenor / 2) * (dMenor / 2));
        return ok(
          [
            ["area", (dMaior * dMenor) / 2],
            ["lado", lado],
            ["perimetro", 4 * lado],
          ],
          ["A = D·d / 2", "a = √((D/2)² + (d/2)²)", "P = 4·a"],
        );
      }
      case "elipse": {
        const a = x("semieixoA");
        const b = x("semieixoB");
        return ok(
          [
            ["area", PI * a * b],
            ["perimetro", perimetroElipse(a, b)],
          ],
          ["A = π·a·b", "P ≈ π·[3(a + b) − √((3a + b)(a + 3b))]"],
        );
      }
      case "poligonoRegular": {
        const n = x("numeroLados");
        if (n < 3 || n !== Math.floor(n)) return falha("poligono");
        const a = x("lado");
        const apotema = a / (2 * Math.tan(PI / n));
        const perimetro = n * a;
        return ok(
          [
            ["area", (perimetro * apotema) / 2],
            ["perimetro", perimetro],
            ["apotema", apotema],
            ["raioCircunscrito", a / (2 * Math.sin(PI / n))],
            ["anguloInterno", ((n - 2) * 180) / n],
          ],
          ["P = n·a", "ap = a / (2·tan(π/n))", "A = P·ap / 2", "R = a / (2·sin(π/n))", "α = (n − 2)·180° / n"],
        );
      }
      case "setor": {
        const r = x("raio");
        const angulo = x("angulo");
        if (angulo > 360) return falha("setor");
        const arco = (angulo / 360) * 2 * PI * r;
        return ok(
          [
            ["area", (angulo / 360) * PI * r * r],
            ["arco", arco],
            ["perimetro", arco + 2 * r],
          ],
          ["A = (θ/360°)·π·r²", "s = (θ/360°)·2·π·r", "P = s + 2·r"],
        );
      }
      case "cubo": {
        const a = x("lado");
        return ok(
          [
            ["volume", a * a * a],
            ["areaSuperficie", 6 * a * a],
            ["diagonalFace", a * Math.sqrt(2)],
            ["diagonalSolido", a * Math.sqrt(3)],
          ],
          ["V = a³", "A = 6·a²", "d = a·√2", "D = a·√3"],
        );
      }
      case "paralelepipedo": {
        const c = x("comprimento");
        const l = x("largura");
        const h = x("altura");
        return ok(
          [
            ["volume", c * l * h],
            ["areaSuperficie", 2 * (c * l + c * h + l * h)],
            ["diagonalSolido", Math.sqrt(c * c + l * l + h * h)],
          ],
          ["V = c·l·h", "A = 2·(c·l + c·h + l·h)", "D = √(c² + l² + h²)"],
        );
      }
      case "esfera": {
        const r = x("raio");
        return ok(
          [
            ["volume", (4 / 3) * PI * r * r * r],
            ["areaSuperficie", 4 * PI * r * r],
            ["diametro", 2 * r],
          ],
          ["V = (4/3)·π·r³", "A = 4·π·r²", "d = 2·r"],
        );
      }
      case "cilindro": {
        const r = x("raio");
        const h = x("altura");
        return ok(
          [
            ["volume", PI * r * r * h],
            ["areaBase", PI * r * r],
            ["areaLateral", 2 * PI * r * h],
            ["areaTotal", 2 * PI * r * (r + h)],
          ],
          ["V = π·r²·h", "Ab = π·r²", "Al = 2·π·r·h", "At = 2·π·r·(r + h)"],
        );
      }
      case "cone": {
        const r = x("raio");
        const h = x("altura");
        const g = Math.sqrt(r * r + h * h);
        return ok(
          [
            ["volume", (PI * r * r * h) / 3],
            ["geratriz", g],
            ["areaBase", PI * r * r],
            ["areaLateral", PI * r * g],
            ["areaTotal", PI * r * (r + g)],
          ],
          ["V = π·r²·h / 3", "g = √(r² + h²)", "Ab = π·r²", "Al = π·r·g", "At = π·r·(r + g)"],
        );
      }
      case "piramide": {
        const a = x("lado");
        const h = x("altura");
        const apotema = Math.sqrt(h * h + (a / 2) * (a / 2));
        const lateral = 2 * a * apotema;
        return ok(
          [
            ["volume", (a * a * h) / 3],
            ["geratriz", apotema],
            ["arestaLateral", Math.sqrt(h * h + (a * a) / 2)],
            ["areaBase", a * a],
            ["areaLateral", lateral],
            ["areaTotal", a * a + lateral],
          ],
          ["V = a²·h / 3", "g = √(h² + (a/2)²)", "e = √(h² + a²/2)", "Ab = a²", "Al = 2·a·g", "At = Ab + Al"],
        );
      }
      case "troncoCone": {
        const R = x("raioMaior");
        const r = x("raioMenor");
        const h = x("altura");
        const g = Math.sqrt(h * h + (R - r) * (R - r));
        const lateral = PI * (R + r) * g;
        return ok(
          [
            ["volume", (PI * h * (R * R + R * r + r * r)) / 3],
            ["geratriz", g],
            ["areaLateral", lateral],
            ["areaTotal", lateral + PI * R * R + PI * r * r],
          ],
          ["V = π·h·(R² + R·r + r²) / 3", "g = √(h² + (R − r)²)", "Al = π·(R + r)·g", "At = Al + π·R² + π·r²"],
        );
      }
      default:
        throw new RangeError(`Figura sem cálculo: ${idForma}`);
    }
  }

  // ---------- Textos da tela ----------

  /** A geratriz da pirâmide é chamada de apótema da pirâmide. */
  function rotuloMedida(medida, idForma) {
    if (medida === "geratriz" && idForma === "piramide") return "Apótema da pirâmide";
    return MEDIDAS[medida].rotulo;
  }

  function formatarMedida(valor, medida, unidade) {
    const potencia = MEDIDAS[medida].potencia;
    if (potencia === 0) return `${M.numero(valor, 4)}°`;
    const texto = M.inteligente(valor, 8);
    return `${texto} ${unidade}${potencia === 2 ? "²" : potencia === 3 ? "³" : ""}`;
  }

  const NOMES_LADOS = { equilatero: "Equilátero", isosceles: "Isósceles", escaleno: "Escaleno" };
  const NOMES_ANGULOS = { acutangulo: "acutângulo", retangulo: "retângulo", obtusangulo: "obtusângulo" };
  const textoClassificacao = (t) => `${NOMES_LADOS[t.lados]}, ${NOMES_ANGULOS[t.angulos]}`;

  /**
   * Lê os textos digitados (por chave de entrada; "diametro" para o círculo pelo diâmetro)
   * e devolve o que a tela mostra: { estado: "vazio" | "erro" | "ok", ... }.
   */
  function resultadoDaTela(idForma, textos, unidade, porDiametro = false) {
    const f = forma(idForma);
    const valores = {};
    for (const k of f.entradas) {
      if (idForma === "circulo" && k === "raio" && porDiametro) {
        const d = M.ler(textos.diametro);
        valores[k] = d === null ? null : d / 2;
      } else {
        valores[k] = M.ler(textos[k]);
      }
    }
    if (f.entradas.some((k) => valores[k] === null)) return { estado: "vazio", valores, mensagem: "Preencha as medidas para ver os resultados." };
    const r = calcular(idForma, valores);
    if (!r.ok) return { estado: "erro", valores, mensagem: ERROS[r.erro] };
    const linhas = r.medidas.map(([medida, valor], i) => ({
      rotulo: rotuloMedida(medida, idForma),
      valor: formatarMedida(valor, medida, unidade),
      destaque: i === 0,
    }));
    if (r.triangulo) linhas.unshift({ rotulo: "Classificação", valor: textoClassificacao(r.triangulo), destaque: true });
    return { estado: "ok", valores, linhas, formulas: r.formulas };
  }

  return {
    ENTRADAS,
    FORMAS,
    MEDIDAS,
    ERROS,
    UNIDADES,
    forma,
    calcular,
    perimetroElipse,
    trianguloPorLados,
    classificarTriangulo,
    rotuloMedida,
    formatarMedida,
    textoClassificacao,
    resultadoDaTela,
  };
})();
if (typeof module === "object") module.exports = Geometria;
