"use strict";
/*
 * Férias e 13º salário, com os descontos calculados como o empregador faz.
 *
 * Férias:
 *  - o valor dos dias é salário ÷ 30 × dias, mais o terço constitucional;
 *  - o abono pecuniário (venda de 10 dias) é pago com o terço, mas NÃO sofre INSS nem IRRF;
 *  - INSS e IRRF incidem sobre férias + terço, no mês das férias.
 *
 * 13º:
 *  - valor = salário ÷ 12 × avos (meses trabalhados no ano);
 *  - o INSS do 13º é calculado à parte e também reduz a base do imposto;
 *  - o IRRF é exclusivo na fonte, e desde 2026 a redução do art. 3º-A da Lei 9.250/1995 (incluído
 *    pela Lei 15.270/2025, § 3º) também vale para o décimo terceiro;
 *  - a 1ª parcela é metade do bruto, sem descontos; os descontos saem na 2ª.
 */
const LogicaFerias13 = (() => {
  const Salario =
    typeof LogicaSalarioLiquido === "object"
      ? LogicaSalarioLiquido
      : typeof require === "function"
        ? require("./salario-liquido-logica.js")
        : null;

  const DIAS_DO_MES = 30;
  const DIAS_DE_FERIAS = 30;
  const DIAS_DE_ABONO = 10;
  const MESES_DO_ANO = 12;

  const centavos = (valor) => Math.round(valor * 100) / 100;
  const limitar = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));

  /** IRRF de um rendimento tributável, já com a redução mensal de 2026 (Lei 15.270/2025). */
  function impostoDe(rendimento, base) {
    if (!Salario) return { valor: 0, tabela: 0, reducao: 0 };
    const tabela = Salario.irrf(base).valor;
    const reducao = Salario.reducaoMensal(rendimento);
    return { valor: centavos(Math.max(0, tabela - reducao)), tabela, reducao };
  }

  /**
   * Férias de `dias` (1 a 30), com a opção de vender 10 dias (abono pecuniário).
   * Devolve { incompleto } sem salário válido.
   */
  function ferias({ salario = null, dias = DIAS_DE_FERIAS, abonar = false } = {}) {
    if (!Number.isFinite(salario) || salario <= 0) return { incompleto: true };
    const quantosDias = Number.isFinite(dias) ? limitar(Math.round(dias), 1, DIAS_DE_FERIAS) : DIAS_DE_FERIAS;

    const valorDias = (salario / DIAS_DO_MES) * quantosDias;
    const terco = valorDias / 3;
    const tributavel = centavos(valorDias + terco);
    const abono = abonar ? (salario / DIAS_DO_MES) * DIAS_DE_ABONO : 0;
    const tercoAbono = abono / 3;

    const inss = Salario ? Salario.inss(tributavel).total : 0;
    const baseIrrf = centavos(Math.max(0, tributavel - inss));
    const irrf = impostoDe(tributavel, baseIrrf);

    const bruto = centavos(valorDias + terco + abono + tercoAbono);
    return {
      dias: quantosDias,
      abono: centavos(abono),
      tercoAbono: centavos(tercoAbono),
      ferias: centavos(valorDias),
      terco: centavos(terco),
      bruto,
      tributavel,
      inss: centavos(inss),
      irrf: irrf.valor,
      irrfTabela: irrf.tabela,
      reducao: irrf.reducao,
      descontos: centavos(inss + irrf.valor),
      liquido: centavos(bruto - inss - irrf.valor),
      referencia: Salario ? Salario.TABELA.referencia : null,
    };
  }

  /**
   * 13º de `avos` meses (1 a 12). `parcela`: "total", "primeira" ou "segunda".
   * Devolve { incompleto } sem salário válido.
   */
  function decimoTerceiro({ salario = null, avos = MESES_DO_ANO, parcela = "total" } = {}) {
    if (!Number.isFinite(salario) || salario <= 0) return { incompleto: true };
    const quantosAvos = Number.isFinite(avos) ? limitar(Math.round(avos), 1, MESES_DO_ANO) : MESES_DO_ANO;

    const bruto = centavos((salario / MESES_DO_ANO) * quantosAvos);
    const inss = Salario ? Salario.inss(bruto).total : 0;
    // No 13º o INSS também é descontado da base do imposto
    const baseIrrf = centavos(Math.max(0, bruto - inss));
    const irrf = impostoDe(bruto, baseIrrf);

    const primeira = centavos(bruto / 2);
    const valor = parcela === "primeira" ? primeira : parcela === "segunda" ? centavos(bruto - primeira - inss - irrf.valor) : centavos(bruto - inss - irrf.valor);

    return {
      avos: quantosAvos,
      parcela,
      bruto,
      primeira,
      inss: centavos(inss),
      irrf: irrf.valor,
      irrfTabela: irrf.tabela,
      reducao: irrf.reducao,
      descontos: centavos(inss + irrf.valor),
      liquido: centavos(bruto - inss - irrf.valor),
      valor,
      referencia: Salario ? Salario.TABELA.referencia : null,
    };
  }

  return { DIAS_DE_FERIAS, DIAS_DE_ABONO, MESES_DO_ANO, ferias, decimoTerceiro };
})();

if (typeof module === "object") module.exports = LogicaFerias13;
