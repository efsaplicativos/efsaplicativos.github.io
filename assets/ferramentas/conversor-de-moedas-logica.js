"use strict";
/*
 * Conversor de moedas com cotações da AwesomeAPI. Porte do app Conversor de Moedas
 * (dados/CatalogoMoedas.kt, dados/ApiCotacoes.kt, logica/RotaConversao.kt,
 * logica/CalculadoraConversao.kt, logica/LeitorValor.kt, logica/FormatadorMoeda.kt e
 * ui/telas/conversor/Mensagens.kt), com os dados extras da Calculadora Multifunção
 * (core/moedas/RateRouter.kt e AwesomeApi.kt): compra e venda, máxima e mínima do dia,
 * variação e histórico de 30 dias.
 *
 * As contas usam Number (o app usa BigDecimal); a formatação arredonda meio para cima sobre a
 * representação decimal do número, como o setScale(HALF_UP) do app.
 */
const LogicaMoedas = (() => {
  const BASE = "https://economia.awesomeapi.com.br/json/";

  // ---------- Catálogo ----------

  /** [código, nome, tipo, código na API]. tipo: "f" fiduciária, "c" criptomoeda, "m" commodity. */
  const DADOS = [
    ["USD", "Dólar Americano"],
    ["BRL", "Real Brasileiro"],
    ["EUR", "Euro"],
    ["AFN", "Afghani do Afeganistão"],
    ["MGA", "Ariary Madagascarense"],
    ["THB", "Baht Tailandês"],
    ["PAB", "Balboa Panamenho"],
    ["BNB", "Binance Coin", "c"],
    ["ETB", "Birr Etíope"],
    ["BTC", "Bitcoin", "c"],
    ["VES", "Bolívar Venezuelano", "f", "VEF"],
    ["BOB", "Boliviano"],
    ["BRETT", "Brett", "c"],
    ["GHS", "Cedi Ganês"],
    ["CRC", "Colón Costarriquenho"],
    ["SVC", "Colón Salvadorenho"],
    ["NIO", "Córdoba Nicaraguense"],
    ["CZK", "Coroa Tcheca"],
    ["DKK", "Coroa Dinamarquesa"],
    ["ISK", "Coroa Islandesa"],
    ["NOK", "Coroa Norueguesa"],
    ["SEK", "Coroa Sueca"],
    ["GMD", "Dalasi da Gâmbia"],
    ["MKD", "Denar Macedônio"],
    ["DZD", "Dinar Argelino"],
    ["BHD", "Dinar do Bahrein"],
    ["IQD", "Dinar Iraquiano"],
    ["JOD", "Dinar Jordaniano"],
    ["KWD", "Dinar Kuwaitiano"],
    ["LYD", "Dinar Líbio"],
    ["RSD", "Dinar Sérvio"],
    ["TND", "Dinar Tunisiano"],
    ["XDR", "Direito Especial de Saque (FMI)", "f", "SDR"],
    ["AED", "Dirham dos Emirados Árabes"],
    ["MAD", "Dirham Marroquino"],
    ["STN", "Dobra de São Tomé e Príncipe", "f", "STD"],
    ["DOGE", "Dogecoin", "c"],
    ["AUD", "Dólar Australiano"],
    ["CAD", "Dólar Canadense"],
    ["BSD", "Dólar das Bahamas"],
    ["KYD", "Dólar das Ilhas Cayman"],
    ["BBD", "Dólar de Barbados"],
    ["BZD", "Dólar de Belize"],
    ["BND", "Dólar de Brunei"],
    ["SGD", "Dólar de Cingapura"],
    ["FJD", "Dólar de Fiji"],
    ["HKD", "Dólar de Hong Kong"],
    ["TTD", "Dólar de Trinidad e Tobago"],
    ["XCD", "Dólar do Caribe Oriental"],
    ["JMD", "Dólar Jamaicano"],
    ["NAD", "Dólar Namibiano"],
    ["NZD", "Dólar Neozelandês"],
    ["TWD", "Dólar Taiwanês"],
    ["ZWL", "Dólar Zimbabuano"],
    ["VND", "Dong Vietnamita"],
    ["AMD", "Dram Armênio"],
    ["CVE", "Escudo Cabo-Verdiano"],
    ["ETH", "Ethereum", "c"],
    ["HUF", "Florim Húngaro"],
    ["ANG", "Florim das Antilhas Holandesas"],
    ["BIF", "Franco Burundinês"],
    ["XAF", "Franco CFA Central"],
    ["XOF", "Franco CFA Ocidental"],
    ["XPF", "Franco CFP"],
    ["KMF", "Franco Comorense"],
    ["GNF", "Franco da Guiné"],
    ["DJF", "Franco do Djibuti"],
    ["RWF", "Franco Ruandês"],
    ["CHF", "Franco Suíço"],
    ["HTG", "Gourde Haitiano"],
    ["PYG", "Guarani Paraguaio"],
    ["UAH", "Hryvnia Ucraniana"],
    ["JPY", "Iene Japonês"],
    ["PGK", "Kina de Papua-Nova Guiné"],
    ["LAK", "Kip Laosiano"],
    ["HRK", "Kuna Croata"],
    ["MWK", "Kwacha Malauiano"],
    ["ZMW", "Kwacha Zambiano", "f", "ZMK"],
    ["AOA", "Kwanza Angolano"],
    ["MMK", "Kyat de Mianmar"],
    ["GEL", "Lari Georgiano"],
    ["ALL", "Lek Albanês"],
    ["HNL", "Lempira Hondurenha"],
    ["MDL", "Leu Moldavo"],
    ["RON", "Leu Romeno"],
    ["BGN", "Lev Búlgaro"],
    ["EGP", "Libra Egípcia"],
    ["GBP", "Libra Esterlina"],
    ["LBP", "Libra Libanesa"],
    ["SYP", "Libra Síria"],
    ["SDG", "Libra Sudanesa"],
    ["SZL", "Lilangeni Suazilandês"],
    ["TRY", "Lira Turca"],
    ["LTC", "Litecoin", "c"],
    ["LSL", "Loti do Lesoto"],
    ["AZN", "Manat Azeri"],
    ["TMT", "Manat Turcomeno"],
    ["BAM", "Marco Conversível da Bósnia"],
    ["MZN", "Metical Moçambicano"],
    ["NGN", "Naira Nigeriana"],
    ["ILS", "Novo Shekel Israelense"],
    ["XAU", "Ouro (onça troy)", "m"],
    ["MRU", "Ouguiya Mauritana", "f", "MRO"],
    ["MOP", "Pataca de Macau"],
    ["ARS", "Peso Argentino"],
    ["CLP", "Peso Chileno"],
    ["COP", "Peso Colombiano"],
    ["CUP", "Peso Cubano"],
    ["DOP", "Peso Dominicano"],
    ["PHP", "Peso Filipino"],
    ["MXN", "Peso Mexicano"],
    ["UYU", "Peso Uruguaio"],
    ["XBR", "Petróleo Brent (barril)", "m"],
    ["XAG", "Prata (onça troy)", "m"],
    ["BWP", "Pula Botsuanesa"],
    ["GTQ", "Quetzal Guatemalteco"],
    ["ZAR", "Rand Sul-Africano"],
    ["QAR", "Rial Catariano"],
    ["YER", "Rial Iemenita"],
    ["IRR", "Rial Iraniano"],
    ["OMR", "Rial Omanense"],
    ["KHR", "Riel Cambojano"],
    ["MYR", "Ringgit Malaio"],
    ["SAR", "Riyal Saudita"],
    ["BYN", "Rublo Bielorrusso"],
    ["RUB", "Rublo Russo"],
    ["MVR", "Rufiyaa Maldiva"],
    ["SCR", "Rúpia de Seicheles"],
    ["LKR", "Rúpia do Sri Lanka"],
    ["INR", "Rúpia Indiana"],
    ["IDR", "Rúpia Indonésia"],
    ["MUR", "Rúpia Mauriciana"],
    ["NPR", "Rúpia Nepalesa"],
    ["PKR", "Rúpia Paquistanesa"],
    ["KES", "Shilling Queniano"],
    ["SOS", "Shilling Somaliano"],
    ["TZS", "Shilling Tanzaniano"],
    ["UGX", "Shilling Ugandês"],
    ["PEN", "Sol Peruano"],
    ["SOL", "Solana", "c"],
    ["KGS", "Som Quirguistanês"],
    ["UZS", "Som Uzbeque"],
    ["TJS", "Somoni do Tajiquistão"],
    ["BDT", "Taka de Bangladesh"],
    ["KZT", "Tenge Cazaque"],
    ["MNT", "Tugrik Mongol"],
    ["VUV", "Vatu de Vanuatu"],
    ["KRW", "Won Sul-Coreano"],
    ["XRP", "XRP", "c"],
    ["CNY", "Yuan Chinês"],
    ["CNH", "Yuan Chinês Offshore"],
    ["PLN", "Zlóti Polonês"],
  ];

  function normalizar(texto) {
    return String(texto).normalize("NFD").replace(/\p{Mn}+/gu, "").toLowerCase().trim();
  }

  const TIPOS = { f: "fiduciaria", c: "cripto", m: "commodity" };
  const MOEDAS = DADOS.map(([codigo, nome, tipo = "f", codigoApi = codigo]) =>
    Object.freeze({ codigo, nome, tipo: TIPOS[tipo], codigoApi }),
  ).sort((a, b) => {
    const x = normalizar(a.nome);
    const y = normalizar(b.nome);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const POR_CODIGO = new Map(MOEDAS.map((m) => [m.codigo, m]));
  const porCodigo = (codigo) => POR_CODIGO.get(codigo) ?? null;

  /** Atalhos no topo da lista. */
  const POPULARES = ["BRL", "USD", "EUR", "GBP", "ARS", "CAD", "JPY", "CHF", "BTC", "ETH"].map(porCodigo);

  /** Pares que a AwesomeAPI cota (res/raw/pares_disponiveis.txt do app). */
  const PARES_EMBUTIDOS = new Set(
    `
    AED-BRL AED-EUR AED-USD AFN-USD ANG-USD ARS-BRL ARS-CLP ARS-EUR ARS-PEN ARS-USD AUD-BRL AUD-BRLPTAX
    AUD-CHF AUD-EUR AUD-JPY AUD-NZD AUD-USD BHD-EUR BNB-BRL BNB-EUR BNB-USD BOB-BRL BOB-USD BRETT-BRL
    BRETT-EUR BRETT-USD BRL-AED BRL-ARS BRL-AUD BRL-BBD BRL-BHD BRL-BOB BRL-CAD BRL-CHF BRL-CLP BRL-CNY
    BRL-COP BRL-CRC BRL-CZK BRL-DKK BRL-EGP BRL-EUR BRL-GBP BRL-HKD BRL-HUF BRL-IDR BRL-ILS BRL-INR
    BRL-ISK BRL-JMD BRL-JOD BRL-JPY BRL-KES BRL-KRW BRL-LBP BRL-LKR BRL-MAD BRL-MXN BRL-MYR BRL-NAD
    BRL-NOK BRL-NPR BRL-NZD BRL-OMR BRL-PAB BRL-PEN BRL-PHP BRL-PKR BRL-PLN BRL-PYG BRL-QAR BRL-RON
    BRL-RSD BRL-RUB BRL-SAR BRL-SEK BRL-SGD BRL-THB BRL-TRY BRL-TWD BRL-USD BRL-UYU BRL-VEF BRL-XAF
    BRL-XAG BRL-XAU BRL-XCD BRL-XOF BRL-ZAR BTC-BRL BTC-EUR BTC-USD BYN-EUR BYN-USD CAD-BRL CAD-BRLPTAX
    CAD-EUR CAD-JPY CAD-UAH CAD-USD CHF-BRL CHF-BRLPTAX CHF-EUR CHF-JPY CHF-USD CLP-BOB CLP-BRL CLP-COP
    CLP-EUR CLP-USD CNY-BRL CNY-EUR CNY-JPY CNY-USD COP-BRL COP-CLP COP-USD CRC-BRL CRC-USD CZK-BRL
    CZK-USD DKK-BRL DKK-BRLPTAX DKK-EUR DKK-USD DOGE-BRL DOGE-EUR DOGE-USD EGP-BRL EGP-EUR EGP-USD ETH-BRL
    ETH-EUR ETH-USD EUR-AED EUR-AFN EUR-ALL EUR-AMD EUR-ANG EUR-AOA EUR-ARS EUR-AUD EUR-AZN EUR-BAM
    EUR-BBD EUR-BDT EUR-BGN EUR-BHD EUR-BIF EUR-BND EUR-BOB EUR-BRL EUR-BRLPTAX EUR-BRLT EUR-BSD EUR-BWP
    EUR-BYN EUR-BZD EUR-CAD EUR-CHF EUR-CLP EUR-CNY EUR-COP EUR-CRC EUR-CUP EUR-CVE EUR-CZK EUR-DJF
    EUR-DKK EUR-DOP EUR-DZD EUR-EGP EUR-ETB EUR-FJD EUR-GBP EUR-GEL EUR-GHS EUR-GMD EUR-GNF EUR-GTQ
    EUR-HKD EUR-HNL EUR-HRK EUR-HTG EUR-HUF EUR-IDR EUR-ILS EUR-INR EUR-IQD EUR-IRR EUR-ISK EUR-JMD
    EUR-JOD EUR-JPY EUR-KES EUR-KHR EUR-KRW EUR-KWD EUR-KYD EUR-KZT EUR-LAK EUR-LBP EUR-LKR EUR-LSL
    EUR-LYD EUR-MAD EUR-MDL EUR-MGA EUR-MKD EUR-MMK EUR-MOP EUR-MRO EUR-MUR EUR-MWK EUR-MXN EUR-MYR
    EUR-MZN EUR-NAD EUR-NGN EUR-NIO EUR-NOK EUR-NPR EUR-NZD EUR-OMR EUR-PAB EUR-PEN EUR-PGK EUR-PHP
    EUR-PKR EUR-PLN EUR-PYG EUR-QAR EUR-RON EUR-RSD EUR-RUB EUR-RWF EUR-SAR EUR-SCR EUR-SDG EUR-SDR
    EUR-SEK EUR-SGD EUR-SOS EUR-STD EUR-SVC EUR-SYP EUR-SZL EUR-THB EUR-TJS EUR-TND EUR-TRY EUR-TTD
    EUR-TWD EUR-TZS EUR-UAH EUR-UGX EUR-USD EUR-UYU EUR-UZS EUR-VEF EUR-VND EUR-XAF EUR-XCD EUR-XOF
    EUR-XPF EUR-ZAR EUR-ZMK FJD-USD GBP-AUD GBP-BRL GBP-BRLPTAX GBP-CHF GBP-EUR GBP-JPY GBP-USD GBP-XCD
    GBP-ZAR GEL-EUR GHS-EUR GHS-USD HKD-BRL HKD-EUR HKD-USD HUF-BRL HUF-EUR HUF-USD IDR-EUR IDR-USD
    ILS-BRL ILS-EUR ILS-NZD ILS-USD INR-BRL INR-EUR INR-USD IQD-USD IRR-USD JOD-EUR JOD-USD JPY-BRL
    JPY-BRLPTAX JPY-EUR JPY-USD KES-BRL KES-USD KRW-BRL KRW-EUR KRW-USD KWD-EUR KWD-USD KYD-USD LTC-BRL
    LTC-EUR LTC-USD MAD-EUR MXN-BRL MXN-EUR MXN-USD MXN-XCD MYR-USD NIO-USD NOK-BRL NOK-BRLPTAX NOK-EUR
    NOK-SEK NOK-USD NZD-BRL NZD-EUR NZD-ILS NZD-JPY NZD-USD PEN-BRL PEN-EUR PEN-USD PHP-BRL PHP-USD
    PLN-BRL PLN-EUR PLN-USD PYG-ARS PYG-BRL PYG-EUR PYG-USD RON-BRL RON-USD RSD-BRL RUB-BRL RUB-EUR
    RUB-USD SAR-BRL SAR-EUR SAR-USD SDG-USD SEK-BRL SEK-BRLPTAX SEK-EUR SEK-NOK SEK-USD SGD-BRL SGD-EUR
    SGD-USD SOL-BRL SOL-EUR SOL-USD SYP-USD THB-BRL THB-USD TRY-BRL TRY-EUR TRY-USD TWD-BRL TWD-EUR
    TWD-USD UAH-USD USD-AED USD-AFN USD-ALL USD-AMD USD-ANG USD-AOA USD-ARS USD-AUD USD-AZN USD-BBD
    USD-BDT USD-BGN USD-BHD USD-BIF USD-BND USD-BOB USD-BRL USD-BRLPTAX USD-BRLT USD-BSD USD-BWP USD-BYN
    USD-BZD USD-CAD USD-CHF USD-CLP USD-CNH USD-CNY USD-COP USD-CRC USD-CUP USD-CZK USD-DJF USD-DKK
    USD-DOP USD-DZD USD-EGP USD-ETB USD-EUR USD-FJD USD-GBP USD-GEL USD-GHS USD-GMD USD-GNF USD-GTQ
    USD-HKD USD-HNL USD-HRK USD-HTG USD-HUF USD-IDR USD-ILS USD-INR USD-IQD USD-IRR USD-ISK USD-JMD
    USD-JOD USD-JPY USD-KES USD-KGS USD-KHR USD-KMF USD-KRW USD-KWD USD-KYD USD-KZT USD-LAK USD-LBP
    USD-LKR USD-LSL USD-LYD USD-MAD USD-MDL USD-MGA USD-MKD USD-MMK USD-MNT USD-MOP USD-MRO USD-MUR
    USD-MVR USD-MWK USD-MXN USD-MYR USD-MZN USD-NAD USD-NGN USD-NGNI USD-NIO USD-NOK USD-NPR USD-NZD
    USD-OMR USD-PAB USD-PEN USD-PGK USD-PHP USD-PKR USD-PLN USD-PYG USD-QAR USD-RON USD-RSD USD-RUB
    USD-RWF USD-SAR USD-SCR USD-SDG USD-SEK USD-SGD USD-SOS USD-STD USD-SVC USD-SYP USD-SZL USD-THB
    USD-TJS USD-TMT USD-TND USD-TRY USD-TTD USD-TWD USD-TZS USD-UAH USD-UGX USD-UYU USD-UZS USD-VEF
    USD-VND USD-VUV USD-XAF USD-XCD USD-XOF USD-XPF USD-YER USD-ZAR USD-ZMK USD-ZWL UYU-BRL UYU-USD
    VEF-BRL VEF-EUR VEF-USD VND-USD XAG-BRL XAG-EUR XAG-USD XAGG-EUR XAGG-USD XAU-BRL XAU-EUR XAU-USD
    XBR-USD XCD-GBP XCD-USD XOF-USD XPF-EUR XPF-USD XRP-BRL XRP-EUR XRP-USD ZAR-BRL ZAR-EUR ZAR-USD
`
      .split(/\s+/)
      .filter(Boolean),
  );
  const MINIMO_PARES_VALIDOS = 100;

  // ---------- Rota e taxa ----------

  const PIVOS = ["USD", "BRL", "EUR"];

  function trecho(pares, de, para) {
    if (pares.has(`${de}-${para}`)) return { par: `${de}-${para}`, invertido: false };
    if (pares.has(`${para}-${de}`)) return { par: `${para}-${de}`, invertido: true };
    return null;
  }

  /**
   * Caminho mais curto de [de] até [para] passando, se preciso, pelo dólar, real ou euro.
   * Lista vazia se forem iguais; null se não houver caminho.
   */
  function encontrarRota(pares, de, para) {
    if (de === para) return [];
    const anterior = new Map();
    const visitados = new Set([de]);
    const fila = [de];
    while (fila.length) {
      const atual = fila.shift();
      const ultimo = trecho(pares, atual, para);
      if (ultimo) {
        const caminho = [atual];
        while (caminho[0] !== de) caminho.unshift(anterior.get(caminho[0]));
        const trechos = [];
        for (let i = 0; i < caminho.length - 1; i++) trechos.push(trecho(pares, caminho[i], caminho[i + 1]));
        return [...trechos, ultimo];
      }
      for (const pivo of PIVOS) {
        if (!visitados.has(pivo) && trecho(pares, atual, pivo)) {
          visitados.add(pivo);
          anterior.set(pivo, atual);
          fila.push(pivo);
        }
      }
    }
    return null;
  }

  /** Moedas intermediárias da rota (vazio para conversão direta). */
  function intermediarias(rota) {
    const moedas = [];
    for (let i = 0; i < rota.length - 1; i++) {
      const [a, b] = rota[i].par.split("-");
      moedas.push(rota[i].invertido ? a : b);
    }
    return moedas;
  }

  /** Taxa final da rota (quanto vale 1 unidade da origem) ou null se faltar cotação. */
  function taxa(rota, cotacoes) {
    let acumulado = 1;
    for (const t of rota) {
      const bid = cotacoes.get(t.par);
      if (!(bid > 0)) return null;
      acumulado = t.invertido ? acumulado / bid : acumulado * bid;
    }
    return acumulado;
  }

  const converter = (valor, taxaFinal) => valor * taxaFinal;
  const inversa = (taxaFinal) => 1 / taxaFinal;

  /**
   * Cotação de um trecho no sentido da conversão. Ao inverter, quem compra passa a vender
   * (compra' = 1/venda e venda' = 1/compra) e a máxima vira a mínima.
   */
  function cotacaoTrecho(t, c) {
    if (!t.invertido) {
      return { taxa: c.bid, compra: c.bid, venda: c.ask, maxima: c.high, minima: c.low, variacao: c.pct, momento: c.momento };
    }
    return {
      taxa: 1 / c.bid,
      compra: c.ask != null ? 1 / c.ask : 1 / c.bid,
      venda: 1 / c.bid,
      maxima: c.low != null ? 1 / c.low : null,
      minima: c.high != null ? 1 / c.high : null,
      variacao: c.pct != null ? (1 / (1 + c.pct / 100) - 1) * 100 : null,
      momento: c.momento,
    };
  }

  /**
   * Combina as cotações dos trechos (Map par → cotação). Na conversão com mais de um trecho,
   * máxima e mínima do dia não são combináveis e ficam nulas. momento é o da cotação mais antiga.
   */
  function combinar(rota, cotacoes) {
    if (rota.length === 0) return null;
    const partes = [];
    for (const t of rota) {
      const c = cotacoes.get(t.par);
      if (!c || !(c.bid > 0)) return null;
      partes.push(cotacaoTrecho(t, c));
    }
    if (partes.length === 1) return { ...partes[0], via: [] };
    const produto = (f) => partes.reduce((acc, p) => (acc === null || f(p) == null ? null : acc * f(p)), 1);
    const fatorVariacao = produto((p) => (p.variacao == null ? null : 1 + p.variacao / 100));
    return {
      taxa: partes.reduce((acc, p) => acc * p.taxa, 1),
      compra: produto((p) => p.compra),
      venda: produto((p) => p.venda),
      maxima: null,
      minima: null,
      variacao: fatorVariacao === null ? null : (fatorVariacao - 1) * 100,
      momento: Math.min(...partes.map((p) => p.momento)),
      via: intermediarias(rota),
    };
  }

  // ---------- API ----------

  const urlUltimas = (pares) => `${BASE}last/${pares.join(",")}`;
  const urlHistorico = (par, dias) => `${BASE}daily/${par}/${dias}`;
  const urlDisponiveis = () => `${BASE}available`;

  const numeroPositivo = (texto) => {
    const n = Number(String(texto ?? "").trim());
    return String(texto ?? "").trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
  };
  const numeroOuNulo = (texto) => {
    const n = Number(String(texto ?? "").trim());
    return String(texto ?? "").trim() !== "" && Number.isFinite(n) ? n : null;
  };

  /** Erro da consulta, com o tipo usado nas mensagens (como ErroCotacao do app). */
  class ErroCotacao extends Error {
    constructor(tipo) {
      super(tipo);
      this.tipo = tipo;
    }
  }

  /**
   * Lê a resposta de /json/last para os pares pedidos. A resposta usa o par sem hífen como
   * chave ("USD-BRL" → "USDBRL"). timestamp em segundos (em milissegundos em alguns pares).
   */
  function lerUltimas(json, pares, agoraSeg = Math.floor(Date.now() / 1000)) {
    const raiz = typeof json === "string" ? JSON.parse(json) : json;
    if (!raiz || typeof raiz !== "object" || Array.isArray(raiz)) throw new ErroCotacao("SERVICO_INDISPONIVEL");
    const resultado = new Map();
    for (const par of pares) {
      const item = raiz[par.replace("-", "")];
      if (!item || typeof item !== "object") throw new ErroCotacao("PAR_INDISPONIVEL");
      const bid = numeroPositivo(item.bid);
      if (bid === null) throw new ErroCotacao("SERVICO_INDISPONIVEL");
      let momento = Number.parseInt(item.timestamp, 10);
      if (!Number.isFinite(momento)) momento = agoraSeg;
      else if (momento > 100000000000) momento = Math.floor(momento / 1000);
      resultado.set(par, {
        bid,
        ask: numeroPositivo(item.ask),
        high: numeroPositivo(item.high),
        low: numeroPositivo(item.low),
        pct: numeroOuNulo(item.pctChange),
        momento,
      });
    }
    return resultado;
  }

  /** Histórico diário (a API manda do mais recente para o mais antigo) em ordem cronológica. */
  function lerHistorico(json) {
    const raiz = typeof json === "string" ? JSON.parse(json) : json;
    if (!Array.isArray(raiz)) return [];
    const vistos = new Set();
    const pontos = [];
    for (const item of raiz) {
      const bid = numeroPositivo(item && item.bid);
      const ts = Number.parseInt(item && item.timestamp, 10);
      if (bid === null || !Number.isFinite(ts) || vistos.has(ts)) continue;
      vistos.add(ts);
      pontos.push({ momento: ts * 1000, bid });
    }
    return pontos.sort((a, b) => a.momento - b.momento);
  }

  /** Histórico de um par já no sentido da conversão. */
  const orientarHistorico = (t, pontos) =>
    t.invertido ? pontos.map((p) => ({ momento: p.momento, bid: 1 / p.bid })) : pontos;

  /** Pares de /json/available (chaves com um único hífen). */
  function lerDisponiveis(json) {
    const raiz = typeof json === "string" ? JSON.parse(json) : json;
    if (!raiz || typeof raiz !== "object" || Array.isArray(raiz)) return new Set();
    return new Set(Object.keys(raiz).filter((k) => /^[A-Z0-9]+-[A-Z0-9]+$/.test(k)));
  }

  // ---------- Valor digitado ----------

  const TAMANHO_MAXIMO = 18;

  /** Mantém apenas dígitos, vírgula e ponto, limitando o tamanho do texto. */
  const limparEntrada = (texto) => String(texto).replace(/[^0-9.,]/g, "").slice(0, TAMANHO_MAXIMO);

  /**
   * "1.234,56", "1234,56", "1234.56" e "1,234.56" viram 1234.56. Um único ponto seguido de
   * exatamente três dígitos ("2.500") é milhar, como no Brasil. null quando não é um número.
   */
  function interpretar(texto) {
    const t = String(texto).replace(/[\s ]/g, "");
    if (!t || /[^0-9.,]/.test(t) || !/\d/.test(t)) return null;
    const virgulas = (t.match(/,/g) || []).length;
    const pontos = (t.match(/\./g) || []).length;
    let normalizado;
    if (virgulas > 0 && pontos > 0) {
      const decimal = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
      if ((decimal === "," ? virgulas : pontos) > 1) return null;
      const milhar = decimal === "," ? "." : ",";
      normalizado = t.split(milhar).join("").replace(decimal, ".");
    } else if (virgulas > 1) {
      return null;
    } else if (virgulas === 1) {
      normalizado = t.replace(",", ".");
    } else if (pontos > 1) {
      normalizado = t.split(".").join("");
    } else if (pontos === 1) {
      const [inteiro, fracao] = t.split(".");
      const pareceMilhar = fracao.length === 3 && inteiro.length >= 1 && inteiro.length <= 3 && /[1-9]/.test(inteiro);
      normalizado = pareceMilhar ? t.replace(".", "") : t;
    } else {
      normalizado = t;
    }
    if (!/^(\d+\.?\d*|\.\d+)$/.test(normalizado)) return null;
    const valor = Number(normalizado);
    return Number.isFinite(valor) ? valor : null;
  }

  // ---------- Formatação ----------

  /** Casas decimais ISO 4217 diferentes de 2 (tabela do java.util.Currency usada pelo app). */
  const CASAS_ZERO = new Set(["BIF", "BYR", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "UYI", "VND", "VUV", "XAF", "XOF", "XPF"]);
  const CASAS_TRES = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);
  const casasPadrao = (codigo) => (CASAS_ZERO.has(codigo) ? 0 : CASAS_TRES.has(codigo) ? 3 : 2);

  const MAX_CASAS_CRIPTO = 8;
  const DIGITOS_SIGNIFICATIVOS = 4;
  const DIAS_PARA_DESATUALIZAR = 4;
  const ESPACO = " ";

  /** Número ≥ 0 como inteiro de dígitos e quantidade de casas (a partir da representação curta). */
  function decimal(v) {
    const [mantissa, expoente = "0"] = String(v).split("e");
    const [inteiro, fracao = ""] = mantissa.split(".");
    let digitos = inteiro + fracao;
    let casas = fracao.length - Number(expoente);
    if (casas < 0) {
      digitos += "0".repeat(-casas);
      casas = 0;
    }
    return { digitos: BigInt(digitos), casas };
  }

  /** Casas necessárias para mostrar 4 dígitos significativos de um número menor que 1. */
  function casasParaSignificativos(valor, limite) {
    const abs = Math.abs(valor);
    if (abs === 0) return 2;
    const zeros = -Number(abs.toExponential().split("e")[1]) - 1;
    return Math.min(limite, Math.max(2, zeros + DIGITOS_SIGNIFICATIVOS));
  }

  /** "1.234,5": arredonda meio para cima em maxCasas, tira zeros à direita e completa até minCasas. */
  function formatarNumero(valor, minCasas, maxCasas) {
    const { digitos, casas } = decimal(Math.abs(valor));
    let n = digitos;
    if (casas > maxCasas) {
      const divisor = 10n ** BigInt(casas - maxCasas);
      const resto = n % divisor;
      n /= divisor;
      if (resto * 2n >= divisor) n += 1n;
    } else {
      n *= 10n ** BigInt(maxCasas - casas);
    }
    let texto = n.toString().padStart(maxCasas + 1, "0");
    const inteiro = maxCasas ? texto.slice(0, -maxCasas) : texto;
    let fracao = maxCasas ? texto.slice(-maxCasas) : "";
    fracao = fracao.replace(/0+$/, "");
    if (fracao.length < minCasas) fracao = fracao.padEnd(minCasas, "0");
    const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const sinal = valor < 0 && n !== 0n ? "-" : "";
    return sinal + agrupado + (fracao ? `,${fracao}` : "");
  }

  const simbolos = new Map();
  /** Símbolo da moeda no padrão brasileiro ("R$", "US$", "€"); o código quando não há. */
  function simbolo(moeda) {
    if (!simbolos.has(moeda.codigo)) {
      let s = moeda.codigo;
      try {
        const parte = new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda.codigo })
          .formatToParts(1)
          .find((p) => p.type === "currency");
        if (parte) s = parte.value;
      } catch {
        // código fora do padrão ISO: fica o próprio código
      }
      simbolos.set(moeda.codigo, s);
    }
    return simbolos.get(moeda.codigo);
  }

  /** Faixa [mínimo, máximo] de casas: valores pequenos ganham casas para não virar "0,00". */
  function casasDecimais(valor, moeda) {
    if (moeda.tipo === "cripto") return [2, MAX_CASAS_CRIPTO];
    const padrao = casasPadrao(moeda.codigo);
    const abs = Math.abs(valor);
    if (abs === 0 || abs >= 1) return [padrao, padrao];
    return [padrao, Math.max(padrao, casasParaSignificativos(abs, MAX_CASAS_CRIPTO))];
  }

  /** "R$ 1.234,56" para moedas comuns; "0,00012345 BTC" para criptomoedas e commodities. */
  function formatarValor(valor, moeda) {
    const [min, max] = casasDecimais(valor, moeda);
    const numero = formatarNumero(valor, min, max);
    return moeda.tipo === "fiduciaria" ? `${simbolo(moeda)}${ESPACO}${numero}` : `${numero}${ESPACO}${moeda.codigo}`;
  }

  /** Número de uma taxa: 4 casas se ≥ 1, senão dígitos significativos (até 10 casas). */
  const formatarNumeroTaxa = (t) => formatarNumero(t, 2, Math.abs(t) >= 1 ? 4 : casasParaSignificativos(t, 10));

  /** "1 USD = 4,9652 BRL". */
  const formatarTaxa = (de, para, t) => `1 ${de.codigo} = ${formatarNumeroTaxa(t)} ${para.codigo}`;

  /** "+1,25%" ou "-0,40%". */
  function formatarVariacao(pct) {
    const texto = formatarNumero(pct, 2, 2);
    return texto.startsWith("-") || texto === "0,00" ? `${texto}%` : `+${texto}%`;
  }

  const formatosData = new Map();
  /** "23/10/2026 às 18:30" no fuso informado (o do navegador por padrão). */
  function formatarData(epochSegundos, fuso) {
    const chave = fuso || "";
    if (!formatosData.has(chave)) {
      formatosData.set(
        chave,
        new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
          ...(fuso ? { timeZone: fuso } : {}),
        }),
      );
    }
    const p = Object.fromEntries(
      formatosData
        .get(chave)
        .formatToParts(new Date(epochSegundos * 1000))
        .map((x) => [x.type, x.value]),
    );
    return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
  }

  /** A fonte parou de atualizar o par (algumas moedas raras ficam meses sem cotação nova). */
  const cotacaoDesatualizada = (epochSegundos, agoraMs) =>
    agoraMs - epochSegundos * 1000 > DIAS_PARA_DESATUALIZAR * 24 * 60 * 60 * 1000;

  // ---------- Mensagens ----------

  function mensagemErro(tipo, origem, destino) {
    switch (tipo) {
      case "SEM_CONEXAO":
        return "Sem conexão com a internet. Verifique sua rede e tente novamente.";
      case "TEMPO_ESGOTADO":
        return "O serviço de cotações demorou para responder. Tente novamente.";
      case "PAR_INDISPONIVEL":
        return `A cotação de ${origem.nome} para ${destino.nome} não está disponível no momento.`;
      case "MUITAS_CONSULTAS":
        return "Muitas consultas em pouco tempo. Aguarde alguns segundos e tente novamente.";
      default:
        return "O serviço de cotações está indisponível agora. Tente novamente mais tarde.";
    }
  }

  const mensagemCotacaoSalva = (tipo) =>
    tipo === "SEM_CONEXAO" || tipo === "TEMPO_ESGOTADO"
      ? "Sem conexão. Usando a última cotação salva."
      : "Não foi possível atualizar. Usando a última cotação salva.";

  /** Tipo de erro para uma resposta HTTP sem sucesso. */
  const erroHttp = (status) =>
    status === 404 ? "PAR_INDISPONIVEL" : status === 429 ? "MUITAS_CONSULTAS" : "SERVICO_INDISPONIVEL";

  return {
    MOEDAS,
    POPULARES,
    PARES_EMBUTIDOS,
    MINIMO_PARES_VALIDOS,
    TAMANHO_MAXIMO,
    ErroCotacao,
    normalizar,
    porCodigo,
    encontrarRota,
    intermediarias,
    taxa,
    converter,
    inversa,
    combinar,
    urlUltimas,
    urlHistorico,
    urlDisponiveis,
    lerUltimas,
    lerHistorico,
    orientarHistorico,
    lerDisponiveis,
    limparEntrada,
    interpretar,
    casasPadrao,
    formatarNumero,
    simbolo,
    casasDecimais,
    formatarValor,
    formatarNumeroTaxa,
    formatarTaxa,
    formatarVariacao,
    formatarData,
    cotacaoDesatualizada,
    mensagemErro,
    mensagemCotacaoSalva,
    erroHttp,
  };
})();

if (typeof module === "object") module.exports = LogicaMoedas;
