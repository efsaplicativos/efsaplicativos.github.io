"use strict";
// Casos de InflationTest.kt (Calculadora Multifunção), mais os do cache local da página.
// Rode: node _fonte/testes/correcao-ipca.test.js
const assert = require("node:assert/strict");
const L = require("../../assets/ferramentas/correcao-ipca-logica.js");

const perto = (real, esperado, tolerancia) =>
  assert.ok(Math.abs(real - esperado) <= tolerancia, `esperado ${esperado}, veio ${real}`);

const amostra = `
[{"id":"63","variavel":"IPCA - Variação mensal","unidade":"%","resultados":[{"classificacoes":[],
"series":[{"localidade":{"id":"1","nivel":{"id":"N1","nome":"Brasil"},"nome":"Brasil"},
"serie":{"202501":"0.16","202502":"1.31","202503":"0.56","202504":"..."}}]}]}]`;

const testes = {
  "le a serie da api do ibge"() {
    const serie = L.lerSerie(amostra);
    assert.equal(serie.size, 4);
    perto(serie.get(L.mes(2025, 1)), 0.16, 1e-12);
    perto(serie.get(L.mes(2025, 2)), 1.31, 1e-12);
    assert.equal(serie.get(L.mes(2025, 4)), null); // "..." = sem dado
    assert.equal(L.ultimoPublicado(serie), L.mes(2025, 3));
  },
  "resposta vazia"() {
    assert.equal(L.lerSerie("[]").size, 0);
    assert.throws(() => L.lerSerie("{}"), TypeError);
  },
  "ignora localidades que nao sao o brasil"() {
    const json = [
      {
        resultados: [
          {
            series: [
              { localidade: { id: "35" }, serie: { 202501: "9.99" } },
              { localidade: { id: "1" }, serie: { 202501: "0.16", 202502: "-", 202503: "X" } },
            ],
          },
        ],
      },
    ];
    const serie = L.lerSerie(json);
    perto(serie.get(L.mes(2025, 1)), 0.16, 1e-12);
    assert.equal(serie.get(L.mes(2025, 2)), null);
    assert.equal(serie.get(L.mes(2025, 3)), null);
  },
  "acumula meses inclusivos"() {
    const serie = L.lerSerie(amostra);
    const r = L.resumir(serie, L.mes(2025, 1), L.mes(2025, 3));
    assert.equal(r.meses, 3);
    const esperado = 1.0016 * 1.0131 * 1.0056;
    perto(r.fator, esperado, 1e-12);
    perto(r.acumulado, (esperado - 1) * 100, 1e-9);
    perto(r.linhas[0].acumulado, 0.16, 1e-9);
    perto(L.aplicar(1000, "corrigir", r.fator), 1000 * esperado, 1e-9);
    perto(L.aplicar(1000, "deflacionar", r.fator), 1000 / esperado, 1e-9);
  },
  "media e anualizada"() {
    const serie = new Map();
    for (let m = 1; m <= 12; m++) serie.set(L.mes(2024, m), 1);
    const r = L.resumir(serie, L.mes(2024, 1), L.mes(2024, 12));
    perto(r.mediaMensal, 1, 1e-9);
    perto(r.anualizada, r.acumulado, 1e-9);
    perto(r.acumulado, 12.6825, 1e-4);
  },
  "mes sem dado gera erro"() {
    const r = L.resumir(L.lerSerie(amostra), L.mes(2025, 3), L.mes(2025, 4));
    assert.deepEqual(r, { faltando: L.mes(2025, 4) });
    assert.throws(() => L.resumir(new Map(), L.mes(2025, 2), L.mes(2025, 1)), RangeError);
  },
  "urls e periodos"() {
    assert.equal(L.lerPeriodo("202609"), L.mes(2026, 9));
    assert.equal(L.lerPeriodo("202613"), null);
    assert.equal(
      L.urlSerie("INPC", L.mes(2024, 1), L.mes(2024, 12)),
      "https://servicodados.ibge.gov.br/api/v3/agregados/1736/periodos/202401-202412/variaveis/44?localidades=N1%5Ball%5D",
    );
    assert.ok(L.urlUltimo("IPCA15").includes("/3065/periodos/-1/variaveis/355"));
    assert.equal(L.mesesInclusivos(L.mes(2024, 1), L.mes(2024, 12)), 12);
    assert.equal(L.mesesInclusivos(L.mes(2024, 3), L.mes(2024, 1)), 0);
  },
  "nomes dos meses"() {
    assert.equal(L.formatarPeriodo(L.mes(2025, 1)), "202501");
    assert.equal(L.mesCurto(L.mes(2025, 1)), "01/2025");
    assert.equal(L.mesLongo(L.mes(1994, 7)), "julho de 1994");
    assert.equal(L.anoDe(L.mes(2025, 12)), 2025);
    assert.equal(L.numeroDe(L.mes(2025, 12)), 12);
  },
  "cache local guarda so valores validos"() {
    const serie = L.lerSerie(amostra);
    const objeto = L.serieParaObjeto(serie);
    assert.deepEqual(objeto, { 202501: 0.16, 202502: 1.31, 202503: 0.56 });
    const volta = L.objetoParaSerie({ ...objeto, 202513: 1, abc: 2, 202504: "0.3", 202505: null });
    assert.equal(volta.size, 3);
    assert.ok(L.cobre(volta, L.mes(2025, 1), L.mes(2025, 3)));
    assert.ok(!L.cobre(volta, L.mes(2025, 1), L.mes(2025, 4)));
    assert.equal(L.objetoParaSerie(null).size, 0);
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
