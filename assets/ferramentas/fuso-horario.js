"use strict";
/*
 * Interface do fuso horário (a lógica está em fuso-horario-logica.js).
 * Mesmo conteúdo de ui/tools/fuso/FusoScreen.kt da Calculadora Multifunção: dois fusos com
 * relógios ao vivo, diferença entre eles, conversão de data e hora e relógio mundial.
 * Fusos escolhidos e relógio mundial ficam em localStorage, como as AppPreferences do app.
 */
(() => {
  const raiz = document.querySelector(".fuso");
  if (!raiz) return;

  const F = LogicaFuso;
  const CHAVE = "efs-fuso-horario-preferencias";
  const MAX_MUNDO = 20;
  const PADRAO = "America/Sao_Paulo";

  const selDe = raiz.querySelector("#fuso-de");
  const selPara = raiz.querySelector("#fuso-para");
  const selMundo = raiz.querySelector("#mundo-cidade");
  const relogioDe = raiz.querySelector("#relogio-de");
  const relogioPara = raiz.querySelector("#relogio-para");
  const diferenca = raiz.querySelector("#diferenca");
  const convOrigem = raiz.querySelector("#conv-origem");
  const convData = raiz.querySelector("#conv-data");
  const convHora = raiz.querySelector("#conv-hora");
  const resultadoConversao = raiz.querySelector("#resultado-conversao");
  const listaMundo = raiz.querySelector("#mundo");
  const mundoVazio = raiz.querySelector("#mundo-vazio");
  const mundoLimite = raiz.querySelector("#mundo-limite");
  const botaoAdicionar = raiz.querySelector("#mundo-adicionar");

  const dois = (n) => String(n).padStart(2, "0");

  function elemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  // --- Lista de fusos -----------------------------------------------------------------------

  const aparelho = F.fusoDoAparelho();
  // Os IDs variam entre navegadores (Asia/Calcutta ou Asia/Kolkata): o fuso do aparelho e as
  // sugestões entram na lista mesmo quando não vêm em Intl.supportedValuesOf.
  const entradas = F.listar([...F.idsDisponiveis(), ...F.SUGESTOES, ...(aparelho ? [aparelho] : [])]);
  const porId = new Map(entradas.map((e) => [e.id, e]));
  const fusoInicial = aparelho && porId.has(aparelho) ? aparelho : PADRAO;
  const valido = (id) => typeof id === "string" && porId.has(id);

  /** Texto da opção: "São Paulo (Brasília) · UTC−03:00". */
  const agoraCarga = Date.now();
  const rotulos = new Map(
    entradas.map((e) => [e.id, `${e.cidade} · ${F.textoDeslocamento(F.deslocamentoMin(e.id, agoraCarga))}`]),
  );
  const nome = (id) => porId.get(id)?.cidade ?? id;

  /** Opções agrupadas: "Sugestões" e depois as regiões, em ordem alfabética de cidade. */
  function grupos() {
    const sugestoes = [...new Set([fusoInicial, ...F.SUGESTOES])].filter(valido);
    const resultado = [{ nome: "Sugestões", ids: sugestoes }];
    for (const regiao of F.REGIOES) {
      const ids = entradas.filter((e) => e.regiao === regiao.nome).map((e) => e.id);
      if (ids.length) resultado.push({ nome: regiao.nome, ids });
    }
    return resultado;
  }
  const GRUPOS = grupos();

  function preencher(select, comVazio = false) {
    const filhos = [];
    if (comVazio) filhos.push(new Option("Escolha uma cidade", ""));
    for (const g of GRUPOS) {
      const grupo = document.createElement("optgroup");
      grupo.label = g.nome;
      for (const id of g.ids) {
        const e = porId.get(id);
        const extra = e.subRegiao ? ` (${e.subRegiao})` : "";
        const opcao = new Option(rotulos.get(id).replace(" · ", `${extra} · `), id);
        grupo.append(opcao);
      }
      filhos.push(grupo);
    }
    select.replaceChildren(...filhos);
  }

  preencher(selDe);
  preencher(selPara);
  preencher(selMundo, true);

  // --- Preferências -------------------------------------------------------------------------

  const estado = {
    de: fusoInicial,
    para: fusoInicial === "America/New_York" ? "Europe/London" : "America/New_York",
    mundo: [],
  };

  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE) || "null");
    if (dados && typeof dados === "object") {
      if (valido(dados.de)) estado.de = dados.de;
      if (valido(dados.para)) estado.para = dados.para;
      if (Array.isArray(dados.mundo)) estado.mundo = [...new Set(dados.mundo.filter(valido))].slice(0, MAX_MUNDO);
    }
  } catch (erro) {
    // preferências ilegíveis ou sem armazenamento: usa os padrões
  }

  function salvar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch (erro) {
      // sem armazenamento, só não lembra na próxima visita
    }
  }

  // --- Relógios ao vivo ---------------------------------------------------------------------

  function desenharRelogio(caixa, id, ms) {
    const p = F.partesLocais(id, ms);
    caixa.querySelector(".fuso-cidade").textContent = nome(id);
    caixa.querySelector(".fuso-hora").textContent = F.hora(p, true);
    caixa.querySelector(".fuso-data").textContent = F.dataMedia(p);
    caixa.querySelector(".fuso-offset").textContent = F.textoDeslocamento(F.deslocamentoMin(id, ms));
    caixa.querySelector(".fuso-verao").hidden = !F.horarioDeVerao(id, ms);
  }

  let fraseAtual = "";
  function atualizarAgora(ms = Date.now()) {
    desenharRelogio(relogioDe, estado.de, ms);
    desenharRelogio(relogioPara, estado.para, ms);
    const frase = F.fraseDiferenca(nome(estado.de), nome(estado.para), F.diferencaMin(estado.de, estado.para, ms));
    // Só reescreve quando muda, para o leitor de tela não repetir a frase a cada segundo.
    if (frase !== fraseAtual) {
      diferenca.textContent = frase;
      fraseAtual = frase;
    }
    atualizarMundo(ms);
  }

  let temporizador = 0;
  function tique() {
    atualizarAgora();
    // Alinha à virada do segundo, como o relógio do app.
    temporizador = setTimeout(tique, 1000 - (Date.now() % 1000) + 5);
  }

  document.addEventListener("visibilitychange", () => {
    clearTimeout(temporizador);
    if (!document.hidden) tique();
  });

  // --- Relógio mundial ----------------------------------------------------------------------

  function relativo(id, ms) {
    const minutos = F.diferencaMin(estado.de, id, ms);
    if (minutos === 0) return `Mesmo horário de ${nome(estado.de)}`;
    return `${minutos > 0 ? "+" : "−"}${F.duracao(Math.abs(minutos))} em relação a ${nome(estado.de)}`;
  }

  function desenharMundo() {
    const itens = estado.mundo.map((id) => {
      const item = elemento("li", "fuso-mundo-item");
      item.dataset.id = id;
      const info = elemento("div", "fuso-mundo-info");
      info.append(elemento("span", "fuso-mundo-cidade", nome(id)), elemento("span", "fuso-mundo-relativo"), elemento("span", "fuso-mundo-data"));
      const hora = elemento("span", "fuso-mundo-hora");
      const remover = elemento("button", "button secondary fuso-remover");
      remover.type = "button";
      remover.dataset.remover = id;
      remover.setAttribute("aria-label", `Remover ${nome(id)}`);
      remover.title = `Remover ${nome(id)}`;
      const x = elemento("span", "", "×");
      x.setAttribute("aria-hidden", "true");
      remover.append(x);
      item.append(info, hora, remover);
      return item;
    });
    listaMundo.replaceChildren(...itens);
    listaMundo.hidden = itens.length === 0;
    mundoVazio.hidden = itens.length > 0;
    mundoLimite.hidden = estado.mundo.length < MAX_MUNDO;
    botaoAdicionar.disabled = estado.mundo.length >= MAX_MUNDO;
    selMundo.disabled = estado.mundo.length >= MAX_MUNDO;
    for (const opcao of selMundo.options) opcao.disabled = opcao.value !== "" && estado.mundo.includes(opcao.value);
    atualizarMundo();
  }

  function atualizarMundo(ms = Date.now()) {
    const dataReferencia = F.partesLocais(estado.de, ms);
    for (const item of listaMundo.children) {
      const id = item.dataset.id;
      const p = F.partesLocais(id, ms);
      item.querySelector(".fuso-mundo-hora").textContent = F.hora(p);
      item.querySelector(".fuso-mundo-relativo").textContent = relativo(id, ms);
      const data = item.querySelector(".fuso-mundo-data");
      const outroDia = !F.mesmoDia(p, dataReferencia);
      data.hidden = !outroDia;
      data.textContent = outroDia ? F.dataMedia(p) : "";
    }
  }

  raiz.querySelector("#form-mundo").addEventListener("submit", (evento) => {
    evento.preventDefault();
    const id = selMundo.value;
    if (!valido(id) || estado.mundo.includes(id) || estado.mundo.length >= MAX_MUNDO) return;
    estado.mundo.push(id);
    salvar();
    selMundo.value = "";
    desenharMundo();
  });

  listaMundo.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-remover]");
    if (!botao) return;
    const indice = estado.mundo.indexOf(botao.dataset.remover);
    if (indice < 0) return;
    estado.mundo.splice(indice, 1);
    salvar();
    desenharMundo();
    // Mantém o foco num lugar previsível depois de remover.
    const proximo = listaMundo.querySelectorAll("[data-remover]")[Math.min(indice, estado.mundo.length - 1)];
    (proximo || selMundo).focus();
  });

  // --- Conversão ----------------------------------------------------------------------------

  function lerData(texto) {
    const m = /^(\d{4,6})-(\d{2})-(\d{2})$/.exec(texto.trim());
    if (!m) return null;
    const data = { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
    if (data.ano < 1 || data.ano > 9999 || data.mes < 1 || data.mes > 12) return null;
    const conferida = new Date(F.msUTC(data.ano, data.mes, data.dia));
    return conferida.getUTCDate() === data.dia ? data : null;
  }

  function lerHorario(texto) {
    const m = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(texto.trim());
    if (!m) return null;
    const horario = { hora: Number(m[1]), minuto: Number(m[2]) };
    return horario.hora < 24 && horario.minuto < 60 ? horario : null;
  }

  function preencherAgora() {
    const p = F.partesLocais(estado.de, Date.now());
    convData.value = `${String(p.ano).padStart(4, "0")}-${dois(p.mes)}-${dois(p.dia)}`;
    convHora.value = `${dois(p.hora)}:${dois(p.minuto)}`;
  }

  const TEXTOS_DIA = { 0: "Mesmo dia", 1: "Dia seguinte", "-1": "Dia anterior" };

  function converter() {
    convOrigem.textContent = nome(estado.de);
    const data = lerData(convData.value);
    const horario = lerHorario(convHora.value);
    convData.setAttribute("aria-invalid", String((convData.value !== "" || convData.validity.badInput) && !data));
    convHora.setAttribute("aria-invalid", String((convHora.value !== "" || convHora.validity.badInput) && !horario));
    if (!data || !horario) {
      const invalido = convData.getAttribute("aria-invalid") === "true" || convHora.getAttribute("aria-invalid") === "true";
      resultadoConversao.replaceChildren(
        elemento("p", invalido ? "result-message error" : "result-message", invalido ? "Use uma data e uma hora completas." : "Escolha a data e a hora."),
      );
      return;
    }
    const r = F.converter(data, horario, estado.de, estado.para);
    const dias =
      TEXTOS_DIA[r.deslocamentoDias] ?? `${r.deslocamentoDias > 0 ? "+" : "−"}${Math.abs(r.deslocamentoDias)} dias de diferença`;
    const utc = F.partesLocais("UTC", r.ms);
    const partes = [
      elemento("div", "result-label", `Em ${nome(estado.para)}`),
      elemento("div", "result-value", F.hora(r.destino)),
      elemento("p", "result-message fuso-conversao-data", `${F.dataCompleta(r.destino)} · ${dias}`),
    ];
    const lista = elemento("dl", "result-list");
    for (const [rotulo, valor] of [
      [`Em ${nome(estado.de)}`, `${F.hora(r.origem)} de ${F.dataMedia(r.origem)}`],
      ["Em UTC", `${F.hora(utc)} de ${F.dataMedia(utc)}`],
    ]) {
      const div = document.createElement("div");
      div.append(elemento("dt", "", rotulo), elemento("dd", "", valor));
      lista.append(div);
    }
    partes.push(lista);
    if (r.ajustadoPorLacuna) {
      partes.push(
        elemento(
          "p",
          "hint fuso-nota",
          `Esse horário não existe em ${nome(estado.de)} por causa do início do horário de verão; foi considerado ${F.hora(r.origem)}.`,
        ),
      );
    }
    if (r.ambiguo) {
      partes.push(
        elemento(
          "p",
          "hint fuso-nota",
          `Esse horário acontece duas vezes em ${nome(estado.de)} (fim do horário de verão); foi considerada a primeira ocorrência.`,
        ),
      );
    }
    resultadoConversao.replaceChildren(...partes);
  }

  raiz.querySelector("#conv-agora").addEventListener("click", () => {
    preencherAgora();
    converter();
  });
  const formConversao = raiz.querySelector("#form-conversao");
  formConversao.addEventListener("input", converter);
  formConversao.addEventListener("change", converter);
  formConversao.addEventListener("submit", (evento) => evento.preventDefault());

  // --- Escolha dos fusos --------------------------------------------------------------------

  function aplicar() {
    selDe.value = estado.de;
    selPara.value = estado.para;
    atualizarAgora();
    converter();
  }

  selDe.addEventListener("change", () => {
    if (!valido(selDe.value)) return;
    estado.de = selDe.value;
    salvar();
    aplicar();
  });
  selPara.addEventListener("change", () => {
    if (!valido(selPara.value)) return;
    estado.para = selPara.value;
    salvar();
    aplicar();
  });
  raiz.querySelector("#fuso-inverter").addEventListener("click", () => {
    [estado.de, estado.para] = [estado.para, estado.de];
    salvar();
    aplicar();
  });
  raiz.querySelector("#form-fusos").addEventListener("submit", (evento) => evento.preventDefault());

  // Outra aba mudou as preferências: acompanha sem regravar.
  window.addEventListener("storage", (evento) => {
    if (evento.key !== CHAVE || !evento.newValue) return;
    try {
      const dados = JSON.parse(evento.newValue);
      if (valido(dados.de)) estado.de = dados.de;
      if (valido(dados.para)) estado.para = dados.para;
      if (Array.isArray(dados.mundo)) estado.mundo = [...new Set(dados.mundo.filter(valido))].slice(0, MAX_MUNDO);
      desenharMundo();
      aplicar();
    } catch (erro) {
      // ignora dados ilegíveis
    }
  });

  preencherAgora();
  desenharMundo();
  aplicar();
  tique();
})();
