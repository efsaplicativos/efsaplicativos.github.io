"use strict";
/*
 * Interface da correção pela inflação. A lógica fica em correcao-ipca-logica.js (porte de
 * core/ipca/Inflation.kt da Calculadora Multifunção); a consulta ao IBGE segue
 * core/ipca/SidraClient.kt e a tela segue ui/tools/ipca/IpcaScreen.kt e IpcaViewModel.kt,
 * com a evolução em tabela no lugar do gráfico. A série consultada fica guardada no navegador
 * para funcionar sem conexão.
 */
(() => {
  const form = document.querySelector("#correcao-ipca");
  if (!form) return;

  const L = LogicaIpca;
  const botoesIndice = form.querySelectorAll("[data-indice]");
  const botoesModo = form.querySelectorAll("[data-modo]");
  const dicaIndice = form.querySelector("#indice-dica");
  const dicaModo = form.querySelector("#modo-dica");
  const ultimoMes = form.querySelector("#ultimo-mes");
  const tentarUltimo = form.querySelector("#tentar-ultimo");
  const campoValor = form.querySelector("#campo-valor");
  const valor = form.querySelector("#valor");
  const rotuloValor = form.querySelector("#rotulo-valor");
  const selects = {
    inicioMes: form.querySelector("#inicio-mes"),
    inicioAno: form.querySelector("#inicio-ano"),
    fimMes: form.querySelector("#fim-mes"),
    fimAno: form.querySelector("#fim-ano"),
  };
  const resultado = document.querySelector("#resultado");
  const detalhes = document.querySelector("#detalhes");
  const alternarTabela = document.querySelector("#alternar-tabela");
  const tabelaMeses = document.querySelector("#tabela-meses");
  const corpoTabela = tabelaMeses.querySelector("tbody");

  const DESCRICOES_INDICE = {
    IPCA: "IPCA: inflação oficial do Brasil (famílias com renda de 1 a 40 salários mínimos).",
    INPC: "INPC: famílias com renda de 1 a 5 salários mínimos; usado em reajustes salariais e de benefícios do INSS.",
    IPCA15:
      "IPCA-15: prévia da inflação oficial, coletada da segunda quinzena do mês anterior à primeira do mês de referência.",
  };
  const DESCRICOES_MODO = {
    corrigir: "Atualiza um valor do mês inicial para o poder de compra do mês final.",
    acumulada: "Mostra apenas a inflação acumulada entre os meses escolhidos.",
    deflacionar: "Mostra quanto um valor do mês final valia no poder de compra do mês inicial.",
  };
  const ROTULOS_VALOR = {
    corrigir: "Valor no mês inicial (R$)",
    deflacionar: "Valor no mês final (R$)",
  };
  const TEMPO_LIMITE_MS = 20000;
  const ESPERA_CONSULTA_MS = 300;

  // Antes de saber o último mês publicado, usa uma estimativa (2 meses atrás), como o app.
  const hoje = new Date();
  const estimativaUltimo = L.mes(hoje.getFullYear(), hoje.getMonth() + 1) - 2;

  const estado = {
    indice: "IPCA",
    modo: "corrigir",
    fim: estimativaUltimo,
    inicio: estimativaUltimo - 11,
    tocouPeriodo: false,
    tabelaAberta: false,
  };

  // ---------- Dados salvos no navegador ----------

  const chave = (indice) => `efs-correcao-ipca-serie-${indice}`;

  function lerSalvo(indice) {
    try {
      const bruto = JSON.parse(localStorage.getItem(chave(indice)));
      if (!bruto || typeof bruto !== "object") return {};
      const serie = L.objetoParaSerie(bruto.meses);
      const ultimo = L.lerPeriodo(bruto.ultimo);
      const salvoEm = Number.isFinite(bruto.salvoEm) ? bruto.salvoEm : null;
      return { serie, ultimo: ultimo !== null && serie.has(ultimo) ? ultimo : null, salvoEm };
    } catch {
      return {};
    }
  }

  function salvar(indice) {
    const d = dados[indice];
    try {
      localStorage.setItem(
        chave(indice),
        JSON.stringify({
          meses: L.serieParaObjeto(d.serie),
          ultimo: d.ultimo === null ? null : L.formatarPeriodo(d.ultimo),
          salvoEm: d.salvoEm,
        }),
      );
    } catch {
      // Sem armazenamento disponível: a página continua funcionando só com a conexão.
    }
  }

  /** Por índice: série em memória, último mês, situação da consulta e data dos dados salvos. */
  const dados = {};
  for (const indice of Object.keys(L.INDICES)) {
    dados[indice] = { serie: new Map(), ultimo: null, situacao: "nada", salvoEm: null, ...lerSalvo(indice) };
  }

  // ---------- Consulta ao IBGE ----------

  /** Erro com a mensagem que a tela mostra. */
  class ErroConsulta extends Error {}

  async function consultar(url, sinal) {
    const limite = new AbortController();
    const tempo = setTimeout(() => limite.abort(), TEMPO_LIMITE_MS);
    const cancelar = () => limite.abort();
    sinal?.addEventListener("abort", cancelar);
    try {
      let resposta;
      try {
        resposta = await fetch(url, { signal: limite.signal, headers: { Accept: "application/json" } });
      } catch (erro) {
        if (sinal?.aborted) throw erro;
        throw new ErroConsulta(
          limite.signal.aborted
            ? "O IBGE demorou demais para responder. Tente novamente."
            : "Não foi possível consultar o IBGE. Verifique a conexão e tente novamente.",
        );
      }
      if (!resposta.ok) {
        throw new ErroConsulta("O serviço do IBGE não respondeu como esperado. Tente novamente em alguns minutos.");
      }
      try {
        return L.lerSerie(await resposta.json());
      } catch {
        throw new ErroConsulta("O IBGE enviou uma resposta que não pôde ser lida. Tente novamente mais tarde.");
      }
    } finally {
      clearTimeout(tempo);
      sinal?.removeEventListener("abort", cancelar);
    }
  }

  function juntar(indice, serie) {
    const d = dados[indice];
    for (const [m, v] of serie) if (v !== null) d.serie.set(m, v);
    d.salvoEm = Date.now();
  }

  async function carregarUltimo(indice, forcar = false) {
    const d = dados[indice];
    if (!forcar && (d.situacao === "ok" || d.situacao === "carregando")) return;
    d.situacao = "carregando";
    if (indice === estado.indice) mostrarUltimo();
    try {
      const serie = await consultar(L.urlUltimo(indice));
      const ultimo = L.ultimoPublicado(serie);
      if (ultimo === null) throw new ErroConsulta("Resposta sem período");
      juntar(indice, serie);
      d.ultimo = ultimo;
      d.situacao = "ok";
      salvar(indice);
    } catch {
      d.situacao = d.ultimo !== null ? "salvo" : "erro";
    }
    if (indice === estado.indice) {
      ajustarPeriodo();
      atualizar();
    }
  }

  let consultaAtual = null;
  let esperaConsulta = 0;

  function cancelarConsulta() {
    clearTimeout(esperaConsulta);
    consultaAtual?.abort();
    consultaAtual = null;
  }

  function consultarPeriodo(indice, inicio, fim) {
    cancelarConsulta();
    const controle = new AbortController();
    consultaAtual = controle;
    esperaConsulta = setTimeout(async () => {
      try {
        const serie = await consultar(L.urlSerie(indice, inicio, fim), controle.signal);
        if (controle.signal.aborted) return;
        if (serie.size === 0) throw new ErroConsulta("O IBGE não enviou dados para esse período. Tente novamente.");
        juntar(indice, serie);
        salvar(indice);
        consultaAtual = null;
        atualizar({ consultado: true });
      } catch (erro) {
        if (controle.signal.aborted) return;
        consultaAtual = null;
        mostrarErroConsulta(erro instanceof ErroConsulta ? erro.message : "Não foi possível consultar o IBGE.");
      }
    }, ESPERA_CONSULTA_MS);
  }

  // ---------- Período ----------

  const maximo = () => dados[estado.indice].ultimo ?? estimativaUltimo;

  /** Período padrão de 12 meses até o último mês; se o usuário já escolheu, só corrige o que passou do limite. */
  function ajustarPeriodo() {
    const max = maximo();
    const primeiro = L.INDICES[estado.indice].primeiroMes;
    if (!estado.tocouPeriodo) {
      estado.fim = max;
      estado.inicio = Math.max(primeiro, max - 11);
      return;
    }
    if (estado.fim > max) estado.fim = max;
    if (estado.inicio > max) estado.inicio = max;
  }

  function preencherAnos(select, ano, min, max) {
    const anos = [];
    for (let a = Math.max(max, ano); a >= Math.min(min, ano); a--) anos.push(a);
    const atuais = [...select.options].map((o) => Number(o.value));
    if (atuais.length !== anos.length || atuais.some((a, i) => a !== anos[i])) {
      select.replaceChildren(...anos.map((a) => new Option(String(a), String(a))));
    }
    select.value = String(ano);
  }

  function mostrarPeriodo() {
    const min = L.anoDe(L.INDICES[estado.indice].primeiroMes);
    const max = L.anoDe(maximo());
    selects.inicioMes.value = String(L.numeroDe(estado.inicio));
    selects.fimMes.value = String(L.numeroDe(estado.fim));
    preencherAnos(selects.inicioAno, L.anoDe(estado.inicio), min, max);
    preencherAnos(selects.fimAno, L.anoDe(estado.fim), min, max);
  }

  function lerPeriodo() {
    estado.inicio = L.mes(Number(selects.inicioAno.value), Number(selects.inicioMes.value));
    estado.fim = L.mes(Number(selects.fimAno.value), Number(selects.fimMes.value));
    estado.tocouPeriodo = true;
  }

  // ---------- Tela ----------

  function elemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    el.textContent = texto;
    return el;
  }

  function linha(rotulo, texto) {
    const div = document.createElement("div");
    div.append(elemento("dt", "", rotulo), elemento("dd", "", texto));
    return div;
  }

  const pct = (x) => `${Numeros.numero(x, 2, 2)}%`;

  const formatoData = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const dataSalva = (ms) => formatoData.format(new Date(ms)).replace(", ", " às ");

  function mostrarUltimo() {
    const d = dados[estado.indice];
    const nome = L.INDICES[estado.indice].nome;
    ultimoMes.classList.remove("correcao-ipca-erro");
    tentarUltimo.hidden = true;
    if (d.situacao === "ok") {
      ultimoMes.textContent = `Último mês do ${nome} divulgado pelo IBGE: ${L.mesLongo(d.ultimo)}.`;
    } else if (d.situacao === "salvo") {
      ultimoMes.textContent =
        `Sem conexão com o IBGE. Usando os dados salvos neste navegador em ${dataSalva(d.salvoEm)} ` +
        `(último mês: ${L.mesLongo(d.ultimo)}); pode haver meses mais recentes.`;
      tentarUltimo.hidden = false;
    } else if (d.situacao === "erro") {
      ultimoMes.textContent = "Não foi possível consultar o último mês divulgado. Verifique a conexão.";
      ultimoMes.classList.add("correcao-ipca-erro");
      tentarUltimo.hidden = false;
    } else {
      ultimoMes.textContent = "Consultando o último mês divulgado…";
    }
  }

  function mensagem(texto, erro = false) {
    resultado.replaceChildren(elemento("p", erro ? "result-message error" : "result-message", texto));
    detalhes.hidden = true;
  }

  function mostrarErroConsulta(texto) {
    const tentar = elemento("button", "button secondary correcao-ipca-tentar", "Tentar novamente");
    tentar.type = "button";
    tentar.addEventListener("click", () => atualizar());
    resultado.replaceChildren(elemento("p", "result-message error", texto), tentar);
    detalhes.hidden = true;
  }

  function mostrarResultado(r) {
    const nome = L.INDICES[estado.indice].nome;
    const acumulado = pct(r.acumulado);
    const lido = estado.modo === "acumulada" ? null : Numeros.ler(valor.value, { milhar: true });
    const partes = [];
    if (lido !== null && lido >= 0) {
      const convertido = L.aplicar(lido, estado.modo, r.fator);
      const corrigir = estado.modo === "corrigir";
      partes.push(
        elemento("div", "result-label", corrigir ? "Valor corrigido" : "Valor equivalente no mês inicial"),
        elemento("div", "result-value", Numeros.dinheiro(convertido)),
        elemento(
          "p",
          "result-message",
          corrigir
            ? `${Numeros.dinheiro(lido)} em ${L.mesLongo(estado.inicio)} equivalem a ${Numeros.dinheiro(convertido)} ` +
                `em ${L.mesLongo(estado.fim)}, pelo ${nome}.`
            : `${Numeros.dinheiro(lido)} em ${L.mesLongo(estado.fim)} equivaliam a ${Numeros.dinheiro(convertido)} ` +
                `em ${L.mesLongo(estado.inicio)}, pelo ${nome}.`,
        ),
      );
    } else {
      partes.push(
        elemento("div", "result-label", `Inflação acumulada pelo ${nome}`),
        elemento("div", "result-value", acumulado),
      );
    }
    const dl = document.createElement("dl");
    dl.className = "result-list";
    dl.append(
      linha("Inflação acumulada", acumulado),
      linha("Fator de correção", Numeros.numero(r.fator, 6, 6)),
      linha("Meses no período", String(r.meses)),
      linha("Média mensal", pct(r.mediaMensal)),
      linha("Inflação anualizada", pct(r.anualizada)),
    );
    partes.push(dl);
    if (estado.inicio < L.PLANO_REAL) {
      partes.push(
        elemento(
          "p",
          "result-message correcao-ipca-aviso",
          "Valores anteriores a julho de 1994 estavam em outras moedas (cruzeiro, cruzado…); a correção não converte moedas.",
        ),
      );
    }
    resultado.replaceChildren(...partes);

    corpoTabela.replaceChildren(
      ...r.linhas.map((l, i) => {
        const tr = document.createElement("tr");
        if (i === r.linhas.length - 1) tr.className = "current";
        for (const texto of [L.mesCurto(l.mes), pct(l.mensal), pct(l.acumulado)]) tr.append(elemento("td", "", texto));
        return tr;
      }),
    );
    detalhes.hidden = false;
  }

  /** Recalcula com a seleção atual; consulta o IBGE só se faltar algum mês na memória. */
  function atualizar({ consultado = false } = {}) {
    mostrarUltimo();
    mostrarPeriodo();

    const lido = Numeros.ler(valor.value, { milhar: true });
    valor.setAttribute(
      "aria-invalid",
      String(estado.modo !== "acumulada" && valor.value.trim() !== "" && (lido === null || lido < 0)),
    );

    const indice = estado.indice;
    const d = dados[indice];
    const primeiro = L.INDICES[indice].primeiroMes;
    const max = maximo();
    if (estado.inicio > estado.fim) {
      cancelarConsulta();
      mensagem("O mês inicial deve ser anterior ou igual ao mês final.", true);
      return;
    }
    if (estado.inicio < primeiro || estado.fim > max) {
      cancelarConsulta();
      mensagem(`Escolha meses entre ${L.mesCurto(primeiro)} e ${L.mesCurto(max)}.`, true);
      return;
    }

    if (L.cobre(d.serie, estado.inicio, estado.fim)) {
      cancelarConsulta();
      mostrarResultado(L.resumir(d.serie, estado.inicio, estado.fim));
      return;
    }
    if (consultado) {
      // Já consultou e ainda falta algum mês: o IBGE não publicou esse dado.
      mensagem(`O IBGE não tem dado publicado para ${L.mesLongo(L.resumir(d.serie, estado.inicio, estado.fim).faltando)}.`, true);
      return;
    }
    if (d.situacao === "carregando" || d.situacao === "nada") {
      cancelarConsulta();
      mensagem("Consultando o último mês divulgado…");
      return;
    }
    mensagem("Consultando o IBGE…");
    consultarPeriodo(indice, estado.inicio, estado.fim);
  }

  function escolher(botoes, atributo, valorEscolhido) {
    for (const b of botoes) {
      const ativo = b.dataset[atributo] === valorEscolhido;
      b.classList.toggle("active", ativo);
      b.setAttribute("aria-pressed", String(ativo));
    }
  }

  // ---------- Eventos ----------

  for (const botao of botoesIndice) {
    botao.addEventListener("click", () => {
      estado.indice = botao.dataset.indice;
      escolher(botoesIndice, "indice", estado.indice);
      dicaIndice.textContent = DESCRICOES_INDICE[estado.indice];
      cancelarConsulta();
      ajustarPeriodo();
      atualizar();
      carregarUltimo(estado.indice);
    });
  }

  for (const botao of botoesModo) {
    botao.addEventListener("click", () => {
      estado.modo = botao.dataset.modo;
      escolher(botoesModo, "modo", estado.modo);
      dicaModo.textContent = DESCRICOES_MODO[estado.modo];
      campoValor.hidden = estado.modo === "acumulada";
      if (ROTULOS_VALOR[estado.modo]) rotuloValor.textContent = ROTULOS_VALOR[estado.modo];
      atualizar();
    });
  }

  for (const select of Object.values(selects)) {
    select.addEventListener("change", () => {
      lerPeriodo();
      atualizar();
    });
  }

  valor.addEventListener("input", () => atualizar());
  tentarUltimo.addEventListener("click", () => carregarUltimo(estado.indice, true));
  alternarTabela.addEventListener("click", () => {
    estado.tabelaAberta = !estado.tabelaAberta;
    tabelaMeses.hidden = !estado.tabelaAberta;
    alternarTabela.setAttribute("aria-expanded", String(estado.tabelaAberta));
    alternarTabela.textContent = estado.tabelaAberta ? "Ocultar tabela" : "Mostrar tabela";
  });
  form.addEventListener("submit", (evento) => evento.preventDefault());

  // Meses nos selects (os anos dependem do índice e do último mês publicado).
  for (const select of [selects.inicioMes, selects.fimMes]) {
    select.replaceChildren(
      ...L.NOMES_MESES.map((nome, i) => new Option(nome[0].toUpperCase() + nome.slice(1), String(i + 1))),
    );
  }

  ajustarPeriodo();
  atualizar();
  carregarUltimo(estado.indice);
})();
