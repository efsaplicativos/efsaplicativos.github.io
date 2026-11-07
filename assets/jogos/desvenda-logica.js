"use strict";
/*
 * Regras do Desvenda, sem DOM: descubra a palavra de 5 letras em 6 tentativas. Cada chute mostra
 * as letras no lugar certo, as que estão na palavra em outro lugar e as que não estão. A dica põe
 * a letra certa numa posição que ainda não foi descoberta (até 2 por palavra).
 */
const LogicaDesvenda = (() => {
  const TAMANHO = 5;
  const TENTATIVAS = 6;
  const MAX_DICAS = 2;
  const MODOS = Object.freeze(["dia", "treino"]);
  /** Dia da palavra n.º 1, no horário de Brasília. */
  const PRIMEIRO_DIA = Date.UTC(2026, 10, 7);
  const DIA_MS = 86400000;

  // ---------- Palavras ----------

  /** O que o jogador digita: minúsculas, sem acento e sem cedilha. */
  function normalizar(texto) {
    return String(texto)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  /** Dicionário a partir de PalavrasDesvenda: respostas, chutes aceitos e a forma com acento. */
  function criarDicionario(dados) {
    const respostas = dados.respostas.split(" ").filter(Boolean);
    const aceitas = new Set();
    for (let i = 0; i + TAMANHO <= dados.aceitas.length; i += TAMANHO) aceitas.add(dados.aceitas.slice(i, i + TAMANHO));
    const formas = new Map();
    for (const p of dados.acentuadas.split(" ").filter(Boolean)) formas.set(normalizar(p), p);
    // Toda resposta é aceita como chute, e com a grafia dela
    for (const r of respostas) {
      aceitas.add(normalizar(r));
      if (!formas.has(normalizar(r))) formas.set(normalizar(r), r);
    }
    return {
      respostas,
      total: aceitas.size,
      aceita: (chave) => aceitas.has(chave),
      forma: (chave) => formas.get(chave) || chave,
    };
  }

  // ---------- Avaliação ----------

  /**
   * Cor de cada letra do chute: "certa" (lugar certo), "presente" (está na palavra, em outro
   * lugar) ou "ausente". Letras repetidas só ficam coloridas quantas vezes aparecem na resposta,
   * e os lugares certos têm prioridade.
   */
  function avaliar(chute, resposta) {
    const c = normalizar(chute);
    const r = normalizar(resposta);
    const resultado = Array(TAMANHO).fill("ausente");
    const sobra = new Map();
    for (let i = 0; i < TAMANHO; i++) {
      if (c[i] === r[i]) resultado[i] = "certa";
      else sobra.set(r[i], (sobra.get(r[i]) || 0) + 1);
    }
    for (let i = 0; i < TAMANHO; i++) {
      if (resultado[i] === "certa") continue;
      const n = sobra.get(c[i]) || 0;
      if (n > 0) {
        resultado[i] = "presente";
        sobra.set(c[i], n - 1);
      }
    }
    return resultado;
  }

  // ---------- Palavra do dia ----------

  /** Data no horário de Brasília como "AAAA-MM-DD". */
  function dataBrasilia(data = new Date()) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(data);
    } catch (erro) {
      const d = new Date(data.getTime() - 3 * 3600000);
      return d.toISOString().slice(0, 10);
    }
  }

  /** Número da palavra do dia: 1 em 7/11/2026, e nunca menos que 1. */
  function numeroDoDia(data = new Date()) {
    const [a, m, d] = dataBrasilia(data).split("-").map(Number);
    return Math.max(1, Math.round((Date.UTC(a, m - 1, d) - PRIMEIRO_DIA) / DIA_MS) + 1);
  }

  /** Milissegundos até a meia-noite de Brasília, quando muda a palavra do dia. */
  function msAteProximaPalavra(data = new Date()) {
    const [a, m, d] = dataBrasilia(data).split("-").map(Number);
    // Brasília não tem horário de verão desde 2019: meia-noite = 03:00 UTC
    const proxima = Date.UTC(a, m - 1, d + 1, 3);
    return Math.max(0, proxima - data.getTime());
  }

  function respostaDoDia(dic, numero) {
    const n = dic.respostas.length;
    return dic.respostas[(((numero - 1) % n) + n) % n];
  }

  /** Palavra do treino, diferente da de hoje e da anterior. */
  function sortearTreino(dic, aleatorio = Math.random, evitar = []) {
    const fora = new Set(evitar.map(normalizar));
    const opcoes = dic.respostas.filter((r) => !fora.has(normalizar(r)));
    const lista = opcoes.length ? opcoes : dic.respostas;
    return lista[Math.floor(aleatorio() * lista.length)];
  }

  // ---------- Partida ----------

  /**
   * Partida: { modo, numero, resposta (com acento), linhas (chutes enviados, sem acento),
   * atual (as 5 letras da linha em edição, "" nas vazias), dicas ([{ pos, letra }]), fim }.
   */
  function novaPartida(modo, resposta, numero = 0) {
    return {
      modo: MODOS.includes(modo) ? modo : "treino",
      numero,
      resposta,
      linhas: [],
      atual: Array(TAMANHO).fill(""),
      dicas: [],
      fim: null,
    };
  }

  const chaveDaResposta = (partida) => normalizar(partida.resposta);

  /** Posições já descobertas: verdes em algum chute ou reveladas por dica. */
  function posicoesDescobertas(partida) {
    const r = chaveDaResposta(partida);
    const certas = new Set(partida.dicas.map((d) => d.pos));
    for (const linha of partida.linhas) {
      for (let i = 0; i < TAMANHO; i++) if (linha[i] === r[i]) certas.add(i);
    }
    return certas;
  }

  function posicoesDesconhecidas(partida) {
    const certas = posicoesDescobertas(partida);
    return [...Array(TAMANHO).keys()].filter((i) => !certas.has(i));
  }

  /** Posições presas na linha atual: as letras dadas pela dica. */
  function posicoesFixas(partida) {
    return new Set(partida.dicas.map((d) => d.pos));
  }

  /** A dica não entrega a palavra: precisa sobrar pelo menos uma posição a descobrir. */
  function podeDica(partida) {
    return !partida.fim && partida.dicas.length < MAX_DICAS && posicoesDesconhecidas(partida).length >= 2;
  }

  /**
   * Põe a letra certa na posição escolhida, se ela ainda não foi descoberta; senão, na primeira
   * posição não descoberta. Devolve a partida nova e a posição usada, ou null se não pode.
   */
  function aplicarDica(partida, posPreferida = -1) {
    if (!podeDica(partida)) return null;
    const desconhecidas = posicoesDesconhecidas(partida);
    const pos = desconhecidas.includes(posPreferida) ? posPreferida : desconhecidas[0];
    const letra = chaveDaResposta(partida)[pos];
    const atual = partida.atual.slice();
    atual[pos] = letra;
    return { pos, partida: { ...partida, atual, dicas: [...partida.dicas, { pos, letra }] } };
  }

  /** Linha nova: vazia, com as letras das dicas já no lugar. */
  function linhaInicial(partida) {
    const atual = Array(TAMANHO).fill("");
    for (const d of partida.dicas) atual[d.pos] = d.letra;
    return atual;
  }

  /** Escreve uma letra (a–z) na posição, se ela não estiver presa por dica. */
  function escrever(partida, pos, letra) {
    if (partida.fim || pos < 0 || pos >= TAMANHO || posicoesFixas(partida).has(pos)) return partida;
    const l = normalizar(letra);
    if (!/^[a-z]$/.test(l)) return partida;
    const atual = partida.atual.slice();
    atual[pos] = l;
    return { ...partida, atual };
  }

  function apagar(partida, pos) {
    if (partida.fim || pos < 0 || pos >= TAMANHO || posicoesFixas(partida).has(pos)) return partida;
    const atual = partida.atual.slice();
    atual[pos] = "";
    return { ...partida, atual };
  }

  /**
   * Envia a linha atual. Devolve { ok: false, motivo: "incompleta" | "invalida" | "fim" } ou
   * { ok: true, partida, avaliacao, chute }.
   */
  function enviar(partida, dic) {
    if (partida.fim) return { ok: false, motivo: "fim" };
    if (partida.atual.some((l) => !l)) return { ok: false, motivo: "incompleta" };
    const chute = partida.atual.join("");
    if (!dic.aceita(chute)) return { ok: false, motivo: "invalida", chute };
    const avaliacao = avaliar(chute, partida.resposta);
    const linhas = [...partida.linhas, chute];
    const acertou = chute === chaveDaResposta(partida);
    const fim = acertou ? "vitoria" : linhas.length >= TENTATIVAS ? "derrota" : null;
    const nova = { ...partida, linhas, fim };
    nova.atual = fim ? Array(TAMANHO).fill("") : linhaInicial(nova);
    return { ok: true, partida: nova, avaliacao, chute };
  }

  /** Melhor informação sobre cada letra já usada, para colorir o teclado. */
  function estadoDoTeclado(partida) {
    const ordem = { ausente: 1, presente: 2, certa: 3 };
    const mapa = new Map();
    for (const linha of partida.linhas) {
      avaliar(linha, partida.resposta).forEach((estado, i) => {
        const atual = mapa.get(linha[i]);
        if (!atual || ordem[estado] > ordem[atual]) mapa.set(linha[i], estado);
      });
    }
    for (const d of partida.dicas) mapa.set(d.letra, "certa");
    return mapa;
  }

  // ---------- Compartilhar ----------

  const QUADRADOS = { certa: "🟩", presente: "🟧", ausente: "⬛" };

  function textoCompartilhar(partida) {
    const placar = partida.fim === "vitoria" ? `${partida.linhas.length}/${TENTATIVAS}` : `X/${TENTATIVAS}`;
    const titulo = partida.modo === "dia" ? `Desvenda n.º ${partida.numero}` : "Desvenda (treino)";
    const dicas = partida.dicas.length ? ` · 💡 ${partida.dicas.length} dica${partida.dicas.length > 1 ? "s" : ""}` : "";
    const grade = partida.linhas.map((l) => avaliar(l, partida.resposta).map((e) => QUADRADOS[e]).join(""));
    return [`${titulo} · ${placar}${dicas}`, ...grade, "efsaplicativos.com.br/jogos/desvenda/"].join("\n");
  }

  // ---------- Partida salva ----------

  /** Partida a partir do JSON gravado; null se ausente, malformada ou impossível. */
  function restaurar(texto, dic) {
    if (typeof texto !== "string" || !texto.trim()) return null;
    let o;
    try {
      o = JSON.parse(texto);
    } catch (erro) {
      return null;
    }
    if (!o || typeof o !== "object" || !MODOS.includes(o.modo)) return null;
    if (typeof o.resposta !== "string" || !dic.respostas.includes(o.resposta)) return null;
    if (!Number.isInteger(o.numero) || o.numero < 0) return null;
    if (!Array.isArray(o.linhas) || o.linhas.length > TENTATIVAS) return null;
    if (!o.linhas.every((l) => typeof l === "string" && l.length === TAMANHO && dic.aceita(l))) return null;
    if (!Array.isArray(o.dicas) || o.dicas.length > MAX_DICAS) return null;
    const r = normalizar(o.resposta);
    const posDicas = new Set();
    for (const d of o.dicas) {
      if (!d || !Number.isInteger(d.pos) || d.pos < 0 || d.pos >= TAMANHO || d.letra !== r[d.pos] || posDicas.has(d.pos)) return null;
      posDicas.add(d.pos);
    }
    const acertou = o.linhas.includes(r);
    if (acertou && o.linhas.indexOf(r) !== o.linhas.length - 1) return null;
    const fim = acertou ? "vitoria" : o.linhas.length >= TENTATIVAS ? "derrota" : null;
    const partida = { modo: o.modo, numero: o.numero, resposta: o.resposta, linhas: o.linhas.slice(), dicas: o.dicas.map((d) => ({ pos: d.pos, letra: d.letra })), fim };
    partida.atual = fim ? Array(TAMANHO).fill("") : linhaInicial(partida);
    return partida;
  }

  function paraSalvar(partida) {
    const { modo, numero, resposta, linhas, dicas } = partida;
    return JSON.stringify({ modo, numero, resposta, linhas, dicas });
  }

  /** A partida já "conta" (abandonar vira derrota) depois do primeiro chute ou da primeira dica. */
  function comecou(partida) {
    return !partida.fim && (partida.linhas.length > 0 || partida.dicas.length > 0);
  }

  // ---------- Estatísticas ----------

  function estatisticasVazias() {
    return { jogos: 0, vitorias: 0, sequencia: 0, melhorSequencia: 0, semDica: 0, distribuicao: Array(TENTATIVAS).fill(0), ultimoNumero: 0 };
  }

  function lerEstatisticas(texto) {
    const vazia = estatisticasVazias();
    try {
      const o = JSON.parse(texto);
      if (!o || typeof o !== "object") return vazia;
      const inteiro = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
      const est = {
        jogos: inteiro(o.jogos),
        vitorias: inteiro(o.vitorias),
        sequencia: inteiro(o.sequencia),
        melhorSequencia: inteiro(o.melhorSequencia),
        semDica: inteiro(o.semDica),
        distribuicao: Array.from({ length: TENTATIVAS }, (_, i) => inteiro(o.distribuicao?.[i])),
        ultimoNumero: inteiro(o.ultimoNumero),
      };
      // Valores impossíveis (mais vitórias que jogos...) zeram tudo
      const somaDist = est.distribuicao.reduce((a, b) => a + b, 0);
      if (est.vitorias > est.jogos || est.semDica > est.vitorias || somaDist !== est.vitorias || est.melhorSequencia < est.sequencia) return vazia;
      return est;
    } catch (erro) {
      return vazia;
    }
  }

  /**
   * Soma uma partida terminada (ou abandonada, que conta como derrota). Na palavra do dia, a
   * sequência só continua se a vitória anterior foi a do dia anterior.
   */
  function registrarResultado(est, partida, venceu) {
    const novo = { ...est, distribuicao: est.distribuicao.slice() };
    novo.jogos++;
    if (venceu) {
      novo.vitorias++;
      novo.distribuicao[partida.linhas.length - 1]++;
      if (!partida.dicas.length) novo.semDica++;
      const seguida = partida.modo !== "dia" || est.ultimoNumero === partida.numero - 1;
      novo.sequencia = seguida ? est.sequencia + 1 : 1;
      novo.melhorSequencia = Math.max(novo.melhorSequencia, novo.sequencia);
    } else {
      novo.sequencia = 0;
    }
    if (partida.modo === "dia") novo.ultimoNumero = venceu ? partida.numero : 0;
    return novo;
  }

  /** Sequência que vale hoje: na palavra do dia, quem pulou um dia perdeu a sequência. */
  function sequenciaAtual(est, modo, numeroHoje) {
    if (modo !== "dia") return est.sequencia;
    return est.ultimoNumero >= numeroHoje - 1 ? est.sequencia : 0;
  }

  /** Gerador previsível (mulberry32), para os testes. */
  function aleatorioComSemente(semente) {
    let a = semente >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    TAMANHO,
    TENTATIVAS,
    MAX_DICAS,
    MODOS,
    normalizar,
    criarDicionario,
    avaliar,
    dataBrasilia,
    numeroDoDia,
    msAteProximaPalavra,
    respostaDoDia,
    sortearTreino,
    novaPartida,
    posicoesDescobertas,
    posicoesDesconhecidas,
    posicoesFixas,
    podeDica,
    aplicarDica,
    escrever,
    apagar,
    enviar,
    estadoDoTeclado,
    textoCompartilhar,
    restaurar,
    paraSalvar,
    comecou,
    estatisticasVazias,
    lerEstatisticas,
    registrarResultado,
    sequenciaAtual,
    aleatorioComSemente,
  };
})();
if (typeof module === "object") module.exports = LogicaDesvenda;
