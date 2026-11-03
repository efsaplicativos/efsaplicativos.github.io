"use strict";
/*
 * 2048 com as mesmas regras de logica/Regras2048.kt e Motor2048 do app 2048: Block Merge.
 * Cada bloco se junta no máximo uma vez por jogada, os pares mais próximos da borda de destino
 * se juntam primeiro ([2,2,2,2] → [4,4,0,0]) e o bloco novo é 2 (90%) ou 4 (10%).
 * A partida e o recorde ficam no localStorage.
 */
(() => {
  const tabuleiro = document.querySelector("#tabuleiro");
  if (!tabuleiro) return;

  const TAMANHO = 4;
  const VITORIA = 2048;
  const DURACAO_MS = 110;
  const TRAVA_AVISO_MS = 600;
  const DESLIZE_MINIMO_PX = 24;
  const CHAVE_PARTIDA = "efs-2048-partida";
  const CHAVE_RECORDE = "efs-2048-recorde";

  const camada = tabuleiro.querySelector(".board-tiles");
  const aviso = document.querySelector("#aviso");
  const avisoTexto = document.querySelector("#aviso-texto");
  const avisoBotoes = document.querySelector("#aviso-botoes");
  const textoPontos = document.querySelector("#pontos");
  const textoRecorde = document.querySelector("#recorde");
  const status = document.querySelector("#status-jogo");
  const botaoNovo = document.querySelector("#novo-jogo");

  /** { pecas: [{ id, valor, linha, coluna }], proximoId, pontos, venceu, fim } */
  let estado;
  let recorde = 0;
  const elementos = new Map();

  // ---------- Regras ----------

  /** Casa [linha, coluna] do passo-ésimo lugar de uma faixa, contado a partir da borda de destino. */
  function posicao(direcao, faixa, passo) {
    switch (direcao) {
      case "esquerda":
        return [faixa, passo];
      case "direita":
        return [faixa, TAMANHO - 1 - passo];
      case "cima":
        return [passo, faixa];
      default:
        return [TAMANHO - 1 - passo, faixa];
    }
  }

  function deslizar(pecas, direcao) {
    const grade = new Array(TAMANHO * TAMANHO).fill(null);
    for (const peca of pecas) grade[peca.linha * TAMANHO + peca.coluna] = peca;

    const resultado = [];
    const absorvidas = [];
    const unidas = new Set();
    let pontos = 0;
    let moveu = false;

    for (let faixa = 0; faixa < TAMANHO; faixa++) {
      const posicoes = Array.from({ length: TAMANHO }, (_, passo) => posicao(direcao, faixa, passo));
      const naFaixa = posicoes.map(([l, c]) => grade[l * TAMANHO + c]).filter(Boolean);
      let destino = 0;
      for (let i = 0; i < naFaixa.length; destino++) {
        const atual = naFaixa[i];
        const seguinte = naFaixa[i + 1];
        const [linha, coluna] = posicoes[destino];
        if (seguinte && seguinte.valor === atual.valor) {
          resultado.push({ ...atual, valor: atual.valor * 2, linha, coluna });
          absorvidas.push({ ...seguinte, linha, coluna });
          unidas.add(atual.id);
          pontos += atual.valor * 2;
          moveu = true;
          i += 2;
        } else {
          if (atual.linha !== linha || atual.coluna !== coluna) moveu = true;
          resultado.push({ ...atual, linha, coluna });
          i++;
        }
      }
    }
    return { pecas: resultado, absorvidas, unidas, pontos, moveu };
  }

  /** Ainda há jogada: alguma casa vazia ou dois blocos iguais lado a lado. */
  function temMovimento(pecas) {
    if (pecas.length < TAMANHO * TAMANHO) return true;
    const grade = new Array(TAMANHO * TAMANHO).fill(0);
    for (const peca of pecas) grade[peca.linha * TAMANHO + peca.coluna] = peca.valor;
    for (let l = 0; l < TAMANHO; l++) {
      for (let c = 0; c < TAMANHO; c++) {
        const valor = grade[l * TAMANHO + c];
        if (c + 1 < TAMANHO && grade[l * TAMANHO + c + 1] === valor) return true;
        if (l + 1 < TAMANHO && grade[(l + 1) * TAMANHO + c] === valor) return true;
      }
    }
    return false;
  }

  /** Bloco 2 (90%) ou 4 (10%) numa casa vazia sorteada. */
  function sortear(pecas, id) {
    const ocupadas = new Set(pecas.map((p) => p.linha * TAMANHO + p.coluna));
    const livres = [];
    for (let casa = 0; casa < TAMANHO * TAMANHO; casa++) if (!ocupadas.has(casa)) livres.push(casa);
    if (!livres.length) return null;
    const casa = livres[Math.floor(Math.random() * livres.length)];
    const valor = Math.random() < 0.1 ? 4 : 2;
    return { id, valor, linha: Math.floor(casa / TAMANHO), coluna: casa % TAMANHO };
  }

  function novoEstado() {
    const primeira = sortear([], 1);
    const segunda = sortear([primeira], 2);
    return { pecas: [primeira, segunda], proximoId: 3, pontos: 0, venceu: false, fim: false };
  }

  // ---------- Armazenamento ----------

  function carregar() {
    try {
      recorde = Number(localStorage.getItem(CHAVE_RECORDE)) || 0;
      const salvo = JSON.parse(localStorage.getItem(CHAVE_PARTIDA));
      const valido =
        salvo &&
        Array.isArray(salvo.pecas) &&
        salvo.pecas.length > 0 &&
        salvo.pecas.every(
          (p) =>
            Number.isInteger(p.id) &&
            Number.isInteger(p.valor) &&
            p.linha >= 0 &&
            p.linha < TAMANHO &&
            p.coluna >= 0 &&
            p.coluna < TAMANHO,
        );
      if (valido) return salvo;
    } catch (error) {
      /* Sem armazenamento ou partida corrompida: começa uma nova. */
    }
    return null;
  }

  function salvar() {
    try {
      localStorage.setItem(CHAVE_PARTIDA, JSON.stringify(estado));
      localStorage.setItem(CHAVE_RECORDE, String(recorde));
    } catch (error) {
      /* Armazenamento indisponível: a partida vale só enquanto a página estiver aberta. */
    }
  }

  // ---------- Desenho ----------

  function elementoDe(peca) {
    let el = elementos.get(peca.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "tile new";
      elementos.set(peca.id, el);
      posicionar(el, peca);
      camada.append(el);
    }
    return el;
  }

  function posicionar(el, peca) {
    el.style.setProperty("--x", peca.coluna);
    el.style.setProperty("--y", peca.linha);
    el.dataset.valor = String(peca.valor);
    el.textContent = String(peca.valor);
    const digitos = String(peca.valor).length;
    el.style.setProperty("--fs", digitos <= 2 ? 12 : digitos === 3 ? 10 : digitos === 4 ? 8 : 6.5);
  }

  function desenhar(absorvidas = [], unidas = new Set()) {
    // Os blocos absorvidos deslizam até o bloco que os absorveu e só então somem
    for (const peca of absorvidas) {
      const el = elementos.get(peca.id);
      if (!el) continue;
      el.classList.add("absorbed");
      el.classList.remove("new", "merged");
      el.style.setProperty("--x", peca.coluna);
      el.style.setProperty("--y", peca.linha);
      elementos.delete(peca.id);
      setTimeout(() => el.remove(), DURACAO_MS);
    }
    const vivas = new Set(estado.pecas.map((p) => p.id));
    for (const [id, el] of elementos) {
      if (!vivas.has(id)) {
        el.remove();
        elementos.delete(id);
      }
    }
    for (const peca of estado.pecas) {
      const nova = !elementos.has(peca.id);
      const el = elementoDe(peca);
      if (!nova) el.classList.remove("new");
      el.classList.remove("merged");
      posicionar(el, peca);
      if (unidas.has(peca.id)) {
        void el.offsetWidth; // reinicia a animação de junção
        el.classList.add("merged");
      }
    }
    textoPontos.textContent = estado.pontos.toLocaleString("pt-BR");
    textoRecorde.textContent = recorde.toLocaleString("pt-BR");
  }

  function mostrarAviso(texto, botoes) {
    avisoTexto.textContent = texto;
    avisoBotoes.replaceChildren(
      ...botoes.map(({ rotulo, acao, secundario }) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = secundario ? "button secondary" : "button";
        botao.textContent = rotulo;
        botao.addEventListener("click", acao);
        return botao;
      }),
    );
    aviso.hidden = false;
    aviso.classList.add("locked");
    setTimeout(() => aviso.classList.remove("locked"), TRAVA_AVISO_MS);
    status.textContent = texto;
  }

  function esconderAviso() {
    aviso.hidden = true;
    tabuleiro.focus({ preventScroll: true });
  }

  // ---------- Partida ----------

  function novaPartida() {
    for (const el of elementos.values()) el.remove();
    elementos.clear();
    camada.replaceChildren();
    estado = novoEstado();
    esconderAviso();
    desenhar();
    salvar();
  }

  function jogar(direcao) {
    if (!aviso.hidden || estado.fim) return;
    const deslize = deslizar(estado.pecas, direcao);
    if (!deslize.moveu) return;

    const nova = sortear(deslize.pecas, estado.proximoId);
    const pecas = nova ? [...deslize.pecas, nova] : deslize.pecas;
    const venceuAgora = !estado.venceu && pecas.some((p) => p.valor >= VITORIA);
    estado = {
      ...estado,
      pecas,
      proximoId: estado.proximoId + 1,
      pontos: estado.pontos + deslize.pontos,
      venceu: estado.venceu || venceuAgora,
      fim: !temMovimento(pecas),
    };
    recorde = Math.max(recorde, estado.pontos);
    desenhar(deslize.absorvidas, deslize.unidas);
    salvar();

    if (venceuAgora && !estado.fim) {
      mostrarAviso("Você chegou a 2048!", [
        { rotulo: "Continuar", acao: esconderAviso },
        { rotulo: "Novo jogo", acao: novaPartida, secundario: true },
      ]);
    } else if (estado.fim) {
      mostrarAviso(`Fim de jogo! ${estado.pontos.toLocaleString("pt-BR")} pontos`, [
        { rotulo: "Jogar de novo", acao: novaPartida },
      ]);
    }
  }

  // ---------- Controles ----------

  const TECLAS = {
    ArrowLeft: "esquerda",
    ArrowRight: "direita",
    ArrowUp: "cima",
    ArrowDown: "baixo",
    a: "esquerda",
    d: "direita",
    w: "cima",
    s: "baixo",
  };

  // As setas só movem os blocos com metade do tabuleiro na tela, para não atrapalhar a rolagem do texto
  function tabuleiroVisivel() {
    const area = tabuleiro.getBoundingClientRect();
    const visivel = Math.min(area.bottom, window.innerHeight) - Math.max(area.top, 0);
    return visivel >= area.height / 2;
  }

  document.addEventListener("keydown", (evento) => {
    if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
    if (evento.target.closest?.("input, textarea, select, [contenteditable]")) return;
    const direcao = TECLAS[evento.key] ?? TECLAS[evento.key?.toLowerCase()];
    if (!direcao || !aviso.hidden || !tabuleiroVisivel()) return;
    evento.preventDefault();
    jogar(direcao);
  });

  let inicio = null;
  tabuleiro.addEventListener("pointerdown", (evento) => {
    if (evento.target.closest("button")) return;
    inicio = { x: evento.clientX, y: evento.clientY, id: evento.pointerId };
    try {
      tabuleiro.setPointerCapture(evento.pointerId);
    } catch (error) {
      /* Sem captura, o gesto ainda conta se o dedo terminar sobre o tabuleiro. */
    }
  });
  tabuleiro.addEventListener("pointerup", (evento) => {
    if (!inicio || evento.pointerId !== inicio.id) return;
    const dx = evento.clientX - inicio.x;
    const dy = evento.clientY - inicio.y;
    inicio = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < DESLIZE_MINIMO_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) jogar(dx > 0 ? "direita" : "esquerda");
    else jogar(dy > 0 ? "baixo" : "cima");
  });
  tabuleiro.addEventListener("pointercancel", () => {
    inicio = null;
  });

  botaoNovo.addEventListener("click", () => {
    if (estado.fim || estado.pontos === 0) {
      novaPartida();
      return;
    }
    mostrarAviso("Começar um novo jogo?", [
      { rotulo: "Sim, começar", acao: novaPartida },
      { rotulo: "Voltar ao jogo", acao: esconderAviso, secundario: true },
    ]);
  });

  // ---------- Início ----------

  const salvo = carregar();
  if (salvo) {
    estado = {
      ...salvo,
      proximoId: Math.max(salvo.proximoId || 0, ...salvo.pecas.map((p) => p.id)) + 1,
      pontos: Number(salvo.pontos) || 0,
      fim: !temMovimento(salvo.pecas),
    };
    recorde = Math.max(recorde, estado.pontos);
  } else {
    estado = novoEstado();
  }
  desenhar();
  for (const el of elementos.values()) el.classList.remove("new");
  if (estado.fim) {
    mostrarAviso(`Fim de jogo! ${estado.pontos.toLocaleString("pt-BR")} pontos`, [
      { rotulo: "Jogar de novo", acao: novaPartida },
    ]);
  }
})();
