"use strict";
/*
 * Conversor de arquivos: matriz de conversões, nomes de saída e as conversões que não precisam de
 * biblioteca (JSON⇄CSV e Markdown→HTML). Tudo puro: roda no navegador e é testado no Node.
 * As fases seguintes ampliam MATRIZ (imagens, ZIP, PDF e DOCX) e implementam no conversor-de-arquivos.js.
 */
const LogicaConversor = (() => {
  const MIME = {
    md: "text/markdown;charset=utf-8",
    html: "text/html;charset=utf-8",
    json: "application/json;charset=utf-8",
    csv: "text/csv;charset=utf-8",
    txt: "text/plain;charset=utf-8",
    png: "image/png",
    jpg: "image/jpeg",
    webp: "image/webp",
    bmp: "image/bmp",
    zip: "application/zip",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };

  /** O que cada formato aceita virar. Só entra aqui o que já funciona — nada de promessa vazia. */
  const MATRIZ = {
    md: ["html"],
    json: ["csv"],
    csv: ["json"],
    png: ["jpg", "webp", "bmp"],
    jpg: ["png", "webp", "bmp"],
    webp: ["png", "jpg", "bmp"],
    bmp: ["png", "jpg", "webp"],
    txt: ["pdf"],
    pdf: ["txt"],
    docx: ["html", "txt"],
  };

  const NOMES = {
    md: "Markdown", html: "HTML", json: "JSON", csv: "CSV", txt: "Texto",
    png: "PNG", jpg: "JPG", webp: "WebP", bmp: "BMP", zip: "ZIP", pdf: "PDF", docx: "Word (DOCX)",
  };

  const IMAGENS = new Set(["png", "jpg", "webp", "bmp"]);
  const ehImagem = (formato) => IMAGENS.has(formato);

  /** ZIP não é destino de conversão: ele é aberto (extraído) e o que tem dentro entra na fila. */
  const ehZip = (formato) => formato === "zip";

  /**
   * Nome livre dentro de um ZIP: "foto.png" repetido vira "foto (2).png", "foto (3).png"…
   * Evita que dois arquivos convertidos com o mesmo nome se sobrescrevam ao compactar.
   */
  function nomeUnicoZip(usados, nome) {
    if (!usados.has(nome)) return nome;
    const ponto = nome.lastIndexOf(".");
    const base = ponto > 0 ? nome.slice(0, ponto) : nome;
    const extensaoNome = ponto > 0 ? nome.slice(ponto) : "";
    let contador = 2;
    let candidato = `${base} (${contador})${extensaoNome}`;
    while (usados.has(candidato)) {
      contador++;
      candidato = `${base} (${contador})${extensaoNome}`;
    }
    return candidato;
  }

  const extensao = (nome) => {
    const partes = String(nome || "").split(".");
    return partes.length > 1 ? partes.pop().toLowerCase() : "";
  };

  /** Formato pela extensão; se não reconhecer, tenta o MIME informado pelo navegador. */
  function formatoDe(arquivo) {
    const porNome = extensao(arquivo && arquivo.name);
    if (MATRIZ[porNome] || NOMES[porNome]) return porNome;
    const tipo = String((arquivo && arquivo.type) || "").toLowerCase().split(";")[0];
    for (const [formato, mime] of Object.entries(MIME)) {
      if (tipo && tipo === mime.split(";")[0]) return formato;
    }
    return "";
  }

  const saidasDe = (formato) => MATRIZ[formato] || [];

  /** "dados.json" → "dados.csv"; se o formato for o mesmo, acrescenta -convertido. */
  function nomeSaida(nome, novoFormato) {
    const original = String(nome || "arquivo");
    const ponto = original.lastIndexOf(".");
    const base = ponto > 0 ? original.slice(0, ponto) : original;
    const final = String(novoFormato).toLowerCase();
    return `${extensao(original) === final ? `${base}-convertido` : base}.${final}`;
  }

  /** Matriz de objetos → CSV, com aspas onde precisa e BOM para o Excel abrir acentuado. */
  function jsonParaCsv(texto) {
    let dados;
    try {
      dados = JSON.parse(texto);
    } catch (erro) {
      throw new Error("O JSON não é válido.");
    }
    const lista = Array.isArray(dados) ? dados : [dados];
    if (!lista.length) return "\ufeff";
    if (lista.some((item) => item === null || typeof item !== "object" || Array.isArray(item))) {
      throw new Error("Para virar CSV, o JSON precisa ser uma lista de objetos.");
    }
    const colunas = [...new Set(lista.flatMap((item) => Object.keys(item)))];
    const celula = (valor) => {
      if (valor === null || valor === undefined) return "";
      const bruto = typeof valor === "object" ? JSON.stringify(valor) : String(valor);
      return /[",;\n\r]/.test(bruto) ? `"${bruto.replace(/"/g, '""')}"` : bruto;
    };
    const linhas = [colunas.join(","), ...lista.map((item) => colunas.map((c) => celula(item[c])).join(","))];
    return "\ufeff" + linhas.join("\r\n");
  }

  /** Divide uma linha de CSV respeitando aspas duplas (com "" representando uma aspa). */
  function dividirLinha(linha) {
    const saida = [];
    let atual = "";
    let dentro = false;
    for (let i = 0; i < linha.length; i++) {
      const caractere = linha[i];
      if (dentro && caractere === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (caractere === '"') {
        dentro = !dentro;
      } else if (caractere === "," && !dentro) {
        saida.push(atual);
        atual = "";
      } else {
        atual += caractere;
      }
    }
    saida.push(atual);
    return saida;
  }

  /** Separa os registros do CSV respeitando quebra de linha dentro de aspas. */
  function separarRegistros(texto) {
    const registros = [];
    let atual = "";
    let dentro = false;
    for (let i = 0; i < texto.length; i++) {
      const caractere = texto[i];
      if (caractere === '"') {
        dentro = !dentro;
        atual += caractere;
      } else if ((caractere === "\n" || caractere === "\r") && !dentro) {
        if (caractere === "\r" && texto[i + 1] === "\n") i++;
        if (atual.trim() !== "") registros.push(atual);
        atual = "";
      } else {
        atual += caractere;
      }
    }
    if (atual.trim() !== "") registros.push(atual);
    return registros;
  }

  /** CSV → lista de objetos em JSON; converte número quando o valor é numérico. */
  function csvParaJson(texto) {
    const limpo = String(texto).replace(/^\ufeff/, "");
    const linhas = separarRegistros(limpo);
    if (!linhas.length) return "[]";
    const cabecalho = dividirLinha(linhas[0]).map((nome) => nome.trim());
    const objetos = [];
    for (const linha of linhas.slice(1)) {
      const valores = dividirLinha(linha);
      const objeto = {};
      cabecalho.forEach((coluna, i) => {
        const valor = valores[i] === undefined ? "" : valores[i];
        objeto[coluna] = /^-?\d+(\.\d+)?$/.test(valor) ? Number(valor) : valor;
      });
      objetos.push(objeto);
    }
    return JSON.stringify(objetos, null, 2);
  }

  const escaparHtml = (texto) =>
    String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /** Markdown → HTML completo: títulos, listas, negrito, itálico, código e links, tudo escapado. */
  function mdParaHtml(markdown) {
    const linhas = String(markdown).replace(/\r\n?/g, "\n").split("\n");
    const corpo = [];
    let lista = false;
    const fechar = () => {
      if (lista) corpo.push("</ul>");
      lista = false;
    };
    const emLinha = (texto) => {
      let saida = escaparHtml(texto);
      saida = saida.replace(/`([^`]+)`/g, "<code>$1</code>");
      saida = saida.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      saida = saida.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
      return saida.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    };
    for (const linha of linhas) {
      const titulo = /^(#{1,6})\s+(.*)$/.exec(linha);
      const item = /^[-*]\s+(.*)$/.exec(linha);
      if (titulo) {
        fechar();
        corpo.push(`<h${titulo[1].length}>${emLinha(titulo[2])}</h${titulo[1].length}>`);
      } else if (item) {
        if (!lista) {
          corpo.push("<ul>");
          lista = true;
        }
        corpo.push(`<li>${emLinha(item[1])}</li>`);
      } else {
        fechar();
        if (linha.trim() !== "") corpo.push(`<p>${emLinha(linha)}</p>`);
      }
    }
    fechar();
    return `<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<title>Documento</title>\n</head>\n<body>\n${corpo.join("\n")}\n</body>\n</html>\n`;
  }

  /**
   * RGBA (do canvas) → BMP 24 bits: linhas de baixo para cima e cada linha preenchida para múltiplo
   * de 4 bytes, como o formato exige. É o que permite gerar BMP sem nenhuma biblioteca.
   */
  function bmpDeRgba(largura, altura, dados) {
    const linhaBytes = Math.ceil((largura * 3) / 4) * 4;
    const tamanhoImagem = linhaBytes * altura;
    const total = 54 + tamanhoImagem;
    const saida = new Uint8Array(total);
    const visao = new DataView(saida.buffer);
    saida[0] = 0x42; // "B"
    saida[1] = 0x4d; // "M"
    visao.setUint32(2, total, true);
    visao.setUint32(10, 54, true);
    visao.setUint32(14, 40, true);
    visao.setInt32(18, largura, true);
    visao.setInt32(22, altura, true);
    visao.setUint16(26, 1, true);
    visao.setUint16(28, 24, true);
    visao.setUint32(34, tamanhoImagem, true);
    for (let y = 0; y < altura; y++) {
      const destino = 54 + (altura - 1 - y) * linhaBytes;
      for (let x = 0; x < largura; x++) {
        const origem = (y * largura + x) * 4;
        const alvo = destino + x * 3;
        saida[alvo] = dados[origem + 2];
        saida[alvo + 1] = dados[origem + 1];
        saida[alvo + 2] = dados[origem];
      }
    }
    return saida;
  }

  /** Converte o texto de um formato para outro, ou explica por que ainda não dá. */
  function converterTexto(formato, destino, texto) {
    if (formato === "json" && destino === "csv") return jsonParaCsv(texto);
    if (formato === "csv" && destino === "json") return csvParaJson(texto);
    if (formato === "md" && destino === "html") return mdParaHtml(texto);
    throw new Error(`Conversão ${formato} → ${destino} ainda não disponível.`);
  }

  return {
    MIME, MATRIZ, NOMES, extensao, formatoDe, saidasDe, nomeSaida, ehImagem, ehZip, nomeUnicoZip,
    jsonParaCsv, csvParaJson, dividirLinha, mdParaHtml, escaparHtml, bmpDeRgba, converterTexto,
  };
})();

if (typeof module === "object") module.exports = LogicaConversor;
