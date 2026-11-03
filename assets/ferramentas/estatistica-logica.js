"use strict";
/*
 * Estatística descritiva: leitura da lista de números, medidas, quartis (método R-7),
 * frequências e histograma pela regra de Sturges.
 * Portado de core/estatistica/Statistics.kt (DataParser e Statistics) da Calculadora Multifunção.
 */
const Estatistica = (() => {
  const M = typeof MatematicaComum === "object" ? MatematicaComum : require("./matematica-comum.js");

  // ---------- Leitura dos dados ----------

  /**
   * Se o texto tiver quebra de linha, ";" ou espaços, eles separam os valores e a vírgula é
   * decimal ("1,5; 2,5"). Caso contrário, a vírgula separa os valores ("1,2,3"). Vírgulas
   * soltas nas pontas dos trechos são removidas, então "1, 2, 3" também funciona.
   */
  function lerDados(texto) {
    const limpo = String(texto ?? "").trim();
    if (!limpo) return { valores: [], invalidos: [] };
    const trechos = /[\s;]/.test(limpo)
      ? limpo.split(/[\s;]+/).map((t) => t.replace(/^,+|,+$/g, ""))
      : limpo.split(",");
    const valores = [];
    const invalidos = [];
    for (const bruto of trechos) {
      const trecho = bruto.trim();
      if (!trecho) continue;
      const valor = M.ler(trecho);
      if (valor === null) invalidos.push(trecho);
      else valores.push(valor);
    }
    return { valores, invalidos };
  }

  // ---------- Medidas ----------

  /**
   * Percentil por interpolação linear entre as posições (método R-7, o mesmo de PERCENTIL.INC
   * das planilhas). ordenados deve estar em ordem crescente.
   */
  function percentil(ordenados, p) {
    if (!ordenados.length) throw new RangeError("Lista vazia");
    if (ordenados.length === 1) return ordenados[0];
    const indice = (Math.min(100, Math.max(0, p)) / 100) * (ordenados.length - 1);
    const baixo = Math.floor(indice);
    const alto = Math.ceil(indice);
    return ordenados[baixo] + (ordenados[alto] - ordenados[baixo]) * (indice - baixo);
  }

  function contagens(ordenados) {
    const mapa = new Map();
    for (const v of ordenados) mapa.set(v, (mapa.get(v) || 0) + 1);
    return mapa;
  }

  /**
   * Modas: valores com a maior frequência. Não há moda quando todos os valores aparecem o
   * mesmo número de vezes (ex.: 1, 2, 3 ou 1, 1, 2, 2).
   */
  function modas(ordenados) {
    const mapa = contagens(ordenados);
    if (!mapa.size) return [];
    const maior = Math.max(...mapa.values());
    if (maior <= 1) return [];
    const lista = [...mapa].filter(([, c]) => c === maior).map(([v]) => v).sort((a, b) => a - b);
    return lista.length === mapa.size ? [] : lista;
  }

  function frequencias(ordenados) {
    const n = ordenados.length;
    let acumulado = 0;
    return [...contagens(ordenados)]
      .sort((a, b) => a[0] - b[0])
      .map(([valor, quantidade]) => {
        acumulado += quantidade;
        return { valor, quantidade, porcentagem: (quantidade / n) * 100, acumulada: (acumulado / n) * 100 };
      });
  }

  /** Histograma com o número de classes pela regra de Sturges: k = ⌈log₂ n⌉ + 1. */
  function histograma(ordenados) {
    if (!ordenados.length) return [];
    const min = ordenados[0];
    const max = ordenados[ordenados.length - 1];
    const n = ordenados.length;
    if (n < 2 || max === min) return [{ inferior: min, superior: max, quantidade: n }];
    const k = Math.max(1, Math.ceil(Math.log(n) / Math.LN2) + 1);
    const largura = (max - min) / k;
    const quantidades = new Array(k).fill(0);
    for (const v of ordenados) {
      const i = Math.min(k - 1, Math.max(0, Math.floor((v - min) / largura)));
      quantidades[i]++;
    }
    return quantidades.map((quantidade, i) => ({
      inferior: min + i * largura,
      superior: i === k - 1 ? max : min + (i + 1) * largura,
      quantidade,
    }));
  }

  function calcular(valores) {
    if (!valores.length) return null;
    const ordenados = [...valores].sort((a, b) => a - b);
    const n = ordenados.length;
    const soma = ordenados.reduce((acc, v) => acc + v, 0);
    const media = soma / n;
    const mediana = percentil(ordenados, 50);
    const min = ordenados[0];
    const max = ordenados[n - 1];

    let m2 = 0;
    let m3 = 0;
    let m4 = 0;
    for (const v of ordenados) {
      const d = v - media;
      const d2 = d * d;
      m2 += d2;
      m3 += d2 * d;
      m4 += d2 * d2;
    }
    const varianciaPopulacional = m2 / n;
    const desvioPopulacional = Math.sqrt(varianciaPopulacional);
    const varianciaAmostral = n >= 2 ? m2 / (n - 1) : null;
    const desvioAmostral = varianciaAmostral === null ? null : Math.sqrt(varianciaAmostral);
    const desvioReferencia = desvioAmostral ?? desvioPopulacional;
    const coeficienteVariacao = media !== 0 ? (desvioReferencia / Math.abs(media)) * 100 : null;
    const erroPadrao = desvioAmostral === null ? null : desvioAmostral / Math.sqrt(n);

    const todosPositivos = ordenados[0] > 0;
    const mediaGeometrica = todosPositivos ? Math.exp(ordenados.reduce((acc, v) => acc + Math.log(v), 0) / n) : null;
    const mediaHarmonica = todosPositivos ? n / ordenados.reduce((acc, v) => acc + 1 / v, 0) : null;

    const temDispersao = m2 > 0;
    let assimetria = null;
    if (n >= 3 && temDispersao) {
      const g1 = m3 / n / (m2 / n) ** 1.5;
      assimetria = (g1 * Math.sqrt(n * (n - 1))) / (n - 2);
    }
    let curtose = null;
    if (n >= 4 && temDispersao) {
      const g2 = m4 / n / (m2 / n) ** 2 - 3;
      curtose = (((n + 1) * g2 + 6) * (n - 1)) / ((n - 2) * (n - 3));
    }

    const q1 = percentil(ordenados, 25);
    const q3 = percentil(ordenados, 75);
    const iqr = q3 - q1;
    const cercaInferior = q1 - 1.5 * iqr;
    const cercaSuperior = q3 + 1.5 * iqr;

    return {
      n,
      soma,
      media,
      mediana,
      modas: modas(ordenados),
      min,
      max,
      amplitude: max - min,
      q1,
      q3,
      iqr,
      varianciaPopulacional,
      desvioPopulacional,
      varianciaAmostral,
      desvioAmostral,
      desvioReferencia,
      coeficienteVariacao,
      erroPadrao,
      mediaGeometrica,
      mediaHarmonica,
      assimetria,
      curtose,
      cercaInferior,
      cercaSuperior,
      atipicos: ordenados.filter((v) => v < cercaInferior || v > cercaSuperior),
      ordenados,
      frequencias: frequencias(ordenados),
      histograma: histograma(ordenados),
    };
  }

  /** Escore-z de x usando o desvio de referência (amostral quando possível); null sem dispersão. */
  function escoreZ(x, r) {
    const dp = r.desvioReferencia;
    return dp > 0 ? (x - r.media) / dp : null;
  }

  // ---------- Textos da tela (EstatisticaScreen.kt) ----------

  const EXEMPLO = [12, 15.5, 15.5, 18, 20, 21.5, 22, 25, 30, 45];
  const MAX_LINHAS_FREQUENCIA = 300;

  const f = (v) => M.inteligente(v, 7);
  const INSUFICIENTE = "Dados insuficientes";
  const REQUER_POSITIVOS = "Requer valores positivos";

  const textoExemplo = () => EXEMPLO.map((v) => M.numero(v, 4, 0, false)).join("; ");

  /** Seções de resultados já formatadas: [{ titulo, linhas: [{ rotulo, valor, destaque }] }]. */
  function secoes(r) {
    return [
      {
        id: "dispersao",
        titulo: "Dispersão",
        linhas: [
          { rotulo: "Mínimo", valor: f(r.min) },
          { rotulo: "Máximo", valor: f(r.max) },
          { rotulo: "Amplitude", valor: f(r.amplitude) },
          { rotulo: "Variância populacional", valor: f(r.varianciaPopulacional) },
          { rotulo: "Variância amostral", valor: r.varianciaAmostral === null ? INSUFICIENTE : f(r.varianciaAmostral) },
          { rotulo: "Desvio padrão populacional", valor: f(r.desvioPopulacional) },
          {
            rotulo: "Desvio padrão amostral",
            valor: r.desvioAmostral === null ? INSUFICIENTE : f(r.desvioAmostral),
            destaque: true,
          },
          {
            rotulo: "Coeficiente de variação",
            valor: r.coeficienteVariacao === null ? "—" : `${M.numero(r.coeficienteVariacao, 2)}%`,
          },
          { rotulo: "Erro padrão da média", valor: r.erroPadrao === null ? INSUFICIENTE : f(r.erroPadrao) },
        ],
      },
      {
        id: "quartis",
        titulo: "Quartis e valores atípicos",
        linhas: [
          { rotulo: "1º quartil (Q1)", valor: f(r.q1) },
          { rotulo: "Mediana (Q2)", valor: f(r.mediana) },
          { rotulo: "3º quartil (Q3)", valor: f(r.q3) },
          { rotulo: "Intervalo interquartil (IQR)", valor: f(r.iqr) },
          { rotulo: "Limites para atípicos", valor: `${f(r.cercaInferior)} … ${f(r.cercaSuperior)}` },
          {
            rotulo: "Valores atípicos (1,5 × IQR)",
            valor: r.atipicos.length ? r.atipicos.map(f).join("; ") : "Nenhum",
          },
        ],
        nota: "Quartis e percentis por interpolação linear entre posições (método R-7, o mesmo da função PERCENTIL.INC das planilhas eletrônicas).",
      },
      {
        id: "forma",
        titulo: "Outras médias e forma",
        linhas: [
          { rotulo: "Média geométrica", valor: r.mediaGeometrica === null ? REQUER_POSITIVOS : f(r.mediaGeometrica) },
          { rotulo: "Média harmônica", valor: r.mediaHarmonica === null ? REQUER_POSITIVOS : f(r.mediaHarmonica) },
          { rotulo: "Assimetria", valor: r.assimetria === null ? INSUFICIENTE : M.numero(r.assimetria, 4) },
          { rotulo: "Curtose (excesso)", valor: r.curtose === null ? INSUFICIENTE : M.numero(r.curtose, 4) },
        ],
        nota: "Assimetria e curtose amostrais, como as funções DISTORÇÃO e CURT das planilhas (exigem 3 e 4 valores, respectivamente).",
      },
    ];
  }

  /** Tendência central (o quadro de destaque). */
  function central(r) {
    return [
      { rotulo: "Quantidade (n)", valor: M.inteiro(r.n) },
      { rotulo: "Soma", valor: f(r.soma) },
      { rotulo: "Média", valor: f(r.media), destaque: true },
      { rotulo: "Mediana", valor: f(r.mediana), destaque: true },
      { rotulo: "Moda", valor: r.modas.length ? r.modas.map(f).join("; ") : "Sem moda" },
    ];
  }

  /** Percentil digitado: { erro } quando fora de 0 a 100, { rotulo, valor } quando válido. */
  function percentilDigitado(r, texto) {
    const p = M.ler(texto);
    const valido = p !== null && p >= 0 && p <= 100;
    if (!valido) return String(texto ?? "").length ? { erro: "Informe um percentil entre 0 e 100" } : null;
    return { rotulo: `Valor no percentil ${M.numero(p, 4)}`, valor: f(percentil(r.ordenados, p)) };
  }

  /** Escore-z digitado: null sem número, { aviso } sem dispersão ou { valor }. */
  function escoreZDigitado(r, texto) {
    const x = M.ler(texto);
    if (x === null) return null;
    const z = escoreZ(x, r);
    if (z === null) return { aviso: "Sem dispersão nos dados: escore-z indefinido" };
    return { valor: M.numero(z, 4) };
  }

  /** Classes do histograma: "[12; 18,6[" e a última fechada "]". */
  function classesHistograma(r) {
    const ultimo = r.histograma.length - 1;
    return r.histograma.map((c, i) => ({
      ...c,
      texto: `[${f(c.inferior)}; ${f(c.superior)}${i === ultimo ? "]" : "["}`,
      rotuloCurto: M.inteligente(c.inferior, 3),
    }));
  }

  function notaHistograma(r) {
    const h = r.histograma;
    const largura = h.length ? h[0].superior - h[0].inferior : 0;
    return `${h.length} ${h.length === 1 ? "classe" : "classes"} de largura ${f(largura)} (regra de Sturges)`;
  }

  function linhasFrequencia(r) {
    return r.frequencias.slice(0, MAX_LINHAS_FREQUENCIA).map((l) => [
      f(l.valor),
      M.inteiro(l.quantidade),
      M.numero(l.porcentagem, 2),
      M.numero(l.acumulada, 2),
    ]);
  }

  const textoOrdenado = (r) => r.ordenados.map((v) => M.inteligente(v, 10, false)).join("; ");

  return {
    lerDados,
    percentil,
    modas,
    frequencias,
    histograma,
    calcular,
    escoreZ,
    EXEMPLO,
    MAX_LINHAS_FREQUENCIA,
    textoExemplo,
    formatar: f,
    central,
    secoes,
    percentilDigitado,
    escoreZDigitado,
    classesHistograma,
    notaHistograma,
    linhasFrequencia,
    textoOrdenado,
  };
})();
if (typeof module === "object") module.exports = Estatistica;
