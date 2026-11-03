"use strict";
// Testes da Consulta CEP: os mesmos casos de CepTest.kt, ViaCepUrlsTest.kt, ParserViaCepTest.kt,
// EnderecoTest.kt e RepositorioCepTest.kt do app Pesquisa CEP (a ViaCEP é simulada).
// Rode com: node _fonte/testes/consulta-cep.test.js
const assert = require("node:assert/strict");
const L = require("../../assets/ferramentas/consulta-cep-logica.js");

const { Cep, ViaCepUrls, Endereco, ValidacaoEndereco, ParserViaCep } = L;

const testes = [];
const teste = (nome, corpo) => testes.push({ nome, corpo });

// ---------- CepTest ----------

teste("limpar mantém só oito algarismos", () => {
  assert.equal(Cep.limpar("01.310-100"), "01310100");
  assert.equal(Cep.limpar(" 01310-1009999 "), "01310100");
  assert.equal(Cep.limpar("abc-"), "");
  // Algarismos de outros alfabetos não são aceitos pela ViaCEP
  assert.equal(Cep.limpar("1٣2"), "12");
});

teste("válido exige exatamente oito algarismos", () => {
  assert.equal(Cep.valido("01001000"), true);
  assert.equal(Cep.valido("01001-000"), true);
  assert.equal(Cep.valido("0100100"), false);
  assert.equal(Cep.valido("010010000"), false);
  assert.equal(Cep.valido(""), false);
});

teste("formatar aplica a máscara parcial e completa", () => {
  assert.equal(Cep.formatar(""), "");
  assert.equal(Cep.formatar("0100"), "0100");
  assert.equal(Cep.formatar("01001"), "01001");
  assert.equal(Cep.formatar("010010"), "01001-0");
  assert.equal(Cep.formatar("01001000"), "01001-000");
  assert.equal(Cep.formatar("01001-000"), "01001-000");
});

teste("posições do cursor pulam o hífen", () => {
  assert.equal(Cep.posicaoNaMascara(3), 3);
  assert.equal(Cep.posicaoNaMascara(5), 5);
  assert.equal(Cep.posicaoNaMascara(6), 7);
  assert.equal(Cep.posicaoNaMascara(8), 9);

  assert.equal(Cep.posicaoNosDigitos(5, 8), 5);
  assert.equal(Cep.posicaoNosDigitos(6, 8), 5);
  assert.equal(Cep.posicaoNosDigitos(9, 8), 8);
  assert.equal(Cep.posicaoNosDigitos(9, 4), 4);
});

teste("validação do endereço exige três caracteres sem contar espaços", () => {
  assert.equal(ValidacaoEndereco.podeBuscar("São Paulo", "Paulista"), true);
  assert.equal(ValidacaoEndereco.podeBuscar("  SP  ", "Paulista"), false);
  assert.equal(ValidacaoEndereco.podeBuscar("Santos", "Av"), false);
  assert.equal(ValidacaoEndereco.podeBuscar("Ilha", "Rua"), true);
});

// ---------- ViaCepUrlsTest ----------

teste("URL da busca por CEP usa só os algarismos", () => {
  assert.equal(ViaCepUrls.porCep("01001-000"), "https://viacep.com.br/ws/01001000/json/");
});

teste("espaço vira %20 e não +", () => {
  assert.equal(
    ViaCepUrls.porEndereco("SP", "São Paulo", "Avenida Paulista"),
    "https://viacep.com.br/ws/SP/Sao%20Paulo/Avenida%20Paulista/json/",
  );
});

teste("segmento tira acentos e espaços extras e codifica símbolos", () => {
  assert.equal(ViaCepUrls.segmento("  Embu-Guaçu "), "Embu-Guacu");
  assert.equal(ViaCepUrls.segmento("Pau  d'Arco"), "Pau%20d%27Arco");
  assert.equal(ViaCepUrls.segmento("João/Maria"), "Joao%2FMaria");
  assert.equal(ViaCepUrls.segmento("Conceição do Araguaia"), "Conceicao%20do%20Araguaia");
});

// ---------- ParserViaCepTest ----------

const pracaDaSe = `
{
  "cep": "01001-000",
  "logradouro": "Praça da Sé",
  "complemento": "lado ímpar",
  "unidade": "",
  "bairro": "Sé",
  "localidade": "São Paulo",
  "uf": "SP",
  "estado": "São Paulo",
  "regiao": "Sudeste",
  "ibge": "3550308",
  "gia": "1004",
  "ddd": "11",
  "siafi": "7107"
}`;

teste("lê o endereço completo", () => {
  const endereco = ParserViaCep.endereco(pracaDaSe);
  assert.equal(endereco.cep, "01001-000");
  assert.equal(endereco.logradouro, "Praça da Sé");
  assert.equal(endereco.complemento, "lado ímpar");
  assert.equal(endereco.bairro, "Sé");
  assert.equal(endereco.localidade, "São Paulo");
  assert.equal(endereco.uf, "SP");
  assert.equal(endereco.estado, "São Paulo");
  assert.equal(endereco.ddd, "11");
  assert.equal(endereco.ibge, "3550308");
});

teste("erro como texto ou booleano significa CEP inexistente", () => {
  assert.equal(ParserViaCep.endereco('{"erro": "true"}'), null);
  assert.equal(ParserViaCep.endereco('{"erro": true}'), null);
});

teste("campos nulos ou ausentes viram texto vazio", () => {
  const endereco = ParserViaCep.endereco('{"cep": "69900-000", "logradouro": null, "uf": "AC"}');
  assert.equal(endereco.logradouro, "");
  assert.equal(endereco.bairro, "");
  assert.equal(endereco.uf, "AC");
  assert.equal(Endereco.cepGeralDoMunicipio(endereco), true);
});

teste("lê a lista da busca por rua", () => {
  const json = `
    [
      {"cep": "01310-100", "logradouro": "Avenida Paulista", "complemento": "de 612 a 1510 - lado par",
       "unidade": "", "bairro": "Bela Vista", "localidade": "São Paulo", "uf": "SP"},
      {"cep": "01310-928", "logradouro": "Avenida Paulista", "complemento": "2064",
       "unidade": "Shopping Center III", "bairro": "Bela Vista", "localidade": "São Paulo", "uf": "SP"}
    ]`;
  const lista = ParserViaCep.lista(json);
  assert.equal(lista.length, 2);
  assert.equal(lista[0].cep, "01310-100");
  assert.equal(Endereco.detalhe(lista[1]), "2064 · Shopping Center III");
});

teste("lista vazia ou com erro não tem endereços", () => {
  assert.deepEqual(ParserViaCep.lista("[]"), []);
  assert.deepEqual(ParserViaCep.lista('{"erro": true}'), []);
});

teste("página HTML não é JSON válido", () => {
  assert.throws(() => ParserViaCep.endereco("<!DOCTYPE HTML><html><title>ViaCEP 400</title></html>"), L.ErroJson);
});

teste("objeto sem erro no lugar da lista é inválido", () => {
  assert.throws(() => ParserViaCep.lista(pracaDaSe), L.ErroJson);
});

// ---------- EnderecoTest ----------

const se = Endereco.criar({
  cep: "01001-000",
  logradouro: "Praça da Sé",
  complemento: "lado ímpar",
  bairro: "Sé",
  localidade: "São Paulo",
  uf: "SP",
});

teste("texto completo para copiar e compartilhar", () => {
  assert.equal(Endereco.textoCompleto(se), "Praça da Sé, lado ímpar - Sé, São Paulo - SP, CEP 01001-000");
});

teste("consulta do mapa não leva complemento", () => {
  assert.equal(Endereco.consultaMapa(se), "Praça da Sé, Sé, São Paulo - SP, 01001-000, Brasil");
  assert.equal(
    Endereco.urlMapa(se),
    "https://www.google.com/maps/search/?api=1&query=Pra%C3%A7a%20da%20S%C3%A9%2C%20S%C3%A9%2C%20S%C3%A3o%20Paulo%20-%20SP%2C%2001001-000%2C%20Brasil",
  );
});

teste("CEP geral do município sem rua nem bairro", () => {
  const rioBranco = Endereco.criar({ cep: "69900000", localidade: "Rio Branco", uf: "AC" });
  assert.equal(Endereco.cepGeralDoMunicipio(rioBranco), true);
  assert.equal(Endereco.cepGeralDoMunicipio(se), false);
  assert.equal(Endereco.cepFormatado(rioBranco), "69900-000");
  assert.equal(Endereco.bairroCidade(rioBranco), "Rio Branco - AC");
  assert.equal(Endereco.textoCompleto(rioBranco), "Rio Branco - AC, CEP 69900-000");
});

teste("linha de bairro e cidade", () => {
  assert.equal(Endereco.bairroCidade(se), "Sé • São Paulo - SP");
  assert.equal(Endereco.bairroCidade(Endereco.criar({ cep: "01001000" })), "");
  assert.equal(Endereco.textoCompleto(Endereco.criar({ cep: "01001000" })), "CEP 01001-000");
});

// ---------- RepositorioCepTest ----------

const ok = (corpo) => ({ codigo: 200, corpo });
const item = (cep, uf) =>
  `{"cep": "${cep}", "logradouro": "Rua Teste", "bairro": "Centro", "localidade": "Cidade", "uf": "${uf}"}`;
const espera = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** Repositório com cliente falso que anota as URLs pedidas. */
function repositorio(responder) {
  const urls = [];
  const repo = L.criarRepositorio(async (url) => {
    urls.push(url);
    return responder(url);
  });
  return { repo, urls };
}

/** Repositório com o cliente de verdade sobre um fetch falso. */
function repositorioComFetch(fetchFalso, opcoes) {
  return L.criarRepositorio(L.criarCliente(fetchFalso, opcoes));
}

teste("busca por CEP com sucesso", async () => {
  const { repo, urls } = repositorio(() => ok(item("01001-000", "SP")));
  const r = await repo.buscarPorCep("01001-000");
  assert.equal(r.ok, true);
  assert.equal(r.valor.uf, "SP");
  assert.deepEqual(urls, ["https://viacep.com.br/ws/01001000/json/"]);
});

teste("CEP inexistente", async () => {
  const { repo } = repositorio(() => ok('{"erro": "true"}'));
  assert.deepEqual(await repo.buscarPorCep("99999999"), { ok: false, erro: "CEP_NAO_ENCONTRADO" });
});

teste("CEP incompleto nem chega à rede", async () => {
  const { repo, urls } = repositorio(() => {
    throw new Error("não deveria consultar");
  });
  assert.deepEqual(await repo.buscarPorCep("0100"), { ok: false, erro: "CEP_INCOMPLETO" });
  assert.equal(urls.length, 0);
});

teste("sem internet e tempo esgotado", async () => {
  const semRede = repositorio(() => {
    throw L.erroDeRede("SEM_CONEXAO");
  });
  assert.deepEqual(await semRede.repo.buscarPorCep("01001000"), { ok: false, erro: "SEM_CONEXAO" });
  const lento = repositorio(() => {
    throw L.erroDeRede("TEMPO_ESGOTADO");
  });
  assert.deepEqual(await lento.repo.buscarPorCep("01001000"), { ok: false, erro: "TEMPO_ESGOTADO" });
});

teste("status HTTP de erro e resposta HTML", async () => {
  const com = (codigo, corpo) => repositorio(() => ({ codigo, corpo })).repo.buscarPorCep("01001000");
  assert.deepEqual(await com(400, "<html>ViaCEP 400</html>"), { ok: false, erro: "DADOS_INVALIDOS" });
  assert.deepEqual(await com(429, ""), { ok: false, erro: "MUITAS_CONSULTAS" });
  assert.deepEqual(await com(503, ""), { ok: false, erro: "SERVIDOR" });
  assert.deepEqual(await com(200, "<html>manutenção</html>"), { ok: false, erro: "RESPOSTA_INVALIDA" });
});

teste("busca por rua em um estado", async () => {
  const { repo, urls } = repositorio(() => ok(`[${item("01310-100", "SP")}]`));
  const r = await repo.buscarPorEndereco("SP", "São Paulo", "Paulista");
  assert.equal(r.ok, true);
  assert.equal(r.valor.enderecos.length, 1);
  assert.deepEqual(urls, ["https://viacep.com.br/ws/SP/Sao%20Paulo/Paulista/json/"]);
});

teste("rua com menos de três letras não consulta", async () => {
  const { repo, urls } = repositorio(() => {
    throw new Error("não deveria consultar");
  });
  assert.deepEqual(await repo.buscarPorEndereco("SP", "São Paulo", "Av"), { ok: false, erro: "ENDERECO_INCOMPLETO" });
  assert.equal(urls.length, 0);
});

teste("todos os estados juntam resultados na ordem e informam o progresso", async () => {
  let simultaneas = 0;
  let maximo = 0;
  const progresso = [];
  const { repo, urls } = repositorio(async (url) => {
    simultaneas++;
    maximo = Math.max(maximo, simultaneas);
    await espera(15);
    simultaneas--;
    if (url.includes("/RJ/")) return ok(`[${item("20000-000", "RJ")}]`);
    if (url.includes("/BA/")) return ok(`[${item("40000-000", "BA")}]`);
    return ok("[]");
  });
  const r = await repo.buscarPorEndereco(null, "Bom Jesus", "Principal", (feitos, total) => {
    assert.equal(total, 27);
    progresso.push(feitos);
  });

  assert.deepEqual(r.valor.enderecos.map((endereco) => endereco.uf), ["BA", "RJ"]);
  assert.equal(urls.length, 27);
  assert.equal(progresso.at(-1), 27);
  assert.ok(maximo <= L.MAX_SIMULTANEAS, `no máximo ${L.MAX_SIMULTANEAS} consultas ao mesmo tempo (foram ${maximo})`);
});

teste("todos os estados sem internet avisam a falta de conexão", async () => {
  const { repo } = repositorio(() => {
    throw L.erroDeRede("SEM_CONEXAO");
  });
  // No React Native as 27 falhas viravam "Nenhum endereço encontrado"
  assert.deepEqual(await repo.buscarPorEndereco("", "Santos", "Praia"), { ok: false, erro: "SEM_CONEXAO" });
});

teste("combinar resultados parciais", () => {
  const sp = Endereco.criar({ cep: "01001-000", uf: "SP" });
  const falha = { ok: false, erro: "TEMPO_ESGOTADO" };
  const vazio = { ok: true, valor: [] };

  const parcial = L.combinar([{ ok: true, valor: [sp] }, falha, vazio]);
  assert.deepEqual(parcial.valor, { enderecos: [sp], estadosSemResposta: 1, limiteAtingido: false });

  assert.deepEqual(L.combinar([vazio, vazio]), { ok: false, erro: "NENHUM_RESULTADO" });
  assert.deepEqual(L.combinar([vazio, falha]), { ok: false, erro: "NENHUM_RESULTADO_PARCIAL" });
  assert.deepEqual(L.combinar([falha, falha]), falha);

  const cinquenta = { ok: true, valor: Array.from({ length: 50 }, () => sp) };
  assert.equal(L.combinar([cinquenta]).valor.limiteAtingido, true);
});

teste("rua 404 conta como nenhum resultado", async () => {
  const { repo } = repositorio(() => ({ codigo: 404, corpo: "<html>ViaCEP 404</html>" }));
  assert.deepEqual(await repo.buscarPorEndereco("SP", "Santos", "Inexistente"), { ok: false, erro: "NENHUM_RESULTADO" });
});

// ---------- Cliente com fetch (equivalente web do ClienteHttpPadrao) ----------

teste("cliente: falha de rede vira 'Sem conexão' offline e 'Falha na conexão' online", async () => {
  const quebrado = async () => {
    throw new TypeError("Failed to fetch");
  };
  const offline = repositorioComFetch(quebrado, { online: () => false });
  assert.deepEqual(await offline.buscarPorCep("01001000"), { ok: false, erro: "SEM_CONEXAO" });
  const online = repositorioComFetch(quebrado, { online: () => true });
  assert.deepEqual(await online.buscarPorCep("01001000"), { ok: false, erro: "FALHA_CONEXAO" });
});

teste("cliente: resposta lenta é abortada e vira 'Tempo esgotado'", async () => {
  let abortado = false;
  const lento = (url, { signal }) =>
    new Promise((_, rejeitar) => {
      signal.addEventListener("abort", () => {
        abortado = true;
        rejeitar(new DOMException("Abortado", "AbortError"));
      });
    });
  const repo = repositorioComFetch(lento, { tempoMs: 30 });
  assert.deepEqual(await repo.buscarPorCep("01001000"), { ok: false, erro: "TEMPO_ESGOTADO" });
  assert.equal(abortado, true);
});

teste("cliente: repassa status e corpo e pede JSON sem cache", async () => {
  let pedido = null;
  const repo = repositorioComFetch(async (url, opcoes) => {
    pedido = { url, opcoes };
    return { status: 200, text: async () => pracaDaSe };
  });
  const r = await repo.buscarPorCep("01001-000");
  assert.equal(r.valor.logradouro, "Praça da Sé");
  assert.equal(pedido.url, "https://viacep.com.br/ws/01001000/json/");
  assert.equal(pedido.opcoes.headers.Accept, "application/json");
  assert.equal(pedido.opcoes.cache, "no-store");
});

teste("status HTTP do app e textos dos erros", () => {
  assert.equal(L.deStatusHttp(200), null);
  assert.equal(L.deStatusHttp(299), null);
  assert.equal(L.deStatusHttp(404), "NENHUM_RESULTADO");
  assert.equal(L.deStatusHttp(500), "SERVIDOR");
  assert.equal(L.ERROS.TEMPO_ESGOTADO.titulo, "Tempo esgotado");
  assert.equal(L.ERROS.SEM_CONEXAO.podeTentarDeNovo, true);
  assert.equal(L.ERROS.CEP_NAO_ENCONTRADO.podeTentarDeNovo, false);
  assert.equal(L.ESTADOS.length, 27);
  assert.equal(L.estadoPorSigla("SP").nome, "São Paulo");
});

teste("data e hora da consulta", () => {
  assert.equal(L.dataHora(new Date(2026, 10, 3, 9, 5).getTime()), "03/11/2026 09:05");
});

(async () => {
  for (const { nome, corpo } of testes) {
    await corpo();
    console.log(`ok - ${nome}`);
  }
  console.log(`\n${testes.length} testes passaram.`);
})().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
