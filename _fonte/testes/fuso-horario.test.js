"use strict";
// Mesmos casos de app/src/test/.../core/fuso/TimeZonesTest.kt.
const assert = require("node:assert/strict");
const F = require("../../assets/ferramentas/fuso-horario-logica.js");

const SP = "America/Sao_Paulo";
const NY = "America/New_York";
const TOQUIO = "Asia/Tokyo";
const LONDRES = "Europe/London";
const instante = (iso) => Date.parse(iso); // ISO com "Z": sempre UTC

// lista apenas fusos Região/Cidade e muito mais que 20
const todos = F.listar(F.idsDisponiveis());
assert.ok(todos.length > 300, `só ${todos.length} fusos`);
assert.ok(todos.every((e) => e.id.includes("/") && !e.id.startsWith("Etc/") && !e.id.startsWith("SystemV")));
const ba = F.entrada("America/Argentina/Buenos_Aires");
assert.equal(ba.cidade, "Buenos Aires");
assert.equal(ba.subRegiao, "Argentina");
assert.equal(ba.regiao, "América");
assert.equal(F.entrada("UTC"), null);
assert.equal(F.entrada("Etc/GMT+3"), null);
assert.equal(F.entrada("America/Port_of_Spain").cidade, "Port of Spain");
assert.ok(todos.some((e) => e.id === SP));
assert.equal(F.zonaValida("Nada/Inexistente"), false);

// texto do deslocamento
assert.equal(F.textoDeslocamento(-180), "UTC−03:00");
assert.equal(F.textoDeslocamento(330), "UTC+05:30");
assert.equal(F.textoDeslocamento(0), "UTC+00:00");
assert.equal(F.deslocamentoMin("Asia/Kolkata", instante("2026-01-15T12:00:00Z")), 330);

// diferença considera horário de verão
const inverno = instante("2026-01-15T12:00:00Z");
const verao = instante("2026-07-15T12:00:00Z");
assert.equal(F.diferencaMin(SP, NY, inverno), -120);
assert.equal(F.diferencaMin(SP, NY, verao), -60);
assert.equal(F.horarioDeVerao(NY, verao), true);
assert.equal(F.horarioDeVerao(NY, inverno), false);
assert.equal(F.horarioDeVerao(SP, verao), false);
assert.equal(F.horarioDeVerao("Australia/Sydney", inverno), true); // hemisfério sul
assert.equal(F.diferencaMin(SP, TOQUIO, inverno), 720);

// conversão com mudança de dia
let c = F.converter({ ano: 2026, mes: 10, dia: 23 }, { hora: 22, minuto: 0 }, SP, TOQUIO);
assert.deepEqual([c.destino.ano, c.destino.mes, c.destino.dia, c.destino.hora, c.destino.minuto], [2026, 10, 24, 10, 0]);
assert.equal(c.deslocamentoDias, 1);
c = F.converter({ ano: 2026, mes: 10, dia: 24 }, { hora: 8, minuto: 0 }, TOQUIO, SP);
assert.equal(c.deslocamentoDias, -1);
assert.equal(F.hora(c.destino), "20:00");

// horário inexistente e ambíguo no horário de verão
// 08/03/2026 02:30 não existe em Nova York (relógios pulam de 02:00 para 03:00)
const lacuna = F.converter({ ano: 2026, mes: 3, dia: 8 }, { hora: 2, minuto: 30 }, NY, LONDRES);
assert.equal(lacuna.ajustadoPorLacuna, true);
assert.equal(F.hora(lacuna.origem), "03:30");
// 01/11/2026 01:30 acontece duas vezes; vale a primeira (ainda no horário de verão, UTC−4)
const repetido = F.converter({ ano: 2026, mes: 11, dia: 1 }, { hora: 1, minuto: 30 }, NY, LONDRES);
assert.equal(repetido.ambiguo, true);
assert.equal(repetido.ms, instante("2026-11-01T05:30:00Z"));
const normal = F.converter({ ano: 2026, mes: 6, dia: 1 }, { hora: 12, minuto: 0 }, NY, LONDRES);
assert.equal(normal.ambiguo, false);
assert.equal(normal.ajustadoPorLacuna, false);
assert.equal(F.hora(normal.destino), "17:00");

// textos
assert.equal(F.duracao(90), "1 h 30 min");
assert.equal(F.duracao(120), "2 h");
assert.equal(F.duracao(45), "45 min");
assert.equal(F.fraseDiferenca("São Paulo", "Tóquio", 720), "Tóquio está 12 h à frente de São Paulo");
assert.equal(F.fraseDiferenca("São Paulo", "Nova York", -60), "Nova York está 1 h atrás de São Paulo");
assert.equal(F.fraseDiferenca("A", "B", 0), "Mesmo horário nos dois fusos");
assert.equal(F.dataMedia({ ano: 2026, mes: 11, dia: 3 }), "3 de nov. de 2026");
assert.equal(F.dataCompleta({ ano: 2026, mes: 11, dia: 3 }), "terça-feira, 3 de novembro de 2026");
assert.equal(F.msUTC(50, 1, 1), Date.parse("0050-01-01T00:00:00Z"));
assert.deepEqual(F.partesLocais(SP, instante("2026-01-01T02:59:59Z")), { ano: 2025, mes: 12, dia: 31, hora: 23, minuto: 59, segundo: 59 });

console.log("fuso-horario: todos os testes passaram");
