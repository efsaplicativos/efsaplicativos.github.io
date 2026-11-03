"use strict";
/*
 * Regras do placar do Marcador de Truco, portadas de dados/RegrasTruco.kt, dados/Modelos.kt,
 * dados/Textos.kt e dados/EstadoJson.kt do app. As funções são puras: recebem o estado e devolvem
 * o novo, ou o mesmo objeto quando a ação não se aplica (assim fica fácil testar e desfazer).
 * Os pares são vetores de duas posições: [primeira dupla ("Nós"), segunda dupla ("Eles")].
 */
const LogicaTruco = (() => {
  const PONTOS_PARA_VENCER = 12;
  const LIMITE_HISTORICO = 50;
  const LIMITE_DESFAZER = 100;
  const TAMANHO_MAXIMO_NOME = 20;
  const NOME_PADRAO_1 = "Nós";
  const NOME_PADRAO_2 = "Eles";

  /** Valores que uma mão pode valer no truco paulista: simples, truco, seis, nove e doze. */
  const VALORES_MAO = [1, 3, 6, 9, 12];

  /** As chaves são as mesmas gravadas pelo app (e pelo app React Native antes dele). */
  const FORMATOS = {
    UNICA: { chave: "single", rotulo: "Partida única", descricao: "Até 12 pontos", vitoriasParaVencer: 1 },
    MELHOR_DE_3: { chave: "best3", rotulo: "Melhor de 3", descricao: "2 vitórias", vitoriasParaVencer: 2 },
    MELHOR_DE_5: { chave: "best5", rotulo: "Melhor de 5", descricao: "3 vitórias", vitoriasParaVencer: 3 },
    LIVRE: { chave: "free", rotulo: "Jogo livre", descricao: "Sem limite de partidas", vitoriasParaVencer: null },
  };
  const NOMES_FORMATOS = Object.keys(FORMATOS);

  const formatoDaChave = (chave) => NOMES_FORMATOS.find((nome) => FORMATOS[nome].chave === chave) ?? null;

  const adversario = (dupla) => 1 - dupla;
  const com = (par, dupla, valor) => (dupla === 0 ? [valor, par[1]] : [par[0], valor]);
  const iguais = (a, b) => a[0] === b[0] && a[1] === b[1];
  const terminada = (progresso) => progresso.vencedor !== null;

  const progressoInicial = () => ({
    placar: [0, 0],
    vitorias: [0, 0],
    valorMao: 1,
    vencedor: null,
    numeroPartida: 1,
  });

  const estadoInicial = (vibracao = true) => ({ mesa: null, historico: [], vibracao });

  /**
   * Estado anterior a uma jogada. Se a jogada encerrou uma partida, guarda o resultado que entrou
   * no histórico e o que saiu dele (quando a lista já estava cheia), para o "desfazer" deixar o
   * histórico exatamente como era.
   */
  const entradaDesfazer = (progresso, resultadoAdicionadoId = null, resultadoRetirado = null) => ({
    progresso,
    resultadoAdicionadoId,
    resultadoRetirado,
  });

  // ---------- Regras ----------

  function normalizarNome(nome, padrao) {
    const limpo = String(nome ?? "").trim().replace(/\s+/g, " ");
    if (!limpo) return padrao;
    // Corta por code point para não partir um emoji ao meio
    const pontos = Array.from(limpo);
    if (pontos.length <= TAMANHO_MAXIMO_NOME) return limpo;
    return pontos.slice(0, TAMANHO_MAXIMO_NOME).join("").trimEnd();
  }

  const normalizarNomes = (duplas) => [
    normalizarNome(duplas[0], NOME_PADRAO_1),
    normalizarNome(duplas[1], NOME_PADRAO_2),
  ];

  const criarMesa = (id, duplas, formato) => ({
    id,
    duplas: normalizarNomes(duplas),
    formato,
    progresso: progressoInicial(),
    desfazer: [],
  });

  /** Dupla que já venceu a disputa (melhor de 3, por exemplo), ou null se ela continua. */
  function campeao(mesa) {
    const alvo = FORMATOS[mesa.formato].vitoriasParaVencer;
    if (alvo === null) return null;
    const vitorias = mesa.progresso.vitorias;
    if (vitorias[0] >= alvo) return 0;
    if (vitorias[1] >= alvo) return 1;
    return null;
  }

  /** Mão de 11: só uma dupla está com 11 pontos. Devolve essa dupla. */
  function duplaNaMaoDeOnze(progresso) {
    if (terminada(progresso)) return null;
    const [a, b] = progresso.placar;
    if (a === 11 && b !== 11) return 0;
    if (b === 11 && a !== 11) return 1;
    return null;
  }

  const emMaoDeFerro = (progresso) =>
    !terminada(progresso) && progresso.placar[0] === 11 && progresso.placar[1] === 11;

  const iniciar = (estado, id, duplas, formato) => ({ ...estado, mesa: criarMesa(id, duplas, formato) });

  const definirVibracao = (estado, ativa) => ({ ...estado, vibracao: ativa });

  function renomear(estado, duplas) {
    const mesa = estado.mesa;
    if (!mesa) return estado;
    const nomes = normalizarNomes(duplas);
    if (iguais(nomes, mesa.duplas)) return estado;
    return { ...estado, mesa: { ...mesa, duplas: nomes } };
  }

  function escolherValor(estado, valor) {
    const mesa = estado.mesa;
    if (!mesa) return estado;
    const progresso = mesa.progresso;
    if (terminada(progresso) || !VALORES_MAO.includes(valor) || valor === progresso.valorMao) return estado;
    return { ...estado, mesa: { ...mesa, progresso: { ...progresso, valorMao: valor } } };
  }

  /** Marca o valor da mão selecionado para a dupla que venceu a mão. */
  function marcarMao(estado, dupla, agora) {
    if (!estado.mesa) return estado;
    return marcar(estado, dupla, estado.mesa.progresso.valorMao, agora);
  }

  /** Marca uma mão de [pontos] (1, 3, 6, 9 ou 12). A próxima mão volta a valer 1. */
  function marcar(estado, dupla, pontos, agora) {
    if (!VALORES_MAO.includes(pontos)) return estado;
    return somar(estado, dupla, pontos, agora, true);
  }

  /** Correção manual de um ponto (+1 ou −1). Mantém o valor da mão que estava selecionado. */
  function ajustar(estado, dupla, delta, agora) {
    if (delta !== 1 && delta !== -1) return estado;
    return somar(estado, dupla, delta, agora, false);
  }

  function somar(estado, dupla, delta, agora, mudaValorMao) {
    const mesa = estado.mesa;
    if (!mesa) return estado;
    const progresso = mesa.progresso;
    if (terminada(progresso) || (dupla !== 0 && dupla !== 1)) return estado;

    const pontosAtuais = progresso.placar[dupla];
    const novosPontos = Math.min(Math.max(pontosAtuais + delta, 0), PONTOS_PARA_VENCER);
    if (novosPontos === pontosAtuais) return estado;

    const placar = com(progresso.placar, dupla, novosPontos);
    const vencedor = novosPontos === PONTOS_PARA_VENCER ? dupla : null;
    let vitorias = progresso.vitorias;
    let historico = estado.historico;
    let entrada = entradaDesfazer(progresso);

    if (vencedor !== null) {
      vitorias = com(vitorias, vencedor, vitorias[vencedor] + 1);
      const resultado = {
        id: `${mesa.id}-${progresso.numeroPartida}`,
        mesaId: mesa.id,
        duplas: mesa.duplas,
        placar,
        vencedor,
        terminouEm: agora,
        formato: mesa.formato,
        numeroPartida: progresso.numeroPartida,
      };
      entrada = entradaDesfazer(progresso, resultado.id, historico[LIMITE_HISTORICO - 1] ?? null);
      historico = [resultado, ...historico.filter((r) => r.id !== resultado.id)].slice(0, LIMITE_HISTORICO);
    }

    const novo = {
      ...progresso,
      placar,
      vitorias,
      vencedor,
      valorMao: mudaValorMao ? 1 : progresso.valorMao,
    };
    return { ...estado, historico, mesa: registrar(mesa, novo, entrada) };
  }

  const registrar = (mesa, novo, entrada) => ({
    ...mesa,
    progresso: novo,
    desfazer: [...mesa.desfazer, entrada].slice(-LIMITE_DESFAZER),
  });

  function desfazer(estado) {
    const mesa = estado.mesa;
    if (!mesa || mesa.desfazer.length === 0) return estado;
    const entrada = mesa.desfazer[mesa.desfazer.length - 1];
    let historico = estado.historico.filter((r) => r.id !== entrada.resultadoAdicionadoId);
    const retirado = entrada.resultadoRetirado;
    if (retirado && !historico.some((r) => r.id === retirado.id)) historico = [...historico, retirado];
    return {
      ...estado,
      historico: historico.slice(0, LIMITE_HISTORICO),
      mesa: { ...mesa, progresso: entrada.progresso, desfazer: mesa.desfazer.slice(0, -1) },
    };
  }

  /** Depois de uma vitória, começa a próxima partida da mesma disputa (se ela não acabou). */
  function proximaPartida(estado) {
    const mesa = estado.mesa;
    if (!mesa) return estado;
    const progresso = mesa.progresso;
    if (!terminada(progresso) || campeao(mesa) !== null) return estado;
    const novo = {
      ...progresso,
      placar: [0, 0],
      valorMao: 1,
      vencedor: null,
      numeroPartida: progresso.numeroPartida + 1,
    };
    return { ...estado, mesa: registrar(mesa, novo, entradaDesfazer(progresso)) };
  }

  /** Zera os pontos da partida atual (as vitórias e o histórico ficam). Pode ser desfeito. */
  function zerarPlacar(estado) {
    const mesa = estado.mesa;
    if (!mesa) return estado;
    const progresso = mesa.progresso;
    if (terminada(progresso) || (progresso.placar[0] === 0 && progresso.placar[1] === 0)) return estado;
    const novo = { ...progresso, placar: [0, 0], valorMao: 1 };
    return { ...estado, mesa: registrar(mesa, novo, entradaDesfazer(progresso)) };
  }

  const excluirResultado = (estado, id) => excluir(estado, (r) => r.id === id);

  const limparHistorico = (estado) => excluir(estado, () => true);

  function excluir(estado, deveExcluir) {
    const historico = estado.historico.filter((r) => !deveExcluir(r));
    // O desfazer continua corrigindo o placar, mas não pode trazer de volta o que foi excluído
    const mesa = estado.mesa && {
      ...estado.mesa,
      desfazer: estado.mesa.desfazer.map((entrada) =>
        entrada.resultadoRetirado && deveExcluir(entrada.resultadoRetirado)
          ? { ...entrada, resultadoRetirado: null }
          : entrada,
      ),
    };
    return { ...estado, historico, mesa };
  }

  /** Devolve ao histórico um resultado excluído por engano (botão "Desfazer" do aviso). */
  function restaurarResultado(estado, resultado, posicao) {
    if (estado.historico.some((r) => r.id === resultado.id)) return estado;
    // Se a vitória foi desfeita no placar depois da exclusão, ela não volta ao histórico
    const mesa = estado.mesa;
    if (mesa && mesa.id === resultado.mesaId) {
      const progresso = mesa.progresso;
      const aindaConcluida =
        resultado.numeroPartida < progresso.numeroPartida ||
        (resultado.numeroPartida === progresso.numeroPartida && progresso.vencedor === resultado.vencedor);
      if (!aindaConcluida) return estado;
    }
    const historico = [...estado.historico];
    historico.splice(Math.min(Math.max(posicao, 0), historico.length), 0, resultado);
    return { ...estado, historico: historico.slice(0, LIMITE_HISTORICO) };
  }

  // ---------- Textos (Textos.kt) ----------

  const pontos = (quantidade) => (quantidade === 1 ? "1 ponto" : `${quantidade} pontos`);

  const partidas = (quantidade) => (quantidade === 1 ? "1 partida" : `${quantidade} partidas`);

  function nomeDoValor(valor) {
    switch (valor) {
      case 1:
        return "Mão simples";
      case 3:
        return "Truco!";
      case 6:
        return "Seis!";
      case 9:
        return "Nove!";
      case 12:
        return "Doze!";
      default:
        return `Vale ${valor}`;
    }
  }

  function metaDaDisputa(formato) {
    const alvo = FORMATOS[formato].vitoriasParaVencer;
    if (alvo === null) return "A resenha não tem fim";
    return `Quem vencer ${partidas(alvo)} leva`;
  }

  /** "26 de out." no ano corrente; "26 de out. de 2025" em anos anteriores. */
  function data(instante, agora, fuso) {
    const ano = (ms) => new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: fuso }).format(new Date(ms));
    const opcoes = { day: "numeric", month: "short", timeZone: fuso };
    if (ano(instante) !== ano(agora)) opcoes.year = "numeric";
    return new Intl.DateTimeFormat("pt-BR", opcoes).format(new Date(instante));
  }

  // ---------- JSON (EstadoJson.kt), o mesmo formato versão 1 do app ----------

  const VERSAO = 1;

  const progressoParaJson = (p) => ({
    scores: [...p.placar],
    wins: [...p.vitorias],
    stake: p.valorMao,
    winner: p.vencedor,
    gameNumber: p.numeroPartida,
  });

  const resultadoParaJson = (r) => ({
    id: r.id,
    matchId: r.mesaId,
    teams: [...r.duplas],
    scores: [...r.placar],
    winner: r.vencedor,
    finishedAt: r.terminouEm,
    format: FORMATOS[r.formato].chave,
    gameNumber: r.numeroPartida,
  });

  function mesaParaJson(mesa) {
    return {
      id: mesa.id,
      teams: [...mesa.duplas],
      format: FORMATOS[mesa.formato].chave,
      progress: progressoParaJson(mesa.progresso),
      undo: mesa.desfazer.map((entrada) => {
        const json = { progress: progressoParaJson(entrada.progresso) };
        if (entrada.resultadoAdicionadoId !== null) json.addedResultId = entrada.resultadoAdicionadoId;
        if (entrada.resultadoRetirado) json.evictedResult = resultadoParaJson(entrada.resultadoRetirado);
        return json;
      }),
    };
  }

  const paraJson = (estado) =>
    JSON.stringify({
      version: VERSAO,
      active: estado.mesa ? mesaParaJson(estado.mesa) : null,
      history: estado.historico.map(resultadoParaJson),
      haptics: estado.vibracao,
    });

  const ehObjeto = (valor) => typeof valor === "object" && valor !== null && !Array.isArray(valor);
  const objetos = (lista) => (Array.isArray(lista) ? lista.filter(ehObjeto) : []);

  function inteiroDe(valor, minimo, maximo = Number.MAX_SAFE_INTEGER) {
    if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
    if (valor % 1 !== 0 || valor < minimo || valor > maximo) return null;
    return valor;
  }

  function parInteiros(lista, minimo, maximo) {
    if (!Array.isArray(lista) || lista.length !== 2) return null;
    const a = inteiroDe(lista[0], minimo, maximo);
    const b = inteiroDe(lista[1], minimo, maximo);
    return a === null || b === null ? null : [a, b];
  }

  const identificador = (valor) =>
    typeof valor === "string" && valor.length > 0 && valor.length < 120 ? valor : null;

  function nomesDe(lista) {
    if (!Array.isArray(lista) || lista.length !== 2) return null;
    if (typeof lista[0] !== "string" || typeof lista[1] !== "string") return null;
    return normalizarNomes(lista);
  }

  /** Só quem tem 12 pontos pode ser o vencedor; sem vencedor, ninguém chegou a 12. */
  function placarCoerente(placar, vencedor) {
    if (vencedor === null) return placar[0] < PONTOS_PARA_VENCER && placar[1] < PONTOS_PARA_VENCER;
    return placar[vencedor] === PONTOS_PARA_VENCER && placar[adversario(vencedor)] < PONTOS_PARA_VENCER;
  }

  function lerProgresso(json) {
    const placar = parInteiros(json.scores, 0, PONTOS_PARA_VENCER);
    const vitorias = parInteiros(json.wins, 0);
    const numeroPartida = inteiroDe(json.gameNumber, 1);
    if (!placar || !vitorias || numeroPartida === null) return null;
    const stake = inteiroDe(json.stake, 1);
    const valorMao = VALORES_MAO.includes(stake) ? stake : 1;
    let vencedor = null;
    if (json.winner !== null && json.winner !== undefined) {
      vencedor = inteiroDe(json.winner, 0, 1);
      if (vencedor === null) return null;
    }
    if (!placarCoerente(placar, vencedor)) return null;
    return { placar, vitorias, valorMao, vencedor, numeroPartida };
  }

  function lerResultado(json) {
    const placar = parInteiros(json.scores, 0, PONTOS_PARA_VENCER);
    const vencedor = inteiroDe(json.winner, 0, 1);
    if (!placar || vencedor === null || !placarCoerente(placar, vencedor)) return null;
    const id = identificador(json.id);
    const mesaId = identificador(json.matchId);
    const duplas = nomesDe(json.teams);
    const terminouEm = typeof json.finishedAt === "number" && json.finishedAt >= 0 ? Math.trunc(json.finishedAt) : null;
    const formato = formatoDaChave(json.format);
    const numeroPartida = inteiroDe(json.gameNumber, 1);
    if (!id || !mesaId || !duplas || terminouEm === null || !formato || numeroPartida === null) return null;
    return { id, mesaId, duplas, placar, vencedor, terminouEm, formato, numeroPartida };
  }

  function lerMesa(json) {
    const id = identificador(json.id);
    const duplas = nomesDe(json.teams);
    const formato = formatoDaChave(json.format);
    const progresso = ehObjeto(json.progress) ? lerProgresso(json.progress) : null;
    if (!id || !duplas || !formato || !progresso) return null;
    const desfazerLido = [];
    for (const entrada of objetos(json.undo)) {
      const anterior = ehObjeto(entrada.progress) ? lerProgresso(entrada.progress) : null;
      if (!anterior) continue;
      desfazerLido.push(
        entradaDesfazer(
          anterior,
          identificador(entrada.addedResultId),
          ehObjeto(entrada.evictedResult) ? lerResultado(entrada.evictedResult) : null,
        ),
      );
    }
    return { id, duplas, formato, progresso, desfazer: desfazerLido.slice(-LIMITE_DESFAZER) };
  }

  /**
   * Devolve null só quando o texto não é um estado reconhecível. A leitura é tolerante: um
   * resultado ou uma jogada corrompidos são ignorados, sem perder o restante.
   */
  function deJson(texto) {
    let raiz;
    try {
      raiz = JSON.parse(texto);
    } catch (erro) {
      return null;
    }
    if (!ehObjeto(raiz) || inteiroDe(raiz.version, 0) !== VERSAO) return null;
    const vistos = new Set();
    const historico = [];
    for (const item of objetos(raiz.history)) {
      const resultado = lerResultado(item);
      if (!resultado || vistos.has(resultado.id)) continue;
      vistos.add(resultado.id);
      historico.push(resultado);
    }
    return {
      mesa: ehObjeto(raiz.active) ? lerMesa(raiz.active) : null,
      historico: historico.slice(0, LIMITE_HISTORICO),
      vibracao: typeof raiz.haptics === "boolean" ? raiz.haptics : true,
    };
  }

  return {
    PONTOS_PARA_VENCER,
    LIMITE_HISTORICO,
    LIMITE_DESFAZER,
    TAMANHO_MAXIMO_NOME,
    NOME_PADRAO_1,
    NOME_PADRAO_2,
    VALORES_MAO,
    FORMATOS,
    NOMES_FORMATOS,
    formatoDaChave,
    adversario,
    progressoInicial,
    estadoInicial,
    normalizarNome,
    normalizarNomes,
    criarMesa,
    campeao,
    duplaNaMaoDeOnze,
    emMaoDeFerro,
    iniciar,
    definirVibracao,
    renomear,
    escolherValor,
    marcarMao,
    marcar,
    ajustar,
    desfazer,
    proximaPartida,
    zerarPlacar,
    excluirResultado,
    limparHistorico,
    restaurarResultado,
    pontos,
    partidas,
    nomeDoValor,
    metaDaDisputa,
    data,
    paraJson,
    deJson,
  };
})();

// Nos testes (node), o mesmo objeto é exportado como módulo.
if (typeof module === "object") module.exports = LogicaTruco;
