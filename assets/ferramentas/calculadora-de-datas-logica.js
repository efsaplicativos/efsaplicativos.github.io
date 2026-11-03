"use strict";
/*
 * Lógica da calculadora de datas, sem DOM.
 * Portada de core/datas/DateCalculations.kt da Calculadora Multifunção (diferença, somar ou
 * subtrair, dias úteis e informações de uma data), com as regras de java.time que ela usa
 * (Period.between, ChronoUnit.MONTHS, plusMonths respeitando o fim do mês, semana ISO 8601).
 *
 * As datas são números inteiros de dias desde 01/01/1970 no calendário gregoriano, sem hora
 * e sem fuso: não há Date no meio, então não existe o deslocamento de um dia que
 * new Date("2026-01-01") causa no Brasil. Também usada por calculadora-de-idade-logica.js.
 */
const LogicaDatas = (() => {
  const MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const DIAS_SEMANA = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];

  const bissexto = (ano) => (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  const diasNoMes = (ano, mes) => (mes === 2 ? (bissexto(ano) ? 29 : 28) : [4, 6, 9, 11].includes(mes) ? 30 : 31);
  const diasNoAno = (ano) => (bissexto(ano) ? 366 : 365);

  /** Dias desde 01/01/1970 (algoritmo "days from civil", só com inteiros). */
  function deDataCivil(ano, mes, dia) {
    const a = mes <= 2 ? ano - 1 : ano;
    const era = Math.floor(a / 400);
    const anoDaEra = a - era * 400;
    const mesDesdeMarco = (mes + 9) % 12;
    const diaDoAno = Math.floor((153 * mesDesdeMarco + 2) / 5) + dia - 1;
    const diaDaEra = anoDaEra * 365 + Math.floor(anoDaEra / 4) - Math.floor(anoDaEra / 100) + diaDoAno;
    return era * 146097 + diaDaEra - 719468;
  }

  /** Data válida → dias; data inexistente (31/02) → null. */
  function criar(ano, mes, dia) {
    if (![ano, mes, dia].every(Number.isInteger)) return null;
    if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) return null;
    return deDataCivil(ano, mes, dia);
  }

  /** Dias → { ano, mes, dia } (algoritmo "civil from days"). */
  function partes(dias) {
    const z = dias + 719468;
    const era = Math.floor(z / 146097);
    const diaDaEra = z - era * 146097;
    const anoDaEra = Math.floor(
      (diaDaEra - Math.floor(diaDaEra / 1460) + Math.floor(diaDaEra / 36524) - Math.floor(diaDaEra / 146096)) / 365,
    );
    const diaDoAno = diaDaEra - (365 * anoDaEra + Math.floor(anoDaEra / 4) - Math.floor(anoDaEra / 100));
    const mesDesdeMarco = Math.floor((5 * diaDoAno + 2) / 153);
    const dia = diaDoAno - Math.floor((153 * mesDesdeMarco + 2) / 5) + 1;
    const mes = mesDesdeMarco < 10 ? mesDesdeMarco + 3 : mesDesdeMarco - 9;
    const ano = anoDaEra + era * 400 + (mes <= 2 ? 1 : 0);
    return { ano, mes, dia };
  }

  /** "2026-01-31" (valor de <input type="date">) → dias, ou null se vazio/inválido. */
  function lerISO(texto) {
    const m = /^(\d{4,6})-(\d{2})-(\d{2})$/.exec(String(texto ?? "").trim());
    return m ? criar(Number(m[1]), Number(m[2]), Number(m[3])) : null;
  }

  const dois = (n) => String(n).padStart(2, "0");

  function paraISO(dias) {
    const { ano, mes, dia } = partes(dias);
    return `${String(ano).padStart(4, "0")}-${dois(mes)}-${dois(dia)}`;
  }

  /** Hoje no relógio local do aparelho (dia, mês e ano locais, sem passar por UTC). */
  const hoje = (agora = new Date()) => deDataCivil(agora.getFullYear(), agora.getMonth() + 1, agora.getDate());

  /** 1 = segunda … 7 = domingo (ISO 8601). 01/01/1970 foi uma quinta-feira. */
  const diaDaSemana = (dias) => (((dias + 3) % 7) + 7) % 7 + 1;

  /** Soma meses respeitando o fim do mês (31/01 + 1 mês = 28 ou 29/02), como plusMonths. */
  function somarMeses(dias, meses) {
    const { ano, mes, dia } = partes(dias);
    const total = ano * 12 + (mes - 1) + meses;
    const novoAno = Math.floor(total / 12);
    const novoMes = total - novoAno * 12 + 1;
    return deDataCivil(novoAno, novoMes, Math.min(dia, diasNoMes(novoAno, novoMes)));
  }

  const somarAnos = (dias, anos) => somarMeses(dias, anos * 12);

  const mesProleptico = ({ ano, mes }) => ano * 12 + mes - 1;

  /** Meses completos entre as datas, como ChronoUnit.MONTHS.between (trunca em direção a zero). */
  function mesesEntre(inicio, fim) {
    const a = partes(inicio);
    const b = partes(fim);
    return Math.trunc((mesProleptico(b) * 32 + b.dia - (mesProleptico(a) * 32 + a.dia)) / 32);
  }

  /** Anos, meses e dias entre as datas, como Period.between. */
  function periodo(inicio, fim) {
    const a = partes(inicio);
    const b = partes(fim);
    let totalMeses = mesProleptico(b) - mesProleptico(a);
    let dias = b.dia - a.dia;
    if (totalMeses > 0 && dias < 0) {
      totalMeses--;
      dias = fim - somarMeses(inicio, totalMeses);
    } else if (totalMeses < 0 && dias > 0) {
      totalMeses++;
      dias -= diasNoMes(b.ano, b.mes);
    }
    return { anos: Math.trunc(totalMeses / 12), meses: totalMeses % 12 || 0, dias };
  }

  function diaDoAno(dias) {
    const { ano } = partes(dias);
    return dias - deDataCivil(ano, 1, 1) + 1;
  }

  /** Semana do ano ISO 8601: a semana que tem a quinta-feira define o ano. */
  function semanaISO(dias) {
    const quinta = dias - diaDaSemana(dias) + 4;
    const ano = partes(quinta).ano;
    return { semana: Math.floor((quinta - deDataCivil(ano, 1, 1)) / 7) + 1, ano };
  }

  const diaUtil = (dias) => diaDaSemana(dias) <= 5;

  /** Dias de segunda a sexta no intervalo [inicio, fimExclusivo). */
  function diasUteisEntre(inicio, fimExclusivo) {
    if (fimExclusivo <= inicio) return 0;
    const total = fimExclusivo - inicio;
    const semanas = Math.floor(total / 7);
    let contagem = semanas * 5;
    for (let dia = inicio + semanas * 7; dia < fimExclusivo; dia++) if (diaUtil(dia)) contagem++;
    return contagem;
  }

  /**
   * Diferença entre duas datas (a ordem só muda a direção). Com [incluirFinal], o último dia
   * também conta (de 01/01 a 01/01 = 1 dia).
   */
  function diferenca(primeira, segunda, incluirFinal = false) {
    const direcao = segunda > primeira ? "futuro" : segunda < primeira ? "passado" : "igual";
    const inicio = Math.min(primeira, segunda);
    const fim = Math.max(primeira, segunda);
    const fimExclusivo = incluirFinal ? fim + 1 : fim;
    const p = periodo(inicio, fimExclusivo);
    const totalDias = fimExclusivo - inicio;
    const uteis = diasUteisEntre(inicio, fimExclusivo);
    return {
      inicio,
      fim,
      direcao,
      anos: p.anos,
      meses: p.meses,
      dias: p.dias,
      totalDias,
      semanas: Math.floor(totalDias / 7),
      diasRestantesSemana: totalDias % 7,
      totalMeses: mesesEntre(inicio, fimExclusivo),
      totalHoras: totalDias * 24,
      totalMinutos: totalDias * 24 * 60,
      diasUteis: uteis,
      diasFimDeSemana: totalDias - uteis,
    };
  }

  /** Soma (ou subtrai, se negativo) só dias úteis, como DIATRABALHO das planilhas. */
  function somarDiasUteis(dias, quantidade) {
    if (quantidade === 0) return dias;
    const passo = quantidade > 0 ? 1 : -1;
    let falta = Math.abs(quantidade);
    // Quaisquer 7 dias seguidos têm exatamente 5 dias úteis: pula semanas inteiras e deixa
    // pelo menos 1 dia útil para o passo a passo final cair num dia útil.
    const semanas = Math.floor((falta - 1) / 5);
    let atual = dias + semanas * 7 * passo;
    falta -= semanas * 5;
    while (falta > 0) {
      atual += passo;
      if (diaUtil(atual)) falta--;
    }
    return atual;
  }

  /** unidade: "dias", "semanas", "meses" ou "anos". */
  function somar(dias, quantidade, unidade, soDiasUteis = false) {
    switch (unidade) {
      case "dias":
        return soDiasUteis ? somarDiasUteis(dias, quantidade) : dias + quantidade;
      case "semanas":
        return dias + quantidade * 7;
      case "meses":
        return somarMeses(dias, quantidade);
      case "anos":
        return somarAnos(dias, quantidade);
      default:
        throw new Error(`Unidade desconhecida: ${unidade}`);
    }
  }

  function informacoes(dias, diaDeHoje) {
    const { ano, mes } = partes(dias);
    const semana = semanaISO(dias);
    const doAno = diaDoAno(dias);
    return {
      diaDaSemana: diaDaSemana(dias),
      diaDoAno: doAno,
      semanaISO: semana.semana,
      anoDaSemanaISO: semana.ano,
      trimestre: Math.floor((mes - 1) / 3) + 1,
      bissexto: bissexto(ano),
      diasNoMes: diasNoMes(ano, mes),
      diasRestantesNoAno: diasNoAno(ano) - doAno,
      diasDesdeHoje: dias - diaDeHoje,
    };
  }

  // --- Textos em português ------------------------------------------------------------------

  const maiuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
  const nomeDiaSemana = (dias) => maiuscula(DIAS_SEMANA[diaDaSemana(dias) - 1]);

  /** "31 de dezembro de 2026" (1º no primeiro dia do mês, como se escreve no Brasil). */
  function formatarLonga(dias) {
    const { ano, mes, dia } = partes(dias);
    return `${dia === 1 ? "1º" : dia} de ${MESES[mes - 1]} de ${ano}`;
  }

  function formatarCurta(dias) {
    const { ano, mes, dia } = partes(dias);
    return `${dois(dia)}/${dois(mes)}/${ano}`;
  }

  return {
    MESES,
    DIAS_SEMANA,
    bissexto,
    diasNoMes,
    diasNoAno,
    criar,
    partes,
    lerISO,
    paraISO,
    hoje,
    diaDaSemana,
    somarMeses,
    somarAnos,
    mesesEntre,
    periodo,
    diaDoAno,
    semanaISO,
    diaUtil,
    diasUteisEntre,
    diferenca,
    somarDiasUteis,
    somar,
    informacoes,
    nomeDiaSemana,
    formatarLonga,
    formatarCurta,
  };
})();

if (typeof module === "object") module.exports = LogicaDatas;
