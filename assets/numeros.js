"use strict";
/*
 * Leitura e formatação de números no padrão brasileiro, usadas pelas ferramentas.
 * Mesma regra de util/NumberParsing.kt da Calculadora Multifunção.
 */
const Numeros = (() => {
  /**
   * Converte o texto digitado em número, aceitando vírgula ou ponto como separador decimal.
   * - Com vírgula e ponto juntos, o último que aparece é o decimal ("1.234,56" e "1,234.56").
   * - Um separador repetido é de milhar ("1.000.000").
   * - Um separador só é decimal ("2,5" e "2.5"). Com { milhar: true }, usado em valores em
   *   reais, "1.000" (ponto seguido de 3 dígitos) é mil, como se escreve no Brasil.
   * Retorna null para texto vazio ou inválido.
   */
  function ler(entrada, { milhar = false } = {}) {
    let texto = String(entrada ?? "")
      .trim()
      .replace(/−/g, "-")
      .replace(/[\s  ']/g, "")
      .replace(/^R\$/i, "");
    if (!texto) return null;

    const virgulas = (texto.match(/,/g) || []).length;
    const pontos = (texto.match(/\./g) || []).length;
    if (virgulas && pontos) {
      texto =
        texto.lastIndexOf(",") > texto.lastIndexOf(".")
          ? texto.replace(/\./g, "").replace(",", ".")
          : texto.replace(/,/g, "");
    } else if (virgulas > 1) {
      texto = texto.replace(/,/g, "");
    } else if (pontos > 1) {
      texto = texto.replace(/\./g, "");
    } else if (virgulas === 1) {
      texto = texto.replace(",", ".");
    } else if (milhar && /^[+-]?[1-9]\d{0,2}\.\d{3}$/.test(texto)) {
      texto = texto.replace(".", "");
    }

    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(texto)) return null;
    const valor = Number(texto);
    return Number.isFinite(valor) ? valor : null;
  }

  const formatoMoeda = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const formatos = new Map();

  function numero(valor, casas = 2, minimo = 0) {
    const chave = `${casas}:${minimo}`;
    if (!formatos.has(chave)) {
      formatos.set(
        chave,
        new Intl.NumberFormat("pt-BR", {
          minimumFractionDigits: minimo,
          maximumFractionDigits: casas,
        }),
      );
    }
    return formatos.get(chave).format(valor);
  }

  const dinheiro = (valor) => formatoMoeda.format(valor);

  /** Taxa em decimal (0,01) para texto em porcentagem ("1%"). */
  const porcentagem = (decimal, casas = 4) => `${numero(decimal * 100, casas)}%`;

  return { ler, numero, dinheiro, porcentagem };
})();
