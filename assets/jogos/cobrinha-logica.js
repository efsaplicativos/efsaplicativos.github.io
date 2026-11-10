"use strict";
/*
 * Cobrinha (Snake) no molde dos outros jogos do site: a partida é imutável e cada passo devolve
 * outra partida. A cobra é a lista de casas do corpo, com a cabeça na frente.
 *
 * Regras:
 *  - a cobra anda uma casa por passo, na direção escolhida, e não pode voltar para trás;
 *  - comer a fruta vale pontos e faz a cobra crescer;
 *  - bater na parede ou no próprio corpo termina a partida;
 *  - a casa que a cauda está deixando conta como livre (regra clássica, senão não dá para
 *    "perseguir" a própria cauda em espaço apertado);
 *  - encher o tabuleiro inteiro é vitória.
 *
 * A dificuldade muda o tamanho do tabuleiro e a velocidade; a velocidade aumenta um pouco a cada
 * fruta comida.
 */
const LogicaCobrinha = (() => {
  const DIRECOES = {
    cima: Object.freeze({ id: "cima", nome: "Cima", linha: -1, coluna: 0 }),
    baixo: Object.freeze({ id: "baixo", nome: "Baixo", linha: 1, coluna: 0 }),
    esquerda: Object.freeze({ id: "esquerda", nome: "Esquerda", linha: 0, coluna: -1 }),
    direita: Object.freeze({ id: "direita", nome: "Direita", linha: 0, coluna: 1 }),
  };

  const OPOSTAS = { cima: "baixo", baixo: "cima", esquerda: "direita", direita: "esquerda" };

  const NIVEIS = {
    facil: { id: "facil", nome: "Fácil", colunas: 13, linhas: 13, intervalo: 200 },
    medio: { id: "medio", nome: "Médio", colunas: 16, linhas: 16, intervalo: 150 },
    dificil: { id: "dificil", nome: "Difícil", colunas: 20, linhas: 20, intervalo: 110 },
  };

  const PONTOS_POR_COMIDA = 10;
  const TAMANHO_INICIAL = 3;
  const ACELERACAO_POR_COMIDA = 4;
  const ACELERACAO_MAXIMA = 60;
  const INTERVALO_MINIMO = 55;

  const MOTIVOS = { PAREDE: "parede", CORPO: "corpo", CHEIO: "cheio" };

  // ---------- Tabuleiro ----------

  const totalDeCasas = (nivel) => nivel.colunas * nivel.linhas;
  const indice = (nivel, linha, coluna) => linha * nivel.colunas + coluna;
  const linhaDaCasa = (nivel, casa) => Math.floor(casa / nivel.colunas);
  const colunaDaCasa = (nivel, casa) => casa % nivel.colunas;
  const nomeDaCasa = (nivel, casa) =>
    `linha ${linhaDaCasa(nivel, casa) + 1}, coluna ${colunaDaCasa(nivel, casa) + 1}`;

  /** Sorteia uma casa livre para a fruta; devolve -1 quando o tabuleiro está cheio. */
  function sortearComida(nivel, ocupadas, aleatorio = Math.random) {
    const tomadas = new Set(ocupadas);
    const livres = [];
    for (let casa = 0; casa < totalDeCasas(nivel); casa++) if (!tomadas.has(casa)) livres.push(casa);
    if (livres.length === 0) return -1;
    return livres[Math.floor(aleatorio() * livres.length)];
  }

  const congelar = (dados) =>
    Object.freeze({
      ...dados,
      corpo: Object.freeze(dados.corpo),
      direcao: Object.freeze(dados.direcao),
      pendente: Object.freeze(dados.pendente),
      terminada: dados.motivo !== null,
      vitoria: dados.motivo === MOTIVOS.CHEIO,
      cabeca: dados.corpo[0],
    });

  // ---------- Partida ----------

  /** Começa no meio do tabuleiro, com três casas na horizontal e indo para a direita. */
  function iniciar(nivel, aleatorio = Math.random) {
    const linha = Math.floor(nivel.linhas / 2);
    const coluna = Math.floor(nivel.colunas / 2);
    const corpo = [];
    for (let i = 0; i < TAMANHO_INICIAL; i++) corpo.push(indice(nivel, linha, coluna - i));
    return congelar({
      nivel: nivel.id,
      corpo,
      direcao: DIRECOES.direita,
      pendente: DIRECOES.direita,
      comida: sortearComida(nivel, corpo, aleatorio),
      pontos: 0,
      comidas: 0,
      motivo: null,
    });
  }

  const direcao = (valor) => (typeof valor === "string" ? DIRECOES[valor] || null : DIRECOES[valor?.id] || null);

  /**
   * Guarda a próxima direção. A comparação é com a direção do último passo, então duas curvas no
   * mesmo passo não conseguem virar a cobra de ponta-cabeça dentro dela mesma.
   */
  function girar(estado, nova) {
    if (estado.terminada) return estado;
    const alvo = direcao(nova);
    if (!alvo) return estado;
    if (alvo.id === estado.direcao.id) return estado;
    if (alvo.id === OPOSTAS[estado.direcao.id]) return estado;
    return Object.freeze({ ...estado, pendente: alvo });
  }

  const morrer = (estado, motivo, passo) =>
    Object.freeze({ ...congelar({ ...estado, motivo }), direcao: passo, pendente: passo });

  /** Um passo: anda, come, cresce e confere o fim da partida. */
  function avancar(estado, aleatorio = Math.random) {
    if (estado.terminada) return estado;
    const nivel = NIVEIS[estado.nivel];
    const passo = estado.pendente;
    const linha = linhaDaCasa(nivel, estado.cabeca) + passo.linha;
    const coluna = colunaDaCasa(nivel, estado.cabeca) + passo.coluna;
    if (linha < 0 || linha >= nivel.linhas || coluna < 0 || coluna >= nivel.colunas) {
      return morrer(estado, MOTIVOS.PAREDE, passo);
    }

    const novaCabeca = indice(nivel, linha, coluna);
    const comeu = novaCabeca === estado.comida;
    // Sem comer, a cauda sai neste passo e a casa dela fica livre
    const corpoQueFica = comeu ? estado.corpo : estado.corpo.slice(0, -1);
    if (corpoQueFica.includes(novaCabeca)) return morrer(estado, MOTIVOS.CORPO, passo);

    const corpo = [novaCabeca, ...corpoQueFica];
    const base = { ...estado, corpo, direcao: passo, pendente: passo };
    if (!comeu) return congelar(base);

    const pontos = estado.pontos + PONTOS_POR_COMIDA;
    const comidas = estado.comidas + 1;
    const comida = sortearComida(nivel, corpo, aleatorio);
    // Tabuleiro cheio: não há onde pôr a próxima fruta, então a partida termina em vitória
    if (comida === -1) return congelar({ ...base, pontos, comidas, comida: -1, motivo: MOTIVOS.CHEIO });
    return congelar({ ...base, pontos, comidas, comida });
  }

  /** Milissegundos entre os passos: a cada fruta, um pouco mais rápido, até o limite. */
  function intervaloDo(nivel, comidas) {
    const aceleracao = Math.min(ACELERACAO_MAXIMA, Math.max(0, comidas) * ACELERACAO_POR_COMIDA);
    return Math.max(INTERVALO_MINIMO, nivel.intervalo - aceleracao);
  }

  /** Objeto simples para o localStorage. */
  const paraSalvar = (estado) => ({
    nivel: estado.nivel,
    corpo: [...estado.corpo],
    direcao: estado.direcao.id,
    comida: estado.comida,
    pontos: estado.pontos,
    comidas: estado.comidas,
  });

  /** Volta a partida salva; qualquer dado estranho devolve null (a tela começa outra). */
  function restaurar(dados) {
    if (!dados || typeof dados !== "object") return null;
    const nivel = NIVEIS[dados.nivel];
    if (!nivel) return null;
    const total = totalDeCasas(nivel);
    const { corpo, comida, pontos } = dados;
    if (!Array.isArray(corpo) || corpo.length < TAMANHO_INICIAL) return null;
    if (!corpo.every((casa) => Number.isInteger(casa) && casa >= 0 && casa < total)) return null;
    if (new Set(corpo).size !== corpo.length) return null;
    if (!Number.isInteger(comida) || comida < 0 || comida >= total || corpo.includes(comida)) return null;
    if (!Number.isInteger(pontos) || pontos < 0) return null;
    const passo = direcao(dados.direcao) || DIRECOES.direita;
    const comidas = Number.isInteger(dados.comidas) && dados.comidas >= 0 ? dados.comidas : Math.floor(pontos / PONTOS_POR_COMIDA);
    return congelar({
      nivel: nivel.id,
      corpo: [...corpo],
      direcao: passo,
      pendente: passo,
      comida,
      pontos,
      comidas,
      motivo: null,
    });
  }

  // ---------- Recordes ----------

  const RECORDES_ZERO = Object.freeze({ facil: 0, medio: 0, dificil: 0 });

  /** Recordes salvos, por nível; dado inválido vira zero. */
  function recordesDe(dados) {
    const recordes = { ...RECORDES_ZERO };
    if (!dados || typeof dados !== "object") return recordes;
    for (const id of Object.keys(RECORDES_ZERO)) {
      if (Number.isInteger(dados[id]) && dados[id] >= 0) recordes[id] = dados[id];
    }
    return recordes;
  }

  /** Devolve os recordes novos (ou os mesmos, se a pontuação não passou do recorde). */
  const atualizarRecorde = (recordes, nivel, pontos) =>
    pontos > (recordes[nivel.id] ?? 0) ? { ...recordes, [nivel.id]: pontos } : recordes;

  return {
    DIRECOES,
    OPOSTAS,
    NIVEIS,
    PONTOS_POR_COMIDA,
    TAMANHO_INICIAL,
    INTERVALO_MINIMO,
    MOTIVOS,
    RECORDES_ZERO,
    totalDeCasas,
    indice,
    linhaDaCasa,
    colunaDaCasa,
    nomeDaCasa,
    sortearComida,
    iniciar,
    girar,
    avancar,
    intervaloDo,
    paraSalvar,
    restaurar,
    recordesDe,
    atualizarRecorde,
  };
})();

if (typeof module === "object") module.exports = LogicaCobrinha;
