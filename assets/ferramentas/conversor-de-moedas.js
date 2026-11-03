"use strict";
/*
 * Interface do conversor de moedas. A lógica fica em conversor-de-moedas-logica.js; a busca e o
 * cache das cotações seguem dados/RepositorioCotacoes.kt e a tela segue
 * ui/telas/conversor/ConversorViewModel.kt e PartesConversor.kt do app Conversor de Moedas. O
 * histórico de 30 dias vem da Calculadora Multifunção (ui/tools/moedas/MoedasScreen.kt).
 */
(() => {
  const form = document.querySelector("#conversor-moedas");
  if (!form) return;

  const L = LogicaMoedas;
  const campoValor = form.querySelector("#valor");
  const dicaValor = form.querySelector("#valor-dica");
  const selOrigem = form.querySelector("#origem");
  const selDestino = form.querySelector("#destino");
  const botaoInverter = form.querySelector("#inverter");
  const resultado = document.querySelector("#resultado");
  const cotacao = document.querySelector("#cotacao");
  const taxaDireta = document.querySelector("#taxa-direta");
  const taxaInversa = document.querySelector("#taxa-inversa");
  const momentoCotacao = document.querySelector("#momento");
  const botaoAtualizar = document.querySelector("#atualizar");
  const extras = document.querySelector("#extras");
  const via = document.querySelector("#via");
  const aviso = document.querySelector("#aviso");
  const caixaErro = document.querySelector("#erro");
  const textoErro = document.querySelector("#erro-texto");
  const botaoTentar = document.querySelector("#tentar");
  const historico = document.querySelector("#historico");
  const grafico = document.querySelector("#grafico");
  const historicoPeriodo = document.querySelector("#historico-periodo");
  const historicoDados = document.querySelector("#historico-dados");

  const CHAVE_COTACOES = "efs-conversor-de-moedas-cotacoes";
  const CHAVE_PAR = "efs-conversor-de-moedas-par";
  const CHAVE_PARES = "efs-conversor-de-moedas-pares";
  const VALIDADE_MEMORIA_MS = 2 * 60 * 1000;
  const VALIDADE_PARES_MS = 7 * 24 * 60 * 60 * 1000;
  const TEMPO_LIMITE_MS = 10000;
  const DIAS_HISTORICO = 30;

  // ---------- Armazenamento ----------

  function ler(chave) {
    try {
      return JSON.parse(localStorage.getItem(chave));
    } catch {
      return null;
    }
  }

  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      // Sem armazenamento: a página funciona, só não guarda nada para depois.
    }
  }

  const positivo = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
  const opcional = (v, valida) => (valida(v) ? v : null);

  /** Cotações salvas, validadas: Map par → { bid, ask, high, low, pct, momento }. */
  function lerSalvas() {
    const bruto = ler(CHAVE_COTACOES);
    const salvas = new Map();
    if (!bruto || typeof bruto !== "object") return salvas;
    for (const [par, c] of Object.entries(bruto)) {
      if (!/^[A-Z0-9]+-[A-Z0-9]+$/.test(par) || !c || !positivo(c.bid) || !Number.isFinite(c.momento)) continue;
      salvas.set(par, {
        bid: c.bid,
        ask: opcional(c.ask, positivo),
        high: opcional(c.high, positivo),
        low: opcional(c.low, positivo),
        pct: opcional(c.pct, Number.isFinite),
        momento: c.momento,
      });
    }
    return salvas;
  }

  function salvarCotacoes(novas) {
    const todas = lerSalvas();
    for (const [par, c] of novas) todas.set(par, c);
    gravar(CHAVE_COTACOES, Object.fromEntries(todas));
  }

  function lerPares() {
    const bruto = ler(CHAVE_PARES);
    if (bruto && typeof bruto.pares === "string" && Number.isFinite(bruto.em)) {
      const pares = new Set(bruto.pares.split(",").filter((p) => /^[A-Z0-9]+-[A-Z0-9]+$/.test(p)));
      if (pares.size >= L.MINIMO_PARES_VALIDOS) return { pares, em: bruto.em };
    }
    return { pares: L.PARES_EMBUTIDOS, em: 0 };
  }

  // ---------- Consulta à AwesomeAPI ----------

  let { pares, em: paresEm } = lerPares();
  let paresPrecisamAtualizar = false;
  /** Cotações recebidas nesta visita: par → { cotacao, em }. */
  const recentes = new Map();

  async function baixarJson(url, sinal) {
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
        throw new L.ErroCotacao(limite.signal.aborted ? "TEMPO_ESGOTADO" : "SEM_CONEXAO");
      }
      if (!resposta.ok) throw new L.ErroCotacao(L.erroHttp(resposta.status));
      try {
        return await resposta.json();
      } catch {
        throw new L.ErroCotacao("SERVICO_INDISPONIVEL");
      }
    } finally {
      clearTimeout(tempo);
      sinal?.removeEventListener("abort", cancelar);
    }
  }

  /**
   * Taxa de [de] para [para]: usa as cotações da memória (menos de 2 minutos), senão consulta a
   * API; se a consulta falhar, usa as cotações salvas no navegador e informa a falha.
   */
  async function obterTaxa(de, para, forcarRede, sinal) {
    if (de.codigoApi === para.codigoApi) return { taxa: 1, combinada: null, rota: [], falha: null };
    const rota = L.encontrarRota(pares, de.codigoApi, para.codigoApi);
    if (!rota) return { erro: "PAR_INDISPONIVEL" };
    const nomes = rota.map((t) => t.par);
    const agora = Date.now();
    const emMemoria = new Map();
    for (const nome of nomes) {
      const r = recentes.get(nome);
      if (r && agora - r.em < VALIDADE_MEMORIA_MS) emMemoria.set(nome, r.cotacao);
    }
    let cotacoes = emMemoria;
    let falha = null;
    if (forcarRede || emMemoria.size < nomes.length) {
      try {
        cotacoes = L.lerUltimas(await baixarJson(L.urlUltimas(nomes), sinal), nomes);
        for (const [par, c] of cotacoes) recentes.set(par, { cotacao: c, em: Date.now() });
        salvarCotacoes(cotacoes);
      } catch (erro) {
        if (sinal?.aborted) throw erro;
        const tipo = erro instanceof L.ErroCotacao ? erro.tipo : "SERVICO_INDISPONIVEL";
        if (tipo === "PAR_INDISPONIVEL") paresPrecisamAtualizar = true;
        const salvas = lerSalvas();
        cotacoes = new Map();
        for (const nome of nomes) {
          const c = recentes.get(nome)?.cotacao ?? salvas.get(nome);
          if (c) cotacoes.set(nome, c);
        }
        if (cotacoes.size < nomes.length) return { erro: tipo };
        falha = tipo;
      }
    }
    const combinada = L.combinar(rota, cotacoes);
    if (!combinada) return { erro: falha ?? "SERVICO_INDISPONIVEL" };
    return { taxa: combinada.taxa, combinada, rota, falha };
  }

  /** Renova a lista de pares da API uma vez por semana (ou logo após um par sumir), sem avisar. */
  async function atualizarParesSeNecessario() {
    if (Date.now() - paresEm < VALIDADE_PARES_MS && !paresPrecisamAtualizar) return;
    paresEm = Date.now(); // evita repetir a consulta na mesma visita
    try {
      const novos = L.lerDisponiveis(await baixarJson(L.urlDisponiveis()));
      if (novos.size < L.MINIMO_PARES_VALIDOS) return;
      pares = novos;
      paresPrecisamAtualizar = false;
      gravar(CHAVE_PARES, { pares: [...novos].join(","), em: Date.now() });
    } catch {
      // A lista embutida continua valendo.
    }
  }

  /** Histórico bruto por par (sem orientar), guardado nesta visita. */
  const historicos = new Map();

  async function carregarHistorico(t, chavePar) {
    let pontos = historicos.get(t.par);
    if (!pontos) {
      try {
        pontos = L.lerHistorico(await baixarJson(L.urlHistorico(t.par, DIAS_HISTORICO)));
        historicos.set(t.par, pontos);
      } catch {
        return; // o histórico é um complemento: em caso de falha, some sem mensagem
      }
    }
    if (chavePar !== `${estado.origem.codigo}-${estado.destino.codigo}`) return;
    mostrarHistorico(L.orientarHistorico(t, pontos));
  }

  // ---------- Estado ----------

  function parInicial() {
    const salvo = ler(CHAVE_PAR);
    const origem = L.porCodigo(salvo && salvo.origem) ?? L.porCodigo("USD");
    let destino = L.porCodigo(salvo && salvo.destino);
    if (!destino || destino === origem) destino = L.porCodigo(origem.codigo === "BRL" ? "USD" : "BRL");
    return { origem, destino };
  }

  const estado = {
    ...parInicial(),
    /** { origem, destino, taxa, combinada, rota, falha } da última busca. */
    taxa: null,
    carregando: false,
    erro: null,
  };

  /** A taxa só vale se for do par selecionado agora. */
  const taxaAtual = () =>
    estado.taxa && estado.taxa.origem === estado.origem.codigo && estado.taxa.destino === estado.destino.codigo
      ? estado.taxa
      : null;

  let busca = null;

  async function buscarTaxa(forcarRede = false) {
    busca?.abort();
    const controle = new AbortController();
    busca = controle;
    const { origem, destino } = estado;
    estado.carregando = true;
    estado.erro = null;
    mostrar();
    let r;
    try {
      r = await obterTaxa(origem, destino, forcarRede, controle.signal);
    } catch {
      return; // busca substituída por outra
    }
    if (controle.signal.aborted) return;
    busca = null;
    estado.carregando = false;
    if (r.erro) {
      estado.erro = r.erro;
      mostrar();
      if (r.erro === "PAR_INDISPONIVEL") atualizarParesSeNecessario();
      return;
    }
    estado.taxa = { origem: origem.codigo, destino: destino.codigo, ...r };
    mostrar();
    historico.hidden = true;
    if (r.rota.length === 1) carregarHistorico(r.rota[0], `${origem.codigo}-${destino.codigo}`);
    atualizarParesSeNecessario();
  }

  function alterarPar(origem, destino, taxaProvisoria = null) {
    estado.origem = origem;
    estado.destino = destino;
    if (taxaProvisoria) estado.taxa = taxaProvisoria;
    gravar(CHAVE_PAR, { origem: origem.codigo, destino: destino.codigo });
    selOrigem.value = origem.codigo;
    selDestino.value = destino.codigo;
    historico.hidden = true;
    buscarTaxa();
  }

  /** A taxa invertida aparece na hora; a busca em seguida só confirma ou atualiza. */
  function trocarMoedas() {
    const t = taxaAtual();
    let invertida = null;
    if (t) {
      const c = t.combinada;
      invertida = {
        origem: t.destino,
        destino: t.origem,
        taxa: L.inversa(t.taxa),
        // Sem os extras até a confirmação: compra e venda invertidas dependem da rota.
        combinada: c ? { taxa: L.inversa(t.taxa), momento: c.momento, via: [...c.via].reverse() } : null,
        rota: [],
        falha: t.falha,
      };
    }
    alterarPar(estado.destino, estado.origem, invertida);
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

  function listaVia(moedas) {
    if (moedas.length <= 1) return moedas.join("");
    return `${moedas.slice(0, -1).join(", ")} e ${moedas[moedas.length - 1]}`;
  }

  function mostrarResultado(valor, t) {
    if (valor !== null && t) {
      resultado.replaceChildren(
        elemento("p", "result-label", `${L.formatarValor(valor, estado.origem)} =`),
        elemento("p", "result-value conversor-valor", L.formatarValor(L.converter(valor, t.taxa), estado.destino)),
      );
    } else if (estado.carregando) {
      resultado.replaceChildren(elemento("p", "result-message", "Buscando cotação…"));
    } else if (estado.erro && valor !== null) {
      resultado.replaceChildren(elemento("p", "result-message", "Cotação indisponível no momento."));
    } else {
      resultado.replaceChildren(elemento("p", "result-message", "Digite um valor para ver a conversão."));
    }
  }

  function mostrarCotacao(t) {
    const mesma = estado.origem.codigoApi === estado.destino.codigoApi;
    cotacao.hidden = !t;
    aviso.hidden = true;
    if (!t) return;
    const c = t.combinada;
    if (mesma) {
      taxaDireta.textContent = "Origem e destino são a mesma moeda.";
      taxaInversa.textContent = "";
      momentoCotacao.textContent = "";
      extras.replaceChildren();
      via.hidden = true;
      botaoAtualizar.hidden = true;
      return;
    }
    botaoAtualizar.hidden = false;
    taxaDireta.textContent = L.formatarTaxa(estado.origem, estado.destino, t.taxa);
    taxaInversa.textContent = L.formatarTaxa(estado.destino, estado.origem, L.inversa(t.taxa));
    momentoCotacao.textContent = c && Number.isFinite(c.momento) ? `Cotação de ${L.formatarData(c.momento)}` : "";

    const linhas = [];
    if (c && c.compra != null && c.venda != null && Math.abs(c.venda - c.compra) > 1e-12) {
      linhas.push(linha("Compra", L.formatarNumeroTaxa(c.compra)), linha("Venda", L.formatarNumeroTaxa(c.venda)));
    }
    if (c && c.maxima != null) linhas.push(linha("Máxima do dia", L.formatarNumeroTaxa(c.maxima)));
    if (c && c.minima != null) linhas.push(linha("Mínima do dia", L.formatarNumeroTaxa(c.minima)));
    if (c && c.variacao != null) linhas.push(linha("Variação do dia", L.formatarVariacao(c.variacao)));
    extras.replaceChildren(...linhas);
    extras.hidden = linhas.length === 0;
    via.hidden = !(c && c.via && c.via.length);
    if (!via.hidden) via.textContent = `Conversão cruzada via ${listaVia(c.via)}.`;

    if (t.falha) {
      aviso.textContent = L.mensagemCotacaoSalva(t.falha) + (c ? ` Cotação de ${L.formatarData(c.momento)}.` : "");
      aviso.hidden = false;
    } else if (c && L.cotacaoDesatualizada(c.momento, Date.now())) {
      aviso.textContent = "A fonte não atualiza esta cotação há alguns dias. Use o valor apenas como referência.";
      aviso.hidden = false;
    }
  }

  function mostrar() {
    const texto = campoValor.value;
    const valor = L.interpretar(texto);
    const invalido = texto !== "" && valor === null;
    campoValor.setAttribute("aria-invalid", String(invalido));
    dicaValor.hidden = !invalido;

    const t = taxaAtual();
    mostrarResultado(valor, t);
    mostrarCotacao(t);

    botaoAtualizar.disabled = estado.carregando;
    botaoAtualizar.textContent = estado.carregando ? "Atualizando…" : "Atualizar cotação";
    caixaErro.hidden = !(estado.erro && !estado.carregando && !t);
    if (!caixaErro.hidden) textoErro.textContent = L.mensagemErro(estado.erro, estado.origem, estado.destino);
  }

  function mostrarHistorico(pontos) {
    if (pontos.length < 2) {
      historico.hidden = true;
      return;
    }
    const valores = pontos.map((p) => p.bid);
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const largura = 300;
    const altura = 90;
    const margem = 4;
    const faixa = max - min || 1;
    const coordenadas = pontos.map((p, i) => {
      const x = margem + (i * (largura - 2 * margem)) / (pontos.length - 1);
      const y = margem + ((max - p.bid) * (altura - 2 * margem)) / faixa;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const ns = "http://www.w3.org/2000/svg";
    const area = document.createElementNS(ns, "polygon");
    area.setAttribute("class", "conversor-grafico-area");
    area.setAttribute(
      "points",
      `${margem},${altura - margem} ${coordenadas.join(" ")} ${largura - margem},${altura - margem}`,
    );
    const curva = document.createElementNS(ns, "polyline");
    curva.setAttribute("class", "conversor-grafico-linha");
    curva.setAttribute("points", coordenadas.join(" "));
    grafico.replaceChildren(area, curva);

    const variacao = (valores[valores.length - 1] / valores[0] - 1) * 100;
    const de = L.formatarData(pontos[0].momento / 1000).slice(0, 10);
    const ate = L.formatarData(pontos[pontos.length - 1].momento / 1000).slice(0, 10);
    historicoPeriodo.textContent = `1 ${estado.origem.codigo} em ${estado.destino.codigo}, de ${de} a ${ate}.`;
    grafico.setAttribute(
      "aria-label",
      `Gráfico da cotação de 1 ${estado.origem.codigo} em ${estado.destino.codigo} de ${de} a ${ate}: ` +
        `de ${L.formatarNumeroTaxa(valores[0])} para ${L.formatarNumeroTaxa(valores[valores.length - 1])}.`,
    );
    historicoDados.replaceChildren(
      linha("Variação no período", L.formatarVariacao(variacao)),
      linha("Mínima no período", L.formatarNumeroTaxa(min)),
      linha("Máxima no período", L.formatarNumeroTaxa(max)),
    );
    historico.hidden = false;
  }

  // ---------- Listas de moedas ----------

  function preencher(select) {
    const rotulo = (m) => `${m.nome} (${m.codigo})`;
    const grupo = (titulo, moedas) => {
      const g = document.createElement("optgroup");
      g.label = titulo;
      g.append(...moedas.map((m) => new Option(rotulo(m), m.codigo)));
      return g;
    };
    select.replaceChildren(grupo("Mais usadas", L.POPULARES), grupo("Todas as moedas", L.MOEDAS));
  }
  preencher(selOrigem);
  preencher(selDestino);
  selOrigem.value = estado.origem.codigo;
  selDestino.value = estado.destino.codigo;

  // ---------- Eventos ----------

  campoValor.addEventListener("input", () => {
    const original = campoValor.value;
    const limpo = L.limparEntrada(original);
    if (limpo !== original) {
      const cursor = campoValor.selectionStart ?? original.length;
      const antes = L.limparEntrada(original.slice(0, cursor)).length;
      campoValor.value = limpo;
      try {
        campoValor.setSelectionRange(antes, antes);
      } catch {
        // alguns tipos de campo não aceitam seleção
      }
    }
    mostrar();
  });

  selOrigem.addEventListener("change", () => {
    const moeda = L.porCodigo(selOrigem.value);
    if (!moeda || moeda === estado.origem) return;
    if (moeda === estado.destino) trocarMoedas();
    else alterarPar(moeda, estado.destino);
  });

  selDestino.addEventListener("change", () => {
    const moeda = L.porCodigo(selDestino.value);
    if (!moeda || moeda === estado.destino) return;
    if (moeda === estado.origem) trocarMoedas();
    else alterarPar(estado.origem, moeda);
  });

  botaoInverter.addEventListener("click", trocarMoedas);
  botaoAtualizar.addEventListener("click", () => buscarTaxa(true));
  botaoTentar.addEventListener("click", () => buscarTaxa(true));
  form.addEventListener("submit", (evento) => evento.preventDefault());

  buscarTaxa();
})();
