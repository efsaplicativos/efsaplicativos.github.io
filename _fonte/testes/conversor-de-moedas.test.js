"use strict";
// Casos de ConversaoTest.kt, FormatadorMoedaTest.kt e LeitorValorTest.kt (Conversor de Moedas)
// e de MoedasCoreTest.kt (Calculadora Multifunção).
// Rode: node _fonte/testes/conversor-de-moedas.test.js
const assert = require("node:assert/strict");
const L = require("../../assets/ferramentas/conversor-de-moedas-logica.js");

const perto = (real, esperado, tolerancia) =>
  assert.ok(Math.abs(real - esperado) <= tolerancia, `esperado ${esperado}, veio ${real}`);

const pares = new Set(["USD-BRL", "EUR-BRL", "EUR-USD", "USD-AFN", "EUR-CVE", "USD-KMF", "BTC-BRL", "BTC-USD"]);
const T = (par, invertido) => ({ par, invertido });
const duasCasas = (v) => L.formatarNumero(v, 2, 2);

const brl = L.porCodigo("BRL");
const usd = L.porCodigo("USD");
const btc = L.porCodigo("BTC");
const jpy = L.porCodigo("JPY");
const xau = L.porCodigo("XAU");
// O formatador usa espaço não separável entre símbolo e número
const f = (valor, moeda) => L.formatarValor(valor, moeda).replace(/ /g, " ");

const ultimasJson = `{"USDBRL":{"code":"USD","codein":"BRL","name":"Dólar Americano/Real Brasileiro","high":"5.0543","low":"4.9636",
"varBid":"-0.0871","pctChange":"-1.723967","bid":"4.9652","ask":"4.966","timestamp":"1792791008",
"create_date":"2026-10-23 18:30:08"},
"BTCUSD":{"code":"BTC","codein":"USD","name":"Bitcoin/Dólar Americano","high":"82022","low":"80894.51",
"varBid":"-484.598125","pctChange":"-0.595133","bid":"80942.23","ask":"80942.24","timestamp":"1792795744",
"create_date":"2026-10-23 19:49:04"}}`;

const historicoJson = `[{"code":"USD","codein":"BRL","high":"5.05","low":"4.96","bid":"4.9648","ask":"4.966","timestamp":"1792790992"},
{"high":"5.0533","low":"5.021","bid":"5.0523","ask":"5.0527","timestamp":"1792708204"},
{"high":"5.0425","low":"5.0125","bid":"5.0236","ask":"5.0239","timestamp":"1792621806"}]`;

const testes = {
  // ---------- ConversaoTest.kt ----------
  "rota direta e invertida"() {
    assert.deepEqual(L.encontrarRota(pares, "USD", "BRL"), [T("USD-BRL", false)]);
    assert.deepEqual(L.encontrarRota(pares, "BRL", "USD"), [T("USD-BRL", true)]);
    assert.deepEqual(L.encontrarRota(pares, "BRL", "BRL"), []);
  },
  "par sem cotacao direta passa pelo dolar"() {
    assert.deepEqual(L.encontrarRota(pares, "BRL", "AFN"), [T("USD-BRL", true), T("USD-AFN", false)]);
  },
  "rota com dois pivos"() {
    assert.deepEqual(L.encontrarRota(pares, "CVE", "KMF"), [T("EUR-CVE", true), T("EUR-USD", false), T("USD-KMF", false)]);
    assert.deepEqual(L.intermediarias(L.encontrarRota(pares, "CVE", "KMF")), ["EUR", "USD"]);
  },
  "moeda sem nenhum par nao tem rota"() {
    assert.equal(L.encontrarRota(pares, "BRL", "XYZ"), null);
  },
  "calcula taxa direta, inversa e cruzada"() {
    const cotacoes = new Map([["USD-BRL", 5]]);
    assert.equal(L.taxa([T("USD-BRL", false)], cotacoes), 5);
    assert.equal(duasCasas(L.taxa([T("USD-BRL", true)], cotacoes)), "0,20");
    const cruzada = L.taxa([T("USD-BRL", true), T("USD-AFN", false)], new Map([["USD-BRL", 5], ["USD-AFN", 70]]));
    assert.equal(duasCasas(cruzada), "14,00");
    assert.equal(duasCasas(L.converter(100, cruzada)), "1.400,00");
  },
  "cotacao faltando ou zerada nao gera taxa"() {
    assert.equal(L.taxa([T("USD-BRL", false)], new Map()), null);
    assert.equal(L.taxa([T("USD-BRL", true)], new Map([["USD-BRL", 0]])), null);
  },
  "conversao e volta pela taxa inversa"() {
    // Em Number, 0.1 * 3 = 0.30000000000000004; a formatação mostra 0,30
    assert.equal(duasCasas(L.converter(0.1, 3)), "0,30");
    assert.equal(duasCasas(L.converter(1000, 4.9652)), "4.965,20");
    const ida = L.converter(1000, 4.9652);
    assert.equal(duasCasas(L.converter(ida, L.inversa(4.9652))), "1.000,00");
  },
  "todas as moedas do catalogo tem cotacao para real e dolar"() {
    for (const moeda of L.MOEDAS) {
      for (const alvo of ["BRL", "USD"]) {
        assert.notEqual(L.encontrarRota(L.PARES_EMBUTIDOS, moeda.codigoApi, alvo), null, `${moeda.codigo} → ${alvo} sem rota`);
      }
    }
  },
  "catalogo sem codigos repetidos e em ordem alfabetica"() {
    const codigos = L.MOEDAS.map((m) => m.codigo);
    assert.equal(new Set(codigos).size, codigos.length);
    assert.ok(L.MOEDAS.length > 150);
    assert.equal(L.MOEDAS[0].nome, "Afghani do Afeganistão");
    assert.equal(L.porCodigo("VES").codigoApi, "VEF");
    assert.equal(L.POPULARES.length, 10);
  },

  // ---------- FormatadorMoedaTest.kt ----------
  "real com simbolo e duas casas"() {
    assert.equal(f(1234.5, brl), "R$ 1.234,50");
    assert.equal(f(4965.2, brl), "R$ 4.965,20");
    assert.equal(f(0, brl), "R$ 0,00");
    assert.equal(f(1000000, brl), "R$ 1.000.000,00");
  },
  "arredonda meio para cima"() {
    assert.equal(f(2.345, brl), "R$ 2,35");
    assert.equal(f(2.3449, brl), "R$ 2,34");
  },
  "valores pequenos nao viram zero"() {
    assert.equal(f(0.2014, brl), "R$ 0,2014");
    assert.equal(f(0.00012, brl), "R$ 0,00012");
    assert.equal(f(0.5, brl), "R$ 0,50");
  },
  "cripto com ate oito casas e codigo no fim"() {
    assert.equal(f(0.000023456789, btc), "0,00002346 BTC");
    assert.equal(f(2.5, btc), "2,50 BTC");
  },
  "iene sem casas decimais"() {
    assert.ok(f(156.888, jpy).endsWith(" 157"));
  },
  "commodity com codigo no fim"() {
    assert.equal(f(1.5, xau), "1,50 XAU");
  },
  "dolar usa simbolo do padrao brasileiro"() {
    assert.ok(f(10, usd).endsWith(" 10,00"));
    assert.ok(f(10, usd).includes("$"));
  },
  "taxa com quatro casas ou digitos significativos"() {
    assert.equal(L.formatarTaxa(usd, brl, 4.9652), "1 USD = 4,9652 BRL");
    assert.equal(L.formatarTaxa(brl, usd, 0.201401), "1 BRL = 0,2014 USD");
    assert.equal(L.formatarTaxa(btc, brl, 429250), "1 BTC = 429.250,00 BRL");
    assert.equal(L.formatarTaxa(brl, btc, 0.00000233), "1 BRL = 0,00000233 BTC");
  },
  "data no fuso informado"() {
    assert.equal(L.formatarData(1792791008, "America/Sao_Paulo"), "23/10/2026 às 18:30");
    assert.equal(L.formatarData(1792791008, "UTC"), "23/10/2026 às 21:30");
  },
  "cotacao desatualizada depois de quatro dias"() {
    const momento = 1792791008;
    const umDia = 24 * 60 * 60 * 1000;
    assert.equal(L.cotacaoDesatualizada(momento, momento * 1000 + 3 * umDia), false);
    assert.equal(L.cotacaoDesatualizada(momento, momento * 1000 + 5 * umDia), true);
  },
  "casas iso e variacao com sinal"() {
    assert.equal(L.casasPadrao("KWD"), 3);
    assert.equal(L.casasPadrao("CLP"), 0);
    assert.equal(L.casasPadrao("AFN"), 2);
    assert.equal(L.formatarVariacao(1.234), "+1,23%");
    assert.equal(L.formatarVariacao(-1.723967), "-1,72%");
    assert.equal(L.formatarVariacao(0), "0,00%");
  },

  // ---------- LeitorValorTest.kt ----------
  "leitura do valor digitado"() {
    const casos = {
      "1234,56": 1234.56, "0,5": 0.5, ",5": 0.5, "10,": 10,
      "1.234,56": 1234.56, "1.234.567,89": 1234567.89,
      "1234.56": 1234.56, "1,234.56": 1234.56, "0.125": 0.125,
      "2.500": 2500, "1.000.000": 1000000, "1.5": 1.5, "1234.567": 1234.567,
      " 1 500 ": 1500, "0": 0,
    };
    for (const [texto, esperado] of Object.entries(casos)) assert.equal(L.interpretar(texto), esperado, `entrada "${texto}"`);
    for (const texto of ["", ",", ".", "1,2,3", "1.234,5,6", "abc", "-5"]) {
      assert.equal(L.interpretar(texto), null, `entrada "${texto}"`);
    }
  },
  "limpar entrada remove caracteres e limita tamanho"() {
    assert.equal(L.limparEntrada("R$ 1.234,56"), "1.234,56");
    assert.equal(L.limparEntrada("1a0b0"), "100");
    assert.equal(L.limparEntrada("9".repeat(40)).length, L.TAMANHO_MAXIMO);
  },

  // ---------- MoedasCoreTest.kt ----------
  "le cotacoes da api"() {
    const c = L.lerUltimas(ultimasJson, ["USD-BRL", "BTC-USD"]);
    const u = c.get("USD-BRL");
    assert.equal(u.bid, 4.9652);
    assert.equal(u.ask, 4.966);
    assert.equal(u.pct, -1.723967);
    assert.equal(u.momento, 1792791008);
    assert.ok(c.has("BTC-USD"));
    assert.throws(() => L.lerUltimas(ultimasJson, ["EUR-BRL"]), (e) => e.tipo === "PAR_INDISPONIVEL");
    assert.throws(() => L.lerUltimas('{"USDBRL":{"bid":"0"}}', ["USD-BRL"]), (e) => e.tipo === "SERVICO_INDISPONIVEL");
    // timestamp em milissegundos e ausente
    assert.equal(L.lerUltimas('{"USDBRL":{"bid":"5","timestamp":"1792791008000"}}', ["USD-BRL"]).get("USD-BRL").momento, 1792791008);
    assert.equal(L.lerUltimas('{"USDBRL":{"bid":"5"}}', ["USD-BRL"], 42).get("USD-BRL").momento, 42);
  },
  "historico em ordem cronologica"() {
    const pontos = L.lerHistorico(historicoJson);
    assert.equal(pontos.length, 3);
    assert.ok(pontos[0].momento < pontos[2].momento);
    assert.equal(pontos[pontos.length - 1].bid, 4.9648);
    const invertido = L.orientarHistorico(T("USD-BRL", true), pontos);
    perto(invertido[2].bid, 1 / 4.9648, 1e-15);
  },
  "cotacao inversa troca compra e venda"() {
    const c = L.lerUltimas(ultimasJson, ["USD-BRL", "BTC-USD"]);
    const q = L.combinar(L.encontrarRota(new Set(["USD-BRL"]), "BRL", "USD"), c);
    perto(q.taxa, 1 / 4.9652, 1e-12);
    perto(q.compra, 1 / 4.966, 1e-12);
    perto(q.venda, 1 / 4.9652, 1e-12);
    perto(q.maxima, 1 / 4.9636, 1e-12);
    perto(q.minima, 1 / 5.0543, 1e-12);
    perto(L.inversa(q.taxa), 4.9652, 1e-9);
    perto(L.converter(100, q.taxa), 100 / 4.9652, 1e-9);
  },
  "conversao cruzada multiplica as taxas"() {
    const c = L.lerUltimas(ultimasJson, ["USD-BRL", "BTC-USD"]);
    const rota = L.encontrarRota(new Set(["USD-BRL", "BTC-USD"]), "BTC", "BRL");
    assert.equal(rota.length, 2);
    const q = L.combinar(rota, c);
    perto(q.taxa, 80942.23 * 4.9652, 1e-6);
    assert.equal(q.maxima, null);
    assert.deepEqual(q.via, ["USD"]);
    assert.equal(q.momento, 1792791008);
    perto(q.variacao, ((1 - 0.00595133) * (1 - 0.01723967) - 1) * 100, 1e-9);
  },
  "falta de cotacao no trecho retorna null"() {
    assert.equal(L.combinar([T("USD-JPY", false)], new Map()), null);
  },
  "urls e pares disponiveis"() {
    assert.equal(L.urlUltimas(["USD-BRL"]), "https://economia.awesomeapi.com.br/json/last/USD-BRL");
    assert.ok(L.urlUltimas(["USD-BRL", "EUR-BRL"]).endsWith("/last/USD-BRL,EUR-BRL"));
    assert.ok(L.urlHistorico("USD-BRL", 30).endsWith("/daily/USD-BRL/30"));
    const disponiveis = L.lerDisponiveis('{"USD-BRL":"Dólar Americano/Real Brasileiro","EUR-BRL":"Euro/Real Brasileiro","X":"y"}');
    assert.deepEqual([...disponiveis].sort(), ["EUR-BRL", "USD-BRL"]);
    assert.equal(L.erroHttp(404), "PAR_INDISPONIVEL");
    assert.equal(L.erroHttp(429), "MUITAS_CONSULTAS");
    assert.equal(L.erroHttp(500), "SERVICO_INDISPONIVEL");
  },
  "mensagens de erro"() {
    assert.equal(
      L.mensagemErro("PAR_INDISPONIVEL", brl, btc),
      "A cotação de Real Brasileiro para Bitcoin não está disponível no momento.",
    );
    assert.equal(L.mensagemCotacaoSalva("TEMPO_ESGOTADO"), "Sem conexão. Usando a última cotação salva.");
    assert.equal(L.mensagemCotacaoSalva("MUITAS_CONSULTAS"), "Não foi possível atualizar. Usando a última cotação salva.");
  },
};

let falhas = 0;
for (const [nome, teste] of Object.entries(testes)) {
  try {
    teste();
    console.log(`ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`FALHA ${nome}\n     ${erro.message}`);
  }
}
console.log(falhas ? `\n${falhas} teste(s) falharam` : `\n${Object.keys(testes).length} testes passaram`);
process.exitCode = falhas ? 1 : 0;
