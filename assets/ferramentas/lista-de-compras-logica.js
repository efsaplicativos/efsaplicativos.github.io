"use strict";
/*
 * Regras da Lista de Compras, portadas do app Android (com.emerson1981.listacompras):
 * - logica/Numeros.kt: leitura de quantidade e preço com vírgula ou ponto e formatação dos campos;
 * - logica/Calculos.kt: subtotal e totais em centavos exatos (o app usa BigDecimal; aqui, BigInt);
 * - logica/RegrasItens.kt: nomes únicos, ordem alfabética do português e fim da compra;
 * - ui/ListaViewModel.kt: as ações sobre a lista (adicionar, renomear, excluir, marcar...).
 * Sem DOM: também roda no node, nos testes.
 */
const LogicaListaCompras = (() => {
  const TAMANHO_MAXIMO = 9;
  const TAMANHO_MAXIMO_NOME = 80;

  // ---------- Números (Numeros.kt) ----------

  /** Filtro do campo: só dígitos, vírgula e ponto, com tamanho limitado. */
  function limparEntrada(texto) {
    return Array.from(String(texto ?? ""))
      .filter((c) => (c >= "0" && c <= "9") || c === "," || c === ".")
      .slice(0, TAMANHO_MAXIMO)
      .join("");
  }

  const contar = (texto, caractere) => texto.split(caractere).length - 1;

  function agrupamentoDeMilhar(texto, separador) {
    const partes = texto.split(separador);
    return partes[0].length >= 1 && partes[0].length <= 3 && partes.slice(1).every((p) => p.length === 3);
  }

  /**
   * Aceita "1,5", "1.5", "1.234,56", "1,234.56", "R$ 12,90", ",5" e "3,".
   * Com um único separador ele é o decimal; repetido, só vale como separador de milhar.
   * Devolve null para texto vazio ou inválido (inclusive negativo).
   */
  function analisar(texto) {
    const limpo = String(texto ?? "").replace(/R\$/g, "").replace(/\s/g, "");
    if (!/[0-9]/.test(limpo) || /[^0-9,.]/.test(limpo)) return null;

    const ultimaVirgula = limpo.lastIndexOf(",");
    const ultimoPonto = limpo.lastIndexOf(".");
    let normalizado;
    if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
      const decimal = ultimaVirgula > ultimoPonto ? "," : ".";
      const milhar = decimal === "," ? "." : ",";
      if (contar(limpo, decimal) > 1) return null;
      normalizado = limpo.split(milhar).join("").replace(decimal, ".");
    } else {
      const separador = ultimaVirgula >= 0 ? "," : ultimoPonto >= 0 ? "." : null;
      if (separador === null) normalizado = limpo;
      else if (contar(limpo, separador) === 1) normalizado = limpo.replace(separador, ".");
      else if (agrupamentoDeMilhar(limpo, separador)) normalizado = limpo.split(separador).join("");
      else return null;
    }
    const valor = Number(normalizado);
    return Number.isFinite(valor) && valor >= 0 ? valor : null;
  }

  /**
   * Número em decimal exato { digitos, casas } a partir da sua representação mais curta, como o
   * BigDecimal.valueOf(Double) do app: 0.1 vira 1 × 10⁻¹, e não 0,1000000000000000055...
   */
  function decimalExato(valor) {
    let texto = String(valor);
    let expoente = 0;
    const e = texto.search(/e/i);
    if (e >= 0) {
      expoente = Number(texto.slice(e + 1));
      texto = texto.slice(0, e);
    }
    const [inteiro, fracao = ""] = texto.split(".");
    let casas = fracao.length - expoente;
    let digitos = BigInt(inteiro + fracao);
    if (casas < 0) {
      digitos *= 10n ** BigInt(-casas);
      casas = 0;
    }
    return { digitos, casas };
  }

  /** Arredonda um decimal exato (não negativo) para [casas] casas: metade para cima ou metade par. */
  function arredondar({ digitos, casas }, alvo, metadePar = false) {
    if (casas <= alvo) return digitos * 10n ** BigInt(alvo - casas);
    const divisor = 10n ** BigInt(casas - alvo);
    const quociente = digitos / divisor;
    const dobroResto = (digitos % divisor) * 2n;
    if (dobroResto > divisor) return quociente + 1n;
    if (dobroResto < divisor) return quociente;
    return metadePar && quociente % 2n === 0n ? quociente : quociente + 1n;
  }

  /** Inteiro escalado (1250 com 2 casas) para "12,50", sem separador de milhar. */
  function textoDecimal(escalado, casas, minimoCasas) {
    const texto = escalado.toString().padStart(casas + 1, "0");
    const inteiro = texto.slice(0, texto.length - casas);
    let fracao = casas ? texto.slice(-casas) : "";
    while (fracao.length > minimoCasas && fracao.endsWith("0")) fracao = fracao.slice(0, -1);
    return fracao ? `${inteiro},${fracao}` : inteiro;
  }

  /** Centavos (BigInt) para "R$ 1.234,56". */
  function formatarMoeda(centavos) {
    const valor = BigInt(centavos);
    const negativo = valor < 0n;
    const absoluto = negativo ? -valor : valor;
    const reais = (absoluto / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const resto = (absoluto % 100n).toString().padStart(2, "0");
    return `${negativo ? "-" : ""}R$ ${reais},${resto}`;
  }

  /** "2", "1,5", "0,333": até 3 casas, como o DecimalFormat("0.###") do app (metade par). */
  const formatarQuantidade = (valor) => textoDecimal(arredondar(decimalExato(valor), 3, true), 3, 0);

  /** "12,50", "1234,00": para preencher o campo de preço. */
  const formatarPreco = (valor) => textoDecimal(arredondar(decimalExato(valor), 2, true), 2, 2);

  /** "1 item" / "3 itens". */
  const plural = (quantidade, singular, plural) =>
    quantidade === 1 ? `1 ${singular}` : `${quantidade} ${plural}`;

  // ---------- Cálculos (Calculos.kt) ----------

  /** Quantidade × preço em centavos (BigInt), arredondado metade para cima. Quantidade vazia vale 1. */
  function subtotal(item) {
    if (item.precoUnitario == null) return 0n;
    const quantidade = decimalExato(item.quantidade ?? 1);
    const preco = decimalExato(item.precoUnitario);
    return arredondar(
      { digitos: quantidade.digitos * preco.digitos, casas: quantidade.casas + preco.casas },
      2,
    );
  }

  const soma = (itens) => itens.reduce((total, item) => total + subtotal(item), 0n);

  function resumo(itens) {
    const naLista = itens.filter((item) => item.naLista);
    const comprados = naLista.filter((item) => item.comprado);
    return {
      quantidadeItens: naLista.length,
      quantidadeComprados: comprados.length,
      /** Soma dos itens já marcados (no carrinho). */
      totalCarrinho: soma(comprados),
      /** Soma de todos os itens da lista que têm preço. */
      totalEstimado: soma(naLista),
      progresso: naLista.length === 0 ? 0 : comprados.length / naLista.length,
    };
  }

  // ---------- Itens (RegrasItens.kt) ----------

  // Mesmas forças do Collator do app: PRIMARY ignora maiúsculas e acentos, SECONDARY só maiúsculas
  const colecaoPrimaria = new Intl.Collator("pt-BR", { sensitivity: "base" });
  const colecaoSecundaria = new Intl.Collator("pt-BR", { sensitivity: "accent" });

  const normalizarNome = (nome) => String(nome ?? "").trim().replace(/\s+/g, " ");

  /** "Pão" e " pao " são o mesmo item. */
  function nomeJaExiste(nome, itens, ignorarId = null) {
    const alvo = normalizarNome(nome);
    return itens.some(
      (item) => item.id !== ignorarId && colecaoPrimaria.compare(normalizarNome(item.nome), alvo) === 0,
    );
  }

  /** Ordem alfabética do português (acentos no lugar certo, sem separar maiúsculas). */
  const ordenar = (itens) =>
    [...itens].sort((a, b) => colecaoSecundaria.compare(a.nome, b.nome) || a.id - b.id);

  const novoId = (itens, agora) =>
    Math.max(agora, itens.reduce((maior, item) => Math.max(maior, item.id), 0) + 1);

  /**
   * Encerra a compra: os itens saem da lista e perdem quantidade, preço e marcação.
   * Com [manterNaoComprados], o que não foi marcado continua na lista para a próxima vez.
   */
  const finalizarCompra = (itens, manterNaoComprados) =>
    itens.map((item) => {
      if (!item.naLista) return item;
      if (manterNaoComprados && !item.comprado) return item;
      return { ...item, naLista: false, quantidade: null, precoUnitario: null, comprado: false };
    });

  // ---------- Ações (ListaViewModel.kt) ----------

  /** "vazio", "duplicado" ou null quando o nome pode ser usado. */
  function validarNome(nome, itens, ignorarId = null) {
    if (!nome) return "vazio";
    if (nomeJaExiste(nome, itens, ignorarId)) return "duplicado";
    return null;
  }

  function adicionar(itens, nome, agora) {
    const limpo = normalizarNome(nome);
    const erro = validarNome(limpo, itens);
    if (erro) return { resultado: erro, itens };
    const item = {
      id: novoId(itens, agora),
      nome: limpo,
      criadoEm: new Date(agora).toISOString(),
      naLista: false,
      quantidade: null,
      precoUnitario: null,
      comprado: false,
    };
    return { resultado: "ok", itens: ordenar([...itens, item]), item };
  }

  function renomear(itens, id, nome) {
    const limpo = normalizarNome(nome);
    const erro = validarNome(limpo, itens, id);
    if (erro) return { resultado: erro, itens };
    return { resultado: "ok", itens: ordenar(itens.map((i) => (i.id === id ? { ...i, nome: limpo } : i))) };
  }

  const atualizar = (itens, id, transformacao) => itens.map((i) => (i.id === id ? transformacao(i) : i));

  /** Remove o item e o devolve, para o "Desfazer". */
  function excluir(itens, id) {
    const item = itens.find((i) => i.id === id) ?? null;
    return { item, itens: item ? itens.filter((i) => i.id !== id) : itens };
  }

  /** Desfaz uma exclusão ou remoção da lista, voltando o item exatamente como estava. */
  const restaurar = (itens, item) => ordenar([...itens.filter((i) => i.id !== item.id), item]);

  const alternarNaLista = (itens, id) =>
    atualizar(itens, id, (i) => (i.naLista ? { ...i, naLista: false, comprado: false } : { ...i, naLista: true }));

  const alternarComprado = (itens, id) => atualizar(itens, id, (i) => ({ ...i, comprado: !i.comprado }));

  const definirQuantidade = (itens, id, quantidade) => atualizar(itens, id, (i) => ({ ...i, quantidade }));

  const definirPreco = (itens, id, precoUnitario) => atualizar(itens, id, (i) => ({ ...i, precoUnitario }));

  /** Tira o item da lista de compras (ele continua no catálogo) e o devolve para o "Desfazer". */
  function removerDaLista(itens, id) {
    const item = itens.find((i) => i.id === id) ?? null;
    return { item, itens: item ? atualizar(itens, id, (i) => ({ ...i, naLista: false, comprado: false })) : itens };
  }

  // ---------- Armazenamento ----------

  const numeroOuNulo = (valor) => (typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? valor : null);

  /** Lê a lista salva; itens corrompidos são descartados sem perder o restante. */
  function lerItens(texto) {
    let dados;
    try {
      dados = JSON.parse(texto);
    } catch (erro) {
      return [];
    }
    if (!Array.isArray(dados)) return [];
    const ids = new Set();
    const itens = [];
    for (const bruto of dados) {
      if (!bruto || typeof bruto !== "object") continue;
      const nome = typeof bruto.nome === "string" ? normalizarNome(bruto.nome).slice(0, TAMANHO_MAXIMO_NOME) : "";
      if (!Number.isSafeInteger(bruto.id) || !nome || ids.has(bruto.id)) continue;
      ids.add(bruto.id);
      const naLista = bruto.naLista === true;
      itens.push({
        id: bruto.id,
        nome,
        criadoEm: typeof bruto.criadoEm === "string" ? bruto.criadoEm : null,
        naLista,
        quantidade: numeroOuNulo(bruto.quantidade),
        precoUnitario: numeroOuNulo(bruto.precoUnitario),
        comprado: naLista && bruto.comprado === true,
      });
    }
    return ordenar(itens);
  }

  return {
    TAMANHO_MAXIMO,
    TAMANHO_MAXIMO_NOME,
    limparEntrada,
    analisar,
    formatarMoeda,
    formatarQuantidade,
    formatarPreco,
    plural,
    subtotal,
    resumo,
    normalizarNome,
    nomeJaExiste,
    ordenar,
    novoId,
    finalizarCompra,
    adicionar,
    renomear,
    excluir,
    restaurar,
    alternarNaLista,
    alternarComprado,
    definirQuantidade,
    definirPreco,
    removerDaLista,
    lerItens,
  };
})();

// Nos testes (node), o mesmo objeto é exportado como módulo.
if (typeof module === "object") module.exports = LogicaListaCompras;
