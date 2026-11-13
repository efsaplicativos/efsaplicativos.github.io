"use strict";
/** Conversor de arquivos: fila, formato de saída por arquivo, conversão e download (fase 0+1). */
(() => {
  const raiz = document.querySelector(".conversor");
  if (!raiz || typeof LogicaConversor !== "object") return;
  const C = LogicaConversor;
  const $ = (seletor) => raiz.querySelector(seletor);

  const entrada = $("#conv-arquivos");
  const solta = $("#conv-solta");
  const escolher = $("#conv-escolher");
  const fila = $("#conv-fila");
  const lista = $("#conv-itens");
  const aviso = $("#conv-aviso");
  const botaoConverter = $("#conv-converter");
  const botaoBaixar = $("#conv-baixar");
  const botaoZip = $("#conv-zip");
  const botaoLimpar = $("#conv-limpar");
  const blocoGlobal = $("#conv-global");
  const textoProgresso = $("#conv-progresso");
  const barraGlobal = $("#conv-barra-global");
  const barraCheia = $("#conv-barra-preenchida");

  let itens = [];
  const mensagem = (texto) => {
    aviso.textContent = texto;
  };

  function pintarProgresso(feitos, total) {
    const porcento = total ? Math.round((feitos / total) * 100) : 0;
    barraGlobal.setAttribute("aria-valuenow", String(porcento));
    barraCheia.style.width = `${porcento}%`;
    textoProgresso.textContent = `${feitos} de ${total} arquivos convertidos`;
  }

  function desenhar() {
    fila.hidden = itens.length === 0;
    lista.textContent = "";
    itens.forEach((item, indice) => {
      const li = document.createElement("li");
      li.className = "conv-item";

      const nome = document.createElement("span");
      nome.className = "conv-nome";
      nome.textContent = item.arquivo.name;
      nome.title = item.arquivo.name;

      const seta = document.createElement("span");
      seta.className = "conv-seta";
      seta.textContent = "→";
      seta.setAttribute("aria-hidden", "true");

      const escolha = document.createElement("select");
      escolha.className = "conv-destino";
      escolha.setAttribute("aria-label", `Formato de saída de ${item.arquivo.name}`);
      for (const formato of C.saidasDe(item.formato)) {
        const opcao = document.createElement("option");
        opcao.value = formato;
        opcao.textContent = C.NOMES[formato] || formato.toUpperCase();
        if (formato === item.destino) opcao.selected = true;
        escolha.append(opcao);
      }
      escolha.addEventListener("change", () => {
        itens[indice].destino = escolha.value;
        itens[indice].estado = "pronto";
        itens[indice].erro = "";
        desenhar();
      });

      const estado = document.createElement("span");
      estado.className = `conv-estado conv-${item.estado}`;
      estado.textContent =
        item.estado === "ok" ? "convertido" :
        item.estado === "erro" ? "erro" :
        item.estado === "convertendo" ? "convertendo…" : "pronto";

      li.append(nome, seta, escolha, estado);
      if (item.erro) {
        const erro = document.createElement("p");
        erro.className = "conv-erro";
        erro.textContent = item.erro;
        li.append(erro);
      }
      if (item.resultado) {
        const baixar = document.createElement("a");
        baixar.className = "conv-baixar";
        baixar.href = item.resultado.url;
        baixar.download = item.resultado.nome;
        baixar.textContent = "Baixar " + item.resultado.nome;
        li.append(baixar);
      }
      lista.append(li);
    });
    botaoBaixar.hidden = !itens.some((item) => item.resultado);
    botaoZip.hidden = botaoBaixar.hidden;
    botaoConverter.disabled = itens.length === 0;
  }

  function limparResultados() {
    for (const item of itens) {
      if (item.resultado) URL.revokeObjectURL(item.resultado.url);
      item.resultado = null;
      if (item.estado === "ok") item.estado = "pronto";
    }
  }

  // JSZip só é baixado quando alguém usa ZIP: as outras conversões não pagam esse peso
  let promessaZip = null;
  const carregarZip = () => {
    if (!promessaZip) {
      promessaZip = import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm").then((modulo) => modulo.default || modulo);
    }
    return promessaZip;
  };

  /** Abre um .zip e coloca na fila o que tiver conversão disponível. */
  async function extrairZip(arquivo) {
    mensagem(`Abrindo ${arquivo.name}…`);
    try {
      const JSZip = await carregarZip();
      const pacote = await JSZip.loadAsync(arquivo);
      let aceitos = 0;
      let ignorados = 0;
      for (const entrada of Object.values(pacote.files)) {
        if (entrada.dir) continue;
        const nome = entrada.name.split("/").pop();
        const blob = await entrada.async("blob");
        const formato = C.formatoDe({ name: nome, type: blob.type });
        const saidas = C.saidasDe(formato);
        if (!saidas.length) {
          ignorados++;
          continue;
        }
        itens.push({ arquivo: new File([blob], nome, { type: blob.type }), formato, destino: saidas[0], estado: "pronto", resultado: null, erro: "" });
        aceitos++;
      }
      desenhar();
      pintarProgresso(0, itens.length);
      mensagem(`${aceitos} arquivo(s) do zip entraram na fila${ignorados ? ` e ${ignorados} ficaram de fora (sem conversão)` : ""}.`);
    } catch (erro) {
      mensagem(`Não foi possível abrir o zip: ${(erro && erro.message) || "arquivo inválido"}.`);
    }
  }

  // Limites de sanidade: o navegador não aguenta centenas de arquivos nem arquivo gigante de uma vez
  const MAX_ARQUIVOS = 60;
  const MAX_BYTES = 40 * 1024 * 1024;

  function adicionar(arquivos) {
    const recusados = [];
    let grandes = 0;
    for (const arquivo of arquivos) {
      if (itens.length >= MAX_ARQUIVOS) {
        mensagem(`O limite é de ${MAX_ARQUIVOS} arquivos por vez. Converta ou limpe a lista antes de adicionar mais.`);
        return;
      }
      if (arquivo.size > MAX_BYTES) {
        grandes++;
        continue;
      }
      const formato = C.formatoDe(arquivo);
      const saidas = C.saidasDe(formato);
      if (C.ehZip(formato)) {
        // ZIP é aberto: o conteúdo entra na fila em vez de virar item
        extrairZip(arquivo);
        continue;
      }
      if (!saidas.length) {
        recusados.push(arquivo.name);
        continue;
      }
      itens.push({ arquivo, formato, destino: saidas[0], estado: "pronto", resultado: null, erro: "" });
    }
    limparResultados();
    desenhar();
    pintarProgresso(itens.filter((item) => item.resultado).length, itens.length);
    mensagem(recusados.length
      ? `Sem conversão para: ${recusados.join(", ")}. Nesta etapa: JSON, CSV, Markdown, texto, PDF, DOCX, imagens e ZIP.`
      : grandes
        ? `${grandes} arquivo(s) acima de 40 MB ficaram de fora.`
        : "");
  }

  const lerTexto = (arquivo) =>
    new Promise((resolver, rejeitar) => {
      const leitor = new FileReader();
      leitor.onload = () => resolver(String(leitor.result));
      leitor.onerror = () => rejeitar(new Error("Não foi possível ler o arquivo."));
      leitor.readAsText(arquivo, "utf-8");
    });

  const criarBitmap = (arquivo) => {
    if (typeof createImageBitmap === "function") return createImageBitmap(arquivo);
    // Navegador antigo: decodifica pela tag img com URL temporária
    return new Promise((resolver, rejeitar) => {
      const url = URL.createObjectURL(arquivo);
      const imagem = new Image();
      imagem.onload = () => {
        URL.revokeObjectURL(url);
        resolver(imagem);
      };
      imagem.onerror = () => {
        URL.revokeObjectURL(url);
        rejeitar(new Error("Arquivo de imagem inválido."));
      };
      imagem.src = url;
    });
  };

  /** Imagem → PNG/JPG/WebP pelo canvas; BMP sai do codificador próprio, sem biblioteca. */
  async function converterImagem(arquivo, destino) {
    const imagem = await criarBitmap(arquivo);
    const tela = document.createElement("canvas");
    tela.width = imagem.width;
    tela.height = imagem.height;
    const contexto = tela.getContext("2d");
    if (destino === "jpg" || destino === "bmp") {
      // Nenhum dos dois guarda transparência: o fundo vira branco em vez de preto
      contexto.fillStyle = "#ffffff";
      contexto.fillRect(0, 0, tela.width, tela.height);
    }
    contexto.drawImage(imagem, 0, 0);
    if (destino === "bmp") {
      const dados = contexto.getImageData(0, 0, tela.width, tela.height).data;
      return new Blob([C.bmpDeRgba(tela.width, tela.height, dados)], { type: "image/bmp" });
    }
    return new Promise((resolver, rejeitar) => {
      tela.toBlob(
        (blob) => (blob ? resolver(blob) : rejeitar(new Error(`Este navegador não gera ${String(destino).toUpperCase()}.`))),
        C.MIME[destino] || "image/png",
        0.92,
      );
    });
  }

  // PDF: o pdf-lib gera o arquivo e o pdf.js lê o texto. Os dois só entram quando alguém usa PDF.
  let promessaPdfLib = null;
  const carregarPdfLib = () => {
    if (!promessaPdfLib) promessaPdfLib = import("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm");
    return promessaPdfLib;
  };

  let promessaPdfJs = null;
  const carregarPdfJs = () => {
    if (!promessaPdfJs) {
      promessaPdfJs = import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/+esm").then((modulo) => {
        const lib = modulo.default || modulo;
        if (lib.GlobalWorkerOptions) {
          lib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs";
        }
        return lib;
      });
    }
    return promessaPdfJs;
  };

  /** Texto → PDF A4: margem, quebra de linha pela largura real da fonte e páginas conforme precisa. */
  async function textoParaPdf(texto) {
    const { PDFDocument, StandardFonts, rgb } = await carregarPdfLib();
    const pdf = await PDFDocument.create();
    const fonte = await pdf.embedFont(StandardFonts.Helvetica);
    const tamanho = 12;
    const margem = 56;
    const alturaLinha = tamanho * 1.45;
    const largura = 595.28;
    const altura = 841.89;
    const limite = largura - margem * 2;
    const linhas = [];
    for (const paragrafo of String(texto).replace(/\r\n?/g, "\n").split("\n")) {
      if (!paragrafo) {
        linhas.push("");
        continue;
      }
      let atual = "";
      for (const palavra of paragrafo.split(/\s+/)) {
        const tentativa = atual ? `${atual} ${palavra}` : palavra;
        if (fonte.widthOfTextAtSize(tentativa, tamanho) <= limite) {
          atual = tentativa;
        } else {
          if (atual) linhas.push(atual);
          atual = palavra;
        }
      }
      if (atual) linhas.push(atual);
    }
    let pagina = pdf.addPage([largura, altura]);
    let y = altura - margem;
    for (const linha of linhas) {
      if (y < margem) {
        pagina = pdf.addPage([largura, altura]);
        y = altura - margem;
      }
      if (linha) pagina.drawText(linha, { x: margem, y, size: tamanho, font: fonte, color: rgb(0.1, 0.12, 0.13) });
      y -= alturaLinha;
    }
    return new Blob([await pdf.save()], { type: "application/pdf" });
  }

  /** PDF → texto com as linhas reconstruídas: agrupa por altura (y) e ordena por largura (x). */
  async function pdfParaTexto(arquivo) {
    const pdfjs = await carregarPdfJs();
    const dados = new Uint8Array(await arquivo.arrayBuffer());
    const documento = await pdfjs.getDocument({ data: dados }).promise;
    const partes = [];
    for (let numero = 1; numero <= documento.numPages; numero++) {
      const pagina = await documento.getPage(numero);
      const conteudo = await pagina.getTextContent();
      const itens = conteudo.items
        .filter((item) => item.str !== "")
        .map((item) => ({ texto: item.str, x: item.transform[4], y: Math.round(item.transform[5] * 10) / 10 }))
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const linhas = [];
      let atual = null;
      for (const item of itens) {
        // 3 pontos de tolerância: pedaços da mesma linha costumam variar um pouco de altura
        if (!atual || Math.abs(atual.y - item.y) > 3) {
          atual = { y: item.y, partes: [item.texto] };
          linhas.push(atual);
        } else {
          atual.partes.push(item.texto);
        }
      }
      partes.push(linhas.map((linha) => linha.partes.join(" ").replace(/\s+/g, " ").trim()).join("\n"));
    }
    return new Blob([partes.join("\n\n")], { type: "text/plain;charset=utf-8" });
  }

  /**
   * PDF → HTML visual: cada página é renderizada em um canvas e entra no HTML como imagem.
   * Assim o resultado fica igual ao arquivo original, com imagens, colunas e tudo no lugar.
   */
  async function pdfParaHtmlVisual(arquivo) {
    const pdfjs = await carregarPdfJs();
    const dados = new Uint8Array(await arquivo.arrayBuffer());
    const documento = await pdfjs.getDocument({ data: dados }).promise;
    const paginas = [];
    for (let numero = 1; numero <= documento.numPages; numero++) {
      const pagina = await documento.getPage(numero);
      const visor = pagina.getViewport({ scale: 2 });
      const tela = document.createElement("canvas");
      tela.width = Math.ceil(visor.width);
      tela.height = Math.ceil(visor.height);
      await pagina.render({ canvasContext: tela.getContext("2d"), viewport: visor }).promise;
      paginas.push(
        `<img src="${tela.toDataURL("image/png")}" alt="Página ${numero}" width="${tela.width}" height="${tela.height}">`,
      );
    }
    const html = `<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<title>Documento</title>\n<style>body{margin:0;padding:12px;background:#f1f5f9}img{display:block;max-width:100%;height:auto;margin:0 auto 12px;box-shadow:0 1px 4px rgba(0,0,0,.25)}</style>\n</head>\n<body>\n${paginas.join("\n")}\n</body>\n</html>\n`;
    return new Blob([html], { type: "text/html;charset=utf-8" });
  }

  /**
   * DOCX → HTML ou texto, sem biblioteca: um .docx é um ZIP e o conteúdo está em word/document.xml.
   * Cada <w:p> é um parágrafo e o texto dele são os <w:t> em ordem. Assim não dependemos de uma
   * biblioteca opaca (o mammoth dava erro em alguns arquivos) e a leitura fica sob nosso controle.
   */
  async function docxParaBlob(arquivo, destino) {
    const JSZip = await carregarZip();
    const pacote = await JSZip.loadAsync(arquivo);
    const entrada = pacote.file("word/document.xml");
    if (!entrada) throw new Error("Este .docx não tem word/document.xml (pode estar protegido).");
    const xml = await entrada.async("string");
    const documento = new DOMParser().parseFromString(xml, "application/xml");
    const erro = documento.getElementsByTagName("parsererror");
    if (erro.length) throw new Error("Não foi possível ler o XML do documento.");
    const paragrafos = [...documento.getElementsByTagName("w:p")].map((paragrafo) =>
      [...paragrafo.getElementsByTagName("w:t")].map((pedaco) => pedaco.textContent).join(""),
    );
    if (destino === "txt") {
      return new Blob([paragrafos.join("\n\n")], { type: "text/plain;charset=utf-8" });
    }
    const escapar = (texto) => texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const corpo = paragrafos
      .map((texto) => (texto.trim() ? `  <p>${escapar(texto)}</p>` : ""))
      .filter(Boolean)
      .join("\n");
    const html = `<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<title>Documento</title>\n</head>\n<body>\n${corpo}\n</body>\n</html>\n`;
    return new Blob([html], { type: "text/html;charset=utf-8" });
  }

  async function converterTudo() {
    if (!itens.length) return;
    blocoGlobal.hidden = false;
    botaoConverter.disabled = true;
    let feitos = 0;
    pintarProgresso(0, itens.length);
    for (const item of itens) {
      item.estado = "convertendo";
      item.erro = "";
      desenhar();
      try {
        const nome = C.nomeSaida(item.arquivo.name, item.destino);
        let blob;
        if (item.formato === "pdf") {
          blob = item.destino === "html" ? await pdfParaHtmlVisual(item.arquivo) : await pdfParaTexto(item.arquivo);
        } else if (item.formato === "docx") {
          blob = await docxParaBlob(item.arquivo, item.destino);
        } else if (C.ehImagem(item.formato)) {
          blob = await converterImagem(item.arquivo, item.destino);
        } else {
          const texto = await lerTexto(item.arquivo);
          blob = item.destino === "pdf"
            ? await textoParaPdf(texto)
            : new Blob([C.converterTexto(item.formato, item.destino, texto)], { type: C.MIME[item.destino] || "text/plain;charset=utf-8" });
        }
        item.resultado = { url: URL.createObjectURL(blob), nome };
        item.estado = "ok";
      } catch (erro) {
        item.estado = "erro";
        item.erro = erro && erro.message ? erro.message : "Falha ao converter.";
      }
      feitos++;
      pintarProgresso(feitos, itens.length);
      desenhar();
    }
    const erros = itens.filter((item) => item.estado === "erro").length;
    const ok = itens.length - erros;
    mensagem(erros ? `${ok} convertido(s) e ${erros} com erro.` : `Tudo pronto: ${ok} arquivo(s) convertido(s).`);
    botaoConverter.disabled = false;
  }

  // Teclado: o dropzone é alcançável por Tab e abre o seletor com Enter ou espaço
  solta.tabIndex = 0;
  solta.setAttribute("role", "button");
  solta.setAttribute("aria-label", "Escolher arquivos para converter");
  solta.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      entrada.click();
    }
  });

  escolher.addEventListener("click", () => entrada.click());
  entrada.addEventListener("change", () => {
    adicionar([...entrada.files]);
    entrada.value = "";
  });

  for (const evento of ["dragenter", "dragover"]) {
    solta.addEventListener(evento, (e) => {
      e.preventDefault();
      solta.classList.add("arrastando");
    });
  }
  for (const evento of ["dragleave", "drop"]) {
    solta.addEventListener(evento, (e) => {
      e.preventDefault();
      solta.classList.remove("arrastando");
    });
  }
  solta.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files) adicionar([...e.dataTransfer.files]);
  });

  botaoConverter.addEventListener("click", converterTudo);
  botaoLimpar.addEventListener("click", () => {
    limparResultados();
    itens = [];
    blocoGlobal.hidden = true;
    pintarProgresso(0, 0);
    desenhar();
    mensagem("");
  });
  botaoBaixar.addEventListener("click", () => {
    // Sem ZIP nesta etapa: baixa um a um, com um respiro para o navegador aceitar vários downloads
    itens
      .filter((item) => item.resultado)
      .forEach((item, indice) => {
        setTimeout(() => {
          const link = document.createElement("a");
          link.href = item.resultado.url;
          link.download = item.resultado.nome;
          document.body.appendChild(link);
          link.click();
          link.remove();
        }, indice * 350);
      });
  });

  botaoZip.addEventListener("click", async () => {
    const prontos = itens.filter((item) => item.resultado);
    if (!prontos.length) return;
    botaoZip.disabled = true;
    botaoZip.textContent = "Compactando…";
    try {
      const JSZip = await carregarZip();
      const pacote = new JSZip();
      const usados = new Set();
      for (const item of prontos) {
        const nome = C.nomeUnicoZip(usados, item.resultado.nome);
        usados.add(nome);
        pacote.file(nome, await (await fetch(item.resultado.url)).blob());
      }
      const blob = await pacote.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "convertidos.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      mensagem(`${prontos.length} arquivo(s) no convertidos.zip.`);
    } catch (erro) {
      mensagem(`Não foi possível montar o zip: ${(erro && erro.message) || "erro desconhecido"}.`);
    }
    botaoZip.disabled = false;
    botaoZip.textContent = "Baixar em .zip";
  });

  desenhar();
})();
