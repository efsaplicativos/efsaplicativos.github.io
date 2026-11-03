"use strict";
/*
 * Lógica do relógio de blinds, sem DOM. Portada do app Poker Manager: logica/Relogio.kt,
 * Calculos.kt, Dinheiro.kt, Numeros.kt, Formatos.kt e EditorConfig.kt; dados/Modelos.kt,
 * Padroes.kt e JsonTorneio.kt; regras dos contadores de ui/TorneioViewModel.kt e textos em
 * português de idiomas/TextosPt.kt e Descricoes.kt.
 *
 * Dinheiro fica em centavos e porcentagens em pontos-base (1250 = 12,5%). Os valores lidos dos
 * campos cabem em Number (até 15 dígitos), mas somas e produtos (fichas × entradas, centavos ×
 * pontos-base) usam BigInt para não perder precisão, como o BigInteger do app.
 */
const LogicaPoker = (() => {
  const limitar = (valor, minimo, maximo) => Math.min(Math.max(valor, minimo), maximo);
  const big = (valor) => (typeof valor === "bigint" ? valor : BigInt(valor));

  // ---------- Números ----------

  const MAX_DIGITOS = 15;

  function gruposDeMilharValidos(parte) {
    const grupos = parte.split(/[.,]/);
    if (grupos.length === 1) return true;
    return grupos[0].length >= 1 && grupos[0].length <= 3 && grupos.slice(1).every((g) => g.length === 3);
  }

  /**
   * Lê "12,50", "12.50", "1.234,56", "1,234.56" ou "1.000" e devolve o valor multiplicado por
   * 10^casas (centavos com casas = 2). Um separador seguido de exatamente 3 dígitos é de
   * milhar, a não ser que o campo aceite 3 casas. null para vazio, negativo ou inválido.
   */
  function ler(texto, casas) {
    const limpo = String(texto ?? "").replace(/[\s  ]/g, "");
    if (!limpo || /[^\d.,]/.test(limpo) || !/\d/.test(limpo)) return null;

    const ultimoPonto = limpo.lastIndexOf(".");
    const ultimaVirgula = limpo.lastIndexOf(",");
    let separador;
    if (ultimoPonto >= 0 && ultimaVirgula >= 0) {
      separador = ultimoPonto > ultimaVirgula ? "." : ",";
    } else if (ultimoPonto < 0 && ultimaVirgula < 0) {
      separador = null;
    } else {
      const sep = ultimoPonto >= 0 ? "." : ",";
      const ocorrencias = limpo.split(sep).length - 1;
      const depois = limpo.length - limpo.lastIndexOf(sep) - 1;
      separador = ocorrencias > 1 || (depois === 3 && casas < 3) ? null : sep;
    }

    let inteiro;
    let fracao;
    if (separador === null) {
      if (!gruposDeMilharValidos(limpo)) return null;
      inteiro = limpo.replace(/\D/g, "");
      fracao = "";
    } else {
      const pos = limpo.lastIndexOf(separador);
      const parteInteira = limpo.slice(0, pos);
      fracao = limpo.slice(pos + 1);
      if (/\D/.test(fracao) || fracao.length > casas) return null;
      if (parteInteira.includes(separador)) return null;
      if (!gruposDeMilharValidos(parteInteira)) return null;
      inteiro = parteInteira.replace(/\D/g, "");
    }
    const digitos = ((inteiro || "0") + fracao.padEnd(casas, "0")).replace(/^0+/, "") || "0";
    if (digitos.length > MAX_DIGITOS) return null;
    return Number(digitos);
  }

  const lerInteiro = (texto) => ler(texto, 0);

  /** Texto para um campo de edição: sem separador de milhar e só com as casas usadas ("12,5"). */
  function paraCampo(valor, casas) {
    const v = big(valor);
    const negativo = v < 0n;
    const digitos = (negativo ? -v : v).toString().padStart(casas + 1, "0");
    const inteiro = digitos.slice(0, digitos.length - casas);
    const fracao = digitos.slice(digitos.length - casas).replace(/0+$/, "");
    return `${negativo ? "-" : ""}${inteiro}${fracao ? `,${fracao}` : ""}`;
  }

  /** Inteiro com separador de milhar brasileiro: 1250 → "1.250". */
  function inteiro(valor) {
    const v = big(valor);
    const texto = (v < 0n ? -v : v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return v < 0n ? `-${texto}` : texto;
  }

  /** Pontos-base para exibir: 1250 → "12,5%". */
  const porcentagem = (pontosBase) => `${paraCampo(pontosBase, 2)}%`;

  /** valor × numerador / denominador em precisão arbitrária, arredondando metade para cima. */
  function proporcao(valor, numerador, denominador) {
    const d = big(denominador);
    if (d <= 0n) throw new RangeError("denominador deve ser positivo");
    const produto = big(valor) * big(numerador);
    const q = produto / d;
    const r = produto % d;
    return r * 2n >= d ? q + 1n : q;
  }

  // ---------- Dinheiro ----------

  const PONTOS_BASE_TOTAL = 10000;
  const lerCentavos = (texto) => ler(texto, 2);

  /** "R$ 1.234,56", sempre com centavos; sem moeda, só o número. */
  function formatar(centavos, moeda) {
    const v = big(centavos);
    const abs = v < 0n ? -v : v;
    const numero = `${v < 0n ? "-" : ""}${inteiro(abs / 100n)},${String(abs % 100n).padStart(2, "0")}`;
    const simbolo = String(moeda ?? "").trim();
    return simbolo ? `${simbolo} ${numero}` : numero;
  }

  /** Parte da casa, arredondada ao centavo mais próximo. */
  const rake = (brutoCentavos, pontosBase) => proporcao(brutoCentavos, pontosBase, PONTOS_BASE_TOTAL);

  /**
   * Divide o total pelos pontos-base de cada posição pelo método do maior resto: cada um
   * recebe a parte inteira e os centavos que sobram vão, um a um, para a maior fração
   * (empate: a melhor colocação). Com pesos somando 100%, a soma é exatamente o total.
   */
  function distribuir(total, pontosBase) {
    if (!pontosBase.length) return [];
    const t = big(total);
    const pesos = pontosBase.map((pb) => big(Math.max(pb, 0)));
    const soma = pesos.reduce((a, b) => a + b, 0n);
    if (t <= 0n || soma <= 0n) return pesos.map(() => 0n);

    const divisor = BigInt(PONTOS_BASE_TOTAL);
    const partes = pesos.map((pb) => ({ quociente: (t * pb) / divisor, resto: (t * pb) % divisor }));
    const alvo = (t * soma) / divisor;
    const premios = partes.map((p) => p.quociente);
    let faltam = alvo - premios.reduce((a, b) => a + b, 0n);
    const ordem = partes
      .map((_, i) => i)
      .sort((a, b) => (partes[a].resto === partes[b].resto ? a - b : partes[b].resto > partes[a].resto ? 1 : -1));
    for (const i of ordem) {
      if (faltam <= 0n) break;
      premios[i] += 1n;
      faltam -= 1n;
    }
    return premios;
  }

  // ---------- Formatos ----------

  const doisDigitos = (valor) => String(valor).padStart(2, "0");

  /** "MM:SS" ou "H:MM:SS", com os segundos arredondados para cima, como um timer regressivo. */
  function tempo(ms) {
    const total = Math.ceil(Math.max(ms, 0) / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${doisDigitos(m)}:${doisDigitos(s)}` : `${doisDigitos(m)}:${doisDigitos(s)}`;
  }

  /** Duração de um nível na estrutura: "20 min" ou "1:30". */
  const duracao = (segundos, min = "min") =>
    segundos % 60 === 0 ? `${segundos / 60} ${min}` : `${Math.floor(segundos / 60)}:${doisDigitos(segundos % 60)}`;

  // ---------- Níveis ----------

  const BLIND = "blind";
  const INTERVALO = "intervalo";
  const TIPOS = [BLIND, INTERVALO];

  const nivel = (id, tipo, smallBlind, bigBlind, ante, duracaoSegundos) => ({
    id,
    tipo,
    smallBlind,
    bigBlind,
    ante,
    duracaoSegundos,
  });
  const ehIntervalo = (n) => n.tipo === INTERVALO;
  const duracaoMs = (n) => n.duracaoSegundos * 1000;

  /** Número do nível de blind (1, 2, 3…), contando só os blinds; intervalos devolvem 0. */
  function numeroDoNivel(niveis, indice) {
    const n = niveis[indice];
    if (!n || ehIntervalo(n)) return 0;
    return niveis.slice(0, indice + 1).filter((x) => !ehIntervalo(x)).length;
  }

  /** "Nível 4" ou "Intervalo". */
  function nomeDoNivel(niveis, indice) {
    const n = niveis[indice];
    if (!n) return "";
    return ehIntervalo(n) ? "Intervalo" : `Nível ${numeroDoNivel(niveis, indice)}`;
  }

  const blinds = (n) => `${inteiro(n.smallBlind)} / ${inteiro(n.bigBlind)}`;

  /** "Nível 4 · 100 / 200 · Ante 25" ou "Intervalo · 10 min". */
  function resumoNivel(niveis, indice) {
    const n = niveis[indice];
    if (!n) return "";
    if (ehIntervalo(n)) return `Intervalo · ${duracao(n.duracaoSegundos)}`;
    const ante = n.ante > 0 ? ` · Ante ${inteiro(n.ante)}` : "";
    return `${nomeDoNivel(niveis, indice)} · ${blinds(n)}${ante}`;
  }

  // ---------- Padrões ----------

  const VINTE_MINUTOS = 20 * 60;
  const DEZ_MINUTOS = 10 * 60;
  const blindPadrao = (id, sb, bb, ante) => nivel(id, BLIND, sb, bb, ante, VINTE_MINUTOS);
  const intervaloPadrao = (id) => nivel(id, INTERVALO, 0, 0, 0, DEZ_MINUTOS);

  const NIVEIS_PADRAO = [
    blindPadrao("1", 25, 50, 0),
    blindPadrao("2", 50, 100, 0),
    blindPadrao("3", 75, 150, 25),
    intervaloPadrao("b1"),
    blindPadrao("4", 100, 200, 25),
    blindPadrao("5", 150, 300, 50),
    blindPadrao("6", 200, 400, 50),
    intervaloPadrao("b2"),
    blindPadrao("7", 300, 600, 100),
    blindPadrao("8", 400, 800, 100),
    blindPadrao("9", 500, 1000, 200),
    blindPadrao("10", 600, 1200, 200),
  ];

  /** Distribuições por número de posições pagas, em porcentagem (cada uma soma 100%). */
  const PRESETS = {
    1: [100],
    2: [65, 35],
    3: [50, 30, 20],
    4: [45, 25, 18, 12],
    5: [40, 23, 15, 12, 10],
    6: [36, 21, 14, 11, 10, 8],
    7: [33, 19, 13, 11, 9, 8, 7],
    8: [31, 18, 13, 10, 9, 8, 6, 5],
    9: [29, 17, 12, 10, 8, 7, 7, 6, 4],
    10: [27, 16, 12, 10, 8, 7, 6, 5, 5, 4],
    11: [26, 15, 11, 9, 8, 7, 6, 5, 5, 4, 4],
    12: [25, 14, 11, 9, 8, 7, 6, 5, 4, 4, 4, 3],
    13: [24, 14, 10, 9, 7, 7, 6, 5, 4, 4, 4, 3, 3],
    14: [23, 13, 10, 9, 7, 6, 6, 5, 4, 4, 4, 3, 3, 3],
    15: [22, 13, 10, 8, 7, 6, 5, 5, 4, 4, 4, 3, 3, 3, 3],
    16: [22, 13, 9, 8, 7, 6, 5, 4, 4, 4, 3, 3, 3, 3, 3, 3],
    17: [21, 12, 9, 8, 7, 6, 5, 4, 4, 4, 3, 3, 3, 3, 3, 3, 2],
    18: [21, 12, 9, 7, 7, 6, 5, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2],
    19: [20, 12, 9, 7, 6, 6, 5, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2],
    20: [20, 12, 8, 7, 6, 6, 5, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1],
  };
  const MAX_POSICOES_COM_PRESET = 20;

  /** Pontos-base sugeridos para o número de lugares pagos (vazio quando não há preset). */
  const premiacaoPara = (posicoes) =>
    posicoes <= 0 || !PRESETS[posicoes] ? [] : PRESETS[posicoes].map((p) => p * 100);

  const NOME_PADRAO = "Torneio Poker";
  const MOEDA_PADRAO = "R$";

  function configPadrao(nome = NOME_PADRAO, moeda = MOEDA_PADRAO) {
    return {
      nome,
      stackInicial: 10000,
      jogadores: 9,
      moeda,
      niveis: NIVEIS_PADRAO.map((n) => ({ ...n })),
      buyInCentavos: 5000,
      casaPontosBase: 1000,
      lateRegAteNivel: 3,
      rebuyPermitido: true,
      rebuyCentavos: 5000,
      maxRebuysPorJogador: 2,
      fichasRebuy: 10000,
      addOnPermitido: true,
      addOnCentavos: 5000,
      fichasAddOn: 10000,
      premiacao: premiacaoPara(3),
    };
  }

  // ---------- Relógio ----------

  const PARADO = "parado";
  const RODANDO = "rodando";
  const PAUSADO = "pausado";
  const ENCERRADO = "encerrado";
  const STATUS = [PARADO, RODANDO, PAUSADO, ENCERRADO];

  /**
   * Parado/pausado guarda o tempo restante; rodando guarda o instante em que o nível termina,
   * no relógio monotônico (agora, de performance.now()) e no relógio de parede (Date.now()),
   * usado para reconstruir o fim do nível depois de recarregar a página.
   */
  const estadoRelogio = (indice, status, restanteMs, fimNivelMs = 0, fimNivelParedeMs = 0) => ({
    indice,
    status,
    restanteMs,
    fimNivelMs,
    fimNivelParedeMs,
  });

  const Relogio = {
    inicial(niveis) {
      return estadoRelogio(0, PARADO, niveis.length ? duracaoMs(niveis[0]) : 0);
    },

    restanteMs(e, agora) {
      return e.status === RODANDO ? Math.max(e.fimNivelMs - agora, 0) : e.restanteMs;
    },

    /** Fração já decorrida do nível atual (0 a 1). */
    progresso(e, niveis, agora) {
      const n = niveis[e.indice];
      if (!n) return 0;
      if (e.status === ENCERRADO) return 1;
      const total = duracaoMs(n);
      if (total <= 0) return 0;
      return limitar(1 - Relogio.restanteMs(e, agora) / total, 0, 1);
    },

    /**
     * Coloca o relógio em dia: troca quantos níveis tiverem terminado até agora. Cada nível
     * novo começa exatamente no fim do anterior (fim += duração), sem acumular atraso.
     */
    avancar(e, niveis, agora) {
      if (e.status !== RODANDO || !niveis.length) return { estado: e, transicoes: 0, momentoUltimaTransicao: 0 };
      let indice = e.indice;
      let fim = e.fimNivelMs;
      let fimParede = e.fimNivelParedeMs;
      let transicoes = 0;
      let momento = 0;
      while (fim <= agora) {
        transicoes++;
        momento = fim;
        if (indice >= niveis.length - 1) {
          return { estado: estadoRelogio(niveis.length - 1, ENCERRADO, 0), transicoes, momentoUltimaTransicao: momento };
        }
        indice++;
        fim += duracaoMs(niveis[indice]);
        fimParede += duracaoMs(niveis[indice]);
      }
      return {
        estado: { ...e, indice, fimNivelMs: fim, fimNivelParedeMs: fimParede },
        transicoes,
        momentoUltimaTransicao: momento,
      };
    },

    iniciar(e, agora, parede) {
      if (e.status === RODANDO || e.status === ENCERRADO) return e;
      return { ...e, status: RODANDO, fimNivelMs: agora + e.restanteMs, fimNivelParedeMs: parede + e.restanteMs };
    },

    pausar(e, niveis, agora) {
      const atual = Relogio.avancar(e, niveis, agora).estado;
      if (atual.status !== RODANDO) return atual;
      return { ...atual, status: PAUSADO, restanteMs: Relogio.restanteMs(atual, agora) };
    },

    /** Vai para o nível com o tempo cheio, mantendo o relógio rodando se estava. */
    irPara(e, niveis, indice, agora, parede) {
      if (!niveis.length) return e;
      const i = limitar(indice, 0, niveis.length - 1);
      const total = duracaoMs(niveis[i]);
      switch (e.status) {
        case RODANDO:
          return { ...e, indice: i, fimNivelMs: agora + total, fimNivelParedeMs: parede + total };
        case ENCERRADO:
          return estadoRelogio(i, PAUSADO, total);
        default:
          return { ...e, indice: i, restanteMs: total };
      }
    },

    proximo(e, niveis, agora, parede) {
      const atual = Relogio.avancar(e, niveis, agora).estado;
      if (atual.status === ENCERRADO) return atual;
      if (atual.indice >= niveis.length - 1) return estadoRelogio(niveis.length - 1, ENCERRADO, 0);
      return Relogio.irPara(atual, niveis, atual.indice + 1, agora, parede);
    },

    anterior(e, niveis, agora, parede) {
      const atual = Relogio.avancar(e, niveis, agora).estado;
      return Relogio.irPara(atual, niveis, atual.indice - 1, agora, parede);
    },

    reiniciarNivel(e, niveis) {
      const indice = limitar(e.indice, 0, Math.max(niveis.length - 1, 0));
      return estadoRelogio(indice, PARADO, niveis[indice] ? duracaoMs(niveis[indice]) : 0);
    },

    /**
     * Ajusta um estado salvo. Ao recarregar a página o relógio monotônico recomeça (como o
     * elapsedRealtime depois de reiniciar o aparelho), então o fim do nível é recalculado pelo
     * relógio de parede; na página web isso sempre acontece (mesmoBoot = false).
     */
    restaurar(e, niveis, agora, parede, mesmoBoot) {
      if (!niveis.length) return e;
      if (!(e.indice >= 0 && e.indice < niveis.length)) return Relogio.inicial(niveis);
      if (e.status !== RODANDO || mesmoBoot) return e;
      return { ...e, fimNivelMs: agora + (e.fimNivelParedeMs - parede) };
    },

    /** Tempo até o próximo intervalo, ou null se o nível atual já é intervalo ou não há outro. */
    msAteProximoIntervalo(e, niveis, agora) {
      const atual = niveis[e.indice];
      if (e.status === ENCERRADO || !atual || ehIntervalo(atual)) return null;
      let total = Relogio.restanteMs(e, agora);
      for (let i = e.indice + 1; i < niveis.length; i++) {
        if (ehIntervalo(niveis[i])) return total;
        total += duracaoMs(niveis[i]);
      }
      return null;
    },

    /**
     * Quanto falta para o número exibido (segundos arredondados para cima) mudar. Igual a
     * (restante - 1) % 1000 + 1 do app para milissegundos inteiros, e certo também para os
     * milissegundos fracionados de performance.now().
     */
    msAteProximoSegundo(restanteMs) {
      return restanteMs <= 0 ? 1000 : restanteMs - (Math.ceil(restanteMs / 1000) - 1) * 1000;
    },
  };

  // ---------- Torneio ----------

  const MAX_ENTRADAS = 100000;

  function estadoInicial(config) {
    return {
      relogio: estadoRelogio(0, PARADO, config.niveis.length ? duracaoMs(config.niveis[0]) : 0),
      entradas: config.jogadores,
      restantes: config.jogadores,
      rebuys: 0,
      addOns: 0,
    };
  }

  const Calculos = {
    fichasEmJogo(c, e) {
      return (
        big(c.stackInicial) * big(e.entradas) +
        (c.rebuyPermitido ? big(c.fichasRebuy) * big(e.rebuys) : 0n) +
        (c.addOnPermitido ? big(c.fichasAddOn) * big(e.addOns) : 0n)
      );
    },
    stackMedio(c, e) {
      return e.restantes <= 0 ? 0n : proporcao(Calculos.fichasEmJogo(c, e), 1, e.restantes);
    },
    brutoCentavos(c, e) {
      return (
        big(c.buyInCentavos) * big(e.entradas) +
        (c.rebuyPermitido ? big(c.rebuyCentavos) * big(e.rebuys) : 0n) +
        (c.addOnPermitido ? big(c.addOnCentavos) * big(e.addOns) : 0n)
      );
    },
    rakeCentavos(c, e) {
      return rake(Calculos.brutoCentavos(c, e), c.casaPontosBase);
    },
    liquidoCentavos(c, e) {
      return Calculos.brutoCentavos(c, e) - Calculos.rakeCentavos(c, e);
    },
    premios(c, e) {
      return distribuir(Calculos.liquidoCentavos(c, e), c.premiacao);
    },
    /** Limite total de rebuys (máximo por jogador × entradas), ou null se ilimitado. */
    limiteRebuys(c, e) {
      return c.maxRebuysPorJogador > 0 ? c.maxRebuysPorJogador * e.entradas : null;
    },
  };

  /** Contadores de jogadores e financeiro, com os mesmos limites do TorneioViewModel. */
  const Contadores = {
    eliminarJogador: (c, e) => ({ ...e, restantes: Math.max(e.restantes - 1, 1) }),
    corrigirEliminacao: (c, e) => ({ ...e, restantes: Math.min(e.restantes + 1, e.entradas) }),
    adicionarEntrada: (c, e) =>
      e.entradas >= MAX_ENTRADAS ? e : { ...e, entradas: e.entradas + 1, restantes: e.restantes + 1 },
    removerEntrada(c, e) {
      const entradas = Math.max(e.entradas - 1, 1);
      const limite = Calculos.limiteRebuys(c, { ...e, entradas });
      return {
        ...e,
        entradas,
        restantes: Math.min(e.restantes, entradas),
        rebuys: limite !== null ? Math.min(e.rebuys, limite) : e.rebuys,
      };
    },
    adicionarRebuy(c, e) {
      const limite = Calculos.limiteRebuys(c, e);
      return limite !== null && e.rebuys >= limite ? e : { ...e, rebuys: e.rebuys + 1 };
    },
    removerRebuy: (c, e) => ({ ...e, rebuys: Math.max(e.rebuys - 1, 0) }),
    adicionarAddOn: (c, e) => ({ ...e, addOns: e.addOns + 1 }),
    removerAddOn: (c, e) => ({ ...e, addOns: Math.max(e.addOns - 1, 0) }),
  };

  /** Há algo a perder se a configuração for salva de novo (relógio mexido ou contadores alterados). */
  function emAndamento(c, e) {
    const r = e.relogio;
    return (
      r.status !== PARADO ||
      r.indice !== 0 ||
      r.restanteMs !== (c.niveis.length ? duracaoMs(c.niveis[0]) : 0) ||
      e.rebuys > 0 ||
      e.addOns > 0 ||
      e.entradas !== c.jogadores ||
      e.restantes !== e.entradas
    );
  }

  /** Big blind para o "≈ N BB" do stack médio: o do nível atual ou, no intervalo, o do último blind. */
  function bigBlindDeReferencia(c, indice) {
    const atual = c.niveis[indice];
    if (atual && atual.bigBlind > 0) return atual.bigBlind;
    const anteriores = c.niveis.slice(0, indice + 1).filter((n) => !ehIntervalo(n));
    return anteriores.length ? anteriores[anteriores.length - 1].bigBlind : null;
  }

  /** "Late reg. até o nível 3" ou "Late reg. encerrado"; null se o late reg está desligado. */
  function situacaoLateReg(c, indice) {
    const limite = c.lateRegAteNivel;
    if (limite <= 0) return null;
    // Durante um intervalo vale o número do último nível de blind jogado
    const nivelJogado = c.niveis.slice(0, indice + 1).filter((n) => !ehIntervalo(n)).length;
    return nivelJogado <= limite ? `Late reg. até o nível ${limite}` : "Late reg. encerrado";
  }

  // ---------- Editor da configuração ----------

  const MAX_NOME = 40;
  const MAX_MOEDA = 4;
  const MAX_FICHAS = 1e12;
  const MAX_CENTAVOS = 1e11;
  const MAX_JOGADORES = 1e5;
  const MAX_SEGUNDOS_NIVEL = 10 * 60 * 60;
  const MAX_CONTADOR = 1000;

  const vazio = (texto) => String(texto ?? "").trim() === "";
  const minutosParaCampo = (segundos) => paraCampo(proporcao(segundos, 100, 60), 2);

  /** Formulário (texto livre) a partir de uma configuração. */
  function rascunho(c) {
    return {
      nome: c.nome,
      stack: String(c.stackInicial),
      jogadores: String(c.jogadores),
      moeda: c.moeda,
      niveis: c.niveis.map((n) => ({
        id: n.id,
        tipo: n.tipo,
        sb: ehIntervalo(n) ? "" : String(n.smallBlind),
        bb: ehIntervalo(n) ? "" : String(n.bigBlind),
        ante: ehIntervalo(n) ? "" : String(n.ante),
        minutos: minutosParaCampo(n.duracaoSegundos),
      })),
      buyIn: paraCampo(c.buyInCentavos, 2),
      casa: paraCampo(c.casaPontosBase, 2),
      lateReg: String(c.lateRegAteNivel),
      rebuy: c.rebuyPermitido,
      rebuyValor: paraCampo(c.rebuyCentavos, 2),
      maxRebuys: String(c.maxRebuysPorJogador),
      fichasRebuy: String(c.fichasRebuy),
      addOn: c.addOnPermitido,
      addOnValor: paraCampo(c.addOnCentavos, 2),
      fichasAddOn: String(c.fichasAddOn),
      premios: c.premiacao.map((pb) => paraCampo(pb, 2)),
    };
  }

  /** Duração digitada em minutos ("20", "1,5") convertida em segundos. */
  function segundosDosMinutos(texto) {
    const centesimos = ler(texto, 2);
    return centesimos === null ? null : Number(proporcao(centesimos, 60, 100));
  }

  const dentro = (valor, minimo, maximo) => valor !== null && valor >= minimo && valor <= maximo;

  /** Campo de contagem: vazio vale 0. */
  function contador(texto) {
    if (vazio(texto)) return 0;
    const valor = lerInteiro(texto);
    return valor !== null && valor <= MAX_CONTADOR ? valor : null;
  }

  /** Fichas de rebuy/add-on: vazio usa o stack inicial. */
  function fichasOuStack(texto, stack) {
    if (vazio(texto)) return stack;
    const valor = lerInteiro(texto);
    return valor !== null && valor <= MAX_FICHAS ? valor : null;
  }

  function nivelDoRascunho(n) {
    const segundos = segundosDosMinutos(n.minutos);
    if (!dentro(segundos, 1, MAX_SEGUNDOS_NIVEL)) return null;
    if (n.tipo === INTERVALO) return nivel(n.id, INTERVALO, 0, 0, 0, segundos);
    const sb = lerInteiro(n.sb);
    if (!dentro(sb, 1, MAX_FICHAS)) return null;
    const bb = lerInteiro(n.bb);
    if (!dentro(bb, sb, MAX_FICHAS)) return null;
    const ante = vazio(n.ante) ? 0 : lerInteiro(n.ante);
    if (!dentro(ante, 0, MAX_FICHAS)) return null;
    return nivel(n.id, BLIND, sb, bb, ante, segundos);
  }

  const erro = (tipo, indiceNivel = -1) => ({ ok: false, erro: tipo, indiceNivel });

  /** { ok: true, config } ou { ok: false, erro, indiceNivel }, na mesma ordem de checagem do app. */
  function validar(r) {
    const nome = String(r.nome ?? "").trim();
    if (!nome) return erro("nome");
    const stack = lerInteiro(r.stack);
    if (!dentro(stack, 1, MAX_FICHAS)) return erro("stack");
    const jogadores = lerInteiro(r.jogadores);
    if (!dentro(jogadores, 1, MAX_JOGADORES)) return erro("jogadores");
    const buyIn = lerCentavos(r.buyIn);
    if (!dentro(buyIn, 0, MAX_CENTAVOS)) return erro("buyIn");
    const casa = ler(r.casa, 2);
    if (!dentro(casa, 0, PONTOS_BASE_TOTAL)) return erro("casa");

    if (!r.niveis.some((n) => n.tipo === BLIND)) return erro("niveis");
    const niveis = [];
    for (let i = 0; i < r.niveis.length; i++) {
      const n = nivelDoRascunho(r.niveis[i]);
      if (!n) return erro("nivel", i);
      niveis.push(n);
    }

    const lidoRebuy = lerCentavos(r.rebuyValor);
    const rebuyValor = dentro(lidoRebuy, 0, MAX_CENTAVOS) ? lidoRebuy : null;
    const maxRebuys = contador(r.maxRebuys);
    const fichasRebuy = fichasOuStack(r.fichasRebuy, stack);
    if (r.rebuy && (rebuyValor === null || maxRebuys === null || fichasRebuy === null)) return erro("rebuy");
    const lidoAddOn = lerCentavos(r.addOnValor);
    const addOnValor = dentro(lidoAddOn, 0, MAX_CENTAVOS) ? lidoAddOn : null;
    const fichasAddOn = fichasOuStack(r.fichasAddOn, stack);
    if (r.addOn && (addOnValor === null || fichasAddOn === null)) return erro("addOn");

    const premiacao = [];
    for (const texto of r.premios) {
      if (vazio(texto)) {
        premiacao.push(0);
        continue;
      }
      const pb = ler(texto, 2);
      if (!dentro(pb, 0, PONTOS_BASE_TOTAL)) return erro("premiacao");
      premiacao.push(pb);
    }
    if (premiacao.length && premiacao.reduce((a, b) => a + b, 0) !== PONTOS_BASE_TOTAL) return erro("premiacao");

    return {
      ok: true,
      config: {
        nome: nome.slice(0, MAX_NOME),
        stackInicial: stack,
        jogadores,
        moeda: String(r.moeda ?? "").trim().slice(0, MAX_MOEDA),
        niveis,
        buyInCentavos: buyIn,
        casaPontosBase: casa,
        lateRegAteNivel: contador(r.lateReg) ?? 0,
        rebuyPermitido: !!r.rebuy,
        rebuyCentavos: rebuyValor ?? 0,
        maxRebuysPorJogador: maxRebuys ?? 0,
        fichasRebuy: fichasRebuy ?? stack,
        addOnPermitido: !!r.addOn,
        addOnCentavos: addOnValor ?? 0,
        fichasAddOn: fichasAddOn ?? stack,
        premiacao,
      },
    };
  }

  /** "Nível 3" (contando só os blinds do rascunho) ou "Intervalo". */
  function tituloNivel(r, indice) {
    const n = r.niveis[indice];
    if (!n) return "";
    if (n.tipo === INTERVALO) return "Intervalo";
    return `Nível ${r.niveis.slice(0, indice + 1).filter((x) => x.tipo === BLIND).length}`;
  }

  const MENSAGENS = {
    nome: "Informe o nome do torneio.",
    stack: "Stack inicial inválido.",
    jogadores: "Número de jogadores inválido.",
    buyIn: "Valor de entrada inválido.",
    casa: "Percentual da casa deve ser entre 0 e 100.",
    niveis: "Adicione pelo menos um nível de blind.",
    rebuy: "Confira o valor, o máximo e as fichas do rebuy.",
    addOn: "Confira o valor e as fichas do add-on.",
    premiacao: "A soma das porcentagens deve ser 100%.",
  };

  function mensagemErro(validacao, r) {
    if (validacao.erro === "nivel") {
      return `Confira os valores de "${tituloNivel(r, validacao.indiceNivel)}": o BB não pode ser menor que o SB e a duração precisa ser maior que zero.`;
    }
    return MENSAGENS[validacao.erro] ?? "";
  }

  /** Novo nível de blind que dobra o big blind do último (como no app original). */
  function adicionarNivel(r, novoId) {
    const blindsDoRascunho = r.niveis.filter((n) => n.tipo === BLIND);
    const ultimo = blindsDoRascunho[blindsDoRascunho.length - 1];
    const bbAnterior = ultimo ? lerInteiro(ultimo.bb) : null;
    const novo =
      bbAnterior === null || bbAnterior <= 0
        ? { id: novoId, tipo: BLIND, sb: "25", bb: "50", ante: "0", minutos: "20" }
        : {
            id: novoId,
            tipo: BLIND,
            sb: String(bbAnterior),
            bb: String(bbAnterior * 2),
            ante: vazio(ultimo.ante) ? "0" : ultimo.ante,
            minutos: vazio(ultimo.minutos) ? "20" : ultimo.minutos,
          };
    return { ...r, niveis: [...r.niveis, novo] };
  }

  const adicionarIntervalo = (r, novoId) => ({
    ...r,
    niveis: [...r.niveis, { id: novoId, tipo: INTERVALO, sb: "", bb: "", ante: "", minutos: "10" }],
  });

  const removerNivel = (r, id) => ({ ...r, niveis: r.niveis.filter((n) => n.id !== id) });

  const alterarNivel = (r, id, alteracao) => ({
    ...r,
    niveis: r.niveis.map((n) => (n.id === id ? alteracao(n) : n)),
  });

  /** Muda o número de posições pagas aplicando a distribuição sugerida para esse número. */
  function definirPosicoes(r, posicoes) {
    const n = Math.max(posicoes, 0);
    const preset = premiacaoPara(n);
    let premios;
    if (n === 0) premios = [];
    else if (preset.length) premios = preset.map((pb) => paraCampo(pb, 2));
    else if (n > r.premios.length) premios = [...r.premios, ...Array(n - r.premios.length).fill("0")];
    else premios = r.premios.slice(0, n);
    return { ...r, premios };
  }

  /** Soma das porcentagens digitadas em pontos-base, ou null se alguma for inválida. */
  function somaPremios(r) {
    let soma = 0;
    for (const texto of r.premios) {
      if (vazio(texto)) continue;
      const pb = ler(texto, 2);
      if (pb === null) return null;
      soma += pb;
    }
    return Math.min(soma, 2147483647);
  }

  // ---------- Armazenamento ----------

  const inteiroNaoNegativo = (v) => Number.isSafeInteger(v) && v >= 0;

  /**
   * Configuração lida do localStorage. Além do formato (como JsonTorneio.config), passa de novo
   * pela validação do formulário, que devolve a mesma configuração quando ela é válida.
   */
  function lerConfig(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.niveis) || !Array.isArray(d.premiacao)) return null;
    const textos = ["nome", "moeda"];
    const numeros = [
      "stackInicial",
      "jogadores",
      "buyInCentavos",
      "casaPontosBase",
      "lateRegAteNivel",
      "rebuyCentavos",
      "maxRebuysPorJogador",
      "fichasRebuy",
      "addOnCentavos",
      "fichasAddOn",
    ];
    if (!textos.every((k) => typeof d[k] === "string")) return null;
    if (!numeros.every((k) => inteiroNaoNegativo(d[k]))) return null;
    if (typeof d.rebuyPermitido !== "boolean" || typeof d.addOnPermitido !== "boolean") return null;
    if (!d.premiacao.every(inteiroNaoNegativo)) return null;
    const niveisOk = d.niveis.every(
      (n) =>
        n &&
        typeof n.id === "string" &&
        TIPOS.includes(n.tipo) &&
        ["smallBlind", "bigBlind", "ante", "duracaoSegundos"].every((k) => inteiroNaoNegativo(n[k])),
    );
    if (!niveisOk || !d.niveis.length || d.jogadores <= 0 || d.niveis.some((n) => n.duracaoSegundos <= 0)) return null;
    const v = validar(rascunho(d));
    return v.ok ? v.config : null;
  }

  /** Estado salvo, no formato de JsonTorneio.estado; null se não servir para esta configuração. */
  function lerEstado(d, config) {
    if (!d || typeof d !== "object") return null;
    if (!Number.isInteger(d.indice) || d.indice < 0 || d.indice >= config.niveis.length) return null;
    if (!STATUS.includes(d.status)) return null;
    if (!Number.isFinite(d.restanteMs) || d.restanteMs < 0 || !Number.isFinite(d.fimNivelParedeMs)) return null;
    if (!["entradas", "restantes", "rebuys", "addOns"].every((k) => inteiroNaoNegativo(d[k])) || d.entradas <= 0) {
      return null;
    }
    return {
      relogio: estadoRelogio(d.indice, d.status, d.restanteMs, 0, d.fimNivelParedeMs),
      entradas: d.entradas,
      restantes: d.restantes,
      rebuys: d.rebuys,
      addOns: d.addOns,
    };
  }

  const estadoParaSalvar = (e) => ({
    indice: e.relogio.indice,
    status: e.relogio.status,
    restanteMs: e.relogio.restanteMs,
    fimNivelParedeMs: e.relogio.fimNivelParedeMs,
    entradas: e.entradas,
    restantes: e.restantes,
    rebuys: e.rebuys,
    addOns: e.addOns,
  });

  return {
    // Números e dinheiro
    ler,
    lerInteiro,
    paraCampo,
    inteiro,
    porcentagem,
    proporcao,
    PONTOS_BASE_TOTAL,
    lerCentavos,
    formatar,
    rake,
    distribuir,
    tempo,
    duracao,
    // Níveis e padrões
    BLIND,
    INTERVALO,
    ehIntervalo,
    duracaoMs,
    numeroDoNivel,
    nomeDoNivel,
    blinds,
    resumoNivel,
    NIVEIS_PADRAO,
    NOME_PADRAO,
    MOEDA_PADRAO,
    MAX_POSICOES_COM_PRESET,
    premiacaoPara,
    configPadrao,
    // Relógio e torneio
    PARADO,
    RODANDO,
    PAUSADO,
    ENCERRADO,
    estadoRelogio,
    Relogio,
    MAX_ENTRADAS,
    estadoInicial,
    Calculos,
    Contadores,
    emAndamento,
    bigBlindDeReferencia,
    situacaoLateReg,
    // Editor
    MAX_NOME,
    MAX_MOEDA,
    rascunho,
    segundosDosMinutos,
    validar,
    tituloNivel,
    mensagemErro,
    adicionarNivel,
    adicionarIntervalo,
    removerNivel,
    alterarNivel,
    definirPosicoes,
    somaPremios,
    // Armazenamento
    lerConfig,
    lerEstado,
    estadoParaSalvar,
  };
})();

if (typeof module === "object") module.exports = LogicaPoker;
