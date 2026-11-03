"use strict";
/*
 * Gerador de números para loterias, com as mesmas modalidades, quantidades e faixas de
 * dados/Loteria.kt e dados/Geradores.kt do app Gerar Números Loteria (times em
 * dados/TimesDoCoracao.kt). O app sorteia com kotlin.random; aqui o sorteio usa
 * crypto.getRandomValues com rejeição, para todos os números terem exatamente a mesma chance.
 *
 * "sorteados" (quantas dezenas a Caixa sorteia em cada concurso) não existe no app: serve só
 * para mostrar a chance da faixa principal, que não muda com números aleatórios.
 */
const LogicaLoteria = (() => {
  const MODALIDADES = [
    { id: "mega-sena", titulo: "Mega-Sena", padrao: 6, min: 6, max: 20, maxValor: 60, sorteados: 6, tipo: "padrao" },
    { id: "quina", titulo: "Quina", padrao: 5, min: 5, max: 15, maxValor: 80, sorteados: 5, tipo: "padrao" },
    { id: "lotofacil", titulo: "Lotofácil", padrao: 15, min: 15, max: 20, maxValor: 25, sorteados: 15, tipo: "padrao" },
    { id: "lotomania", titulo: "Lotomania", padrao: 50, min: 50, max: 50, maxValor: 100, sorteados: 20, tipo: "padrao" },
    {
      id: "timemania",
      titulo: "Timemania",
      padrao: 10,
      min: 10,
      max: 10,
      maxValor: 80,
      sorteados: 7,
      tipo: "padrao",
      timeDoCoracao: true,
    },
    { id: "dupla-sena", titulo: "Dupla Sena", padrao: 6, min: 6, max: 15, maxValor: 50, sorteados: 6, tipo: "padrao" },
    {
      id: "dia-de-sorte",
      titulo: "Dia de Sorte",
      padrao: 7,
      min: 7,
      max: 15,
      maxValor: 31,
      sorteados: 7,
      tipo: "padrao",
      mesDaSorte: true,
    },
    { id: "mais-milionaria", titulo: "+Milionária", padrao: 6, min: 6, max: 6, maxValor: 50, tipo: "mais-milionaria" },
    { id: "super-sete", titulo: "Super Sete", padrao: 7, min: 7, max: 7, maxValor: 9, tipo: "super-sete" },
    { id: "loteca", titulo: "Loteca", padrao: 14, min: 14, max: 14, maxValor: 14, tipo: "loteca" },
  ];

  const MAIS_MILIONARIA_NUMEROS = 6;
  const MAIS_MILIONARIA_MAX_NUMERO = 50;
  const MAIS_MILIONARIA_TREVOS = 2;
  const MAIS_MILIONARIA_MAX_TREVO = 6;
  const SUPER_SETE_COLUNAS = 7;
  const LOTECA_JOGOS = 14;
  const OPCOES_LOTECA = ["1", "X", "2"];

  const MESES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  /** Os 80 clubes que podem ser escolhidos como "Time do Coração" na Timemania. */
  const TIMES = [
    "América Futebol Clube (MG)",
    "Atlético Clube Goianiense (GO)",
    "Atlético Mineiro Futebol Clube (MG)",
    "Avaí Futebol Clube (SC)",
    "Botafogo de Futebol e Regatas (RJ)",
    "Ceará Sporting Clube (CE)",
    "Clube Atlético Bragantino (SP)",
    "Clube Atlético Paranaense (PR)",
    "Clube de Regatas Flamengo (RJ)",
    "Coritiba Foot Ball Club (PR)",
    "Cuiabá Esporte Clube (MT)",
    "Esporte Clube Juventude (RS)",
    "Fluminense Football Club (RJ)",
    "Fortaleza Esporte Clube (CE)",
    "Goiás Esporte Clube (GO)",
    "Santos Futebol Clube (SP)",
    "São Paulo Futebol Clube (SP)",
    "Sociedade Esportiva Palmeiras (SP)",
    "Sport Club Corinthians Paulista (SP)",
    "Sport Club Internacional (RS)",
    "Associação Atlética Ponte Preta (SP)",
    "Associação Chapecoense de Futebol (SC)",
    "Brusque Futebol Clube (SC)",
    "Clube de Regatas Vasco da Gama (RJ)",
    "Clube Náutico Capibaribe (PE)",
    "CRB Clube de Regatas Brasil (AL)",
    "Criciúma Esporte Clube (SC)",
    "Cruzeiro Esporte Clube (MG)",
    "CSA Centro Sportivo Alagoano (AL)",
    "Esporte Clube Bahia (BA)",
    "Grêmio Esportivo Novorizontino (SP)",
    "Grêmio Foot-Ball Porto Alegrense (RS)",
    "Guarani Futebol Clube (SP)",
    "Ituano Futebol Clube (SP)",
    "Londrina Esporte Clube (PR)",
    "Operário Ferroviário Esporte Clube (PR)",
    "Sampaio Corrêa Futebol Clube (MA)",
    "Sport Club do Recife (PE)",
    "Tombense Futebol Clube (MG)",
    "Vila Nova Futebol Clube (GO)",
    "ABC Futebol Clube (RN)",
    "Associação Atlética de Altos (PI)",
    "Associação Atlética Aparecidense (GO)",
    "Associação Desportiva Confiança (SE)",
    "Botafogo Futebol Clube (PB)",
    "Botafogo Futebol Clube (SP)",
    "Campinense Clube (PB)",
    "Clube do Remo (PA)",
    "Esporte Clube São José (RS)",
    "Esporte Clube Vitória (BA)",
    "Ferroviário Atlético Clube (CE)",
    "Figueirense Futebol Clube (SC)",
    "Floresta Esporte Clube (CE)",
    "Futebol Clube Atlético Cearense (CE)",
    "Grêmio Esportivo Brasil (Brasil de Pelotas) (RS)",
    "Manaus Futebol Clube (AM)",
    "Mirassol Futebol Clube (SP)",
    "Paysandu Sport Club (PA)",
    "Volta Redonda Futebol Clube (RJ)",
    "Ypiranga Futebol Clube (RS)",
    "América Futebol Clube (RN)",
    "Associação Ferroviária de Esportes (SP)",
    "Atlético Acreano (AC)",
    "Boa Esporte Clube (MG)",
    "Boavista Sport Club (RJ)",
    "Brasiliense Futebol Clube (DF)",
    "Cianorte Futebol Clube (PR)",
    "Esporte Clube São Bento (SP)",
    "Esporte Clube Jacuipense (BA)",
    "Joinville Esporte Clube (SC)",
    "Luverdense Esporte Clube (MT)",
    "Moto Club (MA)",
    "Oeste Futebol Clube (SP)",
    "Paraná Clube (PR)",
    "Santa Cruz Futebol Clube (PE)",
    "São Raimundo Esporte Clube (RR)",
    "Sociedade Desportiva Juazeirense (BA)",
    "Sociedade Esportiva e Recreativa Caxias do Sul (RS)",
    "Sociedade Imperatriz de Desportos (MA)",
    "Treze Futebol Clube (PB)",
  ];

  const modalidade = (id) => MODALIDADES.find((m) => m.id === id) || null;

  // ---------- Sorteio ----------

  const DOIS_32 = 2 ** 32;

  /** Um inteiro de 32 bits do gerador criptográfico do navegador (ou do node). */
  function uint32Cripto() {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return buffer[0];
  }

  /**
   * Inteiro de 0 a n − 1, todos com a mesma chance. "x % n" sozinho favoreceria os primeiros
   * valores quando 2³² não é múltiplo de n; por isso a sobra do fim da faixa é descartada e o
   * número é sorteado de novo (rejeição).
   */
  function inteiroAte(n, fonte = uint32Cripto) {
    if (!Number.isInteger(n) || n < 1 || n > DOIS_32) throw new RangeError(`Faixa inválida: ${n}`);
    const limite = DOIS_32 - (DOIS_32 % n);
    let x;
    do {
      x = fonte();
    } while (x >= limite);
    return x % n;
  }

  /** [quantidade] números distintos entre 1 e [maxValor], em ordem crescente. */
  function numerosUnicos(quantidade, maxValor, fonte = uint32Cripto) {
    if (!Number.isInteger(quantidade) || !Number.isInteger(maxValor) || quantidade < 0 || quantidade > maxValor) {
      throw new RangeError(`Não dá para sortear ${quantidade} números entre 1 e ${maxValor}`);
    }
    // Fisher–Yates parcial: como tirar bolas de um globo, sem devolver as que já saíram
    const globo = Array.from({ length: maxValor }, (_, i) => i + 1);
    for (let i = 0; i < quantidade; i++) {
      const j = i + inteiroAte(maxValor - i, fonte);
      [globo[i], globo[j]] = [globo[j], globo[i]];
    }
    return globo.slice(0, quantidade).sort((a, b) => a - b);
  }

  const escolher = (lista, fonte = uint32Cripto) => lista[inteiroAte(lista.length, fonte)];

  /** +Milionária: 6 números distintos de 1 a 50. */
  const maisMilionariaNumeros = (fonte) =>
    numerosUnicos(MAIS_MILIONARIA_NUMEROS, MAIS_MILIONARIA_MAX_NUMERO, fonte);

  /** +Milionária: 2 trevos distintos de 1 a 6. */
  const maisMilionariaTrevos = (fonte) => numerosUnicos(MAIS_MILIONARIA_TREVOS, MAIS_MILIONARIA_MAX_TREVO, fonte);

  /** Super Sete: 7 colunas, cada uma com um dígito de 0 a 9 (pode repetir). */
  const superSete = (fonte) => Array.from({ length: SUPER_SETE_COLUNAS }, () => inteiroAte(10, fonte));

  /** Loteca: palpite 1, X ou 2 para cada um dos 14 jogos. */
  const loteca = (fonte) => Array.from({ length: LOTECA_JOGOS }, () => escolher(OPCOES_LOTECA, fonte));

  const mesDaSorte = (fonte) => escolher(MESES, fonte);

  const timeDoCoracao = (fonte) => escolher(TIMES, fonte);

  /** Um jogo completo da modalidade, com o mês ou o time quando ela tiver. */
  function gerar(m, quantidade, fonte = uint32Cripto) {
    const jogo = { modalidade: m.id };
    switch (m.tipo) {
      case "mais-milionaria":
        jogo.numeros = maisMilionariaNumeros(fonte);
        jogo.trevos = maisMilionariaTrevos(fonte);
        break;
      case "super-sete":
        jogo.colunas = superSete(fonte);
        break;
      case "loteca":
        jogo.palpites = loteca(fonte);
        break;
      default:
        jogo.numeros = numerosUnicos(quantidade, m.maxValor, fonte);
    }
    if (m.mesDaSorte) jogo.mes = mesDaSorte(fonte);
    if (m.timeDoCoracao) jogo.time = timeDoCoracao(fonte);
    return jogo;
  }

  // ---------- Quantidade ----------

  /** Filtro do campo: só algarismos, no máximo 3, como no app. */
  const limparQuantidade = (texto) => String(texto ?? "").replace(/\D/g, "").slice(0, 3);

  /** Quantidade digitada, se já estiver na faixa da modalidade; null enquanto não estiver. */
  function lerQuantidade(texto, m) {
    const limpo = limparQuantidade(texto);
    if (!limpo) return null;
    const n = Number(limpo);
    return n >= m.min && n <= m.max ? n : null;
  }

  /** Ao sair do campo: vazio vira o mínimo e fora da faixa é limitado, como no app. */
  function corrigirQuantidade(texto, m) {
    const limpo = limparQuantidade(texto);
    const n = limpo ? Number(limpo) : m.min;
    return Math.min(m.max, Math.max(m.min, n));
  }

  // ---------- Chance ----------

  /** Combinações de n elementos tomados k a k, exatas (BigInt). */
  function combinacoes(n, k) {
    if (k < 0 || k > n) return 0n;
    const menor = Math.min(k, n - k);
    let resultado = 1n;
    for (let i = 1; i <= menor; i++) {
      resultado = (resultado * BigInt(n - menor + i)) / BigInt(i);
    }
    return resultado;
  }

  /** a ÷ b arredondado para o inteiro mais próximo, em BigInt. */
  const dividirArredondando = (a, b) => (2n * a + b) / (2n * b);

  /**
   * N de "1 em N" para acertar a faixa principal com uma aposta de [quantidade] números, ou
   * null na Loteca, em que o resultado depende das partidas e não de um sorteio.
   */
  function chancePrincipal(m, quantidade) {
    switch (m.tipo) {
      case "mais-milionaria":
        return Number(
          combinacoes(MAIS_MILIONARIA_MAX_NUMERO, MAIS_MILIONARIA_NUMEROS) *
            combinacoes(MAIS_MILIONARIA_MAX_TREVO, MAIS_MILIONARIA_TREVOS),
        );
      case "super-sete":
        return 10 ** SUPER_SETE_COLUNAS;
      case "loteca":
        return null;
      default: {
        const total = combinacoes(m.maxValor, m.sorteados);
        const cobertas = combinacoes(quantidade, m.sorteados);
        return cobertas > 0n ? Number(dividirArredondando(total, cobertas)) : null;
      }
    }
  }

  /** Palpites simples possíveis na Loteca: 3¹⁴. */
  const combinacoesLoteca = () => OPCOES_LOTECA.length ** LOTECA_JOGOS;

  const inteiro = (n) => n.toLocaleString("pt-BR");

  /** Frase da chance para a modalidade e a quantidade escolhidas. */
  function textoChance(m, quantidade) {
    if (m.tipo === "loteca") {
      return (
        `Há ${inteiro(combinacoesLoteca())} combinações de palpites simples para os 14 jogos. ` +
        "Como o resultado depende das partidas, não existe uma chance exata para calcular."
      );
    }
    const um = `1 em ${inteiro(chancePrincipal(m, quantidade))}`;
    switch (m.id) {
      case "mais-milionaria":
        return `Chance de acertar os 6 números e os 2 trevos: ${um}.`;
      case "super-sete":
        return `Chance de acertar as 7 colunas: ${um}.`;
      case "dupla-sena":
        return `Chance de acertar os 6 números com esta aposta, em cada um dos dois sorteios: ${um}.`;
      case "dia-de-sorte":
        return `Chance de acertar os 7 números sorteados com esta aposta: ${um}, sem contar o mês da sorte.`;
      default:
        return `Chance de acertar os ${m.sorteados} números sorteados com esta aposta: ${um}.`;
    }
  }

  // ---------- Exibição ----------

  /** Dezenas com dois algarismos, como no volante. Na Lotomania o centésimo número é o 00. */
  function formatarNumero(m, n) {
    if (m.id === "lotomania" && n === 100) return "00";
    return String(n).padStart(2, "0");
  }

  const NOMES_LOTECA = { 1: "coluna 1", X: "empate", 2: "coluna 2" };

  /** Texto do jogo para copiar e colar (bloco de notas, mensagem). */
  function textoDoJogo(m, jogo) {
    const partes = [];
    if (jogo.numeros) partes.push(jogo.numeros.map((n) => formatarNumero(m, n)).join(" "));
    if (jogo.trevos) partes.push(`trevos ${jogo.trevos.join(" ")}`);
    if (jogo.colunas) partes.push(jogo.colunas.map((d, i) => `coluna ${i + 1}: ${d}`).join(", "));
    if (jogo.palpites) partes.push(jogo.palpites.map((p, i) => `jogo ${i + 1}: ${p}`).join(", "));
    if (jogo.mes) partes.push(`mês da sorte ${jogo.mes}`);
    if (jogo.time) partes.push(`time do coração ${jogo.time}`);
    return `${m.titulo}: ${partes.join(" · ")}`;
  }

  // ---------- Preferências ----------

  /** { modalidade, quantidades } válido, a partir do JSON salvo (ou null). */
  function validarPreferencias(dados) {
    if (!dados || typeof dados !== "object") return null;
    const m = modalidade(dados.modalidade) || MODALIDADES[0];
    const quantidades = {};
    if (dados.quantidades && typeof dados.quantidades === "object") {
      for (const item of MODALIDADES) {
        const n = dados.quantidades[item.id];
        if (Number.isInteger(n) && n >= item.min && n <= item.max) quantidades[item.id] = n;
      }
    }
    return { modalidade: m.id, quantidades };
  }

  return {
    MODALIDADES,
    MESES,
    TIMES,
    OPCOES_LOTECA,
    NOMES_LOTECA,
    modalidade,
    inteiroAte,
    numerosUnicos,
    maisMilionariaNumeros,
    maisMilionariaTrevos,
    superSete,
    loteca,
    mesDaSorte,
    timeDoCoracao,
    gerar,
    limparQuantidade,
    lerQuantidade,
    corrigirQuantidade,
    combinacoes,
    chancePrincipal,
    combinacoesLoteca,
    textoChance,
    formatarNumero,
    textoDoJogo,
    validarPreferencias,
  };
})();

if (typeof module === "object") module.exports = LogicaLoteria;
