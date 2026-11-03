"use strict";
/*
 * Lógica da calculadora de idade, sem DOM.
 * Portada de core/idade/AgeCalculator.kt da Calculadora Multifunção: idade exata, próximo
 * aniversário (29/02 vira 28/02 nos anos não bissextos), signo, horóscopo chinês e geração.
 * Usa as datas em dias de calculadora-de-datas-logica.js (carregue-o antes no navegador).
 */
const LogicaIdade = (() => {
  const D = typeof LogicaDatas === "object" ? LogicaDatas : require("./calculadora-de-datas-logica.js");

  const SIGNOS = [
    { id: "aries", nome: "Áries", simbolo: "♈" },
    { id: "touro", nome: "Touro", simbolo: "♉" },
    { id: "gemeos", nome: "Gêmeos", simbolo: "♊" },
    { id: "cancer", nome: "Câncer", simbolo: "♋" },
    { id: "leao", nome: "Leão", simbolo: "♌" },
    { id: "virgem", nome: "Virgem", simbolo: "♍" },
    { id: "libra", nome: "Libra", simbolo: "♎" },
    { id: "escorpiao", nome: "Escorpião", simbolo: "♏" },
    { id: "sagitario", nome: "Sagitário", simbolo: "♐" },
    { id: "capricornio", nome: "Capricórnio", simbolo: "♑" },
    { id: "aquario", nome: "Aquário", simbolo: "♒" },
    { id: "peixes", nome: "Peixes", simbolo: "♓" },
  ];

  const ANIMAIS_CHINESES = [
    "Rato", "Boi", "Tigre", "Coelho", "Dragão", "Serpente",
    "Cavalo", "Cabra", "Macaco", "Galo", "Cão", "Porco",
  ];

  const GERACOES = [
    { nome: "Grande Geração", de: 1901, ate: 1927 },
    { nome: "Geração Silenciosa", de: 1928, ate: 1945 },
    { nome: "Baby Boomers", de: 1946, ate: 1964 },
    { nome: "Geração X", de: 1965, ate: 1980 },
    { nome: "Millennials (Geração Y)", de: 1981, ate: 1996 },
    { nome: "Geração Z", de: 1997, ate: 2012 },
    { nome: "Geração Alfa", de: 2013, ate: 2024 },
    { nome: "Geração Beta", de: 2025, ate: 2039 },
  ];

  /** Data do aniversário em [ano] (29/02 vira 28/02 em anos não bissextos), como MonthDay.atYear. */
  function aniversario(nascimento, ano) {
    const { mes, dia } = D.partes(nascimento);
    return D.criar(ano, mes, Math.min(dia, D.diasNoMes(ano, mes)));
  }

  function signo(dias) {
    const { mes, dia } = D.partes(dias);
    const md = mes * 100 + dia;
    const indice =
      md >= 1222 || md <= 119 ? 9
      : md <= 218 ? 10
      : md <= 320 ? 11
      : md <= 419 ? 0
      : md <= 520 ? 1
      : md <= 620 ? 2
      : md <= 722 ? 3
      : md <= 822 ? 4
      : md <= 922 ? 5
      : md <= 1022 ? 6
      : md <= 1121 ? 7
      : 8;
    return SIGNOS[indice];
  }

  /**
   * Animal do horóscopo chinês. O Ano-Novo Lunar cai entre 21/01 e 20/02: antes de 21/01 a
   * pessoa é com certeza do ano anterior; entre essas datas o resultado é aproximado.
   */
  function signoChines(dias) {
    const { ano, mes, dia } = D.partes(dias);
    const md = mes * 100 + dia;
    const anoLunar = md < 121 ? ano - 1 : ano;
    const indice = (((anoLunar - 4) % 12) + 12) % 12;
    return { animal: ANIMAIS_CHINESES[indice], incerto: md >= 121 && md <= 220 };
  }

  const geracao = (ano) => GERACOES.find((g) => ano >= g.de && ano <= g.ate) || null;

  /** Lança RangeError se o nascimento for depois da data de referência. */
  function calcular(nascimento, referencia) {
    if (nascimento > referencia) throw new RangeError("Data de nascimento depois da data de referência");
    const n = D.partes(nascimento);
    const r = D.partes(referencia);

    let anos = r.ano - n.ano;
    if (aniversario(nascimento, r.ano) > referencia) anos--;
    const ultimoAniversario = aniversario(nascimento, n.ano + anos);

    let meses = D.mesesEntre(ultimoAniversario, referencia);
    if (meses > 11) meses = 11; // só acontece na véspera de um aniversário de 29/02
    const dias = referencia - D.somarMeses(ultimoAniversario, meses);

    const totalDias = referencia - nascimento;
    const aniversarioHoje = aniversario(nascimento, r.ano) === referencia && referencia !== nascimento;
    let anoProximo = r.ano;
    if (aniversario(nascimento, anoProximo) <= referencia) anoProximo++;
    const proximo = aniversario(nascimento, anoProximo);

    return {
      anos,
      meses,
      dias,
      totalMeses: D.mesesEntre(nascimento, referencia),
      totalSemanas: Math.floor(totalDias / 7),
      totalDias,
      totalHoras: totalDias * 24,
      aniversarioHoje,
      proximoAniversario: proximo,
      diasAteAniversario: proximo - referencia,
      idadeNoProximo: anoProximo - n.ano,
      proximoAjustado: n.mes === 2 && n.dia === 29 && D.partes(proximo).dia === 28,
      diaDaSemanaNascimento: D.diaDaSemana(nascimento),
      signo: signo(nascimento),
      signoChines: signoChines(nascimento),
      geracao: geracao(n.ano),
    };
  }

  return { SIGNOS, ANIMAIS_CHINESES, GERACOES, aniversario, signo, signoChines, geracao, calcular };
})();

if (typeof module === "object") module.exports = LogicaIdade;
