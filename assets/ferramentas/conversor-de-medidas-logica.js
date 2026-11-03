"use strict";
/*
 * Lógica do conversor de medidas, sem DOM.
 * Catálogo e conversão portados de core/medidas/UnitCatalog.kt da Calculadora Multifunção
 * (tudo passa pela unidade base da categoria: valor → base → destino), nomes de
 * ui/tools/medidas/MedidasNames.kt + res/values/strings_medidas.xml, e a formatação
 * "inteligente" de NumberFormatter.smart (util/Formatters.kt).
 */
const LogicaMedidas = (() => {
  const N = typeof Numeros === "object" ? Numeros : require("../numeros.js");

  /** Categorias na ordem do app, com o par de unidades sugerido e a observação de cada uma. */
  const CATEGORIAS = [
    { id: "comprimento", nome: "Comprimento", par: ["m", "foot"] },
    {
      id: "area",
      nome: "Área",
      par: ["m2", "hectare"],
      nota: "Alqueire paulista = 24.200 m² (2,42 ha) e alqueire mineiro = 48.400 m² (4,84 ha).",
    },
    {
      id: "volume",
      nome: "Volume",
      par: ["liter", "ml"],
      nota: "Xícara de 240 mL e colheres de 15 mL e 5 mL (padrão métrico de receitas).",
    },
    { id: "massa", nome: "Massa", par: ["kg", "pound"] },
    {
      id: "temperatura",
      nome: "Temperatura",
      par: ["celsius", "fahrenheit"],
      nota: "Temperatura não é proporcional: as escalas têm pontos zero diferentes.",
    },
    {
      id: "velocidade",
      nome: "Velocidade",
      par: ["kmh", "mps"],
      nota: "Mach considerado ao nível do mar a 15 °C (340,3 m/s).",
    },
    {
      id: "tempo",
      nome: "Tempo",
      par: ["hour", "minute"],
      nota: "Mês e ano usam a duração média do calendário gregoriano (30,44 e 365,24 dias).",
    },
    {
      id: "dados",
      nome: "Dados",
      par: ["gb", "mb"],
      nota:
        "kB, MB, GB… usam potências de 1000 (padrão SI). KiB, MiB, GiB… usam potências de 1024 " +
        "(padrão IEC), como a memória RAM e alguns sistemas operacionais.",
    },
    { id: "pressao", nome: "Pressão", par: ["bar", "psi"] },
    { id: "energia", nome: "Energia", par: ["kcal", "kj"] },
    { id: "potencia", nome: "Potência", par: ["cv", "kw"] },
    { id: "frequencia", nome: "Frequência", par: ["rpm", "hz"] },
    { id: "angulo", nome: "Ângulo", par: ["degree", "radian"] },
    { id: "forca", nome: "Força", par: ["kgf", "newton"] },
    {
      id: "consumo",
      nome: "Consumo de combustível",
      par: ["kml", "l100km"],
      nota: "Em L/100 km, quanto menor o valor, mais econômico o veículo. A conversão é inversamente proporcional.",
    },
    { id: "torque", nome: "Torque", par: ["kgfm", "nm_torque"] },
  ];

  const KIB = 1024;
  const unidades = [];
  let categoriaAtual = null;

  function categoria(id) {
    categoriaAtual = id;
  }

  /** Unidade proporcional: fator para a unidade base da categoria. */
  function linear(id, simbolo, fator, nome) {
    unidades.push({
      id,
      simbolo,
      nome,
      categoria: categoriaAtual,
      paraBase: (v) => v * fator,
      daBase: (v) => v / fator,
    });
  }

  /** Unidade não linear (temperatura, L/100 km). */
  function propria(id, simbolo, paraBase, daBase, nome) {
    unidades.push({ id, simbolo, nome, categoria: categoriaAtual, paraBase, daBase });
  }

  categoria("comprimento"); // base: metro
  linear("nm", "nm", 1e-9, "Nanômetro");
  linear("um", "µm", 1e-6, "Micrômetro");
  linear("mm", "mm", 1e-3, "Milímetro");
  linear("cm", "cm", 1e-2, "Centímetro");
  linear("dm", "dm", 0.1, "Decímetro");
  linear("m", "m", 1, "Metro");
  linear("km", "km", 1000, "Quilômetro");
  linear("inch", "in", 0.0254, "Polegada");
  linear("foot", "ft", 0.3048, "Pé");
  linear("yard", "yd", 0.9144, "Jarda");
  linear("mile", "mi", 1609.344, "Milha");
  linear("nautical_mile", "nmi", 1852, "Milha náutica");
  linear("light_year", "ly", 9.4607304725808e15, "Ano-luz");

  categoria("area"); // base: metro quadrado
  linear("mm2", "mm²", 1e-6, "Milímetro quadrado");
  linear("cm2", "cm²", 1e-4, "Centímetro quadrado");
  linear("m2", "m²", 1, "Metro quadrado");
  linear("are", "a", 100, "Are (100 m²)");
  linear("hectare", "ha", 1e4, "Hectare");
  linear("km2", "km²", 1e6, "Quilômetro quadrado");
  linear("in2", "in²", 0.00064516, "Polegada quadrada");
  linear("ft2", "ft²", 0.09290304, "Pé quadrado");
  linear("yd2", "yd²", 0.83612736, "Jarda quadrada");
  linear("acre", "ac", 4046.8564224, "Acre");
  linear("mi2", "mi²", 2589988.110336, "Milha quadrada");
  linear("alqueire_sp", "alq SP", 24200, "Alqueire paulista");
  linear("alqueire_mg", "alq MG", 48400, "Alqueire mineiro");

  categoria("volume"); // base: litro
  linear("ml", "mL", 1e-3, "Mililitro");
  linear("cl", "cL", 1e-2, "Centilitro");
  linear("dl", "dL", 0.1, "Decilitro");
  linear("liter", "L", 1, "Litro");
  linear("m3", "m³", 1000, "Metro cúbico");
  linear("cm3", "cm³", 1e-3, "Centímetro cúbico");
  linear("in3", "in³", 0.016387064, "Polegada cúbica");
  linear("ft3", "ft³", 28.316846592, "Pé cúbico");
  linear("tsp", "tsp", 0.005, "Colher de chá (5 mL)");
  linear("tbsp", "tbsp", 0.015, "Colher de sopa (15 mL)");
  linear("cup", "xíc.", 0.24, "Xícara (240 mL)");
  linear("cup_us", "xíc. EUA", 0.2365882365, "Xícara americana (US cup)");
  linear("floz_us", "fl oz US", 0.0295735295625, "Onça fluida (EUA)");
  linear("floz_uk", "fl oz UK", 0.0284130625, "Onça fluida (Reino Unido)");
  linear("pint_us", "pt US", 0.473176473, "Pinta (EUA)");
  linear("pint_uk", "pt UK", 0.56826125, "Pinta (Reino Unido)");
  linear("quart_us", "qt US", 0.946352946, "Quarto de galão (EUA)");
  linear("gallon_us", "gal US", 3.785411784, "Galão (EUA)");
  linear("gallon_uk", "gal UK", 4.54609, "Galão imperial (Reino Unido)");
  linear("barrel", "bbl", 158.987294928, "Barril de petróleo");

  categoria("massa"); // base: quilograma
  linear("ug", "µg", 1e-9, "Micrograma");
  linear("mg", "mg", 1e-6, "Miligrama");
  linear("carat", "ct", 2e-4, "Quilate");
  linear("g", "g", 1e-3, "Grama");
  linear("ounce", "oz", 0.028349523125, "Onça");
  linear("pound", "lb", 0.45359237, "Libra");
  linear("kg", "kg", 1, "Quilograma");
  linear("stone", "st", 6.35029318, "Stone (6,35 kg)");
  linear("arroba", "@", 15, "Arroba (15 kg)");
  linear("tonne", "t", 1000, "Tonelada");
  linear("short_ton", "ton US", 907.18474, "Tonelada curta (EUA)");
  linear("long_ton", "ton UK", 1016.0469088, "Tonelada longa (Reino Unido)");

  categoria("temperatura"); // base: kelvin
  propria("celsius", "°C", (v) => v + 273.15, (v) => v - 273.15, "Celsius");
  propria(
    "fahrenheit",
    "°F",
    (v) => ((v - 32) * 5) / 9 + 273.15,
    (v) => ((v - 273.15) * 9) / 5 + 32,
    "Fahrenheit",
  );
  propria("kelvin", "K", (v) => v, (v) => v, "Kelvin");
  propria("rankine", "°R", (v) => (v * 5) / 9, (v) => (v * 9) / 5, "Rankine");
  propria("reaumur", "°Ré", (v) => (v * 5) / 4 + 273.15, (v) => ((v - 273.15) * 4) / 5, "Réaumur");

  categoria("velocidade"); // base: metro por segundo
  linear("mps", "m/s", 1, "Metro por segundo");
  linear("kmh", "km/h", 1 / 3.6, "Quilômetro por hora");
  linear("mph", "mph", 0.44704, "Milha por hora");
  linear("knot", "kn", 1852 / 3600, "Nó");
  linear("fps", "ft/s", 0.3048, "Pé por segundo");
  linear("mach", "Mach", 340.294, "Mach (nível do mar)");

  categoria("tempo"); // base: segundo
  linear("ns", "ns", 1e-9, "Nanossegundo");
  linear("us", "µs", 1e-6, "Microssegundo");
  linear("ms", "ms", 1e-3, "Milissegundo");
  linear("second", "s", 1, "Segundo");
  linear("minute", "min", 60, "Minuto");
  linear("hour", "h", 3600, "Hora");
  linear("day", "d", 86400, "Dia");
  linear("week", "sem", 604800, "Semana");
  linear("month", "mês", 2629746, "Mês (média)"); // 30,436875 dias (média gregoriana)
  linear("year", "ano", 31556952, "Ano (média)"); // 365,2425 dias
  linear("decade", "déc.", 315569520, "Década");
  linear("century", "séc.", 3155695200, "Século");

  categoria("dados"); // base: bit. Prefixos SI (1000) e IEC (1024) separados.
  linear("bit", "bit", 1, "Bit");
  linear("kbit", "kbit", 1e3, "Quilobit");
  linear("mbit", "Mbit", 1e6, "Megabit");
  linear("gbit", "Gbit", 1e9, "Gigabit");
  linear("byte", "B", 8, "Byte");
  linear("kb", "kB", 8e3, "Quilobyte (1000 B)");
  linear("mb", "MB", 8e6, "Megabyte");
  linear("gb", "GB", 8e9, "Gigabyte");
  linear("tb", "TB", 8e12, "Terabyte");
  linear("pb", "PB", 8e15, "Petabyte");
  linear("kib", "KiB", 8 * KIB, "Kibibyte (1024 B)");
  linear("mib", "MiB", 8 * KIB * KIB, "Mebibyte");
  linear("gib", "GiB", 8 * KIB * KIB * KIB, "Gibibyte");
  linear("tib", "TiB", 8 * KIB * KIB * KIB * KIB, "Tebibyte");
  linear("pib", "PiB", 8 * KIB * KIB * KIB * KIB * KIB, "Pebibyte");

  categoria("pressao"); // base: pascal
  linear("pa", "Pa", 1, "Pascal");
  linear("kpa", "kPa", 1e3, "Quilopascal");
  linear("mpa", "MPa", 1e6, "Megapascal");
  linear("bar", "bar", 1e5, "Bar");
  linear("mbar", "mbar", 100, "Milibar (hPa)");
  linear("atm", "atm", 101325, "Atmosfera");
  linear("psi", "psi", 6894.757293168, "Libra por polegada quadrada");
  linear("mmhg", "mmHg", 133.322387415, "Milímetro de mercúrio");
  linear("inhg", "inHg", 3386.388640341, "Polegada de mercúrio");
  linear("torr", "Torr", 101325 / 760, "Torr");
  linear("kgfcm2", "kgf/cm²", 98066.5, "Quilograma-força por cm²");

  categoria("energia"); // base: joule
  linear("joule", "J", 1, "Joule");
  linear("kj", "kJ", 1e3, "Quilojoule");
  linear("cal", "cal", 4.184, "Caloria");
  linear("kcal", "kcal", 4184, "Quilocaloria");
  linear("wh", "Wh", 3600, "Watt-hora");
  linear("kwh", "kWh", 3.6e6, "Quilowatt-hora");
  linear("ev", "eV", 1.602176634e-19, "Elétron-volt");
  linear("btu", "BTU", 1055.05585262, "Unidade térmica britânica");

  categoria("potencia"); // base: watt
  linear("watt", "W", 1, "Watt");
  linear("kw", "kW", 1e3, "Quilowatt");
  linear("megawatt", "MW", 1e6, "Megawatt");
  linear("cv", "cv", 735.49875, "Cavalo-vapor");
  linear("hp", "hp", 745.6998715822702, "Horsepower (hp)");
  linear("btuh", "BTU/h", 0.29307107017, "BTU por hora");
  linear("kcalh", "kcal/h", 1.163, "Quilocaloria por hora");

  categoria("frequencia"); // base: hertz
  linear("hz", "Hz", 1, "Hertz");
  linear("khz", "kHz", 1e3, "Quilohertz");
  linear("mhz", "MHz", 1e6, "Megahertz");
  linear("ghz", "GHz", 1e9, "Gigahertz");
  linear("rpm", "rpm", 1 / 60, "Rotações por minuto");

  categoria("angulo"); // base: grau
  linear("degree", "°", 1, "Grau");
  linear("radian", "rad", 180 / Math.PI, "Radiano");
  linear("gradian", "grad", 0.9, "Grado (gon)");
  linear("arcminute", "′", 1 / 60, "Minuto de arco");
  linear("arcsecond", "″", 1 / 3600, "Segundo de arco");
  linear("turn", "volta", 360, "Volta completa");

  categoria("forca"); // base: newton
  linear("newton", "N", 1, "Newton");
  linear("kn", "kN", 1e3, "Quilonewton");
  linear("kgf", "kgf", 9.80665, "Quilograma-força");
  linear("lbf", "lbf", 4.4482216152605, "Libra-força");
  linear("dyn", "dyn", 1e-5, "Dina");

  categoria("consumo"); // base: km/L — L/100 km é inversamente proporcional
  propria("kml", "km/L", (v) => v, (v) => v, "Quilômetros por litro");
  propria("l100km", "L/100 km", (v) => 100 / v, (v) => 100 / v, "Litros por 100 km");
  linear("mpg_us", "mpg US", 1.609344 / 3.785411784, "Milhas por galão (EUA)");
  linear("mpg_uk", "mpg UK", 1.609344 / 4.54609, "Milhas por galão (Reino Unido)");

  categoria("torque"); // base: newton-metro
  linear("nm_torque", "N·m", 1, "Newton-metro");
  linear("kgfm", "kgf·m", 9.80665, "Quilograma-força metro");
  linear("lbfft", "lbf·ft", 1.3558179483314004, "Libra-força pé");
  linear("lbfin", "lbf·in", 0.1129848290276167, "Libra-força polegada");

  const porId = new Map(unidades.map((u) => [u.id, u]));
  const categoriaPorId = new Map(CATEGORIAS.map((c) => [c.id, c]));

  const unidade = (id) => porId.get(id) || null;
  const daCategoria = (idCategoria) => unidades.filter((u) => u.categoria === idCategoria);
  const dadosCategoria = (id) => categoriaPorId.get(id) || null;

  /** Converte [valor] de uma unidade para outra (as duas da mesma categoria). */
  function converter(valor, deId, paraId) {
    const de = unidade(deId);
    const para = unidade(paraId);
    if (!de || !para) throw new Error(`Unidade desconhecida: ${deId} → ${paraId}`);
    if (de.categoria !== para.categoria) throw new Error(`Categorias diferentes: ${deId} → ${paraId}`);
    if (de === para) return valor;
    return para.daBase(de.paraBase(valor));
  }

  /**
   * Lê o valor digitado como Numeros.ler e aceita também notação científica
   * ("1e-3", "2,5E6"), como parseDecimal do app.
   */
  function ler(texto) {
    const limpo = String(texto ?? "").trim().replace(/−/g, "-");
    const partes = /^(.+?)[eE]([+-]?\d+)$/.exec(limpo);
    if (!partes) return N.ler(limpo);
    const base = N.ler(partes[1]);
    if (base === null) return null;
    const textoBase = String(base);
    const valor = textoBase.includes("e")
      ? base * 10 ** Number(partes[2])
      : Number(`${textoBase}e${partes[2]}`);
    return Number.isFinite(valor) ? valor : null;
  }

  const SOBRESCRITOS = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "-": "⁻" };
  const sobrescrito = (n) => [...String(n)].map((c) => SOBRESCRITOS[c] ?? c).join("");

  /** "-0" e "-0,00" viram "0" (o Intl mantém o sinal de zero negativo). */
  const semZeroNegativo = (texto) => (/^-[0,.]*$/.test(texto) ? texto.slice(1) : texto);

  /** Notação científica legível: 1,2345 × 10⁻⁷. */
  function cientifica(valor, casas = 6) {
    if (valor === 0) return "0";
    if (!Number.isFinite(valor)) return inteligente(valor);
    let expoente = Math.floor(Math.log10(Math.abs(valor)));
    let mantissa = Number((valor / 10 ** expoente).toFixed(casas));
    // Corrige arredondamentos do tipo 9,9999999 → 10
    if (Math.abs(mantissa) >= 10) {
      mantissa /= 10;
      expoente += 1;
    }
    return `${semZeroNegativo(N.numero(mantissa, casas))} × 10${sobrescrito(expoente)}`;
  }

  /**
   * Até [significativos] algarismos significativos, com notação científica para valores
   * muito grandes (≥ 10¹⁵) ou muito pequenos (< 10⁻⁶), como no app.
   */
  function inteligente(valor, significativos = 10) {
    if (Number.isNaN(valor)) return "—";
    if (!Number.isFinite(valor)) return valor > 0 ? "∞" : "-∞";
    if (valor === 0) return "0";
    const absoluto = Math.abs(valor);
    if (absoluto >= 1e15 || absoluto < 1e-6) return cientifica(valor, significativos - 1);
    const arredondado = Number(valor.toPrecision(significativos));
    return semZeroNegativo(N.numero(arredondado, 12));
  }

  return {
    CATEGORIAS,
    unidades,
    unidade,
    daCategoria,
    dadosCategoria,
    converter,
    ler,
    inteligente,
    cientifica,
  };
})();

if (typeof module === "object") module.exports = LogicaMedidas;
