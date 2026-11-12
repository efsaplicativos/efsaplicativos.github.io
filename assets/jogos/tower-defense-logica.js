"use strict";
/* Regras do Tower Defence Militar Web. Não usa DOM, rede ou armazenamento: a tela apenas avança o estado,
 * desenha o campo e consome os eventos. As coordenadas são do mapa lógico de 960 × 600. */
const LogicaTowerDefense = (() => {
  const LARGURA = 960;
  const ALTURA = 600;
  const TOTAL_ONDAS = 20;
  const TEMPO_PREPARACAO = 10;
  const CAMINHO = Object.freeze([
    { x: -40, y: 112 }, { x: 150, y: 112 }, { x: 150, y: 306 },
    { x: 382, y: 306 }, { x: 382, y: 128 }, { x: 610, y: 128 },
    { x: 610, y: 438 }, { x: 816, y: 438 }, { x: 816, y: 282 }, { x: 1000, y: 282 },
  ]);
  const CAMINHOS_AEREOS = Object.freeze({
    helicoptero: Object.freeze([
      { x: -70, y: 520 }, { x: 180, y: 500 }, { x: 400, y: 470 },
      { x: 610, y: 350 }, { x: 790, y: 170 }, { x: 1000, y: 282 },
    ]),
    aviao: Object.freeze([
      { x: -70, y: 65 }, { x: 170, y: 65 }, { x: 390, y: 210 },
      { x: 610, y: 65 }, { x: 790, y: 95 }, { x: 1000, y: 95 },
    ]),
  });
  const PLATAFORMAS = Object.freeze([
    { id: 1, x: 74, y: 220 }, { id: 2, x: 246, y: 196 }, { id: 3, x: 264, y: 402 },
    { id: 4, x: 476, y: 224 }, { id: 5, x: 500, y: 55 }, { id: 6, x: 708, y: 62 },
    { id: 7, x: 492, y: 370 }, { id: 8, x: 484, y: 526 }, { id: 9, x: 704, y: 334 },
    { id: 10, x: 714, y: 534 }, { id: 11, x: 896, y: 520 }, { id: 12, x: 902, y: 180 },
  ]);
  const TORRES = Object.freeze({
    metralhadora: Object.freeze({ id: "metralhadora", nome: "Metralhadora", custo: 80, alcance: 132, dano: 9, intervalo: 0.25, velocidade: 720, raio: 0, vida: 95, aereo: true }),
    canhao: Object.freeze({ id: "canhao", nome: "Canhão", custo: 120, alcance: 158, dano: 36, intervalo: 0.9, velocidade: 480, raio: 0, vida: 140, aereo: false }),
    artilharia: Object.freeze({ id: "artilharia", nome: "Artilharia", custo: 180, alcance: 198, dano: 92, intervalo: 2.15, velocidade: 360, raio: 64, vida: 115, aereo: true }),
  });
  const INIMIGOS = Object.freeze({
    leve: Object.freeze({ id: "leve", nome: "Tanque leve", vida: 76, velocidade: 57, recompensa: 15, danoBase: 1, tamanho: 49, danoTorre: 2, alcanceTorre: 100, intervaloTorre: 2.4, velocidadeProjetil: 420 }),
    rapido: Object.freeze({ id: "rapido", nome: "Batedor", vida: 62, velocidade: 91, recompensa: 17, danoBase: 1, tamanho: 44, danoTorre: 2, alcanceTorre: 95, intervaloTorre: 1.8, velocidadeProjetil: 480 }),
    pesado: Object.freeze({ id: "pesado", nome: "Tanque pesado", vida: 265, velocidade: 35, recompensa: 32, danoBase: 2, tamanho: 59, danoTorre: 6, alcanceTorre: 130, intervaloTorre: 2.8, velocidadeProjetil: 380 }),
    boss: Object.freeze({ id: "boss", nome: "Blindado de comando", vida: 1900, velocidade: 27, recompensa: 300, danoBase: 6, tamanho: 76, danoTorre: 16, alcanceTorre: 165, intervaloTorre: 1.8, velocidadeProjetil: 450 }),
    helicoptero: Object.freeze({ id: "helicoptero", nome: "Helicóptero", vida: 170, velocidade: 68, recompensa: 28, danoBase: 2, tamanho: 64, danoTorre: 5, alcanceTorre: 145, intervaloTorre: 2.1, velocidadeProjetil: 500, aereo: true }),
    aviao: Object.freeze({ id: "aviao", nome: "Avião", vida: 115, velocidade: 126, recompensa: 26, danoBase: 2, tamanho: 62, danoTorre: 4, alcanceTorre: 135, intervaloTorre: 2.0, velocidadeProjetil: 650, aereo: true }),
  });
  // Cada grupo vira uma fila com horário de entrada; grupos da mesma onda avançam juntos.
  const ONDAS = Object.freeze([
    [{ tipo: "leve", quantidade: 7, intervalo: 1.15 }],
    [{ tipo: "leve", quantidade: 11, intervalo: 0.95 }],
    [{ tipo: "leve", quantidade: 8, intervalo: 1.0 }, { tipo: "rapido", quantidade: 5, intervalo: 0.85, atraso: 2 }],
    [{ tipo: "leve", quantidade: 12, intervalo: 0.75 }, { tipo: "rapido", quantidade: 7, intervalo: 0.75, atraso: 3 }, { tipo: "helicoptero", quantidade: 2, intervalo: 2.2, atraso: 5 }],
    [{ tipo: "pesado", quantidade: 5, intervalo: 2.1 }, { tipo: "leve", quantidade: 12, intervalo: 0.7, atraso: 1 }],
    [{ tipo: "rapido", quantidade: 16, intervalo: 0.55 }, { tipo: "pesado", quantidade: 6, intervalo: 1.8, atraso: 2 }, { tipo: "helicoptero", quantidade: 2, intervalo: 2.1, atraso: 4 }, { tipo: "aviao", quantidade: 2, intervalo: 2.4, atraso: 7 }],
    [{ tipo: "leve", quantidade: 20, intervalo: 0.5 }, { tipo: "pesado", quantidade: 8, intervalo: 1.5, atraso: 2 }],
    [{ tipo: "rapido", quantidade: 22, intervalo: 0.45 }, { tipo: "pesado", quantidade: 9, intervalo: 1.35, atraso: 1 }, { tipo: "helicoptero", quantidade: 3, intervalo: 1.8, atraso: 3 }, { tipo: "aviao", quantidade: 3, intervalo: 2.0, atraso: 6 }],
    [{ tipo: "leve", quantidade: 22, intervalo: 0.42 }, { tipo: "rapido", quantidade: 18, intervalo: 0.48, atraso: 2 }, { tipo: "pesado", quantidade: 10, intervalo: 1.3, atraso: 4 }],
    [{ tipo: "boss", quantidade: 1, intervalo: 1 }, { tipo: "rapido", quantidade: 18, intervalo: 0.55, atraso: 3 }, { tipo: "pesado", quantidade: 10, intervalo: 1.4, atraso: 5 }, { tipo: "helicoptero", quantidade: 3, intervalo: 1.7, atraso: 4 }, { tipo: "aviao", quantidade: 3, intervalo: 1.8, atraso: 7 }],
    // Neve: formações mais numerosas e pesados mais frequentes.
    [{ tipo: "leve", quantidade: 18, intervalo: 0.38 }, { tipo: "rapido", quantidade: 18, intervalo: 0.4, atraso: 2 }, { tipo: "pesado", quantidade: 12, intervalo: 1.15, atraso: 4 }, { tipo: "helicoptero", quantidade: 3, intervalo: 1.6, atraso: 3 }, { tipo: "aviao", quantidade: 3, intervalo: 1.7, atraso: 6 }],
    [{ tipo: "rapido", quantidade: 26, intervalo: 0.36 }, { tipo: "pesado", quantidade: 14, intervalo: 1.0, atraso: 2 }, { tipo: "aviao", quantidade: 4, intervalo: 1.6, atraso: 5 }],
    [{ tipo: "leve", quantidade: 22, intervalo: 0.32 }, { tipo: "rapido", quantidade: 22, intervalo: 0.34, atraso: 2 }, { tipo: "pesado", quantidade: 16, intervalo: 0.9, atraso: 3 }, { tipo: "helicoptero", quantidade: 4, intervalo: 1.5, atraso: 4 }, { tipo: "aviao", quantidade: 4, intervalo: 1.5, atraso: 6 }],
    [{ tipo: "rapido", quantidade: 30, intervalo: 0.3 }, { tipo: "pesado", quantidade: 20, intervalo: 0.8, atraso: 2 }, { tipo: "aviao", quantidade: 5, intervalo: 1.4, atraso: 4 }],
    [{ tipo: "boss", quantidade: 1, intervalo: 1 }, { tipo: "rapido", quantidade: 20, intervalo: 0.34, atraso: 2 }, { tipo: "pesado", quantidade: 16, intervalo: 0.85, atraso: 4 }, { tipo: "helicoptero", quantidade: 4, intervalo: 1.4, atraso: 4 }, { tipo: "aviao", quantidade: 4, intervalo: 1.3, atraso: 6 }],
    // Vulcão: ondas longas, muitos blindados e dois comandantes na operação final.
    [{ tipo: "leve", quantidade: 24, intervalo: 0.28 }, { tipo: "rapido", quantidade: 24, intervalo: 0.3, atraso: 2 }, { tipo: "pesado", quantidade: 20, intervalo: 0.75, atraso: 3 }, { tipo: "helicoptero", quantidade: 5, intervalo: 1.3, atraso: 4 }, { tipo: "aviao", quantidade: 5, intervalo: 1.2, atraso: 6 }],
    [{ tipo: "rapido", quantidade: 32, intervalo: 0.27 }, { tipo: "pesado", quantidade: 22, intervalo: 0.7, atraso: 2 }, { tipo: "aviao", quantidade: 6, intervalo: 1.2, atraso: 4 }],
    [{ tipo: "leve", quantidade: 28, intervalo: 0.25 }, { tipo: "rapido", quantidade: 28, intervalo: 0.27, atraso: 2 }, { tipo: "pesado", quantidade: 24, intervalo: 0.65, atraso: 3 }, { tipo: "helicoptero", quantidade: 6, intervalo: 1.2, atraso: 4 }, { tipo: "aviao", quantidade: 6, intervalo: 1.1, atraso: 5 }],
    [{ tipo: "rapido", quantidade: 36, intervalo: 0.24 }, { tipo: "pesado", quantidade: 28, intervalo: 0.58, atraso: 2 }, { tipo: "helicoptero", quantidade: 6, intervalo: 1.1, atraso: 4 }, { tipo: "aviao", quantidade: 7, intervalo: 1.0, atraso: 5 }],
    [{ tipo: "boss", quantidade: 2, intervalo: 8 }, { tipo: "rapido", quantidade: 24, intervalo: 0.26, atraso: 3 }, { tipo: "pesado", quantidade: 24, intervalo: 0.6, atraso: 5 }, { tipo: "helicoptero", quantidade: 8, intervalo: 1.0, atraso: 4 }, { tipo: "aviao", quantidade: 8, intervalo: 0.9, atraso: 6 }],
  ]);
  const REGIOES = Object.freeze([
    Object.freeze({ id: "floresta", nome: "Floresta", terreno: "terreno", decoracao: "arvore", estrada: "#aa956a", borda: "#625a40" }),
    Object.freeze({ id: "deserto", nome: "Deserto", terreno: "terreno-deserto", decoracao: "decoracao-deserto", estrada: "#c29a5c", borda: "#77603d" }),
    Object.freeze({ id: "neve", nome: "Neve", terreno: "terreno-neve", decoracao: "decoracao-neve", estrada: "#9aa7aa", borda: "#596b70" }),
    Object.freeze({ id: "vulcao", nome: "Vulcão", terreno: "terreno-vulcao", decoracao: "decoracao-vulcao", estrada: "#75665c", borda: "#403a36" }),
  ]);
  const regiaoDaOnda = (onda) => REGIOES[Math.min(REGIOES.length - 1, Math.floor((Math.max(1, onda) - 1) / 5))];
  const escalaInimigo = (onda) => 1 + (onda - 1) * 0.075 + Math.max(0, onda - 10) * 0.04;
  const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const podeAtacar = (tipoTorre, tipoInimigo) => !INIMIGOS[tipoInimigo].aereo || TORRES[tipoTorre].aereo;
  const plataforma = (id) => PLATAFORMAS.find((p) => p.id === Number(id));
  const torreNa = (estado, id) => estado.torres.find((t) => t.plataforma === Number(id));
  const statsTorre = (torre) => {
    const base = TORRES[torre.tipo];
    const nivel = torre.nivel - 1;
    return { ...base, alcance: base.alcance * (1 + nivel * 0.08), dano: base.dano * (1 + nivel * 0.55), intervalo: base.intervalo * (1 - nivel * 0.08), vidaMaxima: base.vida * (1 + nivel * 0.35) };
  };
  const custoMelhoria = (torre) => torre.nivel >= 3 ? 0 : Math.round(TORRES[torre.tipo].custo * (0.7 + torre.nivel * 0.3));
  const valorVenda = (torre) => Math.floor(torre.investido * 0.7);

  function pontaCanhao(torre) {
    const frente = torre.tipo === "artilharia" ? 46 : 43;
    const lateral = torre.tipo === "metralhadora" ? (torre.disparos % 2 === 0 ? -7 : 7) : 0;
    const cosseno = Math.cos(torre.angulo);
    const seno = Math.sin(torre.angulo);
    return {
      x: torre.x + cosseno * frente - seno * lateral,
      y: torre.y + seno * frente + cosseno * lateral,
    };
  }

  function iniciar() {
    return {
      moedas: 330, vidas: 20, onda: 0, fase: "preparacao", pausado: false,
      preparacao: TEMPO_PREPARACAO, tempoOnda: 0, fila: [], torres: [], inimigos: [], projeteis: [], projeteisInimigos: [],
      efeitos: [], eventos: [], proximoId: 1, abates: 0, vazamentos: 0, torresPerdidas: 0,
    };
  }

  function evento(estado, tipo, dados = {}) {
    estado.eventos.push({ tipo, ...dados });
  }

  function construir(estado, plataformaId, tipo) {
    const p = plataforma(plataformaId);
    const definicao = TORRES[tipo];
    if (!p || !definicao || estado.fase === "vitoria" || estado.fase === "derrota") return false;
    if (torreNa(estado, p.id) || estado.moedas < definicao.custo) return false;
    estado.moedas -= definicao.custo;
    estado.torres.push({
      id: estado.proximoId++, plataforma: p.id, tipo, nivel: 1, investido: definicao.custo,
      x: p.x, y: p.y, recarga: 0, angulo: -Math.PI / 2, disparos: 0, vida: definicao.vida, reparoRecarga: 0,
    });
    evento(estado, "construir", { x: p.x, y: p.y });
    return true;
  }

  function melhorar(estado, plataformaId) {
    const torre = torreNa(estado, plataformaId);
    if (!torre || torre.nivel >= 3 || estado.fase === "vitoria" || estado.fase === "derrota") return false;
    const custo = custoMelhoria(torre);
    if (estado.moedas < custo) return false;
    estado.moedas -= custo;
    torre.investido += custo;
    const vidaAntes = statsTorre(torre).vidaMaxima;
    torre.nivel++;
    const vidaDepois = statsTorre(torre).vidaMaxima;
    torre.vida = Math.min(vidaDepois, torre.vida + vidaDepois - vidaAntes);
    evento(estado, "melhorar", { x: torre.x, y: torre.y });
    return true;
  }

  function custoReparo(torre) {
    const stats = statsTorre(torre);
    if (torre.vida >= stats.vidaMaxima) return 0;
    return Math.max(1, Math.ceil(TORRES[torre.tipo].custo * 0.65 * (1 - torre.vida / stats.vidaMaxima)));
  }

  function reparar(estado, plataformaId) {
    const torre = torreNa(estado, plataformaId);
    if (!torre || estado.fase === "vitoria" || estado.fase === "derrota") return false;
    const custo = custoReparo(torre);
    if (!custo || estado.moedas < custo || torre.reparoRecarga > 0) return false;
    estado.moedas -= custo;
    torre.vida = statsTorre(torre).vidaMaxima;
    torre.reparoRecarga = 10;
    evento(estado, "reparar", { x: torre.x, y: torre.y });
    return true;
  }

  function vender(estado, plataformaId) {
    const indice = estado.torres.findIndex((t) => t.plataforma === Number(plataformaId));
    if (indice < 0 || estado.fase === "vitoria" || estado.fase === "derrota") return 0;
    const torre = estado.torres[indice];
    const valor = valorVenda(torre);
    estado.moedas += valor;
    estado.torres.splice(indice, 1);
    evento(estado, "vender", { x: torre.x, y: torre.y });
    return valor;
  }

  function iniciarOnda(estado) {
    if (estado.fase !== "preparacao" || estado.onda >= TOTAL_ONDAS) return false;
    estado.onda++;
    estado.fase = "batalha";
    estado.tempoOnda = 0;
    estado.preparacao = 0;
    estado.fila = [];
    let ordem = 0;
    for (const grupo of ONDAS[estado.onda - 1]) {
      const atraso = grupo.atraso || 0;
      for (let i = 0; i < grupo.quantidade; i++) {
        estado.fila.push({ tipo: grupo.tipo, em: atraso + i * grupo.intervalo, ordem: ordem++ });
      }
    }
    estado.fila.sort((a, b) => a.em - b.em || a.ordem - b.ordem);
    evento(estado, "onda", { onda: estado.onda });
    return true;
  }

  function criarInimigo(estado, tipo) {
    const definicao = INIMIGOS[tipo];
    const escala = escalaInimigo(estado.onda);
    const caminho = definicao.aereo ? CAMINHOS_AEREOS[tipo] : CAMINHO;
    const inicio = caminho[0];
    const id = estado.proximoId++;
    estado.inimigos.push({
      id, tipo, x: inicio.x, y: inicio.y, segmento: 0,
      vida: Math.round(definicao.vida * escala), vidaMaxima: Math.round(definicao.vida * escala),
      velocidade: definicao.velocidade * (1 + (estado.onda - 1) * 0.012),
      recompensa: definicao.recompensa, danoBase: definicao.danoBase,
      danoTorre: definicao.danoTorre * (1 + (estado.onda - 1) * 0.025),
      recarga: 0.5 + (id % 5) * 0.15, angulo: 0, anguloTorre: 0, progresso: 0,
    });
    if (definicao.aereo) evento(estado, "aereoEntrou", { tipoInimigo: tipo });
  }

  function moverInimigos(estado, dt) {
    for (const inimigo of estado.inimigos) {
      const caminho = INIMIGOS[inimigo.tipo].aereo ? CAMINHOS_AEREOS[inimigo.tipo] : CAMINHO;
      let restante = inimigo.velocidade * dt;
      while (restante > 0 && inimigo.vida > 0) {
        const destino = caminho[inimigo.segmento + 1];
        if (!destino) {
          inimigo.vida = 0;
          estado.vidas = Math.max(0, estado.vidas - inimigo.danoBase);
          estado.vazamentos++;
          evento(estado, "vazou", { dano: inimigo.danoBase });
          if (estado.vidas === 0) {
            estado.fase = "derrota";
            evento(estado, "derrota");
          }
          break;
        }
        const dx = destino.x - inimigo.x;
        const dy = destino.y - inimigo.y;
        const dist = Math.hypot(dx, dy);
        inimigo.angulo = Math.atan2(dy, dx);
        if (dist <= restante) {
          inimigo.x = destino.x;
          inimigo.y = destino.y;
          inimigo.progresso += dist;
          inimigo.segmento++;
          restante -= dist;
        } else {
          inimigo.x += dx / dist * restante;
          inimigo.y += dy / dist * restante;
          inimigo.progresso += restante;
          restante = 0;
        }
      }
    }
    estado.inimigos = estado.inimigos.filter((i) => i.vida > 0);
  }

  function atingir(estado, inimigo, dano) {
    if (!inimigo || inimigo.vida <= 0) return;
    inimigo.vida -= dano;
    if (inimigo.vida > 0) return;
    estado.moedas += inimigo.recompensa;
    estado.abates++;
    estado.efeitos.push({ tipo: "explosao", x: inimigo.x, y: inimigo.y, tempo: 0, duracao: 0.24, raio: inimigo.tipo === "boss" ? 65 : 34 });
    estado.efeitos.push(INIMIGOS[inimigo.tipo].aereo ? {
      tipo: "destrocosAereos", tipoInimigo: inimigo.tipo, x: inimigo.x, y: inimigo.y,
      angulo: inimigo.angulo, lado: inimigo.id % 2 ? 1 : -1, tempo: 0, duracao: 1.4,
      raio: INIMIGOS[inimigo.tipo].tamanho,
    } : {
      tipo: "destrocos", tipoInimigo: inimigo.tipo, x: inimigo.x, y: inimigo.y,
      angulo: inimigo.angulo, lado: inimigo.id % 2 ? 1 : -1, tempo: 0, duracao: 5.5,
      raio: INIMIGOS[inimigo.tipo].tamanho,
    });
    evento(estado, "abate", { tipoInimigo: inimigo.tipo });
  }

  function atualizarTorres(estado, dt) {
    for (const torre of estado.torres) {
      const stats = statsTorre(torre);
      torre.recarga = Math.max(0, torre.recarga - dt);
      let alvo = null;
      for (const inimigo of estado.inimigos) {
        if (inimigo.vida <= 0 || !podeAtacar(torre.tipo, inimigo.tipo) || distancia(torre, inimigo) > stats.alcance) continue;
        const aereo = INIMIGOS[inimigo.tipo].aereo ? 1 : 0;
        const aereoAlvo = alvo && INIMIGOS[alvo.tipo].aereo ? 1 : 0;
        if (!alvo || aereo > aereoAlvo || (aereo === aereoAlvo && inimigo.progresso > alvo.progresso)) alvo = inimigo;
      }
      if (!alvo) continue;
      torre.angulo = Math.atan2(alvo.y - torre.y, alvo.x - torre.x);
      if (torre.recarga > 0) continue;
      torre.recarga = stats.intervalo;
      const origem = pontaCanhao(torre);
      torre.disparos++;
      estado.projeteis.push({
        id: estado.proximoId++, alvo: alvo.id, x: origem.x, y: origem.y,
        velocidade: stats.velocidade, dano: stats.dano, raio: stats.raio, tipo: torre.tipo,
      });
      evento(estado, "tiro", { tipoTorre: torre.tipo });
    }
  }

  function atualizarProjeteis(estado, dt) {
    for (let i = estado.projeteis.length - 1; i >= 0; i--) {
      const projetil = estado.projeteis[i];
      const alvo = estado.inimigos.find((inimigo) => inimigo.id === projetil.alvo && inimigo.vida > 0);
      if (!alvo) {
        estado.projeteis.splice(i, 1);
        continue;
      }
      const dx = alvo.x - projetil.x;
      const dy = alvo.y - projetil.y;
      const dist = Math.hypot(dx, dy);
      const passo = projetil.velocidade * dt;
      if (dist > passo + 8) {
        projetil.x += dx / dist * passo;
        projetil.y += dy / dist * passo;
        continue;
      }
      projetil.x = alvo.x;
      projetil.y = alvo.y;
      atingir(estado, alvo, projetil.dano);
      if (projetil.raio > 0) {
        for (const outro of [...estado.inimigos]) {
          if (outro !== alvo && outro.vida > 0 && distancia(alvo, outro) <= projetil.raio) atingir(estado, outro, projetil.dano * 0.65);
        }
        estado.efeitos.push({ tipo: "impacto", x: alvo.x, y: alvo.y, tempo: 0, duracao: 0.3, raio: projetil.raio });
      }
      estado.projeteis.splice(i, 1);
    }
    estado.inimigos = estado.inimigos.filter((inimigo) => inimigo.vida > 0);
  }

  function atingirTorre(estado, torre, dano) {
    if (!torre || torre.vida <= 0) return;
    torre.vida -= dano;
    if (torre.vida > 0) return;
    const indice = estado.torres.findIndex((item) => item.id === torre.id);
    if (indice >= 0) estado.torres.splice(indice, 1);
    estado.torresPerdidas++;
    estado.efeitos.push({ tipo: "explosao", x: torre.x, y: torre.y, tempo: 0, duracao: 0.24, raio: 40 });
    estado.efeitos.push({
      tipo: "destrocos", tipoInimigo: torre.tipo, aliado: true, x: torre.x, y: torre.y,
      angulo: torre.angulo, lado: torre.id % 2 ? 1 : -1, tempo: 0, duracao: 5.5, raio: 59,
    });
    evento(estado, "torreDestruida", { tipoTorre: torre.tipo, plataforma: torre.plataforma });
  }

  function alvoTorre(estado, inimigo) {
    const definicao = INIMIGOS[inimigo.tipo];
    const candidatas = estado.torres.filter((torre) => distancia(inimigo, torre) <= definicao.alcanceTorre);
    if (!candidatas.length) return null;
    if (inimigo.tipo === "boss") {
      candidatas.sort((a, b) => b.nivel - a.nivel || distancia(inimigo, a) - distancia(inimigo, b));
      // Dois chefes distribuem o ataque entre as três principais defesas, sem foco instantâneo no mesmo alvo.
      return candidatas[inimigo.id % Math.min(3, candidatas.length)];
    }
    return candidatas.reduce((maisPerto, torre) => distancia(inimigo, torre) < distancia(inimigo, maisPerto) ? torre : maisPerto);
  }

  function atualizarAtaquesInimigos(estado, dt) {
    for (const inimigo of estado.inimigos) {
      const definicao = INIMIGOS[inimigo.tipo];
      inimigo.recarga = Math.max(0, inimigo.recarga - dt);
      if (estado.onda < 3) {
        inimigo.anguloTorre = inimigo.angulo;
        continue;
      }
      const alvo = alvoTorre(estado, inimigo);
      if (!alvo) {
        inimigo.anguloTorre = inimigo.angulo;
        continue;
      }
      const angulo = Math.atan2(alvo.y - inimigo.y, alvo.x - inimigo.x);
      inimigo.anguloTorre = angulo;
      if (inimigo.recarga > 0) continue;
      inimigo.recarga = definicao.intervaloTorre;
      const escalaTorre = inimigo.tipo === "rapido" ? 1.53 : 1;
      const frente = definicao.tamanho * 0.68 * escalaTorre;
      estado.projeteisInimigos.push({
        id: estado.proximoId++, alvoTorre: alvo.id,
        x: inimigo.x + Math.cos(angulo) * frente, y: inimigo.y + Math.sin(angulo) * frente,
        velocidade: definicao.velocidadeProjetil, dano: inimigo.danoTorre, tipo: inimigo.tipo,
      });
      evento(estado, "tiroInimigo", { tipoInimigo: inimigo.tipo });
    }
  }

  function atualizarProjeteisInimigos(estado, dt) {
    for (let i = estado.projeteisInimigos.length - 1; i >= 0; i--) {
      const projetil = estado.projeteisInimigos[i];
      const alvo = estado.torres.find((torre) => torre.id === projetil.alvoTorre);
      if (!alvo) {
        estado.projeteisInimigos.splice(i, 1);
        continue;
      }
      const dx = alvo.x - projetil.x;
      const dy = alvo.y - projetil.y;
      const dist = Math.hypot(dx, dy);
      const passo = projetil.velocidade * dt;
      if (dist > passo + 7) {
        projetil.x += dx / dist * passo;
        projetil.y += dy / dist * passo;
        continue;
      }
      estado.efeitos.push({ tipo: "impacto", x: alvo.x, y: alvo.y, tempo: 0, duracao: 0.18, raio: 20 });
      atingirTorre(estado, alvo, projetil.dano);
      estado.projeteisInimigos.splice(i, 1);
    }
  }

  function concluirSePreciso(estado) {
    if (estado.fase !== "batalha" || estado.fila.length || estado.inimigos.length) return;
    estado.projeteis = [];
    estado.projeteisInimigos = [];
    if (estado.onda === TOTAL_ONDAS) {
      estado.fase = "vitoria";
      evento(estado, "vitoria");
      return;
    }
    const premio = 45 + estado.onda * 10;
    estado.moedas += premio;
    estado.fase = "preparacao";
    estado.preparacao = TEMPO_PREPARACAO;
    evento(estado, "ondaConcluida", { premio });
  }

  function passo(estado, dt) {
    for (const torre of estado.torres) {
      const restante = Math.max(0, torre.reparoRecarga - dt);
      torre.reparoRecarga = restante < 0.000001 ? 0 : restante;
    }
    for (const efeito of estado.efeitos) efeito.tempo += dt;
    estado.efeitos = estado.efeitos.filter((efeito) => efeito.tempo < efeito.duracao);
    if (estado.fase === "preparacao") {
      estado.preparacao = Math.max(0, estado.preparacao - dt);
      if (estado.preparacao === 0) iniciarOnda(estado);
      return;
    }
    if (estado.fase !== "batalha") return;
    estado.tempoOnda += dt;
    while (estado.fila.length && estado.fila[0].em <= estado.tempoOnda) {
      criarInimigo(estado, estado.fila.shift().tipo);
    }
    moverInimigos(estado, dt);
    if (estado.fase === "derrota") return;
    atualizarProjeteis(estado, dt);
    atualizarProjeteisInimigos(estado, dt);
    atualizarTorres(estado, dt);
    atualizarAtaquesInimigos(estado, dt);
    concluirSePreciso(estado);
  }

  function avancar(estado, segundos) {
    if (estado.pausado || !Number.isFinite(segundos) || segundos <= 0) return estado;
    // Passos curtos evitam atravessar o alvo ou pular uma curva em uma aba mais lenta.
    let restante = Math.min(segundos, 1);
    while (restante > 0 && estado.fase !== "vitoria" && estado.fase !== "derrota") {
      const dt = Math.min(0.05, restante);
      passo(estado, dt);
      restante -= dt;
    }
    return estado;
  }

  function alternarPausa(estado) {
    if (estado.fase === "vitoria" || estado.fase === "derrota") return estado.pausado;
    estado.pausado = !estado.pausado;
    return estado.pausado;
  }

  function composicao(onda) {
    if (onda < 1 || onda > TOTAL_ONDAS) return [];
    const totais = new Map();
    for (const grupo of ONDAS[onda - 1]) totais.set(grupo.tipo, (totais.get(grupo.tipo) || 0) + grupo.quantidade);
    return [...totais].map(([tipo, quantidade]) => ({ tipo, nome: INIMIGOS[tipo].nome, quantidade }));
  }

  return {
    LARGURA, ALTURA, TOTAL_ONDAS, TEMPO_PREPARACAO, CAMINHO, CAMINHOS_AEREOS, PLATAFORMAS, TORRES, INIMIGOS, ONDAS, REGIOES,
    podeAtacar,
    regiaoDaOnda, escalaInimigo,
    iniciar, avancar, iniciarOnda, alternarPausa, construir, melhorar, vender, reparar,
    statsTorre, custoMelhoria, custoReparo, valorVenda, pontaCanhao, atingirTorre,
    torreNa, plataforma, composicao, distancia,
  };
})();

if (typeof module === "object") module.exports = LogicaTowerDefense;
