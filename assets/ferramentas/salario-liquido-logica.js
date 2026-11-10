"use strict";
/*
 * Salário líquido: do bruto para o líquido, com INSS progressivo, IRRF mensal e a redução do
 * imposto criada para 2026.
 *
 * As tabelas ficam aqui, num bloco só, para a manutenção ser simples quando o governo mudar os
 * valores. Referência: INSS pela Portaria Interministerial MPS/MF nº 13, de 09/01/2026 (vigente de
 * 01/01/2026 a 31/12/2026), IRRF pela tabela progressiva mensal vigente e a redução do imposto do
 * art. 3º-A da Lei nº 9.250/1995, incluído pela Lei nº 15.270/2025 (efeitos desde 01/01/2026).
 * Confira os valores vigentes antes de confiar no resultado de outro ano.
 */
const LogicaSalarioLiquido = (() => {
  const TABELA = Object.freeze({
    referencia: "2026",
    // Contribuição do empregado: progressiva, faixa a faixa, com teto no último valor.
    // "deducao" é a parcela da fórmula curta (salário × alíquota − dedução), que dá o mesmo valor.
    inss: Object.freeze([
      { ate: 1621.0, aliquota: 0.075, deducao: 0 },
      { ate: 2902.84, aliquota: 0.09, deducao: 24.32 },
      { ate: 4354.27, aliquota: 0.12, deducao: 111.4 },
      { ate: 8475.55, aliquota: 0.14, deducao: 198.49 },
    ]),
    // Imposto de Renda na fonte: alíquota sobre a base, menos a parcela a deduzir
    irrf: Object.freeze([
      { ate: 2428.8, aliquota: 0, deducao: 0 },
      { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
      { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
      { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
      { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
    ]),
    /** Dedução mensal por dependente legal. */
    dependente: 189.59,
    /** Desconto simplificado mensal: substitui todas as deduções legais. */
    simplificado: 607.2,
    /**
     * Redução mensal do imposto (art. 3º-A da Lei 9.250/1995, incluído pela Lei 15.270/2025):
     * R$ 312,89 fixos até R$ 5.000,00 de rendimento, caindo em linha reta (R$ 978,62 − 0,133145 ×
     * rendimento) até zerar em R$ 7.350,00. Acima disso, não há redução (§ 2º).
     */
    reducao: Object.freeze({
      isencao: 5000.0,
      valor: 312.89,
      ate: 7350.0,
      base: 978.62,
      coeficiente: 0.133145,
    }),
  });

  const centavos = (valor) => Math.round(valor * 100) / 100;
  const tetoInss = () => TABELA.inss[TABELA.inss.length - 1].ate;

  /** INSS progressivo: cada faixa é tributada só na parte que cai dentro dela. */
  function inss(bruto) {
    const faixas = [];
    if (!Number.isFinite(bruto) || bruto <= 0) return { total: 0, faixas, teto: tetoInss() };
    let total = 0;
    let anterior = 0;
    for (const faixa of TABELA.inss) {
      if (bruto <= anterior) break;
      const ate = Math.min(bruto, faixa.ate);
      const base = ate - anterior;
      if (base > 0) {
        const contribuicao = base * faixa.aliquota;
        total += contribuicao;
        faixas.push({ de: anterior, ate, aliquota: faixa.aliquota, base, contribuicao: centavos(contribuicao) });
      }
      anterior = faixa.ate;
    }
    return { total: centavos(total), faixas, teto: tetoInss() };
  }

  /** IRRF sobre uma base já deduzida: alíquota pela faixa, menos a parcela a deduzir. */
  function irrf(base) {
    if (!Number.isFinite(base) || base <= 0) return { valor: 0, aliquota: 0, deducao: 0 };
    const faixa = TABELA.irrf.find((f) => base <= f.ate) || TABELA.irrf[TABELA.irrf.length - 1];
    const valor = Math.max(0, base * faixa.aliquota - faixa.deducao);
    return { valor: centavos(valor), aliquota: faixa.aliquota, deducao: faixa.deducao };
  }

  /**
   * Redução mensal do imposto (a partir de 01/2026): R$ 312,89 fixos até R$ 5.000,00 de rendimento,
   * caindo em linha reta até zerar em R$ 7.350,00. Acima disso, não há redução.
   */
  function reducaoMensal(rendimento) {
    const r = TABELA.reducao;
    if (!Number.isFinite(rendimento) || rendimento <= 0) return 0;
    if (rendimento <= r.isencao) return r.valor;
    if (rendimento >= r.ate) return 0;
    return centavos(Math.max(0, r.base - r.coeficiente * rendimento));
  }

  /**
   * Conta completa do mês. Compara a tributação com as deduções legais (INSS, dependentes e
   * pensão) com a do desconto simplificado, e usa a que resultar em menos imposto — que é o que o
   * próprio recibo faz. Depois aplica a redução mensal do imposto de 2026. Devolve { incompleto }
   * quando falta o salário bruto.
   */
  function calcular({ bruto = null, dependentes = 0, pensao = 0, outros = 0 } = {}) {
    if (!Number.isFinite(bruto) || bruto <= 0) return { incompleto: true };
    const quantosDependentes = Number.isFinite(dependentes) && dependentes > 0 ? Math.floor(dependentes) : 0;
    const valorPensao = Number.isFinite(pensao) && pensao > 0 ? pensao : 0;
    const outrosDescontos = Number.isFinite(outros) && outros > 0 ? outros : 0;

    const contribuicao = inss(bruto);
    const deducaoDependentes = centavos(quantosDependentes * TABELA.dependente);
    const baseLegal = Math.max(0, bruto - contribuicao.total - deducaoDependentes - valorPensao);
    const baseSimplificada = Math.max(0, bruto - TABELA.simplificado);

    const reducao = reducaoMensal(bruto);
    const legal = irrf(baseLegal);
    const simplificado = irrf(baseSimplificada);
    // A redução vale nos dois caminhos, então a comparação continua justa
    const valorLegal = centavos(Math.max(0, legal.valor - reducao));
    const valorSimplificado = centavos(Math.max(0, simplificado.valor - reducao));

    const usaSimplificado = valorSimplificado < valorLegal;
    const escolhido = usaSimplificado ? simplificado : legal;
    const imposto = usaSimplificado ? valorSimplificado : valorLegal;
    const base = usaSimplificado ? baseSimplificada : baseLegal;

    const totalDescontos = centavos(contribuicao.total + imposto + valorPensao + outrosDescontos);
    return {
      bruto,
      inss: contribuicao,
      irrf: {
        base,
        valor: imposto,
        aliquota: escolhido.aliquota,
        deducao: escolhido.deducao,
        antesDaReducao: centavos(escolhido.valor),
        reducao,
        usaSimplificado,
      },
      dependentes: quantosDependentes,
      deducaoDependentes,
      pensao: valorPensao,
      outros: outrosDescontos,
      baseLegal: centavos(baseLegal),
      baseSimplificada: centavos(baseSimplificada),
      totalDescontos,
      liquido: centavos(bruto - totalDescontos),
      referencia: TABELA.referencia,
    };
  }

  return { TABELA, tetoInss, inss, irrf, reducaoMensal, calcular };
})();

if (typeof module === "object") module.exports = LogicaSalarioLiquido;
