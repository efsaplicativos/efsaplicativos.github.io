"use strict";
/*
 * Regras do Color Sort do app Multi-Game Strategy (com.emerson1981.multigames), sem DOM:
 * jogos/colorsort/logica/TabuleiroCores.kt (níveis e movimentos), ResolvedorCores.kt,
 * GeradorNiveis.kt (níveis sempre solucionáveis), Cronometro.kt, dados/RecordesColorSort.kt e
 * dados/recordes/RegrasRecordes.kt. Um tabuleiro é { tubos, altura }: cada tubo lista as cores
 * (0, 1, 2...) de baixo para cima, e o último item é o topo.
 */
const LogicaColorSort = (() => {
  const LIMITE_RECORDES = 10;
  const TENTATIVAS = 40;

  /** Níveis do app: tubos cheios de 4 bolas misturadas e 2 vazios. */
  const DIFICULDADES = [
    { chave: "easy", nome: "Fácil", tubos: 5, vazios: 2, altura: 4, cores: 3 },
    { chave: "medium", nome: "Médio", tubos: 7, vazios: 2, altura: 4, cores: 5 },
    { chave: "hard", nome: "Difícil", tubos: 9, vazios: 2, altura: 4, cores: 7 },
  ];
  const dificuldade = (chave) => DIFICULDADES.find((d) => d.chave === chave) || null;

  const topo = (tubo) => tubo[tubo.length - 1];

  function embaralhar(lista, aleatorio) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  // ---------- Regras ----------

  /** Só se despeja sobre a mesma cor ou num tubo vazio, e nunca num tubo cheio. */
  function podeMover(t, origem, destino) {
    if (origem === destino || !t.tubos[origem] || !t.tubos[destino]) return false;
    const de = t.tubos[origem];
    const para = t.tubos[destino];
    if (!de.length || para.length >= t.altura) return false;
    return !para.length || topo(para) === topo(de);
  }

  /** Quantas bolas da mesma cor estão juntas no topo do tubo. */
  function sequenciaTopo(t, indice) {
    const tubo = t.tubos[indice];
    let n = 0;
    for (let i = tubo.length - 1; i >= 0 && tubo[i] === topo(tubo); i--) n++;
    return n;
  }

  /** Vão juntas todas as bolas iguais do topo que couberem; null se o movimento não vale. */
  function mover(t, origem, destino) {
    if (!podeMover(t, origem, destino)) return null;
    const quantidade = Math.min(sequenciaTopo(t, origem), t.altura - t.tubos[destino].length);
    const bolas = t.tubos[origem].slice(-quantidade);
    return {
      ...t,
      tubos: t.tubos.map((tubo, i) => {
        if (i === origem) return tubo.slice(0, -quantidade);
        if (i === destino) return [...tubo, ...bolas];
        return tubo;
      }),
    };
  }

  /** Vazio ou cheio de uma cor só. */
  function tuboResolvido(t, indice) {
    const tubo = t.tubos[indice];
    return !tubo.length || (tubo.length === t.altura && tubo.every((c) => c === tubo[0]));
  }

  /** Cheio de uma cor só (para o selo de "pronto"). */
  const tuboCompleto = (t, indice) => t.tubos[indice].length > 0 && tuboResolvido(t, indice);
  const completo = (t) => t.tubos.every((_, i) => tuboResolvido(t, i));

  /** Estado sem a ordem dos tubos (dois tubos trocados de lugar são a mesma situação). */
  function chave(t) {
    return t.tubos
      .map((tubo) => tubo.map((c) => String.fromCharCode(97 + c)).join(""))
      .sort()
      .join("|");
  }

  function movimentosValidos(t) {
    const lista = [];
    for (let o = 0; o < t.tubos.length; o++) {
      for (let d = 0; d < t.tubos.length; d++) if (podeMover(t, o, d)) lista.push([o, d]);
    }
    return lista;
  }

  // ---------- Resolvedor ----------

  /**
   * Movimentos que podem levar à solução, os mais promissores primeiro: juntar cor sobre cor
   * antes de ocupar um tubo vazio. Ignora mexer num tubo já completo, despejar num tubo vazio
   * um tubo de uma cor só (dá na mesma situação) e, havendo vários vazios, tenta só o primeiro.
   */
  function movimentosUteis(t) {
    const sobreCor = [];
    const paraVazio = [];
    const primeiroVazio = t.tubos.findIndex((tubo) => !tubo.length);
    for (let o = 0; o < t.tubos.length; o++) {
      const de = t.tubos[o];
      if (!de.length || tuboCompleto(t, o)) continue;
      const umaCor = sequenciaTopo(t, o) === de.length;
      for (let d = 0; d < t.tubos.length; d++) {
        if (!podeMover(t, o, d)) continue;
        if (!t.tubos[d].length) {
          if (d === primeiroVazio && !umaCor) paraVazio.push([o, d]);
        } else {
          sobreCor.push([o, d]);
        }
      }
    }
    return sobreCor.concat(paraVazio);
  }

  /**
   * Busca em profundidade, com as regras do jogo, que devolve uma solução ([[origem, destino]...])
   * ou null. Situações repetidas são podadas; acima de [limiteEstados] desiste (null).
   * Pilha explícita: o caminho pode ficar longo demais para recursão.
   */
  function resolver(inicio, limiteEstados = 60000) {
    if (completo(inicio)) return [];
    const vistos = new Set([chave(inicio)]);
    const pilha = [{ t: inicio, opcoes: movimentosUteis(inicio), proxima: 0 }];
    const caminho = [];
    let orcamento = limiteEstados;
    while (pilha.length) {
      const no = pilha[pilha.length - 1];
      if (no.proxima >= no.opcoes.length) {
        pilha.pop();
        caminho.pop();
        continue;
      }
      const m = no.opcoes[no.proxima++];
      const proximo = mover(no.t, m[0], m[1]);
      if (!proximo) continue;
      const k = chave(proximo);
      if (vistos.has(k)) continue;
      vistos.add(k);
      if (--orcamento < 0) return null;
      caminho.push(m);
      if (completo(proximo)) return caminho;
      pilha.push({ t: proximo, opcoes: movimentosUteis(proximo), proxima: 0 });
    }
    return null;
  }

  // ---------- Gerador ----------

  /** Como o app original: [altura] bolas de cada cor, embaralhadas nos tubos cheios, e os vazios. */
  function sortear(d, aleatorio = Math.random) {
    const bolas = [];
    for (let cor = 0; cor < d.cores; cor++) for (let k = 0; k < d.altura; k++) bolas.push(cor);
    const misturadas = embaralhar(bolas, aleatorio);
    const tubos = [];
    for (let i = 0; i < misturadas.length; i += d.altura) tubos.push(misturadas.slice(i, i + d.altura));
    for (let k = 0; k < d.vazios; k++) tubos.push([]);
    return { tubos, altura: d.altura };
  }

  /** Sem tubo já pronto no começo (e, claro, não resolvido). */
  const interessante = (t) => !completo(t) && t.tubos.every((_, i) => !tuboCompleto(t, i));

  /**
   * Parte das cores separadas e aplica jogadas "ao contrário", cada uma o inverso exato de uma
   * jogada válida (inclusive a regra de despejar todas as bolas iguais do topo que couberem):
   * o nível sai solucionável por construção.
   */
  function desembaralhar(d, aleatorio = Math.random, passos = 300) {
    let tubos = [];
    for (let cor = 0; cor < d.cores; cor++) tubos.push(new Array(d.altura).fill(cor));
    for (let k = 0; k < d.vazios; k++) tubos.push([]);
    for (let passo = 0; passo < passos; passo++) {
      const opcoes = [];
      for (let b = 0; b < tubos.length; b++) {
        const destino = tubos[b];
        if (!destino.length) continue;
        const cor = topo(destino);
        let sequencia = 0;
        for (let i = destino.length - 1; i >= 0 && destino[i] === cor; i--) sequencia++;
        for (let a = 0; a < tubos.length; a++) {
          if (a === b) continue;
          const origem = tubos[a];
          let juntas = 0;
          if (topo(origem) === cor) for (let i = origem.length - 1; i >= 0 && origem[i] === cor; i--) juntas++;
          // Com a mesma cor no topo da origem, a jogada original só levaria k bolas se o destino ficasse cheio
          if (juntas > 0 && destino.length !== d.altura) continue;
          for (let k = 1; k <= Math.min(sequencia, d.altura - origem.length); k++) {
            // O destino original tinha a mesma cor no topo ou estava vazio
            if (k === sequencia && sequencia !== destino.length) continue;
            opcoes.push([a, b, k]);
          }
        }
      }
      if (!opcoes.length) continue;
      const [a, b, k] = opcoes[Math.floor(aleatorio() * opcoes.length)];
      const bolas = tubos[b].slice(-k);
      tubos = tubos.map((tubo, i) => {
        if (i === a) return [...tubo, ...bolas];
        if (i === b) return tubo.slice(0, -k);
        return tubo;
      });
    }
    const t = { tubos, altura: d.altura };
    return completo(t) ? gerar(d, aleatorio) : t;
  }

  /** Um sorteio no formato do app só vale se o resolvedor achar solução; senão monta de trás para frente. */
  function gerar(d, aleatorio = Math.random) {
    for (let i = 0; i < TENTATIVAS; i++) {
      const t = sortear(d, aleatorio);
      if (interessante(t) && resolver(t) !== null) return t;
    }
    return desembaralhar(d, aleatorio);
  }

  /** Tabuleiro coerente com a dificuldade (para validar o que vem do armazenamento). */
  function tabuleiroValido(t, d) {
    if (!t || !d || t.altura !== d.altura || !Array.isArray(t.tubos) || t.tubos.length !== d.tubos) return false;
    const contagem = new Array(d.cores).fill(0);
    for (const tubo of t.tubos) {
      if (!Array.isArray(tubo) || tubo.length > d.altura) return false;
      for (const cor of tubo) {
        if (!Number.isInteger(cor) || cor < 0 || cor >= d.cores) return false;
        contagem[cor]++;
      }
    }
    return contagem.every((n) => n === d.altura);
  }

  // ---------- Partida com desfazer (versão web; o app não tem desfazer) ----------

  const MAXIMO_DESFAZER = 300;

  /** { inicial, tabuleiro, historico (tubos anteriores, o mais recente no fim), movimentos }. */
  const novaPartida = (inicial) => ({ inicial, tabuleiro: inicial, historico: [], movimentos: 0 });

  /** Despeja de [origem] em [destino]; null se não vale. */
  function jogar(p, origem, destino) {
    const tabuleiro = mover(p.tabuleiro, origem, destino);
    if (!tabuleiro) return null;
    const historico = [...p.historico, p.tabuleiro.tubos].slice(-MAXIMO_DESFAZER);
    return { ...p, tabuleiro, historico, movimentos: p.movimentos + 1 };
  }

  /** Volta a última jogada, e o contador de movimentos volta junto; null se não há o que desfazer. */
  function desfazer(p) {
    if (!p.historico.length) return null;
    const tubos = p.historico[p.historico.length - 1];
    return { ...p, tabuleiro: { ...p.tabuleiro, tubos }, historico: p.historico.slice(0, -1), movimentos: p.movimentos - 1 };
  }

  /** O mesmo nível desde o começo. */
  const reiniciar = (p) => novaPartida(p.inicial);

  /** Partida salva coerente com a dificuldade; null se não for. */
  function partidaValida(p, d) {
    if (!p || !d || !Number.isInteger(p.movimentos) || !Array.isArray(p.historico)) return null;
    if (!tabuleiroValido(p.inicial, d) || !tabuleiroValido(p.tabuleiro, d)) return null;
    if (p.movimentos < p.historico.length || p.historico.length > MAXIMO_DESFAZER) return null;
    if (!p.historico.every((tubos) => tabuleiroValido({ tubos, altura: d.altura }, d))) return null;
    return {
      inicial: { tubos: p.inicial.tubos, altura: d.altura },
      tabuleiro: { tubos: p.tabuleiro.tubos, altura: d.altura },
      historico: p.historico,
      movimentos: p.movimentos,
    };
  }

  // ---------- Cronômetro ----------

  /** Cronômetro que pode ser pausado: o tempo com a página escondida não conta. */
  function criarCronometro(agoraMs, acumuladoInicial = 0) {
    let acumulado = acumuladoInicial;
    let inicioTrecho = null;
    return {
      get rodando() {
        return inicioTrecho !== null;
      },
      iniciar() {
        if (inicioTrecho === null) inicioTrecho = agoraMs();
      },
      pausar() {
        if (inicioTrecho !== null) acumulado += agoraMs() - inicioTrecho;
        inicioTrecho = null;
      },
      zerar() {
        acumulado = 0;
        inicioTrecho = null;
      },
      decorridoMs: () => acumulado + (inicioTrecho === null ? 0 : agoraMs() - inicioTrecho),
      segundos() {
        return Math.floor(this.decorridoMs() / 1000);
      },
    };
  }

  /** "1:05" ou "1:02:03" (com horas). */
  function formatarTempo(segundos) {
    const total = Math.max(0, Math.floor(segundos));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  }

  // ---------- Recordes ----------

  /** Menor tempo vence; no empate, menos movimentos. Empate completo não é "melhor". */
  const ehMelhor = (novo, atual) =>
    novo.tempo < atual.tempo || (novo.tempo === atual.tempo && novo.movimentos < atual.movimentos);

  /** Melhor primeiro; no empate fica na frente quem fez antes. */
  function ordenarRecordes(lista) {
    return lista.slice().sort((a, b) => {
      if (ehMelhor(a, b)) return -1;
      if (ehMelhor(b, a)) return 1;
      return a.momento - b.momento;
    });
  }

  /** Coloca o resultado entre os 10 melhores, se couber: lista nova, posição (ou null) e se é novo recorde. */
  function inserirRecorde(lista, novo) {
    const melhor = lista[0];
    const novoRecorde = !melhor || ehMelhor(novo, melhor);
    const mantidos = ordenarRecordes([...lista, novo]).slice(0, LIMITE_RECORDES);
    const indice = mantidos.indexOf(novo);
    return { lista: indice >= 0 ? mantidos : lista, posicao: indice >= 0 ? indice + 1 : null, novoRecorde };
  }

  /** { easy, medium, hard } com { tempo, movimentos, momento }, já ordenados. */
  function lerRecordes(texto) {
    const recordes = { easy: [], medium: [], hard: [] };
    try {
      const obj = JSON.parse(texto);
      for (const k of Object.keys(recordes)) {
        const lista = Array.isArray(obj?.[k]) ? obj[k] : [];
        recordes[k] = ordenarRecordes(
          lista.filter(
            (r) =>
              r && Number.isInteger(r.tempo) && r.tempo >= 0 && Number.isInteger(r.movimentos) && r.movimentos > 0 && Number.isFinite(r.momento),
          ),
        ).slice(0, LIMITE_RECORDES);
      }
    } catch (erro) {
      /* Sem recordes válidos. */
    }
    return recordes;
  }

  return {
    DIFICULDADES,
    dificuldade,
    podeMover,
    mover,
    sequenciaTopo,
    tuboResolvido,
    tuboCompleto,
    completo,
    chave,
    movimentosValidos,
    resolver,
    sortear,
    interessante,
    desembaralhar,
    gerar,
    tabuleiroValido,
    novaPartida,
    jogar,
    desfazer,
    reiniciar,
    partidaValida,
    criarCronometro,
    formatarTempo,
    ehMelhor,
    ordenarRecordes,
    inserirRecorde,
    lerRecordes,
  };
})();
if (typeof module === "object") module.exports = LogicaColorSort;
