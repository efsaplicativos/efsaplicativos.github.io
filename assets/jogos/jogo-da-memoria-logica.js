"use strict";
/*
 * Jogo da memória portado de logica/JogoDaMemoria.kt, logica/Emojis.kt, logica/TabelaRecordes.kt,
 * logica/Formatacao.kt e dados/Dificuldade.kt do app Jogo da Memória (com.emerson1981.jogodamemoria).
 * Cada par de cartas viradas conta um movimento; um par errado fica à mostra por 1 segundo e
 * volta para baixo. Recordes: menor tempo, depois menos movimentos, depois o mais antigo.
 */
const LogicaMemoria = (() => {
  /** Níveis do app ([chave] é a do app antigo, "easy"/"medium"/"hard"). */
  const NIVEIS = {
    facil: { id: "facil", chave: "easy", nome: "Fácil", colunas: 4, linhas: 4 },
    medio: { id: "medio", chave: "medium", nome: "Médio", colunas: 6, linhas: 6 },
    dificil: { id: "dificil", chave: "hard", nome: "Difícil", colunas: 8, linhas: 8 },
  };
  const totalCartas = (nivel) => nivel.colunas * nivel.linhas;
  const pares = (nivel) => totalCartas(nivel) / 2;

  const ESPERA_DESVIRAR_MS = 1000;
  const LIMITE_RECORDES = 10;

  /**
   * Emojis do app: sem os quase idênticos (🐶/🐕, 🐯/🐅...) nem os criados depois do Unicode 9,
   * que aparecem como "□" em aparelhos antigos.
   */
  const EMOJIS = [
    "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
    "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤", "🦆",
    "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋",
    "🐌", "🐞", "🐜", "🕷️", "🕸️", "🦂", "🐢", "🐍", "🦎", "🐙",
    "🦑", "🦐", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🦈", "🐊",
    "🐆", "🦍", "🐘", "🦏", "🐪", "🐃", "🐑", "🐐", "🦌",
  ];

  function embaralhar(lista, aleatorio) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  /** Sorteia os emojis da partida, cria dois de cada e embaralha (Fisher–Yates). */
  function gerarCartas(nivel, aleatorio = Math.random) {
    const escolhidos = embaralhar(EMOJIS, aleatorio).slice(0, pares(nivel));
    return embaralhar(escolhidos.flatMap((e) => [e, e]), aleatorio).map((emoji, id) => ({
      id,
      emoji,
      virada: false,
      encontrada: false,
    }));
  }

  function novoJogo(nivel, aleatorio = Math.random) {
    return { nivel: nivel.id, cartas: gerarCartas(nivel, aleatorio), selecionadas: [], movimentos: 0, segundos: 0, iniciado: false };
  }

  const paresEncontrados = (estado) => estado.cartas.filter((c) => c.encontrada).length / 2;
  const concluido = (estado) => estado.cartas.length > 0 && estado.cartas.every((c) => c.encontrada);
  /** Duas cartas diferentes estão viradas e esperam para voltar. */
  const aguardandoDesvirar = (estado) => estado.selecionadas.length === 2;
  const formamPar = (a, b) => a.id !== b.id && a.emoji === b.emoji;

  /**
   * Vira a carta. Devolve null quando o toque deve ser ignorado: carta já virada ou encontrada,
   * par errado ainda à mostra ou jogo encerrado.
   */
  function virar(estado, id) {
    const carta = estado.cartas.find((c) => c.id === id);
    if (!carta || carta.virada || carta.encontrada || aguardandoDesvirar(estado) || concluido(estado)) return null;
    const cartas = estado.cartas.map((c) => (c.id === id ? { ...c, virada: true } : c));
    const selecionadas = [...estado.selecionadas, id];
    if (selecionadas.length < 2) return { ...estado, cartas, selecionadas, iniciado: true };

    const primeira = cartas.find((c) => c.id === selecionadas[0]);
    const segunda = cartas.find((c) => c.id === selecionadas[1]);
    const movimentos = estado.movimentos + 1;
    if (formamPar(primeira, segunda)) {
      return {
        ...estado,
        cartas: cartas.map((c) => (c.id === primeira.id || c.id === segunda.id ? { ...c, encontrada: true } : c)),
        selecionadas: [],
        movimentos,
        iniciado: true,
      };
    }
    return { ...estado, cartas, selecionadas, movimentos, iniciado: true };
  }

  /** Desvira o par errado que estava à mostra. */
  function desvirar(estado) {
    if (!estado.selecionadas.length) return estado;
    const ids = new Set(estado.selecionadas);
    return {
      ...estado,
      cartas: estado.cartas.map((c) => (ids.has(c.id) && !c.encontrada ? { ...c, virada: false } : c)),
      selecionadas: [],
    };
  }

  const avancarSegundo = (estado) =>
    estado.iniciado && !concluido(estado) ? { ...estado, segundos: estado.segundos + 1 } : estado;

  /**
   * Reconstrói uma partida salva. Cartas viradas sem par voltam para baixo. Devolve null se os
   * dados não batem com o nível.
   */
  function restaurar(nivelId, emojis, encontradas, movimentos, segundos, iniciado) {
    const nivel = NIVEIS[nivelId];
    if (!nivel || !Array.isArray(emojis) || !Array.isArray(encontradas)) return null;
    if (emojis.length !== totalCartas(nivel) || encontradas.length !== emojis.length) return null;
    const contagem = new Map();
    for (const e of emojis) {
      if (typeof e !== "string" || !EMOJIS.includes(e)) return null;
      contagem.set(e, (contagem.get(e) || 0) + 1);
    }
    if ([...contagem.values()].some((n) => n !== 2)) return null;
    // As duas cartas de um par estão encontradas ou não juntas
    for (const e of contagem.keys()) {
      const marcadas = emojis.filter((x, i) => x === e && encontradas[i] === true).length;
      if (marcadas === 1) return null;
    }
    return {
      nivel: nivelId,
      cartas: emojis.map((emoji, id) => ({ id, emoji, virada: encontradas[id] === true, encontrada: encontradas[id] === true })),
      selecionadas: [],
      movimentos: Math.max(0, Number.isInteger(movimentos) ? movimentos : 0),
      segundos: Math.max(0, Number.isInteger(segundos) ? segundos : 0),
      iniciado: iniciado === true,
    };
  }

  /** Forma compacta para o armazenamento. */
  const paraSalvar = (estado) => ({
    nivel: estado.nivel,
    emojis: estado.cartas.map((c) => c.emoji),
    encontradas: estado.cartas.map((c) => c.encontrada),
    movimentos: estado.movimentos,
    segundos: estado.segundos,
    iniciado: estado.iniciado,
  });

  // ---------- Recordes ----------

  /** Menor tempo vence; com o mesmo tempo, menos movimentos; empate total, quem fez primeiro. */
  const ordem = (a, b) => a.segundos - b.segundos || a.movimentos - b.movimentos || a.dataMs - b.dataMs;

  /** Coloca o resultado na tabela; posicao (1 = melhor) é null se ele ficou fora do top 10. */
  function inserirRecorde(tabela, novo, limite = LIMITE_RECORDES) {
    const ordenada = [...tabela, novo].sort(ordem).slice(0, limite);
    const indice = ordenada.indexOf(novo);
    return { tabela: ordenada, posicao: indice >= 0 ? indice + 1 : null };
  }

  function lerRecordes(dados) {
    if (!Array.isArray(dados)) return [];
    return dados
      .filter((r) => r && Number.isInteger(r.segundos) && r.segundos >= 0 && Number.isInteger(r.movimentos) && r.movimentos >= 0)
      .map((r) => ({ segundos: r.segundos, movimentos: r.movimentos, dataMs: Number.isFinite(r.dataMs) ? r.dataMs : 0 }))
      .sort(ordem)
      .slice(0, LIMITE_RECORDES);
  }

  /** "mm:ss" (os minutos passam de 59 em partidas muito longas, como no app). */
  function formatarTempo(segundos) {
    const total = Math.max(0, Math.floor(segundos));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  const textoMovimentos = (n) => (n === 1 ? "1 movimento" : `${n} movimentos`);
  const resumoRecorde = (r) => `${formatarTempo(r.segundos)} · ${textoMovimentos(r.movimentos)}`;

  return {
    NIVEIS,
    EMOJIS,
    ESPERA_DESVIRAR_MS,
    LIMITE_RECORDES,
    totalCartas,
    pares,
    gerarCartas,
    novoJogo,
    paresEncontrados,
    concluido,
    aguardandoDesvirar,
    formamPar,
    virar,
    desvirar,
    avancarSegundo,
    restaurar,
    paraSalvar,
    inserirRecorde,
    lerRecordes,
    formatarTempo,
    textoMovimentos,
    resumoRecorde,
  };
})();

if (typeof module === "object") module.exports = LogicaMemoria;
