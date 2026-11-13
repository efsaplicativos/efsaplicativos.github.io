"use strict";
// Conversor de arquivos: matriz, nomes de saída, JSON⇄CSV e Markdown→HTML.
const assert = require("node:assert/strict");
const C = require("../../assets/ferramentas/conversor-de-arquivos-logica.js");

const testes = {
  "lê o formato pela extensão e pelo MIME"() {
    assert.equal(C.formatoDe({ name: "a.JSON" }), "json");
    assert.equal(C.formatoDe({ name: "lista.csv" }), "csv");
    assert.equal(C.formatoDe({ name: "nota.md" }), "md");
    assert.equal(C.formatoDe({ name: "sem-extensao", type: "application/json" }), "json");
    assert.equal(C.formatoDe({ name: "x.gif" }), "", "formato sem conversão não é reconhecido");
    assert.equal(C.formatoDe({}), "");
    assert.equal(C.formatoDe(null), "");
  },
  "a matriz só oferece o que existe"() {
    assert.deepEqual(C.saidasDe("json"), ["csv"]);
    assert.deepEqual(C.saidasDe("csv"), ["json"]);
    assert.deepEqual(C.saidasDe("md"), ["html"]);
    assert.deepEqual(C.saidasDe("png"), ["jpg", "webp", "bmp"]);
    assert.deepEqual(C.saidasDe("jpg"), ["png", "webp", "bmp"]);
    assert.deepEqual(C.saidasDe("webp"), ["png", "jpg", "bmp"]);
    assert.deepEqual(C.saidasDe("bmp"), ["png", "jpg", "webp"]);
    assert.deepEqual(C.saidasDe("gif"), []);
    assert.deepEqual(C.saidasDe("inexistente"), []);
  },
  "reconhece os formatos de imagem e marca quais são imagem"() {
    assert.equal(C.formatoDe({ name: "foto.JPG" }), "jpg");
    assert.equal(C.formatoDe({ name: "icone.png" }), "png");
    assert.equal(C.formatoDe({ name: "arte.webp" }), "webp");
    assert.equal(C.formatoDe({ name: "velho.bmp" }), "bmp");
    assert.equal(C.formatoDe({ name: "sem-extensao", type: "image/jpeg" }), "jpg");
    assert.equal(C.formatoDe({ name: "animacao.gif" }), "", "GIF fica de fora");
    for (const formato of ["png", "jpg", "webp", "bmp"]) assert.equal(C.ehImagem(formato), true, formato);
    for (const formato of ["json", "csv", "md", "html"]) assert.equal(C.ehImagem(formato), false, formato);
  },
  "o DOCX entra só como origem, para HTML e texto"() {
    assert.deepEqual(C.saidasDe("docx"), ["html", "txt"]);
    assert.equal(C.formatoDe({ name: "curriculo.DOCX" }), "docx");
    assert.equal(C.nomeSaida("curriculo.docx", "html"), "curriculo.html");
    assert.equal(C.nomeSaida("curriculo.docx", "txt"), "curriculo.txt");
    assert.deepEqual(C.saidasDe("html"), [], "HTML não vira DOCX");
  },
  "o PDF entra como texto de ida e de volta"() {
    assert.deepEqual(C.saidasDe("txt"), ["pdf"]);
    assert.deepEqual(C.saidasDe("pdf"), ["html", "txt"]);
    assert.equal(C.formatoDe({ name: "contrato.PDF" }), "pdf");
    assert.equal(C.formatoDe({ name: "notas.txt" }), "txt");
    assert.equal(C.nomeSaida("notas.txt", "pdf"), "notas.pdf");
    assert.equal(C.nomeSaida("contrato.pdf", "txt"), "contrato.txt");
    assert.throws(() => C.converterTexto("pdf", "csv", "x"), /ainda não disponível/);
  },
  "o ZIP é reconhecido e ganha nome livre dentro do pacote"() {
    assert.equal(C.formatoDe({ name: "pacote.ZIP" }), "zip");
    assert.equal(C.ehZip("zip"), true);
    assert.equal(C.ehZip("png"), false);
    assert.deepEqual(C.saidasDe("zip"), [], "zip não é destino de conversão");
    const usados = new Set(["foto.png"]);
    assert.equal(C.nomeUnicoZip(usados, "outra.png"), "outra.png");
    assert.equal(C.nomeUnicoZip(usados, "foto.png"), "foto (2).png");
    usados.add("foto (2).png");
    assert.equal(C.nomeUnicoZip(usados, "foto.png"), "foto (3).png");
    assert.equal(C.nomeUnicoZip(usados, "sem-ponto"), "sem-ponto");
  },
    "BMP tem cabeçalho, tamanho e linhas de baixo para cima"() {
    // 2×2: vermelho, verde / azul, branco (RGBA)
    const pixels = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const bmp = C.bmpDeRgba(2, 2, pixels);
    const visao = new DataView(bmp.buffer);
    assert.equal(String.fromCharCode(bmp[0], bmp[1]), "BM");
    assert.equal(visao.getUint32(2, true), bmp.length, "tamanho total no cabeçalho");
    assert.equal(visao.getUint32(10, true), 54, "início dos pixels");
    assert.equal(visao.getUint32(14, true), 40, "cabeçalho BITMAPINFOHEADER");
    assert.equal(visao.getInt32(18, true), 2);
    assert.equal(visao.getInt32(22, true), 2);
    assert.equal(visao.getUint16(28, true), 24, "24 bits por pixel");
    // Linha de 2 px = 6 bytes, preenchida para 8: 2 linhas = 16 bytes de pixels
    assert.equal(bmp.length, 54 + 16);
    // A primeira linha gravada é a de baixo da imagem (azul, branco), em BGR
    assert.deepEqual([...bmp.slice(54, 60)], [255, 0, 0, 255, 255, 255]);
    // E a última é a de cima (vermelho, verde)
    assert.deepEqual([...bmp.slice(62, 68)], [0, 0, 255, 0, 255, 0]);
    // Os 2 bytes de preenchimento da linha ficam zerados
    assert.deepEqual([...bmp.slice(60, 62)], [0, 0]);
    assert.deepEqual([...bmp.slice(68, 70)], [0, 0]);
  },
  "monta o nome do arquivo de saída"() {
    assert.equal(C.nomeSaida("dados.json", "csv"), "dados.csv");
    assert.equal(C.nomeSaida("relatorio.final.json", "csv"), "relatorio.final.csv");
    assert.equal(C.nomeSaida("dados.csv", "csv"), "dados-convertido.csv");
    assert.equal(C.nomeSaida("semPonto", "html"), "semPonto.html");
    assert.equal(C.nomeSaida("", "csv"), "arquivo.csv");
  },
  "JSON vira CSV com cabeçalho, união de colunas e BOM"() {
    const csv = C.jsonParaCsv('[{"nome":"Ana","idade":30},{"nome":"Bia","cidade":"Recife"}]');
    assert.ok(csv.startsWith("\ufeff"), "começa com BOM");
    const linhas = csv.replace(/^\ufeff/, "").split("\r\n");
    assert.equal(linhas[0], "nome,idade,cidade");
    assert.equal(linhas[1], "Ana,30,");
    assert.equal(linhas[2], "Bia,,Recife");
  },
  "CSV protege aspas, vírgulas e quebras de linha"() {
    const csv = C.jsonParaCsv('[{"frase":"oi, tudo bem","aspas":"ele disse \\"oi\\"","linha":"a\\nb"}]');
    assert.ok(csv.includes('"oi, tudo bem"'));
    assert.ok(csv.includes('"ele disse ""oi"""'));
    assert.ok(csv.includes('"a\nb"'));
    const voltou = JSON.parse(C.csvParaJson(csv));
    assert.deepEqual(voltou[0], { frase: "oi, tudo bem", aspas: 'ele disse "oi"', linha: "a\nb" });
  },
  "JSON inválido e lista de não-objetos dão erro claro"() {
    assert.throws(() => C.jsonParaCsv("{quebrado"), /JSON não é válido/);
    assert.throws(() => C.jsonParaCsv("[1,2,3]"), /lista de objetos/);
    assert.equal(C.jsonParaCsv("[]"), "\ufeff");
  },
  "CSV vira JSON com números convertidos"() {
    const json = JSON.parse(C.csvParaJson("\ufeffnome,idade\r\nAna,30\r\nBia,25,5\r\n"));
    assert.equal(json.length, 2);
    assert.equal(json[0].nome, "Ana");
    assert.equal(json[0].idade, 30);
    assert.equal(json[1].idade, 25);
    assert.deepEqual(JSON.parse(C.csvParaJson("")), []);
    assert.deepEqual(JSON.parse(C.csvParaJson("nome\n\n")), [], "só cabeçalho, sem linhas");
  },
  "a ida e volta JSON→CSV→JSON preserva os dados"() {
    const original = [{ nome: "Ana", nota: 9.5 }, { nome: "Bia", nota: 7 }];
    const voltou = JSON.parse(C.csvParaJson(C.jsonParaCsv(JSON.stringify(original))));
    assert.deepEqual(voltou, original);
  },
  "Markdown vira HTML com títulos, listas e ênfases"() {
    const html = C.mdParaHtml("# Título\n\nTexto **forte** e *leve* com `código`.\n\n- um\n- dois\n\n## Sub\n\n[fonte](https://exemplo.com)");
    assert.ok(html.includes("<h1>Título</h1>"));
    assert.ok(html.includes("<h2>Sub</h2>"));
    assert.ok(html.includes("<strong>forte</strong>"));
    assert.ok(html.includes("<em>leve</em>"));
    assert.ok(html.includes("<code>código</code>"));
    assert.ok(html.includes("<ul>\n<li>um</li>\n<li>dois</li>\n</ul>"));
    assert.ok(html.includes('<a href="https://exemplo.com">fonte</a>'));
    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.trimEnd().endsWith("</html>"));
  },
  "Markdown escapa HTML e fecha a lista no fim"() {
    const html = C.mdParaHtml("<script>alert(1)</script>\n- item");
    assert.ok(html.includes("&lt;script&gt;"), "escapou a tag");
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("</ul>"));
    assert.equal((html.match(/<ul>/g) || []).length, 1);
  },
  "converterTexto escolhe o conversor certo e recusa o resto"() {
    assert.equal(C.converterTexto("json", "csv", '[{"a":1}]').replace(/^\ufeff/, ""), "a\r\n1");
    assert.deepEqual(JSON.parse(C.converterTexto("csv", "json", "a\n1")), [{ a: 1 }]);
    assert.ok(C.converterTexto("md", "html", "# oi").includes("<h1>oi</h1>"));
    assert.throws(() => C.converterTexto("json", "html", "{}"), /ainda não disponível/);
  },
};

let falhas = 0;
for (const [nome, teste] of Object.entries(testes)) {
  try {
    teste();
    console.log(`ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`FALHOU ${nome}\n${erro.stack}`);
  }
}
console.log(`\n${Object.keys(testes).length - falhas} de ${Object.keys(testes).length} testes passaram`);
if (falhas) process.exit(1);
