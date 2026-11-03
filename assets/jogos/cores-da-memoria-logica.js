"use strict";
/*
 * Cores da Memória portado de logica/Jogo.kt, Pontuacao.kt, Dificuldade.kt, Cor.kt,
 * TabelaRecordes.kt e CodecPartida.kt do app Cores da Memória (com.emerson1981.coresmemoria).
 * A cada rodada completa a sequência ganha uma cor; um erro ou o fim do prazo custa uma vida e
 * a mesma sequência é repetida. As transições são funções puras; os tempos ficam na interface.
 */
const LogicaCores = (() => {
  /** As quatro cores, na ordem do tabuleiro (vermelho e verde em cima). */
  const CORES = ["vermelho", "verde", "amarelo", "azul"];
  const NOMES_CORES = { vermelho: "Vermelho", verde: "Verde", amarelo: "Amarelo", azul: "Azul" };

  /** Os mesmos tempos, vidas e multiplicadores do app. */
  const NIVEIS = {
    facil: { id: "facil", chave: "easy", nome: "Fácil", atrasoSequenciaMs: 800, tempoRespostaMs: 8000, vidas: 3, aceleracaoMs: 10, atrasoMinimoMs: 400, multiplicador: 1.0 },
    normal: { id: "normal", chave: "normal", nome: "Normal", atrasoSequenciaMs: 600, tempoRespostaMs: 6000, vidas: 2, aceleracaoMs: 20, atrasoMinimoMs: 300, multiplicador: 1.5 },
    dificil: { id: "dificil", chave: "hard", nome: "Difícil", atrasoSequenciaMs: 400, tempoRespostaMs: 4000, vidas: 1, aceleracaoMs: 30, atrasoMinimoMs: 200, multiplicador: 2.0 },
    expert: { id: "expert", chave: "expert", nome: "Expert", atrasoSequenciaMs: 300, tempoRespostaMs: 3000, vidas: 1, aceleracaoMs: 40, atrasoMinimoMs: 150, multiplicador: 3.0 },
  };

  const FASES = {
    PRONTO: "pronto",
    MOSTRANDO: "mostrando",
    AGUARDANDO: "aguardando",
    ACERTOU: "acertou",
    ERROU: "errou",
    TEMPO_ESGOTADO: "tempo-esgotado",
    /** Perdeu uma vida e a sequência vai ser repetida. */
    NOVA_CHANCE: "nova-chance",
    PAUSADO: "pausado",
    FIM: "fim",
  };
  const F = FASES;

  const RESULTADOS = { IGNORADO: "ignorado", ACERTO: "acerto", RODADA_COMPLETA: "rodada-completa", ERRO: "erro" };

  const PONTOS_BASE = 10;
  const BONUS_COMBO = 1.5;
  const LIMITE_RECORDES = 10;

  const sortear = (aleatorio = Math.random) => CORES[Math.floor(aleatorio() * CORES.length)];

  const emAndamento = (fase) => fase !== F.PRONTO && fase !== F.FIM;

  // ---------- Pontuação ----------

  /** Pontos por completar uma rodada com o combo (rodadas seguidas sem erro, já contando esta). */
  function pontosDaRodada(combo, nivel) {
    const bonus = combo > 3 ? Math.floor(combo / 3) * BONUS_COMBO : 1.0;
    return Math.round(PONTOS_BASE * nivel.multiplicador * bonus);
  }

  /** Espera antes de cada cor da sequência: fica mais curta a cada 5 rodadas. */
  function atrasoSequencia(nivel, rodada) {
    const reducao = Math.floor(rodada / 5) * nivel.aceleracaoMs;
    return Math.max(nivel.atrasoMinimoMs, nivel.atrasoSequenciaMs - reducao);
  }

  // ---------- Estado ----------

  function estadoInicial(nivel) {
    return {
      nivel: nivel.id,
      sequencia: [],
      acertos: 0,
      pontos: 0,
      vidas: nivel.vidas,
      combo: 0,
      maiorCombo: 0,
      rodada: 0,
      fase: F.PRONTO,
      retomarAguardando: false,
    };
  }

  const novo = (nivel, primeira) => ({ ...estadoInicial(nivel), sequencia: [primeira], rodada: 1, fase: F.MOSTRANDO });

  const rodadasCompletas = (estado) => Math.max(0, estado.rodada - 1);

  /** Toque numa cor; devolve { estado, resultado }. `proxima` sorteia a cor nova da sequência. */
  function tocar(estado, cor, proxima) {
    if (estado.fase !== F.AGUARDANDO || estado.acertos >= estado.sequencia.length) {
      return { estado, resultado: RESULTADOS.IGNORADO };
    }
    if (estado.sequencia[estado.acertos] !== cor) {
      return { estado: { ...estado, fase: F.ERROU, combo: 0 }, resultado: RESULTADOS.ERRO };
    }
    if (estado.acertos + 1 < estado.sequencia.length) {
      return { estado: { ...estado, acertos: estado.acertos + 1 }, resultado: RESULTADOS.ACERTO };
    }
    const combo = estado.combo + 1;
    return {
      estado: {
        ...estado,
        sequencia: [...estado.sequencia, proxima()],
        acertos: 0,
        pontos: estado.pontos + pontosDaRodada(combo, NIVEIS[estado.nivel]),
        combo,
        maiorCombo: Math.max(estado.maiorCombo, combo),
        rodada: estado.rodada + 1,
        fase: F.ACERTOU,
      },
      resultado: RESULTADOS.RODADA_COMPLETA,
    };
  }

  const esgotarTempo = (estado) =>
    estado.fase === F.AGUARDANDO ? { ...estado, fase: F.TEMPO_ESGOTADO, combo: 0 } : estado;

  function perderVida(estado) {
    const restantes = estado.vidas - 1;
    if (restantes <= 0) return { ...estado, vidas: 0, fase: F.FIM, combo: 0, acertos: 0 };
    return { ...estado, vidas: restantes, fase: F.NOVA_CHANCE, combo: 0, acertos: 0 };
  }

  const mostrar = (estado) => ({ ...estado, fase: F.MOSTRANDO, acertos: 0, retomarAguardando: false });
  const aguardar = (estado) => ({ ...estado, fase: F.AGUARDANDO, retomarAguardando: false });

  /**
   * Um erro já cometido continua valendo (a vida é descontada mesmo pausando logo depois).
   * Pausado no meio da resposta, o jogador continua de onde parou.
   */
  function pausar(estado) {
    switch (estado.fase) {
      case F.ERROU:
      case F.TEMPO_ESGOTADO: {
        const depois = perderVida(estado);
        return depois.fase === F.FIM ? depois : { ...depois, fase: F.PAUSADO };
      }
      case F.AGUARDANDO:
        return { ...estado, fase: F.PAUSADO, retomarAguardando: true };
      case F.MOSTRANDO:
      case F.ACERTOU:
      case F.NOVA_CHANCE:
        return { ...estado, fase: F.PAUSADO, acertos: 0, retomarAguardando: false };
      default:
        return estado;
    }
  }

  // ---------- Partida salva ----------
  // Formato do app: "rodada;pontos;vidas;combo;maiorCombo;sequência" (sequência = índices das cores).

  function paraTexto(estado) {
    if (!emAndamento(estado.fase) || estado.sequencia.length === 0) return null;
    const cores = estado.sequencia.map((c) => CORES.indexOf(c)).join("");
    return [estado.rodada, estado.pontos, estado.vidas, estado.combo, estado.maiorCombo].join(";") + ";" + cores;
  }

  function deTexto(texto, nivel) {
    if (typeof texto !== "string") return null;
    const partes = texto.split(";");
    if (partes.length !== 6) return null;
    const numeros = partes.slice(0, 5).map((p) => (/^-?\d+$/.test(p) ? Number(p) : NaN));
    if (numeros.some(Number.isNaN)) return null;
    const [rodada, pontos, vidas, combo, maiorCombo] = numeros;
    if (!/^[0-3]+$/.test(partes[5])) return null;
    const sequencia = Array.from(partes[5], (c) => CORES[Number(c)]);
    if (rodada < 1 || vidas < 1 || vidas > nivel.vidas || pontos < 0) return null;
    return {
      ...estadoInicial(nivel),
      sequencia,
      pontos,
      vidas,
      combo: Math.max(0, combo),
      maiorCombo: Math.max(maiorCombo, combo),
      rodada,
      fase: F.PAUSADO,
    };
  }

  // ---------- Recordes ----------

  /** Maior pontuação primeiro; no empate, quem chegou lá antes (sem data conta como mais antigo). */
  const ordem = (a, b) => b.pontos - a.pontos || (a.dataMs ?? -Infinity) - (b.dataMs ?? -Infinity);

  /** Coloca a partida na tabela se couber no top 10; posicao é 1 para o novo recorde e null se não entrou. */
  function inserirRecorde(tabela, nova, limite = LIMITE_RECORDES) {
    if (nova.pontos <= 0) return { tabela, posicao: null };
    const ordenada = [...tabela, nova].sort(ordem);
    const indice = ordenada.indexOf(nova);
    if (indice < limite) return { tabela: ordenada.slice(0, limite), posicao: indice + 1 };
    return { tabela: tabela.slice().sort(ordem).slice(0, limite), posicao: null };
  }

  const melhor = (tabela) => tabela.reduce((m, p) => Math.max(m, p.pontos), 0);

  function lerRecordes(dados) {
    if (!Array.isArray(dados)) return [];
    const inteiroOuNulo = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
    return dados
      .filter((p) => p && Number.isInteger(p.pontos) && p.pontos > 0)
      .map((p) => ({
        pontos: p.pontos,
        rodadas: inteiroOuNulo(p.rodadas),
        maiorCombo: inteiroOuNulo(p.maiorCombo),
        dataMs: Number.isFinite(p.dataMs) ? p.dataMs : null,
      }))
      .sort(ordem)
      .slice(0, LIMITE_RECORDES);
  }

  return {
    CORES,
    NOMES_CORES,
    NIVEIS,
    FASES,
    RESULTADOS,
    PONTOS_BASE,
    LIMITE_RECORDES,
    sortear,
    emAndamento,
    pontosDaRodada,
    atrasoSequencia,
    estadoInicial,
    novo,
    rodadasCompletas,
    tocar,
    esgotarTempo,
    perderVida,
    mostrar,
    aguardar,
    pausar,
    paraTexto,
    deTexto,
    inserirRecorde,
    melhor,
    lerRecordes,
  };
})();

if (typeof module === "object") module.exports = LogicaCores;
