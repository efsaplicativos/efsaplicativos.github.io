"use strict";
/*
 * Estatística: interface de ui/tools/estatistica/EstatisticaScreen.kt (dados, seções de
 * resultados, percentil e escore-z, histograma, frequências e dados ordenados). O histograma
 * de components/Charts.kt (BarChart) foi redesenhado em SVG. As contas estão em
 * estatistica-logica.js. Os campos ficam no localStorage.
 */
(() => {
  const raiz = document.querySelector("#estatistica");
  if (!raiz) return;

  const S = Estatistica;
  const CHAVE = "efs-estatistica-campos";
  const SVG = "http://www.w3.org/2000/svg";
  const MAX_TEXTO = 200000;

  const campoDados = raiz.querySelector("#est-dados");
  const campoPercentil = raiz.querySelector("#est-percentil");
  const campoZ = raiz.querySelector("#est-z");
  const lidos = raiz.querySelector("#est-lidos");
  const ignorados = raiz.querySelector("#est-ignorados");
  const media = raiz.querySelector("#est-media");
  const listaCentral = raiz.querySelector("#est-central-lista");
  const vazio = raiz.querySelector("#est-vazio");
  const anuncio = raiz.querySelector("#est-anuncio");
  const resultados = raiz.querySelector("#est-resultados");
  const erroPercentil = raiz.querySelector("#est-percentil-erro");
  const saidaPercentil = raiz.querySelector("#est-percentil-resultado");
  const saidaZ = raiz.querySelector("#est-z-resultado");
  const avisoZ = raiz.querySelector("#est-z-aviso");
  const blocoHistograma = raiz.querySelector("#est-histograma-bloco");
  const grafico = raiz.querySelector("#est-grafico");
  const notaHistograma = raiz.querySelector("#est-histograma-nota");
  const corpoClasses = raiz.querySelector("#est-classes");
  const corpoFrequencias = raiz.querySelector("#est-frequencias");
  const notaFrequencias = raiz.querySelector("#est-frequencias-nota");
  const ordenados = raiz.querySelector("#est-ordenados");
  const botaoCopiar = raiz.querySelector("#est-copiar");

  // ---------- Campos salvos ----------

  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE));
    if (salvo && typeof salvo === "object") {
      if (typeof salvo.dados === "string" && salvo.dados.length <= MAX_TEXTO) campoDados.value = salvo.dados;
      if (typeof salvo.percentil === "string" && salvo.percentil.length <= 20) campoPercentil.value = salvo.percentil;
      if (typeof salvo.z === "string" && salvo.z.length <= 40) campoZ.value = salvo.z;
    }
  } catch (erro) {
    /* Sem armazenamento ou dado corrompido: começa vazio. */
  }

  function salvar() {
    try {
      localStorage.setItem(
        CHAVE,
        JSON.stringify({ dados: campoDados.value.slice(0, MAX_TEXTO), percentil: campoPercentil.value, z: campoZ.value }),
      );
    } catch (erro) {
      /* Armazenamento bloqueado ou cheio: os dados valem só nesta visita. */
    }
  }

  // ---------- Desenho ----------

  function preencherLista(dl, linhas) {
    dl.replaceChildren(
      ...linhas.map((l) => {
        const div = document.createElement("div");
        if (l.destaque) div.className = "destaque";
        const dt = document.createElement("dt");
        dt.textContent = l.rotulo;
        const dd = document.createElement("dd");
        dd.textContent = l.valor;
        div.append(dt, dd);
        return div;
      }),
    );
  }

  function preencherTabela(corpo, linhas) {
    const fragmento = document.createDocumentFragment();
    for (const celulas of linhas) {
      const tr = document.createElement("tr");
      for (const texto of celulas) {
        const td = document.createElement("td");
        td.textContent = texto;
        tr.append(td);
      }
      fragmento.append(tr);
    }
    corpo.replaceChildren(fragmento);
  }

  let ultimoAnuncio = "";
  function anunciar(texto) {
    if (texto === ultimoAnuncio) return;
    ultimoAnuncio = texto;
    anuncio.textContent = texto;
  }

  let resultado = null;

  function calcular() {
    const lido = S.lerDados(campoDados.value);
    resultado = S.calcular(lido.valores);

    lidos.hidden = !lido.valores.length;
    lidos.textContent = lido.valores.length === 1 ? "1 valor lido" : `${lido.valores.length.toLocaleString("pt-BR")} valores lidos`;
    ignorados.hidden = !lido.invalidos.length;
    ignorados.textContent = `Ignorados por serem inválidos: ${lido.invalidos.slice(0, 50).join("  ")}${lido.invalidos.length > 50 ? " …" : ""}`;
    campoDados.setAttribute("aria-invalid", String(lido.invalidos.length > 0));

    if (!resultado) {
      media.textContent = "—";
      listaCentral.replaceChildren();
      vazio.hidden = false;
      resultados.hidden = true;
      anunciar("");
      return;
    }
    const r = resultado;
    const central = S.central(r);
    media.textContent = central.find((l) => l.rotulo === "Média").valor;
    preencherLista(
      listaCentral,
      central.filter((l) => l.rotulo !== "Média"),
    );
    vazio.hidden = true;
    resultados.hidden = false;

    for (const secao of S.secoes(r)) {
      preencherLista(raiz.querySelector(`#est-${secao.id}`), secao.linhas);
      const nota = raiz.querySelector(`#est-nota-${secao.id}`);
      if (nota) nota.textContent = secao.nota || "";
    }
    atualizarFerramentas();

    // Histograma só com 2 valores ou mais, como no app
    blocoHistograma.hidden = r.n < 2;
    if (r.n >= 2) {
      const classes = S.classesHistograma(r);
      desenharHistograma(classes);
      notaHistograma.textContent = S.notaHistograma(r);
      preencherTabela(
        corpoClasses,
        classes.map((c) => [c.texto, c.quantidade.toLocaleString("pt-BR")]),
      );
    }

    preencherTabela(corpoFrequencias, S.linhasFrequencia(r));
    const distintos = r.frequencias.length;
    notaFrequencias.hidden = distintos <= S.MAX_LINHAS_FREQUENCIA;
    notaFrequencias.textContent = `Mostrando os ${S.MAX_LINHAS_FREQUENCIA} menores de ${distintos.toLocaleString("pt-BR")} valores distintos.`;
    ordenados.textContent = S.textoOrdenado(r);

    const mediana = central.find((l) => l.rotulo === "Mediana").valor;
    anunciar(`${lidos.textContent}. Média ${media.textContent}, mediana ${mediana}.`);
  }

  function atualizarFerramentas() {
    if (!resultado) return;
    const p = S.percentilDigitado(resultado, campoPercentil.value);
    const invalido = Boolean(p && p.erro);
    campoPercentil.setAttribute("aria-invalid", String(invalido));
    erroPercentil.hidden = !invalido;
    erroPercentil.textContent = invalido ? p.erro : "";
    if (invalido) campoPercentil.setAttribute("aria-describedby", erroPercentil.id);
    else campoPercentil.removeAttribute("aria-describedby");
    preencherLista(saidaPercentil, p && !p.erro ? [{ rotulo: p.rotulo, valor: p.valor, destaque: true }] : []);

    const z = S.escoreZDigitado(resultado, campoZ.value);
    campoZ.setAttribute("aria-invalid", String(campoZ.value.trim() !== "" && z === null));
    preencherLista(saidaZ, z && z.valor ? [{ rotulo: "Escore-z", valor: z.valor, destaque: true }] : []);
    avisoZ.hidden = !(z && z.aviso);
    avisoZ.textContent = z && z.aviso ? z.aviso : "";
  }

  // ---------- Histograma em SVG ----------

  function el(nome, atributos = {}, texto) {
    const no = document.createElementNS(SVG, nome);
    for (const [k, v] of Object.entries(atributos)) no.setAttribute(k, String(v));
    if (texto !== undefined) no.textContent = texto;
    return no;
  }

  let classesDesenhadas = null;

  function desenharHistograma(classes) {
    classesDesenhadas = classes;
    const largura = Math.max(260, Math.round(grafico.clientWidth || 600));
    const altura = 220;
    const topo = 22;
    const base = altura - 22;
    const alturaUtil = base - topo;
    const maior = Math.max(1, ...classes.map((c) => c.quantidade));
    const fatia = largura / classes.length;
    const larguraBarra = Math.max(2, Math.min(fatia - 2, fatia * 0.86));
    // Rótulos do eixo só onde cabem (cerca de 7 px por caractere)
    const cabeRotulo = (texto) => texto.length * 7 <= fatia * 1.2;

    const svg = el("svg", {
      class: "est-svg",
      viewBox: `0 0 ${largura} ${altura}`,
      width: largura,
      height: altura,
      role: "img",
      "aria-label": `Histograma com ${classes.length} classes. Os valores estão na tabela abaixo.`,
    });
    const grupoBarras = el("g");
    classes.forEach((c, i) => {
      const h = (alturaUtil * c.quantidade) / maior;
      const x = i * fatia + (fatia - larguraBarra) / 2;
      const g = el("g", { class: "est-barra" });
      g.append(el("title", {}, `${c.texto}: ${c.quantidade.toLocaleString("pt-BR")} ${c.quantidade === 1 ? "valor" : "valores"}`));
      // Área de toque maior que a barra, para a dica aparecer mesmo em barras baixas
      g.append(el("rect", { x: i * fatia, y: topo, width: fatia, height: alturaUtil, class: "est-alvo" }));
      if (h > 0) {
        const raio = Math.min(4, larguraBarra / 2, h);
        // Barra com cantos arredondados só no topo, presa à linha de base
        const d = [
          `M${x} ${base}`,
          `V${base - h + raio}`,
          `Q${x} ${base - h} ${x + raio} ${base - h}`,
          `H${x + larguraBarra - raio}`,
          `Q${x + larguraBarra} ${base - h} ${x + larguraBarra} ${base - h + raio}`,
          `V${base}`,
          "Z",
        ].join(" ");
        g.append(el("path", { d, class: "est-barra-forma" }));
        const rotuloValor = c.quantidade.toLocaleString("pt-BR");
        if (cabeRotulo(rotuloValor)) {
          g.append(el("text", { x: x + larguraBarra / 2, y: base - h - 6, class: "est-valor", "text-anchor": "middle" }, rotuloValor));
        }
      }
      if (cabeRotulo(c.rotuloCurto)) {
        g.append(el("text", { x: x + larguraBarra / 2, y: altura - 6, class: "est-eixo-texto", "text-anchor": "middle" }, c.rotuloCurto));
      }
      grupoBarras.append(g);
    });
    svg.append(grupoBarras);
    svg.append(el("line", { x1: 0, y1: base, x2: largura, y2: base, class: "est-base" }));
    grafico.replaceChildren(svg);
  }

  let larguraAnterior = 0;
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      const largura = Math.round(grafico.clientWidth);
      if (classesDesenhadas && !blocoHistograma.hidden && Math.abs(largura - larguraAnterior) > 4) {
        larguraAnterior = largura;
        desenharHistograma(classesDesenhadas);
      }
    }).observe(grafico);
  }

  // ---------- Eventos ----------

  campoDados.addEventListener("input", () => {
    calcular();
    salvar();
  });
  for (const campo of [campoPercentil, campoZ]) {
    campo.addEventListener("input", () => {
      atualizarFerramentas();
      salvar();
    });
  }
  raiz.querySelector("#est-form").addEventListener("submit", (evento) => evento.preventDefault());

  raiz.querySelector("#est-exemplo").addEventListener("click", () => {
    campoDados.value = S.textoExemplo();
    calcular();
    salvar();
    campoDados.focus();
  });
  raiz.querySelector("#est-limpar").addEventListener("click", () => {
    campoDados.value = "";
    calcular();
    salvar();
    campoDados.focus();
  });

  botaoCopiar.addEventListener("click", async () => {
    let copiou = false;
    try {
      await navigator.clipboard.writeText(ordenados.textContent);
      copiou = true;
    } catch (erro) {
      copiou = false;
    }
    botaoCopiar.textContent = copiou ? "Copiado" : "Não foi possível copiar";
    setTimeout(() => {
      botaoCopiar.textContent = "Copiar";
    }, 1600);
  });

  calcular();
})();
