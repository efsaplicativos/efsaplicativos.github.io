"use strict";
/*
 * Lógica do relógio de xadrez, sem DOM. Portada de logica/RelogioXadrez.kt,
 * ConfiguracaoTempo.kt, FormatoTempo.kt e Predefinicoes.kt do app Relógio Xadrez.
 *
 * O tempo restante nunca é decrementado a cada "tick": guarda-se o saldo de cada jogador no
 * início do turno e o instante (de agora(), um relógio monotônico como performance.now()) em
 * que o turno começou. O restante é sempre calculado pela diferença, então a frequência de
 * atualização da tela não afeta a precisão.
 */
const LogicaXadrez = (() => {
  const BRANCAS = "brancas";
  const PRETAS = "pretas";
  const JOGADORES = [BRANCAS, PRETAS];
  const oponente = (jogador) => (jogador === BRANCAS ? PRETAS : BRANCAS);

  /** nenhum: só o tempo inicial; fischer: soma o incremento depois do lance; bronstein:
   * devolve o tempo gasto até o incremento; atraso: só desconta depois do atraso do lance. */
  const SISTEMAS = ["nenhum", "fischer", "bronstein", "atraso"];
  const ESTADOS = ["pronto", "ativo", "pausado", "encerrado"];

  const MINUTOS_MIN = 1;
  const MINUTOS_MAX = 600;
  const INCREMENTO_MAX_S = 600;
  const MS_POR_SEGUNDO = 1000;
  const MS_POR_MINUTO = 60000;
  const LIMITE_DECIMOS_MS = 10000;
  const ESPERA_MINIMA_MS = 10;
  const ESPERA_MAXIMA_MS = 250;
  const ESPERA_DURANTE_ATRASO_MS = 50;

  const limitar = (valor, minimo, maximo) => Math.min(Math.max(valor, minimo), maximo);

  // ---------- Configuração ----------

  /** Com o sistema "nenhum" o incremento é sempre zero; valores fora da faixa são limitados. */
  function deMinutos(minutos, incrementoSegundos, sistema) {
    const incremento = sistema === "nenhum" ? 0 : incrementoSegundos;
    return {
      tempoInicialMs: limitar(minutos, MINUTOS_MIN, MINUTOS_MAX) * MS_POR_MINUTO,
      incrementoMs: limitar(incremento, 0, INCREMENTO_MAX_S) * MS_POR_SEGUNDO,
      sistema,
    };
  }

  /** 5 minutos + 2 segundos Fischer, o padrão do app. */
  const PADRAO = deMinutos(5, 2, "fischer");

  const minutos = (configuracao) => Math.floor(configuracao.tempoInicialMs / MS_POR_MINUTO);
  const incrementoSegundos = (configuracao) => Math.floor(configuracao.incrementoMs / MS_POR_SEGUNDO);

  /** Como o toIntOrNull do Kotlin: só um inteiro, sem casas decimais. */
  function lerInteiro(texto) {
    const limpo = String(texto ?? "").trim();
    return /^[+-]?\d{1,9}$/.test(limpo) ? Number(limpo) : null;
  }

  /** Campo de minutos; null quando vazio, não numérico ou fora de 1..600. */
  function lerMinutos(texto) {
    const valor = lerInteiro(texto);
    return valor !== null && valor >= MINUTOS_MIN && valor <= MINUTOS_MAX ? valor : null;
  }

  /** Campo de incremento; null quando vazio, não numérico ou fora de 0..600. */
  function lerIncremento(texto) {
    const valor = lerInteiro(texto);
    return valor !== null && valor >= 0 && valor <= INCREMENTO_MAX_S ? valor : null;
  }

  /** Configuração lida do armazenamento: precisa ter o mesmo formato que deMinutos() produz. */
  function configuracaoValida(c) {
    return (
      !!c &&
      typeof c === "object" &&
      SISTEMAS.includes(c.sistema) &&
      Number.isInteger(c.tempoInicialMs) &&
      c.tempoInicialMs >= MINUTOS_MIN * MS_POR_MINUTO &&
      c.tempoInicialMs <= MINUTOS_MAX * MS_POR_MINUTO &&
      Number.isInteger(c.incrementoMs) &&
      c.incrementoMs >= 0 &&
      c.incrementoMs <= INCREMENTO_MAX_S * MS_POR_SEGUNDO &&
      (c.sistema !== "nenhum" || c.incrementoMs === 0)
    );
  }

  const mesmaConfiguracao = (a, b) =>
    a.tempoInicialMs === b.tempoInicialMs && a.incrementoMs === b.incrementoMs && a.sistema === b.sistema;

  // ---------- Predefinições ----------

  const CATEGORIAS = ["bullet", "blitz", "rapida", "classica"];

  /** Classificação pela duração estimada de uma partida de 40 lances (mesma regra do Lichess). */
  function categoria(minutosIniciais, incremento) {
    const segundosEstimados = minutosIniciais * 60 + 40 * incremento;
    if (segundosEstimados < 180) return "bullet";
    if (segundosEstimados < 480) return "blitz";
    if (segundosEstimados < 1500) return "rapida";
    return "classica";
  }

  const PREDEFINICOES = [
    [1, 0],
    [2, 1],
    [3, 0],
    [3, 2],
    [5, 0],
    [5, 3],
    [10, 0],
    [10, 5],
    [15, 10],
    [30, 0],
    [30, 20],
    [90, 30],
  ].map(([m, s]) => {
    const sistema = s > 0 ? "fischer" : "nenhum";
    return {
      minutos: m,
      incrementoSegundos: s,
      sistema,
      categoria: categoria(m, s),
      configuracao: deMinutos(m, s, sistema),
    };
  });

  // ---------- Formato ----------

  const doisDigitos = (valor) => String(valor).padStart(2, "0");

  /**
   * "4:59", "12:05", "1:30:00"; abaixo de 10 s, "0:09.8". Arredonda para baixo, então
   * "0:00.0" só aparece quando o tempo realmente acabou.
   */
  function formatar(ms) {
    const seguro = Math.max(0, Math.floor(ms));
    if (seguro < LIMITE_DECIMOS_MS) {
      return `0:${doisDigitos(Math.floor(seguro / 1000))}.${Math.floor((seguro % 1000) / 100)}`;
    }
    const totalSegundos = Math.floor(seguro / 1000);
    const horas = Math.floor(totalSegundos / 3600);
    const mins = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    return horas > 0 ? `${horas}:${doisDigitos(mins)}:${doisDigitos(segundos)}` : `${mins}:${doisDigitos(segundos)}`;
  }

  /** Notação usual do xadrez: "5 + 2" (minutos + segundos de incremento). */
  const ritmo = (configuracao) => `${minutos(configuracao)} + ${incrementoSegundos(configuracao)}`;

  // ---------- Relógio ----------

  class Relogio {
    /** agora: função que devolve milissegundos de um relógio monotônico. */
    constructor(configuracao, agora) {
      this.configuracao = configuracao;
      this.agora = agora;
      this.estado = "pronto";
      this.vez = null;
      this.perdedor = null;
      // Saldo no início do turno para quem está na vez; saldo atual para o outro
      this.base = { brancas: 0, pretas: 0 };
      this.contagem = { brancas: 0, pretas: 0 };
      this.usadoAntesDaPausaMs = 0;
      this.inicioTrechoMs = 0;
      this.reiniciar();
    }

    get partidaEmAndamento() {
      return this.estado === "ativo" || this.estado === "pausado";
    }

    lances(jogador) {
      return this.contagem[jogador];
    }

    usadoNoTurnoMs() {
      const trecho = this.estado === "ativo" ? Math.max(0, this.agora() - this.inicioTrechoMs) : 0;
      return this.usadoAntesDaPausaMs + trecho;
    }

    restanteMs(jogador) {
      if (jogador !== this.vez || this.estado === "pronto") return this.base[jogador];
      const usado = this.usadoNoTurnoMs();
      const descontado =
        this.configuracao.sistema === "atraso" ? Math.max(0, usado - this.configuracao.incrementoMs) : usado;
      return Math.max(0, this.base[jogador] - descontado);
    }

    /** Quanto falta do atraso do lance atual (só no sistema "atraso"). */
    atrasoRestanteMs() {
      if (this.configuracao.sistema !== "atraso" || this.vez === null) return 0;
      if (!this.partidaEmAndamento) return 0;
      return Math.max(0, this.configuracao.incrementoMs - this.usadoNoTurnoMs());
    }

    /**
     * Toque na metade do jogador. Antes do início, qualquer metade inicia o relógio das
     * brancas (as brancas sempre jogam primeiro). Durante a partida, o jogador da vez encerra
     * o lance e o relógio do adversário começa a correr; toques na metade de quem não está na
     * vez são ignorados. Devolve true se algo mudou.
     */
    tocar(jogador) {
      switch (this.estado) {
        case "pronto":
          this.iniciar();
          return true;
        case "ativo":
          if (this.verificarQueda()) return true;
          if (jogador !== this.vez) return false;
          this.encerrarLance(jogador);
          return true;
        default:
          return false;
      }
    }

    iniciar() {
      if (this.estado !== "pronto") return;
      this.estado = "ativo";
      this.comecarTurno(BRANCAS);
    }

    pausar() {
      if (this.estado !== "ativo" || this.verificarQueda()) return;
      this.usadoAntesDaPausaMs = this.usadoNoTurnoMs();
      this.estado = "pausado";
    }

    retomar() {
      if (this.estado !== "pausado") return;
      this.inicioTrechoMs = this.agora();
      this.estado = "ativo";
    }

    reiniciar() {
      this.base.brancas = this.configuracao.tempoInicialMs;
      this.base.pretas = this.configuracao.tempoInicialMs;
      this.contagem.brancas = 0;
      this.contagem.pretas = 0;
      this.usadoAntesDaPausaMs = 0;
      this.estado = "pronto";
      this.vez = null;
      this.perdedor = null;
    }

    configurar(nova) {
      this.configuracao = nova;
      this.reiniciar();
    }

    /** Encerra a partida se o tempo de quem está na vez acabou. Devolve true só no momento da queda. */
    verificarQueda() {
      const jogador = this.vez;
      if (this.estado !== "ativo" || jogador === null || this.restanteMs(jogador) > 0) return false;
      this.base[jogador] = 0;
      this.usadoAntesDaPausaMs = 0;
      this.perdedor = jogador;
      this.estado = "encerrado";
      return true;
    }

    /**
     * Quanto esperar até o próximo dígito visível mudar (segundos, ou décimos abaixo de 10 s);
     * serve só para economizar redesenhos, não afeta a contagem.
     */
    msAteProximaMudanca() {
      const jogador = this.vez;
      if (this.estado !== "ativo" || jogador === null) return ESPERA_MAXIMA_MS;
      if (this.atrasoRestanteMs() > 0) return ESPERA_DURANTE_ATRASO_MS;
      const restante = this.restanteMs(jogador);
      const passo = restante <= LIMITE_DECIMOS_MS ? 100 : 1000;
      return limitar((restante % passo) + 1, ESPERA_MINIMA_MS, ESPERA_MAXIMA_MS);
    }

    /** Retrato para salvar; um relógio ativo é salvo como pausado. */
    instantaneo() {
      return {
        configuracao: { ...this.configuracao },
        estado: this.estado === "ativo" ? "pausado" : this.estado,
        vez: this.vez,
        perdedor: this.perdedor,
        baseBrancasMs: this.base.brancas,
        basePretasMs: this.base.pretas,
        lancesBrancas: this.contagem.brancas,
        lancesPretas: this.contagem.pretas,
        usadoNoTurnoMs: this.usadoNoTurnoMs(),
      };
    }

    encerrarLance(jogador) {
      const usado = this.usadoNoTurnoMs();
      const incremento = this.configuracao.incrementoMs;
      const saldo = this.base[jogador];
      switch (this.configuracao.sistema) {
        case "fischer":
          this.base[jogador] = saldo - usado + incremento;
          break;
        case "bronstein":
          this.base[jogador] = saldo - usado + Math.min(usado, incremento);
          break;
        case "atraso":
          this.base[jogador] = saldo - Math.max(0, usado - incremento);
          break;
        default:
          this.base[jogador] = saldo - usado;
      }
      this.contagem[jogador]++;
      this.comecarTurno(oponente(jogador));
    }

    comecarTurno(jogador) {
      this.vez = jogador;
      this.usadoAntesDaPausaMs = 0;
      this.inicioTrechoMs = this.agora();
    }
  }

  const naoNegativo = (valor) => (Number.isFinite(valor) ? Math.max(0, valor) : 0);
  const jogadorOuNulo = (valor) => (valor === BRANCAS || valor === PRETAS ? valor : null);

  /** Recria o relógio de um instantâneo; um relógio que estava ativo volta pausado. */
  function restaurar(instantaneo, agora) {
    const r = new Relogio(instantaneo.configuracao, agora);
    r.base.brancas = naoNegativo(instantaneo.baseBrancasMs);
    r.base.pretas = naoNegativo(instantaneo.basePretasMs);
    r.contagem.brancas = Math.floor(naoNegativo(instantaneo.lancesBrancas));
    r.contagem.pretas = Math.floor(naoNegativo(instantaneo.lancesPretas));
    r.vez = jogadorOuNulo(instantaneo.vez);
    r.perdedor = jogadorOuNulo(instantaneo.perdedor);
    r.usadoAntesDaPausaMs = naoNegativo(instantaneo.usadoNoTurnoMs);
    if (instantaneo.estado === "ativo") {
      r.estado = "pausado";
    } else if (instantaneo.estado !== "pronto" && r.vez === null) {
      // Estado incoerente (dados corrompidos): volta ao início
      r.reiniciar();
    } else {
      r.estado = instantaneo.estado;
    }
    return r;
  }

  /** Valida um instantâneo lido do armazenamento; null quando o formato não confere. */
  function lerInstantaneo(dados) {
    if (!dados || typeof dados !== "object") return null;
    if (!configuracaoValida(dados.configuracao) || !ESTADOS.includes(dados.estado)) return null;
    const numeros = ["baseBrancasMs", "basePretasMs", "lancesBrancas", "lancesPretas", "usadoNoTurnoMs"];
    if (!numeros.every((campo) => Number.isFinite(dados[campo]) && dados[campo] >= 0)) return null;
    if (dados.vez !== null && !JOGADORES.includes(dados.vez)) return null;
    if (dados.perdedor !== null && !JOGADORES.includes(dados.perdedor)) return null;
    return {
      configuracao: { ...dados.configuracao },
      estado: dados.estado,
      vez: dados.vez,
      perdedor: dados.perdedor,
      baseBrancasMs: dados.baseBrancasMs,
      basePretasMs: dados.basePretasMs,
      lancesBrancas: Math.floor(dados.lancesBrancas),
      lancesPretas: Math.floor(dados.lancesPretas),
      usadoNoTurnoMs: dados.usadoNoTurnoMs,
    };
  }

  return {
    BRANCAS,
    PRETAS,
    oponente,
    SISTEMAS,
    CATEGORIAS,
    MINUTOS_MIN,
    MINUTOS_MAX,
    INCREMENTO_MAX_S,
    LIMITE_DECIMOS_MS,
    PADRAO,
    PREDEFINICOES,
    deMinutos,
    minutos,
    incrementoSegundos,
    lerMinutos,
    lerIncremento,
    configuracaoValida,
    mesmaConfiguracao,
    categoria,
    formatar,
    ritmo,
    Relogio,
    restaurar,
    lerInstantaneo,
  };
})();

if (typeof module === "object") module.exports = LogicaXadrez;
