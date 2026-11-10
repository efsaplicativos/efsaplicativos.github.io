"use strict";
/*
 * Soletra (estilo Spelling Bee / Letreco): sete letras, uma obrigatória no meio, e o objetivo é
 * formar o máximo de palavras de 3 letras ou mais, sempre usando a letra do meio.
 * Vale ponto pelo tamanho e há bônus para o pangrama (palavra que usa as sete letras).
 *
 * O dicionário é curado aqui, em pt-BR, sem acento e só com A-Z: assim a comparação é direta e o
 * jogo funciona sem rede. As rodadas são sorteadas a partir de um conjunto de letras que precisa
 * render pelo menos MIN_PALAVRAS palavras — nada de rodada sem graça.
 */
const LogicaSoletra = (() => {
  const TOTAL_LETRAS = 7;
  const MIN_LETRAS_PALAVRA = 3;
  const MIN_PALAVRAS = 12;
  const MAX_PALAVRAS = 60;
  const ALVO_PALAVRAS = 25;
  const BONUS_PANGRAMA = 7;

  const PALAVRAS = [
    // 3 letras
    "SOL MAR RIO RUA PAO MAE PAI MEL SAL CEU GEL TAL MAL BEM SEM VOO SOM FIM LUZ COR REI LEI TEU SEU MEU OVO UVA ASA AVO DIA MES BAR SIM NAO GOL",
    // 4 letras
    "AGUA CASA GATO BOLA MESA VIDA AMOR VACA GELO FOGO JOGO GEMA MAPA MALA SACO DOCE MEIA SAIA CAMA CAFE BOLO LAMA LATA VELA LOJA RODA DADO TETO REMO CAPA TACA FACA FADA LUTA MOTO HORA CERA SAPO SELO MOLA LIXO PANO VASO MIMO VILA PENA LONA",
    // 5 letras
    "LEITE CARRO FESTA LIVRO MUNDO TERRA PEDRA PRAIA FELIZ AMIGO NOITE SONHO CAMPO BANCO BANHO BICHO FERRO MOLHO TINTA TORTA PORTA SORTE DANCA PRACA FRUTA LISTA CINZA COURO FOLHA GESSO TELHA VIDRO NUVEM CULPA PONTE JUSTO VALOR CALMA FERIAS ORDEM LETRA NOMES DATAS LUGAR TEMPO CLIMA VENTO CHUVA AREIA ONDAS",
    // 6 letras ou mais
    "CAMISA JANELA CINEMA PLANTA BRANCO PRETO CIDADE PESSOA ESCOLA BANANA CAVALO GIRAFA TOMATE FLORES JARDIM VERAO INVERNO DOMINGO SABADO PLANETA LAMPADA CADEIRA MERCADO CADERNO PESCADO CAMINHO CHINELO MOCHILA PANELA XICARA TOMADA CORTINA GARRAFA FLORESTA PAISAGEM BANHEIRO COZINHA JARDINS CINEMAS CAMINHOS COMPUTADOR GELADEIRA TELEFONE",
  ];

  const semAcento = (texto) =>
    String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

  /**
   * Lista do Desvenda (assets/jogos/desvenda-palavras.js — Copyright 2021 Fernando Serboncini,
   * MIT, de https://github.com/fserb/pt-br): são palavras de 5 letras e a lista "aceitas" vem
   * sem separador, então é cortada de 5 em 5. Somada à lista curada acima, dá milhares de
   * palavras de 5 letras — justo as que mais aparecem numa rodada de Soletra.
   */
  const PALAVRA_DESVENDA = 5;

  /**
   * Só as "respostas" do Desvenda, que são as palavras comuns do jogo. A lista "aceitas" vem
   * concatenada e é a validação do pt-br (milhares de termos, muitos raros), e "acentuadas" segue a
   * mesma linha: com elas, cada rodada passaria de cem palavras e encheria de termo obscuro.
   */
  function palavrasDoDesvenda(fonte) {
    if (!fonte || typeof fonte !== "object") return [];
    const bruto = fonte.respostas;
    if (typeof bruto === "string") return bruto.trim().split(/\s+/).filter(Boolean);
    if (Array.isArray(bruto)) return bruto.filter((p) => typeof p === "string");
    return [];
  }

  const EXTERNAS = typeof PalavrasDesvenda === "object" ? PalavrasDesvenda : null;
  const DADOS = typeof SoletraDados === "object" ? SoletraDados : null;

  const palavrasDoDados = () =>
    DADOS && typeof DADOS.palavras === "string" ? DADOS.palavras.split(/\s+/).filter(Boolean) : [];

  /** Rodadas prontas do gerador (arquivo soletra-dados.js): sete letras e a letra do meio. */
  const RODADAS = (() => {
    if (!DADOS || !Array.isArray(DADOS.rodadas)) return [];
    return DADOS.rodadas
      .filter((r) => Array.isArray(r) && typeof r[0] === "string" && r[0].length === TOTAL_LETRAS)
      .map(([letras, meio]) => ({ letras: [...letras], meio: String(meio).toUpperCase() }));
  })();

  /** Dicionário único, sem acento, só A-Z, de 3 a 10 letras: curado + Desvenda + dados do gerador. */
  const DICIONARIO = Object.freeze([
    ...new Set(
      [...PALAVRAS.join(" ").split(/\s+/), ...palavrasDoDesvenda(EXTERNAS), ...palavrasDoDados()]
        .map(semAcento)
        .filter((p) => /^[A-Z]{3,10}$/.test(p)),
    ),
  ]);

  const PONTOS = { 3: 1, 4: 1, 5: 2, 6: 3, 7: 5 };

  const pontosDe = (palavra) => PONTOS[palavra.length] || 8;

  /** Letras do alfabeto com que o sorteio trabalha (sem K, W e Y, raras em português). */
  const VOGAIS = "AEIOU".split("");

  const letrasDe = (palavra) => new Set([...palavra]);

  const pangrama = (palavra, letras) => letrasDe(palavra).size === letras.length;

  /** Máscara de 26 bits com as letras do texto: descarta palavras fora da rodada em O(1). */
  const CODIGO_A = "A".charCodeAt(0);

  function mascaraDe(texto) {
    let mascara = 0;
    for (const letra of texto) mascara |= 1 << (letra.charCodeAt(0) - CODIGO_A);
    return mascara;
  }

  const MASCARAS = new Map();

  function mascaraPalavra(palavra) {
    let mascara = MASCARAS.get(palavra);
    if (mascara === undefined) {
      mascara = mascaraDe(palavra);
      MASCARAS.set(palavra, mascara);
    }
    return mascara;
  }

  const compararPalavras = (a, b) => a.length - b.length || a.localeCompare(b, "pt-BR");

  /** Palavras do dicionário que só usam as letras da rodada (uma passada por conjunto). */
  function compativeis(letras) {
    const mascaraLetras = mascaraDe(letras.join(""));
    return DICIONARIO.filter((palavra) => (mascaraPalavra(palavra) & ~mascaraLetras) === 0);
  }

  /** Palavras que dá para formar: só com as letras da rodada e sempre com a do meio. */
  function solucoes(letras, meio) {
    return compativeis(letras)
      .filter((palavra) => palavra.includes(meio))
      .sort(compararPalavras);
  }

  /** A letra do meio é a que rende mais palavras: é ela que dá o tempero da rodada. */
  function melhorMeio(letras) {
    const lista = compativeis(letras);
    let escolhida = letras[0];
    let melhorTotal = -1;
    for (const letra of letras) {
      const total = lista.filter((palavra) => palavra.includes(letra)).length;
      if (total > melhorTotal) {
        melhorTotal = total;
        escolhida = letra;
      }
    }
    return { meio: escolhida, total: melhorTotal };
  }

  const congelar = (dados) =>
    Object.freeze({
      ...dados,
      letras: Object.freeze(dados.letras),
      achadas: Object.freeze(dados.achadas),
      possiveis: Object.freeze(dados.possiveis),
    });

  /** Letras que costumam render palavra, para completar conjuntos de cinco ou seis letras. */
  const COMPLEMENTO = "SRAEIOUTMLCDPNVBGFZ";

  /** Sorteio fixo: a lista de rodadas precisa ser a mesma para todo mundo (o jogo do dia depende dela). */
  function sorteadorFixo(semente) {
    let estado = semente >>> 0;
    return () => {
      estado = (estado * 1664525 + 1013904223) >>> 0;
      return estado / 4294967296;
    };
  }

  /** Todas as rodadas possíveis: sete letras tiradas de palavras conhecidas do dicionário. */
  function montarCandidatos() {
    const conjuntos = new Map();
    const rng = sorteadorFixo(20260101);
    const anotar = (letras) => {
      const unicas = [...new Set(letras)];
      if (unicas.length !== TOTAL_LETRAS) return;
      const ordenadas = unicas.sort();
      conjuntos.set(ordenadas.join(""), ordenadas);
    };

    for (const palavra of DICIONARIO) {
      const letras = [...letrasDe(palavra)].sort();
      if (letras.length >= TOTAL_LETRAS) {
        const combinar = (inicio, atual) => {
          if (atual.length === TOTAL_LETRAS) {
            anotar(atual);
            return;
          }
          for (let i = inicio; i < letras.length; i++) combinar(i + 1, [...atual, letras[i]]);
        };
        combinar(0, []);
        continue;
      }
      if (letras.length < 5) continue;
      // Palavra curta: completa com letras do complemento até chegar a sete
      const extras = [];
      let guarda = 0;
      while (letras.length + extras.length < TOTAL_LETRAS && guarda++ < 300) {
        const letra = COMPLEMENTO[Math.floor(rng() * COMPLEMENTO.length)];
        if (!letras.includes(letra) && !extras.includes(letra)) extras.push(letra);
      }
      if (extras.length) anotar([...letras, ...extras]);
    }

    const viaveis = [];
    for (const letras of conjuntos.values()) {
      if (!letras.some((l) => VOGAIS.includes(l))) continue;
      const lista = compativeis(letras);
      if (lista.length < MIN_PALAVRAS) continue;
      // Guarda as três melhores letras do meio: variar entre elas evita rodada sempre com A no centro
      const meios = letras
        .map((letra) => ({ letra, total: lista.filter((palavra) => palavra.includes(letra)).length }))
        .filter((m) => m.total >= MIN_PALAVRAS && m.total <= MAX_PALAVRAS)
        .sort((a, b) => b.total - a.total)
        .slice(0, 3);
      if (!meios.length) continue;
      viaveis.push({ letras, lista, meios, total: meios[0].total });
    }
    return viaveis.sort((a, b) => b.total - a.total);
  }

  // Ficam as rodadas mais próximas do alvo (nem pobres, nem com palavras demais).
  // Com o arquivo de dados, as rodadas já vêm prontas e este cálculo nem roda.
  const CANDIDATOS = RODADAS.length ? [] : montarCandidatos();
  const BONS = CANDIDATOS.slice()
    .sort((a, b) => Math.abs(a.total - ALVO_PALAVRAS) - Math.abs(b.total - ALVO_PALAVRAS))
    .slice(0, Math.max(1, Math.ceil(CANDIDATOS.length / 2)));

  const RESERVA = (() => {
    const letras = [...letrasDe("MERCADO")].sort();
    const { meio } = melhorMeio(letras);
    return { letras, meio, possiveis: solucoes(letras, meio) };
  })();

  /** Sorteia uma rodada: sete letras, a do meio e as palavras possíveis. */
  function iniciar({ aleatorio = Math.random } = {}) {
    if (RODADAS.length) {
      const escolhida = RODADAS[Math.floor(aleatorio() * RODADAS.length)] || RODADAS[0];
      return congelar({
        letras: [...escolhida.letras].sort((a, b) => a.localeCompare(b, "pt-BR")),
        meio: escolhida.meio,
        possiveis: solucoes(escolhida.letras, escolhida.meio),
        achadas: [],
        pontos: 0,
        pangramas: 0,
        tentativas: 0,
      });
    }
    const base = BONS.length ? BONS[Math.floor(aleatorio() * BONS.length)] || RESERVA : RESERVA;
    const letras = [...base.letras].sort((a, b) => a.localeCompare(b, "pt-BR"));
    let meio = base.meio;
    let possiveis = base.possiveis;
    if (base.meios && base.meios.length) {
      // Sorteia entre as melhores letras do meio: mesma dificuldade, rodadas mais variadas
      const escolhido = base.meios[Math.floor(aleatorio() * base.meios.length)];
      meio = escolhido.letra;
      possiveis = base.lista.filter((palavra) => palavra.includes(meio)).sort(compararPalavras);
    }
    return congelar({ letras, meio, possiveis: [...possiveis], achadas: [], pontos: 0, pangramas: 0, tentativas: 0 });
  }

  const jaAchou = (rodada, palavra) => rodada.achadas.some((a) => a.palavra === palavra);

  const restantes = (rodada) => rodada.possiveis.filter((p) => !jaAchou(rodada, p));

  const completa = (rodada) => restantes(rodada).length === 0;

  /**
   * Tenta uma palavra. Devolve a mesma rodada quando não muda nada (repetida, inválida ou incompleta)
   * e uma rodada nova com a palavra aceita e os pontos somados quando ela vale.
   */
  function tentar(rodada, entrada) {
    const palavra = semAcento(entrada).replace(/[^A-Z]/g, "");
    if (palavra.length < MIN_LETRAS_PALAVRA) return rodada;
    const disponiveis = new Set(rodada.letras);
    if (!palavra.includes(rodada.meio)) return rodada;
    for (const letra of palavra) if (!disponiveis.has(letra)) return rodada;
    if (!rodada.possiveis.includes(palavra) || jaAchou(rodada, palavra)) return rodada;
    const ePangrama = pangrama(palavra, rodada.letras);
    const pontos = pontosDe(palavra) + (ePangrama ? BONUS_PANGRAMA : 0);
    return congelar({
      ...rodada,
      achadas: [...rodada.achadas, Object.freeze({ palavra, pontos, pangrama: ePangrama })],
      pontos: rodada.pontos + pontos,
      pangramas: rodada.pangramas + (ePangrama ? 1 : 0),
      tentativas: rodada.tentativas + 1,
    });
  }

  /** Motivo da recusa, para a tela poder explicar. */
  function motivo(rodada, entrada) {
    const palavra = semAcento(entrada).replace(/[^A-Z]/g, "");
    if (palavra.length < MIN_LETRAS_PALAVRA) return `Use ${MIN_LETRAS_PALAVRA} letras ou mais.`;
    if (!palavra.includes(rodada.meio)) return `Toda palavra precisa da letra ${rodada.meio}.`;
    const disponiveis = new Set(rodada.letras);
    for (const letra of palavra) if (!disponiveis.has(letra)) return `A letra ${letra} não está na rodada.`;
    if (jaAchou(rodada, palavra)) return `Você já achou ${palavra.toLowerCase()}.`;
    if (!rodada.possiveis.includes(palavra)) return `${palavra.toLowerCase()} não está na lista desta rodada.`;
    return "";
  }

  const pontosTotais = (rodada) =>
    rodada.possiveis.reduce((soma, p) => soma + pontosDe(p) + (pangrama(p, rodada.letras) ? BONUS_PANGRAMA : 0), 0);

  return {
    TOTAL_LETRAS,
    MIN_LETRAS_PALAVRA,
    MIN_PALAVRAS,
    MAX_PALAVRAS,
    BONUS_PANGRAMA,
    DICIONARIO,
    RODADAS,
    PONTOS,
    pontosDe,
    pangrama,
    semAcento,
    solucoes,
    iniciar,
    tentar,
    motivo,
    jaAchou,
    restantes,
    completa,
    pontosTotais,
    letrasDe,
  };
})();

if (typeof module === "object") module.exports = LogicaSoletra;
