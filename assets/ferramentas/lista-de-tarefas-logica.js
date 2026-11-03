"use strict";
/*
 * Lógica da Lista de Tarefas, portada do app Android (com.emerson1981.listatarefas):
 * dados/Datas.kt (datas como "dia de época" no calendário local), dados/RegrasTarefas.kt
 * (filtros, seções por dia, resumo, montagem da tarefa), a regra de "alterações não salvas"
 * de ui/telas/formulario/FormularioTarefaViewModel.kt e a leitura validada de dados/TarefasJson.kt.
 */
const LogicaListaTarefas = (() => {
  // ---------- Datas ----------

  const MS_POR_DIA = 86400000;
  const DIAS_DA_SEMANA = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
  ];
  // Divisão inteira do Kotlin (trunca em direção a zero) e floorDiv/mod
  const div = (a, b) => Math.trunc(a / b);
  const floorDiv = (a, b) => Math.floor(a / b);
  const mod = (a, b) => ((a % b) + b) % b;

  /** Dia de época de um instante, com o deslocamento do fuso em ms (São Paulo: -3 h). */
  const diaDoInstante = (epochMs, deslocamentoMs) => floorDiv(epochMs + deslocamentoMs, MS_POR_DIA);

  /** Hoje no calendário local do navegador. */
  const hoje = (agora = new Date()) => paraDia(agora.getFullYear(), agora.getMonth() + 1, agora.getDate());

  // Algoritmos "days from civil" / "civil from days" de Howard Hinnant (calendário gregoriano)
  function paraDia(ano, mes, dia) {
    const y = mes <= 2 ? ano - 1 : ano;
    const era = div(y >= 0 ? y : y - 399, 400);
    const anoDaEra = y - era * 400;
    const mesDesdeMarco = (mes + 9) % 12;
    const diaDoAno = div(153 * mesDesdeMarco + 2, 5) + dia - 1;
    const diaDaEra = anoDaEra * 365 + div(anoDaEra, 4) - div(anoDaEra, 100) + diaDoAno;
    return era * 146097 + diaDaEra - 719468;
  }

  function paraCivil(dia) {
    const z = dia + 719468;
    const era = div(z >= 0 ? z : z - 146096, 146097);
    const diaDaEra = z - era * 146097;
    const anoDaEra = div(diaDaEra - div(diaDaEra, 1460) + div(diaDaEra, 36524) - div(diaDaEra, 146096), 365);
    const diaDoAno = diaDaEra - (365 * anoDaEra + div(anoDaEra, 4) - div(anoDaEra, 100));
    const mesDesdeMarco = div(5 * diaDoAno + 2, 153);
    const d = diaDoAno - div(153 * mesDesdeMarco + 2, 5) + 1;
    const m = mesDesdeMarco < 10 ? mesDesdeMarco + 3 : mesDesdeMarco - 9;
    const a = anoDaEra + era * 400 + (m <= 2 ? 1 : 0);
    return { ano: a, mes: m, dia: d };
  }

  /** 0 = domingo … 6 = sábado (01/01/1970 foi uma quinta-feira). */
  const diaDaSemana = (dia) => mod(dia + 4, 7);
  const nomeDiaDaSemana = (dia) => DIAS_DA_SEMANA[diaDaSemana(dia)];
  const doisDigitos = (n) => String(n).padStart(2, "0");

  /** 07/08/2025 */
  function formatar(dia) {
    const c = paraCivil(dia);
    return `${doisDigitos(c.dia)}/${doisDigitos(c.mes)}/${c.ano}`;
  }

  function rotuloRelativo(dia, hoje) {
    if (dia - hoje === 0) return "Hoje";
    if (dia - hoje === 1) return "Amanhã";
    if (dia - hoje === -1) return "Ontem";
    return null;
  }

  /** "segunda-feira, 27/10" (com o ano quando não é o ano atual). */
  function descricaoDia(dia, hoje) {
    const c = paraCivil(dia);
    const ano = c.ano !== paraCivil(hoje).ano ? `/${c.ano}` : "";
    return `${nomeDiaDaSemana(dia)}, ${doisDigitos(c.dia)}/${doisDigitos(c.mes)}${ano}`;
  }

  /** Título das seções da lista: "Hoje · segunda-feira, 27/10" ou "Quarta-feira, 29/10". */
  function tituloSecao(dia, hoje) {
    const descricao = descricaoDia(dia, hoje);
    const relativo = rotuloRelativo(dia, hoje);
    return relativo !== null ? `${relativo} · ${descricao}` : descricao.charAt(0).toUpperCase() + descricao.slice(1);
  }

  function diasNoMes(ano, mes) {
    if (mes === 2) return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0 ? 29 : 28;
    return [4, 6, 9, 11].includes(mes) ? 30 : 31;
  }

  // O campo <input type="date"> usa "AAAA-MM-DD": é o equivalente web do DatePicker do app
  function paraTextoData(dia) {
    const c = paraCivil(dia);
    return `${String(c.ano).padStart(4, "0")}-${doisDigitos(c.mes)}-${doisDigitos(c.dia)}`;
  }

  function deTextoData(texto) {
    const g = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto ?? "").trim());
    if (!g) return null;
    const ano = Number(g[1]);
    const mes = Number(g[2]);
    const dia = Number(g[3]);
    if (ano < 1 || mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) return null;
    return paraDia(ano, mes, dia);
  }

  // ---------- Regras das tarefas ----------

  const FILTROS = [
    { id: "todas", rotulo: "Todas" },
    { id: "pendentes", rotulo: "Pendentes" },
    { id: "concluidas", rotulo: "Concluídas" },
  ];

  const atrasada = (tarefa, hoje) => !tarefa.concluida && tarefa.dia < hoje;
  const subtarefasConcluidas = (tarefa) => tarefa.subtarefas.filter((s) => s.concluida).length;

  const ordenar = (lista) => [...lista].sort((a, b) => a.dia - b.dia || a.criadaEm - b.criadaEm || a.id - b.id);

  function filtrar(lista, filtro) {
    if (filtro === "pendentes") return lista.filter((t) => !t.concluida);
    if (filtro === "concluidas") return lista.filter((t) => t.concluida);
    return lista;
  }

  const contar = (lista, filtro) => filtrar(lista, filtro).length;

  /** Seções por dia, do mais antigo para o mais novo (atrasadas primeiro, depois hoje e o futuro). */
  function agrupar(lista) {
    const secoes = [];
    for (const tarefa of ordenar(lista)) {
      const ultima = secoes[secoes.length - 1];
      if (ultima && ultima.dia === tarefa.dia) ultima.tarefas.push(tarefa);
      else secoes.push({ dia: tarefa.dia, tarefas: [tarefa] });
    }
    return secoes;
  }

  /** Insere a tarefa ou substitui a que tem o mesmo id (também serve para o "Desfazer"). */
  const salvar = (lista, tarefa) =>
    lista.some((t) => t.id === tarefa.id) ? lista.map((t) => (t.id === tarefa.id ? tarefa : t)) : [...lista, tarefa];

  const remover = (lista, id) => lista.filter((t) => t.id !== id);

  const alternarConcluida = (lista, id) => lista.map((t) => (t.id === id ? { ...t, concluida: !t.concluida } : t));

  const alternar = (subtarefas, id) => subtarefas.map((s) => (s.id === id ? { ...s, concluida: !s.concluida } : s));

  const alternarSubtarefa = (lista, idTarefa, idSubtarefa) =>
    lista.map((t) => (t.id !== idTarefa ? t : { ...t, subtarefas: alternar(t.subtarefas, idSubtarefa) }));

  /** Id novo baseado no relógio, mas sem repetir um id já usado. */
  const novoId = (lista, agoraMs) => Math.max(agoraMs, lista.reduce((maior, t) => Math.max(maior, t.id), 0) + 1);

  /**
   * Monta a tarefa a partir do formulário; null quando o título está vazio. O texto que ficou
   * digitado no campo "nova subtarefa" entra como subtarefa.
   */
  function montarTarefa({ base, idNovo, titulo, descricao, dia, subtarefas, subtarefaPendente, agoraMs, novoIdSubtarefa }) {
    const tituloLimpo = titulo.trim();
    if (tituloLimpo === "") return null;
    const pendente = subtarefaPendente.trim();
    const todas = pendente === "" ? subtarefas : [...subtarefas, { id: novoIdSubtarefa(), titulo: pendente, concluida: false }];
    return {
      id: base ? base.id : idNovo,
      titulo: tituloLimpo,
      descricao: descricao.trim(),
      concluida: base ? base.concluida : false,
      dia,
      criadaEm: base ? base.criadaEm : agoraMs,
      subtarefas: todas,
    };
  }

  function resumo(lista, hoje) {
    const pendentes = lista.filter((t) => !t.concluida);
    return {
      paraHoje: pendentes.filter((t) => t.dia === hoje).length,
      atrasadas: pendentes.filter((t) => t.dia < hoje).length,
      pendentes: pendentes.length,
    };
  }

  const mesmasSubtarefas = (a, b) =>
    a.length === b.length && a.every((s, i) => s.id === b[i].id && s.titulo === b[i].titulo && s.concluida === b[i].concluida);

  /** Há algo digitado que seria perdido ao sair sem salvar (original null = tarefa nova). */
  function alterado({ original, titulo, descricao, dia, subtarefas, novaSubtarefa }) {
    if (novaSubtarefa.trim() !== "") return true;
    if (!original) return titulo.trim() !== "" || descricao.trim() !== "" || subtarefas.length > 0;
    return (
      titulo.trim() !== original.titulo ||
      descricao.trim() !== original.descricao ||
      dia !== original.dia ||
      !mesmasSubtarefas(subtarefas, original.subtarefas)
    );
  }

  // ---------- Armazenamento ----------

  // Limites do calendário do campo de data (01/01/0001 a 31/12/9999)
  const DIA_MINIMO = paraDia(1, 1, 1);
  const DIA_MAXIMO = paraDia(9999, 12, 31);

  const texto = (valor) => (typeof valor === "string" ? valor : null);

  function booleano(valor) {
    if (typeof valor === "boolean") return valor;
    if (typeof valor === "string") return valor.toLowerCase() === "true";
    if (typeof valor === "number") return Math.trunc(valor) !== 0;
    return false;
  }

  function subtarefasDe(lista) {
    if (!Array.isArray(lista)) return [];
    const usados = new Set();
    const resultado = [];
    lista.forEach((o, indice) => {
      if (!o || typeof o !== "object") return;
      const titulo = texto(o.titulo)?.trim();
      if (!titulo) return;
      let id = typeof o.id === "string" && o.id !== "" ? o.id : `s${indice}`;
      while (usados.has(id)) id += "_";
      usados.add(id);
      resultado.push({ id, titulo, concluida: booleano(o.concluida) });
    });
    return resultado;
  }

  /** Lê as tarefas guardadas; itens inválidos ou com id repetido são descartados. */
  function lerTarefas(json) {
    let dados;
    try {
      dados = JSON.parse(json);
    } catch (erro) {
      return [];
    }
    if (!Array.isArray(dados)) return [];
    const ids = new Set();
    const lista = [];
    for (const o of dados) {
      if (!o || typeof o !== "object") continue;
      const titulo = texto(o.titulo)?.trim();
      if (!Number.isSafeInteger(o.id) || ids.has(o.id) || !titulo) continue;
      if (!Number.isSafeInteger(o.dia) || o.dia < DIA_MINIMO || o.dia > DIA_MAXIMO) continue;
      ids.add(o.id);
      lista.push({
        id: o.id,
        titulo,
        descricao: texto(o.descricao) ?? "",
        concluida: o.concluida === true,
        dia: o.dia,
        criadaEm: Number.isFinite(o.criadaEm) ? o.criadaEm : 0,
        subtarefas: subtarefasDe(o.subtarefas),
      });
    }
    return lista;
  }

  return {
    MS_POR_DIA,
    FILTROS,
    diaDoInstante,
    hoje,
    paraDia,
    paraCivil,
    diaDaSemana,
    nomeDiaDaSemana,
    formatar,
    rotuloRelativo,
    descricaoDia,
    tituloSecao,
    paraTextoData,
    deTextoData,
    atrasada,
    subtarefasConcluidas,
    ordenar,
    filtrar,
    contar,
    agrupar,
    salvar,
    remover,
    alternarConcluida,
    alternar,
    alternarSubtarefa,
    novoId,
    montarTarefa,
    resumo,
    alterado,
    lerTarefas,
  };
})();
if (typeof module === "object") module.exports = LogicaListaTarefas;
