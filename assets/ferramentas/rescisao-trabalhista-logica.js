"use strict";
/*
 * Rescisão trabalhista (TRCT): saldo de salário, aviso prévio, férias vencidas e proporcionais,
 * 13º proporcional e multa do FGTS, para os quatro desligamentos mais comuns.
 *
 * Regras usadas:
 *  - avos de férias e de 13º: cada mês (ou fração de 15 dias ou mais) do período conta 1/12;
 *  - aviso prévio proporcional: 30 dias + 3 por ano completo, até 90 (Lei 12.506/2011); no acordo
 *    do art. 484-A da CLT ele é indenizado pela metade;
 *  - aviso indenizado projeta o contrato: os dias entram nos avos de férias e de 13º;
 *  - multa do FGTS: 40% sem justa causa, 20% no acordo, nada nos outros casos;
 *  - com justa causa só cabem saldo de salário e férias vencidas.
 *
 * Os descontos (INSS e IRRF) são uma ESTIMATIVA: usam as tabelas de 2026 do salário líquido e a
 * tributação exclusiva na fonte. O TRCT oficial é calculado pelo empregador e pode trazer
 * particularidades (férias gozadas no mês, adiantamentos, plano de saúde e afins).
 */
const LogicaRescisao = (() => {
  /** Tabelas de INSS/IRRF compartilhadas com a calculadora de salário líquido. */
  const Salario =
    typeof LogicaSalarioLiquido === "object"
      ? LogicaSalarioLiquido
      : typeof require === "function"
        ? require("./salario-liquido-logica.js")
        : null;

  const DIAS_AVISO_BASE = 30;
  const DIAS_POR_ANO = 3;
  const DIAS_AVISO_MAXIMO = 90;
  const DIAS_NO_MES = 30;
  const MULTAS_FGTS = { semJustaCausa: 0.4, acordo: 0.2 };

  const TIPOS = Object.freeze({
    semJustaCausa: { id: "semJustaCausa", nome: "Dispensa sem justa causa", aviso: true, multa: true },
    pedido: { id: "pedido", nome: "Pedido de demissão", aviso: false, multa: false },
    justaCausa: { id: "justaCausa", nome: "Dispensa por justa causa", aviso: false, multa: false },
    acordo: { id: "acordo", nome: "Acordo entre as partes (art. 484-A)", aviso: true, multa: true },
  });

  // ---------- Datas ----------

  const ehData = (d) => d && Number.isInteger(d.ano) && Number.isInteger(d.mes) && Number.isInteger(d.dia) && d.mes >= 1 && d.mes <= 12 && d.dia >= 1 && d.dia <= 31;
  const emDias = (d) => Math.floor(Date.UTC(d.ano, d.mes - 1, d.dia) / 86400000);
  const deDias = (dias) => {
    const data = new Date(dias * 86400000);
    return { ano: data.getUTCFullYear(), mes: data.getUTCMonth() + 1, dia: data.getUTCDate() };
  };
  const somarDias = (d, dias) => deDias(emDias(d) + dias);

  /** Soma meses ajustando o dia: 31/01 + 1 mês vira 28/02 (ou 29 em ano bissexto). */
  function somarMeses(d, meses) {
    const total = d.ano * 12 + (d.mes - 1) + meses;
    const ano = Math.floor(total / 12);
    const mes = (total % 12) + 1;
    const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    return { ano, mes, dia: Math.min(d.dia, ultimoDia) };
  }

  const ordem = (a, b) => emDias(a) - emDias(b);
  const anosCompletos = (inicio, fim) => {
    let anos = fim.ano - inicio.ano;
    if (fim.mes < inicio.mes || (fim.mes === inicio.mes && fim.dia < inicio.dia)) anos--;
    return Math.max(0, anos);
  };

  /**
   * Avos (doze avos) entre duas datas: cada mês fechado conta 1 e a sobra de 15 dias ou mais conta
   * como mais um. Nunca passa de 12.
   */
  function avos(inicio, fim) {
    if (!ehData(inicio) || !ehData(fim) || ordem(fim, inicio) < 0) return 0;
    let meses = 0;
    let cursor = { ...inicio };
    let proximo = somarMeses(cursor, 1);
    while (ordem(proximo, fim) <= 0) {
      meses++;
      cursor = proximo;
      proximo = somarMeses(cursor, 1);
    }
    if (emDias(fim) - emDias(cursor) + 1 >= 15) meses++;
    return Math.min(12, meses);
  }

  /** Aniversário de admissão mais recente: início do período aquisitivo de férias em curso. */
  function inicioDoPeriodoAquisitivo(admissao, referencia) {
    const anos = anosCompletos(admissao, referencia);
    return somarMeses(admissao, anos * 12);
  }

  /** Aviso prévio proporcional: 30 dias + 3 por ano completo, até 90. */
  function diasDeAviso(admissao, afastamento) {
    const anos = anosCompletos(admissao, afastamento);
    return Math.min(DIAS_AVISO_MAXIMO, DIAS_AVISO_BASE + DIAS_POR_ANO * anos);
  }

  // ---------- Cálculo ----------

  const centavos = (valor) => Math.round(valor * 100) / 100;

  /**
   * Conta da rescisão. Devolve { incompleto } quando falta dado, { erro } quando a data não fecha,
   * e senão { verbas, descontos, liquido, avos, diasAviso, dataProjetada }.
   */
  function calcular({
    salario = null,
    admissao = null,
    afastamento = null,
    tipo = "semJustaCausa",
    avisoIndenizado = true,
    feriasVencidas = 0,
    saldoFgts = 0,
  } = {}) {
    if (!Number.isFinite(salario) || salario <= 0) return { incompleto: true };
    if (!ehData(admissao) || !ehData(afastamento)) return { incompleto: true };
    if (ordem(afastamento, admissao) < 0) return { erro: "datas" };
    const contrato = TIPOS[tipo];
    if (!contrato) return { erro: "tipo" };

    // Aviso prévio: no acordo é indenizado pela metade (art. 484-A da CLT)
    const diasAviso = contrato.aviso ? diasDeAviso(admissao, afastamento) : 0;
    const diasAvisoPagos = tipo === "acordo" ? Math.floor(diasAviso / 2) : diasAviso;
    const indenizado = contrato.aviso && avisoIndenizado;
    const dataProjetada = indenizado ? somarDias(afastamento, diasAvisoPagos) : afastamento;

    // Saldo de salário: dias trabalhados no mês do afastamento (mês comercial de 30 dias)
    const diasTrabalhados = Math.min(DIAS_NO_MES, afastamento.dia);
    const saldo = (salario / DIAS_NO_MES) * diasTrabalhados;

    // Aviso indenizado entra como verba e projeta férias e 13º
    const aviso = indenizado ? (salario / DIAS_NO_MES) * diasAvisoPagos : 0;

    // Férias: períodos completos não gozados + os avos do período aquisitivo em curso
    const periodosVencidos = Number.isInteger(feriasVencidas) && feriasVencidas > 0 ? Math.min(5, feriasVencidas) : 0;
    const inicioAquisitivo = inicioDoPeriodoAquisitivo(admissao, dataProjetada);
    const avosFerias = avos(inicioAquisitivo, dataProjetada);
    const feriasVencidasValor = periodosVencidos * salario;
    const feriasProporcionais = (salario / 12) * avosFerias;

    // 13º: meses do ano do afastamento (ou desde a admissão, se entrou neste ano)
    const primeiroDiaDoAno = { ano: dataProjetada.ano, mes: 1, dia: 1 };
    const inicioDecimo = ordem(admissao, primeiroDiaDoAno) > 0 ? admissao : primeiroDiaDoAno;
    const avosDecimo = avos(inicioDecimo, dataProjetada);
    const decimo = (salario / 12) * avosDecimo;

    const justaCausa = tipo === "justaCausa";
    const terco = 1 / 3;

    const verbas = {
      saldo: centavos(saldo),
      aviso: centavos(aviso),
      feriasVencidas: centavos(feriasVencidasValor),
      tercoFeriasVencidas: centavos(feriasVencidasValor * terco),
      feriasProporcionais: centavos(justaCausa ? 0 : feriasProporcionais),
      tercoFeriasProporcionais: centavos(justaCausa ? 0 : feriasProporcionais * terco),
      decimo: centavos(justaCausa ? 0 : decimo),
    };
    const multa = contrato.multa && MULTAS_FGTS[tipo] && Number.isFinite(saldoFgts) && saldoFgts > 0 ? saldoFgts * MULTAS_FGTS[tipo] : 0;
    verbas.multaFgts = centavos(multa);
    verbas.total = centavos(
      verbas.saldo +
        verbas.aviso +
        verbas.feriasVencidas +
        verbas.tercoFeriasVencidas +
        verbas.feriasProporcionais +
        verbas.tercoFeriasProporcionais +
        verbas.decimo +
        verbas.multaFgts,
    );

    const descontos = descontosDe(verbas);
    return {
      tipo,
      diasAviso,
      diasAvisoPagos,
      avisoIndenizado: indenizado,
      dataProjetada,
      avos: { ferias: avosFerias, decimo: avosDecimo, feriasVencidas: periodosVencidos },
      diasTrabalhados,
      verbas,
      descontos,
      liquido: centavos(verbas.total - (descontos.total ?? 0)),
      salario,
      referencia: Salario ? Salario.TABELA.referencia : null,
    };
  }

  /**
   * Estimativa de INSS e IRRF. O INSS incide no saldo, nas férias (com o terço) e no 13º; o IRRF é
   * calculado sobre o total tributável, na fonte e de forma exclusiva (sem as deduções do ajuste).
   */
  function descontosDe(verbas) {
    if (!Salario) return { inss: null, irrf: null, total: null, estimativa: false };
    const baseFerias = verbas.feriasVencidas + verbas.tercoFeriasVencidas + verbas.feriasProporcionais + verbas.tercoFeriasProporcionais;
    const inssSaldo = Salario.inss(verbas.saldo).total;
    const inssFerias = Salario.inss(baseFerias).total;
    const inssDecimo = Salario.inss(verbas.decimo).total;
    const inss = centavos(inssSaldo + inssFerias + inssDecimo);
    const tributavel = centavos(Math.max(0, verbas.saldo + verbas.aviso + baseFerias + verbas.decimo));
    const irrf = Salario.irrf(tributavel).valor;
    return { inss, irrf, total: centavos(inss + irrf), tributavel, estimativa: true };
  }

  return { TIPOS, avos, somarMeses, somarDias, emDias, ehData, diasDeAviso, inicioDoPeriodoAquisitivo, calcular, descontosDe };
})();

if (typeof module === "object") module.exports = LogicaRescisao;
