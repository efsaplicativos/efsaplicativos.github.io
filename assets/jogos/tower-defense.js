"use strict";
/* Interface e renderização Canvas. Toda a simulação está em tower-defense-logica.js. */
(() => {
  const raiz = document.querySelector(".tower-defense");
  if (!raiz || typeof LogicaTowerDefense !== "object") return;
  const C = LogicaTowerDefense;
  const PASTA = "/assets/jogos/tower-defense/web/";
  const canvas = raiz.querySelector("#td-tela");
  const ctx = canvas.getContext("2d");
  const quadro = raiz.querySelector("#td-quadro");
  const carregando = raiz.querySelector("#td-carregando");
  const mensagem = raiz.querySelector("#td-mensagem");
  const selecionadaEl = raiz.querySelector("#td-selecionada");
  const botoesTorre = [...raiz.querySelectorAll("[data-torre]")];
  const botaoIniciar = raiz.querySelector("#td-iniciar");
  const botaoPausar = raiz.querySelector("#td-pausar");
  const botaoVelocidade = raiz.querySelector("#td-velocidade");
  const botaoMelhorar = raiz.querySelector("#td-melhorar");
  const botaoReparar = raiz.querySelector("#td-reparar");
  const botaoVender = raiz.querySelector("#td-vender");
  const botaoTelaCheia = raiz.querySelector("#td-tela-cheia");
  const dialogoReiniciar = raiz.querySelector("#td-confirmar-reinicio");
  const campos = {
    moedas: raiz.querySelector("#td-moedas"), vidas: raiz.querySelector("#td-vidas"),
    onda: raiz.querySelector("#td-onda"), inimigos: raiz.querySelector("#td-inimigos"),
    recorde: raiz.querySelector("#td-recorde"),
  };
  const som = typeof Sons === "object" ? Sons.criar("tower-defense", raiz) : { tocar() {}, ligarBotao() {} };
  som.ligarBotao(raiz.querySelector("#td-som"));

  const VEICULOS = ["canhao", "metralhadora", "artilharia", "leve", "rapido", "pesado", "boss"];
  const INIMIGOS = ["leve", "rapido", "pesado", "boss"];
  const AEREOS = ["helicoptero", "aviao"];
  const ESTREITURA_INIMIGO = 0.85;
  // A espessura das esteiras é aplicada no asset; a altura permanece igual à do casco.
  const ESCALA_LAGARTA_INIMIGO = 1;
  // A torreta 56 usa uma moldura mais alta que a 57; 1,53 iguala o corpo amarelo das duas.
  const ESCALA_TORRE_NORMAL = { rapido: 1.53 };
  // Centro do círculo de encaixe em proporção da base original (x/largura, y/altura).
  const ENCAIXE_TORRE_INIMIGO = {
    leve: { x: -2 / 295, y: 42 / 230 },
    rapido: { x: -0.5 / 223, y: 41.5 / 204 },
    pesado: { x: -0.6 / 244, y: 0.8 / 239 },
    boss: { x: -0.7 / 210, y: -0.6 / 200 },
  };
  const NOMES = [
    "terreno", "quartel", "arvore",
    "terreno-deserto", "decoracao-deserto", "terreno-neve", "decoracao-neve",
    "terreno-vulcao", "decoracao-vulcao",
    ...VEICULOS.flatMap((nome) => [`${nome}-base`, `${nome}-torre`, `${nome}-lagartas`, `${nome}-base-destruida`, `${nome}-torre-destruida`]),
    ...INIMIGOS.flatMap((nome) => [`${nome}-lagartas-animadas`]),
    ...AEREOS.flatMap((nome) => [`${nome}-aereo`, `${nome}-destroco`]),
  ];
  const imagens = {};
  const ARVORES = [
    [48, 524, 68], [176, 520, 57], [330, 536, 65], [891, 82, 72],
    [760, 207, 58], [270, 60, 56], [48, 370, 63], [932, 570, 48],
  ];
  let estado = C.iniciar();
  estado.pausado = true;
  let tipoEscolhido = "canhao";
  let plataformaSelecionada = null;
  let plataformaSobMouse = null;
  let velocidade = 1;
  let pronto = false;
  const padroesTerreno = {};
  let ultimoQuadro = performance.now();
  let aviso = "";
  let avisoAte = 0;
  let recorde = 0;
  let ultimoTiroLeve = 0;
  let ultimoTiroInimigo = 0;

  try {
    const salvo = Number(localStorage.getItem("efs-tower-defense-recorde"));
    if (Number.isInteger(salvo) && salvo >= 0 && salvo <= C.TOTAL_ONDAS) recorde = salvo;
  } catch (erro) { /* O jogo funciona sem armazenamento local. */ }

  function redimensionar() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(C.LARGURA * dpr);
    canvas.height = Math.round(C.ALTURA * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    for (const regiao of C.REGIOES) {
      if (imagens[regiao.terreno]) padroesTerreno[regiao.terreno] = ctx.createPattern(imagens[regiao.terreno], "repeat");
    }
  }

  function imagem(nome, x, y, altura, angulo = 0, alpha = 1, fatorX = 1) {
    const img = imagens[nome];
    if (!img) return;
    const largura = altura * img.width / img.height;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angulo);
    ctx.scale(fatorX, 1);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, -largura / 2, -altura / 2, largura, altura);
    ctx.restore();
  }

  function imagemLagartas(tipo, quadro, x, y, altura, angulo = 0, alpha = 1, fatorX = 1) {
    const img = imagens[`${tipo}-lagartas-animadas`];
    if (!img) return;
    const larguraFonte = img.width / 8;
    const largura = altura * larguraFonte / img.height;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angulo);
    ctx.scale(fatorX, 1);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, quadro * larguraFonte, 0, larguraFonte, img.height, -largura / 2, -altura / 2, largura, altura);
    ctx.restore();
  }

  function circulo(x, y, raio, cor, borda = null, largura = 1) {
    ctx.beginPath();
    ctx.arc(x, y, raio, 0, Math.PI * 2);
    ctx.fillStyle = cor;
    ctx.fill();
    if (borda) {
      ctx.strokeStyle = borda;
      ctx.lineWidth = largura;
      ctx.stroke();
    }
  }

  function estrada(regiao) {
    ctx.beginPath();
    ctx.moveTo(C.CAMINHO[0].x, C.CAMINHO[0].y);
    for (let i = 1; i < C.CAMINHO.length; i++) ctx.lineTo(C.CAMINHO[i].x, C.CAMINHO[i].y);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = regiao.borda;
    ctx.lineWidth = 86;
    ctx.stroke();
    ctx.strokeStyle = regiao.estrada;
    ctx.lineWidth = 76;
    ctx.stroke();
    ctx.strokeStyle = "rgba(235, 215, 164, 0.22)";
    ctx.lineWidth = 52;
    ctx.setLineDash([4, 15]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function desenharRotasAereas(regiao) {
    const onda = estado.fase === "preparacao" ? estado.onda + 1 : estado.onda;
    if (onda < 4) return;
    ctx.save();
    ctx.strokeStyle = regiao.id === "neve" ? "rgba(41, 67, 77, 0.28)" : "rgba(255, 255, 255, 0.34)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 12]);
    for (const caminho of Object.values(C.CAMINHOS_AEREOS)) {
      ctx.beginPath();
      ctx.moveTo(caminho[0].x, caminho[0].y);
      for (let i = 1; i < caminho.length; i++) ctx.lineTo(caminho[i].x, caminho[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function regiaoAtual() {
    const onda = estado.fase === "preparacao" ? estado.onda + 1 : Math.max(1, estado.onda);
    return C.regiaoDaOnda(onda);
  }

  function desenharMapa() {
    const regiao = regiaoAtual();
    ctx.fillStyle = padroesTerreno[regiao.terreno] || "#667c48";
    ctx.fillRect(0, 0, C.LARGURA, C.ALTURA);
    estrada(regiao);
    desenharRotasAereas(regiao);
    for (const [x, y, tamanho] of ARVORES) imagem(regiao.decoracao, x, y, tamanho);
    ctx.fillStyle = "rgba(31, 45, 28, 0.8)";
    ctx.fillRect(12, 12, 138, 26);
    ctx.fillStyle = "#fff8df";
    ctx.font = "bold 13px Nunito, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(regiao.nome.toUpperCase(), 81, 30);
    ctx.fillStyle = "rgba(31, 45, 28, 0.8)";
    ctx.fillRect(846, 211, 94, 25);
    ctx.fillStyle = "#fff8df";
    ctx.font = "bold 13px Nunito, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("QUARTEL", 893, 229);
    imagem("quartel", 893, 282, 112);
    ctx.fillStyle = "rgba(31, 45, 28, 0.78)";
    ctx.fillRect(10, 45, 85, 25);
    ctx.fillStyle = "#fff8df";
    ctx.fillText("ENTRADA", 52, 63);
  }

  function desenharAlcance() {
    let centro = null;
    let alcance = 0;
    const torre = C.torreNa(estado, plataformaSelecionada);
    if (torre) {
      centro = torre;
      alcance = C.statsTorre(torre).alcance;
    } else if (tipoEscolhido && plataformaSobMouse) {
      centro = C.plataforma(plataformaSobMouse);
      if (centro && !C.torreNa(estado, centro.id)) alcance = C.TORRES[tipoEscolhido].alcance;
    }
    if (!centro || !alcance) return;
    circulo(centro.x, centro.y, alcance, "rgba(250, 225, 119, 0.12)", "rgba(255, 239, 158, 0.75)", 2);
  }

  function desenharPlataformas() {
    for (const p of C.PLATAFORMAS) {
      const ocupada = C.torreNa(estado, p.id);
      const ativa = p.id === plataformaSelecionada || p.id === plataformaSobMouse;
      circulo(p.x, p.y + 4, 31, "rgba(26, 34, 25, 0.28)");
      circulo(p.x, p.y, 29, ocupada ? "#606c50" : "#7e8b6c", ativa ? "#ffe38a" : "#c2c8a9", ativa ? 3 : 2);
      if (!ocupada) {
        ctx.strokeStyle = "#e7e7cc";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x - 9, p.y);
        ctx.lineTo(p.x + 9, p.y);
        ctx.moveTo(p.x, p.y - 9);
        ctx.lineTo(p.x, p.y + 9);
        ctx.stroke();
      }
    }
  }

  function desenharTorres() {
    for (const torre of estado.torres) {
      ctx.fillStyle = "rgba(18, 28, 18, 0.28)";
      ctx.beginPath();
      ctx.ellipse(torre.x, torre.y + 15, 28, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      imagem(`${torre.tipo}-lagartas`, torre.x, torre.y, 59);
      imagem(`${torre.tipo}-base`, torre.x, torre.y, 59);
      imagem(`${torre.tipo}-torre`, torre.x, torre.y, 105, torre.angulo + Math.PI / 2);
      const stats = C.statsTorre(torre);
      if (torre.vida < stats.vidaMaxima) {
        ctx.fillStyle = "rgba(24, 24, 20, 0.82)";
        ctx.fillRect(torre.x - 26, torre.y - 39, 52, 8);
        ctx.fillStyle = torre.vida / stats.vidaMaxima > 0.4 ? "#8dd45f" : "#ef6a4f";
        ctx.fillRect(torre.x - 24, torre.y - 37, 48 * Math.max(0, torre.vida / stats.vidaMaxima), 4);
      }
      for (let nivel = 0; nivel < torre.nivel; nivel++) circulo(torre.x - 10 + nivel * 10, torre.y + 30, 3.5, nivel === 2 ? "#ffd65a" : "#eaf2c5");
    }
  }

  function encaixeTorreInimigo(tipo, x, y, tamanho, angulo) {
    const encaixe = ENCAIXE_TORRE_INIMIGO[tipo] || { x: 0, y: 0 };
    const rotacao = angulo + Math.PI / 2;
    const dx = encaixe.x * tamanho * ESTREITURA_INIMIGO;
    const dy = encaixe.y * tamanho;
    return {
      x: x + Math.cos(rotacao) * dx - Math.sin(rotacao) * dy,
      y: y + Math.sin(rotacao) * dx + Math.cos(rotacao) * dy,
    };
  }

  function centroLagartasInimigo(x, y) {
    // Alinhamento apenas no eixo frente/trás; a separação lateral fica no próprio atlas.
    return { x, y };
  }

  function desenharDestrocos() {
    for (const efeito of estado.efeitos) {
      if (efeito.tipo === "destrocosAereos") {
        const p = efeito.tempo / efeito.duracao;
        const x = efeito.x + efeito.lado * p * 45;
        const y = efeito.y + p * p * 70;
        imagem(`${efeito.tipoInimigo}-destroco`, x, y, efeito.raio, efeito.angulo + Math.PI / 2 + efeito.lado * p * 3.5, 1 - p);
        continue;
      }
      if (efeito.tipo !== "destrocos") continue;
      const progresso = efeito.tempo / efeito.duracao;
      const alpha = Math.min(1, (1 - progresso) / 0.22);
      const arremesso = Math.min(1, efeito.tempo / 0.7);
      const direcao = efeito.angulo + efeito.lado * Math.PI / 2;
      const distancia = efeito.raio * 0.7 * arremesso;
      const encaixe = efeito.aliado ? { x: efeito.x, y: efeito.y } : encaixeTorreInimigo(efeito.tipoInimigo, efeito.x, efeito.y, efeito.raio, efeito.angulo);
      const fatorX = efeito.aliado ? 1 : ESTREITURA_INIMIGO;
      const lagartas = efeito.aliado ? { x: efeito.x, y: efeito.y } : centroLagartasInimigo(efeito.x, efeito.y);
      const x = encaixe.x + Math.cos(direcao) * distancia;
      const y = encaixe.y + Math.sin(direcao) * distancia;
      imagem(`${efeito.tipoInimigo}-lagartas`, lagartas.x, lagartas.y, efeito.raio * (efeito.aliado ? 1 : ESCALA_LAGARTA_INIMIGO), efeito.angulo + Math.PI / 2, alpha * 0.8, fatorX);
      imagem(`${efeito.tipoInimigo}-base-destruida`, efeito.x, efeito.y, efeito.raio, efeito.angulo + Math.PI / 2, alpha, fatorX);
      imagem(`${efeito.tipoInimigo}-torre-destruida`, x, y, efeito.raio * 1.65, efeito.angulo + Math.PI / 2 + efeito.lado * arremesso * 1.8, alpha, fatorX);
    }
  }

  function desenharHeliceHelicoptero(inimigo, tamanho) {
    const rotacao = inimigo.angulo + Math.PI / 2;
    const frente = tamanho * 0.30;
    ctx.save();
    // A cauda longa desloca o centro do PNG; o eixo da hélice fica à frente do centro geométrico.
    ctx.translate(inimigo.x + Math.sin(rotacao) * frente, inimigo.y - Math.cos(rotacao) * frente);
    circulo(0, 0, tamanho * 0.46, "rgba(30, 36, 30, 0.08)");
    ctx.rotate(estado.tempoOnda * 25 + inimigo.id);
    const espessura = tamanho * 0.075;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(tamanho * 0.08, -espessura * 0.55);
      ctx.quadraticCurveTo(tamanho * 0.32, -espessura, tamanho * 0.55, 0);
      ctx.quadraticCurveTo(tamanho * 0.32, espessura, tamanho * 0.08, espessura * 0.55);
      ctx.closePath();
      ctx.fillStyle = "#3d453a";
      ctx.fill();
      ctx.strokeStyle = "rgba(230, 238, 210, 0.32)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.rotate(Math.PI / 2);
    }
    circulo(0, 0, tamanho * 0.075, "#222b24", "#9ba585", 1.5);
    ctx.restore();
  }

  function desenharExaustaoAviao(inimigo, tamanho) {
    ctx.save();
    ctx.translate(inimigo.x, inimigo.y);
    ctx.rotate(inimigo.angulo + Math.PI / 2);
    const pulso = estado.tempoOnda * 18 + inimigo.id;
    for (let i = 7; i >= 0; i--) {
      const atraso = tamanho * (0.4 + i * 0.075);
      const raio = tamanho * (0.035 + i * 0.007);
      const tremor = Math.sin(pulso + i * 1.7) * 1.6;
      const cor = i < 2
        ? `rgba(255, 197, 83, ${0.5 - i * 0.13})`
        : i < 5
          ? `rgba(238, 126, 70, ${0.24 - (i - 2) * 0.045})`
          : `rgba(105, 111, 103, ${0.16 - (i - 5) * 0.04})`;
      circulo(-tamanho * 0.1 + tremor, atraso, raio, cor);
      circulo(tamanho * 0.1 - tremor, atraso, raio, cor);
    }
    ctx.restore();
  }

  function desenharInimigos() {
    for (const inimigo of estado.inimigos) {
      const definicao = C.INIMIGOS[inimigo.tipo];
      if (definicao.aereo) {
        ctx.fillStyle = "rgba(20, 24, 19, 0.18)";
        ctx.beginPath();
        ctx.ellipse(inimigo.x + 12, inimigo.y + 20, definicao.tamanho * 0.34, definicao.tamanho * 0.16, inimigo.angulo, 0, Math.PI * 2);
        ctx.fill();
        if (inimigo.tipo === "aviao") desenharExaustaoAviao(inimigo, definicao.tamanho);
        if (inimigo.tipo === "helicoptero") {
          // Mantém a largura do corpo constante; o comprimento maior da cauda cresce para trás.
          const img = imagens["helicoptero-aereo"];
          const largura = definicao.tamanho * 0.82;
          const altura = img ? largura * img.height / img.width : definicao.tamanho;
          imagem("helicoptero-aereo", inimigo.x, inimigo.y, altura, inimigo.angulo + Math.PI / 2);
          desenharHeliceHelicoptero(inimigo, definicao.tamanho);
        } else {
          imagem(`${inimigo.tipo}-aereo`, inimigo.x, inimigo.y, definicao.tamanho, inimigo.angulo + Math.PI / 2);
        }
      } else {
        ctx.fillStyle = "rgba(20, 24, 19, 0.3)";
        ctx.beginPath();
        ctx.ellipse(inimigo.x, inimigo.y + definicao.tamanho * 0.22, definicao.tamanho * 0.42 * ESTREITURA_INIMIGO, definicao.tamanho * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        const quadroLagarta = Math.floor(inimigo.progresso / 5) % 8;
        const escalaTorre = ESCALA_TORRE_NORMAL[inimigo.tipo] || 1;
        const encaixe = encaixeTorreInimigo(inimigo.tipo, inimigo.x, inimigo.y, definicao.tamanho, inimigo.angulo);
        const lagartas = centroLagartasInimigo(inimigo.x, inimigo.y);
        // As lagartas ficam abaixo do casco e são desenhadas antes da base e da torreta.
        imagemLagartas(inimigo.tipo, quadroLagarta, lagartas.x, lagartas.y, definicao.tamanho * ESCALA_LAGARTA_INIMIGO, inimigo.angulo + Math.PI / 2, 1, ESTREITURA_INIMIGO);
        imagem(`${inimigo.tipo}-base`, inimigo.x, inimigo.y, definicao.tamanho, inimigo.angulo + Math.PI / 2, 1, ESTREITURA_INIMIGO);
        imagem(`${inimigo.tipo}-torre`, encaixe.x, encaixe.y, definicao.tamanho * 1.65 * escalaTorre, (inimigo.anguloTorre ?? inimigo.angulo) + Math.PI / 2, 1, ESTREITURA_INIMIGO);
      }
      if (inimigo.vida < inimigo.vidaMaxima || inimigo.tipo === "boss") {
        const largura = inimigo.tipo === "boss" ? 76 : 48;
        const topo = inimigo.y - definicao.tamanho * 0.66;
        ctx.fillStyle = "rgba(24, 24, 20, 0.8)";
        ctx.fillRect(inimigo.x - largura / 2 - 2, topo - 2, largura + 4, 8);
        ctx.fillStyle = inimigo.vida / inimigo.vidaMaxima > 0.4 ? "#8dd45f" : "#ef6a4f";
        ctx.fillRect(inimigo.x - largura / 2, topo, largura * Math.max(0, inimigo.vida / inimigo.vidaMaxima), 4);
      }
    }
  }

  function desenharTirosEEfeitos() {
    for (const p of estado.projeteisInimigos) {
      circulo(p.x, p.y, p.tipo === "boss" || p.tipo === "pesado" ? 4.5 : 3, "#ff725c", "#7d211c", 1);
    }
    for (const p of estado.projeteis) {
      const cor = p.tipo === "artilharia" ? "#252b25" : p.tipo === "canhao" ? "#ffd074" : "#fff1a6";
      circulo(p.x, p.y, p.tipo === "artilharia" ? 6 : p.tipo === "canhao" ? 4 : 2.3, cor);
    }
    for (const efeito of estado.efeitos) {
      const p = efeito.tempo / efeito.duracao;
      if (efeito.tipo === "impacto") {
        ctx.beginPath();
        ctx.arc(efeito.x, efeito.y, efeito.raio * (0.3 + p * 0.7), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 208, 105, ${1 - p})`;
        ctx.lineWidth = 5 * (1 - p) + 1;
        ctx.stroke();
      } else if (efeito.tipo === "explosao") {
        for (let i = 0; i < 7; i++) {
          const angulo = i * Math.PI * 2 / 7;
          const raio = efeito.raio * p * 0.7;
          circulo(efeito.x + Math.cos(angulo) * raio, efeito.y + Math.sin(angulo) * raio, efeito.raio * (0.32 - p * 0.19), `rgba(255, ${Math.round(190 - p * 100)}, 75, ${1 - p})`);
        }
      }
    }
  }

  function desenharAviso() {
    let titulo = "";
    let detalhe = "";
    if (estado.fase === "vitoria") {
      titulo = "Quartel defendido!";
      detalhe = `Você venceu as ${C.TOTAL_ONDAS} ondas. Toque em Reiniciar para jogar de novo.`;
    } else if (estado.fase === "derrota") {
      titulo = "O quartel caiu";
      detalhe = "Reorganize suas defesas e tente outra vez.";
    } else if (estado.pausado && pronto) {
      titulo = "Jogo pausado";
      detalhe = "Toque em Continuar quando estiver pronto.";
    }
    if (!titulo) return;
    ctx.fillStyle = "rgba(18, 28, 20, 0.76)";
    ctx.fillRect(0, 0, C.LARGURA, C.ALTURA);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff8df";
    ctx.font = "bold 44px Baloo 2, sans-serif";
    ctx.fillText(titulo, C.LARGURA / 2, C.ALTURA / 2 - 10);
    ctx.font = "20px Nunito, sans-serif";
    ctx.fillText(detalhe, C.LARGURA / 2, C.ALTURA / 2 + 32);
  }

  function desenhar() {
    desenharMapa();
    desenharAlcance();
    desenharDestrocos();
    desenharPlataformas();
    desenharTorres();
    desenharInimigos();
    desenharTirosEEfeitos();
    desenharAviso();
  }

  function avisar(texto) {
    aviso = texto;
    avisoAte = performance.now() + 2200;
  }

  function salvarRecorde(onda) {
    if (onda <= recorde) return;
    recorde = onda;
    try { localStorage.setItem("efs-tower-defense-recorde", String(recorde)); } catch (erro) { /* sem armazenamento */ }
  }

  function consumirEventos() {
    for (const evento of estado.eventos) {
      if (evento.tipo === "aereoEntrou") {
        som.tocar(evento.tipoInimigo);
      } else if (evento.tipo === "tiroInimigo") {
        const agora = performance.now();
        if (agora - ultimoTiroInimigo > 70) {
          som.tocar("tiroInimigo");
          ultimoTiroInimigo = agora;
        }
      } else if (evento.tipo === "tiro") {
        const agora = performance.now();
        if (evento.tipoTorre === "artilharia") som.tocar("explosao");
        else if (evento.tipoTorre === "canhao") som.tocar("tiroCanhao");
        else if (agora - ultimoTiroLeve > 120) {
          som.tocar("tiroMetralhadora");
          ultimoTiroLeve = agora;
        }
      } else if (evento.tipo === "construir") som.tocar("selecionar");
      else if (evento.tipo === "melhorar" || evento.tipo === "reparar") som.tocar("nivel");
      else if (evento.tipo === "vender") som.tocar("toque");
      else if (evento.tipo === "onda") {
        som.tocar("inicio");
        avisar(evento.onda === 3 ? "Atenção: os inimigos agora atacam suas defesas!" : `${C.regiaoDaOnda(evento.onda).nome} · Onda ${evento.onda} iniciada.`);
      } else if (evento.tipo === "ondaConcluida") {
        som.tocar("nivel");
        salvarRecorde(estado.onda);
        avisar(estado.onda % 5 === 0
          ? `Nova região: ${C.regiaoDaOnda(estado.onda + 1).nome}! Você recebeu ${evento.premio} moedas.`
          : `Onda concluída! Você recebeu ${evento.premio} moedas.`);
      } else if (evento.tipo === "torreDestruida") {
        som.tocar("explosao");
        avisar("Uma defesa foi destruída! A plataforma está livre para reconstruir.");
      } else if (evento.tipo === "vazou") {
        som.tocar("erro");
        avisar(`Um inimigo atravessou: quartel perdeu ${evento.dano} de vida.`);
      } else if (evento.tipo === "abate") som.tocar("explosao");
      else if (evento.tipo === "vitoria") {
        som.tocar("vitoria");
        salvarRecorde(C.TOTAL_ONDAS);
      } else if (evento.tipo === "derrota") som.tocar("derrota");
    }
    estado.eventos.length = 0;
  }

  function textoPadrao() {
    if (!pronto) return "Carregando o campo de batalha…";
    if (estado.fase === "vitoria") return `Vitória! O quartel resistiu às ${C.TOTAL_ONDAS} ondas.`;
    if (estado.fase === "derrota") return `Fim de jogo na onda ${estado.onda}. Toque em Reiniciar para tentar de novo.`;
    if (estado.pausado) return "Jogo pausado. Você ainda pode escolher e posicionar torres.";
    if (estado.fase === "preparacao") {
      const plurais = { leve: "tanques leves", rapido: "batedores", pesado: "tanques pesados", boss: "blindados de comando", helicoptero: "helicópteros", aviao: "aviões" };
      const grupos = C.composicao(estado.onda + 1).map((g) => `${g.quantidade} ${g.quantidade > 1 ? plurais[g.tipo] : g.nome.toLowerCase()}`).join(" · ");
      return `${regiaoAtual().nome} · Próxima onda em ${Math.ceil(estado.preparacao)}s: ${grupos}.`;
    }
    const restantes = estado.inimigos.length + estado.fila.length;
    return `${regiaoAtual().nome} · Onda ${estado.onda} em andamento · ${restantes} ${restantes === 1 ? "inimigo restante" : "inimigos restantes"}.`;
  }

  function atualizarUI() {
    campos.moedas.textContent = String(estado.moedas);
    campos.vidas.textContent = String(estado.vidas);
    campos.onda.textContent = `${estado.onda}/${C.TOTAL_ONDAS}`;
    campos.inimigos.textContent = String(estado.inimigos.length + estado.fila.length);
    campos.recorde.textContent = `${recorde}/${C.TOTAL_ONDAS}`;
    const texto = performance.now() < avisoAte ? aviso : textoPadrao();
    if (mensagem.textContent !== texto) mensagem.textContent = texto;

    const terminou = estado.fase === "vitoria" || estado.fase === "derrota";
    for (const botao of botoesTorre) {
      const tipo = botao.dataset.torre;
      botao.setAttribute("aria-pressed", String(tipo === tipoEscolhido));
      botao.disabled = terminou || estado.moedas < C.TORRES[tipo].custo;
    }
    botaoIniciar.disabled = estado.fase !== "preparacao" || estado.pausado;
    botaoIniciar.textContent = estado.fase === "batalha" ? `Onda ${estado.onda} em andamento` : `Iniciar onda ${Math.min(C.TOTAL_ONDAS, estado.onda + 1)}`;
    botaoPausar.disabled = terminou || !pronto;
    botaoPausar.textContent = estado.pausado ? "Continuar" : "Pausar";
    botaoPausar.setAttribute("aria-pressed", String(estado.pausado));
    botaoVelocidade.disabled = terminou;
    botaoVelocidade.textContent = `Velocidade: ${velocidade}×`;
    botaoVelocidade.setAttribute("aria-pressed", String(velocidade === 2));

    const torre = C.torreNa(estado, plataformaSelecionada);
    selecionadaEl.hidden = !torre;
    if (torre) {
      const stats = C.statsTorre(torre);
      raiz.querySelector("#td-torre-nome").textContent = `${stats.nome} · nível ${torre.nivel}`;
      raiz.querySelector("#td-torre-stats").textContent = `Vida ${Math.ceil(torre.vida)}/${Math.round(stats.vidaMaxima)} · Dano ${Math.round(stats.dano)} · Alcance ${Math.round(stats.alcance)} · ${stats.raio ? "dano em área" : "alvo único"} · ${stats.aereo ? "ataca aéreos" : "só terrestre"}`;
      const reparo = C.custoReparo(torre);
      botaoReparar.textContent = torre.reparoRecarga > 0 ? `Reparo em ${Math.ceil(torre.reparoRecarga)}s` : reparo ? `Reparar · ${reparo}` : "Vida cheia";
      botaoReparar.disabled = !reparo || torre.reparoRecarga > 0 || estado.moedas < reparo || terminou;
      const custo = C.custoMelhoria(torre);
      botaoMelhorar.textContent = torre.nivel >= 3 ? "Nível máximo" : `Melhorar · ${custo}`;
      botaoMelhorar.disabled = torre.nivel >= 3 || estado.moedas < custo || terminou;
      botaoVender.textContent = `Vender · ${C.valorVenda(torre)}`;
      botaoVender.disabled = terminou;
    }
  }

  function escolherTipo(tipo) {
    if (!C.TORRES[tipo]) return;
    tipoEscolhido = tipo;
    plataformaSelecionada = null;
    som.tocar("selecionar");
    atualizarUI();
  }

  function reiniciar() {
    estado = C.iniciar();
    tipoEscolhido = "canhao";
    plataformaSelecionada = null;
    plataformaSobMouse = null;
    velocidade = 1;
    aviso = "";
    avisoAte = 0;
    som.tocar("inicio");
    atualizarUI();
  }


  function abrirConfirmacaoReinicio() {
    if (typeof dialogoReiniciar.showModal === "function") {
      if (!dialogoReiniciar.open) dialogoReiniciar.showModal();
    } else dialogoReiniciar.setAttribute("open", "");
  }

  function fecharConfirmacaoReinicio() {
    if (typeof dialogoReiniciar.close === "function") dialogoReiniciar.close();
    else dialogoReiniciar.removeAttribute("open");
  }

  function posicao(evento) {
    const r = canvas.getBoundingClientRect();
    return { x: (evento.clientX - r.left) * C.LARGURA / r.width, y: (evento.clientY - r.top) * C.ALTURA / r.height };
  }

  function plataformaEm(ponto) {
    let achada = null;
    let menor = 44;
    for (const p of C.PLATAFORMAS) {
      const d = C.distancia(ponto, p);
      if (d < menor) {
        achada = p;
        menor = d;
      }
    }
    return achada;
  }

  canvas.addEventListener("pointermove", (evento) => {
    const p = plataformaEm(posicao(evento));
    plataformaSobMouse = p ? p.id : null;
  });
  canvas.addEventListener("pointerleave", () => { plataformaSobMouse = null; });
  canvas.addEventListener("contextmenu", (evento) => evento.preventDefault());
  canvas.addEventListener("pointerdown", (evento) => {
    if (!pronto || estado.fase === "vitoria" || estado.fase === "derrota") return;
    evento.preventDefault();
    canvas.focus({ preventScroll: true });
    const p = plataformaEm(posicao(evento));
    if (!p) {
      plataformaSelecionada = null;
      atualizarUI();
      return;
    }
    if (C.torreNa(estado, p.id)) {
      plataformaSelecionada = p.id;
      som.tocar("selecionar");
    } else if (!tipoEscolhido) {
      plataformaSelecionada = null;
    } else if (C.construir(estado, p.id, tipoEscolhido)) {
      plataformaSelecionada = p.id;
    } else {
      avisar(`Moedas insuficientes para ${C.TORRES[tipoEscolhido].nome.toLowerCase()}.`);
      som.tocar("erro");
    }
    atualizarUI();
  });

  for (const botao of botoesTorre) botao.addEventListener("click", () => escolherTipo(botao.dataset.torre));
  botaoIniciar.addEventListener("click", () => {
    if (C.iniciarOnda(estado)) {
      plataformaSelecionada = null;
      atualizarUI();
    }
  });
  botaoPausar.addEventListener("click", () => {
    C.alternarPausa(estado);
    som.tocar("toque");
    atualizarUI();
  });
  botaoVelocidade.addEventListener("click", () => {
    velocidade = velocidade === 1 ? 2 : 1;
    som.tocar("toque");
    atualizarUI();
  });
  raiz.querySelector("#td-reiniciar").addEventListener("click", abrirConfirmacaoReinicio);
  raiz.querySelector("#td-cancelar-reinicio").addEventListener("click", fecharConfirmacaoReinicio);
  raiz.querySelector("#td-confirmar-reinicio-botao").addEventListener("click", () => {
    fecharConfirmacaoReinicio();
    reiniciar();
  });
  dialogoReiniciar.addEventListener("click", (evento) => {
    if (evento.target === dialogoReiniciar) fecharConfirmacaoReinicio();
  });
  botaoReparar.addEventListener("click", () => {
    if (C.reparar(estado, plataformaSelecionada)) atualizarUI();
    else {
      avisar("Não foi possível reparar: confira a vida da torre e suas moedas.");
      som.tocar("erro");
    }
  });
  botaoMelhorar.addEventListener("click", () => {
    if (C.melhorar(estado, plataformaSelecionada)) atualizarUI();
    else {
      avisar("Não foi possível melhorar: confira as moedas e o nível da torre.");
      som.tocar("erro");
    }
  });
  botaoVender.addEventListener("click", () => {
    C.vender(estado, plataformaSelecionada);
    plataformaSelecionada = null;
    atualizarUI();
  });

  if (!document.fullscreenEnabled) botaoTelaCheia.hidden = true;
  botaoTelaCheia.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await quadro.requestFullscreen();
    } catch (erro) { avisar("A tela cheia não está disponível neste navegador."); }
  });
  document.addEventListener("fullscreenchange", redimensionar);
  window.addEventListener("resize", redimensionar);

  raiz.addEventListener("keydown", (evento) => {
    if (evento.target.closest("button") || !pronto) return;
    const tecla = evento.key.toLowerCase();
    if (["1", "2", "3"].includes(tecla)) {
      escolherTipo(["metralhadora", "canhao", "artilharia"][Number(tecla) - 1]);
    } else if (tecla === " " && estado.fase === "preparacao" && !estado.pausado) {
      C.iniciarOnda(estado);
    } else if (tecla === "p") {
      C.alternarPausa(estado);
    } else if (tecla === "escape") {
      plataformaSelecionada = null;
      plataformaSobMouse = null;
    } else return;
    evento.preventDefault();
    atualizarUI();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && pronto && !estado.pausado && estado.fase !== "vitoria" && estado.fase !== "derrota") {
      estado.pausado = true;
      avisar("A partida foi pausada ao trocar de aba.");
      atualizarUI();
    }
  });

  function animar(agora) {
    const dt = Math.min(0.08, Math.max(0, (agora - ultimoQuadro) / 1000));
    ultimoQuadro = agora;
    if (pronto) C.avancar(estado, dt * velocidade);
    consumirEventos();
    atualizarUI();
    desenhar();
    requestAnimationFrame(animar);
  }

  Promise.all(NOMES.map((nome) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { imagens[nome] = img; resolve(); };
    img.onerror = () => reject(new Error(`Imagem não carregada: ${nome}`));
    img.src = `${PASTA}${nome}.webp`;
  }))).then(() => {
    pronto = true;
    estado.pausado = false;
    redimensionar();
    carregando.hidden = true;
    avisar(`Posicione suas defesas. A primeira onda começa em ${C.TEMPO_PREPARACAO} segundos.`);
    ultimoQuadro = performance.now();
  }).catch((erro) => {
    carregando.querySelector("span").hidden = true;
    carregando.querySelector("p").textContent = "Não foi possível carregar as imagens. Recarregue a página para tentar de novo.";
    mensagem.textContent = erro.message;
  });

  redimensionar();
  atualizarUI();
  requestAnimationFrame(animar);
})();
