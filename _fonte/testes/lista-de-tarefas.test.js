"use strict";
/*
 * Testes da lógica da Lista de Tarefas, com os mesmos casos de RegrasTarefasTest.kt, DatasTest.kt
 * e TarefasJsonTest.kt do app Android. Rode com: node _fonte/testes/lista-de-tarefas.test.js
 */
const assert = require("node:assert/strict");
const L = require("../../assets/ferramentas/lista-de-tarefas-logica.js");

let casos = 0;
function teste(nome, corpo) {
  corpo();
  casos++;
  console.log(`ok - ${nome}`);
}

const dia = (ano, mes, d) => L.paraDia(ano, mes, d);
const hoje = dia(2026, 10, 26);
const HORA = 3600000;

const tarefa = (id, { dia: d = hoje, concluida = false, criadaEm = id, subtarefas = [], titulo = `T${id}` } = {}) => ({
  id,
  titulo,
  descricao: "",
  concluida,
  dia: d,
  criadaEm,
  subtarefas,
});
const sub = (id, titulo, concluida = false) => ({ id, titulo, concluida });
const ids = (lista) => lista.map((t) => t.id);

// ---------- RegrasTarefasTest ----------

teste("filtros", () => {
  const lista = [tarefa(1), tarefa(2, { concluida: true }), tarefa(3)];
  assert.deepEqual(ids(L.filtrar(lista, "todas")), [1, 2, 3]);
  assert.deepEqual(ids(L.filtrar(lista, "pendentes")), [1, 3]);
  assert.deepEqual(ids(L.filtrar(lista, "concluidas")), [2]);
  assert.equal(L.contar(lista, "pendentes"), 2);
});

teste("agrupa por dia em ordem crescente e ordena pela criação", () => {
  const lista = [
    tarefa(1, { dia: hoje + 2, criadaEm: 50 }),
    tarefa(2, { dia: hoje, criadaEm: 30 }),
    tarefa(3, { dia: hoje - 3, criadaEm: 99 }),
    tarefa(4, { dia: hoje, criadaEm: 10 }),
    tarefa(5, { dia: hoje + 2, criadaEm: 40 }),
  ];
  const secoes = L.agrupar(lista);
  assert.deepEqual(secoes.map((s) => s.dia), [hoje - 3, hoje, hoje + 2]);
  assert.deepEqual(ids(secoes[1].tarefas), [4, 2]);
  assert.deepEqual(ids(secoes[2].tarefas), [5, 1]);
});

teste("agrupar lista vazia", () => {
  assert.deepEqual(L.agrupar([]), []);
});

teste("alternar concluída muda só a tarefa certa", () => {
  const lista = [tarefa(1), tarefa(2)];
  const nova = L.alternarConcluida(lista, 2);
  assert.equal(nova[0].concluida, false);
  assert.equal(nova[1].concluida, true);
  assert.equal(L.alternarConcluida(nova, 2)[1].concluida, false);
});

teste("alternar subtarefa", () => {
  const subs = [sub("a", "A"), sub("b", "B")];
  const lista = [tarefa(1, { subtarefas: subs }), tarefa(2, { subtarefas: subs })];
  const nova = L.alternarSubtarefa(lista, 1, "b");
  assert.deepEqual(nova[0].subtarefas.map((s) => s.concluida), [false, true]);
  assert.deepEqual(nova[1].subtarefas.map((s) => s.concluida), [false, false]);
  assert.equal(L.subtarefasConcluidas(nova[0]), 1);
});

teste("salvar insere ou substitui", () => {
  const lista = [tarefa(1), tarefa(2)];
  const depois = L.salvar(lista, { ...tarefa(2), titulo: "Editada" });
  assert.equal(depois.length, 2);
  assert.equal(depois[1].titulo, "Editada");
  assert.equal(L.salvar(depois, tarefa(3)).length, 3);
});

teste("remover e restaurar", () => {
  const lista = [tarefa(1), tarefa(2), tarefa(3)];
  const removida = lista[1];
  const sem = L.remover(lista, 2);
  assert.deepEqual(ids(sem), [1, 3]);
  assert.deepEqual(ids(L.ordenar(L.salvar(sem, removida))), [1, 2, 3]);
});

teste("novo id nunca repete", () => {
  assert.equal(L.novoId([], 1000), 1000);
  assert.equal(L.novoId([tarefa(5000)], 1000), 5001);
  assert.equal(L.novoId([tarefa(5000)], 9000), 9000);
});

teste("atrasada", () => {
  assert.equal(L.atrasada(tarefa(1, { dia: hoje - 1 }), hoje), true);
  assert.equal(L.atrasada(tarefa(1, { dia: hoje }), hoje), false);
  assert.equal(L.atrasada(tarefa(1, { dia: hoje - 1, concluida: true }), hoje), false);
});

teste("resumo", () => {
  const lista = [
    tarefa(1, { dia: hoje }),
    tarefa(2, { dia: hoje, concluida: true }),
    tarefa(3, { dia: hoje - 2 }),
    tarefa(4, { dia: hoje - 1, concluida: true }),
    tarefa(5, { dia: hoje + 1 }),
  ];
  assert.deepEqual(L.resumo(lista, hoje), { paraHoje: 1, atrasadas: 1, pendentes: 3 });
});

teste("montar tarefa nova", () => {
  const t = L.montarTarefa({
    base: null,
    idNovo: 77,
    titulo: "  Estudar  ",
    descricao: " cap. 3 ",
    dia: hoje,
    subtarefas: [sub("a", "Ler")],
    subtarefaPendente: "  Resumir ",
    agoraMs: 123,
    novoIdSubtarefa: () => "novo",
  });
  assert.equal(t.id, 77);
  assert.equal(t.titulo, "Estudar");
  assert.equal(t.descricao, "cap. 3");
  assert.equal(t.criadaEm, 123);
  assert.equal(t.concluida, false);
  // O texto deixado no campo de nova subtarefa não se perde
  assert.deepEqual(t.subtarefas.map((s) => s.titulo), ["Ler", "Resumir"]);
  assert.equal(t.subtarefas[1].id, "novo");
});

teste("montar tarefa editada mantém id, criação e status", () => {
  const base = tarefa(5, { concluida: true, criadaEm: 999 });
  const t = L.montarTarefa({
    base,
    idNovo: 77,
    titulo: "Novo título",
    descricao: "",
    dia: hoje + 3,
    subtarefas: [],
    subtarefaPendente: "   ",
    agoraMs: 123,
    novoIdSubtarefa: () => "x",
  });
  assert.equal(t.id, 5);
  assert.equal(t.criadaEm, 999);
  assert.equal(t.concluida, true);
  assert.equal(t.dia, hoje + 3);
  assert.deepEqual(t.subtarefas, []);
});

teste("montar tarefa sem título falha", () => {
  const t = L.montarTarefa({
    base: null,
    idNovo: 1,
    titulo: "   ",
    descricao: "x",
    dia: hoje,
    subtarefas: [],
    subtarefaPendente: "",
    agoraMs: 0,
    novoIdSubtarefa: () => "x",
  });
  assert.equal(t, null);
});

// ---------- DatasTest ----------

teste("conversão civil ida e volta", () => {
  assert.equal(dia(1970, 1, 1), 0);
  assert.deepEqual(L.paraCivil(0), { ano: 1970, mes: 1, dia: 1 });
  assert.deepEqual(L.paraCivil(-1), { ano: 1969, mes: 12, dia: 31 });
  assert.equal(dia(2000, 2, 29), 11016);
  assert.deepEqual(L.paraCivil(11017), { ano: 2000, mes: 3, dia: 1 });
  assert.deepEqual(L.paraCivil(dia(2024, 2, 29)), { ano: 2024, mes: 2, dia: 29 });
  // Confere contra o calendário do JavaScript em um intervalo grande (1900 a 2100)
  for (let d = -25567; d <= 47482; d += 37) {
    const data = new Date(d * L.MS_POR_DIA);
    const esperado = { ano: data.getUTCFullYear(), mes: data.getUTCMonth() + 1, dia: data.getUTCDate() };
    assert.deepEqual(L.paraCivil(d), esperado);
    assert.equal(dia(esperado.ano, esperado.mes, esperado.dia), d);
  }
});

teste("dia da semana", () => {
  assert.equal(L.nomeDiaDaSemana(0), "quinta-feira");
  assert.equal(L.nomeDiaDaSemana(dia(2026, 10, 26)), "segunda-feira");
  assert.equal(L.nomeDiaDaSemana(dia(2025, 8, 10)), "domingo");
  assert.equal(L.nomeDiaDaSemana(-1), "quarta-feira");
});

teste("dia do instante usa o fuso local", () => {
  // 26/10/2026 01:30 UTC ainda é 25/10 às 22:30 em São Paulo
  const instante = dia(2026, 10, 26) * L.MS_POR_DIA + 90 * 60000;
  assert.equal(L.diaDoInstante(instante, -3 * HORA), dia(2026, 10, 25));
  assert.equal(L.diaDoInstante(instante, 0), dia(2026, 10, 26));
  assert.equal(L.diaDoInstante(instante, 9 * HORA), dia(2026, 10, 26));
  // "Hoje" vem do relógio local do navegador
  assert.equal(L.hoje(new Date(2026, 9, 26, 23, 59)), dia(2026, 10, 26));
  assert.equal(L.hoje(new Date(2026, 9, 27, 0, 0)), dia(2026, 10, 27));
});

teste("formatação", () => {
  assert.equal(L.formatar(dia(2025, 8, 7)), "07/08/2025");
  assert.equal(L.tituloSecao(hoje, hoje), "Hoje · segunda-feira, 26/10");
  assert.equal(L.tituloSecao(hoje + 1, hoje), "Amanhã · terça-feira, 27/10");
  assert.equal(L.tituloSecao(hoje - 1, hoje), "Ontem · domingo, 25/10");
  assert.equal(L.tituloSecao(hoje + 4, hoje), "Sexta-feira, 30/10");
  assert.equal(L.tituloSecao(dia(2027, 1, 2), hoje), "Sábado, 02/01/2027");
  assert.equal(L.rotuloRelativo(hoje + 2, hoje), null);
});

// No app, o DatePicker trabalha em milissegundos; na web, o campo de data usa "AAAA-MM-DD"
teste("conversão do campo de data", () => {
  assert.equal(L.paraTextoData(hoje), "2026-10-26");
  assert.equal(L.deTextoData("2026-10-26"), hoje);
  assert.equal(L.deTextoData(L.paraTextoData(dia(2024, 2, 29))), dia(2024, 2, 29));
  for (const invalido of ["", "ontem", "2025-02-30", "2025-13-01", "2025-8-7", "0000-01-01", null]) {
    assert.equal(L.deTextoData(invalido), null, String(invalido));
  }
});

// ---------- Formulário (FormularioTarefaViewModel.alterado) ----------

teste("alterações não salvas: tarefa nova", () => {
  const vazio = { original: null, titulo: " ", descricao: "", dia: hoje, subtarefas: [], novaSubtarefa: "" };
  assert.equal(L.alterado(vazio), false);
  // Mudar só a data de uma tarefa nova não conta como algo digitado
  assert.equal(L.alterado({ ...vazio, dia: hoje + 1 }), false);
  assert.equal(L.alterado({ ...vazio, titulo: "Ir ao banco" }), true);
  assert.equal(L.alterado({ ...vazio, novaSubtarefa: "Levar RG" }), true);
  assert.equal(L.alterado({ ...vazio, subtarefas: [sub("a", "A")] }), true);
});

teste("alterações não salvas: tarefa editada", () => {
  const original = { ...tarefa(1, { titulo: "Mercado" }), subtarefas: [sub("a", "Leite")] };
  const igual = { original, titulo: " Mercado ", descricao: "", dia: hoje, subtarefas: [sub("a", "Leite")], novaSubtarefa: "" };
  assert.equal(L.alterado(igual), false);
  assert.equal(L.alterado({ ...igual, dia: hoje + 1 }), true);
  assert.equal(L.alterado({ ...igual, descricao: "Pão" }), true);
  assert.equal(L.alterado({ ...igual, subtarefas: [sub("a", "Leite", true)] }), true);
  assert.equal(L.alterado({ ...igual, subtarefas: [] }), true);
});

// ---------- TarefasJsonTest ----------

teste("formato salvo ida e volta", () => {
  const lista = [
    {
      id: 1,
      titulo: "Mercado",
      descricao: 'Lista "grande"\ncom acentos: pão, maçã',
      concluida: true,
      dia: 20307,
      criadaEm: 1754535600000,
      subtarefas: [sub("a", "Leite"), sub("b", "Café", true)],
    },
    { id: 2, titulo: "Sem descrição", descricao: "", concluida: false, dia: -5, criadaEm: 0, subtarefas: [] },
  ];
  assert.deepEqual(L.lerTarefas(JSON.stringify(lista)), lista);
});

teste("formato inválido não quebra", () => {
  assert.deepEqual(L.lerTarefas(null), []);
  assert.deepEqual(L.lerTarefas("lixo"), []);
  assert.deepEqual(L.lerTarefas("{}"), []);
  // Itens sem campos obrigatórios são ignorados, os demais continuam
  assert.deepEqual(ids(L.lerTarefas('[{"titulo":"sem id"},{"id":3,"titulo":"ok","dia":10},5]')), [3]);
  const repetidos = JSON.stringify([
    { id: 4, titulo: "A", dia: 1 },
    { id: 4, titulo: "B", dia: 1 },
    { id: 5, titulo: "   ", dia: 1 },
    { id: 6, titulo: "C", dia: "1" },
    { id: 7, titulo: "D", dia: 1, subtarefas: [{ id: "x", titulo: "um" }, { id: "x", titulo: "dois" }, { titulo: "" }, "ruim"] },
  ]);
  const lidas = L.lerTarefas(repetidos);
  assert.deepEqual(ids(lidas), [4, 7]);
  assert.deepEqual(lidas[1].subtarefas.map((s) => s.titulo), ["um", "dois"]);
  assert.equal(new Set(lidas[1].subtarefas.map((s) => s.id)).size, 2);
});

console.log(`\n${casos} casos passaram.`);
