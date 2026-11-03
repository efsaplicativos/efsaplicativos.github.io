"use strict";
/*
 * Consulta de CEP na ViaCEP, portada do app Pesquisa CEP: dados/Cep.kt, ViaCepUrls.kt,
 * Endereco.kt (com ValidacaoEndereco), ParserViaCep.kt, ErroBusca.kt, Estados.kt e
 * RepositorioCep.kt. A rede entra por um cliente injetável, como o ClienteHttp do app, para os
 * testes simularem a ViaCEP. Resultados: { ok: true, valor } ou { ok: false, erro: "NOME_DO_ERRO" }.
 */
const LogicaCep = (() => {
  // ---------- Cep.kt: 8 algarismos, exibidos como 00000-000 ----------

  const TOTAL_DIGITOS = 8;
  const DIGITOS_ANTES_DO_HIFEN = 5;

  const Cep = {
    TOTAL_DIGITOS,

    /** Mantém só os algarismos 0-9 (no máximo 8), para aceitar textos colados como "01.310-100". */
    limpar: (texto) => String(texto ?? "").replace(/[^0-9]/g, "").slice(0, TOTAL_DIGITOS),

    /** Verdadeiro quando o texto tem exatamente 8 algarismos (com ou sem máscara). */
    valido: (texto) => (String(texto ?? "").match(/[0-9]/g) || []).length === TOTAL_DIGITOS,

    /** Aplica a máscara 00000-000, inclusive em textos parciais enquanto a pessoa digita. */
    formatar(texto) {
      const digitos = Cep.limpar(texto);
      if (digitos.length <= DIGITOS_ANTES_DO_HIFEN) return digitos;
      return `${digitos.slice(0, DIGITOS_ANTES_DO_HIFEN)}-${digitos.slice(DIGITOS_ANTES_DO_HIFEN)}`;
    },

    /** Posição do cursor no texto com máscara a partir da posição nos algarismos. */
    posicaoNaMascara: (posicaoDigitos) =>
      posicaoDigitos <= DIGITOS_ANTES_DO_HIFEN ? posicaoDigitos : posicaoDigitos + 1,

    /** Posição nos algarismos a partir da posição do cursor no texto com máscara. */
    posicaoNosDigitos(posicaoMascara, totalDigitos) {
      const posicao = posicaoMascara <= DIGITOS_ANTES_DO_HIFEN ? posicaoMascara : posicaoMascara - 1;
      return Math.min(Math.max(posicao, 0), totalDigitos);
    },
  };

  // ---------- Estados.kt ----------

  const ESTADOS = [
    ["AC", "Acre"],
    ["AL", "Alagoas"],
    ["AP", "Amapá"],
    ["AM", "Amazonas"],
    ["BA", "Bahia"],
    ["CE", "Ceará"],
    ["DF", "Distrito Federal"],
    ["ES", "Espírito Santo"],
    ["GO", "Goiás"],
    ["MA", "Maranhão"],
    ["MT", "Mato Grosso"],
    ["MS", "Mato Grosso do Sul"],
    ["MG", "Minas Gerais"],
    ["PA", "Pará"],
    ["PB", "Paraíba"],
    ["PR", "Paraná"],
    ["PE", "Pernambuco"],
    ["PI", "Piauí"],
    ["RJ", "Rio de Janeiro"],
    ["RN", "Rio Grande do Norte"],
    ["RS", "Rio Grande do Sul"],
    ["RO", "Rondônia"],
    ["RR", "Roraima"],
    ["SC", "Santa Catarina"],
    ["SP", "São Paulo"],
    ["SE", "Sergipe"],
    ["TO", "Tocantins"],
  ].map(([sigla, nome]) => ({ sigla, nome }));

  const estadoPorSigla = (sigla) => ESTADOS.find((estado) => estado.sigla === sigla) ?? null;

  // ---------- ViaCepUrls.kt ----------

  const BASE = "https://viacep.com.br/ws";

  const semAcentos = (texto) => texto.normalize("NFD").replace(/\p{Mn}+/gu, "");

  /**
   * Codifica um trecho do caminho como o URLEncoder do Java, que também troca ! ' ( ) ~ por
   * %XX. O espaço vira %20: um "+" a ViaCEP entende como o caractere "+" (e responde 404).
   */
  function segmento(texto) {
    let limpo = semAcentos(String(texto ?? "").trim()).replace(/\s+/g, " ");
    if (typeof limpo.toWellFormed === "function") limpo = limpo.toWellFormed();
    return encodeURIComponent(limpo).replace(
      /[!'()~]/g,
      (caractere) => `%${caractere.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  }

  const ViaCepUrls = {
    porCep: (cep) => `${BASE}/${Cep.limpar(cep)}/json/`,
    porEndereco: (uf, cidade, logradouro) =>
      `${BASE}/${segmento(uf)}/${segmento(cidade)}/${segmento(logradouro)}/json/`,
    segmento,
    semAcentos,
  };

  // ---------- Endereco.kt ----------

  const CAMPOS = ["cep", "logradouro", "complemento", "unidade", "bairro", "localidade", "uf", "estado", "ddd", "ibge"];

  /** Endereço como a ViaCEP devolve; campos ausentes ficam vazios. */
  function criarEndereco(dados) {
    const endereco = {};
    for (const campo of CAMPOS) endereco[campo] = String(dados[campo] ?? "");
    return endereco;
  }

  const juntar = (separador, ...partes) =>
    partes
      .map((parte) => String(parte ?? "").trim())
      .filter((parte) => parte !== "")
      .join(separador);

  const Endereco = {
    criar: criarEndereco,

    cepFormatado: (endereco) => Cep.formatar(endereco.cep) || endereco.cep,

    /** Complemento e unidade (ex.: "2064 · Shopping Center III"). */
    detalhe: (endereco) => juntar(" · ", endereco.complemento, endereco.unidade),

    cidadeUf: (endereco) => juntar(" - ", endereco.localidade, endereco.uf),

    bairroCidade: (endereco) => juntar(" • ", endereco.bairro, Endereco.cidadeUf(endereco)),

    /** Cidades com CEP único não têm logradouro nem bairro. */
    cepGeralDoMunicipio: (endereco) => endereco.logradouro.trim() === "",

    /** Texto para copiar ou compartilhar: "Praça da Sé, lado ímpar - Sé, São Paulo - SP, CEP 01001-000". */
    textoCompleto(endereco) {
      const rua = juntar(", ", endereco.logradouro, endereco.complemento);
      const local = juntar(", ", endereco.bairro, Endereco.cidadeUf(endereco));
      const texto = juntar(" - ", rua, local);
      const cep = Endereco.cepFormatado(endereco);
      return texto === "" ? `CEP ${cep}` : `${texto}, CEP ${cep}`;
    },

    /** Consulta para o mapa; sem o complemento, que costuma confundir a busca. */
    consultaMapa: (endereco) =>
      juntar(
        ", ",
        endereco.logradouro,
        endereco.bairro,
        Endereco.cidadeUf(endereco),
        Endereco.cepFormatado(endereco),
        "Brasil",
      ),

    /** O mesmo link que o app abre quando o aparelho não tem app de mapas. */
    urlMapa: (endereco) =>
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(Endereco.consultaMapa(endereco))}`,
  };

  const ValidacaoEndereco = {
    /** A ViaCEP só aceita cidade e logradouro com pelo menos 3 caracteres. */
    MINIMO_CARACTERES: 3,
    textoSuficiente: (texto) => String(texto ?? "").trim().length >= ValidacaoEndereco.MINIMO_CARACTERES,
    podeBuscar: (cidade, logradouro) =>
      ValidacaoEndereco.textoSuficiente(cidade) && ValidacaoEndereco.textoSuficiente(logradouro),
  };

  // ---------- ParserViaCep.kt ----------

  /** Corpo que não é o JSON esperado (no app, JSONException). */
  class ErroJson extends Error {
    constructor(mensagem) {
      super(mensagem);
      this.name = "ErroJson";
    }
  }

  function lerJson(texto) {
    try {
      return JSON.parse(texto);
    } catch (erro) {
      throw new ErroJson("A resposta não é JSON");
    }
  }

  const ehObjeto = (valor) => typeof valor === "object" && valor !== null && !Array.isArray(valor);

  // A API antiga mandava {"erro": true}; a atual manda {"erro": "true"}
  function indicaErro(objeto) {
    const valor = objeto.erro;
    if (typeof valor === "boolean") return valor;
    if (typeof valor === "string") return valor.toLowerCase() === "true";
    return false;
  }

  // Nulo ou ausente vira texto vazio; números (DDD, IBGE) viram texto
  function texto(objeto, nome) {
    const valor = objeto[nome];
    if (valor === null || valor === undefined) return "";
    return (typeof valor === "object" ? JSON.stringify(valor) : String(valor)).trim();
  }

  function enderecoDe(objeto) {
    const endereco = {};
    for (const campo of CAMPOS) endereco[campo] = texto(objeto, campo);
    return endereco;
  }

  const ParserViaCep = {
    /** Endereço de uma consulta por CEP, ou null quando a ViaCEP responde que o CEP não existe. */
    endereco(json) {
      const objeto = lerJson(String(json).trim());
      if (!ehObjeto(objeto)) throw new ErroJson("Era esperado um endereço");
      return indicaErro(objeto) ? null : enderecoDe(objeto);
    },

    /** Lista de uma consulta por UF/cidade/logradouro. */
    lista(json) {
      const conteudo = String(json).trim();
      if (conteudo.startsWith("{")) {
        const objeto = lerJson(conteudo);
        if (ehObjeto(objeto) && indicaErro(objeto)) return [];
        throw new ErroJson("Era esperada uma lista de endereços");
      }
      const itens = lerJson(conteudo);
      if (!Array.isArray(itens)) throw new ErroJson("Era esperada uma lista de endereços");
      return itens.filter((item) => ehObjeto(item) && !indicaErro(item)).map(enderecoDe);
    },
  };

  // ---------- ErroBusca.kt ----------

  const erro = (titulo, mensagem, podeTentarDeNovo) => Object.freeze({ titulo, mensagem, podeTentarDeNovo });

  const ERROS = Object.freeze({
    CEP_INCOMPLETO: erro("CEP incompleto", "O CEP deve ter 8 dígitos.", false),
    ENDERECO_INCOMPLETO: erro(
      "Dados incompletos",
      "Informe a cidade e o nome da rua com pelo menos 3 caracteres cada.",
      false,
    ),
    CEP_NAO_ENCONTRADO: erro(
      "CEP não encontrado",
      "Esse CEP não existe na base dos Correios. Confira os números e tente novamente.",
      false,
    ),
    NENHUM_RESULTADO: erro(
      "Nenhum endereço encontrado",
      "Confira o estado, a cidade e o nome da rua (sem número) e tente novamente.",
      false,
    ),
    NENHUM_RESULTADO_PARCIAL: erro(
      "Nenhum endereço encontrado",
      "Alguns estados não responderam, então a busca pode estar incompleta. Tente novamente.",
      true,
    ),
    DADOS_INVALIDOS: erro("Dados inválidos", "O serviço de CEP recusou a consulta. Confira os dados digitados.", false),
    SEM_CONEXAO: erro(
      "Sem conexão",
      "Não foi possível acessar a internet. Verifique o Wi-Fi ou os dados móveis e tente novamente.",
      true,
    ),
    FALHA_CONEXAO: erro("Falha na conexão", "A conexão com o serviço de CEP foi interrompida. Tente novamente.", true),
    TEMPO_ESGOTADO: erro(
      "Tempo esgotado",
      "O serviço de CEP demorou demais para responder. Verifique sua internet e tente novamente.",
      true,
    ),
    MUITAS_CONSULTAS: erro(
      "Muitas consultas",
      "Foram feitas muitas consultas seguidas. Aguarde um pouco e tente novamente.",
      true,
    ),
    SERVIDOR: erro("Serviço indisponível", "O serviço de CEP está fora do ar no momento. Tente novamente mais tarde.", true),
    RESPOSTA_INVALIDA: erro("Resposta inesperada", "O serviço de CEP respondeu algo inesperado. Tente novamente.", true),
  });

  /** Erro correspondente a um status HTTP, ou null quando a resposta é de sucesso. */
  function deStatusHttp(codigo) {
    if (codigo >= 200 && codigo <= 299) return null;
    if (codigo === 400) return "DADOS_INVALIDOS";
    if (codigo === 404) return "NENHUM_RESULTADO";
    if (codigo === 429) return "MUITAS_CONSULTAS";
    return "SERVIDOR";
  }

  /** Falha de rede já classificada pelo cliente (tempo esgotado, sem conexão...). */
  function erroDeRede(nome) {
    const falha = new Error(ERROS[nome].titulo);
    falha.name = "ErroRede";
    falha.erroBusca = nome;
    return falha;
  }

  /** Equivalente ao ErroBusca.deExcecao do app, para as exceções do navegador. */
  function erroDeExcecao(excecao) {
    if (excecao && typeof excecao.erroBusca === "string" && ERROS[excecao.erroBusca]) return excecao.erroBusca;
    if (excecao instanceof ErroJson) return "RESPOSTA_INVALIDA";
    if (excecao && excecao.name === "TimeoutError") return "TEMPO_ESGOTADO";
    // fetch rejeita com TypeError quando a conexão cai ou não abre (o IOException do app)
    if (excecao instanceof TypeError || (excecao && excecao.name === "AbortError")) return "FALHA_CONEXAO";
    return "RESPOSTA_INVALIDA";
  }

  // ---------- ClienteHttp.kt: GET com tempo limite ----------

  const TEMPO_LIMITE_MS = 15000;

  /**
   * Cria o cliente com o fetch do navegador (ou um falso, nos testes). Devolve uma função
   * url → Promise<{ codigo, corpo }> que rejeita com erroDeRede(...) em falhas de rede.
   * [online] informa se o navegador acha que há internet (navigator.onLine).
   */
  function criarCliente(fetchFn, { tempoMs = TEMPO_LIMITE_MS, online = () => true } = {}) {
    return async function get(url) {
      const controle = typeof AbortController === "function" ? new AbortController() : null;
      let temporizador = 0;
      const limite = new Promise((_, rejeitar) => {
        temporizador = setTimeout(() => {
          if (controle) controle.abort();
          rejeitar(erroDeRede("TEMPO_ESGOTADO"));
        }, tempoMs);
      });
      const pedido = (async () => {
        const resposta = await fetchFn(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controle ? controle.signal : undefined,
        });
        return { codigo: resposta.status, corpo: await resposta.text() };
      })();
      // Depois do tempo esgotado o pedido abortado ainda rejeita: ninguém mais espera por ele
      pedido.catch(() => {});
      try {
        return await Promise.race([pedido, limite]);
      } catch (excecao) {
        if (excecao && excecao.erroBusca) throw excecao;
        if (excecao instanceof TypeError) {
          throw erroDeRede(online() === false ? "SEM_CONEXAO" : "FALHA_CONEXAO");
        }
        throw excecao;
      } finally {
        clearTimeout(temporizador);
      }
    };
  }

  // ---------- RepositorioCep.kt ----------

  const MAX_SIMULTANEAS = 5;
  const LIMITE_POR_ESTADO = 50;

  const sucesso = (valor) => ({ ok: true, valor });
  const falha = (nome) => ({ ok: false, erro: nome });

  /** Junta as respostas de cada estado, na ordem da lista de estados. */
  function combinar(parciais) {
    const sucessos = parciais.filter((parcial) => parcial.ok);
    const falhas = parciais.filter((parcial) => !parcial.ok);
    const enderecos = sucessos.flatMap((parcial) => parcial.valor);
    if (enderecos.length > 0) {
      return sucesso({
        enderecos,
        estadosSemResposta: falhas.length,
        limiteAtingido: sucessos.some((parcial) => parcial.valor.length >= LIMITE_POR_ESTADO),
      });
    }
    if (falhas.length === 0) return falha("NENHUM_RESULTADO");
    if (sucessos.length === 0) return falha(falhas[0].erro);
    return falha("NENHUM_RESULTADO_PARCIAL");
  }

  /** [cliente]: url → { codigo, corpo } (ou Promise disso), como o ClienteHttp do app. */
  function criarRepositorio(cliente) {
    async function baixar(url) {
      try {
        const resposta = await cliente(url);
        const erroHttp = deStatusHttp(resposta.codigo);
        return erroHttp ? falha(erroHttp) : sucesso(resposta.corpo);
      } catch (excecao) {
        return falha(erroDeExcecao(excecao));
      }
    }

    function converter(bloco) {
      try {
        return bloco();
      } catch (excecao) {
        if (excecao instanceof ErroJson) return falha("RESPOSTA_INVALIDA");
        throw excecao;
      }
    }

    async function buscarPorCep(cep) {
      if (!Cep.valido(cep)) return falha("CEP_INCOMPLETO");
      const resposta = await baixar(ViaCepUrls.porCep(cep));
      if (!resposta.ok) return resposta.erro === "NENHUM_RESULTADO" ? falha("CEP_NAO_ENCONTRADO") : resposta;
      return converter(() => {
        const endereco = ParserViaCep.endereco(resposta.valor);
        if (!endereco) return falha("CEP_NAO_ENCONTRADO");
        return sucesso(endereco.cep.trim() ? endereco : { ...endereco, cep: Cep.formatar(cep) });
      });
    }

    async function buscarNoEstado(uf, cidade, logradouro) {
      const resposta = await baixar(ViaCepUrls.porEndereco(uf, cidade, logradouro));
      if (!resposta.ok) return resposta.erro === "NENHUM_RESULTADO" ? sucesso([]) : resposta;
      return converter(() => sucesso(ParserViaCep.lista(resposta.valor)));
    }

    /**
     * Busca por logradouro. Sem [uf] consulta os 27 estados, no máximo 5 por vez para não
     * sobrecarregar a ViaCEP. [aoProgredir] recebe (concluídos, total).
     */
    async function buscarPorEndereco(uf, cidade, logradouro, aoProgredir = () => {}) {
      if (!ValidacaoEndereco.podeBuscar(cidade, logradouro)) return falha("ENDERECO_INCOMPLETO");
      const siglas = uf && String(uf).trim() ? [uf] : ESTADOS.map((estado) => estado.sigla);
      const parciais = new Array(siglas.length);
      let proximo = 0;
      let concluidos = 0;
      aoProgredir(0, siglas.length);

      async function trabalhar() {
        while (proximo < siglas.length) {
          const indice = proximo++;
          parciais[indice] = await buscarNoEstado(siglas[indice], cidade, logradouro);
          concluidos++;
          aoProgredir(concluidos, siglas.length);
        }
      }

      const trabalhadores = Math.min(MAX_SIMULTANEAS, siglas.length);
      await Promise.all(Array.from({ length: trabalhadores }, trabalhar));
      return combinar(parciais);
    }

    return { buscarPorCep, buscarPorEndereco };
  }

  /** "03/11/2026 14:05", no horário do aparelho. */
  function dataHora(instante) {
    const data = new Date(instante);
    const dois = (numero) => String(numero).padStart(2, "0");
    return (
      `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()} ` +
      `${dois(data.getHours())}:${dois(data.getMinutes())}`
    );
  }

  return {
    Cep,
    ESTADOS,
    estadoPorSigla,
    ViaCepUrls,
    Endereco,
    ValidacaoEndereco,
    ParserViaCep,
    ErroJson,
    ERROS,
    deStatusHttp,
    erroDeRede,
    erroDeExcecao,
    TEMPO_LIMITE_MS,
    criarCliente,
    MAX_SIMULTANEAS,
    LIMITE_POR_ESTADO,
    combinar,
    criarRepositorio,
    dataHora,
  };
})();

// Nos testes (node), o mesmo objeto é exportado como módulo.
if (typeof module === "object") module.exports = LogicaCep;
