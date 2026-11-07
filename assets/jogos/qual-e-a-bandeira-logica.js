"use strict";
/*
 * Regras do app Qual a Bandeira (com.emerson1981.qualabandeira), sem DOM:
 * logica/GeradorPerguntas.kt (sorteio e níveis), logica/Partida.kt (vidas e sequência),
 * logica/Pontuacao.kt (pontos), dados/PartidaSalva.kt (partida gravada) e
 * dados/CatalogoPaises.kt (os 193 países, a dificuldade e o nome em português).
 * O modo Capital (ver a bandeira e escolher a capital) existe só aqui no site.
 */
const LogicaBandeiras = (() => {
  const VIDAS_INICIAIS = 3;
  const TOTAL_OPCOES = 4;
  const RECENTES_EVITADOS = 20;
  const PONTOS_BASE = 10;
  const MULTIPLICADOR_MAXIMO = 3;
  /** "pais": ver a bandeira e escolher o país (como no app); "capital": escolher a capital. */
  const MODOS = Object.freeze(["pais", "capital"]);

  /*
   * Capital de cada país, com a grafia usada no Brasil. Casos especiais: Bolívia = Sucre
   * (capital pela Constituição; o governo fica em La Paz), África do Sul = Pretória (sede do
   * governo; Cidade do Cabo e Bloemfontein são as outras duas), Países Baixos = Amsterdã (o
   * governo fica em Haia) e Nauru = Yaren (não tem capital oficial). Israel e Palestina ficam
   * fora do modo Capital porque a capital de ambos é disputada internacionalmente.
   */
  const CAPITAIS = {
    BR: "Brasília", US: "Washington", FR: "Paris", DE: "Berlim", JP: "Tóquio", CN: "Pequim",
    IT: "Roma", ES: "Madri", PT: "Lisboa", CA: "Ottawa", AU: "Camberra", GB: "Londres",
    MX: "Cidade do México", AR: "Buenos Aires", RU: "Moscou", IN: "Nova Délhi", KR: "Seul",
    TR: "Ancara", NL: "Amsterdã", SE: "Estocolmo", CH: "Berna", NO: "Oslo", IE: "Dublin",
    GR: "Atenas", EG: "Cairo", ZA: "Pretória", NZ: "Wellington", AT: "Viena", BE: "Bruxelas",
    DK: "Copenhague", FI: "Helsinque", PL: "Varsóvia", CZ: "Praga", HU: "Budapeste",

    CL: "Santiago", CO: "Bogotá", PE: "Lima", VE: "Caracas", BO: "Sucre", EC: "Quito",
    PY: "Assunção", UY: "Montevidéu", CU: "Havana", DO: "Santo Domingo", GT: "Cidade da Guatemala",
    CR: "San José", PA: "Cidade do Panamá", HN: "Tegucigalpa", SV: "San Salvador", NI: "Manágua",
    JM: "Kingston", TT: "Porto de Espanha", MA: "Rabat", DZ: "Argel", TN: "Túnis", LY: "Trípoli",
    KE: "Nairóbi", NG: "Abuja", GH: "Acra", ET: "Adis Abeba", TZ: "Dodoma", UG: "Kampala",
    SN: "Dacar", CM: "Iaundé", AO: "Luanda", MZ: "Maputo", ZW: "Harare", SA: "Riad", IR: "Teerã",
    IQ: "Bagdá", JO: "Amã", LB: "Beirute", SY: "Damasco", KW: "Cidade do Kuwait", QA: "Doha",
    AE: "Abu Dhabi", PK: "Islamabad", BD: "Daca", LK: "Sri Jayawardenepura Kotte", VN: "Hanói",
    TH: "Bangcoc", PH: "Manila", ID: "Jacarta", MY: "Kuala Lumpur", SG: "Singapura", TW: "Taipé",
    MM: "Naypyidaw", KH: "Phnom Penh", LA: "Vientiane", AZ: "Baku", GE: "Tbilisi", AM: "Erevan",
    KZ: "Astana", UA: "Kiev", RO: "Bucareste", BG: "Sófia", RS: "Belgrado", HR: "Zagreb",
    SK: "Bratislava", SI: "Liubliana", EE: "Tallinn", LV: "Riga", LT: "Vilnius", IS: "Reykjavík",
    LU: "Luxemburgo", AL: "Tirana", KP: "Pyongyang", AF: "Cabul", YE: "Sanaa", SD: "Cartum",
    SO: "Mogadíscio",

    MN: "Ulan Bator", PG: "Port Moresby", HT: "Porto Príncipe", BF: "Uagadugu", ML: "Bamako",
    NE: "Niamey", TD: "N'Djamena", GA: "Libreville", CG: "Brazzaville", CD: "Kinshasa",
    CF: "Bangui", RW: "Kigali", BI: "Gitega", MW: "Lilongwe", ZM: "Lusaka", NA: "Windhoek",
    BW: "Gaborone", LS: "Maseru", SZ: "Mbabane", MG: "Antananarivo", MU: "Port Louis",
    SC: "Victoria", KM: "Moroni", DJ: "Djibuti", LR: "Monróvia", SL: "Freetown", GW: "Bissau",
    GN: "Conacri", ST: "São Tomé", CV: "Praia", GM: "Banjul", BJ: "Porto-Novo", TG: "Lomé",
    CI: "Yamoussoukro", ER: "Asmara", SS: "Juba", OM: "Mascate", BH: "Manama", CY: "Nicósia",
    MT: "Valeta", NP: "Katmandu", BT: "Thimphu", MV: "Malé", TL: "Díli", BN: "Bandar Seri Begawan",
    FJ: "Suva", VU: "Port Vila", WS: "Ápia", TO: "Nukualofa", KI: "Tarawa", NR: "Yaren",
    TV: "Funafuti", SB: "Honiara", MH: "Majuro", FM: "Palikir", PW: "Ngerulmud", KG: "Bishkek",
    TJ: "Duchambe", TM: "Asgabate", UZ: "Tashkent", ME: "Podgorica", MK: "Escópia",
    BA: "Sarajevo", MD: "Chisinau", BY: "Minsk", LI: "Vaduz", MC: "Mônaco", SM: "San Marino",
    VA: "Cidade do Vaticano", AD: "Andorra-a-Velha", SR: "Paramaribo", GY: "Georgetown",
    BZ: "Belmopan", BB: "Bridgetown", DM: "Roseau", GD: "Saint George's", LC: "Castries",
    KN: "Basseterre", VC: "Kingstown", AG: "Saint John's",
  };

  // [código ISO 3166-1, dificuldade de 1 (fácil) a 3 (difícil), nome em português]
  const PAISES = [
    // Dificuldade 1
    ["BR", 1, "Brasil"], ["US", 1, "Estados Unidos"], ["FR", 1, "França"], ["DE", 1, "Alemanha"],
    ["JP", 1, "Japão"], ["CN", 1, "China"], ["IT", 1, "Itália"], ["ES", 1, "Espanha"], ["PT", 1, "Portugal"],
    ["CA", 1, "Canadá"], ["AU", 1, "Austrália"], ["GB", 1, "Reino Unido"], ["MX", 1, "México"],
    ["AR", 1, "Argentina"], ["RU", 1, "Rússia"], ["IN", 1, "Índia"], ["KR", 1, "Coreia do Sul"],
    ["TR", 1, "Turquia"], ["NL", 1, "Países Baixos"], ["SE", 1, "Suécia"], ["CH", 1, "Suíça"],
    ["NO", 1, "Noruega"], ["IE", 1, "Irlanda"], ["GR", 1, "Grécia"], ["EG", 1, "Egito"],
    ["ZA", 1, "África do Sul"], ["NZ", 1, "Nova Zelândia"], ["AT", 1, "Áustria"], ["BE", 1, "Bélgica"],
    ["DK", 1, "Dinamarca"], ["FI", 1, "Finlândia"], ["PL", 1, "Polônia"], ["CZ", 1, "República Tcheca"],
    ["HU", 1, "Hungria"],
    // Dificuldade 2
    ["CL", 2, "Chile"], ["CO", 2, "Colômbia"], ["PE", 2, "Peru"], ["VE", 2, "Venezuela"],
    ["BO", 2, "Bolívia"], ["EC", 2, "Equador"], ["PY", 2, "Paraguai"], ["UY", 2, "Uruguai"],
    ["CU", 2, "Cuba"], ["DO", 2, "Rep. Dominicana"], ["GT", 2, "Guatemala"], ["CR", 2, "Costa Rica"],
    ["PA", 2, "Panamá"], ["HN", 2, "Honduras"], ["SV", 2, "El Salvador"], ["NI", 2, "Nicarágua"],
    ["JM", 2, "Jamaica"], ["TT", 2, "Trinidad e Tobago"], ["MA", 2, "Marrocos"], ["DZ", 2, "Argélia"],
    ["TN", 2, "Tunísia"], ["LY", 2, "Líbia"], ["KE", 2, "Quênia"], ["NG", 2, "Nigéria"], ["GH", 2, "Gana"],
    ["ET", 2, "Etiópia"], ["TZ", 2, "Tanzânia"], ["UG", 2, "Uganda"], ["SN", 2, "Senegal"],
    ["CM", 2, "Camarões"], ["AO", 2, "Angola"], ["MZ", 2, "Moçambique"], ["ZW", 2, "Zimbábue"],
    ["SA", 2, "Arábia Saudita"], ["IR", 2, "Irã"], ["IQ", 2, "Iraque"], ["IL", 2, "Israel"],
    ["JO", 2, "Jordânia"], ["LB", 2, "Líbano"], ["SY", 2, "Síria"], ["KW", 2, "Kuwait"], ["QA", 2, "Catar"],
    ["AE", 2, "Emirados Árabes"], ["PK", 2, "Paquistão"], ["BD", 2, "Bangladesh"], ["LK", 2, "Sri Lanka"],
    ["VN", 2, "Vietnã"], ["TH", 2, "Tailândia"], ["PH", 2, "Filipinas"], ["ID", 2, "Indonésia"],
    ["MY", 2, "Malásia"], ["SG", 2, "Singapura"], ["TW", 2, "Taiwan"], ["MM", 2, "Myanmar"],
    ["KH", 2, "Camboja"], ["LA", 2, "Laos"], ["AZ", 2, "Azerbaijão"], ["GE", 2, "Geórgia"],
    ["AM", 2, "Armênia"], ["KZ", 2, "Cazaquistão"], ["UA", 2, "Ucrânia"], ["RO", 2, "Romênia"],
    ["BG", 2, "Bulgária"], ["RS", 2, "Sérvia"], ["HR", 2, "Croácia"], ["SK", 2, "Eslováquia"],
    ["SI", 2, "Eslovênia"], ["EE", 2, "Estônia"], ["LV", 2, "Letônia"], ["LT", 2, "Lituânia"],
    ["IS", 2, "Islândia"], ["LU", 2, "Luxemburgo"], ["AL", 2, "Albânia"], ["KP", 2, "Coreia do Norte"],
    ["AF", 2, "Afeganistão"], ["YE", 2, "Iêmen"], ["SD", 2, "Sudão"], ["SO", 2, "Somália"],
    ["PS", 2, "Palestina"],
    // Dificuldade 3
    ["MN", 3, "Mongólia"], ["PG", 3, "Papua Nova Guiné"], ["HT", 3, "Haiti"], ["BF", 3, "Burkina Faso"],
    ["ML", 3, "Mali"], ["NE", 3, "Níger"], ["TD", 3, "Chade"], ["GA", 3, "Gabão"], ["CG", 3, "Rep. do Congo"],
    ["CD", 3, "Rep. Dem. do Congo"], ["CF", 3, "Rep. Centro-Africana"], ["RW", 3, "Ruanda"],
    ["BI", 3, "Burundi"], ["MW", 3, "Malawi"], ["ZM", 3, "Zâmbia"], ["NA", 3, "Namíbia"],
    ["BW", 3, "Botsuana"], ["LS", 3, "Lesoto"], ["SZ", 3, "Essuatíni"], ["MG", 3, "Madagascar"],
    ["MU", 3, "Maurício"], ["SC", 3, "Seicheles"], ["KM", 3, "Comores"], ["DJ", 3, "Djibuti"],
    ["LR", 3, "Libéria"], ["SL", 3, "Serra Leoa"], ["GW", 3, "Guiné-Bissau"], ["GN", 3, "Guiné"],
    ["ST", 3, "São Tomé e Príncipe"], ["CV", 3, "Cabo Verde"], ["GM", 3, "Gâmbia"], ["BJ", 3, "Benin"],
    ["TG", 3, "Togo"], ["CI", 3, "Costa do Marfim"], ["ER", 3, "Eritreia"], ["SS", 3, "Sudão do Sul"],
    ["OM", 3, "Omã"], ["BH", 3, "Bahrein"], ["CY", 3, "Chipre"], ["MT", 3, "Malta"], ["NP", 3, "Nepal"],
    ["BT", 3, "Butão"], ["MV", 3, "Maldivas"], ["TL", 3, "Timor-Leste"], ["BN", 3, "Brunei"],
    ["FJ", 3, "Fiji"], ["VU", 3, "Vanuatu"], ["WS", 3, "Samoa"], ["TO", 3, "Tonga"], ["KI", 3, "Quiribati"],
    ["NR", 3, "Nauru"], ["TV", 3, "Tuvalu"], ["SB", 3, "Ilhas Salomão"], ["MH", 3, "Ilhas Marshall"],
    ["FM", 3, "Micronésia"], ["PW", 3, "Palau"], ["KG", 3, "Quirguistão"], ["TJ", 3, "Tajiquistão"],
    ["TM", 3, "Turcomenistão"], ["UZ", 3, "Uzbequistão"], ["ME", 3, "Montenegro"],
    ["MK", 3, "Macedônia do Norte"], ["BA", 3, "Bósnia e Herzegovina"], ["MD", 3, "Moldávia"],
    ["BY", 3, "Belarus"], ["LI", 3, "Liechtenstein"], ["MC", 3, "Mônaco"], ["SM", 3, "San Marino"],
    ["VA", 3, "Vaticano"], ["AD", 3, "Andorra"], ["SR", 3, "Suriname"], ["GY", 3, "Guiana"],
    ["BZ", 3, "Belize"], ["BB", 3, "Barbados"], ["DM", 3, "Dominica"], ["GD", 3, "Granada"],
    ["LC", 3, "Santa Lúcia"], ["KN", 3, "São Cristóvão e Nevis"], ["VC", 3, "São Vicente e Granadinas"],
    ["AG", 3, "Antígua e Barbuda"],
  ].map(([codigo, dificuldade, nome]) =>
    Object.freeze({ codigo, dificuldade, nome, capital: CAPITAIS[codigo] || null }),
  );

  const POR_CODIGO = new Map(PAISES.map((pais) => [pais.codigo, pais]));
  const COM_CAPITAL = PAISES.filter((pais) => pais.capital);

  const modoValido = (modo) => (MODOS.includes(modo) ? modo : "pais");

  /** Países que podem cair no modo: no Capital, só os que têm capital cadastrada. */
  function paisesDoModo(modo) {
    return modoValido(modo) === "capital" ? COM_CAPITAL : PAISES;
  }

  /** O que aparece no botão de resposta: o nome do país ou a capital. */
  function textoDaOpcao(pais, modo) {
    return modoValido(modo) === "capital" ? pais.capital : pais.nome;
  }

  /** Faixas do app: perguntas 1–10 fáceis, 11–20 médias, 21–30 difíceis e depois todas. */
  function nivelDaPergunta(numero) {
    if (numero <= 10) return "facil";
    if (numero <= 20) return "medio";
    if (numero <= 30) return "dificil";
    return "misto";
  }

  function paisesDoNivel(nivel, paises = PAISES) {
    const dificuldade = { facil: 1, medio: 2, dificil: 3 }[nivel];
    const doNivel = dificuldade ? paises.filter((p) => p.dificuldade === dificuldade) : paises;
    return doNivel.length ? doNivel : paises;
  }

  /** Multiplicador do próximo acerto: 1 + sequência × 0,5, no máximo 3. */
  function multiplicador(sequencia) {
    return Math.min(1 + Math.max(0, sequencia) * 0.5, MULTIPLICADOR_MAXIMO);
  }

  /** pontos = 10 × dificuldade × multiplicador; sempre inteiro, porque o multiplicador anda de 0,5 em 0,5. */
  function pontosDoAcerto(dificuldade, sequenciaAntes) {
    return Math.round(PONTOS_BASE * dificuldade * multiplicador(sequenciaAntes));
  }

  // ---------- Sorteio ----------

  function embaralhar(lista, aleatorio) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  function sortear(lista, aleatorio) {
    return lista[Math.floor(aleatorio() * lista.length)];
  }

  /**
   * Pergunta [numero] sem repetir os países de [perguntadas] (os já vistos na partida). Se o
   * nível acabar, volta a usar todos, evitando só os 20 mais recentes. As 4 opções são
   * distintas, incluem a correta e as erradas são de preferência da mesma dificuldade.
   */
  function gerarPergunta(numero, perguntadas = [], aleatorio = Math.random, paises = PAISES) {
    const doNivel = paisesDoNivel(nivelDaPergunta(numero), paises);
    const vistos = new Set(perguntadas);
    const recentes = new Set(perguntadas.slice(-RECENTES_EVITADOS));
    let candidatos = doNivel.filter((p) => !vistos.has(p.codigo));
    if (!candidatos.length) candidatos = doNivel.filter((p) => !recentes.has(p.codigo));
    if (!candidatos.length) candidatos = doNivel;
    const correta = sortear(candidatos, aleatorio);

    const outros = paises.filter((p) => p.codigo !== correta.codigo);
    const mesma = outros.filter((p) => p.dificuldade === correta.dificuldade);
    const demais = outros.filter((p) => p.dificuldade !== correta.dificuldade);
    const erradas = [...embaralhar(mesma, aleatorio), ...embaralhar(demais, aleatorio)].slice(0, TOTAL_OPCOES - 1);
    return { correta, opcoes: embaralhar([...erradas, correta], aleatorio) };
  }

  // ---------- Partida ----------

  function novaPartida() {
    return { pontos: 0, vidas: VIDAS_INICIAIS, sequencia: 0, numeroPergunta: 1, perguntadas: [] };
  }

  function terminou(partida) {
    return partida.vidas <= 0;
  }

  /** Marca o país da pergunta como visto, para não repetir a bandeira na mesma partida. */
  function comPergunta(partida, pergunta) {
    return { ...partida, perguntadas: [...partida.perguntadas, pergunta.correta.codigo] };
  }

  /** Acerto soma pontos e aumenta a sequência; erro tira uma vida e zera a sequência. */
  function responder(partida, pergunta, codigoEscolhido) {
    const acertou = codigoEscolhido === pergunta.correta.codigo;
    const pontosGanhos = acertou ? pontosDoAcerto(pergunta.correta.dificuldade, partida.sequencia) : 0;
    return {
      acertou,
      pontosGanhos,
      partida: {
        ...partida,
        pontos: partida.pontos + pontosGanhos,
        vidas: acertou ? partida.vidas : Math.max(0, partida.vidas - 1),
        sequencia: acertou ? partida.sequencia + 1 : 0,
      },
    };
  }

  function proximaRodada(partida) {
    return { ...partida, numeroPergunta: partida.numeroPergunta + 1 };
  }

  // ---------- Partida gravada ----------

  /** O que gravar logo após responder: retomar a partida começa pela pergunta seguinte. */
  function paraSalvar(partida) {
    return {
      score: partida.pontos,
      lives: partida.vidas,
      streak: partida.sequencia,
      questionNumber: partida.numeroPergunta + 1,
      asked: partida.perguntadas.slice(),
    };
  }

  /** Partida a partir do JSON gravado; null para ausente, malformado ou com valores impossíveis. */
  function lerSalva(texto) {
    if (typeof texto !== "string" || !texto.trim()) return null;
    let obj;
    try {
      obj = JSON.parse(texto);
    } catch (erro) {
      return null;
    }
    if (!obj || typeof obj !== "object") return null;
    const inteiro = (v) => (Number.isInteger(v) ? v : null);
    const pontos = inteiro(obj.score);
    const vidas = inteiro(obj.lives);
    const sequencia = obj.streak === undefined ? 0 : inteiro(obj.streak);
    const numeroPergunta = inteiro(obj.questionNumber);
    const perguntadas = Array.isArray(obj.asked) ? obj.asked.filter((c) => POR_CODIGO.has(c)) : [];
    const valida =
      pontos !== null &&
      pontos >= 0 &&
      vidas !== null &&
      vidas >= 1 &&
      vidas <= VIDAS_INICIAIS &&
      sequencia !== null &&
      sequencia >= 0 &&
      numeroPergunta !== null &&
      numeroPergunta >= 1;
    return valida ? { pontos, vidas, sequencia, numeroPergunta, perguntadas } : null;
  }

  /** Gerador previsível (mulberry32), para os testes repetirem as mesmas partidas. */
  function aleatorioComSemente(semente) {
    let a = semente >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    VIDAS_INICIAIS,
    TOTAL_OPCOES,
    MODOS,
    PAISES,
    pais: (codigo) => POR_CODIGO.get(codigo) || null,
    modoValido,
    paisesDoModo,
    textoDaOpcao,
    nivelDaPergunta,
    paisesDoNivel,
    multiplicador,
    pontosDoAcerto,
    gerarPergunta,
    novaPartida,
    terminou,
    comPergunta,
    responder,
    proximaRodada,
    paraSalvar,
    lerSalva,
    aleatorioComSemente,
  };
})();
if (typeof module === "object") module.exports = LogicaBandeiras;
