"use strict";
/* Regras e jogadas do computador da Batalha Naval, portadas do app em React Native
   (batalhanaval/src/utils/gameLogic.ts, constants/gameConstants.ts, hooks/useBattleshipGame.ts
   e services/gameStorage.ts). Tudo aqui é puro: recebe o estado e devolve um novo. */
const LogicaBatalhaNaval = (() => {
  const TAMANHO = 10;

  const NAVIOS = {
    carrier: { tipo: "carrier", nome: "Porta-aviões", tamanho: 5, cor: "#FF6B6B" },
    battleship: { tipo: "battleship", nome: "Encouraçado", tamanho: 4, cor: "#4ECDC4" },
    submarine: { tipo: "submarine", nome: "Submarino", tamanho: 3, cor: "#45B7D1" },
    destroyer: { tipo: "destroyer", nome: "Contratorpedeiro", tamanho: 3, cor: "#96CEB4" },
    patrol: { tipo: "patrol", nome: "Patrulha", tamanho: 2, cor: "#FFEAA7" },
  };
  const ORDEM = ["carrier", "battleship", "submarine", "destroyer", "patrol"];
  const DIFICULDADES = ["facil", "medio", "dificil"];

  const casa = (linha, coluna) => ({ linha, coluna });
  const dentro = (p) => p.linha >= 0 && p.linha < TAMANHO && p.coluna >= 0 && p.coluna < TAMANHO;

  // Cada casa: estado "agua", "navio", "acerto", "erro" ou "afundado", o tipo do navio que
  // está nela e se já levou tiro
  function tabuleiroVazio() {
    const grade = [];
    for (let l = 0; l < TAMANHO; l++) {
      const linha = [];
      for (let c = 0; c < TAMANHO; c++) linha.push({ estado: "agua", navio: null, revelada: false });
      grade.push(linha);
    }
    return { grade, navios: [] };
  }

  const atacada = (tab, p) => tab.grade[p.linha][p.coluna].revelada;

  function posicoesDoNavio(inicio, tipo, orientacao) {
    const posicoes = [];
    for (let i = 0; i < NAVIOS[tipo].tamanho; i++) {
      posicoes.push(orientacao === "vertical" ? casa(inicio.linha + i, inicio.coluna) : casa(inicio.linha, inicio.coluna + i));
    }
    return posicoes;
  }

  // Os navios podem encostar um no outro, mas não sair do tabuleiro nem se cruzar
  function podePosicionar(tab, posicoes) {
    return posicoes.every((p) => dentro(p) && tab.grade[p.linha][p.coluna].estado !== "navio");
  }

  function posicionar(tab, tipo, posicoes) {
    const grade = tab.grade.map((linha) => linha.slice());
    for (const p of posicoes) grade[p.linha][p.coluna] = { estado: "navio", navio: tipo, revelada: false };
    const navio = { tipo, tamanho: NAVIOS[tipo].tamanho, posicoes, acertos: 0, afundado: false };
    return { grade, navios: tab.navios.concat([navio]) };
  }

  /** Tiro numa casa. Quando o navio afunda, todas as casas dele viram "afundado". */
  function atacar(tab, p) {
    const atual = tab.grade[p.linha][p.coluna];
    if (atual.revelada) return { tabuleiro: tab, acerto: false, afundou: false, repetido: true };
    const grade = tab.grade.map((linha) => linha.slice());
    if (atual.estado !== "navio") {
      grade[p.linha][p.coluna] = { ...atual, estado: "erro", revelada: true };
      return { tabuleiro: { grade, navios: tab.navios }, acerto: false, afundou: false };
    }
    grade[p.linha][p.coluna] = { ...atual, estado: "acerto", revelada: true };
    const navios = tab.navios.map((n) => (n.tipo === atual.navio ? { ...n, acertos: n.acertos + 1 } : n));
    const navio = navios.find((n) => n.tipo === atual.navio);
    if (navio.acertos >= navio.tamanho) {
      navio.afundado = true;
      for (const q of navio.posicoes) grade[q.linha][q.coluna] = { ...grade[q.linha][q.coluna], estado: "afundado" };
      return { tabuleiro: { grade, navios }, acerto: true, afundou: true, tipo: navio.tipo };
    }
    return { tabuleiro: { grade, navios }, acerto: true, afundou: false, tipo: navio.tipo };
  }

  const todosAfundados = (tab) => tab.navios.length > 0 && tab.navios.every((n) => n.afundado);

  /** Frota do computador: cada navio numa casa e direção sorteadas até caber. */
  function tabuleiroAleatorio(aleatorio = Math.random) {
    // No app, um navio que não coubesse em 100 tentativas ficava de fora; aqui o sorteio
    // recomeça, para a frota sair sempre completa
    for (;;) {
      let tab = tabuleiroVazio();
      for (const tipo of ORDEM) {
        for (let tentativa = 0; tentativa < 100; tentativa++) {
          const inicio = casa(Math.floor(aleatorio() * TAMANHO), Math.floor(aleatorio() * TAMANHO));
          const posicoes = posicoesDoNavio(inicio, tipo, aleatorio() < 0.5 ? "horizontal" : "vertical");
          if (podePosicionar(tab, posicoes)) {
            tab = posicionar(tab, tipo, posicoes);
            break;
          }
        }
      }
      if (tab.navios.length === ORDEM.length) return tab;
    }
  }

  // ---- Computador ----

  /** O que o computador lembra entre um tiro e outro (lastAITarget, aiHuntMode etc. no app). */
  const cacaInicial = () => ({ ultimoAlvo: null, cacando: false, direcao: null, acertos: [] });

  function casaAleatoria(tab, aleatorio) {
    const livres = [];
    for (let l = 0; l < TAMANHO; l++) {
      for (let c = 0; c < TAMANHO; c++) if (!tab.grade[l][c].revelada) livres.push(casa(l, c));
    }
    return livres.length ? livres[Math.floor(aleatorio() * livres.length)] : casa(0, 0);
  }

  /** Direção do navio pelos acertos: todos na mesma linha (horizontal) ou na mesma coluna. */
  function orientacaoDosAcertos(acertos) {
    if (acertos.length < 2) return null;
    if (acertos.every((a) => a.linha === acertos[0].linha)) return "horizontal";
    if (acertos.every((a) => a.coluna === acertos[0].coluna)) return "vertical";
    return null;
  }

  function pontas(acertos, orientacao) {
    const valores = acertos.map((a) => (orientacao === "horizontal" ? a.coluna : a.linha)).sort((a, b) => a - b);
    return { min: valores[0], max: valores[valores.length - 1] };
  }

  /** Difícil: com dois acertos em linha, continua pelas pontas; com um, tenta os vizinhos. */
  function alvoInteligente(tab, acertos) {
    if (!acertos.length) return null;
    const orientacao = orientacaoDosAcertos(acertos);
    let candidatas;
    if (!orientacao) {
      const u = acertos[acertos.length - 1];
      candidatas = [casa(u.linha, u.coluna - 1), casa(u.linha, u.coluna + 1), casa(u.linha - 1, u.coluna), casa(u.linha + 1, u.coluna)];
    } else {
      const { min, max } = pontas(acertos, orientacao);
      const { linha, coluna } = acertos[0];
      candidatas = orientacao === "horizontal"
        ? [casa(linha, min - 1), casa(linha, max + 1)]
        : [casa(min - 1, coluna), casa(max + 1, coluna)];
    }
    return candidatas.find((p) => dentro(p) && !atacada(tab, p)) || null;
  }

  /** Médio: vizinhos do último acerto, primeiro na direção que ele está tentando. */
  function alvoCaca(tab, ultimo, direcao) {
    for (const d of direcao ? [direcao] : ["horizontal", "vertical"]) {
      const candidatas = d === "horizontal"
        ? [casa(ultimo.linha, ultimo.coluna - 1), casa(ultimo.linha, ultimo.coluna + 1)]
        : [casa(ultimo.linha - 1, ultimo.coluna), casa(ultimo.linha + 1, ultimo.coluna)];
      const alvo = candidatas.find((p) => dentro(p) && !atacada(tab, p));
      if (alvo) return alvo;
    }
    return null;
  }

  /** Onde o computador atira no tabuleiro do jogador. */
  function jogadaComputador(tab, caca, dificuldade, aleatorio = Math.random) {
    if (dificuldade === "dificil" && caca.cacando && caca.acertos.length) {
      const alvo = alvoInteligente(tab, caca.acertos);
      if (alvo) return alvo;
    }
    // Médio: em 60% das vezes procura ao lado do último acerto
    if (dificuldade === "medio" && caca.cacando && caca.ultimoAlvo && aleatorio() < 0.6) {
      const alvo = alvoCaca(tab, caca.ultimoAlvo, caca.direcao);
      if (alvo) return alvo;
    }
    // Fácil: sempre ao acaso
    return casaAleatoria(tab, aleatorio);
  }

  /** Atualiza a memória do computador depois do tiro dele. */
  function depoisDaJogada(caca, alvo, resultado, aleatorio = Math.random) {
    if (resultado.afundou) return cacaInicial();
    if (resultado.acerto) {
      return {
        ultimoAlvo: alvo,
        cacando: true,
        direcao: caca.direcao || (aleatorio() < 0.5 ? "horizontal" : "vertical"),
        acertos: caca.acertos.concat([alvo]),
      };
    }
    // Errou durante a caça: o médio passa a tentar a outra direção
    if (caca.cacando) return { ...caca, direcao: caca.direcao === "horizontal" ? "vertical" : "horizontal" };
    return caca;
  }

  // ---- Estatísticas ----

  const estatisticasVazias = () => ({ partidas: 0, vitorias: 0, derrotas: 0, mediaTiros: 0, melhor: 0 });

  /** Soma uma partida. A média de tiros conta todas as partidas, como no app. */
  function registrarPartida(est, venceu, tiros) {
    const partidas = est.partidas + 1;
    return {
      partidas,
      vitorias: est.vitorias + (venceu ? 1 : 0),
      derrotas: est.derrotas + (venceu ? 0 : 1),
      mediaTiros: Math.round((est.mediaTiros * est.partidas + tiros) / partidas),
      // Melhor partida: menos tiros numa vitória
      melhor: venceu && (est.melhor === 0 || tiros < est.melhor) ? tiros : est.melhor,
    };
  }

  const aproveitamento = (est) => (est.partidas ? est.vitorias / est.partidas : 0);

  /** Estatísticas lidas do navegador, ou zeradas se o conteúdo não for válido. */
  function lerEstatisticas(dados) {
    const inteiro = (v) => Number.isInteger(v) && v >= 0;
    if (!dados || typeof dados !== "object") return estatisticasVazias();
    const { partidas, vitorias, derrotas, mediaTiros, melhor } = dados;
    if (![partidas, vitorias, derrotas, mediaTiros, melhor].every(inteiro) || vitorias + derrotas !== partidas) {
      return estatisticasVazias();
    }
    return { partidas, vitorias, derrotas, mediaTiros, melhor };
  }

  /** "B7": letra da coluna e número da linha, para leitores de tela. */
  const nomeCasa = (p) => `${"ABCDEFGHIJ"[p.coluna]}${p.linha + 1}`;

  return {
    TAMANHO, NAVIOS, ORDEM, DIFICULDADES, casa, dentro, tabuleiroVazio, atacada, posicoesDoNavio,
    podePosicionar, posicionar, atacar, todosAfundados, tabuleiroAleatorio, cacaInicial, casaAleatoria,
    orientacaoDosAcertos, alvoInteligente, alvoCaca, jogadaComputador, depoisDaJogada,
    estatisticasVazias, registrarPartida, aproveitamento, lerEstatisticas, nomeCasa,
  };
})();

if (typeof module === "object") module.exports = LogicaBatalhaNaval;
