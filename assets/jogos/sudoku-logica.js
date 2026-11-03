"use strict";
/*
 * Sudoku portado de logica/Grade.kt, Resolvedor.kt, Gerador.kt, Validador.kt, Jogo.kt e
 * Dificuldade.kt do app Sudoku Master (com.emerson1981.sudoko), e dados/Recordes.kt.
 * A grade são 81 números linha a linha (0 = casa vazia). O gerador parte de uma grade completa
 * aleatória e retira casas uma a uma, devolvendo a casa sempre que a retirada criaria uma
 * segunda solução: todo jogo tem solução única.
 */
const LogicaSudoku = (() => {
  const LADO = 9;
  const CASAS = 81;
  const VAZIA = 0;
  const MAX_DICAS = 3;
  const MAX_RECORDES = 10;
  const MAX_TENTATIVAS = 30;
  const NUMEROS = 0x3fe; // bits 1..9

  /** Casas vazias de cada nível, as mesmas do app (o Difícil deixa 26 pistas). */
  const NIVEIS = {
    facil: { id: "facil", nome: "Fácil", casasVazias: 40 },
    medio: { id: "medio", nome: "Médio", casasVazias: 50 },
    dificil: { id: "dificil", nome: "Difícil", casasVazias: 55 },
  };

  const linha = (i) => Math.floor(i / LADO);
  const coluna = (i) => i % LADO;
  const bloco = (i) => Math.floor(linha(i) / 3) * 3 + Math.floor(coluna(i) / 3);
  const indice = (l, c) => l * LADO + c;

  /** Casas que dividem linha, coluna ou bloco com cada casa (sem incluir a própria). */
  const VIZINHAS = Array.from({ length: CASAS }, (_, i) => {
    const lista = [];
    for (let j = 0; j < CASAS; j++) {
      if (j !== i && (linha(j) === linha(i) || coluna(j) === coluna(i) || bloco(j) === bloco(i))) lista.push(j);
    }
    return lista;
  });

  const saoVizinhas = (a, b) =>
    a !== b && (linha(a) === linha(b) || coluna(a) === coluna(b) || bloco(a) === bloco(b));

  /** Converte "530070000..." (0 ou '.' = vazia) em grade. */
  function deTexto(texto) {
    const limpo = String(texto).replace(/[^0-9.]/g, "");
    if (limpo.length !== CASAS) throw new Error("A grade precisa ter 81 casas");
    return Array.from(limpo, (c) => (c === "." ? VAZIA : Number(c)));
  }

  const paraTexto = (grade) => grade.join("");

  const contarBits = (n) => {
    let total = 0;
    for (; n; n &= n - 1) total++;
    return total;
  };

  // ---------- Resolvedor ----------

  /**
   * Backtracking com máscaras de bits, escolhendo sempre a casa com menos candidatos.
   * Rápido o bastante para contar soluções durante a geração dos jogos.
   */
  function criarBusca(grade, aleatorio) {
    const g = grade.slice();
    const linhas = new Array(9).fill(0);
    const colunas = new Array(9).fill(0);
    const blocos = new Array(9).fill(0);

    function iniciar() {
      for (let i = 0; i < CASAS; i++) {
        const valor = g[i];
        if (valor === VAZIA) continue;
        if (!Number.isInteger(valor) || valor < 1 || valor > 9) return false;
        const bit = 1 << valor;
        const l = linha(i);
        const c = coluna(i);
        const b = bloco(i);
        if ((linhas[l] | colunas[c] | blocos[b]) & bit) return false;
        linhas[l] |= bit;
        colunas[c] |= bit;
        blocos[b] |= bit;
      }
      return true;
    }

    const candidatos = (i) => NUMEROS & ~(linhas[linha(i)] | colunas[coluna(i)] | blocos[bloco(i)]);

    function ordem(mascara) {
      const valores = [];
      for (let v = 1; v <= 9; v++) if (mascara & (1 << v)) valores.push(v);
      if (aleatorio) {
        for (let i = valores.length - 1; i > 0; i--) {
          const j = Math.floor(aleatorio() * (i + 1));
          [valores[i], valores[j]] = [valores[j], valores[i]];
        }
      }
      return valores;
    }

    function colocar(i, valor) {
      const bit = 1 << valor;
      g[i] = valor;
      linhas[linha(i)] |= bit;
      colunas[coluna(i)] |= bit;
      blocos[bloco(i)] |= bit;
    }

    function retirar(i, valor) {
      const bit = ~(1 << valor);
      g[i] = VAZIA;
      linhas[linha(i)] &= bit;
      colunas[coluna(i)] &= bit;
      blocos[bloco(i)] &= bit;
    }

    function contar(limite, aoEncontrar) {
      let melhor = -1;
      let candidatosMelhor = 0;
      let menor = 10;
      for (let i = 0; i < CASAS; i++) {
        if (g[i] !== VAZIA) continue;
        const mascara = candidatos(i);
        const quantidade = contarBits(mascara);
        if (quantidade === 0) return 0;
        if (quantidade < menor) {
          menor = quantidade;
          melhor = i;
          candidatosMelhor = mascara;
          if (quantidade === 1) break;
        }
      }
      if (melhor === -1) {
        aoEncontrar?.(g);
        return 1;
      }
      let total = 0;
      for (const valor of ordem(candidatosMelhor)) {
        colocar(melhor, valor);
        total += contar(limite - total, aoEncontrar);
        retirar(melhor, valor);
        if (total >= limite) break;
      }
      return total;
    }

    return { iniciar, contar };
  }

  /** Uma solução da grade, ou null se ela não tiver solução (ou tiver números repetidos). */
  function resolver(grade) {
    const busca = criarBusca(grade, null);
    if (!busca.iniciar()) return null;
    let solucao = null;
    busca.contar(1, (g) => (solucao = g.slice()));
    return solucao;
  }

  /** Conta as soluções, parando ao atingir o limite. */
  function contarSolucoes(grade, limite = 2) {
    const busca = criarBusca(grade, null);
    if (!busca.iniciar()) return 0;
    return busca.contar(limite, null);
  }

  const temSolucaoUnica = (grade) => contarSolucoes(grade, 2) === 1;

  /** Uma grade completa e válida, diferente a cada chamada. */
  function gradeCompletaAleatoria(aleatorio = Math.random) {
    const busca = criarBusca(new Array(CASAS).fill(VAZIA), aleatorio);
    busca.iniciar();
    let solucao = null;
    busca.contar(1, (g) => (solucao = g.slice()));
    return solucao;
  }

  // ---------- Gerador ----------

  function embaralhados(n, aleatorio) {
    const lista = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    return lista;
  }

  function retirarCasas(solucao, alvo, aleatorio) {
    const grade = solucao.slice();
    let retiradas = 0;
    for (const i of embaralhados(CASAS, aleatorio)) {
      if (retiradas >= alvo) break;
      const valor = grade[i];
      grade[i] = VAZIA;
      if (temSolucaoUnica(grade)) retiradas++;
      else grade[i] = valor;
    }
    return grade;
  }

  const vazias = (grade) => grade.reduce((n, v) => n + (v === VAZIA ? 1 : 0), 0);

  /** Um jogo novo: o enunciado (com casas vazias) e a sua única solução. */
  function gerar(nivel, aleatorio = Math.random) {
    let melhor = null;
    for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
      const solucao = gradeCompletaAleatoria(aleatorio);
      const enunciado = retirarCasas(solucao, nivel.casasVazias, aleatorio);
      const puzzle = { enunciado, solucao };
      if (vazias(enunciado) >= nivel.casasVazias) return puzzle;
      if (!melhor || vazias(enunciado) > vazias(melhor.enunciado)) melhor = puzzle;
    }
    // Muito raro: nenhuma tentativa chegou ao alvo; usa a mais próxima (também com solução única)
    return melhor;
  }

  // ---------- Validador ----------

  const podeColocar = (grade, i, valor) => VIZINHAS[i].every((v) => grade[v] !== valor);

  /** Casas preenchidas cujo número se repete em alguma vizinha. */
  function conflitos(grade) {
    const lista = new Set();
    for (let i = 0; i < CASAS; i++) {
      const valor = grade[i];
      if (valor !== VAZIA && VIZINHAS[i].some((v) => grade[v] === valor)) lista.add(i);
    }
    return lista;
  }

  const estaResolvido = (grade) =>
    grade.length === CASAS && grade.every((v) => v >= 1 && v <= 9) && conflitos(grade).size === 0;

  // ---------- Partida ----------
  // Imutável: cada jogada devolve um novo objeto, ou o mesmo quando não muda nada.
  // notas guarda as anotações a lápis de cada casa como máscara de bits (bit n = número n).

  function novoJogo(nivel, puzzle) {
    return {
      nivel: nivel.id,
      enunciado: puzzle.enunciado.slice(),
      solucao: puzzle.solucao.slice(),
      valores: puzzle.enunciado.slice(),
      notas: new Array(CASAS).fill(0),
      erros: 0,
      dicasUsadas: 0,
      tempoMs: 0,
    };
  }

  const fixa = (jogo, i) => jogo.enunciado[i] !== VAZIA;
  const correta = (jogo, i) => jogo.valores[i] !== VAZIA && jogo.valores[i] === jogo.solucao[i];
  const errada = (jogo, i) => jogo.valores[i] !== VAZIA && jogo.valores[i] !== jogo.solucao[i];
  /** Casas que o jogador ainda pode mudar: nem pistas do enunciado nem números já certos. */
  const editavel = (jogo, i) => !fixa(jogo, i) && !correta(jogo, i);
  const temNota = (jogo, i, n) => (jogo.notas[i] & (1 << n)) !== 0;
  const concluido = (jogo) => jogo.valores.every((v, i) => v === jogo.solucao[i]);
  const dicasRestantes = (jogo) => Math.max(0, MAX_DICAS - jogo.dicasUsadas);

  /** Números que já ocupam corretamente as 9 casas em que aparecem. */
  function numerosCompletos(jogo) {
    const certos = new Array(10).fill(0);
    for (let i = 0; i < CASAS; i++) if (correta(jogo, i)) certos[jogo.valores[i]]++;
    const completos = new Set();
    for (let n = 1; n <= 9; n++) if (certos[n] === 9) completos.add(n);
    return completos;
  }

  /** Casas vazias ou erradas, onde uma dica faz sentido. */
  function casasParaDica(jogo) {
    const lista = [];
    for (let i = 0; i < CASAS; i++) if (editavel(jogo, i)) lista.push(i);
    return lista;
  }

  const comValor = (lista, i, valor) => {
    const copia = lista.slice();
    copia[i] = valor;
    return copia;
  };

  function retirarNotaDasVizinhas(notas, i, numero) {
    const mascara = ~(1 << numero);
    for (const v of VIZINHAS[i]) notas[v] &= mascara;
  }

  /** Coloca o número na casa. Um número diferente da solução conta como erro. */
  function colocar(jogo, i, numero) {
    if (!editavel(jogo, i) || jogo.valores[i] === numero) return jogo;
    const certo = numero === jogo.solucao[i];
    const notas = comValor(jogo.notas, i, 0);
    if (certo) retirarNotaDasVizinhas(notas, i, numero);
    return { ...jogo, valores: comValor(jogo.valores, i, numero), notas, erros: certo ? jogo.erros : jogo.erros + 1 };
  }

  function alternarNota(jogo, i, numero) {
    if (fixa(jogo, i) || jogo.valores[i] !== VAZIA) return jogo;
    return { ...jogo, notas: comValor(jogo.notas, i, jogo.notas[i] ^ (1 << numero)) };
  }

  function apagar(jogo, i) {
    if (!editavel(jogo, i) || (jogo.valores[i] === VAZIA && jogo.notas[i] === 0)) return jogo;
    return { ...jogo, valores: comValor(jogo.valores, i, VAZIA), notas: comValor(jogo.notas, i, 0) };
  }

  function aplicarDica(jogo, i) {
    if (dicasRestantes(jogo) === 0 || !editavel(jogo, i)) return jogo;
    const numero = jogo.solucao[i];
    const notas = comValor(jogo.notas, i, 0);
    retirarNotaDasVizinhas(notas, i, numero);
    return { ...jogo, valores: comValor(jogo.valores, i, numero), notas, dicasUsadas: jogo.dicasUsadas + 1 };
  }

  /** Confere uma partida lida do armazenamento antes de continuar com ela. */
  function jogoValido(jogo) {
    if (!jogo || typeof jogo !== "object" || !Object.hasOwn(NIVEIS, jogo.nivel)) return false;
    const listas = [jogo.enunciado, jogo.solucao, jogo.valores, jogo.notas];
    if (!listas.every((l) => Array.isArray(l) && l.length === CASAS && l.every(Number.isInteger))) return false;
    if (!estaResolvido(jogo.solucao)) return false;
    for (let i = 0; i < CASAS; i++) {
      const pista = jogo.enunciado[i];
      if (pista !== VAZIA && (pista !== jogo.solucao[i] || jogo.valores[i] !== pista)) return false;
      if (jogo.valores[i] < 0 || jogo.valores[i] > 9 || jogo.notas[i] < 0 || jogo.notas[i] > NUMEROS) return false;
    }
    return [jogo.erros, jogo.dicasUsadas, jogo.tempoMs].every((n) => Number.isFinite(n) && n >= 0);
  }

  // ---------- Recordes ----------

  const ordemRecordes = (a, b) => a.segundos - b.segundos || a.data - b.data;

  /**
   * Junta o novo tempo à lista, mantendo só os 10 melhores (empate: o mais antigo primeiro).
   * Devolve a nova lista e a posição do novo tempo (0 = recorde; -1 se ficou de fora).
   */
  function inserirRecorde(lista, novo) {
    const resultado = [...lista, novo].sort(ordemRecordes).slice(0, MAX_RECORDES);
    return { lista: resultado, posicao: resultado.indexOf(novo) };
  }

  function lerRecordes(dados) {
    if (!Array.isArray(dados)) return [];
    return dados
      .filter((r) => r && Number.isInteger(r.segundos) && r.segundos > 0 && Number.isFinite(r.data) && r.data >= 0)
      .map((r) => ({ segundos: r.segundos, data: r.data }))
      .sort(ordemRecordes)
      .slice(0, MAX_RECORDES);
  }

  /** "05:07", ou "1:02:03" a partir de uma hora. */
  function formatarTempo(segundos) {
    const total = Math.max(0, Math.floor(segundos));
    const horas = Math.floor(total / 3600);
    const minutos = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const seg = String(total % 60).padStart(2, "0");
    return horas > 0 ? `${horas}:${minutos}:${seg}` : `${minutos}:${seg}`;
  }

  return {
    LADO,
    CASAS,
    VAZIA,
    MAX_DICAS,
    MAX_RECORDES,
    NIVEIS,
    VIZINHAS,
    linha,
    coluna,
    bloco,
    indice,
    saoVizinhas,
    deTexto,
    paraTexto,
    resolver,
    contarSolucoes,
    temSolucaoUnica,
    gradeCompletaAleatoria,
    gerar,
    podeColocar,
    conflitos,
    estaResolvido,
    novoJogo,
    fixa,
    correta,
    errada,
    editavel,
    temNota,
    concluido,
    dicasRestantes,
    numerosCompletos,
    casasParaDica,
    colocar,
    alternarNota,
    apagar,
    aplicarDica,
    jogoValido,
    inserirRecorde,
    lerRecordes,
    formatarTempo,
  };
})();

if (typeof module === "object") module.exports = LogicaSudoku;
