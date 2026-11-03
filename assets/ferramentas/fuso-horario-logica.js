"use strict";
/*
 * Lógica do fuso horário, sem DOM.
 * Portada de core/fuso/TimeZones.kt da Calculadora Multifunção: fusos IANA "Região/Cidade",
 * deslocamento em relação ao UTC, horário de verão, diferença entre fusos e conversão de uma
 * data e hora local (com horários inexistentes ou repetidos na mudança de horário).
 *
 * As regras de cada fuso vêm do próprio navegador, por Intl.DateTimeFormat com timeZone
 * IANA, que já considera o horário de verão de cada data. As datas locais são calculadas a
 * partir das partes (ano, mês, dia, hora) e de Date.UTC, sem depender do fuso do aparelho.
 */
const LogicaFuso = (() => {
  const REGIOES = [
    { prefixo: "Africa", nome: "África" },
    { prefixo: "America", nome: "América" },
    { prefixo: "Antarctica", nome: "Antártida" },
    { prefixo: "Asia", nome: "Ásia" },
    { prefixo: "Atlantic", nome: "Atlântico" },
    { prefixo: "Australia", nome: "Austrália" },
    { prefixo: "Europe", nome: "Europa" },
    { prefixo: "Indian", nome: "Oceano Índico" },
    { prefixo: "Pacific", nome: "Pacífico" },
  ];

  /** Nomes em português das cidades mais procuradas; as demais usam o nome do ID IANA. */
  const NOMES = {
    "America/Sao_Paulo": "São Paulo (Brasília)",
    "America/Manaus": "Manaus",
    "America/Belem": "Belém",
    "America/Fortaleza": "Fortaleza",
    "America/Recife": "Recife",
    "America/Bahia": "Salvador (Bahia)",
    "America/Maceio": "Maceió",
    "America/Araguaina": "Araguaína",
    "America/Cuiaba": "Cuiabá",
    "America/Campo_Grande": "Campo Grande",
    "America/Porto_Velho": "Porto Velho",
    "America/Boa_Vista": "Boa Vista",
    "America/Rio_Branco": "Rio Branco",
    "America/Noronha": "Fernando de Noronha",
    "America/Santarem": "Santarém",
    "America/Eirunepe": "Eirunepé",
    "America/New_York": "Nova York",
    "America/Mexico_City": "Cidade do México",
    "America/Buenos_Aires": "Buenos Aires",
    "America/Argentina/Buenos_Aires": "Buenos Aires",
    "America/Bogota": "Bogotá",
    "America/Montevideo": "Montevidéu",
    "America/Asuncion": "Assunção",
    "America/Panama": "Cidade do Panamá",
    "Europe/Lisbon": "Lisboa",
    "Europe/London": "Londres",
    "Europe/Madrid": "Madri",
    "Europe/Rome": "Roma",
    "Europe/Berlin": "Berlim",
    "Europe/Moscow": "Moscou",
    "Europe/Athens": "Atenas",
    "Europe/Amsterdam": "Amsterdã",
    "Europe/Brussels": "Bruxelas",
    "Europe/Zurich": "Zurique",
    "Europe/Vienna": "Viena",
    "Europe/Warsaw": "Varsóvia",
    "Europe/Prague": "Praga",
    "Europe/Istanbul": "Istambul",
    "Europe/Kiev": "Kiev",
    "Europe/Kyiv": "Kiev",
    "Europe/Stockholm": "Estocolmo",
    "Europe/Copenhagen": "Copenhague",
    "Europe/Helsinki": "Helsinque",
    "Europe/Budapest": "Budapeste",
    "Europe/Bucharest": "Bucareste",
    "Atlantic/Azores": "Açores",
    "Atlantic/Canary": "Canárias",
    "Atlantic/Cape_Verde": "Cabo Verde",
    "Africa/Johannesburg": "Joanesburgo",
    "Africa/Cairo": "Cairo",
    "Africa/Nairobi": "Nairóbi",
    "Africa/Sao_Tome": "São Tomé",
    "Asia/Tokyo": "Tóquio",
    "Asia/Shanghai": "Xangai",
    "Asia/Singapore": "Singapura",
    "Asia/Seoul": "Seul",
    "Asia/Kolkata": "Calcutá",
    "Asia/Calcutta": "Calcutá",
    "Asia/Jakarta": "Jacarta",
    "Asia/Jerusalem": "Jerusalém",
    "Asia/Riyadh": "Riad",
    "Asia/Tehran": "Teerã",
    "Asia/Baghdad": "Bagdá",
    "Asia/Taipei": "Taipé",
    "Asia/Dili": "Díli",
    "Asia/Kathmandu": "Katmandu",
    "Asia/Katmandu": "Katmandu",
    "Asia/Ho_Chi_Minh": "Ho Chi Minh",
    "Asia/Saigon": "Ho Chi Minh",
  };

  /** Sugestões no topo das listas (além do fuso do aparelho). */
  const SUGESTOES = [
    "America/Sao_Paulo",
    "America/Manaus",
    "America/Noronha",
    "America/Rio_Branco",
    "Europe/Lisbon",
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
    "Europe/Paris",
    "Asia/Tokyo",
    "America/Buenos_Aires",
    "Australia/Sydney",
  ];

  const MESES_CURTOS = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
  const MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

  const dois = (n) => String(n).padStart(2, "0");

  /** Date.UTC sem o atalho de anos 0–99 virarem 1900–1999. */
  function msUTC(ano, mes, dia, hora = 0, minuto = 0, segundo = 0) {
    const data = new Date(Date.UTC(2000, mes - 1, dia, hora, minuto, segundo));
    data.setUTCFullYear(ano, mes - 1, dia);
    return data.getTime();
  }

  // --- Lista de fusos -----------------------------------------------------------------------

  const cidadeIANA = (id) => id.slice(id.lastIndexOf("/") + 1).replace(/_/g, " ");
  const nomeCidade = (id) => NOMES[id] || cidadeIANA(id);

  /** Fuso "Região/Cidade" → { id, cidade, regiao, subRegiao }; null para "UTC", "Etc/…" etc. */
  function entrada(id) {
    const regiao = REGIOES.find((r) => id.startsWith(`${r.prefixo}/`));
    if (!regiao) return null;
    const partes = id.split("/");
    if (partes.length < 2 || !partes[partes.length - 1]) return null;
    return {
      id,
      cidade: nomeCidade(id),
      regiao: regiao.nome,
      subRegiao: partes.length > 2 ? partes.slice(1, -1).map((p) => p.replace(/_/g, " ")).join(" / ") : null,
    };
  }

  const ordem = new Intl.Collator("pt-BR", { sensitivity: "base" });

  /** Entradas válidas, sem repetição, ordenadas pelo nome da cidade. */
  function listar(ids) {
    const vistos = new Set();
    const lista = [];
    for (const id of ids) {
      if (vistos.has(id)) continue;
      vistos.add(id);
      const e = entrada(id);
      if (e && zonaValida(id)) lista.push(e);
    }
    return lista.sort((a, b) => ordem.compare(a.cidade, b.cidade) || a.id.localeCompare(b.id));
  }

  /** IDs que o navegador conhece (Intl.supportedValuesOf), ou as sugestões em navegadores antigos. */
  function idsDisponiveis() {
    try {
      if (typeof Intl.supportedValuesOf === "function") return Intl.supportedValuesOf("timeZone");
    } catch (erro) {
      // segue para a lista reduzida
    }
    return [...SUGESTOES, "America/Chicago", "America/Mexico_City", "Europe/Madrid", "Europe/Berlin", "Asia/Dubai", "Asia/Shanghai"];
  }

  function fusoDoAparelho() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch (erro) {
      return null;
    }
  }

  // --- Relógio de cada fuso -----------------------------------------------------------------

  const formatadores = new Map();
  function formatador(zona) {
    let f = formatadores.get(zona);
    if (!f) {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone: zona,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      });
      formatadores.set(zona, f);
    }
    return f;
  }

  function zonaValida(zona) {
    try {
      formatador(zona);
      return true;
    } catch (erro) {
      return false;
    }
  }

  /** Data e hora locais no fuso, no instante [ms]: { ano, mes, dia, hora, minuto, segundo }. */
  function partesLocais(zona, ms) {
    const p = {};
    for (const { type, value } of formatador(zona).formatToParts(new Date(ms))) p[type] = value;
    return {
      ano: Number(p.year),
      mes: Number(p.month),
      dia: Number(p.day),
      hora: Number(p.hour) % 24, // alguns navegadores antigos escrevem meia-noite como "24"
      minuto: Number(p.minute),
      segundo: Number(p.second),
    };
  }

  /** Minutos em relação ao UTC no instante [ms] (−180 = UTC−03:00). */
  function deslocamentoMin(zona, ms) {
    const segundoCheio = Math.floor(ms / 1000) * 1000;
    const p = partesLocais(zona, segundoCheio);
    return Math.round((msUTC(p.ano, p.mes, p.dia, p.hora, p.minuto, p.segundo) - segundoCheio) / 60000);
  }

  /** "UTC−03:00", "UTC+05:30", "UTC+00:00". */
  function textoDeslocamento(minutos) {
    const absoluto = Math.abs(minutos);
    return `UTC${minutos < 0 ? "−" : "+"}${dois(Math.floor(absoluto / 60))}:${dois(absoluto % 60)}`;
  }

  /**
   * Horário de verão: o deslocamento atual é maior que o menor do ano (o horário padrão),
   * comparando 1º de janeiro e 1º de julho para servir aos dois hemisférios.
   */
  function horarioDeVerao(zona, ms) {
    const { ano } = partesLocais(zona, ms);
    const padrao = Math.min(deslocamentoMin(zona, msUTC(ano, 1, 1, 12)), deslocamentoMin(zona, msUTC(ano, 7, 1, 12)));
    return deslocamentoMin(zona, ms) > padrao;
  }

  /** Diferença em minutos de [para] em relação a [de] (positivo = [para] está adiantado). */
  const diferencaMin = (de, para, ms) => deslocamentoMin(para, ms) - deslocamentoMin(de, ms);

  /**
   * Instante de uma data e hora local no fuso, como ZonedDateTime.of: no horário que não existe
   * (início do horário de verão) avança o tamanho do salto; no que acontece duas vezes (fim do
   * horário de verão) usa a primeira ocorrência.
   */
  function instanteLocal(zona, ano, mes, dia, hora, minuto) {
    const local = msUTC(ano, mes, dia, hora, minuto, 0);
    // Um deslocamento nunca passa de 14 h: antes e depois desta janela estão os dois candidatos.
    const antes = deslocamentoMin(zona, local - 16 * 3600000);
    const depois = deslocamentoMin(zona, local + 16 * 3600000);
    const validos = [...new Set([antes, depois])].filter((d) => deslocamentoMin(zona, local - d * 60000) === d);
    if (!validos.length) return { ms: local - antes * 60000, lacuna: true, ambiguo: false };
    return { ms: local - validos[0] * 60000, lacuna: false, ambiguo: validos.length > 1 };
  }

  /**
   * Converte data ({ ano, mes, dia }) e hora ({ hora, minuto }) do fuso [de] para o fuso [para].
   * deslocamentoDias: −1 = dia anterior, 0 = mesmo dia, 1 = dia seguinte, em relação à data informada.
   */
  function converter(data, horario, de, para) {
    const instante = instanteLocal(de, data.ano, data.mes, data.dia, horario.hora, horario.minuto);
    const destino = partesLocais(para, instante.ms);
    return {
      ms: instante.ms,
      origem: partesLocais(de, instante.ms),
      destino,
      deslocamentoDias: Math.round(
        (msUTC(destino.ano, destino.mes, destino.dia) - msUTC(data.ano, data.mes, data.dia)) / 86400000,
      ),
      ajustadoPorLacuna: instante.lacuna,
      ambiguo: instante.ambiguo,
    };
  }

  // --- Textos -------------------------------------------------------------------------------

  /** "1 h 30 min", "2 h", "45 min". */
  function duracao(minutos) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }

  function fraseDiferenca(cidadeDe, cidadePara, minutos) {
    if (minutos === 0) return "Mesmo horário nos dois fusos";
    return minutos > 0
      ? `${cidadePara} está ${duracao(minutos)} à frente de ${cidadeDe}`
      : `${cidadePara} está ${duracao(-minutos)} atrás de ${cidadeDe}`;
  }

  const hora = (p, segundos = false) => `${dois(p.hora)}:${dois(p.minuto)}${segundos ? `:${dois(p.segundo)}` : ""}`;

  /** "3 de nov. de 2026". */
  const dataMedia = (p) => `${p.dia} de ${MESES_CURTOS[p.mes - 1]} de ${p.ano}`;

  /** "terça-feira, 3 de novembro de 2026". */
  function dataCompleta(p) {
    const semana = DIAS_SEMANA[new Date(msUTC(p.ano, p.mes, p.dia)).getUTCDay()];
    return `${semana}, ${p.dia === 1 ? "1º" : p.dia} de ${MESES[p.mes - 1]} de ${p.ano}`;
  }

  const mesmoDia = (a, b) => a.ano === b.ano && a.mes === b.mes && a.dia === b.dia;

  return {
    REGIOES,
    SUGESTOES,
    msUTC,
    entrada,
    nomeCidade,
    listar,
    idsDisponiveis,
    fusoDoAparelho,
    zonaValida,
    partesLocais,
    deslocamentoMin,
    textoDeslocamento,
    horarioDeVerao,
    diferencaMin,
    instanteLocal,
    converter,
    duracao,
    fraseDiferenca,
    hora,
    dataMedia,
    dataCompleta,
    mesmoDia,
  };
})();

if (typeof module === "object") module.exports = LogicaFuso;
