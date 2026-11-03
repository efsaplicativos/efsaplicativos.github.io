"use strict";
/*
 * Equações: interface de ui/tools/equacoes/EquacoesScreen.kt (abas, campos, resultado, passo a
 * passo) e o gráfico de FunctionPlot.kt redesenhado em SVG. As contas estão em equacoes-logica.js.
 * Os campos e a aba ficam no localStorage para continuar de onde parou.
 */
(() => {
  const raiz = document.querySelector("#equacoes");
  if (!raiz) return;

  const E = Equacoes;
  const CHAVE = "efs-equacoes-estado";
  const SVG = "http://www.w3.org/2000/svg";

  const MODELOS = {
    linear: { texto: "ax + b = 0", campos: 2 },
    quadratica: { texto: "ax² + bx + c = 0", campos: 3 },
    cubica: { texto: "ax³ + bx² + cx + d = 0", campos: 4 },
  };
  // Exemplos da primeira visita (os mesmos do texto da página)
  const PADRAO = {
    aba: "quadratica",
    tamanho: 2,
    linear: ["2", "-8"],
    quadratica: ["1", "-5", "6"],
    cubica: ["1", "-6", "11", "-6"],
    sistema: ["2", "1", "", "5", "1", "-1", "", "1", "1", "1", "1", "6"],
  };

  const abas = [...raiz.querySelectorAll("[data-aba]")];
  const botoesTamanho = [...raiz.querySelectorAll("[data-tamanho]")];
  const painelPolinomio = raiz.querySelector("#eq-polinomio");
  const painelSistema = raiz.querySelector("#eq-sistema");
  const modelo = raiz.querySelector("#eq-modelo");
  const camposCoef = [0, 1, 2, 3].map((i) => raiz.querySelector(`#eq-c${i}`));
  const camposSistema = Array.from({ length: 12 }, (_, k) => raiz.querySelector(`#eq-s${Math.floor(k / 4)}-${k % 4}`));
  const saidaEquacao = raiz.querySelector("#eq-equacao");
  const saidaAviso = raiz.querySelector("#eq-aviso");
  const saidaNatureza = raiz.querySelector("#eq-natureza");
  const saidaPrincipal = raiz.querySelector("#eq-principal");
  const saidaRaizes = raiz.querySelector("#eq-raizes");
  const saidaDetalhes = raiz.querySelector("#eq-detalhes");
  const saidaMensagem = raiz.querySelector("#eq-mensagem");
  const anuncio = raiz.querySelector("#eq-anuncio");
  const figura = raiz.querySelector("#eq-grafico");
  const legenda = raiz.querySelector("#eq-legenda");
  const area = raiz.querySelector("#eq-grafico-area");
  const leitura = raiz.querySelector("#eq-leitura");
  const blocoPassos = raiz.querySelector("#eq-passos-bloco");
  const listaPassos = raiz.querySelector("#eq-passos");
  const textoLeitura = leitura.textContent;

  // ---------- Estado salvo ----------

  const listaDeTextos = (v, n) =>
    Array.isArray(v) && v.length === n && v.every((t) => typeof t === "string" && t.length <= 40) ? v : null;

  function carregar() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE));
      if (!salvo || typeof salvo !== "object") return { ...PADRAO };
      return {
        aba: ["linear", "quadratica", "cubica", "sistema"].includes(salvo.aba) ? salvo.aba : PADRAO.aba,
        tamanho: salvo.tamanho === 3 ? 3 : 2,
        linear: listaDeTextos(salvo.linear, 2) || PADRAO.linear,
        quadratica: listaDeTextos(salvo.quadratica, 3) || PADRAO.quadratica,
        cubica: listaDeTextos(salvo.cubica, 4) || PADRAO.cubica,
        sistema: listaDeTextos(salvo.sistema, 12) || PADRAO.sistema,
      };
    } catch (erro) {
      return { ...PADRAO };
    }
  }

  function salvar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch (erro) {
      /* Armazenamento bloqueado: os campos valem só nesta visita. */
    }
  }

  const estado = carregar();
  let ultimoCampo = null;

  // Mensagem "Número inválido" ligada a cada campo
  for (const campo of [...camposCoef, ...camposSistema]) {
    const erro = document.createElement("span");
    erro.className = "eq-erro";
    erro.id = `${campo.id}-erro`;
    erro.textContent = E.TEXTOS.numeroInvalido;
    erro.hidden = true;
    campo.after(erro);
  }

  // ---------- Campos ----------

  function preencherCampos() {
    if (estado.aba === "sistema") {
      camposSistema.forEach((c, k) => {
        c.value = estado.sistema[k];
      });
    } else {
      const valores = estado[estado.aba];
      camposCoef.forEach((c, i) => {
        c.value = valores[i] ?? "";
      });
    }
  }

  function lerDosCampos() {
    if (estado.aba === "sistema") estado.sistema = camposSistema.map((c) => c.value);
    else estado[estado.aba] = camposCoef.slice(0, MODELOS[estado.aba].campos).map((c) => c.value);
  }

  function marcarErros(campos, erros) {
    campos.forEach((c, i) => {
      const invalido = Boolean(erros && erros[i]);
      c.setAttribute("aria-invalid", String(invalido));
      const msg = c.nextElementSibling;
      msg.hidden = !invalido;
      if (invalido) c.setAttribute("aria-describedby", msg.id);
      else c.removeAttribute("aria-describedby");
    });
  }

  function mostrarAba() {
    for (const b of abas) {
      const ativa = b.dataset.aba === estado.aba;
      b.classList.toggle("active", ativa);
      b.setAttribute("aria-pressed", String(ativa));
    }
    const sistema = estado.aba === "sistema";
    painelPolinomio.hidden = sistema;
    painelSistema.hidden = !sistema;
    if (!sistema) {
      const m = MODELOS[estado.aba];
      modelo.textContent = m.texto;
      raiz.querySelectorAll("[data-coef]").forEach((f) => {
        f.hidden = Number(f.dataset.coef) >= m.campos;
      });
    } else {
      for (const b of botoesTamanho) {
        const ativo = Number(b.dataset.tamanho) === estado.tamanho;
        b.classList.toggle("active", ativo);
        b.setAttribute("aria-pressed", String(ativo));
      }
      raiz.querySelectorAll("[data-linha]").forEach((l) => {
        l.hidden = Number(l.dataset.linha) >= estado.tamanho;
      });
      raiz.querySelectorAll("[data-coluna]").forEach((f) => {
        f.hidden = Number(f.dataset.coluna) === 2 && estado.tamanho === 2;
      });
      painelSistema.dataset.tamanho = String(estado.tamanho);
    }
    preencherCampos();
  }

  // ---------- Resultado ----------

  function linhas(dl, itens, destaque) {
    dl.replaceChildren(
      ...itens.map((item) => {
        const div = document.createElement("div");
        if (destaque) div.className = "destaque";
        const dt = document.createElement("dt");
        dt.textContent = item.rotulo;
        const dd = document.createElement("dd");
        dd.textContent = item.valor;
        div.append(dt, dd);
        return div;
      }),
    );
  }

  let ultimoAnuncio = "";
  function anunciar(texto) {
    if (texto === ultimoAnuncio) return;
    ultimoAnuncio = texto;
    anuncio.textContent = texto;
  }

  function mostrarVazio(mensagem) {
    saidaEquacao.textContent = estado.aba === "sistema" ? "—" : MODELOS[estado.aba].texto;
    saidaAviso.hidden = true;
    saidaNatureza.hidden = true;
    saidaPrincipal.hidden = true;
    linhas(saidaRaizes, []);
    linhas(saidaDetalhes, []);
    saidaMensagem.hidden = false;
    saidaMensagem.textContent = mensagem;
    saidaMensagem.classList.toggle("error", mensagem === E.TEXTOS.numeroInvalido);
    figura.hidden = true;
    blocoPassos.hidden = true;
    grafico = null;
    anunciar(mensagem);
  }

  let grafico = null;

  function calcular() {
    const sistema = estado.aba === "sistema";
    const campos = sistema ? camposSistema : camposCoef.slice(0, MODELOS[estado.aba].campos);
    const rel = sistema ? E.relatorioSistema(estado.tamanho, estado.sistema) : E.relatorioPolinomio(estado[estado.aba]);
    marcarErros(campos, rel && rel.erros);
    if (sistema) camposCoef.forEach((c) => c.setAttribute("aria-invalid", "false"));

    if (rel === null) {
      return mostrarVazio(sistema ? "Preencha ao menos um campo de cada equação." : "Preencha os coeficientes para ver as raízes.");
    }
    if (!("destaque" in rel)) return mostrarVazio(E.TEXTOS.numeroInvalido);

    saidaEquacao.textContent = sistema
      ? `Sistema ${estado.tamanho} × ${estado.tamanho}`
      : rel.equacao;
    saidaAviso.hidden = !rel.aviso;
    saidaAviso.textContent = rel.aviso || "";
    saidaNatureza.hidden = !rel.mensagem;
    saidaNatureza.textContent = rel.mensagem || "";
    saidaPrincipal.hidden = !rel.principal;
    saidaPrincipal.textContent = rel.principal ? rel.principal.valor : "";
    linhas(saidaRaizes, rel.destaque, true);
    linhas(saidaDetalhes, rel.detalhes);
    saidaMensagem.hidden = true;

    blocoPassos.hidden = !rel.passos.length;
    listaPassos.replaceChildren(
      ...rel.passos.map((p) => {
        const li = document.createElement("li");
        li.textContent = p;
        return li;
      }),
    );

    grafico = rel.grafico;
    figura.hidden = !grafico;
    if (grafico) desenharGrafico();

    const partes = [rel.mensagem, rel.principal && rel.principal.valor, ...rel.destaque.map((d) => `${d.rotulo} = ${d.valor}`)];
    anunciar(partes.filter(Boolean).join(". "));
  }

  // ---------- Gráfico (FunctionPlot.kt em SVG) ----------

  const ALTURA = 280;
  const MARGEM = { esquerda: 8, direita: 8, topo: 8, base: 20 };
  let escala = null;
  let cursor = null;

  function el(nome, atributos = {}, texto) {
    const no = document.createElementNS(SVG, nome);
    for (const [k, v] of Object.entries(atributos)) no.setAttribute(k, String(v));
    if (texto !== undefined) no.textContent = texto;
    return no;
  }

  function desenharGrafico() {
    const largura = Math.max(260, Math.round(area.clientWidth || 600));
    const g = E.escalaGrafico(grafico.funcoes, grafico.xMin, grafico.xMax, grafico.pontos);
    const esq = MARGEM.esquerda;
    const dir = largura - MARGEM.direita;
    const topo = MARGEM.topo;
    const base = ALTURA - MARGEM.base;
    const px = (x) => esq + (dir - esq) * ((x - g.xMin) / (g.xMax - g.xMin));
    const py = (y) => base - (base - topo) * ((y - g.yMin) / (g.yMax - g.yMin));
    escala = { g, px, py, esq, dir, topo, base, largura };

    const svg = el("svg", {
      class: "eq-svg",
      viewBox: `0 0 ${largura} ${ALTURA}`,
      width: largura,
      height: ALTURA,
      role: "img",
      tabindex: 0,
      "aria-label": `Gráfico de ${grafico.nomes.join(" e ")}, com x de ${E.formatar(E.marcaLimpa(g.xMin, 0.01))} a ${E.formatar(E.marcaLimpa(g.xMax, 0.01))}`,
    });

    // Grade e marcas
    const grade = el("g", { class: "eq-grade" });
    const rotulos = el("g", { class: "eq-marcas", "aria-hidden": "true" });
    for (const m of g.marcasX) {
      const x = px(m.valor);
      grade.append(el("line", { x1: x, y1: topo, x2: x, y2: base }));
      const t = el("text", { x: Math.min(Math.max(x, esq + 12), dir - 12), y: ALTURA - 5, "text-anchor": "middle" }, m.texto);
      rotulos.append(t);
    }
    for (const m of g.marcasY) {
      const y = py(m.valor);
      grade.append(el("line", { x1: esq, y1: y, x2: dir, y2: y }));
      rotulos.append(el("text", { x: esq + 3, y: Math.max(Math.min(y - 3, base - 3), topo + 10) }, m.texto));
    }
    svg.append(grade);

    // Eixos x e y, quando visíveis
    const eixos = el("g", { class: "eq-eixos" });
    if (g.yMin <= 0 && g.yMax >= 0) eixos.append(el("line", { x1: esq, y1: py(0), x2: dir, y2: py(0) }));
    if (g.xMin <= 0 && g.xMax >= 0) eixos.append(el("line", { x1: px(0), y1: topo, x2: px(0), y2: base }));
    svg.append(eixos, rotulos);

    // Curvas, recortadas na área do gráfico
    const recorte = `eq-recorte-${Math.random().toString(36).slice(2, 8)}`;
    const defs = el("defs");
    const clip = el("clipPath", { id: recorte });
    clip.append(el("rect", { x: esq, y: topo, width: dir - esq, height: base - topo }));
    defs.append(clip);
    svg.append(defs);
    const curvas = el("g", { "clip-path": `url(#${recorte})` });
    const faixa = g.yMax - g.yMin;
    g.curvas.forEach((ys, indice) => {
      let d = "";
      let desenhando = false;
      g.xs.forEach((x, i) => {
        const y = ys[i];
        if (!Number.isFinite(y)) {
          desenhando = false;
          return;
        }
        const cy = py(Math.min(Math.max(y, g.yMin - faixa), g.yMax + faixa));
        d += `${desenhando ? "L" : "M"}${px(x).toFixed(1)} ${cy.toFixed(1)}`;
        desenhando = true;
      });
      curvas.append(el("path", { d, class: `eq-curva eq-serie-${(indice % 2) + 1}` }));
    });
    svg.append(curvas);

    // Pontos marcados (raízes, vértice, interseção)
    const pontos = el("g", { class: "eq-pontos" });
    for (const p of grafico.pontos) {
      if (p.x < g.xMin || p.x > g.xMax || p.y < g.yMin || p.y > g.yMax) continue;
      const cx = px(p.x);
      const cy = py(p.y);
      const grupo = el("g");
      grupo.append(el("title", {}, `(${E.formatar(p.x)}; ${E.formatar(p.y)})`));
      grupo.append(el("circle", { cx, cy, r: 5.5, class: "eq-ponto" }));
      if (p.rotulo) {
        const t = el("text", { x: Math.min(cx + 8, largura - 4), y: Math.max(cy - 8, 12), class: "eq-ponto-rotulo" }, p.rotulo);
        if (cx + 8 > largura - 60) {
          t.setAttribute("text-anchor", "end");
          t.setAttribute("x", cx - 8);
        }
        grupo.append(t);
      }
      pontos.append(grupo);
    }
    svg.append(pontos);

    // Leitura de valores (cursor)
    cursor = el("g", { class: "eq-cursor", visibility: "hidden", "aria-hidden": "true" });
    cursor.append(el("line", { y1: topo, y2: base }));
    grafico.funcoes.forEach((_, indice) => cursor.append(el("circle", { r: 4.5, class: `eq-serie-${(indice % 2) + 1}` })));
    svg.append(cursor);

    svg.addEventListener("pointermove", (evento) => {
      const caixa = svg.getBoundingClientRect();
      const x = ((evento.clientX - caixa.left) / caixa.width) * largura;
      lerEm(g.xMin + ((x - esq) / (dir - esq)) * (g.xMax - g.xMin));
    });
    svg.addEventListener("pointerleave", esconderCursor);
    svg.addEventListener("blur", esconderCursor);
    svg.addEventListener("keydown", (evento) => {
      if (evento.key !== "ArrowLeft" && evento.key !== "ArrowRight") return;
      evento.preventDefault();
      const passo = ((g.xMax - g.xMin) / 48) * (evento.key === "ArrowLeft" ? -1 : 1);
      const atual = cursorX === null ? (g.xMin + g.xMax) / 2 - passo : cursorX;
      lerEm(Math.min(g.xMax, Math.max(g.xMin, atual + passo)));
    });

    area.replaceChildren(svg);

    // Legenda (sistema 2×2 com duas retas, ou o nome da curva)
    legenda.replaceChildren(
      ...grafico.nomes.map((nome, indice) => {
        const item = document.createElement("span");
        item.className = "eq-legenda-item";
        const amostra = document.createElement("span");
        amostra.className = `eq-amostra eq-serie-${(indice % 2) + 1}`;
        amostra.setAttribute("aria-hidden", "true");
        item.append(amostra, document.createTextNode(nome));
        return item;
      }),
    );
    cursorX = null;
    leitura.textContent = textoLeitura;
  }

  let cursorX = null;

  function lerEm(x) {
    if (!escala || !grafico) return;
    const { g, px, py, esq, dir } = escala;
    if (!(x >= g.xMin && x <= g.xMax)) return esconderCursor();
    cursorX = x;
    const cx = Math.min(Math.max(px(x), esq), dir);
    cursor.setAttribute("visibility", "visible");
    const linha = cursor.querySelector("line");
    linha.setAttribute("x1", cx);
    linha.setAttribute("x2", cx);
    const valores = grafico.funcoes.map((f) => f(x));
    [...cursor.querySelectorAll("circle")].forEach((c, i) => {
      const y = valores[i];
      const visivel = Number.isFinite(y) && y >= g.yMin && y <= g.yMax;
      c.setAttribute("visibility", visivel ? "visible" : "hidden");
      if (visivel) {
        c.setAttribute("cx", cx);
        c.setAttribute("cy", py(y));
      }
    });
    const xTexto = E.formatar(E.snap(x));
    leitura.textContent =
      valores.length === 1
        ? `x = ${xTexto}  →  y = ${E.formatar(E.snap(valores[0]))}`
        : `x = ${xTexto}  →  ${valores.map((y, i) => `equação ${i + 1}: y = ${E.formatar(E.snap(y))}`).join(";  ")}`;
  }

  function esconderCursor() {
    cursorX = null;
    if (cursor) cursor.setAttribute("visibility", "hidden");
    leitura.textContent = textoLeitura;
  }

  // Redesenha quando a largura muda (girar o celular, redimensionar a janela)
  let larguraAnterior = 0;
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      const largura = Math.round(area.clientWidth);
      if (grafico && !figura.hidden && Math.abs(largura - larguraAnterior) > 4) {
        larguraAnterior = largura;
        desenharGrafico();
      }
    }).observe(area);
  }

  // ---------- Eventos ----------

  for (const b of abas) {
    b.addEventListener("click", () => {
      lerDosCampos();
      estado.aba = b.dataset.aba;
      mostrarAba();
      salvar();
      calcular();
    });
  }
  for (const b of botoesTamanho) {
    b.addEventListener("click", () => {
      lerDosCampos();
      estado.tamanho = Number(b.dataset.tamanho);
      mostrarAba();
      salvar();
      calcular();
    });
  }

  raiz.querySelector("#eq-form").addEventListener("input", (evento) => {
    if (evento.target instanceof HTMLInputElement) ultimoCampo = evento.target;
    lerDosCampos();
    salvar();
    calcular();
  });
  raiz.querySelector("#eq-form").addEventListener("focusin", (evento) => {
    if (evento.target instanceof HTMLInputElement) ultimoCampo = evento.target;
  });
  raiz.querySelector("#eq-form").addEventListener("submit", (evento) => evento.preventDefault());

  const botaoSinal = raiz.querySelector("#eq-sinal");
  // Não tira o foco do campo ao tocar no botão (o teclado do celular continua aberto)
  botaoSinal.addEventListener("pointerdown", (evento) => evento.preventDefault());
  botaoSinal.addEventListener("click", () => {
    const visiveis = estado.aba === "sistema" ? camposSistema : camposCoef;
    const campo = ultimoCampo && visiveis.includes(ultimoCampo) && !ultimoCampo.closest("[hidden]") ? ultimoCampo : visiveis[0];
    const texto = campo.value.trim();
    if (/^[-−]/.test(texto)) campo.value = texto.slice(1);
    else campo.value = `-${texto}`;
    campo.focus();
    lerDosCampos();
    salvar();
    calcular();
  });

  raiz.querySelector("#eq-limpar").addEventListener("click", () => {
    if (estado.aba === "sistema") estado.sistema = Array(12).fill("");
    else estado[estado.aba] = Array(MODELOS[estado.aba].campos).fill("");
    preencherCampos();
    salvar();
    calcular();
    (estado.aba === "sistema" ? camposSistema[0] : camposCoef[0]).focus();
  });

  mostrarAba();
  calcular();
})();
