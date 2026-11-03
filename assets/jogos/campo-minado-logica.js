"use strict";
/*
 * Regras do Campo Minado, portadas de logica/RegrasCampoMinado.kt, logica/Tabuleiro.kt,
 * logica/Dificuldade.kt e dados/Recordes.kt do app Campo Minado (com.emerson1981.campominado).
 * As minas só são sorteadas no primeiro toque, longe da casa tocada e das vizinhas dela, então a
 * primeira jogada sempre abre uma área vazia. Todas as funções devolvem um tabuleiro novo, ou o
 * mesmo objeto quando a jogada não vale (a interface usa isso para saber se algo mudou).
 */
const LogicaCampoMinado = (() => {
  /** Os três níveis do app, com os mesmos tamanhos e quantidades de minas. */
  const NIVEIS = {
    facil: { id: "facil", nome: "Fácil", linhas: 10, colunas: 6, minas: 10, descricao: "Ideal para iniciantes" },
    medio: { id: "medio", nome: "Médio", linhas: 15, colunas: 10, minas: 25, descricao: "Desafio equilibrado" },
    dificil: { id: "dificil", nome: "Difícil", linhas: 20, colunas: 15, minas: 50, descricao: "Para especialistas" },
  };

  const LIMITE_RECORDES = 50;

  // Estados das casas e da partida
  const COBERTA = "coberta";
  const REVELADA = "revelada";
  const MARCADA = "marcada";
  const JOGANDO = "jogando";
  const VENCEU = "venceu";
  const PERDEU = "perdeu";

  function vazio(linhas, colunas, minas) {
    if (!(linhas > 0 && colunas > 0)) throw new Error("Tabuleiro sem células");
    if (!(minas >= 1 && minas < linhas * colunas)) throw new Error("Quantidade de minas inválida");
    return {
      linhas,
      colunas,
      totalMinas: minas,
      celulas: Array.from({ length: linhas * colunas }, () => ({ mina: false, vizinhas: 0, estado: COBERTA })),
      minasDistribuidas: false,
      status: JOGANDO,
      explodida: -1,
    };
  }

  const doNivel = (nivel) => vazio(nivel.linhas, nivel.colunas, nivel.minas);

  const dentro = (t, linha, coluna) => linha >= 0 && linha < t.linhas && coluna >= 0 && coluna < t.colunas;
  const indice = (t, linha, coluna) => linha * t.colunas + coluna;

  function vizinhos(t, i) {
    const l = Math.floor(i / t.colunas);
    const c = i % t.colunas;
    const lista = [];
    for (let dl = -1; dl <= 1; dl++) {
      for (let dc = -1; dc <= 1; dc++) {
        if ((dl || dc) && dentro(t, l + dl, c + dc)) lista.push(indice(t, l + dl, c + dc));
      }
    }
    return lista;
  }

  const contar = (t, estado) => t.celulas.reduce((n, c) => n + (c.estado === estado ? 1 : 0), 0);
  const reveladas = (t) => contar(t, REVELADA);
  const bandeiras = (t) => contar(t, MARCADA);
  const seguras = (t) => t.linhas * t.colunas - t.totalMinas;
  /** Pode ficar negativo quando o jogador marca mais casas do que há minas (como no clássico). */
  const minasRestantes = (t) => t.totalMinas - bandeiras(t);

  function embaralhar(lista, aleatorio) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  /**
   * Sorteia as minas evitando a casa do primeiro toque e as vizinhas dela. Se não houver espaço,
   * evita só a própria casa.
   */
  function distribuirMinas(t, primeiroToque, aleatorio = Math.random) {
    const total = t.linhas * t.colunas;
    const protegidas = new Set([primeiroToque, ...vizinhos(t, primeiroToque)]);
    let candidatas = [];
    for (let i = 0; i < total; i++) if (!protegidas.has(i)) candidatas.push(i);
    if (candidatas.length < t.totalMinas) {
      candidatas = [];
      for (let i = 0; i < total; i++) if (i !== primeiroToque) candidatas.push(i);
    }
    const minas = new Set(embaralhar(candidatas, aleatorio).slice(0, t.totalMinas));
    const celulas = t.celulas.map((celula, i) => ({
      ...celula,
      mina: minas.has(i),
      vizinhas: vizinhos(t, i).filter((v) => minas.has(v)).length,
    }));
    return { ...t, celulas, minasDistribuidas: true };
  }

  /** Abre a casa e, se ela não tiver minas ao redor, espalha a abertura (busca em largura). */
  function abrirArea(t, celulas, inicio) {
    celulas[inicio] = { ...celulas[inicio], estado: REVELADA };
    if (celulas[inicio].vizinhas !== 0) return;
    const fila = [inicio];
    while (fila.length) {
      for (const v of vizinhos(t, fila.shift())) {
        const vizinha = celulas[v];
        // Bandeiras não são abertas automaticamente, como no clássico
        if (vizinha.estado !== COBERTA || vizinha.mina) continue;
        celulas[v] = { ...vizinha, estado: REVELADA };
        if (vizinha.vizinhas === 0) fila.push(v);
      }
    }
  }

  /** Derrota: mostra as minas não marcadas; bandeiras erradas continuam, para a tela indicar. */
  function explodir(t, i) {
    const celulas = t.celulas.map((c) => (c.mina && c.estado === COBERTA ? { ...c, estado: REVELADA } : c));
    return { ...t, celulas, status: PERDEU, explodida: i };
  }

  /** Vitória quando todas as casas sem mina foram abertas; as minas restantes recebem bandeira. */
  function verificarVitoria(t) {
    if (reveladas(t) < seguras(t)) return t;
    const celulas = t.celulas.map((c) => (c.mina ? { ...c, estado: MARCADA } : c));
    return { ...t, celulas, status: VENCEU };
  }

  function revelar(t, linha, coluna, aleatorio = Math.random) {
    if (t.status !== JOGANDO || !dentro(t, linha, coluna)) return t;
    const i = indice(t, linha, coluna);
    if (t.celulas[i].estado !== COBERTA) return t;
    const base = t.minasDistribuidas ? t : distribuirMinas(t, i, aleatorio);
    if (base.celulas[i].mina) return explodir(base, i);
    const celulas = base.celulas.slice();
    abrirArea(base, celulas, i);
    return verificarVitoria({ ...base, celulas });
  }

  function alternarBandeira(t, linha, coluna) {
    if (t.status !== JOGANDO || !dentro(t, linha, coluna)) return t;
    const i = indice(t, linha, coluna);
    const celula = t.celulas[i];
    if (celula.estado === REVELADA) return t;
    const celulas = t.celulas.slice();
    celulas[i] = { ...celula, estado: celula.estado === COBERTA ? MARCADA : COBERTA };
    return { ...t, celulas };
  }

  function podeRevelarVizinhas(t, linha, coluna) {
    if (t.status !== JOGANDO || !dentro(t, linha, coluna)) return false;
    const i = indice(t, linha, coluna);
    const celula = t.celulas[i];
    if (celula.estado !== REVELADA || celula.vizinhas === 0) return false;
    const lista = vizinhos(t, i);
    return (
      lista.filter((v) => t.celulas[v].estado === MARCADA).length === celula.vizinhas &&
      lista.some((v) => t.celulas[v].estado === COBERTA)
    );
  }

  /**
   * Toque num número já aberto: se a quantidade de bandeiras ao redor for igual ao número, abre
   * todas as vizinhas cobertas (com uma bandeira no lugar errado, explode).
   */
  function revelarVizinhas(t, linha, coluna) {
    if (!podeRevelarVizinhas(t, linha, coluna)) return t;
    const i = indice(t, linha, coluna);
    const cobertas = vizinhos(t, i).filter((v) => t.celulas[v].estado === COBERTA);
    const mina = cobertas.find((v) => t.celulas[v].mina);
    if (mina !== undefined) return explodir(t, mina);
    const celulas = t.celulas.slice();
    for (const v of cobertas) if (celulas[v].estado === COBERTA) abrirArea(t, celulas, v);
    return verificarVitoria({ ...t, celulas });
  }

  /** Confere um tabuleiro lido do armazenamento (tamanho do nível, minas e contagens coerentes). */
  function valido(t, nivel) {
    if (!t || typeof t !== "object" || !nivel) return false;
    if (t.linhas !== nivel.linhas || t.colunas !== nivel.colunas || t.totalMinas !== nivel.minas) return false;
    if (!Array.isArray(t.celulas) || t.celulas.length !== nivel.linhas * nivel.colunas) return false;
    if (t.status !== JOGANDO || typeof t.minasDistribuidas !== "boolean") return false;
    const estados = new Set([COBERTA, REVELADA, MARCADA]);
    let minas = 0;
    for (const [i, c] of t.celulas.entries()) {
      if (!c || typeof c.mina !== "boolean" || !estados.has(c.estado)) return false;
      if (c.mina) minas++;
      if (c.mina && c.estado === REVELADA) return false;
      if (t.minasDistribuidas && c.vizinhas !== vizinhos(t, i).filter((v) => t.celulas[v].mina).length) return false;
    }
    return t.minasDistribuidas ? minas === t.totalMinas : minas === 0 && reveladas(t) === 0;
  }

  // ---------- Recordes ----------

  /** Melhores tempos do nível: menor tempo primeiro; no empate, a vitória mais antiga. */
  function ranking(lista, nivelId) {
    return lista
      .filter((r) => r.nivel === nivelId)
      .sort((a, b) => a.tempo - b.tempo || a.dataMs - b.dataMs);
  }

  function melhorTempo(lista, nivelId) {
    const tempos = lista.filter((r) => r.nivel === nivelId).map((r) => r.tempo);
    return tempos.length ? Math.min(...tempos) : null;
  }

  /** Acrescenta o recorde mantendo só os 50 melhores tempos de cada nível. */
  function adicionarRecorde(lista, novo) {
    const todos = [...lista, novo];
    return Object.keys(NIVEIS).flatMap((id) => ranking(todos, id).slice(0, LIMITE_RECORDES));
  }

  /** Lê a lista gravada; itens com nível desconhecido ou tempo inválido são descartados. */
  function lerRecordes(dados) {
    if (!Array.isArray(dados)) return [];
    return dados
      .filter(
        (r) =>
          r &&
          Object.hasOwn(NIVEIS, r.nivel) &&
          Number.isInteger(r.tempo) &&
          r.tempo >= 0 &&
          Number.isFinite(r.dataMs),
      )
      .map((r) => ({ nivel: r.nivel, tempo: r.tempo, dataMs: r.dataMs }));
  }

  /** "mm:ss" (ou "h:mm:ss" a partir de uma hora). */
  function formatarTempo(segundos) {
    const s = Math.max(0, Math.floor(segundos));
    const horas = Math.floor(s / 3600);
    const minutos = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const resto = String(s % 60).padStart(2, "0");
    return horas > 0 ? `${horas}:${minutos}:${resto}` : `${minutos}:${resto}`;
  }

  return {
    NIVEIS,
    LIMITE_RECORDES,
    COBERTA,
    REVELADA,
    MARCADA,
    JOGANDO,
    VENCEU,
    PERDEU,
    vazio,
    doNivel,
    dentro,
    indice,
    vizinhos,
    reveladas,
    bandeiras,
    seguras,
    minasRestantes,
    distribuirMinas,
    revelar,
    alternarBandeira,
    podeRevelarVizinhas,
    revelarVizinhas,
    valido,
    ranking,
    melhorTempo,
    adicionarRecorde,
    lerRecordes,
    formatarTempo,
  };
})();

if (typeof module === "object") module.exports = LogicaCampoMinado;
