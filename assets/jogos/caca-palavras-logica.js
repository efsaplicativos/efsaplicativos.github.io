"use strict";
/*
 * Regras do Caça-palavras: temas, montagem da grade, seleção em linha reta, dica, partida salva e
 * recordes. Não mexe na página, para rodar também nos testes (node).
 *
 * A grade guarda as letras sem acento e em maiúsculas (MAÇÃ vira MACA na grade); a lista de
 * palavras mostra a forma com acento.
 */
const LogicaCacaPalavras = (() => {
  // Direções como [linha, coluna]: → ↓ ↘ ↗ e, no difícil, também as de trás para frente
  const DIRECOES_TODAS = [
    [0, 1],
    [1, 0],
    [1, 1],
    [-1, 1],
    [0, -1],
    [-1, 0],
    [-1, -1],
    [1, -1],
  ];
  // minimos: quantas palavras de cada tipo toda grade do nível tem, no mínimo, para o nível nunca
  // sair sem diagonais ou sem palavras de trás para frente
  const NIVEIS = {
    facil: {
      id: "facil",
      nome: "Fácil",
      lado: 8,
      palavras: 6,
      direcoes: DIRECOES_TODAS.slice(0, 2),
      minimos: { horizontal: 2, vertical: 2 },
    },
    medio: {
      id: "medio",
      nome: "Médio",
      lado: 10,
      palavras: 8,
      direcoes: DIRECOES_TODAS.slice(0, 4),
      minimos: { horizontal: 1, vertical: 1, diagonal: 3 },
    },
    dificil: {
      id: "dificil",
      nome: "Difícil",
      lado: 12,
      palavras: 10,
      direcoes: DIRECOES_TODAS,
      minimos: { horizontal: 1, vertical: 1, diagonal: 3, invertida: 3 },
    },
  };
  const ORDEM_NIVEIS = ["facil", "medio", "dificil"];
  const MIN_LETRAS = 3;
  const PENALIDADE_DICA_S = 15;
  const LIMITE_RECORDES = 20;

  const TEMAS = {
    animais: {
      nome: "Animais",
      palavras:
        "cachorro gato cavalo girafa elefante macaco tigre leão zebra coelho tartaruga jacaré onça capivara " +
        "papagaio coruja golfinho baleia formiga abelha borboleta sapo cobra pato galinha vaca ovelha raposa " +
        "lobo urso camelo tucano pinguim tubarão",
    },
    frutas: {
      nome: "Frutas",
      palavras:
        "banana maçã laranja uva abacaxi manga morango melancia mamão goiaba caju limão pera cereja ameixa " +
        "pêssego acerola maracujá jabuticaba pitanga carambola coco framboesa melão figo graviola açaí " +
        "tangerina caqui amora",
    },
    cores: {
      nome: "Cores",
      palavras:
        "vermelho azul verde amarelo laranja roxo rosa preto branco cinza marrom bege lilás violeta dourado " +
        "prata vinho turquesa anil creme magenta ciano salmão caramelo",
    },
    paises: {
      nome: "Países",
      palavras:
        "brasil argentina chile peru uruguai paraguai bolívia méxico canadá portugal espanha frança itália " +
        "alemanha japão china índia egito angola rússia grécia cuba colômbia equador venezuela marrocos " +
        "suécia noruega holanda irlanda",
    },
    profissoes: {
      nome: "Profissões",
      palavras:
        "médico professor bombeiro policial padeiro pintor motorista advogado dentista cozinheiro enfermeiro " +
        "engenheiro jardineiro carteiro piloto músico ator escritor fotógrafo arquiteto veterinário " +
        "costureira pedreiro eletricista barbeiro juiz cientista bailarina",
    },
    esportes: {
      nome: "Esportes",
      palavras:
        "futebol vôlei basquete tênis natação judô boxe golfe surfe skate ciclismo atletismo handebol xadrez " +
        "karatê remo esgrima rúgbi polo corrida ginástica capoeira beisebol hipismo canoagem triatlo maratona",
    },
    corpo: {
      nome: "Corpo humano",
      palavras:
        "cabeça braço perna joelho ombro cotovelo mão dedo unha olho nariz boca orelha dente língua pescoço " +
        "coração pulmão fígado cérebro estômago costas barriga cabelo testa queixo tornozelo quadril umbigo",
    },
    cozinha: {
      nome: "Cozinha",
      palavras:
        "panela frigideira colher garfo faca prato copo xícara caneca tigela concha peneira fogão forno " +
        "geladeira pia talher bandeja chaleira espátula ralador tábua jarra assadeira batedeira rolo funil",
    },
    escola: {
      nome: "Escola",
      palavras:
        "lápis caneta caderno borracha régua mochila livro quadro giz aluno recreio prova lição apontador " +
        "estojo tesoura cola mesa cadeira sala merenda uniforme agenda dicionário mapa globo compasso professora",
    },
    natureza: {
      nome: "Natureza",
      palavras:
        "árvore flor folha raiz semente rio lago mar montanha floresta cachoeira praia areia pedra nuvem chuva " +
        "vento sol lua estrela céu terra grama ilha vulcão deserto neve orvalho trovão relâmpago",
    },
    transportes: {
      nome: "Transportes",
      palavras:
        "carro ônibus bicicleta moto avião navio trem metrô barco caminhão helicóptero patinete canoa táxi " +
        "foguete submarino balão carroça jangada lancha bonde trator van iate ambulância teleférico",
    },
    musica: {
      nome: "Instrumentos musicais",
      palavras:
        "violão guitarra piano bateria flauta violino sanfona pandeiro tambor trompete saxofone cavaquinho " +
        "harpa gaita teclado triângulo berimbau clarinete trombone viola xilofone cuíca agogô tuba órgão banjo",
    },
    comidas: {
      nome: "Comidas",
      palavras:
        "arroz feijão farofa pão queijo bolo pizza macarrão sopa salada ovo frango carne peixe pastel coxinha " +
        "brigadeiro pudim tapioca cuscuz pipoca mingau biscoito sorvete chocolate lasanha panqueca feijoada " +
        "empada quindim paçoca canjica pamonha",
    },
    casa: {
      nome: "Casa",
      palavras:
        "sala quarto cozinha banheiro varanda quintal garagem telhado janela porta parede escada sofá cama " +
        "armário mesa cadeira tapete cortina espelho travesseiro lençol gaveta estante lâmpada chuveiro " +
        "almofada poltrona",
    },
    roupas: {
      nome: "Roupas",
      palavras:
        "camisa calça saia vestido bermuda meia sapato tênis chinelo bota boné chapéu casaco jaqueta blusa " +
        "cachecol luva gravata pijama sandália cinto colete macacão sunga biquíni moletom regata suéter",
    },
    espaco: {
      nome: "Espaço",
      palavras:
        "sol lua terra marte vênus júpiter saturno urano netuno mercúrio estrela cometa galáxia órbita " +
        "foguete astronauta satélite asteroide meteoro eclipse universo nebulosa telescópio cosmos constelação",
    },
  };
  const IDS_TEMAS = Object.keys(TEMAS);

  // Letras que preenchem a grade, com peso parecido com o do português (sem K, W e Y, que quase
  // não aparecem nas palavras e denunciariam o enchimento)
  const PESOS_LETRAS = {
    A: 14, E: 12, O: 10, S: 8, R: 7, I: 6, N: 5, D: 5, M: 5, U: 5, T: 4, C: 4, L: 3, P: 3,
    V: 2, G: 2, H: 1.5, B: 1.5, F: 1.5, Q: 1, Z: 1, J: 1, X: 1,
  };
  const LETRAS = Object.keys(PESOS_LETRAS);
  const SOMA_PESOS = LETRAS.reduce((s, l) => s + PESOS_LETRAS[l], 0);

  /** Tira acentos e cedilha e passa para maiúsculas: "maçã" → "MACA". */
  function normalizar(texto) {
    return String(texto)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase();
  }

  /** As palavras do tema como { texto: "maçã", chave: "MACA" }. */
  function palavrasDoTema(temaId) {
    const tema = TEMAS[temaId];
    if (!tema) return [];
    return tema.palavras
      .split(/\s+/)
      .filter(Boolean)
      .map((texto) => ({ texto, chave: normalizar(texto) }));
  }

  const temaValido = (id) => Object.hasOwn(TEMAS, id);
  const nivelValido = (id) => Object.hasOwn(NIVEIS, id);
  const inverter = (s) => [...s].reverse().join("");
  // Uma palavra dentro da outra (ou dentro dela de trás para frente) faria a menor aparecer duas vezes
  const contem = (a, b) => a.includes(b) || a.includes(inverter(b));

  /** Gerador com semente (mulberry32), para os testes repetirem a mesma grade. */
  function aleatorioComSemente(semente) {
    let s = semente >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function embaralhar(lista, aleatorio) {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  function letraAleatoria(aleatorio) {
    let r = aleatorio() * SOMA_PESOS;
    for (const l of LETRAS) {
      r -= PESOS_LETRAS[l];
      if (r < 0) return l;
    }
    return "A";
  }

  function escolherPalavras(temaId, nivel, aleatorio) {
    const candidatas = embaralhar(
      palavrasDoTema(temaId).filter((p) => p.chave.length >= MIN_LETRAS && p.chave.length <= nivel.lado),
      aleatorio,
    );
    const escolhidas = [];
    for (const p of candidatas) {
      if (escolhidas.length === nivel.palavras) break;
      if (!escolhidas.some((e) => contem(e.chave, p.chave) || contem(p.chave, e.chave))) escolhidas.push(p);
    }
    return escolhidas;
  }

  /** Casas de uma palavra que começa em (linha, coluna) e segue a direção; null se sair da grade. */
  function caminho(lado, linha, coluna, [dl, dc], tamanho) {
    const fimL = linha + dl * (tamanho - 1);
    const fimC = coluna + dc * (tamanho - 1);
    if (fimL < 0 || fimL >= lado || fimC < 0 || fimC >= lado) return null;
    const casas = [];
    for (let k = 0; k < tamanho; k++) casas.push((linha + dl * k) * lado + coluna + dc * k);
    return casas;
  }

  /** Tenta encaixar as palavras, maiores primeiro; cruzamentos só com a mesma letra. */
  function encaixar(palavras, nivel, aleatorio) {
    const { lado } = nivel;
    const grade = new Array(lado * lado).fill("");
    const colocadas = [];
    const ordem = [...palavras].sort((a, b) => b.chave.length - a.chave.length);
    const posicoes = [];
    for (let linha = 0; linha < lado; linha++) for (let coluna = 0; coluna < lado; coluna++) posicoes.push([linha, coluna]);
    for (const p of ordem) {
      // Sorteia primeiro a direção e só depois a posição: as diagonais têm menos lugares onde uma
      // palavra longa cabe e, sorteando tudo junto, quase nunca sairiam
      let celulas = null;
      for (const direcao of embaralhar(nivel.direcoes, aleatorio)) {
        for (const [linha, coluna] of embaralhar(posicoes, aleatorio)) {
          const casas = caminho(lado, linha, coluna, direcao, p.chave.length);
          if (casas && casas.every((c, k) => grade[c] === "" || grade[c] === p.chave[k])) {
            celulas = casas;
            break;
          }
        }
        if (celulas) break;
      }
      if (!celulas) return null;
      celulas.forEach((c, k) => (grade[c] = p.chave[k]));
      colocadas.push({ ...p, celulas });
    }
    // A lista volta na ordem alfabética, mais fácil de procurar
    colocadas.sort((a, b) => a.chave.localeCompare(b.chave));
    return { grade, colocadas };
  }

  /** A direção da palavra como [linha, coluna], cada uma -1, 0 ou 1. */
  function direcaoDe(lado, celulas) {
    const [a, b] = celulas;
    return [Math.sign(Math.floor(b / lado) - Math.floor(a / lado)), Math.sign((b % lado) - (a % lado))];
  }

  /**
   * Quantas palavras de cada tipo: horizontal, vertical, diagonal e invertida (lida da direita para
   * a esquerda ou de baixo para cima, inclusive nas diagonais).
   */
  function contarTipos(lado, palavras) {
    const conta = { horizontal: 0, vertical: 0, diagonal: 0, invertida: 0 };
    for (const p of palavras) {
      const [dl, dc] = direcaoDe(lado, p.celulas);
      if (dl === 0) conta.horizontal++;
      else if (dc === 0) conta.vertical++;
      else conta.diagonal++;
      if (dc < 0 || (dc === 0 && dl < 0)) conta.invertida++;
    }
    return conta;
  }

  const variedadeOk = (nivel, palavras) => {
    const conta = contarTipos(nivel.lado, palavras);
    return Object.entries(nivel.minimos).every(([tipo, n]) => conta[tipo] >= n);
  };

  /** Todas as vezes que a palavra aparece na grade, em qualquer direção (cada conjunto de casas uma vez). */
  function ocorrencias(letras, lado, chave) {
    const achadas = new Set();
    for (let linha = 0; linha < lado; linha++) {
      for (let coluna = 0; coluna < lado; coluna++) {
        if (letras[linha * lado + coluna] !== chave[0]) continue;
        for (const direcao of DIRECOES_TODAS) {
          const casas = caminho(lado, linha, coluna, direcao, chave.length);
          if (casas && casas.every((c, k) => letras[c] === chave[k])) achadas.add([...casas].sort((a, b) => a - b).join(","));
        }
      }
    }
    return achadas.size;
  }

  /**
   * Monta a grade do nível com palavras do tema. Cada palavra aparece uma vez só, para que achar a
   * palavra em outro lugar nunca seja recusado.
   */
  function montarGrade(nivelId, temaId, aleatorio = Math.random) {
    const nivel = NIVEIS[nivelId];
    if (!nivel || !temaValido(temaId)) return null;
    for (let tentativa = 0; tentativa < 200; tentativa++) {
      const palavras = escolherPalavras(temaId, nivel, aleatorio);
      if (palavras.length < nivel.palavras) return null;
      const encaixe = encaixar(palavras, nivel, aleatorio);
      // Sem a mistura de direções do nível (por exemplo, um difícil sem diagonais), monta outra
      if (!encaixe || !variedadeOk(nivel, encaixe.colocadas)) continue;
      for (let enchimento = 0; enchimento < 25; enchimento++) {
        const letras = encaixe.grade.map((l) => l || letraAleatoria(aleatorio)).join("");
        if (encaixe.colocadas.every((p) => ocorrencias(letras, nivel.lado, p.chave) === 1)) {
          return { letras, palavras: encaixe.colocadas };
        }
      }
    }
    return null;
  }

  function novaPartida(nivelId, temaId, aleatorio = Math.random) {
    const nivel = NIVEIS[nivelId] ? nivelId : "facil";
    const tema = temaValido(temaId) ? temaId : IDS_TEMAS[Math.floor(aleatorio() * IDS_TEMAS.length)];
    const grade = montarGrade(nivel, tema, aleatorio);
    return {
      v: 1,
      nivel,
      tema,
      temaEscolhido: temaValido(temaId),
      lado: NIVEIS[nivel].lado,
      letras: grade.letras,
      palavras: grade.palavras.map((p) => ({ texto: p.texto, chave: p.chave, celulas: p.celulas, achada: 0, dica: false })),
      dicas: 0,
      tempoMs: 0,
    };
  }

  // ---------- Seleção ----------

  const linhaDe = (lado, i) => Math.floor(i / lado);
  const colunaDe = (lado, i) => i % lado;

  /** Casas de a até b em linha reta (horizontal, vertical ou diagonal); null se a linha for torta. */
  function celulasEntre(lado, a, b) {
    const total = lado * lado;
    if (![a, b].every((i) => Number.isInteger(i) && i >= 0 && i < total)) return null;
    const dl = linhaDe(lado, b) - linhaDe(lado, a);
    const dc = colunaDe(lado, b) - colunaDe(lado, a);
    if (dl !== 0 && dc !== 0 && Math.abs(dl) !== Math.abs(dc)) return null;
    const passos = Math.max(Math.abs(dl), Math.abs(dc));
    const sl = Math.sign(dl);
    const sc = Math.sign(dc);
    const casas = [];
    for (let k = 0; k <= passos; k++) casas.push(a + (sl * lado + sc) * k);
    return casas;
  }

  /**
   * Para arrastar: o fim da seleção na direção (das 8) mais perto do ponto (linha, coluna), que pode
   * ser fracionário ou estar fora da grade. O fim fica sempre dentro da grade.
   */
  function fimAjustado(lado, inicio, linha, coluna) {
    const l0 = linhaDe(lado, inicio);
    const c0 = colunaDe(lado, inicio);
    const dl = linha - l0;
    const dc = coluna - c0;
    if (Math.abs(dl) < 0.5 && Math.abs(dc) < 0.5) return inicio;
    const angulo = Math.atan2(dl, dc);
    const oitavo = Math.round(angulo / (Math.PI / 4));
    const sl = Math.round(Math.sin((oitavo * Math.PI) / 4));
    const sc = Math.round(Math.cos((oitavo * Math.PI) / 4));
    // Quantas casas andar: a projeção do ponto na direção escolhida
    const passosDesejados = sl !== 0 && sc !== 0 ? Math.round((Math.abs(dl) + Math.abs(dc)) / 2) : Math.round(Math.abs(sl ? dl : dc));
    let passos = Math.max(0, passosDesejados);
    const cabe = (k) => {
      const l = l0 + sl * k;
      const c = c0 + sc * k;
      return l >= 0 && l < lado && c >= 0 && c < lado;
    };
    while (passos > 0 && !cabe(passos)) passos--;
    return (l0 + sl * passos) * lado + c0 + sc * passos;
  }

  const mesmasCasas = (x, y) => x.length === y.length && (x.every((c, k) => c === y[k]) || x.every((c, k) => c === y[y.length - 1 - k]));

  /**
   * Confere a seleção de a até b. Volta { ok: true, indice, partida } quando acha uma palavra, ou
   * { ok: false, motivo } com motivo "torta", "curta", "repetida", "nada" ou "fim".
   */
  function selecionar(partida, a, b) {
    if (terminou(partida)) return { ok: false, motivo: "fim" };
    const casas = celulasEntre(partida.lado, a, b);
    if (!casas) return { ok: false, motivo: "torta" };
    if (casas.length < MIN_LETRAS) return { ok: false, motivo: "curta" };
    const indice = partida.palavras.findIndex((p) => mesmasCasas(p.celulas, casas));
    if (indice < 0) return { ok: false, motivo: "nada" };
    if (partida.palavras[indice].achada) return { ok: false, motivo: "repetida", indice };
    const ordem = partida.palavras.filter((p) => p.achada).length + 1;
    const palavras = partida.palavras.map((p, i) => (i === indice ? { ...p, achada: ordem } : p));
    return { ok: true, indice, partida: { ...partida, palavras } };
  }

  const achadas = (partida) => partida.palavras.filter((p) => p.achada).length;
  const terminou = (partida) => partida.palavras.every((p) => p.achada);

  /**
   * Dica: mostra a primeira letra de uma palavra ainda não achada (de preferência uma que ainda não
   * teve dica). Cada dica soma PENALIDADE_DICA_S segundos ao tempo.
   */
  function darDica(partida, aleatorio = Math.random) {
    if (terminou(partida)) return null;
    const faltam = partida.palavras.map((p, i) => [p, i]).filter(([p]) => !p.achada);
    const novas = faltam.filter(([p]) => !p.dica);
    const opcoes = novas.length ? novas : faltam;
    const [palavra, indice] = opcoes[Math.floor(aleatorio() * opcoes.length)];
    const palavras = partida.palavras.map((p, i) => (i === indice ? { ...p, dica: true } : p));
    return {
      indice,
      celula: palavra.celulas[0],
      partida: { ...partida, palavras, dicas: partida.dicas + 1, tempoMs: partida.tempoMs + PENALIDADE_DICA_S * 1000 },
    };
  }

  // ---------- Partida salva ----------

  function paraSalvar(partida) {
    return JSON.stringify(partida);
  }

  /** Lê a partida gravada; qualquer coisa estranha devolve null e o jogo começa outra. */
  function restaurar(texto) {
    let p;
    try {
      p = JSON.parse(texto);
    } catch (erro) {
      return null;
    }
    if (!p || typeof p !== "object" || p.v !== 1 || !nivelValido(p.nivel) || !temaValido(p.tema)) return null;
    const lado = NIVEIS[p.nivel].lado;
    if (p.lado !== lado || typeof p.letras !== "string" || !new RegExp(`^[A-Z]{${lado * lado}}$`).test(p.letras)) return null;
    if (!Array.isArray(p.palavras) || p.palavras.length !== NIVEIS[p.nivel].palavras) return null;
    if (!Number.isInteger(p.dicas) || p.dicas < 0 || !Number.isFinite(p.tempoMs) || p.tempoMs < 0) return null;
    const ordens = new Set();
    for (const w of p.palavras) {
      if (!w || typeof w.texto !== "string" || normalizar(w.texto) !== w.chave) return null;
      if (!Array.isArray(w.celulas) || w.celulas.length !== w.chave.length) return null;
      const linha = celulasEntre(lado, w.celulas[0], w.celulas[w.celulas.length - 1]);
      if (!linha || !mesmasCasas(linha, w.celulas) || linha[0] !== w.celulas[0]) return null;
      if (!w.celulas.every((c, k) => p.letras[c] === w.chave[k])) return null;
      if (!Number.isInteger(w.achada) || w.achada < 0 || w.achada > p.palavras.length) return null;
      if (w.achada) {
        if (ordens.has(w.achada)) return null;
        ordens.add(w.achada);
      }
      if (typeof w.dica !== "boolean") return null;
    }
    return {
      v: 1,
      nivel: p.nivel,
      tema: p.tema,
      temaEscolhido: Boolean(p.temaEscolhido),
      lado,
      letras: p.letras,
      palavras: p.palavras.map((w) => ({ texto: w.texto, chave: w.chave, celulas: [...w.celulas], achada: w.achada, dica: w.dica })),
      dicas: p.dicas,
      tempoMs: p.tempoMs,
    };
  }

  // ---------- Recordes ----------

  function formatarTempo(segundos) {
    const s = Math.max(0, Math.floor(segundos));
    const horas = Math.floor(s / 3600);
    const minutos = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const resto = String(s % 60).padStart(2, "0");
    return horas > 0 ? `${horas}:${minutos}:${resto}` : `${minutos}:${resto}`;
  }

  function ranking(lista, nivelId) {
    return lista.filter((r) => r.nivel === nivelId).sort((a, b) => a.tempo - b.tempo || a.dataMs - b.dataMs);
  }

  function melhorTempo(lista, nivelId) {
    const tempos = lista.filter((r) => r.nivel === nivelId).map((r) => r.tempo);
    return tempos.length ? Math.min(...tempos) : null;
  }

  /** Acrescenta o recorde mantendo só os melhores tempos de cada nível. */
  function adicionarRecorde(lista, novo) {
    const todos = [...lista, novo];
    return ORDEM_NIVEIS.flatMap((id) => ranking(todos, id).slice(0, LIMITE_RECORDES));
  }

  /** Lê a lista gravada; itens com nível desconhecido ou números inválidos são descartados. */
  function lerRecordes(dados) {
    if (!Array.isArray(dados)) return [];
    return dados
      .filter(
        (r) =>
          r &&
          nivelValido(r.nivel) &&
          Number.isInteger(r.tempo) &&
          r.tempo >= 0 &&
          Number.isInteger(r.dicas) &&
          r.dicas >= 0 &&
          Number.isFinite(r.dataMs),
      )
      .map((r) => ({ nivel: r.nivel, tempo: r.tempo, dicas: r.dicas, dataMs: r.dataMs, tema: temaValido(r.tema) ? r.tema : null }));
  }

  /** Vitórias por nível: { facil: 3, medio: 0, dificil: 1 }. */
  function lerVitorias(dados) {
    const v = {};
    for (const id of ORDEM_NIVEIS) {
      const n = dados && dados[id];
      v[id] = Number.isInteger(n) && n > 0 ? n : 0;
    }
    return v;
  }

  const api = {
    NIVEIS,
    ORDEM_NIVEIS,
    TEMAS,
    IDS_TEMAS,
    MIN_LETRAS,
    PENALIDADE_DICA_S,
    DIRECOES_TODAS,
    normalizar,
    palavrasDoTema,
    temaValido,
    nivelValido,
    aleatorioComSemente,
    montarGrade,
    ocorrencias,
    contarTipos,
    novaPartida,
    celulasEntre,
    fimAjustado,
    selecionar,
    achadas,
    terminou,
    darDica,
    paraSalvar,
    restaurar,
    formatarTempo,
    ranking,
    melhorTempo,
    adicionarRecorde,
    lerRecordes,
    lerVitorias,
  };
  return api;
})();

if (typeof module !== "undefined") module.exports = LogicaCacaPalavras;
