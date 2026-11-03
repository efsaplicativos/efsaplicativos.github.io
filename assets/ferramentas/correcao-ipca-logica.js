"use strict";
/*
 * Correção de valores pela inflação (IPCA, INPC e IPCA-15) com a série mensal do IBGE.
 * Porte de core/ipca/Inflation.kt (InflationCalculator e SidraParser) da Calculadora
 * Multifunção: mesmas tabelas e variáveis da API SIDRA v3, mesma leitura da resposta e meses
 * inicial e final incluídos no cálculo.
 *
 * Meses são números inteiros (ano × 12 + mês − 1), para facilitar as contas e as comparações.
 */
const LogicaIpca = (() => {
  const mes = (ano, numero) => ano * 12 + (numero - 1);
  const anoDe = (m) => Math.floor(m / 12);
  const numeroDe = (m) => (m % 12) + 1;

  /** Índices de preços do IBGE (variação mensal, Brasil). primeiroMes é o primeiro mês publicado. */
  const INDICES = {
    IPCA: { nome: "IPCA", agregado: 1737, variavel: 63, primeiroMes: mes(1980, 1) },
    INPC: { nome: "INPC", agregado: 1736, variavel: 44, primeiroMes: mes(1979, 4) },
    IPCA15: { nome: "IPCA-15", agregado: 3065, variavel: 355, primeiroMes: mes(2000, 5) },
  };

  /** Primeiro mês do Plano Real: antes disso os valores estavam em outras moedas. */
  const PLANO_REAL = mes(1994, 7);

  const NOMES_MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];

  /** "202501" → mês; null se não for um período mensal válido. */
  function lerPeriodo(texto) {
    if (typeof texto !== "string" || !/^\d{6}$/.test(texto)) return null;
    const n = Number(texto.slice(4));
    if (n < 1 || n > 12) return null;
    return mes(Number(texto.slice(0, 4)), n);
  }

  const formatarPeriodo = (m) => `${String(anoDe(m)).padStart(4, "0")}${String(numeroDe(m)).padStart(2, "0")}`;

  /** "01/2025", para tabelas e mensagens curtas. */
  const mesCurto = (m) => `${String(numeroDe(m)).padStart(2, "0")}/${anoDe(m)}`;

  /** "janeiro de 2025". */
  const mesLongo = (m) => `${NOMES_MESES[numeroDe(m) - 1]} de ${anoDe(m)}`;

  const mesesInclusivos = (inicio, fim) => Math.max(0, fim - inicio + 1);

  function url(indice, periodos) {
    const i = INDICES[indice];
    return (
      `https://servicodados.ibge.gov.br/api/v3/agregados/${i.agregado}/periodos/${periodos}` +
      `/variaveis/${i.variavel}?localidades=N1%5Ball%5D`
    );
  }

  /** URL da série mensal do índice entre inicio e fim. */
  const urlSerie = (indice, inicio, fim) => url(indice, `${formatarPeriodo(inicio)}-${formatarPeriodo(fim)}`);

  /** URL que retorna apenas o último mês publicado. */
  const urlUltimo = (indice) => url(indice, "-1");

  /**
   * Lê a resposta JSON (texto ou objeto já lido) da API SIDRA v3 e devolve um Map mês →
   * variação em %. Meses sem dado ("...", "-", "X") ficam com null. Lança erro se o formato
   * não for o esperado.
   */
  function lerSerie(json) {
    const raiz = typeof json === "string" ? JSON.parse(json) : json;
    if (!Array.isArray(raiz)) throw new TypeError("Resposta inesperada do IBGE");
    const serie = new Map();
    if (raiz.length === 0) return serie;
    const resultados = raiz[0] && Array.isArray(raiz[0].resultados) ? raiz[0].resultados : [];
    for (const r of resultados) {
      for (const item of Array.isArray(r && r.series) ? r.series : []) {
        const local = item && item.localidade;
        if (local && String(local.id) !== "1") continue; // só Brasil
        const valores = item && item.serie;
        if (!valores || typeof valores !== "object") continue;
        for (const [chave, texto] of Object.entries(valores)) {
          const m = lerPeriodo(chave);
          if (m === null) continue;
          const numero = Number(String(texto).trim().replace(",", "."));
          serie.set(m, String(texto).trim() !== "" && Number.isFinite(numero) ? numero : null);
        }
        return new Map([...serie].sort((a, b) => a[0] - b[0]));
      }
    }
    return serie;
  }

  /** Último mês com valor publicado na série, ou null. */
  function ultimoPublicado(serie) {
    let ultimo = null;
    for (const [m, v] of serie) if (v !== null && (ultimo === null || m > ultimo)) ultimo = m;
    return ultimo;
  }

  /**
   * Acumula as variações mensais de inicio a fim (meses incluídos). Devolve
   * { faltando: mês } se algum mês não tiver valor, ou o resumo.
   */
  function resumir(serie, inicio, fim) {
    if (inicio > fim) throw new RangeError("Mês inicial depois do final");
    const linhas = [];
    let fator = 1;
    for (let m = inicio; m <= fim; m++) {
      const v = serie.get(m);
      if (v === null || v === undefined) return { faltando: m };
      fator *= 1 + v / 100;
      linhas.push({ mes: m, mensal: v, acumulado: (fator - 1) * 100 });
    }
    const meses = linhas.length;
    return {
      linhas,
      fator,
      meses,
      acumulado: (fator - 1) * 100,
      /** Média geométrica mensal em %. */
      mediaMensal: meses === 0 ? 0 : (fator ** (1 / meses) - 1) * 100,
      /** Inflação anualizada (equivalente em 12 meses) em %. */
      anualizada: meses === 0 ? 0 : (fator ** (12 / meses) - 1) * 100,
    };
  }

  /** "corrigir" e "acumulada" multiplicam pelo fator; "deflacionar" divide. */
  const aplicar = (valor, modo, fator) => (modo === "deflacionar" ? valor / fator : valor * fator);

  /** Série como objeto simples { "202501": 0.16 }, para guardar no localStorage. */
  function serieParaObjeto(serie) {
    const objeto = {};
    for (const [m, v] of serie) if (v !== null) objeto[formatarPeriodo(m)] = v;
    return objeto;
  }

  /** Lê de volta o objeto guardado, ignorando chaves e valores inválidos. */
  function objetoParaSerie(objeto) {
    const serie = new Map();
    if (!objeto || typeof objeto !== "object") return serie;
    for (const [chave, v] of Object.entries(objeto)) {
      const m = lerPeriodo(chave);
      if (m !== null && typeof v === "number" && Number.isFinite(v)) serie.set(m, v);
    }
    return serie;
  }

  /** Se todos os meses de inicio a fim estão na série. */
  function cobre(serie, inicio, fim) {
    for (let m = inicio; m <= fim; m++) {
      const v = serie.get(m);
      if (v === null || v === undefined) return false;
    }
    return true;
  }

  return {
    INDICES,
    PLANO_REAL,
    NOMES_MESES,
    mes,
    anoDe,
    numeroDe,
    lerPeriodo,
    formatarPeriodo,
    mesCurto,
    mesLongo,
    mesesInclusivos,
    urlSerie,
    urlUltimo,
    lerSerie,
    ultimoPublicado,
    resumir,
    aplicar,
    serieParaObjeto,
    objetoParaSerie,
    cobre,
  };
})();

if (typeof module === "object") module.exports = LogicaIpca;
