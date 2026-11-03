"use strict";
/*
 * Lógica do cronômetro e do temporizador, sem DOM.
 * Portada de core/cronometro/Chrono.kt da Calculadora Multifunção: estados imutáveis e
 * todas as funções recebem o instante atual ([agora], em ms). O tempo é sempre a diferença
 * entre instantes, nunca uma soma de "tiques", por isso não atrasa com a aba em segundo plano.
 */
const LogicaCronometro = (() => {
  const DURACAO_PADRAO_MS = 5 * 60000;
  const DURACAO_MAXIMA_MS = 100 * 3600000 - 1000; // 99:59:59

  const limitar = (valor, minimo, maximo) => Math.min(Math.max(valor, minimo), maximo);

  // --- Cronômetro ---------------------------------------------------------------------------

  const cronometroInicial = () => ({ rodando: false, iniciadoEm: 0, acumuladoMs: 0, voltas: [] });

  const decorrido = (c, agora) => c.acumuladoMs + (c.rodando ? Math.max(agora - c.iniciadoEm, 0) : 0);

  const cronometroZerado = (c) => !c.rodando && c.acumuladoMs === 0 && c.voltas.length === 0;

  const iniciarCronometro = (c, agora) => (c.rodando ? c : { ...c, rodando: true, iniciadoEm: agora });

  const pausarCronometro = (c, agora) => (c.rodando ? { ...c, rodando: false, acumuladoMs: decorrido(c, agora) } : c);

  function marcarVolta(c, agora) {
    const total = decorrido(c, agora);
    const anterior = c.voltas.length ? c.voltas[c.voltas.length - 1].totalMs : 0;
    return { ...c, voltas: [...c.voltas, { numero: c.voltas.length + 1, voltaMs: total - anterior, totalMs: total }] };
  }

  /** Índices da volta mais rápida e da mais lenta; null com menos de 2 voltas ou se forem iguais. */
  function melhorEPiorVolta(c) {
    if (c.voltas.length < 2) return null;
    let melhor = 0;
    let pior = 0;
    c.voltas.forEach((v, i) => {
      if (v.voltaMs < c.voltas[melhor].voltaMs) melhor = i;
      if (v.voltaMs > c.voltas[pior].voltaMs) pior = i;
    });
    return melhor === pior ? null : { melhor, pior };
  }

  // --- Temporizador -------------------------------------------------------------------------

  const timerInicial = (totalMs = DURACAO_PADRAO_MS) => definirDuracao(null, totalMs);

  /** Nova duração (0 a 99:59:59) e contagem parada no início. */
  function definirDuracao(_t, ms) {
    const valor = limitar(Math.round(ms) || 0, 0, DURACAO_MAXIMA_MS);
    return { totalMs: valor, rodando: false, terminaEm: 0, restantePausadoMs: valor, terminado: false };
  }

  const restante = (t, agora) => (t.rodando ? Math.max(t.terminaEm - agora, 0) : t.restantePausadoMs);

  const progresso = (t, agora) => (t.totalMs <= 0 ? 0 : limitar(restante(t, agora) / t.totalMs, 0, 1));

  /** Pronto para começar do zero (nem rodando nem pausado no meio). */
  const timerOcioso = (t) => !t.rodando && (t.restantePausadoMs === t.totalMs || t.terminado);

  function iniciarTimer(t, agora) {
    if (t.rodando) return t;
    const falta = t.terminado || t.restantePausadoMs <= 0 ? t.totalMs : t.restantePausadoMs;
    if (falta <= 0) return t;
    return { ...t, rodando: true, terminaEm: agora + falta, terminado: false };
  }

  const pausarTimer = (t, agora) => (t.rodando ? { ...t, rodando: false, restantePausadoMs: restante(t, agora) } : t);

  const reiniciarTimer = (t) => ({ ...t, rodando: false, restantePausadoMs: t.totalMs, terminado: false });

  /** Acrescenta 1 minuto (ou [ms]) à contagem atual. */
  function somarTempo(t, agora, ms = 60000) {
    if (t.rodando) return { ...t, terminaEm: t.terminaEm + ms, totalMs: Math.min(t.totalMs + ms, DURACAO_MAXIMA_MS) };
    if (t.terminado) return definirDuracao(null, ms);
    return {
      ...t,
      restantePausadoMs: t.restantePausadoMs + ms,
      totalMs: Math.max(t.totalMs, t.restantePausadoMs + ms),
    };
  }

  /** Marca como concluído se o tempo acabou; devolve o mesmo objeto se ainda não terminou. */
  const verificarFim = (t, agora) =>
    t.rodando && agora >= t.terminaEm ? { ...t, rodando: false, restantePausadoMs: 0, terminado: true } : t;

  // --- Formatação ---------------------------------------------------------------------------

  const dois = (n) => String(n).padStart(2, "0");

  /** Cronômetro: "mm:ss.cc" abaixo de 1 hora e "h:mm:ss.cc" acima. */
  function formatarCronometro(ms) {
    const centesimosTotais = Math.floor(Math.max(ms, 0) / 10);
    const cs = centesimosTotais % 100;
    const segundosTotais = Math.floor(centesimosTotais / 100);
    const s = segundosTotais % 60;
    const m = Math.floor(segundosTotais / 60) % 60;
    const h = Math.floor(segundosTotais / 3600);
    return h > 0 ? `${h}:${dois(m)}:${dois(s)}.${dois(cs)}` : `${dois(m)}:${dois(s)}.${dois(cs)}`;
  }

  /** Temporizador: "hh:mm:ss", arredondando os segundos para cima (00:00:01 até zerar). */
  function formatarTimer(ms) {
    const segundosTotais = Math.floor((Math.max(ms, 0) + 999) / 1000);
    const s = segundosTotais % 60;
    const m = Math.floor(segundosTotais / 60) % 60;
    const h = Math.floor(segundosTotais / 3600);
    return `${dois(h)}:${dois(m)}:${dois(s)}`;
  }

  const duracaoMs = (horas, minutos, segundos) =>
    limitar((horas * 3600 + minutos * 60 + segundos) * 1000, 0, DURACAO_MAXIMA_MS);

  // --- Estado salvo -------------------------------------------------------------------------

  const inteiro = (v) => Number.isSafeInteger(v);

  /** Valida o cronômetro lido do localStorage; devolve null se o JSON não tiver o formato esperado. */
  function validarCronometro(dado) {
    if (!dado || typeof dado !== "object") return null;
    const { rodando, iniciadoEm, acumuladoMs, voltas } = dado;
    if (typeof rodando !== "boolean" || !inteiro(iniciadoEm) || !inteiro(acumuladoMs) || acumuladoMs < 0) return null;
    if (!Array.isArray(voltas)) return null;
    const ok = voltas.every(
      (v, i) => v && v.numero === i + 1 && inteiro(v.voltaMs) && v.voltaMs >= 0 && inteiro(v.totalMs) && v.totalMs >= 0,
    );
    if (!ok) return null;
    return { rodando, iniciadoEm, acumuladoMs, voltas: voltas.map(({ numero, voltaMs, totalMs }) => ({ numero, voltaMs, totalMs })) };
  }

  function validarTimer(dado) {
    if (!dado || typeof dado !== "object") return null;
    const { totalMs, rodando, terminaEm, restantePausadoMs, terminado } = dado;
    if (!inteiro(totalMs) || totalMs < 0 || totalMs > DURACAO_MAXIMA_MS) return null;
    if (typeof rodando !== "boolean" || typeof terminado !== "boolean" || !inteiro(terminaEm)) return null;
    if (!inteiro(restantePausadoMs) || restantePausadoMs < 0) return null;
    return { totalMs, rodando, terminaEm, restantePausadoMs, terminado };
  }

  return {
    DURACAO_PADRAO_MS,
    DURACAO_MAXIMA_MS,
    cronometroInicial,
    decorrido,
    cronometroZerado,
    iniciarCronometro,
    pausarCronometro,
    marcarVolta,
    melhorEPiorVolta,
    timerInicial,
    definirDuracao,
    restante,
    progresso,
    timerOcioso,
    iniciarTimer,
    pausarTimer,
    reiniciarTimer,
    somarTempo,
    verificarFim,
    formatarCronometro,
    formatarTimer,
    duracaoMs,
    validarCronometro,
    validarTimer,
  };
})();

if (typeof module === "object") module.exports = LogicaCronometro;
