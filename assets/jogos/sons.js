"use strict";
/* Efeitos sonoros dos jogos, sintetizados na hora com a Web Audio API: não há arquivo de áudio
   para baixar, e todos os sons são originais. Cada jogo cria o seu controle com
   Sons.criar("<slug>", raiz), toca com som.tocar("<efeito>") e liga um botão com som.ligarBotao(). */
const Sons = (() => {
  // ---- Primitivas: tudo recebe o contexto e o destino, para dar para renderizar fora do ar ----

  const ruidos = new WeakMap();
  function bufferRuido(ctx) {
    let buffer = ruidos.get(ctx);
    if (!buffer) {
      buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const dados = buffer.getChannelData(0);
      for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
      ruidos.set(ctx, buffer);
    }
    return buffer;
  }

  // Volume que sobe rápido e cai em curva exponencial até sumir
  function envelope(ctx, t, vol, ataque, dur) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  function tom(ctx, destino, t, { freq, ate = freq, tipo = "sine", dur = 0.15, vol = 0.2, ataque = 0.004, filtro = 0 }) {
    const osc = ctx.createOscillator();
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, t);
    if (ate !== freq) osc.frequency.exponentialRampToValueAtTime(ate, t + dur);
    const g = envelope(ctx, t, vol, ataque, dur);
    if (filtro) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = filtro;
      osc.connect(f);
      f.connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(destino);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  function ruido(ctx, destino, t, { dur = 0.1, vol = 0.15, tipo = "bandpass", freq = 1500, ate = freq, q = 1, ataque = 0.003 }) {
    const fonte = ctx.createBufferSource();
    fonte.buffer = bufferRuido(ctx);
    const f = ctx.createBiquadFilter();
    f.type = tipo;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (ate !== freq) f.frequency.exponentialRampToValueAtTime(ate, t + dur);
    const g = envelope(ctx, t, vol, ataque, dur);
    fonte.connect(f);
    f.connect(g);
    g.connect(destino);
    fonte.start(t, Math.random() * 0.5);
    fonte.stop(t + dur + 0.03);
  }

  // Frequência da nota: 0 = lá 440 Hz, cada unidade é um semitom
  const nota = (semitons) => 440 * 2 ** (semitons / 12);
  const DO5 = nota(3);
  const MI5 = nota(7);
  const SOL5 = nota(10);
  const DO6 = nota(15);
  const MI6 = nota(19);
  const SOL6 = nota(22);

  // ---- Efeitos: (ctx, destino, t, opção) ----
  const EFEITOS = {
    // Toque leve em botão, peça ou tubo escolhido
    toque(c, d, t) {
      tom(c, d, t, { freq: 880, ate: 660, tipo: "triangle", dur: 0.05, vol: 0.14 });
    },
    // Peça escolhida (mahjong, xadrez): clique de madeira mais encorpado
    selecionar(c, d, t) {
      tom(c, d, t, { freq: 760, ate: 560, tipo: "triangle", dur: 0.06, vol: 0.16 });
      ruido(c, d, t, { dur: 0.025, vol: 0.06, freq: 3200, q: 3 });
    },
    // Casa aberta (campo minado)
    abrir(c, d, t) {
      tom(c, d, t, { freq: 520, ate: 820, dur: 0.07, vol: 0.18 });
      ruido(c, d, t, { dur: 0.03, vol: 0.05, freq: 3000, q: 2 });
    },
    // Muitas casas abertas de uma vez
    cascata(c, d, t) {
      for (let i = 0; i < 5; i++) {
        const f = 480 * 1.16 ** i;
        tom(c, d, t + i * 0.035, { freq: f, ate: f * 1.5, dur: 0.07, vol: 0.12 });
      }
      ruido(c, d, t, { dur: 0.22, vol: 0.06, freq: 1200, ate: 4500, q: 0.8 });
    },
    bandeira(c, d, t) {
      tom(c, d, t, { freq: 660, tipo: "square", dur: 0.06, vol: 0.11, filtro: 2200 });
      tom(c, d, t + 0.06, { freq: 990, tipo: "square", dur: 0.1, vol: 0.11, filtro: 2200 });
    },
    tirarBandeira(c, d, t) {
      tom(c, d, t, { freq: 990, tipo: "square", dur: 0.06, vol: 0.1, filtro: 2200 });
      tom(c, d, t + 0.06, { freq: 600, tipo: "square", dur: 0.09, vol: 0.1, filtro: 2200 });
    },
    explosao(c, d, t) {
      ruido(c, d, t, { dur: 1.1, vol: 0.3, tipo: "lowpass", freq: 2200, ate: 90, q: 0.4, ataque: 0.002 });
      tom(c, d, t, { freq: 130, ate: 34, dur: 0.8, vol: 0.28 });
      ruido(c, d, t, { dur: 0.15, vol: 0.14, tipo: "highpass", freq: 2600, q: 0.5 });
    },
    // Fim de partida
    vitoria(c, d, t) {
      [DO5, MI5, SOL5].forEach((f, i) => tom(c, d, t + i * 0.11, { freq: f, tipo: "triangle", dur: 0.16, vol: 0.18 }));
      tom(c, d, t + 0.33, { freq: DO6, tipo: "triangle", dur: 0.6, vol: 0.2 });
      tom(c, d, t + 0.33, { freq: MI6, dur: 0.6, vol: 0.07 });
      tom(c, d, t + 0.33, { freq: SOL6, dur: 0.5, vol: 0.05 });
    },
    derrota(c, d, t) {
      [nota(10), nota(6)].forEach((f, i) => tom(c, d, t + i * 0.2, { freq: f, tipo: "sawtooth", dur: 0.22, vol: 0.16, filtro: 1100 }));
      tom(c, d, t + 0.4, { freq: nota(3), ate: nota(1), tipo: "sawtooth", dur: 0.7, vol: 0.18, filtro: 900 });
    },
    // Jogada errada ou resposta errada
    erro(c, d, t) {
      tom(c, d, t, { freq: 170, ate: 140, tipo: "sawtooth", dur: 0.2, vol: 0.13, filtro: 800 });
      tom(c, d, t, { freq: 85, dur: 0.18, vol: 0.12 });
    },
    // Acerto, par encontrado, resposta certa
    acerto(c, d, t) {
      tom(c, d, t, { freq: MI6, dur: 0.18, vol: 0.15 });
      tom(c, d, t + 0.08, { freq: nota(24), dur: 0.35, vol: 0.14 });
      tom(c, d, t + 0.08, { freq: nota(36), dur: 0.2, vol: 0.03 });
    },
    // Carta virada
    virar(c, d, t) {
      ruido(c, d, t, { dur: 0.07, vol: 0.35, freq: 2400, ate: 5000, q: 1.2 });
      tom(c, d, t, { freq: 300, ate: 440, dur: 0.05, vol: 0.05 });
    },
    // Peça ou bloco deslizando
    deslizar(c, d, t) {
      ruido(c, d, t, { dur: 0.1, vol: 0.45, freq: 500, ate: 1600, q: 0.9 });
    },
    // Blocos que se juntam (2048): quanto maior o nível, mais aguda a nota
    juntar(c, d, t, nivel = 1) {
      const f = 262 * 2 ** ((Math.min(Math.max(nivel, 1), 16) - 1) / 6);
      tom(c, d, t, { freq: f, ate: f * 1.5, dur: 0.12, vol: 0.18 });
      tom(c, d, t, { freq: f * 2, tipo: "triangle", dur: 0.08, vol: 0.05 });
    },
    // Peça colocada no tabuleiro (jogo da velha, xadrez)
    peca(c, d, t) {
      tom(c, d, t, { freq: 420, ate: 240, dur: 0.1, vol: 0.24 });
      ruido(c, d, t, { dur: 0.025, vol: 0.12, freq: 1800, q: 3 });
    },
    // A segunda peça do jogo da velha tem outro timbre, para dar para distinguir de ouvido
    peca2(c, d, t) {
      tom(c, d, t, { freq: 330, ate: 190, dur: 0.11, vol: 0.24 });
      ruido(c, d, t, { dur: 0.025, vol: 0.1, freq: 1300, q: 3 });
    },
    captura(c, d, t) {
      tom(c, d, t, { freq: 320, ate: 150, dur: 0.15, vol: 0.28 });
      ruido(c, d, t, { dur: 0.05, vol: 0.22, freq: 1200, q: 1.5 });
      tom(c, d, t + 0.05, { freq: 520, ate: 300, dur: 0.08, vol: 0.14 });
    },
    xeque(c, d, t) {
      tom(c, d, t, { freq: nota(14), tipo: "triangle", dur: 0.09, vol: 0.15 });
      tom(c, d, t + 0.12, { freq: nota(14), tipo: "triangle", dur: 0.12, vol: 0.15 });
    },
    // Bolas passando de um tubo para outro
    despejar(c, d, t, quantidade = 1) {
      const n = Math.min(Math.max(quantidade, 1), 4) + 2;
      for (let i = 0; i < n; i++) {
        const f = 420 + i * 70 + Math.random() * 40;
        tom(c, d, t + i * 0.05, { freq: f, ate: f * 1.9, dur: 0.055, vol: 0.11 });
      }
    },
    // Tubo de uma cor só, grupo completo
    completo(c, d, t) {
      [SOL6, nota(26), nota(29)].forEach((f, i) => tom(c, d, t + i * 0.06, { freq: f, dur: 0.22, vol: 0.1 }));
    },
    // Peça girada (blocos que caem)
    girar(c, d, t) {
      tom(c, d, t, { freq: 700, ate: 950, tipo: "triangle", dur: 0.045, vol: 0.1 });
    },
    // Peça que encaixa no fundo
    pousar(c, d, t) {
      tom(c, d, t, { freq: 170, ate: 90, dur: 0.09, vol: 0.22 });
      ruido(c, d, t, { dur: 0.04, vol: 0.09, tipo: "lowpass", freq: 900 });
    },
    // Queda direta até o fundo
    queda(c, d, t) {
      ruido(c, d, t, { dur: 0.08, vol: 0.1, freq: 2500, ate: 500, q: 0.8 });
      tom(c, d, t + 0.06, { freq: 140, ate: 60, dur: 0.14, vol: 0.3 });
    },
    // Linhas completas: uma subida e um brilho por linha
    linha(c, d, t, linhas = 1) {
      const n = Math.min(Math.max(linhas, 1), 4);
      tom(c, d, t, { freq: 380, ate: 900 + n * 300, tipo: "sawtooth", dur: 0.22, vol: 0.07, filtro: 2600 });
      for (let i = 0; i < n; i++) tom(c, d, t + 0.08 + i * 0.06, { freq: nota(22 + i * 3), dur: 0.2, vol: 0.1 });
    },
    // Subiu de nível
    nivel(c, d, t) {
      [SOL5, DO6, MI6].forEach((f, i) => tom(c, d, t + i * 0.08, { freq: f, tipo: "square", dur: 0.09, vol: 0.11, filtro: 3000 }));
      tom(c, d, t + 0.24, { freq: SOL6, tipo: "square", dur: 0.32, vol: 0.12, filtro: 3000 });
    },
    dica(c, d, t) {
      tom(c, d, t, { freq: nota(24), dur: 0.2, vol: 0.1 });
      tom(c, d, t + 0.1, { freq: nota(29), dur: 0.3, vol: 0.09 });
      ruido(c, d, t, { dur: 0.3, vol: 0.03, tipo: "highpass", freq: 6000 });
    },
    desfazer(c, d, t) {
      tom(c, d, t, { freq: 720, ate: 380, tipo: "triangle", dur: 0.11, vol: 0.12 });
    },
    embaralhar(c, d, t) {
      for (let i = 0; i < 7; i++) {
        ruido(c, d, t + i * 0.045, { dur: 0.035, vol: 0.45, freq: 1800 + Math.random() * 1800, q: 2 });
      }
    },
    // Número escrito na casa (sudoku)
    numero(c, d, t) {
      tom(c, d, t, { freq: 640, ate: 560, dur: 0.07, vol: 0.18 });
      ruido(c, d, t, { dur: 0.02, vol: 0.05, freq: 3500, q: 3 });
    },
    // Anotação a lápis (sudoku)
    anotar(c, d, t) {
      ruido(c, d, t, { dur: 0.04, vol: 0.36, freq: 4200, q: 4 });
    },
    apagar(c, d, t) {
      ruido(c, d, t, { dur: 0.09, vol: 0.3, freq: 2200, ate: 900, q: 1 });
    },
    // Partida nova
    inicio(c, d, t) {
      tom(c, d, t, { freq: DO5, tipo: "triangle", dur: 0.1, vol: 0.13 });
      tom(c, d, t + 0.09, { freq: SOL5, tipo: "triangle", dur: 0.16, vol: 0.13 });
    },
  };

  // ---- Saída de áudio ----

  let contexto = null;
  let saida = null;

  // O navegador só deixa tocar depois de um gesto da pessoa (toque, clique ou tecla)
  function preparar() {
    if (contexto) {
      if (contexto.state === "suspended") contexto.resume().catch(() => {});
      return contexto;
    }
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return null;
    try {
      contexto = new Contexto();
    } catch (e) {
      return null;
    }
    // Compressor para efeitos simultâneos não estourarem
    const compressor = contexto.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 6;
    saida = contexto.createGain();
    saida.gain.value = 0.85;
    saida.connect(compressor);
    compressor.connect(contexto.destination);
    return contexto;
  }

  function lerLigado(chave) {
    try {
      return localStorage.getItem(chave) !== "0";
    } catch (e) {
      return true;
    }
  }

  /** Controle de som de um jogo, com a preferência guardada em efs-<slug>-som. */
  function criar(slug, raiz) {
    const chave = `efs-${slug}-som`;
    let ligado = lerLigado(chave);
    const ultimos = new Map();
    const botoes = [];
    if (raiz) {
      for (const tipo of ["pointerdown", "keydown"]) raiz.addEventListener(tipo, () => ligado && preparar(), { capture: true });
    }

    function tocar(nome, opcao) {
      const efeito = EFEITOS[nome];
      if (!ligado || !efeito) return;
      const ctx = preparar();
      if (!ctx || !saida) return;
      // O mesmo efeito duas vezes em menos de 30 ms soaria como um só, mais alto
      const agora = ctx.currentTime;
      if (agora - (ultimos.get(nome) ?? -1) < 0.03) return;
      ultimos.set(nome, agora);
      try {
        efeito(ctx, saida, agora + 0.005, opcao);
      } catch (e) {
        /* sem som em caso de erro */
      }
    }

    function desenhar() {
      for (const botao of botoes) {
        botao.setAttribute("aria-pressed", String(ligado));
        botao.title = ligado ? "Som ligado" : "Som desligado";
      }
    }

    function alternar() {
      ligado = !ligado;
      try {
        localStorage.setItem(chave, ligado ? "1" : "0");
      } catch (e) {
        /* sem armazenamento: vale só nesta visita */
      }
      desenhar();
      if (ligado) tocar("toque");
    }

    /** Preenche um <button class="som-botao"> com o ícone e liga o clique. */
    function ligarBotao(botao) {
      if (!botao) return;
      botao.type = "button";
      botao.classList.add("som-botao");
      botao.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
        '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>' +
        '<path class="som-ondas" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '<path class="som-mudo" d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        "</svg><span>Som</span>";
      botao.addEventListener("click", alternar);
      botoes.push(botao);
      desenhar();
    }

    return {
      tocar,
      alternar,
      ligarBotao,
      get ligado() {
        return ligado;
      },
    };
  }

  /** Renderiza um efeito sem tocar (para testes e para conferir volume e duração). */
  function renderizar(nome, opcao, segundos = 1.6, taxa = 44100) {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Offline(1, Math.ceil(segundos * taxa), taxa);
    EFEITOS[nome](ctx, ctx.destination, 0, opcao);
    return ctx.startRendering();
  }

  return { criar, renderizar, EFEITOS: Object.keys(EFEITOS) };
})();

if (typeof module === "object") module.exports = Sons;
