"use strict";
/*
 * Geometria: interface de ui/tools/geometria/GeometriaScreen.kt (tipo, figura, unidade,
 * círculo pelo raio ou diâmetro, medidas, resultados e fórmulas) e o desenho esquemático de
 * ShapeDrawing.kt refeito em SVG. As contas estão em geometria-logica.js.
 * As medidas ficam guardadas por chave (ao trocar de figura, raio e altura são reaproveitados)
 * e vão para o localStorage junto com a figura e a unidade.
 */
(() => {
  const raiz = document.querySelector("#geometria");
  if (!raiz) return;

  const G = Geometria;
  const CHAVE = "efs-geometria-estado";
  const SVG = "http://www.w3.org/2000/svg";

  const botoesDimensao = [...raiz.querySelectorAll("[data-dimensao]")];
  const botoesUnidade = [...raiz.querySelectorAll("[data-unidade]")];
  const botoesDiametro = [...raiz.querySelectorAll("[data-diametro]")];
  const seletor = raiz.querySelector("#geo-forma");
  const modoCirculo = raiz.querySelector("#geo-modo-circulo");
  const campos = raiz.querySelector("#geo-campos");
  const desenho = raiz.querySelector("#geo-desenho");
  const rotuloPrincipal = raiz.querySelector("#geo-principal-rotulo");
  const valorPrincipal = raiz.querySelector("#geo-principal");
  const medidas = raiz.querySelector("#geo-medidas");
  const mensagem = raiz.querySelector("#geo-mensagem");
  const anuncio = raiz.querySelector("#geo-anuncio");
  const blocoFormulas = raiz.querySelector("#geo-formulas-bloco");
  const listaFormulas = raiz.querySelector("#geo-formulas");

  // ---------- Estado salvo ----------

  const PADRAO = { forma: "circulo", unidade: "cm", porDiametro: false, entradas: { raio: "5" } };

  function carregar() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE));
      if (!salvo || typeof salvo !== "object") return JSON.parse(JSON.stringify(PADRAO));
      const entradas = {};
      if (salvo.entradas && typeof salvo.entradas === "object") {
        for (const k of [...Object.keys(G.ENTRADAS), "diametro"]) {
          const t = salvo.entradas[k];
          if (typeof t === "string" && t.length <= 40) entradas[k] = t;
        }
      }
      return {
        forma: G.forma(salvo.forma) ? salvo.forma : PADRAO.forma,
        unidade: G.UNIDADES.includes(salvo.unidade) ? salvo.unidade : PADRAO.unidade,
        porDiametro: salvo.porDiametro === true,
        entradas,
      };
    } catch (erro) {
      return JSON.parse(JSON.stringify(PADRAO));
    }
  }

  function salvar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch (erro) {
      /* Armazenamento bloqueado: as medidas valem só nesta visita. */
    }
  }

  const estado = carregar();

  // ---------- Controles ----------

  function marcar(botoes, ativo) {
    for (const b of botoes) {
      const sim = ativo(b);
      b.classList.toggle("active", sim);
      b.setAttribute("aria-pressed", String(sim));
    }
  }

  function preencherSeletor() {
    const dimensao = G.forma(estado.forma).dimensao;
    seletor.replaceChildren(
      ...G.FORMAS.filter((f) => f.dimensao === dimensao).map((f) => {
        const op = document.createElement("option");
        op.value = f.id;
        op.textContent = f.nome;
        return op;
      }),
    );
    seletor.value = estado.forma;
  }

  /** Chave onde o texto do campo fica guardado (o diâmetro tem a sua). */
  const chaveDoCampo = (k) => (estado.forma === "circulo" && k === "raio" && estado.porDiametro ? "diametro" : k);

  function montarCampos() {
    const f = G.forma(estado.forma);
    campos.replaceChildren(
      ...f.entradas.map((k) => {
        const entrada = G.ENTRADAS[k];
        const chave = chaveDoCampo(k);
        const id = `geo-in-${chave}`;
        const rotulo = chave === "diametro" ? "Diâmetro (d)" : `${entrada.rotulo} (${entrada.simbolo})`;
        let sufixo = estado.unidade;
        if (entrada.tipo === "angulo") sufixo = "°";
        if (entrada.tipo === "contagem") sufixo = "";

        const campo = document.createElement("div");
        campo.className = "field";
        const label = document.createElement("label");
        label.htmlFor = id;
        label.textContent = rotulo;
        const linha = document.createElement("div");
        linha.className = "input-row geo-sufixo";
        const input = document.createElement("input");
        input.className = "input";
        input.id = id;
        input.dataset.chave = chave;
        input.inputMode = entrada.tipo === "contagem" ? "numeric" : "decimal";
        input.autocomplete = "off";
        input.placeholder = entrada.tipo === "contagem" ? "Ex.: 6" : "Ex.: 5";
        input.value = estado.entradas[chave] ?? "";
        linha.append(input);
        if (sufixo) {
          const span = document.createElement("span");
          span.textContent = sufixo;
          span.setAttribute("aria-hidden", "true");
          linha.append(span);
        }
        campo.append(label, linha);
        return campo;
      }),
    );
  }

  function mostrarControles() {
    const f = G.forma(estado.forma);
    marcar(botoesDimensao, (b) => b.dataset.dimensao === f.dimensao);
    marcar(botoesUnidade, (b) => b.dataset.unidade === estado.unidade);
    marcar(botoesDiametro, (b) => (b.dataset.diametro === "sim") === estado.porDiametro);
    modoCirculo.hidden = estado.forma !== "circulo";
    preencherSeletor();
    montarCampos();
  }

  // ---------- Resultado ----------

  let ultimoAnuncio = "";

  function calcular() {
    const r = G.resultadoDaTela(estado.forma, estado.entradas, estado.unidade, estado.porDiametro);
    for (const input of campos.querySelectorAll("input")) {
      const texto = input.value.trim();
      input.setAttribute("aria-invalid", String(texto !== "" && MatematicaComum.ler(texto) === null));
    }
    desenhar(estado.forma, r.valores);

    if (r.estado !== "ok") {
      rotuloPrincipal.textContent = "Resultados";
      valorPrincipal.textContent = "—";
      medidas.replaceChildren();
      mensagem.hidden = false;
      mensagem.textContent = r.mensagem;
      mensagem.classList.toggle("error", r.estado === "erro");
      blocoFormulas.hidden = true;
      anunciar(r.estado === "erro" ? r.mensagem : "");
      return;
    }
    // A primeira medida (ou a classificação do triângulo) vai em destaque
    const linhas = r.linhas.filter((l) => l.rotulo !== "Classificação");
    const classificacao = r.linhas.find((l) => l.rotulo === "Classificação");
    rotuloPrincipal.textContent = linhas[0].rotulo;
    valorPrincipal.textContent = linhas[0].valor;
    const resto = classificacao ? [classificacao, ...linhas.slice(1)] : linhas.slice(1);
    medidas.replaceChildren(
      ...resto.map((l) => {
        const div = document.createElement("div");
        const dt = document.createElement("dt");
        dt.textContent = l.rotulo;
        const dd = document.createElement("dd");
        dd.textContent = l.valor;
        div.append(dt, dd);
        return div;
      }),
    );
    mensagem.hidden = true;
    blocoFormulas.hidden = false;
    listaFormulas.replaceChildren(
      ...r.formulas.map((t) => {
        const li = document.createElement("li");
        li.textContent = t;
        return li;
      }),
    );
    anunciar(`${linhas[0].rotulo}: ${linhas[0].valor}`);
  }

  function anunciar(texto) {
    if (texto === ultimoAnuncio) return;
    ultimoAnuncio = texto;
    anuncio.textContent = texto;
  }

  // ---------- Desenho esquemático (ShapeDrawing.kt) ----------

  const LARGURA = 360;
  const ALTURA = 210;
  const AREA = { x: 24, y: 18, w: LARGURA - 48, h: ALTURA - 36 };
  const PAD = 14;

  const p = (x, y) => ({ x, y });
  const meio = (a, b) => p((a.x + b.x) / 2, (a.y + b.y) / 2);
  const limitar = (x, min, max) => Math.min(max, Math.max(min, x));

  /** Proporção largura/altura limitada para o desenho continuar legível. */
  const proporcao = (largura, altura, padrao) =>
    largura > 0 && altura > 0 ? limitar(largura / altura, 0.35, 2.8) : padrao;

  /** Largura e altura que cabem na área mantendo a proporção (largura/altura). */
  function caber(area, razao) {
    const w = Math.min(area.w, area.h * razao);
    return [w, w / razao];
  }

  function criarPintor(svg) {
    const add = (nome, atributos, texto) => {
      const no = document.createElementNS(SVG, nome);
      for (const [k, v] of Object.entries(atributos)) no.setAttribute(k, typeof v === "number" ? v.toFixed(2) : v);
      if (texto !== undefined) no.textContent = texto;
      svg.append(no);
      return no;
    };
    const caminhoPoligono = (pts) => `M${pts.map((q) => `${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join(" L")} Z`;

    /** Arco de elipse em graus, no sentido horário da tela (0° = direita), como drawArc. */
    function caminhoArco(cx, cy, rx, ry, inicio, varredura, comCentro) {
      const ponto = (g) => p(cx + rx * Math.cos((g * Math.PI) / 180), cy + ry * Math.sin((g * Math.PI) / 180));
      const partes = Math.abs(varredura) >= 359.99 ? 2 : 1;
      const passo = varredura / partes;
      const a = ponto(inicio);
      let d = comCentro ? `M${cx} ${cy} L${a.x} ${a.y}` : `M${a.x} ${a.y}`;
      for (let i = 1; i <= partes; i++) {
        const b = ponto(inicio + passo * i);
        d += ` A${rx} ${ry} 0 ${Math.abs(passo) > 180 ? 1 : 0} ${passo > 0 ? 1 : 0} ${b.x} ${b.y}`;
      }
      return comCentro ? `${d} Z` : d;
    }

    return {
      contorno(pts, preenchido = true) {
        add("path", { d: caminhoPoligono(pts), class: preenchido ? "geo-figura" : "geo-traco" });
      },
      fundo(pts) {
        add("path", { d: caminhoPoligono(pts), class: "geo-fundo" });
      },
      linha(a, b, tracejada = false) {
        add("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: tracejada ? "geo-oculto" : "geo-traco" });
      },
      circulo(c, r, classe = "geo-figura") {
        add("circle", { cx: c.x, cy: c.y, r, class: classe });
      },
      ponto(c) {
        add("circle", { cx: c.x, cy: c.y, r: 3, class: "geo-ponto" });
      },
      oval(x, y, w, h, classe = "geo-figura") {
        add("ellipse", { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, class: classe });
      },
      retangulo(x, y, w, h) {
        add("rect", { x, y, width: w, height: h, class: "geo-fundo" });
      },
      arco(x, y, w, h, inicio, varredura, classe, comCentro = false) {
        add("path", { d: caminhoArco(x + w / 2, y + h / 2, w / 2, h / 2, inicio, varredura, comCentro), class: classe });
      },
      rotulo(texto, em) {
        add("text", { x: em.x, y: em.y, class: "geo-rotulo", "text-anchor": "middle", "dominant-baseline": "central" }, texto);
      },
    };
  }

  function desenharTrianguloPorLados(t, v, area) {
    const { ladoA: a, ladoB: b, ladoC: cLado } = v;
    // Vértices: A e B na base (lado c), C no topo; lado a = BC, lado b = AC
    const valido = a > 0 && b > 0 && cLado > 0 && a + b > cLado && a + cLado > b && b + cLado > a;
    const centro = p(area.x + area.w / 2, area.y + area.h / 2);
    let pts;
    if (valido) {
      const anguloA = Math.acos(limitar((b * b + cLado * cLado - a * a) / (2 * b * cLado), -1, 1));
      const bruto = [p(0, 0), p(cLado, 0), p(b * Math.cos(anguloA), -(b * Math.sin(anguloA)))];
      const xs = bruto.map((q) => q.x);
      const ys = bruto.map((q) => q.y);
      const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const escala = Math.min(area.w / Math.max(maxX - minX, 1e-6), area.h / Math.max(maxY - minY, 1e-6));
      const desX = centro.x - ((minX + maxX) / 2) * escala;
      const desY = centro.y - ((minY + maxY) / 2) * escala;
      pts = bruto.map((q) => p(desX + q.x * escala, desY + q.y * escala));
    } else {
      const [w, h] = caber(area, 1.4);
      pts = [p(centro.x - w / 2, centro.y + h / 2), p(centro.x + w / 2, centro.y + h / 2), p(centro.x - w * 0.1, centro.y - h / 2)];
    }
    const [pa, pb, pc] = pts;
    t.contorno(pts);
    const g = p((pa.x + pb.x + pc.x) / 3, (pa.y + pb.y + pc.y) / 3);
    const paraFora = (q) => {
      const dx = q.x - g.x;
      const dy = q.y - g.y;
      const comp = Math.max(Math.hypot(dx, dy), 1);
      return p(q.x + (dx / comp) * PAD, q.y + (dy / comp) * PAD);
    };
    const paraDentro = (q) => p(q.x + (g.x - q.x) * 0.3, q.y + (g.y - q.y) * 0.3);
    t.rotulo("c", paraFora(meio(pa, pb)));
    t.rotulo("a", paraFora(meio(pb, pc)));
    t.rotulo("b", paraFora(meio(pa, pc)));
    t.rotulo("γ", paraDentro(pc));
    t.rotulo("α", paraDentro(pa));
    t.rotulo("β", paraDentro(pb));
  }

  /** Caixa em perspectiva oblíqua (cubo/paralelepípedo). rotulos = largura, altura, profundidade. */
  function desenharCaixa(t, area, razaoLargura, razaoAltura, razaoProfundidade, rotulos) {
    const unidade = Math.min(
      area.w / (razaoLargura + razaoProfundidade * 0.8),
      area.h / (razaoAltura + razaoProfundidade * 0.6),
    );
    const w = unidade * razaoLargura;
    const h = unidade * razaoAltura;
    const dx = unidade * razaoProfundidade * 0.8;
    const dy = unidade * razaoProfundidade * 0.6;
    const esquerda = area.x + area.w / 2 - (w + dx) / 2;
    const baixo = area.y + area.h / 2 + (h + dy) / 2;
    const f1 = p(esquerda, baixo);
    const f2 = p(esquerda + w, baixo);
    const f3 = p(esquerda + w, baixo - h);
    const f4 = p(esquerda, baixo - h);
    const atras = (q) => p(q.x + dx, q.y - dy);
    const [b1, b2, b3, b4] = [f1, f2, f3, f4].map(atras);
    t.fundo([f1, f2, b2, b3, b4, f4]);
    t.linha(b1, b2, true);
    t.linha(b1, b4, true);
    t.linha(b1, f1, true);
    t.contorno([f1, f2, f3, f4], false);
    t.linha(f2, b2);
    t.linha(f3, b3);
    t.linha(f4, b4);
    t.linha(b2, b3);
    t.linha(b3, b4);
    t.rotulo(rotulos[0], p(meio(f1, f2).x, f1.y + PAD));
    t.rotulo(rotulos[1], p(f1.x - PAD, meio(f1, f4).y));
    t.rotulo(rotulos[2], p(meio(f2, b2).x + PAD, meio(f2, b2).y + PAD / 2));
  }

  function desenharForma(t, forma, v) {
    const area = AREA;
    const c = p(area.x + area.w / 2, area.y + area.h / 2);
    switch (forma) {
      case "circulo": {
        const r = Math.min(area.w, area.h) / 2;
        t.circulo(c, r);
        t.linha(c, p(c.x + r, c.y));
        t.ponto(c);
        t.rotulo("r", p(c.x + r / 2, c.y - PAD));
        break;
      }
      case "quadrado": {
        const s = Math.min(area.w, area.h);
        const tl = p(c.x - s / 2, c.y - s / 2);
        t.contorno([tl, p(tl.x + s, tl.y), p(tl.x + s, tl.y + s), p(tl.x, tl.y + s)]);
        t.linha(tl, p(tl.x + s, tl.y + s), true);
        t.rotulo("a", p(c.x, tl.y + s + PAD));
        t.rotulo("a", p(tl.x - PAD, c.y));
        t.rotulo("d", p(c.x + PAD, c.y - PAD));
        break;
      }
      case "retangulo": {
        const [w, h] = caber(area, proporcao(v.base, v.altura, 1.6));
        const tl = p(c.x - w / 2, c.y - h / 2);
        t.contorno([tl, p(tl.x + w, tl.y), p(tl.x + w, tl.y + h), p(tl.x, tl.y + h)]);
        t.linha(tl, p(tl.x + w, tl.y + h), true);
        t.rotulo("b", p(c.x, tl.y + h + PAD));
        t.rotulo("h", p(tl.x + w + PAD, c.y));
        t.rotulo("d", p(c.x - PAD, c.y - PAD));
        break;
      }
      case "trianguloBaseAltura": {
        const [w, h] = caber(area, proporcao(v.base, v.altura, 1.4));
        const esq = p(c.x - w / 2, c.y + h / 2);
        const dir = p(c.x + w / 2, c.y + h / 2);
        const topo = p(c.x - w * 0.15, c.y - h / 2);
        t.contorno([esq, dir, topo]);
        t.linha(topo, p(topo.x, esq.y), true);
        t.rotulo("b", p(c.x, esq.y + PAD));
        t.rotulo("h", p(topo.x + PAD, c.y));
        break;
      }
      case "trianguloLados":
        desenharTrianguloPorLados(t, v, area);
        break;
      case "trapezio": {
        const razaoTopo = v.baseMaior > 0 && v.baseMenor !== null ? limitar(v.baseMenor / v.baseMaior, 0.2, 1) : 0.55;
        const [w, h] = caber(area, 1.7);
        const bl = p(c.x - w / 2, c.y + h / 2);
        const br = p(c.x + w / 2, c.y + h / 2);
        const tr = p(c.x + (w * razaoTopo) / 2, c.y - h / 2);
        const tl = p(c.x - (w * razaoTopo) / 2, c.y - h / 2);
        t.contorno([bl, br, tr, tl]);
        t.linha(tl, p(tl.x, bl.y), true);
        t.rotulo("B", p(c.x, bl.y + PAD));
        t.rotulo("b", p(c.x, tl.y - PAD));
        t.rotulo("h", p(tl.x + PAD, c.y));
        t.rotulo("s", p(meio(br, tr).x + PAD, meio(br, tr).y));
        break;
      }
      case "paralelogramo": {
        const [w, h] = caber(area, 1.9);
        const desloc = w * 0.25;
        const bl = p(c.x - w / 2, c.y + h / 2);
        const br = p(c.x + w / 2 - desloc, c.y + h / 2);
        const tr = p(c.x + w / 2, c.y - h / 2);
        const tl = p(c.x - w / 2 + desloc, c.y - h / 2);
        t.contorno([bl, br, tr, tl]);
        t.linha(tl, p(tl.x, bl.y), true);
        t.rotulo("b", p(meio(bl, br).x, bl.y + PAD));
        t.rotulo("h", p(tl.x + PAD, c.y));
        t.rotulo("s", p(meio(bl, tl).x - PAD, meio(bl, tl).y));
        break;
      }
      case "losango": {
        const [w, h] = caber(area, proporcao(v.diagonalMaior, v.diagonalMenor, 1.5));
        const l = p(c.x - w / 2, c.y);
        const r = p(c.x + w / 2, c.y);
        const tp = p(c.x, c.y - h / 2);
        const b = p(c.x, c.y + h / 2);
        t.contorno([l, tp, r, b]);
        t.linha(l, r, true);
        t.linha(tp, b, true);
        t.rotulo("D", p(c.x + w / 4, c.y + PAD));
        t.rotulo("d", p(c.x + PAD, c.y - h / 4));
        t.rotulo("a", p(meio(tp, r).x + PAD, meio(tp, r).y - PAD / 2));
        break;
      }
      case "elipse": {
        const [w, h] = caber(area, proporcao(v.semieixoA, v.semieixoB, 1.7));
        t.oval(c.x - w / 2, c.y - h / 2, w, h);
        t.linha(c, p(c.x + w / 2, c.y));
        t.linha(c, p(c.x, c.y - h / 2));
        t.rotulo("a", p(c.x + w / 4, c.y + PAD));
        t.rotulo("b", p(c.x - PAD, c.y - h / 4));
        break;
      }
      case "poligonoRegular": {
        const lados = Math.trunc(v.numeroLados);
        const n = lados >= 3 && lados <= 14 ? lados : 6;
        const r = Math.min(area.w, area.h) / 2;
        // Lado inferior na horizontal
        const inicio = Math.PI / 2 + Math.PI / n;
        const pts = Array.from({ length: n }, (_, i) => {
          const ang = inicio + (2 * Math.PI * i) / n;
          return p(c.x + r * Math.cos(ang), c.y + r * Math.sin(ang));
        });
        t.contorno(pts);
        const meioBase = meio(pts[0], pts[n - 1]);
        t.linha(c, meioBase, true);
        t.ponto(c);
        t.rotulo("a", p(meioBase.x, meioBase.y + PAD));
        t.rotulo("ap", p(c.x + PAD * 1.4, meio(c, meioBase).y));
        break;
      }
      case "setor": {
        const angulo = limitar(v.angulo ?? 60, 10, 360);
        const r = (Math.min(area.w, area.h) / 2) * 1.05;
        t.arco(c.x - r, c.y - r, 2 * r, 2 * r, -angulo, angulo, "geo-figura", true);
        t.rotulo("r", p(c.x + r / 2, c.y + PAD));
        const bissetriz = ((-angulo / 2) * Math.PI) / 180;
        t.rotulo("θ", p(c.x + r * 0.28 * Math.cos(bissetriz), c.y + r * 0.28 * Math.sin(bissetriz)));
        t.rotulo("s", p(c.x + (r + PAD) * Math.cos(bissetriz), c.y + (r + PAD) * Math.sin(bissetriz)));
        break;
      }
      case "cubo":
        desenharCaixa(t, area, 1, 1, 0.55, ["a", "a", "a"]);
        break;
      case "paralelepipedo": {
        const razaoAltura = limitar(proporcao(v.altura, v.comprimento, 0.7), 0.4, 1.6);
        const razaoProf = limitar(proporcao(v.largura, v.comprimento, 0.6), 0.35, 1.2);
        desenharCaixa(t, area, 1, razaoAltura, razaoProf * 0.55, ["c", "h", "l"]);
        break;
      }
      case "esfera": {
        const r = Math.min(area.w, area.h) / 2;
        t.circulo(c, r);
        const eq = { x: c.x - r, y: c.y - r * 0.28, w: 2 * r, h: r * 0.56 };
        t.arco(eq.x, eq.y, eq.w, eq.h, 0, 180, "geo-traco-fino");
        t.arco(eq.x, eq.y, eq.w, eq.h, 180, 180, "geo-oculto");
        t.linha(c, p(c.x + r, c.y));
        t.ponto(c);
        t.rotulo("r", p(c.x + r / 2, c.y - PAD));
        break;
      }
      case "cilindro": {
        const [w, h] = caber(area, proporcao(v.raio * 2, v.altura, 0.9));
        const ry = w * 0.16;
        const topo = c.y - h / 2 + ry;
        const fundo = c.y + h / 2 - ry;
        const esq = c.x - w / 2;
        const dir = c.x + w / 2;
        t.retangulo(esq, topo, w, fundo - topo);
        t.oval(esq, topo - ry, w, 2 * ry);
        t.arco(esq, fundo - ry, w, 2 * ry, 0, 180, "geo-traco");
        t.arco(esq, fundo - ry, w, 2 * ry, 180, 180, "geo-oculto");
        t.linha(p(esq, topo), p(esq, fundo));
        t.linha(p(dir, topo), p(dir, fundo));
        t.linha(p(c.x, topo), p(dir, topo));
        t.rotulo("r", p(c.x + w / 4, topo - PAD));
        t.rotulo("h", p(dir + PAD, c.y));
        break;
      }
      case "cone": {
        const [w, h] = caber(area, proporcao(v.raio * 2, v.altura, 0.9));
        const ry = w * 0.15;
        const base = c.y + h / 2 - ry;
        const topo = p(c.x, c.y - h / 2);
        const esq = p(c.x - w / 2, base);
        const dir = p(c.x + w / 2, base);
        t.contorno([esq, dir, topo]);
        t.arco(esq.x, base - ry, w, 2 * ry, 0, 180, "geo-traco");
        t.arco(esq.x, base - ry, w, 2 * ry, 180, 180, "geo-oculto");
        t.linha(topo, p(c.x, base), true);
        t.linha(p(c.x, base), dir, true);
        t.rotulo("h", p(c.x - PAD, c.y));
        t.rotulo("r", p(c.x + w / 4, base + PAD));
        t.rotulo("g", p(meio(topo, dir).x + PAD, meio(topo, dir).y));
        break;
      }
      case "piramide": {
        const [w, h] = caber(area, 1.2);
        const prof = w * 0.45;
        const baseY = c.y + h / 2;
        const fl = p(c.x - w / 2 - prof / 4, baseY);
        const fr = p(c.x + w / 2 - prof / 4, baseY);
        const br = p(fr.x + prof / 2, baseY - prof / 2);
        const bl = p(fl.x + prof / 2, baseY - prof / 2);
        const centro = meio(fl, br);
        const topo = p(centro.x, c.y - h / 2);
        t.fundo([fl, fr, br, topo]);
        t.linha(fl, fr);
        t.linha(fr, br);
        t.linha(bl, fl, true);
        t.linha(bl, br, true);
        t.linha(bl, topo, true);
        t.linha(fl, topo);
        t.linha(fr, topo);
        t.linha(br, topo);
        t.linha(topo, centro, true);
        t.rotulo("a", p(meio(fl, fr).x, baseY + PAD));
        t.rotulo("h", p(centro.x + PAD, meio(topo, centro).y));
        t.rotulo("g", p(meio(topo, meio(fl, fr)).x - PAD, meio(topo, meio(fl, fr)).y));
        break;
      }
      case "troncoCone": {
        const razaoTopo = v.raioMaior > 0 && v.raioMenor !== null ? limitar(v.raioMenor / v.raioMaior, 0.2, 1) : 0.55;
        const [w, h] = caber(area, 1.1);
        const ry = w * 0.14;
        const base = c.y + h / 2 - ry;
        const topo = c.y - h / 2 + ry * razaoTopo;
        const tw = w * razaoTopo;
        t.fundo([p(c.x - w / 2, base), p(c.x + w / 2, base), p(c.x + tw / 2, topo), p(c.x - tw / 2, topo)]);
        t.oval(c.x - tw / 2, topo - ry * razaoTopo, tw, 2 * ry * razaoTopo);
        t.arco(c.x - w / 2, base - ry, w, 2 * ry, 0, 180, "geo-traco");
        t.arco(c.x - w / 2, base - ry, w, 2 * ry, 180, 180, "geo-oculto");
        t.linha(p(c.x - w / 2, base), p(c.x - tw / 2, topo));
        t.linha(p(c.x + w / 2, base), p(c.x + tw / 2, topo));
        t.linha(p(c.x, topo), p(c.x, base), true);
        t.linha(p(c.x, base), p(c.x + w / 2, base), true);
        t.linha(p(c.x, topo), p(c.x + tw / 2, topo));
        t.rotulo("R", p(c.x + w / 4, base + PAD));
        t.rotulo("r", p(c.x + tw / 4, topo - PAD));
        t.rotulo("h", p(c.x - PAD, c.y));
        t.rotulo("g", p(c.x + (w + tw) / 4 + PAD, c.y));
        break;
      }
      default:
        break;
    }
  }

  function desenhar(forma, valores) {
    const f = G.forma(forma);
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", `0 0 ${LARGURA} ${ALTURA}`);
    svg.setAttribute("class", "geo-svg");
    svg.setAttribute("role", "img");
    const simbolos = f.entradas.map((k) => G.ENTRADAS[k].simbolo).join(", ");
    svg.setAttribute("aria-label", `Desenho esquemático: ${f.nome.toLowerCase()}, com as medidas ${simbolos}`);
    // Valores ausentes viram null: o desenho usa proporções padrão
    const v = {};
    for (const k of f.entradas) v[k] = typeof valores[k] === "number" ? valores[k] : null;
    desenharForma(criarPintor(svg), forma, v);
    desenho.replaceChildren(svg);
  }

  // ---------- Eventos ----------

  for (const b of botoesDimensao) {
    b.addEventListener("click", () => {
      if (G.forma(estado.forma).dimensao === b.dataset.dimensao) return;
      estado.forma = G.FORMAS.find((f) => f.dimensao === b.dataset.dimensao).id;
      mostrarControles();
      salvar();
      calcular();
    });
  }
  seletor.addEventListener("change", () => {
    estado.forma = seletor.value;
    mostrarControles();
    salvar();
    calcular();
  });
  for (const b of botoesUnidade) {
    b.addEventListener("click", () => {
      estado.unidade = b.dataset.unidade;
      mostrarControles();
      salvar();
      calcular();
    });
  }
  for (const b of botoesDiametro) {
    b.addEventListener("click", () => {
      estado.porDiametro = b.dataset.diametro === "sim";
      mostrarControles();
      salvar();
      calcular();
    });
  }
  campos.addEventListener("input", (evento) => {
    const input = evento.target;
    if (!(input instanceof HTMLInputElement)) return;
    estado.entradas[input.dataset.chave] = input.value;
    salvar();
    calcular();
  });
  raiz.querySelector("#geo-form").addEventListener("submit", (evento) => evento.preventDefault());
  raiz.querySelector("#geo-limpar").addEventListener("click", () => {
    for (const k of G.forma(estado.forma).entradas) delete estado.entradas[k];
    delete estado.entradas.diametro;
    mostrarControles();
    salvar();
    calcular();
    const primeiro = campos.querySelector("input");
    if (primeiro) primeiro.focus();
  });

  mostrarControles();
  calcular();
})();
