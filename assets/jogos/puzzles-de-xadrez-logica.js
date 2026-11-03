"use strict";
/*
 * Lógica dos puzzles de xadrez, sem DOM.
 *
 * Regras: porte de xadrez/Posicao.kt e xadrez/Pecas.kt do app Puzzles de Xadrez (FEN, lances legais com
 * roque, en passant e promoção, xeque e xeque-mate). Casas de 0 (a1) a 63 (h8): casa = fileira * 8 + coluna.
 * Cada posição é imutável: aplicar() devolve uma nova.
 * Notação: SAN como em core/chess/San.kt do Lance Certo, com as letras em português (R, D, T, B, C).
 * Puzzle: core/puzzle/PuzzleSession.kt e Puzzle.kt do Lance Certo. O FEN é o de antes do lance do
 * adversário; os lances (UCI) começam por ele e alternam com os de quem resolve. Qualquer lance que dê
 * xeque-mate também resolve, e um lance errado não fica no tabuleiro.
 * Rating: Glicko-2 de core/puzzle/Glicko2.kt e a escolha por dificuldade de PuzzleSelection.kt (Lance Certo).
 * Temas: grupos de dados/Temas.kt (Puzzles de Xadrez), nomes do Lance Certo e descrições do Puzzles de Xadrez.
 */
const LogicaPuzzlesXadrez = (() => {
  const FEN_INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  const SALTOS_CAVALO = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const DIAGONAIS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const RETAS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const VIZINHOS = [...DIAGONAIS, ...RETAS];
  const PROMOCOES = ["q", "r", "b", "n"];
  const E1 = 4;
  const E8 = 60;

  /** Direitos de roque que continuam valendo quando um lance sai de/chega a cada casa. */
  const MASCARA_ROQUE = new Array(64).fill(0b1111);
  MASCARA_ROQUE[0] = 0b1101; // a1: torre do roque grande das brancas
  MASCARA_ROQUE[7] = 0b1110; // h1
  MASCARA_ROQUE[E1] = 0b1100;
  MASCARA_ROQUE[56] = 0b0111; // a8
  MASCARA_ROQUE[63] = 0b1011; // h8
  MASCARA_ROQUE[E8] = 0b0011;

  const LETRAS_PT = { n: "C", b: "B", r: "T", q: "D", k: "R" };
  const LETRAS_EN = { n: "N", b: "B", r: "R", q: "Q", k: "K" };
  const NOMES_PECAS = { p: "peão", n: "cavalo", b: "bispo", r: "torre", q: "dama", k: "rei" };

  // ---------- Casas e peças ----------

  const corDe = (peca) => (peca === peca.toUpperCase() ? "w" : "b");
  const tipoDe = (peca) => peca.toLowerCase();
  const oposta = (cor) => (cor === "w" ? "b" : "w");
  const pecaDa = (cor, tipo) => (cor === "w" ? tipo.toUpperCase() : tipo);

  /** 28 → "e4". */
  const nomeDaCasa = (casa) => "abcdefgh"[casa % 8] + String(Math.floor(casa / 8) + 1);

  /** "e4" → 28; null para nomes inválidos. */
  function casaDoNome(nome) {
    if (typeof nome !== "string" || nome.length !== 2) return null;
    const coluna = nome.charCodeAt(0) - 97;
    const fileira = nome.charCodeAt(1) - 49;
    if (coluna < 0 || coluna > 7 || fileira < 0 || fileira > 7) return null;
    return fileira * 8 + coluna;
  }

  /** "cavalo branco", "dama preta". */
  function nomeDaPeca(peca) {
    const tipo = tipoDe(peca);
    const feminina = tipo === "q" || tipo === "r";
    const cor = corDe(peca) === "w" ? (feminina ? "branca" : "branco") : feminina ? "preta" : "preto";
    return `${NOMES_PECAS[tipo]} ${cor}`;
  }

  // ---------- FEN ----------

  function lerFen(fen) {
    const erro = () => new Error(`FEN inválido: ${fen}`);
    if (typeof fen !== "string") throw erro();
    const partes = fen.trim().split(/\s+/);
    if (partes.length < 2) throw erro();
    const fileiras = partes[0].split("/");
    if (fileiras.length !== 8) throw erro();
    const casas = new Array(64).fill(null);
    const reis = { K: 0, k: 0 };
    fileiras.forEach((texto, i) => {
      const fileira = 7 - i;
      let coluna = 0;
      for (const ch of texto) {
        if (ch >= "1" && ch <= "8") {
          coluna += Number(ch);
        } else if ("pnbrqkPNBRQK".includes(ch)) {
          if (coluna > 7) throw erro();
          casas[fileira * 8 + coluna] = ch;
          if (ch in reis) reis[ch]++;
          coluna++;
        } else {
          throw erro();
        }
      }
      if (coluna !== 8) throw erro();
    });
    if (reis.K !== 1 || reis.k !== 1) throw erro();
    if (partes[1] !== "w" && partes[1] !== "b") throw erro();
    let roques = 0;
    const textoRoque = partes[2] ?? "-";
    if (textoRoque !== "-") {
      for (const ch of textoRoque) {
        const bit = { K: 1, Q: 2, k: 4, q: 8 }[ch];
        if (!bit) throw erro();
        roques |= bit;
      }
    }
    const textoEp = partes[3] ?? "-";
    const enPassant = textoEp === "-" ? -1 : casaDoNome(textoEp);
    if (enPassant === null) throw erro();
    const meioLances = Number.parseInt(partes[4] ?? "0", 10);
    const numero = Number.parseInt(partes[5] ?? "1", 10);
    return {
      casas,
      vez: partes[1],
      roques,
      enPassant,
      meioLances: Number.isFinite(meioLances) ? meioLances : 0,
      numero: Number.isFinite(numero) ? numero : 1,
    };
  }

  function paraFen(pos) {
    const linhas = [];
    for (let fileira = 7; fileira >= 0; fileira--) {
      let texto = "";
      let vazias = 0;
      for (let coluna = 0; coluna < 8; coluna++) {
        const peca = pos.casas[fileira * 8 + coluna];
        if (!peca) {
          vazias++;
        } else {
          if (vazias) texto += vazias;
          vazias = 0;
          texto += peca;
        }
      }
      if (vazias) texto += vazias;
      linhas.push(texto);
    }
    let roques = "";
    if (pos.roques & 1) roques += "K";
    if (pos.roques & 2) roques += "Q";
    if (pos.roques & 4) roques += "k";
    if (pos.roques & 8) roques += "q";
    const ep = pos.enPassant >= 0 ? nomeDaCasa(pos.enPassant) : "-";
    return `${linhas.join("/")} ${pos.vez} ${roques || "-"} ${ep} ${pos.meioLances} ${pos.numero}`;
  }

  // ---------- Ataques ----------

  function atacadaPorSalto(casas, coluna, fileira, deslocamentos, peca) {
    for (const [dc, df] of deslocamentos) {
      const c = coluna + dc;
      const f = fileira + df;
      if (c >= 0 && c < 8 && f >= 0 && f < 8 && casas[f * 8 + c] === peca) return true;
    }
    return false;
  }

  /** Procura, em cada direção, a primeira peça: ela ataca se for [tipo] ou dama do atacante. */
  function atacadaPorDeslize(casas, coluna, fileira, direcoes, atacante, tipo) {
    const alvo = pecaDa(atacante, tipo);
    const dama = pecaDa(atacante, "q");
    for (const [dc, df] of direcoes) {
      let c = coluna + dc;
      let f = fileira + df;
      while (c >= 0 && c < 8 && f >= 0 && f < 8) {
        const ocupante = casas[f * 8 + c];
        if (ocupante) {
          if (ocupante === alvo || ocupante === dama) return true;
          break;
        }
        c += dc;
        f += df;
      }
    }
    return false;
  }

  /** True se alguma peça de [atacante] ataca a [casa]. */
  function casaAtacada(casas, casa, atacante) {
    const coluna = casa % 8;
    const fileira = Math.floor(casa / 8);
    // Peões atacam na diagonal para a frente; então olhamos uma fileira "atrás" da casa
    const fileiraPeao = fileira - (atacante === "w" ? 1 : -1);
    if (fileiraPeao >= 0 && fileiraPeao < 8) {
      const peao = pecaDa(atacante, "p");
      for (const dc of [-1, 1]) {
        const c = coluna + dc;
        if (c >= 0 && c < 8 && casas[fileiraPeao * 8 + c] === peao) return true;
      }
    }
    if (atacadaPorSalto(casas, coluna, fileira, SALTOS_CAVALO, pecaDa(atacante, "n"))) return true;
    if (atacadaPorSalto(casas, coluna, fileira, VIZINHOS, pecaDa(atacante, "k"))) return true;
    if (atacadaPorDeslize(casas, coluna, fileira, DIAGONAIS, atacante, "b")) return true;
    return atacadaPorDeslize(casas, coluna, fileira, RETAS, atacante, "r");
  }

  const casaDoRei = (pos, cor) => pos.casas.indexOf(pecaDa(cor, "k"));

  function reiAtacado(pos, cor) {
    const casa = casaDoRei(pos, cor);
    return casa >= 0 && casaAtacada(pos.casas, casa, oposta(cor));
  }

  // ---------- Geração de lances ----------

  function lance(pos, de, para, extra = {}) {
    return {
      de,
      para,
      peca: pos.casas[de],
      promocao: extra.promocao ?? null,
      captura: Boolean(extra.captura),
      enPassant: Boolean(extra.enPassant),
      roque: Boolean(extra.roque),
    };
  }

  function gerarSaltos(pos, origem, deslocamentos, saida) {
    const coluna = origem % 8;
    const fileira = Math.floor(origem / 8);
    for (const [dc, df] of deslocamentos) {
      const c = coluna + dc;
      const f = fileira + df;
      if (c < 0 || c > 7 || f < 0 || f > 7) continue;
      const alvo = f * 8 + c;
      const ocupante = pos.casas[alvo];
      if (!ocupante) saida.push(lance(pos, origem, alvo));
      else if (corDe(ocupante) !== pos.vez) saida.push(lance(pos, origem, alvo, { captura: true }));
    }
  }

  function gerarDeslizes(pos, origem, direcoes, saida) {
    for (const [dc, df] of direcoes) {
      let c = (origem % 8) + dc;
      let f = Math.floor(origem / 8) + df;
      while (c >= 0 && c < 8 && f >= 0 && f < 8) {
        const alvo = f * 8 + c;
        const ocupante = pos.casas[alvo];
        if (!ocupante) {
          saida.push(lance(pos, origem, alvo));
        } else {
          if (corDe(ocupante) !== pos.vez) saida.push(lance(pos, origem, alvo, { captura: true }));
          break;
        }
        c += dc;
        f += df;
      }
    }
  }

  function gerarLancesPeao(pos, origem, saida) {
    const cor = pos.vez;
    const coluna = origem % 8;
    const fileira = Math.floor(origem / 8);
    const direcao = cor === "w" ? 1 : -1;
    const fileiraInicial = cor === "w" ? 1 : 6;
    const fileiraPromocao = cor === "w" ? 7 : 0;

    const adicionar = (alvo, captura) => {
      if (Math.floor(alvo / 8) === fileiraPromocao) {
        for (const tipo of PROMOCOES) saida.push(lance(pos, origem, alvo, { promocao: tipo, captura }));
      } else {
        saida.push(lance(pos, origem, alvo, { captura }));
      }
    };

    const frente = origem + 8 * direcao;
    if (frente >= 0 && frente < 64 && !pos.casas[frente]) {
      adicionar(frente, false);
      const duasFrente = frente + 8 * direcao;
      if (fileira === fileiraInicial && !pos.casas[duasFrente]) saida.push(lance(pos, origem, duasFrente));
    }
    for (const dc of [-1, 1]) {
      const c = coluna + dc;
      const f = fileira + direcao;
      if (c < 0 || c > 7 || f < 0 || f > 7) continue;
      const alvo = f * 8 + c;
      const ocupante = pos.casas[alvo];
      if (ocupante && corDe(ocupante) !== cor) adicionar(alvo, true);
      else if (!ocupante && alvo === pos.enPassant) {
        saida.push(lance(pos, origem, alvo, { captura: true, enPassant: true }));
      }
    }
  }

  function gerarRoques(pos, origem, saida) {
    const cor = pos.vez;
    if (origem !== (cor === "w" ? E1 : E8)) return;
    const [bitPequeno, bitGrande] = cor === "w" ? [1, 2] : [4, 8];
    const torre = pecaDa(cor, "r");
    const adversario = oposta(cor);
    if ((pos.roques & (bitPequeno | bitGrande)) === 0 || casaAtacada(pos.casas, origem, adversario)) return;
    const c = pos.casas;
    if (
      pos.roques & bitPequeno &&
      c[origem + 3] === torre &&
      !c[origem + 1] &&
      !c[origem + 2] &&
      !casaAtacada(c, origem + 1, adversario) &&
      !casaAtacada(c, origem + 2, adversario)
    ) {
      saida.push(lance(pos, origem, origem + 2, { roque: true }));
    }
    if (
      pos.roques & bitGrande &&
      c[origem - 4] === torre &&
      !c[origem - 1] &&
      !c[origem - 2] &&
      !c[origem - 3] &&
      !casaAtacada(c, origem - 1, adversario) &&
      !casaAtacada(c, origem - 2, adversario)
    ) {
      saida.push(lance(pos, origem, origem - 2, { roque: true }));
    }
  }

  function gerarPseudo(pos) {
    const saida = [];
    for (let casa = 0; casa < 64; casa++) {
      const peca = pos.casas[casa];
      if (!peca || corDe(peca) !== pos.vez) continue;
      switch (tipoDe(peca)) {
        case "p":
          gerarLancesPeao(pos, casa, saida);
          break;
        case "n":
          gerarSaltos(pos, casa, SALTOS_CAVALO, saida);
          break;
        case "k":
          gerarSaltos(pos, casa, VIZINHOS, saida);
          gerarRoques(pos, casa, saida);
          break;
        case "b":
          gerarDeslizes(pos, casa, DIAGONAIS, saida);
          break;
        case "r":
          gerarDeslizes(pos, casa, RETAS, saida);
          break;
        default:
          gerarDeslizes(pos, casa, DIAGONAIS, saida);
          gerarDeslizes(pos, casa, RETAS, saida);
      }
    }
    return saida;
  }

  /** Aplica um lance (gerado por esta posição) e devolve a posição seguinte. */
  function aplicar(pos, l) {
    const novas = pos.casas.slice();
    const peca = novas[l.de];
    if (!peca) throw new Error("Casa de origem vazia");
    const direcao = corDe(peca) === "w" ? 1 : -1;
    novas[l.de] = null;
    if (l.enPassant) novas[l.para - 8 * direcao] = null;
    novas[l.para] = l.promocao ? pecaDa(corDe(peca), l.promocao) : peca;
    if (l.roque) {
      const pequeno = l.para > l.de;
      const origemTorre = pequeno ? l.de + 3 : l.de - 4;
      const destinoTorre = pequeno ? l.de + 1 : l.de - 1;
      novas[destinoTorre] = novas[origemTorre];
      novas[origemTorre] = null;
    }
    const avancoDuplo = tipoDe(peca) === "p" && Math.abs(l.para - l.de) === 16;
    return {
      casas: novas,
      vez: oposta(pos.vez),
      roques: pos.roques & MASCARA_ROQUE[l.de] & MASCARA_ROQUE[l.para],
      enPassant: avancoDuplo ? (l.de + l.para) / 2 : -1,
      meioLances: tipoDe(peca) === "p" || l.captura ? 0 : pos.meioLances + 1,
      numero: pos.vez === "b" ? pos.numero + 1 : pos.numero,
    };
  }

  const cacheLegais = new WeakMap();

  function lancesLegais(pos) {
    let legais = cacheLegais.get(pos);
    if (!legais) {
      legais = gerarPseudo(pos).filter((l) => !reiAtacado(aplicar(pos, l), pos.vez));
      cacheLegais.set(pos, legais);
    }
    return legais;
  }

  const lancesDaCasa = (pos, casa) => lancesLegais(pos).filter((l) => l.de === casa);
  const emXeque = (pos) => reiAtacado(pos, pos.vez);
  const xequeMate = (pos) => emXeque(pos) && lancesLegais(pos).length === 0;
  const afogado = (pos) => !emXeque(pos) && lancesLegais(pos).length === 0;

  /** "e2e4", "e7e8q". */
  const uciDe = (l) => nomeDaCasa(l.de) + nomeDaCasa(l.para) + (l.promocao ?? "");

  /** Como no chess.js: a peça de [promocao] só conta quando o lance é mesmo uma promoção (e aí é obrigatória). */
  function encontrarLance(pos, de, para, promocao = null) {
    return (
      lancesLegais(pos).find(
        (l) => l.de === de && l.para === para && (l.promocao === null || l.promocao === promocao),
      ) ?? null
    );
  }

  /** O lance legal escrito em UCI, ou null. */
  function lanceUci(pos, uci) {
    if (typeof uci !== "string" || uci.length < 4 || uci.length > 5) return null;
    const de = casaDoNome(uci.slice(0, 2));
    const para = casaDoNome(uci.slice(2, 4));
    if (de === null || para === null) return null;
    let promocao = null;
    if (uci.length === 5) {
      promocao = uci[4].toLowerCase();
      if (!PROMOCOES.includes(promocao)) return null;
    }
    return encontrarLance(pos, de, para, promocao);
  }

  /** True quando o lance de [de] para [para] é uma promoção e pede a escolha da peça. */
  const ehPromocao = (pos, de, para) => lancesLegais(pos).some((l) => l.de === de && l.para === para && l.promocao);

  /** Folhas da árvore de lances até [profundidade], para conferir o gerador com contagens conhecidas. */
  function perft(pos, profundidade) {
    if (profundidade === 0) return 1;
    const legais = lancesLegais(pos);
    if (profundidade === 1) return legais.length;
    let total = 0;
    for (const l of legais) total += perft(aplicar(pos, l), profundidade - 1);
    return total;
  }

  // ---------- SAN ----------

  function desambiguacao(pos, l) {
    const rivais = [];
    for (const outro of lancesLegais(pos)) {
      if (outro.para === l.para && outro.de !== l.de && pos.casas[outro.de] === l.peca && !rivais.includes(outro.de)) {
        rivais.push(outro.de);
      }
    }
    if (!rivais.length) return "";
    const coluna = "abcdefgh"[l.de % 8];
    const fileira = String(Math.floor(l.de / 8) + 1);
    if (rivais.every((c) => c % 8 !== l.de % 8)) return coluna;
    if (rivais.every((c) => Math.floor(c / 8) !== Math.floor(l.de / 8))) return fileira;
    return coluna + fileira;
  }

  /** SAN do lance, com + ou # no fim. As letras são as do português (Cf3, Dxd8+, O-O, e8=D) por padrão. */
  function san(pos, l, letras = LETRAS_PT) {
    const tipo = tipoDe(l.peca);
    let texto;
    if (tipo === "k" && Math.abs((l.para % 8) - (l.de % 8)) === 2) {
      texto = l.para > l.de ? "O-O" : "O-O-O";
    } else {
      const captura = Boolean(pos.casas[l.para]) || (tipo === "p" && l.de % 8 !== l.para % 8);
      if (tipo === "p") {
        texto = (captura ? "abcdefgh"[l.de % 8] + "x" : "") + nomeDaCasa(l.para);
        if (l.promocao) texto += "=" + letras[l.promocao];
      } else {
        texto = letras[tipo] + desambiguacao(pos, l) + (captura ? "x" : "") + nomeDaCasa(l.para);
      }
    }
    const depois = aplicar(pos, l);
    if (xequeMate(depois)) texto += "#";
    else if (emXeque(depois)) texto += "+";
    return texto;
  }

  /** O lance legal que um SAN descreve (aceita "0-0", "e8D", "Cg1f3"), ou null se faltar ou sobrar. */
  function lanceSan(pos, texto, letras = LETRAS_PT) {
    let s = String(texto ?? "").trim().replace(/e\.p\.$/, "").trim().replace(/[+#!?]+$/, "");
    if (!s) return null;
    const roque = s.replace(/0/g, "O");
    if (roque === "O-O" || roque === "O-O-O") {
      const origem = pos.vez === "w" ? E1 : E8;
      if (pos.casas[origem] !== pecaDa(pos.vez, "k")) return null;
      return encontrarLance(pos, origem, roque === "O-O" ? origem + 2 : origem - 2);
    }
    const tipoDaLetra = {};
    for (const [tipo, letra] of Object.entries(letras)) tipoDaLetra[letra] = tipo;
    const pecas = Object.values(letras).filter((letra, i, todas) => todas.indexOf(letra) === i).join("");
    const padrao = new RegExp(`^([${pecas}])?([a-h])?([1-8])?([x:])?([a-h][1-8])(=?([${pecas}${pecas.toLowerCase()}]))?$`);
    const m = padrao.exec(s);
    if (!m) return null;
    const tipo = m[1] ? tipoDaLetra[m[1]] : "p";
    const deColuna = m[2] ? m[2].charCodeAt(0) - 97 : null;
    const deFileira = m[3] ? Number(m[3]) - 1 : null;
    const para = casaDoNome(m[5]);
    let promocao = m[7] ? tipoDaLetra[m[7].toUpperCase()] : null;
    if (tipo !== "p" && promocao) return null;
    if (promocao === "k" || promocao === "p") return null;
    const fileiraPromocao = pos.vez === "w" ? 7 : 0;
    if (tipo === "p" && !promocao && Math.floor(para / 8) === fileiraPromocao) promocao = "q";
    const achados = lancesLegais(pos).filter(
      (l) =>
        l.para === para &&
        l.promocao === promocao &&
        tipoDe(l.peca) === tipo &&
        (deColuna === null || l.de % 8 === deColuna) &&
        (deFileira === null || Math.floor(l.de / 8) === deFileira),
    );
    return achados.length === 1 ? achados[0] : null;
  }

  // ---------- Linha de lances (rever depois do fim) ----------

  /** Posições e lances jogados, com um cursor para ir e voltar; um lance novo corta o que vinha depois. */
  function criarLinha(posicaoInicial, lances = []) {
    const posicoes = [posicaoInicial];
    const jogados = [];
    let cursor = 0;

    const linha = {
      get posicao() {
        return posicoes[cursor];
      },
      get cursor() {
        return cursor;
      },
      get total() {
        return jogados.length;
      },
      get ultimo() {
        return cursor > 0 ? jogados[cursor - 1] : null;
      },
      get lances() {
        return jogados.slice();
      },
      get podeVoltar() {
        return cursor > 0;
      },
      get podeAvancar() {
        return cursor < jogados.length;
      },
      jogar(l) {
        const pos = posicoes[cursor];
        const legal = lancesLegais(pos).find((x) => uciDe(x) === uciDe(l));
        if (!legal) throw new Error(`Lance ilegal: ${uciDe(l)}`);
        const jogado = { lance: legal, san: san(pos, legal), numero: pos.numero, vez: pos.vez };
        posicoes.length = cursor + 1;
        jogados.length = cursor;
        posicoes.push(aplicar(pos, legal));
        jogados.push(jogado);
        cursor++;
        return jogado;
      },
      voltar() {
        if (cursor === 0) return false;
        cursor--;
        return true;
      },
      avancar() {
        if (cursor >= jogados.length) return false;
        cursor++;
        return true;
      },
      inicio() {
        cursor = 0;
      },
      fim() {
        cursor = jogados.length;
      },
    };
    for (const l of lances) linha.jogar(l);
    return linha;
  }

  /** "1. Cf3 Cc6 2. Bb5" ou "12... Dxd8+ 13. Txd8#", a partir dos lances de uma linha. */
  function textoDosLances(jogados) {
    const partes = [];
    jogados.forEach((j, i) => {
      if (j.vez === "w") partes.push(`${j.numero}. ${j.san}`);
      else if (i === 0) partes.push(`${j.numero}... ${j.san}`);
      else partes.push(j.san);
    });
    return partes.join(" ");
  }

  // ---------- Puzzles ----------

  /** Linha dos blocos: `id|FEN|lances UCI|rating|temas` (o app tem ainda as jogadas antes dos temas). */
  function lerPuzzle(linha) {
    const campos = String(linha).split("|");
    if (campos.length !== 5 && campos.length !== 6) throw new Error(`Linha de puzzle inválida: ${linha}`);
    const [id, fen, lances, rating] = campos;
    const temas = campos[campos.length - 1];
    const listaLances = lances.split(" ").filter(Boolean);
    const valor = Number(rating);
    if (!id || listaLances.length < 2 || listaLances.length % 2 || !Number.isInteger(valor)) {
      throw new Error(`Puzzle inválido: ${linha}`);
    }
    return { id, fen, lances: listaLances, rating: valor, temas: temas.split(" ").filter(Boolean) };
  }

  /**
   * Uma tentativa de resolver o puzzle. Confere a solução inteira ao criar, para um puzzle com defeito
   * falhar antes de aparecer e não no meio.
   */
  function criarSessao(puzzle) {
    const inicial = lerFen(puzzle.fen);
    const solucao = [];
    let sonda = inicial;
    for (const uci of puzzle.lances) {
      const l = lanceUci(sonda, uci);
      if (!l) throw new Error(`O puzzle ${puzzle.id} tem um lance ilegal: ${uci}`);
      solucao.push(l);
      sonda = aplicar(sonda, l);
    }

    const linha = criarLinha(inicial);
    let proximo = 0;
    let erros = 0;
    let dicas = 0;
    let solucaoVista = false;
    let dica = null;
    let outroMate = false;

    const etapa = () => {
      if (outroMate || proximo === solucao.length) return "fim";
      return proximo % 2 === 0 ? "adversario" : "solucionador";
    };

    function jogarProximo(l = solucao[proximo]) {
      dica = null;
      proximo++;
      return linha.jogar(l);
    }

    const darMate = (l) => xequeMate(aplicar(linha.posicao, l));

    return {
      puzzle,
      inicial,
      /** "w" ou "b": o lado de quem resolve, que é o que não joga primeiro. */
      lado: oposta(inicial.vez),
      get etapa() {
        return etapa();
      },
      get terminou() {
        return etapa() === "fim";
      },
      /** True quando a tentativa já não conta como resolvida: depois de um erro, da dica ou da solução. */
      get falhou() {
        return erros > 0 || dicas > 0 || solucaoVista;
      },
      get erros() {
        return erros;
      },
      get dica() {
        return dica;
      },
      get posicao() {
        return linha.posicao;
      },
      get ultimo() {
        return linha.ultimo;
      },
      get jogados() {
        return linha.lances;
      },
      /** Lances que o tabuleiro aceita: nenhum, a não ser na vez de quem resolve. */
      get legais() {
        return etapa() === "solucionador" ? lancesLegais(linha.posicao) : [];
      },
      get lancesFeitos() {
        return Math.floor(proximo / 2);
      },
      get lancesTotais() {
        return solucao.length / 2;
      },
      /** Os lances da solução em UCI. */
      get solucao() {
        return solucao.map(uciDe);
      },
      jogarAdversario() {
        if (etapa() !== "adversario") throw new Error("Não é a vez do adversário");
        return jogarProximo();
      },
      /** Confere um lance legal de quem resolve e joga quando está certo. */
      enviar(l) {
        if (etapa() !== "solucionador") throw new Error("Não é a vez de quem resolve");
        const legal = lancesLegais(linha.posicao).find((x) => uciDe(x) === uciDe(l));
        if (!legal) throw new Error(`Lance ilegal no puzzle ${puzzle.id}: ${uciDe(l)}`);
        const esperado = solucao[proximo];
        const certo = uciDe(legal) === uciDe(esperado);
        if (!certo && !darMate(legal)) {
          erros++;
          return { tipo: "errado", lance: legal };
        }
        if (!certo) outroMate = true;
        const jogado = jogarProximo(legal);
        return { tipo: etapa() === "fim" ? "resolvido" : "certo", jogado };
      },
      /** Mostra a casa da peça que deve mexer. Conta como ajuda: a tentativa deixa de valer como resolvida. */
      mostrarDica() {
        if (etapa() !== "solucionador") throw new Error("Não é a vez de quem resolve");
        if (dica === null) {
          dica = solucao[proximo].de;
          dicas++;
        }
        return dica;
      },
      /** Desiste e joga o próximo lance da solução, de qualquer um dos lados. */
      jogarSolucao() {
        if (etapa() === "fim") throw new Error("O puzzle acabou");
        solucaoVista = true;
        return jogarProximo();
      },
      /** A posição depois de um lance, sem jogá-lo, para mostrar um erro antes de desfazê-lo. */
      posicaoApos(l) {
        return aplicar(linha.posicao, l);
      },
      /** Os lances jogados numa linha nova, para rever e explorar depois do fim. */
      linha() {
        return criarLinha(inicial, linha.lances.map((j) => j.lance));
      },
    };
  }

  // ---------- Glicko-2 ----------

  const GLICKO = {
    TAU: 0.75,
    DESVIO_MINIMO: 45,
    DESVIO_MAXIMO: 350,
    VOLATILIDADE_MAXIMA: 0.1,
    PERIODOS_POR_DIA: 0.21436,
    DESVIO_PROVISORIO: 110,
    DESVIO_PUZZLE: 75,
  };
  const ESCALA = 173.7178;
  const CONVERGENCIA = 0.000001;
  const quadrado = (x) => x * x;
  const limitarDesvio = (d) => Math.min(GLICKO.DESVIO_MAXIMO, Math.max(GLICKO.DESVIO_MINIMO, d));

  const novoRating = () => ({ rating: 1500, desvio: 350, volatilidade: 0.06 });
  const provisorio = (r) => r.desvio > GLICKO.DESVIO_PROVISORIO;
  const fatorG = (phi) => 1 / Math.sqrt(1 + (3 * quadrado(phi)) / (Math.PI * Math.PI));

  /** Passo 5 do artigo de Glickman: o algoritmo de Illinois. */
  function novaVolatilidade(delta, phi, variancia, sigma, tau) {
    const a = Math.log(quadrado(sigma));
    const f = (x) => {
      const ex = Math.exp(x);
      return (
        (ex * (quadrado(delta) - quadrado(phi) - variancia - ex)) / (2 * quadrado(quadrado(phi) + variancia + ex)) -
        (x - a) / quadrado(tau)
      );
    };
    let inferior = a;
    let superior;
    if (quadrado(delta) > quadrado(phi) + variancia) {
      superior = Math.log(quadrado(delta) - quadrado(phi) - variancia);
    } else {
      let k = 1;
      while (f(a - k * tau) < 0) k++;
      superior = a - k * tau;
    }
    let fInferior = f(inferior);
    let fSuperior = f(superior);
    while (Math.abs(superior - inferior) > CONVERGENCIA) {
      const c = inferior + ((inferior - superior) * fInferior) / (fSuperior - fInferior);
      const fC = f(c);
      if (fC * fSuperior <= 0) {
        inferior = superior;
        fInferior = fSuperior;
      } else {
        fInferior /= 2;
      }
      superior = c;
      fSuperior = fC;
    }
    return Math.exp(inferior / 2);
  }

  /**
   * O rating depois dos [jogos] de um período ({ adversario, pontos }: 1 vitória, 0,5 empate, 0 derrota).
   * Os [diasParado] desde o último jogo alargam o desvio antes, como no Lichess.
   */
  function atualizarGlicko(jogador, jogos, diasParado = 0, tau = GLICKO.TAU) {
    const mu = (jogador.rating - 1500) / ESCALA;
    const sigma = jogador.volatilidade;
    const periodosParado = Math.max(0, diasParado) * GLICKO.PERIODOS_POR_DIA;
    const phi = Math.min(
      Math.sqrt(quadrado(jogador.desvio / ESCALA) + quadrado(sigma) * periodosParado),
      GLICKO.DESVIO_MAXIMO / ESCALA,
    );
    if (!jogos.length) {
      return { ...jogador, desvio: limitarDesvio(Math.sqrt(quadrado(phi) + quadrado(sigma)) * ESCALA) };
    }
    let inversoVariancia = 0;
    let melhora = 0;
    for (const jogo of jogos) {
      const muAdversario = (jogo.adversario.rating - 1500) / ESCALA;
      const g = fatorG(jogo.adversario.desvio / ESCALA);
      const esperado = 1 / (1 + Math.exp(-g * (mu - muAdversario)));
      inversoVariancia += g * g * esperado * (1 - esperado);
      melhora += g * (jogo.pontos - esperado);
    }
    const variancia = 1 / inversoVariancia;
    const delta = variancia * melhora;
    const novoSigma = Math.min(novaVolatilidade(delta, phi, variancia, sigma, tau), GLICKO.VOLATILIDADE_MAXIMA);
    const phiEstrela = Math.sqrt(quadrado(phi) + quadrado(novoSigma));
    const novoPhi = 1 / Math.sqrt(1 / quadrado(phiEstrela) + 1 / variancia);
    const novoMu = mu + quadrado(novoPhi) * melhora;
    return { rating: novoMu * ESCALA + 1500, desvio: limitarDesvio(novoPhi * ESCALA), volatilidade: novoSigma };
  }

  /** A chance de [jogador] vencer [adversario], contando o empate como meio. */
  function pontuacaoEsperada(jogador, adversario) {
    const g = fatorG(adversario.desvio / ESCALA);
    return 1 / (1 + Math.exp((-g * (jogador.rating - adversario.rating)) / ESCALA));
  }

  /** Como no Lichess: o puzzle conta como um adversário com o rating dele e desvio 75. */
  function ratingAposPuzzle(jogador, ratingPuzzle, resolvido, diasParado = 0) {
    const puzzle = { rating: ratingPuzzle, desvio: GLICKO.DESVIO_PUZZLE, volatilidade: 0.06 };
    return atualizarGlicko(jogador, [{ adversario: puzzle, pontos: resolvido ? 1 : 0 }], diasParado);
  }

  // ---------- Escolha do próximo puzzle ----------

  /** Distância do rating do jogador, como a dificuldade do Lichess (PuzzleDifficulty do Lance Certo). */
  const DIFICULDADES = [
    { id: "mais-facil", nome: "Mais fácil", deslocamento: -600 },
    { id: "facil", nome: "Fácil", deslocamento: -300 },
    { id: "normal", nome: "Normal", deslocamento: 0 },
    { id: "dificil", nome: "Difícil", deslocamento: 300 },
    { id: "mais-dificil", nome: "Mais difícil", deslocamento: 600 },
  ];
  const ALVO_MINIMO = 400;
  const ALVO_MAXIMO = 3200;
  const JANELAS = [100, 200, 400, 800];

  function ratingAlvo(rating, dificuldade) {
    const nivel = DIFICULDADES.find((d) => d.id === dificuldade) ?? DIFICULDADES[2];
    return Math.min(ALVO_MAXIMO, Math.max(ALVO_MINIMO, Math.round(rating) + nivel.deslocamento));
  }

  /** Faixas para tentar em ordem, de perto do alvo até qualquer rating, para um tema raro achar puzzle. */
  const faixasRating = (alvo) => [...JANELAS.map((w) => [alvo - w, alvo + w]), [0, Infinity]];

  /** Blocos do índice com puzzles na faixa (e no tema), do mais perto ao mais longe do centro da faixa. */
  function blocosDaFaixa(indice, minimo, maximo, tema = null) {
    const centro = Number.isFinite(maximo) ? (minimo + maximo) / 2 : minimo;
    const distancia = (b) => (centro < b.min ? b.min - centro : centro > b.max ? centro - b.max : 0);
    return indice.blocos
      .filter((b) => b.max >= minimo && b.min <= maximo && (!tema || (b.temas?.[tema] ?? 0) > 0))
      .sort((a, b) => distancia(a) - distancia(b));
  }

  /**
   * Como o nextPuzzle do Lance Certo: um puzzle ainda não tentado, sorteado na faixa mais estreita que
   * tiver; se todos já foram tentados, o tentado há mais tempo. [carregar](bloco) devolve (uma promessa
   * de) a lista de puzzles do bloco. [tentativas] é { id: { t: data em ms } }. Devolve null sem puzzle.
   */
  async function escolherPuzzle({ indice, carregar, alvo, tema = null, tentativas = {}, excluir = null, aleatorio = Math.random }) {
    const faixas = faixasRating(alvo);
    for (const modo of ["inedito", "antigo"]) {
      for (const [minimo, maximo] of faixas) {
        const blocos = blocosDaFaixa(indice, minimo, maximo, tema);
        if (!blocos.length) continue;
        const listas = await Promise.all(blocos.map((b) => carregar(b)));
        const candidatos = listas
          .flat()
          .filter((p) => p.rating >= minimo && p.rating <= maximo && p.id !== excluir && (!tema || p.temas.includes(tema)));
        if (modo === "inedito") {
          const ineditos = candidatos.filter((p) => !Object.prototype.hasOwnProperty.call(tentativas, p.id));
          if (ineditos.length) return ineditos[Math.floor(aleatorio() * ineditos.length)];
        } else if (candidatos.length) {
          const quando = (p) => tentativas[p.id]?.t ?? 0;
          return candidatos.reduce((velho, p) => (quando(p) < quando(velho) ? p : velho));
        }
      }
    }
    return null;
  }

  /** Ids cuja última tentativa falhou, da falha mais antiga para a mais nova (a revisão de erros). */
  function errosParaRevisar(tentativas, excluir = null) {
    return Object.entries(tentativas)
      .filter(([id, t]) => !t.ok && id !== excluir)
      .sort((a, b) => a[1].t - b[1].t)
      .map(([id, t]) => ({ id, bloco: t.b }));
  }

  // ---------- Resultados ----------

  const estatisticasVazias = () => ({ tentados: 0, resolvidos: 0, sequencia: 0, melhor: 0 });
  const MAXIMO_HISTORICO = 30;
  const MS_POR_DIA = 86400000;

  /**
   * Registra uma tentativa, como o recordAttempt do Lance Certo: só a primeira tentativa de um puzzle,
   * no modo normal, muda o rating. Devolve o estado novo e a variação do rating (ou null).
   * A sequência conta os puzzles resolvidos de primeira, um atrás do outro.
   */
  function registrarTentativa(estado, { puzzle, bloco, resolvido, modo = "normal", agora = Date.now() }) {
    const antes = estado.rating ?? novoRating();
    const tentativas = { ...(estado.tentativas ?? {}) };
    const valendo = modo === "normal" && !Object.prototype.hasOwnProperty.call(tentativas, puzzle.id);
    let rating = antes;
    let delta = null;
    if (valendo) {
      const diasParado = antes.t ? Math.max(0, (agora - antes.t) / MS_POR_DIA) : 0;
      rating = { ...ratingAposPuzzle(antes, puzzle.rating, resolvido, diasParado), t: agora };
      delta = Math.round(rating.rating - antes.rating);
    }
    tentativas[puzzle.id] = { t: agora, ok: Boolean(resolvido), b: bloco };
    const e = { ...estatisticasVazias(), ...(estado.estatisticas ?? {}) };
    const sequencia = resolvido ? e.sequencia + 1 : 0;
    const estatisticas = {
      tentados: e.tentados + 1,
      resolvidos: e.resolvidos + (resolvido ? 1 : 0),
      sequencia,
      melhor: Math.max(e.melhor, sequencia),
    };
    const entrada = { id: puzzle.id, rating: puzzle.rating, ok: Boolean(resolvido), delta, t: agora };
    const historico = [entrada, ...(estado.historico ?? [])].slice(0, MAXIMO_HISTORICO);
    return { rating, tentativas, estatisticas, historico, delta };
  }

  // ---------- Validação do que vem do localStorage ----------

  const numeroValido = (v) => typeof v === "number" && Number.isFinite(v);

  function validarRating(r) {
    if (!r || typeof r !== "object") return null;
    if (!numeroValido(r.rating) || !numeroValido(r.desvio) || !numeroValido(r.volatilidade)) return null;
    if (r.desvio < GLICKO.DESVIO_MINIMO || r.desvio > GLICKO.DESVIO_MAXIMO || r.volatilidade <= 0) return null;
    return { rating: r.rating, desvio: r.desvio, volatilidade: r.volatilidade, ...(numeroValido(r.t) ? { t: r.t } : {}) };
  }

  function validarTentativas(t) {
    const saida = {};
    if (!t || typeof t !== "object" || Array.isArray(t)) return saida;
    for (const [id, v] of Object.entries(t)) {
      if (v && numeroValido(v.t) && typeof v.ok === "boolean") {
        saida[id] = { t: v.t, ok: v.ok, b: typeof v.b === "string" ? v.b : null };
      }
    }
    return saida;
  }

  function validarEstatisticas(e) {
    const base = estatisticasVazias();
    if (!e || typeof e !== "object") return base;
    for (const chave of Object.keys(base)) {
      if (Number.isInteger(e[chave]) && e[chave] >= 0) base[chave] = e[chave];
    }
    base.resolvidos = Math.min(base.resolvidos, base.tentados);
    base.melhor = Math.max(base.melhor, base.sequencia);
    return base;
  }

  function validarHistorico(h) {
    if (!Array.isArray(h)) return [];
    return h
      .filter((x) => x && typeof x.id === "string" && Number.isInteger(x.rating) && typeof x.ok === "boolean")
      .map((x) => ({ id: x.id, rating: x.rating, ok: x.ok, delta: Number.isInteger(x.delta) ? x.delta : null, t: numeroValido(x.t) ? x.t : 0 }))
      .slice(0, MAXIMO_HISTORICO);
  }

  // ---------- Temas ----------

  /** Nomes em português dos temas do Lichess, os do Lance Certo (feature/puzzles, values-pt). */
  const NOMES_TEMAS = {
    advancedPawn: "Peão avançado",
    advantage: "Vantagem",
    anastasiaMate: "Mate de Anastácia",
    arabianMate: "Mate árabe",
    attackingF2F7: "Ataque em f2 ou f7",
    attraction: "Atração",
    backRankMate: "Mate do corredor",
    balestraMate: "Mate de Balestra",
    bishopEndgame: "Final de bispo",
    blindSwineMate: "Mate dos porcos cegos",
    bodenMate: "Mate de Boden",
    capturingDefender: "Captura do defensor",
    castling: "Roque",
    clearance: "Desobstrução",
    collinearMove: "Lance colinear",
    cornerMate: "Mate do canto",
    crushing: "Vantagem decisiva",
    defensiveMove: "Lance defensivo",
    deflection: "Desvio",
    discoveredAttack: "Ataque descoberto",
    discoveredCheck: "Xeque descoberto",
    doubleBishopMate: "Mate dos bispos paralelos",
    doubleCheck: "Xeque duplo",
    dovetailMate: "Mate de Cozio",
    enPassant: "En passant",
    endgame: "Final",
    epauletteMate: "Mate dragona",
    equality: "Igualdade",
    exposedKing: "Rei exposto",
    fork: "Garfo",
    hangingPiece: "Peça solta",
    hookMate: "Mate do gancho",
    interference: "Interferência",
    intermezzo: "Lance intermediário",
    killBoxMate: "Mate da caixa",
    kingsideAttack: "Ataque na ala do rei",
    knightEndgame: "Final de cavalo",
    long: "Puzzle longo",
    master: "Partidas de mestres",
    masterVsMaster: "Mestre contra mestre",
    mate: "Xeque-mate",
    mateIn1: "Mate em 1",
    mateIn2: "Mate em 2",
    mateIn3: "Mate em 3",
    mateIn4: "Mate em 4",
    mateIn5: "Mate em 5 ou mais",
    middlegame: "Meio-jogo",
    morphysMate: "Mate de Morphy",
    oneMove: "Puzzle de um lance",
    opening: "Abertura",
    operaMate: "Mate da ópera",
    pawnEndgame: "Final de peões",
    pillsburysMate: "Mate de Pillsbury",
    pin: "Cravada",
    promotion: "Promoção",
    queenEndgame: "Final de dama",
    queenRookEndgame: "Final de dama e torre",
    queensideAttack: "Ataque na ala da dama",
    quietMove: "Lance silencioso",
    rookEndgame: "Final de torre",
    sacrifice: "Sacrifício",
    short: "Puzzle curto",
    skewer: "Espeto",
    smotheredMate: "Mate sufocado",
    superGM: "Partidas de super GMs",
    swallowstailMate: "Mate rabo de andorinha",
    trappedPiece: "Peça presa",
    triangleMate: "Mate do triângulo",
    underPromotion: "Subpromoção",
    veryLong: "Puzzle muito longo",
    vukovicMate: "Mate de Vuković",
    xRayAttack: "Ataque em raio X",
    zugzwang: "Zugzwang",
  };

  /** Grupos da tela de temas do Puzzles de Xadrez (dados/Temas.kt). */
  const GRUPOS_TEMAS = [
    { nome: "Xeque-mates", temas: ["mate", "mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5"] },
    {
      nome: "Padrões de mate",
      temas: [
        "anastasiaMate", "arabianMate", "backRankMate", "balestraMate", "blindSwineMate", "bodenMate",
        "cornerMate", "doubleBishopMate", "dovetailMate", "epauletteMate", "hookMate", "killBoxMate",
        "morphysMate", "operaMate", "pillsburysMate", "smotheredMate", "swallowstailMate", "triangleMate",
        "vukovicMate",
      ],
    },
    {
      nome: "Motivos táticos",
      temas: [
        "fork", "pin", "skewer", "discoveredAttack", "doubleCheck", "deflection", "attraction", "interference",
        "intermezzo", "zugzwang", "trappedPiece", "hangingPiece", "sacrifice", "quietMove", "xRayAttack",
      ],
    },
    {
      nome: "Táticas avançadas",
      temas: [
        "capturingDefender", "clearance", "collinearMove", "exposedKing", "kingsideAttack", "queensideAttack",
        "advancedPawn", "attackingF2F7", "discoveredCheck", "defensiveMove",
      ],
    },
    { nome: "Movimentos especiais", temas: ["promotion", "underPromotion", "enPassant", "castling"] },
    {
      nome: "Fases do jogo",
      temas: [
        "opening", "middlegame", "endgame", "rookEndgame", "queenEndgame", "bishopEndgame", "knightEndgame",
        "pawnEndgame", "queenRookEndgame",
      ],
    },
    { nome: "Vantagem", temas: ["advantage", "crushing", "equality"] },
    { nome: "Tamanho", temas: ["oneMove", "short", "long", "veryLong"] },
    { nome: "Origem", temas: ["master", "masterVsMaster", "superGM"] },
  ];

  /** Os temas em destaque na tela de puzzles do Lance Certo (FeaturedThemes). */
  const TEMAS_DESTAQUE = ["mateIn1", "mateIn2", "fork", "pin", "skewer", "discoveredAttack", "sacrifice", "endgame"];

  /** Descrições do guia tático do Puzzles de Xadrez (tactics_desc_*), para os temas que são motivos. */
  const DESCRICOES_TEMAS = {
    fork: "Um movimento onde a peça movida ataca duas ou mais peças do oponente de uma só vez, forçando-o a sacrificar uma delas.",
    pin: "Uma peça é incapaz de mover-se sem expor uma peça de maior valor atrás dela a um ataque.",
    skewer: "Uma peça de alto valor é atacada e forçada a fugir, permitindo a captura da peça menos valiosa que estava atrás. É o inverso da cravada.",
    discoveredAttack: "Mover uma peça que bloqueava o ataque de uma peça de longo alcance, revelando um ataque simultâneo.",
    doubleCheck: "Dar xeque com duas peças ao mesmo tempo, resultado de um ataque descoberto. Só pode ser escapado movendo o rei.",
    deflection: "Forçar uma peça do oponente a abandonar sua função defensiva.",
    attraction: "Uma troca ou sacrifício que atrai a peça do oponente para uma casa específica onde ela fica sujeita a uma sequência tática forçada.",
    interference: "Inserir uma peça entre duas peças do oponente para romper sua coordenação, deixando uma ou ambas indefesas.",
    intermezzo: "Em vez de responder ao lance esperado, realiza-se outro lance com uma ameaça imediata. Também chamado de Zwischenzug.",
    zugzwang: "Situação em que qualquer movimento do adversário piora sua posição — ter que mover é uma desvantagem.",
    trappedPiece: "Uma peça está confinada e não consegue escapar da captura, pois seus movimentos são bloqueados.",
    hangingPiece: "Uma peça do oponente está desprotegida ou insuficientemente defendida e pode ser capturada com ganho material.",
    sacrifice: "Entrega voluntária de material no curto prazo para obter vantagem após uma sequência forçada.",
    quietMove: "Um lance discreto — sem xeque nem captura — que cria uma ameaça decisiva e inevitável.",
    xRayAttack: "Uma peça ataca ou defende uma casa indiretamente, através do corpo de uma peça adversária interposta.",
    capturingDefender: "Eliminar a peça que protege um alvo importante, deixando-o indefeso e livre para ser capturado.",
    clearance: "Sacrificar ou mover uma peça para desocupar uma casa, fileira ou diagonal, abrindo caminho para uma ideia tática decisiva.",
    collinearMove: "Duas peças adversárias estão alinhadas, e uma delas desliza ao longo da linha de ataque passando pela outra.",
    exposedKing: "O rei do oponente possui poucas peças defensoras ao redor, tornando-o vulnerável a sequências de ataque.",
    kingsideAttack: "Um ataque direto ao rei adversário após o roque curto, frequentemente envolvendo abertura de colunas e diagonais.",
    queensideAttack: "Um ataque direcionado ao rei adversário após o roque longo (ala da dama).",
    advancedPawn: "Um peão muito avançado — próximo da promoção — cria ameaças difíceis de conter e é um poderoso tema tático.",
    attackingF2F7: "Ataque focado nos peões f2 (brancas) ou f7 (pretas), que são protegidos apenas pelo rei no início do jogo.",
    discoveredCheck: "Variante do ataque descoberto em que o movimento revela um xeque de uma peça de longo alcance oculta.",
    defensiveMove: "Um lance preciso necessário para evitar perda de material, xeque-mate ou outra desvantagem crítica.",
    anastasiaMate: "Um cavalo e uma torre trabalham juntos para prender o rei entre a borda lateral do tabuleiro e uma peça amiga.",
    arabianMate: "Um cavalo e uma torre prendem o rei inimigo em um canto do tabuleiro, com o cavalo cobrindo as casas de fuga.",
    backRankMate: "Xeque-mate na última fileira: o rei está bloqueado pelas próprias peças e uma torre ou dama dá o golpe final.",
    balestraMate: "Um bispo dá o xeque-mate enquanto uma dama bloqueia todas as casas de fuga do rei adversário.",
    blindSwineMate: "Duas torres trabalham em conjunto para cercar o rei em um quadrado de 2x2, impedindo qualquer escape.",
    bodenMate: "Dois bispos em diagonais cruzadas dão xeque-mate em um rei cujas casas de fuga estão bloqueadas por peças amigas.",
    cornerMate: "O rei é confinado a um canto do tabuleiro e sofre xeque-mate com uma torre ou dama, enquanto um cavalo bloqueia as casas restantes.",
    doubleBishopMate: "Dois bispos em diagonais adjacentes cooperam para dar xeque-mate em um rei bloqueado pelas próprias peças.",
    dovetailMate: "A dama dá xeque-mate adjacente ao rei, cujas únicas duas casas de fuga estão ocupadas pelas próprias peças.",
    epauletteMate: "O rei está em xeque e suas duas casas de fuga laterais estão bloqueadas pelas próprias peças.",
    hookMate: "Xeque-mate com uma torre, um cavalo e um peão, utilizando também um peão inimigo para limitar as casas de fuga do rei.",
    killBoxMate: "Uma torre se posiciona adjacente ao rei inimigo, defendida por uma dama que também bloqueia todas as casas de fuga.",
    morphysMate: "O bispo dá o xeque-mate no rei enquanto a torre ajuda a confiná-lo — padrão clássico popularizado por Paul Morphy.",
    operaMate: "Uma torre dá o xeque-mate protegida por um bispo — batizado pela famosa partida da ópera de Morphy.",
    pillsburysMate: "A torre executa o xeque-mate enquanto o bispo auxilia na contenção do rei.",
    smotheredMate: "Xeque-mate dado exclusivamente por um cavalo: o rei não pode mover-se porque está sufocado pelas próprias peças ao redor.",
    swallowstailMate: "A dama dá xeque-mate e o padrão de peças lembra visualmente a cauda bifurcada de uma andorinha.",
    triangleMate: "A dama e a torre estão na mesma fileira ou coluna separadas por uma casa, formando um triângulo com o rei inimigo.",
    vukovicMate: "Uma torre dá xeque-mate protegida por outra peça, enquanto um cavalo bloqueia as casas de fuga do rei.",
    promotion: "Promover um peão que alcança a última fileira, geralmente para dama, criando um desequilíbrio decisivo.",
    underPromotion: "Promover o peão para cavalo, bispo ou torre — uma tática surpreendente que frequentemente evita empate.",
    enPassant: "Uma captura especial onde um peão captura lateralmente um peão adversário que avançou duas casas no turno anterior.",
    castling: "O roque é usado taticamente para colocar o rei em segurança e ativar a torre.",
    rookEndgame: "Técnica e tática em finais com torres e peões — um dos finais mais complexos e frequentes no xadrez prático.",
    bishopEndgame: "Finais com bispos e peões, envolvendo a exploração de casas da cor certa e a atividade do bispo.",
    pawnEndgame: "Finais exclusivamente de peões, onde conceitos como oposição, peão passado e triangulação são decisivos.",
    knightEndgame: "Finais com cavalos e peões — o cavalo pode surpreender com garfos e bloqueios.",
    queenEndgame: "Finais de dama, onde a mobilidade extrema da peça cria oportunidades táticas constantes.",
    queenRookEndgame: "Final com dama e torre, frequentemente decisivo pela coordenação poderosa das duas peças mais fortes.",
  };

  /** O nome do tema, ou a chave separada em palavras para um tema que o Lichess criou depois desta lista. */
  function nomeDoTema(chave) {
    if (NOMES_TEMAS[chave]) return NOMES_TEMAS[chave];
    const texto = String(chave).replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase();
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  return {
    FEN_INICIAL,
    LETRAS_PT,
    LETRAS_EN,
    nomeDaCasa,
    casaDoNome,
    nomeDaPeca,
    corDe,
    tipoDe,
    lerFen,
    paraFen,
    lancesLegais,
    lancesDaCasa,
    aplicar,
    emXeque,
    xequeMate,
    afogado,
    casaDoRei,
    uciDe,
    encontrarLance,
    lanceUci,
    ehPromocao,
    perft,
    san,
    lanceSan,
    criarLinha,
    textoDosLances,
    lerPuzzle,
    criarSessao,
    GLICKO,
    novoRating,
    provisorio,
    atualizarGlicko,
    pontuacaoEsperada,
    ratingAposPuzzle,
    DIFICULDADES,
    ALVO_MINIMO,
    ALVO_MAXIMO,
    ratingAlvo,
    faixasRating,
    blocosDaFaixa,
    escolherPuzzle,
    errosParaRevisar,
    estatisticasVazias,
    registrarTentativa,
    validarRating,
    validarTentativas,
    validarEstatisticas,
    validarHistorico,
    NOMES_TEMAS,
    GRUPOS_TEMAS,
    TEMAS_DESTAQUE,
    DESCRICOES_TEMAS,
    nomeDoTema,
  };
})();
if (typeof module === "object") module.exports = LogicaPuzzlesXadrez;
